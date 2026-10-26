/* 《燈火未眠》 UI layer: rendering, input, audio, saves, gallery. */
(function () {
'use strict';
const { Engine, NAMES, LEADS, HIDDEN, COLOR_HEX, COLOR_NAME } = VEngine;
const $ = (s) => document.querySelector(s);
const LS = 'dhwm_';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HIDDEN_ZH = { silas: '塞拉斯', noa: '諾亞', vex: '維克斯', arno: '亞諾' };
let DATA = null, MAN = null, engine = null, persist = null, endingTitles = {}, allEndings = [];
const settings = Object.assign({ bgm: 0.35, amb: 0.3, speed: 32, auto: 1, skipUnread: false }, jget('settings') || {});
function jget(k) { try { return JSON.parse(localStorage.getItem(LS + k)); } catch (e) { return null; } }
function jset(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { toast('儲存空間不足'); return false; } }
function toast(t, ms) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), ms || 1600); }

// ---------------- audio (Web Audio gain → quiet + fades; iOS ignores element.volume) ----------------
const Snd = {
  ctx: null, ch: {}, unlocked: false,
  silent() { const n = 4410, b = new ArrayBuffer(44 + n * 2), v = new DataView(b); const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); },
  unlock() {
    if (this.unlocked) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.unlocked = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { this.ctx = AC ? new AC() : null; } catch (e) { this.ctx = null; }
    const sil = this.silent();
    for (const kind of ['bgm', 'amb']) {
      const c = this.ch[kind] = { els: [], gains: [], i: 0, url: null, want: null, vol: 1 };
      for (let k = 0; k < 2; k++) {
        const el = new Audio(); el.loop = true; el.preload = 'auto'; el.playsInline = true; el.src = sil;
        el.play().catch(() => {});
        c.els.push(el);
        if (this.ctx) { try { const src = this.ctx.createMediaElementSource(el); const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.ctx.destination); c.gains.push(g); } catch (e) { c.gains.push(null); } }
        else { el.volume = 0; c.gains.push(null); }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.pending) { const p = this.pending; this.pending = null; for (const k in p) this.play(k, p[k].url, p[k].vol); }
  },
  level(kind, vol) { return Math.max(0, Math.min(1, (kind === 'bgm' ? settings.bgm : settings.amb) * vol)); },
  ramp(c, idx, to, sec) {
    const g = c.gains[idx], el = c.els[idx];
    if (g && this.ctx) { const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(to, t + sec); }
    else { const from = el.volume, st = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - st) / (sec * 1000)); el.volume = from + (to - from) * k; if (k < 1) requestAnimationFrame(step); }; step(); }
  },
  play(kind, url, vol) {
    if (!this.unlocked) { this.pending = this.pending || {}; this.pending[kind] = { url, vol }; return; }
    const c = this.ch[kind]; if (!c) return;
    vol = vol == null ? 1 : vol;
    if (c.url === url) { c.vol = vol; if (url) this.ramp(c, c.i, this.level(kind, vol), 1.5); return; }
    const old = c.i; const oldEl = c.els[old];
    this.ramp(c, old, 0, kind === 'bgm' ? 2.5 : 2);
    setTimeout(() => { if (c.i !== old || !c.url) { try { oldEl.pause(); } catch (e) {} } }, 2700);
    c.url = url; c.vol = vol;
    if (!url) return;
    c.i = 1 - old; const el = c.els[c.i];
    el.src = url; el.currentTime = 0;
    el.play().then(() => this.ramp(c, c.i, this.level(kind, vol), kind === 'bgm' ? 3.5 : 3)).catch(() => {});
  },
  refresh() { for (const k of ['bgm', 'amb']) { const c = this.ch[k]; if (c && c.url) this.ramp(c, c.i, this.level(k, c.vol), .4); } },
  stopAll() { this.play('bgm', null); this.play('amb', null); },
};
document.addEventListener('visibilitychange', () => {
  if (!Snd.ctx) return;
  if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume();
});

