'use client'

import { useEffect } from 'react'

export default function ErrorAplicacion({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error('Error recuperable de FAST LOOK', error) }, [error])
  return <main className="fl-checkin-page" role="alert">
    <section className="fl-checkin-dialog">
      <h1>No se pudo mostrar este panel</h1>
      <p>Puedes volver a cargar el panel sin reiniciar toda la aplicación. Si estabas registrando asistencia, comprueba su estado antes de intentarlo otra vez.</p>
      <button type="button" className="is-primary" onClick={() => unstable_retry()}>Recuperar panel</button>
    </section>
  </main>
}
