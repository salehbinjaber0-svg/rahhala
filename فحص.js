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
// الهوية: كحلي + ذهبي على كريمي، بثلاثة خطوط فقط. أي خط أو لون جديد يُرفض حتى يُضاف هنا عن قصد.
// المكتبة المضمّنة (supabase) مستثناة لأنها ليست من تصميم الموقع.
const siteOnly = html.replace(/<script>\s*var supabase=[\s\S]*?<\/script>/, '');

const IDENTITY_TOKENS = {
  '--navy': '#10303f', '--navy-deep': '#0a2029', '--navy-soft': '#164256',
  '--gold': '#c9a15e', '--gold-light': '#e3c98b', '--gold-deep': '#a8813f',
  '--cream': '#f6f1e6', '--cream-warm': '#fdfbf6', '--ink': '#1c2b30',
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
  '000','0a2029','0a4a2e','0d5c39','10303f','111','123746','12804f','158a55','164256','1c2b30',
  '1e5771','1f5c39','1f6f5c','1f8c6e','2a6b5c','2a6b8a','2b8f78','2c7a4b','2f6fa8','3a4548',
  '3a86ad','3d84a8','3f6b72','4a2775','4a5a5f','4a9fd6','4d5f65','4f9f86','4faa7c','59a5c4',
  '5a1f1f','5a3d7a','5a89aa','5c6a6e','6a6458','6b3fa0','6b7a7e','6bb8e0','6d5a35','6fb89c',
  '6fd3b8','7a3030','7a3d00','7a4fa3','7a5a1e','7a5a3a','7a5a9e','7a6538','7a7365','7a8a8e',
  '7d1f1f','7fa2c2','7fe0b8','8a3838','8a8170','8a8a8a','8aa5b8','8cc46c','9a7a45','9a9282',
  '9a9384','9c3b2a','9fd3bd','a32b2b','a8813f','a89f88','a8a08e','a8c8e0','a9b7bb','b0a898',
  'b6ebd2','bcd9dd','c07040','c5bda9','c85a33','c9a15e','c9bb57','cfc6b0','cfe6ee','cfe8dd',
  'd3dfeb','d5cdb8','d6e4f0','d8cdb8','d8cfb8','d9663d','d98324','d9c48f','dcd4c0','e0773a',
  'e0d8c4','e0dccc','e39a45','e39b9b','e3b04f','e3c98b','e3c992','e7a347','e7f3f8','e7f5ef',
  'e8a87c','e8cccc','e8e0cd','e8f0f3','eaf0f4','eaf4f1','eaf7f0','ece5d4','eee','efd9a3','f0daa5',
  'f0ebdd','f2a8a8','f2d9a8','f2ebfa','f2ede0','f2eee0','f2f0ea','f3cfcf','f3e0b3','f3fbf7',
  'f4ead6','f4eaf4','f6e9c9','f6f1e6','f6f8fc','f6f9f8','f7ecd2','f7f0dd','f7f7f5','fadddd',
  'faf3e3','faf6ec','faf7ef','fbe3a0','fbe9e9','fbeee9','fdf0d2','fdf3dd','fdf4e3','fdf6e8',
  'fdfbf6','ff6b6b','ffa578','ffb3a8','ffe6b0','fff','fff3cf','fff3e0','fff6d8','fff6dc','fff8e8',
  'fffaf0','fffdf5','fffdf7','fffdf8',
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
