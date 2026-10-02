// مولّد «معرض الأطلس» — صور ملوّنة للوحة الواجهة، مرسومة بكسلاً بكسلاً من بيانات حقيقية مفتوحة.
// يُشغَّل يدوياً عند الحاجة، ولا يُحمَّل بالموقع.
// التشغيل (من هذا المجلد، بعد تثبيت حزم render-maps.mjs نفسها):
//   CHROME=/path/to/chrome node render-gallery.mjs
//   توليد بعضها فقط: ONLY=g-arabia,n-gulf CHROME=... node render-gallery.mjs
// المخرجات: maps/gallery/<id>.webp
//
// البيانات:
//   اليابس والبحيرات والأنهار والحدود: Natural Earth 1:50m (ملكية عامة)
//   ألوان اليابس: تصنيف كوبن-جايجر للمناخ بدقة 0.5° (Kottek وآخرون 2006) — كل فئة بلونها الطبيعي
//   أضواء الليل: مواقع مدن العالم وعدد سكانها (GeoNames، CC BY 4.0) — محاكاة لا تصوير فضائي
//   موضع الشمس: حساب فلكي (الميل 23.44°)
//   الغيوم: ضجيج إجرائي توضيحي (تختلف كثافته مع دوائر العرض كما في الواقع) — ليست غيوم يوم بعينه
import {createRequire} from 'module'; const require = createRequire(import.meta.url);
const {chromium} = require('playwright-core'); const tc = require('topojson-client'); const fs = require('fs');
const W50 = require('sane-topojson/dist/world_50m.json');
const kjs = fs.readFileSync(require.resolve('koppen-climate-lookup'),'utf8');
const KCODES = ['Af','Am','Aw','As','BWh','BWk','BSh','BSk','Csa','Csb','Csc','Cwa','Cwb','Cwc','Cfa','Cfb','Cfc',
  'Dsa','Dsb','Dsc','Dsd','Dwa','Dwb','Dwc','Dwd','Dfa','Dfb','Dfc','Dfd','ET','EF'];
const koppen = kjs.match(/var koppen_default = "([^"]*)"/)[1].split('\\n').slice(1).filter(Boolean)
  .map(l => { const [a,b,c] = l.split(','); return [+a, +b, KCODES.indexOf(c)]; });
const cities = require('all-the-cities').map(c => [c.loc.coordinates[0], c.loc.coordinates[1], c.population]);
const OUT = new URL('../gallery/', import.meta.url).pathname;
fs.mkdirSync(OUT, {recursive:true});

const land = tc.feature(W50, W50.objects.land), lakes = tc.feature(W50, W50.objects.lakes), rivers = tc.feature(W50, W50.objects.rivers);
const countries = tc.feature(W50, W50.objects.countries);
// فلسطين: تُرسم كاملة دون حدّ داخلي كما في خرائط المنهج القطري؛ وكذلك المغرب مع صحرائه
const MERGE = {ISR:'PSE', ESH:'MAR'};
const cid = (f) => MERGE[f.id] || f.id;
const borders = tc.mesh(W50, W50.objects.countries, (a,b) => a !== b && (MERGE[a.id]||a.id) !== (MERGE[b.id]||b.id));
// القارات: من ملفات القارات في sane-topojson، والباقي (أوقيانوسيا، أنتاركتيكا) بالموقع
const contOf = {};
for(const [file, name] of [['africa','af'],['asia','as'],['europe','eu'],['north-america','na'],['south-america','sa']]){
  const t = require(`sane-topojson/dist/${file}_50m.json`); t.objects.countries.geometries.forEach(g => { contOf[g.id] = contOf[g.id] || name; });
}
// روسيا وتركيا وكازاخستان ومصر عابرة للقارات: تُقسَم بالجبال والقنوات لا بالحدود السياسية (انظر CONT_SPLIT بالصفحة)
['RUS','TUR','KAZ','GEO','AZE'].forEach(id => contOf[id] = 'split');
contOf.EGY = 'af'; contOf.ATA = 'an'; contOf.GRL = 'na'; contOf.CYP = 'as'; contOf.ARM = 'as';
const countryList = countries.features.map(f => ({id: cid(f), cont: contOf[f.id] || null, ct: (f.properties||{}).ct, f}));
// البقية: أوقيانوسيا بالموقع
countryList.forEach(c => { if(!c.cont && c.ct){ const [lo,la] = c.ct; if(lo > 110 || lo < -150) c.cont = 'oc'; } });

// تلوين سياسي بستة ألوان: تلوين جشع على شبكة الجوار فلا تتشابه دولتان متجاورتان
const geoms = W50.objects.countries.geometries, nb = tc.neighbors(geoms);
const polColor = {};
geoms.map((g,i) => i).sort((a,b) => nb[b].length - nb[a].length).forEach(i => {
  const id = MERGE[geoms[i].id] || geoms[i].id; if(!id || id === 'ATA' || polColor[id] !== undefined) return;
  const used = new Set(nb[i].map(j => polColor[MERGE[geoms[j].id] || geoms[j].id]));
  let c = 0; while(used.has(c)) c++; polColor[id] = c;
});
const POL_GROUPS = Array.from({length: Math.max(...Object.values(polColor)) + 1}, (_, c) => Object.keys(polColor).filter(id => polColor[id] === c));
const ARAB = ['DZA','BHR','COM','DJI','EGY','IRQ','JOR','KWT','LBN','LBY','MRT','MAR','OMN','PSE','QAT','SAU','SOM','SDN','SYR','TUN','ARE','YEM'];
const GCC = ['SAU','QAT','ARE','KWT','BHR','OMN'];

const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
const page = await browser.newPage();
page.on('console', m => { if(m.type() === 'error') console.log('PAGE:', m.text()); });
page.on('pageerror', e => console.log('PAGE ERR:', e.message));
await page.setContent('<canvas id=c></canvas>');
// الحزمتان لا تصدّران ملف المتصفح، فنصل إليه من مجلد الحزمة
const nm = new URL('node_modules/', import.meta.url).pathname;
for(const f of ['d3-array/dist/d3-array.min.js','d3-geo/dist/d3-geo.min.js']) await page.addScriptTag({path: nm + f});
await page.evaluate((D) => { window.D = D; }, {
  land, lakes, rivers, borders, koppen, cities, KCODES,
  countries: countryList.map(c => ({id:c.id, cont:c.cont, f:c.f})),
});

