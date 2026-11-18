-- FAST LOOK · RPC administrativos para inventario general.
-- Dependencias: esquema base y fastlook_preferencia_imagen_principal.sql.
-- Aplicar manualmente en Supabase SQL Editor; la aplicación nunca ejecuta esta migración.
begin;

create table if not exists public.productos_creaciones_idempotentes (
  solicitud_id uuid primary key,
  producto_id uuid not null unique references public.productos(id) on delete restrict,
  creado_por uuid not null references public.usuarios(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.productos_creaciones_idempotentes enable row level security;
revoke all on table public.productos_creaciones_idempotentes from anon, authenticated;

create or replace function public.crear_producto_admin(
  p_solicitud_id uuid, p_codigo text, p_nombre text, p_tipo text, p_precio numeric,
  p_costo numeric, p_stock integer, p_stock_minimo integer, p_ubicacion text,
  p_proveedor text, p_imagen_url text, p_imagen_thumbnail_url text, p_usar_imagen_principal boolean
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_producto public.productos%rowtype; v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if not exists (select 1 from public.usuarios u where u.id = v_actor and u.activo = true and u.rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo un administrador activo puede crear productos.';
  end if;
  if p_solicitud_id is null then raise exception using errcode = '22023', message = 'DATOS_INVALIDOS: La clave de operación es obligatoria.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_solicitud_id::text));
  select p.* into v_producto from public.productos_creaciones_idempotentes i join public.productos p on p.id = i.producto_id where i.solicitud_id = p_solicitud_id;
  if found then return to_jsonb(v_producto) || jsonb_build_object('idempotente', true); end if;
  if v_codigo = '' or length(v_codigo) > 80 or length(btrim(coalesce(p_nombre, ''))) = 0 or length(btrim(p_nombre)) > 200
    or length(btrim(coalesce(p_tipo, ''))) = 0 or length(btrim(p_tipo)) > 100
    or length(btrim(coalesce(p_ubicacion, ''))) > 100 or length(btrim(coalesce(p_proveedor, ''))) > 200
    or length(btrim(coalesce(p_imagen_url, ''))) > 2000 or length(btrim(coalesce(p_imagen_thumbnail_url, ''))) > 2000
    or p_precio is null or p_costo is null or p_stock is null or p_stock_minimo is null
    or p_precio < 0 or p_costo < 0 or p_stock < 0 or p_stock_minimo < 0
  then raise exception using errcode = '22023', message = 'DATOS_INVALIDOS: Revisa campos obligatorios, precios y existencias.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('producto-codigo:' || v_codigo));
  if exists (select 1 from public.productos p where upper(btrim(coalesce(p.codigo, ''))) = v_codigo) then
    raise exception using errcode = '23505', message = 'CODIGO_DUPLICADO: El código ya pertenece a otro producto.';
  end if;
  insert into public.productos (codigo, nombre, tipo, precio, costo, stock, stock_minimo, ubicacion, proveedor, imagen_url, imagen_thumbnail_url, usar_imagen_principal, archivado)
  values (v_codigo, btrim(p_nombre), btrim(p_tipo), p_precio, p_costo, p_stock, p_stock_minimo, btrim(coalesce(p_ubicacion, '')), btrim(coalesce(p_proveedor, '')), btrim(coalesce(p_imagen_url, '')), nullif(btrim(coalesce(p_imagen_thumbnail_url, '')), ''), coalesce(p_usar_imagen_principal, false), false)
  returning * into v_producto;
  insert into public.productos_creaciones_idempotentes (solicitud_id, producto_id, creado_por) values (p_solicitud_id, v_producto.id, v_actor);
  return to_jsonb(v_producto) || jsonb_build_object('idempotente', false);
end; $$;

create or replace function public.actualizar_producto_admin(
  p_producto_id uuid, p_codigo text, p_nombre text, p_tipo text, p_precio numeric,
  p_costo numeric, p_stock integer, p_stock_minimo integer, p_ubicacion text,
  p_proveedor text, p_imagen_url text, p_imagen_thumbnail_url text, p_usar_imagen_principal boolean
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_producto public.productos%rowtype; v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if not exists (select 1 from public.usuarios u where u.id = v_actor and u.activo = true and u.rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo un administrador activo puede editar productos.';
  end if;
  if p_producto_id is null or v_codigo = '' or length(v_codigo) > 80
    or length(btrim(coalesce(p_nombre, ''))) = 0 or length(btrim(p_nombre)) > 200
    or length(btrim(coalesce(p_tipo, ''))) = 0 or length(btrim(p_tipo)) > 100
    or length(btrim(coalesce(p_ubicacion, ''))) > 100 or length(btrim(coalesce(p_proveedor, ''))) > 200
    or length(btrim(coalesce(p_imagen_url, ''))) > 2000 or length(btrim(coalesce(p_imagen_thumbnail_url, ''))) > 2000
    or p_precio is null or p_costo is null or p_stock is null or p_stock_minimo is null
    or p_precio < 0 or p_costo < 0 or p_stock < 0 or p_stock_minimo < 0
  then raise exception using errcode = '22023', message = 'DATOS_INVALIDOS: Revisa campos obligatorios, precios y existencias.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_producto_id::text));
  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCTO_INEXISTENTE: El producto no existe.'; end if;
  if coalesce(v_producto.archivado, false) then raise exception using errcode = '22023', message = 'PRODUCTO_ARCHIVADO: Un producto archivado no puede editarse.'; end if;
  if exists (select 1 from public.productos p where p.id <> p_producto_id and upper(btrim(coalesce(p.codigo, ''))) = v_codigo) then
    raise exception using errcode = '23505', message = 'CODIGO_DUPLICADO: El código ya pertenece a otro producto.';
  end if;
  update public.productos set codigo = v_codigo, nombre = btrim(p_nombre), tipo = btrim(p_tipo), precio = p_precio,
    costo = p_costo, stock = p_stock, stock_minimo = p_stock_minimo, ubicacion = btrim(coalesce(p_ubicacion, '')),
    proveedor = btrim(coalesce(p_proveedor, '')), imagen_url = btrim(coalesce(p_imagen_url, '')),
    imagen_thumbnail_url = nullif(btrim(coalesce(p_imagen_thumbnail_url, '')), ''), usar_imagen_principal = coalesce(p_usar_imagen_principal, false)
  where id = p_producto_id returning * into v_producto;
  return to_jsonb(v_producto);
end; $$;

revoke all on function public.crear_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) from public, anon;
revoke all on function public.actualizar_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) from public, anon;
grant execute on function public.crear_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) to authenticated;
grant execute on function public.actualizar_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) to authenticated;
commit;
