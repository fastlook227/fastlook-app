-- FAST LOOK · Corte de caja integral
-- Migración para revisión y ejecución manual. Codex NO la ejecutó en producción.
begin;

-- La API usa upsert para que dos sesiones no creen dos resúmenes del mismo día.
-- Antes de crear el índice, la consulta aborta si ya existen duplicados: no borra historia.
do $$
begin
  if exists (
    select 1 from public.cortes_caja
    group by fecha_inicio, fecha_fin
    having count(*) > 1
  ) then
    raise exception 'CORTES_DUPLICADOS: concilia manualmente los periodos repetidos antes de aplicar esta migración.';
  end if;
end $$;

create unique index if not exists cortes_caja_periodo_unico_idx
  on public.cortes_caja (fecha_inicio, fecha_fin);

commit;

-- Auditoría de solo lectura para el 22 de octubre de 2026 (America/Mexico_City).
-- La cabecera es la fuente del dinero cobrado; las otras tablas son líneas.
-- select t.ticket_id, t.folio, t.created_at, t.metodo_pago, t.total as total_cobrado,
--        coalesce(n.total_inventario, 0) as inventario,
--        coalesce(p.total_personalizado, 0) as personalizados,
--        t.total - coalesce(n.total_inventario, 0) - coalesce(p.total_personalizado, 0) as ajuste
-- from public.ventas_tickets t
-- left join (select ticket_id, sum(total) total_inventario from public.ventas group by ticket_id) n using (ticket_id)
-- left join (select ticket_id, sum(total) total_personalizado from public.ventas_personalizadas group by ticket_id) p using (ticket_id)
-- where t.created_at >= timestamptz '2026-10-22 00:00:00 America/Mexico_City'
--   and t.created_at <  timestamptz '2026-10-23 00:00:00 America/Mexico_City'
-- order by t.created_at;
