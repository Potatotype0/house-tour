// Deck controller: type slides from types.js, sheet furniture, 45° band transitions,
// one live line model per type handed to whichever frame is showing.
import { HouseModel } from './model.js?v=202611181554';
import { TYPES, FLOORS, FACTS, INTERIORS } from './types.js?v=202611181554';

// an image that failed (e.g. still being rendered when the page opened) retries a few times
document.addEventListener('error', e => {
  const i = e.target;
  if (i.tagName !== 'IMG' || !i.src || i.src.startsWith('data:')) return;
  const n = +(i.dataset.retry || 0);
  if (n >= 5) return;
  i.dataset.retry = n + 1;
  setTimeout(() => { i.src = i.src.split('?')[0] + '?r=' + Date.now(); }, 1500 * (n + 1));
}, true);

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';   // the #page in the link decides
const stage = document.getElementById('stage');
const band = document.getElementById('band');
const REF = 'CVI-2026-XXX_PRS_R01';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = n => String(n).padStart(2, '0');
const arDigits = s => String(s).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

// ---------- type slides ----------
const pair = (ar, en, cls = '') => `<li class="${cls}"><span class="en">${en}</span><span class="ar">${ar}</span></li>`;
// Per type, in this order: the plans page (press a floor to switch), then all the floors
// together (exploded view), then the VR page last.
function typeSlides(t, i) {
  const n = i + 1, nAr = arDigits(n);
  const photoSlide = (ph, extra = '') => `
<section class="slide" data-no="" data-en="Type ${n} · ${ph.en}" data-ar="النوع ${nAr} · ${ph.ar}" data-type="${t.id}">
  <div class="body">
    <div class="c1-12 frame photo" style="--d:.2s">
      <img src="${ph.src}" alt="${ph.en}, Type ${n}" class="rv rv-r" style="--d:.2s;${ph.fit ? 'object-fit:' + ph.fit + ';background:#F4F1E8' : ''}">
      <div class="cap-band"><div class="mirror" style="align-items:center">
        <div><div class="h2-en rv rv-l" style="--d:.9s;color:#fff">${ph.en}</div>
          <div class="lbl rv rv-l" style="--d:1s;color:var(--grey);margin-top:8px">Type ${n} · ${t.rev}</div></div>
        <div><div class="h2-ar rv rv-r" style="--d:.8s;color:#fff">${ph.ar}</div>
          <div class="lbl-ar rv rv-r" style="--d:.95s;color:var(--grey)">النوع ${nAr}</div></div>
      </div>${extra}</div>
    </div>
  </div>
</section>`;
  const out = [];
  // 1. all the plans on one page: press a floor to switch, line or rendered
  const floorTabs = FLOORS.filter(f => t.floors.includes(f.id)).map(f =>
    `<button class="tab" data-floor="${f.id}" aria-pressed="${f.id === 'ground'}"><span class="ar">${f.ar}</span><span class="en">${f.en}</span></button>`).join('');
  const rooms = FLOORS.filter(f => t.floors.includes(f.id)).map(f =>
    `<ul class="sched rooms" data-floor="${f.id}" ${f.id === 'ground' ? '' : 'hidden'}>${(t.rooms[f.id] || []).map(r => pair(r[0], r[1])).join('')}</ul>`).join('');
  const renders = Object.entries(t.renders || {}).map(([f, src]) =>
    `<img class="render-plan" data-floor="${f}" src="${src}" alt="Type ${n}, ${f} floor, rendered plan" loading="lazy">`).join('');
  out.push(`
<section class="slide plan-slide" data-no="" data-en="Type ${n} · Plans" data-ar="النوع ${nAr} · المخططات" data-type="${t.id}">
  <div class="body">
    <div class="c1-8 frame" style="--d:.2s">
      <div class="live" data-mode="ground" data-type="${t.id}"></div>
      ${renders}
      <div class="frame-cap lbl show plan-cap">Ground floor · cut at 1.2 m</div>
    </div>
    <div class="c9-12 panel" style="padding-left:24px">
      <span class="plan-badge show" style="--d:.3s">Interactive <span class="ar">تفاعلي · اضغط</span></span>
      <div class="mirror"><span class="h2-en rv rv-l" style="--d:.45s">Plans</span><span class="h2-ar rv rv-r" style="--d:.3s">المخططات</span></div>
      <p class="p-en show" style="--d:.6s;margin-top:12px">Press a floor to switch between the plans.</p>
      <div class="tabs show" style="--d:.7s;margin-top:26px" role="group" aria-label="Floor">${floorTabs}</div>
      ${t.renders ? `<div class="tabs mini show" style="--d:.8s;margin-top:12px" role="group" aria-label="Drawing style">
        <button class="tab" data-style="line" aria-pressed="true"><span class="ar">خطي</span><span class="en">Line</span></button>
        <button class="tab" data-style="render" aria-pressed="false"><span class="ar">ملوّن</span><span class="en">Rendered</span></button></div>` : ''}
      <div style="margin-top:26px">${rooms}</div>
    </div>
  </div>
</section>`);
  // 2. the floors, all together (after the plans)
  if (t.exploded) out.push(photoSlide({ src: t.exploded, ar: 'الطوابق', en: 'The floors', fit: 'contain' }, `
        <div class="type-intro">
          <h1 class="h2-ar rv rv-r" style="--d:1.05s;color:#fff;font-size:32px">${t.headAr}</h1>
          <h2 class="h2-en rv rv-l" style="--d:1.15s;color:#fff;font-size:26px;margin-top:2px">${t.headEn}</h2>
          <p class="p-ar rv rv-r" style="--d:1.25s;color:#fff;margin-top:14px;font-size:18px">${t.textAr}</p>
        </div>`));
  if (t.photo) out.push(photoSlide(t.photo));
  // 3. the VR page, last
  out.push(`
<section class="slide" data-no="" data-en="Type ${n} · VR tour" data-ar="النوع ${nAr} · جولة الواقع الافتراضي" data-type="${t.id}">
  <div class="body">
    <div class="c1-8 frame" style="--d:.2s"><div class="live" data-mode="axon" data-type="${t.id}"></div>
      <div class="frame-cap lbl show">${t.rev} · the same model as the VR tour</div></div>
    <div class="c9-12 panel" style="padding-left:24px;justify-content:space-between">
      <div>
        <div class="mirror"><span class="h2-en rv rv-l" style="--d:.45s">Type ${n}</span><span class="h2-ar rv rv-r" style="--d:.3s">النوع ${nAr}</span></div>
        <h1 class="h2-ar rv rv-r" style="--d:.5s;margin-top:18px">${t.headAr}</h1>
        <h2 class="h2-en rv rv-l" style="--d:.6s;margin-top:4px;font-size:38px">${t.headEn}</h2>
        <p class="p-ar rv rv-r" style="--d:.7s;margin-top:22px">امشِ داخل هذا الخيار بنظارة الواقع الافتراضي، غرفةً غرفة وطابقاً طابقاً.</p>
        <p class="p-en rv rv-l" style="--d:.8s;margin-top:10px">Walk through this option in a VR headset, room by room and floor by floor.</p>
      </div>
      <div>
        <ul class="sched figs" style="margin-bottom:30px">
          ${FACTS.map((f, k) => `<li style="--d:${(.9 + k * .07).toFixed(2)}s"><span class="en">${f.en}</span><span class="v fact">${(t.facts || {})[f.id] ? `<span class="ar">${t.facts[f.id][0]}</span><span class="en">${t.facts[f.id][1]}</span>` : '—'}</span><span class="ar">${f.ar}</span></li>`).join('')}
        </ul>
        ${t.vr ? `<a class="btn primary show" style="--d:1.3s" href="${t.vr}"><span>Enter the VR tour</span><span class="ar">ادخل الجولة</span></a>`
               : `<span class="tag show" style="--d:1.3s">VR tour: next phase <span class="ar">الجولة: المرحلة القادمة</span></span>`}
      </div>
    </div>
  </div>
</section>`);
  return out.join('');
}
// interior renders of one type, shown right after that type's pages
const interiorSlides = (t, i) => {
  const list = INTERIORS.filter(r => r.type === t.id), n = i + 1, nAr = arDigits(n);
  return list.map((r, k) => `
<section class="slide" data-no="" data-en="Type ${n} · Interior ${k + 1} / ${list.length}" data-ar="النوع ${nAr} · منظور داخلي ${arDigits(k + 1)} / ${arDigits(list.length)}" data-type="${t.id}">
  <div class="body">
    <div class="c1-12 frame photo" style="--d:.2s">
      <img src="${r.src}" alt="${r.en}" class="rv rv-r" style="--d:.2s">
      <div class="cap-band"><div class="mirror" style="align-items:center">
        <div><div class="h2-en rv rv-l" style="--d:.9s;color:#fff;font-size:34px">${r.en}</div>
          <div class="lbl rv rv-l" style="--d:1s;color:var(--grey);margin-top:8px">Type ${n} · ${t.rev} · interior render</div></div>
        <div><div class="h2-ar rv rv-r" style="--d:.8s;color:#fff;font-size:34px">${r.ar}</div>
          <div class="lbl-ar rv rv-r" style="--d:.95s;color:var(--grey)">النوع ${nAr} · منظور داخلي</div></div>
      </div></div>
    </div>
  </div>
</section>`).join('');
};
document.getElementById('types-here').outerHTML = TYPES.map((t, i) => typeSlides(t, i) + interiorSlides(t, i)).join('');
// overview cards: the rendered ground-floor plan where there is one (else a line plan, set after load)
TYPES.forEach(t => document.querySelectorAll(`img[data-snap][data-type="${t.id}"]`).forEach(img => {
  if (t.renders?.ground) { img.src = t.renders.ground; img.alt = `Type ${TYPES.indexOf(t) + 1}, ground floor plan`; }
  img.classList.add('plan-snap');
}));

