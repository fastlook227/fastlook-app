export const ACCIONES_ASISTENTE = [
  'CONSULTAR_EXISTENCIA',
  'CONSULTAR_PRECIO',
  'CONSULTAR_UBICACION',
  'CONSULTAR_PROVEEDOR',
  'CONSULTAR_DATOS',
  'CREAR_PRODUCTO',
  'EDITAR_PRODUCTO',
  'CAMBIAR_PRECIO',
  'CAMBIAR_UBICACION',
  'CAMBIAR_UBICACION_MASIVA',
  'SUMAR_STOCK',
  'RESTAR_STOCK',
  'AJUSTAR_STOCK',
  'ARCHIVAR_PRODUCTO',
  'DESCONOCIDA',
] as const

export type AccionAsistente = (typeof ACCIONES_ASISTENTE)[number]

export type DatoPendienteAsistente =
  | 'precio'
  | 'cantidad'
  | 'nuevaUbicacion'
  | 'producto'
  | 'datos_producto'

export interface AccionPendienteAsistente {
  accion: AccionAsistente
  productoId: string | null
  valorPendiente: DatoPendienteAsistente
  cantidad: number | null
  precio: number | null
  nuevaUbicacion: string | null
  valorAnterior: string | null
  valorNuevo: string | null
}

export interface ContextoAsistente {
  productoSeleccionadoId: string | null
  ultimaAccion: AccionAsistente | null
  datosPendientes: DatoPendienteAsistente[]
  turnoConversacion: number
  coincidenciasPendientesIds: string[]
  accionPendiente: AccionPendienteAsistente | null
  accionOriginalPendiente: AccionAsistente | null
  consultaOriginalPendiente: string
  productoBuscadoOriginal: string
  cantidadPendiente: number | null
  precioPendiente: number | null
  opcionesPendientesIds: string[]
  buscandoOtroNombre: boolean
  accionMasivaPendiente: 'CAMBIAR_UBICACION_MASIVA' | null
  filtrosMasivos: FiltroProductosMasivo | null
  nuevaUbicacionMasiva: string | null
  consultaOriginalMasiva: string
  etapaOperacionMasiva: EtapaOperacionMasiva
}

export interface FiltroProductosMasivo {
  textoBusqueda: string | null
  categoria: string | null
  proveedor: string | null
  color: string | null
  modelo: string | null
  codigo: string | null
  ubicacionActual: string | null
  soloNoArchivados: boolean
}

export interface ProductoSeleccionMasiva {
  id: string
  codigo: string
  nombre: string
  categoria: string
  proveedor: string | null
  ubicacionActual: string | null
  precio: number
  stock: number
  seleccionado: boolean
}

export type EtapaOperacionMasiva =
  | 'inactiva'
  | 'esperando_ubicacion'
  | 'esperando_filtros'
  | 'seleccion'
  | 'confirmacion'
  | 'confirmacion_reforzada'
  | 'confirmada'

export interface OperacionMasivaAsistente {
  accion: 'CAMBIAR_UBICACION_MASIVA'
  filtros: FiltroProductosMasivo
  nuevaUbicacion: string | null
  productos: ProductoSeleccionMasiva[]
  totalCoincidencias: number
  excedeLimite: boolean
  etapa: EtapaOperacionMasiva
}

export type TipoOpcionAsistente =
  | 'PRODUCTO'
  | 'CONFIRMAR'
  | 'CANCELAR'
  | 'CREAR_PRODUCTO'
  | 'REINICIAR'
  | 'NINGUNO_CORRESPONDE'
  | 'BUSCAR_OTRO_NOMBRE'
  | 'FINALIZAR_CONSULTA'
  | 'PREPARAR_PRODUCTO_NUEVO'

export interface OpcionAsistente {
  id: string
  texto: string
  subtitulo?: string
  tipo: TipoOpcionAsistente
}

export interface InterpretacionAsistente {
  accion: AccionAsistente
  productoBuscado: string
  cantidad: number | null
  precio: number | null
  nuevaUbicacion: string | null
  filtros: FiltroProductosMasivo
  confianza: number
  requiereConfirmacion: boolean
  explicacion: string
}

export interface ProductoAsistente {
  id: string
  nombre: string
  codigo: string
  existencia: number
  precio: number
  costo?: number
  ubicacion: string
  proveedor: string
  categoria: string
}

export interface ResultadoBusquedaProducto {
  producto: ProductoAsistente
  puntaje: number
  motivoCoincidencia: string
}

export interface RespuestaAsistente {
  interpretacion: InterpretacionAsistente
  mensajePrincipal: string
  informacionExtra: Array<{ etiqueta: string; valor: string }>
  preguntaSeguimiento: string | null
  productoSeleccionadoId: string | null
  accionPendiente: AccionAsistente | null
  accionPendienteDetalle: AccionPendienteAsistente | null
  datosPendientes: DatoPendienteAsistente[]
  opciones: OpcionAsistente[]
  requiereConfirmacion: boolean
  productoSeleccionado: { id: string; texto: string } | null
  coincidenciasPendientes: ResultadoBusquedaProducto[]
  productosParecidos: ResultadoBusquedaProducto[]
  limpiarContexto: boolean
  operacionMasiva: OperacionMasivaAsistente | null
}

export interface MensajeAsistente {
  id: string
  autor: 'usuario' | 'asistente'
  texto: string
  respuesta?: RespuestaAsistente
  opcionesLocales?: OpcionAsistente[]
}

export type EstadoPropuestaAsistente =
  | 'PENDIENTE'
  | 'EJECUTANDO'
  | 'EJECUTADA'
  | 'ERROR'
  | 'CANCELADA'

export interface DetalleEjecucionProducto {
  productoId: string
  codigo: string
  nombre: string
  campo: string
  valorAnterior: string | number | null
  valorNuevo: string | number | null
}

export interface DetalleErrorEjecucion {
  productoId?: string
  nombre?: string
  mensaje: string
}

export interface ResultadoEjecucionAsistente {
  ok: boolean
  mensaje: string
  accion: AccionAsistente
  productosAfectados: number
  productosOmitidos: number
  detalles: DetalleEjecucionProducto[]
  errores: DetalleErrorEjecucion[]
  duplicada?: boolean
}

export type DatosPropuestaEjecucion =
  | {
      accion: 'CAMBIAR_UBICACION'
      productoId: string
      nuevaUbicacion: string
    }
  | {
      accion: 'CAMBIAR_UBICACION_MASIVA'
      productoIds: string[]
      nuevaUbicacion: string
    }
  | {
      accion: 'SUMAR_STOCK' | 'RESTAR_STOCK'
      productoId: string
      cantidad: number
    }
