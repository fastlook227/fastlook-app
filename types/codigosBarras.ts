export interface ConflictoCodigoBarras {
  tipo: 'CODIGO_BARRAS_EN_OTRO_PRODUCTO' | 'CODIGO_FAST_LOOK_DUPLICADO' | 'CODIGO_FAST_LOOK_VACIO' | string
  producto_id: string
  codigo: string | null
  producto_conflicto_id: string | null
}

export interface RespuestaAsignacionCodigosBarras {
  ok: boolean
  codigo: 'CODIGOS_BARRAS_ASIGNADOS' | 'CONFLICTOS_CODIGOS_BARRAS' | string
  productos_actualizados: number
  productos_faltantes: number
  productos_omitidos: number
  conflictos: number
  detalle_conflictos: ConflictoCodigoBarras[]
}