// overview captions and the comparison table, from the same data
TYPES.forEach((t, i) => {
  const el = document.getElementById('opt-' + t.id); if (!el) return;
  const d = k => (.6 + i * .15 + k).toFixed(2);
  el.innerHTML = `
    <div class="mirror"><span class="h2-en rv rv-l" style="--d:${d(.1)}s">Type ${i + 1}</span><span class="h2-ar rv rv-r" style="--d:${d(0)}s">النوع ${arDigits(i + 1)}</span></div>
    <div class="mirror sub"><span class="lbl">${t.rev} · ${t.headEn}</span><span class="lbl-ar">${t.headAr}</span></div>
    <p class="p-ar show" style="--d:${d(.3)}s">${t.textAr}</p>
    <p class="p-en show" style="--d:${d(.4)}s">${t.textEn}</p>`;
});

// full-bleed: model and photo frames fill the slide, the text card floats over them
document.querySelectorAll('.c1-8.frame, .c1-12.frame.photo').forEach(f => {
  if (f.querySelector('.live, img')) { f.classList.add('full'); f.closest('.slide').classList.add('has-full'); }
});
const slides = [...document.querySelectorAll('.slide')];
const N = slides.length;

// ---------- one long scrolling page: each 1920x1080 sheet scaled to the window width ----------
slides.forEach(sl => { const w = document.createElement('div'); w.className = 'sheet'; sl.before(w); w.appendChild(sl); });
// phones (narrow, or a short landscape screen) get their own stacked layout instead of a shrunk sheet
const phoneMQ = matchMedia('(max-width: 820px), (max-height: 500px)');
const isPhone = () => phoneMQ.matches;
function fit() {
  document.documentElement.style.setProperty('--s', document.documentElement.clientWidth / 1920);
  document.documentElement.classList.toggle('m', isPhone());
}
addEventListener('resize', () => { fit(); Object.values(models).forEach(m => m.resize()); });
fit();

