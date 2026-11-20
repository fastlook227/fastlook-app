-- FAST LOOK · endurecimiento de permisos, fase A.
-- Hallazgo (diagnóstico de producción 2026-11-19): productos, ventas y movimientos_inventario tienen RLS
-- desactivada y anon (la llave pública del frontend) tiene INSERT/UPDATE/DELETE/TRUNCATE: cualquiera podía
-- cambiar precios, stock o borrar ventas por la API REST.
-- Qué hace (sin borrar ni modificar filas):
--   1. Respalda RLS y privilegios previos de cada tabla de public (para el rollback).
--   2. anon pierde INSERT/UPDATE/DELETE/TRUNCATE en todas las tablas de public (y en las futuras);
--      authenticated pierde TRUNCATE en todas.
--   3. productos, ventas y movimientos_inventario: RLS activa, lectura sólo para personal activo y escritura
--      directa sólo donde la aplicación aún la necesita (abonos y eliminación de cascos sin historial).
--   4. Las escrituras de stock/ubicación/archivado de Cascos y del Asistente pasan a operar_producto_admin
--      (transaccional, con movimiento auditable en la misma transacción).
-- Los RPC SECURITY DEFINER (ventas, devoluciones, recepciones, ajustes) siguen funcionando porque su dueño es el
-- dueño de las tablas (o tiene BYPASSRLS); la sección 0 lo verifica y aborta si no es así.
-- Independiente de la venta flexible; aplicar ANTES de fastlook_venta_flexible_proveedores.sql.
-- Reversión: fastlook_seguridad_tablas_operativas_rollback.sql.
begin;

-- 0. PREFLIGHT
do $$
declare v_detalle text;
begin
  if to_regclass('public.productos') is null or to_regclass('public.ventas') is null or to_regclass('public.movimientos_inventario') is null
     or to_regclass('public.usuarios') is null then
    raise exception 'DEPENDENCIA: faltan productos, ventas, movimientos_inventario o usuarios';
  end if;
  -- Toda función SECURITY DEFINER de public que use estas tablas debe poder omitir RLS: ser dueña o tener BYPASSRLS.
  select string_agg(distinct p.oid::regprocedure::text || ' (dueño ' || pg_get_userbyid(p.proowner) || ')', ', ') into v_detalle
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  join pg_class c on c.oid in ('public.productos'::regclass, 'public.ventas'::regclass, 'public.movimientos_inventario'::regclass)
  join pg_roles r on r.oid = p.proowner
  where p.prosecdef and p.prosrc ~ ('\m' || c.relname || '\M') and p.proowner <> c.relowner and not r.rolbypassrls and not r.rolsuper;
  if v_detalle is not null then raise exception 'DUENO_INCOMPATIBLE: estas funciones no podrían omitir RLS: %', v_detalle; end if;
  if exists (select 1 from pg_class where oid in ('public.productos'::regclass, 'public.ventas'::regclass, 'public.movimientos_inventario'::regclass) and relforcerowsecurity) then
    raise exception 'RLS_FORZADA: una tabla tiene FORCE ROW LEVEL SECURITY; revisar antes de continuar';
  end if;
end $$;

-- 1. RESPALDO del estado previo (on conflict do nothing: la reaplicación conserva el primer respaldo).
create table if not exists public.fastlook_seguridad_respaldo (
  migracion text not null, objeto text not null, rls_activa boolean, privilegios jsonb not null,
  created_at timestamptz not null default now(), primary key (migracion, objeto)
);
alter table public.fastlook_seguridad_respaldo enable row level security;
revoke all on table public.fastlook_seguridad_respaldo from public, anon, authenticated;

insert into public.fastlook_seguridad_respaldo (migracion, objeto, rls_activa, privilegios)
select 'seguridad_fase_a_v1', format('%I.%I', n.nspname, c.relname), c.relrowsecurity,
       jsonb_build_object(
         'anon', to_jsonb(array(select x from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) x where has_table_privilege('anon', c.oid, x))),
         'authenticated', to_jsonb(array(select x from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) x where has_table_privilege('authenticated', c.oid, x))))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
on conflict (migracion, objeto) do nothing;

insert into public.fastlook_seguridad_respaldo (migracion, objeto, rls_activa, privilegios)
select 'seguridad_fase_a_v1', '__default_acl_postgres__', null,
       jsonb_build_object('anon', coalesce(jsonb_agg(distinct a.privilege_type), '[]'::jsonb))
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'
cross join lateral aclexplode(d.defaclacl) a
where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'r' and a.grantee = 'anon'::regrole
  and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
on conflict (migracion, objeto) do nothing;

-- 2. NINGUNA ESCRITURA ANÓNIMA; TRUNCATE (que no respeta RLS) para nadie de la API.
do $$
declare v_tabla regclass;
begin
  for v_tabla in select c.oid::regclass from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
  loop
    execute format('revoke insert, update, delete, truncate on table %s from anon', v_tabla);
    execute format('revoke truncate on table %s from authenticated', v_tabla);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate on tables from anon;

