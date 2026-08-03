import { z } from 'zod'
import { ACCIONES_ASISTENTE } from '@/types/asistente'

const EsquemaFiltrosMasivos = z.object({
  textoBusqueda: z.string().trim().max(200).nullable(),
  categoria: z.string().trim().max(100).nullable(),
  proveedor: z.string().trim().max(100).nullable(),
  color: z.string().trim().max(50).nullable(),
  modelo: z.string().trim().max(100).nullable(),
  codigo: z.string().trim().max(100).nullable(),
  ubicacionActual: z.string().trim().max(100).nullable(),
  soloNoArchivados: z.boolean(),
})

export const EsquemaInterpretacionAsistente = z.object({
  accion: z.enum(ACCIONES_ASISTENTE),
  productoBuscado: z.string(),
  cantidad: z.number().nullable(),
  precio: z.number().nullable(),
  nuevaUbicacion: z.string().trim().min(1).max(100).nullable(),
  filtros: EsquemaFiltrosMasivos,
  confianza: z.number().min(0).max(1),
  requiereConfirmacion: z.boolean(),
  explicacion: z.string().min(1),
})

export const EsquemaSolicitudAsistente = z.object({
  mensaje: z.string().trim().min(1).max(1000),
  seleccionProductoId: z.string().uuid().nullable().optional(),
  contexto: z.object({
    productoSeleccionadoId: z.string().uuid().nullable(),
    ultimaAccion: z.enum(ACCIONES_ASISTENTE).nullable(),
    datosPendientes: z.array(
      z.enum(['precio', 'cantidad', 'nuevaUbicacion', 'producto', 'datos_producto'])
    ),
    turnoConversacion: z.number().int().min(0),
    coincidenciasPendientesIds: z.array(z.string().uuid()),
    accionPendiente: z.object({
      accion: z.enum(ACCIONES_ASISTENTE),
      productoId: z.string().uuid().nullable(),
      valorPendiente: z.enum(['precio', 'cantidad', 'nuevaUbicacion', 'producto', 'datos_producto']),
      cantidad: z.number().nullable(),
      precio: z.number().nullable(),
      nuevaUbicacion: z.string().max(100).nullable(),
      valorAnterior: z.string().nullable(),
      valorNuevo: z.string().nullable(),
    }).nullable(),
    accionOriginalPendiente: z.enum(ACCIONES_ASISTENTE).nullable(),
    consultaOriginalPendiente: z.string().max(1000),
    productoBuscadoOriginal: z.string().max(1000),
    cantidadPendiente: z.number().nullable(),
    precioPendiente: z.number().nullable(),
    opcionesPendientesIds: z.array(z.string().uuid()),
    buscandoOtroNombre: z.boolean(),
    accionMasivaPendiente: z.literal('CAMBIAR_UBICACION_MASIVA').nullable(),
    filtrosMasivos: EsquemaFiltrosMasivos.nullable(),
    nuevaUbicacionMasiva: z.string().trim().max(100).nullable(),
    consultaOriginalMasiva: z.string().max(1000),
    etapaOperacionMasiva: z.enum([
      'inactiva', 'esperando_ubicacion', 'esperando_filtros', 'seleccion',
      'confirmacion', 'confirmacion_reforzada', 'confirmada',
    ]),
  }),
})
