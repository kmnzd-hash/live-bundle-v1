-- 1) Configs
create table if not exists configs (
  id serial primary key,
  name text not null,
  description text
);

-- 2) Offers
create table if not exists offers (
  id serial primary key,
  config_id int references configs(id),
  name text not null,
  price numeric(12,2) not null,
  currency text default 'PHP'
);

-- 3) Royalties metadata (static mapping)
create table if not exists royalties_metadata (
  id serial primary key,
  bundle_type text,
  entity_from text,
  entity_to text,
  ip_holder text,
  override_pct text, -- e.g. '20/20/60' ip/creator/referrer
  vault_id text,
  creator_id text,
  referrer_id text,
  reuse_event text
);

-- 4) Sales (new purchases)
create table if not exists sales (
  id serial primary key,
  offer_id int references offers(id),
  sale_amount numeric(12,2) not null,
  sale_currency text default 'PHP',
  buyer text,
  sale_date timestamptz default now(),
  vault_id text,
  creator_id text,
  referrer_id text,
  reuse_event text,
  override_pct text,
  ip_holder text
);

-- 5) Payouts (generated automatically)
create table if not exists payouts (
  id serial primary key,
  sale_id int references sales(id),
  recipient_role text, -- 'ip_holder'|'creator'|'referrer'
  recipient_id text,
  pct numeric(5,2),
  amount numeric(12,2),
  status text default 'queued',
  notion_sync boolean default false,
  notion_page_url text,
  created_at timestamptz default now(),
  sent_at timestamptz
);

-- Trigger function to auto-create payouts
create or replace function create_payouts_for_sale() returns trigger as $$
declare
  ip_pct numeric;
  creator_pct numeric;
  referrer_pct numeric;
  amount_ip numeric;
  amount_creator numeric;
  amount_referrer numeric;
begin
  ip_pct := (split_part(NEW.override_pct, '/', 1))::numeric;
  creator_pct := (split_part(NEW.override_pct, '/', 2))::numeric;
  referrer_pct := (split_part(NEW.override_pct, '/', 3))::numeric;

  amount_ip := round( NEW.sale_amount * ip_pct / 100.0, 2);
  amount_creator := round( NEW.sale_amount * creator_pct / 100.0, 2);
  amount_referrer := round( NEW.sale_amount * referrer_pct / 100.0, 2);

  insert into payouts(sale_id, recipient_role, recipient_id, pct, amount, status)
    values (NEW.id, 'ip_holder', NEW.ip_holder, ip_pct, amount_ip, 'queued');

  insert into payouts(sale_id, recipient_role, recipient_id, pct, amount, status)
    values (NEW.id, 'creator', NEW.creator_id, creator_pct, amount_creator, 'queued');

  insert into payouts(sale_id, recipient_role, recipient_id, pct, amount, status)
    values (NEW.id, 'referrer', NEW.referrer_id, referrer_pct, amount_referrer, 'queued');

  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_after_sale_insert on sales;
create trigger trg_after_sale_insert
  after insert on sales
  for each row
  execute function create_payouts_for_sale();
