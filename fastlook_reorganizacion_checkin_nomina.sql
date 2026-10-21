-- FAST LOOK · separación KIKEADMIN / empleado para Check In y nómina.
-- Ejecutar después de fastlook_fase3_fotos_trabajos_mecanicos.sql y fastlook_fix_checkin_produccion.sql.
-- Después de aplicar, configurar una sola vez el UUID real:
-- insert into public.configuracion_kikeadmin (id, usuario_id) values (true, '<UUID_AUTH_DE_KIKEADMIN>');
begin;

create table if not exists public.configuracion_kikeadmin (
  id boolean primary key default true check (id = true),
  usuario_id uuid not null unique references public.usuarios(id) on delete restrict,
  updated_at timestamptz not null default now()
);
alter table public.configuracion_kikeadmin enable row level security;
revoke all on table public.configuracion_kikeadmin from anon, authenticated;

create or replace function public.es_kikeadmin_nomina()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.configuracion_kikeadmin c
    join public.usuarios u on u.id = c.usuario_id
    where c.id = true and c.usuario_id = auth.uid() and u.activo = true and u.rol = 'Admin'
  );
$$;

create or replace function public.exigir_admin_checkin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if not public.es_kikeadmin_nomina() then raise exception using errcode = '42501', message = 'SOLO_KIKEADMIN: Esta operación es exclusiva de KIKEADMIN.'; end if;
  return v_actor;
end;
$$;

create or replace function public.es_admin_fotos_trabajos()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.es_kikeadmin_nomina();
$$;

create or replace function public.obtener_nomina_checkin(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_es_admin boolean;
  v_hoy date := (statement_timestamp() at time zone 'America/Mexico_City')::date;
  v_empleados jsonb;
  v_porcentaje numeric(5,2);
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then raise exception using errcode = '22023', message = 'PERIODO_INVALIDO: El periodo no es válido.'; end if;
  if not exists (select 1 from public.usuarios where id = v_actor and activo = true and rol in ('Admin', 'Vendedor')) then
    raise exception using errcode = '42501', message = 'USUARIO_NO_AUTORIZADO: El usuario no está activo.';
  end if;
  v_es_admin := public.es_kikeadmin_nomina();
  select porcentaje into v_porcentaje from public.configuracion_comisiones where id = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'nombre', u.nombre, 'rol', u.rol, 'activo', u.activo,
    'jornada', case when actual.id is null then null else jsonb_build_object(
      'id', actual.id, 'fecha', actual.fecha, 'entrada', actual.entrada, 'salida', actual.salida,
      'tarifa_normal', actual.tarifa_normal, 'tarifa_extra', actual.tarifa_extra,
      'limite_horas_normales', actual.limite_horas_normales,
      'es_anterior', (actual.salida is null and actual.fecha < v_hoy)
    ) end,
    'jornadas', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'fecha', a.fecha, 'entrada', a.entrada, 'salida', a.salida,
      'tarifa_normal', a.tarifa_normal, 'tarifa_extra', a.tarifa_extra,
      'limite_horas_normales', a.limite_horas_normales,
      'es_anterior', (a.salida is null and a.fecha < v_hoy)
    ) order by a.entrada desc) from public.asistencias a where a.usuario_id = u.id and a.fecha between p_desde and p_hasta), '[]'::jsonb),
    'trabajos', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'empleado_id', t.empleado_id, 'empleado_nombre', u.nombre, 'descripcion', t.descripcion,
      'fecha', t.fecha, 'importe_mano_obra', t.importe_mano_obra, 'porcentaje_aplicado', t.porcentaje_aplicado,
      'comision', t.comision, 'estado', t.estado, 'created_at', t.created_at,
      'foto_ruta', case when t.foto_expira_at > statement_timestamp() and t.foto_eliminada_at is null then t.foto_ruta else null end,
      'foto_expira_at', t.foto_expira_at, 'foto_eliminada_at', t.foto_eliminada_at
    ) order by t.fecha desc, t.created_at desc) from public.trabajos_mecanicos t where t.empleado_id = u.id and t.fecha between p_desde and p_hasta), '[]'::jsonb)
  ) order by u.nombre), '[]'::jsonb) into v_empleados
  from public.usuarios u
  left join lateral (
    select a.* from public.asistencias a
    where a.usuario_id = u.id and (a.fecha = v_hoy or a.salida is null)
    order by (a.salida is null) desc, a.fecha desc, a.entrada desc limit 1
  ) actual on true
  where u.activo = true and u.rol in ('Admin', 'Vendedor') and (v_es_admin or u.id = v_actor);

  return jsonb_build_object('modo', case when v_es_admin then 'administrador' else 'empleado' end,
    'desde', p_desde, 'hasta', p_hasta, 'porcentaje_actual', v_porcentaje, 'empleados', v_empleados);
