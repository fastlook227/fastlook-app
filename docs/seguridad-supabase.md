# Seguridad de Supabase — fase A

## Vulnerabilidad verificada (diagnóstico de producción del 2026-11-19)

| Tabla | RLS | anon (llave pública del frontend) | authenticated | Exposición efectiva por la API REST |
|---|---|---|---|---|
| `productos` | **desactivada** | SELECT, INSERT, UPDATE, DELETE, TRUNCATE | SELECT, DELETE, TRUNCATE | Cualquiera, sin iniciar sesión, puede leer costos, cambiar precios y stock, crear y borrar productos. |
| `ventas` | **desactivada** | todo | todo | Cualquiera puede leer, alterar o borrar ventas históricas; un Vendedor también. |
| `movimientos_inventario` | **desactivada** | todo | todo | Cualquiera puede falsificar o borrar el historial de inventario. |
| `devoluciones`, `devoluciones_detalle`, `usuarios` | activa | escritura concedida | escritura concedida | Bloqueada por RLS (no hay políticas de escritura). Riesgo residual: TRUNCATE no respeta RLS. No es invocable por PostgREST, pero el privilegio sobra. |

- **Permiso SQL:** el GRANT de la tabla. **RLS:** el filtro por fila que se aplica además del permiso. **Exposición efectiva:** lo que PostgREST permite con un JWT (o sin él). Con RLS desactivada, el GRANT es toda la protección.
- Las funciones `SECURITY DEFINER` (ventas, devoluciones, POS, voz, stock) son de `postgres`, igual que las tablas, así que omiten RLS y siguen funcionando. La migración lo verifica antes de cambiar nada.

## Operaciones por módulo (auditoría del código)

| Módulo | Lectura | Escritura | Tras la fase A |
|---|---|---|---|
| Venta rápida / normal, POS, venta por voz | `productos`, `ventas*` (sesión) | RPC `procesar_venta*`, `registrar_venta_voz` | Sin cambio (RPC definer). |
| Devoluciones | `devoluciones*`, `ventas*` | RPC `procesar_devolucion*` | Sin cambio. |
| Inventario y recepción | `productos`, `movimientos` | RPC `crear/actualizar_producto_admin`, `cambiar_stock_producto`, `recibir_mercancia_producto` | Sin cambio. |
| Cascos | ruta `/api/cascos` con la sesión | Reponer/archivar hacían **UPDATE directo** (hoy sin privilegio UPDATE: fallarían); eliminar = DELETE | Reponer/archivar → `operar_producto_admin`; eliminar sigue con DELETE + política Admin. |
| Asistente | **búsqueda como `anon`** en `/api/asistente/interpretar` | UPDATE directo de stock/ubicación + INSERT de movimiento | Búsqueda con la sesión del usuario; escrituras → `operar_producto_admin`. |
| Clientes, deudas y abonos | `clientes`, `movimientos_clientes` | 3 escrituras directas no atómicas, incluida `ventas` (`codigo='ABONO'`) | Abono permitido por política restringida. `clientes`/`movimientos_clientes` en fase B. |
| Corte de caja, usuarios, cron | servidor con `service_role` | servidor con `service_role` | Sin cambio (omite RLS; nunca llega al navegador). |
| Importación de proveedores | RPC con sesión | RPC Admin | Sin cambio. |
| Android Interphone | `usuarios` con la sesión | — | Sin cambio. |
| Proveedores, Faltantes, Check-in, Tianguis, Entregas | varios | directas o RPC | Fase B (requiere `consultas/diagnostico_seguridad_supabase.sql`). |

## Migraciones

- `fastlook_seguridad_tablas_operativas.sql` (fase A). Aborta sin cambiar nada si algún RPC definer no podría omitir RLS.
  1. Respalda el estado de RLS y los privilegios de cada tabla.
  2. Retira de `anon` toda escritura y TRUNCATE en `public` (también para tablas futuras) y retira TRUNCATE a `authenticated`.
  3. Activa RLS en las tres tablas operativas:
     - lectura sólo para personal activo;
     - INSERT en `ventas` sólo para abonos;
     - DELETE en `productos` sólo para Admin activo;
     - historial inmutable.
  4. Crea `operar_producto_admin`, transaccional e idempotente, con bloqueo de fila y movimiento auditable.
- `fastlook_seguridad_tablas_operativas_rollback.sql`: **sólo emergencias**. Devuelve exactamente los privilegios y el estado de RLS respaldados.
- `consultas/verificacion_seguridad.sql`: sólo lectura; todo `ok = true` después de aplicar.
- `consultas/diagnostico_seguridad_supabase.sql`: sólo lectura; alcance de la fase B. Muestra:
  - todas las tablas de `public` con su exposición efectiva;
  - las funciones definer que `anon` puede ejecutar;
  - las funciones sin `search_path`;
  - las políticas de Storage.

