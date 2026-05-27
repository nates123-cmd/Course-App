-- Project milestones — vertical-timeline phases inside Project's "More details".
-- Distinct from tasks: milestones are coarser, capture state-of-the-project
-- rather than single actions. Marker states drive the timeline glyph.

create table if not exists course_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references course_projects(id) on delete cascade,
  label text not null,
  target_date date,
  marker_state text not null default 'upcoming'
    check (marker_state in ('done', 'current', 'upcoming')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_milestones_project_idx
  on course_milestones (project_id, sort_order);

alter table course_milestones enable row level security;
create policy "anon all" on course_milestones for all using (true) with check (true);

create trigger course_milestones_touch
  before update on course_milestones
  for each row execute function course_touch_updated_at();

notify pgrst, 'reload schema';
