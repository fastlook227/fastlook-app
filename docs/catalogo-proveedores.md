# Catálogo de proveedores y venta flexible

`fastlook_catalogo_proveedores.sql` crea el catálogo externo (REMO MOTOS, CEDIS, AQUILA MOTOPARTES) separado de `public.productos`. Toda importación entra como `VISTA_PREVIA`; nada se publica ni toca inventario automáticamente. Se conservan código original, descripción, imágenes con certeza, categorías y escalas de descuento.

**Precio sugerido = costo efectivo × 1.30.** El costo efectivo ya incluye el descuento del proveedor (nivel configurable); el 30 % es margen comercial, no descuento. Un Admin puede fijar un precio oficial por artículo externo sólo aprobando una sugerencia (`precio_venta_override`). Catálogo, venta y aprendizaje usan la misma oferta vigente (`_oferta_vigente_catalogo`): el precio mostrado es el cobrado.

## Preparar una vista previa

```powershell
python -m pip install -r scripts/requirements-catalogos.txt
python scripts/preparar_catalogos_proveedores.py CEDIS "ruta\archivo.xlsx" preview-cedis.json
python scripts/preparar_catalogos_proveedores.py REMO "ruta\archivo.pdf" preview-remo.json
python scripts/preparar_catalogos_proveedores.py AQUILA "ruta\archivo.pdf" preview-aquila.json
```

Cargar lotes de máximo 500 registros mediante `/api/catalogo-proveedores` y revisar los ambiguos antes de publicar. **No ejecutar todavía una importación masiva en producción.**

## Interruptor `NEXT_PUBLIC_VENTA_FLEXIBLE`

Se lee **al compilar**: cambiarlo en Vercel no tiene efecto hasta volver a desplegar (Redeploy sin caché de build).

| Valor | Carrito | Lectura de tickets externos |
|---|---|---|
| ausente / `0` | Formato antiguo `{producto_id, cantidad}`; sin precio editable; sin venta de proveedor; respeta el stock disponible como antes. El menú del Catálogo y las Sugerencias de Precio permanecen ocultos y no consultan RPC pendientes. | Sí (PDF, reimpresión, Movimientos, Devoluciones, Corte) |
| `1` | Precio editable con motivo obligatorio, artículos de proveedor y stock cero/negativo | Sí |

| Frontend | RPC | Resultado |
|---|---|---|
| Producción actual (sin cambios) | original o nuevo | cobra |
| Nuevo, interruptor apagado | original o nuevo | cobra |
| Nuevo, interruptor encendido | nuevo | cobra |
| Nuevo, interruptor encendido (pestaña vieja) | revertido | `VERSION_INCOMPATIBLE`: recargar la página |

## Compuertas de seguridad de la migración

Las definiciones originales no estaban versionadas; se obtuvieron de producción el 2026-11-19 con `consultas/diagnostico_rpc_ventas_flexibles.sql` y `tests/sql/esquema_base_prueba.sql` contiene su transcripción para las pruebas. Aun así `fastlook_venta_flexible_proveedores.sql` aborta sin modificar nada si:

- `CONTRATO_RPC_DISTINTO`: los originales respaldados no contienen todas las marcas del contrato que el RPC nuevo reproduce (folio `FLV-YYYYMMDD-…`, movimiento `'Venta'` / `'Salida por venta'` / `'SISTEMA'`, advisory lock con `hashtextextended`, `unique_violation`, `for update`, `costo_unitario` y los prefijos de error que traduce la aplicación).
- `DEFINICION_INESPERADA`: `procesar_devolucion` no contiene la validación de stock que se ajusta.
- `RESTRICCION_INCOMPATIBLE` / `TRIGGER_POR_REVISAR`: un CHECK o trigger impediría stock negativo o el movimiento.
- `DEPENDENCIA`: falta una tabla, función o columna.

Si aborta, enviar el resultado de `consultas/diagnostico_rpc_ventas_flexibles.sql` para adaptar la migración. No forzarla.

## Procedimiento de publicación