// ---------- sheet furniture on every page (section numbers in order) ----------
let secNo = 0;
slides.forEach((sl, i) => {
  if (sl.dataset.no !== undefined) {
    const no = pad(++secNo);
    sl.insertAdjacentHTML('afterbegin', `
      <div class="top-rule draw from-l"></div>
      <div class="sec">
        <div class="sec-en rv rv-l" style="--d:.15s"><b>${no}</b>${sl.dataset.en}</div>
        <div class="sec-ar rv rv-r" style="--d:.1s"><b>${arDigits(no)}</b>${sl.dataset.ar}</div>
      </div>`);
  }
  sl.insertAdjacentHTML('beforeend', `
    <div class="foot show" style="--d:.2s"><span>CVI ARCH — RES-DAV design options</span>
      <span class="ref">${REF}</span><span class="pg">${pad(i + 1)} / ${pad(N)}</span></div>`);
});
document.querySelectorAll('.frame').forEach(f => {
  const d0 = parseFloat(getComputedStyle(f).getPropertyValue('--d')) || 0.2;
  ['tl', 'tr', 'br', 'bl'].forEach((c, k) =>
    f.insertAdjacentHTML('beforeend', `<span class="reg ${c}" style="--d:${(d0 + 0.25 + k * 0.08).toFixed(2)}s"></span>`));
});

