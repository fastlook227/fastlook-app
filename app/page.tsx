'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [tab, setTab] = useState('precios')
  const [productos, setProductos] = useState<any[]>([])
  const [ventas, setVentas] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState<any[]>([])
  const [metodoPago, setMetodoPago] = useState('Efectivo')
  const [usuarioRol, setUsuarioRol] = useState('Vendedor')
  const [appLista, setAppLista] = useState(false)
  const [sistemaActivo, setSistemaActivo] = useState(false)
  const [mostrarPasswordAdmin, setMostrarPasswordAdmin] = useState(false)
  const [passwordAdmin, setPasswordAdmin] = useState('')
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [proveedores, setProveedores] = useState<any[]>([])
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [cortes, setCortes] = useState<any[]>([])
  const [cantidadCompra, setCantidadCompra] = useState(1)
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')

  const [formProveedor, setFormProveedor] = useState({
    id: '',
    nombre: '',
    telefono: '',
    productos: '',
    tiempo_entrega: '',
    notas: '',
  })

  const [form, setForm] = useState({
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

  useEffect(() => {
    fetchProductos()
    fetchVentas()
    fetchProveedores()
    fetchMovimientos()
    fetchCortes()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppLista(true)
    }, 1500)

    return () => clearTimeout(timer)
  }, [])

  const fetchProductos = async () => {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre', { ascending: true })

    if (error) {
      alert('Error al cargar productos: ' + error.message)
      return
    }

    setProductos(data || [])
  }

  const fetchVentas = async () => {
    const { data, error } = await supabase
      .from('ventas')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
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


  const fetchCortes = async () => {
    const { data, error } = await supabase
      .from('cortes_caja')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      alert('Error al cargar cortes: ' + error.message)
      return
    }

    setCortes(data || [])
  }

  useEffect(() => {
    const verificarCambioDia = async () => {
      const ayerDate = new Date()
      ayerDate.setDate(ayerDate.getDate() - 1)
      const ayer = obtenerFechaLocal(ayerDate)

      const { data, error } = await supabase
        .from('cortes_caja')
        .select('*')
        .eq('fecha_inicio', ayer)
        .eq('fecha_fin', ayer)

      if (error) {
        alert('Error al verificar corte automático: ' + error.message)
        return
      }

      if (data && data.length > 0) {
        return
      }

      const ventasAyer = ventas.filter((v) => {
        return obtenerFechaLocal(v.created_at) === ayer
      })

      const resumenAyer = calcularResumenVentas(ventasAyer)

      const { error: errorCorte } = await supabase.from('cortes_caja').insert([
        {
          fecha_inicio: ayer,
          fecha_fin: ayer,
          total: resumenAyer.total,
          ganancia: resumenAyer.ganancia,
          efectivo: resumenAyer.metodos.Efectivo || 0,
          transferencia: resumenAyer.metodos.Transferencia || 0,
          tarjeta: resumenAyer.metodos.Tarjeta || 0,
        },
      ])

      if (errorCorte) {
        alert('Error al guardar corte automático: ' + errorCorte.message)
        return
      }

      fetchCortes()
    }

    if (ventas.length > 0 && productos.length > 0) {
      verificarCambioDia()
    }
  }, [ventas, productos])

  useEffect(() => {
    const tabsAdmin = ['inventario', 'corte', 'proveedores', 'compras', 'movimientos', 'dashboard']

    if (usuarioRol !== 'Admin' && tabsAdmin.includes(tab)) {
      setTab('precios')
    }
  }, [usuarioRol, tab])

  const subirImagenProducto = async (file: File) => {
    if (!file) return

    setSubiendoImagen(true)

    const extension = file.name.split('.').pop()
    const nombreLimpio = form.codigo || 'producto'
    const nombreArchivo = `${nombreLimpio}-${Date.now()}.${extension}`

    const { error } = await supabase.storage
      .from('productos')
      .upload(nombreArchivo, file)

    if (error) {
      setSubiendoImagen(false)
      alert('Error al subir imagen: ' + error.message)
      return
    }

    const { data } = supabase.storage
      .from('productos')
      .getPublicUrl(nombreArchivo)

    setForm((prev) => ({
      ...prev,
      imagen_url: data.publicUrl,
    }))

    setSubiendoImagen(false)
    alert('Imagen subida correctamente')
  }

  const productosFiltrados = productos.filter((p) => {
    const texto = busqueda.toLowerCase()
    return (
      p.nombre?.toLowerCase().includes(texto) ||
      p.codigo?.toLowerCase().includes(texto) ||
      p.tipo?.toLowerCase().includes(texto) ||
      p.ubicacion?.toLowerCase().includes(texto) ||
      p.proveedor?.toLowerCase().includes(texto)
    )
  })

  const productosBajoStock = productos.filter(
    (p) => Number(p.stock) <= Number(p.stock_minimo || 5)
  )

  const productosSinGanancia = productos.filter(
    (p) => Number(p.precio || 0) <= Number(p.costo || 0)
  )

  const agregarAlCarrito = (producto: any) => {
    if (producto.stock <= 0) {
      alert('Sin stock disponible')
      return
    }

    const existe = carrito.find((item) => item.id === producto.id)

    if (existe) {
      if (existe.cantidad + 1 > producto.stock) {
        alert('No hay más stock disponible')
        return
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
    producto: any,
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

  const entradaStock = async (producto: any, cantidad: number) => {
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

  const ajustarStock = async (producto: any, nuevoStock: number) => {
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

  const generarTextoTicket = () => {
    let texto = 'FAST LOOK\n'
    texto += 'Ticket de venta\n\n'

    carrito.forEach((item) => {
      texto += `${item.nombre}\n`
      texto += `Cantidad: ${item.cantidad}\n`
      texto += `Precio: $${item.precio}\n`
      texto += `Subtotal: $${Number(item.precio) * item.cantidad}\n\n`
    })

    texto += `Método de pago: ${metodoPago}\n`
    texto += `TOTAL: $${totalCarrito}\n`

    return texto
  }

  const descargarTicket = () => {
    const texto = generarTextoTicket()
    const blob = new Blob([texto], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `ticket-fast-look-${Date.now()}.txt`
    a.click()

    URL.revokeObjectURL(url)
  }

  const enviarWhatsApp = () => {
    const texto = encodeURIComponent(generarTextoTicket())
    window.open(`https://wa.me/?text=${texto}`, '_blank')
  }

  const guardarProducto = async () => {
    if (usuarioRol !== 'Admin') {
      alert('Solo el administrador puede editar inventario')
      return
    }

    if (!form.codigo || !form.nombre || !form.precio) {
      alert('Código, nombre y precio son obligatorios')
      return
    }

    const producto = {
      codigo: form.codigo,
      nombre: form.nombre,
      tipo: form.tipo,
      precio: Number(form.precio),
      costo: Number(form.costo || 0),
      stock: Number(form.stock),
      stock_minimo: Number(form.stock_minimo || 5),
      ubicacion: form.ubicacion,
      proveedor: form.proveedor,
      imagen_url: form.imagen_url,
    }

    if (form.id) {
      const { error } = await supabase
        .from('productos')
        .update(producto)
        .eq('id', form.id)

      if (error) {
        alert('Error al editar producto: ' + error.message)
        return
      }
    } else {
      const { error } = await supabase.from('productos').insert([producto])

      if (error) {
        alert('Error al agregar producto: ' + error.message)
        return
      }
    }

    limpiarFormulario()
    fetchProductos()
    alert('Producto guardado')
  }

  const limpiarFormulario = () => {
    setForm({
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
  }

  const editarProducto = (p: any) => {
    if (usuarioRol !== 'Admin') {
      alert('Solo el administrador puede editar inventario')
      return
    }

    setForm({
      id: p.id,
      codigo: p.codigo || '',
      nombre: p.nombre || '',
      tipo: p.tipo || '',
      precio: p.precio || '',
      costo: p.costo || '',
      stock: p.stock || '',
      stock_minimo: p.stock_minimo || '',
      ubicacion: p.ubicacion || '',
      proveedor: p.proveedor || '',
      imagen_url: p.imagen_url || '',
    })

    setTab('inventario')
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

  const editarProveedor = (p: any) => {
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

  const obtenerFechaLocal = (fecha: string | Date) => {
    const d = new Date(fecha)

    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  const hoy = obtenerFechaLocal(new Date())

  const ventasHoy = ventas.filter((v) => {
    return obtenerFechaLocal(v.created_at) === hoy
  })

  const ventasFiltradas = ventas.filter((v) => {
    const fechaVenta = obtenerFechaLocal(v.created_at)

    if (!fechaInicio && !fechaFin) {
      return true
    }

    if (fechaInicio && !fechaFin) {
      return fechaVenta >= fechaInicio
    }

    if (!fechaInicio && fechaFin) {
      return fechaVenta <= fechaFin
    }

    return fechaVenta >= fechaInicio && fechaVenta <= fechaFin
  })

  const calcularGananciaVentas = (listaVentas: any[]) => {
    let ganancia = 0

    listaVentas.forEach((v) => {
      const producto = productos.find((p) => p.id === v.producto_id)

      if (producto) {
        const costo = Number(producto.costo || 0)
        const precio = Number(v.precio || 0)

        ganancia += (precio - costo) * Number(v.cantidad || 0)
      }
    })

    return ganancia
  }

  const calcularResumenVentas = (listaVentas: any[]) => {
    const total = listaVentas.reduce(
      (acc, v) => acc + Number(v.total || 0),
      0
    )

    const productosVendidos = listaVentas.reduce(
      (acc, v) => acc + Number(v.cantidad || 0),
      0
    )

    const metodos = listaVentas.reduce((acc: any, v) => {
      const metodo = v.metodo_pago || 'Efectivo'
      acc[metodo] = (acc[metodo] || 0) + Number(v.total || 0)
      return acc
    }, {})

    const ganancia = calcularGananciaVentas(listaVentas)

    return {
      total,
      productosVendidos,
      numeroVentas: listaVentas.length,
      ganancia,
      metodos,
    }
  }

  const resumenHoy = calcularResumenVentas(ventasHoy)
  const resumenPeriodo = calcularResumenVentas(ventasFiltradas)

  const resumenesDiarios = ventas.reduce((acc: any, venta) => {
    const fecha = obtenerFechaLocal(venta.created_at)

    if (!acc[fecha]) {
      acc[fecha] = []
    }

    acc[fecha].push(venta)

    return acc
  }, {})

  const listaResumenesDiarios = Object.keys(resumenesDiarios)
    .sort((a, b) => b.localeCompare(a))
    .map((fecha) => {
      const ventasDelDia = resumenesDiarios[fecha]
      const resumen = calcularResumenVentas(ventasDelDia)

      return {
        fecha,
        ...resumen,
      }
    })

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



  const entrarComoVendedor = () => {
    setUsuarioRol('Vendedor')
    setSistemaActivo(true)
  }

  const intentarEntrarAdmin = () => {
    const passwordCorrecta = '1234'

    if (passwordAdmin !== passwordCorrecta) {
      alert('Contraseña incorrecta')
      return
    }

    setUsuarioRol('Admin')
    setSistemaActivo(true)
  }

  const cerrarSistema = () => {
    setSistemaActivo(false)
    setMostrarPasswordAdmin(false)
    setPasswordAdmin('')
    setUsuarioRol('Vendedor')
    setTab('precios')
  }
  if (!appLista) {
    return (
      <div style={styles.loadingPage}>
        <img
          src="https://i.postimg.cc/T1KLqYXb/Chat-GPT-Image-4-dic-2025-11-34-20-p-m.png"
          alt="Fast Look"
          style={styles.loadingLogo}
        />

        <h2 style={styles.loadingTitle}>FAST LOOK</h2>
        <p style={styles.loadingText}>Cargando sistema...</p>

        <style jsx global>{`
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

  if (!sistemaActivo) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginBox}>
          <h1 style={styles.logoLogin}>FAST LOOK</h1>
          <p style={styles.loginSubtitle}>Selecciona cómo deseas entrar</p>

          <button style={styles.bigButton} onClick={entrarComoVendedor}>
            Entrar como vendedor
          </button>

          <button
            style={styles.blackButton}
            onClick={() => setMostrarPasswordAdmin(true)}
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
                onChange={(e) => setPasswordAdmin(e.target.value)}
              />

              <button style={styles.bigButton} onClick={intentarEntrarAdmin}>
                Confirmar acceso admin
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>FAST LOOK</h1>
        <p style={styles.subtitle}>Sistema de Gestión</p>

        <div style={styles.userBox}>
          <p style={styles.userText}>
            Modo actual: <b>{usuarioRol}</b>
          </p>

          <button style={styles.logoutButton} onClick={cerrarSistema}>
            Salir
          </button>
        </div>
      </header>

      <nav style={styles.nav}>
        <button style={tab === 'precios' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('precios')}>Lista de precios</button>
        <button style={tab === 'venta' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('venta')}>Generar venta</button>
        <button style={tab === 'stock' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('stock')}>Stock bajo</button>
        <button style={tab === 'ia' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('ia')}>Asistente IA</button>

        {usuarioRol === 'Admin' && (
          <>
            <button style={tab === 'inventario' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('inventario')}>Inventario</button>
            <button style={tab === 'corte' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('corte')}>Corte de caja</button>
            <button style={tab === 'proveedores' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('proveedores')}>Proveedores</button>
            <button style={tab === 'compras' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('compras')}>Lista de compras</button>
            <button style={tab === 'movimientos' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('movimientos')}>Movimientos</button>
            <button style={tab === 'dashboard' ? styles.activeBtn : styles.navBtn} onClick={() => setTab('dashboard')}>Dashboard</button>
          </>
        )}
      </nav>

      <main style={styles.main}>
        
        
        {tab === 'precios' && (
          <>
            <h2>Lista de precios completa</h2>
            <input style={styles.input} placeholder="Buscar producto..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

            {productosFiltrados.map((p) => (
              <div key={p.id} style={styles.card}>
                {p.imagen_url && <img src={p.imagen_url} alt={p.nombre} style={styles.image} />}
                <h3>{p.nombre}</h3>
                <p><b>Código:</b> {p.codigo}</p>
                <p><b>Tipo:</b> {p.tipo}</p>
                <p><b>Precio:</b> ${p.precio}</p>
                <p><b>Stock:</b> {p.stock}</p>
                <p><b>Ubicación:</b> {p.ubicacion}</p>
                <p><b>Proveedor:</b> {p.proveedor}</p>
              </div>
            ))}
          </>
        )}

        {tab === 'venta' && (
          <>
            <h2>Generar venta</h2>

            <input style={styles.input} placeholder="Buscar producto para vender..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={styles.input}>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta">Tarjeta</option>
            </select>

            <h3>Productos</h3>
            {productosFiltrados.map((p) => (
              <div key={p.id} style={styles.card}>
                {p.imagen_url && <img src={p.imagen_url} alt={p.nombre} style={styles.image} />}
                <h3>{p.nombre}</h3>
                <p><b>Precio:</b> ${p.precio}</p>
                <p><b>Stock:</b> {p.stock}</p>
                <button style={styles.redButton} onClick={() => agregarAlCarrito(p)}>
                  Añadir al ticket
                </button>
              </div>
            ))}

            <h2>Ticket actual</h2>

            {carrito.map((item) => (
              <div key={item.id} style={styles.ticketItem}>
                <p><b>{item.nombre}</b></p>
                <p>Precio: ${item.precio}</p>

                <div style={styles.qtyRow}>
                  <button style={styles.qtyBtn} onClick={() => disminuirCantidad(item.id)}>-</button>
                  <input type="number" value={item.cantidad} onChange={(e) => cambiarCantidad(item.id, Number(e.target.value))} style={styles.qtyInput} />
                  <button style={styles.qtyBtn} onClick={() => aumentarCantidad(item.id)}>+</button>
                </div>

                <p>Subtotal: ${Number(item.precio) * item.cantidad}</p>

                <button style={styles.blackButton} onClick={() => eliminarDelCarrito(item.id)}>
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

            <button style={styles.bigButton} onClick={finalizarVenta}>Finalizar venta</button>
            <button style={styles.blackButton} onClick={descargarTicket}>Descargar ticket</button>
            <button style={styles.redButton} onClick={enviarWhatsApp}>Enviar por WhatsApp</button>
            <button style={styles.grayButton} onClick={cancelarTicket}>Cancelar ticket</button>
          </>
        )}

        {tab === 'inventario' && (
          <>
            <h2>Inventario: agregar o editar productos</h2>

            {usuarioRol !== 'Admin' && (
              <div style={styles.alert}>Estás en modo vendedor. No puedes editar inventario.</div>
            )}

            <input style={styles.input} placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            <input style={styles.input} placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <input style={styles.input} placeholder="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} />
            <input style={styles.input} placeholder="Precio de venta" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
            <input style={styles.input} placeholder="Costo / precio de compra" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} />
            <input style={styles.input} placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            <input style={styles.input} placeholder="Stock mínimo" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} />
            <input style={styles.input} placeholder="Ubicación" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
            <input style={styles.input} placeholder="Proveedor" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />

            <input style={styles.input} placeholder="URL de imagen" value={form.imagen_url} onChange={(e) => setForm({ ...form, imagen_url: e.target.value })} />

            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={styles.input}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) subirImagenProducto(file)
              }}
            />

            {subiendoImagen && <div style={styles.alert}>Subiendo imagen...</div>}

            {form.imagen_url && (
              <img src={form.imagen_url} alt="Vista previa" style={styles.image} />
            )}

            <button style={styles.bigButton} onClick={guardarProducto}>
              {form.id ? 'Guardar cambios' : 'Agregar producto'}
            </button>

            <button style={styles.grayButton} onClick={limpiarFormulario}>
              Limpiar formulario
            </button>

            <h3>Productos registrados</h3>

            {productos.map((p) => (
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

        {tab === 'corte' && (
          <>
            <h2>Corte de caja automático</h2>

            {productosSinGanancia.length > 0 && (
              <div style={styles.alert}>
                ⚠️ Tienes {productosSinGanancia.length} productos sin ganancia. Revisa precio y costo antes de venderlos.
              </div>
            )}

            <div style={styles.card}>
              <h3>Resumen de hoy</h3>
              <p><b>Fecha:</b> {hoy}</p>
              <p><b>Total vendido:</b> ${resumenHoy.total}</p>
              <p><b>Número de ventas:</b> {resumenHoy.numeroVentas}</p>
              <p><b>Productos vendidos:</b> {resumenHoy.productosVendidos}</p>
              <p><b>Ganancia real estimada:</b> ${resumenHoy.ganancia}</p>

              <h4>Métodos de pago</h4>
              {Object.keys(resumenHoy.metodos).length === 0 && <p>No hay ventas hoy.</p>}
              {Object.keys(resumenHoy.metodos).map((metodo) => (
                <p key={metodo}>
                  <b>{metodo}:</b> ${resumenHoy.metodos[metodo]}
                </p>
              ))}
            </div>

            <h3>Seleccionar periodo de ventas</h3>

            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              style={styles.input}
            />

            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              style={styles.input}
            />

            <div style={styles.card}>
              <h3>Resumen del periodo</h3>
              <p><b>Total vendido:</b> ${resumenPeriodo.total}</p>
              <p><b>Número de ventas:</b> {resumenPeriodo.numeroVentas}</p>
              <p><b>Productos vendidos:</b> {resumenPeriodo.productosVendidos}</p>
              <p><b>Ganancia real estimada:</b> ${resumenPeriodo.ganancia}</p>

              <h4>Métodos de pago</h4>
              {Object.keys(resumenPeriodo.metodos).length === 0 && <p>No hay ventas en este periodo.</p>}
              {Object.keys(resumenPeriodo.metodos).map((metodo) => (
                <p key={metodo}>
                  <b>{metodo}:</b> ${resumenPeriodo.metodos[metodo]}
                </p>
              ))}
            </div>

            <h3>Historial de cortes</h3>

            {cortes.length === 0 && (
              <div style={styles.alert}>Aún no hay cortes guardados.</div>
            )}

            {cortes.map((c) => (
              <div key={c.id} style={styles.card}>
                <p><b>Periodo:</b> {c.fecha_inicio} a {c.fecha_fin}</p>
                <p>Total: ${c.total}</p>
                <p>Ganancia: ${c.ganancia}</p>
                <p>Efectivo: ${c.efectivo}</p>
                <p>Transferencia: ${c.transferencia}</p>
                <p>Tarjeta: ${c.tarjeta}</p>
              </div>
            ))}

            <h3>Resúmenes diarios</h3>

            {listaResumenesDiarios.map((dia) => (
              <div key={dia.fecha} style={styles.card}>
                <h3>{dia.fecha}</h3>
                <p><b>Total vendido:</b> ${dia.total}</p>
                <p><b>Ventas:</b> {dia.numeroVentas}</p>
                <p><b>Productos vendidos:</b> {dia.productosVendidos}</p>
                <p><b>Ganancia:</b> ${dia.ganancia}</p>
              </div>
            ))}

            <h3>Ventas del periodo</h3>

            {ventasFiltradas.map((v) => (
              <div key={v.id} style={styles.ticketItem}>
                <p><b>{v.nombre}</b></p>
                <p>Código: {v.codigo}</p>
                <p>Cantidad: {v.cantidad}</p>
                <p>Total: ${v.total}</p>
                <p>Método: {v.metodo_pago}</p>
                <p>Fecha: {obtenerFechaLocal(v.created_at)}</p>
              </div>
            ))}
          </>
        )}

        {tab === 'stock' && (
          <>
            <h2>Stock bajo / comprar pronto</h2>

            {productosBajoStock.length > 0 && (
              <div style={styles.alert}>Hay {productosBajoStock.length} productos con stock bajo.</div>
            )}

            {productosBajoStock.map((p) => (
              <div key={p.id} style={styles.card}>
                <h3>{p.nombre}</h3>
                <p><b>Código:</b> {p.codigo}</p>
                <p><b>Stock:</b> {p.stock}</p>
                <p><b>Stock mínimo:</b> {p.stock_minimo || 5}</p>
                <p><b>Proveedor:</b> {p.proveedor}</p>
                <p><b>Ubicación:</b> {p.ubicacion}</p>
              </div>
            ))}
          </>
        )}

        {tab === 'ia' && (
          <div style={styles.card}>
            <h2>Asistente IA</h2>
            <p>Aquí irá la sección para preguntar compatibilidades, medidas, precios y dudas técnicas.</p>
          </div>
        )}

        {tab === 'proveedores' && (
          <>
            <h2>Proveedores</h2>

            <input
              style={styles.input}
              placeholder="Nombre del proveedor"
              value={formProveedor.nombre}
              onChange={(e) => setFormProveedor({ ...formProveedor, nombre: e.target.value })}
            />

            <input
              style={styles.input}
              placeholder="Teléfono WhatsApp"
              value={formProveedor.telefono}
              onChange={(e) => setFormProveedor({ ...formProveedor, telefono: e.target.value })}
            />

            <input
              style={styles.input}
              placeholder="Productos que maneja"
              value={formProveedor.productos}
              onChange={(e) => setFormProveedor({ ...formProveedor, productos: e.target.value })}
            />

            <input
              style={styles.input}
              placeholder="Tiempo de entrega"
              value={formProveedor.tiempo_entrega}
              onChange={(e) => setFormProveedor({ ...formProveedor, tiempo_entrega: e.target.value })}
            />

            <textarea
              style={styles.input}
              placeholder="Notas"
              value={formProveedor.notas}
              onChange={(e) => setFormProveedor({ ...formProveedor, notas: e.target.value })}
            />

            <button style={styles.bigButton} onClick={guardarProveedor}>
              {formProveedor.id ? 'Guardar cambios' : 'Agregar proveedor'}
            </button>

            <button style={styles.grayButton} onClick={limpiarProveedor}>
              Limpiar proveedor
            </button>

            <h3>Lista de proveedores</h3>

            {proveedores.map((p) => (
              <div key={p.id} style={styles.card}>
                <h3>{p.nombre}</h3>
                <p><b>Teléfono:</b> {p.telefono}</p>
                <p><b>Productos:</b> {p.productos}</p>
                <p><b>Tiempo de entrega:</b> {p.tiempo_entrega}</p>
                <p><b>Notas:</b> {p.notas}</p>

                <button style={styles.redButton} onClick={() => editarProveedor(p)}>
                  Editar proveedor
                </button>

                <button
                  style={styles.blackButton}
                  onClick={() =>
                    abrirWhatsAppProveedor(
                      p.telefono,
                      `Hola ${p.nombre}, quiero consultar disponibilidad y precios para resurtir productos de Fast Look.`
                    )
                  }
                >
                  Enviar WhatsApp
                </button>
              </div>
            ))}
          </>
        )}

        {tab === 'compras' && (
          <>
            <h2>Lista automática de compras</h2>

            <input
              type="number"
              style={styles.input}
              placeholder="Cantidad mínima sugerida a comprar"
              value={cantidadCompra}
              onChange={(e) => setCantidadCompra(Number(e.target.value))}
            />

            {Object.keys(comprasPorProveedor).length === 0 && (
              <div style={styles.alert}>No hay productos con stock bajo para comprar.</div>
            )}

            {Object.keys(comprasPorProveedor).map((proveedor) => (
              <div key={proveedor} style={styles.card}>
                <h3>{proveedor}</h3>

                {comprasPorProveedor[proveedor].map((p: any) => {
                  const stockActual = Number(p.stock || 0)
                  const stockMinimo = Number(p.stock_minimo || 5)
                  const cantidadSugerida = Math.max(
                    stockMinimo * 2 - stockActual,
                    cantidadCompra
                  )

                  return (
                    <div key={p.id} style={styles.ticketItem}>
                      <p><b>{p.nombre}</b></p>
                      <p>Código: {p.codigo}</p>
                      <p>Stock actual: {stockActual}</p>
                      <p>Stock mínimo: {stockMinimo}</p>
                      <p><b>Comprar sugerido:</b> {cantidadSugerida}</p>
                      <p>Ubicación: {p.ubicacion}</p>
                    </div>
                  )

                  

                  
                })}

                <button
                  style={styles.redButton}
                  onClick={() => {
                    const proveedorData = proveedores.find(
                      (p) => p.nombre?.toLowerCase() === proveedor.toLowerCase()
                    )

                    abrirWhatsAppProveedor(
                      proveedorData?.telefono || '',
                      generarMensajeCompra(proveedor, comprasPorProveedor[proveedor])
                    )
                  }}
                >
                  Enviar pedido por WhatsApp
                </button>
              </div>
            ))}
          </>
        )}

        {tab === 'movimientos' && (
          <>
            <h2>Historial de movimientos</h2>

            {movimientos.map((m) => (
              <div key={m.id} style={styles.ticketItem}>
                <p><b>{m.nombre}</b></p>
                <p>Código: {m.codigo}</p>
                <p>Tipo: {m.tipo_movimiento}</p>
                <p>Cantidad: {m.cantidad}</p>
                <p>Stock anterior: {m.stock_anterior}</p>
                <p>Stock nuevo: {m.stock_nuevo}</p>
                <p>Nota: {m.nota}</p>
                <p>Fecha: {obtenerFechaLocal(m.created_at)}</p>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
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
  main: { padding: 16, maxWidth: 900, margin: '0 auto' },
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

}
