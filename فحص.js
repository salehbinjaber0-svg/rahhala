#!/usr/bin/env node
/**
 * فحص آلي شامل لموقع رحّالة — يُشغَّل قبل كل رفع
 * الاستخدام:  node فحص.js
 * يرجع رمز خروج 1 لو فيه خطأ حرج، فيمنع الرفع تلقائياً لو رُبط بسكربت النشر.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

const errors = [];   // أخطاء حرجة — تمنع الرفع
const warnings = []; // تنبيهات — تُعرض ولا تمنع
const passed = [];

const err = m => errors.push(m);
const warn = m => warnings.push(m);
const ok = m => passed.push(m);

// ═══════════════════════════════════════════
// 1) السلامة البنيوية
// ═══════════════════════════════════════════
if (!html.trim().endsWith('</html>')) err('الملف لا ينتهي بـ </html> — قد يكون مبتوراً');
else ok('الملف كامل وينتهي صح');

const openScripts = (html.match(/<script[\s>]/g) || []).length;
const closeScripts = (html.match(/<\/script>/g) || []).length;
if (openScripts !== closeScripts) err(`وسوم script غير متوازنة: ${openScripts} فتح مقابل ${closeScripts} إغلاق`);
else ok(`وسوم script متوازنة (${openScripts})`);

const openSections = (html.match(/<section[\s>]/g) || []).length;
const closeSections = (html.match(/<\/section>/g) || []).length;
if (openSections !== closeSections) err(`وسوم section غير متوازنة: ${openSections}/${closeSections}`);
else ok(`وسوم section متوازنة (${openSections})`);

// ═══════════════════════════════════════════
// 2) التكرار — الخطأ الذي عطّل الموقع سابقاً
// ═══════════════════════════════════════════
const count = arr => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
const dupes = obj => Object.entries(obj).filter(([, v]) => v > 1);

const ids = [...html.matchAll(/\sid="([a-zA-Z][\w-]*)"/g)].map(m => m[1]);
const dupIds = dupes(count(ids));
if (dupIds.length) err(`معرّفات HTML مكررة: ${dupIds.map(([k, v]) => `${k}×${v}`).join(', ')}`);
else ok(`لا معرّفات مكررة (${new Set(ids).size} معرّفاً)`);

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const mainScript = scripts[scripts.length - 1] || '';

const fnNames = [...mainScript.matchAll(/function (\w+)\s*\(/g)].map(m => m[1]);
const dupFns = dupes(count(fnNames));
if (dupFns.length) err(`دوال مكررة (تتجاوز بعضها): ${dupFns.map(([k]) => k).join(', ')}`);
else ok(`لا دوال مكررة (${fnNames.length} دالة)`);

const topVars = [...mainScript.matchAll(/^(?:let|const|var) (\w+)/gm)].map(m => m[1]);
const dupVars = dupes(count(topVars));
if (dupVars.length) err(`متغيرات معرّفة مرتين (خطأ صياغة): ${dupVars.map(([k]) => k).join(', ')}`);
else ok('لا متغيرات مكررة');

// ═══════════════════════════════════════════
// 3) الترابط — كل مرجع يشير لشيء موجود
// ═══════════════════════════════════════════
const DYNAMIC_IDS = ['typingIndicator']; // تُنشأ وقت التشغيل
const refs = [...new Set([...html.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))];
const missingRefs = refs.filter(id =>
  !html.includes(`id="${id}"`) && !DYNAMIC_IDS.includes(id) && !id.startsWith('note-')
);
if (missingRefs.length) err(`مراجع DOM لعناصر غير موجودة: ${missingRefs.join(', ')}`);
else ok(`كل مراجع DOM سليمة (${refs.length})`);

const onclicks = [...new Set([...html.matchAll(/onclick="([^\s("]+)\(/g)].map(m => m[1]))];
// نلتقط الدوال بكل صيغها: function foo() · const foo = () => · const foo = function
const definedAll = new Set([
  ...[...html.matchAll(/function ([^\s(]+)\s*\(/g)].map(m => m[1]),
  ...[...html.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function)/g)].map(m => m[1]),
]);
// نستثني استدعاءات المتصفح المدمجة (window.print, location.reload...)
const BUILTIN = /^(window|document|location|history|speechSynthesis)\./;
const missingFns = onclicks.filter(f => !definedAll.has(f) && !BUILTIN.test(f));
if (missingFns.length) err(`أزرار تستدعي دوالاً غير معرّفة: ${missingFns.join(', ')}`);
else ok(`كل دوال الأزرار معرّفة (${onclicks.length})`);

// ═══════════════════════════════════════════
// 4) الأمان
// ═══════════════════════════════════════════
const ADMIN_FNS = [
  'loadRoster','bulkAddRoster','addRosterStudent','addParticipationPoint','deleteRosterStudent',
  'submitWarningNote','openNoteModal','exportWarningsCSV','loadTrash','restoreItem','permanentlyDelete',
  'setAttendance','buildReport','exportReportCSV','openAdminPanel','refreshClassChallenge','switchMyClass',
  'renderMyClassTable','mcAddPoint','mcSubPoint','mcSetAtt','mcOpenNote','exportMyClassCSV','kickStudent',
  'removeStudent','approveStudent','rejectStudent','loadStudentsList','loadQuestionsAdmin','addQuestion',
  'deleteQuestion','openClassDisplay','cdPickStudent','showSiteQR',
  'mcAddStudent','mcRemoveStudent','mcBulkAdd','loadGaps','resolveGap','deleteGap','loadFeedbackSummary'
];
const unguarded = ADMIN_FNS.filter(fn => {
  const m = mainScript.match(new RegExp(`(async )?function ${fn}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]{0,280})`));
  return m && !m[2].includes('isAdmin');
});
if (unguarded.length) err(`دوال معلم بلا فحص صلاحية: ${unguarded.join(', ')}`);
else ok(`كل دوال المعلم محمية (${ADMIN_FNS.length})`);

const GAMES = ['answer','shoot','startMatchGame','startOrderGame','checkOrder'];
const ungated = GAMES.filter(fn => {
  const m = mainScript.match(new RegExp(`function ${fn}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]{0,180})`));
  return m && !m[1].includes('requireApproved');
});
if (ungated.length) err(`ألعاب بلا بوابة موافقة: ${ungated.join(', ')}`);
else ok('كل الألعاب تفحص موافقة المعلم');

if (!mainScript.includes('TEACHER_ONLY_SECTIONS')) err('أقسام المعلم غير محمية من الطلاب');
else ok('أقسام المعلم محمية');

if (!mainScript.includes('salehbinjaber0@gmail.com')) err('بريد المعلم المصرّح به مفقود!');
else ok('بريد المعلم حصري');

// XSS: بيانات المستخدم تُحقن كـHTML بلا esc
const xssRisks = [];
for (const m of mainScript.matchAll(/(innerHTML\s*=\s*`|return\s*`|\+=\s*`)([^`]{0,3000})`/g)) {
  const block = m[2];
  if (!block.includes('<')) continue;
  for (const v of [...block.matchAll(/\$\{([^}]{1,60})\}/g)].map(x => x[1].trim())) {
    if (v.includes('esc(')) continue;
    if (/\b[rsw]\.(name|note|cls|student_name)\b/.test(v)) xssRisks.push(v);
  }
}
if (xssRisks.length) err(`حقن غير محمي (XSS): ${[...new Set(xssRisks)].join(', ')}`);
else ok('لا ثغرات حقن ظاهرة');

// ═══════════════════════════════════════════
// 5) اكتمال البيانات
// ═══════════════════════════════════════════
// المنهجان يُفحصان منفصلين: سابع وثامن، كل منهما 6 وحدات × درسين
function sliceData(name){
  const i = mainScript.indexOf(`const ${name} = {`);
  if (i < 0) return '';
  const j = mainScript.indexOf('\n};', i);
  return j < 0 ? '' : mainScript.slice(i, j);
}
[['UNITS_DATA','سابع'], ['UNITS_DATA_8','ثامن']].forEach(([varName, label])=>{
  const seg = sliceData(varName);
  if (!seg) { err(`منهج ${label} غير موجود (${varName})`); return; }
  const u = (seg.match(/subject:"/g) || []).length;
  const l = (seg.match(/\{title:"الدرس/g) || []).length;
  if (u !== 6) err(`وحدات ${label}: ${u} بدل 6`);
  else if (l !== 12) err(`دروس ${label}: ${l} بدل 12`);
  else ok(`منهج ${label} كامل (6 وحدات · 12 درساً)`);
});

const kbMatch = mainScript.match(/const KNOWLEDGE_BASE = \[([\s\S]*?)\n\];/);
const kbCount = kbMatch ? (kbMatch[1].match(/\{k:\[/g) || []).length : 0;
if (kbCount < 100) warn(`مفاهيم المنقذ ${kbCount} — كانت 102`);
else ok(`قاعدة معرفة المنقذ (${kbCount} مفهوماً)`);

const figCount = (html.match(/class="lessonFig"/g) || []).length;
if (figCount < 7) warn(`الرسوم التوضيحية ${figCount} — كانت 7`);
else ok(`الرسوم التوضيحية (${figCount})`);

// ═══════════════════════════════════════════
// 6) الأداء والنظافة
// ═══════════════════════════════════════════
const si = (mainScript.match(/setInterval\(/g) || []).length;
const ci = (mainScript.match(/clearInterval\(/g) || []).length;
if (ci < si) warn(`مؤقتات قد تتسرب: ${si} setInterval مقابل ${ci} clearInterval`);
else ok('لا تسريب مؤقتات');

if (!mainScript.includes('document.hidden')) warn('الاستطلاع لا يتوقف عند إخفاء التبويب');
else ok('الاستطلاع يتوقف عند إخفاء التبويب');

const sizeKb = Math.round(html.length / 1024);
if (sizeKb > 600) warn(`حجم الملف ${sizeKb} كيلوبايت — كبير`);
else ok(`حجم الملف ${sizeKb} كيلوبايت`);

// ملفات مصاحبة مطلوبة
if (mainScript.includes("sc.src = 'qrcode.js'") && !fs.existsSync(path.join(__dirname, 'qrcode.js')))
  err('ملف qrcode.js مفقود رغم أن الكود يستدعيه');
else if (mainScript.includes("sc.src = 'qrcode.js'")) ok('ملف qrcode.js موجود');

// ═══════════════════════════════════════════
// 7) حارس الهوية البصرية — الخطوط والألوان
// ═══════════════════════════════════════════
// الهوية: العنابي القطري + ذهبي رملي على أبيض (منذ أكتوبر ٢٠٢٦)، بثلاثة خطوط فقط. أي خط أو لون جديد يُرفض حتى يُضاف هنا عن قصد.
// المكتبة المضمّنة (supabase) مستثناة لأنها ليست من تصميم الموقع.
const siteOnly = html.replace(/<script>\s*var supabase=[\s\S]*?<\/script>/, '');

const IDENTITY_TOKENS = {
  '--navy': '#7a1232', '--navy-deep': '#420a1c', '--navy-soft': '#80173a',
  '--gold': '#dba73c', '--gold-light': '#f6dc96', '--gold-deep': '#68430b',
  '--cream': '#f8f3ef', '--cream-warm': '#ffffff', '--ink': '#1f1216',
};
const rootBlock = (siteOnly.match(/:root\s*\{([^}]*)\}/) || [, ''])[1];
const badTokens = Object.entries(IDENTITY_TOKENS).filter(([k, v]) =>
  !new RegExp(k.replace(/-/g, '\\-') + '\\s*:\\s*' + v + '\\s*;', 'i').test(rootBlock));
if (badTokens.length) err(`ألوان الهوية تغيّرت في :root: ${badTokens.map(([k, v]) => `${k} (المعتمد ${v})`).join('، ')}`);
else ok(`ألوان الهوية ثابتة (${Object.keys(IDENTITY_TOKENS).length} متغيراً)`);

const ALLOWED_FONTS = new Set(['tajawal', 'aref ruqaa', 'cairo', 'sans-serif', 'serif', 'monospace', 'inherit', 'system-ui']);
const usedFonts = new Set();
for (const m of siteOnly.matchAll(/font-family\s*:\s*([^;}"`]+)/gi))
  m[1].split(',').forEach(f => { f = f.trim().replace(/^['"]|['"]$/g, '').toLowerCase(); if (f && !f.startsWith('var(')) usedFonts.add(f); });
for (const m of siteOnly.matchAll(/fonts\.googleapis\.com\/css2\?([^"']+)/g))
  for (const f of m[1].matchAll(/family=([^:&]+)/g)) usedFonts.add(decodeURIComponent(f[1]).replace(/\+/g, ' ').toLowerCase());
const badFonts = [...usedFonts].filter(f => !ALLOWED_FONTS.has(f));
if (badFonts.length) err(`خطوط خارج الهوية: ${badFonts.join('، ')} — المعتمد: Tajawal · Aref Ruqaa · Cairo`);
else ok('الخطوط ضمن الهوية (Tajawal · Aref Ruqaa · Cairo)');

// لوحة الألوان المعتمدة — ما في الموقع اليوم. لون جديد: استخدم متغيراً من :root، أو أضفه هنا بقرار واعٍ.
const PALETTE = new Set([
  '000000','0a4a2e','0d5c39','0f7646','111111','12804f','175a4a','1e5771','1f1216','1f5068',
  '1f5a4c','1f5c39','1f8c6e','2b8f78','2c7a4b','2f6fa8','311d23','3a86ad','3d84a8','3f262e',
  '3f6b72','420a1c','432830','492c35','4a2775','4a9fd6','4c2d37','4f0c20','4f9f86','4faa7c',
  '54323c','57343f','594a50','59a5c4','5a1f1f','5a3d7a','5a89aa','5e3743','5e3844','633b48',
  '673e4b','68430b','6a404d','6b3fa0','6b404e','6bb8e0','6fb89c','6fd3b8','724452','744654',
  '7a1232','7a3030','7a3d00','7a4fa3','7a5a3a','7a5a9e','7c2d12','7c5d1d','7d5a13','7fa2c2',
  '7fe0b8','80173a','881438','89661e','8a2c0e','8a3838','8cc46c','9c3b2a','9fd3bd','a71944',
  'a8c8e0','ad8126','b0a398','b6ebd2','b78623','b89e8a','bbb1a9','bcd9dd','c07040','c2410c',
  'c5b5a9','c85a33','c9bb57','cfbeb0','cfe6ee','cfe8dd','d3dfeb','d5c5b8','d6e4f0','d8c6b8',
  'd9663d','d98324','dba73c','dca73a','dfccbd','e0773a','e2d0c2','e39a45','e39b9b','e4d4c8',
  'e6c276','e7af3b','e7d9ce','e7f3f8','e7f5ef','e8a87c','e8ae36','e8cccc','e8f0f3','eaf0f4',
  'eaf4f1','eaf7f0','ebc578','ebc87f','ebded4','ebdfd5','eee3db','eee4dc','efe6de','f0e7df',
  'f1e8e1','f1e9e3','f2a8a8','f2d498','f2d69a','f2ebe5','f2ebfa','f3cfcf','f3d89f','f3ece7',
  'f4eaf4','f4ede7','f4ede8','f4eee9','f5dcab','f5efea','f5efeb','f6d99d','f6dc96','f7f2ee',
  'f7f3ef','f8f3ef','f8f4f1','f9f6f3','f9f7f6','faf7f4','faf9f8','fbedcf','fbeee9','fbf9f8',
  'fbfaf9','fcfbfa','fcfbfb','fde5d6','fdece3','ff6b6b','ffa578','ffb3a8','ffffff',
].map(c => '#' + c));
const usedColors = new Set([...siteOnly.matchAll(/(?<![\w&])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?(?![\w-])/g)].map(m => m[0].toLowerCase()));
const newColors = [...usedColors].filter(c => !PALETTE.has(c));
if (newColors.length) err(`ألوان جديدة خارج لوحة الهوية: ${newColors.join('، ')}`);
else ok(`الألوان ضمن لوحة الهوية (${usedColors.size} لوناً)`);

// ═══════════════════════════════════════════
// النتيجة
// ═══════════════════════════════════════════
const line = '═'.repeat(52);
console.log('\n' + line);
console.log('   فحص رحّالة الآلي');
console.log(line);
console.log(`\n✅ نجح: ${passed.length} فحصاً`);
passed.forEach(p => console.log('   ✓ ' + p));

if (warnings.length) {
  console.log(`\n⚠️  تنبيهات: ${warnings.length}`);
  warnings.forEach(w => console.log('   ! ' + w));
}

if (errors.length) {
  console.log(`\n❌ أخطاء حرجة: ${errors.length}`);
  errors.forEach(e => console.log('   ✗ ' + e));
  console.log('\n' + line);
  console.log('   🚫 لا ترفع — أصلح الأخطاء أولاً');
  console.log(line + '\n');
  process.exit(1);
}

console.log('\n' + line);
console.log('   ✅ الموقع سليم — جاهز للرفع');
console.log(line + '\n');
process.exit(0);
