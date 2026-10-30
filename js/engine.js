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
  rift_edge: '裂隙邊緣', bar: '酒館', chapel_yard: '禮拜堂中庭', lighthouse: '燈塔', east_seawall: '東海堤', briefing: '簡報室', cecil_office: '上校辦公室', city: '城區', city_north: '北城', dorm_yasi: '我的宿舍', east_district: '東區', greenhouse: '溫室', guide_room: '疏導室', harbor: '港口', hq_office: '總部辦公室', hq_roof: '總部屋頂', hq_yard: '中庭', manor: '宅邸', market: '市場', mess_hall: '食堂', old_port: '舊港', orphanage: '孤兒院', purify_room: '淨化室', rowan_room: '洛恩的房間', seawall: '海堤', slum_market: '貧民區市場', training_ground: '訓練場' };
const NOON_T = ['predawn', 'dawn', 'morning', 'noon', 'dusk'];
const NIGHT_T = ['evening', 'night', 'late_night'];
const ZHD = '零一二三四五六七八九';
function zhNum(x) { let n = Math.max(0, Math.round(X.num(x))); if (n >= 100) return n === 100 ? '一百' : String(n); if (n < 10) return ZHD[n]; const t = Math.floor(n / 10), u = n % 10; return (t === 1 ? '' : ZHD[t]) + '十' + (u ? ZHD[u] : ''); }
const GUIDE_AFTER = new Set(['R08']); // 疏導結束後才發生的組合事件（排在當晚之後）
const GUIDE_REFS = /\b(g1|g2|guide_g1|guide_g2|anchor|sent_in|guide_pair|guide_tag|guide_mode|__gi)\b/;
// ---- v2 systems (REWRITE_PLAN §4) ----
const GUIDES = ['rowan', 'cecil', 'elio', 'orion', 'noa', 'arno'];
const SENTINELS = ['kael', 'ash', 'leo', 'silas', 'vex'];
const STAGE_T = [0, 0, 8, 15, 22, 30, 40, 55, 60]; // aff needed for stage n (stage 7: ≥55 until confession scenes exist)
const PURIFY_ID = /^(GUIDE_|GS_|GR_|GX_|GXF_|WX_|WATCH_|JOIN_|LOAD_|TEMP_ANCHOR|ANCHOR_|EMERG|SENT_PRESENCE|SHARED_SENSE)/;
const LOAD_MAX = 120;
const PLACE_KEY = { canteen: 'mess', east_seawall: 'sea_wall', old_port_pier: 'old_port_bar', old_port_alley: 'old_port_bar', bar: 'old_port_bar', chapel_yard: 'chapel', research_roof: 'roof' };
const PLACE_VERB = { mess: '去食堂', training: '去訓練場', roof: '上屋頂', sea_wall: '去海堤走走', archive: '去檔案室', medbay: '去醫療室', wall_top: '上城牆',
  chapel: '去禮拜堂', tower: '去嚮導塔', old_port_bar: '去舊港', kitchen: '去廚房', dorm: '回宿舍待著', guide_room_corridor: '去疏導室那一層', hq_corridor: '在總部裡走走',
  hq_locker: '去更衣室', research: '去研究所', research_dorm: '去研究所宿舍', outside_wall: '出牆外', north_city: '去北城', shallows: '去淺灘', cemetery: '去墓地',
  lab: '去實驗室', lighthouse: '去燈塔', rift_edge: '去裂隙邊緣', facility_ruin: '去設施廢墟', detention: '去拘留室', roam: '隨便走走' };
