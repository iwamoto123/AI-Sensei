create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'analyzing', 'analyzed', 'failed')),
  subject text not null default 'math',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  type text not null check (type in ('problem_image', 'answer_image')),
  path text not null,
  created_at timestamptz not null default now()
);

create index if not exists assets_job_id_idx on public.assets(job_id);

create table if not exists public.explanations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  problem_summary text not null,
  topic text not null,
  solution_outline text not null,
  why_this_method text not null,
  common_pitfalls text not null,
  solution_result jsonb,
  visual_model jsonb,
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id)
);

alter table public.explanations
  add column if not exists solution_result jsonb;

alter table public.explanations
  add column if not exists visual_model jsonb;

create table if not exists public.slide_projects (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  marp_markdown text not null,
  theme_name text not null default 'default',
  status text not null default 'generated'
    check (status in ('generating', 'generated', 'failed')),
  html_content text,
  html_status text check (html_status in ('generating', 'generated', 'failed')),
  html_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id)
);

create table if not exists public.visual_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  type text not null check (
    type in (
      'function_graph',
      'number_line',
      'triangle',
      'right_triangle_specific'
    )
  ),
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'generated', 'failed')),
  spec_json jsonb,
  svg_content text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, type)
);

insert into storage.buckets (id, name, public)
values
  ('problem-images', 'problem-images', true),
  ('answer-images', 'answer-images', true)
on conflict (id) do update set public = excluded.public;
