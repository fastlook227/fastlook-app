-- FAST LOOK · Preparación semanal de cajas del tianguis.
-- Requiere configuracion_kikeadmin de fastlook_reorganizacion_checkin_nomina.sql.
-- Retención: no elimina fotografías automáticamente. La UI consulta la semana elegida y la anterior.
begin;

create table if not exists public.tianguis_productos_maestros (
  id uuid primary key default gen_random_uuid(), nombre text not null, orden integer not null default 0,
  activo boolean not null default true, created_at timestamptz not null default now(), created_by uuid not null references public.usuarios(id),
  updated_at timestamptz not null default now(), updated_by uuid not null references public.usuarios(id), retirado_at timestamptz,
  constraint tianguis_producto_nombre_valido check (char_length(btrim(nombre)) between 1 and 120)
);
create unique index if not exists tianguis_productos_nombre_activo_uidx on public.tianguis_productos_maestros (lower(btrim(nombre))) where activo;

create table if not exists public.tianguis_tareas_semanales (
  id uuid primary key default gen_random_uuid(), semana_domingo date not null, producto_id uuid not null references public.tianguis_productos_maestros(id),
  nombre_snapshot text not null, orden_snapshot integer not null, completada_at timestamptz, completada_por uuid references public.usuarios(id),
  created_at timestamptz not null default now(), unique (semana_domingo, producto_id),
  constraint tianguis_tarea_completa_consistente check ((completada_at is null) = (completada_por is null))
);

create table if not exists public.tianguis_vaciados_semanales (
  semana_domingo date primary key, completada_at timestamptz not null default now(), completada_por uuid not null references public.usuarios(id)
);

create table if not exists public.tianguis_fotos_sobrantes (
  id uuid primary key default gen_random_uuid(), idempotency_key uuid not null unique, semana_domingo date not null,
  ruta text not null unique, miniatura_ruta text not null unique, mime text not null check (mime in ('image/webp','image/jpeg')),
  subida_at timestamptz not null default now(), subida_por uuid not null references public.usuarios(id),
  eliminada_at timestamptz, eliminada_por uuid references public.usuarios(id)
);

alter table public.tianguis_productos_maestros enable row level security;
alter table public.tianguis_tareas_semanales enable row level security;
alter table public.tianguis_vaciados_semanales enable row level security;
alter table public.tianguis_fotos_sobrantes enable row level security;
revoke all on table public.tianguis_productos_maestros, public.tianguis_tareas_semanales, public.tianguis_vaciados_semanales, public.tianguis_fotos_sobrantes from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tianguis-sobrantes', 'tianguis-sobrantes', false, 1500000, array['image/webp','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.domingo_semana_tianguis(p_fecha date)
returns date language sql immutable set search_path = '' as $$
  select p_fecha + ((7 - extract(isodow from p_fecha)::integer) % 7);
$$;

create or replace function public.exigir_usuario_tianguis()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (select 1 from public.usuarios where id=v_actor and activo=true and rol in ('Admin','Vendedor')) then
    raise exception using errcode='42501', message='USUARIO_NO_AUTORIZADO: Inicia sesión con un usuario activo.';
  end if;
  return v_actor;
end; $$;

create or replace function public.es_kikeadmin_tianguis()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.configuracion_kikeadmin c join public.usuarios u on u.id=c.usuario_id
    where c.id=true and c.usuario_id=auth.uid() and u.activo=true and u.rol='Admin');
$$;

create or replace function public.exigir_kikeadmin_tianguis()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid;
begin
  v_actor := public.exigir_usuario_tianguis();
  if not public.es_kikeadmin_tianguis() then raise exception using errcode='42501', message='SOLO_KIKEADMIN: Operación exclusiva de KIKEADMIN.'; end if;
  return v_actor;
end; $$;

create or replace function public.asegurar_tareas_tianguis(p_semana date)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_semana date;
begin
  v_actor := public.exigir_usuario_tianguis(); v_semana := public.domingo_semana_tianguis(p_semana);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('tianguis:'||v_semana::text));
  insert into public.tianguis_tareas_semanales(semana_domingo,producto_id,nombre_snapshot,orden_snapshot)
  select v_semana,p.id,p.nombre,p.orden from public.tianguis_productos_maestros p where p.activo
  on conflict (semana_domingo,producto_id) do nothing;
end; $$;

