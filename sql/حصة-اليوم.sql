-- ═══════════════════════════════════════════════════════════
--  رحّالة — جدول «حصة اليوم»
--  أسئلة ختامية تُعرض على البروجكتر لغلق الحصة
--  آمن للتشغيل أكثر من مرة (if not exists)
-- ═══════════════════════════════════════════════════════════

create table if not exists lesson_questions (
  id          bigint generated always as identity primary key,
  cls         text,                    -- الصف: 7-1 / 7-2 / 7-3 · فارغ = لكل الصفوف
  q           text not null,           -- نص السؤال
  a           text,                    -- الإجابة (تُكشف بضغطة على البروجكتر)
  source      text default 'manual',   -- manual = كتبه المعلم · bank = من بنك الأسئلة
  bank_id     bigint,                  -- رقم السؤال بجدول questions لو كان من البنك
  pos         int  default 0,          -- ترتيب العرض
  deleted_at  timestamptz,             -- حذف مؤقت
  created_at  timestamptz not null default now()
);

create index if not exists lesson_questions_cls_idx
  on lesson_questions (cls, pos);

alter table lesson_questions enable row level security;

-- بيانات معلم بحتة: لا قراءة ولا كتابة إلا لحساب مسجّل الدخول
do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'lesson_questions' and policyname = 'Admin read lesson_questions') then
    create policy "Admin read lesson_questions"   on lesson_questions for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'lesson_questions' and policyname = 'Admin insert lesson_questions') then
    create policy "Admin insert lesson_questions" on lesson_questions for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'lesson_questions' and policyname = 'Admin update lesson_questions') then
    create policy "Admin update lesson_questions" on lesson_questions for update to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'lesson_questions' and policyname = 'Admin delete lesson_questions') then
    create policy "Admin delete lesson_questions" on lesson_questions for delete to authenticated using (true);
  end if;
end $$;

-- تأكيد النجاح
select 'تم إنشاء جدول حصة اليوم' as status,
       count(*) as عدد_السياسات
from pg_policies where tablename = 'lesson_questions';
