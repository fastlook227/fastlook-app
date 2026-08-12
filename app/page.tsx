'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import type { Session } from '@supabase/supabase-js'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Hash, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type {
  CarritoItem,
  Cliente,
  CorteCaja,
  FormCliente,
  FormProducto,
  FormProveedor,
  MovimientoCliente,
  MovimientoInventario,
  PerfilUsuario,
  Producto,
  Proveedor,
  RolUsuario,
  Tab,
  Venta,
} from '@/types'
import { obtenerFechaLocal } from '@/utils/fechas'
import { normalizarTextoBusqueda } from '@/utils/busqueda'
import { puedeAccederCorteCaja } from '@/lib/permisos/corteCaja'
import { generarTextoTicket } from '@/utils/ticket'
import { comprimirImagenProducto } from '@/utils/imagenes'
import PantallaCarga from '@/components/PantallaCarga'
import PantallaAcceso from '@/components/PantallaAcceso'
import Navegacion from '@/components/Navegacion'
import ListaPrecios from '@/components/ListaPrecios'
import StockBajo from '@/components/StockBajo'
import AsistenteInventario from '@/components/AsistenteInventario'
import Movimientos from '@/components/Movimientos'
import Dashboard from '@/components/Dashboard'
import Proveedores from '@/components/Proveedores'
import ListaCompras, {
  type ProductoCompra,
} from '@/components/ListaCompras'
import Clientes from '@/components/Clientes'
import GestionUsuarios from '@/components/GestionUsuarios'
import LoadingOverlay from '@/components/LoadingOverlay'
import SelectorImagen from '@/components/SelectorImagen'
import CorteCajaDashboard from '@/components/corte/CorteCajaDashboard'
import CatalogoCascos from '@/components/cascos/CatalogoCascos'
import {
  comprobarCodigoProducto,
  esErrorCodigoDuplicado,
  generarCodigoProductoDisponible,
  normalizarCodigoProducto,
} from '@/utils/codigosProducto'
import {
  claveSemanticaTipoProducto,
  normalizarTipoProducto,
  obtenerTiposProducto,
} from '@/utils/tiposProducto'

export default function Home() {
  const [tab, setTab] = useState<Tab>('precios')
  const [productos, setProductos] = useState<Producto[]>([])
  const [errorProductos, setErrorProductos] = useState('')
  const [ventas, setVentas] = useState<Venta[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState<CarritoItem[]>([])
  const [metodoPago, setMetodoPago] = useState('Efectivo')
  const [usuarioRol, setUsuarioRol] = useState<RolUsuario | null>(null)
  const [perfilUsuario, setPerfilUsuario] = useState<PerfilUsuario | null>(null)
  const [appLista, setAppLista] = useState(false)
  const [correoAcceso, setCorreoAcceso] = useState('')
  const [passwordAcceso, setPasswordAcceso] = useState('')
  const [errorAcceso, setErrorAcceso] = useState('')
  const [cargandoAcceso, setCargandoAcceso] = useState(false)
  const [verificandoSesion, setVerificandoSesion] = useState(true)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [faseImagen, setFaseImagen] = useState('Procesando imagen…')
  const [notificacionImagen, setNotificacionImagen] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [cortes, setCortes] = useState<CorteCaja[]>([])
  const [avisoCorte, setAvisoCorte] = useState('')
  const [cantidadCompra, setCantidadCompra] = useState(1)
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [carritoAbierto, setCarritoAbierto] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [movimientosClientes, setMovimientosClientes] = useState<MovimientoCliente[]>([])
  const [busquedaClientes, setBusquedaClientes] = useState('')
  const [montoCliente, setMontoCliente] = useState('')
  const [notaCliente, setNotaCliente] = useState('')

  const [formCliente, setFormCliente] = useState<FormCliente>({
    id: '',
    nombre: '',
    numero: '',
    moto: '',
    deuda: '',
  })

  const [formProveedor, setFormProveedor] = useState<FormProveedor>({
    id: '',
    nombre: '',
    telefono: '',
    productos: '',
    tiempo_entrega: '',
    notas: '',
  })

  const [form, setForm] = useState<FormProducto>({
    id: '',
    codigo: '',
    nombre: '',
    tipo: '',
    precio: '',
    costo: '',
    stock: '',
    stock_minimo: '',
    ubicacion: '',
    proveedor: '',
    imagen_url: '',
  })
  const formRef = useRef<HTMLDivElement>(null)
  const primerCampoInventarioRef = useRef<HTMLInputElement>(null)
  const formularioInventarioBaseRef = useRef<FormProducto>({
    id: '',
    codigo: '',
    nombre: '',
    tipo: '',
    precio: '',
    costo: '',
    stock: '',
    stock_minimo: '',
    ubicacion: '',
    proveedor: '',
    imagen_url: '',
  })
  const [formularioInventarioAbierto, setFormularioInventarioAbierto] = useState(Boolean(form.id))
  const [detallesProductoAbiertos, setDetallesProductoAbiertos] = useState(false)
  const [confirmarCierreInventario, setConfirmarCierreInventario] = useState(false)
  const [generarCodigoAutomatico, setGenerarCodigoAutomatico] = useState(true)
  const [generandoCodigo, setGenerandoCodigo] = useState(false)
  const [estadoCodigo, setEstadoCodigo] = useState<'idle' | 'disponible' | 'ocupado' | 'error' | 'regenerado'>('idle')
  const [mensajeCodigo, setMensajeCodigo] = useState('')
  const [tipoPersonalizado, setTipoPersonalizado] = useState('')
  const [tipoModificadoManualmente, setTipoModificadoManualmente] = useState(false)
  const tipoOriginalEdicionRef = useRef('')
  const codigoOriginalEdicionRef = useRef('')
  const tiposProducto = useMemo(() => obtenerTiposProducto(productos.map((producto) => producto.tipo)), [productos])

  useEffect(() => {
    if (!perfilUsuario) return
    fetchProductos()
    fetchVentas()
    fetchProveedores()
    fetchMovimientos()
    if (puedeAccederCorteCaja(perfilUsuario.correo)) fetchCortes()
    fetchClientes()
    fetchMovimientosClientes()
  }, [perfilUsuario])

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppLista(true)
    }, 1500)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let activo = true

    const sincronizarSesion = async (sesion: Session | null) => {
      if (!activo) return
      if (!sesion?.user) {
        setPerfilUsuario(null)
        setUsuarioRol(null)
        setCortes([])
        setAvisoCorte('')
        setTab('precios')
        setVerificandoSesion(false)
        return
      }

      const { data: perfil, error } = await supabase
        .from('usuarios')
        .select('id,correo,nombre,rol,activo')
        .eq('id', sesion.user.id)
        .maybeSingle()
      if (!activo) return
      if (error || !perfil) {
        setPerfilUsuario(null)
        setUsuarioRol(null)
        setErrorAcceso('No fue posible cargar el perfil autorizado.')
        setVerificandoSesion(false)
        return
      }
      if (perfil.activo !== true) {
        setPerfilUsuario(null)
        setUsuarioRol(null)
        setErrorAcceso('Tu usuario está inactivo.')
        setTimeout(() => { void supabase.auth.signOut() }, 0)
        setVerificandoSesion(false)
        return
      }
      if (!['Admin', 'Vendedor'].includes(perfil.rol)) {
        setPerfilUsuario(null)
        setUsuarioRol(null)
        setErrorAcceso('Tu perfil no tiene un rol válido.')
        setVerificandoSesion(false)
        return
      }
      const perfilValidado = { ...perfil, rol: perfil.rol as RolUsuario } as PerfilUsuario
      setPerfilUsuario(perfilValidado)
      setUsuarioRol(perfilValidado.rol)
      setErrorAcceso('')
      setVerificandoSesion(false)
    }

    void supabase.auth.getSession().then(({ data }) => sincronizarSesion(data.session))
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      void sincronizarSesion(sesion)
    })
    return () => {
      activo = false
      suscripcion.subscription.unsubscribe()
    }
  }, [])

  const fetchProductos = async (silencioso = false) => {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre', { ascending: true })

    if (error) {
      setErrorProductos(error.message)
      if (silencioso) throw new Error('No fue posible actualizar los productos: ' + error.message)
      alert('Error al cargar productos: ' + error.message)
      return
    }

    setProductos(data || [])
    setErrorProductos('')
  }

  const fetchVentas = async (silencioso = false) => {
    const { data, error } = await supabase
      .from('ventas')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      if (silencioso) throw new Error('No fue posible actualizar las ventas del corte: ' + error.message)
      alert('Error al cargar ventas: ' + error.message)
      return
    }

    setVentas(data || [])
  }


  const fetchProveedores = async () => {
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .order('nombre', { ascending: true })

    if (error) {
      alert('Error al cargar proveedores: ' + error.message)
      return
    }

    setProveedores(data || [])
  }

  const fetchMovimientos = async () => {
    const { data, error } = await supabase
      .from('movimientos_inventario')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      alert('Error al cargar movimientos: ' + error.message)
      return
    }

    setMovimientos(data || [])
  }


  const fetchCortes = async (silencioso = false) => {
    const { data: sesionData } = await supabase.auth.getSession()
    const token = sesionData.session?.access_token
    if (!token) {
      if (silencioso) throw new Error('Debes iniciar sesión.')
      return
    }
    const respuesta = await fetch('/api/corte-caja', { headers: { Authorization: `Bearer ${token}` } })
    const resultado = await respuesta.json() as { cortes?: CorteCaja[]; mensaje?: string }
    if (!respuesta.ok) {
      const mensaje = resultado.mensaje || 'No fue posible actualizar el historial de cortes.'
      if (silencioso) throw new Error(mensaje)
      alert(mensaje)
      return
    }
    setCortes(resultado.cortes || [])
  }

  const fetchClientes = async () => {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre', { ascending: true })

  if (error) {
    alert('Error al cargar clientes: ' + error.message)
    return
  }

  setClientes(data || [])
}

