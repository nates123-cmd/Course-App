-- Tasks now default to a blank (NULL) status instead of 'next'.
-- Blank = open and unset; the user tracks open-ness via Complete + Do date,
-- not Task Status. The existing CHECK constraint already permits NULL.
alter table course_tasks alter column status drop not null;
alter table course_tasks alter column status drop default;

notify pgrst, 'reload schema';