## Staging

1. Crear un proyecto Supabase **nuevo** (organización FAST LOOK → New project, p. ej. `fastlook-staging`). No usar ramas del proyecto de producción.
2. Copiar **sólo el esquema** de producción, sin datos:
   - `supabase db dump --db-url "<cadena de producción>" --schema public -f esquema.sql` (o `pg_dump --schema-only --schema=public`). Revisar que no contenga `COPY`/`INSERT`.
   - Aplicarlo en staging con el SQL Editor o `psql`.
   - Aplicar también las migraciones de Storage/Auth que use la app.
3. En staging, en orden y verificando `COMMIT`:
   1. `fastlook_seguridad_tablas_operativas.sql`
   2. `consultas/verificacion_seguridad.sql`
   3. `fastlook_inventario_stock_negativo.sql`
   4. `fastlook_catalogo_proveedores.sql`
   5. `fastlook_venta_flexible_proveedores.sql`
   6. `consultas/verificacion_staging_venta_flexible.sql`
4. Datos sintéticos: `node scripts/staging/preparar-staging.mjs`.
   - Requiere `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY` y `STAGING_SERVICE_ROLE_KEY` de **staging**, más `STAGING_CONFIRMAR=staging`.
   - Imprime las variables de los usuarios y productos de prueba.
5. Pruebas:
   - `node scripts/staging/prueba-seguridad-staging.mjs`
   - `node scripts/staging/prueba-venta-flexible-staging.mjs`
6. Frontend: preview de Vercel con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` de staging. Probar a mano:
   - venta, devolución, abono;
   - Cascos (reponer, archivar, eliminar);
   - Asistente (buscar, sumar stock, cambiar ubicación);
   - PDF, reimpresión y Corte.

`scripts/staging/entorno.mjs` aborta si la URL o la llave pública coinciden con las de producción (`lib/supabase.ts`). Con la variable de staging, también aborta si la `service_role` coincide con la de `.env.local`. Las variables de staging sólo se definen en la terminal; no se guardan en el repositorio ni en `.env.local`.

## Orden seguro de publicación en producción

1. Registrar la aceptación explícita del riesgo de desplegar sin respaldo ni PITR y guardar la salida de sólo lectura de `consultas/diagnostico_seguridad_supabase.sql`. Una pérdida o corrupción de datos podría ser irreversible.
2. Anunciar una **ventana breve de mantenimiento** para reponer/archivar Cascos y para las escrituras del Asistente. No existe una compatibilidad segura con la base anterior: volver al UPDATE directo o usar `service_role` eludiría el control transaccional y RLS.
3. Publicar el frontend con `NEXT_PUBLIC_VENTA_FLEXIBLE=0` e, inmediatamente después, aplicar `fastlook_seguridad_tablas_operativas.sql` y `consultas/verificacion_seguridad.sql`.
   - Durante ese intervalo no usar reponer/archivar Cascos ni las escrituras del Asistente: el frontend ya invoca `operar_producto_admin`, que todavía no existe.
   - Catálogo de Proveedores y Sugerencias de Precio no aparecen ni realizan consultas mientras el interruptor está apagado.
   - Ventas actuales, devoluciones, abonos, tickets y Corte conservan el contrato anterior.
   - Si el SQL se aplica antes de publicar el frontend, la búsqueda del Asistente actual (que consulta como `anon`) deja de encontrar productos.
4. Cerrar la ventana sólo después de comprobar:
   - una venta real y una devolución;
   - un abono y su Corte;
   - Cascos (reponer);
   - el Asistente (buscar).
5. Continuar con la venta flexible según `docs/catalogo-proveedores.md`.

## Reversión

- **Fallo funcional de Cascos o Asistente:** no requiere SQL. El resto sigue funcionando; revertir el frontend al despliegue anterior deja esas funciones como estaban antes.
- **Fallo general por RLS** (p. ej., lecturas vacías): aplicar `fastlook_seguridad_tablas_operativas_rollback.sql`, que restaura el estado previo exacto (inseguro), y volver a abrir el incidente. `operar_producto_admin` se conserva; el frontend nuevo sigue funcionando.
- No se borran ni modifican filas en ningún caso.

## Pendiente (fase B)

- `clientes` y `movimientos_clientes`: abonos y deudas, hoy tres escrituras directas no atómicas. Pasar a un RPC `registrar_movimiento_cliente` y retirar la política de INSERT de abonos en `ventas`.
- Revisar con el diagnóstico de seguridad:
  - `proveedores`, `faltantes`, `cortes_caja`, `acciones_asistente`, catálogo, check-in, tianguis y entregas;
  - las funciones definer que `anon` puede ejecutar;
  - Storage (bucket `productos`).