const LEAD_HOME = { kael: 'training', rowan: 'mess', cecil: 'tower', elio: 'medbay', orion: 'archive', ash: 'wall_top', leo: 'training', silas: 'chapel', noa: 'old_port_bar', vex: 'roof', arno: 'sea_wall' };
const PLACE_POOL = ['mess', 'training', 'roof', 'sea_wall', 'archive', 'medbay', 'wall_top', 'tower', 'chapel', 'old_port_bar'];

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
    this.purify = new Set();
    for (const [id, sc] of Object.entries(data.scenes)) {
      if (PURIFY_ID.test(id) || (sc.whenx && GUIDE_REFS.test(sc.whenx)) || /疏導|淨化/.test(sc.title || '')) this.purify.add(id);
      else if (id in this.mainIndex && /疏導/.test(JSON.stringify(sc.code))) this.purify.add(id);
    }
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
      case 'known_guides': return GUIDES.filter(x => x === 'noa' ? !!v.guide_noa_unlocked : x === 'arno' ? !!v.arno_met : !!v[x + '_met']); // 她已知道是嚮導的人（與 LOAD_90 選項同條件）
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
  setVar(n, val) { n = normVar(n); if (typeof val === 'number' && n.startsWith('pair_bond_') && val > 100) val = 100; this.S.v[n] = val; }
  capPB() { const v = this.S.v; for (const k in v) if (k.startsWith('pair_bond_') && typeof v[k] === 'number' && v[k] > 100) v[k] = 100; } // v2 批2：pair_bond 上限 100
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
      case 'gxpick': { // 情境池：從 n 句裡挑一句，不與上一次同一句（同池不連續重複）
        const key = 'gxp_' + String(a[0]); const nn = Math.max(1, X.num(a[1])); const last = v[key];
        let r = Math.floor(Math.random() * nn); if (nn > 1 && r === last) r = (r + 1 + Math.floor(Math.random() * (nn - 1))) % nn;
        v[key] = r; return r;
      }
      case 'has_event': return !!this.pickEventByTag(String(a[0]));
      case 'zh': return zhNum(a[0]);
      case 'load_after': { // 這場疏導結束後的負荷（與 guideEffects 同一套算法），給事件文字用
        const cur = X.num(v.load); const floor = 5 * Math.max(1, X.num(v.act));
        if (v.guide_ev && v.ev_load0 !== undefined && v.ev_load0 !== '') { // 路線疏導事件：事件自己的降幅與標準降幅取大
          const done = Math.max(0, X.num(v.ev_load0) - cur); const extra = Math.max(0, this.guideRed() - done);
          return Math.max(Math.min(cur, floor), cur - extra);
        }
        return Math.max(Math.min(cur, floor), cur - Math.max(0, this.guideRed()));
      }
      case 'min_pair_bond': { const L = a[0] || []; let m = Infinity; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) m = Math.min(m, X.num(v['pair_bond_' + pairKey(L[i], L[j])])); return m === Infinity ? 0 : m; }
      case 'pair_key': return pairKey(a[0], a[1]);
      case 'yname': { // 這位嚮導現在怎麼叫她（依 addr_<g>_yasi；design/naming.md）
        const g = String(a[0]); const ad = v['addr_' + g + '_yasi'];
        if (g === 'rowan') return ad === 'xiaohai' ? '小海' : ad === 'surname' ? '卡菲希爾' : '亞思';
        if (g === 'cecil') return (ad === 'given' || ad === 'fullname' || ad === 'variable' || v.cecil_calls_name) ? '亞思' : 'A-08';
        if (g === 'elio') return ad === 'nickname' ? '小思' : (ad === 'given' || ad === 'fullname') ? '亞思' : '卡菲希爾';
        if (g === 'orion') return ad === 'nickname' ? '夜鶯' : '亞思';
        if (g === 'noa') return ad === 'nickname_strawberry' ? '草莓' : ad === 'given' ? '亞思' : ad === 'surname' ? '卡菲希爾' : '小姐';
        if (g === 'arno') return '小思';
        return '亞思';
      }
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
    this.capPB();
    const sc = this.D.scenes[sid];
    if (sc && sc.lead && !(sid in this.mainIndex) && LEADS.includes(sc.lead)) {
      this.seenLead(sc.lead);
      if (SENTINELS.includes(sc.lead) && !this.purify.has(sid) && !/^(NEGLECT_|CONTACT_|PATROL|PLACE_)/.test(sid)) this.contactProgress(sc.lead, 1);
    }
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
    // guide-context route events (g1/g2/anchor based), evaluated with pre-guiding load
    // v2 批4：v2 疏導沒有設 guide_pair → 舊的組合事件從來不會觸發。兩種順序都試。
    // 2026-10-30：疏導情境的路線事件改在 guideStage 裡「取代」當天的 GX（不再排到深夜變成第二場疏導）。
    // 這裡只排「疏導結束後」的事件（GUIDE_AFTER，例：半夜廚房），而且只看主導＋在場的實際順序。
    v.guide_pair = g1 + '_' + g2;
    const aft = this.pickEvent(e => GUIDE_AFTER.has(e.id) && e.s.whenx && !/window ==/.test(e.s.whenx), {});
    if (aft) this.S.queue.unshift({ t: 'scene', id: aft.id });
    const st1 = X.num(v['gstage_' + g1]), st2 = X.num(v['gstage_' + g2]);
    const fresh = !!v.gs_new;
    let a1 = fresh ? 3 : 2; const b1 = fresh ? 2 : 1;
    if (g1 === 'cecil' && st1 < 3) a1 -= 1; // 塞西爾：負面起點，第 3 階前增益減半
    v['aff_' + g1] = Math.min(100, X.num(v['aff_' + g1]) + a1);
    v['bond_' + g1] = Math.min(100, X.num(v['bond_' + g1]) + b1);
    if (st2 >= 3) v['aff_' + g2] = Math.min(100, X.num(v['aff_' + g2]) + 1); else v['jealousy_' + g2] = X.num(v['jealousy_' + g2]) + 1;
    if (g2 === 'arno' && v.arno_truth) v.bond_arno = Math.min(100, X.num(v.bond_arno) + 1); // 家人疏導：在場也算陪伴
    v['pair_bond_' + k] = X.num(v['pair_bond_' + k]) + 1;
    v['pair_sync_' + k] = X.num(v['pair_sync_' + k]) + 3;
    let red = this.guideRed();
    // 2026-10-30：取代 GX 的路線疏導事件自己會 @set load -=。那就是這一場的降幅，不再額外疊一次標準降幅（總降幅＝兩者取大）。
    if (v.guide_ev && v.ev_load0 !== undefined && v.ev_load0 !== '') { const done = X.num(v.ev_load0) - X.num(v.load); if (done > 0) red = Math.max(0, red - done); }
    v.ev_load0 = '';
    // 第一幕的嚮導藥：身體以為嚮導隨時都在，真正的疏導反而進不深。疏導 6 次後清掉（PILL_CLEAR）。
    if (v.pill_dependence) { v.pill_dep_n = X.num(v.pill_dep_n) + 1; if (v.pill_dep_n >= 6) { v.pill_dependence = false; v.pill_dep_cleared = true; const qi = this.S.queue.findIndex(q => q.t !== 'scene'); this.S.queue.splice(qi < 0 ? this.S.queue.length : qi, 0, { t: 'scene', id: 'PILL_CLEAR' }); } }
    // 殘響底線：日常疏導降不到底線以下（底線隨幕數上升；緊急疏導／加入場不受限）
    const cur = X.num(v.load); const floor = 5 * Math.max(1, X.num(v.act));
    this.setLoad(Math.max(Math.min(cur, floor), cur - Math.max(0, red)), true);
    v['last_lead_' + g1] = v.day; this.seenLead(g1); this.seenLead(g2);
    v.guided_day = v.day;
    if (g1 === 'rowan') v.rowan_lead_count = X.num(v.rowan_lead_count) + 1;
    if (this.getVar('week') === 3 && (g1 === 'cecil' || g2 === 'cecil')) v.cecil_in_guide_w3 = true;
    if (v.seen_K10a && v.sent_in === 'kael') v.anchor_count_kael_after_K10a = X.num(v.anchor_count_kael_after_K10a) + 1;
    if (v.kael_romance_lock && X.num(v.aff_kael) > 19) v.aff_kael = 19;
  }
  guideRed() {
    const v = this.S.v; const st1 = X.num(v['gstage_' + v.g1]), st2 = X.num(v['gstage_' + v.g2]);
    let red = 12 + 2 * st1 + Math.floor(st2 / 2);
    if (weatherOf(v.day) === 'rain') red -= 4;
    if (v.anchor_refused) red = Math.floor(red / 2);
    if (v.pill_dependence) red -= 3;
    return red;
  }
  // ---------- v2: stages, presence, load, neglect ----------
  stageCan(x, next, kind) {
    const v = this.S.v; if (next > 8) return false;
    const aff = X.num(v['aff_' + x]); const load = X.num(v.load);
    if (next > 1 && aff < STAGE_T[next]) return false;
    if (next >= 5 && load >= 90) return false;
    if (next >= 6 && load >= 70) return false;
    if (next >= 7 && !(v['confessed_' + x] || aff >= 55)) return false;
    if (next >= 8 && !(v['confessed_' + x] && aff >= 60 && load < 70)) return false; // 第 3 批：第 8 階＝告白後、aff≥60、負荷<70
    if (kind === 'g' && x === 'arno') return false;
    if (x === 'kael' && v.kael_romance_lock && next >= 5) return false;
    return true;
  }
  guideStage(quiet) {
    const v = this.S.v; const g = v.g1; const cur = X.num(v['gstage_' + g]);
    let n = cur, fresh = false;
    v['gprog_' + g] = X.num(v['gprog_' + g]) + 1;
    if (cur >= 1 && X.num(v['gprog_' + g]) >= 3 && this.stageCan(g, cur + 1, 'g')) { n = cur + 1; fresh = true; v['gstage_' + g] = n; v['gprog_' + g] = 0; }
    if (!n) { n = 1; fresh = true; v['gstage_' + g] = 1; v['gprog_' + g] = 0; }
    v.gs_n = n; v.gs_new = fresh; v.gs_band = n >= 5 ? 'high' : n >= 3 ? 'mid' : 'low';
    v.guide_ev = '';
    if (quiet && !fresh) return;
    if (!fresh) {
      // 路線的疏導事件（RX/EX/AX…）＝這一場疏導本身：取代 GX，不另外加一場。只用實際的主導_在場順序判定。
      if (!v.sent_pre) this.sentinelPick();
      v.guide_pair = v.g1 + '_' + v.g2;
      const ev = this.pickEvent(e => e.s.whenx && GUIDE_REFS.test(e.s.whenx) && !GUIDE_AFTER.has(e.id) && !/window ==|guide_tag ==|guide_mode ==/.test(e.s.whenx), {});
      if (ev) {
        v.guide_ev = ev.id; v.pair_event_played = true; v.ev_load0 = X.num(v.load);
        if (/sent_in/.test(ev.s.whenx)) v.sent_shown = true;
        // 路線事件本身寫了守夜哨兵（AX04：艾許守夜…）→ 今天在場的哨兵就是他，不再另外播 SENT_PRESENCE
        const sl = this.D.scenes[ev.id] && this.D.scenes[ev.id].lead;
        if (sl && SENTINELS.includes(sl) && sl !== v.g1 && sl !== v.g2) { v.sent_in = sl; v.sent_mode = 'stay'; v.sent_shown = true; v['sent_last_' + sl] = v.day; }
        v.wx_pending = ''; this.push(ev.id); return;
      }
    }
    this.wxPeek();
    const G = g.toUpperCase();
    let id;
    if (fresh) id = this.D.scenes['GS_' + G + '_' + n] ? 'GS_' + G + '_' + n : 'GUIDE_STAGE_GENERIC';
    else {
      // GX：每次疏導都是新的一段（同一位嚮導的連續劇情）；用完後改走 GXF_ 情境組合池
      // 情境層（GX_OPEN 讀）：距上次由他主疏導幾天、隔天早上、被冷落、巡邏日、輪替序號
      v.gx_gap = v['gx_lastday_' + g] === undefined ? 0 : X.num(v.day) - X.num(v['gx_lastday_' + g]); v['gx_lastday_' + g] = v.day;
      v.gx_ma = v.ma_x === g && X.num(v.ma_day) === X.num(v.day) - 1;
      v.gx_mab = !v.gx_ma && v.ma_by === g && X.num(v.ma_day) === X.num(v.day) - 1;
      v.gx_seek = !!v['seek_' + g];
      v.gx_patrol = X.num(v.patrol_day) === X.num(v.day) && X.num(v.day) > 0;
      v.gx_k = X.num(v['gx_n_' + g]) % 3; v.gx_odd = X.num(v['gx_n_' + g]) % 2;
      id = this.gxNext(g, n);
      if (!id) id = this.D.scenes['GXF_' + G] ? 'GXF_' + G : this.D.scenes['GR_' + G + '_' + v.gs_band] ? 'GR_' + G + '_' + v.gs_band : 'GUIDE_STAGE_GENERIC';
      v.gx_tick = X.num(v.gx_tick) + 1; v.gx_cur = id; v['gx_last_' + g] = id;
      v['gx_n_' + g] = X.num(v['gx_n_' + g]) + 1;
    }
    this.push(id);
  }
  gxList(g) {
    if (!this._gx) this._gx = {};
    if (!this._gx[g]) {
      const re = new RegExp('^GX_' + g.toUpperCase() + '_(\\d+)$');
      this._gx[g] = Object.entries(this.D.scenes).filter(([id, s]) => s.gx && re.test(id))
        .map(([id, s]) => ({ id, k: +id.match(re)[1], gx: s.gx })).sort((a, b) => a.k - b.k);
    }
    return this._gx[g];
  }
  gxNext(g, n) {
    const v = this.S.v;
    for (const e of this.gxList(g)) {
      if (v['gxs_' + e.id]) continue;
      if (n < e.gx.min || n > e.gx.max) continue;
      if (e.gx.req && !this.cond(e.gx.req)) continue;
      v['gxs_' + e.id] = true; v['gx_' + g] = X.num(v['gx_' + g]) + 1;
      return e.id;
    }
    return null;
  }
  guideWatch() {
    const v = this.S.v; const g1 = v.g1, g2 = v.g2;
    const st1 = X.num(v['gstage_' + g1]), st2 = X.num(v['gstage_' + g2]);
    v.watch_band = st2 >= 6 ? 'deep' : st2 >= 3 ? 'mid' : 'shallow';
    const load = X.num(v.load);
    v.join_try = g2 !== 'arno' && g1 !== 'arno' && st2 >= 3 && X.num(v['aff_' + g2]) >= 25 && load >= 50 && load < 90 && Math.random() * 100 < 15 + 5 * (st2 - 3);
    v.join_deep = !!(v.join_try && st1 >= 6 && st2 >= 6);
    // 2026-10-30：旁觀也是連續劇情。每一組「主導→在場」有自己的 WX_<G1>_<G2>_k 鏈（吃醋→同盟→告白→同意→三人），
    // 依序播、不重複；鏈用完（或這一階段還沒有能播的）才回到 WATCH_<band> 變體池。路線疏導事件那天仍跳過旁觀（只做加入判定）。
    if (!v.guide_ev) {
      if (v.wx_pending === undefined || v.wx_day !== v.day) this.wxPeek();
      const id = v.wx_pending;
      if (id && this.D.scenes[id]) {
        v['wxs_' + id] = true; const k = 'wx_n_' + g1 + '_' + g2; v[k] = X.num(v[k]) + 1; v.wx_cur = id; v.wx_pending = '';
        v.join_try = false; v.join_deep = false; // 鏈裡的伸手／三人由劇情自己寫
        this.push(id); return;
      }
    }
    v.wx_cur = '';
    this.push('WATCH_' + v.watch_band.toUpperCase());
  }
  wxList(g1, g2) {
    if (!this._wx) this._wx = {};
    const key = g1 + '_' + g2;
    if (!this._wx[key]) {
      const re = new RegExp('^WX_' + g1.toUpperCase() + '_' + g2.toUpperCase() + '_(\\d+)$');
      this._wx[key] = Object.entries(this.D.scenes).filter(([id, s]) => re.test(id))
        .map(([id, s]) => ({ id, k: +id.match(re)[1], gx: s.gx || { min: 0, max: 8, req: '' } })).sort((a, b) => a.k - b.k);
    }
    return this._wx[key];
  }
  wxPhase(a, b) { // 這一組走到哪：有 PB 場的組合＝pbeat；沒有的（諾亞＋奧瑞恩）看 pair_bond。已同意＝4。
    const v = this.S.v; const k = pairKey(a, b);
    if (v['consent_' + k]) return 4;
    if (this.D.scenes['PB_' + k.toUpperCase() + '_1']) return X.num(v['pbeat_' + k]);
    const pb = X.num(v['pair_bond_' + k]); return pb >= 20 ? 3 : pb >= 12 ? 2 : pb >= 5 ? 1 : 0;
  }
  wxPeek() { // 在 GX 開場前先決定今天的旁觀段（有的話 GX_PAIR 那一行就不播，避免同一個人講兩次）
    const v = this.S.v; const g1 = v.g1, g2 = v.g2; v.wx_pending = ''; v.wx_day = v.day;
    if (!g1 || !g2 || g1 === g2) return '';
    v.wx_ph = this.wxPhase(g1, g2); v.wx_k = pairKey(g1, g2);
    v.wx_ma = v.ma_x === g2 && X.num(v.ma_day) === X.num(v.day) - 1; v.wx_seek = !!v['seek_' + g2];
    const st2 = X.num(v['gstage_' + g2]);
    for (const e of this.wxList(g1, g2)) {
      if (v['wxs_' + e.id]) continue;
      if (st2 < e.gx.min || st2 > e.gx.max) continue;
      if (e.gx.req && !this.cond(e.gx.req)) continue;
      v.wx_pending = e.id; return e.id;
    }
    return '';
  }
  sentinelPresence() {
    const v = this.S.v;
    if (!v.sent_pre) this.sentinelPick();
    const who = v.sent_in; v.sent_pre = false;
    if (who && !v.sent_shown) this.push('SENT_PRESENCE');
    v.sent_shown = false;
  }
  sentinelPick() {
    const v = this.S.v; const g1 = v.g1; const load = X.num(v.load); v.sent_pre = true;
    const met = SENTINELS.filter(x => this.met(x) || (x === 'kael'));
    // v2 批3：輪流——好幾天沒來的人優先，再比好感（避免永遠是同一個哨兵）
    const due = (x) => (v['sent_last_' + x] === undefined || X.num(v.day) - X.num(v['sent_last_' + x]) >= 4) ? 1 : 0;
    const byAff = (L) => L.sort((p, q) => (due(q) - due(p)) || (X.num(v['aff_' + q]) - X.num(v['aff_' + p])))[0] || '';
    let who = '', mode = '';
    who = byAff(met.filter(x => X.num(v['cstage_' + x]) >= 5 && (v['consent_' + pairKey(g1, x)] || X.num(v['pair_bond_' + pairKey(g1, x)]) >= 18)));
    if (who) mode = 'stay';
    // v2 批3：留下的人已經連著來了，而另一個哨兵好幾天沒見到她——今天換他在門口等
    if (who && !due(who)) { const o = byAff(met.filter(x => x !== who && due(x) && X.num(v['aff_' + x]) >= 40 && X.num(v['cstage_' + x]) >= 4)); if (o) { who = o; mode = 'door'; } }
    if (!who && v.mission_partner && v.mission_partner_day === v.day && X.num(v['sload_' + v.mission_partner]) >= 60) { who = v.mission_partner; mode = 'order'; }
    if (!who) { who = byAff(met.filter(x => X.num(v['aff_' + x]) >= 25 && (load >= 70 || v.fought_day === v.day || v['quarrel_day_' + x] === v.day || (X.num(v['aff_' + x]) >= 40 && X.num(v['cstage_' + x]) >= 4 && due(x))))); if (who) mode = 'door'; }
    v.sent_in = who; v.sent_mode = mode; // v2 批4：哨兵只能在場／守門，不能當錨（anchor 只給嚮導）
    if (who) { v['sent_last_' + who] = v.day; this.seenLead(who); }
  }
  contactProgress(x, n) {
    const v = this.S.v; if (!SENTINELS.includes(x)) return;
    if (!X.num(v['cstage_' + x])) v['cstage_' + x] = 1;
    v['cprog_' + x] = X.num(v['cprog_' + x]) + (n || 1);
    const next = X.num(v['cstage_' + x]) + 1;
    if (X.num(v['cprog_' + x]) >= 2 && this.stageCan(x, next, 's')) {
      v['cstage_' + x] = next; v['cprog_' + x] = 0; v.cs_who = x; v.cs_n = next;
      const id = 'CS_' + x.toUpperCase() + '_' + next;
      this.push(this.D.scenes[id] ? id : 'CONTACT_STAGE');
    }
  }
  seenLead(x) {
    const v = this.S.v; if (!LEADS.includes(x)) return;
    v['last_seen_' + x] = v.day; v['neglect_tier_' + x] = 0;
  }
  inPurify() { return this.S.stack.some(f => this.purify.has(f.s)); }
  setLoad(n, ctxOK) {
    const v = this.S.v; const prev = X.num(v.load);
    n = Math.max(0, Math.min(LOAD_MAX, Math.round(X.num(n))));
    v.load = n;
    if (n > prev) this.loadCross(prev, n, ctxOK);
    this.ui.gauge && this.ui.gauge(this.S);
  }
  loadCross(prev, n, force) {
    const v = this.S.v; if (X.num(v.day) < 1) return;
    const inMain = !force && this.S.stack.length && (this.S.stack[0].s in this.mainIndex);
    let T = 0; for (const t of [70, 90, 100]) if (prev < t && n >= t) T = t;
    if (!T) return;
    if (T === 100 && !inMain && v.act2_guiding_unlocked) v.overdraw_count = X.num(v.overdraw_count) + 1;
    // 第一幕（新團到任前）：主線裡她自己勉強到九十／一百，也一定要有人來拉（EARLY_OVERLOAD）；其餘主線自己寫了失控
    const early = !v.flag_new_team_arrived && !v.act2_guiding_unlocked;
    if (inMain && !(early && T >= 90)) return;
    if (v['load_ev_' + T] === v.day) return;
    v['load_ev_' + T] = v.day;
    v.load_pending = Math.max(X.num(v.load_pending), T);
    if (!this.S.queue.some(q => q.id === 'LOAD_CHECK')) this.S.queue.unshift({ t: 'scene', id: 'LOAD_CHECK', force: true });
  }
  onNewDay(d) {
    const v = this.S.v;
    if (d <= X.num(v.last_drift_day)) return;
    v.last_drift_day = d;
    if (d >= 1) v.kael_met = true;
    if (Math.floor(d / 7) !== X.num(v.orion_wk_id)) { v.orion_wk_id = Math.floor(d / 7); v.orion_week = 0; } // 奧瑞恩：每週最多兩次
    for (const x of LEADS) if (this.met(x) || (x === 'kael' && d >= 1)) { if (SENTINELS.includes(x) && !X.num(v['cstage_' + x])) v['cstage_' + x] = 1; if (v['last_seen_' + x] === undefined) v['last_seen_' + x] = d; }
    if (d >= 2) {
      let up = v.act2_guiding_unlocked ? (isDayOff(d) ? 2 : 4) + Math.floor(X.num(v.act) / 2) : 1 + (v.pill_dependence ? 1 : 0); // 第一幕：停勤＋加量的抑制劑，每天只漲 1；吃過嚮導藥（pill_dependence）會反彈，每天 2。過載只會來自她自己勉強（推感官的選項）
      up -= Math.min(3, Math.floor(X.num(v.steady) / 10));
      if (LEADS.some(x => X.num(v['gstage_' + x]) >= 6 || X.num(v['cstage_' + x]) >= 6)) up -= 1;
      if (v.pill_day === d) up -= 3;
      if (up > 0) this.setLoad(X.num(v.load) + up, true);
      // 第一幕：休息日後勤嚮導例行梳理（不留羈絆，只把負荷壓回 40 左右）
      if (!v.act2_guiding_unlocked && isDayOff(d) && X.num(v.load) > 40) this.setLoad(Math.max(40, X.num(v.load) - 15), true);
    }
    v.steady = Math.max(0, X.num(v.steady) - 1);
    // 冷落
    v.neglect_who = ''; v.neglect_tier = 0;
    let best = '', bt = 0, ba = -1;
    for (const x of LEADS) {
      if (!this.met(x) || X.num(v['aff_' + x]) < 15) continue;
      if (x === 'kael' && v.kael_romance_lock) continue;
      if (v['seek_' + x]) {
        if (d - X.num(v['seek_day_' + x]) > 3) { v['seek_' + x] = false; v['aff_' + x] = Math.max(0, X.num(v['aff_' + x]) - 2); v['jealousy_' + x] = X.num(v['jealousy_' + x]) + 2; v['seek_missed_' + x] = X.num(v['seek_missed_' + x]) + 1; }
        continue;
      }
      const gap = d - X.num(v['last_seen_' + x]); const t = X.num(v['neglect_tier_' + x]);
      let tier = 0; if (gap > 18 && t === 1) tier = 2; else if (gap > 10 && t === 0) tier = 1;
      if (tier && X.num(v['aff_' + x]) > ba) { best = x; bt = tier; ba = X.num(v['aff_' + x]); }
    }
    if (best) { v.neglect_who = best; v.neglect_tier = bt; v['neglect_tier_' + best] = bt; }
  }
  dayCode(d, rest) {
    const v = this.S.v; const off = isDayOff(d);
    const guides = ['rowan', 'cecil', 'elio', 'orion'].some(x => v[x + '_met']) && !!v.act2_guiding_unlocked;
    const patrol = !off && this.getVar('week') >= 2 && [2, 4].includes(d % 7) && SENTINELS.some(x => this.met(x));
    const code = [];
    if (v.neglect_who) { const id = 'NEGLECT_' + v.neglect_who.toUpperCase() + '_' + v.neglect_tier; code.push(['call', this.D.scenes[id] ? id : 'NEGLECT_GENERIC']); }
    code.push(['call', 'LOAD_CHECK']);
    if (patrol && !rest) v.patrol_day = d;
    if (patrol && !rest) code.push(['call', 'PATROL']); else code.push(['cmd', 'freetime', off ? 'day_off' : 'noon', 0]);
    code.push(['call', 'LOAD_CHECK']);
    if (guides && !off) code.push(['call', 'GUIDE_DAILY']);
    code.push(['cmd', 'freetime', isDayOff(d + 1) ? 'day_off_eve' : 'night', 0]);
    code.push(['call', 'LOAD_CHECK']);
    code.push(['call', 'LAMP_RITUAL']);
    return code;
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
      const nd = dt.day !== v.day && dt.day > X.num(v.day);
      if (dt.day !== v.day) { if (weatherOf(dt.day) === 'rain') v.rain_day_count = X.num(v.rain_day_count) + 1; }
      v.day = dt.day;
      if (nd) this.onNewDay(dt.day);
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
    this.onNewDay(d);
    const act = X.num(v.act) || 1;
    const actZh = ['序章', '第一幕', '第二幕', '第三幕', '第四幕', '第五幕'][act] || '';
    const label = `${actZh}・W${Math.ceil(d / 7)}・Day ${d}${off ? '・休假日' : ''}`;
    const sid = this.synth([
      ['cmd', 'date', label, 0],
      ['cmd', 'bg', off ? 'bg_sea_wall_day fx=gray' : 'bg_briefing_room fx=gray', 0],
      ['cmd', '__daylabel', '', 0],
      ...(this.morningAfter(d) ? [['call', 'MORNING_AFTER']] : []),
      ...(off ? [] : [['call', 'BRIEFING_RANDOM']]),
      ...this.dayCode(d, false),
      ['end']
    ]);
    this.push(sid);
    return true;
  }
  // 第 3 批：第 8 階隔天早上，有人發現。原因輪替、發現的人＝她身邊最在意她的另一位男主
  morningAfter(d) {
    const v = this.S.v; const who = v.ma_who;
    if (!who || X.num(v.ma_day) !== d - 1) { if (who && X.num(v.ma_day) < d - 1) v.ma_who = ''; return false; }
    const by = LEADS.filter(x => x !== who && this.met(x) && !(x === 'kael' && v.kael_romance_lock))
      .sort((p, q) => X.num(v['aff_' + q]) - X.num(v['aff_' + p]))[0] || '';
    v.ma_x = who; v.ma_by = by; v.ma_cause = X.num(v.ma_count) % 6; v.ma_count = X.num(v.ma_count) + 1; v.ma_who = '';
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
      const qn = list.find(e => e.id === 'quad_night');
      if (qn) o0.push(opt('去疏導室，找他們三個', [['call', qn.id]], 'END'));
      for (const e of solo) if (e.id !== 'quad_night') o0.push(opt(this.optLabel(e), [['call', e.id]], 'R1', 'not seen_' + e.id));
      o0.push(opt(o0.length ? '（今晚，一個人點燈。）' : '（點燈。）', [['cmd', '__fallback', '1', 0]], 'END'));
      for (const e of solo.filter(x => x.id !== 'quad_night')) o1.push(opt(this.optLabel(e), [['call', e.id]], 'R2', 'not seen_' + e.id));
      o1.push(opt('（……夠了。今晚到這裡。）', [], 'END'));
      for (const e of solo.filter(x => x.id !== 'quad_night')) o2.push(opt(this.optLabel(e), [['call', e.id]], 'END', 'not seen_' + e.id));
      o2.push(opt('（……夠了。今晚到這裡。）', [], 'END'));
      labels.END = code.length; code.push(['end']);
      // R0 -> R1 -> R2 are sequential instructions; make each choice's natural fallthrough go to END
      for (const ins of code) if (ins[0] === 'goto' && typeof ins[1] === 'string') ins[1] = labels[ins[1]];
      for (const ins of choices) ins[3] = labels.END;
      if (!o1.length || solo.length < 2) { /* nothing */ }
      return this.push(this.synth(code));
    }
    if (['noon', 'night', 'day_off', 'day_off_eve'].includes(arg)) return this.placeFree(cands, times, arg);
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
  placeOf(e) {
    const s = e.s; let loc = (s.slotd && s.slotd.loc) || (/__loc\(\s*"?(\w+)/.exec(s.whenx || '') || [])[1] || LEAD_HOME[s.lead] || 'roam';
    return PLACE_KEY[loc] || loc;
  }
  placeFree(cands, times, arg) {
    const v = this.S.v; const night = times === NIGHT_T;
    const lastSeen = (x) => x ? X.num(v['last_seen_' + x]) : 1e9;
    const byLoc = new Map();
    const sorted = cands.slice().sort((a, b) => (b.s.prio - a.s.prio) || (lastSeen(a.s.lead) - lastSeen(b.s.lead)) || (Math.random() - 0.5));
    for (const e of sorted) { const L = this.placeOf(e); if (!byLoc.has(L)) byLoc.set(L, e); }
    const code = [null]; const opts = [];
    const add = (text, body, meta) => { const pc = code.length; code.push(...body); code.push(['goto', -1]); opts.push({ text, pc, meta: meta || null }); };
    // 劇情給了理由，才會出現「去找他」
    for (const x of LEADS) {
      if (!v['seek_' + x] || !this.met(x)) continue;
      const ev = cands.find(e => e.s.lead === x);
      if (ev) for (const [L, e] of byLoc) if (e === ev) byLoc.delete(L);
      add(`去找${NAMES[x]}`, [['set', 'seek_who', '=', '"' + x + '"'], ['call', 'SEEK_VISIT'], ...(ev ? [['call', ev.id]] : [])], { lead: x, ev: ev ? ev.id : null });
    }
    let places = [...byLoc.keys()].slice(0, 5);
    const pool = PLACE_POOL.filter(L => !places.includes(L) && (L !== 'chapel' || v.seen_S04) && (L !== 'old_port_bar' || v.seen_N01) && this.D.scenes['PLACE_' + L.toUpperCase()]);
    const want = Math.max(2, 5 - places.length);
    for (let i = 0; i < want && pool.length; i++) places.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    places.sort((p, q) => (PLACE_POOL.indexOf(p) < 0 ? 99 : PLACE_POOL.indexOf(p)) - (PLACE_POOL.indexOf(q) < 0 ? 99 : PLACE_POOL.indexOf(q)));
    for (const L of places) {
      const e = byLoc.get(L); const body = [['set', 'cur_loc', '=', '"' + L + '"']];
      if (L === 'sea_wall') body.push(['set', 'yasi_goes_seawall', '=', 'true']);
      const pid = 'PLACE_' + L.toUpperCase();
      body.push(['call', e ? e.id : (this.D.scenes[pid] ? pid : 'PLACE_GENERIC')]);
      add(PLACE_VERB[L] || ('去' + (LOC_NAME[L] || L)), body, { lead: e ? e.s.lead || null : null, ev: e ? e.id : null, place: L });
    }
    const apc = code.length; code.push(['call', night ? 'PLACE_REST_NIGHT' : 'PLACE_REST']); code.push(['goto', -1]);
    opts.push({ text: night ? '回房間，早點休息' : '回宿舍，一個人待著', pc: apc, meta: { rest: true } });
    const endPc = code.length; code.push(['end']);
    for (const ins of code) if (ins && ins[0] === 'goto') ins[1] = endPc;
    code[0] = ['choice', null, opts, endPc, 0, night ? '夜裡，要去哪裡？' : (arg === 'day_off' ? '休假日。要去哪裡？' : '空下來的時間，要去哪裡？')];
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
          const idx = await this.ui.choice(opts.map(o => ({ text: o.text, meta: o.meta || null })), ins[1], ins[5] || '');
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
          out.push({ text, pc: o.pc, bind: c, meta: o.meta || null });
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
    const prevLoad = X.num(this.S.v.load);
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
    if (name === 'load') {
      let n = X.num(this.S.v.load); this.S.v.load = prevLoad;
      if (op === '-=' && n < prevLoad && !this.inPurify()) { // 只有嚮導疏導能降 load；其他（戀愛、安撫、獨處）→ 穩定度
        this.S.v.steady = Math.min(30, X.num(this.S.v.steady) + Math.ceil((prevLoad - n) / 2)); n = prevLoad;
      }
      this.setLoad(n);
    }
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
        if (LEADS.includes(id) && S.stack.length && !(S.stack[0].s in this.mainIndex)) this.seenLead(id);
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
      case 'guide_stage': this.guideStage(a.trim() === 'quiet' || !!v.pair_event_played); break;
      case 'guide_watch': this.guideWatch(); break;
      case 'sentinel_presence': this.sentinelPresence(); break;
      case 'patrol_second': { const x = this.interpId(a.trim()); if (x) { this.seenLead(x); this.contactProgress(x, 1); } break; }
      case 'patrol_with': {
        const x = this.interpId(a.trim()); if (!x) break;
        v.mission_partner = x; v.mission_partner_day = v.day; v.fought_day = v.day;
        v['sload_' + x] = Math.min(100, X.num(v['sload_' + x]) + 20);
        v['aff_' + x] = Math.min(100, X.num(v['aff_' + x]) + 1);
        if (x === 'kael' && v.kael_romance_lock && v.aff_kael > 19) v.aff_kael = 19;
        this.seenLead(x);
        this.setLoad(X.num(v.load) + 6, true);
        this.contactProgress(x, 1);
        break;
      }
      case 'dayrest': { const sid = this.synth([...this.dayCode(v.day, true), ['end']]); this.push(sid); break; }
      case 'load_mark': v.load_pending = 0; break;
      case 'emergency_load': { this.setLoad(X.num(this.ev(a.trim())), true); break; }
      default:
        if (this.ui.fx) await this.ui.fx(c, this.interpText(a), S);
    }
    if (this.ui.present) this.ui.present(S, c);
  }
}
const api = { Engine, NAMES, LEADS, HIDDEN, GUIDES, SENTINELS, STAGE_T, HEART, COLOR_HEX, COLOR_NAME, LOC_NAME, weatherOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VEngine = api;
})(typeof self !== 'undefined' ? self : this);
