# Optimización de imágenes de productos

## Aplicación

1. Ejecutar `fastlook_fase_imagenes_optimizadas.sql` en Supabase SQL Editor.
2. Publicar el frontend únicamente después de aplicar la columna `imagen_thumbnail_url`.
3. Las fotografías existentes no se modifican. Si no tienen miniatura, las listas usan la URL original como fallback.
4. Al reemplazar o agregar una fotografía, el navegador genera una imagen principal de hasta 900 px y una miniatura de hasta 320 px. Prefiere WebP y usa JPEG cuando el navegador no puede producir WebP.

Los archivos usan nombres únicos y `cacheControl: 31536000`, por lo que pueden conservarse un año en caché sin riesgo de mostrar una versión anterior bajo la misma URL.

## Medición de transferencia

Para comparar antes y después con una prueba reproducible:

1. En DevTools > Network, mantener habilitada la caché y limpiar los datos del sitio una sola vez antes de cada escenario inicial.
2. Registrar `Transferred`, número de solicitudes `Img` y tiempo de carga al abrir Venta, Inventario, Lista de precios y Cascos.
3. Repetir el mismo recorrido sin limpiar la caché para comprobar que las imágenes no se transfieren nuevamente.
4. Comparar el primer lote de 30 productos contra la carga completa anterior. Pulsar “Cargar más” para medir cada lote adicional.
5. En Supabase Dashboard > Usage, comparar `Cached Egress` y `Uncached Egress` en periodos equivalentes de al menos 24 horas. Normalizar el resultado por sesiones o usuarios activos.

Las miniaturas reducen especialmente el tamaño por solicitud. La paginación y `loading="lazy"` reducen el número de solicitudes. Las fotos antiguas obtienen el segundo beneficio inmediatamente; el primero se obtiene cuando cada fotografía sea reemplazada o cuando se realice un backfill manual futuro.

## Archivos sin referencia

Ejecutar `consultas/imagenes_storage_sin_referencia.sql` desde SQL Editor. Es una consulta de solo lectura. El resultado es únicamente una lista para revisión manual; no se debe borrar ningún archivo sin verificar respaldos, URLs históricas y uso fuera de `productos`.
