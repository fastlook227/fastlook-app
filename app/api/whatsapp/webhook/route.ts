type Registro = Record<string, unknown>

const esRegistro = (valor: unknown): valor is Registro =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

const obtenerArreglo = (registro: Registro, clave: string): unknown[] =>
  Array.isArray(registro[clave]) ? registro[clave] : []

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams
  const modo = parametros.get('hub.mode')
  const token = parametros.get('hub.verify_token')
  const challenge = parametros.get('hub.challenge')

  if (!modo || !token || !challenge) {
    return new Response('Faltan parámetros de verificación.', { status: 400 })
  }

  if (modo !== 'subscribe' || token !== process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response('Verificación rechazada.', { status: 403 })
  }

  return new Response(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ recibido: false, mensaje: 'El cuerpo debe ser JSON válido.' }, { status: 400 })
  }

  const raiz = esRegistro(payload) ? payload : {}
  const entries = obtenerArreglo(raiz, 'entry')
  const changes = entries.flatMap((entry) => esRegistro(entry) ? obtenerArreglo(entry, 'changes') : [])
  const values = changes.map((change) => esRegistro(change) && esRegistro(change.value) ? change.value : {})
  const messages = values.flatMap((value) => obtenerArreglo(value, 'messages'))
  const statuses = values.flatMap((value) => obtenerArreglo(value, 'statuses'))
  const tiposCambio = [...new Set(changes.map((change) => esRegistro(change) && typeof change.field === 'string' ? change.field : 'desconocido'))]
  const tiposMensaje = [...new Set(messages.map((message) => esRegistro(message) && typeof message.type === 'string' ? message.type : 'desconocido'))]
  const tiposEstado = [...new Set(statuses.map((status) => esRegistro(status) && typeof status.status === 'string' ? status.status : 'desconocido'))]

  console.info('Webhook de WhatsApp recibido:', {
    object: typeof raiz.object === 'string' ? raiz.object : null,
    esEventoWhatsApp: raiz.object === 'whatsapp_business_account',
    entries: entries.length,
    changes: changes.length,
    messages: messages.length,
    statuses: statuses.length,
    tiposCambio,
    tiposMensaje,
    tiposEstado,
  })

  return Response.json({ recibido: true }, { status: 200 })
}
