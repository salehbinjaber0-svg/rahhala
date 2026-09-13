-- ═══════════════════════════════════════════════════════════
--  رحّالة — توسيع «حصة اليوم» لأنواع فقرات متعددة
--  اختياري · مقالي · لعبة · مكافأة · فاصل
--  آمن للتشغيل أكثر من مرة
-- ═══════════════════════════════════════════════════════════

-- نوع الفقرة
alter table lesson_questions
  add column if not exists kind text not null default 'essay';

-- خيارات السؤال الاختياري (مصفوفة نصوص)
alter table lesson_questions
  add column if not exists choices jsonb;

-- رقم الخيار الصحيح (يبدأ من 0)
alter table lesson_questions
  add column if not exists correct_index int;

-- قيد يضمن أن النوع من القائمة المعتمدة فقط
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lesson_questions_kind_chk') then
    alter table lesson_questions
      add constraint lesson_questions_kind_chk
      check (kind in ('mcq','essay','game','reward','break'));
  end if;
end $$;

-- تأكيد النجاح
select column_name as العمود, data_type as النوع
from information_schema.columns
where table_name = 'lesson_questions'
  and column_name in ('kind','choices','correct_index')
order by column_name;
