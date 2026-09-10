'use client'

import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { EmpleadoCheckIn } from '@/types/checkin'
import { crearContenidoQrCheckIn } from '@/utils/checkin'

export default function CredencialCheckIn({ empleado, onCerrar }: { empleado: EmpleadoCheckIn; onCerrar: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let vigente = true
    void import('@zxing/library').then(({ BarcodeFormat, EncodeHintType, QRCodeWriter }) => {
      const canvas = canvasRef.current
      if (!vigente || !canvas) return
      const matriz = new QRCodeWriter().encode(crearContenidoQrCheckIn(empleado.id), BarcodeFormat.QR_CODE, 320, 320, new Map([[EncodeHintType.MARGIN, 1]]))
      const contexto = canvas.getContext('2d')
      if (!contexto) return
      canvas.width = matriz.getWidth()
      canvas.height = matriz.getHeight()
      const pixeles = contexto.createImageData(canvas.width, canvas.height)
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const color = matriz.get(x, y) ? 0 : 255
          const indice = (y * canvas.width + x) * 4
          pixeles.data.set([color, color, color, 255], indice)
        }
      }
      contexto.putImageData(pixeles, 0, 0)
    })
    return () => { vigente = false }
  }, [empleado.id])

  return (
    <div className="fl-checkin-backdrop" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) onCerrar() }}>
      <section className="fl-checkin-credential-dialog" role="dialog" aria-modal="true" aria-labelledby="credencial-titulo">
        <header><span>FAST LOOK</span><button type="button" onClick={onCerrar} aria-label="Cerrar credencial"><X /></button></header>
        <div className="fl-checkin-credential">
          <p>CHECK IN</p><h2 id="credencial-titulo">{empleado.nombre}</h2><strong>{empleado.rol}</strong>
          <canvas ref={canvasRef} aria-label={`Código QR de ${empleado.nombre}`} />
          <small>ID · {empleado.id.slice(0, 8).toUpperCase()}</small>
        </div>
      </section>
    </div>
  )
}
