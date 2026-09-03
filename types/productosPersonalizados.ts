export type TipoCampoPersonalizado = 'opcion' | 'numero' | 'texto' | 'booleano' | 'precio' | 'producto_referencia'
export type OperadorReglaPersonalizada = 'precio_fijo' | 'valor_manual' | 'ajuste_por_opcion' | 'ajuste_por_booleano' | 'multiplicar_numero' | 'sumar_referencia' | 'ajuste_fijo' | 'ajuste_porcentual' | 'limite_minimo' | 'limite_maximo'
export type DestinoRegla = 'precio' | 'costo'
export type TipoCalculoPersonalizado = 'precio_fijo' | 'precio_manual' | 'suma_referencias' | 'calculado_editable'
export type PoliticaCostoPersonalizado = 'sin_costo' | 'costo_fijo' | 'costo_calculado' | 'costo_manual' | 'suma_referencias'
export type PoliticaDevolucionPersonalizado = 'no_devolvible' | 'reembolso_sin_stock' | 'devolvible_configurable'

export interface OpcionPersonalizada { id: string; etiqueta: string }
export interface CampoPersonalizado { id: string; etiqueta: string; tipo: TipoCampoPersonalizado; obligatorio: boolean; longitud_maxima?: number; minimo?: number; maximo?: number; opciones?: OpcionPersonalizada[]; usar_precio?: boolean; usar_costo?: boolean }
export interface ReglaPersonalizada { id: string; operador: OperadorReglaPersonalizada; destino: DestinoRegla; campo_id?: string; opcion_id?: string; valor?: 'precio' | 'costo'; importe?: number; ajuste?: number; factor?: number; porcentaje?: number }
export interface DefinicionProductoPersonalizado { schema_version: 1; campos: CampoPersonalizado[]; reglas: ReglaPersonalizada[] }
export interface ProductoPersonalizado { id: string; nombre: string; descripcion: string | null; activo: boolean; version_publicada_id: string | null; created_at: string; updated_at: string }
export interface VersionProductoPersonalizado { id: string; producto_personalizado_id: string; numero_version: number; estado: 'BORRADOR' | 'PUBLICADA'; definicion: DefinicionProductoPersonalizado; precio_base: number; tipo_calculo: TipoCalculoPersonalizado; permite_editar_precio: boolean; politica_costo: PoliticaCostoPersonalizado; politica_devolucion: PoliticaDevolucionPersonalizado; created_at: string; updated_at: string }
export interface ResultadoValidacionPersonalizada { valida: boolean; errores: string[] }