// ---------- live models: one per type, loaded one after another ----------
const models = {};
for (const t of TYPES) {
  const m = models[t.id] = new HouseModel({ base: t.base });
  m.canvas.addEventListener('webglcontextlost', () => m.canvas.remove());   // show the still instead of a blank
}
const loadLbl = document.getElementById('loadLbl');
// Phones never download the 3D models (41 MB, too slow on mobile data and too heavy for
// phone memory): every 3D frame shows a ready-made picture from img/m/ (made from the same
// models by tools/save_stills.py + the deck page), and floors wipe from one picture to the next.
const LITE = isPhone();
const STILL_V = 1;
const stillSrc = (type, mode) => `img/m/${type}-${mode}.webp?v=${STILL_V}`;
function liteStills() {
  loadLbl.textContent = `Type 1 · ${TYPES[0].rev} · Revit model`;
  document.querySelectorAll('.live').forEach(live => {
    const sl = live.closest('.plan-slide');
    const mode = sl ? (planState[sl.dataset.type] || {}).floor || 'ground' : live.dataset.mode;
    const img = document.createElement('img'); img.className = 'still'; img.alt = ''; img.decoding = 'async';
    img.src = stillSrc(live.dataset.type, mode); live.prepend(img);
  });
}
const FLOOR_ORDER = ['basement', 'ground', 'first', 'roof'];
// all plan pictures are fetched up front (12 small files), so a wipe never waits on the network
const planPics = {};
function preloadPlans() {
  for (const t of TYPES) for (const f of FLOOR_ORDER) {
    const im = new Image(); im.src = stillSrc(t.id, f); planPics[t.id + f] = im;
  }
}
function wipeTo(live, from, to) {               // phone: the new floor's plan wipes in over the old one
  const pic = planPics[live.dataset.type + to];
  const img = document.createElement('img'); img.alt = ''; img.className = 'still'; img.src = stillSrc(live.dataset.type, to);
  const token = live._wipe = (live._wipe || 0) + 1;
  // only the newest press counts: clear any wipe still running
  live.querySelectorAll('img.still.wiping').forEach(i => i.remove());
  const start = () => {
    if (live._wipe !== token) return;           // a newer press took over
    img.classList.add('wiping', FLOOR_ORDER.indexOf(to) > FLOOR_ORDER.indexOf(from) ? 'wipe-up' : 'wipe-down');
    live.append(img);
    const done = () => {
      if (!img.isConnected) return;
      [...live.querySelectorAll('img.still')].forEach(i => { if (i !== img) i.remove(); });
      img.classList.remove('wiping', 'wipe-up', 'wipe-down');
    };
    img.addEventListener('animationend', done, { once: true });
    setTimeout(done, 1000);
    if (reduced) done();
  };
  (pic && pic.complete ? Promise.resolve() : (pic || img).decode()).catch(() => {}).then(start);
}
if (!LITE) (async () => {
  for (const t of TYPES) {
    const m = models[t.id];
    try {
      await m.load(p => { if (t === TYPES[0]) loadLbl.textContent = `Loading model ${Math.round(p * 100)}%`; });
    } catch (e) { console.error(t.id, e); continue; }
    if (t === TYPES[0]) loadLbl.textContent = `Type 1 · ${t.rev} · built up from the Revit model`;
    document.querySelectorAll(`img[data-snap][data-type="${t.id}"]`).forEach(img => { if (!t.renders?.ground) img.src = m.snapshot('ground', 900, 1000, 0, 1.25); });
    stills(t.id);
    if (slides[cur].querySelector(`.live[data-type="${t.id}"]`)) mountLive(slides[cur]);
  }
})();


