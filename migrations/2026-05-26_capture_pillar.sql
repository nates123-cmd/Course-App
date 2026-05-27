alter table course_captures
  add column if not exists pillar text;

notify pgrst, 'reload schema';
