/* 《燈火未眠》 UI layer — landscape 1280×720 stage; controls, menus and save system modelled on game 1 (Ren'Py GUI). */
(function () {
'use strict';
const { Engine, NAMES, LEADS, HIDDEN, HEART, COLOR_HEX, COLOR_NAME } = VEngine;
const $ = (s) => document.querySelector(s);
const LS = 'dhwm_';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HIDDEN_ZH = { silas: '塞拉斯', noa: '諾亞', vex: '維克斯', arno: '亞諾' };
const HIDDEN_UNLOCK = { silas: 'silas_unlocked', noa: 'noa_unlocked', vex: 'vex_unlocked', arno: 'arno_truth' };
let DATA = null, MAN = null, engine = null, persist = null, endingTitles = {}, allEndings = [];
const settings = Object.assign({ bgm: 0.35, amb: 0.3, speed: 32, auto: 1, skipUnread: false, skipAfter: false, trans: true, mute: false }, jget('settings') || {});
function jget(k) { try { return JSON.parse(localStorage.getItem(LS + k)); } catch (e) { return null; } }
function jset(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function saveSettings() { jset('settings', settings); Snd.refresh(); }
function notify(t, ms) { const el = $('#notify'); el.textContent = t; el.classList.add('on'); clearTimeout(notify._t); notify._t = setTimeout(() => el.classList.remove('on'), ms || 3250); }

// ---------------- layout: fixed 1280×720 stage, scaled + letterboxed (Ren'Py virtual screen) ----------------
const V = { small: false, touch: false, scale: 1 };
function fit() {
  const g = $('#game'), cs = getComputedStyle($('#safe'));
  const l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0, t = parseFloat(cs.paddingTop) || 0, b = parseFloat(cs.paddingBottom) || 0;
  const W = Math.max(1, innerWidth - l - r), H = Math.max(1, innerHeight - t - b);
  const s = Math.min(W / 1280, H / 720); V.scale = s;
  g.style.transform = `translate(${(l + (W - 1280 * s) / 2).toFixed(2)}px, ${(t + (H - 720 * s) / 2).toFixed(2)}px) scale(${s.toFixed(5)})`;
  $('#frame').classList.toggle('portrait', innerHeight > innerWidth * 1.05);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = coarse && Math.min(screen.width, screen.height) < 600;
  if (small !== V.small || coarse !== V.touch) { V.small = small; V.touch = coarse; g.classList.toggle('small', small); g.classList.toggle('touch', coarse); buildQuick(); if (!$('#gmenu').classList.contains('hidden')) GM.render(); buildMainNav(); }
}
const perPage = () => V.small ? 4 : 6;

// ---------------- save storage (IndexedDB, localStorage fallback) ----------------
const Store = {
  db: null, cache: {},
  async init() {
    try {
      if (!window.indexedDB) throw 0;
      this.db = await new Promise((res, rej) => { const q = indexedDB.open('dhwm', 1); q.onupgradeneeded = () => q.result.createObjectStore('saves'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      await new Promise((res) => { const tx = this.db.transaction('saves'); const st = tx.objectStore('saves'); const c = st.openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { this.cache[cur.key] = cur.value; cur.continue(); } else res(); }; c.onerror = () => res(); });
    } catch (e) { this.db = null; for (const k of Object.keys(localStorage)) if (k.startsWith(LS + 'sv_')) { try { this.cache[k.slice(LS.length + 3)] = JSON.parse(localStorage.getItem(k)); } catch (e2) {} } }
  },
  get(k) { return this.cache[k] || null; },
  set(k, v) {
    this.cache[k] = v;
    if (this.db) { try { this.db.transaction('saves', 'readwrite').objectStore('saves').put(v, k); return true; } catch (e) {} }
    try { localStorage.setItem(LS + 'sv_' + k, JSON.stringify(v)); return true; } catch (e) { notify('儲存空間不足，存檔失敗。'); return false; }
  },
  del(k) { delete this.cache[k]; if (this.db) { try { this.db.transaction('saves', 'readwrite').objectStore('saves').delete(k); } catch (e) {} } localStorage.removeItem(LS + 'sv_' + k); },
  newest(prefix) { let best = null; for (const k in this.cache) if (!prefix || k.startsWith(prefix)) { const m = this.cache[k] && this.cache[k].meta; if (m && (!best || m.ts > best.ts)) best = { k, ts: m.ts }; } return best && best.k; },
};

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
  level(kind, vol) { if (settings.mute) return 0; return Math.max(0, Math.min(1, (kind === 'bgm' ? settings.bgm : settings.amb) * vol)); },
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
// Scene colour: full colour by default. 亞思's colour blindness lives in the TEXT only.
// Only fx values listed in SPECIAL_FX alter the picture; everything else (gray, color, none, rain, snow, unknown) is normal full colour.
const SPECIAL_FX = {
  mono: 'grayscale(1)', flashback: 'grayscale(1) contrast(1.05) brightness(.92)', purge: 'grayscale(1) contrast(1.15) brightness(.85)',
  lost: 'grayscale(1) contrast(1.35) brightness(.8)',
  fade_color_edge: 'grayscale(.35)', fade_color_half: 'grayscale(.65)', fade_color_low: 'grayscale(.9)',
  red: 'grayscale(1) sepia(.7) saturate(4) hue-rotate(-42deg) brightness(.8)',
  purple: 'grayscale(1) sepia(.5) saturate(2.6) hue-rotate(215deg) brightness(.85)',
};
const MOOD_FX = { dark: 'brightness(.6) saturate(.9)' };
function sceneFilter(fx) { return SPECIAL_FX[fx] || MOOD_FX[fx] || 'none'; }
function applyTint(S) {
  const n = colorsCount(S);
  if (!T.pop) $('#stage').style.setProperty('--sf', sceneFilter(S.pres.bgfx));
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
  $('#status').classList.toggle('empty', !(S.v.colors_seen || []).length && !gl.classList.contains('on') && !gc.classList.contains('on'));
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
  $('#stage').dataset.fx = P.bgfx || '';
  applyTint(S); renderSprites(S); renderCg(S); renderGauge(S); renderCounter(S); renderAudio(S);
  $('#datechip').textContent = hiddenSafe(P.date || '', S);
}

// ---------------- text / input ----------------
const T = { typing: false, full: '', resolve: null, auto: false, skip: false, timer: null, card: null, lines: 0, inGame: false, line: null, choosing: false };
function setMode(m, on) {
  T[m] = on; if (on) T[m === 'auto' ? 'skip' : 'auto'] = false;
  syncQuick();
  if (on && !T.typing && T.resolve && $('#window').classList.contains('done')) scheduleAdvance();
}
function scheduleAdvance() {
  clearTimeout(T.timer);
  const go = () => { if (overlayOpen() || T.card) { T.timer = setTimeout(go, 250); return; } advance(); };
  if (T.skip) { T.timer = setTimeout(go, 35); return; }
  if (T.auto) T.timer = setTimeout(go, (900 + T.full.length * 55) * settings.auto);
}
function advance() { clearTimeout(T.timer); const r = T.resolve; if (!r) return; T.resolve = null; r(); }
function finishTyping() { clearInterval(T.iv); T.typing = false; $('#text').textContent = T.full; $('#window').classList.add('done'); scheduleAdvance(); }
function showLine(line) {
  const tb = $('#window'); tb.classList.remove('hidden');
  tb.className = (line.kind || 'say') + (line.read && !T.skip ? ' read' : '');
  let name = line.name || '';
  if (line.kind === 'comm') name = '通訊' + (name ? '・' + name : '');
  $('#who').textContent = name; $('#namebox').classList.toggle('empty', !name);
  let text = line.text || '';
  if (line.kind === 'say' || line.kind === 'whisper' || line.kind === 'comm') { if (!/^[「『（(]/.test(text)) text = '「' + text + '」'; }
  T.full = text;
  for (const [id, n] of Object.entries(R.sprites)) n.classList.toggle('dim', !!line.who && line.who !== id && !!R.sprites[line.who]);
  const el = $('#text'); el.textContent = '';
  if (T.skip || settings.speed <= 0) { finishTyping(); return; }
  T.typing = true; let i = 0; const chars = Array.from(text);
  clearInterval(T.iv);
  T.iv = setInterval(() => { i += 1; el.textContent = chars.slice(0, i).join(''); if (i >= chars.length) finishTyping(); }, settings.speed);
}
function overlayOpen() { return !$('#gmenu').classList.contains('hidden') || !$('#confirm').classList.contains('hidden') || !$('#viewer').classList.contains('hidden') || !$('#pick').classList.contains('hidden'); }
function onTap(e) {
  Snd.unlock();
  if (!T.inGame || overlayOpen()) return;
  if (e.target.closest('#quick,#choices,#gmenu,#mainmenu,#confirm,#pick,#viewer,button')) return;
  if (T.card) { const c = T.card; T.card = null; c(); return; }
  if (T.skip) { setMode('skip', false); return; }
  if (T.typing) { finishTyping(); return; }
  advance();
}

// ---------------- rollback (回退 / 上個選項), Ren'Py-style ----------------
let RB = [];
function rbPush(ch) { if (!engine || !engine.lastSnap) return; RB.push({ snap: engine.lastSnap, ch }); if (RB.length > 150) RB.splice(0, RB.length - 150); syncQuick(); }
function rollback() {
  if (!T.inGame || RB.length < 2) return;
  RB.pop(); const t = RB.pop(); startGame(t.snap, { keepRB: true });
}
function prevChoice() {
  if (!T.inGame) return;
  let j = -1; for (let i = RB.length - 2; i >= 0; i--) if (RB[i].ch) { j = i; break; }
  if (j < 0) { notify('沒有可以返回的選項了。'); return; }
  const t = RB[j]; RB.length = j; startGame(t.snap, { keepRB: true });
}

// ---------------- UI object given to the engine ----------------
const ui = {
  say(line) {
    if (T.skip && !line.read && line.key && !settings.skipUnread) setMode('skip', false);
    rbPush(false);
    T.lines++;
    if (T.lines % 80 === 0) autosave();
    if (T.lines % 40 === 0) savePersist();
    T.line = line;
    return new Promise(res => { T.resolve = res; showLine(line); });
  },
  choice(opts, timed, prompt) {
    const keepSkip = T.skip && settings.skipAfter;
    setMode('skip', false); clearTimeout(T.timer);
    rbPush(true);
    autosave();
    const top = engine.lastSnap.stack[engine.lastSnap.stack.length - 1] || { s: '', pc: 0 };
    const base = top.s + ':' + top.pc;
    return new Promise(res => {
      if ($('#window').classList.contains('hidden')) { const L = (engine.S.log || []).filter(l => l.k !== 'choice').slice(-1)[0];
        if (L) { $('#window').className = (L.k || 'say') + ' done'; $('#who').textContent = L.n || ''; $('#namebox').classList.toggle('empty', !L.n); $('#text').textContent = hiddenSafe(L.t, engine.S); } }
      $('#window').classList.add('done'); T.choosing = true;
      const box = $('#choices'); const list = $('#clist'); list.innerHTML = '';
      $('#cprompt').textContent = prompt ? hiddenSafe(prompt, engine.S) : '';
      let done = false; let tid = null;
      const pick = (i) => {
        if (done) return; done = true; clearTimeout(tid); T.choosing = false; box.classList.add('hidden');
        persist.chosen[chosenKey(base, top.s, opts[i])] = 1; savePersist();
        if (keepSkip) setMode('skip', true);
        res(i);
      };
      opts.forEach((o, i) => {
        const b = document.createElement('button'); const was = !!persist.chosen[chosenKey(base, top.s, o)];
        b.innerHTML = esc(hiddenSafe(o.text, engine.S)) + (was ? ' <span class="chosen">〔已選過〕</span>' : '');
        if (was) b.classList.add('was');
        b.onclick = (ev) => { ev.stopPropagation(); Snd.unlock(); pick(i); }; list.appendChild(b);
      });
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
    if (T.skip || !settings.trans) return;
    const st = $('#stage'); T.pop = true;
    st.style.setProperty('--sf', 'grayscale(1) brightness(.9)'); await sleep(700);           // the world drains to grey…
    fx.style.transition = 'opacity 1.2s'; fx.style.mixBlendMode = 'color';
    fx.style.background = `radial-gradient(circle at 50% 45%, ${hex(c.length === 7 ? c : '#e2b84a', .95)}, ${hex(c.length === 7 ? c : '#e2b84a', .35)} 45%, transparent 75%)`; fx.style.opacity = 1;
    await sleep(1600);                                                                         // …one hue blooms out of it…
    T.pop = false; st.style.setProperty('--sf', sceneFilter(S.pres.bgfx)); fx.style.opacity = 0; // …then full colour returns
    await sleep(1200); fx.style.mixBlendMode = '';
  },
  gauge(S) { renderGauge(S); },
  expr() {},
  persist() { savePersist(); },
  present(S, c) {
    if (c === 'cg' && S.pres.cg) persist.cgs[S.pres.cg.id] = S.pres.cg.note || true;
    renderAll(S);
  },
  async fx(c, a, S) {
    const fx = $('#fxlayer'); const quick = T.skip || !settings.trans;
    switch (c) {
      case 'wait': if (!T.skip) await sleep(Math.min(4, parseFloat(a) || 1) * 1000); break;
      case 'shake': if (!quick) { $('#stage').classList.remove('shake'); void $('#stage').offsetWidth; $('#stage').classList.add('shake'); } break;
      case 'flash': { if (quick) break; fx.style.transition = 'none'; fx.style.background = /red/.test(a) ? '#b03030' : '#fff'; fx.style.opacity = .85; await sleep(60); fx.style.transition = 'opacity .7s'; fx.style.opacity = 0; await sleep(300); break; }
      case 'fade': { if (quick) break; fx.style.transition = 'opacity .8s'; fx.style.background = /white/.test(a) ? '#f2f0ea' : '#000'; fx.style.opacity = 1; await sleep(900); fx.style.opacity = 0; break; }
      case 'lamp': $('#stage').style.boxShadow = /off/.test(a) ? '' : 'inset 0 -120px 140px -60px rgba(232,170,90,.35)'; break;
      case 'fx': { const m = /color=(\w+)/.exec(a); const col = m ? (COLOR_HEX[m[1]] || '#e2b84a') : '#e2b84a'; if (quick) break; fx.style.transition = 'opacity 1s'; fx.style.background = `radial-gradient(circle at 50% 35%, ${hex(col, .4)}, transparent 70%)`; fx.style.opacity = 1; await sleep(1400); fx.style.opacity = 0; break; }
      default: break; // sfx, voice, ui, flashback, label: silent/no-op by design
    }
  },
};
function chosenKey(base, sid, o) { return /^__s/.test(sid) ? 'S:' + o.text : base + ':' + o.text; }
function card(t1, t2, cls, ms) {
  if (!t1 && !t2) return Promise.resolve();
  if (T.skip) return Promise.resolve();
  return new Promise(res => {
    const el = $('#card'); el.className = cls; el.querySelector('.c1').textContent = t1; el.querySelector('.c2').textContent = t2 || '';
    if (!settings.trans) el.style.animation = 'none'; else el.style.animation = '';
    let done = false; const fin = () => { if (done) return; done = true; T.card = null; el.classList.add('hidden'); res(); };
    T.card = fin; setTimeout(fin, ms);
  });
}

// ---------------- persistence ----------------
function loadPersist() {
  const p = jget('persist') || {};
  persist = { endings: p.endings || {}, cgs: p.cgs || {}, unlocks: p.unlocks || {}, gallery: p.gallery || {}, read: new Set(p.read || []), chosen: p.chosen || {} };
}
function savePersist() { jset('persist', { endings: persist.endings, cgs: persist.cgs, unlocks: persist.unlocks, gallery: persist.gallery, read: [...persist.read], chosen: persist.chosen }); }

// ---------------- save system (pages A / Q / 1–9, like Ren'Py file_slots) ----------------
function prune(s) {
  const keep = new Set(); const syn = s.synth || {};
  const scan = (o) => { JSON.stringify(o || null).replace(/__s\d+/g, (m) => { if (!keep.has(m) && syn[m]) { keep.add(m); scan(syn[m]); } return m; }); };
  scan(s.stack); scan(s.queue); scan(s.v);
  const out = {}; for (const k of keep) out[k] = syn[k]; s.synth = out; return s;
}
const WD = '日一二三四五六';
function fmtTime(ts) { const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）${p(d.getHours())}:${p(d.getMinutes())}`; }
function makeMeta(S) {
  const P = S.pres; const sprites = [];
  if (!P.cg) for (const [id, sp] of Object.entries(P.sprites || {})) { const u = spriteUrl(id, sp.outfit, sp.expr); if (u) sprites.push([u, POS[sp.pos] || 50]); }
  const name = [hiddenSafe(P.date || '', S), hiddenSafe(P.title || '', S)].filter(Boolean).join('　') || '序章';
  return { ts: Date.now(), name, thumb: { bg: P.bg || '', cg: P.cg ? 1 : 0, sp: sprites.slice(0, 3), fx: P.bgfx || '' } };
}
function record(snap) { return { v: 2, snap: prune(JSON.parse(JSON.stringify(snap))), meta: makeMeta(snap) }; }
function curSnap() { return engine && (engine.lastSnap || engine.snapshot()); }
function saveTo(key) { const s = curSnap(); if (!s) return false; return Store.set(key, record(s)); }
function rotate(prefix, n) { for (let i = n - 1; i >= 1; i--) { const r = Store.get(prefix + i); if (r) Store.set(prefix + (i + 1), r); } }
let lastAuto = null;
function autosave() {
  if (!engine || !T.inGame || !engine.lastSnap || engine.lastSnap === lastAuto) return;
  lastAuto = engine.lastSnap; rotate('auto-', 6); saveTo('auto-1');
}
function quickSave() { if (!T.inGame) return; rotate('quick-', perPage()); if (saveTo('quick-1')) notify('已快速存檔。'); syncQuick(); }
function quickLoad() { const r = Store.get('quick-1'); if (!r) return; confirmBox('讀取存檔會失去未保存的進度。\n確定要這樣做嗎？', () => loadRecord(r)); }
function loadRecord(r) { savePersist(); closeGM(); startGame(r.snap); }
function migrateOld() {
  if (jget('migrated2')) return;
  const a = jget('auto'); if (a && a.snap && !Store.get('auto-1')) Store.set('auto-1', { v: 2, snap: a.snap, meta: { ts: (a.meta && a.meta.ts) || Date.now(), name: (a.meta && (a.meta.date || a.meta.title)) || '舊自動存檔', thumb: { bg: a.snap.pres && a.snap.pres.bg || '', cg: 0, sp: [], gray: 1 } } });
  for (let i = 1; i <= 12; i++) { const d = jget('slot' + i); if (!d || !d.snap) continue; const k = `${Math.ceil(i / 4)}-${(i - 1) % 4 + 1}`;
    if (!Store.get(k)) Store.set(k, { v: 2, snap: d.snap, meta: { ts: (d.meta && d.meta.ts) || Date.now(), name: (d.meta && (d.meta.date || d.meta.title)) || '舊存檔', thumb: { bg: d.snap.pres && d.snap.pres.bg || '', cg: 0, sp: [], gray: 1 } } }); }
  jset('migrated2', 1);
}
function thumbHTML(r) {
  if (!r) return '<div class="thumb empty"></div>';
  const t = r.meta.thumb || {}; const url = MAN.bg[t.bg];
  const bg = url ? `url(&quot;${url}&quot;), ${bgStyle(t.bg)}` : bgStyle(t.bg);
  let h = `<div class="thumb" style="filter:${sceneFilter(t.fx)}"><div class="tb" style="background-image:${bg.replace(/"/g, '&quot;')}"></div>`;
  for (const [u, x] of (t.sp || [])) h += `<img src="${esc(u)}" style="left:${x}%" alt="">`;
  if (t.cg) h += '<div class="tcg">✦</div>';
  return h + '</div>';
}

// ---------------- confirm ----------------
function confirmBox(msg, yes, no) {
  $('#cf-msg').textContent = msg; $('#confirm').classList.remove('hidden');
  const close = () => $('#confirm').classList.add('hidden');
  $('#cf-yes').onclick = (e) => { e.stopPropagation(); close(); yes && yes(); };
  $('#cf-no').onclick = (e) => { e.stopPropagation(); close(); no && no(); };
}

// ---------------- game lifecycle ----------------
let runId = 0;
function startGame(snap, opt) {
  opt = opt || {};
  if (engine) engine.stopped = true;
  clearTimeout(T.timer); clearInterval(T.iv); T.resolve = null; T.card = null; T.choosing = false; setMode('auto', false); setMode('skip', false);
  if (!opt.keepRB) RB = [];
  $('#choices').classList.add('hidden'); $('#card').classList.add('hidden'); $('#pick').classList.add('hidden');
  engine = new Engine(DATA, ui, persist);
  if (snap) engine.load(snap); else engine.S = engine.newState();
  engine.lastSnap = engine.snapshot(); lastAuto = null;
  resetRender(); $('#mainmenu').classList.add('hidden'); closeGM();
  $('#window').classList.add('hidden'); $('#hud').classList.remove('hidden');
  T.inGame = true; buildQuick(); renderAll(engine.S);
  const my = ++runId; const e = engine;
  e.run().then(async (res) => {
    if (my !== runId || e.stopped) return;
    T.inGame = false; savePersist();
    if (res === 'ending' || res === 'end') {
      $('#window').classList.add('hidden'); $('#quick').classList.add('hidden');
      T.inGame = true; await new Promise(r => { const el = $('#card'); el.className = 'end'; el.querySelector('.c1').textContent = '完'; el.querySelector('.c2').textContent = hiddenSafe(endingTitles[e.S.endingId] || '', e.S); T.card = () => { el.classList.add('hidden'); r(); }; });
      T.inGame = false;
    }
    toTitle();
  }).catch(err => { console.error(err); notify('發生錯誤：' + err.message, 5000); });
}
function toTitle() {
  if (engine) engine.stopped = true; runId++; T.inGame = false; T.resolve = null; T.card = null; RB = [];
  clearTimeout(T.timer); clearInterval(T.iv); setMode('auto', false); setMode('skip', false);
  Snd.play('amb', null); Snd.play('bgm', MAN.bgm.bgm_title_dreams || MAN.bgm.bgm_theme_musicbox || Object.values(MAN.bgm)[0] || null, .8); R.bgm = '__title'; R.amb = null;
  $('#window').classList.add('hidden'); $('#quick').classList.add('hidden'); $('#choices').classList.add('hidden'); $('#hud').classList.add('hidden'); $('#card').classList.add('hidden');
  $('#mainmenu').classList.remove('hidden'); closeGM(); $('#pick').classList.add('hidden');
  buildMainNav();
}

// ---------------- new game: watch or skip the prologue ----------------
const isPrologue = (id) => { const sc = DATA.scenes[id]; return /^P-/.test(id) || !!(sc && /(^|\/)00_/.test(sc.file || '')); };
async function prologueSkipped() {
  // Run the prologue on a silent engine (default choices, no rendering) so every flag/stat it sets is applied
  // exactly as written in script/00_prologue.vns, then stop at the first common-route scene.
  const pc = { endings: Object.assign({}, persist.endings), cgs: {}, unlocks: JSON.parse(JSON.stringify(persist.unlocks)), gallery: {}, read: new Set() };
  const nop = async () => {};
  const sui = { say: () => Promise.resolve(), choice: () => Promise.resolve(0), yieldTick: () => sleep(0), onError: (m) => console.warn('[prologue-skip]', m),
    date: nop, title: nop, color: nop, fx: nop, gauge() {}, expr() {}, persist() {}, present() {} };
  const e = new Engine(DATA, sui, pc); e.S = e.newState();
  let hit = null; const push0 = e.push.bind(e);
  e.push = (sid) => { const ok = push0(sid); if (ok && !hit && sid in e.mainIndex && !isPrologue(sid)) { hit = sid; e.stopped = true; } return ok; };
  await Promise.race([e.run(), sleep(10000)]);
  e.stopped = true;
  if (!hit) return null;
  Object.assign(persist.unlocks, pc.unlocks);
  const s = e.snapshot();
  s.log = [{ n: '', t: '（序章已略過）', k: 'narr' }];
  s.pres.cg = null; s.pres.sprites = {}; s.pres.counter = null; s.pres.combat = null;
  return s;
}
function newGame() { $('#pick').classList.remove('hidden'); }
async function pickPrologue(p) {
  if (p === 'back') { $('#pick').classList.add('hidden'); return; }
  if (p === 'watch') { startGame(null); return; }
  const s = await prologueSkipped();
  if (!s) { notify('無法略過序章，改為從頭開始。'); startGame(null); return; }
  startGame(s); notify('已跳過序章。');
}

// ---------------- quick menu ----------------
const QM_TOUCH = [['rollback', '回退'], ['prev', '上個選項'], ['skip', '快進'], ['auto', '自動'], ['qsave', '快速存'], ['qload', '快速讀'], ['menu', '選單']];
const QM_PC = [['rollback', '回退'], ['prev', '上個選項'], ['history', '歷史'], ['skip', '快進'], ['auto', '自動'], ['relation', '關係'], ['save', '存檔'], ['qsave', '快速存'], ['qload', '快速讀'], ['prefs', '設定']];
function buildQuick() {
  const q = $('#quick'); const set = V.touch ? QM_TOUCH : QM_PC;
  q.innerHTML = set.map(([a, l]) => `<button data-q="${a}">${l}</button>`).join('');
  q.querySelectorAll('button').forEach(b => b.onclick = (e) => { e.stopPropagation(); Snd.unlock(); quickAct(b.dataset.q); });
  q.classList.toggle('hidden', !T.inGame || !$('#gmenu').classList.contains('hidden'));
  syncQuick();
}
function syncQuick() {
  const q = $('#quick'); if (!q) return;
  q.querySelectorAll('button').forEach(b => {
    const a = b.dataset.q;
    b.classList.toggle('on', (a === 'auto' && T.auto) || (a === 'skip' && T.skip));
    if (a === 'qload') b.disabled = !Store.get('quick-1');
    if (a === 'rollback') b.disabled = RB.length < 2;
  });
}
function quickAct(a) {
  if (!T.inGame) return;
  switch (a) {
    case 'rollback': rollback(); break;
    case 'prev': prevChoice(); break;
    case 'skip': case 'auto': setMode(a, !T[a]); if (T[a] && T.typing) finishTyping(); if (T[a] && !T.typing && T.resolve) scheduleAdvance(); break;
    case 'qsave': quickSave(); break;
    case 'qload': quickLoad(); break;
    case 'menu': openGM('save'); break;
    default: openGM(a);
  }
}

// ---------------- game menu (left navigation + content), Ren'Py game_menu ----------------
const SCREENS = { history: '歷史紀錄', save: '存檔', load: '讀取', relation: '關係', endings: '結局圖鑑', cg: 'CG鑑賞', prefs: '設定', about: '關於', help: '說明' };
const GM = { screen: null, page: null,
  render() {
    const s = this.screen; $('#gm-title').textContent = SCREENS[s] || '';
    const nav = T.inGame ? ['history', 'save', 'load', 'relation', 'endings', 'cg', 'prefs', 'about', 'title'] : ['start', 'load', 'endings', 'cg', 'prefs', 'about'];
    if (!V.touch) nav.splice(nav.indexOf('about') + 1, 0, 'help');
    $('#gm-nav').innerHTML = nav.map(k => `<button data-n="${k}" class="${k === s ? 'sel' : ''}">${k === 'title' ? '標題畫面' : k === 'start' ? '開始遊戲' : SCREENS[k]}</button>`).join('');
    $('#gm-nav').querySelectorAll('button').forEach(b => b.onclick = (e) => { e.stopPropagation(); navAct(b.dataset.n); });
    const c = $('#gm-content'); c.scrollTop = 0;
    ({ history: scrHistory, save: () => scrFiles('save'), load: () => scrFiles('load'), relation: scrRelation, endings: scrEndings, cg: scrCG, prefs: scrPrefs, about: scrAbout, help: scrHelp })[s](c);
  } };
function openGM(screen) {
  setMode('auto', false); setMode('skip', false); if (T.typing) finishTyping();
  GM.screen = screen; $('#gmenu').classList.remove('hidden'); $('#quick').classList.add('hidden'); GM.render();
}
function closeGM() { $('#gmenu').classList.add('hidden'); $('#viewer').classList.add('hidden'); if (T.inGame) $('#quick').classList.remove('hidden'); syncQuick(); }
function navAct(k) {
  if (k === 'start') { closeGM(); newGame(); return; }
  if (k === 'title') { confirmBox('確定要回到標題畫面嗎？\n未保存的進度將會遺失。', () => { autosave(); savePersist(); toTitle(); }); return; }
  GM.screen = k; GM.render();
}
function scrHistory(c) {
  const L = (engine && engine.S.log) || [];
  c.innerHTML = '<div class="hist">' + (L.length ? L.map(l => l.k === 'choice'
    ? `<div class="h ch"><div class="hn">▸</div><div class="ht">${esc(hiddenSafe(l.t, engine.S))}</div></div>`
    : `<div class="h"><div class="hn">${esc(l.n || '')}</div><div class="ht">${esc(hiddenSafe(l.t, engine.S))}</div></div>`).join('') : '<div class="empty">對話歷史紀錄為空。</div>') + '</div>';
  c.scrollTop = c.scrollHeight;
}
function scrFiles(mode) {
  const c = $('#gm-content'); const n = perPage();
  let page = GM.page || jget('page') || '1'; GM.page = page;
  const label = page === 'auto' ? '自動存檔' : page === 'quick' ? '快速存檔' : `第 ${page} 頁`;
  let h = `<div class="fs-label">${label}</div><div class="fs-grid">`;
  for (let i = 1; i <= n; i++) {
    const k = `${page}-${i}`; const r = Store.get(k);
    h += `<button class="slotb" data-k="${k}">${thumbHTML(r)}<div class="st">${r ? fmtTime(r.meta.ts) : '空存檔位'}</div><div class="sn">${r ? esc(r.meta.name || '') : '&nbsp;'}</div></button>`;
  }
  h += '</div><div class="pages"><button data-p="<">&lt;</button><button data-p="auto">A</button><button data-p="quick">Q</button>';
  for (let i = 1; i <= 9; i++) h += `<button data-p="${i}">${i}</button>`;
  h += '<button data-p=">">&gt;</button></div>';
  c.innerHTML = h;
  c.querySelectorAll('.pages button').forEach(b => { const p = b.dataset.p; b.classList.toggle('sel', p === String(page));
    b.onclick = (e) => { e.stopPropagation(); const order = ['auto', 'quick', '1', '2', '3', '4', '5', '6', '7', '8', '9']; let i = order.indexOf(String(page));
      let np = p === '<' ? order[Math.max(0, i - 1)] : p === '>' ? order[Math.min(order.length - 1, i + 1)] : p; GM.page = np; jset('page', np); scrFiles(mode); }; });
  c.querySelectorAll('.slotb').forEach(b => b.onclick = (e) => {
    e.stopPropagation(); const k = b.dataset.k; const r = Store.get(k);
    if (mode === 'save') {
      if (!T.inGame) return;
      const doSave = () => { if (saveTo(k)) { scrFiles('save'); syncQuick(); } };
      if (r) confirmBox('確定要覆蓋這個存檔嗎？', doSave); else doSave();
    } else if (r) {
      if (T.inGame) confirmBox('讀取存檔會失去未保存的進度。\n確定要這樣做嗎？', () => loadRecord(r)); else loadRecord(r);
    }
  });
}
function leadVisible(id, v) { if (!v[id + '_met']) return false; if (HIDDEN.includes(id)) return !!v[HIDDEN_UNLOCK[id]]; return true; }
function hearts(n) { const k = Math.max(0, Math.min(5, Math.round((+n || 0) / 20))); return '♥'.repeat(k) + '♡'.repeat(5 - k); }
function scrRelation(c) {
  const S = engine && engine.S; if (!S) { c.innerHTML = ''; return; }
  const v = S.v; const vis = LEADS.filter(id => leadVisible(id, v));
  if (!GM.lead || !vis.includes(GM.lead)) GM.lead = vis[0] || null;
  let h = `<div class="rel-tabs">` + LEADS.map(id => leadVisible(id, v) ? `<button data-l="${id}" class="${id === GM.lead ? 'sel' : ''}">${esc(NAMES[id])}</button>` : '<button disabled>？？？</button>').join('') + '</div>';
  if (GM.lead) {
    const id = GM.lead; const col = HEART && HEART[id]; const seen = col && (v.colors_seen || []).some(x => x === col || (col === 'hearth_red' && /^red/.test(x)));
    const aff = +v['aff_' + id] || 0, bond = +v['bond_' + id] || 0;
    const feel = aff >= 80 ? '放不下' : aff >= 60 ? '在意' : aff >= 35 ? '熟悉' : aff >= 15 ? '認識' : '陌生';
    const trust = bond >= 80 ? '託付' : bond >= 58 ? '信任' : bond >= 35 ? '並肩' : bond >= 15 ? '觀望' : '警戒';
    h += `<div class="rel-card"><h4>${esc(NAMES[id])}</h4>
      <div class="rel-row"><span class="k">心動</span><span class="v">${hearts(aff)}</span><span class="d">${feel}</span></div>
      <div class="rel-row"><span class="k">羈絆</span><span class="v g">${hearts(bond)}</span><span class="d">${trust}</span></div>
      <div class="rel-row"><span class="k">他的顏色</span>${seen ? `<span class="v g" style="color:${COLOR_HEX[col] || ''}">●</span><span class="d">${esc(COLOR_NAME[col] || '')}</span>` : '<span class="d">？？？（走得更近，才會看見）</span>'}</div></div>`;
  } else h += '<div class="rel-note">還沒有遇見任何人。</div>';
  h += '<div class="rel-note">這裡只看得見大概的溫度。人心，沒有刻度。</div>';
  c.innerHTML = h;
  c.querySelectorAll('.rel-tabs button[data-l]').forEach(b => b.onclick = (e) => { e.stopPropagation(); GM.lead = b.dataset.l; scrRelation(c); });
}
function scrEndings(c) {
  const seen = allEndings.filter(e => persist.endings[e]).length;
  c.innerHTML = `<div class="endl"><div class="cnt">已達成　${seen} / ${allEndings.length}</div>` + allEndings.map(e => persist.endings[e] ? `<div class="e">${esc(endingTitles[e] || e)}</div>` : '<div class="e lock">？？？</div>').join('') + '</div>';
}
function cgNote(c) { return typeof persist.cgs[c] === 'string' ? persist.cgs[c] : ''; }
function scrCG(c) {
  const ids = MAN.cg_ids; const seen = ids.filter(x => persist.cgs[x]).length;
  c.innerHTML = `<div class="endl"><div class="cnt">已解鎖　${seen} / ${ids.length}</div></div><div class="cgg">` + ids.map(x => {
    if (!persist.cgs[x]) return '<div class="cgi lock">？</div>';
    const url = MAN.cg[x]; const note = cgNote(x).replace(/^CG[_a-z0-9]*[：:]\s*/i, '').replace(/【.*$/, '').slice(0, 30);
    return url ? `<button class="cgi" data-cg="${x}" style="background-image:url('${url}')"></button>` : `<button class="cgi" data-cg="${x}">✦<br>${esc(note)}</button>`;
  }).join('') + '</div>';
  c.querySelectorAll('.cgi[data-cg]').forEach(b => b.onclick = (e) => {
    e.stopPropagation(); const x = b.dataset.cg; const url = MAN.cg[x]; const vw = $('#viewer');
    vw.innerHTML = url ? `<img src="${url}" alt="">` : cgPlaceholder(x, cgNote(x), null);
    const img = vw.querySelector('img'); if (img) img.onerror = () => { vw.innerHTML = cgPlaceholder(x, cgNote(x), null); };
    vw.classList.remove('hidden'); vw.onclick = (ev) => { ev.stopPropagation(); vw.classList.add('hidden'); };
  });
}
function scrPrefs(c) {
  const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
  c.innerHTML = `<div class="prefs">
    ${fsOK ? `<div class="pv"><h3>顯示</h3><button class="rb ${isFS ? '' : 'sel'}" data-a="win">視窗</button><button class="rb ${isFS ? 'sel' : ''}" data-a="fs">全螢幕</button></div>` : ''}
    <div class="pv"><h3>略過</h3><button class="rb ${settings.skipUnread ? 'sel' : ''}" data-a="skipUnread">未讀文字</button><button class="rb ${settings.skipAfter ? 'sel' : ''}" data-a="skipAfter">選項後</button><button class="rb ${settings.trans ? '' : 'sel'}" data-a="trans">轉場</button></div>
    <div class="pv"><h3>文字速度</h3><input type="range" min="0" max="80" step="4" id="s-speed" value="${80 - settings.speed}"></div>
    <div class="pv"><h3>音樂音量</h3><input type="range" min="0" max="1" step="0.05" id="s-bgm" value="${settings.bgm}"></div>
    <div class="pv"><h3>自動前進時間</h3><input type="range" min="0" max="2" step="0.1" id="s-auto" value="${(2.5 - settings.auto).toFixed(1)}"></div>
    <div class="pv"><h3>環境音量</h3><input type="range" min="0" max="1" step="0.05" id="s-amb" value="${settings.amb}"></div>
    <div class="pv"></div>
    <div class="pv"><button class="rb ${settings.mute ? 'sel' : ''}" data-a="mute">全部靜音</button></div>
  </div>`;
  c.querySelectorAll('.rb').forEach(b => b.onclick = (e) => {
    e.stopPropagation(); const a = b.dataset.a;
    if (a === 'fs') { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); setTimeout(() => scrPrefs(c), 400); return; }
    if (a === 'win') { if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); setTimeout(() => scrPrefs(c), 400); return; }
    if (a === 'trans') settings.trans = !settings.trans; else settings[a] = !settings[a];
    $('#game').classList.toggle('notrans', !settings.trans);
    saveSettings(); scrPrefs(c);
  });
  $('#s-speed').oninput = (e) => { settings.speed = 80 - +e.target.value; saveSettings(); };
  $('#s-bgm').oninput = (e) => { settings.bgm = +e.target.value; saveSettings(); };
  $('#s-amb').oninput = (e) => { settings.amb = +e.target.value; saveSettings(); };
  $('#s-auto').oninput = (e) => { settings.auto = +(2.5 - +e.target.value).toFixed(2); saveSettings(); };
}
function scrAbout(c) { c.innerHTML = `<pre class="credits">${esc(MAN.credits || '')}</pre>`; }
function scrHelp(c) {
  c.innerHTML = `<div class="helpt"><b>點擊／Enter／空白鍵</b>推進對話、作出選擇<br><b>滾輪向上／PageUp</b>回退<br><b>右鍵／Esc</b>開啟選單<br><b>Ctrl（按住）</b>快進<br><b>F</b>全螢幕<br><br>
  <b>回退</b>回到上一句<br><b>上個選項</b>回到上一個選擇<br><b>快進</b>略過已讀文字<br><b>自動</b>自動前進<br><b>快速存／快速讀</b>一鍵存檔與讀取</div>`;
}

// ---------------- main menu ----------------
const MM = [['start', '開始遊戲'], ['load', '讀取'], ['endings', '結局圖鑑'], ['cg', 'CG鑑賞'], ['prefs', '設定'], ['about', '關於'], ['help', '說明']];
function buildMainNav() {
  const nav = $('#mm-nav'); if (!nav) return;
  nav.innerHTML = MM.filter(([k]) => k !== 'help' || !V.touch).map(([k, l]) => `<button data-m="${k}">${l}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = (e) => { e.stopPropagation(); Snd.unlock(); const k = b.dataset.m; if (k === 'start') newGame(); else openGM(k); });
}

// ---------------- boot ----------------
async function boot() {
  const v = document.querySelector('script[src*="ui.js"]').src.split('v=')[1] || '';
  $('#mm-ver').textContent = 'v' + v;
  fit(); addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250));
  const [d, m] = await Promise.all([fetch('data/script.json?v=' + v).then(r => r.json()), fetch('data/manifest.json?v=' + v).then(r => r.json()), Store.init()]);
  DATA = d; MAN = m;
  for (const k of ['sprites', 'cg', 'bg', 'expr', 'bgm', 'amb']) MAN[k] = MAN[k] || {};
  MAN.cg_ids = MAN.cg_ids || [];
  for (const [sid, sc] of Object.entries(DATA.scenes)) for (const ins of sc.code) if (ins[0] === 'cmd' && ins[1] === 'ending') {
    const id = (ins[2] || '').trim(); if (!id || id.includes('{')) continue;
    if (!allEndings.includes(id)) allEndings.push(id);
    if (!endingTitles[id]) endingTitles[id] = sc.title || id;
  }
  loadPersist(); migrateOld();
  $('#game').classList.toggle('notrans', !settings.trans);
  $('#game').addEventListener('click', onTap);
  $('#game').addEventListener('contextmenu', (e) => { e.preventDefault(); if (T.inGame && !overlayOpen()) openGM('save'); else if (!$('#gmenu').classList.contains('hidden')) gmReturn(); });
  $('#game').addEventListener('wheel', (e) => { if (T.inGame && !overlayOpen() && e.deltaY < 0) rollback(); }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#confirm').classList.contains('hidden')) $('#cf-no').click(); else if (!$('#viewer').classList.contains('hidden')) $('#viewer').classList.add('hidden'); else if (!$('#gmenu').classList.contains('hidden')) gmReturn(); else if (T.inGame) openGM('save'); return; }
    if (e.key === 'f' || e.key === 'F') { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); return; }
    if (!T.inGame || overlayOpen()) return;
    if (e.key === 'Control' && !T.skip) { setMode('skip', true); if (T.typing) finishTyping(); else if (T.resolve) scheduleAdvance(); return; }
    if (e.key === 'PageUp') { rollback(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && !T.choosing) { e.preventDefault(); onTap({ target: document.body }); }
  });
  document.addEventListener('keyup', (e) => { if (e.key === 'Control' && T.skip) setMode('skip', false); });
  document.addEventListener('touchstart', () => Snd.unlock(), { passive: true });
  $('#gm-return').onclick = (e) => { e.stopPropagation(); gmReturn(); };
  $('#pick').querySelectorAll('button').forEach(b => b.onclick = (e) => { e.stopPropagation(); Snd.unlock(); pickPrologue(b.dataset.p); });
  window.addEventListener('pagehide', () => { autosave(); savePersist(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { autosave(); savePersist(); } });
  $('#boot').remove();
  toTitle();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
function gmReturn() { closeGM(); if (!T.inGame) $('#mainmenu').classList.remove('hidden'); }
window.__dhwm = { get engine() { return engine; }, T, V, Store, startGame, toTitle, prologueSkipped, pickPrologue, openGM, quickAct, get RB() { return RB; }, get persist() { return persist; } };
boot().catch(e => { const b = $('#boot'); if (b) b.innerHTML = '燈火未眠<small>載入失敗，請重新整理（' + esc(e.message) + '）</small>'; });
})();
