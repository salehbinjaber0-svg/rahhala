// مولّد خرائط لوحة الواجهة — يُشغَّل يدوياً عند الحاجة لإعادة توليد الصور، ولا يُحمَّل بالموقع.
// التشغيل (من هذا المجلد):
//   npm install d3-geo topojson-client playwright-core sane-topojson koppen-climate-lookup all-the-cities
//   CHROME=/path/to/chrome node render-maps.mjs
// المخرجات: maps/pop.webp · deserts.webp · rain.webp · seas.webp · zones.webp
//           · rafidain.webp · nile.webp · census.webp · labels.json
// توليد بعضها فقط: MAPS=rafidain,nile,census node render-maps.mjs (الباقي لا يُعاد كتابته)
// labels.json = مواضع الأسماء (نسب مئوية) بنفس الإسقاط — تُنسخ إلى HERO_PLATES في index.html
import {geoEqualEarth, geoMercator, geoPath, geoGraticule} from 'd3-geo';
import {createRequire} from 'module'; const require = createRequire(import.meta.url);
const {chromium} = require('playwright-core'); const tc = require('topojson-client'); const fs = require('fs');
const W50 = require('sane-topojson/dist/world_50m.json');
const land = tc.feature(W50, W50.objects.land), lakes = tc.feature(W50, W50.objects.lakes), rivers = tc.feature(W50, W50.objects.rivers);
const kjs = fs.readFileSync(require.resolve('koppen-climate-lookup'),'utf8');
const koppen = kjs.match(/var koppen_default = "([^"]*)"/)[1].split('\\n').slice(1).filter(Boolean).map(l=>{const [a,b,c]=l.split(','); return [+a,+b,c];});
const cities = require('all-the-cities');

const OUT = new URL('..', import.meta.url).pathname;   // الصور تُكتب في مجلد maps/
const WIDTH = 1100, LAT_MAX = 84, LAT_MIN = -58;
const P = geoEqualEarth().translate([0,0]).scale(1);
const [x0] = P([-180,0]), [x1] = P([180,0]);
P.scale((WIDTH-12)/(x1-x0)).translate([WIDTH/2, 0]);
const yTop = P([0,LAT_MAX])[1], yBot = P([0,LAT_MIN])[1];
P.translate([WIDTH/2, -yTop + 6]);
const HEIGHT = Math.round(yBot - yTop + 12);
const path = geoPath(P);
const S = (f) => path(f) || '';
const pct = (lo,la) => { const [x,y]=P([lo,la]); return [+(x/WIDTH*100).toFixed(2), +(y/HEIGHT*100).toFixed(2)]; };

const base = { sphere: S({type:'Sphere'}), grat: S(geoGraticule().step([30,15])()), land: S(land), lakes: S(lakes) };
const kClass = (k) => {
  if(k==='Af'||k==='Am') return 'wet';
  if(k==='Aw'||k==='As'||/^Cw/.test(k)||/^Dw/.test(k)) return 'season';
  if(/^Cs/.test(k)||/^Ds/.test(k)) return 'med';
  if(/^Cf/.test(k)||/^Df/.test(k)) return 'humid';
  if(/^BS/.test(k)) return 'semi';
  if(/^BW/.test(k)) return 'arid';
  if(k==='ET'||k==='EF') return 'polar';
  return null;
};
const cellPts = (la,lo) => { const h=.25; return [[lo-h,la+h],[lo+h,la+h],[lo+h,la-h],[lo-h,la-h]].map(p=>P(p)); };
const cells = koppen.filter(([la])=>la>LAT_MIN-1).map(([la,lo,k])=>({p:cellPts(la,lo),c:kClass(k),k}));

