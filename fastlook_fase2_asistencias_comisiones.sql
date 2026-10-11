-- FAST LOOK · Corrección de jornadas abiertas y comisiones mecánicas.
-- Ejecutar manualmente en Supabase SQL Editor después de fastlook_fase1_checkin.sql.
-- Este archivo NO modifica ni cierra automáticamente registros existentes.
-- Antes de corregir una jornada, localizar el registro exacto con:
-- select a.id, u.nombre, a.fecha, a.entrada, a.salida
-- from public.asistencias a join public.usuarios u on u.id = a.usuario_id
-- where a.salida is null order by a.entrada;
begin;

create table if not exists public.asistencias_correcciones (
  id uuid primary key default gen_random_uuid(),
  asistencia_id uuid not null references public.asistencias(id) on delete restrict,
  salida_anterior timestamptz,
  salida_nueva timestamptz not null,
  motivo text not null check (length(btrim(motivo)) > 0),
  corregido_por uuid not null references public.usuarios(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.asistencias_correcciones enable row level security;
revoke all on table public.asistencias_correcciones from anon, authenticated;

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
      'limite_horas_normales', a.limite_horas_normales,
      'es_anterior', (a.salida is null and a.fecha < v_fecha)
    ) end
  ) order by u.nombre), '[]'::jsonb)
  into v_resultado
  from public.usuarios u
  left join lateral (
    select asistencia.*
    from public.asistencias asistencia
    where asistencia.usuario_id = u.id
      and (asistencia.fecha = v_fecha or asistencia.salida is null)
    order by (asistencia.salida is null) desc, asistencia.fecha desc, asistencia.entrada desc
    limit 1
  ) a on true
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
  v_abierta public.asistencias%rowtype;
begin
  v_actor := public.exigir_admin_checkin();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_usuario_id::text));
  if not exists (select 1 from public.usuarios u where u.id = p_usuario_id and u.activo = true and u.rol in ('Admin', 'Vendedor')) then
    raise exception using errcode = 'P0002', message = 'El empleado no existe o está inactivo.';
  end if;
  select * into v_abierta from public.asistencias a
  where a.usuario_id = p_usuario_id and a.salida is null
  order by a.entrada desc limit 1 for update;
  if found then
    raise exception using errcode = 'P0001', message = 'JORNADA_ABIERTA_EXISTENTE: El empleado ya tiene una jornada abierta desde ' || v_abierta.entrada::text || '.';
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
  v_jornada public.asistencias%rowtype;
begin
  v_actor := public.exigir_admin_checkin();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_usuario_id::text));
  select * into v_jornada from public.asistencias a
  where a.usuario_id = p_usuario_id and a.salida is null
  order by a.entrada desc limit 1 for update;
  if not found then raise exception using errcode = 'P0002', message = 'No existe una jornada abierta para cerrar.'; end if;
  if (v_jornada.entrada at time zone 'America/Mexico_City')::date < (v_ahora at time zone 'America/Mexico_City')::date then
    raise exception using errcode = 'P0001', message = 'JORNADA_ANTERIOR_REQUIERE_REVISION: Indica manualmente la salida real y un motivo.';
  end if;
  update public.asistencias set salida = v_ahora, updated_at = v_ahora where id = v_jornada.id;
  return jsonb_build_object('ok', true, 'id', v_jornada.id, 'accion', 'salida', 'timestamp', v_ahora);
end;
$$;

