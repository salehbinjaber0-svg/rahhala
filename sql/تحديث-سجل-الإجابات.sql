-- جدول سجل الإجابات — يتتبّع كل محاولة إجابة (صح/خطأ) لكل سؤال، عشان نبني تقرير "أكثر سؤال يُخطأ فيه"
create table if not exists answer_log (
  id bigint generated always as identity primary key,
  question_id bigint,
  correct boolean not null,
  created_at timestamptz not null default now()
);

alter table answer_log enable row level security;

-- أي طالب يقدر يسجّل محاولته (مطلوب عشان اللعبة تشتغل لأي زائر)
create policy "Public insert answer log" on answer_log for insert with check (true);

-- القراءة (للتقرير) محصورة على المعلم المسجّل دخول فقط
create policy "Admin read answer log" on answer_log for select to authenticated using (true);
