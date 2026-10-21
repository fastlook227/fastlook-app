export const ESTADOS_ENTREGA = ['Pendiente de confirmación', 'Confirmada', 'Preparando pedido', 'En camino', 'Repartidor en el punto', 'Entregada', 'Cancelada', 'Reprogramada'] as const
export type EstadoEntrega = typeof ESTADOS_ENTREGA[number]
export type EstadoComunicacion = 'No preparado' | 'Mensaje preparado' | 'Mensaje enviado' | 'Respuesta confirmada'

export interface UsuarioEntrega { id: string; nombre: string }
export interface EventoEntrega { id: string; tipo: string; estado_anterior: EstadoEntrega | null; estado_nuevo: EstadoEntrega | null; detalle: string | null; created_at: string; responsable_id: string; responsable_nombre: string }
export interface EntregaProxima {
  id: string; productos: string; cliente_nombre: string; facebook_url: string | null; telefono: string | null
  fecha_entrega: string; hora_entrega: string; fecha_hora_iso: string; ubicacion: string; maps_url: string | null
  precio_acordado: number | null; anticipo: number | null; observaciones: string | null
  acordada_por: string; acordada_por_nombre: string; repartidor_id: string | null; repartidor_nombre: string | null
  asignacion_confirmada_at: string | null; estado: EstadoEntrega; recordatorio_generado_at: string | null
  confirmacion_estado: EstadoComunicacion; confirmacion_solicitada_at: string | null; created_at: string; updated_at: string
  motivo_cancelacion: string | null; fecha_original: string; hora_original: string; eventos: EventoEntrega[]
}
export interface PanelEntregas { ahora: string; es_kikeadmin: boolean; entregas: EntregaProxima[]; historial: EntregaProxima[]; usuarios: UsuarioEntrega[] }
