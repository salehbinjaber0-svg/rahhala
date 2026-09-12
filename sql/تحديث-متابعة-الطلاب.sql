-- إضافة حقول متابعة الطلاب: آخر ظهور، الوقت الكلي على الموقع، ملاحظة المعلم، وحالة الطرد
alter table students add column if not exists last_seen timestamptz not null default now();
alter table students add column if not exists total_seconds int not null default 0;
alter table students add column if not exists admin_note text default '';
alter table students add column if not exists kicked boolean not null default false;