// ---------------- backgrounds ----------------
const PAL = [
  [/black|void_dark/, ['#050507', '#000000', '#2a2a2a']], [/white|blank/, ['#cfcfcf', '#8c8c8c', '#ffffff']],
  [/rift|inner|dream|mind|door|heart_world/, ['#26173a', '#06040c', '#a070d0']],
  [/sea|shore|beach|pier|harbor|port|shallow|seawall|sea_wall|lighthouse|ocean/, ['#1d3a52', '#08131d', '#6fa3c7']],
  [/chapel|church|altar/, ['#3a2c22', '#110c09', '#d9a65a']],
  [/kitchen|canteen|mess|bar|tavern|cafe/, ['#3d2a1a', '#130d08', '#e0a050']],
  [/med|clinic|lab|research|hospital|infirmary/, ['#1f3538', '#091113', '#8fd0d0']],
  [/snow|winter|frozen|ice/, ['#58606e', '#1d2129', '#e8eef8']],
  [/cemetery|grave|memorial/, ['#2a2d30', '#0a0b0c', '#9aa0a8']],
  [/ruin|wasteland|facility|camp|battle|front/, ['#3b332a', '#120f0b', '#c09060']],
  [/forest|field|garden|wheat|grass|meadow/, ['#2b3c27', '#0d130b', '#a8c070']],
  [/wall|gate|tower|roof|rampart/, ['#383b43', '#111217', '#b8b0a0']],
  [/ballroom|gala|masquerade|hall/, ['#3a2a30', '#120a0d', '#e0b878']],
  [/city|street|alley|market|square|town/, ['#2c2f3a', '#0b0c11', '#c8b088']],
];
function bgStyle(id) {
  id = id || '';
  let p = ['#262634', '#0b0b12', '#c0a878'];
  for (const [re, c] of PAL) if (re.test(id)) { p = c; break; }
  let [top, bot, glow] = p; let ga = .2, gpos = '50% 28%';
  if (/night|midnight|dark/.test(id)) { top = mix(top, '#000', .45); bot = mix(bot, '#000', .4); ga = .12; }
  else if (/dusk|sunset|evening/.test(id)) { glow = '#e8894a'; ga = .3; gpos = '50% 70%'; }
  else if (/dawn|morning|sunrise/.test(id)) { glow = '#f0b8a0'; ga = .26; gpos = '50% 65%'; }
  else if (/day|noon|summer/.test(id)) { top = mix(top, '#9aa6b4', .25); ga = .25; }
  const rain = /rain|storm/.test(id);
  if (rain) { top = mix(top, '#1c2430', .4); }
  const hz = /sea|shore|beach|harbor|port|seawall|sea_wall|ocean/.test(id) ? `, linear-gradient(180deg, transparent 54%, ${hex(glow, .1)} 55%, transparent 56%)` : '';
  return `radial-gradient(ellipse at ${gpos}, ${hex(glow, ga)}, transparent 62%)${hz}, linear-gradient(180deg, ${top}, ${bot})`;
}
function mix(a, b, t) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const r = (s) => (pa >> s & 255) * (1 - t) + (pb >> s & 255) * t; return '#' + [16, 8, 0].map(s => Math.round(r(s)).toString(16).padStart(2, '0')).join(''); }
function hex(c, a) { const p = parseInt(c.slice(1), 16); return `rgba(${p >> 16 & 255},${p >> 8 & 255},${p & 255},${a})`; }

