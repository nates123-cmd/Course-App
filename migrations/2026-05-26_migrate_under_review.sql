update course_projects set status = 'paused' where status = 'under_review';

notify pgrst, 'reload schema';
