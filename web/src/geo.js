// Analytische Geometrie (NRW, Sek. II): Vektorrechnung, Eingabe-Parser und Rechenwege.
// Alle Rechnungen in Gleitkomma; die Ausgabe erkennt Brüche und Wurzeln und schreibt sie exakt (KaTeX).

export const EPS = 1e-9;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.sqrt(dot(a, a));
export const isZero = (a, e = 1e-9) => Math.abs(a[0]) < e && Math.abs(a[1]) < e && Math.abs(a[2]) < e;
export const collinear = (a, b) => len(cross(a, b)) < 1e-9 * Math.max(1, len(a) * len(b));
const near = (x, y, e = 1e-7) => Math.abs(x - y) < e * Math.max(1, Math.abs(x), Math.abs(y));
const deg = (r) => (r * 180) / Math.PI;

// ---------------------------------------------------------------- number formatting
function fracOf(x, maxDen = 2000) {
  if (!isFinite(x)) return null;
  const s = Math.sign(x) || 1;
  x = Math.abs(x);
  if (near(x, Math.round(x), 1e-9)) return { s, n: Math.round(x), d: 1 };
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
  for (let i = 0; i < 25; i++) {
    const a = Math.floor(b);
    [h1, h0] = [a * h1 + h0, h1];
    [k1, k0] = [a * k1 + k0, k1];
    if (k1 > maxDen) return null;
    if (Math.abs(x - h1 / k1) < 1e-9 * Math.max(1, x)) return { s, n: h1, d: k1 };
    b = 1 / (b - a);
    if (!isFinite(b)) break;
  }
  return null;
}
export function dec(x, d = 2) {
  const r = Number(x.toFixed(d));
  return (Object.is(r, -0) ? 0 : r).toLocaleString('de-DE', { maximumFractionDigits: d });
}
// plain text: 7/3, -2, 1,25
export function num(x) {
  const f = fracOf(x, 100);
  if (!f) return dec(x, 2);
  const sg = f.s < 0 && f.n !== 0 ? '−' : '';
  return f.d === 1 ? sg + f.n : `${sg}${f.n}/${f.d}`;
}
// TeX number (fraction if small denominator, otherwise decimal with comma)
export function tex(x, { sign = false } = {}) {
  const f = fracOf(x, 100);
  let s;
  if (!f) s = dec(x, 3).replace(',', '{,}');
  else if (f.d === 1) s = String(f.s * f.n);
  else s = `${f.s < 0 ? '-' : ''}\\tfrac{${f.n}}{${f.d}}`;
  if (s === '-0') s = '0';
  if (sign && !s.startsWith('-')) s = '+' + s;
  return s;
}
// TeX for √(x2) where x2 is the square of the value: 3\sqrt{2}, \tfrac{\sqrt{14}}{2}, ≈ in brackets
export function texSqrt(x2, approx = true) {
  if (x2 < 0) x2 = 0;
  const v = Math.sqrt(x2);
  const f = fracOf(x2, 400);
  if (near(v, Math.round(v), 1e-9)) return String(Math.round(v));
  if (f) {
    // √(n/d) = √(n·d)/d, pull square factors out
    let rad = f.n * f.d, out = 1;
    for (let k = 2; k * k <= rad; k++) while (rad % (k * k) === 0) { rad /= k * k; out *= k; }
    if (rad === 1) return tex(v);
    const g = gcd(out, f.d);
    const o = out / g, den = f.d / g;
    if (rad < 100000) {
      let s = (o === 1 ? '' : o) + `\\sqrt{${rad}}`;
      if (den !== 1) s = `\\tfrac{${o === 1 ? '' : o}\\sqrt{${rad}}}{${den}}`;
      return approx ? `${s} \\approx ${dec(v, 2).replace(',', '{,}')}` : s;
    }
  }
  return dec(v, 3).replace(',', '{,}');
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
export const texVec = (v) => `\\begin{pmatrix}${v.map((x) => tex(x)).join('\\\\')}\\end{pmatrix}`;
export const texPt = (name, p) => `${name}(${p.map((x) => tex(x)).join('\\,|\\,')})`;
export const ptText = (name, p) => `${name}(${p.map(num).join(' | ')})`;
const texAngle = (a) => `${dec(a, 2).replace(',', '{,}')}^\\circ`;

// scale a vector to the smallest integer multiple if it is rational (for nicer normal / direction vectors)
export function niceInt(v) {
  const fr = v.map((x) => fracOf(x, 60));
  if (fr.some((f) => !f)) return v.slice();
  let L = 1;
  for (const f of fr) L = (L * f.d) / gcd(L, f.d);
  let w = v.map((x) => Math.round(x * L));
  let g = 0;
  for (const x of w) g = gcd(g, x);
  if (g > 1) w = w.map((x) => x / g);
  // first non-zero entry positive is not required; keep orientation
  return w;
}

// ---------------------------------------------------------------- parser (affine expressions)
// A value is { c: number | vec3, t: Map(param -> number | vec3) } — linear in the parameters.
const isVec = (x) => Array.isArray(x);
const zeroLike = (x) => (isVec(x) ? [0, 0, 0] : 0);
const A_const = (c) => ({ c, t: new Map() });
const A_param = (name, unit = 1) => ({ c: zeroLike(unit), t: new Map([[name, unit]]) });
const vAdd = (a, b) => (isVec(a) ? add(a, b) : a + b);
const vScale = (a, k) => (isVec(a) ? mul(a, k) : a * k);
function aAdd(a, b, sgn = 1) {
  if (isVec(a.c) !== isVec(b.c)) throw new Error('Zahl und Vektor können nicht addiert werden');
  const t = new Map(a.t);
  for (const [k, v] of b.t) t.set(k, t.has(k) ? vAdd(t.get(k), vScale(v, sgn)) : vScale(v, sgn));
  return { c: vAdd(a.c, vScale(b.c, sgn)), t };
}
const isConst = (a) => [...a.t.values()].every((v) => (isVec(v) ? isZero(v) : Math.abs(v) < EPS));
function aMul(a, b) {
  if (!isConst(a) && !isConst(b)) throw new Error('Produkt zweier Parameter ist nicht linear');
  if (!isConst(a)) [a, b] = [b, a];
  const k = a.c;                      // constant factor (number or vector)
  const f = (v) => {
    if (!isVec(k)) return vScale(v, k);
    if (!isVec(v)) return mul(k, v);  // vector · scalar term
    return dot(k, v);                 // dot product
  };
  const t = new Map();
  for (const [n, v] of b.t) t.set(n, f(v));
  return { c: f(b.c), t };
}

const COORD = { x1: [1, 0, 0], x2: [0, 1, 0], x3: [0, 0, 1], x: null, y: null, z: null };
// German input: decimal commas are allowed inside (a|b|c) groups and in equations without brackets
export function normalizeInput(s) {
  s = s.replace(/[·⋅∙]/g, '*').replace(/[×]/g, '*').replace(/[−–]/g, '-').replace(/[₁¹]/g, '1').replace(/[₂²]/g, '2').replace(/[₃³]/g, '3');
  s = s.replace(/x_([123])/g, 'x$1').replace(/\\vec\{x\}/g, 'x');
  s = s.replace(/[\(\[]([^()\[\]]*)[\)\]]/g, (m, inner) => (/[|;]/.test(inner) ? m[0] + inner.replace(/(\d),(\d)/g, '$1.$2') + m[m.length - 1] : m));
  if (!/[(\[]/.test(s)) s = s.replace(/(\d),(\d)/g, '$1.$2');
  return s;
}
function tokenize(s) {
  s = s.replace(/\s+/g, ' ').trim();
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    const m = /^(\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (m) {
      out.push({ k: 'num', v: m[1] });
      i += m[1].length;
      continue;
    }
    const id = /^([A-Za-zÄÖÜäöüλμ][A-Za-z0-9_'’]*)/.exec(s.slice(i));
    if (id) { out.push({ k: 'id', v: id[1].replace('’', "'") }); i += id[1].length; continue; }
    if ('+-*/()[]|;,=:^'.includes(c)) { out.push({ k: c }); i++; continue; }
    throw new Error(`Unbekanntes Zeichen „${c}“`);
  }
  return out;
}

class Parser {
  constructor(tokens, ctx) {
    this.T = tokens; this.i = 0; this.ctx = ctx; this.params = new Set();
  }
  peek(k) { const t = this.T[this.i]; return t && (k === undefined || t.k === k) ? t : null; }
  eat(k) { const t = this.peek(k); if (!t) throw new Error(k ? `„${k}“ erwartet` : 'Ausdruck unvollständig'); this.i++; return t; }
  expr() {
    let a = this.term();
    while (this.peek('+') || this.peek('-')) {
      const op = this.T[this.i++].k;
      a = aAdd(a, this.term(), op === '+' ? 1 : -1);
    }
    return a;
  }
  term() {
    let a = this.unary();
    for (;;) {
      if (this.peek('*')) { this.i++; a = aMul(a, this.unary()); continue; }
      if (this.peek('/')) {
        this.i++;
        const b = this.unary();
        if (!isConst(b) || isVec(b.c)) throw new Error('Division nur durch Zahlen');
        a = aMul(a, A_const(1 / b.c));
        continue;
      }
      // implicit multiplication: 2x1, 3t, t(1|0|2), 2(1,2,3)
      const t = this.peek();
      if (t && (t.k === 'num' || t.k === 'id' || t.k === '(' || t.k === '[')) { a = aMul(a, this.unary()); continue; }
      return a;
    }
  }
  unary() {
    if (this.peek('-')) { this.i++; return aMul(A_const(-1), this.unary()); }
    if (this.peek('+')) { this.i++; return this.unary(); }
    return this.power();
  }
  power() {
    const a = this.factor();
    if (this.peek('^')) {
      this.i++;
      const e = this.factor();
      if (!isConst(a) || !isConst(e) || isVec(a.c) || isVec(e.c)) throw new Error('Potenz nur für Zahlen');
      return A_const(Math.pow(a.c, e.c));
    }
    return a;
  }
  factor() {
    const t = this.peek();
    if (!t) throw new Error('Ausdruck unvollständig');
    if (t.k === 'num') { this.i++; return A_const(parseFloat(t.v.replace(',', '.'))); }
    if (t.k === '(' || t.k === '[') return this.group();
    if (t.k === 'id') return this.ident();
    throw new Error(`Unerwartet: „${t.k}“`);
  }
  group() {
    const open = this.eat().k, close = open === '(' ? ')' : ']';
    const parts = [this.expr()];
    let sep = null;
    while (this.peek('|') || this.peek(';') || this.peek(',')) {
      sep = this.T[this.i++].k;
      parts.push(this.expr());
    }
    this.eat(close);
    if (parts.length === 1) return parts[0];
    if (parts.length !== 3) throw new Error('Vektoren und Punkte haben drei Koordinaten');
    // combine three scalar affine parts into one vector affine value
    const c = parts.map((p) => {
      if (isVec(p.c)) throw new Error('Koordinate muss eine Zahl sein');
      return p.c;
    });
    const tmap = new Map();
    parts.forEach((p, k) => {
      for (const [n, v] of p.t) {
        const w = tmap.get(n) || [0, 0, 0];
        w[k] += v;
        tmap.set(n, w);
      }
    });
    return { c, t: tmap };
  }
  ident() {
    const name = this.eat('id').v;
    const ctx = this.ctx;
    // function call
    if (this.peek('(') && FUNCS[name.toLowerCase()]) {
      this.eat('(');
      const args = [];
      if (!this.peek(')')) {
        args.push(this.argument());
        while (this.peek(',') || this.peek(';')) { this.i++; args.push(this.argument()); }
      }
      this.eat(')');
      return FUNCS[name.toLowerCase()](args, ctx);
    }
    const obj = ctx.get(name);
    if (obj) {
      if (obj.type === 'point') return A_const(obj.p.slice());
      if (obj.type === 'vector') return A_const(obj.v.slice());
      throw new Error(`${name} ist eine ${obj.type === 'line' ? 'Gerade' : 'Ebene'} – hier ist ein Punkt oder Vektor gemeint`);
    }
    if (name in COORD) {
      if (name === 'x' && this.allowX) return { c: [0, 0, 0], t: new Map([['x1', [1, 0, 0]], ['x2', [0, 1, 0]], ['x3', [0, 0, 1]]]) };
      const map = { x: 'x1', y: 'x2', z: 'x3' };
      return A_param(map[name] || name, 1);
    }
    if (name === 'X') return { c: [0, 0, 0], t: new Map([['x1', [1, 0, 0]], ['x2', [0, 1, 0]], ['x3', [0, 0, 1]]]) };
    // two existing points written as AB → vector from A to B
    if (/^[A-Z]'?[A-Z]'?$/.test(name)) {
      const m = /^([A-Z]'?)([A-Z]'?)$/.exec(name);
      const P = ctx.get(m[1]), Q = ctx.get(m[2]);
      if (P && Q && P.type === 'point' && Q.type === 'point') return A_const(sub(Q.p, P.p));
    }
    if (/^[a-zλμ]$/.test(name)) { this.params.add(name); return A_param(name, 1); }
    throw new Error(`„${name}“ ist nicht definiert`);
  }
  // function arguments may also be lines/planes (names)
  argument() {
    const t = this.peek('id');
    if (t && this.T[this.i + 1] && [',', ';', ')'].includes(this.T[this.i + 1].k)) {
      const obj = this.ctx.get(t.v);
      if (obj) { this.i++; return { obj }; }
    }
    return { val: this.expr() };
  }
}

const argPoint = (a, what = 'Punkt') => {
  if (a.obj) {
    if (a.obj.type === 'point') return a.obj.p;
    throw new Error(`${a.obj.name} ist kein ${what}`);
  }
  if (!isConst(a.val) || !isVec(a.val.c)) throw new Error(`${what} erwartet`);
  return a.val.c;
};
const FUNCS = {
  mittelpunkt: (args) => {
    if (args.length !== 2) throw new Error('Mittelpunkt(A, B)');
    const [P, Q] = args.map((a) => argPoint(a));
    return A_const(mul(add(P, Q), 0.5));
  },
  // Gerade(A, B) and Ebene(A, B, C) are handled at statement level; inside expressions they are errors
};

// ---------------------------------------------------------------- objects
export const TYPE_DE = { point: 'Punkt', vector: 'Vektor', line: 'Gerade', plane: 'Ebene' };

export function makePoint(name, p) { return { type: 'point', name, p }; }
export function makeVector(name, v, from = null) { return { type: 'vector', name, v, from }; }
export function makeLine(name, p, u, param = 't') {
  if (isZero(u)) throw new Error('Der Richtungsvektor darf nicht der Nullvektor sein');
  return { type: 'line', name, p, u, param };
}
export function makePlaneParam(name, p, u, v, params = ['r', 's']) {
  if (collinear(u, v)) throw new Error('Die Spannvektoren sind kollinear – das ist keine Ebene');
  const n = niceInt(cross(u, v));
  return { type: 'plane', name, p, u, v, n, d: dot(n, p), params, from: 'param' };
}
export function makePlaneCoord(name, n, d) {
  if (isZero(n)) throw new Error('Kein Normalenvektor – die Gleichung beschreibt keine Ebene');
  // clear fractions: 2,5x1 = 5  →  5x1 = 10
  const fr = [...n, d].map((x) => fracOf(x, 60));
  if (fr.every(Boolean)) {
    let L = 1;
    for (const f of fr) L = (L * f.d) / gcd(L, f.d);
    if (L > 1) { n = mul(n, L); d *= L; }
  }
  // nice support point: an intercept with an axis if possible
  let p = null;
  for (let k = 2; k >= 0; k--) {
    if (Math.abs(n[k]) > EPS) {
      const q = [0, 0, 0];
      q[k] = d / n[k];
      if (fracOf(q[k], 12)) { p = q; break; }
      if (!p) p = q;
    }
  }
  const [a, b, c] = n;
  const cands = [[b, -a, 0], [c, 0, -a], [0, c, -b]].filter((w) => !isZero(w)).map(niceInt);
  let u = cands[0], v = cands.find((w) => !collinear(w, u));
  return { type: 'plane', name, p, u, v, n: n.slice(), d, params: ['r', 's'], from: 'coord' };
}
export function makePlane3(name, A, B, C) {
  const u = sub(B, A), v = sub(C, A);
  if (collinear(u, v)) throw new Error('Die drei Punkte liegen auf einer Geraden');
  return makePlaneParam(name, A.slice(), u, v);
}

// statement → object description (or throws with a readable German message)
export function parseStatement(src, ctx) {
  let s = normalizeInput(src.trim());
  if (!s) throw new Error('Leere Eingabe');
  // A(1|2|3)   (point shorthand)
  let m = /^([A-Z][A-Za-z0-9_']*)\s*\((.*)\)$/.exec(s);
  if (m && !FUNC_NAME.test(m[1]) && (m[2].includes('|') || m[2].split(/[,;]/).length === 3)) {
    const P = new Parser(tokenize('(' + m[2] + ')'), ctx);
    const v = P.expr();
    if (!isConst(v) || !isVec(v.c)) throw new Error('Punkt braucht drei Zahlen, z. B. A(1|2|3)');
    return makePoint(m[1], v.c);
  }
  // name: ...   or name = ...
  m = /^([A-Za-z][A-Za-z0-9_']*)\s*(:|=)\s*(.+)$/.exec(s);
  if (!m) throw new Error('Format: Name = … oder Name: …   (z. B. g: x = (1|0|2) + t·(1|1|0))');
  const name = m[1];
  let rest = m[3].trim();
  if (ctx.get(name) && !ctx.allowReplace) throw new Error(`Der Name ${name} ist schon vergeben`);
  // constructors
  const fn = /^(Gerade|Ebene|Mittelpunkt)\s*\((.*)\)$/i.exec(rest);
  if (fn) {
    const P = new Parser(tokenize(fn[2]), ctx);
    const args = [];
    if (P.peek()) {
      args.push(P.argument());
      while (P.peek(',') || P.peek(';')) { P.i++; args.push(P.argument()); }
    }
    if (P.peek()) throw new Error('Zu viele Zeichen in der Klammer');
    const f = fn[1].toLowerCase();
    if (f === 'gerade') {
      if (args.length !== 2) throw new Error('Gerade(A, B) braucht zwei Punkte');
      const [A, B] = args.map((a) => argPoint(a));
      return { ...makeLine(name, A, sub(B, A)), how: 'zwei Punkte' };
    }
    if (f === 'ebene') {
      if (args.length !== 3) throw new Error('Ebene(A, B, C) braucht drei Punkte');
      const [A, B, C] = args.map((a) => argPoint(a));
      return { ...makePlane3(name, A, B, C), how: 'drei Punkte' };
    }
    if (f === 'mittelpunkt') {
      const v = FUNCS.mittelpunkt(args, ctx);
      return makePoint(name, v.c);
    }
  }
  // equation?   x = …   |   2x1 + … = …   |   (x - P)*n = 0
  if (rest.includes('=')) {
    const [lhs, rhs] = rest.split('=');
    // "x" is the position vector in x = … and (x − p)·n = 0, but the first coordinate in "x + y + z = 1"
    const coordStyle = /\b(y|z|x[123])\b/.test(rest);
    const L = new Parser(tokenize(lhs), ctx);
    L.allowX = !coordStyle;
    const R = new Parser(tokenize(rhs), ctx);
    R.allowX = !coordStyle;
    const lv = L.expr();
    if (L.peek()) throw new Error(`Unerwartet: „${L.peek().k === 'id' ? L.peek().v : L.peek().k}“`);
    const rv = R.expr();
    if (R.peek()) throw new Error(`Unerwartet: „${R.peek().k === 'id' ? R.peek().v : R.peek().k}“`);
    const params = [...new Set([...L.params, ...R.params])];
    const lhsIsX = /^\s*(x|X|\\vec\{x\}|x⃗)\s*$/.test(lhs);
    if (lhsIsX) {
      // parametric form: x = p + t*u (+ s*v)
      if (!isVec(rv.c)) throw new Error('Rechts muss ein Vektor stehen');
      const ps = [...rv.t.keys()].filter((k) => !/^x[123]$/.test(k));
      if ([...rv.t.keys()].some((k) => /^x[123]$/.test(k))) throw new Error('x darf rechts nicht vorkommen');
      if (ps.length === 1) return makeLine(name, rv.c, rv.t.get(ps[0]), ps[0]);
      if (ps.length === 2) return makePlaneParam(name, rv.c, rv.t.get(ps[0]), rv.t.get(ps[1]), ps);
      if (ps.length === 0) return makePoint(name.toUpperCase() === name ? name : name, rv.c);
      throw new Error('Zu viele Parameter');
    }
    // coordinate / normal form: linear equation in x1, x2, x3
    if (isVec(lv.c) || isVec(rv.c)) throw new Error('Gleichung einer Ebene: z. B. 2x1 − x2 + 3x3 = 6');
    const diff = aAdd(lv, rv, -1);
    const n = [0, 0, 0];
    for (const [k, v] of diff.t) {
      const idx = { x1: 0, x2: 1, x3: 2 }[k];
      if (idx === undefined) throw new Error(`Unbekannte Variable „${k}“ – erlaubt sind x1, x2, x3`);
      n[idx] += v;
    }
    const obj = makePlaneCoord(name, n, -diff.c);
    if (params.length) throw new Error('In der Koordinatenform kommen keine Parameter vor');
    if (/\(\s*(x|X)\s*-/.test(lhs)) obj.from = 'normal';
    return obj;
  }
  // plain value: point (uppercase) or vector (lowercase)
  const P = new Parser(tokenize(rest), ctx);
  const v = P.expr();
  if (P.peek()) throw new Error('Unerwartete Zeichen am Ende');
  if (!isConst(v) || !isVec(v.c)) throw new Error('Erwartet wird ein Punkt oder Vektor mit drei Koordinaten');
  if (/^[A-Z]/.test(name)) return makePoint(name, v.c);
  // remember the start point if written as AB or B - A
  const ab = /^([A-Z]'?)([A-Z]'?)$/.exec(rest) || /^([A-Z]'?)\s*-\s*([A-Z]'?)$/.exec(rest);
  let from = null;
  if (ab) {
    const first = /-/.test(rest) ? ctx.get(ab[2]) : ctx.get(ab[1]);
    if (first && first.type === 'point') from = first.p.slice();
  }
  return makeVector(name, v.c, from);
}
const FUNC_NAME = /^(Gerade|Ebene|Mittelpunkt)$/i;

// ---------------------------------------------------------------- formatting of objects
export function formsOf(o) {
  if (o.type === 'point') return { short: ptText(o.name, o.p), tex: texPt(o.name, o.p) };
  if (o.type === 'vector') return { short: `${o.name} = (${o.v.map(num).join(' | ')})`, tex: `\\vec{${o.name}} = ${texVec(o.v)}` };
  if (o.type === 'line') return { short: `${o.name}: x = (${o.p.map(num).join('|')}) + ${o.param}·(${o.u.map(num).join('|')})`, tex: lineTex(o) };
  if (o.type === 'plane') return { short: `${o.name}: ${coordText(o.n, o.d)}`, tex: `${o.name}:\\ ${coordTex(o.n, o.d)}` };
  return { short: o.name, tex: o.name };
}
export const lineTex = (o) => `${o.name}:\\ \\vec{x} = ${texVec(o.p)} + ${o.param}\\cdot ${texVec(o.u)}`;
export const paramTex = (o) => `${o.name}:\\ \\vec{x} = ${texVec(o.p)} + ${o.params[0]}\\cdot ${texVec(o.u)} + ${o.params[1]}\\cdot ${texVec(o.v)}`;
export function coordTex(n, d) {
  let s = '';
  n.forEach((a, k) => {
    if (Math.abs(a) < EPS) return;
    const c = Math.abs(a) === 1 ? (a < 0 ? '-' : '+') : tex(a, { sign: true });
    s += `${c}x_${k + 1}`;
  });
  s = s.replace(/^\+/, '');
  return `${s} = ${tex(d)}`;
}
export function coordText(n, d) {
  let s = '';
  n.forEach((a, k) => {
    if (Math.abs(a) < EPS) return;
    const c = Math.abs(a) === 1 ? (a < 0 ? ' − ' : ' + ') : (a < 0 ? ' − ' : ' + ') + num(Math.abs(a));
    s += `${c}x${'₁₂₃'[k]}`;
  });
  return `${s.replace(/^ \+ /, '').replace(/^ − /, '−')} = ${num(d)}`;
}
const normTex = (o) => `${o.name}:\\ \\left[\\vec{x} - ${texVec(o.p)}\\right]\\cdot ${texVec(o.n)} = 0`;

// ---------------------------------------------------------------- analyses
// Each analysis returns { title, kicker, blocks: [{ h, tex: [..], p }], facts: [[k, v]], draw: [...] }
// draw items: {k:'pt', p, label, c} {k:'seg', a, b, dashed, c} {k:'angle', at, d1, d2, label} {k:'right', at, d1, d2}
// {k:'line', p, u, c} {k:'vec', a, v, c} {k:'path', p} (Koordinatenweg)

const AX = ['x_1', 'x_2', 'x_3'];
const AXT = ['x₁', 'x₂', 'x₃'];

export function analyzeOne(o) {
  if (o.type === 'point') return anPoint(o);
  if (o.type === 'vector') return anVector(o);
  if (o.type === 'line') return anLine(o);
  if (o.type === 'plane') return anPlane(o);
  return null;
}

function anPoint(o) {
  const p = o.p;
  const r2 = dot(p, p);
  const zeros = p.map((x) => Math.abs(x) < EPS);
  let lage;
  const nz = zeros.filter(Boolean).length;
  if (nz === 3) lage = 'Ursprung';
  else if (nz === 2) lage = `auf der ${AXT[zeros.indexOf(false)]}-Achse`;
  else if (nz === 1) lage = `in der ${AXT.filter((_, k) => !zeros[k]).join('')}-Ebene`;
  else lage = `im ${octant(p)}. Oktanten`;
  return {
    title: `Punkt ${o.name}`,
    kicker: 'Punkt · Ortsvektor',
    blocks: [
      { h: 'Ortsvektor', tex: [`\\vec{O${o.name}} = ${texVec(p)}`] },
      { h: 'Abstand vom Ursprung', tex: [`|\\vec{O${o.name}}| = \\sqrt{${p.map((x) => `(${tex(x)})^2`).join('+')}} = \\sqrt{${tex(r2)}} = ${texSqrt(r2)}`] },
      { h: 'So zeichnet man ihn ins Schrägbild', p: `Vom Ursprung ${num(p[0])} Einheiten in x₁-Richtung, dann ${num(p[1])} in x₂-Richtung, dann ${num(p[2])} nach oben (x₃). Der gestrichelte Weg zeigt das.` },
    ],
    facts: [['Koordinaten', ptText(o.name, p)], ['Lage', lage], ['Abstand zu O', texSqrtPlain(r2)]],
    draw: [{ k: 'path', p }],
  };
}
function octant(p) {
  const s = p.map((x) => x > 0);
  const table = { 'true,true,true': 1, 'false,true,true': 2, 'false,false,true': 3, 'true,false,true': 4, 'true,true,false': 5, 'false,true,false': 6, 'false,false,false': 7, 'true,false,false': 8 };
  return table[s.join(',')];
}
const texSqrtPlain = (x2) => {
  const v = Math.sqrt(Math.max(0, x2));
  const f = fracOf(x2, 400);
  if (near(v, Math.round(v), 1e-9)) return String(Math.round(v));
  return `≈ ${dec(v, 2)}${f && f.d === 1 ? ` (√${f.n})` : ''}`;
};

function anVector(o) {
  const v = o.v, L2 = dot(v, v);
  const blocks = [
    { h: 'Betrag (Länge)', tex: [`|\\vec{${o.name}}| = \\sqrt{${v.map((x) => `(${tex(x)})^2`).join('+')}} = \\sqrt{${tex(L2)}} = ${texSqrt(L2)}`] },
  ];
  if (L2 > EPS) blocks.push({ h: 'Einheitsvektor', tex: [`\\vec{${o.name}}_0 = \\frac{1}{${texSqrt(L2, false)}}\\cdot ${texVec(v)}`] });
  const ang = [0, 1, 2].map((k) => deg(Math.acos(v[k] / Math.sqrt(L2 || 1))));
  return {
    title: `Vektor ${o.name}`,
    kicker: o.from ? `Verbindungsvektor ab ${ptText('', o.from).slice(0)}` : 'Vektor · als Pfeil vom Ursprung',
    blocks,
    facts: [['Koordinaten', `(${v.map(num).join(' | ')})`], ['Länge', texSqrtPlain(L2)], ['Winkel zu x₁, x₂, x₃', ang.map((a) => dec(a, 1) + '°').join(', ')]],
    draw: [],
  };
}

function tracesOfLine(o) {
  // intersections with the coordinate planes x_k = 0
  const out = [];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(o.u[k]) < EPS) continue;
    const t = -o.p[k] / o.u[k];
    out.push({ k, t, P: add(o.p, mul(o.u, t)) });
  }
  return out;
}
function anLine(o) {
  const tr = tracesOfLine(o);
  const planeName = ['x_2x_3', 'x_1x_3', 'x_1x_2'];
  const blocks = [
    { h: 'Parameterform', tex: [lineTex(o)], p: `Stützvektor = Ortsvektor eines Punktes der Geraden, Richtungsvektor = Richtung. Für jedes ${o.param} erhält man einen Punkt – probier den Regler unten.` },
  ];
  if (tr.length) {
    blocks.push({
      h: 'Spurpunkte (Schnitt mit den Koordinatenebenen)',
      tex: tr.map(({ k, t, P }) => `${planeName[k]}\\text{-Ebene: } ${tex(o.p[k])} ${tex(o.u[k], { sign: true })}${o.param} = 0 \\Rightarrow ${o.param} = ${tex(t)} \\Rightarrow S_{${k + 1}}(${P.map((x) => tex(x)).join('|')})`),
    });
  }
  const par = [0, 1, 2].filter((k) => Math.abs(o.u[k]) < EPS);
  const facts = [['Stützpunkt', ptText('', o.p)], ['Richtung', `(${o.u.map(num).join(' | ')})`]];
  if (par.length === 2) facts.push(['Besonderheit', `parallel zur ${AXT[[0, 1, 2].find((k) => !par.includes(k))]}-Achse`]);
  else if (par.length === 1) facts.push(['Besonderheit', `parallel zur ${AXT.filter((_, k) => k !== par[0]).join('')}-Ebene`]);
  return {
    title: `Gerade ${o.name}`,
    kicker: o.how ? `Gerade durch ${o.how}` : 'Gerade · Parameterform',
    blocks,
    facts,
    draw: tr.map(({ k, P }) => ({ k: 'pt', p: P, label: `S${'₁₂₃'[k]}`, c: '#ffffff', small: true })),
  };
}

export function interceptsOfPlane(o) {
  return [0, 1, 2].map((k) => (Math.abs(o.n[k]) < EPS ? null : (() => { const P = [0, 0, 0]; P[k] = o.d / o.n[k]; return P; })()));
}
function anPlane(o) {
  const { n, d, p, u, v } = o;
  const blocks = [];
  const c = cross(u, v);
  if (o.from !== 'coord') {
    blocks.push({ h: 'Parameterform', tex: [paramTex(o)] });
    blocks.push({
      h: 'Normalenvektor mit dem Kreuzprodukt',
      tex: [
        `\\vec{u}\\times\\vec{v} = ${texVec(u)}\\times${texVec(v)} = \\begin{pmatrix}${tex(u[1])}\\cdot${paren(v[2])} - ${paren(u[2])}\\cdot${paren(v[1])}\\\\${tex(u[2])}\\cdot${paren(v[0])} - ${paren(u[0])}\\cdot${paren(v[2])}\\\\${tex(u[0])}\\cdot${paren(v[1])} - ${paren(u[1])}\\cdot${paren(v[0])}\\end{pmatrix} = ${texVec(c)}`,
        ...(collinear(c, n) && !near(len(c), len(n)) ? [`\\text{gekürzt: } \\vec{n} = ${texVec(n)}`] : []),
      ],
      p: 'Der Normalenvektor steht senkrecht auf beiden Spannvektoren (Probe: Skalarprodukt = 0).',
    });
    blocks.push({ h: 'Normalenform', tex: [normTex(o)] });
    blocks.push({ h: 'Koordinatenform', tex: [`${tex(n[0])}x_1 ${tex(n[1], { sign: true })}x_2 ${tex(n[2], { sign: true })}x_3 = \\vec{n}\\cdot\\vec{p} = ${tex(d)}`, `${o.name}:\\ ${coordTex(n, d)}`] });
  } else {
    blocks.push({ h: 'Koordinatenform', tex: [`${o.name}:\\ ${coordTex(n, d)}`], p: `Die Koeffizienten bilden den Normalenvektor n = (${n.map(num).join(' | ')}).` });
    blocks.push({ h: 'Normalenform', tex: [normTex(o)], p: 'Stützpunkt: ein Punkt, der die Gleichung erfüllt.' });
    blocks.push({ h: 'Parameterform', tex: [paramTex(o)], p: 'Spannvektoren: zwei Vektoren, die zum Normalenvektor orthogonal sind (Skalarprodukt 0).' });
  }
  const n2 = dot(n, n);
  blocks.push({ h: 'Hessesche Normalform', tex: [`${o.name}:\\ \\frac{${coordTex(n, d).replace(' = ', ' - ')}}{${texSqrt(n2, false)}} = 0`] });
  const S = interceptsOfPlane(o);
  const sp = S.map((P, k) => (P ? `S_{${k + 1}}(${P.map((x) => tex(x)).join('|')})` : `\\text{kein Spurpunkt auf der } x_{${k + 1}}\\text{-Achse}`));
  blocks.push({ h: 'Spurpunkte (Schnitt mit den Achsen)', tex: sp, p: 'Die Verbindungsstrecken der Spurpunkte sind die Spurgeraden – damit zeichnet man die Ebene ins Schrägbild.' });
  if (Math.abs(d) > EPS && S.every(Boolean)) blocks.push({ h: 'Achsenabschnittsform', tex: [`\\frac{x_1}{${tex(S[0][0])}} + \\frac{x_2}{${tex(S[1][1])}} + \\frac{x_3}{${tex(S[2][2])}} = 1`] });
  const dist2 = (d * d) / n2;
  return {
    title: `Ebene ${o.name}`,
    kicker: o.how ? `Ebene durch ${o.how}` : { coord: 'Ebene · Koordinatenform', param: 'Ebene · Parameterform', normal: 'Ebene · Normalenform' }[o.from] || 'Ebene',
    blocks,
    facts: [
      ['Normalenvektor', `(${n.map(num).join(' | ')})`],
      ['Abstand zu O', texSqrtPlain(dist2)],
      ['Lage', planeLage(n, d)],
    ],
    draw: [
      ...S.map((P, k) => (P ? { k: 'pt', p: P, label: `S${'₁₂₃'[k]}`, c: '#ffffff', small: true } : null)).filter(Boolean),
      { k: 'vec', a: p, v: mul(n, 1.6 / Math.sqrt(n2)), c: '#ffffff', label: 'n' },
    ],
  };
}
const paren = (x) => (x < 0 ? `(${tex(x)})` : tex(x));
function planeLage(n, d) {
  const z = n.map((x) => Math.abs(x) < EPS);
  const nz = z.filter(Boolean).length;
  if (nz === 2) {
    const k = z.indexOf(false);
    return Math.abs(d) < EPS ? `ist die ${AXT.filter((_, j) => j !== k).join('')}-Ebene` : `parallel zur ${AXT.filter((_, j) => j !== k).join('')}-Ebene`;
  }
  if (nz === 1) return `parallel zur ${AXT[z.indexOf(true)]}-Achse`;
  return Math.abs(d) < EPS ? 'enthält den Ursprung' : 'allgemeine Lage';
}

// ---------------------------------------------------------------- relations
const ORDER = { point: 0, vector: 1, line: 2, plane: 3 };
export function analyzePair(a, b) {
  if (ORDER[a.type] > ORDER[b.type]) [a, b] = [b, a];
  const key = a.type + '-' + b.type;
  const f = {
    'point-point': relPP, 'point-line': relPL, 'point-plane': relPE, 'line-line': relLL, 'line-plane': relLE,
    'plane-plane': relEE, 'vector-vector': relVV, 'point-vector': relPV, 'vector-line': relVL, 'vector-plane': relVE,
  }[key];
  return f ? f(a, b) : null;
}

function relPP(A, B) {
  const v = sub(B.p, A.p), L2 = dot(v, v), M = mul(add(A.p, B.p), 0.5);
  return {
    title: `${A.name} und ${B.name}`,
    kicker: 'Zwei Punkte',
    blocks: [
      { h: 'Verbindungsvektor', tex: [`\\vec{${A.name}${B.name}} = \\vec{${B.name}} - \\vec{${A.name}} = ${texVec(B.p)} - ${texVec(A.p)} = ${texVec(v)}`] },
      { h: 'Abstand', tex: [`|\\vec{${A.name}${B.name}}| = \\sqrt{${v.map((x) => `(${tex(x)})^2`).join('+')}} = ${texSqrt(L2)}`] },
      { h: 'Mittelpunkt', tex: [`\\vec{m} = \\tfrac{1}{2}\\left(\\vec{${A.name}} + \\vec{${B.name}}\\right) \\Rightarrow ${texPt('M', M)}`] },
    ],
    facts: [['Abstand', texSqrtPlain(L2)], ['Mittelpunkt', ptText('M', M)]],
    draw: [{ k: 'seg', a: A.p, b: B.p, c: '#ffd166' }, { k: 'pt', p: M, label: 'M', c: '#ffd166', small: true }],
  };
}
function relPV(P, v) {
  const Q = add(P.p, v.v);
  return {
    title: `${P.name} verschoben um ${v.name}`,
    kicker: 'Punkt und Vektor',
    blocks: [{ h: 'Verschiebung', tex: [`\\vec{${P.name}'} = \\vec{${P.name}} + \\vec{${v.name}} = ${texVec(P.p)} + ${texVec(v.v)} = ${texVec(Q)}`] }],
    facts: [['Bildpunkt', ptText(P.name + "'", Q)]],
    draw: [{ k: 'vec', a: P.p, v: v.v, c: '#ffd166' }, { k: 'pt', p: Q, label: P.name + "'", c: '#ffd166', small: true }],
  };
}
function lineSolveFor(g, P) {
  // per coordinate: p_k + t u_k = P_k
  const rows = [], ts = [];
  for (let k = 0; k < 3; k++) {
    rows.push(`${tex(P[k])} = ${tex(g.p[k])} ${tex(g.u[k], { sign: true })}${g.param}`);
    if (Math.abs(g.u[k]) > EPS) ts.push((P[k] - g.p[k]) / g.u[k]);
    else if (!near(P[k], g.p[k])) ts.push(NaN);
  }
  const ok = ts.every((t) => !isNaN(t) && near(t, ts[0], 1e-7));
  return { rows, ts, ok, t: ok ? ts[0] : null };
}
function relPL(P, g) {
  const pr = lineSolveFor(g, P.p);
  const w = sub(P.p, g.p);
  const t = dot(w, g.u) / dot(g.u, g.u);
  const F = add(g.p, mul(g.u, t));
  const PF = sub(F, P.p), d2 = dot(PF, PF);
  const blocks = [
    {
      h: 'Punktprobe',
      tex: [`\\begin{aligned}${pr.rows.join('\\\\')}\\end{aligned}`, pr.ok ? `\\Rightarrow ${g.param} = ${tex(pr.t)} \\text{ in allen Zeilen} \\Rightarrow ${P.name}\\in ${g.name}` : `\\Rightarrow \\text{verschiedene Werte (bzw. Widerspruch)} \\Rightarrow ${P.name}\\notin ${g.name}`],
    },
  ];
  if (!pr.ok) {
    blocks.push({
      h: 'Abstand mit dem Lotfußpunkt',
      tex: [
        `\\vec{F} = ${texVec(g.p)} + ${g.param}${texVec(g.u)},\\quad \\vec{${P.name}F}\\cdot\\vec{u} = 0`,
        `\\left(${texVec(g.p)} + ${g.param}${texVec(g.u)} - ${texVec(P.p)}\\right)\\cdot ${texVec(g.u)} = 0 \\Rightarrow ${g.param} = ${tex(t)}`,
        `${texPt('F', F)},\\quad d(${P.name},${g.name}) = |\\vec{${P.name}F}| = ${texSqrt(d2)}`,
      ],
      p: 'Der Verbindungsvektor vom Punkt zum Lotfußpunkt steht senkrecht auf dem Richtungsvektor.',
    });
  }
  return {
    title: `${P.name} und ${g.name}`,
    kicker: pr.ok ? 'Punkt liegt auf der Geraden' : 'Punkt und Gerade · Abstand',
    blocks,
    facts: pr.ok ? [['Ergebnis', `${P.name} ∈ ${g.name} (${g.param} = ${num(pr.t)})`]] : [['Lotfußpunkt', ptText('F', F)], ['Abstand', texSqrtPlain(d2)]],
    draw: pr.ok ? [] : [{ k: 'pt', p: F, label: 'F', c: '#ffd166', small: true }, { k: 'seg', a: P.p, b: F, c: '#ffd166', dashed: true }, { k: 'right', at: F, d1: g.u, d2: sub(P.p, F) }],
  };
}
function relPE(P, E) {
  const val = dot(E.n, P.p), n2 = dot(E.n, E.n);
  const inPlane = near(val, E.d);
  const dist = Math.abs(val - E.d) / Math.sqrt(n2);
  const lam = (E.d - val) / n2;
  const F = add(P.p, mul(E.n, lam)), Ps = add(P.p, mul(E.n, 2 * lam));
  const blocks = [
    { h: 'Punktprobe (einsetzen)', tex: [`${E.n.map((a, k) => `${paren(a)}\\cdot${paren(P.p[k])}`).join(' + ')} = ${tex(val)} ${inPlane ? '=' : '\\neq'} ${tex(E.d)}`, inPlane ? `\\Rightarrow ${P.name}\\in ${E.name}` : `\\Rightarrow ${P.name}\\notin ${E.name}`] },
  ];
  if (!inPlane) {
    blocks.push({ h: 'Abstand mit der Hesseschen Normalform', tex: [`d(${P.name},${E.name}) = \\frac{|${tex(val)} - ${paren(E.d)}|}{${texSqrt(n2, false)}} = ${texSqrt(dist * dist)}`] });
    blocks.push({
      h: 'Lotfußpunkt und Spiegelpunkt',
      tex: [
        `\\text{Lotgerade: } \\vec{x} = ${texVec(P.p)} + \\lambda${texVec(E.n)}\\ \\text{in } ${E.name} \\text{ einsetzen} \\Rightarrow \\lambda = ${tex(lam)}`,
        `${texPt('F', F)},\\quad ${texPt(P.name + "'", Ps)} \\ (\\lambda = ${tex(2 * lam)})`,
      ],
      p: 'Der Spiegelpunkt liegt auf der Lotgeraden doppelt so weit vom Punkt entfernt wie der Lotfußpunkt.',
    });
  }
  return {
    title: `${P.name} und ${E.name}`,
    kicker: inPlane ? 'Punkt liegt in der Ebene' : 'Punkt und Ebene · Abstand',
    blocks,
    facts: inPlane ? [['Ergebnis', `${P.name} ∈ ${E.name}`]] : [['Abstand', texSqrtPlain(dist * dist)], ['Lotfußpunkt', ptText('F', F)], ['Spiegelpunkt', ptText(P.name + "'", Ps)]],
    draw: inPlane ? [] : [
      { k: 'pt', p: F, label: 'F', c: '#ffd166', small: true }, { k: 'pt', p: Ps, label: P.name + "'", c: '#ffd166', small: true },
      { k: 'seg', a: P.p, b: F, c: '#ffd166' }, { k: 'seg', a: F, b: Ps, c: '#ffd166', dashed: true }, { k: 'right', at: F, d1: E.u, d2: sub(P.p, F) },
    ],
  };
}
// solve a·t + b·s = c over the two most independent rows, report the third row
function solve2(u, v, w) {
  // u t - v s = w
  let best = null;
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
    const det = u[i] * -v[j] - -v[i] * u[j];
    if (!best || Math.abs(det) > Math.abs(best.det)) best = { i, j, det };
  }
  const { i, j, det } = best;
  const t = (w[i] * -v[j] - -v[i] * w[j]) / det;
  const s = (u[i] * w[j] - w[i] * u[j]) / det;
  const k = 3 - i - j;
  const ok = near(u[k] * t - v[k] * s, w[k], 1e-7);
  return { t, s, i, j, k, ok };
}
function relLL(g, h) {
  const sP = g.param === h.param ? (h.param === 's' ? 'r' : 's') : h.param;   // rename the 2nd parameter if equal
  const coll = collinear(g.u, h.u);
  const blocks = [];
  const ratio = (() => { for (let k = 0; k < 3; k++) if (Math.abs(h.u[k]) > EPS) return g.u[k] / h.u[k]; return 0; })();
  blocks.push({
    h: '1. Sind die Richtungsvektoren kollinear?',
    tex: [`${texVec(g.u)} = k\\cdot${texVec(h.u)}`, coll ? `\\Rightarrow k = ${tex(ratio)} \\text{ passt für alle Zeilen: kollinear}` : `\\Rightarrow \\text{kein gemeinsames } k \\text{: nicht kollinear}`],
  });
  let res = {}, draw = [];
  if (coll) {
    const pr = lineSolveFor(h, g.p);
    blocks.push({ h: `2. Punktprobe: Stützpunkt von ${g.name} in ${h.name}`, tex: [`\\begin{aligned}${pr.rows.join('\\\\')}\\end{aligned}`, pr.ok ? `\\Rightarrow \\text{passt} \\Rightarrow ${g.name} = ${h.name}` : `\\Rightarrow \\text{Widerspruch} \\Rightarrow ${g.name} \\parallel ${h.name}`] });
    if (pr.ok) res = { kicker: 'identisch', facts: [['Lage', 'identisch']] };
    else {
      const w = sub(g.p, h.p);
      const t = dot(w, h.u) / dot(h.u, h.u);
      const F = add(h.p, mul(h.u, t));
      const d2 = dot(sub(F, g.p), sub(F, g.p));
      blocks.push({ h: '3. Abstand der Parallelen', tex: [`d(${g.name},${h.name}) = d(P_{${g.name}},${h.name}) = ${texSqrt(d2)}`], p: 'Abstand eines beliebigen Punktes der einen Geraden zur anderen (Lotfußpunkt).' });
      res = { kicker: 'echt parallel', facts: [['Lage', 'echt parallel'], ['Abstand', texSqrtPlain(d2)]] };
      draw = [{ k: 'seg', a: g.p, b: F, c: '#ffd166', dashed: true }, { k: 'pt', p: F, label: 'F', c: '#ffd166', small: true }];
    }
  } else {
    const w = sub(h.p, g.p);
    const r = solve2(g.u, h.u, w);
    const rows = [0, 1, 2].map((k) => `${tex(g.p[k])} ${tex(g.u[k], { sign: true })}${g.param} &= ${tex(h.p[k])} ${tex(h.u[k], { sign: true })}${sP}`);
    blocks.push({
      h: '2. Gleichsetzen (LGS)',
      tex: [
        `\\begin{aligned}${rows.join('\\\\')}\\end{aligned}`,
        `\\text{Zeilen ${r.i + 1} und ${r.j + 1}: } ${g.param} = ${tex(r.t)},\\ ${sP} = ${tex(r.s)}`,
        `\\text{Probe Zeile ${r.k + 1}: } ${tex(g.p[r.k] + g.u[r.k] * r.t)} ${r.ok ? '=' : '\\neq'} ${tex(h.p[r.k] + h.u[r.k] * r.s)}`,
      ],
    });
    const cosA = Math.abs(dot(g.u, h.u)) / (len(g.u) * len(h.u));
    const alpha = deg(Math.acos(Math.min(1, cosA)));
    if (r.ok) {
      const S = add(g.p, mul(g.u, r.t));
      blocks.push({ h: '3. Schnittpunkt und Schnittwinkel', tex: [texPt('S', S), `\\cos\\alpha = \\frac{|\\vec{u}\\cdot\\vec{v}|}{|\\vec{u}|\\cdot|\\vec{v}|} = \\frac{${tex(Math.abs(dot(g.u, h.u)))}}{${texSqrt(dot(g.u, g.u), false)}\\cdot${texSqrt(dot(h.u, h.u), false)}} \\Rightarrow \\alpha \\approx ${texAngle(alpha)}`] });
      res = { kicker: 'schneiden sich', facts: [['Lage', 'schneidend'], ['Schnittpunkt', ptText('S', S)], ['Schnittwinkel', `≈ ${dec(alpha, 2)}°`]] };
      draw = [{ k: 'pt', p: S, label: 'S', c: '#ffd166' }, { k: 'angle', at: S, d1: g.u, d2: h.u, label: `${dec(alpha, 1)}°` }];
    } else {
      const n = cross(g.u, h.u);
      const dd = Math.abs(dot(w, n)) / len(n);
      // feet of the common perpendicular: (p + t u − q − s v)·u = 0, ·v = 0
      const uu = dot(g.u, g.u), vv = dot(h.u, h.u), uv = dot(g.u, h.u), wu = dot(w, g.u), wv = dot(w, h.u);
      const den = uu * vv - uv * uv;
      const t = (wu * vv - wv * uv) / den, s = (wu * uv - wv * uu) / den;
      const F = add(g.p, mul(g.u, t)), G = add(h.p, mul(h.u, s));
      blocks.push({
        h: '3. Windschief – Abstand',
        tex: [
          `\\vec{n} = \\vec{u}\\times\\vec{v} = ${texVec(n)}`,
          `d = \\frac{|(\\vec{q}-\\vec{p})\\cdot\\vec{n}|}{|\\vec{n}|} = \\frac{|${tex(dot(w, n))}|}{${texSqrt(dot(n, n), false)}} = ${texSqrt(dd * dd)}`,
          `\\text{Lotfußpunkte: } ${texPt('F', F)},\\ ${texPt('G', G)}`,
        ],
        p: 'Die kürzeste Verbindung (gemeinsames Lot) steht auf beiden Geraden senkrecht.',
      });
      res = { kicker: 'windschief', facts: [['Lage', 'windschief'], ['Abstand', texSqrtPlain(dd * dd)], ['Lotfußpunkte', `${ptText('F', F)}, ${ptText('G', G)}`]] };
      draw = [{ k: 'seg', a: F, b: G, c: '#ffd166' }, { k: 'pt', p: F, label: 'F', c: '#ffd166', small: true }, { k: 'pt', p: G, label: 'G', c: '#ffd166', small: true }, { k: 'right', at: F, d1: g.u, d2: sub(G, F) }, { k: 'right', at: G, d1: h.u, d2: sub(F, G) }];
    }
  }
  return { title: `${g.name} und ${h.name}`, kicker: `Zwei Geraden · ${res.kicker}`, blocks, facts: res.facts, draw };
}
function relLE(g, E) {
  const nu = dot(E.n, g.u);
  const blocks = [];
  let facts, draw = [], kicker;
  if (Math.abs(nu) < EPS) {
    const val = dot(E.n, g.p);
    const inE = near(val, E.d);
    blocks.push({ h: '1. Richtungsvektor · Normalenvektor', tex: [`\\vec{u}\\cdot\\vec{n} = ${texVec(g.u)}\\cdot${texVec(E.n)} = 0`], p: 'Der Richtungsvektor ist orthogonal zum Normalenvektor: Die Gerade ist parallel zur Ebene oder liegt in ihr.' });
    blocks.push({ h: '2. Punktprobe mit dem Stützpunkt', tex: [`${tex(val)} ${inE ? '=' : '\\neq'} ${tex(E.d)}`] });
    if (inE) { kicker = 'liegt in der Ebene'; facts = [['Lage', `${g.name} liegt in ${E.name}`]]; }
    else {
      const dist = Math.abs(val - E.d) / len(E.n);
      blocks.push({ h: '3. Abstand', tex: [`d = \\frac{|${tex(val)} - ${paren(E.d)}|}{${texSqrt(dot(E.n, E.n), false)}} = ${texSqrt(dist * dist)}`] });
      kicker = 'parallel'; facts = [['Lage', 'echt parallel'], ['Abstand', texSqrtPlain(dist * dist)]];
    }
  } else {
    const t = (E.d - dot(E.n, g.p)) / nu;
    const S = add(g.p, mul(g.u, t));
    const sinA = Math.abs(nu) / (len(E.n) * len(g.u));
    const alpha = deg(Math.asin(Math.min(1, sinA)));
    const subst = E.n.map((a, k) => (Math.abs(a) < EPS ? null : `${paren(a)}\\cdot(${tex(g.p[k])} ${tex(g.u[k], { sign: true })}${g.param})`)).filter(Boolean).join(' + ');
    blocks.push({ h: '1. Gerade in die Koordinatenform einsetzen', tex: [`${subst} = ${tex(E.d)}`, `\\Rightarrow ${g.param} = ${tex(t)}`] });
    blocks.push({ h: '2. Durchstoßpunkt', tex: [texPt('S', S)] });
    blocks.push({ h: '3. Schnittwinkel', tex: [`\\sin\\alpha = \\frac{|\\vec{u}\\cdot\\vec{n}|}{|\\vec{u}|\\cdot|\\vec{n}|} = \\frac{${tex(Math.abs(nu))}}{${texSqrt(dot(g.u, g.u), false)}\\cdot${texSqrt(dot(E.n, E.n), false)}} \\Rightarrow \\alpha \\approx ${texAngle(alpha)}`], p: 'Beim Winkel zwischen Gerade und Ebene steht der Sinus (der Normalenvektor steht senkrecht auf der Ebene).' });
    kicker = 'schneiden sich';
    facts = [['Lage', 'schneidend'], ['Durchstoßpunkt', ptText('S', S)], ['Schnittwinkel', `≈ ${dec(alpha, 2)}°`]];
    draw = [{ k: 'pt', p: S, label: 'S', c: '#ffd166' }];
    if (Math.abs(alpha - 90) < 1e-6) draw.push({ k: 'right', at: S, d1: g.u, d2: E.u });
  }
  return { title: `${g.name} und ${E.name}`, kicker: `Gerade und Ebene · ${kicker}`, blocks, facts, draw };
}
function relEE(E, F) {
  const blocks = [];
  let facts, draw = [], kicker;
  const coll = collinear(E.n, F.n);
  blocks.push({ h: '1. Normalenvektoren vergleichen', tex: [`\\vec{n}_1 = ${texVec(E.n)},\\ \\vec{n}_2 = ${texVec(F.n)}`, coll ? '\\Rightarrow \\text{kollinear}' : '\\Rightarrow \\text{nicht kollinear: Die Ebenen schneiden sich in einer Geraden}'] });
  if (coll) {
    const k = (() => { for (let i = 0; i < 3; i++) if (Math.abs(F.n[i]) > EPS) return E.n[i] / F.n[i]; return 1; })();
    const same = near(E.d, k * F.d);
    if (same) { kicker = 'identisch'; facts = [['Lage', 'identisch']]; blocks.push({ h: '2. Gleichungen vergleichen', tex: [`${E.name} = ${tex(k)}\\cdot ${F.name} \\Rightarrow \\text{identisch}`] }); }
    else {
      const P = E.p;
      const dist = Math.abs(dot(F.n, P) - F.d) / len(F.n);
      blocks.push({ h: '2. Abstand der parallelen Ebenen', tex: [`d = d(P_{${E.name}}, ${F.name}) = \\frac{|${tex(dot(F.n, P))} - ${paren(F.d)}|}{${texSqrt(dot(F.n, F.n), false)}} = ${texSqrt(dist * dist)}`] });
      kicker = 'parallel'; facts = [['Lage', 'echt parallel'], ['Abstand', texSqrtPlain(dist * dist)]];
    }
  } else {
    const w = cross(E.n, F.n);
    // point on the line: set the coordinate with the biggest |w_k| to 0, solve the 2×2 system
    let k = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(w[i]) > Math.abs(w[k])) k = i;
    const [i, j] = [0, 1, 2].filter((x) => x !== k);
    const det = E.n[i] * F.n[j] - E.n[j] * F.n[i];
    const P = [0, 0, 0];
    P[i] = (E.d * F.n[j] - E.n[j] * F.d) / det;
    P[j] = (E.n[i] * F.d - E.d * F.n[i]) / det;
    const wi = niceInt(w);
    const cosA = Math.abs(dot(E.n, F.n)) / (len(E.n) * len(F.n));
    const alpha = deg(Math.acos(Math.min(1, cosA)));
    blocks.push({
      h: '2. Schnittgerade',
      tex: [
        `\\text{Richtung: } \\vec{n}_1\\times\\vec{n}_2 = ${texVec(w)}${wi.some((x, q) => !near(x, w[q])) ? ` \\sim ${texVec(wi)}` : ''}`,
        `\\text{Punkt: } x_${k + 1} = 0 \\text{ setzen und das LGS lösen} \\Rightarrow ${texPt('P', P)}`,
        `s:\\ \\vec{x} = ${texVec(P)} + t\\cdot${texVec(wi)}`,
      ],
    });
    blocks.push({ h: '3. Schnittwinkel', tex: [`\\cos\\alpha = \\frac{|\\vec{n}_1\\cdot\\vec{n}_2|}{|\\vec{n}_1|\\cdot|\\vec{n}_2|} = \\frac{${tex(Math.abs(dot(E.n, F.n)))}}{${texSqrt(dot(E.n, E.n), false)}\\cdot${texSqrt(dot(F.n, F.n), false)}} \\Rightarrow \\alpha \\approx ${texAngle(alpha)}`] });
    kicker = 'schneiden sich';
    facts = [['Lage', 'schneidend'], ['Schnittgerade', `x = (${P.map(num).join('|')}) + t·(${wi.map(num).join('|')})`], ['Schnittwinkel', `≈ ${dec(alpha, 2)}°`]];
    draw = [{ k: 'line', p: P, u: wi, c: '#ffd166' }];
  }
  return { title: `${E.name} und ${F.name}`, kicker: `Zwei Ebenen · ${kicker}`, blocks, facts, draw };
}
function relVV(a, b) {
  const s = dot(a.v, b.v), c = cross(a.v, b.v), la = len(a.v), lb = len(b.v);
  const cosA = la * lb > EPS ? s / (la * lb) : 1;
  const alpha = deg(Math.acos(Math.max(-1, Math.min(1, cosA))));
  const A2 = dot(c, c);
  return {
    title: `${a.name} und ${b.name}`,
    kicker: 'Zwei Vektoren',
    blocks: [
      { h: 'Skalarprodukt', tex: [`\\vec{${a.name}}\\cdot\\vec{${b.name}} = ${a.v.map((x, k) => `${paren(x)}\\cdot${paren(b.v[k])}`).join(' + ')} = ${tex(s)}`], p: Math.abs(s) < EPS ? 'Das Skalarprodukt ist 0: Die Vektoren sind orthogonal.' : '' },
      { h: 'Winkel', tex: [`\\cos\\alpha = \\frac{${tex(s)}}{${texSqrt(dot(a.v, a.v), false)}\\cdot${texSqrt(dot(b.v, b.v), false)}} \\Rightarrow \\alpha \\approx ${texAngle(alpha)}`] },
      { h: 'Kreuzprodukt', tex: [`\\vec{${a.name}}\\times\\vec{${b.name}} = ${texVec(c)}`], p: 'Steht senkrecht auf beiden Vektoren; sein Betrag ist der Flächeninhalt des aufgespannten Parallelogramms.' },
      { h: 'Flächeninhalte', tex: [`A_{\\text{Parallelogramm}} = |\\vec{${a.name}}\\times\\vec{${b.name}}| = ${texSqrt(A2)}`, `A_{\\text{Dreieck}} = \\tfrac{1}{2}|\\vec{${a.name}}\\times\\vec{${b.name}}| = ${texSqrt(A2 / 4)}`] },
    ],
    facts: [['Skalarprodukt', num(s)], ['Winkel', `≈ ${dec(alpha, 2)}°`], ['Lage', isZero(c) ? 'kollinear' : Math.abs(s) < EPS ? 'orthogonal' : '—']],
    draw: isZero(c) ? [] : [{ k: 'vec', a: a.from || [0, 0, 0], v: mul(c, 2.2 / Math.max(len(c), 1e-9)), c: '#ffd166', label: `${a.name}×${b.name}` }],
  };
}
function relVL(v, g) {
  const coll = collinear(v.v, g.u);
  const s = dot(v.v, g.u);
  return {
    title: `${v.name} und ${g.name}`,
    kicker: 'Vektor und Gerade',
    blocks: [{ h: 'Vergleich mit dem Richtungsvektor', tex: [`\\vec{${v.name}}\\cdot\\vec{u} = ${tex(s)}`], p: coll ? `${v.name} ist ein Richtungsvektor von ${g.name}.` : Math.abs(s) < EPS ? `${v.name} steht senkrecht auf ${g.name}.` : `${v.name} ist weder parallel noch orthogonal zu ${g.name}.` }],
    facts: [['Ergebnis', coll ? 'parallel' : Math.abs(s) < EPS ? 'orthogonal' : '—']],
    draw: [],
  };
}
function relVE(v, E) {
  const s = dot(v.v, E.n);
  const coll = collinear(v.v, E.n);
  return {
    title: `${v.name} und ${E.name}`,
    kicker: 'Vektor und Ebene',
    blocks: [{ h: 'Vergleich mit dem Normalenvektor', tex: [`\\vec{${v.name}}\\cdot\\vec{n} = ${tex(s)}`], p: coll ? `${v.name} ist ein Normalenvektor von ${E.name} (steht senkrecht auf der Ebene).` : Math.abs(s) < EPS ? `${v.name} ist parallel zur Ebene ${E.name}.` : `${v.name} ist weder parallel noch orthogonal zu ${E.name}.` }],
    facts: [['Ergebnis', coll ? 'orthogonal zur Ebene' : Math.abs(s) < EPS ? 'parallel zur Ebene' : '—']],
    draw: [],
  };
}

// point on a line / plane for parameter values (used by the sliders)
export const lineAt = (g, t) => add(g.p, mul(g.u, t));
export const planeAt = (E, r, s) => add(add(E.p, mul(E.u, r)), mul(E.v, s));
