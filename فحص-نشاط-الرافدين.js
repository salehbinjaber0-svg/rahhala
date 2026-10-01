// اختبار سلوكي بـjsdom لنشاط مراجعة الوحدة الثانية — لا يكفي فحص الصياغة
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// الصفحة تحمّل ملفات مصاحبة (supabase.js · content.js): نضمّنها من القرص كي يُفحص ما سيُرفع فعلاً
// لا النسخة المنشورة على الإنترنت (التي قد تكون أقدم أو غير متاحة)
const loadSite = (dir) => fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
  .replace(/<script src="([^":]+\.js)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(path.join(dir, f), 'utf8') + '</script>');
const html = loadSite(__dirname);
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
  t(act.items.length === 16, `عدد الشرائح ١٦ — أسئلة فقط (وجدت ${act.items.length})`);
  t(act.grade === 7 && act.unit === 2, 'الصف السابع · الوحدة الثانية');
  t(act.special && act.special.cls === '7-2', 'مربوط بصف ٧-٢');
  t(act.date === '2026-09-30', 'تاريخ الحصة ٣٠/٩');
  t(act.bg === 'rafidain', 'خلفية بلاد الرافدين');

  console.log('\n── أنواع الشرائح ──');
  const by = {};
  act.items.forEach(i => by[i.kind] = (by[i.kind] || 0) + 1);
  t(by.tf === 7,     `صح أم خطأ ٧ (${by.tf})`);
  t(by.mcq === 7,    `اختيار من متعدد ٧ (${by.mcq})`);
  t(by.essay === 2,  `مقالي ٢ (${by.essay})`);
  t(!by.break && !by.game && !by.reward, 'لا بطاقات فواصل ولا أنشطة ولا تتويج — أسئلة خالصة');

  console.log('\n── مفاتيح الإجابة (correct_index يشير للصحيح فعلاً) ──');
  const key = {
    'أول الشعوب التي سكنت بلاد الرافدين:': 'السومريُّون',
    'ثبَّتَ دعائم دولته من خلال التشريعات والقوانين:': 'حمورابي',
    'تمثَّلت الطبقة الوسطى في مجتمع بلاد الرافدين من:': 'العمال والفلاحين',
    'تُعَدُّ من روائع حضارة بلاد الرافدين في مجال النحت:': 'الثور المجنَّح',
    'أيُّ ما يأتي ليس من عوامل قيام حضارة بلاد الرافدين؟': 'كثرة الحروب والفتوحات',
    'تمكَّن سرجون الأول من بَسْط سيطرته على المدن السومريَّة بفضل:': 'قوة الجيش النظامي',
    'ازدهرت التجارة في بلاد الرافدين بسبب:': 'الموقع المتميز واستتباب الأمن وتوافر المواصلات',
    // صح أم خطأ — القيمة هي الصواب المتوقَّع
    'بلاد الرافدين هي المنطقة الواقعة بين نهرَي دجلة والفرات.': 'صح',
    'اتخذ الأكاديُّون مدينة «أكاد» عاصمةً لدولتهم.': 'صح',
    'سقطت الدولة الآشوريَّة على يد الفرس.': 'خطأ',
    'تكوَّن مجتمع بلاد الرافدين من طبقة واحدة.': 'خطأ',
    'سجَّل سكان بلاد الرافدين وثائقهم الرسمية على ألواح خشبيَّة.': 'خطأ',
    'اعتقد سكان بلاد الرافدين بوجود حياة بعد الموت.': 'صح',
    'تُعَدُّ حدائق بابل المعلَّقة من أبرز إنجازات البابليِّين في مجال الزراعة.': 'صح'
  };
  act.items.filter(i => i.kind === 'mcq' || i.kind === 'tf').forEach(i => {
    const picked = i.choices[i.correct_index];
    t(picked === key[i.q], `«${i.q.slice(0, 32)}…» ← ${picked}`);
  });
  t(act.items.filter(i => i.kind === 'tf').every(i =>
      i.choices.length === 2 && i.choices[0] === 'صح' && i.choices[1] === 'خطأ'),
    'كل عبارات صح/خطأ خياراها «صح» ثم «خطأ» بهذا الترتيب');
  t(act.items.filter(i => i.kind === 'tf' && i.correct_index === 1)
      .every(i => i.a.includes('والصواب')), 'كل عبارة خاطئة تذكر التصويب');

  console.log('\n── وضوح المرجع والإجابات ──');
  const qs = act.items.filter(i => ['mcq','tf','essay'].includes(i.kind));
  t(qs.length === 16, `١٦ سؤالاً (${qs.length})`);
  // المراجع بالأرقام العربية الهندية (٤٧) لا اللاتينية — نحوّل قبل المقارنة
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const num = t => t.replace(/[٠-٩]/g, d => AR.indexOf(d));
  t(qs.every(i => i.ref && /^ص [٠-٩]+ · /.test(i.ref)), 'كل سؤال يحمل مرجع الصفحة');
  t(qs.every(i => i.a && i.a.length <= 130), 'كل الإجابات مختصرة (≤١٣٠ حرفاً)');
  t(act.items.filter(i => i.kind === 'mcq' || i.kind === 'tf').every(i => i.noShuffle === true),
    'الخيارات لا تُخلط — ترتيب أ/ب/ج/د يطابق الكتاب');
  t(qs.every(i => !i.autoReveal), 'لا كشف تلقائي — الإجابة بيد المعلم');
  t(qs.every(i => i.writeCue === true), 'كل سؤال يعرض إشارة الكتابة عند الكشف');

  console.log('\n── الترتيب: صح/خطأ ← اختياري ← مقالي ──');
  const order = act.items.filter(i => ['mcq','tf','essay'].includes(i.kind)).map(i => i.kind);
  const want = Array(7).fill('tf').concat(Array(7).fill('mcq'), Array(2).fill('essay'));
  t(JSON.stringify(order) === JSON.stringify(want),
    '٧ صح/خطأ ← ٧ اختياري ← ٢ مقالي');
  const lessons = new Set(qs.map(i => parseInt(num(i.ref).match(/\d+/)[0], 10) < 49 ? 1 : 2));
  t(lessons.size === 2, 'الأسئلة تغطي الدرسين معاً');

  console.log('\n── تشغيل فعلي: فتح العرض والمرور على ٢٨ شريحة ──');
  try {
    // isAdmin بنطاق السكربت أيضاً — يُضبط بـeval لا بالإسناد على window
    w.eval("isAdmin = true; startActivity('rafidain-7-review');");
    t(w.eval('lessonQs').length === 16, 'المحرّك حمّل ١٦ شريحة');
    const showEl = w.document.getElementById('lessonShow');
    t(showEl.classList.contains('bg-rafidain'), 'الخلفية طُبّقت على الشاشة');

    let painted = 0, refsSeen = 0, cues = 0;
    for (let i = 0; i < 16; i++) {
      w.lsJump(i);
      const q = w.document.getElementById('lsQ');
      const wrap = w.document.getElementById('lsAWrap');
      if (q.textContent.trim() || wrap.textContent.trim()) painted++;
      if (q.querySelector('.lsRef')) refsSeen++;
      if (wrap.querySelector('.lsWrite')) cues++;
    }
    t(painted === 16, `كل الشرائح الـ١٦ رُسمت بمحتوى (${painted})`);
    t(refsSeen === 16, `شارة المرجع ظهرت على ١٦ شريحة سؤال (${refsSeen})`);
    t(cues === 0, `لا إشارة كتابة قبل الكشف (${cues})`);

    // المسار المعكوس: الإجابة وشارة الكتابة تظهران بمجرد دخول الشريحة
    const idx = act.items.findIndex(i => i.kind === 'essay');
    w.lsJump(idx);
    t(!w.document.querySelector('#lsAWrap .lsA'), 'المقالي: لا إجابة قبل ضغط الزر');
    w.lsReveal();
    const shown = w.document.querySelector('#lsAWrap .lsA');
    t(shown && shown.textContent.includes('الهجرات البشرية'), 'الكشف اليدوي يعرض الإجابة');
    t(!!w.document.querySelector('#lsAWrap .lsWrite'), 'إشارة الكتابة تظهر مع الإجابة');
    w.lsReveal();
    t(!w.document.querySelector('#lsAWrap .lsA') && !w.document.querySelector('#lsAWrap .lsWrite'),
      'الإخفاء يزيل الإجابة والإشارة معاً');

    const mi = act.items.findIndex(i => i.kind === 'tf');
    w.lsJump(mi);
    t(!w.document.querySelector('#lsAWrap .lsCh.correct'), 'صح/خطأ: لا تعليم قبل الإجابة');
    w.lsPick(w.eval('lessonQs')[mi].correct_index);
    t(!!w.document.querySelector('#lsAWrap .lsCh.correct'), 'نقر الصواب يُعلِّمه');
    t(!!w.document.querySelector('#lsAWrap .lsWrite'), 'إشارة الكتابة تظهر بعد النقر الصحيح');

    const ci = act.items.findIndex(i => i.kind === 'mcq');
    w.lsJump(ci);
    w.lsReveal();
    t(!!w.document.querySelector('#lsAWrap .lsWrite'), 'الاختياري: الإشارة تظهر بالكشف');


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
