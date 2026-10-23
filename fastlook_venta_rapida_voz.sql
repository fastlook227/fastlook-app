-- FAST LOOK · Venta rápida por voz
-- Migración transaccional para revisión y ejecución manual. Codex NO la ejecutó.
begin;

do $$
begin
  if to_regclass('public.usuarios') is null or to_regclass('public.ventas_tickets') is null or to_regclass('public.ventas_personalizadas') is null then
    raise exception 'VENTA_VOZ_DEPENDENCIAS: faltan tablas del flujo de ventas existente.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ventas_tickets' and column_name='estado') then
    raise exception 'VENTA_VOZ_DEPENDENCIAS: ventas_tickets.estado es obligatorio para la reversión auditada. Aplica antes fastlook_ventas_tickets_estado.sql.';
  end if;
  if to_regprocedure('public.procesar_venta_mixta(uuid,text,jsonb,jsonb)') is null then
    raise exception 'VENTA_VOZ_DEPENDENCIAS: falta procesar_venta_mixta(uuid,text,jsonb,jsonb).';
  end if;
end $$;

create table if not exists public.ventas_voz_operaciones (
  captura_id uuid primary key,
  usuario_id uuid not null references auth.users(id),
  importe numeric(12,2) not null check (importe > 0 and importe <= 9999999.99 and importe = round(importe,2)),
  ticket_id uuid,
  folio text,
  resultado jsonb,
  created_at timestamptz not null default clock_timestamp(),
  confirmada_at timestamptz,
  deshecha_at timestamptz,
  deshecha_por uuid references auth.users(id),
  deshacer_idempotency_key uuid unique,
  constraint ventas_voz_confirmacion_consistente_chk check (
    (ticket_id is null and folio is null and confirmada_at is null)
    or (ticket_id is not null and folio is not null and confirmada_at is not null)
  )
);

alter table public.ventas_voz_operaciones enable row level security;
revoke all on public.ventas_voz_operaciones from public, anon, authenticated;

create or replace function public.registrar_venta_voz(p_captura_id uuid, p_importe numeric)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_nombre text; v_existente public.ventas_voz_operaciones%rowtype;
  v_resultado jsonb; v_ticket uuid; v_folio text; v_total numeric(12,2); v_concepto text;
begin
  if v_actor is null then raise exception using errcode='42501', message='SIN_SESION: Inicia sesión.'; end if;
  select nombre into v_nombre from public.usuarios where id=v_actor and activo=true and rol in ('Admin','Vendedor');
  if not found then raise exception using errcode='42501', message='ROL_NO_PERMITIDO: El usuario no puede registrar ventas.'; end if;
  if p_captura_id is null then raise exception using errcode='P0001', message='IDEMPOTENCIA_INVALIDA: Falta el identificador de captura.'; end if;
  if p_importe is null or p_importe <= 0 or p_importe > 9999999.99 or p_importe <> round(p_importe,2) then raise exception using errcode='P0001', message='IMPORTE_INVALIDO: El total no es válido.'; end if;

  insert into public.ventas_voz_operaciones(captura_id,usuario_id,importe) values(p_captura_id,v_actor,p_importe)
  on conflict (captura_id) do nothing;
  select * into v_existente from public.ventas_voz_operaciones where captura_id=p_captura_id for update;
  if v_existente.usuario_id <> v_actor or v_existente.importe <> p_importe then raise exception using errcode='P0001', message='IDEMPOTENCIA_CONFLICTO: La captura ya pertenece a otra operación.'; end if;
  if v_existente.resultado is not null then return v_existente.resultado || jsonb_build_object('idempotente',true,'deshecha',v_existente.deshecha_at is not null); end if;

  v_concepto := 'Venta rápida por voz — ' || btrim(v_nombre);
  v_resultado := public.procesar_venta_mixta(
    p_captura_id, 'Efectivo', '[]'::jsonb,
    -- 'Normal' es un nivel válido del servicio existente; el concepto real se escribe abajo.
    jsonb_build_array(jsonb_build_object('tipo_personalizado','SERVICIO_MOTO','cantidad',1,'configuracion',jsonb_build_object('nivel','Normal','precio_final',round(p_importe,2))))
  );
  if v_resultado is null or jsonb_typeof(v_resultado)<>'object' or v_resultado->>'ok' is distinct from 'true' then raise exception using errcode='P0001', message='VENTA_NO_CONFIRMADA: El flujo de venta no confirmó la operación.'; end if;
  v_ticket := (v_resultado->>'ticket_id')::uuid; v_folio := nullif(btrim(v_resultado->>'folio'),''); v_total := round((v_resultado->>'total')::numeric,2);
  if v_folio is null or v_total <> round(p_importe,2) then raise exception using errcode='P0001', message='VENTA_INCONSISTENTE: El ticket no coincide con la captura.'; end if;

  -- Sólo cambia el texto visible; la configuración queda como la validó calcular_linea_personalizada.
  -- La trazabilidad vive en ventas_voz_operaciones.ticket_id. costo_unitario ya es NULL (sin ganancia).
  update public.ventas_personalizadas set nombre=v_concepto,resumen=v_concepto where ticket_id=v_ticket;
  if not found then raise exception using errcode='P0001', message='VENTA_PERSONALIZADA_INEXISTENTE: No se creó la partida por voz.'; end if;
  v_resultado := v_resultado || jsonb_build_object('ok',true,'captura_id',p_captura_id,'ticket_id',v_ticket,'folio',v_folio,'total',v_total,'metodo_pago','Efectivo','concepto',v_concepto,'idempotente',false,'deshecha',false);
  update public.ventas_voz_operaciones set ticket_id=v_ticket,folio=v_folio,resultado=v_resultado,confirmada_at=clock_timestamp() where captura_id=p_captura_id;
  return v_resultado;
