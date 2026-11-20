-- FAST LOOK · Catálogo externo de proveedores y vistas previas de importación.
-- Migración independiente para revisión manual. NO ha sido ejecutada por Codex.
-- No inserta ni actualiza public.productos, ventas, movimientos o históricos.
begin;

create table if not exists public.catalogo_proveedores (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave in ('REMO','CEDIS','AQUILA')),
  nombre text not null,
  nivel_compra text,
  activo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.catalogo_proveedores(clave,nombre) values
  ('REMO','REMO MOTOS'),('CEDIS','CEDIS'),('AQUILA','AQUILA MOTOPARTES')
on conflict (clave) do update set nombre=excluded.nombre;

create table if not exists public.catalogo_importaciones (
  id uuid primary key default gen_random_uuid(), proveedor_id uuid not null references public.catalogo_proveedores(id),
  archivo_nombre text not null, archivo_sha256 text not null, fecha_catalogo date,
  estado text not null default 'VISTA_PREVIA' check (estado in ('VISTA_PREVIA','REVISADA','PUBLICADA','CANCELADA')),
  resumen jsonb not null default '{}'::jsonb, creado_por uuid not null references public.usuarios(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(proveedor_id,archivo_sha256)
);
create table if not exists public.catalogo_importacion_lotes (
  importacion_id uuid not null references public.catalogo_importaciones(id) on delete cascade,
  lote_clave text not null, registros jsonb not null check (jsonb_typeof(registros)='array'),
  created_at timestamptz not null default now(), primary key(importacion_id,lote_clave)
);
create table if not exists public.catalogo_importacion_revision (
  id uuid primary key default gen_random_uuid(), importacion_id uuid not null references public.catalogo_importaciones(id) on delete cascade,
  proveedor_codigo text not null, nombre text not null, datos jsonb not null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','APROBADO','RECHAZADO')),
  ambiguo boolean not null default false, errores text[] not null default '{}', origen_pagina integer, origen_fila integer,
  revisado_por uuid references public.usuarios(id), revisado_at timestamptz,
  unique(importacion_id,proveedor_codigo,origen_pagina,origen_fila)
);

create table if not exists public.catalogo_productos (
  id uuid primary key default gen_random_uuid(), proveedor_id uuid not null references public.catalogo_proveedores(id),
  codigo_original text not null, codigo_barras text, nombre text not null, descripcion text not null default '',
  categoria text not null default '', marca text not null default '', compatibilidades text[] not null default '{}',
  variantes text[] not null default '{}', ambiguo boolean not null default false,
  imagen_url text, imagen_thumbnail_url text, origen_archivo text not null, origen_pagina integer, origen_fila integer,
  ultima_importacion_id uuid not null references public.catalogo_importaciones(id),
  precio_actualizado_at timestamptz, activo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(proveedor_id,codigo_original)
);
create table if not exists public.catalogo_ofertas (
  id uuid primary key default gen_random_uuid(), catalogo_producto_id uuid not null references public.catalogo_productos(id) on delete cascade,
  importacion_id uuid not null references public.catalogo_importaciones(id), nivel text not null,
  descuento_porcentaje numeric(5,2) not null check (descuento_porcentaje between 0 and 100),
  costo_efectivo numeric(12,2) not null check (costo_efectivo >= 0),
  precio_sugerido numeric(12,2) generated always as (round(costo_efectivo * 1.30,2)) stored,
  vigente_desde date, activo boolean not null default true, created_at timestamptz not null default now(),
  unique(catalogo_producto_id,importacion_id,nivel)
);
create table if not exists public.catalogo_vinculos_inventario (
  catalogo_producto_id uuid primary key references public.catalogo_productos(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  confirmado_por uuid not null references public.usuarios(id), created_at timestamptz not null default now(),
  unique(producto_id,catalogo_producto_id)
);
create table if not exists public.catalogo_codigos_alternativos (
  id uuid primary key default gen_random_uuid(), catalogo_producto_id uuid not null references public.catalogo_productos(id) on delete cascade,
  codigo text not null, tipo text not null check (tipo in ('BARRAS','REFERENCIA','VARIANTE')),
  verificado boolean not null default false, creado_por uuid references public.usuarios(id), created_at timestamptz not null default now(),
  unique(catalogo_producto_id,codigo,tipo)
);

create index if not exists catalogo_productos_busqueda_idx on public.catalogo_productos(proveedor_id,activo,codigo_original);
create index if not exists catalogo_productos_barcode_idx on public.catalogo_productos(codigo_barras) where codigo_barras is not null and ambiguo=false;
create index if not exists catalogo_revision_estado_idx on public.catalogo_importacion_revision(importacion_id,estado,ambiguo);

alter table public.catalogo_proveedores enable row level security;
alter table public.catalogo_importaciones enable row level security;
alter table public.catalogo_importacion_lotes enable row level security;
alter table public.catalogo_importacion_revision enable row level security;
alter table public.catalogo_productos enable row level security;
alter table public.catalogo_ofertas enable row level security;
alter table public.catalogo_vinculos_inventario enable row level security;
alter table public.catalogo_codigos_alternativos enable row level security;
revoke all on table public.catalogo_proveedores,public.catalogo_importaciones,public.catalogo_importacion_lotes,
  public.catalogo_importacion_revision,public.catalogo_productos,public.catalogo_ofertas,
  public.catalogo_vinculos_inventario,public.catalogo_codigos_alternativos from anon,authenticated;

create or replace function public.iniciar_importacion_catalogo(p_proveedor text,p_archivo text,p_sha256 text,p_fecha date)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_proveedor uuid; v_id uuid;
begin
  if v_actor is null then raise exception using errcode='42501',message='SIN_SESION: Se requiere sesión.'; end if;
  if not exists(select 1 from public.usuarios u where u.id=v_actor and u.activo=true and u.rol='Admin') then raise exception using errcode='42501',message='ROL_NO_PERMITIDO: Sólo Admin importa catálogos.'; end if;
  if nullif(btrim(p_archivo),'') is null or p_sha256 !~ '^[0-9a-fA-F]{64}$' then raise exception using errcode='22023',message='IMPORTACION_INVALIDA: Archivo o SHA-256 inválido.'; end if;
  select id into v_proveedor from public.catalogo_proveedores where clave=upper(btrim(p_proveedor)) and activo=true;
  if v_proveedor is null then raise exception using errcode='22023',message='PROVEEDOR_INVALIDO: Proveedor no configurado.'; end if;
  insert into public.catalogo_importaciones(proveedor_id,archivo_nombre,archivo_sha256,fecha_catalogo,creado_por)
  values(v_proveedor,btrim(p_archivo),lower(p_sha256),p_fecha,v_actor)
  on conflict(proveedor_id,archivo_sha256) do update set updated_at=now() returning id into v_id;
  return v_id;
end; $$;

create or replace function public.cargar_lote_importacion_catalogo(p_importacion_id uuid,p_lote_clave text,p_registros jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_reg jsonb; v_total integer:=0; v_ambiguos integer:=0; v_errores integer:=0; v_codigo text; v_nombre text; v_err text[];
begin
  if not exists(select 1 from public.usuarios u where u.id=v_actor and u.activo=true and u.rol='Admin') then raise exception using errcode='42501',message='ROL_NO_PERMITIDO: Sólo Admin importa catálogos.'; end if;
  if not exists(select 1 from public.catalogo_importaciones where id=p_importacion_id and estado='VISTA_PREVIA') then raise exception using errcode='22023',message='IMPORTACION_INVALIDA: La vista previa no está disponible.'; end if;
  if jsonb_typeof(p_registros) is distinct from 'array' or jsonb_array_length(p_registros)>500 then raise exception using errcode='22023',message='LOTE_INVALIDO: Cada lote admite hasta 500 registros.'; end if;
  insert into public.catalogo_importacion_lotes(importacion_id,lote_clave,registros) values(p_importacion_id,p_lote_clave,p_registros)
  on conflict(importacion_id,lote_clave) do nothing;
  if not found then return jsonb_build_object('ok',true,'idempotente',true); end if;
  for v_reg in select value from jsonb_array_elements(p_registros) loop
    v_total:=v_total+1; v_codigo:=btrim(coalesce(v_reg->>'codigoOriginal','')); v_nombre:=btrim(coalesce(v_reg->>'nombre','')); v_err:='{}';
    if v_codigo='' then v_err:=array_append(v_err,'Código original vacío'); end if;
    if v_nombre='' then v_err:=array_append(v_err,'Nombre vacío'); end if;
    if jsonb_typeof(v_reg->'escalas') is distinct from 'array' or jsonb_array_length(v_reg->'escalas')=0 then v_err:=array_append(v_err,'Sin escala de costo'); end if;
    insert into public.catalogo_importacion_revision(importacion_id,proveedor_codigo,nombre,datos,ambiguo,errores,origen_pagina,origen_fila)
    values(p_importacion_id,v_codigo,v_nombre,v_reg,coalesce((v_reg->>'ambiguo')::boolean,false) or v_codigo ~ '[*()]',v_err,nullif(v_reg->>'origenPagina','')::integer,nullif(v_reg->>'origenFila','')::integer)
    on conflict(importacion_id,proveedor_codigo,origen_pagina,origen_fila) do nothing;
    if coalesce((v_reg->>'ambiguo')::boolean,false) or v_codigo ~ '[*()]' then v_ambiguos:=v_ambiguos+1; end if;
    if cardinality(v_err)>0 then v_errores:=v_errores+1; end if;
  end loop;
  update public.catalogo_importaciones set resumen=jsonb_build_object('encontrados',v_total,'ambiguos',v_ambiguos,'con_errores',v_errores),updated_at=now() where id=p_importacion_id;
  return jsonb_build_object('ok',true,'idempotente',false,'encontrados',v_total,'ambiguos',v_ambiguos,'con_errores',v_errores);
end; $$;

create or replace function public.obtener_catalogo_proveedores(p_busqueda text default '',p_proveedor text default null,p_limite integer default 60,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_admin boolean; v_productos jsonb; v_proveedores jsonb;
begin
  select u.rol='Admin' into v_admin from public.usuarios u where u.id=v_actor and u.activo=true and u.rol in('Admin','Vendedor');
  if not found then raise exception using errcode='42501',message='ROL_NO_PERMITIDO: Perfil no autorizado.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'proveedor_id',pr.id,'proveedor_clave',pr.clave,'proveedor_nombre',pr.nombre,
    'codigo_original',p.codigo_original,'codigo_barras',p.codigo_barras,'nombre',p.nombre,'descripcion',p.descripcion,'categoria',p.categoria,
    'marca',p.marca,'compatibilidades',p.compatibilidades,'variantes',p.variantes,'imagen_url',p.imagen_url,'imagen_thumbnail_url',p.imagen_thumbnail_url,
    'ambiguo',p.ambiguo,'inventario_producto_id',v.producto_id,'inventario_precio',i.precio,'precio_venta_sugerido',o.precio_sugerido,
    'precio_actualizado_at',p.precio_actualizado_at,'ofertas',case when v_admin then coalesce(ofs.ofertas,'[]'::jsonb) else '[]'::jsonb end)),'[]'::jsonb)
  into v_productos from (select cp.* from public.catalogo_productos cp join public.catalogo_proveedores x on x.id=cp.proveedor_id
    where cp.activo=true and (p_proveedor is null or x.clave=upper(p_proveedor)) and (coalesce(p_busqueda,'')='' or
      cp.codigo_original ilike '%'||p_busqueda||'%' or cp.nombre ilike '%'||p_busqueda||'%' or cp.descripcion ilike '%'||p_busqueda||'%' or cp.categoria ilike '%'||p_busqueda||'%' or cp.marca ilike '%'||p_busqueda||'%')
    order by cp.nombre limit greatest(1,least(p_limite,100)) offset greatest(p_offset,0)) p
  join public.catalogo_proveedores pr on pr.id=p.proveedor_id
  left join public.catalogo_vinculos_inventario v on v.catalogo_producto_id=p.id left join public.productos i on i.id=v.producto_id
  left join lateral(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'nivel',x.nivel,'descuento_porcentaje',x.descuento_porcentaje,'costo_efectivo',x.costo_efectivo,'precio_sugerido',x.precio_sugerido,'vigente_desde',x.vigente_desde) order by x.costo_efectivo),'[]'::jsonb) ofertas from public.catalogo_ofertas x where x.catalogo_producto_id=p.id and x.activo=true) ofs on true
  left join lateral(select x.precio_sugerido from public.catalogo_ofertas x where x.catalogo_producto_id=p.id and x.activo=true order by case when x.nivel=coalesce(pr.nivel_compra,'BASE') then 0 else 1 end,x.costo_efectivo desc limit 1) o on true;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'clave',clave,'nombre',nombre,'nivel_compra',case when v_admin then nivel_compra else null end) order by nombre),'[]'::jsonb) into v_proveedores from public.catalogo_proveedores where activo=true;
  return jsonb_build_object('productos',v_productos,'proveedores',v_proveedores,'es_admin',v_admin);