create or replace function public.obtener_preparacion_tianguis(p_semana date default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_hoy date := (statement_timestamp() at time zone 'America/Mexico_City')::date;
v_actual date; v_semana date; v_resultado jsonb;
begin
  v_actor:=public.exigir_usuario_tianguis(); v_actual:=public.domingo_semana_tianguis(v_hoy);
  v_semana:=public.domingo_semana_tianguis(coalesce(p_semana,v_hoy)); perform public.asegurar_tareas_tianguis(v_semana);
  select jsonb_build_object(
    'semana_domingo',v_semana,'semana_actual',v_actual,'es_kikeadmin',public.es_kikeadmin_tianguis(),
    'vaciado',(select jsonb_build_object('completada_at',v.completada_at,'completada_por',v.completada_por,'completada_por_nombre',u.nombre) from public.tianguis_vaciados_semanales v join public.usuarios u on u.id=v.completada_por where v.semana_domingo=v_semana),
    'tareas',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'producto_id',t.producto_id,'nombre',t.nombre_snapshot,'orden',t.orden_snapshot,'completada_at',t.completada_at,'completada_por',t.completada_por,'completada_por_nombre',u.nombre) order by t.orden_snapshot,t.nombre_snapshot) from public.tianguis_tareas_semanales t left join public.usuarios u on u.id=t.completada_por where t.semana_domingo=v_semana),'[]'::jsonb),
    'productos_maestros',case when public.es_kikeadmin_tianguis() then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,'orden',p.orden,'activo',p.activo) order by p.activo desc,p.orden,p.nombre) from public.tianguis_productos_maestros p),'[]'::jsonb) else '[]'::jsonb end,
    'fotos',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'semana_domingo',f.semana_domingo,'ruta',f.ruta,'miniatura_ruta',f.miniatura_ruta,'mime',f.mime,'subida_at',f.subida_at,'subida_por',f.subida_por,'subida_por_nombre',u.nombre) order by f.subida_at desc) from public.tianguis_fotos_sobrantes f join public.usuarios u on u.id=f.subida_por where f.eliminada_at is null and f.semana_domingo in (v_semana,v_semana-7)),'[]'::jsonb)
  ) into v_resultado;
  return v_resultado;
end; $$;