end $$;

create or replace function public.consultar_venta_voz(p_captura_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_op public.ventas_voz_operaciones%rowtype;
begin
  if v_actor is null then raise exception using errcode='42501',message='SIN_SESION: Inicia sesión.'; end if;
  select * into v_op from public.ventas_voz_operaciones where captura_id=p_captura_id and usuario_id=v_actor;
  if not found or v_op.resultado is null then return null; end if;
  return v_op.resultado || jsonb_build_object('idempotente',true,'deshecha',v_op.deshecha_at is not null);
end $$;

create or replace function public.deshacer_venta_voz(p_captura_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_op public.ventas_voz_operaciones%rowtype; v_estado text;
begin
  if v_actor is null then raise exception using errcode='42501',message='SIN_SESION: Inicia sesión.'; end if;
  if p_idempotency_key is null then raise exception using errcode='P0001',message='IDEMPOTENCIA_INVALIDA: Falta el identificador de reversión.'; end if;
  select * into v_op from public.ventas_voz_operaciones where captura_id=p_captura_id for update;
  if not found or v_op.usuario_id<>v_actor or v_op.ticket_id is null then raise exception using errcode='42501',message='VENTA_VOZ_NO_AUTORIZADA: Sólo puedes deshacer la venta indicada en tu aviso.'; end if;
  if v_op.deshecha_at is not null then
    if v_op.deshacer_idempotency_key=p_idempotency_key then return jsonb_build_object('ok',true,'captura_id',p_captura_id,'ticket_id',v_op.ticket_id,'folio',v_op.folio,'deshecha',true,'idempotente',true); end if;
    raise exception using errcode='P0001',message='VENTA_YA_DESHECHA: La venta ya fue cancelada.';
  end if;
  select estado into v_estado from public.ventas_tickets where ticket_id=v_op.ticket_id for update;
  if not found then raise exception using errcode='P0001',message='TICKET_INEXISTENTE: No se encontró el ticket.'; end if;
  if lower(coalesce(v_estado,'')) in ('cancelado','cancelada','anulado','anulada') then raise exception using errcode='P0001',message='TICKET_YA_CANCELADO: El ticket ya estaba cancelado.'; end if;
  update public.ventas_tickets set estado='Cancelado' where ticket_id=v_op.ticket_id;
  update public.ventas_voz_operaciones set deshecha_at=clock_timestamp(),deshecha_por=v_actor,deshacer_idempotency_key=p_idempotency_key where captura_id=p_captura_id;
  return jsonb_build_object('ok',true,'captura_id',p_captura_id,'ticket_id',v_op.ticket_id,'folio',v_op.folio,'deshecha',true,'idempotente',false);
end $$;

revoke all on function public.registrar_venta_voz(uuid,numeric) from public,anon;
revoke all on function public.consultar_venta_voz(uuid) from public,anon;
revoke all on function public.deshacer_venta_voz(uuid,uuid) from public,anon;
grant execute on function public.registrar_venta_voz(uuid,numeric) to authenticated;
grant execute on function public.consultar_venta_voz(uuid) to authenticated;
grant execute on function public.deshacer_venta_voz(uuid,uuid) to authenticated;

commit;
