-- ══════════════════════════════════════════════════════════
--  تحديث شامل لقاعدة بيانات رحّالة
--  آمن تماماً: يتخطى ما هو موجود ولا يمسح أي بيانات
--  شغّله كاملاً مرة واحدة بـ SQL Editor
-- ══════════════════════════════════════════════════════════

-- ① أعمدة متابعة الطلاب
alter table students add column if not exists last_seen timestamptz not null default now();
alter table students add column if not exists total_seconds int not null default 0;
alter table students add column if not exists admin_note text default '';
alter table students add column if not exists kicked boolean not null default false;

-- ② قائمة الصف الثابتة
create table if not exists class_roster (
  id bigint generated always as identity primary key,
  cls text not null,
  student_name text not null,
  participation_points int not null default 0,
  warnings int not null default 0,
  created_at timestamptz not null default now()
);
alter table class_roster enable row level security;
drop policy if exists "Admin only full access to roster" on class_roster;
create policy "Admin only full access to roster" on class_roster
  for all to authenticated using (true) with check (true);

-- ③ التنبيهات والملاحظات الإيجابية
create table if not exists roster_warnings (
  id bigint generated always as identity primary key,
  roster_id bigint not null references class_roster(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table roster_warnings add column if not exists kind text not null default 'warning';
alter table roster_warnings enable row level security;
drop policy if exists "Admin only full access to roster warnings" on roster_warnings;
create policy "Admin only full access to roster warnings" on roster_warnings
  for all to authenticated using (true) with check (true);

-- ④ الحضور  ← هذا هو الناقص عندك حالياً
create table if not exists roster_attendance (
  id bigint generated always as identity primary key,
  roster_id bigint not null references class_roster(id) on delete cascade,
  status text not null default 'present',
  day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (roster_id, day)
);
alter table roster_attendance enable row level security;
drop policy if exists "Admin only full access to attendance" on roster_attendance;
create policy "Admin only full access to attendance" on roster_attendance
  for all to authenticated using (true) with check (true);

-- ⑤ سلة المحذوفات
alter table questions add column if not exists deleted_at timestamptz;
alter table class_roster add column if not exists deleted_at timestamptz;

-- ⑥ سجل الإجابات (لتقرير الأسئلة الأكثر خطأ)
create table if not exists answer_log (
  id bigint generated always as identity primary key,
  question_id bigint,
  correct boolean not null,
  created_at timestamptz not null default now()
);
alter table answer_log enable row level security;
drop policy if exists "Public insert answer log" on answer_log;
create policy "Public insert answer log" on answer_log for insert with check (true);
drop policy if exists "Admin read answer log" on answer_log;
create policy "Admin read answer log" on answer_log for select to authenticated using (true);

-- ⑦ الأسئلة التي لم يجد المنقذ لها جواباً
create table if not exists unanswered_questions (
  id bigint generated always as identity primary key,
  question text not null,
  asked_count int not null default 1,
  last_asked timestamptz not null default now(),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists unanswered_q_idx on unanswered_questions (question);
alter table unanswered_questions enable row level security;
drop policy if exists "Public insert unanswered" on unanswered_questions;
create policy "Public insert unanswered" on unanswered_questions for insert with check (true);
drop policy if exists "Public update count" on unanswered_questions;
create policy "Public update count" on unanswered_questions for update using (true) with check (true);
drop policy if exists "Admin read unanswered" on unanswered_questions;
create policy "Admin read unanswered" on unanswered_questions for select to authenticated using (true);
drop policy if exists "Admin delete unanswered" on unanswered_questions;
create policy "Admin delete unanswered" on unanswered_questions for delete to authenticated using (true);

-- ⑧ تقييم إجابات المنقذ
create table if not exists answer_feedback (
  id bigint generated always as identity primary key,
  question text not null,
  answer_key text not null,
  helpful boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists af_helpful_idx on answer_feedback (helpful, created_at desc);
alter table answer_feedback enable row level security;
drop policy if exists "Public insert feedback" on answer_feedback;
create policy "Public insert feedback" on answer_feedback for insert with check (true);
drop policy if exists "Admin read feedback" on answer_feedback;
create policy "Admin read feedback" on answer_feedback for select to authenticated using (true);
drop policy if exists "Admin delete feedback" on answer_feedback;
create policy "Admin delete feedback" on answer_feedback for delete to authenticated using (true);

-- ══════════════════════════════════════════════════════════
-- تقرير النتيجة: كل الأرقام لازم تكون 1
-- ══════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.tables where table_schema='public' and table_name='class_roster')        as جدول_قائمة_الصف,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='roster_warnings')     as جدول_التنبيهات,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='roster_attendance')   as جدول_الحضور,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='answer_log')          as جدول_سجل_الإجابات,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='unanswered_questions')as جدول_الأسئلة_بلا_جواب,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='answer_feedback')     as جدول_التقييم,
  (select count(*) from information_schema.columns where table_name='students' and column_name='kicked')            as عمود_الطرد,
  (select count(*) from information_schema.columns where table_name='questions' and column_name='deleted_at')       as عمود_سلة_المحذوفات;
