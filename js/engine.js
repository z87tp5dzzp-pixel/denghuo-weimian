/* 《燈火未眠》 VN engine core: state, VM, scheduler. UI-agnostic (ui object injected). */
(function (root) {
'use strict';
const X = (typeof module !== 'undefined' && module.exports) ? require('./expr.js') : root.VExpr;
const { LEADS, CHARS, COLORS } = X;

const NAMES = { kael: '凱爾', rowan: '洛恩', cecil: '塞西爾', elio: '艾利歐', orion: '奧瑞恩', ash: '艾許', leo: '利奧',
  silas: '塞拉斯', noa: '諾亞', vex: '維克斯', arno: '亞諾', yasi: '亞思', sophia: '蘇菲亞', lily: '莉莉', marcus: '馬可斯',
  julian: '朱利安', vaughn: '范恩署長', evelyn: '伊芙琳', mora: '莫拉', hana: '漢娜', hannah: '漢娜', tobi: '托比', toby: '托比',
  darren: '戴倫', ben: '班', tarin: '塔林', trainee: '見習生', extra: '' };
const HIDDEN = ['silas', 'noa', 'vex', 'arno'];
const HEART = { kael: 'silver_gray', rowan: 'hearth_red', cecil: 'blue', elio: 'green', orion: 'purple', ash: 'gold', leo: 'orange',
  silas: 'white', noa: 'pink', vex: 'black', arno: 'brown' };
const COLOR_TO_HEART = { silver_gray: 'silver_gray', hearth_red: 'hearth_red', red_fire: 'hearth_red', blue: 'blue', green: 'green',
  purple: 'purple', gold: 'gold', orange: 'orange', white: 'white', pink: 'pink', black: 'black', brown: 'brown' };
const COLOR_NAME = { silver_gray: '銀灰', hearth_red: '紅', red_fire: '紅', red_blood: '紅', blue: '藍', green: '綠', purple: '紫', gold: '金',
  orange: '橘', white: '白', pink: '粉紅', black: '黑', brown: '棕' };
const COLOR_HEX = { silver_gray: '#c9cdd6', hearth_red: '#d9483b', red_fire: '#e8603a', red_blood: '#8f1d1d', blue: '#3d7fd9', green: '#4fae6a',
  purple: '#9b62d6', gold: '#e2b84a', orange: '#ef8a33', white: '#f4f1ea', pink: '#ef8fb5', black: '#2a2730', brown: '#9a6a43', red: '#d9483b',
  gray: '#9a9a9a', rainbow: '#e2b84a', twelfth: '#7fe0d8' };
const EPILOGUE = { kael: 'K32', rowan: 'R33', cecil: 'C31', elio: 'E31', orion: 'O34', ash: 'A34', leo: 'L34', silas: 'S33', noa: 'N33', vex: 'V32', arno: 'AR34' };
const LOC_NAME = { medbay: '醫療室', outside_wall: '牆外', old_port_bar: '舊港酒館', roof: '屋頂', sea_wall: '海堤', tower: '嚮導塔', chapel: '禮拜堂',
  mess: '食堂', canteen: '食堂', wall_top: '城牆', kitchen: '廚房', training: '訓練場', guide_room_corridor: '疏導室走廊', dorm: '宿舍', archive: '檔案室',
  hq_corridor: '總部走廊', hq_locker: '更衣室', research: '研究所', research_dorm: '研究所宿舍', research_roof: '研究所屋頂', facility_ruin: '設施廢墟',
  detention: '拘留室', north_city: '北城', shallows: '淺灘', cemetery: '墓地', lab: '實驗室', old_port_pier: '舊港碼頭', old_port_alley: '舊港巷弄',
  rift_edge: '裂隙邊緣', bar: '酒館', chapel_yard: '禮拜堂中庭', lighthouse: '燈塔', east_seawall: '東海堤' };
const NOON_T = ['predawn', 'dawn', 'morning', 'noon', 'dusk'];
const NIGHT_T = ['evening', 'night', 'late_night'];
const GUIDE_REFS = /\b(g1|g2|guide_g1|guide_g2|anchor|guide_pair|guide_tag|guide_mode|__gi)\b/;

function weatherOf(d) {
  if (d === 3) return 'rain';
  if (d >= 8 && d <= 77) {
    if ([60, 61, 62, 69, 75].includes(d)) return 'snow';
    return d % 6 === 4 ? 'rain' : 'clear';
  }
  if (d >= 78 && d <= 91) return d % 4 === 0 ? 'clear' : 'rain';
  if (d >= 92 && d <= 105) return 'rain';
  return 'clear';
}
function isDayOff(d) { return d > 0 && (d % 7 === 0 || ((d >= 57 && d <= 70) && d % 7 === 6)); }
const pairKey = (a, b) => [String(a), String(b)].sort().join('_');
function normVar(name) {
  if (name.startsWith('seen_')) name = name.replace(/-/g, '_');
  const m = /^(pair_bond|pair_sync|shared_sense_result|shared_sense)_([a-z]+)_([a-z]+)$/.exec(name);
  if (m && LEADS.includes(m[2]) && LEADS.includes(m[3])) return m[1] + '_' + pairKey(m[2], m[3]);
  return name;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

class Engine {
  constructor(data, ui, persist) {
    this.D = data; this.ui = ui; this.P = persist; // persist: {endings:{}, cgs:{}, unlocks:{}, read:Set, gallery:{}}
    this.mainIndex = {}; data.order.forEach((id, i) => { this.mainIndex[id] = i; });
    this.events = Object.entries(data.scenes).filter(([id, s]) => (s.when || s.slot) && !(id in this.mainIndex)).map(([id, s]) => ({ id, s }));
    this.errors = [];
    this.ctx = { scopes: [], get: (n) => this.getVar(n), fn: (f, a) => this.callFn(f, a), isId: (n) => this.isId(n) };
    this.S = null;
  }
  // ---------- state ----------
  newState() {
    const ng = Object.keys(this.P.endings || {}).length > 0;
    return {
      v: { aff_kael: 10, bond_kael: 45, toby_alive: true, lily_alive: true, hannah_alive: true, load: 0, day: 0, act: 0, time: 'morning',
        colors_seen: [], saved: [], lost: [], qualified: [], lights: [], ng_plus: ng, guide_tag: '', g1: '', g2: '', anchor: '', window: '',
        ending_lead: '', eve_lovers: [], eve_last: '', multi_left: [], three_left: '', other_side_lead: '', secret_arno_partner: '', gate_keeper: '' },
      stack: [], queue: [], synth: {}, synthN: 0, cursor: -1, fallback: false, ended: false, endingId: null,
      pres: { bg: null, bgfx: 'gray', sprites: {}, cg: null, bgm: null, amb: null, counter: null, pov: 'yasi', names: {}, combat: null, date: '', title: '' },
      log: []
    };
  }
  isId(n) { return CHARS.includes(n) || COLORS.includes(n) || n in LOC_NAME; }
  getVar(n) {
    const v = this.S.v;
    switch (n) {
      case 'colors_count': return (v.colors_seen || []).length;
      case 'saved_count': return (v.saved || []).length;
      case 'lost_count': return (v.lost || []).length;
      case 'all_leads': return LEADS.slice();
      case 'all_leads_stage4': return (v.eve_lovers || []).length === 11;
      case 'week': return v.day > 0 ? Math.ceil(v.day / 7) : 0;
      case 'weather': return weatherOf(v.day);
      case 'snow_day': return weatherOf(v.day) === 'snow';
      case 'rain_tomorrow': return weatherOf(v.day + 1) === 'rain';
      case 'guide_g1': return v.g1;
      case 'guide_mode': return (v.time === 'night' && (v.g1 === 'orion' || v.g2 === 'orion') && v.seen_O05) ? 'dream' : 'normal';
      case 'noa_letters_lead': return v.arno_letters_route === 'noa';
      case 'arno_reunited': return !!v.seen_AR04;
      case 'late_night': return v.time === 'late_night';
      case 'injured_hospitalized': return v.injury_yasi === 2;
      case 'mission_outside_wall': return v.mission_type === 'outside_wall';
    }
    if (n === 'rain_day') return !!v.rain_day || weatherOf(v.day) === 'rain';
    const nn = normVar(n);
    if (nn.startsWith('seen_ending_')) return !!(this.P.endings && this.P.endings[nn.slice(12)]) || v[nn];
    return v[nn];
  }
  setVar(n, val) { this.S.v[normVar(n)] = val; }
  met(x) {
    const v = this.S.v;
    if (!v[x + '_met']) return false;
    if (x === 'silas') return !!v.silas_unlocked;
    if (x === 'noa') return !!v.noa_unlocked;
    if (x === 'vex') return !!v.vex_unlocked;
    if (x === 'arno') return !!v.arno_truth;
    return true;
  }
  callFn(f, a) {
    const v = this.S.v;
    switch (f) {
      case 'len': return Array.isArray(a[0]) || typeof a[0] === 'string' ? a[0].length : 0;
      case 'upper': return String(a[0] || '').toUpperCase();
      case 'lower': return String(a[0] || '').toLowerCase();
      case 'has_scene': return !!this.D.scenes[String(a[0])];
      case 'has_event': return !!this.pickEventByTag(String(a[0]));
      case 'min_pair_bond': { const L = a[0] || []; let m = Infinity; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) m = Math.min(m, X.num(v['pair_bond_' + pairKey(L[i], L[j])])); return m === Infinity ? 0 : m; }
      case 'pair_key': return pairKey(a[0], a[1]);
      case 'chance': return Math.random() * 100 < X.num(a[0]);
      case 'name': case 'lover_name': return NAMES[a[0]] !== undefined ? NAMES[a[0]] : String(a[0]);
      case 'max_by': { const L = a[0] || []; const k = a[1] || 'aff'; let best = '', bv = -Infinity; for (const x of L) { const s = X.num(v[k + '_' + x]); if (s > bv) { bv = s; best = x; } } return best; }
      case 'top_by_aff': { const L = (a[0] || []).slice(); L.sort((p, q) => X.num(v['aff_' + q]) - X.num(v['aff_' + p])); return L.slice(0, X.num(a[1]) || 1); }
      case 'worst_pair': { const L = a[0] || []; let w = null, wv = Infinity; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const s = X.num(v['pair_bond_' + pairKey(L[i], L[j])]); if (s < wv) { wv = s; w = [L[i], L[j]]; } } return w || []; }
      case 'met': return this.met(String(a[0]));
      case 'unlocked': return this.met(String(a[0])) || !HIDDEN.includes(a[0]);
      case 'color_name': return COLOR_NAME[a[0]] || String(a[0]);
      case 'heart_color': return HEART[a[0]] || '';
      case 'epilogue_scene': return EPILOGUE[a[0]] || '';
      case 'min': return Math.min(...a.map(X.num));
      case 'max': return Math.max(...a.map(X.num));
      case 'abs': return Math.abs(X.num(a[0]));
      case 'int': return Math.floor(X.num(a[0]));
      case 'str': return String(a[0]);
      case '__loc': return this._locCtx ? this._locCtx(a[0]) : (v.cur_loc === a[0]);
      case '__time': { const t = a[0] === 'late' ? 'late_night' : a[0]; if (this._timeCtx) return this._timeCtx.includes(t); return v.time === t; }
      case '__gi': return [v.g1, v.g2, v.anchor].includes(a[0]);
      case '__dop': return false;
    }
    this.err('unknown function ' + f);
    return false;
  }
  ev(s) { try { return X.evaluate(s, this.ctx); } catch (e) { this.err('expr: ' + s + ' :: ' + e.message); return false; } }
  cond(s) { return s == null ? true : X.truthy(this.ev(s)); }
  interp(t) {
    if (!t || t.indexOf('{') < 0) return t;
    return t.replace(/\{([^{}]+)\}/g, (m, e) => {
      const r = this.ev(e);
      if (Array.isArray(r)) return r.map(x => NAMES[x] || x).join('、');
      return r === undefined || r === false ? '' : String(r);
    });
  }
  interpText(t) { // in displayed text, bare ids become names
    if (!t || t.indexOf('{') < 0) return t;
    return t.replace(/\{([^{}]+)\}/g, (m, e) => {
      const r = this.ev(e);
      if (Array.isArray(r)) return r.map(x => NAMES[x] || x).join('、');
      if (typeof r === 'string' && NAMES[r]) return NAMES[r];
      return r === undefined || r === false ? '' : String(r);
    });
  }
  interpId(t) { // ids like END_{upper(x)}_SOLO / {g1}
    if (!t || t.indexOf('{') < 0) return t;
    return t.replace(/\{([^{}]+)\}/g, (m, e) => { const r = this.ev(e); return r === undefined || r === false ? '' : String(r); });
  }
  err(m) { const f = this.S && this.S.stack.length ? this.S.stack[this.S.stack.length - 1] : null; const w = f ? f.s + ':' + f.pc : '-'; this.errors.push(w + ' ' + m); if (this.ui.onError) this.ui.onError(w + ' ' + m); }
  code(sid) { const s = this.D.scenes[sid]; return s ? s.code : (this.S.synth[sid] || null); }
  // ---------- frames ----------
  push(sid) {
    if (!this.code(sid)) { this.err('missing scene ' + sid); return false; }
    this.S.stack.push({ s: sid, pc: 0, loops: [] });
    const sc = this.D.scenes[sid];
    if (sc && sc.date) this.applyDate(sc.date);
    return true;
  }
  markSeen(sid) { if (this.D.scenes[sid]) { this.setVar('seen_' + sid, true); } }
  finishFrame() {
    const f = this.S.stack.pop();
    this.markSeen(f.s);
    this.afterScene(f.s, this.S.stack.length === 0);
  }
  afterScene(sid, top) {
    const v = this.S.v;
    if (sid === 'GUIDE_DAILY' && v.g1 && v.g2) this.guideEffects();
    // (2026-10-26) Engine bond stopgap removed: script milestones supply bond_X (FORMAT §H).
    if (sid === 'EVE_TOGETHER') {
      const L = v.eve_lovers || []; const b = X.num(v.eve_pair_bonus) || 3;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const k = 'pair_bond_' + pairKey(L[i], L[j]); v[k] = X.num(v[k]) + b; }
    }
    if (top && sid in this.mainIndex) {
      // after= hooks
      const hooks = this.events.filter(e => e.s.slotd && e.s.slotd.after === sid && !e.s.slotd.time && !e.s.slotd.loc && !this.getVar('seen_' + e.id) && this.whenOK(e, {}));
      hooks.sort((a, b) => b.s.prio - a.s.prio);
      for (const h of hooks.reverse()) this.S.queue.unshift({ t: 'scene', id: h.id });
    }
  }
  guideEffects() {
    const v = this.S.v; const g1 = v.g1, g2 = v.g2; const k = pairKey(g1, g2);
    const sync = X.num(v['pair_sync_' + k]);
    // guide-context route events (g1/g2/anchor based), evaluated with pre-guiding load
    const ev = this.pickEvent(e => e.s.whenx && GUIDE_REFS.test(e.s.whenx) && !/window ==/.test(e.s.whenx), {});
    if (ev) this.S.queue.unshift({ t: 'scene', id: ev.id });
    v.load = Math.max(0, X.num(v.load) - (15 + Math.floor(sync / 5)));
    v['aff_' + g1] = Math.min(100, X.num(v['aff_' + g1]) + 1); v['aff_' + g2] = Math.min(100, X.num(v['aff_' + g2]) + 1);
    v['pair_bond_' + k] = X.num(v['pair_bond_' + k]) + 1;
    v['pair_sync_' + k] = sync + 3;
    if (g1 === 'rowan') v.rowan_lead_count = X.num(v.rowan_lead_count) + 1;
    if (this.getVar('week') === 3 && (g1 === 'cecil' || g2 === 'cecil')) v.cecil_in_guide_w3 = true;
    if (v.seen_K10a && v.anchor === 'kael') v.anchor_count_kael_after_K10a = X.num(v.anchor_count_kael_after_K10a) + 1;
  }
  // ---------- event selection ----------
  slotOK(e, o) {
    const sd = e.s.slotd; if (!sd) return true;
    const wk = this.getVar('week'); const d = this.S.v.day;
    if (sd.w0 !== undefined) { if (wk < sd.w0) return false; if (!o.ignoreLate && wk > sd.w1 + 2) return false; }
    if (typeof sd.day === 'number' && d < sd.day) return false;
    if (typeof sd.act === 'number' && X.num(this.S.v.act) < sd.act) return false;
    if (sd.after && !this.getVar('seen_' + sd.after)) return false;
    if (sd.before && this.getVar('seen_' + sd.before)) return false;
    if (o.times && sd.time && !o.times.includes(sd.time)) return false;
    return true;
  }
  whenOK(e, o) {
    if (!e.s.whenx) return true;
    const saveT = this._timeCtx, saveL = this._locCtx, saveW = this.S.v.window;
    this._timeCtx = o.times || null; this._locCtx = () => true;
    if (o.window !== undefined) this.S.v.window = o.window;
    try { return this.cond(e.s.whenx); } finally { this._timeCtx = saveT; this._locCtx = saveL; this.S.v.window = saveW; }
  }
  pickEvent(filter, o) {
    let best = null;
    for (const e of this.events) {
      if (this.getVar('seen_' + e.id) || (this.S.v['__started_' + e.id])) continue;
      if (!filter(e)) continue;
      if (!this.slotOK(e, o) || !this.whenOK(e, o)) continue;
      if (!best || e.s.prio > best.s.prio) best = e;
    }
    return best;
  }
  pickEventByTag(tag) {
    const m = /^(\w+)=(.*)$/.exec(tag); if (!m) return null;
    const key = m[1];
    return this.pickEvent(e => e.s.whenx && e.s.whenx.includes(key), {});
  }
  candidates(times, window) {
    const out = [];
    for (const e of this.events) {
      const s = e.s;
      if (this.getVar('seen_' + e.id)) continue;
      if (/^(EVE_|NIGHT_OF_COLORS|THREE_|END_|FATE_|MULTI|HAREM)/.test(e.id) && !(s.whenx && s.whenx.includes('window =='))) continue;
      const wx = s.whenx || '';
      if (GUIDE_REFS.test(wx)) continue;
      const hasWin = /window ==/.test(wx);
      if (window) { if (!wx.includes('"' + window + '"') && !(window === 'day_off' && !hasWin && s.slotd && (s.slotd.loc || s.slotd.time))) continue; }
      else if (hasWin) continue;
      if (s.slotd && s.slotd.after && !s.slotd.time && !s.slotd.loc && !s.slotd.w0) continue; // pure after-hooks
      if (s.slotd && s.slotd.before) continue;
      if (!s.slotd && !wx) continue;
      if (!s.slotd && !window && !/__loc|__time/.test(wx)) continue; // condition-only events need a place/time hook
      if (!this.slotOK(e, { times })) continue;
      if (!this.whenOK(e, { times, window: window || this.S.v.window })) continue;
      out.push(e);
    }
    return out;
  }
  // ---------- date ----------
  applyDate(dt) {
    const v = this.S.v;
    if (dt.day !== undefined) {
      if (dt.day !== v.day) { if (weatherOf(dt.day) === 'rain') v.rain_day_count = X.num(v.rain_day_count) + 1; }
      v.day = dt.day;
    }
    if (dt.time) v.time = dt.time;
    v.window = dt.day_off ? 'day_off' : '';
  }
  // ---------- scheduler ----------
  async schedule() {
    const S = this.S;
    if (S.ended) return false;
    while (S.queue.length) {
      const t = S.queue.shift();
      if (t.t === 'scene') { if (!this.getVar('seen_' + t.id) || t.force) { if (this.push(t.id)) return true; } continue; }
      if (t.t === 'main') { this.startMain(t.id); return true; }
      if (t.t === 'day') { if (this.startDay(t.d)) return true; continue; }
      if (t.t === 'fallback') { S.fallback = true; continue; }
    }
    // next main scene
    const O = this.D.order; let i = S.cursor + 1; let id = null;
    for (; i < O.length; i++) {
      const c = O[i];
      if (this.getVar('seen_' + c)) continue;
      if (/_/.test(c)) { if (S.fallback && this.isFallbackFor(c)) { id = c; break; } continue; }
      id = c; break;
    }
    S.fallback = false;
    if (!id) { S.ended = true; return false; }
    const sc = this.D.scenes[id];
    const target = sc.date && sc.date.day;
    if (target !== undefined && target > S.v.day + 1 && S.v.day >= 1) {
      for (let d = S.v.day + 1; d < target; d++) S.queue.push({ t: 'day', d });
    }
    S.queue.push({ t: 'main', id });
    return this.schedule();
  }
  isFallbackFor(c) { const base = c.split('_')[0]; return this.S.lastMain && this.S.lastMain.split('_')[0] === base; }
  startMain(id) {
    const S = this.S;
    S.cursor = this.mainIndex[id]; S.lastMain = id;
    this.push(id);
    const pre = this.events.filter(e => e.s.slotd && e.s.slotd.before === id && !this.getVar('seen_' + e.id) && this.whenOK(e, {}));
    for (const e of pre) this.push(e.id);
  }
  startDay(d) {
    const v = this.S.v;
    v.day = d; if (weatherOf(d) === 'rain') v.rain_day_count = X.num(v.rain_day_count) + 1;
    const off = isDayOff(d);
    v.window = '';
    const noon = this.candidates(NOON_T, off ? 'day_off' : null);
    const night = this.candidates(NIGHT_T, isDayOff(d + 1) ? 'day_off_eve' : null);
    const weekStart = (d - 1) % 7 === 0;
    const guides = LEADS.some(x => ['rowan', 'cecil', 'elio', 'orion'].includes(x) && v[x + '_met']);
    if (!noon.length && !night.length && !(weekStart && guides)) return false;
    const act = X.num(v.act) || 1;
    const actZh = ['序章', '第一幕', '第二幕', '第三幕', '第四幕', '第五幕'][act] || '';
    const label = `${actZh}・W${Math.ceil(d / 7)}・Day ${d}${off ? '・休假日' : ''}`;
    const sid = this.synth([
      ['cmd', 'date', label, 0],
      ['cmd', 'bg', off ? 'bg_sea_wall_day fx=gray' : 'bg_briefing_room fx=gray', 0],
      ['cmd', '__daylabel', '', 0],
      ['cmd', 'freetime', off ? 'day_off' : 'noon', 0],
      ...(guides ? [['call', 'GUIDE_DAILY']] : []),
      ['cmd', 'freetime', isDayOff(d + 1) ? 'day_off_eve' : 'night', 0],
      ['call', 'LAMP_RITUAL'],
      ['end']
    ]);
    this.push(sid);
    return true;
  }
  synth(code) { const id = '__s' + (this.S.synthN++); this.S.synth[id] = code; return id; }
  // ---------- freetime ----------
  optLabel(e, prefix) {
    const s = e.s; const lead = s.lead;
    const loc = s.slotd && s.slotd.loc ? (LOC_NAME[s.slotd.loc] || '') : '';
    if (lead) {
      if (this.met(lead)) return loc ? `去${loc}找${NAMES[lead]}` : `去找${NAMES[lead]}`;
      return `去${loc || '別處'}看看（……好像有人在）`;
    }
    return `（${s.title || loc || '……'}）`;
  }
  freetime(arg) {
    const v = this.S.v;
    const special = ['day_off', 'first_snow_night', 'blackout_city', 'final_night'].includes(arg);
    let times = NOON_T, window = null;
    if (arg === 'noon') times = NOON_T;
    else if (arg === 'night') times = NIGHT_T;
    else if (arg === 'day_off_eve') { times = NIGHT_T; window = 'day_off_eve'; }
    else if (arg === 'day_off') { times = NOON_T; window = 'day_off'; }
    else { times = NIGHT_T; window = arg; }
    if (arg === 'final_night') v.eve_lovers = LEADS.filter(x => this.met(x) && X.num(v['stage_' + x]) >= 4);
    if (arg === 'day_off') {
      let best = '', bv = -1;
      for (const x of LEADS) { if (x === 'arno') continue; const a = X.num(v['aff_' + x]); if (a >= 50 && (X.num(v['pair_bond_' + pairKey('arno', x)]) >= 20 || v['shared_sense_' + pairKey('arno', x)]) && a > bv) { bv = a; best = x; } }
      v.secret_arno_partner = best;
    }
    v.window = window || '';
    let cands = this.candidates(times, window);
    if (window === 'day_off_eve' && !cands.length) cands = this.candidates(times, null);
    // one per lead, highest priority
    const byKey = new Map();
    for (const e of cands.sort((a, b) => b.s.prio - a.s.prio)) {
      const key = e.s.lead || e.id;
      if (!byKey.has(key)) byKey.set(key, e);
    }
    let list = [...byKey.values()];
    const order = (e) => { const i = LEADS.indexOf(e.s.lead); return i < 0 ? 99 : i; };
    if (arg === 'final_night') {
      const solo = list.filter(e => /_night$/.test(e.id)).sort((a, b) => order(a) - order(b));
      const nc = list.find(e => e.id === 'NIGHT_OF_COLORS'); const et = list.find(e => e.id === 'EVE_TOGETHER');
      const code = []; const labels = {};
      const choices = [];
      const mkChoice = (label, opts) => { labels[label] = code.length; const ins = ['choice', null, opts, 'END', 0, '最後的夜。我想去見誰？']; code.push(ins); choices.push(ins); };
      const opt = (text, body, next, cond) => { const pc = code.length; code.push(...body); code.push(['goto', next]); return { text, pc, cond: cond || null }; };
      // build bodies after choice instructions: choices first as placeholders
      const o0 = [], o1 = [], o2 = [];
      mkChoice('R0', o0); mkChoice('R1', o1); mkChoice('R2', o2);
      // R0 jumps over R1/R2 bodies by explicit gotos
      if (nc) o0.push(opt('……所有人。', [['call', nc.id]], 'END'));
      if (et) o0.push(opt('……大家。', [['call', et.id]], 'END'));
      for (const e of solo) o0.push(opt(this.optLabel(e), [['call', e.id]], 'R1', 'not seen_' + e.id));
      o0.push(opt(o0.length ? '（今晚，一個人點燈。）' : '（點燈。）', [['cmd', '__fallback', '1', 0]], 'END'));
      for (const e of solo) o1.push(opt(this.optLabel(e), [['call', e.id]], 'R2', 'not seen_' + e.id));
      o1.push(opt('（……夠了。今晚到這裡。）', [], 'END'));
      for (const e of solo) o2.push(opt(this.optLabel(e), [['call', e.id]], 'END', 'not seen_' + e.id));
      o2.push(opt('（……夠了。今晚到這裡。）', [], 'END'));
      labels.END = code.length; code.push(['end']);
      // R0 -> R1 -> R2 are sequential instructions; make each choice's natural fallthrough go to END
      for (const ins of code) if (ins[0] === 'goto' && typeof ins[1] === 'string') ins[1] = labels[ins[1]];
      for (const ins of choices) ins[3] = labels.END;
      if (!o1.length || solo.length < 2) { /* nothing */ }
      return this.push(this.synth(code));
    }
    list.sort((a, b) => order(a) - order(b));
    list = list.slice(0, 7);
    if (!list.length) { if (special) this.S.fallback = true; return; }
    const code = [null]; const opts = [];
    for (const e of list) {
      const pc = code.length;
      if (e.s.slotd && e.s.slotd.loc) code.push(['set', 'cur_loc', '=', '"' + e.s.slotd.loc + '"']);
      if (e.s.slotd && /sea_wall|east_seawall/.test(e.s.slotd.loc || '')) code.push(['set', 'yasi_goes_seawall', '=', 'true']);
      code.push(['call', e.id]); code.push(['goto', -1]);
      opts.push({ text: this.optLabel(e), pc });
    }
    const apc = code.length; code.push(['cmd', '__fallback', special ? '1' : '', 0]); code.push(['goto', -1]);
    opts.push({ text: special ? '（一個人。）' : (times === NIGHT_T ? '（早點休息。）' : '（一個人待著。）'), pc: apc });
    const endPc = code.length; code.push(['end']);
    for (const ins of code) if (ins && ins[0] === 'goto') ins[1] = endPc;
    code[0] = ['choice', null, opts, endPc, 0, special ? '今晚，我想去見誰？' : (times === NIGHT_T ? '夜裡，要去哪裡？' : '空下來的時間，要去哪裡？')];
    this.push(this.synth(code));
  }
  guideFree(tag) {
    const v = this.S.v;
    v.guide_tag = tag || 'free';
    const code = [['call', 'GUIDE_DAILY'], ['cmd', '__guide_tag_events', '', 0], ['set', 'guide_tag', '=', '""'], ['end']];
    this.push(this.synth(code));
  }
  // ---------- VM ----------
  snapshot() { return clone({ v: this.S.v, stack: this.S.stack, queue: this.S.queue, synth: this.S.synth, synthN: this.S.synthN, cursor: this.S.cursor, fallback: this.S.fallback, ended: this.S.ended, endingId: this.S.endingId, pres: this.S.pres, lastMain: this.S.lastMain, log: this.S.log.slice(-60) }); }
  load(snap) { this.S = clone(snap); this.S.log = this.S.log || []; }
  async run() {
    const S = this.S;
    let guard = 0;
    for (;;) {
      if (this.stopped) return 'stopped';
      if (!S.stack.length) {
        if (!(await this.schedule())) { return S.endingId ? 'ending' : 'end'; }
        continue;
      }
      const f = S.stack[S.stack.length - 1];
      const code = this.code(f.s);
      if (!code || f.pc >= code.length) { this.finishFrame(); continue; }
      const ins = code[f.pc];
      if (++guard % 5000 === 0) await this.ui.yieldTick();
      switch (ins[0]) {
        case 'say': {
          this.lastSnap = this.snapshot();
          const who = ins[1] ? this.interpId(ins[1].replace(/^\{(.*)\}$/, '{$1}')) : '';
          const text = this.interpText(ins[3]);
          const key = f.s + ':' + f.pc;
          f.pc++;
          const line = { who, expr: ins[2], text, kind: ins[4], key, read: this.P.read.has(key), pov: S.pres.pov, name: this.speakerName(who) };
          if (who && ins[2] && ins[2] !== 'default') this.ui.expr && this.ui.expr(who, ins[2]);
          S.log.push({ n: line.name, t: text, k: line.kind }); if (S.log.length > 150) S.log.splice(0, S.log.length - 150);
          await this.ui.say(line);
          this.P.read.add(key);
          break;
        }
        case 'if': f.pc = this.cond(ins[1]) ? f.pc + 1 : ins[2]; break;
        case 'goto': f.pc = ins[1]; break;
        case 'forstart': {
          const L = this.ev(ins[2]);
          if (!Array.isArray(L) || !L.length) { f.pc = ins[3]; break; }
          f.loops.push({ v: ins[1], L, i: 0, start: f.pc }); this.setVar(ins[1], L[0]); f.pc++; break;
        }
        case 'fornext': {
          const lp = f.loops[f.loops.length - 1];
          if (!lp) { f.pc++; break; }
          lp.i++;
          if (lp.i < lp.L.length) { this.setVar(lp.v, lp.L[lp.i]); f.pc = lp.start + 1; } else { f.loops.pop(); f.pc++; }
          break;
        }
        case 'choice': {
          const opts = this.buildOptions(ins[2]);
          if (!opts.length) { f.pc = ins[3]; break; }
          this.lastSnap = this.snapshot();
          const idx = await this.ui.choice(opts.map(o => ({ text: o.text })), ins[1], ins[5] || '');
          const o = opts[Math.max(0, Math.min(opts.length - 1, idx))];
          for (const k in o.bind) this.setVar(k, o.bind[k]);
          S.log.push({ n: '▸', t: o.text, k: 'choice' });
          f.pc = o.pc;
          break;
        }
        case 'set': { f.pc++; this.doSet(ins[1], ins[2], ins[3]); break; }
        case 'clamp': {
          f.pc++;
          if (ins[4] && !this.cond(ins[4])) break;
          const n = this.interpId(ins[1]); this.setVar(n, Math.max(ins[2], Math.min(ins[3], X.num(this.getVar(n))))); break;
        }
        case 'jump': { this.jump(this.interpId(ins[1])); break; }
        case 'call': {
          f.pc++;
          const t = this.interpId(ins[1]);
          if (!this.D.scenes[t] && !S.synth[t]) { this.err('call target missing: ' + t); break; }
          this.push(t); break;
        }
        case 'return': case 'end': this.finishFrame(); break;
        case 'cmd': { f.pc++; await this.command(ins[1], ins[2], ins); break; }
        default: f.pc++; this.err('bad instr ' + ins[0]);
      }
    }
  }
  buildOptions(raw) {
    const out = [];
    for (const o of raw) {
      const fors = o.fors || [];
      const combos = [{}];
      for (const [vn, le] of fors) {
        const next = [];
        for (const c of combos) {
          this.ctx.scopes.push(c);
          let L; try { L = this.ev(le); } finally { this.ctx.scopes.pop(); }
          if (Array.isArray(L)) for (const x of L) next.push(Object.assign({}, c, { [vn]: x }));
        }
        combos.splice(0, combos.length, ...next);
      }
      for (const c of combos) {
        this.ctx.scopes.push(c);
        try {
          if (o.cond && !this.cond(o.cond)) continue;
          const text = this.interpText(o.text);
          out.push({ text, pc: o.pc, bind: c });
        } finally { this.ctx.scopes.pop(); }
      }
    }
    return out;
  }
  doSet(lhs, op, rhs) {
    const name = this.interpId(lhs);
    let val;
    const bare = /^[A-Za-z_][\w]*$/.test(rhs) && !['true', 'false'].includes(rhs);
    val = this.ev(rhs);
    if (val === undefined && bare) val = (op === '=') ? (/^(aff|bond|stage|seen|pair|load|jealousy)_/.test(rhs) ? 0 : rhs) : rhs;
    const cur = this.getVar(name);
    if (op === '=') this.setVar(name, val === undefined ? false : val);
    else if (op === '+=') {
      if (Array.isArray(cur)) { this.setVar(name, cur.concat(Array.isArray(val) ? val : [val])); }
      else if (cur === undefined && typeof val === 'string' && isNaN(+val)) this.setVar(name, [val]);
      else if (typeof cur === 'string' && typeof val === 'string') this.setVar(name, cur + val);
      else this.setVar(name, X.num(cur) + X.num(val));
    } else if (op === '-=') {
      if (Array.isArray(cur)) this.setVar(name, cur.filter(x => x !== val));
      else this.setVar(name, X.num(cur) - X.num(val));
    } else if (op === '*=') this.setVar(name, X.num(cur) * X.num(val));
    if (/^(aff|bond)_/.test(name)) { const n = X.num(this.getVar(name)); if (n > 100) this.setVar(name, 100); }
    if (name === 'load') { const n = X.num(this.S.v.load); this.S.v.load = Math.max(0, Math.min(100, n)); this.ui.gauge && this.ui.gauge(this.S); }
    if (name === 'loc' && this.S.pres.combat) this.ui.gauge && this.ui.gauge(this.S);
  }
  jump(t) {
    const S = this.S;
    const f = S.stack[S.stack.length - 1];
    if (!this.D.scenes[t]) { this.err('jump target missing: ' + t); f.pc++; return; }
    this.markSeen(f.s);
    if (t in this.mainIndex) {
      if (this.getVar('seen_' + t) && this.mainIndex[t] <= S.cursor) { S.stack.pop(); this.afterScene(f.s, S.stack.length === 0); return; }
      S.stack.length = 0;
      S.cursor = this.mainIndex[t]; S.lastMain = t;
      this.push(t);
      return;
    }
    S.stack.pop();
    this.push(t);
  }
  speakerName(who) {
    if (!who) return '';
    const P = this.S.pres;
    if (P.names[who]) return P.names[who];
    if (LEADS.includes(who) && !this.S.v[who + '_met'] && !(who === 'kael' && this.S.v.day >= 1)) return '？？？';
    if (who === 'yasi') return '亞思';
    return NAMES[who] !== undefined ? NAMES[who] : who;
  }
  async command(c, a, ins) {
    const S = this.S, P = S.pres, v = S.v;
    a = a || '';
    switch (c) {
      case 'name': {
        const m = /^(\{?[\w{}()]+\}?)\s+(.*)$/.exec(a); if (!m) break;
        const id = this.interpId(m[1]); const rest = m[2].trim();
        if (rest === 'reset') delete P.names[id]; else P.names[id] = this.interpText(rest.replace(/^「|」$/g, ''));
        break;
      }
      case 'pov': P.pov = this.interpId(a.trim()) || 'yasi'; break;
      case 'date': { P.date = this.interpText(a); const sc = this.D.scenes[ins.__sid]; this.ui.date && await this.ui.date(P.date); break; }
      case 'color': {
        const id = this.interpId(a.trim().split(/\s+/)[0]);
        const h = COLOR_TO_HEART[id];
        if (h && !id.startsWith('hint_') && !v.colors_seen.includes(h)) { v.colors_seen.push(h); v['color_' + h] = true; }
        this.ui.color && await this.ui.color(id, S);
        break;
      }
      case 'freetime': this.freetime(this.interpId(a.trim())); break;
      case 'guide': { const p = a.trim().split(/\s+/); if (p[0] === 'free') this.guideFree(p[1] || 'free'); else this.push('GUIDE_DAILY'); break; }
      case '__guide_tag_events': {
        const e = this.pickEvent(e => e.s.whenx && /guide_tag ==/.test(e.s.whenx), {});
        if (e) this.push(e.id);
        break;
      }
      case '__fallback': if (a === '1') S.fallback = true; break;
      case 'play_event': {
        const tag = String(this.ev(a));
        const e = this.pickEventByTag(tag);
        if (e) this.push(e.id);
        break;
      }
      case 'ending': {
        const id = this.interpId(a.trim());
        S.endingId = id; v.ending_id = id;
        this.P.endings[id] = this.P.endings[id] || Date.now();
        v['seen_ending_' + id] = true;
        this.ui.persist && this.ui.persist();
        break;
      }
      case 'unlock': { const id = this.interpId(a.trim()); this.P.unlocks[id] = true; this.ui.persist && this.ui.persist(); break; }
      case 'gallery_color': { const t = this.ev(a.trim()); this.P.gallery[String(t || a.trim())] = true; this.ui.persist && this.ui.persist(); break; }
      case 'combat': {
        const p = a.trim().split(/\s+/);
        if (p[0] === 'begin') { v.loc = Math.floor(X.num(v.load) / 2); P.combat = { id: p[1] || '' }; }
        else P.combat = null;
        this.ui.gauge && this.ui.gauge(S);
        break;
      }
      case 'cg': {
        let id = this.interpId(a.trim().split(/\s+/)[0]);
        if (id === 'off') { P.cg = null; }
        else { P.cg = { id, note: ins[4] || '' }; this.P.cgs[id] = true; this.ui.persist && this.ui.persist(); }
        break;
      }
      case 'bg': {
        const p = a.trim().split(/\s+/); const id = this.interpId(p[0]);
        const fx = (/fx=(\w+)/.exec(a) || [])[1] || 'gray';
        P.bg = id; P.bgfx = fx; P.cg = null;
        break;
      }
      case 'show': {
        const p = this.interpId(a).trim().split(/\s+/);
        const id = p[0]; const outfit = p[1] && !p[1].includes('=') ? p[1] : 'uniform'; const ex = p[2] && !p[2].includes('=') ? p[2] : 'default';
        const pos = (/pos=(\w+)/.exec(a) || [])[1] || (P.sprites[id] && P.sprites[id].pos) || 'center';
        P.sprites[id] = { outfit, expr: ex, pos, t: Date.now() };
        break;
      }
      case 'show_group': {
        const m = /^(\[.*?\]|\S+)\s+(\S+)/.exec(a.trim()); if (!m) break;
        let L = this.ev(m[1]); if (!Array.isArray(L)) L = [];
        const pos = ['far_left', 'left', 'center', 'right', 'far_right'];
        L.slice(0, 5).forEach((id, i) => { P.sprites[id] = { outfit: m[2], expr: 'default', pos: pos[Math.round(i * 4 / Math.max(1, Math.min(5, L.length) - 1))] || 'center', t: Date.now() }; });
        break;
      }
      case 'expr': { const p = a.trim().split(/\s+/); const id = this.interpId(p[0]); if (P.sprites[id]) P.sprites[id].expr = p[1]; break; }
      case 'hide': { const id = this.interpId(a.trim().split(/\s+/)[0]); if (id === 'all' || !id) P.sprites = {}; else delete P.sprites[id]; break; }
      case 'bgm': { const p = a.trim().split(/\s+/); const id = this.interpId(p[0]); P.bgm = (id === 'stop' || !id) ? null : id; break; }
      case 'amb': { const p = a.trim().split(/\s+/); const id = this.interpId(p[0]); P.amb = (id === 'stop' || !id) ? null : { id, vol: parseFloat((/vol=([\d.]+)/.exec(a) || [])[1] || '0.5') }; break; }
      case 'counter': {
        const p = a.trim().split(/\s+/); const val = p[0];
        const col = (/color=(\w+)/.exec(a) || [])[1];
        if (val === 'off') P.counter = null;
        else if (val === 'stop') { if (P.counter) P.counter.stop = true; }
        else if (/^[+-]\d+$/.test(val)) { const cur = P.counter ? X.num(P.counter.n) : 0; P.counter = { n: cur + parseInt(val, 10), color: col || (P.counter && P.counter.color) }; }
        else P.counter = { n: val, color: col };
        break;
      }
      case 'title': {
        const t = this.interpText(a).replace(/sub=.*/, '').trim().replace(/^「|」$/g, '');
        const sub = (/sub=(.*)$/.exec(a) || [])[1];
        P.title = t; this.ui.title && await this.ui.title(t, sub ? this.interpText(sub.replace(/^「|」$/g, '')) : '');
        break;
      }
      case 'comm': {
        const m = /^(\{?[\w{}()]+\}?)\s*(.*)$/.exec(a.trim()); if (!m) break;
        const who = this.interpId(m[1]);
        this.lastSnap = this.snapshot();
        const text = this.interpText(m[2]);
        S.log.push({ n: '通訊・' + this.speakerName(who), t: text, k: 'comm' });
        await this.ui.say({ who, expr: '', text, kind: 'comm', key: null, read: false, pov: P.pov, name: this.speakerName(who) });
        break;
      }
      case 'diary': {
        const text = this.interpText(a.trim());
        v.diary = (v.diary || []).concat([{ d: v.day, t: text }]).slice(-200);
        this.lastSnap = this.snapshot();
        S.log.push({ n: '日記', t: text, k: 'diary' });
        await this.ui.say({ who: '', expr: '', text, kind: 'diary', key: null, read: false, pov: P.pov, name: '日記' });
        break;
      }
      case 'clickable': break;
      default:
        if (this.ui.fx) await this.ui.fx(c, this.interpText(a), S);
    }
    if (this.ui.present) this.ui.present(S, c);
  }
}
const api = { Engine, NAMES, LEADS, HIDDEN, HEART, COLOR_HEX, COLOR_NAME, LOC_NAME, weatherOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VEngine = api;
})(typeof self !== 'undefined' ? self : this);
