'use client'

import { useEffect, useState } from 'react'
import { BREAKPOINT_POS_DESKTOP } from '@/utils/pos'

export default function usePOSDesktop() {
  const [esDesktop, setEsDesktop] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${BREAKPOINT_POS_DESKTOP}px) and (hover: hover) and (pointer: fine)`)
    const actualizar = () => setEsDesktop(media.matches)
    actualizar(); media.addEventListener('change', actualizar)
    return () => media.removeEventListener('change', actualizar)
  }, [])
  return esDesktop
}
