-- FAST LOOK · Entregas próximas. Ejecutar después de fastlook_reorganizacion_checkin_nomina.sql.
begin;

create table if not exists public.entregas_proximas (
  id uuid primary key default gen_random_uuid(), idempotency_key uuid not null unique,
  productos text not null, cliente_nombre text not null, facebook_url text, telefono text,
  fecha_entrega date not null, hora_entrega time not null, programada_at timestamptz not null,
  fecha_original date not null, hora_original time not null,
  ubicacion text not null, maps_url text, precio_acordado numeric(12,2), anticipo numeric(12,2), observaciones text,
  acordada_por uuid not null references public.usuarios(id), repartidor_id uuid references public.usuarios(id),
  asignacion_confirmada_at timestamptz,
  estado text not null default 'Pendiente de confirmación' check (estado in ('Pendiente de confirmación','Confirmada','Preparando pedido','En camino','Repartidor en el punto','Entregada','Cancelada','Reprogramada')),
  motivo_cancelacion text, recordatorio_generado_at timestamptz,
  confirmacion_estado text not null default 'No preparado' check (confirmacion_estado in ('No preparado','Mensaje preparado','Mensaje enviado','Respuesta confirmada')),
  confirmacion_solicitada_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid not null references public.usuarios(id),
  constraint entrega_productos_validos check (char_length(btrim(productos)) between 1 and 1000),
  constraint entrega_cliente_valido check (char_length(btrim(cliente_nombre)) between 1 and 160),
  constraint entrega_ubicacion_valida check (char_length(btrim(ubicacion)) between 1 and 500),
  constraint entrega_contacto_requerido check (nullif(btrim(coalesce(facebook_url,'')),'') is not null or nullif(btrim(coalesce(telefono,'')),'') is not null),
  constraint entrega_importes_validos check ((precio_acordado is null or precio_acordado >= 0) and (anticipo is null or anticipo >= 0) and (precio_acordado is null or anticipo is null or anticipo <= precio_acordado)),
  constraint entrega_cancelacion_motivo check (estado <> 'Cancelada' or nullif(btrim(coalesce(motivo_cancelacion,'')),'') is not null)
);
create index if not exists entregas_activas_fecha_idx on public.entregas_proximas(programada_at) where estado not in ('Entregada','Cancelada');
create index if not exists entregas_repartidor_idx on public.entregas_proximas(repartidor_id,programada_at);

create table if not exists public.entregas_eventos (
  id uuid primary key default gen_random_uuid(), entrega_id uuid not null references public.entregas_proximas(id) on delete restrict,
  tipo text not null, estado_anterior text, estado_nuevo text, detalle text,
  fecha_anterior date, hora_anterior time, fecha_nueva date, hora_nueva time,
  responsable_id uuid not null references public.usuarios(id), created_at timestamptz not null default now()
);
create index if not exists entregas_eventos_entrega_idx on public.entregas_eventos(entrega_id,created_at);

alter table public.entregas_proximas enable row level security;
alter table public.entregas_eventos enable row level security;
revoke all on table public.entregas_proximas, public.entregas_eventos from anon,authenticated;

create or replace function public.exigir_usuario_entregas()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); begin
  if v_actor is null or not exists(select 1 from public.usuarios where id=v_actor and activo=true and rol in ('Admin','Vendedor')) then raise exception using errcode='42501',message='USUARIO_NO_AUTORIZADO: Inicia sesión con un usuario activo.'; end if;
  return v_actor;
end; $$;

create or replace function public.es_kikeadmin_entregas()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.configuracion_kikeadmin c join public.usuarios u on u.id=c.usuario_id where c.id=true and c.usuario_id=auth.uid() and u.activo=true and u.rol='Admin');
$$;

