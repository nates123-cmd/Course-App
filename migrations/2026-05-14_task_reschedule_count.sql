-- Track how many times each task has been pushed to a later do_date.
-- Used to surface "drifting" tasks (≥3 reschedules) — analogous to project stall
-- detection but at the task level.

alter table course_tasks
  add column if not exists reschedule_count int not null default 0;

-- Increment when do_date is shifted forward, unless the caller is explicitly
-- setting reschedule_count (used by undo to revert without double-counting).
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

drop trigger if exists course_tasks_reschedule_count on course_tasks;
create trigger course_tasks_reschedule_count
  before update on course_tasks
  for each row execute function course_count_task_reschedules();

notify pgrst, 'reload schema';
