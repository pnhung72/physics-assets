/*!
 * exam_docx_export.js  (v2.0)
 * Xuất gói đề thi ra file .docx THẬT (không phải HTML đổi đuôi .doc).
 *  - Công thức LaTeX  -> công thức gốc của Word (OMML), sửa được bằng Equation Editor
 *  - Số trang "Trang x/y" và "(Đề kiểm tra có N trang)" là trường tự động của Word
 *  - v2.0: xuất HAI file riêng: De_thi_*.docx (mọi mã đề) và Dap_an_*.docx (đáp án theo mẫu của trường)
 *  - Mỗi mã đề là một section riêng: bắt đầu ở đầu trang mới và đánh số trang lại từ 1
 *  - Mã đề giữ nguyên chuỗi (vd "0201"), không bị mất số 0 đầu
 *  - Đánh số câu: numbering 'auto' (mặc định: TX liên tục, GK/CK mỗi phần đánh lại từ 1), hoặc ép 'restart' | 'template' | 'continuous'
 *  - Hình ảnh nhúng thẳng vào file (data: URI, hoặc tải qua fetch nếu server cho phép CORS)
 *
 * Phụ thuộc: thư viện "docx" (UMD, biến toàn cục `docx`) – xem loadDocx() bên dưới.
 * Dùng:
 *   await ExamDocx.download(examPackages, { department, school, semester, schoolYear, subject, partOf, markTag });
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, function () { return require('docx'); });
  else root.ExamDocx = factory(root, function () { return root.docx; });
})(typeof self !== 'undefined' ? self : this, function (root, getDocx) {
  'use strict';

  var DOCX_CDN = 'https://cdn.jsdelivr.net/npm/docx@9.6.1/build/index.umd.cjs';
  var MISSING_IMG_TEXT = '[THIẾU HÌNH - cần bổ sung hình thật]';

  /* ------------------------------------------------------------------ */
  /*  0. Tiện ích chung                                                  */
  /* ------------------------------------------------------------------ */
  var MATH_SZ = 28;        // half-points, cập nhật theo fontSize khi dựng
  var D = null;            // module docx (nạp lười)
  var Raw = null;          // lớp XmlComponent tự viết để tạo thẻ OMML bất kỳ

  function ensureDocx() {
    if (D) return D;
    D = getDocx();
    if (!D) throw new Error('Chưa nạp thư viện docx. Gọi ExamDocx.loadDocx() trước.');
    Raw = class extends D.XmlComponent {
      constructor(name, attrs, kids) { super(name); this._attrs = attrs || null; this._kids = kids || []; }
      prepForXml(ctx) {
        var out = [];
        if (this._attrs) out.push({ _attr: this._attrs });
        for (var i = 0; i < this._kids.length; i++) {
          var k = this._kids[i];
          if (k == null) continue;
          if (typeof k === 'string') out.push(k);
          else { var p = k.prepForXml(ctx); if (p) out.push(p); }
        }
        var o = {}; o[this.rootKey] = out; return o;
      }
    };
    return D;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Không tải được: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadDocx(url) {
    if (root.docx) return Promise.resolve();
    return loadScript(url || DOCX_CDN);
  }

  function decodeEntities(s) {
    var map = { nbsp: '\u00A0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—', hellip: '…', deg: '°', times: '×', plusmn: '±' };
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === '#') {
        var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(n) ? String.fromCodePoint(n) : m;
      }
      var v = map[e.toLowerCase()]; return v !== undefined ? v : m;
    });
  }
  function stripTags(s) { return decodeEntities(String(s == null ? '' : s).replace(/<[^>]*>/g, '')); }
  function fmtScore(n) { return String(n).replace('.', ','); }

  /* ------------------------------------------------------------------ */
  /*  1. LaTeX  ->  OMML (công thức Word)                                */
  /* ------------------------------------------------------------------ */
  var SYM = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
    phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    pm: '±', mp: '∓', times: '×', cdot: '·', div: '÷', approx: '≈', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥',
    ll: '≪', gg: '≫', infty: '∞', propto: '∝', sim: '∼', equiv: '≡', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒',
    Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', partial: '∂', nabla: '∇', circ: '°', degree: '°', ldots: '…', cdots: '⋯',
    dots: '…', angle: '∠', perp: '⊥', parallel: '∥', in: '∈', cup: '∪', cap: '∩', subset: '⊂', forall: '∀', exists: '∃',
    hbar: 'ℏ', ell: 'ℓ', prime: '′', bullet: '∙', uparrow: '↑', downarrow: '↓', ohm: 'Ω', micro: 'µ', lt: '<', gt: '>',
    '{': '{', '}': '}', '%': '%', '$': '$', '&': '&', '#': '#', '_': '_', '|': '‖', ',': '\u2009', ';': '\u2005', ':': '\u2005',
    '!': '', ' ': ' ', quad: '\u2003', qquad: '\u2003\u2003', '\\': ''
  };
  var FUNCS = { sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1, arcsin: 1, arccos: 1, arctan: 1, sinh: 1, cosh: 1, tanh: 1, ln: 1, log: 1, lg: 1, exp: 1, lim: 1, max: 1, min: 1, det: 1 };
  var NARY = { sum: '∑', prod: '∏', int: '∫', oint: '∮', iint: '∬', iiint: '∭' };
  var ACC = { vec: '\u20D7', hat: '\u0302', tilde: '\u0303', dot: '\u0307', ddot: '\u0308', check: '\u030C', acute: '\u0301', grave: '\u0300', widehat: '\u0302', widetilde: '\u0303', overrightarrow: '\u20D7', overleftarrow: '\u20D6' };
  var DELIM = { '.': '', '\\{': '{', '\\}': '}', '\\langle': '⟨', '\\rangle': '⟩', '\\|': '‖', '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉', '\\lvert': '|', '\\rvert': '|' };
  var TEXTCMD = { text: 1, mathrm: 1, textrm: 1, operatorname: 1, rm: 1, mbox: 1, textnormal: 1, unit: 1, mathbf: 'b', textbf: 'b', bf: 'b', boldsymbol: 'b', mathit: 'i', textit: 'i' };
  var SKIPCMD = { displaystyle: 1, textstyle: 1, scriptstyle: 1, limits: 1, nolimits: 1, big: 1, Big: 1, bigg: 1, Bigg: 1, large: 1, Large: 1, normalsize: 1, small: 1, mathcal: 1, mathbb: 1, boldmath: 1, dpi: 1, bg: 1 };

  function texPlain(raw) {   // nội dung \text{...}: đổi \cmd thành ký hiệu, bỏ ngoặc nhọn
    return raw.replace(/\\([A-Za-z]+|.)/g, function (m, k) { return SYM[k] !== undefined ? SYM[k] : (FUNCS[k] ? k : ''); }).replace(/[{}]/g, '');
  }

  function parseTeX(src) {
    var i = 0, n = src.length;
    function ws() { while (i < n && /\s/.test(src[i])) i++; }
    function rawGroup() {
      ws();
      if (src[i] !== '{') return src[i++] || '';
      var d = 0, j = i;
      for (; j < n; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } }
      var r = src.slice(i + 1, j); i = j + 1; return r;
    }
    function arg() {
      ws();
      if (src[i] === '{') { i++; return seq('}'); }
      var a = atom(); return a ? (Array.isArray(a) ? a : [a]) : [];
    }
    function optArg() {
      ws();
      if (src[i] !== '[') return null;
      var j = src.indexOf(']', i); if (j < 0) return null;
      var r = src.slice(i + 1, j); i = j + 1; return parseTeX(r);
    }
    function isRight() { return src.startsWith('\\right', i) && !/[A-Za-z]/.test(src[i + 6] || ''); }
    function seq(stop) {
      var out = [];
      while (i < n) {
        ws(); if (i >= n) break;
        var c = src[i];
        if (c === '}') { i++; if (stop === '}') return out; continue; }
        if (c === '\\' && isRight()) { if (stop === 'right') return out; i += 6; delimTok(); continue; }
        var a = atom(); if (!a) continue;
        var list = Array.isArray(a) ? a : [a];
        // gom chỉ số trên/dưới
        var sub = null, sup = null, last = list[list.length - 1];
        for (;;) {
          ws();
          if (src[i] === '^') { i++; sup = arg(); }
          else if (src[i] === '_') { i++; sub = arg(); }
          else break;
        }
        if (sub || sup) {
          if (last.k === 'nary' && !last.sub && !last.sup) { last.sub = sub; last.sup = sup; }
          else {
            var head = list.slice(0, -1);
            if (!sub && sup && sup.length === 1 && sup[0].k === 't' && sup[0].v === '°') list = list.concat(sup);
            else { head.push({ k: 'ss', b: [last], sub: sub, sup: sup }); list = head; }
          }
        }
        for (var q = 0; q < list.length; q++) out.push(list[q]);
        var tail = list[list.length - 1];
        if (tail && tail.k === 'nary' && !tail.body) {
          ws();
          if (i < n && src[i] !== '}' && !isRight()) { var nb = atom(); if (nb) { tail.body = Array.isArray(nb) ? nb : [nb]; var bs = null, bp = null; ws();
            if (src[i] === '^' || src[i] === '_') { for (;;) { ws(); if (src[i] === '^') { i++; bp = arg(); } else if (src[i] === '_') { i++; bs = arg(); } else break; }
              tail.body = [{ k: 'ss', b: tail.body.slice(-1), sub: bs, sup: bp }]; } } }
        }
      }
      return out;
    }
    function delimTok() {
      ws();
      var t;
      if (src[i] === '\\') { var m = /^\\([A-Za-z]+|.)/.exec(src.slice(i)); t = m[0]; i += t.length; }
      else t = src[i++] || '.';
      return DELIM[t] !== undefined ? DELIM[t] : t;
    }
    function atom() {
      var c = src[i];
      if (c === '{') { i++; var g = seq('}'); if (g.length === 1 && g[0].k === 't' && g[0].v === ',') g[0].nor = true; return g; }
      if (c === ',' && /\d/.test(src[i - 1] || '') && /\d/.test(src[i + 1] || '')) { i++; return { k: 't', v: ',', nor: true }; }
      if (c === '&' || c === '~') { i++; return { k: 't', v: c === '~' ? '\u00A0' : ' ' }; }
      if (c !== '\\') { i++; return { k: 't', v: c === '-' ? '−' : c }; }
      i++;
      var name;
      if (/[A-Za-z]/.test(src[i] || '')) { var j = i; while (j < n && /[A-Za-z]/.test(src[j])) j++; name = src.slice(i, j); i = j; }
      else { name = src[i] || ''; i++; }
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { var a1 = arg(), a2 = arg(); return { k: 'frac', n: a1, d: a2 }; }
      if (name === 'sqrt') { var deg = optArg(); return { k: 'rad', deg: deg, c: arg() }; }
      if (name === 'bar' || name === 'overline') return { k: 'bar', c: arg(), pos: 'top' };
      if (name === 'underline') return { k: 'bar', c: arg(), pos: 'bot' };
      if (ACC[name]) return { k: 'acc', c: arg(), chr: ACC[name] };
      if (name === 'left') { var beg = delimTok(), body = seq('right'); var end = ''; if (isRight()) { i += 6; end = delimTok(); } return { k: 'dlm', c: body, beg: beg, end: end }; }
      if (NARY[name]) return { k: 'nary', chr: NARY[name], sub: null, sup: null };
      if (TEXTCMD[name]) { var t = texPlain(rawGroup()); return { k: 't', v: t, nor: true, b: TEXTCMD[name] === 'b', it: TEXTCMD[name] === 'i' }; }
      if (name === 'begin' || name === 'end') { rawGroup(); return null; }
      if (SKIPCMD[name]) { if (name === 'dpi' || name === 'bg') rawGroup(); return null; }
      if (FUNCS[name]) return { k: 't', v: name, nor: true };
      if (SYM[name] !== undefined) return SYM[name] === '' ? null : { k: 't', v: SYM[name], nor: /^[\u2009\u2005\u2003]+$/.test(SYM[name]) };
      return { k: 't', v: name.length === 1 ? name : '\\' + name };
    }
    return seq(null);
  }

  function X(name, attrs, kids) { return new Raw(name, attrs, kids); }
  function mrun(text, o) {
    o = o || {};
    var mpr = [];
    if (o.nor) mpr.push(X('m:nor', null, []));
    if (o.b) mpr.push(X('m:sty', { 'm:val': o.it ? 'bi' : 'b' }, []));
    var font = o.nor ? 'Times New Roman' : 'Cambria Math';
    var wpr = [X('w:rFonts', { 'w:ascii': font, 'w:hAnsi': font, 'w:cs': font, 'w:eastAsia': font }, [])];
    if (o.nor && o.b) wpr.push(X('w:b', null, []));
    if (o.nor && o.it) wpr.push(X('w:i', null, []));
    wpr.push(X('w:sz', { 'w:val': String(MATH_SZ) }, []), X('w:szCs', { 'w:val': String(MATH_SZ) }, []));
    var kids = [];
    if (mpr.length) kids.push(X('m:rPr', null, mpr));
    kids.push(X('w:rPr', null, wpr));
    kids.push(X('m:t', { 'xml:space': 'preserve' }, [text]));
    return X('m:r', null, kids);
  }
  function el(tag, kids) { return X(tag, null, kids || []); }

  function emitList(nodes) {
    var out = [], buf = null;
    function flush() { if (buf) { out.push(mrun(buf.v, buf)); buf = null; } }
    for (var k = 0; k < nodes.length; k++) {
      var nd = nodes[k];
      if (nd.k === 't') {
        if (buf && !!buf.nor === !!nd.nor && !!buf.b === !!nd.b && !!buf.it === !!nd.it) buf.v += nd.v;
        else { flush(); buf = { v: nd.v, nor: !!nd.nor, b: !!nd.b, it: !!nd.it }; }
        continue;
      }
      flush();
      out.push.apply(out, emitNode(nd));
    }
    flush();
    return out;
  }
  function emitNode(nd) {
    switch (nd.k) {
      case 'frac': return [el('m:f', [el('m:num', emitList(nd.n)), el('m:den', emitList(nd.d))])];
      case 'rad':
        return [el('m:rad', [
          el('m:radPr', nd.deg ? [] : [X('m:degHide', { 'm:val': '1' }, [])]),
          el('m:deg', nd.deg ? emitList(nd.deg) : []), el('m:e', emitList(nd.c))])];
      case 'bar': return [el('m:bar', [el('m:barPr', [X('m:pos', { 'm:val': nd.pos }, [])]), el('m:e', emitList(nd.c))])];
      case 'acc': return [el('m:acc', [el('m:accPr', [X('m:chr', { 'm:val': nd.chr }, [])]), el('m:e', emitList(nd.c))])];
      case 'dlm': return [el('m:d', [
        el('m:dPr', [X('m:begChr', { 'm:val': nd.beg }, []), X('m:endChr', { 'm:val': nd.end }, [])]),
        el('m:e', emitList(nd.c))])];
      case 'nary': {
        var pr = [X('m:chr', { 'm:val': nd.chr }, [])];
        if (!nd.sub) pr.push(X('m:subHide', { 'm:val': '1' }, []));
        if (!nd.sup) pr.push(X('m:supHide', { 'm:val': '1' }, []));
        return [el('m:nary', [el('m:naryPr', pr), el('m:sub', nd.sub ? emitList(nd.sub) : []), el('m:sup', nd.sup ? emitList(nd.sup) : []), el('m:e', nd.body ? emitList(nd.body) : [])])];
      }
      case 'ss': {
        var base = el('m:e', emitList(nd.b));
        if (nd.sub && nd.sup) return [el('m:sSubSup', [el('m:sSubSupPr', []), base, el('m:sub', emitList(nd.sub)), el('m:sup', emitList(nd.sup))])];
        if (nd.sub) return [el('m:sSub', [el('m:sSubPr', []), base, el('m:sub', emitList(nd.sub))])];
        return [el('m:sSup', [el('m:sSupPr', []), base, el('m:sup', emitList(nd.sup))])];
      }
    }
    return [];
  }
  /** LaTeX -> đối tượng Math của docx (m:oMath) */
  function texToMath(latex) {
    ensureDocx();
    var nodes;
    try { nodes = parseTeX(String(latex)); } catch (e) { nodes = [{ k: 't', v: String(latex), nor: true }]; }
    return new D.Math({ children: emitList(nodes) });
  }

  /* ------------------------------------------------------------------ */
  /*  2. HTML nội tuyến  ->  TextRun / Math / ImageRun                   */
  /* ------------------------------------------------------------------ */
  var MATH_RE = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\$([^\s$](?:[^$]*?[^\s$])?)\$/g;

  function codecogsToLatex(src) {
    if (!/codecogs\.com|chart\.(apis\.)?googleapis\.com\/chart/i.test(src)) return null;
    var q = src.indexOf('?'); var s = null;
    var m = /[?&]chl=([^&]+)/.exec(src);
    if (m) s = m[1];
    else if (q >= 0) s = src.slice(q + 1);
    else { var p = /codecogs\.com\/(?:png|gif|svg|pdf)?\.?(?:latex)?\/?(.*)$/i.exec(src); s = p ? p[1] : null; }
    if (!s) return null;
    try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { /* giữ nguyên */ }
    s = s.replace(/\\(dpi|bg)(_[a-z]+|\{[^}]*\})/gi, '').replace(/\\(tiny|small|large|Large|LARGE|huge|Huge|normalsize)\b/g, '');
    return s.trim() || null;
  }

  function parseAttrs(s) {
    var o = {}, re = /([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/g, m;
    while ((m = re.exec(s))) o[m[1].toLowerCase()] = decodeEntities(m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[2]));
    return o;
  }

  /** Tách chuỗi HTML thành danh sách phần tử trung gian */
  function tokenizeInline(html) {
    html = String(html == null ? '' : html);
    var items = [], st = { b: 0, i: 0, u: 0, sub: 0, sup: 0, over: 0 }, stack = [];
    var re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, last = 0, m;
    function pushText(txt) {
      if (!txt) return;
      var lastIdx = 0, mm;
      MATH_RE.lastIndex = 0;
      while ((mm = MATH_RE.exec(txt))) {
        if (mm.index > lastIdx) addPlain(txt.slice(lastIdx, mm.index));
        items.push({ t: 'math', v: decodeEntities(mm[1] || mm[2] || mm[3] || mm[4]), st: Object.assign({}, st) });
        lastIdx = mm.index + mm[0].length;
      }
      if (lastIdx < txt.length) addPlain(txt.slice(lastIdx));
    }
    function addPlain(t) {
      t = decodeEntities(t).replace(/[\r\n\t]+/g, ' ');
      if (!t) return;
      items.push({ t: 'text', v: t, st: Object.assign({}, st) });
    }
    var BLOCK = { div: 1, p: 1, li: 1, tr: 1, h1: 1, h2: 1, h3: 1, h4: 1 };
    while ((m = re.exec(html))) {
      pushText(html.slice(last, m.index)); last = m.index + m[0].length;
      if (!m[1]) continue;                                   // comment
      var tag = m[1].toLowerCase(), closing = m[0][1] === '/';
      if (tag === 'br') { items.push({ t: 'br' }); continue; }
      if (tag === 'img' && !closing) {
        var a = parseAttrs(m[2]);
        var tex = a.src ? codecogsToLatex(a.src) : null;
        if (tex) items.push({ t: 'math', v: tex, st: Object.assign({}, st) });
        else items.push({ t: 'img', src: a.src || '', w: parseFloat(a.width) || 0, h: parseFloat(a.height) || 0, alt: a.alt || '' });
        continue;
      }
      if (BLOCK[tag]) { items.push({ t: 'blk', open: !closing }); continue; }
      var key = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', ins: 'u', sub: 'sub', sup: 'sup' }[tag];
      if (tag === 'span' || key) {
        if (!closing) {
          var k2 = key, ov = false;
          if (tag === 'span') { var sty = (parseAttrs(m[2]).style || ''); ov = /text-decoration[^;]*overline/i.test(sty); k2 = ov ? 'over' : null;
            if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(sty)) { stack.push('b'); st.b++; continue; } }
          stack.push(k2 || null); if (k2) st[k2]++;
        } else { var kk = stack.pop(); if (kk) st[kk] = Math.max(0, st[kk] - 1); }
      }
    }
    pushText(html.slice(last));
    return items;
  }

  /* --- ảnh ----------------------------------------------------------- */
  function b64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function sniffImage(u8) {     // -> {type, w, h} hoặc null
    if (u8.length > 24 && u8[0] === 0x89 && u8[1] === 0x50) return { type: 'png', w: (u8[16] << 24 | u8[17] << 16 | u8[18] << 8 | u8[19]) >>> 0, h: (u8[20] << 24 | u8[21] << 16 | u8[22] << 8 | u8[23]) >>> 0 };
    if (u8.length > 10 && u8[0] === 0x47 && u8[1] === 0x49) return { type: 'gif', w: u8[6] | u8[7] << 8, h: u8[8] | u8[9] << 8 };
    if (u8.length > 4 && u8[0] === 0xFF && u8[1] === 0xD8) {
      var p = 2;
      while (p + 9 < u8.length) {
        if (u8[p] !== 0xFF) { p++; continue; }
        var mk = u8[p + 1];
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) return { type: 'jpg', h: u8[p + 5] << 8 | u8[p + 6], w: u8[p + 7] << 8 | u8[p + 8] };
        p += 2 + (u8[p + 2] << 8 | u8[p + 3]);
      }
      return { type: 'jpg', w: 400, h: 300 };
    }
    if (u8.length > 26 && u8[0] === 0x42 && u8[1] === 0x4D) return { type: 'bmp', w: u8[18] | u8[19] << 8, h: Math.abs(u8[22] | u8[23] << 8) };
    return null;
  }
  function isPlaceholderSrc(src) { return !src || /transparent\.(gif|png)|blank\.(gif|png)|^about:blank/i.test(src); }

  function canvasToPng(blob) {   // chỉ chạy trong trình duyệt: webp/svg -> png
    return new Promise(function (resolve) {
      if (typeof document === 'undefined') return resolve(null);
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = img.naturalWidth || 400; c.height = img.naturalHeight || 300;
          c.getContext('2d').drawImage(img, 0, 0);
          c.toBlob(function (b) { URL.revokeObjectURL(url); if (!b) return resolve(null); b.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); }); }, 'image/png');
        } catch (e) { URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function loadImage(src, fetcher) {
    if (isPlaceholderSrc(src)) return Promise.resolve(null);
    var p;
    var dm = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(src);
    if (dm) {
      try { p = Promise.resolve(dm[2] ? b64ToBytes(dm[3]) : new Uint8Array(Array.from(decodeURIComponent(dm[3])).map(function (c) { return c.charCodeAt(0); }))); }
      catch (e) { return Promise.resolve(null); }
    } else if (fetcher) {
      p = Promise.resolve(fetcher(src)).then(function (r) { return r ? (r instanceof Uint8Array ? r : new Uint8Array(r)) : null; });
    } else if (typeof fetch === 'function') {
      p = fetch(src).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(function (ab) { return new Uint8Array(ab); });
    } else return Promise.resolve(null);
    return p.then(function (u8) {
      if (!u8) return null;
      var info = sniffImage(u8);
      if (info) return { data: u8, type: info.type, w: info.w || 400, h: info.h || 300 };
      return canvasToPng(new Blob([u8])).then(function (png) {
        if (!png) return null;
        var i2 = sniffImage(png); return i2 ? { data: png, type: 'png', w: i2.w, h: i2.h } : null;
      });
    }).catch(function () { return null; });
  }

  /* ------------------------------------------------------------------ */
  /*  3. Dựng nội dung Word                                              */
  /* ------------------------------------------------------------------ */
  var FONT = 'Times New Roman';

  function inlineToChildren(html, ctx, base) {
    base = base || {};
    var items = tokenizeInline(html), out = [], pendingBreak = false, any = false;
    var sz = base.size || ctx.size;
    function rp(st, extra) {
      var o = { font: FONT, size: sz, bold: !!(base.bold || (st && st.b)), italics: !!(base.italics || (st && st.i)) };
      if (st && st.u) o.underline = {};
      if (st && st.sub) o.subScript = true;
      if (st && st.sup) o.superScript = true;
      if (base.color) o.color = base.color;
      return Object.assign(o, extra || {});
    }
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      if (it.t === 'blk') { if (any && !pendingBreak) pendingBreak = true; continue; }
      if (it.t === 'br') { out.push(new D.TextRun({ break: 1 })); pendingBreak = false; continue; }
      if (pendingBreak) { out.push(new D.TextRun({ break: 1 })); pendingBreak = false; }
      if (it.t === 'text') {
        var txt = it.v;
        if (!any) txt = txt.replace(/^\s+/, '');
        if (!txt) continue;
        any = true;
        if (it.st.over) out.push(texToMath('\\overline{\\text{' + txt.replace(/[{}\\]/g, '') + '}}'));
        else out.push(new D.TextRun(Object.assign({ text: txt }, rp(it.st))));
      } else if (it.t === 'math') {
        any = true; out.push(texToMath(it.v));
      } else if (it.t === 'img') {
        any = true;
        var im = ctx.images[it.src];
        if (!im) {
          out.push(new D.TextRun({ text: MISSING_IMG_TEXT, color: 'FF0000', bold: true, font: FONT, size: sz }));
          ctx.missingImages++;
        } else {
          var w = it.w || im.w, h = it.h || im.h;
          if (it.w && !it.h) h = it.w * im.h / im.w;
          if (it.h && !it.w) w = it.h * im.w / im.h;
          var s = Math.min(1, ctx.maxImgW / w, ctx.maxImgH / h);
          out.push(new D.ImageRun({ type: im.type, data: im.data, transformation: { width: Math.max(8, Math.round(w * s)), height: Math.max(8, Math.round(h * s)) },
            altText: { title: 'Hình', description: it.alt || 'Hình minh họa', name: 'img' } }));
        }
      }
    }
    return out;
  }

  function collectImageSrcs(html, set) {
    var re = /<img\b[^>]*>/gi, m;
    html = String(html == null ? '' : html);
    while ((m = re.exec(html))) {
      var a = parseAttrs(m[0]);
      if (a.src && !codecogsToLatex(a.src)) set[a.src] = 1;
    }
  }

  function noBorders() {
    var none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    return { top: none, bottom: none, left: none, right: none };
  }

  /** Số câu bắt đầu của từng phần.
   *  'restart'   : mỗi phần đánh lại từ Câu 1 (đúng mẫu ĐỀ GK/CK).
   *  'template'  : I 1..n, II nối tiếp, III & IV đánh lại từ 1 (đúng mẫu ĐÁP ÁN GK: Phần II ghi Câu 13, 14).
   *  'continuous': 1..N liên tục (đúng mẫu TX). */
  function startsFor(parts, scheme) {
    var n = { I: parts.I.length, II: parts.II.length, III: parts.III.length, IV: parts.IV.length };
    var st = scheme === 'continuous'
      ? { I: 1, II: 1 + n.I, III: 1 + n.I + n.II, IV: 1 + n.I + n.II + n.III }
      : (scheme === 'restart'
        ? { I: 1, II: 1, III: 1, IV: 1 }
        : { I: 1, II: 1 + n.I, III: 1, IV: 1 });
    var r = {};
    ['I', 'II', 'III', 'IV'].forEach(function (p) { if (n[p]) { r[p] = { start: st[p], end: st[p] + n[p] - 1 }; } });
    return r;
  }

  /** Nhận diện loại bài từ tên đề người dùng nhập: 'TX' | 'GK' | 'CK' | 'OTHER'. */
  function examKindOf(name) {
    var s = String(name == null ? '' : name).toUpperCase();
    if (/(^|[^A-Z0-9])TX\s*\d*([^A-Z0-9]|$)/.test(s) || /THƯỜNG\s*XUYÊN/.test(s)) return 'TX';
    if (/GIỮA\s*(KỲ|KÌ)/.test(s) || /(^|[^A-Z0-9])GK\s*\d*([^A-Z0-9]|$)/.test(s)) return 'GK';
    if (/CUỐI\s*(KỲ|KÌ)/.test(s) || /(^|[^A-Z0-9])CK\s*\d*([^A-Z0-9]|$)/.test(s)) return 'CK';
    return 'OTHER';
  }

  /** Chọn cách đánh số. 'auto' (mặc định): TX liên tục; GK/CK/khác: mỗi phần đánh lại từ 1;
   *  riêng ĐÁP ÁN GK giữ 'template' (Phần II: Câu 13, 14) đúng mẫu đáp án GK của trường. */
  function resolveNumbering(scheme, kind, mode) {
    if (scheme && scheme !== 'auto') return scheme;
    if (kind === 'TX') return 'continuous';
    if (kind === 'GK' && mode === 'answer') return 'template';
    return 'restart';
  }

  function buildExamData(exam, o) {
    // gom câu hỏi theo phần (giữ đúng logic generateExamHTML)
    var all = [];
    if (exam.parts) ['I', 'II', 'III', 'IV'].forEach(function (p) { (exam.parts[p] || []).forEach(function (q) { all.push({ q: q, part: p }); }); });
    else (exam.testData || exam.questions || []).forEach(function (q) { all.push({ q: q, part: null }); });
    var parts = { I: [], II: [], III: [], IV: [] };
    all.forEach(function (x) {
      var q = x.q; if (!q) return;
      var t = q.type === 'essay-multi' ? 'essay_multi' : q.type;
      var p = (o.partOf && o.partOf(t)) || x.part || 'IV';
      (parts[p] || parts.IV).push(q);
    });
    return parts;
  }

  var PART_NAME = { I: 'TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN', II: 'TRẮC NGHIỆM ĐÚNG/SAI', III: 'CÂU HỎI TRẢ LỜI NGẮN', IV: 'TỰ LUẬN' };
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  function buildDocument(examPackages, opt) {
    ensureDocx();
    var __opt = {};
    Object.keys(opt || {}).forEach(function (k) { var v = opt[k]; if (v !== undefined && v !== null && (v !== '' || k === 'answerNote')) __opt[k] = v; });
    var o = Object.assign({
      schoolYear: (function () { var y = new Date().getFullYear(); return (y - 1) + ' - ' + y; })(),
      department: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO KHÁNH HÒA',
      school: 'TRƯỜNG THPT NGUYỄN VĂN TRỖI',
      semester: 'HỌC KỲ II',
      subject: 'Vật lí',
      fontSize: 14,            // pt
      showRoom: true,          // false = ẩn dòng "Phòng thi" (kiểm tra tập trung, đề dùng chung các phòng)
      mode: 'exam',            // 'exam' = file đề | 'answer' = file đáp án
      numbering: 'auto',       // 'auto' = theo loại bài (TX liên tục; GK/CK mỗi phần đánh lại từ 1; đáp án GK: Phần II nối tiếp) | 'restart' | 'template' | 'continuous'
      answerNote: '✍️ Mọi cách làm đúng đều cho điểm tối đa, sai đơn vị trừ 0,25 điểm toàn bài.',
      partOf: null, markTag: null, images: {}
    }, __opt);
    var __numScheme = resolveNumbering(o.numbering, examKindOf(examPackages && examPackages[0] && examPackages[0].examName), o.mode);
    MATH_SZ = Math.round(o.fontSize * 2);
    var ctx = { size: Math.round(o.fontSize * 2), images: o.images || {}, maxImgW: 560, maxImgH: 420, missingImages: 0 };
    var PAGE_W = 11906, PAGE_H = 16838, MARGIN_X = 720, CONTENT_W = PAGE_W - 2 * MARGIN_X;   // 10466 dxa
    var small = Math.max(20, ctx.size - 2), tiny = Math.max(18, ctx.size - 4);
    var para = function (children, p) {
      p = Object.assign({}, p || {});
      p.spacing = Object.assign({ line: 276, lineRule: D.LineRuleType.AUTO }, p.spacing || {});
      return new D.Paragraph(Object.assign({ children: children }, p));
    };
    var run = function (text, r) { return new D.TextRun(Object.assign({ text: text, font: FONT, size: ctx.size }, r || {})); };
    var mark = function (q) { return o.markTag ? inlineToChildren(String(o.markTag(q) || ''), ctx) : []; };
    var sections = [];
    var cellMargins = { top: 40, bottom: 40, left: 80, right: 80 };
    var footerFor = function (leftText, wholeDoc) {
      return new D.Footer({ children: [para([
        run(leftText, { size: tiny }), new D.TextRun({ children: [new D.Tab(), 'Trang ', D.PageNumber.CURRENT, '/', wholeDoc ? D.PageNumber.TOTAL_PAGES : D.PageNumber.TOTAL_PAGES_IN_SECTION], font: FONT, size: tiny })],
        { tabStops: [{ type: D.TabStopType.RIGHT, position: CONTENT_W }], border: { top: { style: D.BorderStyle.SINGLE, size: 6, color: '000000', space: 4 } } })] });
    };
    var pageProps = function () {
      return { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 720, bottom: 1000, left: MARGIN_X, right: MARGIN_X, footer: 420, header: 360 },
        pageNumbers: { start: 1, formatType: D.NumberFormat.DECIMAL } } };
    };


    examPackages.forEach(function (exam) {
      var parts = buildExamData(exam, o);
      var grade = exam.grade || '10';
      var code = exam.code;
      var body = [];

      /* ---- đầu đề ---- */
      var hdrCell = function (children, w, align) {
        return new D.TableCell({ width: { size: w, type: D.WidthType.DXA }, borders: noBorders(), margins: cellMargins,
          children: [para(children, { alignment: align || D.AlignmentType.LEFT })] });
      };
      var half = CONTENT_W / 2;
      body.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA }, columnWidths: [half, half], borders: Object.assign({ insideHorizontal: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, noBorders()),
        rows: [
          new D.TableRow({ cantSplit: true, children: [
            hdrCell([run(o.department, { size: small })], half),
            hdrCell([run(exam.examName || 'ĐỀ KIỂM TRA CUỐI KỲ', { size: small, bold: true })], half, D.AlignmentType.RIGHT)] }),
          new D.TableRow({ cantSplit: true, children: [
            hdrCell([run(o.school, { size: small, bold: true })], half),
            hdrCell([run(o.semester + ' - NĂM HỌC ' + o.schoolYear, { size: small })], half, D.AlignmentType.RIGHT)] })
        ]
      }));
      body.push(para([run('Môn: ' + o.subject + ' - Khối ' + grade, { size: small, italics: true })], { alignment: D.AlignmentType.CENTER, spacing: { before: 200, after: 40 } }));
      body.push(para([run('(Đề kiểm tra có ', { size: small }), new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES_IN_SECTION], font: FONT, size: small }), run(' trang)', { size: small })], { alignment: D.AlignmentType.CENTER, spacing: { after: 40 } }));
      body.push(para([run('Thời gian làm bài ' + (exam.duration || 60) + ' phút, không kể thời gian phát đề', { size: small })], { alignment: D.AlignmentType.CENTER, spacing: { after: 120 } }));

      // thông tin thí sinh
      var line = { style: D.BorderStyle.SINGLE, size: 6, color: '000000', space: 1 };
      var leftW = 6300, rightW = CONTENT_W - leftW;
      var dots = function (label, tabPos) {
        return para([run(label, { size: small }), new D.TextRun({ children: [new D.Tab()], font: FONT, size: small })],
          { tabStops: [{ type: D.TabStopType.RIGHT, position: tabPos, leader: D.LeaderType.DOT }], spacing: { before: 40, after: 40 } });
      };
      var stuBorders = { top: line, bottom: line, left: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
      body.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA }, columnWidths: [leftW, rightW],
        borders: Object.assign({}, stuBorders, { insideHorizontal: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' } }),
        rows: [new D.TableRow({ cantSplit: true, children: [
          new D.TableCell({ width: { size: leftW, type: D.WidthType.DXA }, borders: noBorders(), margins: cellMargins,
            children: [dots('Họ và tên học sinh: ', leftW - 200), dots('Số báo danh: ', leftW - 200)] }),
          new D.TableCell({ width: { size: rightW, type: D.WidthType.DXA }, borders: noBorders(), margins: cellMargins,
            children: [dots('Lớp: ', rightW - 200),
              para([run('Mã đề: ', { size: small }), run(String(code), { size: small, bold: true })], { spacing: { before: 40, after: 40 } })]
              .concat(o.showRoom === false ? [] : [dots('Phòng thi: ', rightW - 200)]) })
        ] })]
      }));

      /* ---- các phần I–IV ---- */
      var ranges = startsFor(parts, __numScheme);

      ['I', 'II', 'III', 'IV'].forEach(function (pid) {
        var qs = parts[pid], rg = ranges[pid]; if (!rg) return;
        body.push(para([run('PHẦN ' + pid + '. ' + PART_NAME[pid], { bold: true })], { spacing: { before: 220, after: 60 }, keepNext: true }));
        var ins = pid === 'I' ? 'Thí sinh trả lời từ câu ' + rg.start + ' đến câu ' + rg.end + '. Mỗi câu hỏi thí sinh chỉ chọn một phương án.'
          : pid === 'II' ? 'Thí sinh trả lời từ câu ' + rg.start + ' đến câu ' + rg.end + '. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng (Đ) hoặc sai (S).'
            : 'Thí sinh trả lời từ câu ' + rg.start + ' đến câu ' + rg.end + '.';
        body.push(para([run(ins, { italics: true, size: small })], { spacing: { after: 80 }, keepNext: true }));

        qs.forEach(function (q, idx) {
          var no = rg.start + idx;
          var stem = [run('Câu ' + no + ': ', { bold: true })].concat(mark(q), inlineToChildren(q.mainQuestion || q.question || '', ctx));
          var hasKids = (q.type === 'multipleChoice' && q.choices && q.choices.length) || (q.type === 'trueFalse' && q.subQuestions && q.subQuestions.length) || q.type === 'essay_multi' || q.type === 'essay-multi';
          body.push(para(stem, { spacing: { before: 110, after: 30 }, keepNext: !!hasKids }));

          if (q.type === 'multipleChoice' && q.choices && q.choices.length) {
            var texts = q.choices.map(function (c) { return c.choice || c.text || ''; });
            var plainLen = texts.map(function (t) { return stripTags(t).replace(/\\[a-zA-Z]+|[{}\\]/g, '').length; });
            var hasImg = texts.some(function (t) { return /<img/i.test(t); });
            var mx = Math.max.apply(null, plainLen), cols = hasImg ? 1 : (mx <= 14 ? 4 : (mx <= 34 ? 2 : 1));
            var indent = 360, avail = CONTENT_W - indent;
            if (cols === 1) {
              texts.forEach(function (t, i) {
                body.push(para([run(LETTERS[i] + '. ', { bold: true })].concat(inlineToChildren(t, ctx)),
                  { indent: { left: indent + 360, hanging: 360 }, spacing: { before: 20, after: 20 }, keepNext: i < texts.length - 1, keepLines: true }));
              });
            } else {
              var step = Math.floor(avail / cols);
              for (var r0 = 0; r0 < texts.length; r0 += cols) {
                var ch = [], tabs = [];
                for (var c = 0; c < cols && r0 + c < texts.length; c++) {
                  if (c > 0) { ch.push(new D.TextRun({ children: [new D.Tab()], font: FONT, size: ctx.size })); tabs.push({ type: D.TabStopType.LEFT, position: indent + step * c }); }
                  ch.push(run(LETTERS[r0 + c] + '. ', { bold: true }));
                  ch = ch.concat(inlineToChildren(texts[r0 + c], ctx));
                }
                body.push(para(ch, { indent: { left: indent }, tabStops: tabs, spacing: { before: 20, after: 20 }, keepNext: r0 + cols < texts.length, keepLines: true }));
              }
            }
          } else if (q.type === 'trueFalse' && q.subQuestions && q.subQuestions.length) {
            var w1 = 520, w3 = 2300, w2 = CONTENT_W - 360 - w1 - w3;
            body.push(new D.Table({
              width: { size: CONTENT_W - 360, type: D.WidthType.DXA }, columnWidths: [w1, w2, w3], indent: { size: 360, type: D.WidthType.DXA },
              borders: Object.assign({ insideHorizontal: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, noBorders()),
              rows: q.subQuestions.map(function (s, i) {
                var box = function (t) { return [new D.TextRun({ text: '\u2610', font: 'Segoe UI Symbol', size: ctx.size }), run(' ' + t)]; };
                return new D.TableRow({ cantSplit: true, children: [
                  new D.TableCell({ width: { size: w1, type: D.WidthType.DXA }, borders: noBorders(), margins: { top: 30, bottom: 30, left: 0, right: 40 }, children: [para([run(String.fromCharCode(97 + i) + ')', { bold: true })])] }),
                  new D.TableCell({ width: { size: w2, type: D.WidthType.DXA }, borders: noBorders(), margins: { top: 30, bottom: 30, left: 60, right: 100 }, children: [para(inlineToChildren(s.question || '', ctx), { spacing: { line: 276, lineRule: D.LineRuleType.AUTO } })] }),
                  new D.TableCell({ width: { size: w3, type: D.WidthType.DXA }, borders: noBorders(), margins: { top: 30, bottom: 30, left: 40, right: 0 }, children: [para(box('Đúng').concat([run('    ')], box('Sai')), { alignment: D.AlignmentType.RIGHT })] })
                ] });
              })
            }));
          } else if (q.type === 'essay_multi' || q.type === 'essay-multi') {
            Object.keys(q.parts || {}).sort().forEach(function (k, i, arr) {
              body.push(para([run(k + ') ', { bold: true })].concat(inlineToChildren((q.parts[k] && q.parts[k].question) || '', ctx)),
                { indent: { left: 360 + 360, hanging: 360 }, spacing: { before: 60, after: 20 }, keepNext: true }));
              body.push(answerLine(o.answerLineGap || 480));
            });
          } else if (q.type === 'essay') {
            body.push(answerLine(o.answerLineGap || 600));
          }
        });
      });

      function answerLine(gap) {
        return para([], { spacing: { before: gap, after: 80 }, border: { bottom: { style: D.BorderStyle.DASHED, size: 4, color: '999999', space: 1 } } });
      }

      sections.push({ properties: Object.assign({ type: D.SectionType.NEXT_PAGE }, pageProps()), footers: { default: footerFor('Mã đề ' + code) }, children: body });

    });


    /* ================================================================== */
    /*  FILE ĐÁP ÁN – đúng mẫu đáp án của trường (lưới theo mã đề)         */
    /* ================================================================== */
    function buildAnswerSections() {
      var PER_Q = { I: 0.25, II: 1, III: 0.5, IV: 1 };
      var PER_ROW = 20;                                   // số cột câu tối đa mỗi bảng Phần I / III
      var num = function (v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; };
      var scoreOf = function (q, pid) { return num(q && q.score, PER_Q[pid]); };
      var plain = function (t) { return stripTags(t).replace(/\s+/g, ' ').trim(); };
      var firstAns = function (a) { return Array.isArray(a) ? a[0] : a; };
      var isTrueAns = function (v) {
        if (v === true || v === 1) return true;
        return ['true', 'đúng', 'dung', 'đ', '1'].indexOf(String(v == null ? '' : v).toLowerCase().trim()) !== -1;
      };
      var codeNum = function (c) { var n = parseInt(c, 10); return isNaN(n) ? 0 : n; };
      var exams = examPackages.map(function (ex) { return { code: String(ex.code), exam: ex, parts: buildExamData(ex, o) }; })
        .sort(function (a, b) { return (codeNum(a.code) - codeNum(b.code)) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0); });
      var first = exams[0];
      var maxLen = function (pid) { return Math.max.apply(null, exams.map(function (e) { return e.parts[pid].length; })); };
      var counts = { I: maxLen('I'), II: maxLen('II'), III: maxLen('III'), IV: maxLen('IV') };
      var __rg = startsFor({ I: new Array(counts.I), II: new Array(counts.II), III: new Array(counts.III), IV: new Array(counts.IV) }, __numScheme);
      var st = { I: (__rg.I || {}).start || 1, II: (__rg.II || {}).start || 1, III: (__rg.III || {}).start || 1, IV: (__rg.IV || {}).start || 1 };
      var groupBy = function (list, sig) {
        var map = {}, order = [];
        list.forEach(function (e) { var s = sig(e); if (!map[s]) { map[s] = []; order.push(s); } map[s].push(e); });
        return order.map(function (s) { return map[s]; });
      };
      var labelOf = function (grp) { return grp.map(function (e) { return e.code; }).join('-'); };

      var C = D.AlignmentType.CENTER, Lf = D.AlignmentType.LEFT;
      var tcell = function (children, w, p) {
        p = p || {};
        var cfg = { width: { size: w, type: D.WidthType.DXA }, margins: cellMargins, verticalAlign: D.VerticalAlign.CENTER,
          children: [para(children, { alignment: p.align || C, spacing: { before: 0, after: 0 } })] };
        if (p.rowSpan) cfg.rowSpan = p.rowSpan;
        if (p.fill) cfg.shading = { type: D.ShadingType.CLEAR, fill: p.fill, color: 'auto' };
        return new D.TableCell(cfg);
      };
      var tx = function (t, b) { return run(String(t), { size: small, bold: !!b }); };
      var HEAD = 'F2F2F2';
      var mkTable = function (widths, rows) { return new D.Table({ width: { size: widths.reduce(function (a, b) { return a + b; }, 0), type: D.WidthType.DXA }, columnWidths: widths, alignment: C, rows: rows }); };
      var heading = function (t) { return para([run(t, { bold: true })], { spacing: { before: 280, after: 100 }, keepNext: true }); };
      var spacer = function () { return para([], { spacing: { before: 0, after: 0 } }); };
      var ptsOf = function (pid) { var s = 0; first.parts[pid].forEach(function (q) { s += scoreOf(q, pid); }); return s; };
      var same = function (pid) { var v = first.parts[pid].map(function (q) { return scoreOf(q, pid); }); return v.length && v.every(function (x) { return x === v[0]; }) ? v[0] : null; };
      var ptsTxt = function (pid) { return fmtScore(Math.round(ptsOf(pid) * 100) / 100) + ' điểm'; };

      var kids = [];
      /* ---- tiêu đề ---- */
      var kind = String(first.exam.examName || 'ĐỀ KIỂM TRA CUỐI KỲ').replace(/^\s*ĐỀ\s+/i, '');
      var sem = /\bII\b|2\s*$/.test(o.semester) ? '2' : (/\bI\b|1\s*$/.test(o.semester) ? '1' : '');
      var title = o.answerTitle || ('ĐÁP ÁN BÀI ' + kind.toUpperCase() + (sem ? ' ' + sem : '') + '-' + String(o.schoolYear).replace(/\s*-\s*/, '/') + '-' + String(o.subject).toUpperCase() + ' ' + (first.exam.grade || ''));
      kids.push(para([run(title.trim(), { bold: true, size: ctx.size + 2 })], { alignment: C, spacing: { before: 60, after: 120 } }));

      /* ---- Phần I : hàng = mã đề, cột = câu ---- */
      if (counts.I) {
        var s1 = same('I');
        kids.push(heading('Phần I: Trắc nghiệm nhiều lựa chọn (' + ptsTxt('I') + (s1 !== null ? ' - ' + fmtScore(s1) + '/c' : '') + ')'));
        for (var c0 = 0; c0 < counts.I; c0 += PER_ROW) {
          var n = Math.min(PER_ROW, counts.I - c0), w0 = 1300, wc = Math.floor((CONTENT_W - w0) / n), ws = [w0];
          for (var k = 0; k < n; k++) ws.push(wc);
          var rows = [new D.TableRow({ cantSplit: true, tableHeader: true, children: [tcell([tx('Mã đề', true)], w0, { fill: HEAD })].concat(
            ws.slice(1).map(function (w, i) { return tcell([tx(c0 + i + st.I, true)], w, { fill: HEAD }); })) })];
          exams.forEach(function (e) {
            rows.push(new D.TableRow({ cantSplit: true, children: [tcell([tx(e.code, true)], w0, { fill: HEAD })].concat(
              ws.slice(1).map(function (w, i) {
                var q = e.parts.I[c0 + i], ci = q && q.choices ? q.choices.findIndex(function (c) { return c.isCorrect === true || c.answer === 'true'; }) : -1;
                return tcell([tx(q ? (ci !== -1 ? LETTERS[ci] : '?') : '')], w);
              })) }));
          });
          kids.push(mkTable(ws, rows)); kids.push(spacer());
        }
      }

      /* ---- Phần II : cột = nhóm mã đề có cùng đáp án, hàng = câu + ý ---- */
      if (counts.II) {
        kids.push(heading('Phần II: Trắc nghiệm đúng sai (' + ptsTxt('II') + ' - 1 điểm/c; 1ý/c: 0,1đ, 2ý/c: 0,25đ, 3ý/c: 0,5đ, 4ý/c: 1đ)'));
        var tfSig = function (e) { return e.parts.II.map(function (q) { return (q.subQuestions || []).map(function (s) { return isTrueAns(s.answer) ? 'Đ' : 'S'; }).join(''); }).join('|'); };
        var groups = groupBy(exams, tfSig);
        var wq = 1500, wy = 800, wg = Math.floor((CONTENT_W - wq - wy) / groups.length), ws2 = [wq, wy];
        groups.forEach(function () { ws2.push(wg); });
        var rows2 = [new D.TableRow({ cantSplit: true, tableHeader: true, children: [tcell([tx('Mã đề', true)], wq, { fill: HEAD }), tcell([], wy, { fill: HEAD })].concat(
          groups.map(function (g) { return tcell([tx(labelOf(g), true)], wg, { fill: HEAD }); })) })];
        for (var qi = 0; qi < counts.II; qi++) {
          var subN = Math.max.apply(null, exams.map(function (e) { return ((e.parts.II[qi] && e.parts.II[qi].subQuestions) || []).length; })) || 1;
          for (var si = 0; si < subN; si++) {
            var cells = [];
            if (si === 0) cells.push(tcell([tx('Câu ' + (st.II + qi), true)], wq, { fill: HEAD, rowSpan: subN }));
            cells.push(tcell([tx(String.fromCharCode(97 + si) + ')', true)], wy, { fill: HEAD }));
            groups.forEach(function (g) {
              var q = g[0].parts.II[qi], s = q && q.subQuestions && q.subQuestions[si];
              cells.push(tcell([tx(s ? (isTrueAns(s.answer) ? 'Đ' : 'S') : '')], wg));
            });
            rows2.push(new D.TableRow({ cantSplit: true, children: cells }));
          }
        }
        kids.push(mkTable(ws2, rows2)); kids.push(spacer());
      }

      /* ---- Phần III : hàng = nhóm mã đề có cùng đáp án, cột = câu ---- */
      if (counts.III) {
        var s3 = same('III');
        kids.push(heading('Phần III. Trắc nghiệm trả lời ngắn (' + ptsTxt('III') + (s3 !== null ? ' ; ' + fmtScore(s3) + 'đ/c' : '') + ')'));
        var shSig = function (e) { return e.parts.III.map(function (q) { return plain(firstAns(q.answer)); }).join('|'); };
        var g3 = groupBy(exams, shSig);
        for (var d0 = 0; d0 < counts.III; d0 += PER_ROW) {
          var m = Math.min(PER_ROW, counts.III - d0), wl = 1700, wk = Math.floor((CONTENT_W - wl) / m), ws3 = [wl];
          for (var kk = 0; kk < m; kk++) ws3.push(wk);
          var rows3 = [new D.TableRow({ cantSplit: true, tableHeader: true, children: [tcell([tx('Mã đề', true)], wl, { fill: HEAD })].concat(
            ws3.slice(1).map(function (w, i) { return tcell([tx('Câu ' + (st.III + d0 + i), true)], w, { fill: HEAD }); })) })];
          g3.forEach(function (g) {
            rows3.push(new D.TableRow({ cantSplit: true, children: [tcell([tx(labelOf(g), true)], wl, { fill: HEAD })].concat(
              ws3.slice(1).map(function (w, i) {
                var q = g[0].parts.III[d0 + i], a = q ? firstAns(q.answer) : '';
                return tcell(q ? (plain(a) === '' ? [tx('Xem hướng dẫn chấm')] : inlineToChildren(String(a), ctx, { size: small })) : [tx('')], w);
              })) }));
          });
          kids.push(mkTable(ws3, rows3)); kids.push(spacer());
        }
      }

      /* ---- Phần IV : tự luận – đáp án / hướng dẫn chấm theo câu, ý ---- */
      if (counts.IV) {
        var s4 = same('IV');
        kids.push(heading('Phần IV. Tự luận (' + ptsTxt('IV') + (s4 !== null ? ' ; ' + fmtScore(s4) + 'đ/c' : '') + ')'));
        var essSig = function (e) {
          return e.parts.IV.map(function (q) { return (q.ID || '') + '#' + plain(firstAns(q.answer)) + '#' + Object.keys(q.parts || {}).sort().map(function (k) { return plain(firstAns(q.parts[k] && q.parts[k].answer)); }).join('~'); }).join('|');
        };
        var g4 = groupBy(exams, essSig);
        var W4 = [1100, 800, CONTENT_W - 1100 - 800 - 1500, 1500];
        g4.forEach(function (g) {
          if (g4.length > 1) kids.push(para([run('Mã đề ' + labelOf(g), { bold: true, size: small })], { spacing: { before: 120, after: 60 }, keepNext: true }));
          var rows4 = [new D.TableRow({ cantSplit: true, tableHeader: true, children: [tcell([tx('Câu', true)], W4[0], { fill: HEAD }), tcell([tx('Ý', true)], W4[1], { fill: HEAD }), tcell([tx('Đáp án / Hướng dẫn chấm', true)], W4[2], { fill: HEAD }), tcell([tx('Điểm', true)], W4[3], { fill: HEAD })] })];
          g[0].parts.IV.forEach(function (q, qi) {
            var total = scoreOf(q, 'IV'), pk = Object.keys(q.parts || {}).sort();
            var body = function (a, sol) { var t = plain(firstAns(a)) !== '' ? firstAns(a) : sol; return plain(t) === '' ? [tx('Xem hướng dẫn chấm chi tiết')] : inlineToChildren(String(t), ctx, { size: small }); };
            if (pk.length) {
              pk.forEach(function (k, i) {
                var pt = q.parts[k] || {};
                var cells = [];
                if (i === 0) cells.push(tcell([tx('Câu ' + (st.IV + qi), true)], W4[0], { fill: HEAD, rowSpan: pk.length }));
                cells.push(tcell([tx(k + ')', true)], W4[1], { fill: HEAD }));
                cells.push(tcell(body(pt.answer, pt.solution), W4[2], { align: Lf }));
                cells.push(tcell([tx(fmtScore(Math.round(total / pk.length * 100) / 100))], W4[3]));
                rows4.push(new D.TableRow({ cantSplit: true, children: cells }));
              });
            } else {
              rows4.push(new D.TableRow({ cantSplit: true, children: [
                tcell([tx('Câu ' + (st.IV + qi), true)], W4[0], { fill: HEAD }), tcell([tx('')], W4[1], { fill: HEAD }),
                tcell(body(q.answer, q.solution), W4[2], { align: Lf }), tcell([tx(fmtScore(total))], W4[3])] }));
            }
          });
          kids.push(mkTable(W4, rows4)); kids.push(spacer());
        });
      }

      if (o.answerNote) kids.push(para([run(o.answerNote, { italics: true, size: small })], { spacing: { before: 200, after: 0 } }));
      return [{ properties: pageProps(), footers: { default: footerFor('Đáp án – ' + o.subject + ' ' + (first.exam.grade || ''), true) }, children: kids }];
    }


    var doc = new D.Document({
      creator: 'Exam Export', title: o.mode === 'answer' ? 'Đáp án' : 'Đề thi',
      styles: { default: { document: { run: { font: FONT, size: ctx.size }, paragraph: { spacing: { line: 276, lineRule: D.LineRuleType.AUTO } } } } },
      sections: (o.mode === 'answer') ? buildAnswerSections() : sections
    });
    doc.__missingImages = ctx.missingImages;
    return doc;
  }

  /** Thu thập & tải trước toàn bộ hình trong gói đề -> {src: {data,type,w,h} | null} */
  function prefetchImages(examPackages, fetcher) {
    var set = {};
    examPackages.forEach(function (exam) {
      var qs = [];
      if (exam.parts) ['I', 'II', 'III', 'IV'].forEach(function (p) { qs = qs.concat(exam.parts[p] || []); });
      else qs = exam.testData || exam.questions || [];
      qs.forEach(function (q) {
        if (!q) return;
        collectImageSrcs(q.mainQuestion || q.question || '', set);
        (q.choices || []).forEach(function (c) { collectImageSrcs(c.choice || c.text || '', set); });
        (q.subQuestions || []).forEach(function (s) { collectImageSrcs(s.question || '', set); });
        Object.keys(q.parts || {}).forEach(function (k) { collectImageSrcs((q.parts[k] && q.parts[k].question) || '', set); });
        collectImageSrcs(Array.isArray(q.answer) ? q.answer[0] : q.answer, set);
      });
    });
    var srcs = Object.keys(set), map = {};
    return Promise.all(srcs.map(function (s) { return loadImage(s, fetcher).then(function (r) { map[s] = r; }); })).then(function () { return map; });
  }

  function build(examPackages, opt) {
    opt = opt || {};
    return prefetchImages(examPackages, opt.imageFetcher).then(function (images) {
      return buildDocument(examPackages, Object.assign({}, opt, { images: images }));
    });
  }

  function toBlob(doc) { return D.Packer.toBlob(doc); }
  function toBuffer(doc) { return D.Packer.toBuffer(doc); }

  /** Dựng đồng thời 2 tài liệu: đề (mọi mã đề, mỗi mã đề một section sang trang mới, đánh số trang lại từ 1) và đáp án (theo mẫu). */
  function buildBoth(examPackages, opt) {
    opt = opt || {};
    return prefetchImages(examPackages, opt.imageFetcher).then(function (images) {
      var base = Object.assign({}, opt, { images: images });
      return {
        exam: buildDocument(examPackages, Object.assign({}, base, { mode: 'exam' })),
        answer: buildDocument(examPackages, Object.assign({}, base, { mode: 'answer' }))
      };
    });
  }

  function stampNow() { return new Date().toISOString().slice(0, 19).replace(/:/g, '-'); }
  function saveBlob(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /** Dựng và tải xuống HAI file: De_thi_*.docx và Dap_an_*.docx. Trả về { missingImages, files } */
  function download(examPackages, opt) {
    opt = opt || {};
    return Promise.resolve(loadDocx()).then(function () { return buildBoth(examPackages, opt); }).then(function (docs) {
      return Promise.all([D.Packer.toBlob(docs.exam), D.Packer.toBlob(docs.answer)]).then(function (blobs) {
        var st = stampNow();
        var names = [(opt.examFileName || 'De_thi') + '_' + st + '.docx', (opt.answerFileName || 'Dap_an') + '_' + st + '.docx'];
        saveBlob(blobs[0], names[0]);
        setTimeout(function () { saveBlob(blobs[1], names[1]); }, 800);   // giãn nhịp để trình duyệt không chặn tải 2 file liên tiếp
        return { missingImages: (docs.exam.__missingImages || 0), files: names };
      });
    });
  }

  return { build: build, buildBoth: buildBoth, buildDocument: buildDocument, download: download, toBlob: toBlob, toBuffer: toBuffer, texToMath: texToMath, parseTeX: parseTeX,
    prefetchImages: prefetchImages, loadDocx: loadDocx, version: '2.0' };
});
