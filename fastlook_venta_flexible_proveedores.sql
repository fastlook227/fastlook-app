-- FAST LOOK · venta flexible, artículos externos, devoluciones externas y aprendizaje de precios (v2).
-- Orden: fastlook_ventas_tickets_estado.sql → fastlook_devoluciones_personalizadas.sql →
--        fastlook_catalogo_proveedores.sql → ESTE ARCHIVO. Ejecución manual; nunca la aplica la aplicación.
-- Toda la migración es atómica. No borra ni modifica filas existentes: sólo agrega columnas con default
-- constante, tablas nuevas y reemplaza RPC (los originales quedan respaldados para el rollback).
--
-- Compatibilidad de p_lineas (procesar_venta / procesar_venta_mixta):
--   formato antiguo  {producto_id, cantidad}                      → precio oficial vigente.
--   formato nuevo    {producto_id | catalogo_producto_id, cantidad, precio_unitario?, motivo_precio?,
--                     nota_precio?, descuento_conjunto?}          → precio validado y auditado.
--   Las líneas repetidas del mismo artículo con el mismo precio efectivo se agrupan en una sola fila.
begin;

-- 0. DEPENDENCIAS: abortar antes de tocar nada si el esquema no es el esperado.
do $$
declare v_faltantes text;
begin
  if to_regclass('public.catalogo_productos') is null or to_regclass('public.catalogo_ofertas') is null
     or to_regclass('public.catalogo_vinculos_inventario') is null then
    raise exception 'DEPENDENCIA: aplica antes fastlook_catalogo_proveedores.sql';
  end if;
  if to_regclass('public.devoluciones_personalizadas_detalle') is null
     or to_regprocedure('public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text)') is null then
    raise exception 'DEPENDENCIA: aplica antes fastlook_devoluciones_personalizadas.sql';
  end if;
  if to_regprocedure('public.procesar_venta(uuid,text,jsonb)') is null
     or to_regprocedure('public.procesar_venta_mixta(uuid,text,jsonb,jsonb)') is null
     or to_regprocedure('public.procesar_devolucion(uuid,text,jsonb,text)') is null
     or to_regprocedure('public.calcular_linea_personalizada(text,jsonb)') is null then
    raise exception 'DEPENDENCIA: faltan los RPC base de venta, devolución o calcular_linea_personalizada';
  end if;
  select string_agg(r.t || '.' || r.c, ', ') into v_faltantes
  from (values
    ('ventas','producto_id'),('ventas','codigo'),('ventas','nombre'),('ventas','precio'),('ventas','costo_unitario'),
    ('ventas','cantidad'),('ventas','total'),('ventas','metodo_pago'),('ventas','ticket_id'),('ventas','folio'),
    ('ventas_tickets','ticket_id'),('ventas_tickets','folio'),('ventas_tickets','idempotency_key'),('ventas_tickets','metodo_pago'),
    ('ventas_tickets','usuario_id'),('ventas_tickets','usuario_nombre'),('ventas_tickets','total'),('ventas_tickets','estado'),
    ('ventas_personalizadas','created_by'),('ventas_personalizadas','resumen'),('ventas_personalizadas','configuracion'),
    ('movimientos_inventario','ticket_id'),('movimientos_inventario','origen'),('movimientos_inventario','folio'),('movimientos_inventario','stock_anterior'),
    ('devoluciones','costo_revertido'),('devoluciones','utilidad_revertida'),('devoluciones','usuario_id'),('devoluciones','idempotency_key')
  ) r(t,c)
  where not exists (select 1 from information_schema.columns ic where ic.table_schema='public' and ic.table_name=r.t and ic.column_name=r.c);
  if v_faltantes is not null then raise exception 'DEPENDENCIA: faltan columnas %', v_faltantes; end if;
end $$;

-- 1. RESPALDO de los RPC vigentes. "do nothing" conserva los originales aunque la migración se repita.
create table if not exists public.fastlook_migracion_respaldos (
  migracion text not null, objeto text not null, definicion text not null,
  created_at timestamptz not null default now(), primary key (migracion, objeto)
);
alter table public.fastlook_migracion_respaldos enable row level security;
revoke all on table public.fastlook_migracion_respaldos from public, anon, authenticated;

insert into public.fastlook_migracion_respaldos (migracion, objeto, definicion)
select 'venta_flexible_proveedores_v1', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
from pg_proc p
where p.oid in (
  'public.procesar_venta(uuid,text,jsonb)'::regprocedure,
  'public.procesar_venta_mixta(uuid,text,jsonb,jsonb)'::regprocedure,
  'public.procesar_devolucion(uuid,text,jsonb,text)'::regprocedure,
  'public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text)'::regprocedure
)
on conflict (migracion, objeto) do nothing;

do $$
begin
  if (select count(*) from public.fastlook_migracion_respaldos where migracion = 'venta_flexible_proveedores_v1') <> 4 then
    raise exception 'RESPALDO_INCOMPLETO: se esperaban 4 definiciones originales';
  end if;
  if exists (select 1 from public.fastlook_migracion_respaldos where migracion = 'venta_flexible_proveedores_v1'
             and (definicion like '%_procesar_venta_flexible%' or definicion like '%_procesar_venta_original_v0%'
                  or definicion like '%devoluciones_externas_detalle%')) then
    raise exception 'RESPALDO_INVALIDO: el respaldo contiene una versión de esta migración, no el original';
  end if;
end $$;

-- 1b. CONTRATO. Las definiciones originales no están en el repositorio: sólo se reemplazan si los originales
--     respaldados contienen cada marca del contrato que _procesar_venta_flexible reproduce (folio, movimiento,
--     bloqueos, idempotencia y prefijos de error que la aplicación traduce). Si falta una, se aborta sin cambiar nada.
do $$
declare v_venta text; v_mixta text; v_faltantes text;
begin
  select string_agg(definicion, E'\n') into v_venta from public.fastlook_migracion_respaldos
  where migracion = 'venta_flexible_proveedores_v1' and objeto in ('procesar_venta(uuid,text,jsonb)', 'procesar_venta_mixta(uuid,text,jsonb,jsonb)');
  select definicion into v_mixta from public.fastlook_migracion_respaldos
  where migracion = 'venta_flexible_proveedores_v1' and objeto = 'procesar_venta_mixta(uuid,text,jsonb,jsonb)';
  select string_agg(m, ', ') into v_faltantes
  from unnest(array[
    '''FLV-''', '''YYYYMMDD''', '''America/Mexico_City''', 'gen_random_uuid', 'pg_advisory_xact_lock', 'hashtextextended', 'unique_violation',
    '''Venta''', '''Salida por venta''', '''SISTEMA''', 'costo_unitario', 'for update',
    'SIN_SESION:', 'ROL_NO_PERMITIDO:', 'USUARIO_INACTIVO:', 'IDEMPOTENCIA_INVALIDA:', 'METODO_INVALIDO:', 'CARRITO_VACIO:',
    'LINEAS_INVALIDAS:', 'PRODUCTO_INEXISTENTE:', 'PRODUCTO_ARCHIVADO:', 'PRECIO_INVALIDO:', 'STOCK_INVALIDO:'
  ]) m
  where position(m in v_venta) = 0;
  if position('calcular_linea_personalizada' in v_mixta) = 0 then
    v_faltantes := concat_ws(', ', v_faltantes, 'calcular_linea_personalizada en procesar_venta_mixta');
  end if;
  if v_faltantes is not null then
    raise exception 'CONTRATO_RPC_DISTINTO: los RPC originales no contienen: %. No se reemplazó nada. Envía el resultado de consultas/diagnostico_rpc_ventas_flexibles.sql para adaptar la migración.', v_faltantes;
  end if;
end $$;

