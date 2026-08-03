import type { CSSProperties, FormEvent } from 'react'

interface PantallaAccesoProps {
  correo: string
  password: string
  error: string
  cargando: boolean
  onCambiarCorreo: (correo: string) => void
  onCambiarPassword: (password: string) => void
  onIniciarSesion: () => void | Promise<void>
  styles: {
    loginPage: CSSProperties
    loginBox: CSSProperties
    logoLogin: CSSProperties
    loginSubtitle: CSSProperties
    bigButton: CSSProperties
    input: CSSProperties
  }
}

export default function PantallaAcceso({
  correo,
  password,
  error,
  cargando,
  onCambiarCorreo,
  onCambiarPassword,
  onIniciarSesion,
  styles,
}: PantallaAccesoProps) {
  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    void onIniciarSesion()
  }

  return (
    <div style={styles.loginPage}>
      <form style={styles.loginBox} onSubmit={enviar}>
        <h1 style={styles.logoLogin}>FAST LOOK</h1>
        <p style={styles.loginSubtitle}>Inicia sesión para continuar</p>

        <input
          style={styles.input}
          type="email"
          autoComplete="email"
          placeholder="Correo"
          value={correo}
          onChange={(evento) => onCambiarCorreo(evento.target.value)}
          disabled={cargando}
          required
        />
        <input
          style={styles.input}
          type="password"
          autoComplete="current-password"
          placeholder="Contraseña"
          value={password}
          onChange={(evento) => onCambiarPassword(evento.target.value)}
          disabled={cargando}
          required
        />

        {error && (
          <p role="alert" style={{ color: '#a00000', fontWeight: 'bold' }}>{error}</p>
        )}

        <button style={styles.bigButton} type="submit" disabled={cargando}>
          {cargando ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  )
}
