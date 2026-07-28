import type { CSSProperties } from 'react'

interface AsistenteIAProps {
  styles: {
    card: CSSProperties
  }
}

export default function AsistenteIA({ styles }: AsistenteIAProps) {
  return (
    <div style={styles.card}>
      <h2>Asistente IA</h2>
      <p>Aquí irá la sección para preguntar compatibilidades, medidas, precios y dudas técnicas.</p>
    </div>
  )
}