-- 1c. RESTRICCIONES Y TRIGGERS que impedirían vender con stock negativo o registrar el movimiento.
do $$
declare v_detalle text;
begin
  select string_agg(c.conrelid::regclass::text || ': ' || pg_get_constraintdef(c.oid), '; ') into v_detalle
  from pg_constraint c
  where c.contype = 'c' and c.conrelid in ('public.productos'::regclass, 'public.movimientos_inventario'::regclass)
    and (pg_get_constraintdef(c.oid) ~* 'stock[a-z_]*\s*>=?\s*0'
         or (pg_get_constraintdef(c.oid) ~* 'tipo_movimiento' and (pg_get_constraintdef(c.oid) !~ '''Venta''' or pg_get_constraintdef(c.oid) !~ '''Entrada'''))
         or (pg_get_constraintdef(c.oid) ~* '\morigen\M' and pg_get_constraintdef(c.oid) !~ '''SISTEMA'''));
  if v_detalle is not null then raise exception 'RESTRICCION_INCOMPATIBLE: %', v_detalle; end if;
  select string_agg(t.tgname || ' en ' || t.tgrelid::regclass::text, ', ') into v_detalle
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and t.tgrelid = 'public.productos'::regclass and p.prosrc ~* 'stock';
  if v_detalle is not null then raise exception 'TRIGGER_POR_REVISAR: triggers de productos que leen stock: %. Revísalos antes de permitir saldo negativo.', v_detalle; end if;
end $$;

-- 2. AUDITORÍA DE PRECIO en ventas (columnas nuevas con default constante: no reescriben filas).
alter table public.ventas add column if not exists precio_lista numeric(12,2);
alter table public.ventas add column if not exists precio_modificado boolean not null default false;
alter table public.ventas add column if not exists precio_modificado_por uuid references public.usuarios(id);
alter table public.ventas add column if not exists motivo_precio text;
alter table public.ventas add column if not exists nota_precio text;
alter table public.ventas add column if not exists descuento_conjunto boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_motivo_precio_chk' and conrelid = 'public.ventas'::regclass) then
    alter table public.ventas add constraint ventas_motivo_precio_chk
      check (motivo_precio is null or motivo_precio in ('PROMOCION','DESCUENTO_CLIENTE','AJUSTE_COMERCIAL','CANDIDATO_PRECIO_OFICIAL')) not valid;
  end if;
end $$;

-- 3. LÍNEAS EXTERNAS: no inventariables, nunca tocan public.productos.
create table if not exists public.ventas_catalogo_proveedores (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.ventas_tickets(ticket_id), folio text not null,
  catalogo_producto_id uuid not null references public.catalogo_productos(id),
  proveedor_id uuid not null references public.catalogo_proveedores(id),
  codigo text not null, nombre text not null, proveedor_nombre text not null,
  precio_lista numeric(12,2) not null check (precio_lista >= 0),
  precio numeric(12,2) not null check (precio >= 0),
  precio_modificado boolean not null, precio_modificado_por uuid references public.usuarios(id),
  motivo_precio text check (motivo_precio is null or motivo_precio in ('PROMOCION','DESCUENTO_CLIENTE','AJUSTE_COMERCIAL','CANDIDATO_PRECIO_OFICIAL')),
  nota_precio text, descuento_conjunto boolean not null default false,
  costo_unitario numeric(12,2), cantidad integer not null check (cantidad > 0),
  total numeric(14,2) not null check (total >= 0), metodo_pago text not null,
  created_at timestamptz not null default now()
);
create index if not exists ventas_catalogo_ticket_idx on public.ventas_catalogo_proveedores(ticket_id);
create index if not exists ventas_catalogo_producto_idx on public.ventas_catalogo_proveedores(catalogo_producto_id, created_at);
create index if not exists ventas_catalogo_created_idx on public.ventas_catalogo_proveedores(created_at);
alter table public.ventas_catalogo_proveedores enable row level security;
revoke all on table public.ventas_catalogo_proveedores from public, anon, authenticated;
grant select on table public.ventas_catalogo_proveedores to authenticated;

-- 3b. PRECIO DE LISTA EXTERNO: una sola regla para catálogo, venta y aprendizaje.
--     Oferta vigente = nivel configurado del proveedor (o BASE), luego la más reciente. Precio sugerido = costo × 1.30
--     (columna generada); precio_venta_override sólo lo fija un Admin al aprobar una sugerencia.
alter table public.catalogo_productos add column if not exists precio_venta_override numeric(12,2) check (precio_venta_override >= 0);

create or replace function public._oferta_vigente_catalogo(p_catalogo_producto_id uuid)
returns table (precio_sugerido numeric, costo_efectivo numeric, nivel text)
language sql stable security definer set search_path = '' as $$
  select o.precio_sugerido, o.costo_efectivo, o.nivel
  from public.catalogo_ofertas o
  join public.catalogo_productos cp on cp.id = o.catalogo_producto_id
  join public.catalogo_proveedores pr on pr.id = cp.proveedor_id
  where o.catalogo_producto_id = p_catalogo_producto_id and o.activo
  order by case when o.nivel = coalesce(pr.nivel_compra, 'BASE') then 0 else 1 end, o.vigente_desde desc nulls last, o.created_at desc
  limit 1
$$;

create table if not exists public.historial_precios_catalogo (
  id uuid primary key default gen_random_uuid(), catalogo_producto_id uuid not null references public.catalogo_productos(id),
  precio_anterior numeric(12,2), precio_nuevo numeric(12,2) not null,
  tickets_evidencia uuid[] not null default '{}', aprobado_por uuid not null references public.usuarios(id),
  created_at timestamptz not null default now()
);
alter table public.historial_precios_catalogo enable row level security;
revoke all on table public.historial_precios_catalogo from public, anon, authenticated;

-- 4. DEVOLUCIONES EXTERNAS: historial por línea; sin stock ni movimientos de inventario.
do $$
declare v_tipo_devolucion text;
begin
  select pg_catalog.format_type(atttypid, atttypmod) into v_tipo_devolucion
  from pg_catalog.pg_attribute where attrelid = 'public.devoluciones'::regclass and attname = 'id';
  execute format($sql$
    create table if not exists public.devoluciones_externas_detalle (
      id uuid primary key default gen_random_uuid(),
      devolucion_id %s not null references public.devoluciones(id),
      ticket_id uuid not null references public.ventas_tickets(ticket_id),
      venta_externa_id uuid not null references public.ventas_catalogo_proveedores(id),
      catalogo_producto_id uuid not null references public.catalogo_productos(id),
      codigo text not null, nombre text not null,
      cantidad integer not null check (cantidad > 0),
      precio_unitario_original numeric(12,2) not null check (precio_unitario_original >= 0),
      subtotal_devuelto numeric(12,2) not null check (subtotal_devuelto > 0),
      costo_unitario numeric(12,2),
      usuario_id uuid not null references public.usuarios(id),
      created_at timestamptz not null default now(),
      constraint devoluciones_externas_detalle_linea_unica unique (devolucion_id, venta_externa_id)
    )$sql$, v_tipo_devolucion);
end $$;
create index if not exists devoluciones_externas_detalle_venta_idx on public.devoluciones_externas_detalle(venta_externa_id);
create index if not exists devoluciones_externas_detalle_devolucion_idx on public.devoluciones_externas_detalle(devolucion_id);
alter table public.devoluciones_externas_detalle enable row level security;
revoke all on table public.devoluciones_externas_detalle from public, anon, authenticated;
grant select on table public.devoluciones_externas_detalle to authenticated;

-- Lectura para PDF, reimpresión, Movimientos y Devoluciones. Sobrevive al rollback.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ventas_catalogo_proveedores' and policyname='ventas_catalogo_select_personal_activo') then
    create policy ventas_catalogo_select_personal_activo on public.ventas_catalogo_proveedores for select to authenticated
      using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo = true and u.rol in ('Admin','Vendedor')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='devoluciones_externas_detalle' and policyname='devoluciones_externas_select_personal_activo') then
    create policy devoluciones_externas_select_personal_activo on public.devoluciones_externas_detalle for select to authenticated
      using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo = true and u.rol in ('Admin','Vendedor')));
  end if;
end $$;

