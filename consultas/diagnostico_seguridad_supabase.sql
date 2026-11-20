-- SOLO LECTURA. Una sola sentencia SELECT; devuelve una fila con la columna "seguridad" (JSON).
-- Alcance de la fase B: todas las tablas de public, funciones SECURITY DEFINER expuestas y políticas de Storage.
-- Exportar igual que el diagnóstico de RPC (Export → CSV) y guardarlo fuera del repositorio.
with
tablas as (
  select c.oid, format('%I.%I', n.nspname, c.relname) as tabla, c.relkind, pg_get_userbyid(c.relowner) as propietario,
         c.relrowsecurity as rls_activa, c.relforcerowsecurity as rls_forzada
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
),
privilegios as (
  select t.*, (select array_agg(x) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) x where has_table_privilege('anon', t.oid, x)) as anon,
         (select array_agg(x) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) x where has_table_privilege('authenticated', t.oid, x)) as authenticated,
         (select count(*) from pg_policies p where p.schemaname = 'public' and format('%I.%I', p.schemaname, p.tablename) = t.tabla) as politicas
  from tablas t
),
funciones as (
  select p.oid::regprocedure::text as firma, pg_get_userbyid(p.proowner) as propietario,
         has_function_privilege('anon', p.oid, 'execute') as anon_ejecuta, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_ejecuta,
         p.prosrc ~ 'auth\.uid\(\)' as valida_sesion, p.proconfig as configuracion
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
)
select jsonb_pretty(jsonb_build_object(
  'generado', now(),
  -- Riesgo efectivo por la API: escritura sin RLS (cualquier fila) o escritura de anon.
  'tablas_expuestas', (select coalesce(jsonb_agg(to_jsonb(x) - 'oid' order by x.tabla), '[]'::jsonb) from privilegios x
                       where (not x.rls_activa and (x.authenticated && array['INSERT','UPDATE','DELETE'] or x.anon && array['SELECT','INSERT','UPDATE','DELETE']))
                          or x.anon && array['INSERT','UPDATE','DELETE','TRUNCATE']),
  'tablas', (select coalesce(jsonb_agg(to_jsonb(x) - 'oid' order by x.tabla), '[]'::jsonb) from privilegios x),
  'politicas', (select coalesce(jsonb_agg(jsonb_build_object('esquema', p.schemaname, 'tabla', p.tablename, 'politica', p.policyname, 'comando', p.cmd,
                  'roles', p.roles, 'using', p.qual, 'with_check', p.with_check) order by p.schemaname, p.tablename, p.policyname), '[]'::jsonb)
                from pg_policies p where p.schemaname in ('public', 'storage')),
  'funciones_definer_anon', (select coalesce(jsonb_agg(to_jsonb(f) order by f.firma), '[]'::jsonb) from funciones f where f.anon_ejecuta),
  'funciones_definer_sin_validar_sesion', (select coalesce(jsonb_agg(to_jsonb(f) order by f.firma), '[]'::jsonb) from funciones f where f.authenticated_ejecuta and not f.valida_sesion),
  'funciones_definer_sin_search_path', (select coalesce(jsonb_agg(f.firma order by f.firma), '[]'::jsonb) from funciones f where not coalesce(f.configuracion::text ~ 'search_path', false))
)) as seguridad;
