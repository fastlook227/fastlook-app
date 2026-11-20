-- SOLO LECTURA. Una sola sentencia SELECT: no crea, modifica, borra ni otorga nada.
-- Ejecutar en Supabase SQL Editor (producción y staging) ANTES de cualquier migración de venta flexible.
-- Devuelve una fila con una columna "diagnostico" (JSON). Objetos inexistentes aparecen como null en vez de fallar.

with
funciones as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'firma', p.oid::regprocedure::text, 'propietario', pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatilidad', p.provolatile, 'configuracion', p.proconfig, 'permisos', p.proacl::text[], 'definicion', pg_get_functiondef(p.oid)
  ) order by p.proname, p.oid::regprocedure::text), '[]'::jsonb) as v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.proname in ('procesar_venta','procesar_venta_mixta','procesar_devolucion','procesar_devolucion_mixta','cambiar_stock_producto',
                      'procesar_venta_pos','procesar_venta_mixta_pos','registrar_venta_voz','deshacer_venta_voz',
                      'actualizar_producto_admin','crear_producto_admin','calcular_linea_personalizada')
),
-- Otras funciones que llaman a los RPC de venta/devolución/stock (deben seguir funcionando tras la migración).
dependientes as (
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb) as v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ~ '(procesar_venta|procesar_devolucion|cambiar_stock_producto)'
    and p.proname not in ('procesar_venta','procesar_venta_mixta','procesar_devolucion','procesar_devolucion_mixta','cambiar_stock_producto')
),
-- Mismas marcas que exige la sección 1b de fastlook_venta_flexible_proveedores.sql.
contrato as (
  select jsonb_agg(jsonb_build_object('marca', m, 'presente', position(m in t.texto) > 0) order by position(m in t.texto) > 0, m) as v
  from (select coalesce(pg_get_functiondef(to_regprocedure('public.procesar_venta(uuid,text,jsonb)')), '') || E'\n' ||
               coalesce(pg_get_functiondef(to_regprocedure('public.procesar_venta_mixta(uuid,text,jsonb,jsonb)')), '') as texto) t,
       unnest(array[
         '''FLV-''', '''YYYYMMDD''', '''America/Mexico_City''', 'gen_random_uuid', 'pg_advisory_xact_lock', 'hashtextextended', 'unique_violation',
         '''Venta''', '''Salida por venta''', '''SISTEMA''', 'costo_unitario', 'for update', 'calcular_linea_personalizada',
         'SIN_SESION:', 'ROL_NO_PERMITIDO:', 'USUARIO_INACTIVO:', 'IDEMPOTENCIA_INVALIDA:', 'METODO_INVALIDO:', 'CARRITO_VACIO:',
         'LINEAS_INVALIDAS:', 'PRODUCTO_INEXISTENTE:', 'PRODUCTO_ARCHIVADO:', 'PRECIO_INVALIDO:', 'STOCK_INVALIDO:', 'STOCK_INSUFICIENTE:'
       ]) m
),
tablas as (
  select t as nombre, to_regclass('public.' || t) as oid
  from unnest(array['productos','ventas','ventas_tickets','ventas_personalizadas','movimientos_inventario','devoluciones',
                    'devoluciones_detalle','devoluciones_personalizadas_detalle','ventas_voz_operaciones','usuarios']) t
),
restricciones as (
  select coalesce(jsonb_agg(jsonb_build_object('tabla', t.nombre, 'nombre', c.conname, 'tipo', c.contype, 'definicion', pg_get_constraintdef(c.oid))
    order by t.nombre, c.conname), '[]'::jsonb) as v
  from tablas t join pg_constraint c on c.conrelid = t.oid
  where c.contype in ('c','u','f','p')
),
triggers as (
  select coalesce(jsonb_agg(jsonb_build_object('tabla', t.nombre, 'trigger', g.tgname, 'habilitado', g.tgenabled, 'definicion', pg_get_triggerdef(g.oid),
    'funcion', p.oid::regprocedure::text, 'fuente_funcion', p.prosrc) order by t.nombre, g.tgname), '[]'::jsonb) as v
  from tablas t join pg_trigger g on g.tgrelid = t.oid and not g.tgisinternal join pg_proc p on p.oid = g.tgfoid
),
rls as (
  select coalesce(jsonb_agg(jsonb_build_object('tabla', t.nombre, 'existe', t.oid is not null, 'rls_activa', c.relrowsecurity, 'rls_forzada', c.relforcerowsecurity)
    order by t.nombre), '[]'::jsonb) as v
  from tablas t left join pg_class c on c.oid = t.oid
),
politicas as (
  select coalesce(jsonb_agg(jsonb_build_object('tabla', p.tablename, 'politica', p.policyname, 'permisiva', p.permissive, 'comando', p.cmd,
    'roles', p.roles, 'using', p.qual, 'with_check', p.with_check) order by p.tablename, p.policyname), '[]'::jsonb) as v
  from pg_policies p where p.schemaname = 'public' and p.tablename in (select nombre from tablas)
),
privilegios as (
  select coalesce(jsonb_agg(jsonb_build_object('tabla', g.table_name, 'rol', g.grantee, 'privilegio', g.privilege_type) order by g.table_name, g.grantee, g.privilege_type), '[]'::jsonb) as v
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee in ('anon','authenticated') and g.table_name in (select nombre from tablas)
),
columnas as (
  select coalesce(jsonb_agg(jsonb_build_object('tabla', c.table_name, 'columna', c.column_name, 'tipo', c.udt_name, 'nulo', c.is_nullable, 'default', c.column_default)
    order by c.table_name, c.ordinal_position), '[]'::jsonb) as v
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name in (select nombre from tablas)
),
-- Forma del folio con dígitos convertidos a 9 (p. ej. FLV-99999999-XXXX). Sin datos de clientes.
folios as (
  select coalesce(jsonb_agg(f order by f.tickets desc), '[]'::jsonb) as v from (
    select regexp_replace(folio, '[0-9]', '9', 'g') as forma, count(*) as tickets, min(created_at) as primero, max(created_at) as ultimo,
           (array_agg(folio order by created_at desc))[1:2] as ejemplos
    from public.ventas_tickets group by 1 order by 2 desc limit 15) f
),
-- to_jsonb(m) evita fallar si alguna columna (origen, ticket_id) no existe.
movimientos as (
  select coalesce(jsonb_agg(x order by x.movimientos desc), '[]'::jsonb) as v from (
    select j->>'tipo_movimiento' as tipo_movimiento, left(j->>'nota', 80) as nota, j->>'origen' as origen,
           (j->>'ticket_id') is not null as con_ticket, count(*) as movimientos
    from (select to_jsonb(m) as j from public.movimientos_inventario m where m.created_at > now() - interval '90 days') s
    group by 1, 2, 3, 4 order by 5 desc limit 40) x
),
stock as (
  select jsonb_build_object('productos', count(*), 'con_stock_negativo', count(*) filter (where stock < 0), 'con_stock_cero', count(*) filter (where stock = 0),
                            'stock_nulo', count(*) filter (where stock is null)) as v
  from public.productos
)
select jsonb_pretty(jsonb_build_object(
  'generado', now(), 'version_postgres', current_setting('server_version'),
  'funciones', (select v from funciones), 'llamadores', (select v from dependientes), 'contrato_venta', (select v from contrato),
  'devolucion_tiene_validacion_esperada', position('if v_producto.stock is null or v_producto.stock < 0 then'
      in coalesce(pg_get_functiondef(to_regprocedure('public.procesar_devolucion(uuid,text,jsonb,text)')), '')) > 0,
  'restricciones', (select v from restricciones), 'triggers', (select v from triggers), 'rls', (select v from rls),
  'politicas', (select v from politicas), 'privilegios_tablas', (select v from privilegios), 'columnas', (select v from columnas),
  'folios', (select v from folios), 'movimientos_90_dias', (select v from movimientos), 'stock', (select v from stock)
)) as diagnostico;
