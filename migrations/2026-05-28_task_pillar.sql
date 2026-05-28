-- Loose tasks can be filed to a pillar without a project.
-- (Column already present in the live DB; this keeps source-of-truth in sync.)
alter table course_tasks
  add column if not exists pillar text;

create index if not exists course_tasks_pillar_idx on course_tasks(pillar);

notify pgrst, 'reload schema';
