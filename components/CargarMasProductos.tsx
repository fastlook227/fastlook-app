interface Props { visibles: number; total: number; onCargarMas: () => void }

export default function CargarMasProductos({ visibles, total, onCargarMas }: Props) {
  if (visibles >= total) return null
  return <div className="fl-load-more"><span>Mostrando {visibles} de {total}</span><button type="button" onClick={onCargarMas}>Cargar {Math.min(30, total - visibles)} más</button></div>
}
