-- FAST LOOK · Devoluciones de líneas personalizadas y ventas por voz
-- Aplicar DESPUÉS de fastlook_venta_voz_fix_inmutables.sql (y de fastlook_venta_voz_lectura.sql si se usa).
-- Ejecución manual. No borra ni modifica datos existentes:
--   * crea devoluciones_personalizadas_detalle (vacía);
--   * crea procesar_devolucion_mixta, que delega las líneas de inventario en procesar_devolucion
--     (sin modificarla) para reponer stock exactamente igual, y registra las personalizadas sólo
--     como reembolso, sin inventario y sin tocar ventas_personalizadas (trigger inmutable);
--   * reemplaza deshacer_venta_voz para bloquearla si el ticket ya tiene una devolución.
-- Utilidad: las personalizadas no tienen costo y Corte nunca les contó ganancia, así que revierten
-- utilidad 0. Si una línea de inventario no tiene costo, procesar_devolucion deja la cabecera en NULL
-- y ese criterio se conserva.
begin;

do $$
begin
  if to_regclass('public.devoluciones') is null or to_regclass('public.devoluciones_detalle') is null
     or to_regclass('public.ventas_personalizadas') is null or to_regclass('public.ventas_voz_operaciones') is null then
    raise exception 'DEVOLUCIONES_DEPENDENCIAS: faltan tablas de ventas, devoluciones o venta por voz.';
  end if;
  if to_regprocedure('public.procesar_devolucion(uuid,text,jsonb,text)') is null then
    raise exception 'DEVOLUCIONES_DEPENDENCIAS: falta procesar_devolucion(uuid,text,jsonb,text).';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ventas_tickets' and column_name='estado') then
    raise exception 'DEVOLUCIONES_DEPENDENCIAS: falta ventas_tickets.estado. Aplica antes fastlook_ventas_tickets_estado.sql.';
  end if;
end $$;

-- Las FK usan el tipo real de devoluciones.id y ventas_personalizadas.id.
do $$
declare v_tipo_devolucion text; v_tipo_personalizada text;
begin
  select pg_catalog.format_type(atttypid, atttypmod) into v_tipo_devolucion from pg_catalog.pg_attribute where attrelid = 'public.devoluciones'::regclass and attname = 'id';
  select pg_catalog.format_type(atttypid, atttypmod) into v_tipo_personalizada from pg_catalog.pg_attribute where attrelid = 'public.ventas_personalizadas'::regclass and attname = 'id';
  execute format($sql$
    create table if not exists public.devoluciones_personalizadas_detalle (
      id uuid primary key default gen_random_uuid(),
      devolucion_id %s not null references public.devoluciones(id),
      venta_personalizada_id %s not null references public.ventas_personalizadas(id),
      tipo_personalizado text not null,
      nombre text not null,
      cantidad integer not null check (cantidad > 0),
      precio_unitario_original numeric(12,2) not null check (precio_unitario_original >= 0),
      subtotal_devuelto numeric(12,2) not null check (subtotal_devuelto > 0),
      utilidad_revertida numeric(12,2) not null default 0 check (utilidad_revertida = 0),
      created_at timestamptz not null default now(),
      constraint devoluciones_personalizadas_detalle_linea_unica unique (devolucion_id, venta_personalizada_id)
    )$sql$, v_tipo_devolucion, v_tipo_personalizada);
end $$;

create index if not exists devoluciones_personalizadas_detalle_devolucion_idx on public.devoluciones_personalizadas_detalle(devolucion_id);
create index if not exists devoluciones_personalizadas_detalle_venta_idx on public.devoluciones_personalizadas_detalle(venta_personalizada_id);

alter table public.devoluciones_personalizadas_detalle enable row level security;
revoke all on public.devoluciones_personalizadas_detalle from public, anon, authenticated;
grant select on public.devoluciones_personalizadas_detalle to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'devoluciones_personalizadas_detalle' and policyname = 'devoluciones_personalizadas_detalle_select_personal_activo') then
    create policy devoluciones_personalizadas_detalle_select_personal_activo on public.devoluciones_personalizadas_detalle
      for select to authenticated
      using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo = true and u.rol in ('Admin', 'Vendedor')));
  end if;