// ---------------- stage rendering ----------------
const R = { bg: undefined, bgfx: undefined, cg: undefined, bgm: undefined, amb: undefined, sprites: {}, front: 0, colors: '' };
function resetRender() { R.bg = R.bgfx = R.cg = R.bgm = R.amb = undefined; R.colors = ''; $('#sprites').innerHTML = ''; R.sprites = {}; }
function colorsCount(S) { return (S.v.colors_seen || []).length; }
function hiddenSafe(text, S) {
  if (!text) return '';
  for (const h of HIDDEN) if (!(S && S.v[h + '_met'])) text = text.split(HIDDEN_ZH[h]).join('？？？');
  return text;
}
function setBg(id, fx) {
  const els = [$('#bg'), $('#bg2')]; const nxt = els[1 - R.front];
  const url = MAN.bg[id];
  nxt.style.backgroundImage = url ? `url("${url}"), ${bgStyle(id)}` : bgStyle(id);
  nxt.style.opacity = 1; els[R.front].style.opacity = 0; R.front = 1 - R.front;
  const r = $('#rain'); r.className = /snow/.test(id) ? 'on snow' : /rain|storm/.test(id) ? 'on' : '';
}
function spriteUrl(id, outfit, ex) {
  if (HIDDEN.includes(id)) return null;           // hidden leads stay unseen
  if (/^young|_young/.test(outfit || '')) return null;
  const e = MAN.expr[`${id}_${outfit}_${ex}`]; if (e) return e;
  const m = MAN.sprites[id]; if (!m) return null;
  return m[outfit] || m.uniform || Object.values(m)[0] || null;
}
const POS = { far_left: 12, left: 27, center: 50, right: 73, far_right: 88 };
function renderSprites(S) {
  const P = S.pres; const box = $('#sprites'); const want = P.sprites || {};
  const ids = Object.keys(want);
  for (const id of Object.keys(R.sprites)) if (!want[id]) { const n = R.sprites[id]; n.classList.remove('on'); setTimeout(() => n.remove(), 500); delete R.sprites[id]; }
  let shown = 0;
  for (const id of ids) {
    const sp = want[id]; const url = spriteUrl(id, sp.outfit, sp.expr);
    if (!url) { if (R.sprites[id]) { R.sprites[id].remove(); delete R.sprites[id]; } continue; }
    shown++;
    let n = R.sprites[id];
    if (!n) { n = document.createElement('div'); n.className = 'spr'; const img = new Image(); img.alt = ''; img.onerror = () => n.remove(); n.appendChild(img); box.appendChild(n); R.sprites[id] = n; requestAnimationFrame(() => n.classList.add('on')); }
    const img = n.firstChild; if (img.dataset.src !== url) { img.dataset.src = url; img.src = url; }
    n.style.left = (POS[sp.pos] || 50) + '%';
  }
  box.classList.toggle('many', shown > 2);
}
function cgPlaceholder(id, note, S) {
  let t = (note || '').replace(/^CG[_a-z0-9]*[：:]\s*/i, '').replace(/【.*$/, '').trim();
  t = hiddenSafe(t, S); if (t.length > 96) t = t.slice(0, 95) + '……';
  return `<div class="ph"><div class="lamp">✦</div><div class="pt">${esc(S && S.pres.title ? hiddenSafe(S.pres.title, S) : '回憶')}</div>${t ? `<div class="pn">${esc(t)}</div>` : ''}</div>`;
}
function renderCg(S) {
  const cg = S.pres.cg; const key = cg ? cg.id : null;
  if (key === R.cg) return; R.cg = key;
  const el = $('#cg');
  if (!cg) { el.classList.remove('on'); el.innerHTML = ''; return; }
  el.classList.add('on');
  const url = MAN.cg[cg.id];
  if (url) { el.innerHTML = ''; const img = new Image(); img.onerror = () => { el.innerHTML = cgPlaceholder(cg.id, cg.note, S); }; img.src = url; el.appendChild(img); }
  else el.innerHTML = cgPlaceholder(cg.id, cg.note, S);
}
function applyTint(S) {
  const n = colorsCount(S);
  const gray = S.pres.bgfx === 'color' ? 0 : Math.max(.06, 1 - n * .085);
  document.documentElement.style.setProperty('--gray', gray.toFixed(3));
  const sat = 18 + Math.min(11, n) * 5; const light = 50 + Math.min(11, n);
  document.documentElement.style.setProperty('--accent', `hsl(42, ${sat}%, ${light}%)`);
  const key = (S.v.colors_seen || []).join(',');
  if (key !== R.colors) { R.colors = key; $('#colorbar').innerHTML = (S.v.colors_seen || []).map(c => `<i style="color:${COLOR_HEX[c] || '#c9a24a'};background:${COLOR_HEX[c] || '#c9a24a'}"></i>`).join(''); }
}
function renderGauge(S) {
  const v = S.v; const P = S.pres;
  const gl = $('#g-load'), gc = $('#g-loc');
  const load = +v.load || 0; gl.classList.toggle('on', !!P.combat || load >= 60); gl.querySelector('i').style.setProperty('--v', Math.min(100, load) + '%');
  gc.classList.toggle('on', !!P.combat); gc.querySelector('i').style.setProperty('--v', Math.min(100, +v.loc || 0) + '%');
}
function renderCounter(S) {
  const c = S.pres.counter, el = $('#counter');
  if (!c) { el.className = ''; el.textContent = ''; return; }
  el.className = 'on' + (c.stop ? ' stop' : ''); el.textContent = c.n; el.style.color = c.color ? (COLOR_HEX[c.color] || '') : '';
}
function renderAudio(S) {
  const P = S.pres;
  const b = P.bgm || null; if (b !== R.bgm) { R.bgm = b; Snd.play('bgm', b ? (MAN.bgm[b] || null) : null, 1); }
  const a = P.amb ? P.amb.id + '@' + P.amb.vol : null;
  if (a !== R.amb) { R.amb = a; Snd.play('amb', P.amb ? (MAN.amb[P.amb.id] || null) : null, P.amb ? Math.min(1, P.amb.vol * 1.4) : 1); }
}
function renderAll(S) {
  const P = S.pres;
  if (P.bg !== R.bg) { R.bg = P.bg; setBg(P.bg, P.bgfx); }
  $('#stage').classList.toggle('color', P.bgfx === 'color');
  applyTint(S); renderSprites(S); renderCg(S); renderGauge(S); renderCounter(S); renderAudio(S);
  $('#datechip').textContent = hiddenSafe(P.date || '', S);
}

