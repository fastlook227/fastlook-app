-- FAST LOOK · Estado de tickets de venta
-- Requisito de fastlook_venta_rapida_voz.sql. Aplicar ANTES que ésa. Ejecución manual.
-- PostgreSQL 11+: agregar una columna con default constante no reescribe la tabla; los tickets
-- existentes leen 'Cobrado' sin modificarse. No borra ni actualiza filas.
-- Sin política de UPDATE en ventas_tickets: sólo funciones SECURITY DEFINER cambian el estado.
begin;

alter table public.ventas_tickets add column if not exists estado text not null default 'Cobrado';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_tickets_estado_chk' and conrelid = 'public.ventas_tickets'::regclass) then
    -- NOT VALID evita revalidar en el ALTER; la validación de abajo recorre la tabla sin bloquear ventas nuevas.
    alter table public.ventas_tickets add constraint ventas_tickets_estado_chk check (estado in ('Cobrado', 'Cancelado')) not valid;
  end if;
end $$;

alter table public.ventas_tickets validate constraint ventas_tickets_estado_chk;

commit;