const fetchMovimientosClientes = async () => {
  const { data, error } = await supabase
    .from('movimientos_clientes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    alert('Error al cargar movimientos de clientes: ' + error.message)
    return
  }

  setMovimientosClientes(data || [])
}

  useEffect(() => {
    const verificarCambioDia = async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) return
      const respuesta = await fetch('/api/corte-caja', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (!respuesta.ok) {
        const resultado = await respuesta.json() as { mensaje?: string }
        alert(resultado.mensaje || 'No fue posible generar el corte automático.')
        return
      }
      await fetchCortes()
    }

    if (perfilUsuario && puedeAccederCorteCaja(perfilUsuario.correo) && ventas.length > 0 && productos.length > 0) {
      void verificarCambioDia()
    }
  }, [perfilUsuario, ventas, productos])

  useEffect(() => {
    const tabsAdmin = ['inventario', 'corte', 'proveedores', 'compras', 'movimientos', 'dashboard', 'usuarios']

    if (tab === 'corte' && !puedeAccederCorteCaja(perfilUsuario?.correo)) {
      setAvisoCorte('No tienes permiso para acceder a Corte de caja.')
      setTab('precios')
    } else if (usuarioRol !== 'Admin' && tab !== 'corte' && tabsAdmin.includes(tab)) {
      setTab('precios')
    }
  }, [usuarioRol, perfilUsuario?.correo, tab])

  const subirImagenProducto = async (file: File) => {
    if (!file) return

    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp']
    const tamanoMaximo = 15 * 1024 * 1024

    if (!tiposPermitidos.includes(file.type)) {
      setNotificacionImagen({ tipo: 'error', mensaje: 'Formato no válido. Selecciona una imagen JPEG, PNG o WebP.' })
      return
    }

    if (file.size > tamanoMaximo) {
      setNotificacionImagen({ tipo: 'error', mensaje: 'La imagen es demasiado grande. El tamaño máximo permitido es 15 MB.' })
      return
    }

    setFaseImagen('Procesando imagen…')
    setNotificacionImagen(null)
    setSubiendoImagen(true)
    try {

    let archivoComprimido: File

    try {
      archivoComprimido = await comprimirImagenProducto(file)
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : 'Error desconocido'
      setNotificacionImagen({ tipo: 'error', mensaje: 'Error al comprimir imagen: ' + mensaje })
      return
    }

    const reduccion =
      file.size > 0
        ? ((file.size - archivoComprimido.size) / file.size) * 100
        : 0

    console.log('Peso original:', file.size, 'bytes')
    console.log('Peso comprimido:', archivoComprimido.size, 'bytes')
    console.log('Porcentaje de reducción:', `${reduccion.toFixed(2)}%`)

    const nombreLimpio = form.codigo || 'producto'
    const nombreArchivo = `${nombreLimpio}-${Date.now()}.webp`

    setFaseImagen('Subiendo imagen…')
    const { error } = await supabase.storage
      .from('productos')
      .upload(nombreArchivo, archivoComprimido, {
        contentType: 'image/webp',
        cacheControl: '31536000',
      })

    if (error) {
      setNotificacionImagen({ tipo: 'error', mensaje: 'Error al subir imagen: ' + error.message })
      return
    }

    const { data } = supabase.storage
      .from('productos')
      .getPublicUrl(nombreArchivo)

    setForm((prev) => ({
      ...prev,
      imagen_url: data.publicUrl,
    }))

    setNotificacionImagen({ tipo: 'ok', mensaje: 'Imagen subida correctamente.' })
    } finally {
      setSubiendoImagen(false)
    }
  }

  const productosFiltrados = productos.filter((p) => {
    const texto = normalizarTextoBusqueda(busqueda)
    return (
      normalizarTextoBusqueda(p.nombre).includes(texto) ||
      normalizarTextoBusqueda(p.codigo).includes(texto) ||
      normalizarTextoBusqueda(p.tipo).includes(texto) ||
      normalizarTextoBusqueda(p.ubicacion).includes(texto) ||
      normalizarTextoBusqueda(p.proveedor).includes(texto)
    )
  })

  const clientesFiltrados = clientes.filter((c) => {
  const texto = busquedaClientes.toLowerCase()

  return (
    c.nombre?.toLowerCase().includes(texto) ||
    c.numero?.toLowerCase().includes(texto) ||
    c.moto?.toLowerCase().includes(texto)
  )
})

  const productosBajoStock = productos.filter(
    (p) => Number(p.stock) <= Number(p.stock_minimo || 5)
  )

  const agregarAlCarrito = (producto: Producto, mostrarAlertas = true): { ok: boolean; mensaje: string } => {
    if (producto.stock <= 0) {
      if (mostrarAlertas) alert('Sin stock disponible')
      return { ok: false, mensaje: 'Este casco no tiene stock disponible.' }
    }

    const existe = carrito.find((item) => item.id === producto.id)

    if (existe) {
      if (existe.cantidad + 1 > producto.stock) {
        if (mostrarAlertas) alert('No hay más stock disponible')
        return { ok: false, mensaje: 'Ya alcanzaste el máximo disponible en el carrito.' }
      }

      setCarrito(
        carrito.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        )
      )
    } else {
      setCarrito([...carrito, { ...producto, cantidad: 1 }])
    }
    return { ok: true, mensaje: 'Casco añadido a la venta.' }
  }

  const aumentarCantidad = (id: string) => {
    setCarrito(
      carrito.map((item) => {
        if (item.id === id) {
          if (item.cantidad + 1 > item.stock) {
            alert('No hay más stock disponible')
            return item
          }
          return { ...item, cantidad: item.cantidad + 1 }
        }
        return item
      })
    )
  }

  const disminuirCantidad = (id: string) => {
    setCarrito(
      carrito
        .map((item) =>
          item.id === id
            ? { ...item, cantidad: item.cantidad - 1 }
            : item
        )
        .filter((item) => item.cantidad > 0)
    )
  }

  const cambiarCantidad = (id: string, cantidad: number) => {
    setCarrito(
      carrito.map((item) => {
        if (item.id === id) {
          if (cantidad > item.stock) {
            alert('No hay suficiente stock')
            return item
          }
          return { ...item, cantidad: cantidad < 1 ? 1 : cantidad }
        }
        return item
      })
    )
  }

  const eliminarDelCarrito = (id: string) => {
    setCarrito(carrito.filter((item) => item.id !== id))
  }

  const cancelarTicket = () => {
    if (confirm('¿Cancelar ticket actual?')) {
      setCarrito([])
    }
  }


  const registrarMovimiento = async (
    producto: Producto,
    tipo: string,
    cantidad: number,
    stockAnterior: number,
    stockNuevo: number,
    nota: string
  ) => {
    const { error } = await supabase.from('movimientos_inventario').insert([
      {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        tipo_movimiento: tipo,
        cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        nota,
      },
    ])

    if (error) {
      alert('Error al registrar movimiento: ' + error.message)
      return
    }

    fetchMovimientos()
  }

  const entradaStock = async (producto: Producto, cantidad: number) => {
    if (usuarioRol !== 'Admin') {
      alert('Solo el administrador puede modificar stock')
      return
    }

    if (cantidad <= 0) {
      alert('La cantidad debe ser mayor a 0')
      return
    }

    const stockAnterior = Number(producto.stock || 0)
    const stockNuevo = stockAnterior + cantidad

    const { error } = await supabase
      .from('productos')
      .update({ stock: stockNuevo })
      .eq('id', producto.id)

    if (error) {
      alert('Error al actualizar stock: ' + error.message)
      return
    }

    await registrarMovimiento(
      producto,
      'Entrada',
      cantidad,
      stockAnterior,
      stockNuevo,
      'Entrada manual de inventario'
    )

    fetchProductos()
    alert('Stock actualizado')
  }

  const ajustarStock = async (producto: Producto, nuevoStock: number) => {
    if (usuarioRol !== 'Admin') {
      alert('Solo el administrador puede modificar stock')
      return
    }

    if (nuevoStock < 0) {
      alert('El stock no puede ser negativo')
      return
    }

    const stockAnterior = Number(producto.stock || 0)

    const { error } = await supabase
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', producto.id)

    if (error) {
      alert('Error al ajustar stock: ' + error.message)
      return
    }

    await registrarMovimiento(
      producto,
      'Ajuste',
      nuevoStock - stockAnterior,
      stockAnterior,
      nuevoStock,
      'Ajuste manual de inventario'
    )

    fetchProductos()
    alert('Stock ajustado')
  }

  const totalCarrito = carrito.reduce(
    (total, item) => total + Number(item.precio) * item.cantidad,
    0
  )

  const gananciaCarrito = carrito.reduce(
    (total, item) =>
      total + (Number(item.precio) - Number(item.costo || 0)) * item.cantidad,
    0
  )

  const finalizarVenta = async () => {
    if (carrito.length === 0) {
      alert('El carrito está vacío')
      return
    }

    for (const item of carrito) {
      if (item.stock < item.cantidad) {
        alert(`No hay suficiente stock de ${item.nombre}`)
        return
      }

      const { error: errorStock } = await supabase
        .from('productos')
        .update({ stock: item.stock - item.cantidad })
        .eq('id', item.id)

      if (errorStock) {
        alert('Error al actualizar stock: ' + errorStock.message)
        return
      }

      await registrarMovimiento(
        item,
        'Venta',
        item.cantidad,
        Number(item.stock),
        Number(item.stock) - Number(item.cantidad),
        'Salida por venta'
      )

      const { error: errorVenta } = await supabase.from('ventas').insert([
        {
          producto_id: item.id,
          codigo: item.codigo,
          nombre: item.nombre,
          precio: item.precio,
          cantidad: item.cantidad,
          total: Number(item.precio) * item.cantidad,
          metodo_pago: metodoPago,
        },
      ])

      if (errorVenta) {
        alert('Error al registrar venta: ' + errorVenta.message)
        return
      }
    }

    alert(`Venta realizada. Total: $${totalCarrito}`)
    setCarrito([])
    fetchProductos()
    fetchVentas()
  }

  const cargarImagenBase64 = async (url: string) => {
    const response = await fetch(url)
    const blob = await response.blob()

    return new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  }

  const descargarTicket = async () => {
    if (carrito.length === 0) {
      alert('No hay productos en el ticket')
      return
    }

    const altoBase = 120
    const altoPorProducto = carrito.length * 14
    const altoTicket = Math.max(180, altoBase + altoPorProducto)

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, altoTicket],
    })

    let y = 8

    const folio = Date.now().toString().slice(-6)
    const fecha = new Date().toLocaleString('es-MX')

    const logoUrl = 'https://i.postimg.cc/T1KLqYXb/Chat-GPT-Image-4-dic-2025-11-34-20-p-m.png'

    try {
      const logoBase64 = await cargarImagenBase64(logoUrl)
      doc.addImage(logoBase64, 'PNG', 25, y, 30, 30)
      y += 34
    } catch (error) {
      y += 4
    }

    doc.setFontSize(11)
    doc.text('FAST LOOK', 40, y, { align: 'center' })
    y += 5

    doc.setFontSize(8)
    doc.text('Accesorios para moto', 40, y, { align: 'center' })
    y += 7

    doc.setFontSize(8)
    doc.text(`Folio: ${folio}`, 5, y)
    y += 4
    doc.text(`Fecha: ${fecha}`, 5, y)
    y += 4
    doc.text(`Método de pago: ${metodoPago}`, 5, y)
    y += 6

    doc.line(5, y, 75, y)
    y += 5

    carrito.forEach((item) => {
      const nombre = String(item.nombre || '')
      const precio = Number(item.precio || 0)
      const cantidad = Number(item.cantidad || 0)
      const subtotal = precio * cantidad

      doc.setFontSize(8)

      const nombreCortado =
        nombre.length > 28 ? nombre.slice(0, 28) + '...' : nombre

      doc.text(nombreCortado, 5, y)
      y += 4

      doc.text(`${cantidad} x $${precio.toFixed(2)}`, 5, y)
      doc.text(`$${subtotal.toFixed(2)}`, 75, y, { align: 'right' })

      y += 5
    })

    doc.line(5, y, 75, y)
    y += 6

    doc.setFontSize(12)
    doc.text('TOTAL:', 5, y)
    doc.text(`$${totalCarrito.toFixed(2)}`, 75, y, { align: 'right' })
    y += 8

    doc.setFontSize(8)
    doc.text('Gracias por tu compra', 40, y, { align: 'center' })
    y += 4
    doc.text('FAST LOOK', 40, y, { align: 'center' })

    doc.save(`ticket-fastlook-${folio}.pdf`)
  }

  const enviarWhatsApp = () => {
    const texto = encodeURIComponent(
      generarTextoTicket(carrito, metodoPago, totalCarrito)
    )
    window.open(`https://wa.me/?text=${texto}`, '_blank')
  }

  const generarCodigoInventario = async (mensajeRegenerado = false) => {
    if (usuarioRol !== 'Admin') return null
    setGenerandoCodigo(true)
    setEstadoCodigo('idle')
    setMensajeCodigo('Generando código…')
    try {
      const codigo = await generarCodigoProductoDisponible(supabase)
      setForm((actual) => ({ ...actual, codigo }))
      setEstadoCodigo(mensajeRegenerado ? 'regenerado' : 'disponible')
      setMensajeCodigo(mensajeRegenerado ? 'Se generó otro código porque el anterior ya fue ocupado.' : 'Código disponible')
      return codigo
    } catch (error) {
      setEstadoCodigo('error')
      setMensajeCodigo(error instanceof Error ? error.message : 'No fue posible generar el código')
      return null
    } finally {
      setGenerandoCodigo(false)
    }
  }

  const validarCodigoManual = async () => {
    if (generarCodigoAutomatico || !form.codigo.trim()) return
    const codigo = normalizarCodigoProducto(form.codigo)
    setForm((actual) => ({ ...actual, codigo }))
    try {
      const ocupado = await comprobarCodigoProducto(supabase, codigo, form.id || undefined)
      setEstadoCodigo(ocupado ? 'ocupado' : 'disponible')
      setMensajeCodigo(ocupado ? 'Código ocupado' : 'Código disponible')
    } catch (error) {
      setEstadoCodigo('error')
      setMensajeCodigo(error instanceof Error ? error.message : 'No fue posible validar el código')
    }
  }

  const abrirDetallesPorError = () => {
    setDetallesProductoAbiertos(true)
    requestAnimationFrame(() => document.getElementById('detalles-producto-contenido')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const resolverTipoParaGuardar = () => {
    if (form.id && !tipoModificadoManualmente) return tipoOriginalEdicionRef.current
    const seleccionado = normalizarTipoProducto(form.tipo)
    if (!seleccionado) {
      alert('Selecciona un tipo de producto.')
      return null
    }
    if (seleccionado !== 'OTROS') return seleccionado
    const nuevoTipo = normalizarTipoProducto(tipoPersonalizado)
    if (!nuevoTipo) {
      abrirDetallesPorError()
      alert('Especifica el nuevo tipo de producto.')
      return null
    }
    const claveNueva = claveSemanticaTipoProducto(nuevoTipo)
    const tipoExistente = tiposProducto.find((tipo) => tipo !== 'OTROS' && claveSemanticaTipoProducto(tipo) === claveNueva)
    if (tipoExistente) {
      alert(`Ese tipo ya existe como ${tipoExistente}. Selecciónalo en la lista.`)
      return null
    }
    if (!confirm(`Se creará el nuevo tipo “${nuevoTipo}”. ¿Deseas continuar?`)) return null
    return nuevoTipo
  }

  const guardarProducto = async () => {
    if (usuarioRol !== 'Admin') {
      alert('Solo el administrador puede editar inventario')
      return
    }

    let codigoFinal = form.id && form.codigo === codigoOriginalEdicionRef.current
      ? codigoOriginalEdicionRef.current
      : normalizarCodigoProducto(form.codigo)
    if (!form.id && generarCodigoAutomatico && !codigoFinal) {
      codigoFinal = await generarCodigoInventario() || ''
    }
    if (!codigoFinal || !form.nombre || !form.precio) {
      if (!codigoFinal) abrirDetallesPorError()
      alert('Código, nombre y precio son obligatorios')
      return
    }
    const tipoFinal = resolverTipoParaGuardar()
    if (!tipoFinal) return

    const crearDatosProducto = (codigo: string) => ({
      codigo,
      nombre: form.nombre,
      tipo: tipoFinal,
      precio: Number(form.precio),
      costo: Number(form.costo || 0),
      stock: Number(form.stock),
      stock_minimo: Number(form.stock_minimo || 5),
      ubicacion: form.ubicacion,
      proveedor: form.proveedor,
      imagen_url: form.imagen_url,
    })

    if (form.id) {
      const ocupado = await comprobarCodigoProducto(supabase, codigoFinal, form.id)
      if (ocupado) {
        abrirDetallesPorError()
        setEstadoCodigo('ocupado')
        setMensajeCodigo('El código ya existe.')
        return
      }
      const { error } = await supabase
        .from('productos')
        .update(crearDatosProducto(codigoFinal))
        .eq('id', form.id)

      if (error) {
        if (esErrorCodigoDuplicado(error)) {
          abrirDetallesPorError()
          setEstadoCodigo('ocupado')
          setMensajeCodigo('El código ya existe.')
          return
        }
        alert('Error al editar producto: ' + error.message)
        return
      }
    } else if (!generarCodigoAutomatico) {
      const ocupado = await comprobarCodigoProducto(supabase, codigoFinal)
      if (ocupado) {
        abrirDetallesPorError()
        setEstadoCodigo('ocupado')
        setMensajeCodigo('El código ya existe.')
        return
      }
      const { error } = await supabase.from('productos').insert([crearDatosProducto(codigoFinal)])
      if (error) {
        if (esErrorCodigoDuplicado(error)) {
          abrirDetallesPorError()
          setEstadoCodigo('ocupado')
          setMensajeCodigo('El código ya existe.')
          return
        }
        alert('Error al agregar producto: ' + error.message)
        return
      }
    } else {
      let guardado = false
      for (let intento = 0; intento < 5 && !guardado; intento += 1) {
        const ocupado = await comprobarCodigoProducto(supabase, codigoFinal)
        if (ocupado) codigoFinal = await generarCodigoInventario(true) || ''
        if (!codigoFinal) return
        const { error } = await supabase.from('productos').insert([crearDatosProducto(codigoFinal)])
        if (!error) {
          guardado = true
          break
        }
        if (!esErrorCodigoDuplicado(error)) {
          alert('Error al agregar producto: ' + error.message)
          return
        }
        codigoFinal = await generarCodigoInventario(true) || ''
      }
      if (!guardado) {
        abrirDetallesPorError()
        setEstadoCodigo('error')
        setMensajeCodigo('No fue posible guardar después de varios intentos de código.')
        return
      }
    }

    limpiarFormulario()
    fetchProductos()
    alert('Producto guardado')
  }

  const limpiarFormulario = () => {
    const formularioVacio: FormProducto = {
      id: '',
      codigo: '',
      nombre: '',
      tipo: '',
      precio: '',
      costo: '',
      stock: '',
      stock_minimo: '',
      ubicacion: '',
      proveedor: '',
      imagen_url: '',
    }
    setForm(formularioVacio)
    formularioInventarioBaseRef.current = formularioVacio
    setGenerarCodigoAutomatico(true)
    setGenerandoCodigo(false)
    setEstadoCodigo('idle')
    setMensajeCodigo('')
    setTipoPersonalizado('')
    setTipoModificadoManualmente(false)
    tipoOriginalEdicionRef.current = ''
    codigoOriginalEdicionRef.current = ''
    setConfirmarCierreInventario(false)
    setFormularioInventarioAbierto(false)
    setDetallesProductoAbiertos(false)
  }

  const formularioInventarioTieneCambios =
    JSON.stringify(form) !== JSON.stringify(formularioInventarioBaseRef.current)

  const abrirFormularioInventario = async () => {
    if (usuarioRol !== 'Admin') {
      alert('Solo el administrador puede crear productos')
      return
    }
    setGenerarCodigoAutomatico(true)
    setTipoPersonalizado('')
    setTipoModificadoManualmente(false)
    setFormularioInventarioAbierto(true)
    setDetallesProductoAbiertos(false)
    await generarCodigoInventario()
    requestAnimationFrame(() => primerCampoInventarioRef.current?.focus())
  }

  const solicitarCerrarFormularioInventario = () => {
    if (formularioInventarioTieneCambios) {
      setConfirmarCierreInventario(true)
      return
    }
    limpiarFormulario()
  }

  const editarProducto = (p: Producto) => {
    if (usuarioRol !== 'Admin') {
      alert('Solo el administrador puede editar inventario')
      return
    }

    const productoParaEditar: FormProducto = {
      id: p.id,
      codigo: p.codigo || '',
      nombre: p.nombre || '',
      tipo: normalizarTipoProducto(p.tipo || ''),
      precio: p.precio || '',
      costo: p.costo || '',
      stock: p.stock || '',
      stock_minimo: p.stock_minimo || '',
      ubicacion: p.ubicacion || '',
      proveedor: p.proveedor || '',
      imagen_url: p.imagen_url || '',
    }
    formularioInventarioBaseRef.current = productoParaEditar
    tipoOriginalEdicionRef.current = p.tipo || ''
    codigoOriginalEdicionRef.current = p.codigo || ''
    setTipoModificadoManualmente(false)
    setTipoPersonalizado('')
    setGenerarCodigoAutomatico(false)
    setEstadoCodigo('idle')
    setMensajeCodigo('')
    setForm(productoParaEditar)
    setFormularioInventarioAbierto(true)
    setDetallesProductoAbiertos(false)

    setTab('inventario')
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      primerCampoInventarioRef.current?.focus({ preventScroll: true })
    })
  }

  const guardarProveedor = async () => {
    if (!formProveedor.nombre) {
      alert('El nombre del proveedor es obligatorio')
      return
    }

    const proveedor = {
      nombre: formProveedor.nombre,
      telefono: formProveedor.telefono,
      productos: formProveedor.productos,
      tiempo_entrega: formProveedor.tiempo_entrega,
      notas: formProveedor.notas,
    }

    if (formProveedor.id) {
      const { error } = await supabase
        .from('proveedores')
        .update(proveedor)
        .eq('id', formProveedor.id)

      if (error) {
        alert('Error al editar proveedor: ' + error.message)
        return
      }
    } else {
      const { error } = await supabase
        .from('proveedores')
        .insert([proveedor])

      if (error) {
        alert('Error al guardar proveedor: ' + error.message)
        return
      }
    }

    limpiarProveedor()
    fetchProveedores()
    alert('Proveedor guardado')
  }

  const editarProveedor = (p: Proveedor) => {
    setFormProveedor({
      id: p.id,
      nombre: p.nombre || '',
      telefono: p.telefono || '',
      productos: p.productos || '',
      tiempo_entrega: p.tiempo_entrega || '',
      notas: p.notas || '',
    })
  }

  const limpiarProveedor = () => {
    setFormProveedor({
      id: '',
      nombre: '',
      telefono: '',
      productos: '',
      tiempo_entrega: '',
      notas: '',
    })
  }

  const abrirWhatsAppProveedor = (telefono: string, mensaje: string) => {
    if (!telefono) {
      alert('Este proveedor no tiene teléfono registrado')
      return
    }

    const numeroLimpio = telefono.replace(/\D/g, '')
    const texto = encodeURIComponent(mensaje)

    window.open(`https://wa.me/52${numeroLimpio}?text=${texto}`, '_blank')
  }

  const guardarCliente = async () => {
  if (!formCliente.nombre) {
    alert('El nombre del cliente es obligatorio')
    return
  }

  const cliente = {
    nombre: formCliente.nombre,
    numero: formCliente.numero,
    moto: formCliente.moto,
    deuda: Number(formCliente.deuda || 0),
  }

  if (formCliente.id) {
    const { error } = await supabase
      .from('clientes')
      .update(cliente)
      .eq('id', formCliente.id)

    if (error) {
      alert('Error al editar cliente: ' + error.message)
      return
    }
  } else {
    const { error } = await supabase
      .from('clientes')
      .insert([cliente])

    if (error) {
      alert('Error al guardar cliente: ' + error.message)
      return
    }
  }

  limpiarCliente()
  fetchClientes()
  alert('Cliente guardado')
}

