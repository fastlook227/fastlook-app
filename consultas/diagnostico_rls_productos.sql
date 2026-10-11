-- SOLO LECTURA: muestra las políticas y privilegios efectivos de productos.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'productos'
order by policyname;

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'productos'
  and column_name in ('imagen_url', 'imagen_thumbnail_url')
order by grantee, column_name, privilege_type;
