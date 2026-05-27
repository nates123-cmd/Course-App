alter table course_status_notes
  add column if not exists summary text;

notify pgrst, 'reload schema';
