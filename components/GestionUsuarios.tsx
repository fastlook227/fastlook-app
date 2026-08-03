'use client'

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import type { RolUsuario } from '@/types'
import type { UsuarioAdministrado } from '@/types/usuarios'

const formatoFecha = (fecha: string | null) => fecha
  ? new Date(fecha).toLocaleString('es-MX')
  : 'Sin registro'

export default function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioAdministrado[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [rol, setRol] = useState<RolUsuario>('Vendedor')
  const [activo, setActivo] = useState(true)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [rolEditado, setRolEditado] = useState<RolUsuario>('Vendedor')

  const solicitar = async (url: string, opciones: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Debes iniciar sesión nuevamente.')
    const respuesta = await fetch(url, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opciones.headers },
    })
    const contenido = await respuesta.json()
    if (!respuesta.ok) throw new Error(contenido?.mensaje || 'No fue posible completar la operación.')
    return contenido
  }

  const cargarUsuarios = async () => {
    setCargando(true)
    setError('')
    try {
      const datos = await solicitar('/api/usuarios')
      setUsuarios(datos.usuarios || [])
    } catch (errorCarga) {
      setError(errorCarga instanceof Error ? errorCarga.message : 'No fue posible cargar los usuarios.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { void cargarUsuarios() }, [])

  const limpiarFormulario = () => {
    setNombre('')
    setCorreo('')
    setPassword('')
    setConfirmarPassword('')
    setRol('Vendedor')
    setActivo(true)
  }

  const crearUsuario = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setError('')
    setMensaje('')
    if (!nombre.trim()) return setError('El nombre es obligatorio.')
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) return setError('Ingresa un correo válido.')
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== confirmarPassword) return setError('Las contraseñas no coinciden.')
    setProcesando(true)
    try {
      const datos = await solicitar('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim(), correo: correo.trim(), password, confirmarPassword, rol, activo }),
      })
      setMensaje(datos.mensaje)
      limpiarFormulario()
      await cargarUsuarios()
    } catch (errorCreacion) {
      setError(errorCreacion instanceof Error ? errorCreacion.message : 'No fue posible crear el usuario.')
    } finally {
      setProcesando(false)
    }
  }

  const actualizar = async (id: string, cambios: { nombre?: string; rol?: RolUsuario; activo?: boolean }) => {
    setProcesando(true)
    setError('')
    setMensaje('')
    try {
      const datos = await solicitar(`/api/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) })
      setMensaje(datos.mensaje)
      setEditandoId(null)
      await cargarUsuarios()
    } catch (errorActualizacion) {
      setError(errorActualizacion instanceof Error ? errorActualizacion.message : 'No fue posible actualizar el usuario.')
    } finally {
      setProcesando(false)
    }
  }

  const restablecer = async (usuario: UsuarioAdministrado) => {
    setProcesando(true)
    setError('')
    setMensaje('')
    try {
      const datos = await solicitar(`/api/usuarios/${usuario.id}/restablecer`, { method: 'POST' })
      setMensaje(datos.mensaje)
    } catch (errorRestablecer) {
      setError(errorRestablecer instanceof Error ? errorRestablecer.message : 'No fue posible enviar el restablecimiento.')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <section>
      <h2>Usuarios</h2>
      {error && <div style={estilos.error}>{error}</div>}
      {mensaje && <div style={estilos.exito}>{mensaje}</div>}

      <form style={estilos.formulario} onSubmit={crearUsuario}>
        <h3>Crear usuario</h3>
        <input style={estilos.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" disabled={procesando} />
        <input style={estilos.input} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Correo" disabled={procesando} />
        <input style={estilos.input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña temporal" disabled={procesando} />
        <input style={estilos.input} type="password" autoComplete="new-password" value={confirmarPassword} onChange={(e) => setConfirmarPassword(e.target.value)} placeholder="Confirmar contraseña" disabled={procesando} />
        <select style={estilos.input} value={rol} onChange={(e) => setRol(e.target.value as RolUsuario)} disabled={procesando}>
          <option value="Vendedor">Vendedor</option>
          <option value="Admin">Admin</option>
        </select>
        <label style={estilos.checkbox}><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Usuario activo</label>
        <p style={rol === 'Admin' ? estilos.advertencia : estilos.resumen}>Crearás un usuario con rol <b>{rol}</b>.</p>
        <div style={estilos.botones}>
          <button style={estilos.botonRojo} type="submit" disabled={procesando}>{procesando ? 'Procesando...' : 'Crear usuario'}</button>
          <button style={estilos.botonNegro} type="button" onClick={limpiarFormulario} disabled={procesando}>Cancelar</button>
        </div>
      </form>

      <h3>Usuarios registrados</h3>
      {cargando && <p>Cargando usuarios...</p>}
      <div style={estilos.lista}>
        {usuarios.map((usuario) => (
          <article key={usuario.id} style={estilos.tarjeta}>
            {editandoId === usuario.id ? (
              <>
                <input style={estilos.input} value={nombreEditado} onChange={(e) => setNombreEditado(e.target.value)} />
                <select style={estilos.input} value={rolEditado} onChange={(e) => setRolEditado(e.target.value as RolUsuario)}>
                  <option value="Vendedor">Vendedor</option><option value="Admin">Admin</option>
                </select>
                {rolEditado === 'Admin' && <p style={estilos.advertencia}>Asignarás permisos administrativos a este usuario.</p>}
                <div style={estilos.botones}>
                  <button style={estilos.botonRojo} disabled={procesando} onClick={() => void actualizar(usuario.id, { nombre: nombreEditado, rol: rolEditado })}>Guardar</button>
                  <button style={estilos.botonNegro} disabled={procesando} onClick={() => setEditandoId(null)}>Cancelar</button>
                </div>
              </>
            ) : (
              <>
                <h4>{usuario.nombre || 'Sin nombre'}</h4>
                <p><b>Correo:</b> {usuario.correo}</p>
                <p><b>Rol:</b> {usuario.rol}</p>
                <p><b>Estado:</b> {usuario.activo ? 'Activo' : 'Inactivo'}</p>
                <p><b>Creado:</b> {formatoFecha(usuario.creadoEn)}</p>
                <p><b>Última sesión:</b> {formatoFecha(usuario.ultimaSesion)}</p>
                <div style={estilos.botones}>
                  <button style={estilos.botonRojo} disabled={procesando} onClick={() => { setEditandoId(usuario.id); setNombreEditado(usuario.nombre); setRolEditado(usuario.rol) }}>Editar</button>
                  <button style={estilos.botonNegro} disabled={procesando} onClick={() => void actualizar(usuario.id, { activo: !usuario.activo })}>{usuario.activo ? 'Desactivar' : 'Activar'}</button>
                  <button style={estilos.botonBlanco} disabled={procesando} onClick={() => void restablecer(usuario)}>Enviar restablecimiento de contraseña</button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

const estilos: Record<string, CSSProperties> = {
  formulario: { display: 'grid', gap: 10, padding: 16, marginBottom: 24, border: '2px solid #c40000', borderRadius: 10, backgroundColor: '#fff' },
  input: { width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #999', borderRadius: 6, fontSize: 16 },
  checkbox: { display: 'flex', gap: 9, alignItems: 'center', minHeight: 40 },
  resumen: { padding: 10, backgroundColor: '#eee', borderRadius: 6 },
  advertencia: { padding: 10, color: '#900', backgroundColor: '#ffe5e5', border: '1px solid #c40000', borderRadius: 6, fontWeight: 'bold' },
  botones: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  botonRojo: { minHeight: 44, padding: '10px 14px', border: 0, borderRadius: 6, backgroundColor: '#c40000', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  botonNegro: { minHeight: 44, padding: '10px 14px', border: 0, borderRadius: 6, backgroundColor: '#111', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  botonBlanco: { minHeight: 44, padding: '10px 14px', border: '1px solid #111', borderRadius: 6, backgroundColor: '#fff', color: '#111', fontWeight: 'bold', cursor: 'pointer' },
  lista: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 },
  tarjeta: { padding: 15, border: '1px solid #aaa', borderLeft: '5px solid #c40000', borderRadius: 8, backgroundColor: '#fff' },
  error: { padding: 12, marginBottom: 12, color: '#900', backgroundColor: '#ffe5e5', borderRadius: 7 },
  exito: { padding: 12, marginBottom: 12, color: '#064', backgroundColor: '#e2fff2', borderRadius: 7 },
}
