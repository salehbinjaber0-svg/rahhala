-- ═══════════════════════════════════════════════════════════════
-- إغلاق ما بقي مفتوحاً للعامة — يُشغَّل بعد «تشديد-صلاحيات-المعلم.sql»
-- ═══════════════════════════════════════════════════════════════
-- students: كانت القراءة والإدخال والتعديل متاحة لأي زائر بمفتاح anon المكشوف
--   (أي زائر يستطيع تغيير نقاط أي طالب أو اسمه). دخول الطالب معطّل
--   (STUDENT_LOGIN_ENABLED = false) فلا حاجة للصلاحيات العامة — صارت للمعلم وحده.
--   ⚠️ لو فُعّل دخول الطالب مستقبلاً: يجب إعادة سياسات الطلاب قبل التفعيل.
-- unanswered_questions: التعديل كان لأي زائر (تغيير نصوص الأسئلة). صار للمعلم وحده
--   — وهو ما يحتاجه زر «عُلّم كمعالَج». الإدخال العام يبقى: المنقذ يسجّل ما لم يعرفه.
-- آمن للتشغيل أكثر من مرة.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "Allow public read"   on students;
drop policy if exists "Allow public insert" on students;
drop policy if exists "Allow public update" on students;
drop policy if exists "Teacher full access to students" on students;
create policy "Teacher full access to students" on students
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "Public update count" on unanswered_questions;
drop policy if exists "Teacher update unanswered" on unanswered_questions;
create policy "Teacher update unanswered" on unanswered_questions
  for update to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- ═══════════════════════════════════════════════════════════════
-- التحقق: كل سياسة لا تمر عبر is_teacher. المتوقع ٤ صفوف فقط:
--   answer_feedback (insert) · answer_log (insert) · questions (select) · unanswered_questions (insert)
-- أي صف غيرها = ثغرة باقية
-- ═══════════════════════════════════════════════════════════════
select tablename, policyname, cmd, roles::text as roles,
       coalesce(qual,'') || ' | ' || coalesce(with_check,'') as condition
from pg_policies
where schemaname = 'public'
  and coalesce(qual,'') not like '%is_teacher%'
  and coalesce(with_check,'') not like '%is_teacher%'
order by tablename, policyname;