end $$;

create or replace function public.procesar_devolucion_mixta(
  p_idempotency_key uuid,
  p_motivo text,
  p_lineas jsonb,
  p_lineas_personalizadas jsonb,
  p_motivo_otro text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_usuario_id uuid;
  v_usuario_nombre public.usuarios.nombre%type;
  v_usuario_rol public.usuarios.rol%type;
  v_usuario_activo public.usuarios.activo%type;

  v_lineas jsonb := coalesce(p_lineas, '[]'::jsonb);
  v_personalizadas jsonb := coalesce(p_lineas_personalizadas, '[]'::jsonb);
  v_devolucion_id public.devoluciones.id%type;
  v_ticket_texto text;
  v_ticket_id uuid;
  v_tickets integer;
  v_estado text;
  v_folio text;
  v_metodo_pago text;
  v_folio_cabecera text;
  v_metodo_cabecera text;
  v_es_voz boolean;

  v_existente record;
  v_linea record;
  v_venta record;

  v_cantidad_devuelta numeric;
  v_cantidad_disponible numeric;
  v_total_personalizado numeric := 0;
  v_total_devuelto numeric;
  v_productos integer := 0;
  v_lineas_personalizadas integer := 0;
begin
  /* 1. AUTENTICACIÓN Y PERFIL: idéntico a procesar_devolucion. */
  v_usuario_id := auth.uid();
  if v_usuario_id is null then
    raise exception using errcode = 'P0001', message = 'SIN_SESION: Debes iniciar sesión.';
  end if;

  select u.nombre, u.rol, u.activo into v_usuario_nombre, v_usuario_rol, v_usuario_activo
  from public.usuarios u where u.id = v_usuario_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: El usuario no tiene un perfil autorizado.';
  end if;
  if v_usuario_activo is distinct from true then
    raise exception using errcode = 'P0001', message = 'USUARIO_INACTIVO: El usuario está inactivo.';
  end if;
  if v_usuario_rol not in ('Admin', 'Vendedor') then
    raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: El usuario no puede procesar devoluciones.';
  end if;

  /* 2. VALIDACIÓN GENERAL: idéntica a procesar_devolucion, extendida a líneas personalizadas. */
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCIA_INVALIDA: Falta idempotency_key.';
  end if;
  if p_motivo not in ('Producto incorrecto', 'No le quedó', 'Defecto', 'Cambio de opinión', 'Cambio por otro producto', 'Otro') then
    raise exception using errcode = 'P0001', message = 'MOTIVO_INVALIDO: El motivo seleccionado no es válido.';
  end if;
  if p_motivo = 'Otro' and nullif(btrim(coalesce(p_motivo_otro, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'MOTIVO_INVALIDO: Especifica el motivo de la devolución.';
  end if;
  if jsonb_typeof(v_lineas) <> 'array' or jsonb_typeof(v_personalizadas) <> 'array'
     or jsonb_array_length(v_lineas) + jsonb_array_length(v_personalizadas) = 0 then
    raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: Debes seleccionar al menos un producto.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_lineas) elemento
    where jsonb_typeof(elemento) <> 'object'
       or nullif(btrim(elemento->>'venta_id'), '') is null
       or nullif(btrim(elemento->>'cantidad'), '') is null
       or (elemento->>'cantidad') !~ '^[0-9]+$'
       or (elemento->>'cantidad')::numeric <= 0
  ) or exists (
    select 1 from jsonb_array_elements(v_personalizadas) elemento
    where jsonb_typeof(elemento) <> 'object'
       or nullif(btrim(elemento->>'venta_personalizada_id'), '') is null
       or nullif(btrim(elemento->>'cantidad'), '') is null
       or (elemento->>'cantidad') !~ '^[0-9]+$'
       or (elemento->>'cantidad')::numeric <= 0
  ) then
    raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: Venta o cantidad no válida.';
  end if;

  /* 3. IDEMPOTENCIA: mismo advisory lock que procesar_devolucion (es reentrante en la transacción). */
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));

  select d.id, d.folio, d.total_devuelto into v_existente
  from public.devoluciones d where d.idempotency_key = p_idempotency_key;
  if found then
    select count(distinct dd.producto_id) into v_productos from public.devoluciones_detalle dd where dd.devolucion_id = v_existente.id;
    select count(*) into v_lineas_personalizadas from public.devoluciones_personalizadas_detalle dpd where dpd.devolucion_id = v_existente.id;
    return jsonb_build_object('ok', true, 'idempotente', true, 'devolucion_id', v_existente.id, 'folio', v_existente.folio,
      'total_devuelto', v_existente.total_devuelto, 'productos', v_productos, 'personalizadas', v_lineas_personalizadas);
  end if;

  /* 4. UN SOLO TICKET, NO CANCELADO. Bloquearlo serializa devoluciones del mismo ticket y deshacer_venta_voz. */
  if exists (
    select 1 from (select distinct elemento->>'venta_personalizada_id' as id from jsonb_array_elements(v_personalizadas) elemento) entrada
    where not exists (select 1 from public.ventas_personalizadas vp where vp.id::text = entrada.id)
  ) then
    raise exception using errcode = 'P0001', message = 'VENTA_INEXISTENTE: Una venta seleccionada no existe.';
  end if;

  if exists (
    select 1 from public.ventas v
    join (select distinct elemento->>'venta_id' as id from jsonb_array_elements(v_lineas) elemento) entrada on v.id::text = entrada.id
    where v.ticket_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: La venta no tiene ticket_id o folio.';
  end if;

  select count(distinct origen.ticket_id), min(origen.ticket_id) into v_tickets, v_ticket_texto
  from (
    select v.ticket_id::text as ticket_id from public.ventas v
    join (select distinct elemento->>'venta_id' as id from jsonb_array_elements(v_lineas) elemento) entrada on v.id::text = entrada.id
    union all
    select vp.ticket_id::text from public.ventas_personalizadas vp
    join (select distinct elemento->>'venta_personalizada_id' as id from jsonb_array_elements(v_personalizadas) elemento) entrada on vp.id::text = entrada.id
  ) origen;

  if v_tickets = 0 then
    raise exception using errcode = 'P0001', message = 'VENTA_INEXISTENTE: Una venta seleccionada no existe.';
  end if;
  if v_tickets > 1 then
    raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: Las líneas pertenecen a tickets distintos.';
  end if;

  select t.ticket_id, t.estado into v_ticket_id, v_estado
  from public.ventas_tickets t where t.ticket_id::text = v_ticket_texto for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: La venta no tiene ticket_id o folio.';
  end if;
  if v_estado = 'Cancelado' then
    raise exception using errcode = 'P0001', message = 'TICKET_CANCELADO: El ticket está cancelado y no admite devoluciones.';
  end if;

  /* 5. LÍNEAS PERSONALIZADAS: bloquear (FOR UPDATE no dispara el trigger de inmutabilidad) y validar. */
  perform 1 from public.ventas_personalizadas vp
  where vp.id::text in (select elemento->>'venta_personalizada_id' from jsonb_array_elements(v_personalizadas) elemento)
  order by vp.id::text
  for update;

  for v_linea in
    select elemento->>'venta_personalizada_id' as venta_id, sum((elemento->>'cantidad')::numeric) as cantidad
    from jsonb_array_elements(v_personalizadas) elemento
    group by elemento->>'venta_personalizada_id'
    order by elemento->>'venta_personalizada_id'
  loop
    select vp.* into strict v_venta from public.ventas_personalizadas vp where vp.id::text = v_linea.venta_id;

    if nullif(btrim(v_venta.folio), '') is null then
      raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: La venta no tiene ticket_id o folio.';
    end if;
    if v_venta.cantidad is null or v_venta.cantidad <= 0 then
      raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: La cantidad original de la venta no es válida.';
    end if;
    if v_venta.precio_unitario is null or v_venta.precio_unitario < 0 then
      raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: El precio histórico no es válido.';
    end if;
    if nullif(btrim(v_venta.metodo_pago), '') is null then
      raise exception using errcode = 'P0001', message = 'METODO_INCONSISTENTE: La venta no tiene método de pago.';
    end if;
    if v_folio is null then
      v_folio := v_venta.folio; v_metodo_pago := v_venta.metodo_pago;
    elsif v_folio is distinct from v_venta.folio then
      raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: Las líneas pertenecen a tickets distintos.';
    elsif v_metodo_pago is distinct from v_venta.metodo_pago then
      raise exception using errcode = 'P0001', message = 'METODO_INCONSISTENTE: El ticket contiene métodos de pago distintos.';
    end if;

    select coalesce(sum(dpd.cantidad), 0) into v_cantidad_devuelta
    from public.devoluciones_personalizadas_detalle dpd where dpd.venta_personalizada_id = v_venta.id;
    v_cantidad_disponible := v_venta.cantidad - v_cantidad_devuelta;
    if v_linea.cantidad > v_cantidad_disponible then
      raise exception using errcode = 'P0001', message = format('CANTIDAD_EXCEDIDA: La venta %s sólo tiene %s pieza(s) disponibles.', v_venta.id, greatest(v_cantidad_disponible, 0));
    end if;
    if v_venta.precio_unitario * v_linea.cantidad <= 0 then
      raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: La línea personalizada no tiene importe a devolver.';
    end if;

    v_total_personalizado := v_total_personalizado + v_venta.precio_unitario * v_linea.cantidad;
  end loop;

  /* 6. CABECERA. Con inventario, procesar_devolucion la crea y repone stock tal como hoy. */
  if jsonb_array_length(v_lineas) > 0 then
    perform public.procesar_devolucion(p_idempotency_key, p_motivo, v_lineas, p_motivo_otro);
    select d.id, d.folio, d.metodo_pago into v_devolucion_id, v_folio_cabecera, v_metodo_cabecera
    from public.devoluciones d where d.idempotency_key = p_idempotency_key;
    select count(distinct dd.producto_id) into v_productos from public.devoluciones_detalle dd where dd.devolucion_id = v_devolucion_id;
    if v_folio is not null and v_folio is distinct from v_folio_cabecera then
      raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: Las líneas pertenecen a tickets distintos.';
    end if;
    if v_metodo_pago is not null and v_metodo_pago is distinct from v_metodo_cabecera then
      raise exception using errcode = 'P0001', message = 'METODO_INCONSISTENTE: El ticket contiene métodos de pago distintos.';
    end if;
    if v_total_personalizado > 0 then
      -- La utilidad revertida no cambia: las personalizadas suman 0 (o la cabecera sigue en NULL).
      update public.devoluciones set total_devuelto = total_devuelto + v_total_personalizado where id = v_devolucion_id;
    end if;
    v_folio := v_folio_cabecera;
  else
    -- Sólo personalizadas: sin costo de inventario que revertir (NULL) y utilidad revertida 0.
    insert into public.devoluciones (idempotency_key, ticket_id, folio, total_devuelto, costo_revertido, utilidad_revertida, metodo_pago, motivo, motivo_otro, usuario_id, usuario_nombre)
    values (p_idempotency_key, v_ticket_id, v_folio, v_total_personalizado, null, 0, v_metodo_pago, p_motivo,
      case when p_motivo = 'Otro' then nullif(btrim(p_motivo_otro), '') else null end, v_usuario_id, v_usuario_nombre)
    returning id into v_devolucion_id;
  end if;

  /* 7. DETALLE PERSONALIZADO: sólo reembolso; sin productos, stock ni movimientos de inventario. */
  v_es_voz := exists (select 1 from public.ventas_voz_operaciones o where o.ticket_id = v_ticket_id);
  for v_linea in
    select elemento->>'venta_personalizada_id' as venta_id, sum((elemento->>'cantidad')::numeric) as cantidad
    from jsonb_array_elements(v_personalizadas) elemento
    group by elemento->>'venta_personalizada_id'
    order by elemento->>'venta_personalizada_id'
  loop
    select vp.* into strict v_venta from public.ventas_personalizadas vp where vp.id::text = v_linea.venta_id;
    insert into public.devoluciones_personalizadas_detalle (devolucion_id, venta_personalizada_id, tipo_personalizado, nombre, cantidad, precio_unitario_original, subtotal_devuelto, utilidad_revertida)
    values (v_devolucion_id, v_venta.id, v_venta.tipo_personalizado, case when v_es_voz then 'Venta rápida por voz' else v_venta.nombre end,
      v_linea.cantidad, v_venta.precio_unitario, v_venta.precio_unitario * v_linea.cantidad, 0);
    v_lineas_personalizadas := v_lineas_personalizadas + 1;
  end loop;

  select d.total_devuelto into v_total_devuelto from public.devoluciones d where d.id = v_devolucion_id;
  return jsonb_build_object('ok', true, 'idempotente', false, 'devolucion_id', v_devolucion_id, 'folio', v_folio,
    'total_devuelto', v_total_devuelto, 'productos', v_productos, 'personalizadas', v_lineas_personalizadas);

exception
  when unique_violation then
    select d.id, d.folio, d.total_devuelto into v_existente
    from public.devoluciones d where d.idempotency_key = p_idempotency_key;
    if found then
      select count(distinct dd.producto_id) into v_productos from public.devoluciones_detalle dd where dd.devolucion_id = v_existente.id;
      select count(*) into v_lineas_personalizadas from public.devoluciones_personalizadas_detalle dpd where dpd.devolucion_id = v_existente.id;
      return jsonb_build_object('ok', true, 'idempotente', true, 'devolucion_id', v_existente.id, 'folio', v_existente.folio,
        'total_devuelto', v_existente.total_devuelto, 'productos', v_productos, 'personalizadas', v_lineas_personalizadas);
    end if;
    raise;
end $$;

revoke all on function public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text) to authenticated;

