-- FAST LOOK · actualización administrativa de cascos sin abrir escritura directa.
-- Ejecutar manualmente después de fastlook_fase_imagenes_optimizadas.sql.
begin;

create or replace function public.actualizar_casco_admin(
  p_producto_id uuid, p_codigo text, p_nombre text, p_precio numeric, p_costo numeric,
  p_stock integer, p_stock_minimo integer, p_talla text, p_certificacion text,
  p_ubicacion text, p_proveedor text, p_imagen_url text, p_imagen_thumbnail_url text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_producto public.productos%rowtype;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if not exists (select 1 from public.usuarios u where u.id = v_actor and u.activo = true and u.rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo un administrador activo puede actualizar cascos.';
  end if;
  if v_codigo = '' or length(btrim(coalesce(p_nombre, ''))) = 0 then raise exception using errcode = '22023', message = 'DATOS_INVALIDOS: Código y nombre son obligatorios.'; end if;
  if p_precio < 0 or p_costo < 0 or p_stock < 0 or p_stock_minimo < 0 then raise exception using errcode = '22023', message = 'DATOS_INVALIDOS: Precios y existencias no pueden ser negativos.'; end if;
  if p_certificacion not in ('DOT', 'ECE', 'DOT + ECE', 'Sin especificar') then raise exception using errcode = '22023', message = 'DATOS_INVALIDOS: Certificación inválida.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_producto_id::text));
  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found or upper(btrim(coalesce(v_producto.tipo, ''))) <> 'CASCOS' then raise exception using errcode = 'P0002', message = 'CASCO_INEXISTENTE: El casco no existe.'; end if;
  if coalesce(v_producto.archivado, false) then raise exception using errcode = 'P0001', message = 'CASCO_ARCHIVADO: El casco está archivado.'; end if;
  if exists (select 1 from public.productos p where p.id <> p_producto_id and upper(btrim(p.codigo)) = v_codigo) then raise exception using errcode = '23505', message = 'CODIGO_DUPLICADO: El código ya pertenece a otro producto.'; end if;

  update public.productos set
    codigo = v_codigo, nombre = btrim(p_nombre), precio = p_precio, costo = p_costo,
    stock = p_stock, stock_minimo = p_stock_minimo, talla = btrim(p_talla),
    certificacion = p_certificacion, ubicacion = btrim(coalesce(p_ubicacion, '')),
    proveedor = btrim(coalesce(p_proveedor, '')), imagen_url = btrim(coalesce(p_imagen_url, '')),
    imagen_thumbnail_url = nullif(btrim(coalesce(p_imagen_thumbnail_url, '')), '')
  where id = p_producto_id returning * into v_producto;
  return to_jsonb(v_producto);
end;
$$;

revoke all on function public.actualizar_casco_admin(uuid, text, text, numeric, numeric, integer, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.actualizar_casco_admin(uuid, text, text, numeric, numeric, integer, integer, text, text, text, text, text, text) to authenticated;
commit;