const editarCliente = (cliente: Cliente) => {
  setFormCliente({
    id: cliente.id,
    nombre: cliente.nombre || '',
    numero: cliente.numero || '',
    moto: cliente.moto || '',
    deuda: cliente.deuda || '',
  })
}

const limpiarCliente = () => {
  setFormCliente({
    id: '',
    nombre: '',
    numero: '',
    moto: '',
    deuda: '',
  })
}

const registrarAbonoEnCorte = async (cliente: Cliente, monto: number, concepto: string) => {
  const { error } = await supabase.from('ventas').insert([
    {
      producto_id: null,
      codigo: 'ABONO',
      nombre: `${concepto} - ${cliente.nombre}`,
      precio: monto,
      cantidad: 1,
      total: monto,
      metodo_pago: 'Abono',
    },
  ])

  if (error) {
    alert('El movimiento se guardó, pero no se pudo agregar al corte: ' + error.message)
  }
}

const registrarMovimientoCliente = async (
  cliente: Cliente,
  tipo: string,
  monto: number,
  nota: string
) => {
  if (monto <= 0) {
    alert('El monto debe ser mayor a 0')
    return
  }

  let nuevaDeuda = Number(cliente.deuda || 0)

  if (tipo === 'DEUDA') {
    nuevaDeuda += monto
  }

  if (tipo === 'ABONO') {
    nuevaDeuda -= monto
    if (nuevaDeuda < 0) nuevaDeuda = 0
  }

  if (tipo === 'LIQUIDACION') {
    nuevaDeuda = 0
  }

  const { error: errorMovimiento } = await supabase
    .from('movimientos_clientes')
    .insert([
      {
        cliente_id: cliente.id,
        tipo,
        monto,
        nota,
      },
    ])

  if (errorMovimiento) {
    alert('Error al registrar movimiento: ' + errorMovimiento.message)
    return
  }

  const { error: errorCliente } = await supabase
    .from('clientes')
    .update({ deuda: nuevaDeuda })
    .eq('id', cliente.id)

  if (errorCliente) {
    alert('Error al actualizar deuda: ' + errorCliente.message)
    return
  }

  if (tipo === 'ABONO' || tipo === 'LIQUIDACION') {
    await registrarAbonoEnCorte(cliente, monto, tipo === 'ABONO' ? 'ABONO' : 'LIQUIDACIÓN')
  }

  setMontoCliente('')
  setNotaCliente('')
  fetchClientes()
  fetchMovimientosClientes()
  fetchVentas()

  alert('Movimiento registrado')
}

