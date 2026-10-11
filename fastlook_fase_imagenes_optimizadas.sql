-- FAST LOOK · soporte de miniaturas sin transformar ni borrar fotografías existentes.
-- Ejecutar manualmente en Supabase SQL Editor antes de publicar el frontend.
alter table public.productos
  add column if not exists imagen_thumbnail_url text;

comment on column public.productos.imagen_thumbnail_url is
  'Miniatura optimizada almacenada junto al original; null conserva compatibilidad con fotos anteriores.';