end; $$;

create or replace function public.revisar_registro_importacion_catalogo(p_registro_id uuid,p_aprobar boolean)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if not exists(select 1 from public.usuarios u where u.id=v_actor and u.activo=true and u.rol='Admin') then raise exception using errcode='42501',message='ROL_NO_PERMITIDO: Sólo Admin revisa catálogos.'; end if;
  update public.catalogo_importacion_revision set estado=case when p_aprobar then 'APROBADO' else 'RECHAZADO' end,revisado_por=v_actor,revisado_at=now() where id=p_registro_id and estado='PENDIENTE';
  if not found then raise exception using errcode='P0002',message='REGISTRO_INEXISTENTE: El registro no existe o ya fue revisado.'; end if;
end; $$;

create or replace function public.publicar_importacion_catalogo(p_importacion_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_revision public.catalogo_importacion_revision%rowtype; v_importacion public.catalogo_importaciones%rowtype; v_producto uuid; v_escala jsonb; v_publicados integer:=0;
begin
  if not exists(select 1 from public.usuarios u where u.id=v_actor and u.activo=true and u.rol='Admin') then raise exception using errcode='42501',message='ROL_NO_PERMITIDO: Sólo Admin publica catálogos.'; end if;
  select * into v_importacion from public.catalogo_importaciones where id=p_importacion_id for update;
  if not found or v_importacion.estado not in('VISTA_PREVIA','REVISADA') then raise exception using errcode='22023',message='IMPORTACION_INVALIDA: La importación no puede publicarse.'; end if;
  if exists(select 1 from public.catalogo_importacion_revision where importacion_id=p_importacion_id and estado='PENDIENTE') then raise exception using errcode='22023',message='REVISION_PENDIENTE: Todos los registros deben aprobarse o rechazarse.'; end if;
  for v_revision in select * from public.catalogo_importacion_revision where importacion_id=p_importacion_id and estado='APROBADO' and cardinality(errores)=0 loop
    insert into public.catalogo_productos(proveedor_id,codigo_original,codigo_barras,nombre,descripcion,categoria,marca,compatibilidades,variantes,ambiguo,origen_archivo,origen_pagina,origen_fila,ultima_importacion_id,precio_actualizado_at)
    values(v_importacion.proveedor_id,v_revision.proveedor_codigo,case when v_revision.ambiguo then null else nullif(btrim(v_revision.datos->>'codigoBarras'),'') end,v_revision.nombre,coalesce(v_revision.datos->>'descripcion',''),coalesce(v_revision.datos->>'categoria',''),coalesce(v_revision.datos->>'marca',''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_revision.datos->'compatibilidades','[]'::jsonb))),'{}'),coalesce(array(select jsonb_array_elements_text(coalesce(v_revision.datos->'variantes','[]'::jsonb))),'{}'),v_revision.ambiguo,v_importacion.archivo_nombre,v_revision.origen_pagina,v_revision.origen_fila,p_importacion_id,now())
    on conflict(proveedor_id,codigo_original) do update set nombre=excluded.nombre,descripcion=excluded.descripcion,categoria=excluded.categoria,marca=excluded.marca,compatibilidades=excluded.compatibilidades,variantes=excluded.variantes,ambiguo=excluded.ambiguo,
      codigo_barras=case when excluded.ambiguo then public.catalogo_productos.codigo_barras else coalesce(excluded.codigo_barras,public.catalogo_productos.codigo_barras) end,
      origen_archivo=excluded.origen_archivo,origen_pagina=excluded.origen_pagina,origen_fila=excluded.origen_fila,ultima_importacion_id=excluded.ultima_importacion_id,precio_actualizado_at=now(),updated_at=now()
    returning id into v_producto;
    for v_escala in select value from jsonb_array_elements(v_revision.datos->'escalas') loop
      insert into public.catalogo_ofertas(catalogo_producto_id,importacion_id,nivel,descuento_porcentaje,costo_efectivo,vigente_desde)
      values(v_producto,p_importacion_id,btrim(v_escala->>'nivel'),(v_escala->>'descuentoPorcentaje')::numeric,(v_escala->>'costoEfectivo')::numeric,v_importacion.fecha_catalogo)
      on conflict(catalogo_producto_id,importacion_id,nivel) do nothing;
    end loop;
    v_publicados:=v_publicados+1;
  end loop;
  update public.catalogo_importaciones set estado='PUBLICADA',resumen=resumen||jsonb_build_object('publicados',v_publicados),updated_at=now() where id=p_importacion_id;
  return jsonb_build_object('ok',true,'publicados',v_publicados);