const abonarCliente = async (cliente: Cliente) => {
  const monto = Number(prompt('¿Cuánto abonó el cliente?'))

  if (isNaN(monto) || monto <= 0) {
    alert('Monto inválido')
    return
  }

  await registrarMovimientoCliente(cliente, 'ABONO', monto, 'Abono a deuda')
}

const liquidarCliente = async (cliente: Cliente) => {
  const deudaActual = Number(cliente.deuda || 0)

  if (deudaActual <= 0) {
    alert('Este cliente no tiene deuda pendiente')
    return
  }

  if (!confirm(`¿Liquidar deuda total de $${deudaActual}?`)) {
    return
  }

  await registrarMovimientoCliente(cliente, 'LIQUIDACION', deudaActual, 'Liquidación total')
}

const agregarDeudaCliente = async (cliente: Cliente) => {
  const monto = Number(prompt('¿Cuánta deuda quieres añadir?'))

  if (isNaN(monto) || monto <= 0) {
    alert('Monto inválido')
    return
  }

  const nota = prompt('Nota de la deuda') || 'Nueva deuda'

  await registrarMovimientoCliente(cliente, 'DEUDA', monto, nota)
}

const eliminarClienteSinRegistro = async (cliente: Cliente) => {
  if (!confirm(`¿Eliminar a ${cliente.nombre} sin conservar registro?`)) {
    return
  }

  const { error } = await supabase
    .from('clientes')
    .delete()
    .eq('id', cliente.id)

  if (error) {
    alert('Error al eliminar cliente: ' + error.message)
    return
  }

  fetchClientes()
  fetchMovimientosClientes()
  alert('Cliente eliminado')
}

