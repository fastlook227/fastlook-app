export interface ProductoMaestroTianguis { id: string; nombre: string; orden: number; activo: boolean }
export interface TareaTianguis { id: string; producto_id: string; nombre: string; orden: number; completada_at: string | null; completada_por: string | null; completada_por_nombre: string | null }
export interface FotoTianguis { id: string; semana_domingo: string; ruta: string; miniatura_ruta: string; mime: string; subida_at: string; subida_por: string; subida_por_nombre: string; url?: string; miniatura_url?: string }
export type VaciadoTianguis = { completada_at: string; completada_por: string; completada_por_nombre: string } | null
export interface PanelTianguis { semana_domingo: string; semana_actual: string; es_kikeadmin: boolean; vaciado: VaciadoTianguis; tareas: TareaTianguis[]; productos_maestros: ProductoMaestroTianguis[]; fotos: FotoTianguis[] }
