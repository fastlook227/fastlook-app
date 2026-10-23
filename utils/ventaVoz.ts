const UNIDADES: Record<string, number> = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 }
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 }
const CENTENAS: Record<string, number> = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 }
export const IMPORTE_MAXIMO_VOZ = 9_999_999.99

// es-MX: la coma sólo separa miles (1,250.50); el punto marca decimales.
export const normalizarFraseVoz = (frase: string) => frase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/[$¿?¡!,;:]/g, ' ').replace(/\s+/g, ' ').trim()

const menorMil = (texto: string): number | null => {
  const tokens = texto.split(' ').filter(Boolean)
  if (!tokens.length) return 0
  let total = 0
  if (tokens[0] in CENTENAS) {
    const centena = tokens.shift()!
    if (centena === 'cien' && tokens.length) return null
    total += CENTENAS[centena]
  }
  if (!tokens.length) return total
  const resto = tokens.join(' ')
  if (resto in UNIDADES) return total + UNIDADES[resto]
  if (tokens[0] in DECENAS && (tokens.length === 1 || (tokens.length === 3 && tokens[1] === 'y' && tokens[2] in UNIDADES && UNIDADES[tokens[2]] > 0 && UNIDADES[tokens[2]] < 10))) return total + DECENAS[tokens[0]] + (tokens.length === 3 ? UNIDADES[tokens[2]] : 0)
  return null
}

const enteroEspanol = (texto: string): number | null => {
  if (/^\d+$/.test(texto)) return Number(texto)
  const partes = texto.split(/\bmil\b/)
  if (partes.length > 2) return null
  if (partes.length === 1) return menorMil(texto)
  const miles = partes[0].trim() ? menorMil(partes[0].trim()) : 1
  const resto = menorMil(partes[1].trim())
  return miles !== null && miles > 0 && resto !== null ? miles * 1000 + resto : null
}

export type ResultadoImporteVoz = { ok: true; importe: number } | { ok: false; motivo: 'vacio' | 'ambiguo' | 'metodo' | 'formato' | 'limite' }

export function reconocerImporteVoz(fraseOriginal: string): ResultadoImporteVoz {
  const frase = normalizarFraseVoz(fraseOriginal)
  if (!frase) return { ok: false, motivo: 'vacio' }
  if (/\b(tarjeta|transferencia|transferi|credito|debito|cheque|deposito|spei|vales?|paypal|mercado ?pago)\b/.test(frase)) return { ok: false, motivo: 'metodo' }
  if (/\b(o|de|por|fueron|pago|pague|cobro|recibi|recibido)\b/.test(frase)) return { ok: false, motivo: 'ambiguo' }
  const coincidencia = frase.replace(/ (en )?efectivo$/, '').match(/^(.+?)(?: pesos?)?(?: con (.+?) centavos?)?$/)
  if (!coincidencia) return { ok: false, motivo: 'formato' }
  let principal = coincidencia[1].trim().replace(/ pesos?$/, '').trim()
  const centavosTexto = coincidencia[2]?.trim()
  if (!principal || /\b(centavo|peso)\b/.test(principal)) return { ok: false, motivo: 'formato' }
  if (/^\d+\.\d{1,2}$/.test(principal)) {
    if (centavosTexto) return { ok: false, motivo: 'ambiguo' }
    const importe = Number(principal)
    return importe > 0 && importe <= IMPORTE_MAXIMO_VOZ ? { ok: true, importe: Math.round(importe * 100) / 100 } : { ok: false, motivo: 'limite' }
  }
  const pesos = enteroEspanol(principal)
  const centavos = centavosTexto ? enteroEspanol(centavosTexto) : 0
  if (pesos === null || centavos === null || centavos < 0 || centavos > 99) return { ok: false, motivo: 'formato' }
  // En centavos enteros: 1 + 14/100 daría 1.1400000000000001 y el servidor lo rechazaría.
  const importe = (pesos * 100 + centavos) / 100
  return importe > 0 && importe <= IMPORTE_MAXIMO_VOZ ? { ok: true, importe } : { ok: false, motivo: 'limite' }
}
