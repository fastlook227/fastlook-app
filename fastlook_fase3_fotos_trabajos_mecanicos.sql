-- FAST LOOK · Fotografías temporales para trabajos mecánicos.
-- Ejecutar manualmente después de fastlook_fase2_asistencias_comisiones.sql.
-- No borra trabajos ni imágenes al aplicar esta migración.
begin;

alter table public.trabajos_mecanicos
  add column if not exists foto_ruta text,
  add column if not exists foto_mime text,
  add column if not exists foto_expira_at timestamptz,
  add column if not exists foto_eliminada_at timestamptz;

alter table public.trabajos_mecanicos alter column descripcion drop not null;
alter table public.trabajos_mecanicos drop constraint if exists trabajos_mecanicos_descripcion_check;
alter table public.trabajos_mecanicos drop constraint if exists trabajos_mecanicos_contenido_check;
alter table public.trabajos_mecanicos add constraint trabajos_mecanicos_contenido_check
  check (length(btrim(coalesce(descripcion, ''))) > 0 or foto_ruta is not null);
alter table public.trabajos_mecanicos drop constraint if exists trabajos_mecanicos_foto_check;
alter table public.trabajos_mecanicos add constraint trabajos_mecanicos_foto_check check (
  (foto_ruta is null and foto_mime is null and foto_expira_at is null)
  or (foto_ruta is not null and foto_mime in ('image/webp', 'image/jpeg') and foto_expira_at is not null)
);
create index if not exists trabajos_mecanicos_fotos_expiracion_idx
  on public.trabajos_mecanicos (foto_expira_at) where foto_ruta is not null and foto_eliminada_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trabajos-mecanicos-temporales', 'trabajos-mecanicos-temporales', false, 1500000, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.es_admin_fotos_trabajos()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo = true and u.rol = 'Admin');
$$;
revoke all on function public.es_admin_fotos_trabajos() from public, anon;
grant execute on function public.es_admin_fotos_trabajos() to authenticated;

drop policy if exists "Admin lee fotos temporales de trabajos" on storage.objects;
drop policy if exists "Admin sube fotos temporales de trabajos" on storage.objects;
drop policy if exists "Admin borra fotos temporales de trabajos" on storage.objects;
create policy "Admin lee fotos temporales de trabajos" on storage.objects for select to authenticated
using (bucket_id = 'trabajos-mecanicos-temporales' and public.es_admin_fotos_trabajos());
create policy "Admin sube fotos temporales de trabajos" on storage.objects for insert to authenticated
with check (bucket_id = 'trabajos-mecanicos-temporales' and public.es_admin_fotos_trabajos());
create policy "Admin borra fotos temporales de trabajos" on storage.objects for delete to authenticated
using (bucket_id = 'trabajos-mecanicos-temporales' and public.es_admin_fotos_trabajos());

drop function if exists public.registrar_trabajo_mecanico(uuid, uuid, text, date, numeric);
create or replace function public.registrar_trabajo_mecanico(
  p_idempotency_key uuid, p_empleado_id uuid, p_descripcion text, p_fecha date,
  p_importe_mano_obra numeric, p_foto_ruta text, p_foto_mime text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_porcentaje numeric(5,2);
  v_trabajo public.trabajos_mecanicos%rowtype;
  v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_expira timestamptz;
begin
  v_actor := public.exigir_admin_checkin();
  if p_idempotency_key is null then raise exception using errcode = '22023', message = 'La clave de operación es obligatoria.'; end if;
  select * into v_trabajo from public.trabajos_mecanicos where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_trabajo.id); end if;
  if p_fecha is null or p_importe_mano_obra is null or p_importe_mano_obra < 0 or (v_descripcion is null and p_foto_ruta is null) then
    raise exception using errcode = '22023', message = 'Indica una descripción o fotografía y un importe válido.';
  end if;
  if not exists (select 1 from public.usuarios where id = p_empleado_id and activo = true and rol in ('Admin', 'Vendedor')) then
    raise exception using errcode = 'P0002', message = 'El empleado no existe o está inactivo.';
  end if;
  if p_foto_ruta is not null then
    if p_fecha <> (statement_timestamp() at time zone 'America/Mexico_City')::date
      or p_foto_mime not in ('image/webp', 'image/jpeg')
      or p_foto_ruta !~ ('^' || p_fecha::text || '/' || v_actor::text || '/[0-9a-f-]{36}\.(webp|jpg)$') then
      raise exception using errcode = '22023', message = 'La referencia de fotografía temporal no es válida.';
    end if;
    v_expira := ((p_fecha + 1)::timestamp at time zone 'America/Mexico_City');
  elsif p_foto_mime is not null then
    raise exception using errcode = '22023', message = 'La referencia de fotografía temporal está incompleta.';
  end if;
  select porcentaje into v_porcentaje from public.configuracion_comisiones where id = true for share;
  insert into public.trabajos_mecanicos
    (idempotency_key, empleado_id, descripcion, fecha, importe_mano_obra, porcentaje_aplicado, created_by, foto_ruta, foto_mime, foto_expira_at)
  values (p_idempotency_key, p_empleado_id, v_descripcion, p_fecha, p_importe_mano_obra, v_porcentaje, v_actor, p_foto_ruta, p_foto_mime, v_expira)
  returning * into v_trabajo;
  return jsonb_build_object('ok', true, 'idempotente', false, 'id', v_trabajo.id, 'comision', v_trabajo.comision);