-- 5. HISTORIAL DE PRECIOS OFICIALES (sólo se escribe al aprobar).
create table if not exists public.historial_precios_productos (
  id uuid primary key default gen_random_uuid(), producto_id uuid not null references public.productos(id),
  precio_anterior numeric(12,2) not null, precio_nuevo numeric(12,2) not null,
  origen text not null check (origen in ('SUGERENCIA_VENTAS','MANUAL')),
  tickets_evidencia uuid[] not null default '{}', aprobado_por uuid not null references public.usuarios(id),
  created_at timestamptz not null default now()
);
alter table public.historial_precios_productos enable row level security;
revoke all on table public.historial_precios_productos from public, anon, authenticated;

-- 6. VENTA FLEXIBLE (núcleo interno; sólo se ejecuta a través de las firmas públicas).
create or replace function public._procesar_venta_flexible(
  p_idempotency_key uuid, p_metodo_pago text, p_lineas jsonb, p_lineas_personalizadas jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_nombre text; v_rol text; v_activo boolean;
  v_ticket uuid; v_folio text; v_fecha text; v_existente record;
  v_linea jsonb; v_grupos jsonb; v_g jsonb; v_p record; v_cantidad integer; v_stock_nuevo integer;
  v_calculo jsonb; v_personales jsonb := '[]'::jsonb;
  v_total_normal numeric := 0; v_total_externo numeric := 0; v_total_personal numeric := 0; v_total numeric;
  v_metodo text := nullif(btrim(p_metodo_pago), '');
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  /* 1. AUTENTICACIÓN Y PERFIL */
  if v_actor is null then raise exception using errcode = 'P0001', message = 'SIN_SESION: Debes iniciar sesión.'; end if;
  select u.nombre, u.rol, u.activo into v_nombre, v_rol, v_activo from public.usuarios u where u.id = v_actor;
  if not found or v_rol not in ('Admin','Vendedor') then raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: El usuario no puede registrar ventas.'; end if;
  if v_activo is distinct from true then raise exception using errcode = 'P0001', message = 'USUARIO_INACTIVO: El usuario está inactivo.'; end if;
  if nullif(btrim(v_nombre), '') is null then raise exception using errcode = 'P0001', message = 'PERFIL_INVALIDO: El perfil no tiene nombre.'; end if;

  /* 2. VALIDACIÓN GENERAL */
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'IDEMPOTENCIA_INVALIDA: Falta la clave.'; end if;
  if v_metodo is null or v_metodo not in ('Efectivo','Transferencia','Tarjeta') then raise exception using errcode = 'P0001', message = 'METODO_INVALIDO: Método inválido.'; end if;
  p_lineas := coalesce(p_lineas, '[]'::jsonb); p_lineas_personalizadas := coalesce(p_lineas_personalizadas, '[]'::jsonb);
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_typeof(p_lineas_personalizadas) <> 'array'
     or jsonb_array_length(p_lineas) + jsonb_array_length(p_lineas_personalizadas) = 0 then
    raise exception using errcode = 'P0001', message = 'CARRITO_VACIO: Agrega al menos un artículo.';
  end if;
  if jsonb_array_length(p_lineas) > 1000 or jsonb_array_length(p_lineas_personalizadas) > 100 then
    raise exception using errcode = 'P0001', message = 'DEMASIADAS_LINEAS: El ticket excede el límite.';
  end if;

  /* 3. IDEMPOTENCIA: un reintento con la misma clave devuelve el ticket ya cobrado. */
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existente from public.ventas_tickets where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'idempotente', true, 'ticket_id', v_existente.ticket_id, 'folio', v_existente.folio, 'total', v_existente.total, 'metodo_pago', v_existente.metodo_pago, 'created_at', v_existente.created_at);
  end if;

  /* 4. FORMATO DE LÍNEAS. CASE evita castear antes de validar (OR no garantiza cortocircuito). */
  if exists (
    select 1 from jsonb_array_elements(p_lineas) x
    where jsonb_typeof(x) <> 'object'
       or (x ? 'producto_id') = (x ? 'catalogo_producto_id')
       or coalesce(x->>'producto_id', x->>'catalogo_producto_id', '') !~ v_uuid
       or case when coalesce(x->>'cantidad', '') ~ '^[0-9]{1,10}$' then (x->>'cantidad')::numeric not between 1 and 2147483647 else true end
       or (x->>'precio_unitario' is not null and x->>'precio_unitario' !~ '^[0-9]{1,8}([.][0-9]{1,2})?$')
       or (x->>'motivo_precio' is not null and x->>'motivo_precio' not in ('PROMOCION','DESCUENTO_CLIENTE','AJUSTE_COMERCIAL','CANDIDATO_PRECIO_OFICIAL'))
       or (x ? 'descuento_conjunto' and jsonb_typeof(x->'descuento_conjunto') not in ('boolean','null'))
       or length(coalesce(x->>'nota_precio', '')) > 250
       or (case when jsonb_typeof(x) = 'object' then exists (select 1 from jsonb_object_keys(x) clave
             where clave not in ('producto_id','catalogo_producto_id','cantidad','precio_unitario','motivo_precio','nota_precio','descuento_conjunto')) else true end)
  ) then
    raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: Revisa los productos y cantidades.';
  end if;

  /* 5. BLOQUEO DE PRODUCTOS en orden estable (evita interbloqueos) y validaciones originales. Se permite stock cero o negativo. */
  for v_p in
    select p.* from public.productos p
    where p.id in (select (x->>'producto_id')::uuid from jsonb_array_elements(p_lineas) x where x ? 'producto_id')
    order by p.id for update
  loop
    if coalesce(v_p.archivado, false) then raise exception using errcode = 'P0001', message = 'PRODUCTO_ARCHIVADO: ' || v_p.nombre || ' está archivado.'; end if;
    if v_p.stock is null then raise exception using errcode = 'P0001', message = 'STOCK_INVALIDO: ' || v_p.nombre || ' no tiene existencia válida.'; end if;
    if v_p.precio is null or v_p.precio < 0 then raise exception using errcode = 'P0001', message = 'PRECIO_INVALIDO: ' || v_p.nombre || ' no tiene precio válido.'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_lineas) x where x ? 'producto_id'
             and not exists (select 1 from public.productos p where p.id = (x->>'producto_id')::uuid)) then
    raise exception using errcode = 'P0001', message = 'PRODUCTO_INEXISTENTE: El producto local no existe.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) x where x ? 'catalogo_producto_id'
             and not exists (select 1 from public.catalogo_productos cp join public.catalogo_proveedores pr on pr.id = cp.proveedor_id
                             where cp.id = (x->>'catalogo_producto_id')::uuid and cp.activo and not cp.ambiguo and pr.activo)) then
    raise exception using errcode = 'P0001', message = 'CATALOGO_INEXISTENTE: El artículo externo no está publicado o requiere revisión.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) x join public.catalogo_vinculos_inventario cv on cv.catalogo_producto_id = (x->>'catalogo_producto_id')::uuid) then
    raise exception using errcode = 'P0001', message = 'CATALOGO_VINCULADO: El artículo está vinculado al inventario; véndelo como producto FAST LOOK.';
  end if;

  /* 6. PRECIO EFECTIVO Y AGRUPACIÓN. Sin precio_unitario: oficial (inventario) u oferta vigente (externo).
        Motivo y descuento conjunto sólo se conservan si el precio difiere del de lista. */
  select coalesce(jsonb_agg(to_jsonb(g) order by g.tipo, g.articulo_id, g.precio), '[]'::jsonb) into v_grupos
  from (
    select e.tipo, e.articulo_id, e.precio, e.lista, e.costo, e.codigo, e.nombre, e.proveedor_id, e.proveedor_nombre,
           case when e.precio is distinct from e.lista then e.motivo end as motivo,
           coalesce(e.precio is distinct from e.lista and e.conjunto, false) as conjunto,
           case when e.precio is distinct from e.lista then max(e.nota) end as nota,
           sum(e.cantidad) as cantidad
    from (
      select 'inventario' as tipo, p.id as articulo_id, coalesce(round((x->>'precio_unitario')::numeric, 2), p.precio) as precio,
             p.precio as lista, p.costo::numeric as costo, p.codigo::text as codigo, p.nombre::text as nombre,
             null::uuid as proveedor_id, null::text as proveedor_nombre,
             x->>'motivo_precio' as motivo, coalesce((x->>'descuento_conjunto')::boolean, false) as conjunto,
             nullif(btrim(x->>'nota_precio'), '') as nota, (x->>'cantidad')::bigint as cantidad
      from jsonb_array_elements(p_lineas) x join public.productos p on p.id = (x->>'producto_id')::uuid
      union all
      select 'externo', cp.id, coalesce(round((x->>'precio_unitario')::numeric, 2), cp.precio_venta_override, o.precio_sugerido),
             coalesce(cp.precio_venta_override, o.precio_sugerido), o.costo_efectivo, cp.codigo_original, cp.nombre, pr.id, pr.nombre,
             x->>'motivo_precio', coalesce((x->>'descuento_conjunto')::boolean, false),
             nullif(btrim(x->>'nota_precio'), ''), (x->>'cantidad')::bigint
      from jsonb_array_elements(p_lineas) x
      join public.catalogo_productos cp on cp.id = (x->>'catalogo_producto_id')::uuid
      join public.catalogo_proveedores pr on pr.id = cp.proveedor_id
      left join lateral public._oferta_vigente_catalogo(cp.id) o on true
    ) e
    group by e.tipo, e.articulo_id, e.precio, e.lista, e.costo, e.codigo, e.nombre, e.proveedor_id, e.proveedor_nombre,
             case when e.precio is distinct from e.lista then e.motivo end,
             coalesce(e.precio is distinct from e.lista and e.conjunto, false)
  ) g;

  for v_g in select value from jsonb_array_elements(v_grupos) loop
    if v_g->>'tipo' = 'externo' and v_g->>'lista' is null then
      raise exception using errcode = 'P0001', message = 'PRECIO_CATALOGO_INVALIDO: ' || (v_g->>'nombre') || ' no tiene precio vigente.';
    end if;
    if (v_g->>'cantidad')::bigint > 2147483647 then raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: Cantidad excesiva.'; end if;
    if (v_g->>'precio')::numeric is distinct from (v_g->>'lista')::numeric and v_g->>'motivo' is null then
      raise exception using errcode = 'P0001', message = 'MOTIVO_PRECIO_REQUERIDO: Indica el motivo del precio modificado de ' || (v_g->>'nombre') || '.';
    end if;
    if v_g->>'tipo' = 'inventario' then v_total_normal := v_total_normal + (v_g->>'precio')::numeric * (v_g->>'cantidad')::bigint;
    else v_total_externo := v_total_externo + (v_g->>'precio')::numeric * (v_g->>'cantidad')::bigint; end if;
  end loop;

  /* 7. PERSONALIZADOS: el servidor calcula el precio, igual que antes. */
  for v_linea in select value from jsonb_array_elements(p_lineas_personalizadas) loop
    if jsonb_typeof(v_linea) <> 'object'
       or (select count(*) from jsonb_object_keys(v_linea)) <> 3
       or not (v_linea ? 'tipo_personalizado') or not (v_linea ? 'cantidad') or not (v_linea ? 'configuracion')
       or jsonb_typeof(v_linea->'tipo_personalizado') <> 'string' or jsonb_typeof(v_linea->'cantidad') <> 'number' or jsonb_typeof(v_linea->'configuracion') <> 'object'
       or length(v_linea->>'tipo_personalizado') > 32 or octet_length((v_linea->'configuracion')::text) > 262144
       or (case when (v_linea->>'cantidad') ~ '^[0-9]{1,10}$' then (v_linea->>'cantidad')::numeric not between 1 and 2147483647 else true end) then
      raise exception using errcode = 'P0001', message = 'LINEAS_PERSONALIZADAS_INVALIDAS: Revisa el producto personalizado.';
    end if;
    v_calculo := public.calcular_linea_personalizada(upper(btrim(v_linea->>'tipo_personalizado')), v_linea->'configuracion');
    v_cantidad := (v_linea->>'cantidad')::integer;
    v_total_personal := v_total_personal + (v_calculo->>'precio_unitario')::numeric * v_cantidad;
    v_personales := v_personales || jsonb_build_array(jsonb_build_object('tipo', upper(btrim(v_linea->>'tipo_personalizado')), 'cantidad', v_cantidad, 'calculo', v_calculo));
  end loop;

  /* 8. CABECERA Y FOLIO */
  v_total := round(v_total_normal + v_total_externo + v_total_personal, 2);
  v_ticket := gen_random_uuid(); v_fecha := to_char(current_timestamp at time zone 'America/Mexico_City', 'YYYYMMDD');
  loop
    v_folio := 'FLV-' || v_fecha || '-' || upper(substr(replace(v_ticket::text, '-', ''), 1, 12));
    exit when not exists (select 1 from public.ventas_tickets where folio = v_folio);
    v_ticket := gen_random_uuid();
  end loop;
  insert into public.ventas_tickets (ticket_id, folio, idempotency_key, metodo_pago, usuario_id, usuario_nombre, total, created_at)
  values (v_ticket, v_folio, p_idempotency_key, v_metodo, v_actor, v_nombre, v_total, now());

  /* 9. LÍNEAS. El stock se descuenta sobre el valor bloqueado (puede quedar negativo). */
  for v_g in select value from jsonb_array_elements(v_grupos) loop
    v_cantidad := (v_g->>'cantidad')::integer;
    if v_g->>'tipo' = 'inventario' then
      update public.productos set stock = stock - v_cantidad where id = (v_g->>'articulo_id')::uuid returning stock into v_stock_nuevo;
      insert into public.movimientos_inventario (producto_id, codigo, nombre, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, nota, created_at, origen, ticket_id, folio)
      values ((v_g->>'articulo_id')::uuid, v_g->>'codigo', v_g->>'nombre', 'Venta', v_cantidad, v_stock_nuevo + v_cantidad, v_stock_nuevo, 'Salida por venta', now(), 'SISTEMA', v_ticket, v_folio);
      insert into public.ventas (id, producto_id, codigo, nombre, precio, precio_lista, precio_modificado, precio_modificado_por, motivo_precio, nota_precio, descuento_conjunto, costo_unitario, cantidad, total, metodo_pago, created_at, ticket_id, folio)
      values (gen_random_uuid(), (v_g->>'articulo_id')::uuid, v_g->>'codigo', v_g->>'nombre', (v_g->>'precio')::numeric, (v_g->>'lista')::numeric,
              (v_g->>'motivo') is not null, case when v_g->>'motivo' is not null then v_actor end, v_g->>'motivo', v_g->>'nota', (v_g->>'conjunto')::boolean,
              (v_g->>'costo')::numeric, v_cantidad, round((v_g->>'precio')::numeric * v_cantidad, 2), v_metodo, now(), v_ticket, v_folio);
    else
      insert into public.ventas_catalogo_proveedores (ticket_id, folio, catalogo_producto_id, proveedor_id, codigo, nombre, proveedor_nombre, precio_lista, precio, precio_modificado, precio_modificado_por, motivo_precio, nota_precio, descuento_conjunto, costo_unitario, cantidad, total, metodo_pago)
      values (v_ticket, v_folio, (v_g->>'articulo_id')::uuid, (v_g->>'proveedor_id')::uuid, v_g->>'codigo', v_g->>'nombre', v_g->>'proveedor_nombre',
              (v_g->>'lista')::numeric, (v_g->>'precio')::numeric, (v_g->>'motivo') is not null, case when v_g->>'motivo' is not null then v_actor end,
              v_g->>'motivo', v_g->>'nota', (v_g->>'conjunto')::boolean, (v_g->>'costo')::numeric, v_cantidad, round((v_g->>'precio')::numeric * v_cantidad, 2), v_metodo);
    end if;
  end loop;
  for v_linea in select value from jsonb_array_elements(v_personales) loop
    v_calculo := v_linea->'calculo'; v_cantidad := (v_linea->>'cantidad')::integer;
    insert into public.ventas_personalizadas (id, ticket_id, folio, tipo_personalizado, nombre, resumen, configuracion, precio_unitario, cantidad, total, costo_unitario, metodo_pago, created_at, created_by)
    values (gen_random_uuid(), v_ticket, v_folio, v_linea->>'tipo', v_calculo->>'nombre', v_calculo->>'resumen', v_calculo->'configuracion',
            (v_calculo->>'precio_unitario')::numeric, v_cantidad, round((v_calculo->>'precio_unitario')::numeric * v_cantidad, 2), null, v_metodo, now(), v_actor);
  end loop;

  return jsonb_build_object('ok', true, 'idempotente', false, 'ticket_id', v_ticket, 'folio', v_folio, 'total', v_total,
    'total_normal', round(v_total_normal, 2), 'total_externo', round(v_total_externo, 2), 'total_personalizado', round(v_total_personal, 2), 'metodo_pago', v_metodo);
