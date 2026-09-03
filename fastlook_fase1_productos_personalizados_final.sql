begin;

create table public.productos_personalizados (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  version_publicada_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.usuarios(id) on delete set null,

  constraint productos_personalizados_nombre_valido
    check (
      pg_catalog.char_length(pg_catalog.btrim(nombre)) between 1 and 120
    ),

  constraint productos_personalizados_descripcion_valida
    check (
      descripcion is null
      or pg_catalog.char_length(descripcion) <= 1000
    )
);

create table public.productos_personalizados_versiones (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  producto_personalizado_id uuid not null
    references public.productos_personalizados(id)
    on delete restrict,
  numero_version integer not null,
  estado text not null default 'BORRADOR',
  definicion jsonb not null,
  precio_base numeric(14,2) not null default 0,
  tipo_calculo text not null,
  permite_editar_precio boolean not null default false,
  politica_costo text not null,
  politica_devolucion text not null,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.usuarios(id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.usuarios(id) on delete set null,

  constraint productos_personalizados_version_numero_valido
    check (numero_version > 0),

  constraint productos_personalizados_version_estado_valido
    check (estado in ('BORRADOR', 'PUBLICADA')),

  constraint productos_personalizados_version_definicion_objeto
    check (pg_catalog.jsonb_typeof(definicion) = 'object'),

  constraint productos_personalizados_version_precio_base_valido
    check (precio_base between 0 and 999999999999.99),

  constraint productos_personalizados_version_tipo_calculo_valido
    check (
      tipo_calculo in (
        'precio_fijo',
        'precio_manual',
        'suma_referencias',
        'calculado_editable'
      )
    ),

  constraint productos_personalizados_version_politica_costo_valida
    check (
      politica_costo in (
        'sin_costo',
        'costo_fijo',
        'costo_calculado',
        'costo_manual',
        'suma_referencias'
      )
    ),

  constraint productos_personalizados_version_politica_devolucion_valida
    check (
      politica_devolucion in (
        'no_devolvible',
        'reembolso_sin_stock',
        'devolvible_configurable'
      )
    ),

  constraint productos_personalizados_version_publicacion_coherente
    check (
      (
        estado = 'BORRADOR'
        and published_at is null
        and published_by is null
      )
      or
      (
        estado = 'PUBLICADA'
        and published_at is not null
        and published_by is not null
      )
    ),

  constraint productos_personalizados_version_numero_unico
    unique (producto_personalizado_id, numero_version),

  constraint productos_personalizados_version_id_pertenencia_unica
    unique (producto_personalizado_id, id)
);

alter table public.productos_personalizados
  add constraint productos_personalizados_version_publicada_fk
  foreign key (id, version_publicada_id)
  references public.productos_personalizados_versiones
    (producto_personalizado_id, id)
  on delete restrict
  deferrable initially immediate;

create unique index productos_personalizados_nombre_normalizado_uidx
  on public.productos_personalizados
  (pg_catalog.lower(pg_catalog.btrim(nombre)));

create unique index productos_personalizados_un_borrador_uidx
  on public.productos_personalizados_versiones
  (producto_personalizado_id)
  where estado = 'BORRADOR';

create index productos_personalizados_versiones_plantilla_idx
  on public.productos_personalizados_versiones
  (producto_personalizado_id, numero_version desc);

create or replace function public.es_personal_fastlook_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios as u
    where u.id = auth.uid()
      and u.activo = true
  );
$$;

create or replace function public.es_admin_fastlook_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios as u
    where u.id = auth.uid()
      and u.activo = true
      and u.rol = 'Admin'
  );
$$;

