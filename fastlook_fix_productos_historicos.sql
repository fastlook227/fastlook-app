-- FAST LOOK · compatibilidad de actualizar_producto_admin con productos históricos.
-- Dependencia: ejecutar después de fastlook_fix_rls_productos_admin.sql.
-- NULL en un campo opcional conserva el valor almacenado; una cadena vacía sigue permitiendo limpiar texto o fotografías.
begin;

create or replace function public.actualizar_producto_admin(
  p_producto_id uuid, p_codigo text, p_nombre text, p_tipo text, p_precio numeric,
  p_costo numeric, p_stock integer, p_stock_minimo integer, p_ubicacion text,
  p_proveedor text, p_imagen_url text, p_imagen_thumbnail_url text, p_usar_imagen_principal boolean
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_producto public.productos%rowtype;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if not exists (select 1 from public.usuarios u where u.id = v_actor and u.activo = true and u.rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo un administrador activo puede editar productos.';
  end if;
  if p_producto_id is null then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Producto: identificador obligatorio.'; end if;
  if v_codigo = '' then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Código: es obligatorio.'; end if;
  if length(v_codigo) > 80 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Código: máximo 80 caracteres.'; end if;
  if length(btrim(coalesce(p_nombre, ''))) = 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Nombre: es obligatorio.'; end if;
  if length(btrim(p_nombre)) > 200 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Nombre: máximo 200 caracteres.'; end if;
  if length(btrim(coalesce(p_tipo, ''))) = 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Tipo de producto: es obligatorio.'; end if;
  if length(btrim(p_tipo)) > 100 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Tipo de producto: máximo 100 caracteres.'; end if;
  if p_precio is null or p_precio < 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Precio de venta: debe ser mayor o igual a cero.'; end if;
  if p_costo is not null and p_costo < 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Costo: debe ser mayor o igual a cero.'; end if;
  if p_stock is not null and p_stock < 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Existencias: deben ser enteras y mayores o iguales a cero.'; end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Stock mínimo: debe ser entero y mayor o igual a cero.'; end if;
  if length(btrim(coalesce(p_ubicacion, ''))) > 100 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Ubicación: máximo 100 caracteres.'; end if;
  if length(btrim(coalesce(p_proveedor, ''))) > 200 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Proveedor: máximo 200 caracteres.'; end if;
  if length(btrim(coalesce(p_imagen_url, ''))) > 2000 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: URL de imagen: máximo 2000 caracteres.'; end if;
  if length(btrim(coalesce(p_imagen_thumbnail_url, ''))) > 2000 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Miniatura: máximo 2000 caracteres.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_producto_id::text));
  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCTO_INEXISTENTE: El producto no existe.'; end if;
  if coalesce(v_producto.archivado, false) then raise exception using errcode = '22023', message = 'PRODUCTO_ARCHIVADO: Un producto archivado no puede editarse.'; end if;
  if exists (select 1 from public.productos p where p.id <> p_producto_id and upper(btrim(coalesce(p.codigo, ''))) = v_codigo) then
    raise exception using errcode = '23505', message = 'CODIGO_DUPLICADO: El código ya pertenece a otro producto.';
  end if;

  update public.productos set
    codigo = v_codigo, nombre = btrim(p_nombre), tipo = btrim(p_tipo), precio = p_precio,
    costo = coalesce(p_costo, v_producto.costo), stock = coalesce(p_stock, v_producto.stock),
    stock_minimo = coalesce(p_stock_minimo, v_producto.stock_minimo),
    ubicacion = case when p_ubicacion is null then v_producto.ubicacion else btrim(p_ubicacion) end,
    proveedor = case when p_proveedor is null then v_producto.proveedor else btrim(p_proveedor) end,
    imagen_url = case when p_imagen_url is null then v_producto.imagen_url else btrim(p_imagen_url) end,
    imagen_thumbnail_url = case when p_imagen_thumbnail_url is null then v_producto.imagen_thumbnail_url else nullif(btrim(p_imagen_thumbnail_url), '') end,
    usar_imagen_principal = coalesce(p_usar_imagen_principal, v_producto.usar_imagen_principal)
  where id = p_producto_id returning * into v_producto;
  return to_jsonb(v_producto);
end;
$$;

revoke all on function public.actualizar_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) from public, anon;
grant execute on function public.actualizar_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) to authenticated;
commit;