-- 3. TABLAS OPERATIVAS
revoke all on table public.productos, public.ventas, public.movimientos_inventario from anon;
-- productos: sin INSERT/UPDATE directo (hoy authenticated ya no los tenía); DELETE sólo Admin activo (cascos sin historial).
revoke insert, update on table public.productos from authenticated;
grant select, delete on table public.productos to authenticated;
-- ventas: el historial es inmutable para la API; INSERT sólo para abonos (Clientes), restringido por política.
revoke update, delete on table public.ventas from authenticated;
grant select, insert on table public.ventas to authenticated;
-- movimientos_inventario: historial auditable; sólo lectura. Las escrituras van por RPC.
revoke insert, update, delete on table public.movimientos_inventario from authenticated;
grant select on table public.movimientos_inventario to authenticated;

alter table public.productos enable row level security;
alter table public.ventas enable row level security;
alter table public.movimientos_inventario enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'productos' and policyname = 'productos_select_personal_activo') then
    create policy productos_select_personal_activo on public.productos for select to authenticated
      using (exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.activo = true and u.rol in ('Admin','Vendedor')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'productos' and policyname = 'productos_delete_admin_activo') then
    create policy productos_delete_admin_activo on public.productos for delete to authenticated
      using (exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.activo = true and u.rol = 'Admin'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas' and policyname = 'ventas_select_personal_activo') then
    create policy ventas_select_personal_activo on public.ventas for select to authenticated
      using (exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.activo = true and u.rol in ('Admin','Vendedor')));
  end if;
  -- shortcut: abonos siguen escribiéndose desde el navegador (3 escrituras no atómicas); fase B: RPC registrar_movimiento_cliente.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas' and policyname = 'ventas_insert_abono_personal_activo') then
    create policy ventas_insert_abono_personal_activo on public.ventas for insert to authenticated
      with check (codigo = 'ABONO' and producto_id is null and ticket_id is null and folio is null and metodo_pago = 'Abono'
                  and cantidad = 1 and precio > 0 and total = precio and costo_unitario is null
                  and exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.activo = true and u.rol in ('Admin','Vendedor')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'movimientos_inventario' and policyname = 'movimientos_select_personal_activo') then
    create policy movimientos_select_personal_activo on public.movimientos_inventario for select to authenticated
      using (exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.activo = true and u.rol in ('Admin','Vendedor')));
  end if;
end $$;

-- Devoluciones ya tienen RLS sin políticas de escritura; se retiran también los privilegios (defensa en profundidad).
do $$
begin
  if to_regclass('public.devoluciones') is not null then revoke insert, update, delete on table public.devoluciones from authenticated; end if;
  if to_regclass('public.devoluciones_detalle') is not null then revoke insert, update, delete on table public.devoluciones_detalle from authenticated; end if;
end $$;

-- 4. OPERACIONES ADMINISTRATIVAS DE PRODUCTO (Cascos y Asistente). Bloqueo de fila + movimiento en la misma transacción.
create table if not exists public.productos_operaciones_admin (
  idempotency_key uuid primary key, producto_id uuid not null references public.productos(id), operacion text not null,
  resultado jsonb not null, usuario_id uuid not null references public.usuarios(id), created_at timestamptz not null default now()
);
alter table public.productos_operaciones_admin enable row level security;
revoke all on table public.productos_operaciones_admin from public, anon, authenticated;

