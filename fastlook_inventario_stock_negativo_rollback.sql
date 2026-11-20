-- FAST LOOK · reversión de fastlook_inventario_stock_negativo.sql.
-- Restaura exactamente actualizar_producto_admin y cambiar_stock_producto respaldados y retira la ejecución de
-- recibir_mercancia_producto. Conserva inventario_recepciones y todos los movimientos. No modifica stock.
-- ATENCIÓN: el cambiar_stock_producto original rechaza productos con saldo negativo (STOCK_INVALIDO).
-- Antes de revertir, consulta:  select id, codigo, nombre, stock from public.productos where stock < 0;
begin;
do $$
declare v_def text;
begin
  if (select count(*) from public.fastlook_migracion_respaldos where migracion = 'inventario_stock_negativo_v1') <> 2 then
    raise exception 'RESPALDO_INCOMPLETO: se esperaban 2 definiciones originales';
  end if;
  for v_def in select definicion from public.fastlook_migracion_respaldos where migracion = 'inventario_stock_negativo_v1' loop
    execute v_def;
  end loop;
end $$;
revoke all on function public.actualizar_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) from public, anon;
grant execute on function public.actualizar_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) to authenticated;
revoke all on function public.cambiar_stock_producto(uuid, integer, integer, text) from public, anon;
grant execute on function public.cambiar_stock_producto(uuid, integer, integer, text) to authenticated;
revoke all on function public.recibir_mercancia_producto(uuid, uuid, integer, text) from public, anon, authenticated;
commit;