exception when unique_violation then
  select * into v_existente from public.ventas_tickets where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'idempotente', true, 'ticket_id', v_existente.ticket_id, 'folio', v_existente.folio, 'total', v_existente.total, 'metodo_pago', v_existente.metodo_pago, 'created_at', v_existente.created_at);
  end if;
  raise;
end $$;

-- Firmas públicas idénticas: POS, venta por voz y la aplicación anterior siguen llamándolas igual.
create or replace function public.procesar_venta(p_idempotency_key uuid, p_metodo_pago text, p_lineas jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select public._procesar_venta_flexible(p_idempotency_key, p_metodo_pago, p_lineas, '[]'::jsonb)
$$;
create or replace function public.procesar_venta_mixta(p_idempotency_key uuid, p_metodo_pago text, p_lineas_normales jsonb, p_lineas_personalizadas jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select public._procesar_venta_flexible(p_idempotency_key, p_metodo_pago, p_lineas_normales, p_lineas_personalizadas)
$$;

-- 7. procesar_devolucion: el original se conserva salvo la validación que impedía reponer sobre saldo negativo.
do $$
declare v_def text; v_nueva text;
begin
  select definicion into v_def from public.fastlook_migracion_respaldos
  where migracion = 'venta_flexible_proveedores_v1' and objeto = 'procesar_devolucion(uuid,text,jsonb,text)';
  v_nueva := replace(v_def, 'if v_producto.stock is null or v_producto.stock < 0 then', 'if v_producto.stock is null then');
  if v_nueva = v_def then raise exception 'DEFINICION_INESPERADA: no se encontró la validación de stock de procesar_devolucion'; end if;
  execute v_nueva;
end $$;

-- 8. procesar_devolucion_mixta: misma firma. p_lineas acepta {venta_id} (inventario, se delega en
--    procesar_devolucion) y {venta_externa_id} (externo: sólo reembolso, sin stock ni movimientos).
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
  v_inventario jsonb;
  v_externas jsonb;
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
  v_total_externo numeric := 0;
  v_costo_externo numeric := 0;
  v_utilidad_externa numeric := 0;
  v_externas_sin_costo boolean := false;
  v_total_devuelto numeric;
  v_productos integer := 0;
  v_lineas_personalizadas integer := 0;
  v_lineas_externas integer := 0;
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

  /* 2. VALIDACIÓN GENERAL */
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
       or (elemento ? 'venta_id') = (elemento ? 'venta_externa_id')
       or nullif(btrim(coalesce(elemento->>'venta_id', elemento->>'venta_externa_id')), '') is null
       or nullif(btrim(elemento->>'cantidad'), '') is null
       or (elemento->>'cantidad') !~ '^[0-9]{1,9}$'
       or (elemento->>'cantidad')::numeric <= 0
  ) or exists (
    select 1 from jsonb_array_elements(v_personalizadas) elemento
    where jsonb_typeof(elemento) <> 'object'
       or nullif(btrim(elemento->>'venta_personalizada_id'), '') is null
       or nullif(btrim(elemento->>'cantidad'), '') is null
       or (elemento->>'cantidad') !~ '^[0-9]{1,9}$'
       or (elemento->>'cantidad')::numeric <= 0
  ) then
    raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: Venta o cantidad no válida.';
  end if;
  select coalesce(jsonb_agg(e) filter (where e ? 'venta_id'), '[]'::jsonb), coalesce(jsonb_agg(e) filter (where e ? 'venta_externa_id'), '[]'::jsonb)
  into v_inventario, v_externas from jsonb_array_elements(v_lineas) e;

  /* 3. IDEMPOTENCIA: mismo advisory lock que procesar_devolucion (reentrante en la transacción). */
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));

  select d.id, d.folio, d.total_devuelto into v_existente
  from public.devoluciones d where d.idempotency_key = p_idempotency_key;
  if found then
    select count(distinct dd.producto_id) into v_productos from public.devoluciones_detalle dd where dd.devolucion_id = v_existente.id;
    select count(*) into v_lineas_personalizadas from public.devoluciones_personalizadas_detalle dpd where dpd.devolucion_id = v_existente.id;
    select count(*) into v_lineas_externas from public.devoluciones_externas_detalle ded where ded.devolucion_id = v_existente.id;
    return jsonb_build_object('ok', true, 'idempotente', true, 'devolucion_id', v_existente.id, 'folio', v_existente.folio,
      'total_devuelto', v_existente.total_devuelto, 'productos', v_productos, 'personalizadas', v_lineas_personalizadas, 'externas', v_lineas_externas);
  end if;

  /* 4. UN SOLO TICKET, NO CANCELADO. Bloquearlo serializa devoluciones del mismo ticket y deshacer_venta_voz. */
  if exists (
    select 1 from (select distinct elemento->>'venta_personalizada_id' as id from jsonb_array_elements(v_personalizadas) elemento) entrada
    where not exists (select 1 from public.ventas_personalizadas vp where vp.id::text = entrada.id)
  ) or exists (
    select 1 from (select distinct elemento->>'venta_externa_id' as id from jsonb_array_elements(v_externas) elemento) entrada
    where not exists (select 1 from public.ventas_catalogo_proveedores ve where ve.id::text = entrada.id)
  ) then
    raise exception using errcode = 'P0001', message = 'VENTA_INEXISTENTE: Una venta seleccionada no existe.';
  end if;

  if exists (
    select 1 from public.ventas v
    join (select distinct elemento->>'venta_id' as id from jsonb_array_elements(v_inventario) elemento) entrada on v.id::text = entrada.id
    where v.ticket_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: La venta no tiene ticket_id o folio.';
  end if;

  select count(distinct origen.ticket_id), min(origen.ticket_id) into v_tickets, v_ticket_texto
  from (
    select v.ticket_id::text as ticket_id from public.ventas v
    join (select distinct elemento->>'venta_id' as id from jsonb_array_elements(v_inventario) elemento) entrada on v.id::text = entrada.id
    union all
    select vp.ticket_id::text from public.ventas_personalizadas vp
    join (select distinct elemento->>'venta_personalizada_id' as id from jsonb_array_elements(v_personalizadas) elemento) entrada on vp.id::text = entrada.id
    union all
    select ve.ticket_id::text from public.ventas_catalogo_proveedores ve
    join (select distinct elemento->>'venta_externa_id' as id from jsonb_array_elements(v_externas) elemento) entrada on ve.id::text = entrada.id
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

  /* 5b. LÍNEAS EXTERNAS: mismo criterio que personalizadas; el acumulado devuelto incluye devoluciones parciales previas. */
  perform 1 from public.ventas_catalogo_proveedores ve
  where ve.id::text in (select elemento->>'venta_externa_id' from jsonb_array_elements(v_externas) elemento)
  order by ve.id
  for update;

  for v_linea in
    select elemento->>'venta_externa_id' as venta_id, sum((elemento->>'cantidad')::numeric) as cantidad
    from jsonb_array_elements(v_externas) elemento
    group by elemento->>'venta_externa_id'
    order by elemento->>'venta_externa_id'
  loop
    select ve.* into strict v_venta from public.ventas_catalogo_proveedores ve where ve.id::text = v_linea.venta_id;
    if v_folio is null then
      v_folio := v_venta.folio; v_metodo_pago := v_venta.metodo_pago;
    elsif v_folio is distinct from v_venta.folio then
      raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: Las líneas pertenecen a tickets distintos.';
    elsif v_metodo_pago is distinct from v_venta.metodo_pago then
      raise exception using errcode = 'P0001', message = 'METODO_INCONSISTENTE: El ticket contiene métodos de pago distintos.';
    end if;

    select coalesce(sum(ded.cantidad), 0) into v_cantidad_devuelta
    from public.devoluciones_externas_detalle ded where ded.venta_externa_id = v_venta.id;
    v_cantidad_disponible := v_venta.cantidad - v_cantidad_devuelta;
    if v_linea.cantidad > v_cantidad_disponible then
      raise exception using errcode = 'P0001', message = format('CANTIDAD_EXCEDIDA: La venta %s sólo tiene %s pieza(s) disponibles.', v_venta.id, greatest(v_cantidad_disponible, 0));
    end if;
    if v_venta.precio * v_linea.cantidad <= 0 then
      raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: La línea externa no tiene importe a devolver.';
    end if;

    v_total_externo := v_total_externo + v_venta.precio * v_linea.cantidad;
    -- Corte sólo contó utilidad de líneas con costo; se revierte exactamente esa utilidad.
    if v_venta.costo_unitario is null then v_externas_sin_costo := true;
    else
      v_costo_externo := v_costo_externo + v_venta.costo_unitario * v_linea.cantidad;
      v_utilidad_externa := v_utilidad_externa + (v_venta.precio - v_venta.costo_unitario) * v_linea.cantidad;
    end if;
  end loop;

  /* 6. CABECERA. Con inventario, procesar_devolucion la crea y repone stock tal como hoy. */
  if jsonb_array_length(v_inventario) > 0 then
    perform public.procesar_devolucion(p_idempotency_key, p_motivo, v_inventario, p_motivo_otro);
    select d.id, d.folio, d.metodo_pago into v_devolucion_id, v_folio_cabecera, v_metodo_cabecera
    from public.devoluciones d where d.idempotency_key = p_idempotency_key;
    select count(distinct dd.producto_id) into v_productos from public.devoluciones_detalle dd where dd.devolucion_id = v_devolucion_id;
    if v_folio is not null and v_folio is distinct from v_folio_cabecera then
      raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: Las líneas pertenecen a tickets distintos.';
    end if;
    if v_metodo_pago is not null and v_metodo_pago is distinct from v_metodo_cabecera then
      raise exception using errcode = 'P0001', message = 'METODO_INCONSISTENTE: El ticket contiene métodos de pago distintos.';
    end if;
    if v_total_personalizado + v_total_externo > 0 then
      -- Una cabecera con costo/utilidad NULL (inventario sin costo) conserva NULL.
      update public.devoluciones set
        total_devuelto = total_devuelto + v_total_personalizado + v_total_externo,
        costo_revertido = case when costo_revertido is null or v_externas_sin_costo then null else costo_revertido + v_costo_externo end,
        utilidad_revertida = case when utilidad_revertida is null then null else utilidad_revertida + v_utilidad_externa end
      where id = v_devolucion_id;
    end if;
    v_folio := v_folio_cabecera;
  else
    insert into public.devoluciones (idempotency_key, ticket_id, folio, total_devuelto, costo_revertido, utilidad_revertida, metodo_pago, motivo, motivo_otro, usuario_id, usuario_nombre)
    values (p_idempotency_key, v_ticket_id, v_folio, v_total_personalizado + v_total_externo,
      case when jsonb_array_length(v_externas) > 0 and not v_externas_sin_costo then v_costo_externo end,
      v_utilidad_externa, v_metodo_pago, p_motivo,
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

  /* 7b. DETALLE EXTERNO: historial auditable; no toca public.productos ni movimientos_inventario. */
  for v_linea in
    select elemento->>'venta_externa_id' as venta_id, sum((elemento->>'cantidad')::numeric) as cantidad
    from jsonb_array_elements(v_externas) elemento
    group by elemento->>'venta_externa_id'
    order by elemento->>'venta_externa_id'
  loop
    select ve.* into strict v_venta from public.ventas_catalogo_proveedores ve where ve.id::text = v_linea.venta_id;
    insert into public.devoluciones_externas_detalle (devolucion_id, ticket_id, venta_externa_id, catalogo_producto_id, codigo, nombre, cantidad, precio_unitario_original, subtotal_devuelto, costo_unitario, usuario_id)
    values (v_devolucion_id, v_venta.ticket_id, v_venta.id, v_venta.catalogo_producto_id, v_venta.codigo, v_venta.nombre,
      v_linea.cantidad, v_venta.precio, v_venta.precio * v_linea.cantidad, v_venta.costo_unitario, v_usuario_id);
    v_lineas_externas := v_lineas_externas + 1;
  end loop;

  select d.total_devuelto into v_total_devuelto from public.devoluciones d where d.id = v_devolucion_id;
  return jsonb_build_object('ok', true, 'idempotente', false, 'devolucion_id', v_devolucion_id, 'folio', v_folio,
    'total_devuelto', v_total_devuelto, 'productos', v_productos, 'personalizadas', v_lineas_personalizadas, 'externas', v_lineas_externas);

exception
  when unique_violation then
    select d.id, d.folio, d.total_devuelto into v_existente
    from public.devoluciones d where d.idempotency_key = p_idempotency_key;
    if found then
      select count(distinct dd.producto_id) into v_productos from public.devoluciones_detalle dd where dd.devolucion_id = v_existente.id;
      select count(*) into v_lineas_personalizadas from public.devoluciones_personalizadas_detalle dpd where dpd.devolucion_id = v_existente.id;
      select count(*) into v_lineas_externas from public.devoluciones_externas_detalle ded where ded.devolucion_id = v_existente.id;
      return jsonb_build_object('ok', true, 'idempotente', true, 'devolucion_id', v_existente.id, 'folio', v_existente.folio,
        'total_devuelto', v_existente.total_devuelto, 'productos', v_productos, 'personalizadas', v_lineas_personalizadas, 'externas', v_lineas_externas);
    end if;
    raise;
end $$;

-- 9. APRENDIZAJE DE PRECIOS (inventario y proveedor). Sólo CANDIDATO_PRECIO_OFICIAL contra el precio de lista
--    vigente; excluye descuentos conjuntos, tickets cancelados, líneas con devolución, evidencia ya descartada y
--    posibles errores de captura (precio 0 o fuera de la variación configurada, 50 % por defecto). Cada ticket
--    cuenta una vez. Nunca cambia un precio por sí mismo: un Admin aprueba o descarta.
--    La variación SÓLO filtra evidencia de sugerencias: la venta acepta cualquier precio manual válido.
create table if not exists public.fastlook_parametros_precios (
  id boolean primary key default true check (id),
  variacion_maxima_sugerencia_pct numeric(6,2) not null default 50 check (variacion_maxima_sugerencia_pct > 0 and variacion_maxima_sugerencia_pct <= 1000),
  actualizado_por uuid references public.usuarios(id), updated_at timestamptz not null default now()
);
insert into public.fastlook_parametros_precios (id) values (true) on conflict (id) do nothing;
alter table public.fastlook_parametros_precios enable row level security;
revoke all on table public.fastlook_parametros_precios from public, anon, authenticated;

create or replace function public.configurar_variacion_sugerencias_precio(p_porcentaje numeric)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and activo = true and rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo Admin configura el aprendizaje de precios.';
  end if;
  if p_porcentaje is null or p_porcentaje <= 0 or p_porcentaje > 1000 or p_porcentaje <> round(p_porcentaje, 2) then
    raise exception using errcode = '22023', message = 'PORCENTAJE_INVALIDO: Usa un valor mayor a 0 y hasta 1000.';
  end if;
  update public.fastlook_parametros_precios set variacion_maxima_sugerencia_pct = p_porcentaje, actualizado_por = auth.uid(), updated_at = now() where id;
  return jsonb_build_object('ok', true, 'variacion_maxima_sugerencia_pct', p_porcentaje);
end $$;
create table if not exists public.sugerencias_precio_descartadas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('inventario','externo')), articulo_id uuid not null,
  precio numeric(12,2) not null, tickets_evidencia uuid[] not null, motivo text not null check (length(motivo) between 1 and 250),
  descartado_por uuid not null references public.usuarios(id), created_at timestamptz not null default now()
);
create index if not exists sugerencias_descartadas_articulo_idx on public.sugerencias_precio_descartadas(tipo, articulo_id, precio);
alter table public.sugerencias_precio_descartadas enable row level security;
revoke all on table public.sugerencias_precio_descartadas from public, anon, authenticated;

drop function if exists public._evidencia_precio_candidato(uuid);
create or replace function public._evidencia_precio_candidato()
returns table (tipo text, articulo_id uuid, precio numeric, lista numeric, ticket_id uuid, folio text, fecha timestamptz, cantidad integer, vendedor text)
language sql stable security definer set search_path = '' as $$
  select e.* from (
    select 'inventario'::text, v.producto_id, v.precio, p.precio, v.ticket_id, v.folio::text, v.created_at, v.cantidad::integer, t.usuario_nombre::text
    from public.ventas v
    join public.productos p on p.id = v.producto_id
    join public.ventas_tickets t on t.ticket_id = v.ticket_id
    where v.precio_modificado and v.motivo_precio = 'CANDIDATO_PRECIO_OFICIAL' and not v.descuento_conjunto
      and v.precio_lista = p.precio and not coalesce(p.archivado, false)
      and lower(coalesce(t.estado, 'Cobrado')) not in ('cancelado','cancelada','anulado','anulada')
      and not exists (select 1 from public.devoluciones_detalle dd where dd.venta_id = v.id)
    union all
    select 'externo'::text, v.catalogo_producto_id, v.precio, l.lista, v.ticket_id, v.folio, v.created_at, v.cantidad, t.usuario_nombre::text
    from public.ventas_catalogo_proveedores v
    join public.catalogo_productos cp on cp.id = v.catalogo_producto_id
    join public.ventas_tickets t on t.ticket_id = v.ticket_id
    cross join lateral (select coalesce(cp.precio_venta_override, (select o.precio_sugerido from public._oferta_vigente_catalogo(cp.id) o)) as lista) l
    where v.precio_modificado and v.motivo_precio = 'CANDIDATO_PRECIO_OFICIAL' and not v.descuento_conjunto
      and v.precio_lista = l.lista and cp.activo and not cp.ambiguo
      and lower(coalesce(t.estado, 'Cobrado')) not in ('cancelado','cancelada','anulado','anulada')
      and not exists (select 1 from public.devoluciones_externas_detalle ded where ded.venta_externa_id = v.id)
  ) e (tipo, articulo_id, precio, lista, ticket_id, folio, fecha, cantidad, vendedor)
  cross join (select coalesce((select variacion_maxima_sugerencia_pct from public.fastlook_parametros_precios where id), 50) / 100 as v) cfg
  where e.precio <> e.lista and e.precio > 0 and e.precio between e.lista * (1 - cfg.v) and e.lista * (1 + cfg.v)
    and not exists (select 1 from public.sugerencias_precio_descartadas d
                    where d.tipo = e.tipo and d.articulo_id = e.articulo_id and d.precio = e.precio and e.ticket_id = any (d.tickets_evidencia))
$$;

create or replace function public.obtener_sugerencias_precio_admin()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_resultado jsonb;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and activo = true and rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo Admin consulta sugerencias.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.ultima_venta desc), '[]'::jsonb) into v_resultado
  from (
    select e.tipo, e.articulo_id, case when e.tipo = 'inventario' then e.articulo_id end as producto_id, n.codigo, n.nombre, n.proveedor,
           e.lista as precio_anterior, e.precio as precio_candidato, n.costo,
           case when n.costo is not null and e.precio > 0 then round((e.precio - n.costo) / e.precio * 100, 1) end as margen_estimado_pct,
           count(distinct e.ticket_id) as tickets, min(e.fecha) as primera_venta, max(e.fecha) as ultima_venta,
           jsonb_agg(jsonb_build_object('ticket_id', e.ticket_id, 'folio', e.folio, 'fecha', e.fecha, 'cantidad', e.cantidad, 'vendedor', e.vendedor) order by e.fecha) as evidencia
    from public._evidencia_precio_candidato() e
    cross join lateral (
      select p.codigo::text as codigo, p.nombre::text as nombre, null::text as proveedor, p.costo::numeric as costo
      from public.productos p where e.tipo = 'inventario' and p.id = e.articulo_id
      union all
      select cp.codigo_original, cp.nombre, pr.nombre, (select o.costo_efectivo from public._oferta_vigente_catalogo(cp.id) o)
      from public.catalogo_productos cp join public.catalogo_proveedores pr on pr.id = cp.proveedor_id
      where e.tipo = 'externo' and cp.id = e.articulo_id
    ) n
    group by e.tipo, e.articulo_id, n.codigo, n.nombre, n.proveedor, e.lista, e.precio, n.costo
    having count(distinct e.ticket_id) >= 4
  ) s;
  return v_resultado;
