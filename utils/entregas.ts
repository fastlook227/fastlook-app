import type { EntregaProxima, EstadoEntrega } from '@/types/entregas'

export const ZONA_HORARIA_ENTREGAS = 'America/Mexico_City'
export const ESTADOS_FINALIZADOS: EstadoEntrega[] = ['Entregada', 'Cancelada']

export function normalizarTelefonoMexicano(valor: string | null | undefined) {
  let digitos = (valor || '').replace(/\D/g, '')
  if (digitos.startsWith('0052')) digitos = digitos.slice(4)
  if (digitos.startsWith('52') && digitos.length === 12) return digitos
  if (digitos.length === 10) return `52${digitos}`
  return null
}

export function construirMensajeEntrega(tipo: 'confirmar'|'presentar'|'preparando'|'camino'|'llegue'|'ubicacion'|'reprogramar'|'cancelacion'|'gracias', entrega: EntregaProxima) {
  const cliente = entrega.cliente_nombre ? ` ${entrega.cliente_nombre}` : ''
  const producto = entrega.productos
  const repartidor = entrega.repartidor_nombre || 'el repartidor de FAST LOOK'
  const horario = `${entrega.fecha_entrega} a las ${entrega.hora_entrega.slice(0, 5)}`
  const lugar = entrega.ubicacion
  const mensajes = {
    confirmar: `Hola${cliente}, te escribimos de FAST LOOK para confirmar la entrega de ${producto} el ${horario} en ${lugar}. ¿Nos confirmas por favor?`,
    presentar: `Hola${cliente}, hoy soy ${repartidor} y realizaré tu entrega de ${producto}.`,
    preparando: `Hola${cliente}, tu pedido de ${producto} ya está en preparación.`,
    camino: `Hola${cliente}, ${repartidor} ya va en camino con tu pedido de ${producto}.`,
    llegue: `Hola${cliente}, ${repartidor} ya llegó al punto acordado: ${lugar}.`,
    ubicacion: `Hola${cliente}, ¿nos compartes tu ubicación actual para completar la entrega de ${producto}?`,
    reprogramar: `Hola${cliente}, necesitamos acordar un nuevo horario para la entrega de ${producto}. ¿Qué fecha y hora te funcionan?`,
    cancelacion: `Hola${cliente}, ¿podrías indicarnos el motivo por el que deseas cancelar la entrega de ${producto}?`,
    gracias: `Gracias por tu compra${cliente}. Esperamos que disfrutes ${producto}. FAST LOOK agradece tu preferencia.`,
  }
  return mensajes[tipo]
}

export function urlWhatsApp(telefono: string | null | undefined, mensaje: string) {
  const normalizado = normalizarTelefonoMexicano(telefono)
  return normalizado ? `https://wa.me/${normalizado}?text=${encodeURIComponent(mensaje)}` : null
}

export function requiereConfirmacion(entrega: EntregaProxima, ahoraMs = Date.now()) {
  if (!['Pendiente de confirmación', 'Reprogramada'].includes(entrega.estado) || entrega.confirmacion_estado === 'Respuesta confirmada') return false
  const faltan = new Date(entrega.fecha_hora_iso).getTime() - ahoraMs
  return faltan <= 30 * 60_000
}

export function filtrarEntregas(entregas: EntregaProxima[], busqueda: string) {
  const termino = busqueda.trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!termino) return entregas
  return entregas.filter((e) => [e.productos, e.cliente_nombre, e.ubicacion, e.repartidor_nombre, e.acordada_por_nombre].some((v) => (v || '').toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termino)))
}
