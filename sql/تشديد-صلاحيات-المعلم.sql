-- ═══════════════════════════════════════════════════════════════
-- تشديد صلاحيات المعلم — حصر سياسات «Admin» ببريد المعلم وحده
-- ═══════════════════════════════════════════════════════════════
-- المشكلة: كل سياسات المعلم كانت «to authenticated using (true)»، أي أن
-- أي حساب مسجّل في Supabase (يستطيع أي أحد إنشاءه بمفتاح anon المكشوف في
-- الصفحة) يقرأ ويعدّل ويحذف أسماء الطلاب والملاحظات والحضور. فحص isAdmin في
-- الجافاسكربت لا يحمي قاعدة البيانات.
-- الحل: دالة is_teacher() تقارن بريد الجلسة ببريد المعلم، وتستبدل (true) بها.
-- آمن للتشغيل أكثر من مرة. لا يمس سياسات الطلاب العامة (insert للسجلات).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.is_teacher()
returns boolean
language sql stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'salehbinjaber0@gmail.com'
$$;

-- ① الجداول الخاصة بالمعلم كلياً
drop policy if exists "Admin only full access to roster" on class_roster;
create policy "Admin only full access to roster" on class_roster
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "Admin only full access to roster warnings" on roster_warnings;
create policy "Admin only full access to roster warnings" on roster_warnings
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "Admin only full access to attendance" on roster_attendance;
create policy "Admin only full access to attendance" on roster_attendance
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- ② بنك الأسئلة (القراءة العامة تبقى كما هي)
drop policy if exists "Admin insert questions" on questions;
create policy "Admin insert questions" on questions for insert to authenticated with check (public.is_teacher());
drop policy if exists "Admin update questions" on questions;
create policy "Admin update questions" on questions for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists "Admin delete questions" on questions;
create policy "Admin delete questions" on questions for delete to authenticated using (public.is_teacher());

-- ③ أسئلة الحصة
drop policy if exists "Admin read lesson_questions" on lesson_questions;
create policy "Admin read lesson_questions" on lesson_questions for select to authenticated using (public.is_teacher());
drop policy if exists "Admin insert lesson_questions" on lesson_questions;
create policy "Admin insert lesson_questions" on lesson_questions for insert to authenticated with check (public.is_teacher());
drop policy if exists "Admin update lesson_questions" on lesson_questions;
create policy "Admin update lesson_questions" on lesson_questions for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists "Admin delete lesson_questions" on lesson_questions;
create policy "Admin delete lesson_questions" on lesson_questions for delete to authenticated using (public.is_teacher());

-- ④ السجلات والتقارير (الإدخال العام يبقى كما هو)
drop policy if exists "Admin read answer log" on answer_log;
create policy "Admin read answer log" on answer_log for select to authenticated using (public.is_teacher());

drop policy if exists "Admin read unanswered" on unanswered_questions;
create policy "Admin read unanswered" on unanswered_questions for select to authenticated using (public.is_teacher());
drop policy if exists "Admin delete unanswered" on unanswered_questions;
create policy "Admin delete unanswered" on unanswered_questions for delete to authenticated using (public.is_teacher());

drop policy if exists "Admin read feedback" on answer_feedback;
create policy "Admin read feedback" on answer_feedback for select to authenticated using (public.is_teacher());
drop policy if exists "Admin delete feedback" on answer_feedback;
create policy "Admin delete feedback" on answer_feedback for delete to authenticated using (public.is_teacher());

-- ═══════════════════════════════════════════════════════════════
-- التحقق: يجب أن تظهر 15 سياسة، وكلها تحوي is_teacher
-- ═══════════════════════════════════════════════════════════════
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and 'authenticated' = any(roles)
order by tablename, policyname;
