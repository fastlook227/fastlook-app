-- FAST LOOK - Conciliacion segura de duplicados historicos de Corte de caja
-- Ejecutar manualmente en Supabase ANTES de fastlook_corte_caja_integral.sql.
-- Este archivo no modifica ventas, ventas_tickets, ventas_personalizadas ni
-- ninguna otra tabla financiera.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

-- Impide que la API inserte o cambie cortes mientras se toma el respaldo,
-- se verifica y se elimina. Si no se puede obtener el bloqueo, todo aborta.
lock table public.cortes_caja in access exclusive mode;

-- Validaciones estructurales y de dependencias. Una FK que apunte al id, un
-- trigger de DELETE o una regla de DELETE podria requerir una conciliacion
-- especifica; por seguridad este script no intenta adivinarla.
do $$
declare
  v_detalle text;
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.cortes_caja'::regclass
      and attname in ('id', 'fecha_inicio', 'fecha_fin', 'created_at')
      and not attisdropped
    having count(*) <> 4
  ) then
    raise exception 'CORTES_ESTRUCTURA_INVALIDA: faltan columnas requeridas (id, fecha_inicio, fecha_fin o created_at).';
  end if;

  select string_agg(
           format('%I.%I (%I)', n.nspname, r.relname, con.conname),
           ', ' order by n.nspname, r.relname, con.conname
         )
    into v_detalle
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class r on r.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = r.relnamespace
  where con.contype = 'f'
    and con.confrelid = 'public.cortes_caja'::regclass;

  if v_detalle is not null then
    raise exception 'CORTES_DEPENDENCIAS_FK: existen claves foraneas hacia cortes_caja: %', v_detalle;
  end if;

  select string_agg(t.tgname, ', ' order by t.tgname)
    into v_detalle
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.cortes_caja'::regclass
    and not t.tgisinternal
    and (t.tgtype & 8) = 8
    and t.tgenabled <> 'D';

  if v_detalle is not null then
    raise exception 'CORTES_DEPENDENCIAS_TRIGGER: existen triggers de DELETE habilitados en cortes_caja: %', v_detalle;
  end if;

  select string_agg(r.rulename, ', ' order by r.rulename)
    into v_detalle
  from pg_catalog.pg_rewrite r
  where r.ev_class = 'public.cortes_caja'::regclass
    and r.ev_type = '4'
    and r.rulename <> '_RETURN';

  if v_detalle is not null then
    raise exception 'CORTES_DEPENDENCIAS_REGLA: existen reglas de DELETE en cortes_caja: %', v_detalle;
  end if;

  if exists (
    select 1
    from public.cortes_caja
    where id is null or fecha_inicio is null or fecha_fin is null
  ) then
    raise exception 'CORTES_DATOS_INVALIDOS: id, fecha_inicio y fecha_fin deben tener valor.';
  end if;
end $$;

-- Respaldo permanente e inmutable desde la perspectiva de los roles de la
-- aplicacion. registro_original contiene la fila completa, incluidos UUID,
-- created_at y cualquier columna adicional existente al ejecutar el script.
create table if not exists public.cortes_caja_respaldo_duplicados (
  respaldo_id bigint generated always as identity primary key,
  corte_id_original uuid not null unique,
  fecha_inicio date not null,
  fecha_fin date not null,
  created_at_original timestamptz,
  registro_original jsonb not null,
  lote text not null,
  respaldado_at timestamptz not null default clock_timestamp()
);

alter table public.cortes_caja_respaldo_duplicados enable row level security;
revoke all on table public.cortes_caja_respaldo_duplicados from public, anon, authenticated;
revoke all on sequence public.cortes_caja_respaldo_duplicados_respaldo_id_seq from public, anon, authenticated;

-- Congela en una tabla temporal exactamente las filas que pertenecen a un
-- periodo repetido. El sobreviviente es determinista: created_at mas antiguo
-- y, en caso de empate (o NULL), el UUID lexicograficamente menor.
create temporary table _cortes_caja_conciliacion on commit drop as
select
  ordenadas.id as corte_id_original,
  ordenadas.fecha_inicio,
  ordenadas.fecha_fin,
  ordenadas.created_at as created_at_original,
  to_jsonb(ordenadas) - '_orden_conservacion' as registro_original,
  ordenadas._orden_conservacion = 1 as conservar
from (
  select
    c.*,
    row_number() over (
      partition by c.fecha_inicio, c.fecha_fin
      order by c.created_at asc nulls last, c.id::text asc
    ) as _orden_conservacion
  from public.cortes_caja c
  join (
    select fecha_inicio, fecha_fin
    from public.cortes_caja
    group by fecha_inicio, fecha_fin
    having count(*) > 1
  ) d using (fecha_inicio, fecha_fin)
) ordenadas;

-- La condicion principal de seguridad: todas las versiones de cada periodo
-- deben ser identicas al excluir solamente id y created_at.
do $$
declare
  v_periodos integer;
  v_filas integer;
