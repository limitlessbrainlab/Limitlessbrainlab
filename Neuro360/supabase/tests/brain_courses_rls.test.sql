begin;

select plan(12);

select has_table('public', 'brain_courses', 'brain_courses exists');
select has_table('public', 'brain_course_purchases', 'brain_course_purchases exists');
select row_security_active('public.brain_courses'::regclass), 'brain_courses has RLS enabled';
select row_security_active('public.brain_course_purchases'::regclass), 'brain_course_purchases has RLS enabled';
select has_index('public', 'brain_courses', 'brain_courses_slug_key', 'course slugs are unique');
select has_index('public', 'brain_course_purchases', 'brain_course_purchases_patient_id_course_id_key', 'one entitlement per patient/course');
select ok(not has_table_privilege('anon', 'public.brain_courses', 'insert, update, delete'), 'anon cannot modify courses');
select ok(not has_table_privilege('authenticated', 'public.brain_courses', 'insert, update, delete'), 'patients cannot modify courses');
select ok(not has_table_privilege('anon', 'public.brain_course_purchases', 'select, insert, update, delete'), 'anon cannot access purchases');
select ok(not has_table_privilege('authenticated', 'public.brain_course_purchases', 'insert, update, delete'), 'patients cannot modify purchases');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'brain_courses'
    and policyname = 'Visible brain courses are public'
    and qual = '(is_visible = true)'
), 'course policy exposes only visible courses');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'brain_course_purchases'
    and policyname = 'Patients read their own brain course purchases'
    and qual like '%auth.uid()%patient_id%'
), 'purchase policy exposes only the authenticated patient ownership');

select * from finish();
rollback;
