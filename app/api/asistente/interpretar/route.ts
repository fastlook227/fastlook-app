import { NextResponse } from 'next/server'
import { zodTextFormat } from 'openai/helpers/zod'
import { openai } from '@/lib/openai'
import {
  EsquemaInterpretacionAsistente,
  EsquemaSolicitudAsistente,
} from '@/lib/asistente/esquema'
import { PROMPT_ASISTENTE_INVENTARIO } from '@/lib/asistente/prompt'
import {
  buscarProductoPorId,
  buscarProductos,
  buscarProductosMasivos,
} from '@/lib/asistente/buscadorProductos'
import type {
  AccionAsistente,
  AccionPendienteAsistente,
  DatoPendienteAsistente,
  InterpretacionAsistente,
  ProductoAsistente,
  RespuestaAsistente,
  ResultadoBusquedaProducto,
  FiltroProductosMasivo,
} from '@/types/asistente'
import type { RolUsuario } from '@/types'
import { ErrorAutenticacion, obtenerPerfilAutenticado } from '@/lib/auth/servidor'

const ACCIONES_MODIFICACION: AccionAsistente[] = [
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

const interpretacionBase = (
  accion: AccionAsistente,
  valores: Partial<InterpretacionAsistente> = {}
): InterpretacionAsistente => ({
  accion,
  productoBuscado: '',
  cantidad: null,
  precio: null,
  nuevaUbicacion: null,
  filtros: {
    textoBusqueda: null, categoria: null, proveedor: null, color: null,
    modelo: null, codigo: null, ubicacionActual: null, soloNoArchivados: true,
  },
  confianza: 1,
  requiereConfirmacion: ACCIONES_MODIFICACION.includes(accion),
  explicacion: 'La orden fue interpretada usando el contexto de la conversación.',
  ...valores,
})

const respuestaBase = (
  interpretacion: InterpretacionAsistente,
  valores: Partial<RespuestaAsistente> = {}
): RespuestaAsistente => ({
  interpretacion,
  mensajePrincipal: '',
  informacionExtra: [],
  preguntaSeguimiento: null,
  productoSeleccionadoId: null,
  accionPendiente: null,
  accionPendienteDetalle: null,
  datosPendientes: [],
  opciones: [],
  requiereConfirmacion: false,
  productoSeleccionado: null,
  coincidenciasPendientes: [],
  productosParecidos: [],
  limpiarContexto: false,
  operacionMasiva: null,
  ...valores,
})

const productoContexto = (producto: ProductoAsistente) => ({
  id: producto.id,
  texto: producto.nombre,
})

const subtituloProducto = (producto: ProductoAsistente, rol: RolUsuario) =>
  [
    `Código: ${producto.codigo || '—'}`,
    `Precio: $${producto.precio}`,
    `Existencia: ${producto.existencia}`,
    ...(rol === 'Admin' ? [`Costo: $${producto.costo ?? 0}`] : []),
  ].join(' · ')

const informacionProducto = (
  producto: ProductoAsistente,
  accion: AccionAsistente,
  rol: RolUsuario
) => {
  const informacion = [
    { etiqueta: 'Precio', valor: `$${producto.precio}` },
    { etiqueta: 'Existencia', valor: `${producto.existencia}` },
    { etiqueta: 'Código', valor: producto.codigo || 'Sin código' },
    { etiqueta: 'Ubicación', valor: producto.ubicacion || 'Sin ubicación registrada' },
    { etiqueta: 'Categoría', valor: producto.categoria || 'Sin categoría' },
    ...(rol === 'Admin'
      ? [
          { etiqueta: 'Costo', valor: `$${producto.costo ?? 0}` },
          { etiqueta: 'Proveedor', valor: producto.proveedor || 'Sin proveedor' },
        ]
      : []),
  ]

  const etiquetaPrincipal: Partial<Record<AccionAsistente, string>> = {
    CONSULTAR_PRECIO: 'Precio',
    CONSULTAR_EXISTENCIA: 'Existencia',
    CONSULTAR_UBICACION: 'Ubicación',
    CONSULTAR_PROVEEDOR: 'Proveedor',
  }

  return informacion.filter(
    (dato) => accion === 'CONSULTAR_DATOS' || dato.etiqueta !== etiquetaPrincipal[accion]
  )
}

const mensajeConsulta = (
  producto: ProductoAsistente,
  accion: AccionAsistente,
  rol: RolUsuario
) => {
  if (accion === 'CONSULTAR_PRECIO') {
    return `Cuesta $${producto.precio}.`
  }
  if (accion === 'CONSULTAR_EXISTENCIA') {
    return `Hay ${producto.existencia} piezas disponibles.`
  }
  if (accion === 'CONSULTAR_UBICACION') {
    return producto.ubicacion
      ? `Está ubicado en ${producto.ubicacion}.`
      : 'No tiene una ubicación registrada.'
  }
  if (accion === 'CONSULTAR_PROVEEDOR') {
    if (rol !== 'Admin') return 'Esta información requiere permisos de Administrador.'
    return producto.proveedor
      ? `Lo provee ${producto.proveedor}.`
      : 'No tiene un proveedor registrado.'
  }
  return `Encontré ${producto.nombre}.`
}

const extraerNumero = (mensaje: string) => {
  const coincidencia = mensaje.trim().replace(',', '.').match(/^-?\d+(?:\.\d+)?$/)
  return coincidencia ? Number(coincidencia[0]) : null
}

const limpiarNuevaUbicacion = (valor: string) => {
  const limpia = valor.trim().replace(/^["']|["']$/g, '').trim()
  const primerCaracter = limpia[0] || ''
  const primerCaracterValido = /[A-Za-z0-9]/.test(primerCaracter) ||
    primerCaracter.toLocaleLowerCase('es') !== primerCaracter.toLocaleUpperCase('es')
  const caracteresValidos = [...limpia].every((caracter) =>
    /[A-Za-z0-9\s\-/]/.test(caracter) ||
    caracter.toLocaleLowerCase('es') !== caracter.toLocaleUpperCase('es')
  )
  if (
    limpia.length === 0 ||
    limpia.length > 100 ||
    !primerCaracterValido ||
    !caracteresValidos
  ) {
    return null
  }
  return limpia
}

const extraerCambioUbicacion = (mensaje: string) => {
  const orden = mensaje.trim().match(
    /^(?:cambia(?:\s+(?:la|su))?\s+ubicaci[oó]n(?:\s+a)?|ponlo\s+en|mu[eé]velo\s+a|gu[aá]rdalo\s+en|su\s+nueva\s+ubicaci[oó]n\s+ser[aá])(?:\s+(.+))?$/iu
  )
  if (!orden) return null
  return {
    detectada: true,
    tieneValor: Boolean(orden[1]?.trim()),
    nuevaUbicacion: orden[1] ? limpiarNuevaUbicacion(orden[1]) : null,
  }
}

const filtrosMasivosVacios = (): FiltroProductosMasivo => ({
  textoBusqueda: null,
  categoria: null,
  proveedor: null,
  color: null,
  modelo: null,
  codigo: null,
  ubicacionActual: null,
  soloNoArchivados: true,
})

const combinarFiltros = (
  anteriores: FiltroProductosMasivo | null,
  nuevos: FiltroProductosMasivo
): FiltroProductosMasivo => Object.fromEntries(
  Object.entries({ ...filtrosMasivosVacios(), ...anteriores, ...nuevos })
    .map(([clave, valor]) => [
      clave,
      valor ?? anteriores?.[clave as keyof FiltroProductosMasivo] ?? null,
    ])
) as unknown as FiltroProductosMasivo

const extraerOrdenMasiva = (mensaje: string) => {
  const normalizada = normalizarFrase(mensaje)
  const pareceMasiva = /\b(todos|todas|varios|varias|grupo|productos de|productos que|productos seleccionados)\b/.test(normalizada)
    || /\b(los|las)\s+[a-z0-9.-]+s\b/.test(normalizada)
  const pareceUbicacion = /^(mueve|pon|coloca)\b/.test(normalizada)
    || /^cambia\b/.test(normalizada) && /\bubicacion(?:es)?\b/.test(normalizada)
  if (!pareceMasiva || !pareceUbicacion) return null

  const filtros = filtrosMasivosVacios()
  const origen = mensaje.trim()
  const esFiltroUbicacion = /productos\s+que\s+est[eé]n\s+en/i.test(origen)
  const destino = esFiltroUbicacion ? null : origen.match(
    /\s+(?:a|al|en|a la)\s+((?:bolsa|estante|caja|vitrina|mostrador).*)$/i
  )
  const nuevaUbicacion = destino ? limpiarNuevaUbicacion(destino[1]) : null
  let grupo = destino ? origen.slice(0, destino.index).trim() : origen

  const categoria = grupo.match(/categor[ií]a\s+(.+)$/i)
  if (categoria) filtros.categoria = categoria[1].trim()
  const ubicacionActual = grupo.match(/productos\s+que\s+est[eé]n\s+en\s+(.+)$/i)
  if (ubicacionActual) filtros.ubicacionActual = ubicacionActual[1].trim()
  const proveedor = grupo.match(/proveedor\s+(.+)$/i)
  if (proveedor) filtros.proveedor = proveedor[1].trim()
  const codigo = grupo.match(/c[oó]digo\s+([A-Za-z0-9./-]+)/i)
  if (codigo) filtros.codigo = codigo[1]

  const color = grupo.match(/\b(azul(?:es)?|rojo(?:s)?|negro(?:s)?|blanco(?:s)?|verde(?:s)?|amarillo(?:s)?|gris(?:es)?|dorado(?:s)?|plateado(?:s)?)\b/i)
  if (color) filtros.color = color[1].replace(/es$|s$/i, '')
  const modelo = grupo.match(/\b([A-Za-z]*\d[A-Za-z0-9./-]*)\b/)
  if (modelo) filtros.modelo = modelo[1]

  grupo = grupo
    .replace(/^(?:cambia(?:\s+de)?\s+(?:(?:varias?|la)\s+)?ubicaci[oó]n(?:es)?(?:\s+de)?|mueve|pon|coloca)(?:\s+|$)/i, '')
    .replace(/\b(?:todos|todas|varios|varias|grupo|los|las|productos|seleccionados|que|est[eé]n|de|la|el)\b/gi, ' ')
    .replace(/\b(?:azules?|rojos?|negros?|blancos?|verdes?|amarillos?|grises?|dorados?|plateados?)\b/gi, ' ')
    .replace(/\b[A-Za-z]*\d[A-Za-z0-9./-]*\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    !categoria && !ubicacionActual && !proveedor && !codigo &&
    !['', 'producto', 'productos', 'ubicacion', 'ubicaciones'].includes(normalizarFrase(grupo))
  ) {
    filtros.textoBusqueda = grupo
  }

  return { filtros, nuevaUbicacion }
}

const tieneFiltroMasivo = (filtros: FiltroProductosMasivo) =>
  [filtros.textoBusqueda, filtros.categoria, filtros.proveedor, filtros.color,
    filtros.modelo, filtros.codigo, filtros.ubicacionActual].some(Boolean)

const esOlvidarProducto = (mensaje: string) =>
  /^(olvida|olvidar|borra|limpia)(\s+(ese|el|este))?\s+producto[.!]?$/i.test(
    mensaje.trim()
  )

const normalizarFrase = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()

const prepararModificacion = (
  interpretacion: InterpretacionAsistente,
  producto: ProductoAsistente,
  rol: RolUsuario
): RespuestaAsistente => {
  if (rol !== 'Admin') {
    return respuestaBase(interpretacion, {
      mensajePrincipal: 'Esta acción requiere permisos de Administrador.',
      productoSeleccionadoId: producto.id,
      productoSeleccionado: productoContexto(producto),
      requiereConfirmacion: false,
    })
  }

  let datoPendiente: DatoPendienteAsistente | null = null
  let preguntaSeguimiento: string | null = null

  if (interpretacion.accion === 'CAMBIAR_PRECIO' && interpretacion.precio === null) {
    datoPendiente = 'precio'
    preguntaSeguimiento = `Actualmente cuesta $${producto.precio}. ¿Cuál será el nuevo precio?`
  }
  if (
    interpretacion.accion === 'CAMBIAR_UBICACION' &&
    interpretacion.nuevaUbicacion === null
  ) {
    datoPendiente = 'nuevaUbicacion'
    preguntaSeguimiento = '¿Cuál será la nueva ubicación?'
  }
  if (
    ['SUMAR_STOCK', 'RESTAR_STOCK', 'AJUSTAR_STOCK'].includes(interpretacion.accion) &&
    interpretacion.cantidad === null
  ) {
    datoPendiente = 'cantidad'
    preguntaSeguimiento = interpretacion.accion === 'SUMAR_STOCK'
      ? '¿Cuántas piezas llegaron?'
      : interpretacion.accion === 'RESTAR_STOCK'
        ? '¿Cuántas piezas se retirarán?'
        : '¿Cuál será el stock total?'
  }
  if (interpretacion.accion === 'EDITAR_PRODUCTO') {
    datoPendiente = 'datos_producto'
    preguntaSeguimiento = '¿Qué dato deseas cambiar?'
  }

  const detallePendiente: AccionPendienteAsistente = {
    accion: interpretacion.accion,
    productoId: producto.id,
    valorPendiente: datoPendiente || 'datos_producto',
    cantidad: interpretacion.cantidad,
    precio: interpretacion.precio,
    nuevaUbicacion: interpretacion.nuevaUbicacion,
    valorAnterior: interpretacion.accion === 'CAMBIAR_UBICACION'
      ? producto.ubicacion || 'Sin ubicación registrada'
      : null,
    valorNuevo: interpretacion.accion === 'CAMBIAR_UBICACION'
      ? interpretacion.nuevaUbicacion
      : null,
  }

  if (datoPendiente) {
    return respuestaBase(interpretacion, {
      mensajePrincipal: interpretacion.accion === 'CAMBIAR_UBICACION'
        ? `Prepararé el cambio de ubicación de ${producto.nombre}.`
        : `Prepararé la modificación de ${producto.nombre}.`,
      preguntaSeguimiento,
      productoSeleccionadoId: producto.id,
      productoSeleccionado: productoContexto(producto),
      accionPendiente: interpretacion.accion,
      accionPendienteDetalle: detallePendiente,
      datosPendientes: [datoPendiente],
    })
  }

  let propuesta = `Voy a preparar la acción ${interpretacion.accion} para ${producto.nombre}.`
  if (interpretacion.accion === 'CAMBIAR_PRECIO') {
    propuesta = `Voy a cambiar el precio de $${producto.precio} a $${interpretacion.precio}.`
  } else if (interpretacion.accion === 'SUMAR_STOCK') {
    propuesta = `Voy a sumar ${interpretacion.cantidad} piezas. El stock cambiará de ${producto.existencia} a ${producto.existencia + Number(interpretacion.cantidad)}.`
  } else if (interpretacion.accion === 'RESTAR_STOCK') {
    propuesta = `Voy a restar ${interpretacion.cantidad} piezas. El stock cambiará de ${producto.existencia} a ${producto.existencia - Number(interpretacion.cantidad)}.`
  } else if (interpretacion.accion === 'AJUSTAR_STOCK') {
    propuesta = `Voy a ajustar el stock de ${producto.existencia} a ${interpretacion.cantidad}.`
  } else if (interpretacion.accion === 'ARCHIVAR_PRODUCTO') {
    propuesta = `Voy a preparar el archivo de ${producto.nombre}.`
  } else if (interpretacion.accion === 'CAMBIAR_UBICACION') {
    propuesta = `Voy a cambiar la ubicación de ${producto.nombre} de '${producto.ubicacion || 'Sin ubicación registrada'}' a '${interpretacion.nuevaUbicacion}'.`
  }

  return respuestaBase(interpretacion, {
    mensajePrincipal: propuesta,
    productoSeleccionadoId: producto.id,
    productoSeleccionado: productoContexto(producto),
    accionPendiente: interpretacion.accion,
    accionPendienteDetalle: detallePendiente,
    requiereConfirmacion: true,
    opciones: [
      { id: 'confirmar-propuesta', texto: 'Confirmar', tipo: 'CONFIRMAR' },
      { id: 'cancelar-propuesta', texto: 'Cancelar', tipo: 'CANCELAR' },
    ],
  })
}

const responderConProducto = (
  interpretacion: InterpretacionAsistente,
  producto: ProductoAsistente,
  rol: RolUsuario
) => {
  if (ACCIONES_MODIFICACION.includes(interpretacion.accion)) {
    return prepararModificacion(interpretacion, producto, rol)
  }

  return respuestaBase(interpretacion, {
    mensajePrincipal: mensajeConsulta(producto, interpretacion.accion, rol),
    informacionExtra: informacionProducto(producto, interpretacion.accion, rol),
    productoSeleccionadoId: producto.id,
    productoSeleccionado: productoContexto(producto),
  })
}

export async function POST(request: Request) {
  try {
    const perfilAutenticado = await obtenerPerfilAutenticado(request)
    const solicitud = EsquemaSolicitudAsistente.safeParse(await request.json())

    if (!solicitud.success) {
      return NextResponse.json(
        { mensaje: 'La solicitud del asistente no es válida.' },
        { status: 400 }
      )
    }

    const {
      mensaje,
      contexto,
      seleccionProductoId: seleccionSolicitada,
    } = solicitud.data
    const rol = perfilAutenticado.rol
    const fraseNormalizada = normalizarFrase(mensaje)
    const cambioUbicacion = extraerCambioUbicacion(mensaje)
    let seleccionProductoId = seleccionSolicitada || null

    if (cambioUbicacion?.tieneValor && !cambioUbicacion.nuevaUbicacion) {
      return NextResponse.json(
        { mensaje: 'La nueva ubicación no es válida. Usa letras, números, espacios, guiones o diagonales y un máximo de 100 caracteres.' },
        { status: 400 }
      )
    }

    if (!seleccionProductoId && contexto.coincidenciasPendientesIds.length > 0) {
      if (/^(el )?primero$/.test(fraseNormalizada)) {
        seleccionProductoId = contexto.coincidenciasPendientesIds[0]
      } else if (/^(muestrame otro|otro|ese no)$/.test(fraseNormalizada)) {
        const indiceActivo = contexto.productoSeleccionadoId
          ? contexto.coincidenciasPendientesIds.indexOf(contexto.productoSeleccionadoId)
          : -1
        seleccionProductoId = contexto.coincidenciasPendientesIds[
          Math.min(indiceActivo + 1, contexto.coincidenciasPendientesIds.length - 1)
        ]
      } else if (/^ese mismo$/.test(fraseNormalizada)) {
        seleccionProductoId = contexto.productoSeleccionadoId
          || contexto.coincidenciasPendientesIds[0]
      }
    }

    if (esOlvidarProducto(mensaje)) {
      return NextResponse.json(respuestaBase(interpretacionBase('DESCONOCIDA'), {
        mensajePrincipal: 'He olvidado el producto seleccionado.',
        limpiarContexto: true,
      }))
    }

    let ordenMasiva = extraerOrdenMasiva(mensaje)
    if (contexto.accionMasivaPendiente === 'CAMBIAR_UBICACION_MASIVA') {
      if (contexto.etapaOperacionMasiva === 'esperando_ubicacion') {
        const ubicacion = limpiarNuevaUbicacion(mensaje)
        if (!ubicacion) {
          return NextResponse.json(
            { mensaje: 'La nueva ubicación no es válida.' },
            { status: 400 }
          )
        }
        ordenMasiva = {
          filtros: contexto.filtrosMasivos || filtrosMasivosVacios(),
          nuevaUbicacion: ubicacion,
        }
      } else if (contexto.etapaOperacionMasiva === 'esperando_filtros') {
        const refinada = extraerOrdenMasiva(
          `mueve todos ${mensaje}${contexto.nuevaUbicacionMasiva ? ` a ${contexto.nuevaUbicacionMasiva}` : ''}`
        )
        ordenMasiva = refinada ? {
          filtros: combinarFiltros(contexto.filtrosMasivos, refinada.filtros),
          nuevaUbicacion: contexto.nuevaUbicacionMasiva || refinada.nuevaUbicacion,
        } : null
      }
    }

    if (ordenMasiva) {
      const interpretacionMasiva = interpretacionBase('CAMBIAR_UBICACION_MASIVA', {
        nuevaUbicacion: ordenMasiva.nuevaUbicacion,
        filtros: ordenMasiva.filtros,
      })
      if (rol !== 'Admin') {
        return NextResponse.json(respuestaBase(interpretacionMasiva, {
          mensajePrincipal: 'Las modificaciones masivas requieren permisos de Administrador.',
        }))
      }
      if (!tieneFiltroMasivo(ordenMasiva.filtros)) {
        return NextResponse.json(respuestaBase(interpretacionMasiva, {
          mensajePrincipal: ordenMasiva.nuevaUbicacion
            ? '¿Qué productos deseas mover?'
            : 'La búsqueda es demasiado amplia. Indica una categoría, nombre, modelo, color, proveedor o ubicación actual.',
          operacionMasiva: {
            accion: 'CAMBIAR_UBICACION_MASIVA',
            filtros: ordenMasiva.filtros,
            nuevaUbicacion: ordenMasiva.nuevaUbicacion,
            productos: [], totalCoincidencias: 0, excedeLimite: false,
            etapa: 'esperando_filtros',
          },
        }))
      }
      if (!ordenMasiva.nuevaUbicacion) {
        return NextResponse.json(respuestaBase(interpretacionMasiva, {
          mensajePrincipal: '¿Cuál será la nueva ubicación?',
          operacionMasiva: {
            accion: 'CAMBIAR_UBICACION_MASIVA',
            filtros: ordenMasiva.filtros,
            nuevaUbicacion: null,
            productos: [], totalCoincidencias: 0, excedeLimite: false,
            etapa: 'esperando_ubicacion',
          },
        }))
      }
      const resultadoMasivo = await buscarProductosMasivos(ordenMasiva.filtros)
      if (resultadoMasivo.totalCoincidencias > 100) {
        return NextResponse.json(respuestaBase(interpretacionMasiva, {
          mensajePrincipal: 'Encontré más de 100 productos. Refina la búsqueda antes de continuar.',
          operacionMasiva: {
            accion: 'CAMBIAR_UBICACION_MASIVA', filtros: ordenMasiva.filtros,
            nuevaUbicacion: ordenMasiva.nuevaUbicacion, productos: [],
            totalCoincidencias: resultadoMasivo.totalCoincidencias,
            excedeLimite: true, etapa: 'esperando_filtros',
          },
        }))
      }
      return NextResponse.json(respuestaBase(interpretacionMasiva, {
        mensajePrincipal: resultadoMasivo.totalCoincidencias === 0
          ? 'No encontré productos que coincidan con la búsqueda.'
          : `Encontré ${resultadoMasivo.totalCoincidencias} ${resultadoMasivo.totalCoincidencias === 1 ? 'producto que coincide' : 'productos que coinciden'} con la búsqueda.`,
        operacionMasiva: {
          accion: 'CAMBIAR_UBICACION_MASIVA', filtros: ordenMasiva.filtros,
          nuevaUbicacion: ordenMasiva.nuevaUbicacion,
          productos: resultadoMasivo.productos,
          totalCoincidencias: resultadoMasivo.totalCoincidencias,
          excedeLimite: false, etapa: 'seleccion',
        },
      }))
    }

    let interpretacion: InterpretacionAsistente
    const numeroPendiente = contexto.accionPendiente ? extraerNumero(mensaje) : null

    if (seleccionProductoId) {
      const idsPermitidos = new Set([
        ...contexto.coincidenciasPendientesIds,
        ...contexto.opcionesPendientesIds,
      ])
      if (!idsPermitidos.has(seleccionProductoId)) {
        return NextResponse.json({ mensaje: 'La opción seleccionada no es válida.' }, { status: 400 })
      }
      interpretacion = interpretacionBase(
        contexto.accionOriginalPendiente || contexto.ultimaAccion || 'CONSULTAR_DATOS',
        {
        productoBuscado: contexto.productoBuscadoOriginal,
        cantidad: contexto.cantidadPendiente ?? contexto.accionPendiente?.cantidad ?? null,
        precio: contexto.precioPendiente ?? contexto.accionPendiente?.precio ?? null,
        nuevaUbicacion: contexto.accionPendiente?.nuevaUbicacion ?? null,
      })
    } else if (
      contexto.accionPendiente?.valorPendiente === 'nuevaUbicacion'
    ) {
      const nuevaUbicacion = limpiarNuevaUbicacion(mensaje)
      if (!nuevaUbicacion) {
        return NextResponse.json(
          { mensaje: 'La nueva ubicación no es válida. Usa letras, números, espacios, guiones o diagonales y un máximo de 100 caracteres.' },
          { status: 400 }
        )
      }
      interpretacion = interpretacionBase('CAMBIAR_UBICACION', {
        nuevaUbicacion,
      })
    } else if (cambioUbicacion) {
      interpretacion = interpretacionBase('CAMBIAR_UBICACION', {
        nuevaUbicacion: cambioUbicacion.nuevaUbicacion,
      })
    } else if (contexto.accionPendiente && numeroPendiente !== null) {
      const pendiente = contexto.accionPendiente
      interpretacion = interpretacionBase(pendiente.accion, {
        precio: pendiente.valorPendiente === 'precio' ? numeroPendiente : pendiente.precio,
        cantidad: pendiente.valorPendiente === 'cantidad' ? numeroPendiente : pendiente.cantidad,
        nuevaUbicacion: pendiente.nuevaUbicacion,
      })
    } else if (contexto.buscandoOtroNombre && contexto.accionOriginalPendiente) {
      interpretacion = interpretacionBase(contexto.accionOriginalPendiente, {
        productoBuscado: mensaje.trim(),
        cantidad: contexto.cantidadPendiente,
        precio: contexto.precioPendiente,
        nuevaUbicacion: null,
      })
    } else if (contexto.accionPendiente?.valorPendiente === 'producto') {
      interpretacion = interpretacionBase(contexto.accionPendiente.accion, {
        productoBuscado: mensaje.trim(),
        cantidad: contexto.accionPendiente.cantidad,
        precio: contexto.accionPendiente.precio,
        nuevaUbicacion: contexto.accionPendiente.nuevaUbicacion,
      })
    } else {
      const respuesta = await openai.responses.parse({
        model: 'gpt-4o-mini',
        instructions: PROMPT_ASISTENTE_INVENTARIO,
        input: mensaje,
        text: {
          format: zodTextFormat(
            EsquemaInterpretacionAsistente,
            'interpretacion_asistente_inventario'
          ),
        },
        max_output_tokens: 300,
      })
      const resultadoInterpretacion = EsquemaInterpretacionAsistente.safeParse(
        respuesta.output_parsed
      )
      if (!resultadoInterpretacion.success) {
        return NextResponse.json(
          { mensaje: 'La respuesta del asistente no tuvo el formato esperado.' },
          { status: 502 }
        )
      }
      const ubicacionValidada = resultadoInterpretacion.data.nuevaUbicacion === null
        ? null
        : limpiarNuevaUbicacion(resultadoInterpretacion.data.nuevaUbicacion)
      if (
        resultadoInterpretacion.data.nuevaUbicacion !== null &&
        ubicacionValidada === null
      ) {
        return NextResponse.json(
          { mensaje: 'La respuesta del asistente contiene una ubicación no válida.' },
          { status: 502 }
        )
      }
      interpretacion = {
        ...resultadoInterpretacion.data,
        nuevaUbicacion: ubicacionValidada,
      }
    }

    if (rol !== 'Admin' && ACCIONES_MODIFICACION.includes(interpretacion.accion)) {
      return NextResponse.json(respuestaBase(interpretacion, {
        mensajePrincipal: 'Esta acción requiere permisos de Administrador.',
        productoSeleccionadoId: contexto.productoSeleccionadoId,
      }))
    }

    let producto: ProductoAsistente | null = null
    let coincidencias: ResultadoBusquedaProducto[] = []
    let productosParecidos: ResultadoBusquedaProducto[] = []
    const productoContextualId = seleccionProductoId
      || contexto.accionPendiente?.productoId
      || (!interpretacion.productoBuscado ? contexto.productoSeleccionadoId : null)

    if (productoContextualId) {
      producto = await buscarProductoPorId(productoContextualId, rol)
    } else if (interpretacion.productoBuscado) {
      const resultadoBusqueda = await buscarProductos(interpretacion.productoBuscado, rol)
      coincidencias = resultadoBusqueda.coincidencias
      productosParecidos = resultadoBusqueda.productosParecidos

      const primera = coincidencias[0]
      const segunda = coincidencias[1]
      const coincidenciaInequivoca = coincidencias.length === 1
        || (primera?.puntaje >= 0.98 && (!segunda || segunda.puntaje < 0.9))

      if (coincidenciaInequivoca) {
        producto = primera.producto
      }
    }

    if (producto) {
      const respuestaProducto = responderConProducto(interpretacion, producto, rol)
      return NextResponse.json(respuestaProducto)
    }

    if (coincidencias.length > 1) {
      const detallePendiente: AccionPendienteAsistente = {
        accion: interpretacion.accion,
        productoId: null,
        valorPendiente: 'producto',
        cantidad: interpretacion.cantidad,
        precio: interpretacion.precio,
        nuevaUbicacion: interpretacion.nuevaUbicacion,
        valorAnterior: null,
        valorNuevo: interpretacion.nuevaUbicacion,
      }

      return NextResponse.json(respuestaBase(interpretacion, {
        mensajePrincipal: `Encontré ${coincidencias.length} coincidencias. ¿Cuál necesitas?`,
        preguntaSeguimiento: 'Selecciona una opción para continuar con la pregunta original.',
        accionPendiente: interpretacion.accion,
        accionPendienteDetalle: detallePendiente,
        datosPendientes: ['producto'],
        opciones: [
          ...coincidencias.map((coincidencia) => ({
            id: coincidencia.producto.id,
            texto: coincidencia.producto.nombre,
            subtitulo: subtituloProducto(coincidencia.producto, rol),
            tipo: 'PRODUCTO' as const,
          })),
          {
            id: 'ninguno-corresponde',
            texto: 'Ninguno corresponde',
            tipo: 'NINGUNO_CORRESPONDE' as const,
          },
        ],
        coincidenciasPendientes: coincidencias,
      }))
    }

    if (!interpretacion.productoBuscado && !contexto.productoSeleccionadoId) {
      const detallePendiente: AccionPendienteAsistente = {
        accion: interpretacion.accion,
        productoId: null,
        valorPendiente: 'producto',
        cantidad: interpretacion.cantidad,
        precio: interpretacion.precio,
        nuevaUbicacion: interpretacion.nuevaUbicacion,
        valorAnterior: null,
        valorNuevo: interpretacion.nuevaUbicacion,
      }
      return NextResponse.json(respuestaBase(interpretacion, {
        mensajePrincipal: 'Necesito saber de qué producto hablas.',
        preguntaSeguimiento: '¿Cuál es el nombre o código del producto?',
        accionPendiente: interpretacion.accion,
        accionPendienteDetalle: detallePendiente,
        datosPendientes: ['producto'],
      }))
    }

    if (interpretacion.accion === 'CREAR_PRODUCTO') {
      const detallePendiente: AccionPendienteAsistente = {
        accion: 'CREAR_PRODUCTO',
        productoId: null,
        valorPendiente: 'datos_producto',
        cantidad: interpretacion.cantidad,
        precio: interpretacion.precio,
        nuevaUbicacion: interpretacion.nuevaUbicacion,
        valorAnterior: null,
        valorNuevo: interpretacion.nuevaUbicacion,
      }
      return NextResponse.json(respuestaBase(interpretacion, {
        mensajePrincipal: 'No encontré un producto registrado que corresponda a esa búsqueda.',
        accionPendiente: 'CREAR_PRODUCTO',
        accionPendienteDetalle: detallePendiente,
        datosPendientes: ['producto'],
        opciones: [
          {
            id: 'preparar-producto-nuevo',
            texto: 'Preparar producto nuevo',
            tipo: 'PREPARAR_PRODUCTO_NUEVO',
          },
          { id: 'cancelar-consulta', texto: 'Cancelar', tipo: 'CANCELAR' },
        ],
      }))
    }

    if (productosParecidos.length > 0) {
      const detallePendiente: AccionPendienteAsistente = {
        accion: interpretacion.accion,
        productoId: null,
        valorPendiente: 'producto',
        cantidad: interpretacion.cantidad,
        precio: interpretacion.precio,
        nuevaUbicacion: interpretacion.nuevaUbicacion,
        valorAnterior: null,
        valorNuevo: interpretacion.nuevaUbicacion,
      }
      return NextResponse.json(respuestaBase(interpretacion, {
        mensajePrincipal: 'No encontré una coincidencia exacta. Estos productos se parecen:',
        preguntaSeguimiento: 'Selecciona una opción para continuar con la pregunta original.',
        accionPendiente: interpretacion.accion,
        accionPendienteDetalle: detallePendiente,
        datosPendientes: ['producto'],
        opciones: [
          ...productosParecidos.map((coincidencia) => ({
            id: coincidencia.producto.id,
            texto: coincidencia.producto.nombre,
            subtitulo: subtituloProducto(coincidencia.producto, rol),
            tipo: 'PRODUCTO' as const,
          })),
          {
            id: 'ninguno-corresponde',
            texto: 'Ninguno corresponde',
            tipo: 'NINGUNO_CORRESPONDE' as const,
          },
        ],
        coincidenciasPendientes: productosParecidos,
        productosParecidos,
      }))
    }

    const opcionesSinResultado = ACCIONES_MODIFICACION.includes(interpretacion.accion)
        ? [
            { id: 'buscar-otro-nombre', texto: 'Buscar con otro nombre', tipo: 'BUSCAR_OTRO_NOMBRE' as const },
            { id: 'cancelar-consulta', texto: 'Cancelar', tipo: 'CANCELAR' as const },
          ]
        : [
            { id: 'buscar-otro-nombre', texto: 'Buscar con otro nombre', tipo: 'BUSCAR_OTRO_NOMBRE' as const },
            { id: 'finalizar-consulta', texto: 'Finalizar consulta', tipo: 'FINALIZAR_CONSULTA' as const },
          ]

    return NextResponse.json(respuestaBase(interpretacion, {
      mensajePrincipal: 'No encontré un producto que coincida.',
      opciones: opcionesSinResultado,
    }))
  } catch (error) {
    if (error instanceof ErrorAutenticacion) {
      return NextResponse.json({ mensaje: error.message }, { status: error.status })
    }
    console.error('Error seguro del asistente:', {
      nombre: error instanceof Error ? error.name : 'Error desconocido',
      mensaje: error instanceof Error ? error.message : 'Sin mensaje',
      status:
        typeof error === 'object' && error !== null && 'status' in error
          ? error.status
          : undefined,
      code:
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined,
    })

    return NextResponse.json(
      { mensaje: 'No fue posible procesar la conversación.' },
      { status: 500 }
    )
  }
}