// A still picture of the model sits in every live frame, so a page whose turn it is not
// (one model can only draw in one place) still shows the house. The live canvas covers it.
const PLAN_MODES = ['basement', 'ground', 'first', 'roof'];
function stillFor(live, mode) {
  const m = models[live.dataset.type];
  const keepOff = m.offX;
  m.offX = offXFor(live);
  const w = live.clientWidth || 1600, h = live.clientHeight || 1000, k = Math.min(1, 1400 / w);
  let img = live.querySelector('img.still');
  if (!img) { img = document.createElement('img'); img.className = 'still'; img.alt = ''; live.prepend(img); }
  img.src = m.snapshot(mode, Math.round(w * k), Math.round(h * k), PLAN_MODES.includes(mode) ? 0 : 0.75);
  m.offX = keepOff;
}
function stills(id) {
  document.querySelectorAll(`.live[data-type="${id}"]`).forEach(live => {
    const sl = live.closest('.plan-slide');
    stillFor(live, sl ? (planState[sl.dataset.type] || {}).floor || 'ground' : live.dataset.mode);
  });
}
const offXFor = live => (!isPhone() && live.closest('.full')) ? 0.16 : 0;
let stillTimer;
phoneMQ.addEventListener('change', () => { clearTimeout(stillTimer); stillTimer = setTimeout(() => { for (const id in models) if (models[id].ready) stills(id); if (slides[cur]) mountLive(slides[cur]); }, 300); });

// a paused model leaves its frame, so the still shows there (a parked canvas would go blank
// when the browser resizes or drops its drawing). Phones never show the live canvas at all:
// the address bar resizes the page while scrolling and phones drop WebGL drawings to save memory,
// so on a phone every frame is a still, redrawn when a floor is pressed.
function parkAll(except) {
  for (const k in models) if (k !== except) { models[k].park(); models[k].canvas.remove(); }
}
// The live model takes over from the frame's still: it starts in exactly the still's pose
// (same view, angle 0.75 or straight down for plans), so there is no jump, and carries on moving.
function arrive(m, live, mode) {
  if (m.canvas.parentNode === live) return false;
  m.offX = offXFor(live);
  m.s.az = PLAN_MODES.includes(mode) ? 0 : 0.75;
  if (m.built) { m.s.rev = 99; m.s.edge = 0; }
  m.mount(live, mode, { instant: true });
  return true;
}
function mountLive(sl) {
  const live = sl.querySelector('.live');
  const id = live && live.dataset.type;
  parkAll(id);
  if (!live) return;
  const m = models[id];
  if (!m.ready) return;                        // mounted when its load finishes
  let mode = live.dataset.mode;
  if (sl.classList.contains('plan-slide')) mode = (planState[sl.dataset.type] || {}).floor || 'ground';
  if (!arrive(m, live, mode)) { m.offX = offXFor(live); m.mount(live, mode); }
  if (mode === 'cover' && !m.built) m.build();
}

// ---------- phones: the plan buttons sit right above the plan, so both are on screen ----------
// (desktop keeps them in the side card; markers remember where they came from)
document.querySelectorAll('.plan-slide').forEach(sl => {
  const badge = sl.querySelector('.plan-badge'), floors = sl.querySelector('.tabs:not(.mini)'), style = sl.querySelector('.tabs.mini');
  const mark = el => { const m = document.createElement('i'); m.hidden = true; el.before(m); return m; };
  sl._ctl = { badge, floors, style, homeBadge: mark(badge), homeFloors: mark(floors) };
  const box = sl._ctl.box = document.createElement('div'); box.className = 'plan-ctl';
  sl.querySelector('.frame').before(box);
});
function placePlanButtons() {
  document.querySelectorAll('.plan-slide').forEach(sl => {
    const c = sl._ctl;
    if (isPhone()) { c.box.append(c.badge, c.floors); if (c.style) c.box.append(c.style); }
    else { c.homeBadge.after(c.badge); c.homeFloors.after(c.floors); if (c.style) c.floors.after(c.style); }
  });
}
placePlanButtons();
phoneMQ.addEventListener('change', placePlanButtons);

