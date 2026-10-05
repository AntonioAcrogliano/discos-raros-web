-- Discos Raros: tablas de la pista y del formulario de contacto.
-- Pegar entero en Supabase → SQL Editor → Run. Se puede correr más de una vez.

create table if not exists raros (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null unique,          -- 1 personaje por dispositivo
  ip_hash text not null,                   -- IP hasheada, para el límite por conexión
  name text not null check (char_length(name) between 1 and 12),
  look jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists raros_created_at on raros (created_at desc);
create index if not exists raros_ip on raros (ip_hash, created_at);

create table if not exists mensajes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  kind text not null default '',
  message text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists mensajes_created_at on mensajes (created_at desc);

-- RLS prendido y sin políticas: desde el navegador (anon key) no se puede leer ni escribir.
-- Solo entran las funciones del sitio, que usan la service key.
alter table raros enable row level security;
alter table mensajes enable row level security;

-- La pista: los n_recent más nuevos + n_random al azar del resto.
create or replace function raros_sample(n_recent int, n_random int)
returns table (id uuid, name text, look jsonb)
language sql stable
as $$
  with nuevos as (
    select r.id, r.name, r.look, r.created_at from raros r order by r.created_at desc limit n_recent
  ),
  azar as (
    select r.id, r.name, r.look, r.created_at from raros r
    where r.id not in (select n.id from nuevos n)
    order by random() limit n_random
  )
  select x.id, x.name, x.look from (select * from nuevos union all select * from azar) x;
$$;