create or replace function public.cerrar_jornada_abierta_admin(p_asistencia_id uuid, p_salida timestamptz, p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_jornada public.asistencias%rowtype;
begin
  v_actor := public.exigir_admin_checkin();
  if p_salida is null or length(btrim(coalesce(p_motivo, ''))) = 0 then raise exception using errcode = '22023', message = 'La salida y el motivo son obligatorios.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_asistencia_id::text));
  select * into v_jornada from public.asistencias where id = p_asistencia_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'La jornada no existe.'; end if;
  if v_jornada.salida is not null then raise exception using errcode = '23505', message = 'La jornada ya fue cerrada.'; end if;
  if p_salida < v_jornada.entrada then raise exception using errcode = '22007', message = 'La salida no puede ser anterior a la entrada.'; end if;
  if p_salida > clock_timestamp() then raise exception using errcode = '22007', message = 'La salida no puede estar en el futuro.'; end if;
  insert into public.asistencias_correcciones (asistencia_id, salida_anterior, salida_nueva, motivo, corregido_por)
  values (v_jornada.id, v_jornada.salida, p_salida, btrim(p_motivo), v_actor);
  update public.asistencias set salida = p_salida, updated_at = clock_timestamp() where id = v_jornada.id;
  return jsonb_build_object('ok', true, 'id', v_jornada.id, 'salida', p_salida);
end;
$$;

create table if not exists public.configuracion_comisiones (
  id boolean primary key default true check (id = true),
  porcentaje numeric(5,2) not null default 60.00 check (porcentaje between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id) on delete set null
);
insert into public.configuracion_comisiones (id, porcentaje) values (true, 60.00) on conflict (id) do nothing;

create table if not exists public.trabajos_mecanicos (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  empleado_id uuid not null references public.usuarios(id) on delete restrict,
  descripcion text not null check (length(btrim(descripcion)) > 0),
  fecha date not null,
  importe_mano_obra numeric(12,2) not null check (importe_mano_obra >= 0),
  porcentaje_aplicado numeric(5,2) not null check (porcentaje_aplicado between 0 and 100),
  comision numeric(12,2) generated always as (round(importe_mano_obra * porcentaje_aplicado / 100, 2)) stored,
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Pagada', 'Cancelada')),
  pagada_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.usuarios(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id) on delete set null
);
create index if not exists trabajos_mecanicos_fecha_idx on public.trabajos_mecanicos (fecha desc, created_at desc);
create index if not exists trabajos_mecanicos_empleado_idx on public.trabajos_mecanicos (empleado_id, fecha desc);

create table if not exists public.trabajos_mecanicos_correcciones (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references public.trabajos_mecanicos(id) on delete restrict,
  datos_anteriores jsonb not null,
  motivo text not null check (length(btrim(motivo)) > 0),
  corregido_por uuid not null references public.usuarios(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.configuracion_comisiones enable row level security;
alter table public.trabajos_mecanicos enable row level security;
alter table public.trabajos_mecanicos_correcciones enable row level security;
revoke all on table public.configuracion_comisiones, public.trabajos_mecanicos, public.trabajos_mecanicos_correcciones from anon, authenticated;

create or replace function public.registrar_trabajo_mecanico(p_idempotency_key uuid, p_empleado_id uuid, p_descripcion text, p_fecha date, p_importe_mano_obra numeric)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_porcentaje numeric(5,2); v_trabajo public.trabajos_mecanicos%rowtype;
begin
  v_actor := public.exigir_admin_checkin();
  if p_idempotency_key is null then raise exception using errcode = '22023', message = 'La clave de operación es obligatoria.'; end if;
  select * into v_trabajo from public.trabajos_mecanicos where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_trabajo.id); end if;
  if length(btrim(coalesce(p_descripcion, ''))) = 0 or p_fecha is null or p_importe_mano_obra is null or p_importe_mano_obra < 0 then raise exception using errcode = '22023', message = 'Los datos del trabajo no son válidos.'; end if;
  if not exists (select 1 from public.usuarios where id = p_empleado_id and activo = true and rol in ('Admin', 'Vendedor')) then raise exception using errcode = 'P0002', message = 'El empleado no existe o está inactivo.'; end if;
  select porcentaje into v_porcentaje from public.configuracion_comisiones where id = true for share;
  insert into public.trabajos_mecanicos (idempotency_key, empleado_id, descripcion, fecha, importe_mano_obra, porcentaje_aplicado, created_by)
  values (p_idempotency_key, p_empleado_id, btrim(p_descripcion), p_fecha, p_importe_mano_obra, v_porcentaje, v_actor)
  returning * into v_trabajo;
  return jsonb_build_object('ok', true, 'idempotente', false, 'id', v_trabajo.id, 'comision', v_trabajo.comision);
exception when unique_violation then
  select * into v_trabajo from public.trabajos_mecanicos where idempotency_key = p_idempotency_key;
  return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_trabajo.id);
end;
$$;

create or replace function public.obtener_trabajos_mecanicos(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid; v_resultado jsonb; v_porcentaje numeric(5,2);
begin
  v_actor := public.exigir_admin_checkin();
  if p_desde is null or p_hasta is null or p_desde > p_hasta then raise exception using errcode = '22023', message = 'El periodo no es válido.'; end if;
  select porcentaje into v_porcentaje from public.configuracion_comisiones where id = true;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'empleado_id', t.empleado_id, 'empleado_nombre', u.nombre, 'descripcion', t.descripcion, 'fecha', t.fecha, 'importe_mano_obra', t.importe_mano_obra, 'porcentaje_aplicado', t.porcentaje_aplicado, 'comision', t.comision, 'estado', t.estado, 'created_at', t.created_at) order by t.fecha desc, t.created_at desc), '[]'::jsonb)
  into v_resultado from public.trabajos_mecanicos t join public.usuarios u on u.id = t.empleado_id where t.fecha between p_desde and p_hasta;
  return jsonb_build_object('porcentaje_actual', v_porcentaje, 'trabajos', v_resultado);
