alter table course_projects
  add column if not exists sort_order double precision;

create index if not exists course_projects_sort_order_idx
  on course_projects(sort_order);

notify pgrst, 'reload schema';