const abrirWhatsAppCliente = (cliente: Cliente) => {
  if (!cliente.numero) {
    alert('Este cliente no tiene número registrado')
    return
  }

  const numeroLimpio = cliente.numero.replace(/\D/g, '')

  const mensaje = encodeURIComponent(
    `Hola ${cliente.nombre}, te recordamos que tienes una deuda pendiente de $${Number(cliente.deuda || 0)} en Fast Look.`
  )

  window.open(`https://wa.me/52${numeroLimpio}?text=${mensaje}`, '_blank')
}

  const productosParaComprar = productos.filter((p) => {
    return Number(p.stock) <= Number(p.stock_minimo || 5)
  })

  const comprasPorProveedor = productosParaComprar.reduce((acc: any, p) => {
    const proveedor = p.proveedor || 'Sin proveedor'

    if (!acc[proveedor]) {
      acc[proveedor] = []
    }

    acc[proveedor].push(p)

    return acc
  }, {})

  const comprasPorProveedorConCantidad = Object.keys(comprasPorProveedor).reduce(
    (acc: Record<string, ProductoCompra[]>, proveedor) => {
      acc[proveedor] = comprasPorProveedor[proveedor].map((p: Producto) => {
        const stockActual = Number(p.stock || 0)
        const stockMinimo = Number(p.stock_minimo || 5)
        const cantidadSugerida = Math.max(
          stockMinimo * 2 - stockActual,
          cantidadCompra
        )

        return {
          producto: p,
          stockActual,
          stockMinimo,
          cantidadSugerida,
        }
      })

      return acc
    },
    {}
  )

  const generarMensajeCompra = (proveedor: string, productosProveedor: any[]) => {
    let mensaje = `Hola, necesito cotizar/resurtir estos productos para Fast Look:\n\n`

    productosProveedor.forEach((p) => {
      const stockMinimo = Number(p.stock_minimo || 5)
      const stockActual = Number(p.stock || 0)
      const cantidadSugerida = Math.max(stockMinimo * 2 - stockActual, cantidadCompra)

      mensaje += `- ${p.nombre}\n`
      mensaje += `  Código: ${p.codigo}\n`
      mensaje += `  Stock actual: ${stockActual}\n`
      mensaje += `  Cantidad sugerida: ${cantidadSugerida}\n\n`
    })

    mensaje += `Quedo atento a precio y disponibilidad.`

    return mensaje
  }

  const enviarPedidoProveedor = (proveedor: string) => {
    const proveedorData = proveedores.find(
      (p) => p.nombre?.toLowerCase() === proveedor.toLowerCase()
    )

    abrirWhatsAppProveedor(
      proveedorData?.telefono || '',
      generarMensajeCompra(proveedor, comprasPorProveedor[proveedor])
    )
  }



  const iniciarSesion = async () => {
    if (!correoAcceso.trim() || !passwordAcceso) {
      setErrorAcceso('Ingresa tu correo y contraseña.')
      return
    }
    setCargandoAcceso(true)
    setErrorAcceso('')
    const { error } = await supabase.auth.signInWithPassword({
      email: correoAcceso.trim(),
      password: passwordAcceso,
    })
    if (error) {
      setErrorAcceso('Correo o contraseña incorrectos.')
      setCargandoAcceso(false)
      return
    }
    setPasswordAcceso('')
    setCargandoAcceso(false)
  }

  const cerrarSistema = async () => {
    setCargandoAcceso(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      setErrorAcceso('No fue posible cerrar la sesión.')
      setCargandoAcceso(false)
      return
    }
    setPerfilUsuario(null)
    setUsuarioRol(null)
    setCortes([])
    setAvisoCorte('')
    setPasswordAcceso('')
    setTab('precios')
    setCargandoAcceso(false)
  }
  if (!appLista || verificandoSesion) {
    return <PantallaCarga styles={styles} />
  }

  if (!perfilUsuario || !usuarioRol) {
    return (
      <PantallaAcceso
        correo={correoAcceso}
        password={passwordAcceso}
        error={errorAcceso}
        cargando={cargandoAcceso}
        onCambiarCorreo={setCorreoAcceso}
        onCambiarPassword={setPasswordAcceso}
        onIniciarSesion={iniciarSesion}
        styles={styles}
      />
    )
  }

  return (
    <Navegacion
      tab={tab}
      usuarioRol={usuarioRol}
      usuarioNombre={perfilUsuario.nombre}
      usuarioCorreo={perfilUsuario.correo}
      onCambiarTab={(nuevaTab) => {
        if (nuevaTab === 'corte' && !puedeAccederCorteCaja(perfilUsuario.correo)) {
          setAvisoCorte('No tienes permiso para acceder a Corte de caja.')
          setTab('precios')
          return
        }
        setAvisoCorte('')
        setTab(nuevaTab)
      }}
      onCerrarSistema={cerrarSistema}
    >
      <main style={styles.main}>
        {avisoCorte && <div style={styles.alert} role="alert">{avisoCorte}</div>}
        
        
        {tab === 'precios' && (
          <ListaPrecios
            busqueda={busqueda}
            productosFiltrados={productosFiltrados}
            onCambiarBusqueda={setBusqueda}
            styles={styles}
          />
        )}

{tab === 'venta' && (
  <>
    <h2>Generar venta</h2>

    <input
      style={styles.input}
      placeholder="Buscar producto para vender..."
      value={busqueda}
      onChange={(e) => setBusqueda(e.target.value)}
    />

    <h3>Productos</h3>

    {productosFiltrados.map((p) => (
      <div key={p.id} style={styles.card}>
        {p.imagen_url && (
          <img src={p.imagen_url} alt={p.nombre} style={styles.image} />
        )}

        <h3>{p.nombre}</h3>
        <p><b>Precio:</b> ${p.precio}</p>
        <p><b>Stock:</b> {p.stock}</p>

        <button
          style={styles.redButton}
          onClick={() => {
            agregarAlCarrito(p)
            setCarritoAbierto(true)
          }}
        >
          Añadir al ticket
        </button>
      </div>
    ))}

    <button
      style={styles.botonCarritoFlotante}
      onClick={() => setCarritoAbierto(true)}
    >
      🛒
      {carrito.length > 0 && (
        <span style={styles.contadorCarrito}>{carrito.length}</span>
      )}
    </button>

    {carritoAbierto && (
      <div style={styles.fondoCarrito}>
        <div style={styles.carritoMovil}>
          <button
            style={styles.cerrarCarrito}
            onClick={() => setCarritoAbierto(false)}
          >
            ×
          </button>

          <h2>Ticket actual</h2>

          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
            style={styles.input}
          >
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Tarjeta">Tarjeta</option>
          </select>

          {carrito.length === 0 && (
            <div style={styles.alert}>Aún no hay productos en el ticket.</div>
          )}

          {carrito.map((item) => (
            <div key={item.id} style={styles.ticketItem}>
              <p><b>{item.nombre}</b></p>
              <p>Precio: ${item.precio}</p>

              <div style={styles.qtyRow}>
                <button
                  style={styles.qtyBtn}
                  onClick={() => disminuirCantidad(item.id)}
                >
                  -
                </button>

                <input
                  type="number"
                  value={item.cantidad}
                  onChange={(e) => cambiarCantidad(item.id, Number(e.target.value))}
                  style={styles.qtyInput}
                />

                <button
                  style={styles.qtyBtn}
                  onClick={() => aumentarCantidad(item.id)}
                >
                  +
                </button>
              </div>

              <p>Subtotal: ${Number(item.precio) * item.cantidad}</p>

              <button
                style={styles.blackButton}
                onClick={() => eliminarDelCarrito(item.id)}
              >
                Eliminar
              </button>
            </div>
          ))}

          <div style={styles.ticketBox}>
            <h2>Total: ${totalCarrito}</h2>

            {usuarioRol === 'Admin' && (
              <p>Ganancia estimada: ${gananciaCarrito}</p>
            )}

            <p>Método de pago: {metodoPago}</p>
          </div>

          <button style={styles.bigButton} onClick={finalizarVenta}>
            Finalizar venta
          </button>

          <button style={styles.blackButton} onClick={descargarTicket}>
            Descargar ticket
          </button>

          <button style={styles.redButton} onClick={enviarWhatsApp}>
            Enviar por WhatsApp
          </button>

          <button style={styles.grayButton} onClick={cancelarTicket}>
            Cancelar ticket
          </button>
        </div>
      </div>
    )}
  </>
)}

        {tab === 'inventario' && (
          <>
            <div ref={formRef} className="fl-inventory-form-card" tabIndex={-1}>
              <div className="fl-inventory-form-header">
                <button
                  type="button"
                  className="fl-inventory-form-toggle"
                  onClick={() => formularioInventarioAbierto ? solicitarCerrarFormularioInventario() : abrirFormularioInventario()}
                  aria-expanded={formularioInventarioAbierto}
                  aria-controls="formulario-inventario-contenido"
                >
                  <span>
                    <strong>Agregar o editar producto</strong>
                    <small>{form.id ? 'Editando producto' : formularioInventarioAbierto ? 'Completa los datos del producto' : 'Formulario minimizado'}</small>
                  </span>
                  {formularioInventarioAbierto
                    ? <ChevronUp size={22} aria-hidden="true" />
                    : <ChevronDown size={22} aria-hidden="true" />}
                </button>
                {!formularioInventarioAbierto && (
                  <button type="button" className="fl-inventory-new-button" onClick={abrirFormularioInventario}>
                    <Plus size={18} aria-hidden="true" />
                    Nuevo producto
                  </button>
                )}
              </div>

              {formularioInventarioAbierto && (
                <div id="formulario-inventario-contenido" className="fl-inventory-form-content">
                  <h2>{form.id ? 'Editar producto' : 'Nuevo producto'}</h2>

              {usuarioRol !== 'Admin' && (
                <div style={styles.alert}>Estás en modo vendedor. No puedes editar inventario.</div>
              )}

            <div className="fl-product-code-summary"><Hash size={16} aria-hidden="true" /><span>Código: <strong>{form.codigo || (generandoCodigo ? 'Generando…' : 'Pendiente')}</strong></span>{mensajeCodigo && <small className={`is-${estadoCodigo}`}>{mensajeCodigo}</small>}</div>
            <div className="fl-product-main-grid">
              <label><span>Nombre</span><input ref={primerCampoInventarioRef} style={styles.input} placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
              <label><span>Tipo de producto</span><select style={styles.input} value={form.tipo} onChange={(e) => { setForm({ ...form, tipo: e.target.value }); setTipoModificadoManualmente(true); if (e.target.value !== 'OTROS') setTipoPersonalizado('') }}><option value="">Selecciona un tipo</option>{tiposProducto.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></label>
              <label><span>Precio de venta</span><input style={styles.input} placeholder="Precio de venta" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} /></label>
              <label><span>Stock</span><input style={styles.input} placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label>
              <div className="fl-product-photo-field"><span>Foto</span><SelectorImagen imagenUrl={form.imagen_url} deshabilitado={subiendoImagen} onSeleccionar={subirImagenProducto} onEliminar={() => setForm((actual) => ({ ...actual, imagen_url: '' }))} />{notificacionImagen && <div className={`fl-image-notice is-${notificacionImagen.tipo}`} role="status">{notificacionImagen.mensaje}</div>}</div>
            </div>

            <section className={`fl-product-details ${detallesProductoAbiertos ? 'is-open' : ''}`}>
              <button type="button" className="fl-product-details-toggle" aria-expanded={detallesProductoAbiertos} aria-controls="detalles-producto-contenido" onClick={() => setDetallesProductoAbiertos((abiertos) => !abiertos)}><span>Detalles</span>{detallesProductoAbiertos ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}</button>
              {detallesProductoAbiertos && <div id="detalles-producto-contenido" className="fl-product-details-content">
                <section className="fl-product-code-box">
                  <div className="fl-product-code-heading"><span><Hash size={19} aria-hidden="true" /><strong>Código del producto</strong></span><label><input type="checkbox" role="switch" aria-label="Generar código automáticamente" checked={!form.id && generarCodigoAutomatico} disabled={Boolean(form.id)} onChange={(e) => { const activo = e.target.checked; setGenerarCodigoAutomatico(activo); setEstadoCodigo('idle'); setMensajeCodigo(''); if (activo) void generarCodigoInventario() }} />Generar automáticamente</label></div>
                  <input style={styles.input} placeholder="Código" value={form.codigo} disabled={!form.id && generarCodigoAutomatico} onChange={(e) => { setForm({ ...form, codigo: e.target.value.toUpperCase() }); setEstadoCodigo('idle'); setMensajeCodigo('') }} onBlur={() => void validarCodigoManual()} />
                  {!generarCodigoAutomatico && !form.id && <small className="fl-product-code-help">Puedes utilizar un código propio o del proveedor.</small>}
                  {form.id && <small className="fl-product-code-warning"><AlertTriangle size={15} aria-hidden="true" />Cambiar el código puede afectar búsquedas e historial.</small>}
                  {generarCodigoAutomatico && !form.id && <button type="button" className="fl-product-code-regenerate" onClick={() => void generarCodigoInventario()} disabled={generandoCodigo}><RefreshCw size={16} aria-hidden="true" />{generandoCodigo ? 'Generando código…' : 'Regenerar'}</button>}
                  {mensajeCodigo && <p className={`fl-product-code-status is-${estadoCodigo}`} role="status">{estadoCodigo === 'disponible' || estadoCodigo === 'regenerado' ? <CheckCircle size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}{mensajeCodigo}</p>}
                </section>
                {form.tipo === 'OTROS' && <label><span>Nuevo tipo</span><input style={styles.input} value={tipoPersonalizado} onChange={(e) => setTipoPersonalizado(e.target.value.toLocaleUpperCase('es-MX'))} placeholder="Nuevo tipo de producto" /></label>}
                <label><span>Costo / precio de compra</span><input style={styles.input} placeholder="Costo / precio de compra" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} /></label>
                <label><span>Stock mínimo</span><input style={styles.input} placeholder="Stock mínimo" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} /></label>
                <label><span>Ubicación</span><input style={styles.input} placeholder="Ubicación" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} /></label>
                <label><span>Proveedor</span><input style={styles.input} placeholder="Proveedor" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></label>
                <label className="is-wide"><span>URL de imagen</span><input style={styles.input} placeholder="URL de imagen" value={form.imagen_url} onChange={(e) => setForm({ ...form, imagen_url: e.target.value })} /></label>
              </div>}
            </section>

            <button style={styles.bigButton} onClick={guardarProducto}>
              {form.id ? 'Guardar cambios' : 'Agregar producto'}
            </button>

              <button style={styles.grayButton} onClick={limpiarFormulario}>
                Cancelar
              </button>
                </div>
              )}
            </div>

            {confirmarCierreInventario && (
              <div className="fl-confirm-backdrop" role="presentation">
                <section className="fl-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="titulo-cierre-inventario" aria-describedby="mensaje-cierre-inventario">
                  <h2 id="titulo-cierre-inventario">Cambios sin guardar</h2>
                  <p id="mensaje-cierre-inventario">Hay cambios sin guardar. ¿Deseas cerrar el formulario?</p>
                  <div className="fl-confirm-actions">
                    <button type="button" className="fl-confirm-danger" onClick={limpiarFormulario}>Cerrar sin guardar</button>
                    <button type="button" className="fl-confirm-secondary" onClick={() => setConfirmarCierreInventario(false)}>Continuar editando</button>
                  </div>
                </section>
              </div>
            )}

                        <h3>Productos registrados</h3>

            <input
            style={styles.input}
            placeholder="Buscar en inventario por nombre, código, tipo, ubicación o proveedor..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            />

            <p>
            Mostrando <b>{productosFiltrados.length}</b> de <b>{productos.length}</b> productos
            </p>

            {productosFiltrados.map((p) => (
            <div key={p.id} style={styles.card}>
                {p.imagen_url && <img src={p.imagen_url} alt={p.nombre} style={styles.image} />}
                <h3>{p.nombre}</h3>
                <p><b>Código:</b> {p.codigo}</p>
                <p><b>Precio:</b> ${p.precio}</p>
                {usuarioRol === 'Admin' && (
                <p><b>Costo:</b> ${p.costo || 0}</p>
                )}
                <p><b>Stock:</b> {p.stock}</p>
                <p><b>Stock mínimo:</b> {p.stock_minimo || 5}</p>

                <button style={styles.redButton} onClick={() => editarProducto(p)}>
                Editar
                </button>

                <button
                style={styles.blackButton}
                onClick={() => {
                    const cantidad = Number(prompt('¿Cuántas piezas entraron?'))
                    if (!isNaN(cantidad)) entradaStock(p, cantidad)
                }}
                >
                Entrada de stock
                </button>

                <button
                style={styles.grayButton}
                onClick={() => {
                    const nuevoStock = Number(prompt('Nuevo stock total'))
                    if (!isNaN(nuevoStock)) ajustarStock(p, nuevoStock)
                }}
                >
                Ajustar stock
                </button>
            </div>
            ))}
          </>
        )}

        {tab === 'corte' && puedeAccederCorteCaja(perfilUsuario.correo) && (
          <CorteCajaDashboard
            ventas={ventas}
            productos={productos}
            cortes={cortes}
            onActualizar={async () => {
              await Promise.all([fetchVentas(true), fetchProductos(true), fetchCortes(true)])
            }}
          />
        )}
        {tab === 'corte' && !puedeAccederCorteCaja(perfilUsuario.correo) && (
          <div style={styles.alert} role="alert">No tienes permiso para acceder a Corte de caja.</div>
        )}

        {tab === 'stock' && (
          <StockBajo
            productosBajoStock={productosBajoStock}
            styles={styles}
          />
        )}

        {tab === 'cascos' && (
          <CatalogoCascos
            productos={productos}
            rol={usuarioRol}
            error={errorProductos}
            onReintentar={async () => { await fetchProductos(true) }}
            onProductoActualizado={(producto) => setProductos((actuales) => actuales.some((item) => item.id === producto.id) ? actuales.map((item) => item.id === producto.id ? producto : item) : [...actuales, producto])}
            onProductoEliminado={(productoId) => setProductos((actuales) => actuales.filter((producto) => producto.id !== productoId))}
            onVender={(producto) => agregarAlCarrito(producto, false)}
            onIrAVenta={() => setTab('venta')}
          />
        )}

        {tab === 'ia' && (
          <AsistenteInventario
            usuarioRol={usuarioRol}
            onInventarioActualizado={async () => {
              await Promise.all([fetchProductos(), fetchMovimientos()])
            }}
          />
        )}

        {tab === 'clientes' && (
          <Clientes
            clientesFiltrados={clientesFiltrados}
            clientes={clientes}
            movimientosClientes={movimientosClientes}
            busquedaClientes={busquedaClientes}
            formCliente={formCliente}
            guardarCliente={guardarCliente}
            limpiarCliente={limpiarCliente}
            agregarDeudaCliente={agregarDeudaCliente}
            abonarCliente={abonarCliente}
            liquidarCliente={liquidarCliente}
            abrirWhatsAppCliente={abrirWhatsAppCliente}
            editarCliente={editarCliente}
            eliminarClienteSinRegistro={eliminarClienteSinRegistro}
            setBusquedaClientes={setBusquedaClientes}
            setFormCliente={setFormCliente}
            obtenerFechaLocal={obtenerFechaLocal}
            styles={styles}
          />
)}

        {tab === 'proveedores' && (
          <Proveedores
            formProveedor={formProveedor}
            setFormProveedor={setFormProveedor}
            proveedores={proveedores}
            guardarProveedor={guardarProveedor}
            limpiarProveedor={limpiarProveedor}
            editarProveedor={editarProveedor}
            abrirWhatsAppProveedor={abrirWhatsAppProveedor}
            styles={styles}
          />
        )}

        {tab === 'compras' && (
          <ListaCompras
            cantidadCompra={cantidadCompra}
            setCantidadCompra={setCantidadCompra}
            comprasPorProveedor={comprasPorProveedorConCantidad}
            enviarPedidoProveedor={enviarPedidoProveedor}
            styles={styles}
          />
        )}

        {tab === 'movimientos' && (
          <Movimientos
            movimientos={movimientos}
            obtenerFechaLocal={obtenerFechaLocal}
            styles={styles}
          />
        )}

        {tab === 'dashboard' && <Dashboard />}
        {tab === 'usuarios' && <GestionUsuarios />}
      </main>
      <LoadingOverlay
        visible={subiendoImagen}
        titulo={faseImagen}
        detalle="Estamos optimizando y guardando la fotografía del producto."
      />
    </Navegacion>
  )
}