create or replace function public.crear_entrega_proxima(p_idempotency_key uuid,p_productos text,p_cliente_nombre text,p_facebook_url text,p_telefono text,p_fecha date,p_hora time,p_ubicacion text,p_maps_url text,p_precio numeric,p_anticipo numeric,p_observaciones text,p_repartidor_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid; v_entrega public.entregas_proximas%rowtype; v_programada timestamptz;
begin
 v_actor:=public.exigir_usuario_entregas();
 if p_idempotency_key is null then raise exception using errcode='22023',message='La clave de operación es obligatoria.'; end if;
 select * into v_entrega from public.entregas_proximas where idempotency_key=p_idempotency_key; if found then return jsonb_build_object('ok',true,'id',v_entrega.id,'idempotente',true); end if;
 if nullif(btrim(coalesce(p_productos,'')),'') is null or nullif(btrim(coalesce(p_cliente_nombre,'')),'') is null or nullif(btrim(coalesce(p_ubicacion,'')),'') is null or p_fecha is null or p_hora is null then raise exception using errcode='22023',message='Completa producto, cliente, fecha, hora y punto de entrega.'; end if;
 if nullif(btrim(coalesce(p_facebook_url,'')),'') is null and nullif(btrim(coalesce(p_telefono,'')),'') is null then raise exception using errcode='22023',message='Indica teléfono o enlace de contacto.'; end if;
 if p_precio<0 or p_anticipo<0 or (p_precio is not null and p_anticipo>p_precio) then raise exception using errcode='22023',message='Los importes no son válidos.'; end if;
 if p_repartidor_id is not null and not exists(select 1 from public.usuarios where id=p_repartidor_id and activo=true and rol in ('Admin','Vendedor')) then raise exception using errcode='P0002',message='El repartidor no está activo.'; end if;
 v_programada:=(p_fecha+p_hora) at time zone 'America/Mexico_City';
 insert into public.entregas_proximas(idempotency_key,productos,cliente_nombre,facebook_url,telefono,fecha_entrega,hora_entrega,programada_at,fecha_original,hora_original,ubicacion,maps_url,precio_acordado,anticipo,observaciones,acordada_por,repartidor_id,updated_by)
 values(p_idempotency_key,btrim(p_productos),btrim(p_cliente_nombre),nullif(btrim(coalesce(p_facebook_url,'')),''),nullif(btrim(coalesce(p_telefono,'')),''),p_fecha,p_hora,v_programada,p_fecha,p_hora,btrim(p_ubicacion),nullif(btrim(coalesce(p_maps_url,'')),''),p_precio,p_anticipo,nullif(btrim(coalesce(p_observaciones,'')),''),v_actor,p_repartidor_id,v_actor) returning * into v_entrega;
 insert into public.entregas_eventos(entrega_id,tipo,estado_nuevo,detalle,responsable_id) values(v_entrega.id,'Creación',v_entrega.estado,'Entrega registrada.',v_actor);
 return jsonb_build_object('ok',true,'id',v_entrega.id,'idempotente',false);
exception when unique_violation then select * into v_entrega from public.entregas_proximas where idempotency_key=p_idempotency_key; return jsonb_build_object('ok',true,'id',v_entrega.id,'idempotente',true); end; $$;

create or replace function public.asignar_repartidor_entrega(p_entrega_id uuid,p_repartidor_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid; v_entrega public.entregas_proximas%rowtype; v_nombre text;
begin v_actor:=public.exigir_usuario_entregas(); select * into v_entrega from public.entregas_proximas where id=p_entrega_id for update; if not found then raise exception using errcode='P0002',message='La entrega no existe.'; end if;
 if v_entrega.estado in ('Entregada','Cancelada') then raise exception using errcode='P0001',message='La entrega ya está finalizada.'; end if;
 if v_entrega.repartidor_id is not null and v_entrega.repartidor_id is distinct from p_repartidor_id and not public.es_kikeadmin_entregas() then raise exception using errcode='42501',message='Sólo KIKEADMIN puede reasignar un repartidor.'; end if;
 select nombre into v_nombre from public.usuarios where id=p_repartidor_id and activo=true and rol in ('Admin','Vendedor'); if not found then raise exception using errcode='P0002',message='El repartidor no está activo.'; end if;
 update public.entregas_proximas set repartidor_id=p_repartidor_id,asignacion_confirmada_at=null,updated_at=clock_timestamp(),updated_by=v_actor where id=p_entrega_id;
 insert into public.entregas_eventos(entrega_id,tipo,detalle,responsable_id) values(p_entrega_id,'Asignación','Repartidor asignado: '||v_nombre,v_actor); return jsonb_build_object('ok',true); end; $$;

create or replace function public.confirmar_asignacion_entrega(p_entrega_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid; begin v_actor:=public.exigir_usuario_entregas(); update public.entregas_proximas set asignacion_confirmada_at=coalesce(asignacion_confirmada_at,clock_timestamp()),updated_at=clock_timestamp(),updated_by=v_actor where id=p_entrega_id and (repartidor_id=v_actor or public.es_kikeadmin_entregas()) and estado not in ('Entregada','Cancelada'); if not found then raise exception using errcode='42501',message='Sólo el repartidor asignado puede confirmar la asignación.'; end if; insert into public.entregas_eventos(entrega_id,tipo,detalle,responsable_id) values(p_entrega_id,'Asignación confirmada','El repartidor confirmó que recibió la asignación.',v_actor); return jsonb_build_object('ok',true); end; $$;

create or replace function public.cambiar_estado_entrega(p_entrega_id uuid,p_estado text,p_motivo text default null,p_fecha_nueva date default null,p_hora_nueva time default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid; v_entrega public.entregas_proximas%rowtype; v_anterior text;
begin v_actor:=public.exigir_usuario_entregas(); perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_entrega_id::text)); select * into v_entrega from public.entregas_proximas where id=p_entrega_id for update; if not found then raise exception using errcode='P0002',message='La entrega no existe.'; end if;
 if p_estado not in ('Pendiente de confirmación','Confirmada','Preparando pedido','En camino','Repartidor en el punto','Entregada','Cancelada','Reprogramada') then raise exception using errcode='22023',message='El estado no es válido.'; end if;
 if v_entrega.estado in ('Entregada','Cancelada') and not public.es_kikeadmin_entregas() then raise exception using errcode='42501',message='Sólo KIKEADMIN puede corregir una entrega finalizada.'; end if;
 if p_estado in ('En camino','Repartidor en el punto','Entregada') and not (v_entrega.repartidor_id=v_actor or public.es_kikeadmin_entregas()) then raise exception using errcode='42501',message='Esta acción corresponde al repartidor asignado.'; end if;
 if p_estado='Cancelada' and nullif(btrim(coalesce(p_motivo,'')),'') is null then raise exception using errcode='22023',message='El motivo de cancelación es obligatorio.'; end if;
 if p_estado='Reprogramada' and (p_fecha_nueva is null or p_hora_nueva is null or nullif(btrim(coalesce(p_motivo,'')),'') is null) then raise exception using errcode='22023',message='Indica nueva fecha, hora y motivo.'; end if;
 v_anterior:=v_entrega.estado;
 if p_estado='Reprogramada' then update public.entregas_proximas set estado=p_estado,fecha_entrega=p_fecha_nueva,hora_entrega=p_hora_nueva,programada_at=(p_fecha_nueva+p_hora_nueva) at time zone 'America/Mexico_City',recordatorio_generado_at=null,confirmacion_estado='No preparado',confirmacion_solicitada_at=null,updated_at=clock_timestamp(),updated_by=v_actor where id=p_entrega_id;
 else update public.entregas_proximas set estado=p_estado,motivo_cancelacion=case when p_estado='Cancelada' then btrim(p_motivo) else motivo_cancelacion end,updated_at=clock_timestamp(),updated_by=v_actor where id=p_entrega_id; end if;
 insert into public.entregas_eventos(entrega_id,tipo,estado_anterior,estado_nuevo,detalle,fecha_anterior,hora_anterior,fecha_nueva,hora_nueva,responsable_id) values(p_entrega_id,case when p_estado='Reprogramada' then 'Reprogramación' else 'Cambio de estado' end,v_anterior,p_estado,nullif(btrim(coalesce(p_motivo,'')),''),v_entrega.fecha_entrega,v_entrega.hora_entrega,p_fecha_nueva,p_hora_nueva,v_actor);
 return jsonb_build_object('ok',true); end; $$;

create or replace function public.registrar_comunicacion_entrega(p_entrega_id uuid,p_estado text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid; begin v_actor:=public.exigir_usuario_entregas(); if p_estado not in ('Mensaje preparado','Mensaje enviado','Respuesta confirmada') then raise exception using errcode='22023',message='El estado de comunicación no es válido.'; end if; update public.entregas_proximas set confirmacion_estado=p_estado,confirmacion_solicitada_at=case when p_estado in ('Mensaje enviado','Respuesta confirmada') then coalesce(confirmacion_solicitada_at,clock_timestamp()) else confirmacion_solicitada_at end,estado=case when p_estado='Respuesta confirmada' and estado in ('Pendiente de confirmación','Reprogramada') then 'Confirmada' else estado end,updated_at=clock_timestamp(),updated_by=v_actor where id=p_entrega_id and estado not in ('Entregada','Cancelada'); if not found then raise exception using errcode='P0002',message='La entrega no está activa.'; end if; insert into public.entregas_eventos(entrega_id,tipo,detalle,responsable_id) values(p_entrega_id,'Comunicación',p_estado,v_actor); return jsonb_build_object('ok',true); end; $$;

create or replace function public.json_entrega_proxima(p_entrega public.entregas_proximas)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p_entrega.id,'productos',p_entrega.productos,'cliente_nombre',p_entrega.cliente_nombre,'facebook_url',p_entrega.facebook_url,'telefono',p_entrega.telefono,'fecha_entrega',p_entrega.fecha_entrega,'hora_entrega',p_entrega.hora_entrega,'fecha_hora_iso',p_entrega.programada_at,'fecha_original',p_entrega.fecha_original,'hora_original',p_entrega.hora_original,'ubicacion',p_entrega.ubicacion,'maps_url',p_entrega.maps_url,'precio_acordado',p_entrega.precio_acordado,'anticipo',p_entrega.anticipo,'observaciones',p_entrega.observaciones,'acordada_por',p_entrega.acordada_por,'acordada_por_nombre',a.nombre,'repartidor_id',p_entrega.repartidor_id,'repartidor_nombre',r.nombre,'asignacion_confirmada_at',p_entrega.asignacion_confirmada_at,'estado',p_entrega.estado,'motivo_cancelacion',p_entrega.motivo_cancelacion,'recordatorio_generado_at',p_entrega.recordatorio_generado_at,'confirmacion_estado',p_entrega.confirmacion_estado,'confirmacion_solicitada_at',p_entrega.confirmacion_solicitada_at,'created_at',p_entrega.created_at,'updated_at',p_entrega.updated_at,'eventos',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'tipo',ev.tipo,'estado_anterior',ev.estado_anterior,'estado_nuevo',ev.estado_nuevo,'detalle',ev.detalle,'created_at',ev.created_at,'responsable_id',ev.responsable_id,'responsable_nombre',u.nombre) order by ev.created_at desc) from public.entregas_eventos ev join public.usuarios u on u.id=ev.responsable_id where ev.entrega_id=p_entrega.id),'[]'::jsonb)) from public.usuarios a left join public.usuarios r on r.id=p_entrega.repartidor_id where a.id=p_entrega.acordada_por;
$$;

