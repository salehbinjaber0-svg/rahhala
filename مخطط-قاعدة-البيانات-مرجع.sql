-- ═══════════════════════════════════════════════════════════════
--  مرجع مخطط قاعدة بيانات «رحّالة» — الجداول الثمانية وسياساتها
--  مشروع Supabase: zvhhovkdbsilcplozfbm
-- ═══════════════════════════════════════════════════════════════
--
--  ⚠️ هذا ملف مرجعي للاطلاع، لا للتشغيل الكامل مرة أخرى.
--     الجداول منشأة فعلاً. استخدمه عند تعديل المخطط لاحقاً
--     لتتبع نفس أسلوب الصلاحيات المعتمد.
--
-- ───────────────────────────────────────────────────────────────
--  📐 فلسفة الصلاحيات المتبعة (مهمة لأي تعديل مستقبلي)
-- ───────────────────────────────────────────────────────────────
--
--  الموقع ثابت (GitHub Pages) بلا خادم خلفي، والمفتاح العام
--  (publishable) مكشوف بالكود بطبيعته. لذا الحماية الحقيقية
--  تعتمد كلياً على RLS، وفق ثلاثة أنماط:
--
--  ① بيانات الطلاب العامة (students, questions, answer_log):
--     قراءة/كتابة عامة — لأن الطالب لا يسجّل دخولاً بنظام المصادقة.
--     الحماية بالحقول الحساسة تتم عبر Triggers لا عبر RLS.
--
--  ② بيانات المعلم الخاصة (class_roster, roster_warnings,
--     roster_attendance): `to authenticated` فقط — لا وصول عام
--     إطلاقاً، لا قراءة ولا كتابة.
--
--  ③ بيانات مختلطة (unanswered_questions, answer_feedback):
--     الطالب يكتب فقط · المعلم يقرأ ويحذف.
--
--  ملاحظة: `to authenticated` وحده لا يميّز معلماً عن أي حساب
--  مسجّل. التمييز الفعلي يتم بالكود عبر ثابت ADMIN_EMAIL
--  (salehbinjaber0@gmail.com) الذي يرفض أي بريد آخر ويسجّل خروجه.
--
-- ═══════════════════════════════════════════════════════════════


-- ①  students — حسابات الطلاب ونشاطهم
-- ───────────────────────────────────────────────────────────────
create table if not exists students (
  key           text primary key,        -- الاسم_الصف بعد التنظيف
  name          text not null,
  cls           text not null,
  points        int  not null default 0,
  energy        int  not null default 0,
  badges        jsonb not null default '[]'::jsonb,
  games_played  int  not null default 0,
  status        text not null default 'pending',  -- pending | approved | rejected
  last_seen     timestamptz not null default now(),
  total_seconds int  not null default 0,          -- وقت الاستخدام التراكمي
  admin_note    text default '',
  kicked        boolean not null default false,   -- إنهاء الجلسة مؤقتاً
  updated_at    timestamptz not null default now()
);

alter table students enable row level security;

-- عامة: الطالب لا يسجّل دخولاً، فيحتاج الكتابة ليُسجّل نفسه ويحفظ نقاطه
create policy "Allow public read"   on students for select using (true);
create policy "Allow public insert" on students for insert with check (true);
create policy "Allow public update" on students for update using (true) with check (true);

-- 🔒 حماية الحقول الحساسة بـ Triggers (لأن RLS لا يحمي حقولاً بعينها)
-- تمنع الطالب من تعديل status/kicked/admin_note، وتُبقي النقاط والطاقة قابلة للتحديث.
create or replace function protect_students_insert()
returns trigger language plpgsql security definer as $$
begin
  if auth.role() is distinct from 'authenticated' then
    new.status := 'pending';
    new.kicked := false;
    new.admin_note := '';
  end if;
  return new;
end; $$;

drop trigger if exists protect_students_insert_trigger on students;
create trigger protect_students_insert_trigger
before insert on students for each row execute function protect_students_insert();

