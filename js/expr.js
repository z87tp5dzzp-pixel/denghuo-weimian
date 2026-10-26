/* 《燈火未眠》 expression language: tokenizer, parser, evaluator. Works in browser and Node. */
(function (root) {
'use strict';
const LEADS = ['kael','rowan','cecil','elio','orion','ash','leo','silas','noa','vex','arno'];
const CHARS = LEADS.concat(['yasi','sophia','lily','marcus','julian','vaughn','evelyn','mora','hana','hannah','tobi','toby','darren','ben','tarin','trainee','extra']);
const COLORS = ['silver_gray','hearth_red','red_fire','red_blood','blue','green','purple','gold','orange','white','pink','black','brown','gray','red','rainbow','twelfth'];

function tokenize(s) {
  const toks = []; let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '"' || c === "'") {
      const j = s.indexOf(c, i + 1); const e = j < 0 ? n : j;
      toks.push({ t: 'str', v: s.slice(i + 1, e) }); i = e + 1; continue;
    }
    if (c === '「') {
      const j = s.indexOf('」', i + 1); const e = j < 0 ? n : j;
      toks.push({ t: 'str', v: s.slice(i + 1, e) }); i = e + 1; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i; while (j < n && /[0-9.]/.test(s[j])) j++;
      // identifier starting with digits? (not expected)
      toks.push({ t: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_{]/.test(c)) {
      // identifier with optional {expr} segments and seen_ hyphens
      const parts = []; let buf = ''; let j = i;
      while (j < n) {
        const d = s[j];
        if (/[A-Za-z0-9_]/.test(d)) { buf += d; j++; continue; }
        if (d === '{') {
          let depth = 1, k = j + 1;
          while (k < n && depth) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; k++; }
          if (buf) parts.push(buf); buf = '';
          parts.push({ sub: s.slice(j + 1, k - 1) }); j = k; continue;
        }
        if (d === '-' && j + 1 < n && /[A-Za-z0-9]/.test(s[j + 1]) && /^(seen_|has_)/.test((typeof parts[0] === 'string' ? parts[0] : '') + buf) && !/\s/.test(s[j - 1])) { buf += '_'; j++; continue; }
        break;
      }
      if (buf) parts.push(buf);
      if (parts.length === 1 && typeof parts[0] === 'string') {
        const w = parts[0];
        if (w === 'and' || w === 'or' || w === 'not' || w === 'in' || w === 'for' || w === 'if' || w === 'where') toks.push({ t: 'kw', v: w });
        else toks.push({ t: 'id', v: w });
      } else toks.push({ t: 'did', v: parts });
      i = j; continue;
    }
    const two = s.substr(i, 2);
    if (['==', '!=', '>=', '<=', '+=', '-='].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('<>+-*/%()[],.='.includes(c)) { toks.push({ t: 'op', v: c === '=' ? '==' : c }); i++; continue; }
    if (c === '！' || c === '!') { toks.push({ t: 'kw', v: 'not' }); i++; continue; }
    // unknown char: skip (e.g. full-width punctuation in stray text)
    i++;
  }
  return toks;
}

function Parser(toks) { this.t = toks; this.i = 0; }
Parser.prototype = {
  peek() { return this.t[this.i]; },
  is(t, v) { const k = this.t[this.i]; return k && k.t === t && (v === undefined || k.v === v); },
  eat(t, v) { if (this.is(t, v)) return this.t[this.i++]; return null; },
  need(t, v) { const k = this.eat(t, v); if (!k) throw new Error('expected ' + (v || t) + ' at ' + this.i); return k; },
  parse() { const e = this.or(); return e; },
  or() { let l = this.and(); while (this.eat('kw', 'or')) l = { k: 'or', l, r: this.and() }; return l; },
  and() { let l = this.not(); while (this.eat('kw', 'and')) l = { k: 'and', l, r: this.not() }; return l; },
  not() { if (this.eat('kw', 'not')) return { k: 'not', e: this.not() }; return this.cmp(); },
  cmp() {
    let l = this.add();
    for (;;) {
      const k = this.peek();
      if (!k) return l;
      if (k.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(k.v)) { this.i++; l = { k: 'cmp', op: k.v, l, r: this.add() }; continue; }
      if (k.t === 'kw' && k.v === 'in') { this.i++; l = { k: 'in', l, r: this.add() }; continue; }
      if (k.t === 'kw' && k.v === 'not' && this.t[this.i + 1] && this.t[this.i + 1].v === 'in') { this.i += 2; l = { k: 'not', e: { k: 'in', l, r: this.add() } }; continue; }
      return l;
    }
  },
  add() { let l = this.mul(); for (;;) { const k = this.peek(); if (k && k.t === 'op' && (k.v === '+' || k.v === '-')) { this.i++; l = { k: 'bin', op: k.v, l, r: this.mul() }; } else return l; } },
  mul() { let l = this.unary(); for (;;) { const k = this.peek(); if (k && k.t === 'op' && (k.v === '*' || k.v === '/' || k.v === '%')) { this.i++; l = { k: 'bin', op: k.v, l, r: this.unary() }; } else return l; } },
  unary() { if (this.eat('op', '-')) return { k: 'neg', e: this.unary() }; return this.post(); },
  post() {
    let e = this.prim();
    for (;;) {
      if (this.is('op', '(') && (e.k === 'id')) {
        this.i++;
        const args = [];
        // count(g in L where cond)
        if (e.v === 'count' && this.is('id') && this.t[this.i + 1] && this.t[this.i + 1].v === 'in') {
          const v = this.need('id').v; this.need('kw', 'in'); const L = this.add(); let c = { k: 'lit', v: true };
          if (this.eat('kw', 'where') || this.eat('kw', 'if')) c = this.or();
          this.need('op', ')');
          e = { k: 'call', f: 'len', args: [{ k: 'comp', v, L, c, e: { k: 'id', v } }] }; continue;
        }
        if (!this.is('op', ')')) { do { args.push(this.or()); } while (this.eat('op', ',')); }
        this.need('op', ')');
        e = { k: 'call', f: e.v, args }; continue;
      }
      if (this.is('op', '[')) { this.i++; const ix = this.or(); this.need('op', ']'); e = { k: 'index', e, ix }; continue; }
      return e;
    }
  },
  prim() {
    const k = this.peek();
    if (!k) throw new Error('unexpected end');
    this.i++;
    if (k.t === 'num') return { k: 'lit', v: k.v };
    if (k.t === 'str') return { k: 'lit', v: k.v };
    if (k.t === 'id') {
      if (k.v === 'true' || k.v === 'True') return { k: 'lit', v: true };
      if (k.v === 'false' || k.v === 'False') return { k: 'lit', v: false };
      if (k.v === 'none' || k.v === 'None' || k.v === 'null') return { k: 'lit', v: '' };
      return { k: 'id', v: k.v };
    }
    if (k.t === 'did') return { k: 'did', parts: k.v.map(p => typeof p === 'string' ? p : { e: parse(p.sub) }) };
    if (k.t === 'op' && k.v === '(') { const e = this.or(); this.need('op', ')'); return e; }
    if (k.t === 'op' && k.v === '[') {
      const items = [];
      if (this.eat('op', ']')) return { k: 'list', items };
      const first = this.or();
      if (this.eat('kw', 'for')) {
        const v = this.need('id').v; this.need('kw', 'in'); const L = this.add(); let c = { k: 'lit', v: true };
        if (this.eat('kw', 'if')) c = this.or();
        this.need('op', ']');
        return { k: 'comp', v, L, c, e: first };
      }
      items.push(first);
      while (this.eat('op', ',')) { if (this.is('op', ']')) break; items.push(this.or()); }
      this.need('op', ']');
      return { k: 'list', items };
    }
    throw new Error('unexpected token ' + JSON.stringify(k));
  }
};

const cache = new Map();
function parse(s) {
  let a = cache.get(s);
  if (a) return a;
  const p = new Parser(tokenize(s));
  a = p.parse();
  if (p.i < p.t.length) throw new Error('trailing tokens in: ' + s);
  cache.set(s, a);
  return a;
}

/* ctx: { get(name) -> value|undefined, fn(name,args) -> value, scopes: [] } */
function truthy(v) { if (Array.isArray(v)) return v.length > 0; return !!v; }
function num(v) { if (typeof v === 'number') return v; if (v === true) return 1; if (!v) return 0; const f = parseFloat(v); return isNaN(f) ? 0 : f; }

function identName(node, ctx) {
  if (node.k === 'id') return node.v;
  return node.parts.map(p => typeof p === 'string' ? p : String(ev(p.e, ctx))).join('');
}
function lookup(name, ctx) {
  for (let i = ctx.scopes.length - 1; i >= 0; i--) if (name in ctx.scopes[i]) return ctx.scopes[i][name];
  return ctx.get(name);
}
// value of a node where an undefined bare identifier that names a known id becomes that string
function ev(n, ctx) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'id': case 'did': {
      const name = identName(n, ctx);
      const v = lookup(name, ctx);
      if (v === undefined && ctx.isId(name)) return name;
      return v;
    }
    case 'list': return n.items.map(x => ev(x, ctx));
    case 'comp': {
      const L = ev(n.L, ctx); const out = [];
      if (!Array.isArray(L)) return out;
      for (const x of L) {
        ctx.scopes.push({ [n.v]: x });
        try { if (truthy(ev(n.c, ctx))) out.push(ev(n.e, ctx)); } finally { ctx.scopes.pop(); }
      }
      return out;
    }
    case 'or': return truthy(ev(n.l, ctx)) || truthy(ev(n.r, ctx));
    case 'and': return truthy(ev(n.l, ctx)) && truthy(ev(n.r, ctx));
    case 'not': return !truthy(ev(n.e, ctx));
    case 'neg': return -num(ev(n.e, ctx));
    case 'in': {
      const L = ev(n.r, ctx); let x = ev(n.l, ctx);
      if (x === undefined && (n.l.k === 'id')) x = n.l.v;
      if (Array.isArray(L)) return L.includes(x);
      if (typeof L === 'string') return L.includes(String(x));
      return false;
    }
    case 'cmp': {
      let a = ev(n.l, ctx), b = ev(n.r, ctx);
      if (n.op === '==' || n.op === '!=') {
        let eq;
        if (typeof a === 'string' || typeof b === 'string') {
          if (a === undefined || a === false || a === null) a = '';
          if (b === undefined || b === false || b === null) b = '';
          eq = String(a) === String(b);
        } else if (typeof a === 'boolean' || typeof b === 'boolean' || a === undefined || b === undefined) {
          eq = truthy(a) === truthy(b) && (typeof a !== 'number' || typeof b !== 'number' || a === b);
          if (typeof a === 'number' && typeof b !== 'number') eq = (a === 0) === !truthy(b) && (a === 0 || a === 1 || truthy(b));
          if (typeof b === 'number' && typeof a !== 'number') eq = (b === 0) === !truthy(a) && (b === 0 || b === 1 || truthy(a));
        } else if (Array.isArray(a) || Array.isArray(b)) {
          eq = JSON.stringify(a || []) === JSON.stringify(b || []);
        } else eq = a === b;
        return n.op === '==' ? eq : !eq;
      }
      const x = num(a), y = num(b);
      switch (n.op) { case '<': return x < y; case '>': return x > y; case '<=': return x <= y; case '>=': return x >= y; }
      return false;
    }
    case 'bin': {
      const a = ev(n.l, ctx), b = ev(n.r, ctx);
      if (n.op === '+') {
        if (Array.isArray(a)) return a.concat(Array.isArray(b) ? b : [b]);
        if (typeof a === 'string' || typeof b === 'string') return (a === undefined ? '' : String(a)) + (b === undefined ? '' : String(b));
        return num(a) + num(b);
      }
      if (n.op === '-') return num(a) - num(b);
      if (n.op === '*') return num(a) * num(b);
      if (n.op === '/') { const d = num(b); return d ? Math.floor(num(a) / d) : 0; }
      if (n.op === '%') { const d = num(b); return d ? num(a) % d : 0; }
      return 0;
    }
    case 'index': {
      const a = ev(n.e, ctx); const i = ev(n.ix, ctx);
      if (Array.isArray(a) || typeof a === 'string') { let k = num(i); if (k < 0) k += a.length; const r = a[k]; return r === undefined ? '' : r; }
      return '';
    }
    case 'call': {
      const args = n.args.map(a => { let v = ev(a, ctx); if (v === undefined && a.k === 'id') v = a.v; return v; });
      return ctx.fn(n.f, args, n.args);
    }
  }
  throw new Error('bad node ' + n.k);
}

function evaluate(s, ctx) { return ev(parse(s), ctx); }

const api = { tokenize, parse, evaluate, ev, truthy, num, LEADS, CHARS, COLORS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VExpr = api;
})(typeof self !== 'undefined' ? self : this);
