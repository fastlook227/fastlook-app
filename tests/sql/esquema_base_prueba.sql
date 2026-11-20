-- Esquema de PRUEBA para PGlite. NUNCA aplicar en Supabase.
-- Columnas, restricciones y trigger tomados del diagnóstico de producción del 2026-11-19
-- (consultas/diagnostico_rpc_ventas_flexibles.sql). procesar_venta, procesar_venta_mixta, procesar_devolucion y
-- cambiar_stock_producto son transcripción de las definiciones de producción (espacios compactados, mismas
-- sentencias y mensajes). calcular_linea_personalizada se reduce a la rama SERVICIO_MOTO real.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade, correo text not null unique, nombre text not null,
  rol text not null check (rol in ('Admin','Vendedor')), activo boolean not null default true,
  creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now()
);
alter table public.usuarios enable row level security;
create policy usuarios_leer_perfil_propio on public.usuarios for select to authenticated using (id = auth.uid());
grant select on public.usuarios to authenticated;

create table public.productos (
  id uuid primary key default gen_random_uuid(), codigo text not null unique, codigo_barras text, nombre text not null, tipo text,
  precio numeric not null, stock integer default 0, ubicacion text, proveedor text, created_at timestamp default now(), costo numeric default 0,
  imagen_url text, stock_minimo integer default 5, archivado boolean not null default false, archivado_en timestamptz, motivo_archivo text,
  talla text, certificacion text, imagen_thumbnail_url text, usar_imagen_principal boolean not null default false
);
-- Privilegios como en producción (RLS desactivada en productos, ventas y movimientos_inventario).
grant select, insert, update, delete on public.productos to anon;
grant select, delete on public.productos to authenticated;
create table public.ventas_tickets (
  ticket_id uuid primary key, folio text not null constraint ventas_tickets_folio_uk unique check (folio ~ '^FLV-[0-9]{8}-[0-9A-F]{12}$'),
  idempotency_key uuid not null constraint ventas_tickets_idempotency_key_uk unique,
  metodo_pago text not null check (metodo_pago in ('Efectivo','Transferencia','Tarjeta')), usuario_id uuid not null references auth.users(id),
  usuario_nombre text not null check (nullif(btrim(usuario_nombre), '') is not null), total numeric not null check (total >= 0),
  created_at timestamptz not null default now(), estado text not null default 'Cobrado'
);
alter table public.ventas_tickets enable row level security;
create policy ventas_tickets_select_personal_activo on public.ventas_tickets for select to authenticated
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo is true and u.rol in ('Admin','Vendedor')));
grant select on public.ventas_tickets to authenticated;
create table public.ventas (
  id uuid primary key default gen_random_uuid(), producto_id uuid references public.productos(id), codigo text not null, nombre text not null,
  precio numeric not null, cantidad integer not null default 1, total numeric not null, metodo_pago text default 'Efectivo',
  created_at timestamptz default now(), ticket_id uuid references public.ventas_tickets(ticket_id), folio text, costo_unitario numeric
);
grant select, insert, update, delete on public.ventas to anon, authenticated;
create table public.ventas_personalizadas (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.ventas_tickets(ticket_id) on delete restrict,
  folio text not null check (folio ~ '^FLV-[0-9]{8}-[0-9A-F]{12}$'),
  tipo_personalizado text not null check (tipo_personalizado in ('CADENA','ESTRELLA','PINON','KIT_SPROCKET','SERVICIO_MOTO')),
  nombre text not null, resumen text not null, configuracion jsonb not null check (jsonb_typeof(configuracion) = 'object'),
  precio_unitario numeric not null check (precio_unitario > 0), cantidad integer not null check (cantidad > 0), total numeric not null check (total > 0),
  costo_unitario numeric, metodo_pago text not null check (metodo_pago in ('Efectivo','Transferencia','Tarjeta')),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create function public.bloquear_cambios_venta_personalizada() returns trigger language plpgsql as $$
BEGIN
  RAISE EXCEPTION 'VENTA_PERSONALIZADA_INMUTABLE' USING ERRCODE = '55000';
END;
$$;
create trigger ventas_personalizadas_inmutables before delete or update on public.ventas_personalizadas for each row execute function public.bloquear_cambios_venta_personalizada();
alter table public.ventas_personalizadas enable row level security;
grant select on public.ventas_personalizadas to authenticated;
create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(), producto_id uuid references public.productos(id), codigo text, nombre text, tipo_movimiento text,
  cantidad integer, stock_anterior integer, stock_nuevo integer, nota text, created_at timestamptz default now(), valor_anterior jsonb, valor_nuevo jsonb,
  origen text not null default 'SISTEMA', usuario_rol text, accion_asistente_id uuid, ticket_id uuid, folio text
);
grant select, insert, update, delete on public.movimientos_inventario to anon, authenticated;
create table public.devoluciones (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null, folio text not null, total_devuelto numeric not null check (total_devuelto > 0),
  costo_revertido numeric, utilidad_revertida numeric, metodo_pago text,
  motivo text not null check (motivo in ('Producto incorrecto','No le quedó','Defecto','Cambio de opinión','Cambio por otro producto','Otro')),
  motivo_otro text, usuario_id uuid not null references auth.users(id), usuario_nombre text not null, idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  constraint devoluciones_motivo_otro_ck check (motivo <> 'Otro' or nullif(btrim(motivo_otro), '') is not null)
);
alter table public.devoluciones enable row level security;
create table public.devoluciones_detalle (
  id uuid primary key default gen_random_uuid(), devolucion_id uuid not null references public.devoluciones(id), venta_id uuid not null references public.ventas(id),
  producto_id uuid not null references public.productos(id), codigo text not null, nombre text not null, cantidad integer not null check (cantidad > 0),
  precio_unitario_original numeric not null check (precio_unitario_original >= 0), costo_unitario_original numeric,
  subtotal_devuelto numeric not null check (subtotal_devuelto > 0), utilidad_revertida numeric, created_at timestamptz not null default now()
);
alter table public.devoluciones_detalle enable row level security;

