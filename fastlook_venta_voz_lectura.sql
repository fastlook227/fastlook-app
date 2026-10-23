-- FAST LOOK · Venta por voz: lectura de ticket_id para mostrar "Venta rápida por voz" en Movimientos y Ticket PDF.
-- Opcional; aplicar después de fastlook_venta_voz_fix_inmutables.sql. Ejecución manual.
-- Sólo concede SELECT de la columna ticket_id al personal activo (el mismo que ya ve ventas_tickets).
-- No expone importe, usuario ni resultado, y no concede INSERT/UPDATE/DELETE. No modifica datos.
-- Corte de caja no la necesita: lee la tabla desde el servidor.
begin;

do $$
begin
  if to_regprocedure('public.es_personal_fastlook_activo()') is null then
    raise exception 'VENTA_VOZ_DEPENDENCIAS: falta es_personal_fastlook_activo().';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas_voz_operaciones' and policyname = 'ventas_voz_operaciones_select_personal_activo') then
    create policy ventas_voz_operaciones_select_personal_activo on public.ventas_voz_operaciones
      for select to authenticated using (public.es_personal_fastlook_activo());
  end if;
end $$;

grant select (ticket_id) on public.ventas_voz_operaciones to authenticated;

commit;
