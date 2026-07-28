export const comprimirImagenProducto = (file: File): Promise<File> => {
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

        const escala = Math.min(
          900 / anchoOriginal,
          900 / altoOriginal,
          1
        )
        const anchoFinal = Math.max(1, Math.round(anchoOriginal * escala))
        const altoFinal = Math.max(1, Math.round(altoOriginal * escala))

        const canvas = document.createElement('canvas')
        canvas.width = anchoFinal
        canvas.height = altoFinal

        const contexto = canvas.getContext('2d')

        if (!contexto) {
          liberarRecursos()
          reject(new Error('No se pudo preparar la imagen para comprimirla.'))
          return
        }

        contexto.drawImage(imagen, 0, 0, anchoFinal, altoFinal)

        canvas.toBlob(
          (blob) => {
            liberarRecursos()

            if (!blob) {
              reject(new Error('No se pudo convertir la imagen a formato WebP.'))
              return
            }

            const nombreBase = file.name.replace(/\.[^/.]+$/, '') || 'producto'
            const archivoComprimido = new File(
              [blob],
              `${nombreBase}.webp`,
              {
                type: 'image/webp',
                lastModified: Date.now(),
              }
            )

            resolve(archivoComprimido)
          },
          'image/webp',
          0.75
        )
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