const styles: any = {
  page: { minHeight: '100vh', backgroundColor: '#ffffff', color: '#111', fontFamily: 'Arial' },
  header: { backgroundColor: '#000', color: '#fff', padding: 20, borderBottom: '5px solid #c40000' },
  logo: { margin: 0, color: '#fff', letterSpacing: 2 },
  subtitle: { margin: 0, color: '#ddd' },
  roleSelect: { marginTop: 10, padding: 8, borderRadius: 6 },
  nav: { display: 'flex', overflowX: 'auto', gap: 8, padding: 10, backgroundColor: '#111' },
  navBtn: { backgroundColor: '#fff', color: '#000', border: '1px solid #c40000', padding: '10px 14px', borderRadius: 6, whiteSpace: 'nowrap' },
  activeBtn: { backgroundColor: '#c40000', color: '#fff', border: '1px solid #c40000', padding: '10px 14px', borderRadius: 6, whiteSpace: 'nowrap' },
  main: { padding: 16, maxWidth: 1200, margin: '0 auto' },
  input: { width: '100%', padding: 12, marginBottom: 12, border: '1px solid #999', borderRadius: 6, fontSize: 16 },
  card: { border: '1px solid #111', borderLeft: '6px solid #c40000', borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: '#fff' },
  redButton: { backgroundColor: '#c40000', color: '#fff', border: 'none', borderRadius: 6, padding: 10, width: '100%', cursor: 'pointer', marginBottom: 8 },
  blackButton: { backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: 6, padding: 10, width: '100%', cursor: 'pointer', marginBottom: 8 },
  grayButton: { backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: 6, padding: 10, width: '100%', cursor: 'pointer', marginBottom: 8 },
  bigButton: { backgroundColor: '#c40000', color: '#fff', border: 'none', borderRadius: 8, padding: 14, width: '100%', fontSize: 17, fontWeight: 'bold', cursor: 'pointer', marginBottom: 8 },
  ticketItem: { backgroundColor: '#f4f4f4', border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 10 },
  ticketBox: { backgroundColor: '#111', color: '#fff', padding: 15, borderRadius: 8, marginBottom: 10 },
  qtyRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 },
  qtyBtn: { width: 40, height: 40, backgroundColor: '#c40000', color: '#fff', border: 'none', borderRadius: 6, fontSize: 20 },
  qtyInput: { width: 80, padding: 10, textAlign: 'center' },
  image: { width: '100%', maxHeight: 180, objectFit: 'contain', marginBottom: 10, borderRadius: 8, backgroundColor: '#f1f1f1' },
  alert: { backgroundColor: '#ffe5e5', border: '1px solid #c40000', color: '#900', padding: 12, borderRadius: 8, marginBottom: 12 },

  loginPage: {
    minHeight: '100vh',
    backgroundColor: '#111',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  loginBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    borderTop: '6px solid #c40000',
  },

  logoLogin: {
    margin: 0,
    color: '#c40000',
    letterSpacing: 2,
    textAlign: 'center',
  },

  loginSubtitle: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#555',
  },

  userBox: {
    marginTop: 10,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  userText: {
    margin: 0,
    color: '#fff',
  },

  logoutButton: {
    backgroundColor: '#c40000',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 12px',
    cursor: 'pointer',
  },


  loadingPage: {
    minHeight: '100vh',
    backgroundColor: '#111',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  loadingLogo: {
    width: 120,
    height: 120,
    objectFit: 'contain',
    borderRadius: '50%',
    animation: 'girarLogo 1.4s linear infinite',
    marginBottom: 18,
  },

  loadingTitle: {
    color: '#fff',
    letterSpacing: 2,
    margin: 0,
  },

  loadingText: {
    color: '#ccc',
    marginTop: 8,
  },
  ventaLayout: {
  display: 'grid',
  gridTemplateColumns: '1fr 360px',
  gap: 16,
  alignItems: 'start',
},

productosVenta: {
  minWidth: 0,
},

ticketFijo: {
  position: 'sticky',
  top: 12,
  backgroundColor: '#fff',
  border: '2px solid #111',
  borderTop: '6px solid #c40000',
  borderRadius: 10,
  padding: 14,
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
},

listaTicket: {
  maxHeight: 300,
  overflowY: 'auto',
  marginBottom: 10,
},
'@media (max-width: 800px)': {
  ventaLayout: {
    gridTemplateColumns: '1fr',
  },
},
botonCarritoFlotante: {
  position: 'fixed',
  right: 18,
  bottom: 18,
  width: 58,
  height: 58,
  borderRadius: '50%',
  border: 'none',
  backgroundColor: '#111',
  color: '#fff',
  fontSize: 26,
  cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
  zIndex: 999,
},

contadorCarrito: {
  position: 'absolute',
  top: -4,
  right: -4,
  backgroundColor: '#c40000',
  color: '#fff',
  borderRadius: '50%',
  width: 22,
  height: 22,
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
},

fondoCarrito: {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.45)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'flex-end',
},

carritoMovil: {
  width: 'min(420px, 92vw)',
  height: '100vh',
  backgroundColor: '#fff',
  padding: 16,
  overflowY: 'auto',
  boxShadow: '-8px 0 24px rgba(0,0,0,0.25)',
  position: 'relative',
},

cerrarCarrito: {
  position: 'absolute',
  top: 10,
  right: 12,
  border: 'none',
  backgroundColor: '#c40000',
  color: '#fff',
  borderRadius: '50%',
  width: 34,
  height: 34,
  fontSize: 22,
  cursor: 'pointer',
},
deudaBox: {
  backgroundColor: '#ffe5e5',
  border: '1px solid #c40000',
  color: '#900',
  padding: 12,
  borderRadius: 8,
  marginBottom: 12,
},

sinDeudaBox: {
  backgroundColor: '#e9ffe5',
  border: '1px solid #198754',
  color: '#146c43',
  padding: 12,
  borderRadius: 8,
  marginBottom: 12,
},
}
