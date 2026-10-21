-- FAST LOOK · Corrección crítica e idempotencia de Check In.
-- Ejecutar manualmente en Supabase después de fastlook_fase2_asistencias_comisiones.sql.
-- No elimina ni modifica asistencias históricas.
begin;

create or replace function public.registrar_entrada_empleado(p_usuario_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_ahora timestamptz := clock_timestamp();
  v_fecha date := (v_ahora at time zone 'America/Mexico_City')::date;
  v_jornada public.asistencias%rowtype;
begin
  v_actor := public.exigir_admin_checkin();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_usuario_id::text));
  if not exists (select 1 from public.usuarios u where u.id = p_usuario_id and u.activo = true and u.rol in ('Admin', 'Vendedor')) then
    raise exception using errcode = 'P0002', message = 'El empleado no existe o está inactivo.';
  end if;
  select * into v_jornada from public.asistencias a where a.usuario_id = p_usuario_id and a.salida is null order by a.entrada desc limit 1 for update;
  if found then
    if v_jornada.fecha = v_fecha then
      return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_jornada.id, 'accion', 'entrada', 'timestamp', v_jornada.entrada);
    end if;
    raise exception using errcode = 'P0001', message = 'JORNADA_ABIERTA_EXISTENTE: El empleado ya tiene una jornada anterior abierta.';
  end if;
  select * into v_jornada from public.asistencias a where a.usuario_id = p_usuario_id and a.fecha = v_fecha limit 1 for update;
  if found then
    return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_jornada.id, 'accion', 'entrada', 'timestamp', v_jornada.entrada);
  end if;
  insert into public.asistencias (usuario_id, fecha, entrada, tarifa_normal, tarifa_extra, limite_horas_normales, created_by)
  values (p_usuario_id, v_fecha, v_ahora, 35.00, 45.00, 8.00, v_actor) returning * into v_jornada;
  return jsonb_build_object('ok', true, 'idempotente', false, 'id', v_jornada.id, 'accion', 'entrada', 'timestamp', v_jornada.entrada);
end;
$$;

revoke all on function public.registrar_entrada_empleado(uuid) from public, anon;
grant execute on function public.registrar_entrada_empleado(uuid) to authenticated;
commit;
