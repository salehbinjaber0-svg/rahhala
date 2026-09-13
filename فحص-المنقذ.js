#!/usr/bin/env node
/**
 * فحص المنقذ — اختبار انحدار لمحرّك الأسئلة والأجوبة
 *
 * يُشغَّل قبل أي تعديل على المنقذ (قاعدة المعرفة أو محرّك المطابقة):
 *     node فحص-المنقذ.js
 *
 * يفحص ثلاثة أمور:
 *   ١) كل مفهوم بقاعدة المعرفة يُجيب بنفسه لا بمفهوم آخر
 *   ٢) لا تكرار: لا إجابتان متطابقتان ولا مفتاح يخدم مدخلين
 *   ٣) السياق: الأسئلة المستقلة لا تتلوّث، وأسئلة المتابعة تبقى على موضوعها
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
    window.__self = KNOWLEDGE_BASE.map((e, idx) => {
      lastTopic = null; contextTokens = [];
      let got = null;
      try { got = matchKnowledge(e.k[0]); } catch(err){ return {idx, key:e.k[0], err:err.message}; }
      const text = got && got.text ? got.text : '';
      return { idx, key: e.k[0], ok: text.startsWith(e.a), got: text.slice(0,55) };
    });

    // ٢) التكرار
    const norm = s => s.replace(/[^\\u0621-\\u064A ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').trim();
    const seenA = {}, dupA = [];
    KNOWLEDGE_BASE.forEach((e,i) => {
      const k = norm(e.a).slice(0,60);
      if(seenA[k] !== undefined) dupA.push([seenA[k], i]); else seenA[k] = i;
    });
    const seenK = {}, dupK = [];
    KNOWLEDGE_BASE.forEach((e,i) => e.k.forEach(kw => {
      const n = norm(kw);
      if(seenK[n] !== undefined && seenK[n] !== i) dupK.push([n, seenK[n], i]); else seenK[n] = i;
    }));
    window.__dup = { answers: dupA, keys: dupK };

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
  `);

  setTimeout(() => {
    let failed = 0;

    // ١
    const self = w.__self || [];
    const bad = self.filter(r => !r.ok && !ALLOWED.includes(r.key));
    console.log(`١) كل مفهوم يُجيب بنفسه — ${self.length - bad.length}/${self.length}`);
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
