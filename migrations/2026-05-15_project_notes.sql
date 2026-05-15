-- Free-form notes on projects (and therefore on ideas, which are just
-- projects with status='idea'). Distinct from `outcome` (Definition of Done):
-- `outcome` is the sharp finish line, `notes` is everything else — context,
-- links, open questions, scratch thinking. Course-only; no Notion writeback.

alter table course_projects
  add column if not exists notes text;

notify pgrst, 'reload schema';
