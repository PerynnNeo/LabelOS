-- ============================================================================
-- LabelOS initial migration
--
-- Run this file in the Supabase SQL editor (or with the Supabase CLI).
-- It is written to be safe to run more than once.
--
-- Security model: Row Level Security is ENABLED on every table and NO
-- policies are created. All application access goes through server routes
-- using the service-role key, which bypasses RLS. Anonymous / anon-key access
-- is therefore denied everywhere.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at trigger function (applied to every table with updated_at)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- app_settings — single-row brand configuration
-- ----------------------------------------------------------------------------
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  brand_slug text not null,
  brand_profile jsonb not null default '{}'::jsonb,
  currency text not null default 'SGD',
  market text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- products — uploaded, Shopify-imported, or seeded catalog items
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('upload', 'shopify', 'seed')),
  external_id text,
  shopify_gid text,
  title text not null,
  description text not null default '',
  vendor text not null default '',
  product_type text not null default '',
  sku text not null default '',
  price numeric(10, 2) not null default 0 check (price >= 0),
  inventory_quantity integer not null default 0 check (inventory_quantity >= 0),
  image_path text,
  public_image_url text,
  status text not null default 'active',
  raw_metadata jsonb not null default '{}'::jsonb,
  analysis jsonb,
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'running', 'complete', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate Shopify imports (partial unique index).
create unique index if not exists products_shopify_gid_unique
  on public.products (shopify_gid)
  where shopify_gid is not null;

create index if not exists products_source_idx on public.products (source);
create index if not exists products_analysis_status_idx on public.products (analysis_status);
create index if not exists products_sku_idx on public.products (sku);

-- ----------------------------------------------------------------------------
-- collections
-- ----------------------------------------------------------------------------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'draft',
  brief jsonb not null default '{}'::jsonb,
  trend_report jsonb,
  curation_summary jsonb,
  shopify_collection_gid text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_status_idx on public.collections (status);

-- ----------------------------------------------------------------------------
-- outfits — candidates and finals; product_ids reference public.products rows
-- ----------------------------------------------------------------------------
create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  name text not null default '',
  product_ids uuid[] not null check (array_length(product_ids, 1) >= 1),
  occasion text not null default '',
  generation jsonb not null default '{}'::jsonb,
  review jsonb,
  revision_of uuid references public.outfits (id) on delete set null,
  status text not null default 'candidate'
    check (status in ('candidate', 'approved', 'rejected', 'revised', 'final')),
  overall_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outfits_collection_id_idx on public.outfits (collection_id);
create index if not exists outfits_collection_status_idx on public.outfits (collection_id, status);

-- ----------------------------------------------------------------------------
-- designs — proposed new garments (gap designer output and downstream docs)
-- ----------------------------------------------------------------------------
create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  design_brief jsonb not null default '{}'::jsonb,
  tech_pack jsonb,
  costing jsonb,
  flat_sketch_svg text,
  rendered_image_path text,
  listing_payload jsonb,
  shopify_product_gid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists designs_collection_id_idx on public.designs (collection_id);

-- ----------------------------------------------------------------------------
-- suppliers — leads only; never treated as verified factories automatically
-- ----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default '',
  capabilities text[] not null default '{}',
  minimum_order_quantity integer not null default 0,
  sample_lead_days integer not null default 0,
  production_lead_days integer not null default 0,
  email text,
  verification_status text not null default 'demo'
    check (verification_status in ('demo', 'lead', 'contacted', 'verified')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_verification_status_idx
  on public.suppliers (verification_status);

-- ----------------------------------------------------------------------------
-- rfqs — one row per (design, supplier) request-for-quotation
-- ----------------------------------------------------------------------------
create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  status text not null default 'RFQ_DRAFT'
    check (status in (
      'RFQ_DRAFT',
      'QUOTE_RECEIVED',
      'SUPPLIER_SHORTLISTED',
      'SAMPLE_REQUESTED',
      'SAMPLE_REVIEW',
      'REVISION_REQUIRED',
      'SAMPLE_APPROVED',
      'PRODUCTION_APPROVAL_PENDING'
    )),
  request_payload jsonb not null default '{}'::jsonb,
  quote_payload jsonb,
  score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rfqs_design_id_idx on public.rfqs (design_id);
create index if not exists rfqs_supplier_id_idx on public.rfqs (supplier_id);

-- ----------------------------------------------------------------------------
-- approvals — explicit human approval records for expensive/public actions
-- ----------------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decision_note text not null default '',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists approvals_entity_idx on public.approvals (entity_type, entity_id);
create index if not exists approvals_status_idx on public.approvals (status);

-- ----------------------------------------------------------------------------
-- jobs — idempotent unit-of-work records for every mutation route
-- ----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  entity_type text not null default '',
  entity_id text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'complete', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  error_message text,
  attempt_count integer not null default 0,
  idempotency_key text not null unique,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);

-- ----------------------------------------------------------------------------
-- activity_logs — append-only agent/user activity trail (no updated_at)
-- ----------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity_type text,
  entity_id text,
  input_summary text not null default '',
  output_summary text not null default '',
  provider text,
  model text,
  usage jsonb not null default '{}'::jsonb,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists set_collections_updated_at on public.collections;
create trigger set_collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

drop trigger if exists set_outfits_updated_at on public.outfits;
create trigger set_outfits_updated_at
  before update on public.outfits
  for each row execute function public.set_updated_at();

drop trigger if exists set_designs_updated_at on public.designs;
create trigger set_designs_updated_at
  before update on public.designs
  for each row execute function public.set_updated_at();

drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

drop trigger if exists set_rfqs_updated_at on public.rfqs;
create trigger set_rfqs_updated_at
  before update on public.rfqs
  for each row execute function public.set_updated_at();

drop trigger if exists set_approvals_updated_at on public.approvals;
create trigger set_approvals_updated_at
  before update on public.approvals
  for each row execute function public.set_updated_at();

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, no policies (service-role only)
-- ----------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.products enable row level security;
alter table public.collections enable row level security;
alter table public.outfits enable row level security;
alter table public.designs enable row level security;
alter table public.suppliers enable row level security;
alter table public.rfqs enable row level security;
alter table public.approvals enable row level security;
alter table public.jobs enable row level security;
alter table public.activity_logs enable row level security;

-- ----------------------------------------------------------------------------
-- Storage buckets
--   catalog-private : uploaded/seeded garment images (private)
--   publish-public  : approved assets that Shopify must be able to fetch
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('catalog-private', 'catalog-private', false),
  ('publish-public', 'publish-public', true)
on conflict (id) do nothing;