1. **Respaldar**
   - Confirmar un punto de restauración reciente (Backups/PITR de Supabase) en producción.
   - Ejecutar `consultas/diagnostico_rpc_ventas_flexibles.sql` bloque por bloque en producción y guardar los resultados. El bloque 2 debe dar `presente = true` en todas las filas y el 3 debe dar `true`. Si no, detenerse aquí.
   - En Vercel, confirmar que no existen `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Production: sin ellas la app usa la URL de producción fija en `lib/supabase.ts`.
2. **Staging**
   1. Restaurar en staging una copia del esquema de producción (o aplicar el mismo historial de migraciones) y crear un Vendedor y un Admin de prueba.
   2. Aplicar ahí el SQL en el orden de abajo.
   3. Ejecutar `consultas/verificacion_staging_venta_flexible.sql`: todo `ok = true`.
   4. Ejecutar `node scripts/staging/prueba-venta-flexible-staging.mjs`; requiere `STAGING_*`, ver el encabezado del script. Debe terminar en «Todas las pruebas pasaron» y la línea INFO dirá si `cambiar_stock_producto` acepta saldos negativos.
   5. Publicar un preview de Vercel con `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` de staging y `NEXT_PUBLIC_VENTA_FLEXIBLE=1`. Probar a mano: cobro normal, precio manual, artículo externo, ticket mixto, devolución externa parcial, Movimientos, PDF, reimpresión en el POS y Corte de caja.
3. **Frontend a producción con el interruptor apagado.** Desplegar sin `NEXT_PUBLIC_VENTA_FLEXIBLE` (o con `0`). Cobra con los RPC actuales.
4. **SQL en producción** (manual, en este orden; cada archivo debe terminar en `COMMIT`):
   0. Requisito: `fastlook_seguridad_tablas_operativas.sql` ya aplicada y verificada (ver `docs/seguridad-supabase.md`).
   1. `fastlook_ventas_tickets_estado.sql` y `fastlook_devoluciones_personalizadas.sql`, si aún no están aplicados.
   2. `fastlook_inventario_stock_negativo.sql` (respalda y ajusta `actualizar_producto_admin` y `cambiar_stock_producto`).
   3. `fastlook_catalogo_proveedores.sql`.
   4. `fastlook_venta_flexible_proveedores.sql`.
   5. `consultas/verificacion_staging_venta_flexible.sql` (sólo lectura): todo `ok = true`.
5. **Comprobar con el interruptor apagado:** una venta real normal, su PDF, su reimpresión y su aparición en Corte.
6. **Activar:** definir `NEXT_PUBLIC_VENTA_FLEXIBLE=1` en Vercel Production y redesplegar. Comprobar una venta con precio manual (motivo registrado), una venta de proveedor, su PDF, su reimpresión y el Corte.
7. **POS Bridge (opcional):** recompilar e instalar `fastlook-pos-bridge` para que la reimpresión térmica muestre DEVUELTO/NETO. Un bridge anterior ignora el campo y sigue imprimiendo el ticket original.

## Reversión

1. Quitar `NEXT_PUBLIC_VENTA_FLEXIBLE` (o ponerlo en `0`) y redesplegar. Con el RPC nuevo sigue cobrando; con el original también.
2. Aplicar `fastlook_venta_flexible_proveedores_rollback.sql`:
   - Restaura `procesar_devolucion` y `procesar_devolucion_mixta` exactamente como estaban.
   - Ejecuta el `procesar_venta` / `procesar_venta_mixta` original detrás de una guardia `SECURITY INVOKER` que rechaza el formato nuevo.
   - Retira la ejecución de los RPC de sugerencias.
   - No borra tablas, filas, columnas ni políticas de lectura: tickets de proveedor, sus devoluciones e historiales siguen en PDF, reimpresión, Movimientos y Corte.
3. Comprobar una venta normal y la lectura de un ticket de proveedor anterior.

**Consecuencia del contrato original:** el `procesar_venta` de producción rechaza con `STOCK_INVALIDO` todo producto con stock < 0. Tras revertir la venta flexible, esos productos no se venden hasta registrar una entrada. Antes de revertir, ejecutar `select id, codigo, nombre, stock from public.productos where stock < 0;` y decidir. Conviene mantener `fastlook_inventario_stock_negativo.sql` aplicada (es independiente) para poder recibir mercancía y ajustar desde negativo.

El rollback es repetible y la migración puede reaplicarse después: los respaldos usan `on conflict do nothing`. `fastlook_inventario_stock_negativo_rollback.sql` restaura los dos RPC de inventario respaldados y conserva `inventario_recepciones`.

## Pruebas

- `node --test tests/*.test.ts`: unitarias y estáticas.
- `npm i --no-save @electric-sql/pglite` y `node --test tests/sql/integracion-venta-flexible.mjs`: todas las migraciones, el diagnóstico, la verificación y los escenarios corren en Postgres real (WASM) sobre `tests/sql/esquema_base_prueba.sql`.
  - Los RPC originales de ese esquema son aproximaciones.
  - Una sola conexión: **no prueba concurrencia, RLS de Supabase ni JWT reales**.
- `scripts/staging/prueba-venta-flexible-staging.mjs`: concurrencia, RLS y JWT reales; sólo staging.
- `cd fastlook-pos-bridge && npm test`: ticket térmico con devoluciones.
