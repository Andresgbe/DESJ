-- Finanzas pasa de YO a Módulos: nuevo tipo de módulo 'finanzas' (uno por persona).
-- Los datos NO se mueven: siguen en finance_transactions, finance_categories, finance_rates, deudas y presupuesto,
-- ligados a la persona (user_id), no al módulo. Quitar el módulo no borra nada de eso.

alter table public.modules drop constraint modules_kind_check;
alter table public.modules add constraint modules_kind_check
  check (kind in ('negocios', 'vehiculo', 'nomore', 'tobuy', 'universidad', 'horarios', 'goals', 'finanzas'));

-- Quien ya usaba Finanzas la encuentra en Módulos, al final de su lista.
insert into public.modules (user_id, kind, name, description, position)
select u.user_id, 'finanzas', 'Finanzas', '',
       coalesce((select max(m.position) + 1 from public.modules m where m.user_id = u.user_id), 0)
from (select distinct user_id from public.finance_transactions) u
where not exists (select 1 from public.modules m where m.user_id = u.user_id and m.kind = 'finanzas');
