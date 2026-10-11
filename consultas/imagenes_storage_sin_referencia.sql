-- SOLO LECTURA. Ejecutar desde Supabase SQL Editor.
-- Lista archivos del bucket productos que no aparecen en imagen_url ni
-- imagen_thumbnail_url. Revisar manualmente: esta consulta NO borra nada.
select
  o.id,
  o.name as ruta_storage,
  o.created_at,
  o.updated_at,
  coalesce((o.metadata ->> 'size')::bigint, 0) as bytes,
  round(coalesce((o.metadata ->> 'size')::numeric, 0) / 1024 / 1024, 2) as megabytes
from storage.objects o
where o.bucket_id = 'productos'
  and not exists (
    select 1
    from public.productos p
    where nullif(btrim(p.imagen_url), '') is not null
      and right(split_part(p.imagen_url, '?', 1), length(o.name)) = o.name
  )
  and not exists (
    select 1
    from public.productos p
    where nullif(btrim(p.imagen_thumbnail_url), '') is not null
      and right(split_part(p.imagen_thumbnail_url, '?', 1), length(o.name)) = o.name
  )
order by bytes desc, o.created_at;