end; $$;

create or replace function public.configurar_nivel_catalogo_proveedor(p_proveedor text,p_nivel text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if not exists(select 1 from public.usuarios u where u.id=v_actor and u.activo=true and u.rol='Admin') then raise exception using errcode='42501',message='ROL_NO_PERMITIDO: Sólo Admin configura costos.'; end if;
  update public.catalogo_proveedores set nivel_compra=nullif(btrim(p_nivel),''),updated_at=now() where clave=upper(btrim(p_proveedor));
  if not found then raise exception using errcode='P0002',message='PROVEEDOR_INEXISTENTE: Proveedor no configurado.'; end if;
end; $$;

create or replace function public.vincular_catalogo_inventario(p_catalogo_producto_id uuid,p_producto_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if not exists(select 1 from public.usuarios u where u.id=v_actor and u.activo=true and u.rol='Admin') then raise exception using errcode='42501',message='ROL_NO_PERMITIDO: Sólo Admin vincula inventario.'; end if;
  if not exists(select 1 from public.productos where id=p_producto_id and coalesce(archivado,false)=false) then raise exception using errcode='P0002',message='PRODUCTO_INEXISTENTE: Producto local no disponible.'; end if;
  insert into public.catalogo_vinculos_inventario(catalogo_producto_id,producto_id,confirmado_por) values(p_catalogo_producto_id,p_producto_id,v_actor)
  on conflict(catalogo_producto_id) do update set producto_id=excluded.producto_id,confirmado_por=v_actor,created_at=now();
end; $$;

revoke all on function public.iniciar_importacion_catalogo(text,text,text,date) from public,anon;
revoke all on function public.cargar_lote_importacion_catalogo(uuid,text,jsonb) from public,anon;
revoke all on function public.obtener_catalogo_proveedores(text,text,integer,integer) from public,anon;
grant execute on function public.iniciar_importacion_catalogo(text,text,text,date) to authenticated;
grant execute on function public.cargar_lote_importacion_catalogo(uuid,text,jsonb) to authenticated;
grant execute on function public.obtener_catalogo_proveedores(text,text,integer,integer) to authenticated;
revoke all on function public.revisar_registro_importacion_catalogo(uuid,boolean) from public,anon;
revoke all on function public.publicar_importacion_catalogo(uuid) from public,anon;
revoke all on function public.configurar_nivel_catalogo_proveedor(text,text) from public,anon;
revoke all on function public.vincular_catalogo_inventario(uuid,uuid) from public,anon;
grant execute on function public.revisar_registro_importacion_catalogo(uuid,boolean) to authenticated;
grant execute on function public.publicar_importacion_catalogo(uuid) to authenticated;
grant execute on function public.configurar_nivel_catalogo_proveedor(text,text) to authenticated;
grant execute on function public.vincular_catalogo_inventario(uuid,uuid) to authenticated;
commit;