-- Reducida a la rama SERVICIO_MOTO de producción (única usada por las pruebas y por la venta por voz).
create function public.calcular_linea_personalizada(p_tipo text, p_configuracion jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_nivel text; v_precio_sugerido numeric; v_precio_final numeric;
begin
  if pg_catalog.upper(pg_catalog.btrim(p_tipo)) <> 'SERVICIO_MOTO' then raise exception 'TIPO_PERSONALIZADO_INVALIDO' using errcode = '22023'; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_configuracion)) <> 2 or not (p_configuracion ? 'nivel') or not (p_configuracion ? 'precio_final')
     or pg_catalog.jsonb_typeof(p_configuracion -> 'precio_final') <> 'number' then
    raise exception 'CONFIGURACION_SERVICIO_INVALIDA' using errcode = '22023';
  end if;
  v_nivel := p_configuracion ->> 'nivel';
  v_precio_sugerido := case v_nivel when 'Sencillo' then 25 when 'Normal' then 50 when 'Medio' then 75 when 'Completo' then 100 when 'Complejo' then 150 when 'Tardado' then 200 else null end;
  v_precio_final := (p_configuracion ->> 'precio_final')::numeric;
  if v_precio_sugerido is null or v_precio_final <= 0 then raise exception 'CONFIGURACION_SERVICIO_INVALIDA' using errcode = '22023'; end if;
  return pg_catalog.jsonb_build_object('nombre', 'Servicio de moto - ' || v_nivel, 'resumen', v_nivel || ' · Precio final $' || pg_catalog.round(v_precio_final, 2)::text,
    'precio_unitario', pg_catalog.round(v_precio_final, 2), 'configuracion', pg_catalog.jsonb_build_object('nivel', v_nivel, 'precio_sugerido', v_precio_sugerido, 'precio_final', v_precio_final));
end $$;

