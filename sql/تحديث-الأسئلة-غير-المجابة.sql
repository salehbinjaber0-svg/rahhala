-- سجل الأسئلة التي لم يجد لها المنقذ جواباً
-- الفائدة: تكشف لك فجوات قاعدة المعرفة وما يحتاجه الطلاب فعلاً
create table if not exists unanswered_questions (
  id bigint generated always as identity primary key,
  question text not null,
  asked_count int not null default 1,      -- كم مرة تكرر نفس السؤال
  last_asked timestamptz not null default now(),
  resolved boolean not null default false, -- تعلّمه بعد ما تضيف الجواب
  created_at timestamptz not null default now()
);

-- فهرس يمنع تكرار نفس السؤال كصفوف منفصلة
create unique index if not exists unanswered_q_idx on unanswered_questions (question);

alter table unanswered_questions enable row level security;

-- أي طالب يقدر يسجّل سؤاله (بدون قراءة السجل)
create policy "Public insert unanswered" on unanswered_questions
  for insert with check (true);

-- التحديث مسموح عام كذلك — لزيادة عدّاد التكرار فقط
create policy "Public update count" on unanswered_questions
  for update using (true) with check (true);

-- القراءة والحذف للمعلم المسجّل دخول فقط
create policy "Admin read unanswered" on unanswered_questions
  for select to authenticated using (true);

create policy "Admin delete unanswered" on unanswered_questions
  for delete to authenticated using (true);
