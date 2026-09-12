-- إنشاء جدول الطلاب
create table if not exists students (
  key text primary key,
  name text not null,
  cls text not null,
  points int not null default 0,
  energy int not null default 0,
  badges jsonb not null default '[]'::jsonb,
  games_played int not null default 0,
  updated_at timestamptz not null default now()
);

-- تفعيل الحماية على مستوى الصفوف (سنضبطها بدقة أكثر لاحقاً قبل الإطلاق الرسمي)
alter table students enable row level security;

-- السماح بالقراءة والكتابة العامة (وضع تجريبي، مثل ما سوينا بالضبط مع Firestore)
create policy "Allow public read" on students for select using (true);
create policy "Allow public insert" on students for insert with check (true);
create policy "Allow public update" on students for update using (true) with check (true);