-- ===== Transcripción de producción: procesar_venta =====
create function public.procesar_venta(p_idempotency_key uuid, p_metodo_pago text, p_lineas jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_usuario_id uuid; v_usuario_nombre public.usuarios.nombre%type; v_usuario_rol public.usuarios.rol%type; v_usuario_activo public.usuarios.activo%type;
  v_ticket_id uuid; v_folio text; v_fecha_comercial text; v_metodo_pago text; v_total numeric := 0;
  v_producto record; v_existente record;
begin
  v_usuario_id := auth.uid();
  if v_usuario_id is null then raise exception using errcode = 'P0001', message = 'SIN_SESION: Debes iniciar sesión.'; end if;
  select u.nombre, u.rol, u.activo into v_usuario_nombre, v_usuario_rol, v_usuario_activo from public.usuarios u where u.id = v_usuario_id;
  if not found then raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: El usuario no tiene un perfil autorizado.'; end if;
  if v_usuario_activo is distinct from true then raise exception using errcode = 'P0001', message = 'USUARIO_INACTIVO: El usuario está inactivo.'; end if;
  if v_usuario_rol not in ('Admin', 'Vendedor') then raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: El usuario no puede registrar ventas.'; end if;
  if nullif(btrim(v_usuario_nombre), '') is null then raise exception using errcode = 'P0001', message = 'PERFIL_INVALIDO: El perfil no tiene un nombre válido.'; end if;
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'IDEMPOTENCIA_INVALIDA: Falta la clave de la operación.'; end if;
  v_metodo_pago := nullif(btrim(p_metodo_pago), '');
  if v_metodo_pago is null or v_metodo_pago not in ('Efectivo', 'Transferencia', 'Tarjeta') then raise exception using errcode = 'P0001', message = 'METODO_INVALIDO: El método de pago no es válido.'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception using errcode = 'P0001', message = 'CARRITO_VACIO: Debes incluir al menos un producto.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lineas) elemento
    where jsonb_typeof(elemento) <> 'object' or not (elemento ? 'producto_id') or not (elemento ? 'cantidad')
       or nullif(btrim(elemento->>'producto_id'), '') is null or nullif(btrim(elemento->>'cantidad'), '') is null
       or (elemento->>'producto_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or (elemento->>'cantidad') !~ '^[0-9]+$' or length(elemento->>'cantidad') > 10
       or (elemento->>'cantidad')::numeric <= 0 or (elemento->>'cantidad')::numeric > 2147483647
       or exists (select 1 from jsonb_object_keys(elemento) clave where clave not in ('producto_id', 'cantidad'))
  ) then raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: Revisa los productos y cantidades.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select t.ticket_id, t.folio, t.metodo_pago, t.total into v_existente from public.ventas_tickets t where t.idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('ok', true, 'idempotente', true, 'ticket_id', v_existente.ticket_id, 'folio', v_existente.folio, 'metodo_pago', v_existente.metodo_pago, 'total', v_existente.total); end if;
  perform 1 from public.productos p
  join (select (elemento->>'producto_id')::uuid as producto_id, sum((elemento->>'cantidad')::numeric) as cantidad from jsonb_array_elements(p_lineas) elemento group by (elemento->>'producto_id')::uuid) entrada on entrada.producto_id = p.id
  order by p.id for update of p;
  if (select count(*) from (select (elemento->>'producto_id')::uuid as producto_id from jsonb_array_elements(p_lineas) elemento group by (elemento->>'producto_id')::uuid) solicitados)
     <> (select count(*) from public.productos p join (select (elemento->>'producto_id')::uuid as producto_id from jsonb_array_elements(p_lineas) elemento group by (elemento->>'producto_id')::uuid) entrada on entrada.producto_id = p.id) then
    raise exception using errcode = 'P0001', message = 'PRODUCTO_INEXISTENTE: Uno de los productos ya no existe.';
  end if;
  for v_producto in
    select p.id, p.codigo, p.nombre, p.precio, p.costo, p.stock, p.archivado, entrada.cantidad from public.productos p
    join (select (elemento->>'producto_id')::uuid as producto_id, sum((elemento->>'cantidad')::numeric) as cantidad from jsonb_array_elements(p_lineas) elemento group by (elemento->>'producto_id')::uuid) entrada on entrada.producto_id = p.id
    order by p.id
  loop
    if v_producto.archivado is true then raise exception using errcode = 'P0001', message = format('PRODUCTO_ARCHIVADO: %s está archivado.', v_producto.nombre); end if;
    if v_producto.precio is null or v_producto.precio < 0 then raise exception using errcode = 'P0001', message = format('PRECIO_INVALIDO: %s no tiene un precio válido.', v_producto.nombre); end if;
    if v_producto.stock is null or v_producto.stock < 0 then raise exception using errcode = 'P0001', message = format('STOCK_INVALIDO: %s no tiene un stock válido.', v_producto.nombre); end if;
    if v_producto.cantidad > v_producto.stock then raise exception using errcode = 'P0001', message = format('STOCK_INSUFICIENTE: %s sólo tiene %s pieza(s) disponibles.', v_producto.nombre, v_producto.stock); end if;
    v_total := v_total + (v_producto.precio * v_producto.cantidad);
  end loop;
  v_fecha_comercial := to_char(current_timestamp at time zone 'America/Mexico_City', 'YYYYMMDD');
  loop
    v_ticket_id := pg_catalog.gen_random_uuid();
    v_folio := 'FLV-' || v_fecha_comercial || '-' || upper(substr(replace(v_ticket_id::text, '-', ''), 1, 12));
    exit when not exists (select 1 from public.ventas_tickets t where t.folio = v_folio);
  end loop;
  insert into public.ventas_tickets (ticket_id, folio, idempotency_key, metodo_pago, usuario_id, usuario_nombre, total)
  values (v_ticket_id, v_folio, p_idempotency_key, v_metodo_pago, v_usuario_id, v_usuario_nombre, v_total);
  for v_producto in
    select p.id, p.codigo, p.nombre, p.precio, p.costo, p.stock, entrada.cantidad from public.productos p
    join (select (elemento->>'producto_id')::uuid as producto_id, sum((elemento->>'cantidad')::numeric) as cantidad from jsonb_array_elements(p_lineas) elemento group by (elemento->>'producto_id')::uuid) entrada on entrada.producto_id = p.id
    order by p.id
  loop
    update public.productos set stock = v_producto.stock - v_producto.cantidad::integer where id = v_producto.id;
    insert into public.movimientos_inventario (producto_id, codigo, nombre, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, nota, ticket_id, folio)
    values (v_producto.id, v_producto.codigo, v_producto.nombre, 'Venta', v_producto.cantidad::integer, v_producto.stock, v_producto.stock - v_producto.cantidad::integer, 'Salida por venta', v_ticket_id, v_folio);
    insert into public.ventas (ticket_id, folio, producto_id, codigo, nombre, precio, costo_unitario, cantidad, total, metodo_pago)
    values (v_ticket_id, v_folio, v_producto.id, v_producto.codigo, v_producto.nombre, v_producto.precio, v_producto.costo, v_producto.cantidad::integer, v_producto.precio * v_producto.cantidad, v_metodo_pago);
  end loop;
  return jsonb_build_object('ok', true, 'idempotente', false, 'ticket_id', v_ticket_id, 'folio', v_folio, 'metodo_pago', v_metodo_pago, 'total', v_total);
exception
  when unique_violation then
    select t.ticket_id, t.folio, t.metodo_pago, t.total into v_existente from public.ventas_tickets t where t.idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('ok', true, 'idempotente', true, 'ticket_id', v_existente.ticket_id, 'folio', v_existente.folio, 'metodo_pago', v_existente.metodo_pago, 'total', v_existente.total); end if;
    raise;
end;
$$;

-- ===== Transcripción de producción: procesar_venta_mixta =====
create function public.procesar_venta_mixta(p_idempotency_key uuid, p_metodo_pago text, p_lineas_normales jsonb, p_lineas_personalizadas jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
DECLARE
  v_usuario_id uuid; v_usuario_nombre text; v_usuario_rol text; v_usuario_activo boolean;
  v_lineas_normales jsonb; v_lineas_personalizadas jsonb; v_normales_agrupadas jsonb := '[]'::jsonb; v_personalizadas_calculadas jsonb := '[]'::jsonb;
  v_linea jsonb; v_calculo jsonb; v_producto record; v_ticket_existente record; v_producto_id uuid; v_cantidad_numeric numeric; v_cantidad integer;
  v_tipo_personalizado text; v_total_normal numeric := 0; v_total_personalizado numeric := 0; v_total numeric := 0;
  v_ticket_id uuid; v_folio text; v_fecha text; v_intentos_folio integer := 0;
BEGIN
  v_usuario_id := auth.uid();
  IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'SIN_SESION' USING ERRCODE = '28000'; END IF;
  SELECT u.nombre, u.rol, u.activo INTO v_usuario_nombre, v_usuario_rol, v_usuario_activo FROM public.usuarios AS u WHERE u.id = v_usuario_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERFIL_INVALIDO' USING ERRCODE = '28000'; END IF;
  IF v_usuario_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'USUARIO_INACTIVO' USING ERRCODE = '28000'; END IF;
  IF v_usuario_rol NOT IN ('Admin', 'Vendedor') THEN RAISE EXCEPTION 'ROL_NO_PERMITIDO' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCIA_INVALIDA' USING ERRCODE = '22023'; END IF;
  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('Efectivo', 'Transferencia', 'Tarjeta') THEN RAISE EXCEPTION 'METODO_INVALIDO' USING ERRCODE = '22023'; END IF;
  v_lineas_normales := coalesce(p_lineas_normales, '[]'::jsonb);
  v_lineas_personalizadas := coalesce(p_lineas_personalizadas, '[]'::jsonb);
  IF pg_catalog.jsonb_typeof(v_lineas_normales) <> 'array' OR pg_catalog.jsonb_typeof(v_lineas_personalizadas) <> 'array' THEN RAISE EXCEPTION 'LINEAS_INVALIDAS' USING ERRCODE = '22023'; END IF;
  IF pg_catalog.jsonb_array_length(v_lineas_normales) = 0 AND pg_catalog.jsonb_array_length(v_lineas_personalizadas) = 0 THEN RAISE EXCEPTION 'CARRITO_VACIO' USING ERRCODE = '22023'; END IF;
  IF pg_catalog.jsonb_array_length(v_lineas_normales) > 1000 OR pg_catalog.jsonb_array_length(v_lineas_personalizadas) > 100 THEN RAISE EXCEPTION 'DEMASIADAS_LINEAS' USING ERRCODE = '22023'; END IF;
  FOR v_linea IN SELECT value FROM pg_catalog.jsonb_array_elements(v_lineas_normales) LOOP
    IF pg_catalog.jsonb_typeof(v_linea) <> 'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_linea)) <> 2
       OR NOT (v_linea ? 'producto_id') OR NOT (v_linea ? 'cantidad')
       OR pg_catalog.jsonb_typeof(v_linea -> 'producto_id') <> 'string' OR pg_catalog.jsonb_typeof(v_linea -> 'cantidad') <> 'number' THEN
      RAISE EXCEPTION 'LINEAS_INVALIDAS' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.length(v_linea ->> 'producto_id') > 36
       OR (v_linea ->> 'producto_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       OR pg_catalog.length(v_linea ->> 'cantidad') > 10 OR (v_linea ->> 'cantidad') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'LINEAS_INVALIDAS' USING ERRCODE = '22023';
    END IF;
    v_cantidad_numeric := (v_linea ->> 'cantidad')::numeric;
    IF v_cantidad_numeric < 1 OR v_cantidad_numeric > 2147483647 THEN RAISE EXCEPTION 'LINEAS_INVALIDAS' USING ERRCODE = '22023'; END IF;
    v_cantidad := v_cantidad_numeric::integer;
  END LOOP;
  FOR v_linea IN SELECT value FROM pg_catalog.jsonb_array_elements(v_lineas_personalizadas) LOOP
    IF pg_catalog.jsonb_typeof(v_linea) <> 'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_linea)) <> 3
       OR NOT (v_linea ? 'tipo_personalizado') OR NOT (v_linea ? 'cantidad') OR NOT (v_linea ? 'configuracion')
       OR pg_catalog.jsonb_typeof(v_linea -> 'tipo_personalizado') <> 'string' OR pg_catalog.jsonb_typeof(v_linea -> 'cantidad') <> 'number'
       OR pg_catalog.jsonb_typeof(v_linea -> 'configuracion') <> 'object' THEN
      RAISE EXCEPTION 'LINEAS_PERSONALIZADAS_INVALIDAS' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.length(v_linea ->> 'tipo_personalizado') > 32 OR pg_catalog.length(v_linea ->> 'cantidad') > 10 OR (v_linea ->> 'cantidad') !~ '^[0-9]+$'
       OR pg_catalog.octet_length((v_linea -> 'configuracion')::text) > 262144 THEN
      RAISE EXCEPTION 'LINEAS_PERSONALIZADAS_INVALIDAS' USING ERRCODE = '22023';
    END IF;
    v_cantidad_numeric := (v_linea ->> 'cantidad')::numeric;
    IF v_cantidad_numeric < 1 OR v_cantidad_numeric > 2147483647 THEN RAISE EXCEPTION 'LINEAS_PERSONALIZADAS_INVALIDAS' USING ERRCODE = '22023'; END IF;
    v_cantidad := v_cantidad_numeric::integer;
    v_tipo_personalizado := pg_catalog.upper(pg_catalog.btrim(v_linea ->> 'tipo_personalizado'));
    IF v_tipo_personalizado NOT IN ('CADENA', 'ESTRELLA', 'PINON', 'KIT_SPROCKET', 'SERVICIO_MOTO') THEN RAISE EXCEPTION 'LINEAS_PERSONALIZADAS_INVALIDAS' USING ERRCODE = '22023'; END IF;
  END LOOP;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  SELECT t.ticket_id, t.folio, t.total, t.metodo_pago, t.created_at INTO v_ticket_existente FROM public.ventas_tickets AS t WHERE t.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'idempotente', true, 'ticket_id', v_ticket_existente.ticket_id, 'folio', v_ticket_existente.folio,
      'total', v_ticket_existente.total, 'metodo_pago', v_ticket_existente.metodo_pago, 'created_at', v_ticket_existente.created_at);
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('producto_id', agrupadas.producto_id, 'cantidad', agrupadas.cantidad) ORDER BY agrupadas.producto_id), '[]'::jsonb)
  INTO v_normales_agrupadas
  FROM (SELECT (elemento ->> 'producto_id')::uuid AS producto_id, pg_catalog.sum((elemento ->> 'cantidad')::numeric) AS cantidad
        FROM pg_catalog.jsonb_array_elements(v_lineas_normales) AS entrada(elemento) GROUP BY (elemento ->> 'producto_id')::uuid) AS agrupadas;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_normales_agrupadas) AS entrada(elemento)
             WHERE (elemento ->> 'cantidad')::numeric < 1 OR (elemento ->> 'cantidad')::numeric > 2147483647) THEN
    RAISE EXCEPTION 'LINEAS_INVALIDAS' USING ERRCODE = '22023';
  END IF;
  FOR v_linea IN SELECT value FROM pg_catalog.jsonb_array_elements(v_normales_agrupadas) ORDER BY (value ->> 'producto_id')::uuid LOOP
    v_producto_id := (v_linea ->> 'producto_id')::uuid;
    v_cantidad_numeric := (v_linea ->> 'cantidad')::numeric;
    IF v_cantidad_numeric < 1 OR v_cantidad_numeric > 2147483647 THEN RAISE EXCEPTION 'LINEAS_INVALIDAS' USING ERRCODE = '22023'; END IF;
    v_cantidad := v_cantidad_numeric::integer;
    SELECT p.id, p.codigo, p.nombre, p.precio, p.costo, p.stock, p.archivado INTO v_producto FROM public.productos AS p WHERE p.id = v_producto_id ORDER BY p.id FOR UPDATE OF p;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTO_INEXISTENTE' USING ERRCODE = '22023'; END IF;
    IF v_producto.archivado IS DISTINCT FROM false THEN RAISE EXCEPTION 'PRODUCTO_ARCHIVADO' USING ERRCODE = '22023'; END IF;
    IF v_producto.precio IS NULL OR v_producto.precio < 0 THEN RAISE EXCEPTION 'PRECIO_INVALIDO' USING ERRCODE = '22023'; END IF;
    IF v_producto.stock IS NULL OR v_producto.stock < 0 THEN RAISE EXCEPTION 'STOCK_INVALIDO' USING ERRCODE = '22023'; END IF;
    IF v_cantidad > v_producto.stock THEN RAISE EXCEPTION 'STOCK_INSUFICIENTE' USING ERRCODE = '22023'; END IF;
    v_total_normal := v_total_normal + (v_producto.precio * v_cantidad);
  END LOOP;
  FOR v_linea IN SELECT value FROM pg_catalog.jsonb_array_elements(v_lineas_personalizadas) LOOP
    v_tipo_personalizado := pg_catalog.upper(pg_catalog.btrim(v_linea ->> 'tipo_personalizado'));
    v_cantidad_numeric := (v_linea ->> 'cantidad')::numeric;
    IF v_cantidad_numeric < 1 OR v_cantidad_numeric > 2147483647 THEN RAISE EXCEPTION 'LINEAS_PERSONALIZADAS_INVALIDAS' USING ERRCODE = '22023'; END IF;
    v_cantidad := v_cantidad_numeric::integer;
    v_calculo := public.calcular_linea_personalizada(v_tipo_personalizado, v_linea -> 'configuracion');
    v_total_personalizado := v_total_personalizado + ((v_calculo ->> 'precio_unitario')::numeric * v_cantidad);
    v_personalizadas_calculadas := v_personalizadas_calculadas || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo_personalizado', v_tipo_personalizado, 'cantidad', v_cantidad, 'calculo', v_calculo));
  END LOOP;
  v_total := pg_catalog.round(v_total_normal + v_total_personalizado, 2);
  IF v_total < 0 THEN RAISE EXCEPTION 'TOTAL_INVALIDO' USING ERRCODE = '22023'; END IF;
  v_ticket_id := pg_catalog.gen_random_uuid();
  v_fecha := pg_catalog.to_char(current_timestamp AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD');
  LOOP
    v_folio := 'FLV-' || v_fecha || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_ticket_id::text, '-', ''), 1, 12));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.ventas_tickets AS t WHERE t.folio = v_folio);
    v_intentos_folio := v_intentos_folio + 1;
    IF v_intentos_folio >= 20 THEN RAISE EXCEPTION 'NO_FUE_POSIBLE_GENERAR_FOLIO' USING ERRCODE = '23505'; END IF;
    v_ticket_id := pg_catalog.gen_random_uuid();
  END LOOP;
  INSERT INTO public.ventas_tickets (ticket_id, folio, idempotency_key, metodo_pago, usuario_id, usuario_nombre, total, created_at)
  VALUES (v_ticket_id, v_folio, p_idempotency_key, p_metodo_pago, v_usuario_id, v_usuario_nombre, v_total, pg_catalog.now());
  FOR v_linea IN SELECT value FROM pg_catalog.jsonb_array_elements(v_normales_agrupadas) ORDER BY (value ->> 'producto_id')::uuid LOOP
    v_producto_id := (v_linea ->> 'producto_id')::uuid;
    v_cantidad_numeric := (v_linea ->> 'cantidad')::numeric;
    IF v_cantidad_numeric < 1 OR v_cantidad_numeric > 2147483647 THEN RAISE EXCEPTION 'LINEAS_INVALIDAS' USING ERRCODE = '22023'; END IF;
    v_cantidad := v_cantidad_numeric::integer;
    SELECT p.id, p.codigo, p.nombre, p.precio, p.costo, p.stock INTO v_producto FROM public.productos AS p WHERE p.id = v_producto_id;
    UPDATE public.productos AS p SET stock = v_producto.stock - v_cantidad WHERE p.id = v_producto_id;
    INSERT INTO public.movimientos_inventario (producto_id, codigo, nombre, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, nota, created_at, origen, ticket_id, folio)
    VALUES (v_producto_id, v_producto.codigo, v_producto.nombre, 'Venta', v_cantidad, v_producto.stock, v_producto.stock - v_cantidad, 'Salida por venta', pg_catalog.now(), 'SISTEMA', v_ticket_id, v_folio);
    INSERT INTO public.ventas (id, producto_id, codigo, nombre, precio, costo_unitario, cantidad, total, metodo_pago, created_at, ticket_id, folio)
    VALUES (pg_catalog.gen_random_uuid(), v_producto_id, v_producto.codigo, v_producto.nombre, v_producto.precio, v_producto.costo, v_cantidad,
            pg_catalog.round(v_producto.precio * v_cantidad, 2), p_metodo_pago, pg_catalog.now(), v_ticket_id, v_folio);
  END LOOP;
  FOR v_linea IN SELECT value FROM pg_catalog.jsonb_array_elements(v_personalizadas_calculadas) LOOP
    v_calculo := v_linea -> 'calculo';
    v_cantidad_numeric := (v_linea ->> 'cantidad')::numeric;
    IF v_cantidad_numeric < 1 OR v_cantidad_numeric > 2147483647 THEN RAISE EXCEPTION 'LINEAS_PERSONALIZADAS_INVALIDAS' USING ERRCODE = '22023'; END IF;
    v_cantidad := v_cantidad_numeric::integer;
    INSERT INTO public.ventas_personalizadas (id, ticket_id, folio, tipo_personalizado, nombre, resumen, configuracion, precio_unitario, cantidad, total, costo_unitario, metodo_pago, created_at, created_by)
    VALUES (pg_catalog.gen_random_uuid(), v_ticket_id, v_folio, v_linea ->> 'tipo_personalizado', v_calculo ->> 'nombre', v_calculo ->> 'resumen', v_calculo -> 'configuracion',
            (v_calculo ->> 'precio_unitario')::numeric, v_cantidad, pg_catalog.round((v_calculo ->> 'precio_unitario')::numeric * v_cantidad, 2), NULL, p_metodo_pago, pg_catalog.now(), v_usuario_id);
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'idempotente', false, 'ticket_id', v_ticket_id, 'folio', v_folio, 'total', v_total,
    'total_normal', pg_catalog.round(v_total_normal, 2), 'total_personalizado', pg_catalog.round(v_total_personalizado, 2), 'metodo_pago', p_metodo_pago);
