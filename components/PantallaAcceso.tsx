import type { CSSProperties } from 'react'

interface PantallaAccesoProps {
  mostrarPasswordAdmin: boolean
  passwordAdmin: string
  onEntrarComoVendedor: () => void
  onMostrarPasswordAdmin: () => void
  onCambiarPasswordAdmin: (password: string) => void
  onIntentarEntrarAdmin: () => void
  styles: {
    loginPage: CSSProperties
    loginBox: CSSProperties
    logoLogin: CSSProperties
    loginSubtitle: CSSProperties
    bigButton: CSSProperties
    blackButton: CSSProperties
    input: CSSProperties
  }
}

export default function PantallaAcceso({
  mostrarPasswordAdmin,
  passwordAdmin,
  onEntrarComoVendedor,
  onMostrarPasswordAdmin,
  onCambiarPasswordAdmin,
  onIntentarEntrarAdmin,
  styles,
}: PantallaAccesoProps) {
  return (
    <div style={styles.loginPage}>
      <div style={styles.loginBox}>
        <h1 style={styles.logoLogin}>FAST LOOK</h1>
        <p style={styles.loginSubtitle}>Selecciona cómo deseas entrar</p>

        <button style={styles.bigButton} onClick={onEntrarComoVendedor}>
          Entrar como vendedor
        </button>

        <button
          style={styles.blackButton}
          onClick={onMostrarPasswordAdmin}
        >
          Entrar como administrador
        </button>

        {mostrarPasswordAdmin && (
          <>
            <input
              style={styles.input}
              type="password"
              placeholder="Contraseña de administrador"
              value={passwordAdmin}
              onChange={(e) => onCambiarPasswordAdmin(e.target.value)}
            />

            <button
              style={styles.bigButton}
              onClick={onIntentarEntrarAdmin}
            >
              Confirmar acceso admin
            </button>
          </>
        )}
      </div>
    </div>
  )
}