// كثافة السكان: عدد سكان كل مدينة في شبكة بكسلات ثم تنعيم
const grid = new Float64Array(WIDTH*HEIGHT);
for(const c of cities){ const [lo,la]=c.loc.coordinates; if(la<LAT_MIN) continue; const [x,y]=P([lo,la]); const xi=Math.round(x), yi=Math.round(y); if(xi<0||yi<0||xi>=WIDTH||yi>=HEIGHT) continue; grid[yi*WIDTH+xi]+=c.population; }
function blur(a, r){
  const t=new Float64Array(a.length);
  for(let y=0;y<HEIGHT;y++){ let acc=0; for(let x=-r;x<WIDTH+r;x++){ if(x+r<WIDTH) acc+=a[y*WIDTH+x+r]; if(x-r-1>=0) acc-=a[y*WIDTH+x-r-1]; if(x>=0&&x<WIDTH) t[y*WIDTH+x]=acc/(2*r+1);} }
  const o=new Float64Array(a.length);
  for(let x=0;x<WIDTH;x++){ let acc=0; for(let y=-r;y<HEIGHT+r;y++){ if(y+r<HEIGHT) acc+=t[(y+r)*WIDTH+x]; if(y-r-1>=0) acc-=t[(y-r-1)*WIDTH+x]; if(y>=0&&y<HEIGHT) o[y*WIDTH+x]=acc/(2*r+1);} }
  return o;
}
const d = blur(blur(blur(grid,3),3),2);
let mx=0; for(const v of d) if(v>mx) mx=v;
// مقياس جذري بسقف عند 99.7% من القيم: يُبرز المناطق الأكثف فعلاً دون أن تطغى مدينة واحدة
const nz = Array.from(d).filter(v=>v>0).sort((a,b)=>a-b);
const CAP = nz[Math.floor(nz.length*0.997)];
const FLOOR = CAP*0.004;
const dens = Array.from(d, v => v<=FLOOR ? 0 : Math.min(1, Math.pow((v-FLOOR)/(CAP-FLOOR), 0.42)));

const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
const page = await browser.newPage();
await page.setContent(`<canvas id=c width=${WIDTH} height=${HEIGHT}></canvas>`);
await page.evaluate(({base,WIDTH,HEIGHT})=>{
  window.B = Object.fromEntries(Object.entries(base).map(([k,v])=>[k,new Path2D(v)]));
  window.ctx = document.getElementById('c').getContext('2d');
  window.poly = (pts)=>{ ctx.beginPath(); pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath(); };
  window.drawBase = (o) => {
    ctx.clearRect(0,0,WIDTH,HEIGHT);
    const gr = ctx.createLinearGradient(0,0,0,HEIGHT); gr.addColorStop(0,o.sea1); gr.addColorStop(1,o.sea2);
    ctx.fillStyle = gr; ctx.fill(B.sphere);
    ctx.save(); ctx.clip(B.sphere);
    ctx.strokeStyle = o.grat; ctx.lineWidth = .7; ctx.stroke(B.grat);
    ctx.fillStyle = o.land; ctx.fill(B.land);
    if(o.coast){ ctx.strokeStyle=o.coast; ctx.lineWidth=.6; ctx.stroke(B.land); }
    ctx.fillStyle = o.lake || o.sea1; ctx.fill(B.lakes);
    ctx.restore();
    ctx.strokeStyle = o.rim; ctx.lineWidth = 1.6; ctx.stroke(B.sphere);
  };
  window.clipLand = () => { ctx.save(); ctx.clip(B.sphere); ctx.clip(B.land); };
}, {base,WIDTH,HEIGHT});
const ONLY = process.env.MAPS ? process.env.MAPS.split(',') : null;
const want = (name) => !ONLY || ONLY.includes(name);
const save = async (name) => {
  if(!want(name)) return;
  for(const [fmt,q] of [['webp',.86],['png',1]]){
    const url = await page.evaluate(([f,q])=>document.getElementById('c').toDataURL('image/'+f,q), [fmt,q]);
    fs.mkdirSync(OUT,{recursive:true}); if(fmt==='webp') fs.writeFileSync(`${OUT}/${name}.${fmt}`, Buffer.from(url.split(',')[1],'base64'));
  }
};

// ١) السكان
await page.evaluate(({dens,WIDTH,HEIGHT})=>{
  drawBase({sea1:'#0d2a38',sea2:'#0a2230',grat:'rgba(201,161,94,.07)',land:'#17394a',coast:'rgba(201,161,94,.28)',rim:'rgba(201,161,94,.55)'});
  const img = ctx.createImageData(WIDTH,HEIGHT);
  const stops = [[0,[31,111,92,0]],[.25,[31,140,110,150]],[.55,[201,161,94,220]],[.8,[227,201,139,245]],[1,[255,246,220,255]]];
  const col = (t)=>{ for(let i=1;i<stops.length;i++){ if(t<=stops[i][0]){ const [a,ca]=stops[i-1],[b,cb]=stops[i]; const u=(t-a)/(b-a); return ca.map((v,j)=>v+(cb[j]-v)*u);} } return stops.at(-1)[1]; };
  for(let i=0;i<dens.length;i++){ const t=dens[i]; if(!t) continue; const c=col(t); img.data.set([c[0],c[1],c[2],c[3]], i*4); }
  const tmp = document.createElement('canvas'); tmp.width=WIDTH; tmp.height=HEIGHT; tmp.getContext('2d').putImageData(img,0,0);
  ctx.save(); ctx.clip(B.sphere); ctx.drawImage(tmp,0,0); ctx.restore();
}, {dens,WIDTH,HEIGHT});
await save('pop');

