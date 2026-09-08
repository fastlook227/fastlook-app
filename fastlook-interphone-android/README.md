# Fast Look Interphone Android

Cliente Android nativo independiente para el canal `interphone:bodega`. El Foreground Service mantiene Supabase Realtime y WebRTC aunque la Activity no esté visible. No graba ni almacena audio.

## Configuración

1. Instala Android Studio y Android SDK 35.
2. Copia `local.properties.example` como `local.properties`.
3. Configura `sdk.dir`, `SUPABASE_URL` y la publishable key pública. Nunca uses `service_role`.
4. Abre este directorio en Android Studio o ejecuta `./gradlew test assembleDebug`.

La notificación no puede implementar hold-to-talk real: una acción de notificación sólo entrega un toque. `HABLAR 30 S` activa temporalmente PTT, cambia a `DETENER` y el servicio lo apaga automáticamente a los 30 segundos.

Android 14+ exige iniciar el Foreground Service de tipo `microphone` mientras la Activity es visible y después de conceder `RECORD_AUDIO`. Por eso el radio no se reinicia solo desde background o al arrancar el teléfono.

STUN está configurado para la fase inicial. `IceServerConfig` ya admite TURN con usuario y credencial, pero las credenciales temporales deberán obtenerse posteriormente desde un backend autenticado; nunca deben incluirse permanentemente en el APK.