exception when unique_violation then
  select * into v_trabajo from public.trabajos_mecanicos where idempotency_key = p_idempotency_key;
  return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_trabajo.id);
end;
$$;

-- Firma anterior conservada para clientes que todavía no envían fotografías.
create or replace function public.registrar_trabajo_mecanico(p_idempotency_key uuid, p_empleado_id uuid, p_descripcion text, p_fecha date, p_importe_mano_obra numeric)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select public.registrar_trabajo_mecanico(p_idempotency_key, p_empleado_id, p_descripcion, p_fecha, p_importe_mano_obra, null, null);
$$;

create or replace function public.obtener_trabajos_mecanicos(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid; v_resultado jsonb; v_porcentaje numeric(5,2); v_ahora timestamptz := statement_timestamp();
begin
  v_actor := public.exigir_admin_checkin();
  if p_desde is null or p_hasta is null or p_desde > p_hasta then raise exception using errcode = '22023', message = 'El periodo no es válido.'; end if;
  select porcentaje into v_porcentaje from public.configuracion_comisiones where id = true;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'empleado_id', t.empleado_id, 'empleado_nombre', u.nombre, 'descripcion', t.descripcion,
    'fecha', t.fecha, 'importe_mano_obra', t.importe_mano_obra, 'porcentaje_aplicado', t.porcentaje_aplicado,
    'comision', t.comision, 'estado', t.estado, 'created_at', t.created_at,
    'foto_ruta', case when t.foto_expira_at > v_ahora and t.foto_eliminada_at is null then t.foto_ruta else null end,
    'foto_expira_at', t.foto_expira_at, 'foto_eliminada_at', t.foto_eliminada_at
  ) order by t.fecha desc, t.created_at desc), '[]'::jsonb)
  into v_resultado from public.trabajos_mecanicos t join public.usuarios u on u.id = t.empleado_id where t.fecha between p_desde and p_hasta;
  return jsonb_build_object('porcentaje_actual', v_porcentaje, 'trabajos', v_resultado);
end;
$$;

create or replace function public.corregir_trabajo_mecanico(p_trabajo_id uuid, p_empleado_id uuid, p_descripcion text, p_fecha date, p_importe_mano_obra numeric, p_estado text, p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_anterior public.trabajos_mecanicos%rowtype; v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
begin
  v_actor := public.exigir_admin_checkin();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_trabajo_id::text));
  select * into v_anterior from public.trabajos_mecanicos where id = p_trabajo_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'El trabajo no existe.'; end if;
  if (v_descripcion is null and v_anterior.foto_ruta is null) or p_fecha is null or p_importe_mano_obra is null or p_importe_mano_obra < 0 or p_estado not in ('Pendiente', 'Pagada', 'Cancelada') or length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception using errcode = '22023', message = 'Los datos de corrección no son válidos.';
  end if;
  if not exists (select 1 from public.usuarios where id = p_empleado_id and activo = true and rol in ('Admin', 'Vendedor')) then raise exception using errcode = 'P0002', message = 'El empleado no existe o está inactivo.'; end if;
  if v_anterior.estado = 'Pagada' and p_estado = 'Pendiente' then raise exception using errcode = 'P0001', message = 'Una comisión pagada no puede volver a pendiente; registra una corrección explícita fuera de nómina.'; end if;
  insert into public.trabajos_mecanicos_correcciones (trabajo_id, datos_anteriores, motivo, corregido_por) values (v_anterior.id, to_jsonb(v_anterior), btrim(p_motivo), v_actor);
  update public.trabajos_mecanicos set empleado_id = p_empleado_id, descripcion = v_descripcion, fecha = p_fecha, importe_mano_obra = p_importe_mano_obra, estado = p_estado,
    pagada_at = case when p_estado = 'Pagada' then coalesce(pagada_at, clock_timestamp()) else null end, updated_at = clock_timestamp(), updated_by = v_actor
  where id = p_trabajo_id;
  return jsonb_build_object('ok', true, 'id', p_trabajo_id);
end;
$$;

revoke all on function public.registrar_trabajo_mecanico(uuid, uuid, text, date, numeric, text, text) from public, anon;
revoke all on function public.registrar_trabajo_mecanico(uuid, uuid, text, date, numeric) from public, anon;
grant execute on function public.registrar_trabajo_mecanico(uuid, uuid, text, date, numeric, text, text) to authenticated;
grant execute on function public.registrar_trabajo_mecanico(uuid, uuid, text, date, numeric) to authenticated;

commit;
