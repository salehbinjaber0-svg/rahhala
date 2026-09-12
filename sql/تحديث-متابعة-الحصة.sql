-- جدول متابعة الحصة الخاص بالمعلم (منفصل تماماً عن نظام نقاط الأسئلة/اللعبة)
-- محمي بالكامل: القراءة والكتابة كلها للمعلم المسجّل دخول فقط، محد ثاني يشوفه
create table if not exists class_roster (
  id bigint generated always as identity primary key,
  cls text not null,                          -- مثال: '7-1', '7-2', '7-3'
  student_name text not null,
  participation_points int not null default 0,
  warnings int not null default 0,
  created_at timestamptz not null default now()
);

alter table class_roster enable row level security;

-- صلاحية كاملة (قراءة/إضافة/تعديل/حذف) للمعلم المسجّل دخول فقط — لا وصول عام إطلاقاً
create policy "Admin only full access to roster" on class_roster
  for all to authenticated using (true) with check (true);
