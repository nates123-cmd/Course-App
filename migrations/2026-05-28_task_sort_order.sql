alter table course_tasks
  add column if not exists sort_order double precision;

create index if not exists course_tasks_sort_order_idx
  on course_tasks(sort_order);

notify pgrst, 'reload schema';
