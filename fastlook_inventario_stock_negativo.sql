-- FAST LOOK · edición de productos con existencia negativa y recepción transaccional de mercancía.
-- Dependencia: ejecutar después de fastlook_fix_productos_historicos.sql. Independiente de la venta flexible.
-- Ejecución manual. No borra ni modifica filas existentes: los saldos negativos se conservan tal cual.
--   * actualizar_producto_admin deja de escribir stock: un saldo negativo ya no bloquea editar nombre,
--     precio o fotografía, y una edición normal no puede cambiar existencias por accidente.
--   * recibir_mercancia_producto suma unidades sobre el saldo bloqueado (-10 + 4 = -6) y deja auditoría.
--   * cambiar_stock_producto acepta ajustar desde un saldo negativo (antes devolvía STOCK_INVALIDO).
--   Reversión: fastlook_inventario_stock_negativo_rollback.sql.
begin;

do $$
begin
  if to_regprocedure('public.actualizar_producto_admin(uuid,text,text,text,numeric,numeric,integer,integer,text,text,text,text,boolean)') is null then
    raise exception 'DEPENDENCIA: aplica antes fastlook_fix_rls_productos_admin.sql y fastlook_fix_productos_historicos.sql';
  end if;
end $$;

-- Respaldo de los originales para fastlook_inventario_stock_negativo_rollback.sql ("do nothing" conserva el primero).
create table if not exists public.fastlook_migracion_respaldos (
  migracion text not null, objeto text not null, definicion text not null,
  created_at timestamptz not null default now(), primary key (migracion, objeto)
);
alter table public.fastlook_migracion_respaldos enable row level security;
revoke all on table public.fastlook_migracion_respaldos from public, anon, authenticated;
insert into public.fastlook_migracion_respaldos (migracion, objeto, definicion)
select 'inventario_stock_negativo_v1', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
from pg_proc p
where p.oid in ('public.actualizar_producto_admin(uuid,text,text,text,numeric,numeric,integer,integer,text,text,text,text,boolean)'::regprocedure,
                'public.cambiar_stock_producto(uuid,integer,integer,text)'::regprocedure)
on conflict (migracion, objeto) do nothing;
do $$
begin
  if (select count(*) from public.fastlook_migracion_respaldos where migracion = 'inventario_stock_negativo_v1') <> 2 then
    raise exception 'RESPALDO_INCOMPLETO: faltan actualizar_producto_admin o cambiar_stock_producto';
  end if;
  if exists (select 1 from public.fastlook_migracion_respaldos where migracion = 'inventario_stock_negativo_v1' and definicion like '%STOCK_SOLO_POR_AJUSTE%') then
    raise exception 'RESPALDO_INVALIDO: el respaldo contiene una versión de esta migración, no el original';
  end if;
end $$;

-- cambiar_stock_producto (definición de producción, no versionada en el repositorio): se conserva íntegra salvo
-- las dos validaciones que impedían ajustar un producto con saldo negativo. El stock nuevo sigue siendo >= 0.
do $$
declare v_def text; v_nueva text; v_reemplazo record;
begin
  select definicion into v_def from public.fastlook_migracion_respaldos
  where migracion = 'inventario_stock_negativo_v1' and objeto = 'cambiar_stock_producto(uuid,integer,integer,text)';
  v_nueva := v_def;
  for v_reemplazo in select * from (values
    ('if p_stock_esperado is null or p_stock_esperado < 0 then', 'if p_stock_esperado is null then'),
    ('if v_stock_actual is null or v_stock_actual < 0 then', 'if v_stock_actual is null then')) r(antes, despues)
  loop
    if (length(v_nueva) - length(replace(v_nueva, v_reemplazo.antes, ''))) / length(v_reemplazo.antes) <> 1 then
      raise exception 'DEFINICION_INESPERADA: cambiar_stock_producto no contiene exactamente una vez "%"', v_reemplazo.antes;
    end if;
    v_nueva := replace(v_nueva, v_reemplazo.antes, v_reemplazo.despues);
  end loop;
  execute v_nueva;
end $$;