create or replace function protect_students_update()
returns trigger language plpgsql security definer as $$
begin
  if auth.role() is distinct from 'authenticated' then
    new.status     := old.status;
    new.admin_note := old.admin_note;
    new.kicked     := old.kicked;
  end if;
  return new;
end; $$;

drop trigger if exists protect_students_update_trigger on students;
create trigger protect_students_update_trigger
before update on students for each row execute function protect_students_update();


-- ②  questions — بنك أسئلة المراجعة
-- ───────────────────────────────────────────────────────────────
create table if not exists questions (
  id            bigint generated always as identity primary key,
  q             text not null,
  choices       jsonb not null,          -- مصفوفة 3 خيارات نصية
  correct_index int not null,            -- رقم الخيار الصحيح (يبدأ من 0)
  unit          text,                    -- "الوحدة 1" ... (للتنظيم)
  deleted_at    timestamptz,             -- حذف مؤقت (سلة المحذوفات)
  created_at    timestamptz not null default now()
);

alter table questions enable row level security;

-- قراءة عامة (تحتاجها لعبة المراجعة) · التعديل للمعلم فقط
create policy "Public read questions"   on questions for select using (true);
create policy "Admin insert questions"  on questions for insert to authenticated with check (true);
create policy "Admin update questions"  on questions for update to authenticated using (true) with check (true);
create policy "Admin delete questions"  on questions for delete to authenticated using (true);


-- ③  class_roster — قائمة صفوف المعلم الثابتة
-- ───────────────────────────────────────────────────────────────
create table if not exists class_roster (
  id                   bigint generated always as identity primary key,
  cls                  text not null,       -- '7-1' | '7-2' | '7-3'
  student_name         text not null,
  participation_points int not null default 0,
  warnings             int not null default 0,   -- (قديم: العدّ صار من roster_warnings)
  deleted_at           timestamptz,
  created_at           timestamptz not null default now()
);

alter table class_roster enable row level security;

-- خاصة بالمعلم بالكامل — لا وصول عام
create policy "Admin only full access to roster" on class_roster
  for all to authenticated using (true) with check (true);


-- ④  roster_warnings — التنبيهات والتكريمات
-- ───────────────────────────────────────────────────────────────
create table if not exists roster_warnings (
  id         bigint generated always as identity primary key,
  roster_id  bigint not null references class_roster(id) on delete cascade,
  note       text not null default '',
  kind       text not null default 'warning',  -- warning | praise
  created_at timestamptz not null default now()
);

alter table roster_warnings enable row level security;

create policy "Admin only full access to roster warnings" on roster_warnings
  for all to authenticated using (true) with check (true);


-- ⑤  roster_attendance — الحضور اليومي
-- ───────────────────────────────────────────────────────────────
create table if not exists roster_attendance (
  id         bigint generated always as identity primary key,
  roster_id  bigint not null references class_roster(id) on delete cascade,
  status     text not null default 'present',   -- present | late | absent
  day        date not null default current_date,
  created_at timestamptz not null default now(),
  unique (roster_id, day)     -- ← مهم: يجعل upsert يعمل بـ onConflict
);

alter table roster_attendance enable row level security;

create policy "Admin only full access to attendance" on roster_attendance
  for all to authenticated using (true) with check (true);


-- ⑥  answer_log — سجل محاولات الإجابة (لتقرير الأسئلة الأكثر خطأ)
-- ───────────────────────────────────────────────────────────────
create table if not exists answer_log (
  id          bigint generated always as identity primary key,
  question_id bigint,
  correct     boolean not null,
  created_at  timestamptz not null default now()
);

alter table answer_log enable row level security;

-- الطالب يكتب (تلقائياً عند كل إجابة) · المعلم يقرأ
create policy "Public insert answer log" on answer_log for insert with check (true);
create policy "Admin read answer log"    on answer_log for select to authenticated using (true);


-- ⑦  unanswered_questions — ما لم يعرفه المنقذ
-- ───────────────────────────────────────────────────────────────
create table if not exists unanswered_questions (
  id          bigint generated always as identity primary key,
  question    text not null,
  asked_count int  not null default 1,        -- عدّاد التكرار
  last_asked  timestamptz not null default now(),
  resolved    boolean not null default false, -- يعلّمه المعلم بعد إضافة الجواب
  created_at  timestamptz not null default now()
);

