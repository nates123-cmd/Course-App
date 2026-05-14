-- Add 'pushed' to the task status enum. Used by the Reminders flow:
-- once a task has been handed off to Apple Reminders, you can mark it
-- Pushed so it drops off the active worry-list without being Done.

alter table course_tasks drop constraint if exists course_tasks_status_check;
alter table course_tasks add constraint course_tasks_status_check
  check (status in ('triage','next','in_progress','waiting','done','dropped','pushed'));

notify pgrst, 'reload schema';