EXCEPTION
  WHEN unique_violation THEN
    SELECT t.ticket_id, t.folio, t.total, t.metodo_pago, t.created_at INTO v_ticket_existente FROM public.ventas_tickets AS t WHERE t.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok', true, 'idempotente', true, 'ticket_id', v_ticket_existente.ticket_id, 'folio', v_ticket_existente.folio,
        'total', v_ticket_existente.total, 'metodo_pago', v_ticket_existente.metodo_pago, 'created_at', v_ticket_existente.created_at);
    END IF;
    RAISE;
END;
$$;

-- ===== Transcripción de producción: procesar_devolucion =====
create function public.procesar_devolucion(p_idempotency_key uuid, p_motivo text, p_lineas jsonb, p_motivo_otro text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_usuario_id uuid; v_usuario_nombre public.usuarios.nombre%type; v_usuario_rol public.usuarios.rol%type; v_usuario_activo public.usuarios.activo%type;
  v_devolucion_id public.devoluciones.id%type; v_ticket_id public.ventas.ticket_id%type; v_folio public.ventas.folio%type; v_metodo_pago public.ventas.metodo_pago%type;
  v_venta record; v_linea record; v_producto record; v_existente record;
  v_cantidad_solicitada numeric; v_cantidad_devuelta numeric; v_cantidad_disponible numeric;
  v_total_devuelto numeric := 0; v_costo_revertido numeric := 0; v_utilidad_revertida numeric := 0; v_hay_costo_desconocido boolean := false;
  v_productos integer := 0;
begin
  v_usuario_id := auth.uid();
  if v_usuario_id is null then raise exception using errcode = 'P0001', message = 'SIN_SESION: Debes iniciar sesión.'; end if;
  select u.nombre, u.rol, u.activo into v_usuario_nombre, v_usuario_rol, v_usuario_activo from public.usuarios u where u.id = v_usuario_id;
  if not found then raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: El usuario no tiene un perfil autorizado.'; end if;
  if v_usuario_activo is distinct from true then raise exception using errcode = 'P0001', message = 'USUARIO_INACTIVO: El usuario está inactivo.'; end if;
  if v_usuario_rol not in ('Admin', 'Vendedor') then raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: El usuario no puede procesar devoluciones.'; end if;
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'IDEMPOTENCIA_INVALIDA: Falta idempotency_key.'; end if;
  if p_motivo not in ('Producto incorrecto', 'No le quedó', 'Defecto', 'Cambio de opinión', 'Cambio por otro producto', 'Otro') then
    raise exception using errcode = 'P0001', message = 'MOTIVO_INVALIDO: El motivo seleccionado no es válido.';
  end if;
  if p_motivo = 'Otro' and nullif(btrim(coalesce(p_motivo_otro, '')), '') is null then raise exception using errcode = 'P0001', message = 'MOTIVO_INVALIDO: Especifica el motivo de la devolución.'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: Debes seleccionar al menos un producto.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lineas) elemento
    where jsonb_typeof(elemento) <> 'object' or nullif(btrim(elemento->>'venta_id'), '') is null or nullif(btrim(elemento->>'cantidad'), '') is null
       or (elemento->>'cantidad') !~ '^[0-9]+$' or (elemento->>'cantidad')::numeric <= 0
  ) then raise exception using errcode = 'P0001', message = 'LINEAS_INVALIDAS: Venta o cantidad no válida.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select d.id, d.folio, d.total_devuelto into v_existente from public.devoluciones d where d.idempotency_key = p_idempotency_key;
  if found then
    select count(distinct dd.producto_id) into v_productos from public.devoluciones_detalle dd where dd.devolucion_id = v_existente.id;
    return jsonb_build_object('ok', true, 'idempotente', true, 'devolucion_id', v_existente.id, 'folio', v_existente.folio, 'total_devuelto', v_existente.total_devuelto, 'productos', v_productos);
  end if;
  perform 1 from public.ventas v
  join (select elemento->>'venta_id' as venta_id, sum((elemento->>'cantidad')::numeric) as cantidad from jsonb_array_elements(p_lineas) elemento group by elemento->>'venta_id') entrada on v.id::text = entrada.venta_id
  order by v.id::text for update of v;
  for v_linea in
    select elemento->>'venta_id' as venta_id, sum((elemento->>'cantidad')::numeric) as cantidad from jsonb_array_elements(p_lineas) elemento group by elemento->>'venta_id' order by elemento->>'venta_id'
  loop
    select v.* into v_venta from public.ventas v where v.id::text = v_linea.venta_id;
    if not found then raise exception using errcode = 'P0001', message = 'VENTA_INEXISTENTE: Una venta seleccionada no existe.'; end if;
    if v_venta.codigo = 'ABONO' then raise exception using errcode = 'P0001', message = 'ABONO_NO_DEVOLVIBLE: Los abonos no admiten devoluciones.'; end if;
    if v_venta.ticket_id is null or nullif(btrim(v_venta.folio), '') is null then raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: La venta no tiene ticket_id o folio.'; end if;
    if v_venta.producto_id is null then raise exception using errcode = 'P0001', message = 'PRODUCTO_INEXISTENTE: La venta no tiene producto asociado.'; end if;
    if v_venta.cantidad is null or v_venta.cantidad <= 0 or v_venta.cantidad <> trunc(v_venta.cantidad) then raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: La cantidad original de la venta no es válida.'; end if;
    if v_venta.precio is null or v_venta.precio < 0 then raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: El precio histórico no es válido.'; end if;
    if v_venta.metodo_pago is null or nullif(btrim(v_venta.metodo_pago), '') is null then raise exception using errcode = 'P0001', message = 'METODO_INCONSISTENTE: La venta no tiene método de pago.'; end if;
    if not exists (select 1 from public.productos p where p.id = v_venta.producto_id) then raise exception using errcode = 'P0001', message = 'PRODUCTO_INEXISTENTE: El producto vendido ya no existe.'; end if;
    if v_ticket_id is null then
      v_ticket_id := v_venta.ticket_id; v_folio := v_venta.folio; v_metodo_pago := v_venta.metodo_pago;
    elsif v_ticket_id is distinct from v_venta.ticket_id or v_folio is distinct from v_venta.folio then
      raise exception using errcode = 'P0001', message = 'TICKET_INVALIDO: Las líneas pertenecen a tickets distintos.';
    elsif v_metodo_pago is distinct from v_venta.metodo_pago then
      raise exception using errcode = 'P0001', message = 'METODO_INCONSISTENTE: El ticket contiene métodos de pago distintos.';
    end if;
    select coalesce(sum(dd.cantidad), 0) into v_cantidad_devuelta from public.devoluciones_detalle dd where dd.venta_id = v_venta.id;
    v_cantidad_solicitada := v_linea.cantidad;
    v_cantidad_disponible := v_venta.cantidad - v_cantidad_devuelta;
    if v_cantidad_solicitada > v_cantidad_disponible then
      raise exception using errcode = 'P0001', message = format('CANTIDAD_EXCEDIDA: La venta %s sólo tiene %s pieza(s) disponibles.', v_venta.id, greatest(v_cantidad_disponible, 0));
    end if;
    v_total_devuelto := v_total_devuelto + (v_venta.precio * v_cantidad_solicitada);
    if v_venta.costo_unitario is null then v_hay_costo_desconocido := true;
    else
      v_costo_revertido := v_costo_revertido + (v_venta.costo_unitario * v_cantidad_solicitada);
      v_utilidad_revertida := v_utilidad_revertida + ((v_venta.precio - v_venta.costo_unitario) * v_cantidad_solicitada);
    end if;
  end loop;
  perform 1 from public.productos p
  where p.id in (select distinct v.producto_id from public.ventas v join (select elemento->>'venta_id' as venta_id from jsonb_array_elements(p_lineas) elemento group by elemento->>'venta_id') entrada on v.id::text = entrada.venta_id)
  order by p.id::text for update;
  if (select count(distinct p.id) from public.productos p where p.id in (select distinct v.producto_id from public.ventas v join (select elemento->>'venta_id' as venta_id from jsonb_array_elements(p_lineas) elemento group by elemento->>'venta_id') entrada on v.id::text = entrada.venta_id))
     <> (select count(distinct v.producto_id) from public.ventas v join (select elemento->>'venta_id' as venta_id from jsonb_array_elements(p_lineas) elemento group by elemento->>'venta_id') entrada on v.id::text = entrada.venta_id) then
    raise exception using errcode = 'P0001', message = 'PRODUCTO_INEXISTENTE: Uno de los productos ya no existe.';
  end if;
  insert into public.devoluciones (idempotency_key, ticket_id, folio, total_devuelto, costo_revertido, utilidad_revertida, metodo_pago, motivo, motivo_otro, usuario_id, usuario_nombre)
  values (p_idempotency_key, v_ticket_id, v_folio, v_total_devuelto,
    case when v_hay_costo_desconocido then null else v_costo_revertido end, case when v_hay_costo_desconocido then null else v_utilidad_revertida end,
    v_metodo_pago, p_motivo, case when p_motivo = 'Otro' then nullif(btrim(p_motivo_otro), '') else null end, v_usuario_id, v_usuario_nombre)
  returning id into v_devolucion_id;
  for v_linea in
    select elemento->>'venta_id' as venta_id, sum((elemento->>'cantidad')::numeric) as cantidad from jsonb_array_elements(p_lineas) elemento group by elemento->>'venta_id' order by elemento->>'venta_id'
  loop
    select v.* into strict v_venta from public.ventas v where v.id::text = v_linea.venta_id;
    insert into public.devoluciones_detalle (devolucion_id, venta_id, producto_id, codigo, nombre, cantidad, precio_unitario_original, costo_unitario_original, subtotal_devuelto, utilidad_revertida)
    values (v_devolucion_id, v_venta.id, v_venta.producto_id, v_venta.codigo, v_venta.nombre, v_linea.cantidad, v_venta.precio, v_venta.costo_unitario, v_venta.precio * v_linea.cantidad,
      case when v_venta.costo_unitario is null then null else (v_venta.precio - v_venta.costo_unitario) * v_linea.cantidad end);
  end loop;
  for v_producto in
    select p.id, p.codigo, p.nombre, p.stock, sum(entrada.cantidad) as cantidad from public.productos p join public.ventas v on v.producto_id = p.id
    join (select elemento->>'venta_id' as venta_id, sum((elemento->>'cantidad')::numeric) as cantidad from jsonb_array_elements(p_lineas) elemento group by elemento->>'venta_id') entrada on v.id::text = entrada.venta_id
    group by p.id, p.codigo, p.nombre, p.stock order by p.id::text
  loop
    if v_producto.stock is null or v_producto.stock < 0 then
      raise exception using errcode = 'P0001', message = 'PRODUCTO_INVALIDO: El stock actual no es válido.';
    end if;
    update public.productos set stock = v_producto.stock + v_producto.cantidad where id = v_producto.id;
    insert into public.movimientos_inventario (producto_id, codigo, nombre, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, nota)
    values (v_producto.id, v_producto.codigo, v_producto.nombre, 'DEVOLUCION', v_producto.cantidad, v_producto.stock, v_producto.stock + v_producto.cantidad, 'Devolución venta ' || v_folio);
    v_productos := v_productos + 1;
  end loop;
  return jsonb_build_object('ok', true, 'idempotente', false, 'devolucion_id', v_devolucion_id, 'folio', v_folio, 'total_devuelto', v_total_devuelto, 'productos', v_productos);
