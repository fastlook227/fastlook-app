import { NextResponse } from 'next/server'
import { z } from 'zod'
import { openai } from '@/lib/openai'

const RespuestaPruebaSchema = z.object({
  ok: z.boolean(),
  mensaje: z.string().trim().min(1).max(200),
})

const responder = (
  respuesta: z.infer<typeof RespuestaPruebaSchema>,
  status = 200
) => {
  return NextResponse.json(RespuestaPruebaSchema.parse(respuesta), { status })
}

export async function POST() {
  try {
    const respuesta = await openai.responses.create({
      model: 'gpt-5.6-luna',
      input: 'Responde brevemente: conexión correcta.',
      reasoning: { effort: 'none' },
      max_output_tokens: 20,
    })

    return responder({
      ok: true,
      mensaje: respuesta.output_text,
    })
  } catch (error) {
    console.error('Error seguro de OpenAI:', {
      nombre: error instanceof Error ? error.name : 'Error desconocido',
      mensaje: error instanceof Error ? error.message : 'Sin mensaje',
      status:
        typeof error === 'object' &&
        error !== null &&
        'status' in error
          ? error.status
          : undefined,
      code:
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? error.code
          : undefined,
      type:
        typeof error === 'object' &&
        error !== null &&
        'type' in error
          ? error.type
          : undefined,
    })

    return responder(
      {
        ok: false,
        mensaje: 'No fue posible completar la prueba de IA.',
      },
      500
    )
  }
}
