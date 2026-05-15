-- Course — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor (project: xsmnfcmtbpeaccnyinkr).
-- All tables prefixed `course_` to avoid collision with the rest of the suite.

create table course_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  pillar text,
  target_date date,
  status text default 'active',
  notion_url text,
  progress_pct int,
  current_state_label text,
  created_at timestamptz not null default now()
);

create table course_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  outcome text,
  notes text,
  status text not null default 'active'
    check (status in ('active','idea','paused','done','archived','routine','under_review')),
  priority text check (priority in ('low','medium','high')),
  start_date date,
  due_date date,
  completed_date date,
  pillar text,
  work_area text,
  goal_id uuid references course_goals(id) on delete set null,
  notion_url text,
  progress_pct int check (progress_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table course_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references course_projects(id) on delete cascade,
  title text not null,
  status text not null default 'next'
    check (status in ('triage','next','in_progress','waiting','done','dropped','pushed')),
  do_date date,
  completed_date date,
  effort text check (effort in ('15m','30m','1h','2h+')),
  work_type text check (work_type in ('scheduled','deep','admin')),
  type text check (type in ('home','away')),
  notes text,
  person_dependency text,
  work_area text,
  reminders_uuid text,
  notion_url text,
  day_order int,
  reschedule_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table course_captures (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  suggested_project_id uuid references course_projects(id) on delete set null,
  suggested_task_title text,
  work_area text,
  status text not null default 'pending'
    check (status in ('pending','processed','dismissed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table course_pulses (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  narrative_text text,
  breakdown_json jsonb,
  one_question_text text,
  one_question_answer text,
  created_at timestamptz not null default now()
);

create table course_reviews (
  id uuid primary key default gen_random_uuid(),
  review_type text not null check (review_type in ('monday_open','friday_close')),
  week_of date not null,
  narrative_text text,
  decisions_json jsonb,
  answers_json jsonb,
  pushed_to_still boolean default false,
  created_at timestamptz not null default now()
);

create table course_stall_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references course_projects(id) on delete cascade,
  flagged_at timestamptz not null default now(),
  last_question text,
  dismissed_at timestamptz
);

-- Indexes — the hot-path queries
create index course_projects_status_idx on course_projects(status);
create index course_projects_pillar_idx on course_projects(pillar);
create index course_projects_due_idx on course_projects(due_date);
create index course_projects_last_activity_idx on course_projects(last_activity_at desc);
create index course_tasks_project_idx on course_tasks(project_id);
create index course_tasks_status_idx on course_tasks(status);
create index course_tasks_do_date_idx on course_tasks(do_date);
create index course_captures_status_idx on course_captures(status);
create index course_pulses_date_idx on course_pulses(date desc);
create index course_reviews_week_idx on course_reviews(week_of desc);
create index course_stall_project_idx on course_stall_states(project_id);

-- RLS — personal single-user app, anon-all (same pattern as the rest of the suite)
alter table course_goals enable row level security;
alter table course_projects enable row level security;
alter table course_tasks enable row level security;
alter table course_captures enable row level security;
alter table course_pulses enable row level security;
alter table course_reviews enable row level security;
alter table course_stall_states enable row level security;

create policy "anon all" on course_goals for all using (true) with check (true);
create policy "anon all" on course_projects for all using (true) with check (true);
create policy "anon all" on course_tasks for all using (true) with check (true);
create policy "anon all" on course_captures for all using (true) with check (true);
create policy "anon all" on course_pulses for all using (true) with check (true);
create policy "anon all" on course_reviews for all using (true) with check (true);
create policy "anon all" on course_stall_states for all using (true) with check (true);

-- Touch trigger — keep updated_at and last_activity_at current
create or replace function course_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger course_projects_touch
  before update on course_projects
  for each row execute function course_touch_updated_at();

create trigger course_tasks_touch
  before update on course_tasks
  for each row execute function course_touch_updated_at();

-- Bubble task activity up to the parent project's last_activity_at
create or replace function course_bump_project_activity() returns trigger as $$
begin
  if new.project_id is not null then
    update course_projects
      set last_activity_at = now()
      where id = new.project_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger course_tasks_bump_project
  after insert or update on course_tasks
  for each row execute function course_bump_project_activity();

-- Reschedule counter — bumps every time do_date shifts forward (unless caller
-- explicitly sets reschedule_count, used by undo to revert without recounting).
create or replace function course_count_task_reschedules() returns trigger as $$
begin
  if old.do_date is not null
     and new.do_date is not null
     and old.do_date is distinct from new.do_date
     and new.do_date > old.do_date
     and new.reschedule_count = old.reschedule_count then
    new.reschedule_count = coalesce(old.reschedule_count, 0) + 1;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger course_tasks_reschedule_count
  before update on course_tasks
  for each row execute function course_count_task_reschedules();