// ---------------- text / input ----------------
const T = { busy: false, typing: false, full: '', resolve: null, auto: false, skip: false, timer: null, card: null, lines: 0, inGame: false };
function setMode(m, on) {
  T[m] = on; if (on) T[m === 'auto' ? 'skip' : 'auto'] = false;
  document.querySelectorAll('#controls button').forEach(b => b.classList.toggle('on', !!T[b.dataset.act]));
  if (on && T.typing === false && T.resolve && $('#textbox').classList.contains('done')) scheduleAdvance();
}
function scheduleAdvance() {
  clearTimeout(T.timer);
  if (T.skip) { T.timer = setTimeout(advance, 35); return; }
  if (T.auto) T.timer = setTimeout(advance, (900 + T.full.length * 55) * settings.auto);
}
function advance() { clearTimeout(T.timer); const r = T.resolve; if (!r) return; T.resolve = null; r(); }
function finishTyping() { clearInterval(T.iv); T.typing = false; $('#text').textContent = T.full; $('#textbox').classList.add('done'); scheduleAdvance(); }
function showLine(line) {
  const tb = $('#textbox'); tb.classList.remove('hidden'); $('#controls').classList.remove('hidden');
  tb.className = (line.kind || 'say') + (line.read && !T.skip ? ' read' : '');
  let name = line.name || '';
  if (line.kind === 'comm') name = '通訊' + (name ? '・' + name : '');
  if (line.kind === 'mono' && !name) name = '';
  $('#namebox').textContent = name;
  let text = line.text || '';
  if (line.kind === 'say' || line.kind === 'whisper' || line.kind === 'comm') { if (!/^[「『（(]/.test(text)) text = '「' + text + '」'; }
  T.full = text;
  // dim non-speakers
  for (const [id, n] of Object.entries(R.sprites)) n.classList.toggle('dim', !!line.who && line.who !== id && !!R.sprites[line.who]);
  const el = $('#text'); el.textContent = '';
  if (T.skip || settings.speed <= 0) { finishTyping(); return; }
  T.typing = true; let i = 0; const chars = Array.from(text);
  clearInterval(T.iv);
  T.iv = setInterval(() => { i += 1; el.textContent = chars.slice(0, i).join(''); if (i >= chars.length) finishTyping(); }, settings.speed);
}
function onTap(e) {
  if (!T.inGame) return;
  if (e.target.closest('#controls,#choices,#panel,#title-screen,button')) return;
  Snd.unlock();
  if (T.card) { const c = T.card; T.card = null; c(); return; }
  if (T.skip) { setMode('skip', false); return; }
  if (T.typing) { finishTyping(); return; }
  if (T.auto) setMode('auto', false);
  advance();
}

// ---------------- UI object given to the engine ----------------
const ui = {
  say(line) {
    if (T.skip && !line.read && line.key && !settings.skipUnread) setMode('skip', false);
    T.lines++;
    if (T.lines % 12 === 0) autosave();
    if (T.lines % 40 === 0) savePersist();
    return new Promise(res => { T.resolve = res; showLine(line); });
  },
  choice(opts, timed, prompt) {
    setMode('skip', false); clearTimeout(T.timer);
    autosave();
    return new Promise(res => {
      $('#textbox').classList.add('done');
      const box = $('#choices'); const list = $('#clist'); list.innerHTML = '';
      $('#cprompt').textContent = prompt ? hiddenSafe(prompt, engine.S) : '';
      let done = false; let tid = null;
      const pick = (i) => { if (done) return; done = true; clearTimeout(tid); box.classList.add('hidden'); res(i); };
      opts.forEach((o, i) => { const b = document.createElement('button'); b.textContent = hiddenSafe(o.text, engine.S); b.onclick = (ev) => { ev.stopPropagation(); Snd.unlock(); pick(i); }; list.appendChild(b); });
      const tm = $('#ctimer'); const sec = parseFloat(timed) || 0;
      if (sec > 0) { tm.classList.add('on'); const bar = tm.firstChild; bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
        requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `transform ${sec}s linear`; bar.style.transform = 'scaleX(0)'; }));
        tid = setTimeout(() => pick(0), sec * 1000); }
      else tm.classList.remove('on');
      box.classList.remove('hidden');
    });
  },
  yieldTick() { return sleep(0); },
  onError(m) { console.warn('[engine]', m); },
  async date(label) { $('#datechip').textContent = hiddenSafe(label, engine.S); await card(hiddenSafe(label, engine.S), '', 'date', 1500); },
  async title(t, sub) { await card(hiddenSafe(t, engine.S), hiddenSafe(sub || '', engine.S), 'title', 2200); },
  async color(id, S) {
    applyTint(S); const fx = $('#fxlayer'); const c = COLOR_HEX[id] || COLOR_HEX[(id || '').replace(/^hint_/, '')] || '#e2b84a';
    fx.style.transition = 'opacity 1s'; fx.style.background = `radial-gradient(circle at 50% 45%, ${hex(c.length === 7 ? c : '#e2b84a', .45)}, transparent 70%)`; fx.style.opacity = 1;
    await sleep(T.skip ? 50 : 1300); fx.style.opacity = 0;
  },
  gauge(S) { renderGauge(S); },
  expr() {},
  persist() { savePersist(); },
  present(S, c) {
    if (c === 'cg' && S.pres.cg) persist.cgs[S.pres.cg.id] = S.pres.cg.note || true;
    renderAll(S);
  },
  async fx(c, a, S) {
    const fx = $('#fxlayer'); const quick = T.skip;
    switch (c) {
      case 'wait': if (!quick) await sleep(Math.min(4, parseFloat(a) || 1) * 1000); break;
      case 'shake': $('#stage').classList.remove('shake'); void $('#stage').offsetWidth; $('#stage').classList.add('shake'); break;
      case 'flash': { if (quick) break; fx.style.transition = 'none'; fx.style.background = /red/.test(a) ? '#b03030' : '#fff'; fx.style.opacity = .85; await sleep(60); fx.style.transition = 'opacity .7s'; fx.style.opacity = 0; await sleep(300); break; }
      case 'fade': { if (quick) break; fx.style.transition = 'opacity .8s'; fx.style.background = /white/.test(a) ? '#f2f0ea' : '#000'; fx.style.opacity = 1; await sleep(900); fx.style.opacity = 0; break; }
      case 'lamp': $('#app').style.setProperty('--lamp', /off/.test(a) ? '0' : '1'); document.getElementById('stage').style.boxShadow = /off/.test(a) ? '' : 'inset 0 -120px 140px -60px rgba(232,170,90,.35)'; break;
      case 'fx': { const m = /color=(\w+)/.exec(a); const col = m ? (COLOR_HEX[m[1]] || '#e2b84a') : '#e2b84a'; if (quick) break; fx.style.transition = 'opacity 1s'; fx.style.background = `radial-gradient(circle at 50% 35%, ${hex(col, .4)}, transparent 70%)`; fx.style.opacity = 1; await sleep(1400); fx.style.opacity = 0; break; }
      default: break; // sfx, voice, ui, flashback, label: silent/no-op by design
    }
  },
};
function card(t1, t2, cls, ms) {
  if (!t1 && !t2) return Promise.resolve();
  if (T.skip) return Promise.resolve();
  return new Promise(res => {
    const el = $('#card'); el.className = cls; el.querySelector('.c1').textContent = t1; el.querySelector('.c2').textContent = t2 || '';
    let done = false; const fin = () => { if (done) return; done = true; T.card = null; el.classList.add('hidden'); res(); };
    T.card = fin; setTimeout(fin, ms);
  });
}