-- deshacer_venta_voz: igual que antes más el bloqueo por devolución. El ticket se bloquea FOR UPDATE
-- igual que en procesar_devolucion_mixta, así que deshacer y devolver no pueden cruzarse.
create or replace function public.deshacer_venta_voz(p_captura_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_op public.ventas_voz_operaciones%rowtype; v_estado text;
begin
  if v_actor is null then raise exception using errcode='42501',message='SIN_SESION: Inicia sesión.'; end if;
  if p_idempotency_key is null then raise exception using errcode='P0001',message='IDEMPOTENCIA_INVALIDA: Falta el identificador de reversión.'; end if;
  select * into v_op from public.ventas_voz_operaciones where captura_id=p_captura_id for update;
  if not found or v_op.usuario_id<>v_actor or v_op.ticket_id is null then raise exception using errcode='42501',message='VENTA_VOZ_NO_AUTORIZADA: Sólo puedes deshacer la venta indicada en tu aviso.'; end if;
  if v_op.deshecha_at is not null then
    if v_op.deshacer_idempotency_key=p_idempotency_key then return jsonb_build_object('ok',true,'captura_id',p_captura_id,'ticket_id',v_op.ticket_id,'folio',v_op.folio,'deshecha',true,'idempotente',true); end if;
    raise exception using errcode='P0001',message='VENTA_YA_DESHECHA: La venta ya fue cancelada.';
  end if;
  select estado into v_estado from public.ventas_tickets where ticket_id=v_op.ticket_id for update;
  if not found then raise exception using errcode='P0001',message='TICKET_INEXISTENTE: No se encontró el ticket.'; end if;
  if lower(coalesce(v_estado,'')) in ('cancelado','cancelada','anulado','anulada') then raise exception using errcode='P0001',message='TICKET_YA_CANCELADO: El ticket ya estaba cancelado.'; end if;
  if exists (select 1 from public.devoluciones d where d.ticket_id=v_op.ticket_id) then raise exception using errcode='P0001',message='VENTA_CON_DEVOLUCION: La venta ya tiene una devolución; no se puede deshacer.'; end if;
  update public.ventas_tickets set estado='Cancelado' where ticket_id=v_op.ticket_id;
  update public.ventas_voz_operaciones set deshecha_at=clock_timestamp(),deshecha_por=v_actor,deshacer_idempotency_key=p_idempotency_key where captura_id=p_captura_id;
  return jsonb_build_object('ok',true,'captura_id',p_captura_id,'ticket_id',v_op.ticket_id,'folio',v_op.folio,'deshecha',true,'idempotente',false);
end $$;

revoke all on function public.deshacer_venta_voz(uuid,uuid) from public,anon;
grant execute on function public.deshacer_venta_voz(uuid,uuid) to authenticated;

commit;
