export const LONGITUDES_CADENA = [
  { etiqueta: '90L', precio: 90 },
  { etiqueta: '108L', precio: 120 },
  { etiqueta: '116L', precio: 140 },
  { etiqueta: '136L', precio: 160 },
] as const

export const TIPOS_CADENA = [
  { etiqueta: '428 Negra', ajuste: 0 },
  { etiqueta: '428 Dorada', ajuste: 50 },
  { etiqueta: '520 Negra', ajuste: 70 },
  { etiqueta: '520 Dorada', ajuste: 120 },
] as const

export const ACABADOS_ESTRELLA = ['Negra', 'Dorada'] as const
export const DIENTES_ESTRELLA = Array.from({ length: 31 }, (_, indice) => indice + 30)
export const DIENTES_PINON = Array.from({ length: 11 }, (_, indice) => indice + 10)
export const PRECIOS_KIT_PERMITIDOS = [280, 300, 320, 400, 420, 500] as const
export const NIVELES_SERVICIO = [
  { etiqueta: 'Sencillo', precio: 25 }, { etiqueta: 'Normal', precio: 50 },
  { etiqueta: 'Medio', precio: 75 }, { etiqueta: 'Completo', precio: 100 },
  { etiqueta: 'Complejo', precio: 150 }, { etiqueta: 'Tardado', precio: 200 },
] as const

export type AcabadoEstrella = typeof ACABADOS_ESTRELLA[number]

export const redondearMultiplo5 = (valor: number) => Math.round(valor / 5) * 5
export const calcularCadena = (indiceLongitud: number, indiceTipo: number) => LONGITUDES_CADENA[indiceLongitud].precio + TIPOS_CADENA[indiceTipo].ajuste
export const calcularEstrella = (dientes: number, acabado: AcabadoEstrella) => redondearMultiplo5(dientes * (acabado === 'Dorada' ? 3 : 2.23))
export const calcularPinon = (dientes: number) => redondearMultiplo5(dientes * 2.28)
export const calcularSubtotalKit = (cadena: number, estrella: number, pinon: number) => cadena + estrella + pinon + 50
export const precioKitPermitidoMasCercano = (subtotal: number) => PRECIOS_KIT_PERMITIDOS.reduce((mejor, precio) => {
  const distancia = Math.abs(precio - subtotal), mejorDistancia = Math.abs(mejor - subtotal)
  return distancia < mejorDistancia || (distancia === mejorDistancia && precio > mejor) ? precio : mejor
})
export const precioServicioPorNivel = (indice: number) => NIVELES_SERVICIO[indice].precio
