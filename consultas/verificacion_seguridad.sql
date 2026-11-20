-- SOLO LECTURA. Ejecutar después de fastlook_seguridad_tablas_operativas.sql (staging primero).
-- Todas las filas deben devolver ok = true.
select control, ok from (values
  ('RLS activa en productos, ventas y movimientos_inventario',
    (select bool_and(relrowsecurity) from pg_class where oid in ('public.productos'::regclass, 'public.ventas'::regclass, 'public.movimientos_inventario'::regclass))),
  ('anon sin INSERT/UPDATE/DELETE/TRUNCATE en ninguna tabla de public', not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
      and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE')))),
  ('authenticated sin TRUNCATE en ninguna tabla de public', not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m','f') and has_table_privilege('authenticated', c.oid, 'TRUNCATE'))),
  ('anon no lee productos, ventas ni movimientos', not (has_table_privilege('anon', 'public.productos', 'SELECT')
    or has_table_privilege('anon', 'public.ventas', 'SELECT') or has_table_privilege('anon', 'public.movimientos_inventario', 'SELECT'))),
  ('authenticated no escribe precios ni stock directamente', not (has_table_privilege('authenticated', 'public.productos', 'INSERT')
    or has_table_privilege('authenticated', 'public.productos', 'UPDATE'))),
  ('historial de ventas y movimientos inmutable para la API', not (has_table_privilege('authenticated', 'public.ventas', 'UPDATE')
    or has_table_privilege('authenticated', 'public.ventas', 'DELETE') or has_table_privilege('authenticated', 'public.movimientos_inventario', 'INSERT')
    or has_table_privilege('authenticated', 'public.movimientos_inventario', 'UPDATE') or has_table_privilege('authenticated', 'public.movimientos_inventario', 'DELETE'))),
  ('políticas de la fase A presentes', (select count(*) = 5 from pg_policies where schemaname = 'public' and policyname in (
    'productos_select_personal_activo','productos_delete_admin_activo','ventas_select_personal_activo','ventas_insert_abono_personal_activo','movimientos_select_personal_activo'))),
  ('privilegio por defecto de anon sin escritura', not exists (
    select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'r' and a.grantee = 'anon'::regrole and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))),
  ('operar_producto_admin sólo para authenticated', has_function_privilege('authenticated', 'public.operar_producto_admin(uuid,uuid,text,integer,text,text,text,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.operar_producto_admin(uuid,uuid,text,integer,text,text,text,uuid)', 'execute')),
  ('respaldo para rollback presente', exists (select 1 from public.fastlook_seguridad_respaldo where migracion = 'seguridad_fase_a_v1' and objeto = 'public.productos'))
) v(control, ok);