create or replace function public.exigir_admin_productos_personalizados()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'Se requiere una sesión autenticada.';
  end if;

  if not exists (
    select 1
    from public.usuarios as u
    where u.id = v_usuario_id
      and u.activo = true
      and u.rol = 'Admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Sólo un administrador activo puede realizar esta operación.';
  end if;

  return v_usuario_id;
end;
$$;

create or replace function public.validar_definicion_producto_personalizado(p_definicion jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  e text[] := array[]::text[]; campos jsonb := '{}'::jsonb; opciones text[]; ids_reglas text[] := array[]::text[];
  c jsonb; o jsonb; r jsonb; id text; tipo text; rid text; op text; destino text; campo_id text; opcion_id text;
  cv jsonb; n numeric; i integer := 0; j integer; clave text;
begin
  if p_definicion is null or pg_catalog.jsonb_typeof(p_definicion) is distinct from 'object' then
    return pg_catalog.jsonb_build_object('valida',false,'errores',pg_catalog.to_jsonb(array['La definición debe ser un objeto JSON.']::text[]));
  end if;
  if pg_catalog.octet_length(p_definicion::text) > 262144 then e := pg_catalog.array_append(e,'La definición excede 256 KiB.'); end if;
  if pg_catalog.jsonb_typeof(p_definicion->'schema_version') is distinct from 'number' then
    e := pg_catalog.array_append(e,'schema_version debe ser el número 1.');
  else
    n := (p_definicion->>'schema_version')::numeric;
    if n <> 1 then e := pg_catalog.array_append(e,'schema_version debe ser el número 1.'); end if;
  end if;
  if pg_catalog.jsonb_typeof(p_definicion->'campos') is distinct from 'array' then
    e := pg_catalog.array_append(e,'campos debe ser un array.');
  else
    if pg_catalog.jsonb_array_length(p_definicion->'campos') > 100 then e := pg_catalog.array_append(e,'campos no puede contener más de 100 elementos.'); end if;
    for c in select x.value from pg_catalog.jsonb_array_elements(p_definicion->'campos') x(value) loop
      i := i + 1;
      if pg_catalog.jsonb_typeof(c) is distinct from 'object' then e := pg_catalog.array_append(e,'campos['||i::text||'] debe ser un objeto.'); continue; end if;
      id := null; tipo := null;
      if pg_catalog.jsonb_typeof(c->'id') is distinct from 'string' then e := pg_catalog.array_append(e,'campos['||i::text||'].id debe ser texto.');
      else
        id := pg_catalog.btrim(c->>'id');
        if pg_catalog.char_length(id) not between 1 and 64 or id !~ '^[A-Za-z][A-Za-z0-9_-]*$' then e := pg_catalog.array_append(e,'campos['||i::text||'].id es inválido.');
        elsif campos ? id then e := pg_catalog.array_append(e,'ID de campo duplicado: '||id||'.');
        else campos := campos || pg_catalog.jsonb_build_object(id,c); end if;
      end if;
      if pg_catalog.jsonb_typeof(c->'tipo') is distinct from 'string' then e := pg_catalog.array_append(e,'campos['||i::text||'].tipo debe ser texto.');
      else tipo := c->>'tipo'; if tipo not in ('opcion','numero','texto','booleano','precio','producto_referencia') then e := pg_catalog.array_append(e,'Tipo inválido en campos['||i::text||'].'); end if; end if;
      if pg_catalog.jsonb_typeof(c->'etiqueta') is distinct from 'string' then e := pg_catalog.array_append(e,'campos['||i::text||'].etiqueta debe ser texto.');
      elsif pg_catalog.char_length(pg_catalog.btrim(c->>'etiqueta')) not between 1 and 120 then e := pg_catalog.array_append(e,'campos['||i::text||'].etiqueta es inválida.'); end if;
      if c ? 'obligatorio' and pg_catalog.jsonb_typeof(c->'obligatorio') is distinct from 'boolean' then e := pg_catalog.array_append(e,'campos['||i::text||'].obligatorio debe ser booleano.'); end if;
      foreach clave in array array['longitud_maxima','minimo','maximo'] loop
        if c ? clave then
          if pg_catalog.jsonb_typeof(c->clave) is distinct from 'number' then e := pg_catalog.array_append(e,'campos['||i::text||'].'||clave||' debe ser numérico.');
          else
            n := (c->>clave)::numeric;
            if clave='longitud_maxima' then
              if n<>pg_catalog.floor(n) or n not between 1 and 1000 then e:=pg_catalog.array_append(e,'campos['||i::text||'].longitud_maxima debe ser un entero entre 1 y 1000.'); end if;
            elsif n not between -999999999999.99 and 999999999999.99 then e := pg_catalog.array_append(e,'campos['||i::text||'].'||clave||' está fuera de rango.'); end if;
          end if;
        end if;
      end loop;
      if pg_catalog.jsonb_typeof(c->'minimo')='number' and pg_catalog.jsonb_typeof(c->'maximo')='number' then
        if (c->>'minimo')::numeric > (c->>'maximo')::numeric then e := pg_catalog.array_append(e,'campos['||i::text||'].minimo no puede superar maximo.'); end if;
      end if;
      if tipo='opcion' then
        if pg_catalog.jsonb_typeof(c->'opciones') is distinct from 'array' then e := pg_catalog.array_append(e,'campos['||i::text||'].opciones debe ser un array.');
        else
          if pg_catalog.jsonb_array_length(c->'opciones')=0 then e := pg_catalog.array_append(e,'campos['||i::text||'].opciones no puede estar vacío.'); end if;
          if pg_catalog.jsonb_array_length(c->'opciones')>200 then e := pg_catalog.array_append(e,'campos['||i::text||'].opciones excede 200 elementos.'); end if;
          opciones := array[]::text[]; j := 0;
          for o in select x.value from pg_catalog.jsonb_array_elements(c->'opciones') x(value) loop
            j := j+1; if pg_catalog.jsonb_typeof(o) is distinct from 'object' then e:=pg_catalog.array_append(e,'campos['||i::text||'].opciones['||j::text||'] debe ser un objeto.'); continue; end if;
            if pg_catalog.jsonb_typeof(o->'id') is distinct from 'string' then e:=pg_catalog.array_append(e,'campos['||i::text||'].opciones['||j::text||'].id debe ser texto.');
            else opcion_id:=pg_catalog.btrim(o->>'id'); if pg_catalog.char_length(opcion_id) not between 1 and 64 or opcion_id !~ '^[A-Za-z][A-Za-z0-9_-]*$' then e:=pg_catalog.array_append(e,'ID de opción inválido en campos['||i::text||'].'); elsif opcion_id=any(opciones) then e:=pg_catalog.array_append(e,'ID de opción duplicado: '||opcion_id||'.'); else opciones:=pg_catalog.array_append(opciones,opcion_id); end if; end if;
            if pg_catalog.jsonb_typeof(o->'etiqueta') is distinct from 'string' then e:=pg_catalog.array_append(e,'Etiqueta de opción inválida en campos['||i::text||'].'); elsif pg_catalog.char_length(pg_catalog.btrim(o->>'etiqueta')) not between 1 and 120 then e:=pg_catalog.array_append(e,'Etiqueta de opción inválida en campos['||i::text||'].'); end if;
          end loop;
        end if;
      end if;
      if tipo='producto_referencia' then
        if c?'usar_precio' and pg_catalog.jsonb_typeof(c->'usar_precio') is distinct from 'boolean' then e:=pg_catalog.array_append(e,'usar_precio debe ser booleano.'); end if;
        if c?'usar_costo' and pg_catalog.jsonb_typeof(c->'usar_costo') is distinct from 'boolean' then e:=pg_catalog.array_append(e,'usar_costo debe ser booleano.'); end if;
      end if;
    end loop;
  end if;
  if pg_catalog.jsonb_typeof(p_definicion->'reglas') is distinct from 'array' then e:=pg_catalog.array_append(e,'reglas debe ser un array.');
  else
    if pg_catalog.jsonb_array_length(p_definicion->'reglas')>200 then e:=pg_catalog.array_append(e,'reglas no puede contener más de 200 elementos.'); end if;
    i:=0;
    for r in select x.value from pg_catalog.jsonb_array_elements(p_definicion->'reglas') x(value) loop
      i:=i+1; if pg_catalog.jsonb_typeof(r) is distinct from 'object' then e:=pg_catalog.array_append(e,'reglas['||i::text||'] debe ser un objeto.'); continue; end if;
      rid:=null; op:=null; campo_id:=null; cv:=null; opcion_id:=null;
      if pg_catalog.jsonb_typeof(r->'id') is distinct from 'string' then e:=pg_catalog.array_append(e,'reglas['||i::text||'].id debe ser texto.'); else rid:=pg_catalog.btrim(r->>'id'); if pg_catalog.char_length(rid) not between 1 and 64 or rid !~ '^[A-Za-z][A-Za-z0-9_-]*$' then e:=pg_catalog.array_append(e,'reglas['||i::text||'].id es inválido.'); elsif rid=any(ids_reglas) then e:=pg_catalog.array_append(e,'ID de regla duplicado: '||rid||'.'); else ids_reglas:=pg_catalog.array_append(ids_reglas,rid); end if; end if;
      if r?'destino' then if pg_catalog.jsonb_typeof(r->'destino') is distinct from 'string' then e:=pg_catalog.array_append(e,'reglas['||i::text||'].destino debe ser texto.'); destino:=null; else destino:=r->>'destino'; if destino not in ('precio','costo') then e:=pg_catalog.array_append(e,'reglas['||i::text||'].destino debe ser precio o costo.'); destino:=null; end if; end if; else destino:='precio'; end if;
      if pg_catalog.jsonb_typeof(r->'operador') is distinct from 'string' then e:=pg_catalog.array_append(e,'reglas['||i::text||'].operador debe ser texto.');
      else op:=r->>'operador'; if op not in ('precio_fijo','valor_manual','ajuste_por_opcion','ajuste_por_booleano','multiplicar_numero','sumar_referencia','ajuste_fijo','ajuste_porcentual','limite_minimo','limite_maximo') then e:=pg_catalog.array_append(e,'Operador inválido en reglas['||i::text||'].'); op:=null; end if; end if;
      if op in ('valor_manual','ajuste_por_opcion','ajuste_por_booleano','multiplicar_numero','sumar_referencia') then
        if pg_catalog.jsonb_typeof(r->'campo_id') is distinct from 'string' then e:=pg_catalog.array_append(e,'reglas['||i::text||'].campo_id es obligatorio y debe ser texto.');
        else campo_id:=pg_catalog.btrim(r->>'campo_id'); if not (campos?campo_id) then e:=pg_catalog.array_append(e,'reglas['||i::text||'] referencia un campo inexistente.'); else cv:=campos->campo_id; end if; end if;
      end if;
      if op='valor_manual' and cv is not null and cv->>'tipo'<>'precio' then e:=pg_catalog.array_append(e,'valor_manual requiere un campo precio.'); end if;
      if op='ajuste_por_opcion' then
        if cv is not null and cv->>'tipo'<>'opcion' then e:=pg_catalog.array_append(e,'ajuste_por_opcion requiere un campo opcion.'); end if;
        if pg_catalog.jsonb_typeof(r->'opcion_id') is distinct from 'string' then e:=pg_catalog.array_append(e,'ajuste_por_opcion requiere opcion_id de texto.');
        else
          opcion_id:=pg_catalog.btrim(r->>'opcion_id');
          if cv is not null then
            if pg_catalog.jsonb_typeof(cv->'opciones')='array' then
              if not exists(select 1 from pg_catalog.jsonb_array_elements(cv->'opciones') q(value) where pg_catalog.jsonb_typeof(q.value)='object' and q.value->>'id'=opcion_id) then e:=pg_catalog.array_append(e,'opcion_id no existe en el campo referenciado.'); end if;
            end if;
          end if;
        end if;
      end if;
      if op='ajuste_por_booleano' and cv is not null and cv->>'tipo'<>'booleano' then e:=pg_catalog.array_append(e,'ajuste_por_booleano requiere un campo booleano.'); end if;
      if op='multiplicar_numero' and cv is not null and cv->>'tipo' not in ('numero','precio') then e:=pg_catalog.array_append(e,'multiplicar_numero requiere un campo numero o precio.'); end if;
      if op='sumar_referencia' then
        if cv is not null and cv->>'tipo'<>'producto_referencia' then e:=pg_catalog.array_append(e,'sumar_referencia requiere un campo producto_referencia.'); end if;
        if pg_catalog.jsonb_typeof(r->'valor') is distinct from 'string' then e:=pg_catalog.array_append(e,'sumar_referencia requiere valor precio o costo.');
        elsif r->>'valor' not in ('precio','costo') then e:=pg_catalog.array_append(e,'sumar_referencia requiere valor precio o costo.');
        elsif cv is not null and r->>'valor'='precio' and cv->'usar_precio' is distinct from 'true'::jsonb then e:=pg_catalog.array_append(e,'sumar_referencia valor=precio requiere usar_precio=true.');
        elsif cv is not null and r->>'valor'='costo' and cv->'usar_costo' is distinct from 'true'::jsonb then e:=pg_catalog.array_append(e,'sumar_referencia valor=costo requiere usar_costo=true.'); end if;
      end if;
      clave:=case when op in ('precio_fijo','ajuste_fijo','limite_minimo','limite_maximo') then 'importe' when op in ('ajuste_por_opcion','ajuste_por_booleano') then 'ajuste' when op='multiplicar_numero' then 'factor' when op='ajuste_porcentual' then 'porcentaje' end;
      if clave is not null then
        if pg_catalog.jsonb_typeof(r->clave) is distinct from 'number' then e:=pg_catalog.array_append(e,op||' requiere '||clave||' numérico.');
        else n:=(r->>clave)::numeric; if clave in ('importe','ajuste') and n not between -999999999999.99 and 999999999999.99 then e:=pg_catalog.array_append(e,clave||' está fuera de rango.'); elsif clave='factor' and n not between -1000000 and 1000000 then e:=pg_catalog.array_append(e,'factor está fuera de rango.'); elsif clave='porcentaje' and n not between -100 and 10000 then e:=pg_catalog.array_append(e,'porcentaje está fuera de rango.'); elsif op in ('precio_fijo','limite_minimo','limite_maximo') and n<0 then e:=pg_catalog.array_append(e,op||' requiere importe no negativo.'); end if; end if;
      end if;
    end loop;
  end if;
  return pg_catalog.jsonb_build_object('valida',pg_catalog.cardinality(e)=0,'errores',pg_catalog.to_jsonb(e));
end; $$;

create or replace function public.validar_version_producto_personalizado(p_definicion jsonb,p_precio_base numeric,p_tipo_calculo text,p_permite_editar_precio boolean,p_politica_costo text)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare res jsonb; e text[]; r jsonb; op text; d text; v text; manual_precio boolean:=false; ref_precio boolean:=false; fijo_costo boolean:=false; manual_costo boolean:=false; ref_costo boolean:=false; tiene_base_costo boolean:=false;
begin
  res:=public.validar_definicion_producto_personalizado(p_definicion);
  select coalesce(pg_catalog.array_agg(x.value),array[]::text[]) into e from pg_catalog.jsonb_array_elements_text(res->'errores') x(value);
  if p_precio_base is null or p_precio_base<0 or p_precio_base>999999999999.99 then e:=pg_catalog.array_append(e,'precio_base está fuera de rango.'); end if;
  if p_tipo_calculo not in ('precio_fijo','precio_manual','suma_referencias','calculado_editable') then e:=pg_catalog.array_append(e,'tipo_calculo no es válido.'); end if;
  if p_politica_costo not in ('sin_costo','costo_fijo','costo_calculado','costo_manual','suma_referencias') then e:=pg_catalog.array_append(e,'politica_costo no es válida.'); end if;
  if res->'valida'='true'::jsonb then
    for r in select x.value from pg_catalog.jsonb_array_elements(p_definicion->'reglas') x(value) loop
      op:=r->>'operador'; d:=coalesce(r->>'destino','precio'); v:=r->>'valor';
      if d='costo' and (op='precio_fijo' or op='valor_manual' or (op='sumar_referencia' and v='costo')) then tiene_base_costo:=true; end if;
      if op='valor_manual' and d='precio' then manual_precio:=true; end if;
      if op='sumar_referencia' and d='precio' and v='precio' then ref_precio:=true; end if;
      if op='precio_fijo' and d='costo' then fijo_costo:=true; end if;
      if op='valor_manual' and d='costo' then manual_costo:=true; end if;
      if op='sumar_referencia' and d='costo' and v='costo' then ref_costo:=true; end if;
    end loop;
  end if;
  if p_tipo_calculo='precio_manual' and not manual_precio then e:=pg_catalog.array_append(e,'precio_manual requiere valor_manual destino=precio.'); end if;
  if p_tipo_calculo='suma_referencias' and not ref_precio then e:=pg_catalog.array_append(e,'suma_referencias requiere sumar_referencia destino=precio valor=precio.'); end if;
  if p_tipo_calculo='calculado_editable' and p_permite_editar_precio is distinct from true then e:=pg_catalog.array_append(e,'calculado_editable requiere permite_editar_precio=true.'); end if;
  if p_politica_costo='costo_fijo' and not fijo_costo then e:=pg_catalog.array_append(e,'costo_fijo requiere precio_fijo destino=costo.'); end if;
  if p_politica_costo='costo_manual' and not manual_costo then e:=pg_catalog.array_append(e,'costo_manual requiere valor_manual destino=costo.'); end if;
  if p_politica_costo='suma_referencias' and not ref_costo then e:=pg_catalog.array_append(e,'suma_referencias de costo requiere sumar_referencia destino=costo valor=costo.'); end if;
  if p_politica_costo='costo_calculado' and not tiene_base_costo then e:=pg_catalog.array_append(e,'costo_calculado requiere al menos una regla generadora destino=costo.'); end if;
  return pg_catalog.jsonb_build_object('valida',pg_catalog.cardinality(e)=0,'errores',pg_catalog.to_jsonb(e));
end; $$;

create or replace function public.proteger_version_publicada_personalizada()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.estado='PUBLICADA' then raise exception using errcode='55000',message='Una versión publicada es inmutable.'; end if;
  if tg_op='DELETE' then return old; end if;
  if new.producto_personalizado_id is distinct from old.producto_personalizado_id then raise exception using errcode='55000',message='Una versión no puede cambiar de plantilla.'; end if;
  return new;
end; $$;

create or replace function public.actualizar_timestamp_producto_personalizado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger proteger_version_publicada_personalizada_trg
before update or delete
on public.productos_personalizados_versiones
for each row
execute function public.proteger_version_publicada_personalizada();

create trigger actualizar_timestamp_producto_personalizado_trg
before update
on public.productos_personalizados
for each row
execute function public.actualizar_timestamp_producto_personalizado();

create trigger actualizar_timestamp_version_personalizada_trg
before update
on public.productos_personalizados_versiones
for each row
execute function public.actualizar_timestamp_producto_personalizado();

create or replace function public.crear_producto_personalizado(
  p_nombre text,
  p_descripcion text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_id uuid;
begin
  v_usuario_id :=
    public.exigir_admin_productos_personalizados();

  insert into public.productos_personalizados (
    nombre,
    descripcion,
    created_by,
    updated_by
  )
  values (
    pg_catalog.btrim(p_nombre),
    nullif(pg_catalog.btrim(p_descripcion), ''),
    v_usuario_id,
    v_usuario_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.actualizar_producto_personalizado(
  p_id uuid,
  p_nombre text,
  p_descripcion text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id :=
    public.exigir_admin_productos_personalizados();

  update public.productos_personalizados
  set nombre = pg_catalog.btrim(p_nombre),
      descripcion = nullif(pg_catalog.btrim(p_descripcion), ''),
      updated_by = v_usuario_id
  where id = p_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Plantilla personalizada inexistente.';
  end if;
end;
$$;

create or replace function public.crear_borrador_producto_personalizado(
  p_producto_personalizado_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_plantilla public.productos_personalizados%rowtype;
  v_publicada public.productos_personalizados_versiones%rowtype;
  v_id uuid;
  v_numero integer;
begin
  v_usuario_id :=
    public.exigir_admin_productos_personalizados();

  select *
  into v_plantilla
  from public.productos_personalizados
  where id = p_producto_personalizado_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Plantilla personalizada inexistente.';
  end if;

  if exists (
    select 1
    from public.productos_personalizados_versiones
    where producto_personalizado_id = p_producto_personalizado_id
      and estado = 'BORRADOR'
  ) then
    raise exception using
      errcode = '23505',
      message = 'La plantilla ya tiene un borrador.';
  end if;

  select coalesce(pg_catalog.max(numero_version), 0) + 1
  into v_numero
  from public.productos_personalizados_versiones
  where producto_personalizado_id = p_producto_personalizado_id;

  if v_plantilla.version_publicada_id is not null then
    select *
    into v_publicada
    from public.productos_personalizados_versiones
    where id = v_plantilla.version_publicada_id;

    insert into public.productos_personalizados_versiones (
      producto_personalizado_id,
      numero_version,
      definicion,
      precio_base,
      tipo_calculo,
      permite_editar_precio,
      politica_costo,
      politica_devolucion,
      created_by,
      updated_by
    )
    values (
      p_producto_personalizado_id,
      v_numero,
      v_publicada.definicion,
      v_publicada.precio_base,
      v_publicada.tipo_calculo,
      v_publicada.permite_editar_precio,
      v_publicada.politica_costo,
      v_publicada.politica_devolucion,
      v_usuario_id,
      v_usuario_id
    )
    returning id into v_id;
  else
    insert into public.productos_personalizados_versiones (
      producto_personalizado_id,
      numero_version,
      definicion,
      precio_base,
      tipo_calculo,
      permite_editar_precio,
      politica_costo,
      politica_devolucion,
      created_by,
      updated_by
    )
    values (
      p_producto_personalizado_id,
      v_numero,
      '{"schema_version":1,"campos":[],"reglas":[]}'::jsonb,
      0,
      'precio_fijo',
      false,
      'sin_costo',
      'no_devolvible',
      v_usuario_id,
      v_usuario_id
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.actualizar_borrador_producto_personalizado(
  p_version_id uuid,
  p_definicion jsonb,
  p_precio_base numeric,
  p_tipo_calculo text,
  p_permite_editar_precio boolean,
  p_politica_costo text,
  p_politica_devolucion text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id :=
    public.exigir_admin_productos_personalizados();

  update public.productos_personalizados_versiones
  set definicion = p_definicion,
      precio_base = p_precio_base,
      tipo_calculo = p_tipo_calculo,
      permite_editar_precio = p_permite_editar_precio,
      politica_costo = p_politica_costo,
      politica_devolucion = p_politica_devolucion,
      updated_by = v_usuario_id
  where id = p_version_id
    and estado = 'BORRADOR';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Borrador inexistente o ya publicado.';
  end if;
end;
$$;

create or replace function public.validar_borrador_producto_personalizado(
  p_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version public.productos_personalizados_versiones%rowtype;
begin
  perform public.exigir_admin_productos_personalizados();

  select *
  into v_version
  from public.productos_personalizados_versiones
  where id = p_version_id
    and estado = 'BORRADOR';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Borrador inexistente o ya publicado.';
  end if;

  return public.validar_version_producto_personalizado(
    v_version.definicion,
    v_version.precio_base,
    v_version.tipo_calculo,
    v_version.permite_editar_precio,
    v_version.politica_costo
  );
end;
$$;

create or replace function public.publicar_producto_personalizado(
  p_producto_personalizado_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_version public.productos_personalizados_versiones%rowtype;
  v_validacion jsonb;
begin
  v_usuario_id :=
    public.exigir_admin_productos_personalizados();

  perform 1
  from public.productos_personalizados
  where id = p_producto_personalizado_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Plantilla personalizada inexistente.';
  end if;

  select *
  into v_version
  from public.productos_personalizados_versiones
  where id = p_version_id
    and producto_personalizado_id = p_producto_personalizado_id
    and estado = 'BORRADOR'
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'El borrador no existe o no pertenece a la plantilla.';
  end if;

  v_validacion :=
    public.validar_version_producto_personalizado(
      v_version.definicion,
      v_version.precio_base,
      v_version.tipo_calculo,
      v_version.permite_editar_precio,
      v_version.politica_costo
    );

  if v_validacion -> 'valida' is distinct from 'true'::jsonb then
    return v_validacion;
  end if;

  update public.productos_personalizados_versiones
  set estado = 'PUBLICADA',
      published_at = pg_catalog.now(),
      published_by = v_usuario_id,
      updated_by = v_usuario_id
  where id = p_version_id;

  update public.productos_personalizados
  set version_publicada_id = p_version_id,
      updated_by = v_usuario_id
  where id = p_producto_personalizado_id;

  return pg_catalog.jsonb_build_object(
    'valida', true,
    'errores', '[]'::jsonb,
    'producto_personalizado_id', p_producto_personalizado_id,
    'version_publicada_id', p_version_id
  );
end;
$$;

create or replace function public.establecer_estado_producto_personalizado(
  p_id uuid,
  p_activo boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id :=
    public.exigir_admin_productos_personalizados();

  if p_activo is null then
    raise exception using
      errcode = '22004',
      message = 'El estado activo no puede ser nulo.';
  end if;

  update public.productos_personalizados
  set activo = p_activo,
      updated_by = v_usuario_id
  where id = p_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Plantilla personalizada inexistente.';
  end if;
end;
$$;

alter table public.productos_personalizados
  enable row level security;

alter table public.productos_personalizados_versiones
  enable row level security;

create policy productos_personalizados_select_admin
on public.productos_personalizados
for select
to authenticated
using (public.es_admin_fastlook_activo());

create policy productos_personalizados_select_publicados
on public.productos_personalizados
for select
to authenticated
using (
  public.es_personal_fastlook_activo()
  and activo = true
  and version_publicada_id is not null
);

create policy productos_personalizados_versiones_select_admin
on public.productos_personalizados_versiones
for select
to authenticated
using (public.es_admin_fastlook_activo());

create policy productos_personalizados_versiones_select_publicadas
on public.productos_personalizados_versiones
for select
to authenticated
using (
  public.es_personal_fastlook_activo()
  and estado = 'PUBLICADA'
  and exists (
    select 1
    from public.productos_personalizados as pp
    where pp.id =
      productos_personalizados_versiones.producto_personalizado_id
      and pp.activo = true
      and pp.version_publicada_id =
        productos_personalizados_versiones.id
  )
);

revoke all
on public.productos_personalizados,
   public.productos_personalizados_versiones
from public, anon, authenticated;

grant select
on public.productos_personalizados,
   public.productos_personalizados_versiones
to authenticated;

revoke all on function
  public.es_personal_fastlook_activo()
from public, anon, authenticated;

revoke all on function
  public.es_admin_fastlook_activo()
from public, anon, authenticated;

grant execute on function
  public.es_personal_fastlook_activo()
to authenticated;

grant execute on function
  public.es_admin_fastlook_activo()
to authenticated;

revoke all on function
  public.exigir_admin_productos_personalizados()
from public, anon, authenticated;

revoke all on function
  public.validar_definicion_producto_personalizado(jsonb)
from public, anon, authenticated;

revoke all on function
  public.validar_version_producto_personalizado(
    jsonb,
    numeric,
    text,
    boolean,
    text
  )
from public, anon, authenticated;

revoke all on function
  public.proteger_version_publicada_personalizada()
from public, anon, authenticated;

revoke all on function
  public.actualizar_timestamp_producto_personalizado()
from public, anon, authenticated;

revoke all on function
  public.crear_producto_personalizado(text, text)
from public, anon, authenticated;

revoke all on function
  public.actualizar_producto_personalizado(uuid, text, text)
from public, anon, authenticated;

revoke all on function
  public.crear_borrador_producto_personalizado(uuid)
from public, anon, authenticated;

revoke all on function
  public.actualizar_borrador_producto_personalizado(
    uuid,
    jsonb,
    numeric,
    text,
    boolean,
    text,
    text
  )
from public, anon, authenticated;

revoke all on function
  public.validar_borrador_producto_personalizado(uuid)
from public, anon, authenticated;

revoke all on function
  public.publicar_producto_personalizado(uuid, uuid)
from public, anon, authenticated;

revoke all on function
  public.establecer_estado_producto_personalizado(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.crear_producto_personalizado(text, text)
to authenticated;

grant execute on function
  public.actualizar_producto_personalizado(uuid, text, text)
to authenticated;

grant execute on function
  public.crear_borrador_producto_personalizado(uuid)
to authenticated;

grant execute on function
  public.actualizar_borrador_producto_personalizado(
    uuid,
    jsonb,
    numeric,
    text,
    boolean,
    text,
    text
  )
to authenticated;

grant execute on function
  public.validar_borrador_producto_personalizado(uuid)
to authenticated;

grant execute on function
  public.publicar_producto_personalizado(uuid, uuid)
to authenticated;

grant execute on function
  public.establecer_estado_producto_personalizado(uuid, boolean)
to authenticated;





commit;

/* Verificaciones de instalación y seguridad. */
select n.nspname,c.relname,pg_catalog.pg_get_userbyid(c.relowner) propietario,c.relrowsecurity,c.relforcerowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('productos_personalizados','productos_personalizados_versiones');
select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),pg_catalog.pg_get_userbyid(p.proowner) propietario,p.prosecdef,p.provolatile,p.proconfig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%producto_personalizado%' order by p.proname;
select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) argumentos,coalesce((select pg_catalog.bool_or(a.grantee=0 and a.privilege_type='EXECUTE') from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a),false) public_execute,pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') anon_execute from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%producto_personalizado%' or p.proname in ('es_personal_fastlook_activo','es_admin_fastlook_activo')) order by p.proname;
select schemaname,tablename,policyname,roles,cmd,qual from pg_catalog.pg_policies where schemaname='public' and tablename in ('productos_personalizados','productos_personalizados_versiones');
select n.nspname esquema,c.relname tabla,t.tgname trigger,pg_catalog.pg_get_triggerdef(t.oid,true) definicion from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public' and c.relname in ('productos_personalizados','productos_personalizados_versiones') order by c.relname,t.tgname;
select indexname,indexdef from pg_catalog.pg_indexes where schemaname='public' and tablename in ('productos_personalizados','productos_personalizados_versiones');
select c.conname,c.contype,c.condeferrable,pg_catalog.pg_get_constraintdef(c.oid,true) from pg_catalog.pg_constraint c where c.conrelid in ('public.productos_personalizados'::regclass,'public.productos_personalizados_versiones'::regclass);

/* Robustez: todos deben responder JSON sin excepción. */
select public.validar_definicion_producto_personalizado('{"schema_version":"1","campos":[],"reglas":[]}'::jsonb);
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":"incorrecto","reglas":[]}'::jsonb);
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":[123,true,null],"reglas":[]}'::jsonb);
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":[{"id":"x","tipo":"opcion","etiqueta":"X","opciones":[1,true,null]}],"reglas":[]}'::jsonb);

/* Negativos semánticos A-F: cada resultado debe tener valida=false. */
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":[{"id":"x","tipo":"opcion","etiqueta":"X","opciones":[{"id":"a","etiqueta":"A"}]}],"reglas":[{"id":"r","operador":"multiplicar_numero","campo_id":"x","factor":2}]}'::jsonb);
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":[{"id":"x","tipo":"opcion","etiqueta":"X","opciones":[{"id":"a","etiqueta":"A"}]}],"reglas":[{"id":"r","operador":"ajuste_por_opcion","campo_id":"x","opcion_id":"b","ajuste":1}]}'::jsonb);
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":[{"id":"x","tipo":"texto","etiqueta":"X"}],"reglas":[{"id":"r","operador":"sumar_referencia","campo_id":"x","valor":"precio"}]}'::jsonb);
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":[{"id":"x","tipo":"booleano","etiqueta":"X"}],"reglas":[{"id":"r","operador":"valor_manual","campo_id":"x"}]}'::jsonb);
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":[],"reglas":[{"id":"r","operador":"ajuste_fijo","importe":1},{"id":"r","operador":"ajuste_fijo","importe":2}]}'::jsonb);
select public.validar_definicion_producto_personalizado('{"schema_version":1,"campos":[],"reglas":[{"id":"r","operador":"ajuste_fijo","destino":"inventario","importe":1}]}'::jsonb);

/* Negativos cruzados G-H: valida=false. */
select public.validar_version_producto_personalizado('{"schema_version":1,"campos":[{"id":"p","tipo":"precio","etiqueta":"P"}],"reglas":[{"id":"r","operador":"valor_manual","destino":"costo","campo_id":"p"}]}'::jsonb,0,'precio_manual',false,'costo_manual');
select public.validar_version_producto_personalizado('{"schema_version":1,"campos":[{"id":"p","tipo":"producto_referencia","etiqueta":"P","usar_precio":true,"usar_costo":true}],"reglas":[{"id":"r","operador":"sumar_referencia","destino":"costo","campo_id":"p","valor":"costo"}]}'::jsonb,0,'suma_referencias',false,'suma_referencias');

/* Positivo completo: valida=true. */
select public.validar_version_producto_personalizado('{"schema_version":1,"campos":[{"id":"calidad","tipo":"opcion","etiqueta":"Calidad","opciones":[{"id":"normal","etiqueta":"Normal"},{"id":"dorada","etiqueta":"Dorada"}]},{"id":"medida","tipo":"opcion","etiqueta":"Medida","opciones":[{"id":"chica","etiqueta":"Chica"},{"id":"grande","etiqueta":"Grande"}]},{"id":"longitud","tipo":"numero","etiqueta":"Longitud"}],"reglas":[{"id":"calidad_dorada","operador":"ajuste_por_opcion","campo_id":"calidad","opcion_id":"dorada","ajuste":80},{"id":"precio_longitud","operador":"multiplicar_numero","campo_id":"longitud","factor":10}]}'::jsonb,100,'precio_fijo',false,'sin_costo');

/* costo_calculado sin regla generadora: valida=false. */
select public.validar_version_producto_personalizado('{"schema_version":1,"campos":[],"reglas":[{"id":"tope_costo","operador":"limite_maximo","destino":"costo","importe":100}]}'::jsonb,0,'precio_fijo',false,'costo_calculado');

/* costo_calculado con base y ajuste: valida=true. */
select public.validar_version_producto_personalizado('{"schema_version":1,"campos":[],"reglas":[{"id":"base_costo","operador":"precio_fijo","destino":"costo","importe":50},{"id":"ajuste_costo","operador":"ajuste_porcentual","destino":"costo","porcentaje":10}]}'::jsonb,0,'precio_fijo',false,'costo_calculado');
