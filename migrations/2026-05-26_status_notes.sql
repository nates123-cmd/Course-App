-- "Where it stands" status notes for projects. The new Triage+Project UX
-- treats the user's own status note as the ground-truth signal that overrides
-- AI synthesis (see project.jsx "Where it stands" section).
--
-- Distinct from course_projects.notes (free-form scratch) — status notes are
-- timestamped, append-only, and tagged with their source (manual vs.
-- think-it-through resolution).

create table if not exists course_status_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references course_projects(id) on delete cascade,
  body text not null,
  source text not null default 'manual'
    check (source in ('manual', 'think_it_through')),
  created_at timestamptz not null default now()
);

create index if not exists course_status_notes_project_idx
  on course_status_notes (project_id, created_at desc);

alter table course_status_notes enable row level security;
create policy "anon all" on course_status_notes for all using (true) with check (true);

notify pgrst, 'reload schema';
