-- LabelOS migration 002 — new-collection creation with generated garment images.
--
-- Additive to 001. Adds the tables the image-generation new-collection flow
-- needs: a brand DNA snapshot, collection slots (one new product to design each),
-- garment design concepts (3 per slot), generated garment images, async image
-- jobs, and the collection coherence review. Run this in the Supabase SQL editor
-- after 001. All new tables have RLS enabled with no anonymous policies (all
-- access is via the service-role server client), and an updated_at trigger.

-- --------------------------------------------------------------------------
-- Extend collections for the new-collection workflow (reuse the existing table)
-- --------------------------------------------------------------------------
alter table collections
  add column if not exists collection_type text not null default 'new_collection',
  add column if not exists workflow_status text,
  add column if not exists brand_dna jsonb,
  add column if not exists plan jsonb,
  add column if not exists collection_review jsonb;

-- --------------------------------------------------------------------------
-- collection_slots — one new product to design
-- --------------------------------------------------------------------------
create table if not exists collection_slots (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  slot_index integer not null,
  provisional_style_id text not null,
  category text not null,
  role text not null,
  target_retail_price numeric(10,2) not null default 0,
  target_fully_loaded_cost numeric(10,2) not null default 0,
  target_margin_percent numeric(6,2) not null default 0,
  slot_json jsonb not null default '{}'::jsonb,
  duplicate_check jsonb not null default '{}'::jsonb,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, slot_index)
);
create index if not exists idx_collection_slots_collection on collection_slots(collection_id);

-- --------------------------------------------------------------------------
-- garment_designs — one design concept (3 per slot)
-- --------------------------------------------------------------------------
create table if not exists garment_designs (
  id uuid primary key default gen_random_uuid(),
  collection_slot_id uuid not null references collection_slots(id) on delete cascade,
  concept_index integer not null,
  style_id text not null,
  name text not null,
  spec_json jsonb not null default '{}'::jsonb,
  concept_status text not null default 'generating'
    check (concept_status in ('generating','shortlisted','recommended','selected','rejected')),
  brand_fit_score numeric(4,3),
  climate_fit_score numeric(4,3),
  manufacturability_score numeric(4,3),
  owner_selected_at timestamptz,
  owner_rejected_at timestamptz,
  revision_of_design_id uuid references garment_designs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_slot_id, concept_index)
);
create index if not exists idx_garment_designs_slot on garment_designs(collection_slot_id);

-- --------------------------------------------------------------------------
-- garment_images — generated concept sheets, packshots, technical flats
-- --------------------------------------------------------------------------
create table if not exists garment_images (
  id uuid primary key default gen_random_uuid(),
  garment_design_id uuid not null references garment_designs(id) on delete cascade,
  image_type text not null,
  provider text not null,
  provider_job_id text,
  prompt text,
  negative_prompt text,
  seed bigint,
  status text not null default 'queued'
    check (status in ('queued','generating','running_qa','ready','needs_regeneration','failed','canceled')),
  provider_output_url text,
  stored_url text,
  width integer,
  height integer,
  qa_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_garment_images_design on garment_images(garment_design_id);
create index if not exists idx_garment_images_type on garment_images(garment_design_id, image_type);

-- --------------------------------------------------------------------------
-- image_generation_jobs — async job records (idempotent, serverless-safe)
-- --------------------------------------------------------------------------
create table if not exists image_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references collections(id) on delete cascade,
  garment_design_id uuid references garment_designs(id) on delete cascade,
  garment_image_id uuid references garment_images(id) on delete cascade,
  provider text not null,
  provider_job_id text,
  job_type text not null,
  status text not null default 'queued'
    check (status in ('queued','generating','running_qa','ready','needs_regeneration','failed','canceled')),
  attempt_count integer not null default 0,
  idempotency_key text unique,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb,
  error_json jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_image_jobs_collection on image_generation_jobs(collection_id);
create index if not exists idx_image_jobs_status on image_generation_jobs(status);

-- --------------------------------------------------------------------------
-- collection_reviews — the selected designs judged as one collection
-- --------------------------------------------------------------------------
create table if not exists collection_reviews (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  review_json jsonb not null default '{}'::jsonb,
  score numeric(5,2),
  blocking_issues jsonb not null default '[]'::jsonb,
  revision_required boolean not null default false,
  owner_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_collection_reviews_collection on collection_reviews(collection_id);

-- --------------------------------------------------------------------------
-- updated_at triggers (reuse the function created in 001)
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'collection_slots','garment_designs','garment_images',
    'image_generation_jobs','collection_reviews'
  ] loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()',
      t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- Row Level Security — enabled, no anonymous policies (service-role only)
-- --------------------------------------------------------------------------
alter table collection_slots enable row level security;
alter table garment_designs enable row level security;
alter table garment_images enable row level security;
alter table image_generation_jobs enable row level security;
alter table collection_reviews enable row level security;

-- --------------------------------------------------------------------------
-- Storage: public bucket for generated concept images (live webp output).
-- Mock SVG concepts are stored inline as data URIs and do not need this bucket.
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('design-concepts', 'design-concepts', true)
on conflict (id) do nothing;
