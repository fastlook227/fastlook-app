-- FAST LOOK · reversión de fastlook_seguridad_tablas_operativas.sql. SÓLO PARA EMERGENCIAS:
-- devuelve el estado inseguro anterior (escrituras anónimas y RLS desactivada en las tablas operativas).
-- Restaura exactamente los privilegios respaldados de anon/authenticated, el estado de RLS y el privilegio por
-- defecto de anon; elimina sólo las políticas creadas por la migración. operar_producto_admin y su tabla se
-- conservan (el frontend nuevo las usa y no amplían permisos). No borra ni modifica filas.
begin;
do $$
declare v record; v_privilegio text; v_rol text;
begin
  if not exists (select 1 from public.fastlook_seguridad_respaldo where migracion = 'seguridad_fase_a_v1') then
    raise exception 'RESPALDO_INEXISTENTE: no se encontró el respaldo de seguridad_fase_a_v1';
  end if;
  drop policy if exists productos_select_personal_activo on public.productos;
  drop policy if exists productos_delete_admin_activo on public.productos;
  drop policy if exists ventas_select_personal_activo on public.ventas;
  drop policy if exists ventas_insert_abono_personal_activo on public.ventas;
  drop policy if exists movimientos_select_personal_activo on public.movimientos_inventario;
  for v in select * from public.fastlook_seguridad_respaldo where migracion = 'seguridad_fase_a_v1' and objeto <> '__default_acl_postgres__' loop
    continue when to_regclass(v.objeto) is null;
    foreach v_rol in array array['anon','authenticated'] loop
      for v_privilegio in select jsonb_array_elements_text(v.privilegios -> v_rol) loop
        execute format('grant %s on table %s to %I', v_privilegio, v.objeto, v_rol);
      end loop;
    end loop;
    if v.objeto in ('public.productos','public.ventas','public.movimientos_inventario') and v.rls_activa = false then
      execute format('alter table %s disable row level security', v.objeto);
    end if;
  end loop;
  for v_privilegio in select jsonb_array_elements_text(privilegios -> 'anon') from public.fastlook_seguridad_respaldo
                      where migracion = 'seguridad_fase_a_v1' and objeto = '__default_acl_postgres__' loop
    execute format('alter default privileges for role postgres in schema public grant %s on tables to anon', v_privilegio);
  end loop;
end $$;
commit;
