'use client'

import { useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type {
  AccionAsistente,
  AccionPendienteAsistente,
  DatoPendienteAsistente,
  MensajeAsistente,
  OpcionAsistente,
  RespuestaAsistente,
  ResultadoBusquedaProducto,
  FiltroProductosMasivo,
  ProductoSeleccionMasiva,
  EtapaOperacionMasiva,
  DatosPropuestaEjecucion,
  EstadoPropuestaAsistente,
  ResultadoEjecucionAsistente,
} from '@/types/asistente'
import type { RolUsuario } from '@/types'
import { supabase } from '@/lib/supabase'

const crearId = () => `${Date.now()}-${Math.random()}`
const ACCIONES_ADMIN: AccionAsistente[] = [
  'CREAR_PRODUCTO',
  'EDITAR_PRODUCTO',
  'CAMBIAR_PRECIO',
  'CAMBIAR_UBICACION',
  'CAMBIAR_UBICACION_MASIVA',
  'SUMAR_STOCK',
  'RESTAR_STOCK',
  'AJUSTAR_STOCK',
  'ARCHIVAR_PRODUCTO',
]

interface AsistenteInventarioProps {
  usuarioRol: RolUsuario
  onInventarioActualizado?: () => void | Promise<void>
}

export default function AsistenteInventario({ usuarioRol, onInventarioActualizado }: AsistenteInventarioProps) {
  const [mensaje, setMensaje] = useState('')
  const [historial, setHistorial] = useState<MensajeAsistente[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [productoActivo, setProductoActivo] = useState<{
    id: string
    texto: string
    ubicacion?: string
    stock?: number
  } | null>(null)
  const [ultimaAccion, setUltimaAccion] = useState<AccionAsistente | null>(null)
  const [datosPendientes, setDatosPendientes] = useState<DatoPendienteAsistente[]>([])
  const [turnoConversacion, setTurnoConversacion] = useState(0)
  const [coincidenciasPendientes, setCoincidenciasPendientes] = useState<
    ResultadoBusquedaProducto[]
  >([])
  const [accionPendiente, setAccionPendiente] = useState<AccionPendienteAsistente | null>(null)
  const [accionOriginalPendiente, setAccionOriginalPendiente] = useState<AccionAsistente | null>(null)
  const [consultaOriginalPendiente, setConsultaOriginalPendiente] = useState('')
  const [productoBuscadoOriginal, setProductoBuscadoOriginal] = useState('')
  const [cantidadPendiente, setCantidadPendiente] = useState<number | null>(null)
  const [precioPendiente, setPrecioPendiente] = useState<number | null>(null)
  const [opcionesPendientes, setOpcionesPendientes] = useState<OpcionAsistente[]>([])
  const [confirmacionPendiente, setConfirmacionPendiente] = useState<AccionPendienteAsistente | null>(null)
  const [accionConfirmada, setAccionConfirmada] = useState<AccionPendienteAsistente | null>(null)
  const [mostrarConfirmacionReinicio, setMostrarConfirmacionReinicio] = useState(false)
  const [borradorProductoNuevo, setBorradorProductoNuevo] = useState('')
  const solicitudActivaRef = useRef<AbortController | null>(null)
  const [buscandoOtroNombre, setBuscandoOtroNombre] = useState(false)
  const [accionMasivaPendiente, setAccionMasivaPendiente] = useState<'CAMBIAR_UBICACION_MASIVA' | null>(null)
  const [filtrosMasivos, setFiltrosMasivos] = useState<FiltroProductosMasivo | null>(null)
  const [productosMasivos, setProductosMasivos] = useState<ProductoSeleccionMasiva[]>([])
  const [nuevaUbicacionMasiva, setNuevaUbicacionMasiva] = useState<string | null>(null)
  const [consultaOriginalMasiva, setConsultaOriginalMasiva] = useState('')
  const [etapaOperacionMasiva, setEtapaOperacionMasiva] = useState<EtapaOperacionMasiva>('inactiva')
  const [confirmacionMasivaPendiente, setConfirmacionMasivaPendiente] = useState(false)
  const [propuestaId, setPropuestaId] = useState<string | null>(null)
  const [estadoPropuesta, setEstadoPropuesta] = useState<EstadoPropuestaAsistente | null>(null)
  const [propuestaMasivaId, setPropuestaMasivaId] = useState<string | null>(null)
  const [estadoPropuestaMasiva, setEstadoPropuestaMasiva] = useState<EstadoPropuestaAsistente | null>(null)

  const llamarEjecucion = async (cuerpo: Record<string, unknown>) => {
    const { data: sesionData } = await supabase.auth.getSession()
    const token = sesionData.session?.access_token
    if (!token) throw new Error('Debes iniciar sesión.')
    const respuesta = await fetch('/api/asistente/ejecutar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    })
    const datos = await respuesta.json()
    if (!respuesta.ok) {
      throw new Error(typeof datos?.mensaje === 'string' ? datos.mensaje : 'No fue posible ejecutar la operación.')
    }
    return datos
  }

  const prepararPropuesta = async (
    datos: DatosPropuestaEjecucion,
    mensajeOriginal: string,
    idExistente?: string | null
  ) => {
    const id = idExistente || crypto.randomUUID()
    await llamarEjecucion({
      operacion: 'PREPARAR', propuestaId: id, mensajeOriginal, datos,
    })
    return id
  }

  const aplicarContexto = (
    resultado: RespuestaAsistente,
    consultaOriginal: string,
    esSeleccion = false
  ) => {
    if (resultado.limpiarContexto) {
      setProductoActivo(null)
      setUltimaAccion(null)
      setDatosPendientes([])
      setCoincidenciasPendientes([])
      setAccionPendiente(null)
      setAccionOriginalPendiente(null)
      setConsultaOriginalPendiente('')
      setProductoBuscadoOriginal('')
      setCantidadPendiente(null)
      setPrecioPendiente(null)
      setOpcionesPendientes([])
      setConfirmacionPendiente(null)
      setAccionConfirmada(null)
      setBorradorProductoNuevo('')
      setBuscandoOtroNombre(false)
      setTurnoConversacion((turno) => turno + 1)
      return
    }

    if (resultado.operacionMasiva) {
      setAccionMasivaPendiente('CAMBIAR_UBICACION_MASIVA')
      setFiltrosMasivos(resultado.operacionMasiva.filtros)
      setProductosMasivos(resultado.operacionMasiva.productos)
      setNuevaUbicacionMasiva(resultado.operacionMasiva.nuevaUbicacion)
      setConsultaOriginalMasiva((actual) => actual || consultaOriginal)
      setEtapaOperacionMasiva(resultado.operacionMasiva.etapa)
      setConfirmacionMasivaPendiente(false)
    }

    if (resultado.productoSeleccionado) {
      setProductoActivo(resultado.productoSeleccionado)
      setOpcionesPendientes([])
      setBuscandoOtroNombre(false)
    }

    setUltimaAccion(resultado.interpretacion.accion)
    setDatosPendientes(resultado.datosPendientes)
    if (resultado.coincidenciasPendientes.length > 0) {
      setCoincidenciasPendientes(resultado.coincidenciasPendientes)
    }
    setAccionPendiente(resultado.accionPendienteDetalle)
    setConfirmacionPendiente(
      resultado.requiereConfirmacion ? resultado.accionPendienteDetalle : null
    )

    const opcionesProducto = resultado.opciones.filter(
      (opcion) => opcion.tipo === 'PRODUCTO'
    )
    const conservaIntencion = resultado.opciones.some((opcion) =>
      ['PRODUCTO', 'BUSCAR_OTRO_NOMBRE', 'PREPARAR_PRODUCTO_NUEVO'].includes(opcion.tipo)
    )
    if (conservaIntencion && !esSeleccion) {
      setAccionOriginalPendiente(resultado.interpretacion.accion)
      setConsultaOriginalPendiente(consultaOriginal)
      setProductoBuscadoOriginal(resultado.interpretacion.productoBuscado)
      setCantidadPendiente(resultado.interpretacion.cantidad)
      setPrecioPendiente(resultado.interpretacion.precio)
      setOpcionesPendientes(opcionesProducto)
    }
    setTurnoConversacion((turno) => turno + 1)
  }

  const solicitarRespuesta = async (
    texto: string,
    seleccionProductoId: string | null = null,
    mostrarMensajeUsuario = true
  ) => {
    if (!texto.trim() || enviando) return

    const controlador = new AbortController()
    solicitudActivaRef.current?.abort()
    solicitudActivaRef.current = controlador

    if (mostrarMensajeUsuario) {
      setHistorial((actual) => [
        ...actual,
        { id: crearId(), autor: 'usuario', texto },
      ])
    }
    setError('')
    setEnviando(true)

    try {
      const { data: sesionData } = await supabase.auth.getSession()
      const token = sesionData.session?.access_token
      if (!token) throw new Error('Debes iniciar sesión.')
      const respuesta = await fetch('/api/asistente/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mensaje: texto,
          seleccionProductoId,
          contexto: {
            productoSeleccionadoId: productoActivo?.id || null,
            ultimaAccion,
            datosPendientes,
            turnoConversacion,
            coincidenciasPendientesIds: coincidenciasPendientes.map(
              ({ producto }) => producto.id
            ),
            accionPendiente,
            accionOriginalPendiente,
            consultaOriginalPendiente,
            productoBuscadoOriginal,
            cantidadPendiente,
            precioPendiente,
            opcionesPendientesIds: opcionesPendientes.map((opcion) => opcion.id),
            buscandoOtroNombre,
            accionMasivaPendiente,
            filtrosMasivos,
            nuevaUbicacionMasiva,
            consultaOriginalMasiva,
            etapaOperacionMasiva,
          },
        }),
        signal: controlador.signal,
      })
      const datos: unknown = await respuesta.json()

      if (!respuesta.ok) {
        const mensajeError =
          typeof datos === 'object' &&
          datos !== null &&
          'mensaje' in datos &&
          typeof datos.mensaje === 'string'
            ? datos.mensaje
            : 'No fue posible procesar la conversación.'
        throw new Error(mensajeError)
      }

      const resultado = datos as RespuestaAsistente
      aplicarContexto(resultado, texto, Boolean(seleccionProductoId))
      const detalle = resultado.accionPendienteDetalle
      if (
        resultado.requiereConfirmacion && detalle?.productoId &&
        ['CAMBIAR_UBICACION', 'SUMAR_STOCK', 'RESTAR_STOCK'].includes(detalle.accion)
      ) {
        const datosPropuesta: DatosPropuestaEjecucion = detalle.accion === 'CAMBIAR_UBICACION'
          ? { accion: 'CAMBIAR_UBICACION', productoId: detalle.productoId, nuevaUbicacion: detalle.nuevaUbicacion || '' }
          : { accion: detalle.accion as 'SUMAR_STOCK' | 'RESTAR_STOCK', productoId: detalle.productoId, cantidad: Number(detalle.cantidad) }
        try {
          setEstadoPropuesta('EJECUTANDO')
          const id = await prepararPropuesta(
            datosPropuesta,
            seleccionProductoId ? consultaOriginalPendiente || texto : texto
          )
          setPropuestaId(id)
          setEstadoPropuesta('PENDIENTE')
        } catch (errorPropuesta) {
          setPropuestaId(null)
          setEstadoPropuesta('ERROR')
          setError(errorPropuesta instanceof Error ? errorPropuesta.message : 'No fue posible registrar la propuesta.')
        }
      }
      setHistorial((actual) => [
        ...actual,
        {
          id: crearId(),
          autor: 'asistente',
          texto: resultado.mensajePrincipal,
          respuesta: resultado,
        },
      ])
    } catch (errorSolicitud) {
      if (errorSolicitud instanceof DOMException && errorSolicitud.name === 'AbortError') return
      setError(
        errorSolicitud instanceof Error
          ? errorSolicitud.message
          : 'No fue posible procesar la conversación.'
      )
    } finally {
      if (solicitudActivaRef.current === controlador) {
        solicitudActivaRef.current = null
        setEnviando(false)
      }
    }
  }

  const enviarMensaje = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const texto = mensaje.trim()
    if (!texto) return
    setMensaje('')
    if (accionMasivaPendiente && etapaOperacionMasiva === 'seleccion') {
      const frase = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const ordinales: Record<string, number> = { primero: 0, segundo: 1, tercero: 2, cuarto: 3, quinto: 4 }
      const ordinal = Object.entries(ordinales).find(([palabra]) => frase.includes(palabra))
      if (/\b(quita|desmarca)\b/.test(frase) && ordinal) {
        setProductosMasivos((actual) => actual.map((producto, indice) =>
          indice === ordinal[1] ? { ...producto, seleccionado: false } : producto
        ))
        agregarRespuestaLocal(`Desmarqué el ${ordinal[0]} producto.`)
        return
      }
      if (/desmarca\s+los\s+azules/.test(frase)) {
        setProductosMasivos((actual) => actual.map((producto) =>
          /azul/i.test(producto.nombre) ? { ...producto, seleccionado: false } : producto
        ))
        agregarRespuestaLocal('Desmarqué los productos azules.')
        return
      }
    }
    await solicitarRespuesta(texto)
  }

  const seleccionarOpcion = async (id: string, texto: string) => {
    setHistorial((actual) => [
      ...actual,
      { id: crearId(), autor: 'usuario', texto: `Seleccioné: ${texto}` },
    ])
    await solicitarRespuesta(texto, id, false)
  }

  const agregarRespuestaLocal = (
    texto: string,
    opcionesLocales: OpcionAsistente[] = []
  ) => {
    setHistorial((actual) => [
      ...actual,
      { id: crearId(), autor: 'asistente', texto, opcionesLocales },
    ])
  }

  const limpiarContextoPendiente = () => {
    setUltimaAccion(null)
    setConfirmacionPendiente(null)
    setAccionPendiente(null)
    setDatosPendientes([])
    setCoincidenciasPendientes([])
    setOpcionesPendientes([])
    setAccionOriginalPendiente(null)
    setConsultaOriginalPendiente('')
    setProductoBuscadoOriginal('')
    setCantidadPendiente(null)
    setPrecioPendiente(null)
    setBuscandoOtroNombre(false)
  }

  const aplicarResultadoEjecucion = async (resultado: ResultadoEjecucionAsistente) => {
    resultado.detalles.forEach((detalle) => {
      setProductoActivo((actual) => actual?.id === detalle.productoId
        ? {
            ...actual,
            ...(detalle.campo === 'ubicacion' ? { ubicacion: String(detalle.valorNuevo ?? '') } : {}),
            ...(detalle.campo === 'stock' ? { stock: Number(detalle.valorNuevo) } : {}),
          }
        : actual)
      setCoincidenciasPendientes((actual) => actual.map((coincidencia) =>
        coincidencia.producto.id === detalle.productoId
          ? {
              ...coincidencia,
              producto: {
                ...coincidencia.producto,
                ...(detalle.campo === 'ubicacion' ? { ubicacion: String(detalle.valorNuevo ?? '') } : {}),
                ...(detalle.campo === 'stock' ? { existencia: Number(detalle.valorNuevo) } : {}),
              },
            }
          : coincidencia
      ))
      setProductosMasivos((actual) => actual.map((producto) =>
        producto.id === detalle.productoId && detalle.campo === 'ubicacion'
          ? { ...producto, ubicacionActual: String(detalle.valorNuevo ?? '') }
          : producto
      ))
    })
    await onInventarioActualizado?.()
  }

  const confirmarPropuesta = async (detalle: AccionPendienteAsistente | null) => {
    if (usuarioRol !== 'Admin' || !detalle || !propuestaId || estadoPropuesta === 'EJECUTANDO' || estadoPropuesta === 'EJECUTADA') return
    setEstadoPropuesta('EJECUTANDO')
    setError('')
    try {
      const resultado = await llamarEjecucion({ operacion: 'EJECUTAR', propuestaId }) as ResultadoEjecucionAsistente
      setEstadoPropuesta('EJECUTADA')
      setAccionConfirmada(detalle)
      await aplicarResultadoEjecucion(resultado)
      limpiarContextoPendiente()
      agregarRespuestaLocal(resultado.mensaje)
    } catch (errorEjecucion) {
      setEstadoPropuesta('ERROR')
      setError(errorEjecucion instanceof Error ? errorEjecucion.message : 'No fue posible ejecutar la propuesta.')
    }
  }

  const esConfirmacionVigente = (detalle: AccionPendienteAsistente | null) =>
    Boolean(
      detalle &&
      confirmacionPendiente &&
      detalle.accion === confirmacionPendiente.accion &&
      detalle.productoId === confirmacionPendiente.productoId &&
      detalle.cantidad === confirmacionPendiente.cantidad &&
      detalle.precio === confirmacionPendiente.precio
      && detalle.nuevaUbicacion === confirmacionPendiente.nuevaUbicacion
      && Boolean(propuestaId)
      && ['PENDIENTE', 'ERROR'].includes(estadoPropuesta || '')
    )

  const cancelarPropuesta = async () => {
    const esCambioUbicacion = confirmacionPendiente?.accion === 'CAMBIAR_UBICACION'
    if (propuestaId && estadoPropuesta !== 'EJECUTADA') {
      try {
        await llamarEjecucion({ operacion: 'CANCELAR', propuestaId })
      } catch (errorCancelacion) {
        setError(errorCancelacion instanceof Error ? errorCancelacion.message : 'No fue posible cancelar la propuesta.')
        return
      }
    }
    limpiarContextoPendiente()
    setAccionConfirmada(null)
    setEstadoPropuesta('CANCELADA')
    agregarRespuestaLocal(
      esCambioUbicacion ? 'Cambio de ubicación cancelado.' : 'Acción cancelada.'
    )
  }

  const buscarConOtroNombre = () => {
    setCoincidenciasPendientes([])
    setOpcionesPendientes([])
    setProductoBuscadoOriginal('')
    setBuscandoOtroNombre(true)
    agregarRespuestaLocal('Escribe otro nombre o código.')
  }

  const finalizarConsulta = () => {
    limpiarContextoPendiente()
    setUltimaAccion(null)
    agregarRespuestaLocal('Consulta finalizada.')
  }

  const ningunoCorresponde = () => {
    setCoincidenciasPendientes([])
    setOpcionesPendientes([])

    const accionConservada = accionOriginalPendiente || ultimaAccion || 'DESCONOCIDA'
    const opciones: OpcionAsistente[] = accionConservada === 'CREAR_PRODUCTO'
      ? [
          { id: 'preparar-producto-nuevo-local', texto: 'Preparar producto nuevo', tipo: 'PREPARAR_PRODUCTO_NUEVO' },
          { id: 'cancelar-consulta-local', texto: 'Cancelar', tipo: 'CANCELAR' },
        ]
      : [
          { id: 'buscar-otro-nombre-local', texto: 'Buscar con otro nombre', tipo: 'BUSCAR_OTRO_NOMBRE' },
          {
            id: 'finalizar-consulta-local',
            texto: ACCIONES_ADMIN.includes(accionConservada) ? 'Cancelar' : 'Finalizar consulta',
            tipo: ACCIONES_ADMIN.includes(accionConservada) ? 'CANCELAR' : 'FINALIZAR_CONSULTA',
          },
        ]

    agregarRespuestaLocal(
      'No encontré un producto registrado que corresponda a esa búsqueda.',
      opciones
    )
  }

  const prepararProductoNuevo = () => {
    if (usuarioRol !== 'Admin') return
    const detalle: AccionPendienteAsistente = {
      accion: 'CREAR_PRODUCTO',
      productoId: null,
      valorPendiente: 'datos_producto',
      cantidad: cantidadPendiente,
      precio: precioPendiente,
      nuevaUbicacion: null,
      valorAnterior: null,
      valorNuevo: null,
    }
    setBorradorProductoNuevo(productoBuscadoOriginal)
    setAccionPendiente(detalle)
    setConfirmacionPendiente(detalle)
    agregarRespuestaLocal(
      'Prepararé un producto nuevo con los datos de esta consulta.',
      [
        { id: 'confirmar-creacion-local', texto: 'Confirmar', tipo: 'CONFIRMAR' },
        { id: 'cancelar-creacion-local', texto: 'Cancelar', tipo: 'CANCELAR' },
      ]
    )
  }

  const seleccionadosMasivos = productosMasivos.filter((producto) => producto.seleccionado)
  const invalidarPropuestaMasiva = () => {
    if (propuestaMasivaId && ['PENDIENTE', 'ERROR'].includes(estadoPropuestaMasiva || '')) {
      void llamarEjecucion({ operacion: 'CANCELAR', propuestaId: propuestaMasivaId })
    }
    setPropuestaMasivaId(null)
    setEstadoPropuestaMasiva(null)
  }
  const actualizarSeleccionMasiva = (id: string, seleccionado: boolean) => {
    invalidarPropuestaMasiva()
    setProductosMasivos((actual) => actual.map((producto) =>
      producto.id === id ? { ...producto, seleccionado } : producto
    ))
  }
  const seleccionarTodosMasivos = (seleccionado: boolean) => {
    invalidarPropuestaMasiva()
    setProductosMasivos((actual) => actual.map((producto) => ({ ...producto, seleccionado })))
  }
  const cancelarOperacionMasiva = async () => {
    if (propuestaMasivaId && estadoPropuestaMasiva !== 'EJECUTADA') {
      try {
        await llamarEjecucion({ operacion: 'CANCELAR', propuestaId: propuestaMasivaId })
      } catch (errorCancelacion) {
        setError(errorCancelacion instanceof Error ? errorCancelacion.message : 'No fue posible cancelar la operación.')
        return
      }
    }
    setAccionMasivaPendiente(null)
    setFiltrosMasivos(null)
    setProductosMasivos([])
    setNuevaUbicacionMasiva(null)
    setConsultaOriginalMasiva('')
    setEtapaOperacionMasiva('inactiva')
    setConfirmacionMasivaPendiente(false)
    setPropuestaMasivaId(null)
    setEstadoPropuestaMasiva('CANCELADA')
    agregarRespuestaLocal('Operación masiva cancelada.')
  }
  const ningunoCorrespondeMasivo = () => {
    setProductosMasivos([])
    setEtapaOperacionMasiva('esperando_filtros')
    agregarRespuestaLocal('Escribe otro nombre, categoría, modelo, color, proveedor o ubicación actual para refinar la búsqueda.')
  }
  const continuarOperacionMasiva = async () => {
    if (seleccionadosMasivos.length === 0) {
      setError('Selecciona al menos un producto para continuar.')
      return
    }
    if (!nuevaUbicacionMasiva) return
    setError('')
    setEstadoPropuestaMasiva('EJECUTANDO')
    try {
      const datos: DatosPropuestaEjecucion = {
        accion: 'CAMBIAR_UBICACION_MASIVA',
        productoIds: seleccionadosMasivos.map((producto) => producto.id),
        nuevaUbicacion: nuevaUbicacionMasiva,
      }
      const id = await prepararPropuesta(datos, consultaOriginalMasiva || 'Operación masiva de ubicación')
      setPropuestaMasivaId(id)
      setEstadoPropuestaMasiva('PENDIENTE')
      setEtapaOperacionMasiva('confirmacion')
      setConfirmacionMasivaPendiente(true)
    } catch (errorPropuesta) {
      setEstadoPropuestaMasiva('ERROR')
      setError(errorPropuesta instanceof Error ? errorPropuesta.message : 'No fue posible registrar la propuesta masiva.')
    }
  }
  const ejecutarOperacionMasivaConfirmada = async () => {
    if (!propuestaMasivaId || estadoPropuestaMasiva === 'EJECUTANDO' || estadoPropuestaMasiva === 'EJECUTADA') return
    setEstadoPropuestaMasiva('EJECUTANDO')
    setError('')
    try {
      const resultado = await llamarEjecucion({ operacion: 'EJECUTAR', propuestaId: propuestaMasivaId }) as ResultadoEjecucionAsistente
      setEstadoPropuestaMasiva('EJECUTADA')
      setEtapaOperacionMasiva('confirmada')
      setConfirmacionMasivaPendiente(false)
      await aplicarResultadoEjecucion(resultado)
      agregarRespuestaLocal(resultado.mensaje)
      if (resultado.errores.length) {
        agregarRespuestaLocal(resultado.errores.map((fallo) => `${fallo.nombre || fallo.productoId || 'Producto'}: ${fallo.mensaje}`).join('\n'))
      }
    } catch (errorEjecucion) {
      setEstadoPropuestaMasiva('ERROR')
      setError(errorEjecucion instanceof Error ? errorEjecucion.message : 'No fue posible ejecutar la operación masiva.')
    }
  }
  const confirmarOperacionMasiva = async () => {
    if (!confirmacionMasivaPendiente || usuarioRol !== 'Admin') return
    if (seleccionadosMasivos.length > 20) {
      setEtapaOperacionMasiva('confirmacion_reforzada')
      return
    }
    await ejecutarOperacionMasivaConfirmada()
  }
  const confirmarOperacionMasivaDefinitivamente = async () => {
    if (!confirmacionMasivaPendiente || usuarioRol !== 'Admin') return
    await ejecutarOperacionMasivaConfirmada()
  }

  const reiniciarConversacion = () => {
    solicitudActivaRef.current?.abort()
    solicitudActivaRef.current = null
    setHistorial([])
    setMensaje('')
    setError('')
    setEnviando(false)
    setProductoActivo(null)
    setUltimaAccion(null)
    setAccionPendiente(null)
    setDatosPendientes([])
    setTurnoConversacion(0)
    setCoincidenciasPendientes([])
    setAccionOriginalPendiente(null)
    setConsultaOriginalPendiente('')
    setProductoBuscadoOriginal('')
    setCantidadPendiente(null)
    setPrecioPendiente(null)
    setOpcionesPendientes([])
    setConfirmacionPendiente(null)
    setAccionConfirmada(null)
    setBorradorProductoNuevo('')
    setBuscandoOtroNombre(false)
    setAccionMasivaPendiente(null)
    setFiltrosMasivos(null)
    setProductosMasivos([])
    setNuevaUbicacionMasiva(null)
    setConsultaOriginalMasiva('')
    setEtapaOperacionMasiva('inactiva')
    setConfirmacionMasivaPendiente(false)
    setPropuestaId(null)
    setEstadoPropuesta(null)
    setPropuestaMasivaId(null)
    setEstadoPropuestaMasiva(null)
    setMostrarConfirmacionReinicio(false)
  }

  const renderizarOpcion = (
    opcion: OpcionAsistente,
    respuesta?: RespuestaAsistente
  ) => {
    if (opcion.tipo === 'PRODUCTO') {
      const opcionVigente = opcionesPendientes.some((actual) => actual.id === opcion.id)
      return (
        <div key={opcion.id} style={estilos.opcionProducto}>
          <b>{opcion.texto}</b>
          {opcion.subtitulo && <small>{opcion.subtitulo}</small>}
          <button
            type="button"
            style={estilos.botonSeleccionar}
            disabled={enviando || !opcionVigente}
            onClick={() => seleccionarOpcion(opcion.id, opcion.texto)}
          >
            Seleccionar
          </button>
        </div>
      )
    }

    if (opcion.tipo === 'NINGUNO_CORRESPONDE') {
      return (
        <button
          key={opcion.id}
          type="button"
          style={estilos.botonCancelar}
          disabled={opcionesPendientes.length === 0}
          onClick={ningunoCorresponde}
        >
          Ninguno corresponde
        </button>
      )
    }

    if (opcion.tipo === 'BUSCAR_OTRO_NOMBRE') {
      return (
        <button key={opcion.id} type="button" style={estilos.botonSeleccionar} onClick={buscarConOtroNombre}>
          Buscar con otro nombre
        </button>
      )
    }

    if (opcion.tipo === 'FINALIZAR_CONSULTA') {
      return (
        <button key={opcion.id} type="button" style={estilos.botonCancelar} onClick={finalizarConsulta}>
          Finalizar consulta
        </button>
      )
    }

    if (opcion.tipo === 'PREPARAR_PRODUCTO_NUEVO' || opcion.tipo === 'CREAR_PRODUCTO') {
      return (
        <button
          key={opcion.id}
          type="button"
          style={estilos.botonSeleccionar}
          disabled={usuarioRol !== 'Admin'}
          onClick={prepararProductoNuevo}
        >
          Preparar producto nuevo
        </button>
      )
    }

    if (opcion.tipo === 'CONFIRMAR') {
      const detalle = respuesta?.accionPendienteDetalle || confirmacionPendiente
      const confirmacionVigente = esConfirmacionVigente(detalle)
      return (
        <button
          key={opcion.id}
          type="button"
          style={estilos.botonConfirmar}
          disabled={!confirmacionVigente || usuarioRol !== 'Admin'}
          onClick={() => confirmarPropuesta(detalle)}
        >
          {estadoPropuesta === 'EJECUTANDO' ? 'Ejecutando operación...' : estadoPropuesta === 'ERROR' ? 'Reintentar' : '✔ Confirmar'}
        </button>
      )
    }

    if (opcion.tipo === 'CANCELAR') {
      return (
        <button key={opcion.id} type="button" style={estilos.botonCancelar} disabled={estadoPropuesta === 'EJECUTANDO'} onClick={cancelarPropuesta}>
          ✖ Cancelar
        </button>
      )
    }

    return null
  }

  return (
    <section style={estilos.contenedor}>
      <div style={estilos.encabezado}>
        <h2>Asistente</h2>
        <button
          type="button"
          style={estilos.botonReiniciar}
          onClick={() => setMostrarConfirmacionReinicio(true)}
        >
          🗑 Reiniciar conversación
        </button>
      </div>
      <p style={estilos.descripcion}>
        Consulta el inventario o prepara una propuesta. Ninguna modificación se ejecutará en esta etapa.
      </p>

      <div style={estilos.historial} aria-live="polite">
        {historial.length === 0 && <p style={estilos.vacio}>Aún no hay mensajes.</p>}

        {historial.map((item) => (
          <div
            key={item.id}
            style={item.autor === 'usuario' ? estilos.mensajeUsuario : estilos.mensajeAsistente}
          >
            <strong>{item.autor === 'usuario' ? 'Tú' : 'Asistente'}</strong>
            <p style={estilos.mensajePrincipal}>{item.texto}</p>

            {item.respuesta?.preguntaSeguimiento && (
              <p style={estilos.pregunta}>{item.respuesta.preguntaSeguimiento}</p>
            )}

            {item.respuesta && item.respuesta.opciones.length > 0 && (
              <div style={estilos.opciones}>
                {item.respuesta.opciones.map((opcion) =>
                  renderizarOpcion(opcion, item.respuesta)
                )}
              </div>
            )}

            {item.opcionesLocales && item.opcionesLocales.length > 0 && (
              <div style={estilos.opciones}>
                {item.opcionesLocales.map((opcion) => renderizarOpcion(opcion))}
              </div>
            )}

            {item.respuesta && item.respuesta.informacionExtra.length > 0 && (
              <details style={estilos.detallesSecundarios}>
                <summary>Información adicional</summary>
                <dl>
                  {item.respuesta.informacionExtra.map((dato, indice) => (
                    <div key={`${dato.etiqueta}-${indice}`} style={estilos.filaDato}>
                      <dt><b>{dato.etiqueta}:</b></dt>
                      <dd style={estilos.valorDato}>{dato.valor}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}

            {item.respuesta && (
              <details style={estilos.detallesInterpretacion}>
                <summary>Detalles de interpretación</summary>
                <p>Acción: {item.respuesta.interpretacion.accion}</p>
                <p>Producto interpretado: {item.respuesta.interpretacion.productoBuscado || '—'}</p>
                <p>Confianza: {Math.round(item.respuesta.interpretacion.confianza * 100)}%</p>
                <p>Requiere confirmación: {item.respuesta.requiereConfirmacion ? 'Sí' : 'No'}</p>
              </details>
            )}
          </div>
        ))}

        {enviando && <p style={estilos.vacio}>Procesando...</p>}
      </div>

      {accionMasivaPendiente && (
        <section style={estilos.tarjetaMasiva} aria-label="Operación masiva de ubicación">
          <h3 style={estilos.tituloMasivo}>Operación masiva de ubicación</h3>
          <div style={estilos.resumenMasivo}>
            <span>Productos encontrados: <b>{productosMasivos.length}</b></span>
            <span>Productos seleccionados: <b>{seleccionadosMasivos.length}</b></span>
            <span>Nueva ubicación: <b>{nuevaUbicacionMasiva || 'Pendiente'}</b></span>
          </div>
          {filtrosMasivos && (
            <details style={estilos.filtrosMasivos}>
              <summary>Filtros interpretados</summary>
              {Object.entries(filtrosMasivos).filter(([clave, valor]) => clave !== 'soloNoArchivados' && valor).map(([clave, valor]) => (
                <div key={clave}><b>{clave}:</b> {String(valor)}</div>
              ))}
            </details>
          )}

          {productosMasivos.length > 0 && (
            <div style={estilos.listaMasiva}>
              {productosMasivos.map((producto) => (
                <label key={producto.id} style={estilos.productoMasivo}>
                  <input
                    type="checkbox"
                    checked={producto.seleccionado}
                    onChange={(evento) => actualizarSeleccionMasiva(producto.id, evento.target.checked)}
                    style={estilos.checkboxMasivo}
                  />
                  <span>
                    <b>{producto.nombre}</b><br />
                    <small>
                      Código: {producto.codigo || '—'} · Ubicación: {producto.ubicacionActual || 'Sin ubicación registrada'} · Categoría: {producto.categoria || '—'} · Proveedor: {producto.proveedor || '—'} · Existencia: {producto.stock}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}

          {etapaOperacionMasiva === 'seleccion' && (
            <div style={estilos.botonesMasivos}>
              <button type="button" style={estilos.botonMasivoSecundario} onClick={() => setEtapaOperacionMasiva('seleccion')}>Revisar selección</button>
              <button type="button" style={estilos.botonMasivoSecundario} onClick={() => seleccionarTodosMasivos(true)}>Seleccionar todos</button>
              <button type="button" style={estilos.botonMasivoSecundario} onClick={() => seleccionarTodosMasivos(false)}>Deseleccionar todos</button>
              {productosMasivos.length > 0 ? (
                <button type="button" style={estilos.botonConfirmar} disabled={seleccionadosMasivos.length === 0 || estadoPropuestaMasiva === 'EJECUTANDO'} onClick={continuarOperacionMasiva}>{estadoPropuestaMasiva === 'EJECUTANDO' ? 'Registrando propuesta...' : 'Continuar'}</button>
              ) : (
                <button type="button" style={estilos.botonMasivoSecundario} onClick={ningunoCorrespondeMasivo}>Ninguno corresponde</button>
              )}
              <button type="button" style={estilos.botonCancelar} onClick={cancelarOperacionMasiva}>Cancelar</button>
            </div>
          )}

          {etapaOperacionMasiva === 'confirmacion' && (
            <div style={estilos.confirmacionMasiva}>
              <b>Voy a cambiar la ubicación de {seleccionadosMasivos.length} productos a «{nuevaUbicacionMasiva}».</b>
              <div style={estilos.botonesMasivos}>
                <button type="button" style={estilos.botonConfirmar} disabled={estadoPropuestaMasiva === 'EJECUTANDO'} onClick={confirmarOperacionMasiva}>{estadoPropuestaMasiva === 'EJECUTANDO' ? 'Ejecutando operación...' : estadoPropuestaMasiva === 'ERROR' ? 'Reintentar' : 'Confirmar operación masiva'}</button>
                <button type="button" style={estilos.botonMasivoSecundario} disabled={estadoPropuestaMasiva === 'EJECUTANDO'} onClick={() => { invalidarPropuestaMasiva(); setEtapaOperacionMasiva('seleccion') }}>Volver a revisar</button>
                <button type="button" style={estilos.botonCancelar} disabled={estadoPropuestaMasiva === 'EJECUTANDO'} onClick={cancelarOperacionMasiva}>Cancelar</button>
              </div>
            </div>
          )}

          {etapaOperacionMasiva === 'confirmacion_reforzada' && (
            <div style={estilos.confirmacionMasiva}>
              <b>Esta operación afectará a más de 20 productos.</b>
              <div style={estilos.botonesMasivos}>
                <button type="button" style={estilos.botonConfirmar} disabled={estadoPropuestaMasiva === 'EJECUTANDO'} onClick={confirmarOperacionMasivaDefinitivamente}>{estadoPropuestaMasiva === 'EJECUTANDO' ? 'Ejecutando operación...' : estadoPropuestaMasiva === 'ERROR' ? 'Reintentar' : 'Confirmar definitivamente'}</button>
                <button type="button" style={estilos.botonCancelar} disabled={estadoPropuestaMasiva === 'EJECUTANDO'} onClick={cancelarOperacionMasiva}>Cancelar</button>
              </div>
            </div>
          )}
        </section>
      )}

      {error && <div style={estilos.error}>{error}</div>}

      <form onSubmit={enviarMensaje}>
        <textarea
          value={mensaje}
          onChange={(event) => setMensaje(event.target.value)}
          placeholder="Escribe una consulta u orden de inventario..."
          style={estilos.cajaTexto}
          rows={3}
          disabled={enviando}
        />
        <button type="submit" style={estilos.boton} disabled={enviando || !mensaje.trim()}>
          {enviando ? 'Enviando...' : 'Enviar'}
        </button>
      </form>

      {mostrarConfirmacionReinicio && (
        <div style={estilos.fondoModal} role="dialog" aria-modal="true">
          <div style={estilos.modal}>
            <p><b>¿Quieres reiniciar la conversación?</b></p>
            <button type="button" style={estilos.botonConfirmar} onClick={reiniciarConversacion}>
              Reiniciar
            </button>
            <button
              type="button"
              style={estilos.botonCancelar}
              onClick={() => setMostrarConfirmacionReinicio(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

const estilos: Record<string, CSSProperties> = {
  contenedor: { maxWidth: 760, margin: '0 auto' },
  encabezado: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  descripcion: { color: '#555' },
  historial: { minHeight: 240, border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#f7f7f7' },
  vacio: { color: '#666', textAlign: 'center' },
  mensajeUsuario: { backgroundColor: '#111', color: '#fff', borderRadius: 8, padding: 12, margin: '0 0 12px 15%' },
  mensajeAsistente: { backgroundColor: '#fff', color: '#111', border: '1px solid #ccc', borderLeft: '5px solid #c40000', borderRadius: 8, padding: 12, margin: '0 15% 12px 0' },
  mensajePrincipal: { fontSize: 16, marginBottom: 8 },
  pregunta: { fontWeight: 'bold', color: '#900' },
  opciones: { display: 'grid', gap: 8, margin: '10px 0' },
  opcionProducto: { display: 'grid', gap: 7, padding: 10, border: '1px solid #c40000', borderRadius: 6, backgroundColor: '#fff', color: '#111' },
  botonSeleccionar: { padding: 9, border: 'none', borderRadius: 6, backgroundColor: '#c40000', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  botonConfirmar: { padding: 10, border: 'none', borderRadius: 6, backgroundColor: '#198754', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  botonCancelar: { padding: 10, border: 'none', borderRadius: 6, backgroundColor: '#555', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  botonReiniciar: { padding: '9px 12px', border: '1px solid #555', borderRadius: 6, backgroundColor: '#fff', color: '#111', cursor: 'pointer' },
  detallesSecundarios: { marginTop: 10, padding: 8, borderRadius: 6, backgroundColor: '#f4f4f4' },
  detallesInterpretacion: { marginTop: 8, color: '#666', fontSize: 13 },
  filaDato: { display: 'flex', gap: 6, marginBottom: 4 },
  valorDato: { margin: 0 },
  cajaTexto: { width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 12, border: '1px solid #999', borderRadius: 6, fontSize: 16, marginBottom: 8 },
  boton: { width: '100%', padding: 12, border: 'none', borderRadius: 6, backgroundColor: '#c40000', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  error: { backgroundColor: '#ffe5e5', border: '1px solid #c40000', color: '#900', padding: 12, borderRadius: 8, marginBottom: 12 },
  tarjetaMasiva: { display: 'grid', gap: 12, padding: 14, marginBottom: 14, border: '2px solid #c40000', borderRadius: 10, backgroundColor: '#fff', color: '#111' },
  tituloMasivo: { margin: 0, padding: 10, borderRadius: 6, backgroundColor: '#111', color: '#fff' },
  resumenMasivo: { display: 'flex', flexWrap: 'wrap', gap: 12, padding: 10, backgroundColor: '#ffe8e8', borderRadius: 6 },
  filtrosMasivos: { padding: 10, border: '1px solid #bbb', borderRadius: 6 },
  listaMasiva: { display: 'grid', gap: 8, maxHeight: 430, overflowY: 'auto' },
  productoMasivo: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, border: '1px solid #ccc', borderRadius: 7, cursor: 'pointer' },
  checkboxMasivo: { width: 22, height: 22, flex: '0 0 auto' },
  botonesMasivos: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  botonMasivoSecundario: { minHeight: 42, padding: '10px 14px', border: '1px solid #111', borderRadius: 6, backgroundColor: '#fff', color: '#111', fontWeight: 'bold', cursor: 'pointer' },
  confirmacionMasiva: { display: 'grid', gap: 12, padding: 12, border: '2px solid #c40000', borderRadius: 7 },
  fondoModal: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 2000 },
  modal: { width: '100%', maxWidth: 380, display: 'grid', gap: 10, padding: 20, borderRadius: 10, backgroundColor: '#fff', color: '#111' },
}
