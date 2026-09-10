-- FAST LOOK · Fase 1 Check In
-- Revisar y ejecutar manualmente en Supabase. Este archivo NO fue ejecutado por Codex.
begin;

create table if not exists public.asistencias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete restrict,
  fecha date not null,
  entrada timestamptz not null,
  salida timestamptz,
  tarifa_normal numeric(10,2) not null default 35.00,
  tarifa_extra numeric(10,2) not null default 45.00,
  limite_horas_normales numeric(5,2) not null default 8.00,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint asistencias_una_jornada_diaria unique (usuario_id, fecha),
  constraint asistencias_salida_valida check (salida is null or salida >= entrada),
  constraint asistencias_tarifas_validas check (tarifa_normal >= 0 and tarifa_extra >= 0 and limite_horas_normales > 0)
);

create unique index if not exists asistencias_una_abierta_por_usuario_uidx
  on public.asistencias (usuario_id) where salida is null;
create index if not exists asistencias_fecha_idx on public.asistencias (fecha, entrada);
alter table public.asistencias enable row level security;

create or replace function public.exigir_admin_checkin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Se requiere una sesión autenticada.'; end if;
  if not exists (select 1 from public.usuarios u where u.id = v_actor and u.activo = true and u.rol = 'Admin') then
    raise exception using errcode = '42501', message = 'Sólo un administrador activo puede operar Check In.';
  end if;
  return v_actor;
end;
$$;

create or replace function public.obtener_panel_checkin()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_fecha date := (statement_timestamp() at time zone 'America/Mexico_City')::date;
  v_resultado jsonb;
begin
  v_actor := public.exigir_admin_checkin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'nombre', u.nombre, 'rol', u.rol, 'activo', u.activo,
    'jornada', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'fecha', a.fecha, 'entrada', a.entrada, 'salida', a.salida,
      'tarifa_normal', a.tarifa_normal, 'tarifa_extra', a.tarifa_extra,
      'limite_horas_normales', a.limite_horas_normales
    ) end
  ) order by u.nombre), '[]'::jsonb)
  into v_resultado
  from public.usuarios u
  left join public.asistencias a on a.usuario_id = u.id and a.fecha = v_fecha
  where u.activo = true and u.rol in ('Admin', 'Vendedor');
  return v_resultado;
end;
$$;

create or replace function public.registrar_entrada_empleado(p_usuario_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_ahora timestamptz := clock_timestamp();
  v_fecha date := (v_ahora at time zone 'America/Mexico_City')::date;
  v_id uuid;
begin
  v_actor := public.exigir_admin_checkin();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_usuario_id::text));
  if not exists (select 1 from public.usuarios u where u.id = p_usuario_id and u.activo = true and u.rol in ('Admin', 'Vendedor')) then
    raise exception using errcode = 'P0002', message = 'El empleado no existe o está inactivo.';
  end if;
  if exists (select 1 from public.asistencias a where a.usuario_id = p_usuario_id and a.fecha = v_fecha) then
    raise exception using errcode = '23505', message = 'El empleado ya tiene una jornada registrada hoy.';
  end if;
  insert into public.asistencias (usuario_id, fecha, entrada, tarifa_normal, tarifa_extra, limite_horas_normales, created_by)
  values (p_usuario_id, v_fecha, v_ahora, 35.00, 45.00, 8.00, v_actor) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'accion', 'entrada', 'timestamp', v_ahora);
end;
$$;

create or replace function public.registrar_salida_empleado(p_usuario_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_ahora timestamptz := clock_timestamp();
  v_fecha date := (v_ahora at time zone 'America/Mexico_City')::date;
  v_jornada public.asistencias%rowtype;
begin
  v_actor := public.exigir_admin_checkin();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_usuario_id::text));
  select * into v_jornada from public.asistencias a
  where a.usuario_id = p_usuario_id and a.fecha = v_fecha for update;
  if not found then raise exception using errcode = 'P0002', message = 'No existe una entrada para cerrar hoy.'; end if;
  if v_jornada.salida is not null then raise exception using errcode = '23505', message = 'La salida ya fue registrada.'; end if;
  if v_ahora < v_jornada.entrada then raise exception using errcode = '22007', message = 'La salida no puede ser anterior a la entrada.'; end if;
  update public.asistencias set salida = v_ahora, updated_at = v_ahora where id = v_jornada.id;
  return jsonb_build_object('ok', true, 'id', v_jornada.id, 'accion', 'salida', 'timestamp', v_ahora);
end;
$$;

revoke all on table public.asistencias from anon, authenticated;
revoke all on function public.exigir_admin_checkin() from public, anon;
revoke all on function public.obtener_panel_checkin() from public, anon;
revoke all on function public.registrar_entrada_empleado(uuid) from public, anon;
revoke all on function public.registrar_salida_empleado(uuid) from public, anon;
grant execute on function public.obtener_panel_checkin() to authenticated;
grant execute on function public.registrar_entrada_empleado(uuid) to authenticated;
grant execute on function public.registrar_salida_empleado(uuid) to authenticated;

commit;