-- ← يمنع تكرار نفس السؤال كصفوف منفصلة
create unique index if not exists unanswered_q_idx on unanswered_questions (question);

alter table unanswered_questions enable row level security;

create policy "Public insert unanswered" on unanswered_questions for insert with check (true);
create policy "Public update count"      on unanswered_questions for update using (true) with check (true);
create policy "Admin read unanswered"    on unanswered_questions for select to authenticated using (true);
create policy "Admin delete unanswered"  on unanswered_questions for delete to authenticated using (true);


-- ⑧  answer_feedback — تقييم الطلاب لإجابات المنقذ
-- ───────────────────────────────────────────────────────────────
create table if not exists answer_feedback (
  id         bigint generated always as identity primary key,
  question   text not null,
  answer_key text not null,          -- أول 120 حرفاً من الإجابة (للتعرف عليها)
  helpful    boolean not null,       -- 👍 true | 👎 false
  created_at timestamptz not null default now()
);

create index if not exists af_helpful_idx on answer_feedback (helpful, created_at desc);

alter table answer_feedback enable row level security;

create policy "Public insert feedback" on answer_feedback for insert with check (true);
create policy "Admin read feedback"    on answer_feedback for select to authenticated using (true);
create policy "Admin delete feedback"  on answer_feedback for delete to authenticated using (true);


-- ═══════════════════════════════════════════════════════════════
--  🔍 استعلام التحقق — كل الأرقام يجب أن تكون 1
-- ═══════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.tables  where table_schema='public' and table_name='students')             as جدول_الطلاب,
  (select count(*) from information_schema.tables  where table_schema='public' and table_name='questions')            as جدول_الأسئلة,
  (select count(*) from information_schema.tables  where table_schema='public' and table_name='class_roster')         as جدول_قائمة_الصف,
  (select count(*) from information_schema.tables  where table_schema='public' and table_name='roster_warnings')      as جدول_التنبيهات,
  (select count(*) from information_schema.tables  where table_schema='public' and table_name='roster_attendance')    as جدول_الحضور,
  (select count(*) from information_schema.tables  where table_schema='public' and table_name='answer_log')           as جدول_سجل_الإجابات,
  (select count(*) from information_schema.tables  where table_schema='public' and table_name='unanswered_questions') as جدول_الأسئلة_بلا_جواب,
  (select count(*) from information_schema.tables  where table_schema='public' and table_name='answer_feedback')      as جدول_التقييم;


-- ═══════════════════════════════════════════════════════════════
--  📋 استعلامات مفيدة عند التعديل المستقبلي
-- ═══════════════════════════════════════════════════════════════

-- عرض كل السياسات الحالية وتفاصيلها:
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'public' order by tablename;

-- عرض أعمدة جدول معيّن:
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'class_roster' order by ordinal_position;

-- عرض المشغّلات (Triggers):
--   select trigger_name, event_manipulation, event_object_table
--   from information_schema.triggers where trigger_schema = 'public';


-- ═══════════════════════════════════════════════════════════════
--  ✍️ قواعد كتابة أي تعديل مستقبلي
-- ═══════════════════════════════════════════════════════════════
--  ١. استخدم دائماً `if not exists` و `drop policy if exists`
--     ليكون الكود آمناً للتشغيل المتكرر بلا ضرر.
--
--  ٢. لا تستخدم `drop table` أبداً — البيانات لا تُعوَّض.
--
--  ٣. لإضافة عمود:  alter table X add column if not exists Y ...
--
--  ٤. اتبع نمط الصلاحيات المناسب من الثلاثة الموضحة بالأعلى.
--
--  ٥. اختم كل تعديل باستعلام تحقق يُظهر النتيجة أرقاماً واضحة،
--     واطلب لقطة شاشة منها للتأكد قبل اعتبار المهمة منتهية.
-- ═══════════════════════════════════════════════════════════════
