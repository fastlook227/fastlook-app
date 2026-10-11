# Fotografías temporales de trabajos mecánicos

## Aplicación

1. Ejecutar `fastlook_fase2_asistencias_comisiones.sql` si aún está pendiente.
2. Ejecutar `fastlook_fase3_fotos_trabajos_mecanicos.sql` en Supabase SQL Editor.
3. Configurar en el servidor `SUPABASE_SERVICE_ROLE_KEY`. La clave nunca se expone al navegador.
4. Crear `CRON_SECRET` en Vercel con una cadena aleatoria de al menos 16 caracteres.
5. Desplegar la aplicación para activar el cron definido en `vercel.json`.

La migración crea el bucket privado `trabajos-mecanicos-temporales`, sus políticas RLS de Admin y las columnas que conservan únicamente la ruta, tipo, expiración y fecha de eliminación. No elimina trabajos ni imágenes existentes.

## Expiración y limpieza

La base calcula la expiración en la siguiente medianoche de `America/Mexico_City`. La interfaz y el endpoint de firma dejan de entregar la foto inmediatamente al expirar. Las URLs firmadas duran como máximo 60 segundos y nunca más allá de esa expiración.

Vercel invoca `/api/cron/limpiar-fotos-trabajos` una vez al día con `GET`, programado a las `06:05 UTC` (00:05 en Ciudad de México). En Hobby la ejecución puede demorarse hasta 59 minutos y Vercel no reintenta fallos: el proceso es idempotente y la ejecución del día siguiente vuelve a intentar archivos pendientes. La visibilidad no depende de esa demora física.

La limpieza solo opera sobre el bucket dedicado y rutas con el formato del módulo. Elimina fotos vencidas y subidas huérfanas de días anteriores; después marca la foto como eliminada sin borrar ni alterar el registro económico.

## Prueba local

1. Iniciar con `npm run dev` y entrar como Admin.
2. En **Check In → Trabajos mecánicos**, registrar: solo descripción, solo foto y ambos.
3. Confirmar en otra sesión Admin que aparece la miniatura, se amplía y la comisión mantiene el porcentaje histórico.
4. Probar el cron con `GET http://localhost:3000/api/cron/limpiar-fotos-trabajos` y el encabezado `Authorization: Bearer <CRON_SECRET>`.
5. Para simular expiración sin esperar, en un proyecto local/de prueba establecer `foto_expira_at` de un registro antes de `now()`, recargar para confirmar que ya no se firma, y ejecutar el endpoint. Verificar que el trabajo y sus importes permanecen.

No ejecutar el ajuste de expiración ni la migración directamente en producción sin el procedimiento normal de respaldo y revisión.
