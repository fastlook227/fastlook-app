FAST LOOK POS BRIDGE 1.0.0 - WINDOWS 10/11 x64
================================================

Este paquete incluye su propio runtime. No requiere instalar Node.js.
No contiene tokens, contrasenas ni configuraciones privadas.

INSTALAR
1. Instala el controlador de la impresora termica y prueba la impresion desde Windows.
2. Copia y descomprime la carpeta completa en la computadora del negocio.
3. Ejecuta install.cmd.
4. Selecciona/escribe el nombre exacto de la impresora.
5. El instalador genera el token local, lo copia al portapapeles y lo muestra una sola vez.
6. Abre https://fastlook-app.vercel.app, entra a Configuracion POS y pega el token.

El Bridge se instala para el usuario actual en:
  %LOCALAPPDATA%\FastLookPOSBridge

Inicia automaticamente al entrar a Windows, sin mostrar una consola. Solo escucha en:
  http://127.0.0.1:17891

ADMINISTRACION
- status.cmd: comprueba Bridge, impresora y cajon sin mostrar el token.
- configure.cmd: cambia impresora, token o configuracion del cajon.
- restart.cmd: reinicia el proceso en segundo plano.
- uninstall.cmd: detiene el Bridge y elimina programa, inicio automatico y configuracion.
- logs\bridge.log: diagnostico de arranque y solicitudes, sin token ni contenido de tickets.

Los mismos comandos quedan copiados en %LOCALAPPDATA%\FastLookPOSBridge.

ACTUALIZAR
1. Lleva en USB una version nueva del paquete y descomprimela.
2. Ejecuta update.cmd.
3. La configuracion y el token existentes se conservan.

CAJON DE DINERO
Conecta el cajon al puerto RJ11/RJ12 de la impresora, no directamente a la PC.
Ejecuta configure.cmd, habilita el cajon y elige pin ESC/POS 0 o 1 segun el fabricante.
Los pulsos predeterminados son 100 ms encendido y 200 ms apagado.

SEGURIDAD
- config.json se crea solo en la PC instalada y sus permisos se restringen al usuario actual.
- El token nunca forma parte del ZIP.
- El Bridge no escucha en la red LAN ni en Internet.
- CORS permite la aplicacion de produccion y localhost de desarrollo.

NOTA
Algunos navegadores pueden pedir permiso para que fastlook-app.vercel.app acceda a servicios
locales. Debes permitirlo para imprimir. Usa una version moderna de Edge o Chrome.