-- json_entrega_proxima debe existir antes de recompilar el panel en instalaciones nuevas.
create or replace function public.obtener_panel_entregas()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid; v_ahora timestamptz:=statement_timestamp(); v_activas jsonb; v_historial jsonb; v_usuarios jsonb;
begin v_actor:=public.exigir_usuario_entregas(); update public.entregas_proximas set recordatorio_generado_at=coalesce(recordatorio_generado_at,v_ahora),updated_at=case when recordatorio_generado_at is null then clock_timestamp() else updated_at end where estado in ('Pendiente de confirmación','Reprogramada') and confirmacion_estado<>'Respuesta confirmada' and programada_at<=v_ahora+interval '30 minutes'; select coalesce(jsonb_agg(public.json_entrega_proxima(e) order by e.programada_at),'[]'::jsonb) into v_activas from public.entregas_proximas e where e.estado not in ('Entregada','Cancelada'); select coalesce(jsonb_agg(public.json_entrega_proxima(e) order by e.programada_at desc),'[]'::jsonb) into v_historial from public.entregas_proximas e where e.estado in ('Entregada','Cancelada'); select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'nombre',u.nombre) order by u.nombre),'[]'::jsonb) into v_usuarios from public.usuarios u where u.activo=true and u.rol in ('Admin','Vendedor'); return jsonb_build_object('ahora',v_ahora,'es_kikeadmin',public.es_kikeadmin_entregas(),'entregas',v_activas,'historial',v_historial,'usuarios',v_usuarios); end; $$;

revoke all on function public.exigir_usuario_entregas(),public.es_kikeadmin_entregas(),public.crear_entrega_proxima(uuid,text,text,text,text,date,time,text,text,numeric,numeric,text,uuid),public.asignar_repartidor_entrega(uuid,uuid),public.confirmar_asignacion_entrega(uuid),public.cambiar_estado_entrega(uuid,text,text,date,time),public.registrar_comunicacion_entrega(uuid,text),public.json_entrega_proxima(public.entregas_proximas),public.obtener_panel_entregas() from public,anon;
grant execute on function public.crear_entrega_proxima(uuid,text,text,text,text,date,time,text,text,numeric,numeric,text,uuid),public.asignar_repartidor_entrega(uuid,uuid),public.confirmar_asignacion_entrega(uuid),public.cambiar_estado_entrega(uuid,text,text,date,time),public.registrar_comunicacion_entrega(uuid,text),public.obtener_panel_entregas() to authenticated;
commit;