create or replace function public.operar_producto_admin(
  p_idempotency_key uuid, p_producto_id uuid, p_operacion text, p_cantidad integer default null, p_ubicacion text default null,
  p_origen text default 'CASCOS', p_nota text default null, p_accion_asistente_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_p record; v_existente public.productos_operaciones_admin%rowtype;
  v_tipo text; v_stock_nuevo integer; v_ubicacion text := nullif(btrim(p_ubicacion), ''); v_resultado jsonb;
begin
  if v_actor is null then raise exception using errcode = 'P0001', message = 'SIN_SESION: Debes iniciar sesión.'; end if;
  if not exists (select 1 from public.usuarios u where u.id = v_actor and u.activo = true and u.rol = 'Admin') then
    raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: Sólo un administrador activo puede modificar productos.';
  end if;
  if p_idempotency_key is null or p_producto_id is null then raise exception using errcode = 'P0001', message = 'DATOS_INVALIDOS: Falta la operación o el producto.'; end if;
  if p_operacion is null or p_operacion not in ('SUMAR_STOCK','RESTAR_STOCK','CAMBIAR_UBICACION','ARCHIVAR') then
    raise exception using errcode = 'P0001', message = 'OPERACION_INVALIDA: Operación no permitida.';
  end if;
  if p_origen is null or p_origen not in ('CASCOS','ASISTENTE') then raise exception using errcode = 'P0001', message = 'ORIGEN_INVALIDO: Origen no permitido.'; end if;
  if p_operacion in ('SUMAR_STOCK','RESTAR_STOCK') and (p_cantidad is null or p_cantidad not between 1 and 10000) then
    raise exception using errcode = 'P0001', message = 'CANTIDAD_INVALIDA: La cantidad debe ser un entero entre 1 y 10000.';
  end if;
  if p_operacion = 'CAMBIAR_UBICACION' and (v_ubicacion is null or length(v_ubicacion) > 100) then
    raise exception using errcode = 'P0001', message = 'UBICACION_INVALIDA: La nueva ubicación no es válida.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('producto-admin:' || p_idempotency_key::text, 0));
  select * into v_existente from public.productos_operaciones_admin where idempotency_key = p_idempotency_key;
  if found then
    if v_existente.producto_id <> p_producto_id or v_existente.operacion <> p_operacion then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCIA_CONFLICTO: La operación ya se registró con otros datos.';
    end if;
    return v_existente.resultado || jsonb_build_object('idempotente', true);
  end if;

  select p.id, p.codigo, p.nombre, p.stock, p.ubicacion, p.archivado into v_p from public.productos p where p.id = p_producto_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'PRODUCTO_INEXISTENTE: El producto no existe.'; end if;
  if coalesce(v_p.archivado, false) then raise exception using errcode = 'P0001', message = 'PRODUCTO_ARCHIVADO: El producto está archivado.'; end if;
  if v_p.stock is null and p_operacion in ('SUMAR_STOCK','RESTAR_STOCK') then raise exception using errcode = 'P0001', message = 'STOCK_INVALIDO: El producto no tiene existencia válida.'; end if;
  -- Igual que el Asistente: no se resta más de lo disponible (las ventas sí pueden dejar saldo negativo).
  if p_operacion = 'RESTAR_STOCK' and p_cantidad > v_p.stock then
    raise exception using errcode = 'P0001', message = format('STOCK_INSUFICIENTE: El producto tiene %s piezas disponibles.', v_p.stock);
  end if;

  if p_operacion = 'SUMAR_STOCK' then
    update public.productos set stock = stock + p_cantidad where id = p_producto_id returning stock into v_stock_nuevo; v_tipo := 'ENTRADA_STOCK';
  elsif p_operacion = 'RESTAR_STOCK' then
    update public.productos set stock = stock - p_cantidad where id = p_producto_id returning stock into v_stock_nuevo; v_tipo := 'SALIDA_STOCK';
  elsif p_operacion = 'CAMBIAR_UBICACION' then
    update public.productos set ubicacion = v_ubicacion where id = p_producto_id; v_stock_nuevo := v_p.stock; v_tipo := 'CAMBIO_UBICACION';
  else
    update public.productos set archivado = true where id = p_producto_id; v_stock_nuevo := v_p.stock; v_tipo := 'ARCHIVADO';
  end if;

  insert into public.movimientos_inventario (producto_id, codigo, nombre, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, nota,
    valor_anterior, valor_nuevo, origen, usuario_rol, accion_asistente_id)
  values (p_producto_id, coalesce(v_p.codigo, ''), coalesce(v_p.nombre, ''), v_tipo, case when p_operacion in ('SUMAR_STOCK','RESTAR_STOCK') then p_cantidad else 0 end,
    v_p.stock, v_stock_nuevo, coalesce(nullif(btrim(p_nota), ''), v_tipo || ' ejecutado por ' || p_origen),
    case when p_operacion = 'CAMBIAR_UBICACION' then to_jsonb(v_p.ubicacion) else to_jsonb(v_p.stock) end,
    case when p_operacion = 'CAMBIAR_UBICACION' then to_jsonb(v_ubicacion) else to_jsonb(v_stock_nuevo) end,
    p_origen, 'Admin', p_accion_asistente_id);

  v_resultado := jsonb_build_object('ok', true, 'idempotente', false, 'producto_id', p_producto_id, 'operacion', p_operacion,
    'stock_anterior', v_p.stock, 'stock_nuevo', v_stock_nuevo, 'ubicacion_anterior', v_p.ubicacion,
    'ubicacion_nueva', case when p_operacion = 'CAMBIAR_UBICACION' then v_ubicacion else v_p.ubicacion end);
  insert into public.productos_operaciones_admin (idempotency_key, producto_id, operacion, resultado, usuario_id)
  values (p_idempotency_key, p_producto_id, p_operacion, v_resultado, v_actor);
  return v_resultado;
end $$;

revoke all on function public.operar_producto_admin(uuid,uuid,text,integer,text,text,text,uuid) from public, anon;
grant execute on function public.operar_producto_admin(uuid,uuid,text,integer,text,text,text,uuid) to authenticated;

commit;
