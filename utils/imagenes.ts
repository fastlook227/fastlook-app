interface OpcionesImagen { ladoMaximo?: number; calidad?: number; sufijo?: string; lienzoCuadradoBlanco?: boolean }

const convertirImagen = (file: File, opciones: OpcionesImagen = {}): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen válida.'))
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const imagen = new Image()

    const liberarRecursos = () => {
      URL.revokeObjectURL(objectUrl)
    }

    imagen.onload = () => {
      try {
        const anchoOriginal = imagen.naturalWidth
        const altoOriginal = imagen.naturalHeight

        if (anchoOriginal <= 0 || altoOriginal <= 0) {
          liberarRecursos()
          reject(new Error('No se pudieron obtener las dimensiones de la imagen.'))
          return
        }

        const ladoMaximo = opciones.ladoMaximo ?? 900
        const escala = Math.min(
          ladoMaximo / anchoOriginal,
          ladoMaximo / altoOriginal,
          1
        )
        const anchoFinal = Math.max(1, Math.round(anchoOriginal * escala))
        const altoFinal = Math.max(1, Math.round(altoOriginal * escala))

        const canvas = document.createElement('canvas')
        const ladoLienzo = opciones.lienzoCuadradoBlanco ? ladoMaximo : null
        canvas.width = ladoLienzo || anchoFinal
        canvas.height = ladoLienzo || altoFinal

        const contexto = canvas.getContext('2d')

        if (!contexto) {
          liberarRecursos()
          reject(new Error('No se pudo preparar la imagen para comprimirla.'))
          return
        }

        contexto.fillStyle = '#ffffff'
        contexto.fillRect(0, 0, canvas.width, canvas.height)
        contexto.drawImage(imagen, (canvas.width - anchoFinal) / 2, (canvas.height - altoFinal) / 2, anchoFinal, altoFinal)

        const finalizar = (blob: Blob | null, extension: 'webp' | 'jpg') => {
            liberarRecursos()

            if (!blob) {
              reject(new Error('No se pudo comprimir la imagen.'))
              return
            }

            const nombreBase = file.name.replace(/\.[^/.]+$/, '') || 'producto'
            const archivoComprimido = new File(
              [blob],
              `${nombreBase}${opciones.sufijo || ''}.${extension}`,
              {
                type: blob.type,
                lastModified: Date.now(),
              }
            )

            resolve(archivoComprimido)
        }
        canvas.toBlob((webp) => {
          if (webp?.type === 'image/webp') finalizar(webp, 'webp')
          else canvas.toBlob((jpeg) => finalizar(jpeg, 'jpg'), 'image/jpeg', opciones.calidad ?? 0.75)
        }, 'image/webp', opciones.calidad ?? 0.75)
      } catch {
        liberarRecursos()
        reject(new Error('Ocurrió un error al comprimir la imagen.'))
      }
    }

    imagen.onerror = () => {
      liberarRecursos()
      reject(new Error('No se pudo cargar la imagen seleccionada.'))
    }

    imagen.src = objectUrl
  })
}

export const comprimirImagenProducto = (file: File) => convertirImagen(file)

export const crearVariantesImagenProducto = async (file: File) => {
  const [principal, miniatura] = await Promise.all([
    convertirImagen(file, { ladoMaximo: 900, calidad: 0.75 }),
    convertirImagen(file, { ladoMaximo: 320, calidad: 0.68, sufijo: '-thumb', lienzoCuadradoBlanco: true }),
  ])
  return { principal, miniatura }
}
