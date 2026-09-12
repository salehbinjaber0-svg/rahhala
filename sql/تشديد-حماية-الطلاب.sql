-- ============================================================
-- تشديد حماية جدول الطلاب — يمنع أي طالب (أو أي طرف خارجي يحاول
-- التلاعب عبر استدعاء مباشر لقاعدة البيانات) من تعديل الحقول
-- الحساسة (status, admin_note, kicked) — تبقى هذي حصراً بيد المعلم.
--
-- الطريقة: Trigger على مستوى قاعدة البيانات نفسها، يشتغل تلقائياً
-- بدون أي حاجة لتغيير كود الموقع — حماية حقيقية على مستوى البنية
-- التحتية، مو مجرد إخفاء بالواجهة.
-- ============================================================

-- عند الإضافة (INSERT): أي تسجيل جديد من طالب (غير مسجّل دخول كمعلم)
-- يُجبر تلقائياً على status='pending', kicked=false, admin_note=''
-- بغض النظر عمّا أُرسل فعلياً — يقفل ثغرة "التسجيل كموافق عليه مباشرة"
create or replace function protect_students_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    new.status := 'pending';
    new.kicked := false;
    new.admin_note := '';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_students_insert_trigger on students;
create trigger protect_students_insert_trigger
before insert on students
for each row execute function protect_students_insert();

-- عند التعديل (UPDATE): أي تحديث من طالب (غير مسجّل دخول كمعلم)
-- يُعاد فيه status/admin_note/kicked لقيمتها القديمة تلقائياً، حتى
-- لو حاول الطالب إرسال قيمة جديدة لها ضمن طلب التحديث — يبقى النقاط
-- والطاقة والشارات ووقت الاستخدام قابلة للتحديث عادي من الطالب نفسه.
create or replace function protect_students_update()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    new.status := old.status;
    new.admin_note := old.admin_note;
    new.kicked := old.kicked;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_students_update_trigger on students;
create trigger protect_students_update_trigger
before update on students
for each row execute function protect_students_update();