// ---------- plan tabs: press a floor, or line / rendered ----------
const planState = {};
document.querySelectorAll('.plan-slide').forEach(sl => {
  const st = planState[sl.dataset.type] = { floor: 'ground', style: 'line' };
  const cap = sl.querySelector('.plan-cap');
  const styleTabs = sl.querySelectorAll('[data-style]');
  const update = () => {
    const img = sl.querySelector(`.render-plan[data-floor="${st.floor}"]`);
    const showRender = st.style === 'render' && img;
    sl.querySelectorAll('.render-plan').forEach(i => i.classList.toggle('on', !!showRender && i === img));
    styleTabs.forEach(b => { b.disabled = b.dataset.style === 'render' && !img; b.setAttribute('aria-pressed', b.dataset.style === st.style); });
    sl.querySelectorAll('.rooms').forEach(u => { u.hidden = u.dataset.floor !== st.floor; });
    const f = FLOORS.find(f => f.id === st.floor);
    cap.textContent = showRender ? `${f.en} · rendered plan` : `${f.en} · cut at ${f.id === 'roof' ? 'parapet' : '1.2 m'}`;
  };
  sl.querySelectorAll('[data-floor].tab').forEach(b => b.addEventListener('click', () => {
    const from = st.floor;
    st.floor = b.dataset.floor;
    sl.querySelectorAll('[data-floor].tab').forEach(t => t.setAttribute('aria-pressed', t === b));
    const m = models[sl.dataset.type], live = sl.querySelector('.live');
    if (LITE && !m.ready) {                    // phone: the new floor's picture, straight away (no animation)
      const img = live.querySelector('img.still');
      if (img) img.src = stillSrc(live.dataset.type, st.floor);
    }
    else if (m.ready) {
      parkAll(sl.dataset.type);
      arrive(m, live, from);                   // from the floor on screen, if the model was elsewhere
      m.offX = offXFor(live);
      m.mount(live, st.floor);                 // the cut slides to the new floor
      clearTimeout(sl._still);                 // the backup picture is redrawn once the glide is over
      sl._still = setTimeout(() => { if (st.floor && m.ready) stillFor(live, st.floor); }, 1800);
    }
    update();
  }));
  styleTabs.forEach(b => b.addEventListener('click', () => { st.style = b.dataset.style; update(); }));
  update();
});

if (LITE) { liteStills(); preloadPlans(); }

// ---------- scrolling ----------
// a page draws itself in the first time it comes into view; the live model follows
// page under the middle of the window (on a phone several short pages fit on screen at once).
let cur = 0;
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting && (e.intersectionRatio > 0.3 || e.intersectionRect.height > innerHeight * 0.35))
      e.target.classList.add('on', 'in');
  });
}, { threshold: [0, 0.1, 0.2, 0.3, 0.5, 0.8, 1] });
function pickCurrent() {
  const mid = innerHeight / 2;
  let best = cur, bd = Infinity;
  slides.forEach((sl, i) => {
    const r = sl.parentNode.getBoundingClientRect();
    const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (d < bd) { bd = d; best = i; }
  });
  if (best !== cur || !slides[cur]._mounted) {
    cur = best; slides[cur]._mounted = true;
    history.replaceState(null, '', '#' + (cur + 1));
    mountLive(slides[cur]);
  }
}
let pickRaf = 0;
addEventListener('scroll', () => { if (!pickRaf) pickRaf = setTimeout(() => { pickRaf = 0; pickCurrent(); }, 60); }, { passive: true });

function go(to) {
  to = Math.max(0, Math.min(N - 1, to));
  slides[to].parentNode.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(cur + 1); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
  else if (e.key === 'Home') { e.preventDefault(); go(0); }
  else if (e.key === 'End') { e.preventDefault(); go(N - 1); }
  else if (e.key === 'f' || e.key === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

document.fonts.ready.then(() => {
  const start = (parseInt(location.hash.slice(1)) || 1) - 1;
  if (start > 0) slides[Math.min(N - 1, start)].parentNode.scrollIntoView();
  slides.forEach(sl => io.observe(sl));
  pickCurrent();
});
window.deck = { go, models, pick: pickCurrent, get cur() { return cur; } };