begin
  select count(*) into v_periodos
  from (
    select fecha_inicio, fecha_fin
    from _cortes_caja_conciliacion
    group by fecha_inicio, fecha_fin
    having count(distinct (registro_original - 'id' - 'created_at')) <> 1
  ) diferencias;

  if v_periodos > 0 then
    raise exception 'CORTES_VERSIONES_DIFERENTES: % periodos ya no son identicos; no se respaldo ni elimino nada.', v_periodos;
  end if;

  select count(*) into v_filas from _cortes_caja_conciliacion;
  raise notice 'CORTES_AUDITORIA: % filas de periodos duplicados listas para respaldo.', v_filas;
end $$;

insert into public.cortes_caja_respaldo_duplicados (
  corte_id_original,
  fecha_inicio,
  fecha_fin,
  created_at_original,
  registro_original,
  lote
)
select
  corte_id_original,
  fecha_inicio,
  fecha_fin,
  created_at_original,
  registro_original,
  'conciliacion-cortes-v1'
from _cortes_caja_conciliacion
on conflict (corte_id_original) do nothing;

-- No basta con que exista el UUID en el respaldo: el JSON completo debe ser
-- byte-a-byte equivalente como valor jsonb a la fila congelada.
do $$
declare
  v_faltantes integer;
  v_distintos integer;
begin
  select count(*) into v_faltantes
  from _cortes_caja_conciliacion c
  left join public.cortes_caja_respaldo_duplicados b
    on b.corte_id_original = c.corte_id_original
  where b.corte_id_original is null;

  select count(*) into v_distintos
  from _cortes_caja_conciliacion c
  join public.cortes_caja_respaldo_duplicados b
    on b.corte_id_original = c.corte_id_original
  where b.registro_original is distinct from c.registro_original;

  if v_faltantes <> 0 or v_distintos <> 0 then
    raise exception 'CORTES_RESPALDO_INVALIDO: faltantes=%, distintos=%; no se elimino nada.', v_faltantes, v_distintos;
  end if;
end $$;

-- Solo se eliminan las copias no elegidas cuyo respaldo exacto fue comprobado.
do $$
declare
  v_esperadas integer;
  v_eliminadas integer;
begin
  select count(*) into v_esperadas
  from _cortes_caja_conciliacion
  where not conservar;

  delete from public.cortes_caja c
  using _cortes_caja_conciliacion x,
        public.cortes_caja_respaldo_duplicados b
  where not x.conservar
    and c.id = x.corte_id_original
    and b.corte_id_original = x.corte_id_original
    and b.registro_original = x.registro_original;

  get diagnostics v_eliminadas = row_count;

  if v_eliminadas <> v_esperadas then
    raise exception 'CORTES_ELIMINACION_INCOMPLETA: esperadas=%, eliminadas=%; se revertira todo.', v_esperadas, v_eliminadas;
  end if;

  raise notice 'CORTES_CONCILIADOS: % duplicados eliminados; todos permanecen en el respaldo.', v_eliminadas;
end $$;

-- Comprobaciones posteriores antes de hacer permanente cualquier cambio.
do $$
begin
  if exists (
    select 1
    from public.cortes_caja
    group by fecha_inicio, fecha_fin
    having count(*) > 1
  ) then
    raise exception 'CORTES_DUPLICADOS_REMANENTES: se revertira toda la transaccion.';
  end if;

  if exists (
    select 1
    from _cortes_caja_conciliacion x
    where x.conservar
      and not exists (
        select 1
        from public.cortes_caja c
        where c.id = x.corte_id_original
          and to_jsonb(c) = x.registro_original
      )
  ) then
    raise exception 'CORTES_SOBREVIVIENTE_INVALIDO: falta o cambio una fila elegida; se revertira todo.';
  end if;
end $$;

create unique index if not exists cortes_caja_periodo_unico_idx
  on public.cortes_caja (fecha_inicio, fecha_fin);

-- IF NOT EXISTS se basa en el nombre. Verificamos tambien que ese nombre no
-- ocultara un indice antiguo con otra definicion.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid = i.indexrelid
    join pg_catalog.pg_namespace n on n.oid = idx.relnamespace
    where i.indrelid = 'public.cortes_caja'::regclass
      and n.nspname = 'public'
      and idx.relname = 'cortes_caja_periodo_unico_idx'
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and i.indpred is null
      and i.indexprs is null
      and i.indnkeyatts = 2
      and pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'fecha_inicio'
      and pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = 'fecha_fin'
  ) then
    raise exception 'CORTES_INDICE_INVALIDO: cortes_caja_periodo_unico_idx no es un indice unico valido sobre (fecha_inicio, fecha_fin).';
  end if;
end $$;

commit;

-- Verificacion manual posterior (solo lectura):
-- select count(*) as periodos_duplicados
-- from (
--   select fecha_inicio, fecha_fin
--   from public.cortes_caja
--   group by fecha_inicio, fecha_fin
--   having count(*) > 1
-- ) d;
--
-- select lote, count(*) as filas_respaldadas,
--        min(respaldado_at) as primer_respaldo,
--        max(respaldado_at) as ultimo_respaldo
-- from public.cortes_caja_respaldo_duplicados
-- group by lote;
