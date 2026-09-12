-- إضافة "حذف مؤقت" (Soft Delete) للأسئلة وطلاب متابعة الحصة
-- بدل الحذف الفوري النهائي، نعلّم العنصر كـ"محذوف" مع وقت الحذف،
-- ويظل موجود بالخلفية لحد ما تسترجعه أو تحذفه نهائياً بنفسك من سلة المحذوفات.
alter table questions add column if not exists deleted_at timestamptz;
alter table class_roster add column if not exists deleted_at timestamptz;
