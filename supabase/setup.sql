-- Aura Bella Shop / Supabase
-- Ejecutar UNA VEZ en Supabase Dashboard > SQL Editor.
-- El carrito se guarda por usuario y requiere autenticación TOTP (AAL2).
create table if not exists public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id integer not null check (product_id >= 1),
  quantity integer not null check (quantity between 1 and 99),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.cart_items enable row level security;

revoke all on public.cart_items from public, anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;

drop policy if exists "carrito_leer_solo_propio_2fa" on public.cart_items;
drop policy if exists "carrito_agregar_solo_propio_2fa" on public.cart_items;
drop policy if exists "carrito_modificar_solo_propio_2fa" on public.cart_items;
drop policy if exists "carrito_borrar_solo_propio_2fa" on public.cart_items;

create policy "carrito_leer_solo_propio_2fa"
on public.cart_items for select to authenticated
using ((select auth.uid()) = user_id and (select auth.jwt()->>'aal') = 'aal2');

create policy "carrito_agregar_solo_propio_2fa"
on public.cart_items for insert to authenticated
with check ((select auth.uid()) = user_id and (select auth.jwt()->>'aal') = 'aal2');

create policy "carrito_modificar_solo_propio_2fa"
on public.cart_items for update to authenticated
using ((select auth.uid()) = user_id and (select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.uid()) = user_id and (select auth.jwt()->>'aal') = 'aal2');

create policy "carrito_borrar_solo_propio_2fa"
on public.cart_items for delete to authenticated
using ((select auth.uid()) = user_id and (select auth.jwt()->>'aal') = 'aal2');

-- No habilitar permisos de usuario anónimo. Nunca usar service_role en navegador.
