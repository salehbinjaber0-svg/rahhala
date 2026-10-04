#!/usr/bin/env node
/**
 * فحص المنقذ — اختبار انحدار لمحرّك الأسئلة والأجوبة
 *
 * يُشغَّل قبل أي تعديل على المنقذ (قاعدة المعرفة أو محرّك المطابقة):
 *     node فحص-المنقذ.js
 *
 * يفحص ستة أمور:
 *   ١) كل مفهوم بقاعدة المعرفة يُجيب بنفسه لا بمفهوم آخر — بكل مفاتيحه لا الأول فقط
 *   ٢) لا تكرار: لا إجابتان متطابقتان ولا مفتاح يخدم مدخلين
 *   ٣) السياق: الأسئلة المستقلة لا تتلوّث، وأسئلة المتابعة تبقى على موضوعها
 *   ٤) الصف الثامن: ١ و٢ نفسهما على KNOWLEDGE_BASE_8
 *   ٥) الإجابة عبر الصفين: سؤال من منهج الصف الآخر يُجاب تلقائياً منه موسوماً
 *      «📘 من منهج الصف …» — لا تسرّب بلا وسم ولا «لا أعرف»، ولا بعد تبديل الصف
 *   ٦) أسئلة الطلاب الطبيعية: أسئلة بصياغة الطلاب (عامّية، «ليش/وش/مين»، أخطاء إملائية)
 *      لكل وحدات الصفين — كل سؤال يُجاب (لا «ما عندي جواب») وبالجواب كلمة من جملة الكتاب
 *      التي تجيبه. سؤال جديد فشل فيه المنقذ؟ أضفه هنا بعد إصلاحه كي لا يعود الخلل
 *
 * يحتاج jsdom:  npm install jsdom
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.error('\n❌ jsdom غير مثبّت. شغّل:  npm install jsdom\n');
  process.exit(1);
}

// الصفحة تحمّل ملفات مصاحبة (supabase.js · content.js): نضمّنها من القرص كي يُفحص ما سيُرفع فعلاً
// لا النسخة المنشورة على الإنترنت (التي قد تكون أقدم أو غير متاحة)
const loadSite = (dir) => fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
  .replace(/<script src="([^":]+\.js)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(path.join(dir, f), 'utf8') + '</script>');
// الحالة الوحيدة المقبولة: «اقليم مناخي» تُجيب بقائمة الأقاليم الثمانية —
// جمع تكسير صحيح وإجابة مفيدة، لا خطأ.
const ALLOWED = ['اقليم مناخي'];

// ٦) أسئلة الطلاب: [الصف، السؤال كما يكتبه الطالب، كلمات متوقعة بالجواب مفصولة بـ/]
// الكلمة المتوقعة منسوخة من جملة الكتاب التي تجيب السؤال؛ المقارنة تتجاهل التشكيل والهمزات
// STUDENT_QS:BEGIN
const STUDENT_QS = [
  // الصف ٧ — الوحدة ١: الأرض من حولي
  [7, 'وش الفرق بين الطقس والمناخ', 'المتغيرة يومياً/يومي'],
  [7, 'ما هو المناخ', 'فترة طويلة'],
  [7, 'عناصر المناخ كم', 'الضغط الجوي'],
  [7, 'وش مصدر الحرارة على الارض', 'الإشعاع الشمسي'],
  [7, 'ما هو الاشعاع الشمسي', 'الساقطة'],
  [7, 'ليش تختلف الحرارة من مكان لمكان', 'زاوية سقوط'],
  [7, 'كم المناطق الحرارية', 'الحارة'],
  [7, 'اكبر منطقة حرارية', 'الحارة'],
  [7, 'وين تقع المنطقة المعتدلة الدافئة', '30'],
  [7, 'تعريف الضغط الجوي', 'وزن عمود'],
  [7, 'العلاقة بين الحرارة والضغط', 'عكسية'],
  [7, 'ليش يقل الضغط اذا ارتفعنا', 'عكسية/الارتفاع'],
  [7, 'حرف H وش معناه', 'بحرف H'],
  [7, 'كيف تتحرك الرياح', 'المرتفع'],
  [7, 'انواع الرياح', 'الموسمية'],
  [7, 'الرياح الموسمية الشتوية', 'اليابس للماء'],
  [7, 'وش هي رياح الكوس', 'قطر'],
  [7, 'رياح الطوز وين تهب', 'الكويت'],
  [7, 'المسترال', 'فرنسا'],
  [7, 'نسيم البر والبحر', 'اليومية/الليل والنهار'],
  [7, 'ما هي الرطوبة', 'بخار الماء'],
  [7, 'متى يحدث التكاثف', 'سائلة'],
  [7, 'مظاهر التكاثف', 'الندى'],
  [7, 'العوامل المؤثرة في المناخ', 'اليابس والماء'],
  [7, 'كم تنخفض الحرارة مع الارتفاع', '150'],
  [7, 'ما هو ظل المطر', 'الخلفية'],
  [7, 'ليش المناطق الساحلية معتدلة', 'الساحلية'],
  [7, 'ما هو الاقليم المناخي', 'متشابهة'],
  [7, 'قطر في اي اقليم', 'الصحراوي'],
  [7, 'خصائص الاقليم الاستوائي', 'ممطر'],
  [7, 'السافانا', 'المداري'],
  [7, 'اقليم البحر المتوسط', 'شتاء دافئ ممطر'],
  [7, 'الفرق بين الاقليم الصيني واقليم البحر المتوسط', 'الصيني/المتوسط'],
  [7, 'الاقليم اللورانسي', 'الشتاء'],
  [7, 'الاقليم القطبي', 'ثلوج'],
  [7, 'ليش الرياح الموسمية الصيفية ممطرة', 'الماء'],
  [7, 'ايش الفرق بين الرياح الدائمة والموسمية', 'الدائمة'],
  [7, 'وش يعني نسيم الجبل والوادي', 'اليومية'],
  [7, 'ليش الجبال باردة', '150'],
  [7, 'وش يصير للضغط لما ترتفع الحرارة', 'عكسية'],
  [7, 'ليش تسقط الامطار على السفوح المواجهة للرياح', 'ظل المطر/السفوح'],
  [7, 'الحيوانات اللي تعيش في الاقليم المداري', 'الأسود/الاسود'],
  [7, 'ما خصائص الاقليم الصحراوي', 'جاف'],
  [7, 'الاقليم الصيني', 'طوال العام/مدار العام/على مدار'],
  [7, 'اقليم غرب اوروبا', 'الصيف'],
  // الصف ٧ — الوحدة ٢: حضارة بلاد الرافدين
  [7, 'وش يعني حضارة', 'العقل الإنساني/مادية'],
  [7, 'وين بلاد الرافدين', 'دجلة والفرات'],
  [7, 'عوامل قيام حضارة بلاد الرافدين', 'الهجرات'],
  [7, 'مين اول من سكن بلاد الرافدين', 'السومريون/السومري'],
  [7, 'عاصمة السومريين', 'أور'],
  [7, 'مين سرجون الاول', 'الأكاد'],
  [7, 'حمورابي', 'بابل/القانون/قانون'],
  [7, 'متى سقطت الدولة البابلية الاولى', '1531'],
  [7, 'اشهر ملوك الاشوريين', 'آشور بانيبال'],
  [7, 'مين اسقط الاشوريين', 'الكلداني'],
  [7, 'نبوخذ نصر', 'الكلدان/بوابة عشتار/البابلية الثانية'],
  [7, 'قورش', 'الفرس'],
  [7, 'متى فتح المسلمون العراق', '636'],
  [7, 'نظام الحكم في بلاد الرافدين', 'وراثي'],
  [7, 'قانون حمورابي وش مبدؤه', 'الضعيف'],
  [7, 'طبقات المجتمع في بلاد الرافدين', 'الوسطى'],
  [7, 'الطبقة الدنيا', 'العبيد'],
  [7, 'الحياة الدينية في بلاد الرافدين', 'تعدد/بعد الموت'],
  [7, 'حدائق بابل المعلقة', 'حدائق'],
  [7, 'الكتابة المسمارية', 'طينية'],
  [7, 'كم شهر السنة عند البابليين', '12'],
  [7, 'بوابة عشتار وين موجودة', 'برلين'],
  [7, 'الثور المجنح', 'سرجون الثاني'],
  [7, 'المسلة', 'نقش/الأحداث'],
  [7, 'قصة سرجون الاول', 'فقيرة/النهر'],
  [7, 'من هم الاكاديون', 'سرجون'],
  [7, 'ليش سقطت الدولة البابلية الاولى', 'ضعف'],
  [7, 'اين استقر الاشوريون', 'شمال'],
  [7, 'ما هي بوابة عشتار', 'نبوخذ'],
  [7, 'وش زرعوا في بلاد الرافدين', 'القمح'],
  [7, 'صناعات بلاد الرافدين', 'الفخار/الحلي'],
  [7, 'ليش ازدهرت التجارة في بلاد الرافدين', 'الموقع'],
  [7, 'من اخترع الكتابة المسمارية', 'السومري'],
  [7, 'نهري دجلة والفرات وش فايدتهم', 'التربة/الخصبة'],
  [7, 'الهجرات البشرية', 'شبه الجزيرة'],
  [7, 'اورنمو', 'السومري'],
  [7, 'اكاد', 'سرجون/الأكادي'],
  [7, 'مين بنى الثور المجنح', 'سرجون الثاني'],
  [7, 'وش كانوا يدفنون مع الموتى', 'أوان'],
  [7, 'عقيدة سكان الرافدين', 'بعد الموت/تعدد'],
  // الصف ٨ — الوحدة ١: كوكب الأرض
  [8, 'كيف عرف العلماء طبقات الارض', 'الزلزالية/البراكين'],
  [8, 'طبقات باطن الارض', 'الوشاح'],
  [8, 'ما هي طبقة السيال', 'قار/جرانيت'],
  [8, 'السيما', 'بازلت/محيطية'],
  [8, 'اسمك طبقة في الارض', 'الوشاح/2900'],
  [8, 'كم سمك الوشاح', '2900'],
  [8, 'مم تتكون النواة', 'الحديد'],
  [8, 'حرارة النواة الداخلية', '5500'],
  [8, 'ليش باطن الارض صلب مع الحرارة', 'الضغط'],
  [8, 'اغلفة الارض', 'الحيوي'],
  [8, 'انواع الصخور', 'متحوّلة'],
  [8, 'الصخور النارية', 'حفريات/الجرانيت'],
  [8, 'الصخور الرسوبية', 'حفريات'],
  [8, 'الرخام من اي نوع صخور', 'المتحو'],
  [8, 'اهمية الغلاف الصخري', 'للمعادن'],
  [8, 'نسبة النيتروجين في الهواء', '78'],
  [8, 'طبقات الغلاف الجوي', 'التروبوسفير'],
  [8, 'وين طبقة الاوزون', 'الستراتوسفير'],
  [8, 'الغلاف المائي', 'الجوفية/البحار'],
  [8, 'الغلاف الحيوي', 'الكائنات'],
  [8, 'ليش يسمى الوشاح الكسوة', 'الوشاح'],
  [8, 'الفرق بين القشرة القارية والمحيطية', 'السيال'],
  [8, 'حرارة النواة الخارجية', '2200'],
  [8, 'ليش النواة الخارجية سائلة', 'سائلة'],
  [8, 'البراكين كيف تدل على باطن الارض', 'البركان/البراكين'],
  [8, 'الصخور المتحولة امثلة', 'الرخام'],
  [8, 'الجرانيت', 'النارية/السيال'],
  [8, 'الحجر الجيري', 'الرسوبية'],
  [8, 'الوشاح العلوي', 'مائع'],
  [8, 'نسبة الاكسجين', '21'],
  [8, 'الثيرموسفير', 'الغلاف الجوي/طبقات'],
  [8, 'المياه الجوفية', 'المائي'],
  // الصف ٨ — الوحدة ٢: الحضارة المصرية
  [8, 'تعريف الحضارة', 'المعنوية/تحسين'],
  [8, 'عوامل قيام الحضارة المصرية', 'النيل'],
  [8, 'ليش مصر حلقة اتصال', 'الموقع'],
  [8, 'عصور مصر القديمة', 'الحديثة'],
  [8, 'متى العصر العتيق', '3200'],
  [8, 'كم سنة استمر العصر العتيق', '400'],
  [8, 'نظام الحكم في مصر القديمة', 'وراثي'],
  [8, 'معنى كلمة فرعون', 'البيت الكبير'],
  [8, 'عناصر الحكم في مصر', 'الوزير'],
  [8, 'محاصيل مصر القديمة', 'القمح'],
  [8, 'ورق البردي', 'البردي'],
  [8, 'التجارة في مصر القديمة', 'خارجية'],
  [8, 'مع مين تاجرت مصر', 'بونت'],
  [8, 'العصر الوسيط في مصر', 'الوسطى/2065'],
  [8, 'الدولة القديمة في مصر', '2800'],
  [8, 'الدولة الحديثة', '1570'],
  [8, 'مشروعات الري في مصر', 'الترع'],
  [8, 'صناعات مصر القديمة', 'البردي/الأسلحة'],
  [8, 'بلاد بونت', 'التجارة/تاجر'],
  [8, 'من يساعد الفرعون', 'الوزير'],
  [8, 'المناخ المعتدل في مصر', 'الأنشطة الاقتصادية'],
  [8, 'الموارد الطبيعية في مصر', 'المعادن'],
  [8, 'الاسر الحاكمة في الدولة القديمة', 'الثالثة'],
  [8, 'الجوانب المادية والمعنوية', 'الحضارة'],
];
// STUDENT_QS:END

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
vc.on('error', () => {});

const dom = new JSDOM(loadSite(__dirname), {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'https://salehbinjaber0-svg.github.io/rahhala/',
  virtualConsole: vc,
  pretendToBeVisual: true,
});
const w = dom.window;
const run = (code) => {
  const s = w.document.createElement('script');
  s.textContent = code;
  w.document.body.appendChild(s);
};

const line = '═'.repeat(52);
console.log(`\n${line}\n   فحص المنقذ — اختبار انحدار\n${line}\n`);

setTimeout(() => {
  w.__SQ = STUDENT_QS;
  // ١) كل مفهوم يُجيب بنفسه
  run(`
    applyGrade(7, false);
    logUnanswered = () => {};   // لا اتصال بقاعدة البيانات أثناء الفحص
    // كل مفتاح لا الأول فقط: المفتاح الثانوي قد يُسرق وحده دون أن يلاحظه أحد
    const selfTest = (KB) => KB.flatMap((e, idx) => e.k.map(key => {
      lastTopic = null; contextTokens = [];
      let got = null;
      try { got = matchKnowledge(key); } catch(err){ return {idx, key, err:err.message}; }
      const text = got && got.text ? got.text : '';
      return { idx, key, ok: text.startsWith(e.a), got: text.slice(0,55) };
    }));
    window.__self = selfTest(KNOWLEDGE_BASE);

    // ٢) التكرار
    const norm = s => s.replace(/[^\\u0621-\\u064A ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').trim();
    const dupTest = (KB) => {
      const seenA = {}, dupA = [];
      KB.forEach((e,i) => {
        const k = norm(e.a).slice(0,60);
        if(seenA[k] !== undefined) dupA.push([seenA[k], i]); else seenA[k] = i;
      });
      const seenK = {}, dupK = [];
      KB.forEach((e,i) => e.k.forEach(kw => {
        const n = norm(kw);
        if(seenK[n] !== undefined && seenK[n] !== i) dupK.push([n, seenK[n], i]); else seenK[n] = i;
      }));
      return { answers: dupA, keys: dupK };
    };
    window.__dup = dupTest(KNOWLEDGE_BASE);

    // ٣) السياق
    const ctx = { clean: [], follow: [] };
    lastTopic = null; contextTokens = [];
    ['ابعاد الامن الوطني','الخلافة العباسية','حمورابي'].forEach(q => {
      const t = (matchKnowledge(q)||{}).text || '';
      ctx.clean.push({ q, t: t.slice(0,45) });
    });
    lastTopic = null; contextTokens = [];
    const base = (matchKnowledge('هارون الرشيد')||{}).text || '';
    ['ليش؟','مثال'].forEach(q => {
      const t = (matchKnowledge(q)||{}).text || '';
      ctx.follow.push({ q, stayed: t.includes('هارون') });
    });
    ctx.baseOk = base.includes('هارون');
    window.__ctx = ctx;

    // ٤) الصف الثامن
    applyGrade(8, false);
    window.__self8 = selfTest(KNOWLEDGE_BASE_8);
    window.__dup8 = dupTest(KNOWLEDGE_BASE_8);

    // ٥) الإجابة التلقائية عبر الصفين: سؤال من منهج الصف الآخر يُجاب منه
    //    مع وسم «📘 من منهج الصف …» — لا تسرّب بلا وسم، ولا «لا أعرف»
    const only = (a, b) => { const sb = new Set(b); return a.filter(x => !sb.has(x)); };
    const t7 = KNOWLEDGE_BASE.flatMap(e => e.extra ? [e.a, e.extra] : [e.a]);
    const t8 = KNOWLEDGE_BASE_8.flatMap(e => e.extra ? [e.a, e.extra] : [e.a]);
    const texts7 = only(t7, t8), texts8 = only(t8, t7);
    const leak = [];
    const check = (grade, q, other, otherName, mustAnswer) => {
      const r = matchKnowledge(q) || {}, t = r.text || '';
      const tagged = t.startsWith('📘 من منهج الصف ' + otherName);
      if(mustAnswer && (!t || r.kind === 'unknown')) leak.push({grade, q, t: 'لا إجابة'});
      else if(!tagged && other.some(x => t.includes(x))) leak.push({grade, q, t: 'بلا وسم: ' + t.slice(0,50)});
    };
    applyGrade(8, false);
    KNOWLEDGE_BASE.forEach(e => { lastTopic = null; contextTokens = []; check(8, e.k[0], texts7, 'السابع', true); });
    applyGrade(7, false);
    KNOWLEDGE_BASE_8.forEach(e => { lastTopic = null; contextTokens = []; check(7, e.k[0], texts8, 'الثامن', true); });
    // تبديل الصف وسط المحادثة ثم سؤال متابعة: لا تسرّب بلا وسم
    applyGrade(8, false); matchKnowledge('الوشاح'); applyGrade(7, false); check(7, 'ليش؟', texts8, 'الثامن', false);
    applyGrade(7, false); matchKnowledge('حمورابي'); applyGrade(8, false); check(8, 'ليش؟', texts7, 'السابع', false);
    window.__sep = { n: KNOWLEDGE_BASE.length + KNOWLEDGE_BASE_8.length + 2, leak };

    // ٦) أسئلة الطلاب الطبيعية
    const N = s => s.replace(/[\u064B-\u0652\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
    window.__student = (window.__SQ || []).map(([g, q, exp]) => {
      applyGrade(g, false); lastTopic = null; contextTokens = [];
      let r = {};
      try{ r = matchKnowledge(q) || {}; } catch(err){ return {g, q, exp, ok:false, got:'خطأ: ' + err.message}; }
      const t = r.text || '';
      const answered = t && r.kind !== 'unknown';
      const hit = exp.split('/').some(e => N(t).includes(N(e.trim())));
      return {g, q, exp, ok: answered && hit, hedged: t.includes('📌'), got: answered ? t.slice(0,60) : 'لا جواب'};
    });
    applyGrade(7, false);
  `);

  setTimeout(() => {
    let failed = 0;

    // ١
    const self = w.__self || [];
    const bad = self.filter(r => !r.ok && !ALLOWED.includes(r.key));
    console.log(`١) كل مفهوم يُجيب بنفسه (الصف السابع، كل المفاتيح) — ${self.length - bad.length}/${self.length}`);
    if (bad.length) {
      failed += bad.length;
      bad.slice(0, 12).forEach(r =>
        console.log(`   ❌ "${r.key}" → ${r.err ? 'خطأ: ' + r.err : r.got}`));
    } else {
      console.log('   ✓ سليم');
    }

    // ٢
    const dup = w.__dup || { answers: [], keys: [] };
    console.log(`\n٢) التكرار`);
    if (dup.answers.length || dup.keys.length) {
      failed += dup.answers.length + dup.keys.length;
      dup.answers.forEach(([a, b]) => console.log(`   ❌ إجابتان متطابقتان بالمدخلين ${a} و ${b}`));
      dup.keys.forEach(([n, a, b]) => console.log(`   ❌ المفتاح "${n}" بالمدخلين ${a} و ${b}`));
    } else {
      console.log('   ✓ لا إجابات مكررة ولا مفاتيح متعارضة');
    }

    // ٣
    const ctx = w.__ctx || { clean: [], follow: [], baseOk: false };
    console.log(`\n٣) السياق`);
    const texts = ctx.clean.map(c => c.t);
    const polluted = texts.length > 1 && new Set(texts).size !== texts.length;
    if (polluted) {
      failed++;
      console.log('   ❌ سؤال مستقل تلوّث بجواب سابق:');
      ctx.clean.forEach(c => console.log(`      "${c.q}" → ${c.t}`));
    } else {
      console.log('   ✓ الأسئلة المستقلة لا تتلوّث');
    }
    const followBad = ctx.follow.filter(f => !f.stayed);
    if (!ctx.baseOk) {
      console.log('   ⚠️ تعذّر تجهيز اختبار المتابعة');
    } else if (followBad.length) {
      failed += followBad.length;
      followBad.forEach(f => console.log(`   ❌ "${f.q}" خرجت عن موضوع المتابعة`));
    } else {
      console.log('   ✓ أسئلة المتابعة تبقى على موضوعها');
    }

    // ٤
    const self8 = w.__self8 || [];
    const bad8 = self8.filter(r => !r.ok);
    console.log(`\n٤) الصف الثامن — ${self8.length - bad8.length}/${self8.length} مفتاحاً يجيب بمدخله`);
    if (bad8.length) {
      failed += bad8.length;
      bad8.slice(0, 12).forEach(r =>
        console.log(`   ❌ "${r.key}" → ${r.err ? 'خطأ: ' + r.err : r.got}`));
    } else {
      console.log('   ✓ سليم');
    }
    const dup8 = w.__dup8 || { answers: [], keys: [] };
    if (dup8.answers.length || dup8.keys.length) {
      failed += dup8.answers.length + dup8.keys.length;
      dup8.answers.forEach(([a, b]) => console.log(`   ❌ إجابتان متطابقتان بالمدخلين ${a} و ${b}`));
      dup8.keys.forEach(([n, a, b]) => console.log(`   ❌ المفتاح "${n}" بالمدخلين ${a} و ${b}`));
    } else {
      console.log('   ✓ لا إجابات مكررة ولا مفاتيح متعارضة');
    }

    // ٥
    const sep = w.__sep || { n: 0, leak: [{q:'تعذّر تشغيل الفحص', grade:0, t:''}] };
    console.log(`\n٥) الإجابة عبر الصفين — ${sep.n - sep.leak.length}/${sep.n}`);
    if (sep.leak.length) {
      failed += sep.leak.length;
      sep.leak.slice(0, 12).forEach(l => console.log(`   ❌ الصف ${l.grade} «${l.q}» → ${l.t}`));
    } else {
      console.log('   ✓ كل مفهوم من الصف الآخر يُجاب موسوماً، ولا تسرّب بعد تبديل الصف');
    }

    // ٦
    const st = w.__student || [];
    const stBad = st.filter(r => !r.ok);
    const stHedged = st.filter(r => r.ok && r.hedged).length;
    console.log(`\n٦) أسئلة الطلاب الطبيعية — ${st.length - stBad.length}/${st.length}`);
    if (!st.length) {
      failed++;
      console.log('   ❌ لا أسئلة — تعذّر تشغيل الفحص');
    } else if (stBad.length) {
      failed += stBad.length;
      stBad.slice(0, 15).forEach(r => console.log(`   ❌ الصف ${r.g} «${r.q}» (متوقَّع: ${r.exp}) → ${r.got}`));
    } else {
      console.log(`   ✓ كلها تُجاب بجملة الكتاب الصحيحة${stHedged ? ` (${stHedged} منها بتحفّظ «📌»)` : ''}`);
    }

    console.log(`\n${line}`);
    if (failed === 0) {
      console.log('   ✅ المنقذ سليم — جاهز للرفع');
      console.log(`${line}\n`);
      process.exit(0);
    } else {
      console.log(`   ❌ ${failed} مشكلة — لا تُرفع النسخة`);
      console.log(`${line}\n`);
      process.exit(1);
    }
  }, 3000);
}, 3500);