// ٢) الصحاري
await page.evaluate((cells)=>{
  drawBase({sea1:'#0f2f3e',sea2:'#0b2533',grat:'rgba(201,161,94,.07)',land:'#25505b',rim:'rgba(201,161,94,.55)'});
  clipLand();
  for(const c of cells){
    const f = c.k==='BWh' ? '#e39a45' : c.k==='BWk' ? '#d9c48f' : c.c==='semi' ? 'rgba(214,180,120,.32)' : null;
    if(!f) continue; poly(c.p); ctx.fillStyle=f; ctx.fill(); ctx.strokeStyle=f; ctx.lineWidth=.5; ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle='rgba(246,241,230,.3)'; ctx.lineWidth=.5; ctx.stroke(B.land);
}, cells);
await save('deserts');

// ٣) الأمطار
await page.evaluate((cells)=>{
  drawBase({sea1:'#0f2f3e',sea2:'#0b2533',grat:'rgba(201,161,94,.07)',land:'#25505b',rim:'rgba(201,161,94,.55)'});
  clipLand();
  const col = {wet:'#12804f', season:'#8cc46c', med:'#c9bb57', humid:'#4a9fd6', semi:'#e3c992', arid:'#e39a45', polar:'#e8f0f3'};
  for(const c of cells){ if(!c.c) continue; poly(c.p); ctx.fillStyle=col[c.c]; ctx.fill(); ctx.strokeStyle=col[c.c]; ctx.lineWidth=.6; ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle='rgba(10,32,41,.55)'; ctx.lineWidth=.5; ctx.stroke(B.land);
}, cells);
await save('rain');

// ٤) البحار والمحيطات
await page.evaluate(()=>{
  drawBase({sea1:'#2a6f8c',sea2:'#154860',grat:'rgba(255,255,255,.08)',land:'#d4b273',coast:'#a8813f',rim:'rgba(227,201,139,.75)',lake:'#2a6f8c'});
});
await save('seas');

// ٥) المناطق الحرارية (حدود الكتاب: 30° · 40° · 66.5°) — على اليابس فقط
const band = (a,b) => { const p=[]; for(let lo=-180;lo<=180;lo+=1) p.push(P([lo,a])); for(let lo=180;lo>=-180;lo-=1) p.push(P([lo,b])); return p; };
const bands = [
  {c:'#d9663d', r:[[-30,30]]}, {c:'#e3b04f', r:[[30,40],[-40,-30]]},
  {c:'#4f9f86', r:[[40,66.5],[-66.5,-40]]}, {c:'#cfe6ee', r:[[66.5,90],[-90,-66.5]]},
].map(b=>({c:b.c, polys:b.r.map(([a,bb])=>band(a,bb))}));
const latl = [30,40,66.5,-30,-40,0].map(v=>{ const l=[]; for(let lo=-180;lo<=180;lo+=1) l.push(P([lo,v])); return {v,l}; });
await page.evaluate(({bands,latl})=>{
  drawBase({sea1:'#0f2f3e',sea2:'#0b2533',grat:'rgba(201,161,94,.05)',land:'#25505b',rim:'rgba(201,161,94,.55)'});
  clipLand(); for(const b of bands) for(const p of b.polys){ poly(p); ctx.fillStyle=b.c; ctx.fill(); } ctx.restore();
  ctx.strokeStyle='rgba(10,32,41,.5)'; ctx.lineWidth=.5; ctx.stroke(B.land);
  ctx.save(); ctx.clip(B.sphere);
  for(const {v,l} of latl){ ctx.beginPath(); l.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.setLineDash(v===0?[]:[5,4]); ctx.strokeStyle = v===0 ? 'rgba(227,201,139,.85)' : 'rgba(246,241,230,.5)'; ctx.lineWidth = v===0?1.3:1; ctx.stroke(); }
  ctx.restore();
}, {bands,latl});
await save('zones');

// ═══ خرائط إقليمية (إسقاط مركاتور مقصوص على المنطقة) ═══
// الأنهار في Natural Earth بلا أسماء — حُدِّدت مقاطعها بمرورها قرب مدن معروفة على مجراها
// (الفرات: الرقة · دير الزور · الرمادي · الحلة · الناصرية — دجلة: الموصل · تكريت · بغداد · الكوت · العمارة
//  — النيل: الخرطوم · أسوان · الأقصر · أسيوط · القاهرة · رشيد)، وتُرسم أعرض من بقية الأنهار
const countries = tc.feature(W50, W50.objects.countries);
const riverF = rivers.features;
const MAJOR = { rafidain:[170,398,190,105,187,364,197], nile:[298,47,165,223,342,378,75] };
const regional = (lo0,lo1,la0,la1) => {
  const P2 = geoMercator().fitWidth(WIDTH, {type:'MultiPoint', coordinates:[[lo0,la0],[lo1,la1]]});
  const H2 = Math.round(P2([lo0,la0])[1] - P2([lo1,la1])[1]);
  const pa = geoPath(P2), S2 = (f)=>pa(f)||'';
  const pct2 = (lo,la) => { const [x,y]=P2([lo,la]); return [+(x/WIDTH*100).toFixed(2), +(y/H2*100).toFixed(2)]; };
  return {P2,H2,S2,pct2};
};
const drawRegion = async (name, R, o) => {
  if(!want(name)) return;
  const paths = {
    land: R.S2(land), lakes: R.S2(lakes),
    borders: R.S2(tc.mesh(W50, W50.objects.countries, (a,b)=>a!==b)),
    focus: R.S2({type:'FeatureCollection', features: countries.features.filter(f=>o.focus.includes(f.id))}),
    minor: R.S2({type:'FeatureCollection', features: riverF.filter((f,i)=>!MAJOR[name].includes(i))}),
    major: R.S2({type:'FeatureCollection', features: MAJOR[name].map(i=>riverF[i])}),
  };
  await page.evaluate(({paths,W,H})=>{
    const c = document.getElementById('c'); c.width = W; c.height = H; window.ctx = c.getContext('2d');
    const P = Object.fromEntries(Object.entries(paths).map(([k,v])=>[k,new Path2D(v)]));
    const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#2a6f8c'); g.addColorStop(1,'#154860');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#d4b273'; ctx.fill(P.land);
    ctx.fillStyle = '#ebc87f'; ctx.fill(P.focus);                       // الدولة الحالية للمنطقة
    ctx.strokeStyle = '#a8813f'; ctx.lineWidth = 1; ctx.stroke(P.land);
    ctx.setLineDash([4,3]); ctx.strokeStyle = 'rgba(90,31,31,.45)'; ctx.lineWidth = 1; ctx.stroke(P.borders); ctx.setLineDash([]);
    ctx.fillStyle = '#2a6f8c'; ctx.fill(P.lakes);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(42,111,140,.8)'; ctx.lineWidth = 1.4; ctx.stroke(P.minor);
    ctx.strokeStyle = '#1e5771'; ctx.lineWidth = 5.5; ctx.stroke(P.major);   // حدّ داكن ثم المجرى الفاتح
    ctx.strokeStyle = '#59a5c4'; ctx.lineWidth = 3; ctx.stroke(P.major);
  }, {paths, W:WIDTH, H:R.H2});
  await save(name);
};
// ٦) بلاد الرافدين — من البحر المتوسط غرباً إلى الخليج العربي شرقاً
const RAF = regional(32.0, 52.5, 27.4, 38.0);
await drawRegion('rafidain', RAF, {focus:['IRQ']});
// ٧) مصر ونهر النيل
const NIL = regional(21.5, 44, 21.6, 34.0);
await drawRegion('nile', NIL, {focus:['EGY']});

// ٨) فترات إجراء التعداد السكاني (كتاب الثامن، الوحدة ٤) — نفس إسقاط خرائط العالم
const CENSUS = { five:['FRA','JPN','DNK'], ten:['USA','IND','EGY'], irregular:['BRA','QAT','VEN'] };
// فرنسا في Natural Earth تضم أقاليمها خارج أوروبا (كغويانا بأمريكا الجنوبية) — نرسم جزءها الأوروبي
// فقط كي لا يظن الطالب أن بقعة في أمريكا الجنوبية دولة أوروبية
const inEurope = (f) => f.id !== 'FRA' ? f : {...f, geometry:{type:'MultiPolygon',
  coordinates: f.geometry.coordinates.filter(poly => { const [lo,la] = poly[0][0]; return lo > -10 && lo < 15 && la > 40 && la < 52; })}};
const cpaths = Object.fromEntries(Object.entries(CENSUS).map(([k,ids])=>[k, S({type:'FeatureCollection', features: countries.features.filter(f=>ids.includes(f.id)).map(inEurope)})]));
if(want('census')){
  await page.evaluate(({base,WIDTH,HEIGHT})=>{
    const c = document.getElementById('c'); c.width = WIDTH; c.height = HEIGHT; window.ctx = c.getContext('2d');
    window.B = Object.fromEntries(Object.entries(base).map(([k,v])=>[k,new Path2D(v)]));
  }, {base,WIDTH,HEIGHT});
  await page.evaluate((cp)=>{
    drawBase({sea1:'#0f2f3e',sea2:'#0b2533',grat:'rgba(201,161,94,.07)',land:'#25505b',coast:'rgba(201,161,94,.25)',rim:'rgba(201,161,94,.55)'});
    const col = {five:'#4a9fd6', ten:'#e39a45', irregular:'#8cc46c'};
    ctx.save(); ctx.clip(B.sphere);
    for(const k in cp){ const p = new Path2D(cp[k]); ctx.fillStyle = col[k]; ctx.fill(p); ctx.strokeStyle = 'rgba(11,37,51,.6)'; ctx.lineWidth = .6; ctx.stroke(p); }
    ctx.restore();
  }, cpaths);
  await save('census');
}

await browser.close();
const L = (t,lo,la) => { const [x,y]=pct(lo,la); return {t,x,y}; };
const out = {W:WIDTH, H:HEIGHT, qatar: pct(51.2,25.3), labels: {
  pop: [L('شرق آسيا',114,31), L('جنوب آسيا',79,20), L('أوروبا',14,50), L('وادي النيل',31.2,27), L('غرب إفريقيا',2,9), L('شرق أمريكا الشمالية',-80,40), L('الصحراء الكبرى',8,21), L('سيبيريا',105,63)],
  deserts: [L('الصحراء الكبرى',8,23), L('صحراء الربع الخالي',50,19.5), L('صحراء غوبي',104,43), L('صحراء كالاهاري',21,-23), L('الصحراء الأسترالية',128,-25), L('صحراء أتاكاما',-70,-24)],
  seas: [L('المحيط الهادئ',-145,8), L('المحيط الأطلسي',-38,18), L('المحيط الهندي',77,-20), L('المحيط المتجمد الشمالي',-10,80), L('المحيط المتجمد الجنوبي',100,-55), L('البحر المتوسط',17,35), L('الخليج العربي',51.5,27.5), L('البحر الأحمر',38,20)],
  zones: [L('خط الاستواء',-150,0), L('30°',-165,30), L('40°',-165,40), L('66.5°',-165,66.5)],
  census: [L('الولايات المتحدة',-99,39), L('البرازيل',-52,-10), L('فنزويلا',-66,7.5), L('فرنسا',2.5,46.5), L('الدانمارك',9.5,56.2), L('مصر',27.5,23), L('الهند',78.5,17), L('اليابان',138.5,36.5)],
},
// الخرائط الإقليمية: لكل منها مقاسها وإسقاطها، فمواضعها تُحسب بإسقاطها هي
regional: Object.fromEntries([['rafidain',RAF,[
    ['نهر الفرات',39.3,35.75],['نهر دجلة',44.7,35.3],['الخليج العربي',50.2,28.0],['البحر المتوسط',33.4,33.3],['العراق حالياً',41.6,32.4]],
    [['أور',46.103,30.963],['بابل',44.421,32.536],['نينوى',43.153,36.359]]],
  ['nile',NIL,[['نهر النيل',30.75,27.0],['البحر المتوسط',27.0,33.1],['البحر الأحمر',37.6,22.6],['مصر',28.5,25.0]],[]]]
  .map(([n,R,lab,pins])=>[n,{W:WIDTH,H:R.H2, labels:lab.map(([t,lo,la])=>{const [x,y]=R.pct2(lo,la); return {t,x,y};}),
      pins:pins.map(([t,lo,la])=>{const [x,y]=R.pct2(lo,la); return {t,x,y};}), qatar:R.pct2(51.2,25.3)}]))
};
fs.writeFileSync(`${OUT}/labels.json`, JSON.stringify(out,null,1));
console.log('done', WIDTH, HEIGHT);
