-- تقييم إجابات المنقذ — يكشف الإجابات الضعيفة التي تحتاج تحسيناً
create table if not exists answer_feedback (
  id bigint generated always as identity primary key,
  question text not null,        -- سؤال الطالب
  answer_key text not null,      -- بداية الإجابة (للتعرف عليها)
  helpful boolean not null,      -- true = مفيدة · false = غير مفيدة
  created_at timestamptz not null default now()
);

create index if not exists af_helpful_idx on answer_feedback (helpful, created_at desc);

alter table answer_feedback enable row level security;

-- الطالب يقيّم بحرية
create policy "Public insert feedback" on answer_feedback
  for insert with check (true);

-- القراءة والحذف للمعلم فقط
create policy "Admin read feedback" on answer_feedback
  for select to authenticated using (true);

create policy "Admin delete feedback" on answer_feedback
  for delete to authenticated using (true);
