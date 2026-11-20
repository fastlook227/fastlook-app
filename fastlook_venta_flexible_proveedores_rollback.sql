-- FAST LOOK · reversión funcional de fastlook_venta_flexible_proveedores.sql.
-- Antes: publicar el frontend con NEXT_PUBLIC_VENTA_FLEXIBLE desactivado (ver docs/catalogo-proveedores.md).
-- Qué hace:
--   * procesar_devolucion y procesar_devolucion_mixta: restaura exactamente las definiciones respaldadas.
--   * procesar_venta y procesar_venta_mixta: restaura el original bajo un nombre interno y deja en la
--     firma pública una guardia que lo invoca sin cambios, pero rechaza el formato nuevo
--     (artículos externos o precio manual) para que una pestaña desactualizada no cobre un importe distinto.
--   * Conserva tablas, líneas externas, devoluciones externas, historial de precios y sus políticas de
--     lectura: PDF, reimpresión, Movimientos y Corte de caja de tickets ya cobrados siguen funcionando.
--   * Retira la ejecución de los RPC de aprendizaje de precios (aprobar, aprobar externo, descartar, consultar).
--   * obtener_catalogo_proveedores conserva su versión con precio_venta: sólo lectura y compatible.
-- No borra ni modifica filas. Es repetible.
-- ATENCIÓN (contrato de producción): el procesar_venta original rechaza con STOCK_INVALIDO cualquier producto con
-- stock < 0. Tras revertir, esos productos no se venden hasta recibir mercancía (recibir_mercancia_producto).
-- Antes de revertir, consulta:  select id, codigo, nombre, stock from public.productos where stock < 0;
begin;

do $$
declare v_def text; v_nueva text;
begin
  if (select count(*) from public.fastlook_migracion_respaldos where migracion = 'venta_flexible_proveedores_v1' and objeto in (
        'procesar_venta(uuid,text,jsonb)', 'procesar_venta_mixta(uuid,text,jsonb,jsonb)',
        'procesar_devolucion(uuid,text,jsonb,text)', 'procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text)')) <> 4 then
    raise exception 'RESPALDO_INCOMPLETO: se esperaban 4 definiciones originales';
  end if;

  for v_def in
    select definicion from public.fastlook_migracion_respaldos
    where migracion = 'venta_flexible_proveedores_v1' and objeto in ('procesar_devolucion(uuid,text,jsonb,text)', 'procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text)')
  loop
    execute v_def;
  end loop;

  -- pg_get_functiondef siempre emite "CREATE OR REPLACE FUNCTION public.<nombre>(": se renombra sólo esa primera aparición.
  select definicion into v_def from public.fastlook_migracion_respaldos where migracion = 'venta_flexible_proveedores_v1' and objeto = 'procesar_venta(uuid,text,jsonb)';
  v_nueva := regexp_replace(v_def, 'FUNCTION public\.procesar_venta\(', 'FUNCTION public._procesar_venta_original_v0(');
  if v_nueva = v_def then raise exception 'DEFINICION_INESPERADA: procesar_venta'; end if;
  execute v_nueva;

  select definicion into v_def from public.fastlook_migracion_respaldos where migracion = 'venta_flexible_proveedores_v1' and objeto = 'procesar_venta_mixta(uuid,text,jsonb,jsonb)';
  v_nueva := regexp_replace(v_def, 'FUNCTION public\.procesar_venta_mixta\(', 'FUNCTION public._procesar_venta_mixta_original_v0(');
  if v_nueva = v_def then raise exception 'DEFINICION_INESPERADA: procesar_venta_mixta'; end if;
  execute v_nueva;
end $$;

create or replace function public._rechazar_venta_formato_nuevo(p_lineas jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_lineas) = 'array' and exists (
    select 1 from jsonb_array_elements(p_lineas) x
    where jsonb_typeof(x) = 'object' and x ?| array['catalogo_producto_id','precio_unitario','motivo_precio','nota_precio','descuento_conjunto']
  ) then
    raise exception using errcode = 'P0001', message = 'VERSION_INCOMPATIBLE: Esta versión no admite artículos externos ni precios manuales. Recarga la aplicación.';
  end if;
end $$;

create or replace function public.procesar_venta(p_idempotency_key uuid, p_metodo_pago text, p_lineas jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform public._rechazar_venta_formato_nuevo(p_lineas);
  return public._procesar_venta_original_v0(p_idempotency_key, p_metodo_pago, p_lineas);
end $$;

create or replace function public.procesar_venta_mixta(p_idempotency_key uuid, p_metodo_pago text, p_lineas_normales jsonb, p_lineas_personalizadas jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform public._rechazar_venta_formato_nuevo(p_lineas_normales);
  return public._procesar_venta_mixta_original_v0(p_idempotency_key, p_metodo_pago, p_lineas_normales, p_lineas_personalizadas);
end $$;

-- La guardia es SECURITY INVOKER: el original corre con los mismos privilegios que antes de la migración.
revoke all on function public._procesar_venta_original_v0(uuid,text,jsonb) from public, anon;
revoke all on function public._procesar_venta_mixta_original_v0(uuid,text,jsonb,jsonb) from public, anon;
revoke all on function public._rechazar_venta_formato_nuevo(jsonb) from public, anon;
grant execute on function public._procesar_venta_original_v0(uuid,text,jsonb) to authenticated;
grant execute on function public._procesar_venta_mixta_original_v0(uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public._rechazar_venta_formato_nuevo(jsonb) to authenticated;
revoke all on function public.procesar_venta(uuid,text,jsonb) from public, anon;
revoke all on function public.procesar_venta_mixta(uuid,text,jsonb,jsonb) from public, anon;
revoke all on function public.procesar_devolucion(uuid,text,jsonb,text) from public, anon;
revoke all on function public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.procesar_venta(uuid,text,jsonb) to authenticated;
grant execute on function public.procesar_venta_mixta(uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public.procesar_devolucion(uuid,text,jsonb,text) to authenticated;
grant execute on function public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text) to authenticated;

revoke all on function public._procesar_venta_flexible(uuid,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.obtener_sugerencias_precio_admin() from public, anon, authenticated;
revoke all on function public.aprobar_sugerencia_precio(uuid,numeric) from public, anon, authenticated;
revoke all on function public.aprobar_sugerencia_precio_externo(uuid,numeric) from public, anon, authenticated;
revoke all on function public.descartar_sugerencia_precio(text,uuid,numeric,text) from public, anon, authenticated;
revoke all on function public.configurar_variacion_sugerencias_precio(numeric) from public, anon, authenticated;

commit;