end $$;

create or replace function public.aprobar_sugerencia_precio(p_producto_id uuid, p_precio numeric)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_actual numeric; v_tickets uuid[];
begin
  if not exists (select 1 from public.usuarios where id = v_actor and activo = true and rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo Admin aprueba precios.';
  end if;
  if p_producto_id is null or p_precio is null or p_precio < 0 or p_precio <> round(p_precio, 2) then
    raise exception using errcode = '22023', message = 'PRECIO_INVALIDO: Usa un importe no negativo con máximo dos decimales.';
  end if;
  -- Bloquear el producto serializa aprobaciones, descartes y ventas simultáneas del mismo artículo.
  select p.precio into v_actual from public.productos p where p.id = p_producto_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCTO_INEXISTENTE: El producto no existe.'; end if;
  select array_agg(distinct e.ticket_id) into v_tickets from public._evidencia_precio_candidato() e
  where e.tipo = 'inventario' and e.articulo_id = p_producto_id and e.precio = p_precio;
  if coalesce(cardinality(v_tickets), 0) < 4 then
    raise exception using errcode = '22023', message = 'EVIDENCIA_INSUFICIENTE: Se requieren cuatro tickets independientes vigentes.';
  end if;
  update public.productos set precio = p_precio where id = p_producto_id;
  insert into public.historial_precios_productos (producto_id, precio_anterior, precio_nuevo, origen, tickets_evidencia, aprobado_por)
  values (p_producto_id, v_actual, p_precio, 'SUGERENCIA_VENTAS', v_tickets, v_actor);
  return jsonb_build_object('ok', true, 'producto_id', p_producto_id, 'precio_anterior', v_actual, 'precio_nuevo', p_precio, 'tickets', cardinality(v_tickets));
end $$;

create or replace function public.aprobar_sugerencia_precio_externo(p_catalogo_producto_id uuid, p_precio numeric)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_actual numeric; v_override numeric; v_tickets uuid[];
begin
  if not exists (select 1 from public.usuarios where id = v_actor and activo = true and rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo Admin aprueba precios.';
  end if;
  if p_catalogo_producto_id is null or p_precio is null or p_precio < 0 or p_precio <> round(p_precio, 2) then
    raise exception using errcode = '22023', message = 'PRECIO_INVALIDO: Usa un importe no negativo con máximo dos decimales.';
  end if;
  select cp.precio_venta_override into v_override from public.catalogo_productos cp where cp.id = p_catalogo_producto_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'CATALOGO_INEXISTENTE: El artículo no existe.'; end if;
  v_actual := coalesce(v_override, (select o.precio_sugerido from public._oferta_vigente_catalogo(p_catalogo_producto_id) o));
  select array_agg(distinct e.ticket_id) into v_tickets from public._evidencia_precio_candidato() e
  where e.tipo = 'externo' and e.articulo_id = p_catalogo_producto_id and e.precio = p_precio;
  if coalesce(cardinality(v_tickets), 0) < 4 then
    raise exception using errcode = '22023', message = 'EVIDENCIA_INSUFICIENTE: Se requieren cuatro tickets independientes vigentes.';
  end if;
  update public.catalogo_productos set precio_venta_override = p_precio, updated_at = now() where id = p_catalogo_producto_id;
  insert into public.historial_precios_catalogo (catalogo_producto_id, precio_anterior, precio_nuevo, tickets_evidencia, aprobado_por)
  values (p_catalogo_producto_id, v_actual, p_precio, v_tickets, v_actor);
  return jsonb_build_object('ok', true, 'catalogo_producto_id', p_catalogo_producto_id, 'precio_anterior', v_actual, 'precio_nuevo', p_precio, 'tickets', cardinality(v_tickets));
end $$;

-- Descartar consume la evidencia actual: la misma propuesta sólo reaparece con cuatro tickets nuevos.
create or replace function public.descartar_sugerencia_precio(p_tipo text, p_articulo_id uuid, p_precio numeric, p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_tickets uuid[]; v_motivo text := nullif(btrim(p_motivo), '');
begin
  if not exists (select 1 from public.usuarios where id = v_actor and activo = true and rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo Admin descarta sugerencias.';
  end if;
  if p_tipo is null or p_tipo not in ('inventario','externo') or p_articulo_id is null or p_precio is null or v_motivo is null or length(v_motivo) > 250 then
    raise exception using errcode = '22023', message = 'DATOS_INVALIDOS: Indica la sugerencia y un motivo de hasta 250 caracteres.';
  end if;
  if p_tipo = 'inventario' then perform 1 from public.productos where id = p_articulo_id for update;
  else perform 1 from public.catalogo_productos where id = p_articulo_id for update; end if;
  select array_agg(distinct e.ticket_id) into v_tickets from public._evidencia_precio_candidato() e
  where e.tipo = p_tipo and e.articulo_id = p_articulo_id and e.precio = p_precio;
  if v_tickets is null then raise exception using errcode = 'P0002', message = 'SUGERENCIA_INEXISTENTE: No hay evidencia pendiente para ese precio.'; end if;
  insert into public.sugerencias_precio_descartadas (tipo, articulo_id, precio, tickets_evidencia, motivo, descartado_por)
  values (p_tipo, p_articulo_id, p_precio, v_tickets, v_motivo, v_actor);
  return jsonb_build_object('ok', true, 'tickets_descartados', cardinality(v_tickets));
end $$;

-- 9b. CATÁLOGO: misma consulta de fastlook_catalogo_proveedores.sql; agrega precio_venta (lista que cobra el RPC)
--     y usa la misma oferta vigente que la venta, para que el precio mostrado sea el precio cobrado.
create or replace function public.obtener_catalogo_proveedores(p_busqueda text default '',p_proveedor text default null,p_limite integer default 60,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_admin boolean; v_productos jsonb; v_proveedores jsonb;
begin
  select u.rol='Admin' into v_admin from public.usuarios u where u.id=v_actor and u.activo=true and u.rol in('Admin','Vendedor');
  if not found then raise exception using errcode='42501',message='ROL_NO_PERMITIDO: Perfil no autorizado.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'proveedor_id',pr.id,'proveedor_clave',pr.clave,'proveedor_nombre',pr.nombre,
    'codigo_original',p.codigo_original,'codigo_barras',p.codigo_barras,'nombre',p.nombre,'descripcion',p.descripcion,'categoria',p.categoria,
    'marca',p.marca,'compatibilidades',p.compatibilidades,'variantes',p.variantes,'imagen_url',p.imagen_url,'imagen_thumbnail_url',p.imagen_thumbnail_url,
    'ambiguo',p.ambiguo,'inventario_producto_id',v.producto_id,'inventario_precio',i.precio,'precio_venta_sugerido',o.precio_sugerido,
    'precio_venta',coalesce(p.precio_venta_override,o.precio_sugerido),
    'precio_actualizado_at',p.precio_actualizado_at,'ofertas',case when v_admin then coalesce(ofs.ofertas,'[]'::jsonb) else '[]'::jsonb end)),'[]'::jsonb)
  into v_productos from (select cp.* from public.catalogo_productos cp join public.catalogo_proveedores x on x.id=cp.proveedor_id
    where cp.activo=true and (p_proveedor is null or x.clave=upper(p_proveedor)) and (coalesce(p_busqueda,'')='' or
      cp.codigo_original ilike '%'||p_busqueda||'%' or cp.nombre ilike '%'||p_busqueda||'%' or cp.descripcion ilike '%'||p_busqueda||'%' or cp.categoria ilike '%'||p_busqueda||'%' or cp.marca ilike '%'||p_busqueda||'%')
    order by cp.nombre limit greatest(1,least(p_limite,100)) offset greatest(p_offset,0)) p
  join public.catalogo_proveedores pr on pr.id=p.proveedor_id
  left join public.catalogo_vinculos_inventario v on v.catalogo_producto_id=p.id left join public.productos i on i.id=v.producto_id
  left join lateral(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'nivel',x.nivel,'descuento_porcentaje',x.descuento_porcentaje,'costo_efectivo',x.costo_efectivo,'precio_sugerido',x.precio_sugerido,'vigente_desde',x.vigente_desde) order by x.costo_efectivo),'[]'::jsonb) ofertas from public.catalogo_ofertas x where x.catalogo_producto_id=p.id and x.activo=true) ofs on true
  left join lateral public._oferta_vigente_catalogo(p.id) o on true;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'clave',clave,'nombre',nombre,'nivel_compra',case when v_admin then nivel_compra else null end) order by nombre),'[]'::jsonb) into v_proveedores from public.catalogo_proveedores where activo=true;
  return jsonb_build_object('productos',v_productos,'proveedores',v_proveedores,'es_admin',v_admin);