create or replace function public.marcar_vaciado_tianguis(p_semana date, p_completado boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_semana date;
begin
  v_actor:=public.exigir_usuario_tianguis(); v_semana:=public.domingo_semana_tianguis(p_semana);
  if v_semana <> public.domingo_semana_tianguis((statement_timestamp() at time zone 'America/Mexico_City')::date) and not public.es_kikeadmin_tianguis() then raise exception using errcode='42501',message='HISTORIAL_PROTEGIDO: Sólo KIKEADMIN puede corregir semanas anteriores.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('vaciado:'||v_semana::text));
  if p_completado then insert into public.tianguis_vaciados_semanales values(v_semana,clock_timestamp(),v_actor) on conflict(semana_domingo) do nothing;
  elsif public.es_kikeadmin_tianguis() then delete from public.tianguis_vaciados_semanales where semana_domingo=v_semana;
  else raise exception using errcode='42501', message='SOLO_KIKEADMIN: Sólo KIKEADMIN puede corregir el vaciado.'; end if;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.marcar_tarea_tianguis(p_tarea_id uuid,p_completada boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_tarea public.tianguis_tareas_semanales%rowtype;
begin
  v_actor:=public.exigir_usuario_tianguis(); select * into v_tarea from public.tianguis_tareas_semanales where id=p_tarea_id for update;
  if not found then raise exception using errcode='P0002',message='La tarea no existe.'; end if;
  if v_tarea.semana_domingo <> public.domingo_semana_tianguis((statement_timestamp() at time zone 'America/Mexico_City')::date) and not public.es_kikeadmin_tianguis() then raise exception using errcode='42501',message='HISTORIAL_PROTEGIDO: Sólo KIKEADMIN puede corregir semanas anteriores.'; end if;
  update public.tianguis_tareas_semanales set completada_at=case when p_completada then clock_timestamp() else null end, completada_por=case when p_completada then v_actor else null end where id=p_tarea_id;
  return jsonb_build_object('ok',true,'id',p_tarea_id);
end; $$;

create or replace function public.guardar_producto_tianguis(p_id uuid,p_nombre text,p_orden integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_id uuid; v_nombre text:=btrim(coalesce(p_nombre,''));
begin
  v_actor:=public.exigir_kikeadmin_tianguis(); if char_length(v_nombre) not between 1 and 120 then raise exception using errcode='22023',message='El nombre es obligatorio y admite hasta 120 caracteres.'; end if;
  if p_id is null then insert into public.tianguis_productos_maestros(nombre,orden,created_by,updated_by) values(v_nombre,coalesce(p_orden,0),v_actor,v_actor) returning id into v_id;
  else update public.tianguis_productos_maestros set nombre=v_nombre,orden=coalesce(p_orden,0),updated_at=clock_timestamp(),updated_by=v_actor where id=p_id and activo returning id into v_id; if v_id is null then raise exception using errcode='P0002',message='El producto maestro no existe.'; end if; update public.tianguis_tareas_semanales set nombre_snapshot=v_nombre,orden_snapshot=coalesce(p_orden,0) where producto_id=v_id and semana_domingo=public.domingo_semana_tianguis((statement_timestamp() at time zone 'America/Mexico_City')::date); end if;
  return jsonb_build_object('ok',true,'id',v_id);
exception when unique_violation then raise exception using errcode='23505',message='Ya existe un producto activo con ese nombre.';
end; $$;

create or replace function public.retirar_producto_tianguis(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid;
begin v_actor:=public.exigir_kikeadmin_tianguis(); update public.tianguis_productos_maestros set activo=false,retirado_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=v_actor where id=p_id and activo; if not found then raise exception using errcode='P0002',message='El producto no existe o ya fue retirado.'; end if; delete from public.tianguis_tareas_semanales where producto_id=p_id and semana_domingo=public.domingo_semana_tianguis((statement_timestamp() at time zone 'America/Mexico_City')::date) and completada_at is null; return jsonb_build_object('ok',true); end; $$;

create or replace function public.registrar_foto_tianguis(p_operacion uuid,p_semana date,p_ruta text,p_miniatura_ruta text,p_mime text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_semana date; v_foto public.tianguis_fotos_sobrantes%rowtype;
begin
  v_actor:=public.exigir_usuario_tianguis(); if p_operacion is null then raise exception using errcode='22023',message='La clave de operación es obligatoria.'; end if;
  select * into v_foto from public.tianguis_fotos_sobrantes where idempotency_key=p_operacion; if found then return jsonb_build_object('ok',true,'id',v_foto.id,'idempotente',true); end if;
  v_semana:=public.domingo_semana_tianguis(p_semana);
  if v_semana <> public.domingo_semana_tianguis((statement_timestamp() at time zone 'America/Mexico_City')::date) then raise exception using errcode='22023',message='Las fotografías sólo pueden agregarse a la semana actual.'; end if;
  if p_mime not in ('image/webp','image/jpeg') or p_ruta !~ ('^'||v_semana::text||'/'||v_actor::text||'/'||p_operacion::text||'/foto\.(webp|jpg)$') or p_miniatura_ruta !~ ('^'||v_semana::text||'/'||v_actor::text||'/'||p_operacion::text||'/thumb\.(webp|jpg)$') then raise exception using errcode='22023',message='Las rutas de fotografía no son válidas.'; end if;
  insert into public.tianguis_fotos_sobrantes(idempotency_key,semana_domingo,ruta,miniatura_ruta,mime,subida_por) values(p_operacion,v_semana,p_ruta,p_miniatura_ruta,p_mime,v_actor) returning * into v_foto;
  return jsonb_build_object('ok',true,'id',v_foto.id,'idempotente',false);
exception when unique_violation then select * into v_foto from public.tianguis_fotos_sobrantes where idempotency_key=p_operacion; return jsonb_build_object('ok',true,'id',v_foto.id,'idempotente',true); end; $$;

create or replace function public.verificar_foto_tianguis(p_operacion uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid; v_foto public.tianguis_fotos_sobrantes%rowtype;
begin
  v_actor:=public.exigir_usuario_tianguis(); select * into v_foto from public.tianguis_fotos_sobrantes where idempotency_key=p_operacion and subida_por=v_actor;
  if not found then return null; end if;
  return jsonb_build_object('ok',true,'id',v_foto.id,'idempotente',true);
end; $$;

create or replace function public.retirar_foto_tianguis(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_foto public.tianguis_fotos_sobrantes%rowtype;
begin v_actor:=public.exigir_kikeadmin_tianguis(); select * into v_foto from public.tianguis_fotos_sobrantes where id=p_id and eliminada_at is null for update; if not found then raise exception using errcode='P0002',message='La fotografía no existe.'; end if; update public.tianguis_fotos_sobrantes set eliminada_at=clock_timestamp(),eliminada_por=v_actor where id=p_id; return jsonb_build_object('ok',true,'ruta',v_foto.ruta,'miniatura_ruta',v_foto.miniatura_ruta); end; $$;

create or replace function public.obtener_rutas_foto_tianguis(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid; v_foto public.tianguis_fotos_sobrantes%rowtype;
begin v_actor:=public.exigir_kikeadmin_tianguis(); select * into v_foto from public.tianguis_fotos_sobrantes where id=p_id and eliminada_at is null; if not found then raise exception using errcode='P0002',message='La fotografía no existe.'; end if; return jsonb_build_object('ruta',v_foto.ruta,'miniatura_ruta',v_foto.miniatura_ruta); end; $$;

revoke all on function public.domingo_semana_tianguis(date), public.exigir_usuario_tianguis(), public.es_kikeadmin_tianguis(), public.exigir_kikeadmin_tianguis(), public.asegurar_tareas_tianguis(date), public.obtener_preparacion_tianguis(date), public.marcar_vaciado_tianguis(date,boolean), public.marcar_tarea_tianguis(uuid,boolean), public.guardar_producto_tianguis(uuid,text,integer), public.retirar_producto_tianguis(uuid), public.registrar_foto_tianguis(uuid,date,text,text,text), public.verificar_foto_tianguis(uuid), public.retirar_foto_tianguis(uuid), public.obtener_rutas_foto_tianguis(uuid) from public,anon;
grant execute on function public.obtener_preparacion_tianguis(date), public.marcar_vaciado_tianguis(date,boolean), public.marcar_tarea_tianguis(uuid,boolean), public.guardar_producto_tianguis(uuid,text,integer), public.retirar_producto_tianguis(uuid), public.registrar_foto_tianguis(uuid,date,text,text,text), public.verificar_foto_tianguis(uuid), public.retirar_foto_tianguis(uuid), public.obtener_rutas_foto_tianguis(uuid) to authenticated;
commit;
