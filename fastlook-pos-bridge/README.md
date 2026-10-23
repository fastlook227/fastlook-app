# FAST LOOK POS Bridge

## Distribución portable para Windows

Genera el paquete autosuficiente (incluye `node.exe`, pero nunca `config.json` ni el token) con:

```powershell
npm.cmd run package:windows
```

El ZIP y su suma SHA-256 se crean en `release/`. La PC destino no necesita Node.js. Consulta `windows/README-WINDOWS.txt` para instalar, actualizar, configurar, comprobar, reiniciar y desinstalar.

Servicio local para Windows que escucha exclusivamente en `127.0.0.1`, recibe tickets ya confirmados y envía bytes ESC/POS por la cola RAW de Windows. No procesa ventas ni se conecta a Supabase.

## Configuración y ejecución

1. Instala Node.js 22 LTS o posterior en la PC de caja.
2. Instala en Windows el controlador de la impresora y confirma que imprime una página de prueba.
3. Copia `config.example.json` como `config.json`.
4. Escribe el nombre exacto mostrado en **Configuración > Bluetooth y dispositivos > Impresoras y escáneres**.
5. Genera un token aleatorio de al menos 24 caracteres y usa el mismo token en la pantalla **Configuración POS** de Fast Look.
6. Sustituye el dominio de ejemplo por el origen exacto de Fast Look, sin `/` final.
7. Mantén `drawer.enabled` en `false` hasta confirmar pin y pulsos del cajón.
8. Ejecuta desde esta carpeta:

```powershell
npm install
npm run build
npm start
```

Comprueba el estado con el token configurado:

```powershell
$headers = @{ 'X-FastLook-POS-Token' = 'TU_TOKEN' }
Invoke-RestMethod -Uri 'http://127.0.0.1:17891/status' -Headers $headers
```

Si la impresora no está instalada o está apagada, `/status` responde con `impresoraDisponible: false` sin cerrar el bridge.

## Seguridad

- El servidor está enlazado únicamente a loopback; nunca usa `0.0.0.0`.
- CORS exige un origen incluido en `allowedOrigins`.
- Todos los endpoints funcionales exigen token local.
- El cuerpo se limita a 64 KiB y el ticket se valida estrictamente.
- Los logs sólo incluyen fecha, ruta, estado y duración; nunca token ni contenido del ticket.
- La impresión usa `winspool.drv` con tipo `RAW`; no usa `window.print`.
