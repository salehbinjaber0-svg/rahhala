// اختبار سلوكي بـjsdom لنشاط مراجعة الوحدة الثانية — لا يكفي فحص الصياغة
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/user/rahhala/index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://x/', pretendToBeVisual: true });
const w = dom.window;

let fail = 0;
const ok  = m => console.log('   ✓ ' + m);
const bad = m => { console.log('   ✗ ' + m); fail++; };
const t = (c, m) => c ? ok(m) : bad(m);

setTimeout(() => {
  // const بنطاق السكربت لا يُعلَّق على window — نصل إليها بـeval
  const A = w.eval('typeof ACTIVITIES !== "undefined" ? ACTIVITIES : null');
  if (!A) { bad('ACTIVITIES غير معرّفة — المصفوفة انكسرت'); return done(); }

  const act = A.find(a => a.id === 'rafidain-7-review');
  if (!act) { bad('النشاط غير موجود'); return done(); }

  console.log('\n── بنية النشاط ──');
  t(act.items.length === 28, `عدد الشرائح ٢٨ (وجدت ${act.items.length})`);
  t(act.grade === 7 && act.unit === 2, 'الصف السابع · الوحدة الثانية');
  t(act.special && act.special.cls === '7-2', 'مربوط بصف ٧-٢');
  t(act.date === '2026-09-30', 'تاريخ الحصة ٣٠/٩');
  t(act.bg === 'rafidain', 'خلفية بلاد الرافدين');

  console.log('\n── أنواع الشرائح ──');
  const by = {};
  act.items.forEach(i => by[i.kind] = (by[i.kind] || 0) + 1);
  t(by.mcq === 6,    `اختيار من متعدد ٦ (${by.mcq})`);
  t(by.essay === 15, `مقالي ١٥ (${by.essay})`);
  t(by.break === 3,  `فاصل ٣ (${by.break})`);
  t(by.game === 3,   `نشاط ٣ (${by.game})`);
  t(by.reward === 1, `مكافأة ١ (${by.reward})`);

  console.log('\n── مفاتيح الإجابة (correct_index يشير للصحيح فعلاً) ──');
  const key = {
    'أول الشعوب التي سكنت بلاد الرافدين:': 'السومريُّون',
    'ثبَّتَ دعائم دولته من خلال التشريعات والقوانين:': 'حمورابي',
    'تمثَّلت الطبقة الوسطى في مجتمع بلاد الرافدين من:': 'العمال والفلاحين',
    'من مميزات الحياة الدينيَّة عند سكان بلاد الرافدين:': 'تعدُّد المعبودات',
    'سجَّل سكان بلاد الرافدين الوثائق الرسمية والعقود على ألواح:': 'طينيَّة',
    'تُعَدُّ من روائع حضارة بلاد الرافدين في مجال النحت:': 'الثور المجنَّح'
  };
  act.items.filter(i => i.kind === 'mcq').forEach(i => {
    const picked = i.choices[i.correct_index];
    t(picked === key[i.q], `«${i.q.slice(0, 34)}…» ← ${picked}`);
  });

  console.log('\n── وضوح المرجع والإجابات ──');
  const qs = act.items.filter(i => i.kind === 'mcq' || i.kind === 'essay');
  t(qs.length === 21, `٢١ فرعاً من التدريبات (${qs.length})`);
  // المراجع بالأرقام العربية الهندية (٤٧) لا اللاتينية — نحوّل قبل المقارنة
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const num = t => t.replace(/[٠-٩]/g, d => AR.indexOf(d));
  t(qs.every(i => i.ref && /^ص [٠-٩]+ · السؤال/.test(i.ref)), 'كل فرع يحمل مرجع الصفحة والسؤال والفرع');
  t(qs.every(i => i.a && i.a.length <= 130), 'كل الإجابات مختصرة (≤١٣٠ حرفاً)');
  t(act.items.filter(i => i.kind === 'mcq').every(i => i.noShuffle === true),
    'الخيارات لا تُخلط — ترتيب أ/ب/ج/د يطابق الكتاب');

  console.log('\n── التسلسل: ص٤٧ ← ص٤٨ ← ص٥٧ ← ص٥٨ ──');
  const pages = qs.map(i => parseInt(num(i.ref).match(/\d+/)[0], 10));
  t(JSON.stringify(pages) === JSON.stringify([...pages].sort((a, b) => a - b)),
    'الصفحات بترتيب تصاعدي: ' + [...new Set(pages)].join(' ← '));

  console.log('\n── تشغيل فعلي: فتح العرض والمرور على ٢٨ شريحة ──');
  try {
    // isAdmin بنطاق السكربت أيضاً — يُضبط بـeval لا بالإسناد على window
    w.eval("isAdmin = true; startActivity('rafidain-7-review');");
    t(w.eval('lessonQs').length === 28, 'المحرّك حمّل ٢٨ شريحة');
    const showEl = w.document.getElementById('lessonShow');
    t(showEl.classList.contains('bg-rafidain'), 'الخلفية طُبّقت على الشاشة');

    let painted = 0, refsSeen = 0;
    for (let i = 0; i < 28; i++) {
      w.lsJump(i);
      const q = w.document.getElementById('lsQ');
      const wrap = w.document.getElementById('lsAWrap');
      if (q.textContent.trim() || wrap.textContent.trim()) painted++;
      if (q.querySelector('.lsRef')) refsSeen++;
    }
    t(painted === 28, `كل الشرائح الـ٢٨ رُسمت بمحتوى (${painted})`);
    t(refsSeen === 21, `شارة المرجع ظهرت على ٢١ شريحة سؤال (${refsSeen})`);

    // كشف إجابة مقالية فعلياً
    const idx = act.items.findIndex(i => i.q && i.q.startsWith('فسِّر: تمكَّن سرجون'));
    w.lsJump(idx);
    w.lsReveal();
    const shown = w.document.querySelector('#lsAWrap .lsA');
    t(shown && shown.textContent.includes('الجيش النظامي'),
      'زر «اكشف الإجابة» يعرض الإجابة المختصرة الصحيحة');

    // اختيار صحيح في سؤال اختياري
    const m = act.items.findIndex(i => i.kind === 'mcq');
    w.lsJump(m);
    w.lsPick(w.eval('lessonQs')[m].correct_index);
    t(!!w.document.querySelector('#lsAWrap .lsCh.correct'), 'الخيار الصحيح يُعلَّم عند الضغط');

    // بطاقة فاصل: التفاف الأسطر
    const b = act.items.findIndex(i => i.kind === 'break');
    w.lsJump(b);
    t(!!w.document.querySelector('#lsAWrap .lsCard.break'), 'بطاقة الفاصل تُرسم كبطاقة كاملة');
  } catch (e) {
    bad('تشغيل العرض فشل: ' + e.message);
  }
  done();
}, 1500);

function done(){
  console.log('\n' + '═'.repeat(52));
  console.log(fail ? `   ❌ ${fail} فحصاً فشل — لا تُرفع` : '   ✅ كل الفحوص السلوكية نجحت');
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
}
