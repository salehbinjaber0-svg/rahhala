-- ============================================================
-- تطوير متابعة الحصة: الحضور + الملاحظات الإيجابية
-- ============================================================

-- 1) سجل الحضور — سجل مستقل لكل يوم، عشان تقدر تراجع الغياب بأثر رجعي
create table if not exists roster_attendance (
  id bigint generated always as identity primary key,
  roster_id bigint not null references class_roster(id) on delete cascade,
  status text not null default 'present',   -- present / absent / late
  day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (roster_id, day)                   -- حالة واحدة لكل طالب باليوم الواحد
);

alter table roster_attendance enable row level security;

create policy "Admin only full access to attendance" on roster_attendance
  for all to authenticated using (true) with check (true);

-- 2) نوع الملاحظة — نضيف حقل يميّز الإيجابي عن التنبيه، مع الإبقاء على السجل القديم كما هو
alter table roster_warnings add column if not exists kind text not null default 'warning';
-- القيم: 'warning' = تنبيه سلوكي · 'praise' = ملاحظة إيجابية