// ═══════════════ كود الصفحة: الأنسجة والرسم بكسلاً بكسلاً ═══════════════
await page.evaluate(() => {
  const {geoEquirectangular, geoPath, geoOrthographic, geoEqualEarth, geoMercator, geoGraticule, geoCircle} = d3;
  const rad = Math.PI/180;
  // ألوان طبيعية لفئات كوبن (كما تبدو من الفضاء تقريباً)
  const NAT = {Af:[34,86,38],Am:[46,96,42],Aw:[120,128,62],As:[128,132,70],BWh:[214,180,124],BWk:[190,170,130],
    BSh:[176,152,96],BSk:[156,142,100],Csa:[128,128,78],Csb:[104,116,70],Csc:[96,108,70],Cwa:[84,110,52],Cwb:[96,114,62],Cwc:[96,110,66],
    Cfa:[66,104,48],Cfb:[72,112,58],Cfc:[92,114,74],Dsa:[132,126,88],Dsb:[112,116,80],Dsc:[96,104,76],Dsd:[100,104,84],
    Dwa:[78,104,56],Dwb:[64,94,52],Dwc:[52,80,50],Dwd:[64,82,62],Dfa:[70,106,54],Dfb:[54,90,48],Dfc:[40,72,44],Dfd:[56,76,56],
    ET:[138,126,100],EF:[236,242,246]};
  const KN = D.KCODES.map(c => NAT[c]);

  // ضجيج قيمي ثلاثي الأبعاد على سطح الكرة (لا درز عند خط 180°) — حتمي
  const hash = (x,y,z) => { let h = (x*374761393 + y*668265263 + z*2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const sm = t => t*t*(3-2*t);
  function vnoise(x,y,z){
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = sm(x-xi), yf = sm(y-yi), zf = sm(z-zi);
    const l = (a,b,t) => a + (b-a)*t;
    return l(l(l(hash(xi,yi,zi),hash(xi+1,yi,zi),xf), l(hash(xi,yi+1,zi),hash(xi+1,yi+1,zi),xf), yf),
             l(l(hash(xi,yi,zi+1),hash(xi+1,yi,zi+1),xf), l(hash(xi,yi+1,zi+1),hash(xi+1,yi+1,zi+1),xf), yf), zf);
  }
  function fbm(x,y,z,oct){ let a = .5, f = 1, s = 0, n = 0; for(let i=0;i<oct;i++){ s += a*vnoise(x*f+i*17.3,y*f-i*9.1,z*f+i*5.7); n += a; a *= .5; f *= 2.03; } return s/n; }
  const xyz = (lo,la) => [Math.cos(la*rad)*Math.cos(lo*rad), Math.cos(la*rad)*Math.sin(lo*rad), Math.sin(la*rad)];

  // ─── أنسجة بإسقاط متساوي المسافات تغطي نطاقاً (العالم كله أو منطقة مكبّرة) ───
  window.buildTex = (bb, TW, TH, opts = {}) => {
    const [lo0, lo1, la0, la1] = bb;
    const P = geoEquirectangular().scale(1).translate([0,0]);
    const sx = TW / ((lo1-lo0)*rad), sy = TH / ((la1-la0)*rad);
    // نرسم بإسقاط عادي ثم نحوّل بالمصفوفة كي يكون التحويل خطياً تماماً
    const mk = () => { const c = document.createElement('canvas'); c.width = TW; c.height = TH; return c; };
    const xf = (ctx) => { ctx.setTransform(sx, 0, 0, sy, -lo0*rad*sx, la1*rad*sy); };
    const pth = (ctx) => geoPath(P, ctx);
    const toX = lo => (lo-lo0)/(lo1-lo0)*TW, toY = la => (la1-la)/(la1-la0)*TH;
    const T = {bb, TW, TH, toX, toY};
    if(opts.onlyGroups){ Object.assign(T, opts.onlyGroups); delete T.grp; }

    if(!opts.onlyGroups){
    // قناع اليابس
    const mask = mk(); { const g = mask.getContext('2d'); xf(g); g.beginPath(); pth(g)(D.land); g.fillStyle = '#fff'; g.fill(); g.beginPath(); pth(g)(D.lakes); g.globalCompositeOperation = 'destination-out'; g.fill(); }
    // فئات كوبن: مربعات 0.5° — نسخة حادة (للتلوين حسب الإقليم) ونسخة ناعمة (للألوان الطبيعية)
    const cls = mk(); const gc = cls.getContext('2d');
    const cw = TW/(lo1-lo0)*0.5, ch = TH/(la1-la0)*0.5;
    for(const [la,lo,k] of D.koppen){
      if(lo < lo0-1 || lo > lo1+1 || la < la0-1 || la > la1+1 || k < 0) continue;
      gc.fillStyle = `rgb(${k+1},0,0)`; gc.fillRect(Math.floor(toX(lo-.25)), Math.floor(toY(la+.25)), Math.ceil(cw)+1, Math.ceil(ch)+1);
    }
    T.cls = gc.getImageData(0,0,TW,TH).data;
    const nat = mk(); const gn = nat.getContext('2d');
    gn.fillStyle = 'rgb(120,118,92)'; gn.fillRect(0,0,TW,TH);   // يابس بلا فئة (جزر صغيرة)
    for(const [la,lo,k] of D.koppen){
      if(lo < lo0-1 || lo > lo1+1 || la < la0-1 || la > la1+1 || k < 0) continue;
      const c = KN[k]; gn.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; gn.fillRect(toX(lo-.25), toY(la+.25), cw+.6, ch+.6);
    }
    const blurPx = Math.max(1.2, cw*0.55);
    const nat2 = mk(); const gn2 = nat2.getContext('2d'); gn2.filter = `blur(${blurPx}px)`; gn2.drawImage(nat,0,0); gn2.filter = 'none';
    T.nat = gn2.getImageData(0,0,TW,TH).data;
    T.mask = mask.getContext('2d').getImageData(0,0,TW,TH).data;
    // الجرف القاري: توهّج فيروزي قرب السواحل (المياه الضحلة كالخليج العربي تبدو أفتح من الفضاء)
    const shelf = mk(); const gs = shelf.getContext('2d');
    const kmPx = TW/((lo1-lo0)*111);   // بكسل لكل كم تقريباً
    // يُحسب بدقة أقل (ثُمن) — التمويه الواسع على لوحة كبيرة يُحدث تشوهات مربعة في المتصفح
    const SW = Math.ceil(TW/8), SH = Math.ceil(TH/8); shelf.width = SW; shelf.height = SH;
    gs.filter = `blur(${Math.max(1.5, 45*kmPx/8)}px)`; gs.drawImage(mask, 0, 0, SW, SH);
    T.shelf = gs.getImageData(0,0,SW,SH).data; T.shelfT = {TW:SW, TH:SH};
    // أضواء المدن: كل مدينة بقعة شدتها بحسب عدد سكانها
    if(opts.lights){
      const li = mk(); const gl = li.getContext('2d'); gl.fillStyle = '#000'; gl.fillRect(0,0,TW,TH); gl.globalCompositeOperation = 'lighter';
      const kmS = Math.max(kmPx, 0.0001);
      for(const [lo,la,p] of D.cities){
        if(lo < lo0-2 || lo > lo1+2 || la < la0-2 || la > la1+2) continue;
        const x = toX(lo), y = toY(la);
        const rKm = 1.6 + Math.sqrt(p)/150;             // نصف قطر العمران تقريباً
        const r = Math.max(0.9, rKm*kmS) * (opts.lightScale || 1);
        const a = Math.min(.95, 0.12 + Math.sqrt(p)/1600);
        const g = gl.createRadialGradient(x,y,0,x,y,r*2.2);
        g.addColorStop(0, `rgba(255,214,150,${a})`); g.addColorStop(.35, `rgba(255,170,80,${a*.45})`); g.addColorStop(1,'rgba(255,140,40,0)');
        gl.fillStyle = g; gl.fillRect(x-r*2.2, y-r*2.2, r*4.4, r*4.4);
      }
      T.lights = gl.getImageData(0,0,TW,TH).data;
    }
    }
    // أقنعة الدول (للتظليل) — مجموعات بألوان مختلفة: قناة الأحمر = رقم المجموعة
    if(opts.groups){
      const gm = mk(); const gg = gm.getContext('2d'); xf(gg);
      opts.groups.forEach((ids, gi) => {
        const fs = D.countries.filter(c => typeof ids === 'function' ? ids(c) : ids.includes(c.id));
        gg.beginPath(); fs.forEach(c => pth(gg)(c.f)); gg.fillStyle = `rgb(${gi+1},0,0)`; gg.fill();
      });
      T.grp = gg.getImageData(0,0,TW,TH).data;
    }
    return T;
  };

  const bil = (T, arr, x, y, out) => {
    const W = T.TW, H = T.TH;
    x = Math.max(0, Math.min(W-1.001, x)); y = Math.max(0, Math.min(H-1.001, y));
    const x0 = x|0, y0 = y|0, fx = x-x0, fy = y-y0, i = (y0*W+x0)*4, j = i+4, k = i+W*4, l = k+4;
    for(let c=0;c<4;c++) out[c] = (arr[i+c]*(1-fx)+arr[j+c]*fx)*(1-fy) + (arr[k+c]*(1-fx)+arr[l+c]*fx)*fy;
    return out;
  };
  const near = (T, arr, x, y) => { x = Math.max(0, Math.min(T.TW-1, Math.round(x))); y = Math.max(0, Math.min(T.TH-1, Math.round(y))); return arr[(y*T.TW+x)*4]; };

  // موضع الشمس: نقطة عمودية الشمس (طول، عرض) → متجه
  window.sunVec = (lo, la) => xyz(lo, la);

  // ─── الرسم ───
  // v: {W,H, proj:'ortho'|'equal'|'merc', rotate, R, cx, cy, bb, T, sun, lights, clouds, night, highlight, bg}
  window.renderView = (v) => {
    const c = document.getElementById('c'); c.width = v.W; c.height = v.H; const ctx = c.getContext('2d');
    let P;
    if(v.proj === 'ortho') P = geoOrthographic().rotate(v.rotate).scale(v.R).translate([v.cx, v.cy]).clipAngle(90);
    else if(v.proj === 'equal'){ P = geoEqualEarth().rotate(v.rotate || [0,0]); P.fitExtent([[v.pad, v.pad],[v.W-v.pad, v.H-v.pad]], {type:'Sphere'}); }
    else { P = geoMercator(); P.fitExtent([[0,0],[v.W,v.H]], {type:'MultiPoint', coordinates:[[v.bb[0],v.bb[2]],[v.bb[1],v.bb[3]]]}); }
    window.__P = P;
    const T = v.T, img = ctx.createImageData(v.W, v.H), d = img.data;
    const s = v.sun ? v.sun : null;
    // اتجاه النظر (للكرة): من مركز الدوران
    const vc = v.proj === 'ortho' ? xyz(-v.rotate[0], -v.rotate[1]) : [0,0,1];
    const tmp = [0,0,0,0], tl = [0,0,0,0], ts = [0,0,0,0];
    // نجوم حتمية في الخلفية
    for(let py=0; py<v.H; py++) for(let px=0; px<v.W; px++){
      const o = (py*v.W+px)*4;
      const ll = P.invert([px+.5, py+.5]);
      let inside = !!ll && isFinite(ll[0]);
      let mu = 1;
      if(inside && v.proj === 'ortho'){ const dx = (px+.5-v.cx)/v.R, dy = (py+.5-v.cy)/v.R, r2 = dx*dx+dy*dy; if(r2 >= 1) inside = false; else mu = Math.sqrt(1-r2); }
      if(inside && v.proj === 'equal'){ const q = P(ll); if(!q || Math.abs(q[0]-px-.5) > 1 || Math.abs(q[1]-py-.5) > 1) inside = false; }
      if(!inside){ const b = v.bgFn(px, py); d[o]=b[0]; d[o+1]=b[1]; d[o+2]=b[2]; d[o+3]=255; continue; }
      const [lo, la] = ll;
      const tx = (lo - T.bb[0])/(T.bb[1]-T.bb[0])*T.TW, ty = (T.bb[3]-la)/(T.bb[3]-T.bb[2])*T.TH;
      bil(T, T.mask, tx, ty, tmp); const landA = tmp[0]/255;
      bil(T, T.nat, tx, ty, tl);
      bil(T.shelfT, T.shelf, tx/8, ty/8, ts); const sh = ts[0]/255;
      const p3 = xyz(lo, la);
      // المحيط: أزرق عميق يفتح قرب السواحل
      const deep = v.ocean || [12,44,82], mid = [24,92,128], shal = [52,150,160];
      const on = fbm(p3[0]*5+3, p3[1]*5, p3[2]*5, 3) - .5;          // تفاوت خفيف في عمق اللون
      const shA = v.noShelf ? 0 : Math.pow(sh, 2)*.32, s2 = 0;
      let oc = [deep[0]*(1+on*.35)+(mid[0]-deep[0])*shA, deep[1]*(1+on*.3)+(mid[1]-deep[1])*shA, deep[2]*(1+on*.25)+(mid[2]-deep[2])*shA];
      oc = [oc[0]+(shal[0]-oc[0])*s2, oc[1]+(shal[1]-oc[1])*s2, oc[2]+(shal[2]-oc[2])*s2];
      // جليد بحري تقريبي: القطب الشمالي (نحو 80° فأكثر) والرفوف الجليدية حول أنتاركتيكا
      const ice = v.seaIce !== false ? Math.max(0, Math.min(1, (la - 78 + 4*(fbm(p3[0]*6,p3[1]*6,p3[2]*6,3)-.5))/2.2), Math.min(1, Math.max(0, (-la - 77)/1.5))) : 0;
      if(ice > 0) oc = [oc[0]+(226-oc[0])*ice, oc[1]+(236-oc[1])*ice, oc[2]+(242-oc[2])*ice];
      // اليابس: لون طبيعي + نسيج خفيف
      const dt = v.detail || 1, n = fbm(p3[0]*38*dt, p3[1]*38*dt, p3[2]*38*dt, 4) - .5, n2 = fbm(p3[0]*170*dt, p3[1]*170*dt, p3[2]*170*dt, 3) - .5;
      let ld = [tl[0]*(1+n*.32+n2*.12), tl[1]*(1+n*.30+n2*.12), tl[2]*(1+n*.26+n2*.12)];
      // التظليل حسب الفئات أو الدول
      if(v.highlight){
        const k = near(T, T.cls, tx, ty) - 1, g = T.grp ? near(T, T.grp, tx, ty) : 0;
        const hc = v.highlight(k, g, lo, la, D.KCODES[k]);
        if(hc && landA > .5){ ld = [hc[0]*(1+n*.15), hc[1]*(1+n*.15), hc[2]*(1+n*.15)]; }
        else if(v.dimOthers){ const gy = (ld[0]*.3+ld[1]*.59+ld[2]*.11); ld = [gy*.55+40, gy*.55+44, gy*.55+46]; oc = oc.map(x => x*.8); }
      }
      let r = oc[0]+(ld[0]-oc[0])*landA, gg = oc[1]+(ld[1]-oc[1])*landA, b = oc[2]+(ld[2]-oc[2])*landA;
      // الغيوم
      if(v.clouds){
        const latw = 0.42 + 0.22*Math.exp(-(((la-6)/9)**2)) + 0.24*Math.exp(-(((Math.abs(la)-55)/14)**2)) - 0.22*Math.exp(-(((Math.abs(la)-25)/8)**2));
        // التواء المجال يعطي الغيوم شكلاً ممتداً لا كتلاً مستديرة؛ والصحاري أقل غيوماً
        const wx = fbm(p3[0]*2+5, p3[1]*2, p3[2]*2, 3) - .5, wy = fbm(p3[0]*2, p3[1]*2+7, p3[2]*2, 3) - .5;
        const kc = D.KCODES[near(T, T.cls, tx, ty) - 1] || '', dry = kc.startsWith('BW') ? .1 : kc.startsWith('BS') ? .05 : 0;
        const cf = fbm(p3[0]*4.6+wx*2.2+11, p3[1]*4.6+wy*2.2, p3[2]*9, 7), t0 = .62 - latw*v.clouds*.26 + dry;
        let cl = Math.max(0, Math.min(1, (cf - t0)/.2)); cl = cl*cl*(3-2*cl);
        const wisp = fbm(p3[0]*26, p3[1]*26, p3[2]*40, 3);              // تفاصيل رقيقة داخل الغيمة
        cl *= .55 + .6*wisp;
        r += (246-r)*cl*.85; gg += (248-gg)*cl*.85; b += (252-b)*cl*.85;
      }
      // الإضاءة
      if(s){
        const nd = p3[0]*s[0]+p3[1]*s[1]+p3[2]*s[2];
        const day = Math.max(0, Math.min(1, (nd + .06)/.16));
        const lam = .32 + .78*Math.max(0, nd)**.8;
        let dr = r*lam, dg = gg*lam, db = b*lam;
        // لمعان الشمس على الماء
        if(landA < .5){ const h = [s[0]+vc[0], s[1]+vc[1], s[2]+vc[2]], hl = Math.hypot(...h); const sp = Math.max(0, (p3[0]*h[0]+p3[1]*h[1]+p3[2]*h[2])/hl)**260 * (1-landA); dr += 70*sp; dg += 75*sp; db += 70*sp; }
        // جانب الليل: أضواء المدن
        let nr = r*.08+2, ng = gg*.09+3, nb = b*.13+6;
        if(T.lights){ bil(T, T.lights, tx, ty, tmp); const t = v.lightGain || 1.25; nr += tmp[0]*t; ng += tmp[1]*t; nb += tmp[2]*t*.9; }
        r = nr + (dr-nr)*day; gg = ng + (dg-ng)*day; b = nb + (db-nb)*day;
      } else if(v.night){
        r = r*.10+4; gg = gg*.11+7; b = b*.15+14;
        if(T.lights){ bil(T, T.lights, tx, ty, tmp); const t = v.lightGain || 1.25; r += tmp[0]*t; gg += tmp[1]*t; b += tmp[2]*t*.9; }
      }
      // الغلاف الجوي عند الحافة
      if(v.proj === 'ortho'){
        const a = (1-mu)**2.6 * .75; const dayA = s ? Math.max(.12, Math.min(1, ((p3[0]*s[0]+p3[1]*s[1]+p3[2]*s[2])+.25)/.5)) : 1;
        r += (110-r)*a*dayA; gg += (170-gg)*a*dayA; b += (255-b)*a*dayA;
      }
      d[o] = r; d[o+1] = gg; d[o+2] = b; d[o+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // توهّج الغلاف الجوي خارج القرص
    if(v.proj === 'ortho'){
      const g = ctx.createRadialGradient(v.cx, v.cy, v.R*.985, v.cx, v.cy, v.R*1.075);
      const ga = v.night ? .35 : .85;
      g.addColorStop(0, `rgba(120,180,255,${ga})`); g.addColorStop(.35, `rgba(70,130,230,${ga*.45})`); g.addColorStop(1, 'rgba(40,80,200,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(v.cx, v.cy, v.R*1.08, 0, Math.PI*2); ctx.moveTo(v.cx + v.R*.985, v.cy); ctx.arc(v.cx, v.cy, v.R*.985, 0, Math.PI*2, true); ctx.fill('evenodd'); ctx.restore();
    }
    // طبقات متجهية فوق الصورة
    const path = geoPath(P, ctx);
    for(const L of (v.layers || [])){
      ctx.save(); ctx.beginPath(); path(L.geo);
      if(L.fill){ ctx.fillStyle = L.fill; ctx.fill(); }
      if(L.stroke){ ctx.setLineDash(L.dash || []); ctx.lineWidth = L.w || 1; ctx.strokeStyle = L.stroke; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if(L.glow){ ctx.shadowColor = L.glow; ctx.shadowBlur = L.glowR || 8; } ctx.stroke(); }
      ctx.restore();
    }
    if(v.post) v.post(ctx, P);
    return true;
  };

  // خلفيات
  window.bgSpace = (W, H, seed = 1) => {
    const stars = []; let st = seed*9301 + 49297;
    const rnd = () => (st = (st*233280 + 49297) % 2147483647) / 2147483647;
    for(let i=0;i<W*H/900;i++) stars.push([Math.floor(rnd()*W), Math.floor(rnd()*H), rnd()]);
    const S = new Map(stars.map(([x,y,b]) => [y*W+x, b]));
    return (x,y) => { const b = S.get(y*W+x); const base = [3,7,16]; const vg = 1 - Math.hypot(x/W-.5, y/H-.5)*.5;
      if(b !== undefined && b > .35){ const v = 90 + b*165; return [v, v, Math.min(255, v+20)]; }
      return base.map(c => c*vg + 2); };
  };
  window.bgFlat = () => () => [31,18,22];   // #1f1216 — نفس خلفية إطار اللوحة فلا تظهر حواف

  // أدوات طبقات
  window.G = {
    grat: (step) => geoGraticule().step(step)(),
    lat: (la) => ({type:'LineString', coordinates: Array.from({length:361}, (_,i) => [-180+i, la])}),
    lon: (lo) => ({type:'LineString', coordinates: Array.from({length:181}, (_,i) => [lo, -90+i])}),
    sphere: {type:'Sphere'},
    land: D.land, rivers: D.rivers, lakes: D.lakes, borders: D.borders,
    countries: (ids) => ({type:'FeatureCollection', features: D.countries.filter(c => ids.includes(c.id)).map(c => c.f)}),
    hemi: (lo, la) => geoCircle().center([lo, la]).radius(90)(),
  };
});

// ═══════════════ قائمة الصور ═══════════════
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const W = 1400, H = 700;
const GLOBE_R = 245;          // قطر 490: يبقى كاملاً بأي قصّ بين 1.6:1 و2.7:1
// متجه الشمس بالتوقيت: نقطة عمودية الشمس (طولها حسب الساعة بتوقيت غرينتش، وعرضها حسب الميل)
const SUN = (utcHour, decl) => [(12 - utcHour)*15, decl];

const shots = [];
const add = (id, spec) => shots.push({id, ...spec});
// كرات أرضية نهارية: الشمس من أعلى يسار المشاهد قليلاً
const globe = (id, lo, la, o = {}) => add(id, {kind:'globe', lo, la, ...o});

globe('g-arabia', 49, 23, {clouds:.55});
globe('g-africa', 18, 2, {clouds:.75});
globe('g-europe', 14, 48, {clouds:.75});
globe('g-asia', 92, 34, {clouds:.6});
globe('g-namerica', -98, 40, {clouds:.7});
globe('g-samerica', -60, -16, {clouds:.75});
globe('g-australia', 134, -26, {clouds:.6});
globe('g-arctic', 20, 88, {clouds:.45});
globe('g-antarctica', 30, -88, {clouds:.45});
globe('g-pacific', -165, 2, {clouds:.75});
globe('g-atlantic', -32, 18, {clouds:.75});
globe('g-indian', 76, -14, {clouds:.75});
// مناظر قريبة من المدار: كرة كبيرة يظهر أفقها
const orbit = (id, lo, la, o = {}) => add(id, {kind:'orbit', lo, la, ...o});
orbit('o-gulf', 51.5, 24.5, {clouds:.3, R:900, tilt:-14});
orbit('o-med', 18, 36, {clouds:.5, R:880, tilt:-12});
orbit('o-nile', 32, 24, {clouds:.3, R:900, tilt:-12});
orbit('o-sahara', 10, 22, {clouds:.3, R:820, tilt:-10});
orbit('o-himalaya', 84, 26, {clouds:.55, R:880, tilt:-12});
orbit('o-amazon', -60, -6, {clouds:.7, R:860, tilt:-10});
// كرات ليلية
const night = (id, lo, la, o = {}) => add(id, {kind:'night', lo, la, ...o});
night('n-arabia', 47, 25);
night('n-europe', 14, 40);
night('n-asia', 100, 26);
night('n-americas', -88, 28);
night('n-africa', 20, 5);
// الليل عن قرب (مركاتور)
const nreg = (id, bb, o = {}) => add(id, {kind:'nreg', bb, ...o});
nreg('nr-gulf', [46.5, 57.5, 22.3, 28.2]);
nreg('nr-nile', [26.0, 37.0, 22.8, 32.4]);
nreg('nr-india', [66, 92, 7, 30]);
nreg('nr-europe', [-11, 31, 36, 57]);
nreg('nr-eastasia', [104, 142, 22, 42]);
nreg('nr-usa', [-98, -66, 26, 45]);
// الشمس والفصول — موضع الشمس محسوب
const sun = (id, lo, la, sunLL, o = {}) => add(id, {kind:'sun', lo, la, sunLL, ...o});
sun('s-terminator', 40, 15, SUN(15.5, 0), {clouds:.6});              // الغروب يزحف على الخليج
sun('s-equinox', 20, 0, SUN(12 - (20+70)/15, 0), {clouds:.5, lines:'equator'});
sun('s-june', 20, 0, SUN(12 - (20+70)/15, 23.44), {clouds:.5, lines:'tropics'});
sun('s-december', 20, 0, SUN(12 - (20+70)/15, -23.44), {clouds:.5, lines:'tropics'});
sun('s-midnight', 0, 90, SUN(0, 23.44), {clouds:.35, lines:'arctic'});   // شمس منتصف الليل
sun('s-polarnight', 0, 90, SUN(0, -23.44), {clouds:.35, lines:'arctic'});
// شبكة الإحداثيات
const grid = (id, lo, la, mode, o = {}) => add(id, {kind:'grid', lo, la, mode, ...o});
grid('gr-grid', 30, 20, 'grid');
grid('gr-ns', 30, 12, 'ns');
grid('gr-ew', 0, 15, 'ew');
grid('gr-tropics', 40, 10, 'tropics');
grid('gr-tilt', 40, 0, 'tilt');
// خرائط العالم المسطحة (Equal Earth)
const flat = (id, o) => add(id, {kind:'flat', ...o});
flat('f-natural', {clouds:0});
flat('f-night', {night:true});
flat('f-rivers', {style:'rivers'});
flat('f-political', {style:'political'});
flat('f-continents', {style:'continents'});
flat('f-arab', {style:'arab'});
flat('f-timezones', {style:'timezones'});
// الأقاليم المناخية الثمانية في كتاب السابع — أقرب فئات كوبن لكل إقليم
const REG = {
  equatorial: {c:[18, 128, 79], k:['Af','Am']},
  tropical:   {c:[201, 187, 87], k:['Aw','As']},
  desert:     {c:[227, 154, 69], k:['BWh','BWk']},
  med:        {c:[227, 155, 155], k:['Csa','Csb','Csc']},
  chinese:    {c:[79, 170, 124], k:['Cfa','Cwa'], minLat:22},
  westeu:     {c:[74, 159, 214], k:['Cfb','Cfc'], minLat:35},
  laurent:    {c:[122, 79, 163], k:['Dfa','Dfb','Dwa','Dwb'], east:true},
  polar:      {c:[107, 184, 224], k:['ET','EF'], minLat:55},
};
for(const r in REG) flat('c-' + r, {style:'climate', reg:r});
// خرائط إقليمية بألوان طبيعية
const reg = (id, bb, o = {}) => add(id, {kind:'reg', bb, ...o});
reg('r-gcc', [33, 61, 11.5, 31.5], {groups:[GCC], hl:'gcc'});
reg('r-arabia', [30, 62, 10, 34]);

// ═══════════════ التنفيذ ═══════════════
const TEX = {};
async function tex(key, bb, TW, TH, opts){
  if(TEX[key]) return; TEX[key] = true;
  await page.evaluate(([key, bb, TW, TH, opts]) => {
    const o = {...opts}; if(o.groupsSpec) o.groups = o.groupsSpec;
    window.TX = window.TX || {}; window.TX[key] = buildTex(bb, TW, TH, o);
  }, [key, bb, TW, TH, opts]);
}
const save = async (id) => {
  const url = await page.evaluate(() => document.getElementById('c').toDataURL('image/webp', .86));
  fs.writeFileSync(`${OUT}/${id}.webp`, Buffer.from(url.split(',')[1], 'base64'));
};

const t0 = Date.now();
for(const s of shots){
  if(ONLY && !ONLY.includes(s.id)) continue;
  const tA = Date.now();
  // النسيج العالمي (مرة واحدة)
  if(['globe','orbit','night','sun','grid','flat'].includes(s.kind)) await tex('world', [-180,180,-90,90], 4096, 2048, {lights:true});
  await page.evaluate(([s, W, H, GLOBE_R, REG, ARAB]) => {
    const T = window.TX.world;
    const rot = [-s.lo, -s.la];
    const sunAt = (vLo, vLa, dx, dy) => {   // شمس من أعلى يسار المشاهد: نقطة على الكرة مزاحة عن مركز النظر
      return sunVec(vLo + dx, Math.max(-89, Math.min(89, vLa + dy)));
    };
    const base = {W, H, T, bgFn: bgSpace(W, H, s.id.length*7 + s.id.charCodeAt(2))};
    if(s.kind === 'globe'){
      renderView({...base, proj:'ortho', rotate:rot, R:GLOBE_R, cx:W/2, cy:H/2, clouds:s.clouds, sun: sunAt(s.lo, s.la, -24, 14),
        layers:[{geo:G.lakes, stroke:'rgba(40,90,120,.6)', w:.6}]});
    } else if(s.kind === 'orbit'){
      // الموضع المطلوب يظهر عند 58% من ارتفاع الصورة، ومركز الكرة تحت الصورة فيظهر الأفق منحنياً بالأعلى
      const R = s.R, cy = H*.5 + R*.86, up = Math.asin((cy - H*.58)/R)*180/Math.PI;
      renderView({...base, proj:'ortho', rotate:[-s.lo, -(s.la - up), 0], R, cx:W/2, cy, detail:2, clouds:s.clouds, sun: sunAt(s.lo, s.la, -30, 30),
        layers:[{geo:G.rivers, stroke:'rgba(70,140,170,.75)', w:1.1}, {geo:G.lakes, stroke:'rgba(40,90,120,.6)', w:.6}]});
    } else if(s.kind === 'night'){
      renderView({...base, proj:'ortho', rotate:rot, R:GLOBE_R, cx:W/2, cy:H/2, night:true, lightGain:1.6});
    } else if(s.kind === 'sun'){
      const sv = sunVec(s.sunLL[0], s.sunLL[1]);
      const lines = {
        equator: [{geo:G.lat(0), stroke:'rgba(255,214,120,.9)', w:1.6, dash:[6,5]}],
        tropics: [{geo:G.lat(0), stroke:'rgba(255,214,120,.55)', w:1.2, dash:[6,5]}, {geo:G.lat(23.44), stroke:'rgba(255,170,90,.95)', w:1.6, dash:[6,5]}, {geo:G.lat(-23.44), stroke:'rgba(255,170,90,.95)', w:1.6, dash:[6,5]}],
        arctic: [{geo:G.lat(66.56), stroke:'rgba(160,220,255,.95)', w:1.6, dash:[6,5]}],
      }[s.lines] || [];
      renderView({...base, proj:'ortho', rotate:rot, R:GLOBE_R, cx:W/2, cy:H/2, clouds:s.clouds, sun:sv, lightGain:1.5, layers:lines});
    } else if(s.kind === 'grid'){
      const L = [];
      if(s.mode === 'grid') L.push({geo:G.grat([15,15]), stroke:'rgba(255,255,255,.42)', w:1}, {geo:G.lat(0), stroke:'#ffd36e', w:2.6, glow:'#ffb000'}, {geo:G.lon(0), stroke:'#ff7a5c', w:2.6, glow:'#ff4020'});
      if(s.mode === 'ns') L.push({geo:G.hemi(0, 90), fill:'rgba(255,190,70,.20)'}, {geo:G.lat(0), stroke:'#ffd36e', w:3, glow:'#ffb000', glowR:12});
      if(s.mode === 'ew') L.push({geo:G.hemi(90, 0), fill:'rgba(80,200,255,.20)'}, {geo:G.lon(0), stroke:'#ff7a5c', w:3, glow:'#ff4020', glowR:12}, {geo:G.lon(180), stroke:'#ff7a5c', w:3, glow:'#ff4020', glowR:12});
      if(s.mode === 'tropics') L.push({geo:G.lat(0), stroke:'#ffd36e', w:2.4, glow:'#ffb000'},
        {geo:G.lat(23.44), stroke:'#ff9a5c', w:2, dash:[7,5]}, {geo:G.lat(-23.44), stroke:'#ff9a5c', w:2, dash:[7,5]},
        {geo:G.lat(66.56), stroke:'#9fdcff', w:2, dash:[7,5]}, {geo:G.lat(-66.56), stroke:'#9fdcff', w:2, dash:[7,5]});
      if(s.mode === 'tilt') L.push({geo:G.grat([15,15]), stroke:'rgba(255,255,255,.22)', w:.8}, {geo:G.lat(0), stroke:'#ffd36e', w:2.2});
      const rotate = s.mode === 'tilt' ? [-s.lo, -s.la, -23.44] : rot;
      renderView({...base, proj:'ortho', rotate, R:GLOBE_R, cx:W/2, cy:H/2, clouds:.35, sun: sunAt(s.lo, s.la, -38, 18), layers:L,
        post: s.mode === 'tilt' ? (ctx) => {   // محور الدوران المائل 23.44° يخرج من القطبين
          const a = 23.44*Math.PI/180, len = GLOBE_R*1.32, dx = Math.sin(a)*len, dy = Math.cos(a)*len;
          ctx.save(); ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 3; ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 10; ctx.setLineDash([10,7]);
          ctx.beginPath(); ctx.moveTo(W/2 - dx, H/2 - dy); ctx.lineTo(W/2 + dx, H/2 + dy); ctx.stroke();
          ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.moveTo(W/2, H/2 - len); ctx.lineTo(W/2, H/2 + len); ctx.stroke(); ctx.restore(); } : null});
    } else if(s.kind === 'flat'){
      const v = {...base, bgFn: bgFlat(W, H), proj:'equal', pad:14, seaIce:true};
      const ann = [];
      if(s.night){ v.night = true; v.lightGain = 1.7; }
      if(s.style === 'rivers'){ v.dimOthers = false; ann.push({geo:G.rivers, stroke:'#7fd7ff', w:1.25, glow:'#2aa8ff', glowR:6}, {geo:G.lakes, fill:'#7fd7ff'}); v.ocean = [8,30,58]; }
      if(s.style === 'political'){
        const pal = [[232,170,92],[124,186,120],[226,124,108],[118,164,214],[204,170,214],[230,206,112]];
        v.highlight = (k, g) => g ? pal[(g-1) % pal.length] : null;
        ann.push({geo:G.borders, stroke:'rgba(30,30,30,.55)', w:.55});
      }
      if(s.style === 'continents'){
        const cc = {as:[227, 154, 69], af:[219, 167, 60], eu:[74, 159, 214], na:[217, 102, 61], sa:[140, 196, 108], oc:[227, 155, 155], an:[236,244,250]};   // ألوان من لوحة هوية الموقع (تطابق مفتاح اللوحة)
        v.highlight = (k, g) => g ? Object.values(cc)[g-1] : null;
      }
      if(s.style === 'arab'){ v.highlight = (k, g) => g === 1 ? [79, 170, 124] : null; v.dimOthers = true; ann.push({geo:G.countries(ARAB), stroke:'rgba(240,255,240,.8)', w:.6}); }
      if(s.style === 'timezones'){
        v.post = (ctx, P) => { ctx.save(); ctx.beginPath(); d3.geoPath(P, ctx)({type:'Sphere'}); ctx.clip();
          for(let z=-12; z<12; z++){ const lo0 = z*15 - 7.5; if(z % 2) continue;
            const pts = []; for(let la=-89; la<=89; la+=1) pts.push([lo0, la]); for(let la=89; la>=-89; la-=1) pts.push([lo0+15, la]);
            ctx.beginPath(); pts.forEach(([a,b],i) => { const q = P([a,b]); i ? ctx.lineTo(q[0],q[1]) : ctx.moveTo(q[0],q[1]); }); ctx.closePath();
            ctx.fillStyle = 'rgba(255,214,120,.16)'; ctx.fill(); }
          ctx.restore(); };
        ann.push({geo:G.grat([15,180]), stroke:'rgba(255,220,150,.55)', w:.8}, {geo:G.lon(0), stroke:'#ffd36e', w:2, glow:'#ffb000'});
      }
      if(s.style === 'climate'){
        const R = REG[s.reg];
        v.dimOthers = true;
        v.highlight = (k, g, lo, la, code) => {
          if(!R.k.includes(code)) return null;
          if(R.east && !((lo > -100 && lo < -50) || lo > 110)) return null;   // الإقليم اللورانسي: شرق القارات فقط
          if(R.minLat && Math.abs(la) < R.minLat) return null;               // حدود الكتاب بدوائر العرض (لا المرتفعات الاستوائية)
          return R.c;
        };
        ann.push({geo:G.lat(0), stroke:'rgba(255,214,120,.5)', w:1, dash:[5,4]});
      }
      v.layers = [{geo:G.grat([30,30]), stroke:'rgba(255,255,255,.07)', w:.7}, ...ann, {geo:G.sphere, stroke:'rgba(227,201,139,.6)', w:1.6}];
      window.__flatV = v;
    }
  }, [s, W, H, GLOBE_R, REG, ARAB]).catch(e => console.log('ERR', s.id, e.message));

  if(s.kind === 'flat'){
    // الخرائط التي تحتاج أقنعة دول: نسيج عالمي ثانٍ بالمجموعات
    let key = 'world';
    if(s.style === 'political'){ key = 'world-pol'; await page.evaluate((groups) => {
      if(window.TX['world-pol']) return;
      window.TX['world-pol'] = buildTex([-180,180,-90,90], 4096, 2048, {groups, onlyGroups: window.TX.world}); }, POL_GROUPS); }
    if(s.style === 'continents'){ key = 'world-cont'; await page.evaluate(() => {
      if(window.TX['world-cont']) return;
      const order = ['as','af','eu','na','sa','oc','an'];
      const groups = order.map(k => (c) => c.cont === k);
      window.TX['world-cont'] = buildTex([-180,180,-90,90], 4096, 2048, {groups, onlyGroups: window.TX.world});
      // الدول العابرة للقارات: آسيا شرق جبال الأورال ونهر الأورال وجبال القوقاز، وأوروبا غربها
      const T = window.TX['world-cont'], c = document.createElement('canvas'); c.width = T.TW; c.height = T.TH; const g = c.getContext('2d');
      const P = d3.geoEquirectangular().scale(T.TW/(2*Math.PI)).translate([T.TW/2, T.TH/2]); const pa = d3.geoPath(P, g);
      const split = D.countries.filter(x => x.cont === 'split');
      const eu = {type:'Polygon', coordinates:[[[-30,35],[26.5,35],[26.5,40.5],[29,41.3],[41.5,41.3],[49,42],[53,46],[52,48],[51,51],[59,51],[60,60],[60,72],[66,80],[-30,80],[-30,35]]]};
      g.beginPath(); split.forEach(x => pa(x.f)); g.fillStyle = 'rgb(1,0,0)'; g.fill();               // كلها آسيا أولاً
      g.save(); g.beginPath(); pa(eu); g.clip(); g.beginPath(); split.forEach(x => pa(x.f)); g.fillStyle = 'rgb(3,0,0)'; g.fill(); g.restore();
      const add = g.getImageData(0,0,T.TW,T.TH).data;
      for(let i=0;i<add.length;i+=4) if(add[i]) T.grp[i] = add[i];
    }); }
    if(s.style === 'arab'){ key = 'world-arab'; await page.evaluate((ARAB) => {
      if(!window.TX['world-arab']) window.TX['world-arab'] = buildTex([-180,180,-90,90], 4096, 2048, {groups:[ARAB], onlyGroups: window.TX.world}); }, ARAB); }
    await page.evaluate((key) => { const v = window.__flatV; v.T = window.TX[key]; renderView(v); }, key);
  }

  if(s.kind === 'nreg' || s.kind === 'reg'){
    const [lo0, lo1, la0, la1] = s.bb;
    const key = s.id;
    // الإسقاط يملأ الصورة كلها فقد يُظهر أكثر من النطاق المطلوب: نبني النسيج على ما يظهر فعلاً
    const ext = await page.evaluate(([bb, W, H]) => { const P = d3.geoMercator().fitExtent([[0,0],[W,H]], {type:'MultiPoint', coordinates:[[bb[0],bb[2]],[bb[1],bb[3]]]});
      const c = [[0,0],[W,0],[0,H],[W,H]].map(q => P.invert(q)); return [Math.min(...c.map(q=>q[0])), Math.max(...c.map(q=>q[0])), Math.min(...c.map(q=>q[1])), Math.max(...c.map(q=>q[1]))]; }, [s.bb, W, H]);
    const tb = [ext[0]-.5, ext[1]+.5, ext[2]-.5, ext[3]+.5];
    s.detail = Math.max(1, Math.min(14, 360/(ext[1]-ext[0])/2.5));
    await tex(key, tb, 3600, Math.round(3600*(tb[3]-tb[2])/(tb[1]-tb[0])*1.15), {lights: s.kind === 'nreg', groupsSpec: s.groups, lightScale: 1.25});
    await page.evaluate(([s, W, H, key]) => {
      const T = window.TX[key];
      const v = {W, H, T, proj:'merc', bb:s.bb, bgFn: bgFlat(W, H), seaIce:false, detail:s.detail, noShelf:true};
      const L = [{geo:G.lakes, stroke:'rgba(40,90,120,.6)', w:.6}];
      if(s.kind === 'nreg'){ v.night = true; v.lightGain = 2.6; L.push({geo:G.land, stroke:'rgba(120,150,190,.22)', w:.8}); }
      else {
        L.push({geo:G.rivers, stroke:'rgba(80,160,200,.9)', w:1.6}, {geo:G.borders, stroke:'rgba(255,248,230,.55)', w:1, dash:[5,4]});
        if(s.hl){ v.post = (ctx, P) => {
          const pa = d3.geoPath(P, ctx); ctx.save(); ctx.beginPath(); pa(G.countries(s.groups[0]));
          ctx.fillStyle = 'rgba(200,90,51,.82)'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#ffe3a0'; ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore(); }; }
      }
      v.layers = L;
      renderView(v);
    }, [s, W, H, key]);
  }
  await save(s.id);
  const kb = (fs.statSync(`${OUT}/${s.id}.webp`).size/1024).toFixed(0);
  console.log(s.id.padEnd(16), kb + 'KB', ((Date.now()-tA)/1000).toFixed(1) + 's');
}
await browser.close();
console.log('done', ((Date.now()-t0)/1000).toFixed(0) + 's');
