#!/usr/bin/env node
/**
 * فحص المنقذ — اختبار انحدار لمحرّك الأسئلة والأجوبة
 *
 * يُشغَّل قبل أي تعديل على المنقذ (قاعدة المعرفة أو محرّك المطابقة):
 *     node فحص-المنقذ.js
 *
 * يفحص خمسة أمور:
 *   ١) كل مفهوم بقاعدة المعرفة يُجيب بنفسه لا بمفهوم آخر — بكل مفاتيحه لا الأول فقط
 *   ٢) لا تكرار: لا إجابتان متطابقتان ولا مفتاح يخدم مدخلين
 *   ٣) السياق: الأسئلة المستقلة لا تتلوّث، وأسئلة المتابعة تبقى على موضوعها
 *   ٤) الصف الثامن: ١ و٢ نفسهما على KNOWLEDGE_BASE_8
 *   ٥) الفصل بين المنهجين: مفاهيم كل صف لا تُجاب من معرفته على الصف الآخر،
 *      ولا بعد تبديل الصف وسط المحادثة («ليش؟» بعد التبديل)
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

const FILE = path.join(__dirname, 'index.html');
// الحالة الوحيدة المقبولة: «اقليم مناخي» تُجيب بقائمة الأقاليم الثمانية —
// جمع تكسير صحيح وإجابة مفيدة، لا خطأ.
const ALLOWED = ['اقليم مناخي'];

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
vc.on('error', () => {});

const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), {
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

    // ٥) الفصل بين المنهجين
    const texts7 = KNOWLEDGE_BASE.flatMap(e => e.extra ? [e.a, e.extra] : [e.a]);
    const texts8 = KNOWLEDGE_BASE_8.flatMap(e => e.extra ? [e.a, e.extra] : [e.a]);
    const leak = [];
    const check = (grade, q, forbidden) => {
      const t = (matchKnowledge(q) || {}).text || '';
      if(forbidden.some(x => t.includes(x))) leak.push({grade, q, t: t.slice(0,50)});
    };
    applyGrade(8, false);
    KNOWLEDGE_BASE.forEach(e => { lastTopic = null; contextTokens = []; check(8, e.k[0], texts7); });
    applyGrade(7, false);
    KNOWLEDGE_BASE_8.forEach(e => { lastTopic = null; contextTokens = []; check(7, e.k[0], texts8); });
    // تبديل الصف وسط المحادثة ثم سؤال متابعة
    applyGrade(8, false); matchKnowledge('الوشاح'); applyGrade(7, false); check(7, 'ليش؟', texts8);
    applyGrade(7, false); matchKnowledge('حمورابي'); applyGrade(8, false); check(8, 'ليش؟', texts7);
    window.__sep = { n: KNOWLEDGE_BASE.length + KNOWLEDGE_BASE_8.length + 2, leak };
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
    console.log(`\n٥) الفصل بين المنهجين — ${sep.n - sep.leak.length}/${sep.n}`);
    if (sep.leak.length) {
      failed += sep.leak.length;
      sep.leak.slice(0, 12).forEach(l => console.log(`   ❌ الصف ${l.grade} «${l.q}» أجاب من معرفة الصف الآخر: ${l.t}`));
    } else {
      console.log('   ✓ لا صف يجيب من معرفة الآخر، ولا بعد تبديل الصف');
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
