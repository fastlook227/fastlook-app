'use client'

import type { CSSProperties } from 'react'

interface PantallaCargaProps {
  styles: {
    loadingPage: CSSProperties
    loadingLogo: CSSProperties
    loadingTitle: CSSProperties
    loadingText: CSSProperties
  }
}

export default function PantallaCarga({ styles }: PantallaCargaProps) {
  return (
    <div style={styles.loadingPage}>
      <img
        src="https://i.postimg.cc/T1KLqYXb/Chat-GPT-Image-4-dic-2025-11-34-20-p-m.png"
        alt="Fast Look"
        style={styles.loadingLogo}
      />

      <h2 style={styles.loadingTitle}>FAST LOOK</h2>
      <p style={styles.loadingText}>Cargando sistema...</p>

      <style>{`
        @keyframes girarLogo {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