end;
$$;

create or replace function public.registrar_entrada_empleado(p_usuario_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_ahora timestamptz := clock_timestamp(); v_fecha date := (v_ahora at time zone 'America/Mexico_City')::date; v_jornada public.asistencias%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if p_usuario_id <> v_actor and not public.es_kikeadmin_nomina() then raise exception using errcode = '42501', message = 'ASISTENCIA_AJENA: Sólo puedes registrar tu propia entrada.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_usuario_id::text));
  if not exists (select 1 from public.usuarios where id = p_usuario_id and activo = true and rol in ('Admin', 'Vendedor')) then raise exception using errcode = 'P0002', message = 'El empleado no existe o está inactivo.'; end if;
  select * into v_jornada from public.asistencias where usuario_id = p_usuario_id and salida is null order by entrada desc limit 1 for update;
  if found then
    if v_jornada.fecha = v_fecha then return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_jornada.id, 'accion', 'entrada', 'timestamp', v_jornada.entrada); end if;
    raise exception using errcode = 'P0001', message = 'JORNADA_ABIERTA_EXISTENTE: Existe una jornada anterior abierta.';
  end if;
  select * into v_jornada from public.asistencias where usuario_id = p_usuario_id and fecha = v_fecha limit 1 for update;
  if found then return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_jornada.id, 'accion', 'entrada', 'timestamp', v_jornada.entrada); end if;
  insert into public.asistencias (usuario_id, fecha, entrada, tarifa_normal, tarifa_extra, limite_horas_normales, created_by)
  values (p_usuario_id, v_fecha, v_ahora, 35, 45, 8, v_actor) returning * into v_jornada;
  return jsonb_build_object('ok', true, 'idempotente', false, 'id', v_jornada.id, 'accion', 'entrada', 'timestamp', v_jornada.entrada);
end;
$$;

create or replace function public.registrar_salida_empleado(p_usuario_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_ahora timestamptz := clock_timestamp(); v_jornada public.asistencias%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if p_usuario_id <> v_actor and not public.es_kikeadmin_nomina() then raise exception using errcode = '42501', message = 'ASISTENCIA_AJENA: Sólo puedes registrar tu propia salida.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_usuario_id::text));
  select * into v_jornada from public.asistencias where usuario_id = p_usuario_id and salida is null order by entrada desc limit 1 for update;
  if not found then raise exception using errcode = 'P0002', message = 'No existe una jornada abierta para cerrar.'; end if;
  if (v_jornada.entrada at time zone 'America/Mexico_City')::date < (v_ahora at time zone 'America/Mexico_City')::date then raise exception using errcode = 'P0001', message = 'JORNADA_ANTERIOR_REQUIERE_REVISION: Solicita a KIKEADMIN la corrección.'; end if;
  update public.asistencias set salida = v_ahora, updated_at = v_ahora where id = v_jornada.id;
  return jsonb_build_object('ok', true, 'id', v_jornada.id, 'accion', 'salida', 'timestamp', v_ahora);
end;
$$;

revoke all on function public.es_kikeadmin_nomina() from public, anon;
revoke all on function public.obtener_nomina_checkin(date, date) from public, anon;
revoke all on function public.registrar_entrada_empleado(uuid) from public, anon;
revoke all on function public.registrar_salida_empleado(uuid) from public, anon;
grant execute on function public.es_kikeadmin_nomina() to authenticated;
grant execute on function public.obtener_nomina_checkin(date, date) to authenticated;
grant execute on function public.registrar_entrada_empleado(uuid) to authenticated;
grant execute on function public.registrar_salida_empleado(uuid) to authenticated;
commit;