exception
  when unique_violation then
    select d.id, d.folio, d.total_devuelto into v_existente from public.devoluciones d where d.idempotency_key = p_idempotency_key;
    if found then
      select count(distinct dd.producto_id) into v_productos from public.devoluciones_detalle dd where dd.devolucion_id = v_existente.id;
      return jsonb_build_object('ok', true, 'idempotente', true, 'devolucion_id', v_existente.id, 'folio', v_existente.folio, 'total_devuelto', v_existente.total_devuelto, 'productos', v_productos);
    end if;
    raise;
end;
$$;

-- ===== Transcripción de producción: cambiar_stock_producto =====
create function public.cambiar_stock_producto(p_producto_id uuid, p_stock_esperado integer, p_stock_nuevo integer, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_usuario_id uuid; v_usuario_activo boolean; v_usuario_rol text;
  v_codigo text; v_nombre text; v_stock_actual integer; v_diferencia integer; v_motivo_limpio text; v_nota text;
begin
  v_usuario_id := auth.uid();
  if v_usuario_id is null then raise exception using errcode = 'P0001', message = 'SIN_SESION: No existe una sesión autenticada.'; end if;
  select u.activo, u.rol into v_usuario_activo, v_usuario_rol from public.usuarios as u where u.id = v_usuario_id;
  if not found then raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: El usuario no tiene un perfil autorizado.'; end if;
  if v_usuario_activo is distinct from true then raise exception using errcode = 'P0001', message = 'USUARIO_INACTIVO: El usuario está inactivo.'; end if;
  if v_usuario_rol is distinct from 'Admin' then raise exception using errcode = 'P0001', message = 'ROL_NO_PERMITIDO: Esta operación requiere el rol Admin.'; end if;
  if p_producto_id is null then raise exception using errcode = 'P0001', message = 'PRODUCTO_INEXISTENTE: El producto no es válido.'; end if;
  if p_stock_esperado is null or p_stock_esperado < 0 then
    raise exception using errcode = 'P0001', message = 'STOCK_INVALIDO: El stock esperado debe ser un entero mayor o igual a cero.';
  end if;
  if p_stock_nuevo is null or p_stock_nuevo < 0 then raise exception using errcode = 'P0001', message = 'STOCK_INVALIDO: El stock nuevo debe ser un entero mayor o igual a cero.'; end if;
  if p_motivo is not null and pg_catalog.char_length(p_motivo) > 500 then raise exception using errcode = 'P0001', message = 'MOTIVO_INVALIDO: El motivo no puede superar 500 caracteres.'; end if;
  select p.codigo, p.nombre, p.stock into v_codigo, v_nombre, v_stock_actual from public.productos as p where p.id = p_producto_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'PRODUCTO_INEXISTENTE: El producto no existe.'; end if;
  if v_stock_actual is null or v_stock_actual < 0 then
    raise exception using errcode = 'P0001', message = 'STOCK_INVALIDO: El producto tiene un stock almacenado inválido.';
  end if;
  if v_stock_actual <> p_stock_esperado then
    return pg_catalog.jsonb_build_object('ok', false, 'codigo', 'STOCK_CAMBIO', 'mensaje', 'El stock cambió desde que abriste el ajuste.', 'producto_id', p_producto_id,
      'stock_esperado', p_stock_esperado, 'stock_actual', v_stock_actual, 'stock_nuevo_solicitado', p_stock_nuevo);
  end if;
  if v_stock_actual = p_stock_nuevo then
    return pg_catalog.jsonb_build_object('ok', true, 'codigo', 'STOCK_SIN_CAMBIOS', 'mensaje', 'Stock sin cambios.', 'producto_id', p_producto_id,
      'stock_anterior', v_stock_actual, 'stock_nuevo', v_stock_actual, 'diferencia', 0, 'movimiento_creado', false);
  end if;
  v_diferencia := p_stock_nuevo - v_stock_actual;
  v_motivo_limpio := nullif(pg_catalog.btrim(p_motivo), '');
  if v_motivo_limpio is null then v_nota := 'Cambio manual de stock'; else v_nota := 'Cambio manual de stock: ' || v_motivo_limpio; end if;
  update public.productos set stock = p_stock_nuevo where id = p_producto_id;
  insert into public.movimientos_inventario (producto_id, codigo, nombre, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, nota, ticket_id, folio)
  values (p_producto_id, coalesce(v_codigo, ''), coalesce(v_nombre, ''), 'AJUSTE_STOCK', v_diferencia, v_stock_actual, p_stock_nuevo, v_nota, null, null);
  return pg_catalog.jsonb_build_object('ok', true, 'codigo', 'STOCK_ACTUALIZADO', 'mensaje', 'Stock actualizado.', 'producto_id', p_producto_id,
    'stock_anterior', v_stock_actual, 'stock_nuevo', p_stock_nuevo, 'diferencia', v_diferencia, 'movimiento_creado', true);
end;
$$;

-- Permisos como en producción (tras fastlook_*: authenticated ejecuta; calcular_linea_personalizada sólo por definer).
revoke all on function public.calcular_linea_personalizada(text,jsonb) from public;
grant execute on function public.procesar_venta(uuid,text,jsonb), public.procesar_venta_mixta(uuid,text,jsonb,jsonb),
  public.procesar_devolucion(uuid,text,jsonb,text), public.cambiar_stock_producto(uuid,integer,integer,text) to authenticated;
revoke all on function public.procesar_venta(uuid,text,jsonb), public.procesar_venta_mixta(uuid,text,jsonb,jsonb),
  public.procesar_devolucion(uuid,text,jsonb,text), public.cambiar_stock_producto(uuid,integer,integer,text) from public;