create or replace function public.actualizar_producto_admin(
  p_producto_id uuid, p_codigo text, p_nombre text, p_tipo text, p_precio numeric,
  p_costo numeric, p_stock integer, p_stock_minimo integer, p_ubicacion text,
  p_proveedor text, p_imagen_url text, p_imagen_thumbnail_url text, p_usar_imagen_principal boolean
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_producto public.productos%rowtype;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  if not exists (select 1 from public.usuarios u where u.id = v_actor and u.activo = true and u.rol = 'Admin') then
    raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo un administrador activo puede editar productos.';
  end if;
  if p_producto_id is null then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Producto: identificador obligatorio.'; end if;
  if v_codigo = '' then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Código: es obligatorio.'; end if;
  if length(v_codigo) > 80 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Código: máximo 80 caracteres.'; end if;
  if length(btrim(coalesce(p_nombre, ''))) = 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Nombre: es obligatorio.'; end if;
  if length(btrim(p_nombre)) > 200 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Nombre: máximo 200 caracteres.'; end if;
  if length(btrim(coalesce(p_tipo, ''))) = 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Tipo de producto: es obligatorio.'; end if;
  if length(btrim(p_tipo)) > 100 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Tipo de producto: máximo 100 caracteres.'; end if;
  if p_precio is null or p_precio < 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Precio de venta: debe ser mayor o igual a cero.'; end if;
  if p_costo is not null and p_costo < 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Costo: debe ser mayor o igual a cero.'; end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Stock mínimo: debe ser entero y mayor o igual a cero.'; end if;
  if length(btrim(coalesce(p_ubicacion, ''))) > 100 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Ubicación: máximo 100 caracteres.'; end if;
  if length(btrim(coalesce(p_proveedor, ''))) > 200 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Proveedor: máximo 200 caracteres.'; end if;
  if length(btrim(coalesce(p_imagen_url, ''))) > 2000 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: URL de imagen: máximo 2000 caracteres.'; end if;
  if length(btrim(coalesce(p_imagen_thumbnail_url, ''))) > 2000 then raise exception using errcode = '22023', message = 'CAMPO_INVALIDO: Miniatura: máximo 2000 caracteres.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_producto_id::text));
  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCTO_INEXISTENTE: El producto no existe.'; end if;
  if coalesce(v_producto.archivado, false) then raise exception using errcode = '22023', message = 'PRODUCTO_ARCHIVADO: Un producto archivado no puede editarse.'; end if;
  -- Clientes anteriores reenvían el stock leído: se acepta si coincide con el bloqueado; cualquier otro valor exige un ajuste auditado.
  if p_stock is not null and p_stock is distinct from v_producto.stock then
    raise exception using errcode = '22023', message = 'STOCK_SOLO_POR_AJUSTE: Existencias: usa "Añadir stock" o "Cambiar stock a…" para modificarlas.';
  end if;
  if exists (select 1 from public.productos p where p.id <> p_producto_id and upper(btrim(coalesce(p.codigo, ''))) = v_codigo) then
    raise exception using errcode = '23505', message = 'CODIGO_DUPLICADO: El código ya pertenece a otro producto.';
  end if;

  update public.productos set
    codigo = v_codigo, nombre = btrim(p_nombre), tipo = btrim(p_tipo), precio = p_precio,
    costo = coalesce(p_costo, v_producto.costo),
    stock_minimo = coalesce(p_stock_minimo, v_producto.stock_minimo),
    ubicacion = case when p_ubicacion is null then v_producto.ubicacion else btrim(p_ubicacion) end,
    proveedor = case when p_proveedor is null then v_producto.proveedor else btrim(p_proveedor) end,
    imagen_url = case when p_imagen_url is null then v_producto.imagen_url else btrim(p_imagen_url) end,
    imagen_thumbnail_url = case when p_imagen_thumbnail_url is null then v_producto.imagen_thumbnail_url else nullif(btrim(p_imagen_thumbnail_url), '') end,
    usar_imagen_principal = coalesce(p_usar_imagen_principal, v_producto.usar_imagen_principal)
  where id = p_producto_id returning * into v_producto;
  return to_jsonb(v_producto);
end;
$$;

create table if not exists public.inventario_recepciones (
  idempotency_key uuid primary key,
  producto_id uuid not null references public.productos(id),
  cantidad integer not null check (cantidad > 0),
  stock_anterior integer not null, stock_nuevo integer not null,
  motivo text not null check (length(motivo) between 1 and 500),
  usuario_id uuid not null references public.usuarios(id), usuario_nombre text not null,
  created_at timestamptz not null default now(),
  check (stock_nuevo = stock_anterior + cantidad)
);
create index if not exists inventario_recepciones_producto_idx on public.inventario_recepciones(producto_id, created_at);
alter table public.inventario_recepciones enable row level security;
revoke all on table public.inventario_recepciones from public, anon, authenticated;

create or replace function public.recibir_mercancia_producto(p_idempotency_key uuid, p_producto_id uuid, p_cantidad integer, p_motivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_nombre text; v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'Recepción de mercancía');
  v_producto record; v_existente public.inventario_recepciones%rowtype; v_nuevo integer;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'SIN_SESION: Se requiere una sesión autenticada.'; end if;
  select u.nombre into v_nombre from public.usuarios u where u.id = v_actor and u.activo = true and u.rol = 'Admin';
  if not found then raise exception using errcode = '42501', message = 'ROL_NO_PERMITIDO: Sólo un administrador activo puede recibir mercancía.'; end if;
  if p_idempotency_key is null or p_producto_id is null then raise exception using errcode = '22023', message = 'DATOS_INVALIDOS: Falta la operación o el producto.'; end if;
  if p_cantidad is null or p_cantidad not between 1 and 1000000 then raise exception using errcode = '22023', message = 'CANTIDAD_INVALIDA: La cantidad debe ser un entero entre 1 y 1,000,000.'; end if;
  if length(v_motivo) > 500 then raise exception using errcode = '22023', message = 'MOTIVO_INVALIDO: El motivo no puede superar 500 caracteres.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recepcion:' || p_idempotency_key::text, 0));
  select * into v_existente from public.inventario_recepciones where idempotency_key = p_idempotency_key;
  if found then
    if v_existente.producto_id <> p_producto_id or v_existente.cantidad <> p_cantidad then
      raise exception using errcode = '22023', message = 'IDEMPOTENCIA_CONFLICTO: La operación ya se registró con otros datos.';
    end if;
    return jsonb_build_object('ok', true, 'idempotente', true, 'producto_id', p_producto_id, 'stock_anterior', v_existente.stock_anterior,
      'diferencia', v_existente.cantidad, 'stock_nuevo', v_existente.stock_nuevo);
  end if;

  select p.id, p.codigo, p.nombre, p.stock, p.archivado into v_producto from public.productos p where p.id = p_producto_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCTO_INEXISTENTE: El producto no existe.'; end if;
  if coalesce(v_producto.archivado, false) then raise exception using errcode = '22023', message = 'PRODUCTO_ARCHIVADO: Un producto archivado no recibe mercancía.'; end if;
  if v_producto.stock is null then raise exception using errcode = '22023', message = 'STOCK_INVALIDO: El producto no tiene existencia válida.'; end if;

  update public.productos set stock = stock + p_cantidad where id = p_producto_id returning stock into v_nuevo;
  insert into public.movimientos_inventario (producto_id, codigo, nombre, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, nota)
  values (p_producto_id, v_producto.codigo, v_producto.nombre, 'Entrada', p_cantidad, v_producto.stock, v_nuevo, v_motivo || ' · ' || v_nombre);
  insert into public.inventario_recepciones (idempotency_key, producto_id, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, usuario_nombre)
  values (p_idempotency_key, p_producto_id, p_cantidad, v_producto.stock, v_nuevo, v_motivo, v_actor, v_nombre);
  return jsonb_build_object('ok', true, 'idempotente', false, 'producto_id', p_producto_id, 'stock_anterior', v_producto.stock, 'diferencia', p_cantidad, 'stock_nuevo', v_nuevo);
end $$;

revoke all on function public.actualizar_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) from public, anon;
grant execute on function public.actualizar_producto_admin(uuid, text, text, text, numeric, numeric, integer, integer, text, text, text, text, boolean) to authenticated;
revoke all on function public.recibir_mercancia_producto(uuid, uuid, integer, text) from public, anon;
revoke all on function public.cambiar_stock_producto(uuid, integer, integer, text) from public, anon;
grant execute on function public.cambiar_stock_producto(uuid, integer, integer, text) to authenticated;
grant execute on function public.recibir_mercancia_producto(uuid, uuid, integer, text) to authenticated;
commit;
