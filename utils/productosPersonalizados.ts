import type { CampoPersonalizado, DefinicionProductoPersonalizado, DestinoRegla, OperadorReglaPersonalizada, OpcionPersonalizada, ReglaPersonalizada, TipoCampoPersonalizado } from '@/types/productosPersonalizados'

export const DEFINICION_VACIA: DefinicionProductoPersonalizado = { schema_version: 1, campos: [], reglas: [] }
export const ID_SEGURO = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

export const sugerirId = (etiqueta: string) => {
  const limpio = etiqueta.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^[_\d-]+|_+$/g, '').slice(0, 64)
  return limpio && /^[a-z]/.test(limpio) ? limpio : limpio ? `x_${limpio}`.slice(0, 64) : 'campo'
}
export const idsDuplicados = (ids: string[]) => [...new Set(ids.filter((id, indice) => id && ids.indexOf(id) !== indice))]
export const agregarCampo = (d: DefinicionProductoPersonalizado, campo: CampoPersonalizado) => ({ ...d, campos: [...d.campos, campo] })
export const eliminarCampo = (d: DefinicionProductoPersonalizado, id: string) => ({ ...d, campos: d.campos.filter((c) => c.id !== id), reglas: d.reglas.filter((r) => r.campo_id !== id) })
export const agregarOpcion = (campo: CampoPersonalizado, opcion: OpcionPersonalizada) => ({ ...campo, opciones: [...(campo.opciones || []), opcion] })
export const eliminarOpcion = (campo: CampoPersonalizado, id: string) => ({ ...campo, opciones: (campo.opciones || []).filter((o) => o.id !== id) })
export const agregarRegla = (d: DefinicionProductoPersonalizado, regla: ReglaPersonalizada) => ({ ...d, reglas: [...d.reglas, regla] })
export const eliminarRegla = (d: DefinicionProductoPersonalizado, id: string) => ({ ...d, reglas: d.reglas.filter((r) => r.id !== id) })
export const serializarDefinicion = (d: DefinicionProductoPersonalizado) => JSON.stringify({ schema_version: 1, campos: d.campos, reglas: d.reglas })
export const destinoRegla = (destino?: DestinoRegla): DestinoRegla => destino || 'precio'
const tiposPorOperador: Partial<Record<OperadorReglaPersonalizada, TipoCampoPersonalizado[]>> = { valor_manual: ['precio'], ajuste_por_opcion: ['opcion'], ajuste_por_booleano: ['booleano'], multiplicar_numero: ['numero', 'precio'], sumar_referencia: ['producto_referencia'] }
export const tiposCompatibles = (operador: OperadorReglaPersonalizada): TipoCampoPersonalizado[] => tiposPorOperador[operador] || []
export const camposCompatibles = (campos: CampoPersonalizado[], operador: OperadorReglaPersonalizada) => { const tipos = tiposCompatibles(operador); return tipos.length ? campos.filter((c) => tipos.includes(c.tipo)) : [] }
export const referenciasCompatibles = (campos: CampoPersonalizado[], valor: 'precio' | 'costo') => campos.filter((c) => c.tipo === 'producto_referencia' && (valor === 'precio' ? c.usar_precio === true : c.usar_costo === true))