// ---------------- persistence ----------------
function loadPersist() {
  const p = jget('persist') || {};
  persist = { endings: p.endings || {}, cgs: p.cgs || {}, unlocks: p.unlocks || {}, gallery: p.gallery || {}, read: new Set(p.read || []) };
}
function savePersist() { jset('persist', { endings: persist.endings, cgs: persist.cgs, unlocks: persist.unlocks, gallery: persist.gallery, read: [...persist.read] }); }
function meta(S) { const last = (S.log || []).slice(-1)[0]; return { date: hiddenSafe(S.pres.date || '', S), title: hiddenSafe(S.pres.title || '', S), text: hiddenSafe(last ? last.t : '', S).slice(0, 40), ts: Date.now() }; }
function autosave() { if (!engine || !engine.lastSnap || !T.inGame) return; jset('auto', { snap: engine.lastSnap, meta: meta(engine.lastSnap) }); }
function slotKey(i) { return 'slot' + i; }

// ---------------- game lifecycle ----------------
let runId = 0;
function startGame(snap) {
  if (engine) engine.stopped = true;
  clearTimeout(T.timer); clearInterval(T.iv); T.resolve = null; T.card = null; setMode('auto', false); setMode('skip', false);
  $('#choices').classList.add('hidden'); $('#card').classList.add('hidden');
  engine = new Engine(DATA, ui, persist);
  if (snap) engine.load(snap); else engine.S = engine.newState();
  engine.lastSnap = engine.snapshot();
  resetRender(); $('#title-screen').classList.add('hidden'); closePanel();
  $('#textbox').classList.add('hidden'); $('#controls').classList.remove('hidden');
  T.inGame = true; renderAll(engine.S);
  const my = ++runId; const e = engine;
  e.run().then(async (res) => {
    if (my !== runId || e.stopped) return;
    T.inGame = false; savePersist();
    if (res === 'ending' || res === 'end') {
      localStorage.removeItem(LS + 'auto');
      $('#textbox').classList.add('hidden'); $('#controls').classList.add('hidden');
      T.inGame = true; await new Promise(r => { const el = $('#card'); el.className = 'end'; el.querySelector('.c1').textContent = '完'; el.querySelector('.c2').textContent = hiddenSafe(endingTitles[e.S.endingId] || '', e.S); T.card = () => { el.classList.add('hidden'); r(); }; });
      T.inGame = false;
    }
    toTitle();
  }).catch(err => { console.error(err); toast('發生錯誤：' + err.message, 4000); });
}
function toTitle() {
  if (engine) engine.stopped = true; runId++; T.inGame = false; T.resolve = null;
  Snd.play('amb', null); Snd.play('bgm', MAN.bgm.bgm_title_dreams || MAN.bgm.bgm_theme_musicbox || Object.values(MAN.bgm)[0] || null, .8); R.bgm = '__title'; R.amb = null;
  $('#textbox').classList.add('hidden'); $('#controls').classList.add('hidden'); $('#choices').classList.add('hidden');
  $('#title-screen').classList.remove('hidden'); closePanel();
  $('#btn-continue').disabled = !jget('auto');
}

