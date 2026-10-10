-- Faltantes: lista compartida e independiente del inventario.
-- Ejecutar una sola vez en Supabase SQL Editor.

create table if not exists public.faltantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (nombre = btrim(nombre) and length(nombre) > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  autor_nombre text
);

create index if not exists faltantes_created_at_idx
  on public.faltantes (created_at desc);

create or replace function public.preparar_faltante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios%rowtype;
begin
  select * into v_usuario
  from public.usuarios as u
  where u.id = auth.uid()
    and u.activo = true
    and u.rol in ('Admin', 'Vendedor');

  if not found then
    raise exception using errcode = '42501', message = 'Se requiere un usuario activo de Fast Look.';
  end if;

  new.nombre := btrim(new.nombre);
  if new.nombre = '' then
    raise exception using errcode = '22023', message = 'El nombre del faltante es obligatorio.';
  end if;
  new.created_by := v_usuario.id;
  new.autor_nombre := v_usuario.nombre;
  return new;
end;
$$;

drop trigger if exists faltantes_preparar_insert on public.faltantes;
create trigger faltantes_preparar_insert
before insert on public.faltantes
for each row execute function public.preparar_faltante();

alter table public.faltantes enable row level security;

create or replace function public.es_usuario_faltantes_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios as u
    where u.id = auth.uid()
      and u.activo = true
      and u.rol in ('Admin', 'Vendedor')
  );
$$;

create policy faltantes_select_personal_activo
on public.faltantes for select to authenticated
using (public.es_usuario_faltantes_activo());

create policy faltantes_insert_personal_activo
on public.faltantes for insert to authenticated
with check (public.es_usuario_faltantes_activo() and created_by = auth.uid());

create policy faltantes_delete_personal_activo
on public.faltantes for delete to authenticated
using (public.es_usuario_faltantes_activo());

grant select, insert, delete on public.faltantes to authenticated;
revoke update on public.faltantes from authenticated;