end;
$$;

create or replace function public.configurar_porcentaje_comision(p_porcentaje numeric)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid;
begin
  v_actor := public.exigir_admin_checkin();
  if p_porcentaje is null or p_porcentaje < 0 or p_porcentaje > 100 then raise exception using errcode = '22023', message = 'El porcentaje debe estar entre 0 y 100.'; end if;
  update public.configuracion_comisiones set porcentaje = p_porcentaje, updated_at = clock_timestamp(), updated_by = v_actor where id = true;
  return jsonb_build_object('ok', true, 'porcentaje', p_porcentaje);
end;
$$;

create or replace function public.corregir_trabajo_mecanico(p_trabajo_id uuid, p_empleado_id uuid, p_descripcion text, p_fecha date, p_importe_mano_obra numeric, p_estado text, p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_anterior public.trabajos_mecanicos%rowtype;
begin
  v_actor := public.exigir_admin_checkin();
  if length(btrim(coalesce(p_descripcion, ''))) = 0 or p_fecha is null or p_importe_mano_obra is null or p_importe_mano_obra < 0 or p_estado not in ('Pendiente', 'Pagada', 'Cancelada') or length(btrim(coalesce(p_motivo, ''))) = 0 then raise exception using errcode = '22023', message = 'Los datos de corrección no son válidos.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_trabajo_id::text));
  select * into v_anterior from public.trabajos_mecanicos where id = p_trabajo_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'El trabajo no existe.'; end if;
  if not exists (select 1 from public.usuarios where id = p_empleado_id and activo = true and rol in ('Admin', 'Vendedor')) then raise exception using errcode = 'P0002', message = 'El empleado no existe o está inactivo.'; end if;
  if v_anterior.estado = 'Pagada' and p_estado = 'Pendiente' then raise exception using errcode = 'P0001', message = 'Una comisión pagada no puede volver a pendiente; registra una corrección explícita fuera de nómina.'; end if;
  insert into public.trabajos_mecanicos_correcciones (trabajo_id, datos_anteriores, motivo, corregido_por) values (v_anterior.id, to_jsonb(v_anterior), btrim(p_motivo), v_actor);
  update public.trabajos_mecanicos set empleado_id = p_empleado_id, descripcion = btrim(p_descripcion), fecha = p_fecha, importe_mano_obra = p_importe_mano_obra, estado = p_estado, pagada_at = case when p_estado = 'Pagada' then coalesce(pagada_at, clock_timestamp()) else null end, updated_at = clock_timestamp(), updated_by = v_actor where id = p_trabajo_id;
  return jsonb_build_object('ok', true, 'id', p_trabajo_id);
end;
$$;

revoke all on function public.cerrar_jornada_abierta_admin(uuid, timestamptz, text) from public, anon;
revoke all on function public.registrar_trabajo_mecanico(uuid, uuid, text, date, numeric) from public, anon;
revoke all on function public.obtener_trabajos_mecanicos(date, date) from public, anon;
revoke all on function public.configurar_porcentaje_comision(numeric) from public, anon;
revoke all on function public.corregir_trabajo_mecanico(uuid, uuid, text, date, numeric, text, text) from public, anon;
grant execute on function public.cerrar_jornada_abierta_admin(uuid, timestamptz, text) to authenticated;
grant execute on function public.registrar_trabajo_mecanico(uuid, uuid, text, date, numeric) to authenticated;
grant execute on function public.obtener_trabajos_mecanicos(date, date) to authenticated;
grant execute on function public.configurar_porcentaje_comision(numeric) to authenticated;
grant execute on function public.corregir_trabajo_mecanico(uuid, uuid, text, date, numeric, text, text) to authenticated;

commit;
