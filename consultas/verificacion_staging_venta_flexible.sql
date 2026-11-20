-- SOLO LECTURA. Ejecutar DESPUÉS de aplicar las migraciones (primero en staging). Cada bloque debe devolver
-- ok = true en todas sus filas. El editor muestra sólo el último resultado: ejecuta los bloques por separado.

-- 1. Funciones y respaldos.
select o.nombre, to_regprocedure(o.nombre) is not null as ok
from (values ('public.procesar_venta(uuid,text,jsonb)'), ('public.procesar_venta_mixta(uuid,text,jsonb,jsonb)'),
             ('public.procesar_devolucion(uuid,text,jsonb,text)'), ('public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text)'),
             ('public._procesar_venta_flexible(uuid,text,jsonb,jsonb)'), ('public.recibir_mercancia_producto(uuid,uuid,integer,text)'),
             ('public.obtener_sugerencias_precio_admin()'), ('public.aprobar_sugerencia_precio(uuid,numeric)'),
             ('public.aprobar_sugerencia_precio_externo(uuid,numeric)'), ('public.descartar_sugerencia_precio(text,uuid,numeric,text)'),
             ('public.configurar_variacion_sugerencias_precio(numeric)'), ('public.cambiar_stock_producto(uuid,integer,integer,text)')) o(nombre)
union all
select 'respaldos originales = 4', count(*) = 4 from public.fastlook_migracion_respaldos where migracion = 'venta_flexible_proveedores_v1'
union all
select 'respaldos de inventario = 2', count(*) = 2 from public.fastlook_migracion_respaldos where migracion = 'inventario_stock_negativo_v1'
union all
select 'cambiar_stock_producto acepta saldo negativo', position('if v_stock_actual is null then' in pg_get_functiondef('public.cambiar_stock_producto(uuid,integer,integer,text)'::regprocedure)) > 0;

-- 2. Permisos: el núcleo interno no es ejecutable por usuarios; las firmas públicas sí, y nunca por anon.
select f.firma, f.rol, has_function_privilege(f.rol, f.firma, 'execute') = f.esperado as ok
from (values
  ('public._procesar_venta_flexible(uuid,text,jsonb,jsonb)', 'authenticated', false),
  ('public._evidencia_precio_candidato()', 'authenticated', false),
  ('public._oferta_vigente_catalogo(uuid)', 'authenticated', false),
  ('public.procesar_venta(uuid,text,jsonb)', 'authenticated', true),
  ('public.procesar_venta(uuid,text,jsonb)', 'anon', false),
  ('public.procesar_venta_mixta(uuid,text,jsonb,jsonb)', 'anon', false),
  ('public.procesar_devolucion_mixta(uuid,text,jsonb,jsonb,text)', 'anon', false),
  ('public.recibir_mercancia_producto(uuid,uuid,integer,text)', 'anon', false),
  ('public.aprobar_sugerencia_precio(uuid,numeric)', 'anon', false)
) f(firma, rol, esperado);

-- 3. RLS activa y sólo SELECT para authenticated en tablas nuevas.
select c.relname, c.relrowsecurity as ok from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('ventas_catalogo_proveedores','devoluciones_externas_detalle','historial_precios_productos',
  'historial_precios_catalogo','sugerencias_precio_descartadas','inventario_recepciones','fastlook_migracion_respaldos')
union all
select t || ' sin escritura para authenticated', not (has_table_privilege('authenticated', 'public.' || t, 'insert')
  or has_table_privilege('authenticated', 'public.' || t, 'update') or has_table_privilege('authenticated', 'public.' || t, 'delete'))
from unnest(array['ventas_catalogo_proveedores','devoluciones_externas_detalle','historial_precios_productos','historial_precios_catalogo','sugerencias_precio_descartadas','inventario_recepciones']) t;

-- 4. Integridad tras pruebas en staging: ninguna línea externa devuelta en exceso y stock = último movimiento.
select 'externas sin sobre-devolución' as control, not exists (
  select 1 from public.ventas_catalogo_proveedores v
  where v.cantidad < (select coalesce(sum(d.cantidad), 0) from public.devoluciones_externas_detalle d where d.venta_externa_id = v.id)) as ok
union all
select 'cabecera = suma de líneas en tickets nuevos', not exists (
  select 1 from public.ventas_tickets t
  where t.created_at > (select min(created_at) from public.fastlook_migracion_respaldos where migracion = 'venta_flexible_proveedores_v1')
    and t.total <> coalesce((select sum(total) from public.ventas v where v.ticket_id = t.ticket_id), 0)
                 + coalesce((select sum(total) from public.ventas_personalizadas p where p.ticket_id = t.ticket_id), 0)
                 + coalesce((select sum(total) from public.ventas_catalogo_proveedores e where e.ticket_id = t.ticket_id), 0))
union all
-- Varias líneas del mismo producto en un ticket comparten created_at: basta que una de las últimas coincida.
select 'stock coincide con el último movimiento posterior a la migración', not exists (
  select 1 from public.productos p
  join lateral (select max(m.created_at) as ultimo from public.movimientos_inventario m where m.producto_id = p.id
                and m.created_at > (select min(created_at) from public.fastlook_migracion_respaldos where migracion = 'venta_flexible_proveedores_v1')) u on u.ultimo is not null
  where not exists (select 1 from public.movimientos_inventario m where m.producto_id = p.id and m.created_at = u.ultimo and m.stock_nuevo = p.stock));
