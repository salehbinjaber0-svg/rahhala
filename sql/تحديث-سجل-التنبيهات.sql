-- جدول سجل التنبيهات — كل تنبيه صار له ملاحظة وتاريخ مستقل، بدل ما يكون رقم بس
-- محمي بالكامل: المعلم المسجّل دخول فقط
create table if not exists roster_warnings (
  id bigint generated always as identity primary key,
  roster_id bigint not null references class_roster(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table roster_warnings enable row level security;

create policy "Admin only full access to roster warnings" on roster_warnings
  for all to authenticated using (true) with check (true);
