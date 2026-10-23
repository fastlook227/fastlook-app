'use client'

import { useCallback, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

const selector = 'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
const esCampoEdicion = (elemento: EventTarget | null) => elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement || elemento instanceof HTMLSelectElement || (elemento instanceof HTMLElement && elemento.isContentEditable)

export default function useNavegacionPOS(contenedor: RefObject<HTMLElement | null>) {
  return useCallback((evento: ReactKeyboardEvent<HTMLElement>) => {
    if (esCampoEdicion(evento.target) || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(evento.key)) return
    const elementos = Array.from(contenedor.current?.querySelectorAll<HTMLElement>(selector) || []).filter((elemento) => elemento.offsetParent !== null && elemento.getAttribute('aria-hidden') !== 'true')
    if (!elementos.length) return
    const actual = document.activeElement instanceof HTMLElement && elementos.includes(document.activeElement) ? document.activeElement : null
    if (!actual) { evento.preventDefault(); elementos[0].focus(); return }
    const origen = actual.getBoundingClientRect(), ox = origen.left + origen.width / 2, oy = origen.top + origen.height / 2
    const vertical = evento.key === 'ArrowUp' || evento.key === 'ArrowDown'
    const signo = evento.key === 'ArrowUp' || evento.key === 'ArrowLeft' ? -1 : 1
    const candidatos = elementos.filter((elemento) => {
      if (elemento === actual) return false
      const rect = elemento.getBoundingClientRect(), delta = vertical ? rect.top + rect.height / 2 - oy : rect.left + rect.width / 2 - ox
      return Math.sign(delta) === signo
    })
    const siguiente = candidatos.sort((a, b) => {
      const puntuar = (elemento: HTMLElement) => { const r = elemento.getBoundingClientRect(), dx = r.left + r.width / 2 - ox, dy = r.top + r.height / 2 - oy; return (vertical ? Math.abs(dy) * 4 + Math.abs(dx) : Math.abs(dx) * 4 + Math.abs(dy)) }
      return puntuar(a) - puntuar(b)
    })[0]
    if (siguiente) { evento.preventDefault(); siguiente.focus() }
  }, [contenedor])
}
