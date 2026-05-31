create extension if not exists pgcrypto;

create table if not exists analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  schema_version text not null,
  match_id text,
  match_key text not null,
  kickoff_at timestamptz,
  home_team text,
  away_team text,
  status text,
  provider text,
  data_source text,
  fallback_reason text,
  source_updated_at timestamptz,
  engine_version text,
  bet_score numeric,
  recommend_level text,
  public_match_snapshot jsonb not null,
  engine_snapshot jsonb not null,
  internal_snapshot jsonb,
  data_quality jsonb,
  cancel_rules jsonb
);

create index if not exists analysis_snapshots_created_at_idx
  on analysis_snapshots (created_at desc);

create index if not exists analysis_snapshots_match_key_idx
  on analysis_snapshots (match_key);

create index if not exists analysis_snapshots_kickoff_at_idx
  on analysis_snapshots (kickoff_at);

create index if not exists analysis_snapshots_teams_idx
  on analysis_snapshots (home_team, away_team);

create index if not exists analysis_snapshots_bet_score_idx
  on analysis_snapshots (bet_score);
