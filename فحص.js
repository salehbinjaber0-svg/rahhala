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
const definedAll = new Set([...html.matchAll(/function ([^\s(]+)\s*\(/g)].map(m => m[1]));
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
const unitCount = (mainScript.match(/subject:"/g) || []).length;
if (unitCount !== 6) err(`عدد الوحدات ${unitCount} بدل 6`);
else ok('الوحدات الست كاملة');

const lessonCount = (mainScript.match(/\{title:"الدرس/g) || []).length;
if (lessonCount !== 12) err(`عدد الدروس ${lessonCount} بدل 12`);
else ok('الدروس الاثنا عشر كاملة');

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