// ---------------- panels ----------------
function openPanel(title, html) { $('#ptitle').textContent = title; $('#pbody').innerHTML = html; $('#panel').classList.remove('hidden'); $('#pbody').scrollTop = 0; }
function closePanel() { $('#panel').classList.add('hidden'); }
function slotsPanel(mode) {
  const rows = [];
  if (mode === 'load') { const a = jget('auto'); rows.push(slotRow('auto', '自動', a)); }
  for (let i = 1; i <= 12; i++) rows.push(slotRow(i, String(i).padStart(2, '0'), jget(slotKey(i))));
  openPanel(mode === 'save' ? '存檔' : '讀檔', rows.join(''));
  $('#pbody').querySelectorAll('.slot').forEach(el => el.onclick = () => {
    const k = el.dataset.k; const key = k === 'auto' ? 'auto' : slotKey(k); const cur = jget(key);
    if (mode === 'save') {
      if (!engine || !T.inGame) return;
      if (cur && !confirm('覆蓋這個存檔？')) return;
      if (jset(key, { snap: engine.lastSnap, meta: meta(engine.lastSnap) })) { toast('已存檔'); slotsPanel('save'); }
    } else if (cur) { savePersist(); startGame(cur.snap); toast('讀取完成'); }
  });
}
function slotRow(k, label, d) {
  const m = d && d.meta;
  return `<div class="slot" data-k="${k}"><div class="sn">${label}</div><div class="si">${m ? `<b>${esc(m.date || m.title || '')}</b><br>${esc(m.text || '')}` : '<span class="sd">— 空 —</span>'}</div>${m ? `<div class="sd">${new Date(m.ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>` : ''}</div>`;
}
function logPanel() {
  const L = (engine && engine.S.log) || [];
  openPanel('紀錄', '<div class="log">' + L.map(l => l.k === 'choice' ? `<p class="ch">▸ ${esc(hiddenSafe(l.t, engine.S))}</p>` : `<p>${l.n ? `<span class="ln">${esc(l.n)}</span>` : ''}${esc(hiddenSafe(l.t, engine.S))}</p>`).join('') + '</div>');
  const b = $('#pbody'); b.scrollTop = b.scrollHeight;
}
function galleryPanel() {
  const seenE = allEndings.filter(e => persist.endings[e]).length;
  const cgIds = MAN.cg_ids;
  const seenC = cgIds.filter(c => persist.cgs[c]).length;
  let h = `<div class="sec">結局　${seenE} / ${allEndings.length}</div>`;
  h += allEndings.map(e => `<div class="end-row">${persist.endings[e] ? esc(endingTitles[e] || e) : '<span style="color:#4b4740">？？？</span>'}</div>`).join('');
  h += `<div class="sec">回憶　${seenC} / ${cgIds.length}</div><div class="grid">`;
  h += cgIds.map(c => { if (!persist.cgs[c]) return '<div class="gi locked">？</div>';
    const url = MAN.cg[c]; const note = typeof persist.cgs[c] === 'string' ? persist.cgs[c].replace(/^CG[_a-z0-9]*[：:]\s*/i, '').replace(/【.*$/, '').slice(0, 40) : '';
    return url ? `<div class="gi" style="background-image:url('${url}')" data-cg="${c}"></div>` : `<div class="gi" data-cg="${c}">✦<br>${esc(note)}</div>`; }).join('');
  h += '</div>';
  openPanel('回憶', h);
  $('#pbody').querySelectorAll('.gi[data-cg]').forEach(el => el.onclick = () => {
    const c = el.dataset.cg; const url = MAN.cg[c]; const n = typeof persist.cgs[c] === 'string' ? persist.cgs[c] : '';
    openPanel('回憶', url ? `<img src="${url}" style="width:100%" onerror="this.outerHTML='<div class=ph>✦</div>'"><div class="btnrow"><button class="pbtn" id="gback">返回</button></div>` : `<div style="display:flex;justify-content:center;padding-top:20px">${cgPlaceholder(c, n, null).replace('回憶', '回憶')}</div><div class="btnrow"><button class="pbtn" id="gback">返回</button></div>`);
    $('#gback').onclick = galleryPanel;
  });
}
function settingsPanel() {
  openPanel('設定', `
    <div class="set-row">音樂音量<input type="range" min="0" max="1" step="0.05" id="s-bgm" value="${settings.bgm}"></div>
    <div class="set-row">環境音量<input type="range" min="0" max="1" step="0.05" id="s-amb" value="${settings.amb}"></div>
    <div class="set-row">文字速度<input type="range" min="0" max="80" step="4" id="s-speed" value="${80 - settings.speed}"></div>
    <div class="set-row">自動播放間隔<input type="range" min="0.5" max="2.5" step="0.1" id="s-auto" value="${settings.auto}"></div>
    <div class="set-row">略過也包含未讀<input type="checkbox" id="s-skip" ${settings.skipUnread ? 'checked' : ''}></div>
    <div class="btnrow">${T.inGame ? '<button id="s-title">回到標題</button>' : ''}<button id="s-wipe">清除全部資料</button></div>
    <p style="font-size:12px;color:#8d877a;line-height:1.8;margin-top:18px">音樂預設很小聲，換曲時會慢慢淡入淡出。<br>iPhone：靜音開關打開時不會有聲音。</p>`);
  const save = () => { jset('settings', settings); Snd.refresh(); };
  $('#s-bgm').oninput = (e) => { settings.bgm = +e.target.value; save(); };
  $('#s-amb').oninput = (e) => { settings.amb = +e.target.value; save(); };
  $('#s-speed').oninput = (e) => { settings.speed = 80 - +e.target.value; save(); };
  $('#s-auto').oninput = (e) => { settings.auto = +e.target.value; save(); };
  $('#s-skip').onchange = (e) => { settings.skipUnread = e.target.checked; save(); };
  if ($('#s-title')) $('#s-title').onclick = () => { if (confirm('回到標題？（未存檔的進度會保留在自動存檔）')) { autosave(); savePersist(); toTitle(); } };
  $('#s-wipe').onclick = () => { if (confirm('確定清除所有存檔、已讀與回憶？')) { Object.keys(localStorage).filter(k => k.startsWith(LS)).forEach(k => localStorage.removeItem(k)); loadPersist(); toast('已清除'); toTitle(); } };
}
function creditsPanel() { openPanel('製作名單', `<pre class="credits">${esc(MAN.credits || '')}</pre>`); }

// ---------------- boot ----------------
async function boot() {
  const v = document.querySelector('script[src*="ui.js"]').src.split('v=')[1] || '';
  const [d, m] = await Promise.all([fetch('data/script.json?v=' + v).then(r => r.json()), fetch('data/manifest.json?v=' + v).then(r => r.json())]);
  DATA = d; MAN = m;
  for (const k of ['sprites', 'cg', 'bg', 'expr', 'bgm', 'amb']) MAN[k] = MAN[k] || {};
  MAN.cg_ids = MAN.cg_ids || [];
  for (const [sid, sc] of Object.entries(DATA.scenes)) for (const ins of sc.code) if (ins[0] === 'cmd' && ins[1] === 'ending') {
    const id = (ins[2] || '').trim(); if (!id || id.includes('{')) continue;
    if (!allEndings.includes(id)) allEndings.push(id);
    if (!endingTitles[id]) endingTitles[id] = sc.title || id;
  }
  loadPersist();
  $('#app').addEventListener('click', onTap);
  document.addEventListener('touchstart', () => Snd.unlock(), { passive: true, once: false });
  document.addEventListener('click', () => Snd.unlock());
  document.querySelectorAll('#controls button').forEach(b => b.onclick = (e) => {
    e.stopPropagation(); Snd.unlock(); const a = b.dataset.act;
    if (a === 'auto' || a === 'skip') { setMode(a, !T[a]); if (T[a] && T.typing) finishTyping(); if (T[a] && !T.typing && T.resolve) scheduleAdvance(); }
    else if (a === 'log') logPanel(); else if (a === 'save') slotsPanel('save'); else if (a === 'load') slotsPanel('load'); else if (a === 'menu') settingsPanel();
  });
  document.querySelectorAll('.tmenu button').forEach(b => b.onclick = (e) => {
    e.stopPropagation(); Snd.unlock(); const t = b.dataset.t;
    if (t === 'start') { if (jget('auto') && !confirm('開始新遊戲？（自動存檔會被取代）')) return; startGame(null); }
    else if (t === 'continue') { const a = jget('auto'); if (a) startGame(a.snap); }
    else if (t === 'load') slotsPanel('load'); else if (t === 'gallery') galleryPanel(); else if (t === 'settings') settingsPanel(); else if (t === 'credits') creditsPanel();
  });
  $('#pclose').onclick = (e) => { e.stopPropagation(); closePanel(); };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent); const standalone = navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  if (ios && !standalone) $('#installhint').innerHTML = 'iPhone：點 Safari 的「分享」→「加入主畫面」<br>就能全螢幕遊玩';
  window.addEventListener('pagehide', () => { autosave(); savePersist(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { autosave(); savePersist(); } });
  $('#boot').remove();
  toTitle();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
window.__dhwm = { get engine() { return engine; }, T, startGame, toTitle };
boot().catch(e => { const b = $('#boot'); if (b) b.innerHTML = '燈火未眠<small>載入失敗，請重新整理（' + esc(e.message) + '）</small>'; });
})();
