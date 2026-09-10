-- FAST LOOK · POS-A escritorio
-- Migración para revisión manual. NO ha sido ejecutada por Codex.
begin;

alter table public.ventas_tickets add column if not exists efectivo_recibido numeric(12,2);
alter table public.ventas_tickets add column if not exists cambio numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'ventas_tickets_efectivo_consistente_chk'
      and conrelid = 'public.ventas_tickets'::regclass
  ) then
    alter table public.ventas_tickets
      add constraint ventas_tickets_efectivo_consistente_chk check (
        (efectivo_recibido is null and cambio is null)
        or (efectivo_recibido is not null and cambio is not null and efectivo_recibido >= 0 and cambio >= 0)
      );
  end if;
end $$;

create or replace function public.procesar_venta_pos(
  p_idempotency_key uuid,
  p_metodo_pago text,
  p_lineas jsonb,
  p_efectivo_recibido numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_ticket uuid;
  v_total numeric(12,2);
  v_efectivo numeric(12,2);
  v_cambio numeric(12,2);
  v_efectivo_actual numeric(12,2);
  v_cambio_actual numeric(12,2);
begin
  if p_metodo_pago is distinct from 'Efectivo' then
    raise exception using errcode = 'P0001', message = 'METODO_POS_INVALIDO: El RPC POS sólo acepta Efectivo.';
  end if;
  if p_efectivo_recibido is null then
    raise exception using errcode = 'P0001', message = 'EFECTIVO_REQUERIDO: Debes indicar el efectivo recibido.';
  end if;
  if p_efectivo_recibido < 0 then
    raise exception using errcode = 'P0001', message = 'EFECTIVO_INVALIDO: El efectivo recibido no puede ser negativo.';
  end if;
  if p_efectivo_recibido <> round(p_efectivo_recibido, 2) then
    raise exception using errcode = 'P0001', message = 'EFECTIVO_PRECISION_INVALIDA: El importe admite como máximo dos decimales.';
  end if;
  v_efectivo := round(p_efectivo_recibido, 2);

  v_resultado := public.procesar_venta(p_idempotency_key, p_metodo_pago, p_lineas);
  if v_resultado is null or pg_catalog.jsonb_typeof(v_resultado) <> 'object' or v_resultado->>'ok' is distinct from 'true' then
    raise exception using errcode = 'P0001', message = 'RESPUESTA_VENTA_INVALIDA: El RPC original no confirmó la venta.';
  end if;
  if nullif(btrim(v_resultado->>'ticket_id'), '') is null or (v_resultado->>'ticket_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'RESPUESTA_TICKET_INVALIDA: Falta un ticket_id UUID válido.';
  end if;
  if nullif(btrim(v_resultado->>'folio'), '') is null then
    raise exception using errcode = 'P0001', message = 'RESPUESTA_FOLIO_INVALIDA: Falta el folio.';
  end if;
  if nullif(btrim(v_resultado->>'total'), '') is null or (v_resultado->>'total') !~ '^[0-9]+([.][0-9]+)?$' then
    raise exception using errcode = 'P0001', message = 'RESPUESTA_TOTAL_INVALIDA: Falta un total numérico válido.';
  end if;
  if v_resultado ? 'metodo_pago' and v_resultado->>'metodo_pago' is distinct from 'Efectivo' then
    raise exception using errcode = 'P0001', message = 'RESPUESTA_METODO_INVALIDA: El RPC original devolvió otro método.';
  end if;

  v_ticket := (v_resultado->>'ticket_id')::uuid;
  v_total := round((v_resultado->>'total')::numeric, 2);
  if v_total < 0 then raise exception using errcode = 'P0001', message = 'RESPUESTA_TOTAL_INVALIDA: El total no puede ser negativo.'; end if;
  if v_efectivo < v_total then raise exception using errcode = 'P0001', message = 'EFECTIVO_INSUFICIENTE: El efectivo recibido es menor al total del servidor.'; end if;
  v_cambio := round(v_efectivo - v_total, 2);

  select efectivo_recibido, cambio into v_efectivo_actual, v_cambio_actual
  from public.ventas_tickets where ticket_id = v_ticket for update;
  if not found then raise exception using errcode = 'P0001', message = 'TICKET_POS_INEXISTENTE: No se encontró la cabecera del ticket.'; end if;

  if v_efectivo_actual is null and v_cambio_actual is null then
    update public.ventas_tickets set efectivo_recibido = v_efectivo, cambio = v_cambio where ticket_id = v_ticket;
    if not found then raise exception using errcode = 'P0001', message = 'TICKET_POS_INEXISTENTE: No se pudo actualizar la cabecera.'; end if;
  elsif v_efectivo_actual is null or v_cambio_actual is null then
    raise exception using errcode = 'P0001', message = 'DATOS_POS_INCONSISTENTES: La cabecera contiene datos parciales.';
  elsif v_efectivo_actual <> v_efectivo or v_cambio_actual <> v_cambio then
    raise exception using errcode = 'P0001', message = 'EFECTIVO_IDEMPOTENCIA_CONFLICTO: El ticket ya fue confirmado con otro importe.';
  end if;

  return v_resultado || pg_catalog.jsonb_build_object('ok', true, 'idempotente', coalesce((v_resultado->>'idempotente')::boolean, false), 'ticket_id', v_ticket, 'folio', v_resultado->>'folio', 'metodo_pago', 'Efectivo', 'total', v_total, 'efectivo_recibido', v_efectivo, 'cambio', v_cambio);
end;
$$;

create or replace function public.procesar_venta_mixta_pos(
  p_idempotency_key uuid,
  p_metodo_pago text,
  p_lineas_normales jsonb,
  p_lineas_personalizadas jsonb,
  p_efectivo_recibido numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_ticket uuid;
  v_total numeric(12,2);
  v_efectivo numeric(12,2);
  v_cambio numeric(12,2);
  v_efectivo_actual numeric(12,2);
  v_cambio_actual numeric(12,2);
begin
  if p_metodo_pago is distinct from 'Efectivo' then raise exception using errcode = 'P0001', message = 'METODO_POS_INVALIDO: El RPC POS sólo acepta Efectivo.'; end if;
  if p_efectivo_recibido is null then raise exception using errcode = 'P0001', message = 'EFECTIVO_REQUERIDO: Debes indicar el efectivo recibido.'; end if;
  if p_efectivo_recibido < 0 then raise exception using errcode = 'P0001', message = 'EFECTIVO_INVALIDO: El efectivo recibido no puede ser negativo.'; end if;
  if p_efectivo_recibido <> round(p_efectivo_recibido, 2) then raise exception using errcode = 'P0001', message = 'EFECTIVO_PRECISION_INVALIDA: El importe admite como máximo dos decimales.'; end if;
  v_efectivo := round(p_efectivo_recibido, 2);

  v_resultado := public.procesar_venta_mixta(p_idempotency_key, p_metodo_pago, p_lineas_normales, p_lineas_personalizadas);
  if v_resultado is null or pg_catalog.jsonb_typeof(v_resultado) <> 'object' or v_resultado->>'ok' is distinct from 'true' then raise exception using errcode = 'P0001', message = 'RESPUESTA_VENTA_INVALIDA: El RPC original no confirmó la venta.'; end if;
  if nullif(btrim(v_resultado->>'ticket_id'), '') is null or (v_resultado->>'ticket_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception using errcode = 'P0001', message = 'RESPUESTA_TICKET_INVALIDA: Falta un ticket_id UUID válido.'; end if;
  if nullif(btrim(v_resultado->>'folio'), '') is null then raise exception using errcode = 'P0001', message = 'RESPUESTA_FOLIO_INVALIDA: Falta el folio.'; end if;
  if nullif(btrim(v_resultado->>'total'), '') is null or (v_resultado->>'total') !~ '^[0-9]+([.][0-9]+)?$' then raise exception using errcode = 'P0001', message = 'RESPUESTA_TOTAL_INVALIDA: Falta un total numérico válido.'; end if;
  if v_resultado ? 'metodo_pago' and v_resultado->>'metodo_pago' is distinct from 'Efectivo' then raise exception using errcode = 'P0001', message = 'RESPUESTA_METODO_INVALIDA: El RPC original devolvió otro método.'; end if;

  v_ticket := (v_resultado->>'ticket_id')::uuid;
  v_total := round((v_resultado->>'total')::numeric, 2);
  if v_total < 0 then raise exception using errcode = 'P0001', message = 'RESPUESTA_TOTAL_INVALIDA: El total no puede ser negativo.'; end if;
  if v_efectivo < v_total then raise exception using errcode = 'P0001', message = 'EFECTIVO_INSUFICIENTE: El efectivo recibido es menor al total del servidor.'; end if;
  v_cambio := round(v_efectivo - v_total, 2);

  select efectivo_recibido, cambio into v_efectivo_actual, v_cambio_actual
  from public.ventas_tickets where ticket_id = v_ticket for update;
  if not found then raise exception using errcode = 'P0001', message = 'TICKET_POS_INEXISTENTE: No se encontró la cabecera del ticket.'; end if;
  if v_efectivo_actual is null and v_cambio_actual is null then
    update public.ventas_tickets set efectivo_recibido = v_efectivo, cambio = v_cambio where ticket_id = v_ticket;
    if not found then raise exception using errcode = 'P0001', message = 'TICKET_POS_INEXISTENTE: No se pudo actualizar la cabecera.'; end if;
  elsif v_efectivo_actual is null or v_cambio_actual is null then
    raise exception using errcode = 'P0001', message = 'DATOS_POS_INCONSISTENTES: La cabecera contiene datos parciales.';
  elsif v_efectivo_actual <> v_efectivo or v_cambio_actual <> v_cambio then
    raise exception using errcode = 'P0001', message = 'EFECTIVO_IDEMPOTENCIA_CONFLICTO: El ticket ya fue confirmado con otro importe.';
  end if;

  return v_resultado || pg_catalog.jsonb_build_object('ok', true, 'idempotente', coalesce((v_resultado->>'idempotente')::boolean, false), 'ticket_id', v_ticket, 'folio', v_resultado->>'folio', 'metodo_pago', 'Efectivo', 'total', v_total, 'efectivo_recibido', v_efectivo, 'cambio', v_cambio);
end;
$$;

revoke all on function public.procesar_venta_pos(uuid, text, jsonb, numeric) from public, anon;
revoke all on function public.procesar_venta_mixta_pos(uuid, text, jsonb, jsonb, numeric) from public, anon;
grant execute on function public.procesar_venta_pos(uuid, text, jsonb, numeric) to authenticated;
grant execute on function public.procesar_venta_mixta_pos(uuid, text, jsonb, jsonb, numeric) to authenticated;

commit;