end; $$;

-- v1 exponía obtener_ventas_catalogo; la lectura ahora es SELECT con RLS.
drop function if exists public.obtener_ventas_catalogo(uuid);

-- 10. PERMISOS
revoke all on function public._procesar_venta_flexible(uuid,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public._evidencia_precio_candidato() from public, anon, authenticated;
revoke all on function public._oferta_vigente_catalogo(uuid) from public, anon, authenticated;
revoke all on function public.procesar_venta(uuid,text,jsonb) from public, anon;
revoke all on function public.procesar_venta_mixta(uuid,text,jsonb,jsonb) from public, anon;
revoke all on function public.procesar_devolucion(uuid,text,jsonb,text) from public, anon;
revoke all on function public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text) from public, anon;
revoke all on function public.obtener_sugerencias_precio_admin() from public, anon;
revoke all on function public.aprobar_sugerencia_precio(uuid,numeric) from public, anon;
revoke all on function public.aprobar_sugerencia_precio_externo(uuid,numeric) from public, anon;
revoke all on function public.descartar_sugerencia_precio(text,uuid,numeric,text) from public, anon;
revoke all on function public.configurar_variacion_sugerencias_precio(numeric) from public, anon;
revoke all on function public.obtener_catalogo_proveedores(text,text,integer,integer) from public, anon;
grant execute on function public.procesar_venta(uuid,text,jsonb) to authenticated;
grant execute on function public.procesar_venta_mixta(uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public.procesar_devolucion(uuid,text,jsonb,text) to authenticated;
grant execute on function public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.obtener_sugerencias_precio_admin() to authenticated;
grant execute on function public.aprobar_sugerencia_precio(uuid,numeric) to authenticated;
grant execute on function public.aprobar_sugerencia_precio_externo(uuid,numeric) to authenticated;
grant execute on function public.descartar_sugerencia_precio(text,uuid,numeric,text) to authenticated;
grant execute on function public.configurar_variacion_sugerencias_precio(numeric) to authenticated;
grant execute on function public.obtener_catalogo_proveedores(text,text,integer,integer) to authenticated;

commit;
