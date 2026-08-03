import 'server-only'

import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error(
    'Falta OPENAI_API_KEY. Configúrala en el entorno del servidor.'
  )
}

export const openai = new OpenAI({ apiKey })
