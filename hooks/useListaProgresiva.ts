'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { obtenerLoteProgresivo, siguienteLimiteProgresivo, TAMANO_LOTE_PRODUCTOS } from '@/utils/paginacion'

export default function useListaProgresiva<T>(elementos: T[], tamanoLote = TAMANO_LOTE_PRODUCTOS) {
  const [limite, setLimite] = useState(tamanoLote)
  const listaAnterior = useRef(elementos)
  const listaCambio = listaAnterior.current !== elementos
  const limiteEfectivo = listaCambio ? tamanoLote : limite
  if (listaCambio) listaAnterior.current = elementos
  useEffect(() => setLimite(tamanoLote), [elementos, tamanoLote])
  const visibles = useMemo(() => obtenerLoteProgresivo(elementos, limiteEfectivo), [elementos, limiteEfectivo])
  return {
    visibles,
    total: elementos.length,
    hayMas: limiteEfectivo < elementos.length,
    cargarMas: () => setLimite((actual) => siguienteLimiteProgresivo(listaCambio ? tamanoLote : actual, elementos.length, tamanoLote)),
  }
}
