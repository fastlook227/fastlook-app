-- FAST LOOK · Venta por voz: respetar ventas_personalizadas_inmutables
-- Aplicar DESPUÉS de fastlook_venta_rapida_voz.sql. Ejecución manual. No borra ni modifica datos.
-- registrar_venta_voz ya no modifica ventas_personalizadas: la partida queda como la registra
-- procesar_venta_mixta ("Servicio de moto - Normal"); la identificación de voz vive sólo en
-- ventas_voz_operaciones (ticket_id y resultado->>'concepto').
-- deshacer_venta_voz y consultar_venta_voz no cambian: no tocan ventas_personalizadas.
begin;

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
    -- calcular_linea_personalizada exige exactamente nivel y precio_final.
    jsonb_build_array(jsonb_build_object('tipo_personalizado','SERVICIO_MOTO','cantidad',1,'configuracion',jsonb_build_object('nivel','Normal','precio_final',round(p_importe,2))))
  );
  if v_resultado is null or jsonb_typeof(v_resultado)<>'object' or v_resultado->>'ok' is distinct from 'true' then raise exception using errcode='P0001', message='VENTA_NO_CONFIRMADA: El flujo de venta no confirmó la operación.'; end if;
  v_ticket := (v_resultado->>'ticket_id')::uuid; v_folio := nullif(btrim(v_resultado->>'folio'),''); v_total := round((v_resultado->>'total')::numeric,2);
  if v_folio is null or v_total <> round(p_importe,2) then raise exception using errcode='P0001', message='VENTA_INCONSISTENTE: El ticket no coincide con la captura.'; end if;

  v_resultado := v_resultado || jsonb_build_object('ok',true,'captura_id',p_captura_id,'ticket_id',v_ticket,'folio',v_folio,'total',v_total,'metodo_pago','Efectivo','concepto',v_concepto,'idempotente',false,'deshecha',false);
  update public.ventas_voz_operaciones set ticket_id=v_ticket,folio=v_folio,resultado=v_resultado,confirmada_at=clock_timestamp() where captura_id=p_captura_id;
  return v_resultado;
end $$;

-- create or replace conserva los permisos; se reafirman por claridad.
revoke all on function public.registrar_venta_voz(uuid,numeric) from public,anon;
grant execute on function public.registrar_venta_voz(uuid,numeric) to authenticated;

commit;
