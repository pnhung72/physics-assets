/*!
 * luyende_drive.js  v1.9
 * Chế độ "Luyện đề" của TestOnline lấy đề từ Google Drive (De_<mã>_<năm>.docx + Da_<mã>_<năm>.docx).
 * - Đọc nguyên file .docx: chữ, công thức Word (OMML -> LaTeX), công thức MathType (OLE/MTEF -> LaTeX), ảnh, đồ thị vẽ bằng khung hình (-> SVG), bảng.
 * - Xáo thứ tự câu và phương án A-D của PHẦN I mỗi lần mở đề.
 * - Đẩy đề vào đúng cấu trúc currentTest của TestOnline: đồng hồ, chống gian lận, chấm điểm dùng lại như các chế độ khác.
 * Dán thẻ <script src=".../luyende_drive.js"></script> ở CUỐI file TestOnline (sau mọi script khác).
 */
(function (root) {
  // ===================== CẤU HÌNH =====================
  var CFG = {
    api: 'https://script.google.com/macros/s/AKfycby3afxdLUYnOwgGrn3SoFAtQYUlF7QlE9mbvSBOABGDVIlXFW6z93APJqaWsnr8eb9Ozw/exec',
    folders: {
      '10': { TX1: '1_GTP5wCXa7onGk4iAYX1Ts4Ps1poinNQ', TX2: '1ip_tnq96cVLtTtBxhFPtKYoGiuiQfZA4', TX4: '1lI166A9Xwh0iHQxMyIYvPpYqukp5_q9A', TX5: '1SoByDxZwC-X89Btr_IlW4sH_s1ttlfJe',
              GK1: '19Rp2lfy9qcJuyCaM9yEcruOXL2V9nu8F', CK1: '1Fu5kC_rMeG_sBSqbxGBiA5O5Q80eA2Jo', GK2: '1EE3Iy9HI_EkNHaxJcuLNEzmo-hHclm-h', CK2: '1yaxmGHO-n11gytik6mXw26IJhmD9ExZi' },
      '11': { TX1: '1WrrQJzehWRePGlP9prCUKEzqjchVWde7', TX2: '1k9G-f1iiSDPL-CN9JeheLwvoLhOkUNT2', TX4: '1HckVVWWzhpWl4A_WlyYSwX8Woic_NbUP', TX5: '1TpJpg9UuJkqXuck_CQa2p0IsduEP8vce',
              GK1: '1qU8iSwBfOcVwvCA_r4wSOfKlF2gV20op', CK1: '1PY4lI5BnDbEQOK-7rocrGDPfrxbZaPlu', GK2: '1u_XU6sMw52INVOYj2vf5_0LsJpqK2jja', CK2: '1h0y5s1ZnYJqoJGRz4B4h8lqkp_vPEous' }
      // Lớp 12: thêm sau, dạng '12': { GK1: '...', ... }
    },
    defaultMinutes: { TX: 15, GK: 45, CK: 45 },
    devKey: ''   // đặt chuỗi bí mật của riêng anh/chị qua window.LUYENDE_DRIVE_CONFIG = { devKey: '...' } để bật cờ nhà phát triển
  };
  if (root.LUYENDE_DRIVE_CONFIG) { for (var k in root.LUYENDE_DRIVE_CONFIG) CFG[k] = root.LUYENDE_DRIVE_CONFIG[k]; }

  var EMU_PX = 9525;
  var NAME_RE = /^(De|Da)_(\d{4})_(\d{4})(\.docx)?$/i;

  // ===================== TIỆN ÍCH XML =====================
  function kids(n) { var r = [], c = n && n.childNodes || []; for (var i = 0; i < c.length; i++) if (c[i].nodeType === 1) r.push(c[i]); return r; }
  function child(n, name) { var a = kids(n); for (var i = 0; i < a.length; i++) if (a[i].nodeName === name) return a[i]; return null; }
  function desc(n, name) { return n.getElementsByTagName(name); }
  function at(n, name) { return n && n.getAttribute ? n.getAttribute(name) : null; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function stripTags(h) { return String(h).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }

  // ===================== OMML -> LaTeX =====================
  var SYM = { 'Δ': '\\Delta ', 'δ': '\\delta ', 'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'λ': '\\lambda ', 'μ': '\\mu ', 'π': '\\pi ', 'ρ': '\\rho ', 'σ': '\\sigma ', 'τ': '\\tau ', 'ω': '\\omega ', 'Ω': '\\Omega ', 'θ': '\\theta ', 'φ': '\\varphi ', 'ε': '\\varepsilon ', 'η': '\\eta ', 'Σ': '\\Sigma ',
    '±': '\\pm ', '∓': '\\mp ', '×': '\\times ', '·': '\\cdot ', '⋅': '\\cdot ', '≈': '\\approx ', '≠': '\\neq ', '≤': '\\leq ', '≥': '\\geq ', '→': '\\rightarrow ', '←': '\\leftarrow ', '∞': '\\infty ', '°': '^{\\circ}', '−': '-', '∙': '\\cdot ', '÷': '\\div ', '∑': '\\sum ', '∫': '\\int ', '√': '\\sqrt{}', '%': '\\%', '#': '\\#', '&': '\\&', '_': '\\_', '{': '\\{', '}': '\\}' };
  function latexText(t) {
    var out = '';
    for (var i = 0; i < t.length; i++) { var ch = t.charAt(i); out += (SYM[ch] !== undefined) ? SYM[ch] : (ch === ' ' ? '\\ ' : ch); }
    return out;
  }
  function omml(n) {
    var name = n.nodeName, ks = kids(n);
    function sub(nm) { var c = child(n, nm); return c ? omml(c) : ''; }
    function all() { var s = ''; ks.forEach(function (c) { s += omml(c); }); return s; }
    switch (name) {
      case 'm:r': { var s = ''; ks.forEach(function (c) { if (c.nodeName === 'm:t') s += latexText(c.textContent); }); return s; }
      case 'm:t': return latexText(n.textContent);
      case 'm:f': { var pr = child(n, 'm:fPr'), ty = pr && child(pr, 'm:type'); if (ty && at(ty, 'm:val') === 'lin') return sub('m:num') + '/' + sub('m:den'); return '\\frac{' + sub('m:num') + '}{' + sub('m:den') + '}'; }
      case 'm:sSub': return '{' + sub('m:e') + '}_{' + sub('m:sub') + '}';
      case 'm:sSup': return '{' + sub('m:e') + '}^{' + sub('m:sup') + '}';
      case 'm:sSubSup': return '{' + sub('m:e') + '}_{' + sub('m:sub') + '}^{' + sub('m:sup') + '}';
      case 'm:rad': { var dg = child(n, 'm:deg'), dgs = dg ? omml(dg) : ''; return dgs ? '\\sqrt[' + dgs + ']{' + sub('m:e') + '}' : '\\sqrt{' + sub('m:e') + '}'; }
      case 'm:acc': {
        var ap = child(n, 'm:accPr'), ch = ap && child(ap, 'm:chr'), c = ch ? at(ch, 'm:val') : '̂', e = sub('m:e');
        if (c === '̅' || c === '¯' || c === 'ˉ' || c === '‾') return '\\overline{' + e + '}';
        if (c === '⃗' || c === '→') return '\\vec{' + e + '}';
        if (c === '̇' || c === '˙') return '\\dot{' + e + '}';
        if (c === '̃' || c === '~') return '\\tilde{' + e + '}';
        return '\\hat{' + e + '}';
      }
      case 'm:bar': { var bp = child(n, 'm:barPr'), pos = bp && child(bp, 'm:pos'); return (pos && at(pos, 'm:val') === 'bot') ? '\\underline{' + sub('m:e') + '}' : '\\overline{' + sub('m:e') + '}'; }
      case 'm:d': {
        var dp = child(n, 'm:dPr'), b = dp && child(dp, 'm:begChr'), e2 = dp && child(dp, 'm:endChr'), sp = dp && child(dp, 'm:sepChr');
        var bc = b ? at(b, 'm:val') : '(', ec = e2 ? at(e2, 'm:val') : ')', sc = sp ? at(sp, 'm:val') : '|';
        var parts = ks.filter(function (c) { return c.nodeName === 'm:e'; }).map(omml);
        function dl(x, left) { if (x === '' || x == null) return '.'; if (x === '{') return '\\{'; if (x === '}') return '\\}'; if (x === '|') return '|'; if (x === '‖') return '\\|'; if (x === '⟨') return '\\langle'; if (x === '⟩') return '\\rangle'; return x; }
        return '\\left' + dl(bc) + parts.join(sc) + '\\right' + dl(ec);
      }
      case 'm:nary': {
        var np = child(n, 'm:naryPr'), cc = np && child(np, 'm:chr'), op = cc ? at(cc, 'm:val') : '∫';
        var opL = op === '∑' ? '\\sum' : op === '∏' ? '\\prod' : op === '∮' ? '\\oint' : '\\int';
        var lo = sub('m:sub'), hi = sub('m:sup');
        return opL + (lo ? '_{' + lo + '}' : '') + (hi ? '^{' + hi + '}' : '') + ' ' + sub('m:e');
      }
      case 'm:func': return '\\mathrm{' + sub('m:fName') + '}' + sub('m:e');
      case 'm:limLow': return '{' + sub('m:e') + '}_{' + sub('m:lim') + '}';
      case 'm:limUpp': return '{' + sub('m:e') + '}^{' + sub('m:lim') + '}';
      case 'm:groupChr': case 'm:box': case 'm:phant': case 'm:borderBox': return sub('m:e');
      case 'm:eqArr': return '\\begin{aligned}' + ks.filter(function (c) { return c.nodeName === 'm:e'; }).map(omml).join('\\\\') + '\\end{aligned}';
      case 'm:m': return '\\begin{matrix}' + ks.filter(function (c) { return c.nodeName === 'm:mr'; }).map(function (r) { return kids(r).filter(function (c) { return c.nodeName === 'm:e'; }).map(omml).join('&'); }).join('\\\\') + '\\end{matrix}';
      case 'm:sPre': return '{}_{' + sub('m:sub') + '}^{' + sub('m:sup') + '}' + sub('m:e');
      case 'm:fName': case 'm:e': case 'm:num': case 'm:den': case 'm:sub': case 'm:sup': case 'm:lim': case 'm:deg': case 'm:oMath': return all();
      default:
        if (/Pr$/.test(name)) return '';   // m:rPr, m:fPr, m:ctrlPr ...
        return all();
    }
  }
  function mathWrap(latex) {
    latex = String(latex).replace(/\$/g, '').replace(/\s*\n\s*/g, ' ').trim();
    var prev; do { prev = latex; latex = latex.replace(/^(?:\\ |\\,|\\;|\\quad\s*)+/, '').replace(/(?:\\ |\\,|\\;|\\quad\s*|~)+$/, '').trim(); } while (latex !== prev);
    latex = latex.replace(/\\+$/, '').trim();   // không để lại dấu \ đơn độc ngay trước $ đóng
    return latex ? '$' + esc(latex) + '$' : '';
  }

  // ===================== HÌNH VẼ: nhóm khung hình -> SVG =====================
  // ===================== MATHTYPE (OLE "Equation Native" / MTEF) -> LaTeX =====================
  // Công thức MathType trong .docx là đối tượng nhúng (word/embeddings/oleObjectN.bin) kèm ảnh WMF (trình duyệt không vẽ được WMF),
  // nên phải đọc trực tiếp dữ liệu MTEF bên trong rồi đổi sang LaTeX.
  function cfbStream(u8, wantName) {
    if (!u8 || u8.length < 512 || u8[0] !== 0xD0 || u8[1] !== 0xCF || u8[2] !== 0x11 || u8[3] !== 0xE0) return null;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
    var dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true), miniStart = dv.getUint32(60, true), difStart = dv.getUint32(68, true), nDif = dv.getUint32(72, true);
    var END = 0xFFFFFFFA;
    function secOff(id) { return (id + 1) * ss; }
    var fatSecs = [], i, j;
    for (i = 0; i < 109; i++) { var v = dv.getUint32(76 + i * 4, true); if (v >= END) break; fatSecs.push(v); }
    var ds = difStart;
    for (i = 0; i < nDif && ds < END; i++) {
      var off = secOff(ds); if (off + ss > u8.length) break;
      for (j = 0; j < ss / 4 - 1; j++) { var w = dv.getUint32(off + j * 4, true); if (w < END) fatSecs.push(w); }
      ds = dv.getUint32(off + ss - 4, true);
    }
    var fat = [];
    fatSecs.forEach(function (s) { var off = secOff(s); if (off + ss > u8.length) return; for (var k = 0; k < ss / 4; k++) fat.push(dv.getUint32(off + k * 4, true)); });
    function chain(start) { var out = [], s = start, guard = 0; while (s < END && guard++ < 100000) { out.push(s); s = fat[s]; if (s === undefined) break; } return out; }
    function readChain(start) {
      var secs = chain(start), out = new Uint8Array(secs.length * ss), n = 0;
      secs.forEach(function (s) { var off = secOff(s); if (off + ss <= u8.length) out.set(u8.subarray(off, off + ss), n); n += ss; });
      return out;
    }
    var dir = readChain(dirStart), root = null, ent = null;
    for (i = 0; i + 128 <= dir.length; i += 128) {
      var dd = new DataView(dir.buffer, dir.byteOffset + i, 128), nl = dd.getUint16(64, true), name = '';
      for (j = 0; j + 2 <= nl - 2 && j < 62; j += 2) name += String.fromCharCode(dd.getUint16(j, true));
      var ty = dir[i + 66], st = dd.getUint32(116, true), sz = dd.getUint32(120, true);
      if (ty === 5) root = { start: st, size: sz };
      if (ty === 2 && name === wantName) ent = { start: st, size: sz };
    }
    if (!ent) return null;
    if (ent.size >= cutoff || !root) return readChain(ent.start).subarray(0, ent.size);
    var mini = readChain(root.start), mf = readChain(miniStart), mfat = [];
    var mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
    for (i = 0; i + 4 <= mf.length; i += 4) mfat.push(mdv.getUint32(i, true));
    var out = new Uint8Array(ent.size), n = 0, s = ent.start, guard = 0;
    while (s < END && n < ent.size && guard++ < 100000) {
      var o = s * mss, take = Math.min(mss, ent.size - n);
      out.set(mini.subarray(o, o + take), n); n += take; s = mfat[s]; if (s === undefined) break;
    }
    return out;
  }

  var MT_FN = { sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1, log: 1, ln: 1, lim: 1, max: 1, min: 1, exp: 1, arcsin: 1, arccos: 1, arctan: 1, sinh: 1, cosh: 1, tanh: 1, det: 1, deg: 1, lg: 1 };
  var MT_EXTRA = { 0x2212: '-', 0x2013: '-', 0x2014: '-', 0x2032: "'", 0x2033: "''", 0x22C5: '\\cdot ', 0x2219: '\\cdot ', 0x00D7: '\\times ', 0x2260: '\\neq ', 0x2264: '\\leq ', 0x2265: '\\geq ', 0x2248: '\\approx ', 0x2261: '\\equiv ', 0x221D: '\\propto ',
    0x2208: '\\in ', 0x2209: '\\notin ', 0x2202: '\\partial ', 0x2207: '\\nabla ', 0x21D2: '\\Rightarrow ', 0x21D4: '\\Leftrightarrow ', 0x2192: '\\rightarrow ', 0x2190: '\\leftarrow ', 0x2194: '\\leftrightarrow ', 0x2191: '\\uparrow ', 0x2193: '\\downarrow ',
    0x00B1: '\\pm ', 0x2213: '\\mp ', 0x221E: '\\infty ', 0x00B0: '^{\\circ}', 0x2218: '\\circ ', 0x22A5: '\\perp ', 0x2225: '\\parallel ', 0x2220: '\\angle ', 0x2234: '\\therefore ', 0x2026: '\\ldots ', 0x22EF: '\\cdots ',
    0x03D5: '\\phi ', 0x03C6: '\\varphi ', 0x03D1: '\\vartheta ', 0x03B8: '\\theta ', 0x03B5: '\\varepsilon ', 0x03F5: '\\epsilon ', 0x03BE: '\\xi ', 0x03C7: '\\chi ', 0x03C8: '\\psi ', 0x03B6: '\\zeta ', 0x03B9: '\\iota ', 0x03BA: '\\kappa ', 0x03BD: '\\nu ', 0x03BF: 'o ',
    0x0393: '\\Gamma ', 0x0394: '\\Delta ', 0x0398: '\\Theta ', 0x039B: '\\Lambda ', 0x039E: '\\Xi ', 0x03A0: '\\Pi ', 0x03A3: '\\Sigma ', 0x03A6: '\\Phi ', 0x03A8: '\\Psi ', 0x03A9: '\\Omega ', 0x00B7: '\\cdot ', 0x2211: '\\sum ', 0x222B: '\\int ', 0x221A: '\\surd ', 0x00A0: '\\ ', 0x2009: '\\, ', 0x2002: '\\ ', 0x2003: '\\quad ' };
  // Bảng mã Symbol (Equation Editor 3.0 / MTEF v3: ký tự 8-bit trong phông Symbol)
  var SYMBOL8 = { 0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η', 0x69: 'ι', 0x6B: 'κ', 0x6C: 'λ', 0x6D: 'μ', 0x6E: 'ν', 0x6F: 'ο', 0x70: 'π', 0x71: 'θ', 0x72: 'ρ', 0x73: 'σ', 0x74: 'τ', 0x75: 'υ', 0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7A: 'ζ',
    0x44: 'Δ', 0x46: 'Φ', 0x47: 'Γ', 0x51: 'Θ', 0x4C: 'Λ', 0x50: 'Π', 0x53: 'Σ', 0x57: 'Ω', 0x58: 'Ξ', 0x59: 'Ψ', 0xB1: '±', 0xB4: '×', 0xB7: '·', 0xA3: '≤', 0xB3: '≥', 0xB9: '≠', 0xBB: '≈', 0xAE: '→', 0xAC: '←', 0xA5: '∞', 0xB0: '°', 0xB6: '∂', 0xD1: '∇', 0xB5: '∝', 0xD6: '√', 0xE5: '∑', 0xF2: '∫', 0x2D: '−' };

  function mtChar(n, ver) {
    var code = n.mt;
    if (ver < 5 || code === undefined || code === null) {   // MTEF v3: chỉ có mã 8-bit
      var c8 = n.c8 !== undefined ? n.c8 : code;
      var tf = n.tf;
      if ((tf === 4 || tf === 5 || tf === 6) && SYMBOL8[c8]) code = SYMBOL8[c8].charCodeAt(0); else code = c8;
    }
    if (code >= 0xF000 && code <= 0xF0FF) code -= 0xF000;   // vùng riêng của phông Symbol
    if (MT_EXTRA[code] !== undefined) return MT_EXTRA[code];
    var ch = String.fromCharCode(code);
    return latexText(ch);
  }

  function mtefParse(d, hdr) {
    var p = hdr, ver = d[p++];
    if (ver !== 5 && ver !== 3) return null;
    p += 4;   // platform, product, version, subversion
    if (ver === 5) { while (p < d.length && d[p] !== 0) p++; p++; p++; }   // chuỗi app key + byte tuỳ chọn
    function u16() { var v = d[p] | (d[p + 1] << 8); p += 2; return v; }
    function nudge() { var a = d[p++], b = d[p++]; if (a === 128 && b === 128) p += 4; }
    function nibArray() {
      var n = d[p++], half = false, cur = 0;
      function nib() { var v; if (!half) { cur = d[p++]; v = cur >> 4; half = true; } else { v = cur & 15; half = false; } return v; }
      for (var i = 0; i < n; i++) { nib(); var g = 0; while (g++ < 40 && nib() !== 15) { } }
      // (nếu dừng ở giữa byte thì bỏ nửa byte còn lại: p đã trỏ sau byte đó)
    }
    function list(depth) {
      var out = [];
      while (p < d.length) {
        var tag = d[p++], o, n, i;
        switch (tag) {
          case 0: return out;
          case 1: { o = d[p++]; if (o & 8) nudge(); if (o & 4) p += 2; if (o & 2) { p++; var ns = d[p++]; p += ns * 3; } out.push({ t: 'line', nul: !!(o & 1), k: (o & 1) ? [] : list(depth + 1) }); break; }
          case 2: {
            o = d[p++]; if (o & 8) nudge(); var node = { t: 'ch', tf: d[p++] - 128 };
            if (!(o & 0x20)) node.mt = u16();
            if (o & 4) node.c8 = d[p++]; else if (o & 0x10) node.c8 = u16();
            if (ver === 3 && node.mt === undefined) { node.c8 = node.c8; }
            if (o & 1) node.em = list(depth + 1);
            out.push(node); break;
          }
          case 3: {
            o = d[p++]; if (o & 8) nudge(); var sel = d[p++], va = d[p++]; if (va & 0x80) va = (va & 0x7F) | (d[p++] << 8); p++;
            out.push({ t: 'tm', sel: sel, va: va, k: list(depth + 1) }); break;
          }
          case 4: { o = d[p++]; if (o & 8) nudge(); var ha = d[p++], vaP = d[p++]; if (o & 2) { p++; var ns2 = d[p++]; p += ns2 * 3; } out.push({ t: 'pile', k: list(depth + 1) }); break; }
          case 5: {
            o = d[p++]; if (o & 8) nudge(); p += 3; var rows = d[p++], cols = d[p++];
            p += Math.ceil((rows + 1) * 2 / 8) + Math.ceil((cols + 1) * 2 / 8);
            out.push({ t: 'mat', rows: rows, cols: cols, k: list(depth + 1) }); break;
          }
          case 6: { o = d[p++]; if (o & 8) nudge(); out.push({ t: 'em', ty: d[p++] }); break; }
          case 7: { n = d[p++]; p += n * 3; break; }
          case 8: { p += 1; break; }
          case 9: { var ls = d[p++]; p += (ls === 101) ? 2 : 1; break; }
          case 10: case 11: case 12: case 13: case 14: break;
          case 15: { p += 1; break; }
          case 16: { o = d[p++]; var nv = (o & 1) ? 4 : 3; p += nv * 2; if (o & 4) { while (p < d.length && d[p] !== 0) p++; p++; } break; }
          case 17: { if (ver === 5) { p++; } else { p += 1; } while (p < d.length && d[p] !== 0) p++; p++; break; }
          case 18: { p++; nibArray(); nibArray(); n = d[p++]; for (i = 0; i < n; i++) { var fi = d[p++]; if (fi !== 0) p++; } break; }
          case 19: { while (p < d.length && d[p] !== 0) p++; p++; break; }
          default: throw new Error('MTEF tag ' + tag);
        }
      }
      return out;
    }
    return { ver: ver, tree: list(0) };
  }

  var EMB = { 2: '\\dot', 3: '\\ddot', 8: '\\tilde', 9: '\\hat', 11: '\\overrightarrow', 12: '\\overleftarrow', 13: '\\overleftrightarrow', 16: '\\overline', 17: '\\overline' };
  var BIGOP = { 15: '\\int ', 16: '\\sum ', 17: '\\prod ', 18: '\\coprod ', 19: '\\bigcup ', 20: '\\bigcap ', 21: '\\int ', 22: '\\sum ' };
  function mtLatex(parsed) {
    var ver = parsed.ver;
    function lineStr(n) { return n ? seq(n.k) : ''; }
    function slotsOf(tm) { return tm.k.filter(function (c) { return c.t === 'line' || c.t === 'pile' || c.t === 'mat'; }); }
    function slotStr(s) { return s ? (s.t === 'line' ? (s.nul ? '' : seq(s.k)) : one(s)) : ''; }
    function fence(sel, va) {
      var L = va & 1, R = va & 2, pairs = { 0: ['\\langle', '\\rangle'], 1: ['(', ')'], 2: ['\\{', '\\}'], 3: ['[', ']'], 4: ['|', '|'], 5: ['\\|', '\\|'], 6: ['\\lfloor', '\\rfloor'], 7: ['\\lceil', '\\rceil'], 8: ['[', ']'], 9: ['[', ']'] };
      var pr = pairs[sel] || ['(', ')'];
      return [L ? pr[0] : '.', R ? pr[1] : '.'];
    }
    function one(n) {
      if (n.t === 'line') return n.nul ? '' : seq(n.k);
      if (n.t === 'pile') { return '\\begin{matrix}' + n.k.map(function (l) { return lineStr(l); }).join('\\\\') + '\\end{matrix}'; }
      if (n.t === 'mat') {
        var cells = n.k.map(lineStr), rows = [], r, c;
        for (r = 0; r < n.rows; r++) { var row = []; for (c = 0; c < n.cols; c++) row.push(cells[r * n.cols + c] || ''); rows.push(row.join('&')); }
        return '\\begin{matrix}' + rows.join('\\\\') + '\\end{matrix}';
      }
      if (n.t === 'tm') return tm(n);
      return '';
    }
    function tm(n) {
      var s = slotsOf(n), a = slotStr(s[0]), b = slotStr(s[1]), c = slotStr(s[2]), sel = n.sel, va = n.va;
      switch (sel) {
        case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7: case 8: case 9: {
          var f = fence(sel, va);
          if (sel === 2 && (va & 1) && !(va & 2) && s[0] && s[0].t === 'pile') return '\\begin{cases}' + s[0].k.map(lineStr).join('\\\\') + '\\end{cases}';
          return '\\left' + f[0] + ' ' + a + ' \\right' + f[1];
        }
        case 10: return b ? '\\sqrt[' + b + ']{' + a + '}' : '\\sqrt{' + a + '}';
        case 11: return (va & 1) ? '{' + a + '}/{' + b + '}' : '\\frac{' + a + '}{' + b + '}';
        case 12: return '\\underline{' + a + '}';
        case 13: return '\\overline{' + a + '}';
        case 14: { var arr = '\\rightarrow '; if (va & 2) arr = '\\leftarrow '; if (va & 4) arr = '\\leftrightarrow '; return (b ? '\\overset{' + b + '}{' + arr + '}' : arr) + a; }
        case 15: case 16: case 17: case 18: case 19: case 20: case 21: case 22:
          return BIGOP[sel] + (b ? '_{' + b + '}' : '') + (c ? '^{' + c + '}' : '') + ' ' + (sel === 21 || sel === 22 ? '' : a);
        case 23: return '\\lim_{' + b + '} ';
        case 24: case 25: return '\\overbrace{' + a + '}' + (b ? '^{' + b + '}' : '');
        case 27: { var u = s.filter(function (x) { return x.t !== 'line' || !x.nul; }); return '_{' + slotStr(u[0]) + '}'; }
        case 28: { var u2 = s.filter(function (x) { return x.t !== 'line' || !x.nul; }); return '^{' + slotStr(u2[0]) + '}'; }
        case 29: { var u3 = s.filter(function (x) { return x.t !== 'line' || !x.nul; }); return '_{' + slotStr(u3[0]) + '}^{' + slotStr(u3[1]) + '}'; }
        case 31: return '\\overrightarrow{' + a + '}';
        case 32: return '\\tilde{' + a + '}';
        case 33: return '\\hat{' + a + '}';
        case 34: return '\\widehat{' + a + '}';
        case 36: return '\\cancel{' + a + '}';
        case 37: return '\\boxed{' + a + '}';
        default: return s.map(slotStr).join(' ');
      }
    }
    function seq(nodes) {
      var out = '', i = 0;
      while (i < nodes.length) {
        var n = nodes[i];
        if (n.t === 'ch') {
          // gom các ký tự liên tiếp cùng kiểu chữ: hàm (sin, cos...) và chữ thường (đơn vị)
          if (n.tf === 2 && !(n.em && n.em.length)) {
            var j = i, w = ''; while (j < nodes.length && nodes[j].t === 'ch' && nodes[j].tf === 2) { w += String.fromCharCode(nodes[j].mt || nodes[j].c8 || 63); j++; }
            if (MT_FN[w]) { out += '\\' + w + ' '; } else out += '\\mathrm{' + w.replace(/[{}\\]/g, '') + '}';
            i = j; continue;
          }
          if (n.tf === 1 && !(n.em && n.em.length)) {
            var k = i, tx = ''; while (k < nodes.length && nodes[k].t === 'ch' && nodes[k].tf === 1 && !(nodes[k].em && nodes[k].em.length)) { var cc = mtCharRaw(nodes[k], ver); tx += cc; k++; }
            out += '\\text{' + tx.replace(/[{}\\$%&#_^~]/g, '') + '}'; i = k; continue;
          }
          var s = mtChar(n, ver);
          if (n.em && n.em.length) n.em.forEach(function (e) {
            if (e.ty === 5) s = s + "'"; else if (e.ty === 6) s = s + "''"; else if (e.ty === 7) s = s + "'''";
            else if (EMB[e.ty]) s = EMB[e.ty] + '{' + s + '}';
          });
          out += s; i++; continue;
        }
        if (n.t === 'em') { i++; continue; }
        var r = one(n);
        // chỉ số trên/dưới gắn vào ký tự đứng trước; nếu trước đó chưa có gì thì thêm {} để KaTeX không báo lỗi
        if (n.t === 'tm' && (n.sel === 27 || n.sel === 28 || n.sel === 29) && !out) r = '{}' + r;
        out += r; i++;
      }
      return out;
    }
    function mtCharRaw(n, v) {
      var code = n.mt !== undefined ? n.mt : n.c8; if (v < 5 && n.c8 !== undefined) code = n.c8;
      return String.fromCharCode(code === undefined ? 63 : code);
    }
    var body = parsed.tree.filter(function (x) { return x.t === 'line' || x.t === 'pile'; });
    return seq(body.length ? (body[0].t === 'line' ? body[0].k : [body[0]]) : parsed.tree).replace(/\s+/g, ' ').trim();
  }
  function mathTypeToLatex(bin) {
    try {
      var d = cfbStream(bin, 'Equation Native'); if (!d || d.length < 30) return '';
      var hdr = d[0] | (d[1] << 8);   // độ dài EQNOLEFILEHDR (thường 28)
      var parsed = mtefParse(d, hdr); if (!parsed) return '';
      return mtLatex(parsed);
    } catch (e) { return ''; }
  }

  function attrNum(n, a, d) { var v = n ? parseFloat(at(n, a)) : NaN; return isNaN(v) ? d : v; }
  function xf(sp) {
    var pr = child(sp, 'wps:spPr'); var x = pr && child(pr, 'a:xfrm'); if (!x) return null;
    var off = child(x, 'a:off'), ext = child(x, 'a:ext');
    return { x: attrNum(off, 'x', 0), y: attrNum(off, 'y', 0), cx: attrNum(ext, 'cx', 0), cy: attrNum(ext, 'cy', 0), fh: at(x, 'flipH') === '1', fv: at(x, 'flipV') === '1', pr: pr };
  }
  function f1(v) { return Math.round(v * 100) / 100; }
  function groupToSvg(g, ctx) {
    var gp = child(g, 'wpg:grpSpPr'), x = gp && child(gp, 'a:xfrm'); if (!x) return '';
    var ext = child(x, 'a:ext'), chOff = child(x, 'a:chOff'), chExt = child(x, 'a:chExt');
    var W = attrNum(ext, 'cx', 0) / EMU_PX, H = attrNum(ext, 'cy', 0) / EMU_PX;
    var cox = attrNum(chOff, 'x', 0), coy = attrNum(chOff, 'y', 0), cw = attrNum(chExt, 'cx', 1) || 1, ch = attrNum(chExt, 'cy', 1) || 1;
    var body = '', rootTf = { ox: 0, oy: 0, cox: cox, coy: coy, sx: W / cw, sy: H / ch };
    function shapes(node, tf, out) {   // gom cả hình trong mc:AlternateContent và nhóm con (có phép biến đổi toạ độ)
      kids(node).forEach(function (c) {
        if (c.nodeName === 'wps:wsp') out.push({ sp: c, tf: tf });
        else if (c.nodeName === 'mc:AlternateContent') { var chc = child(c, 'mc:Choice'); if (chc) shapes(chc, tf, out); }
        else if (c.nodeName === 'mc:Choice') shapes(c, tf, out);
        else if (c.nodeName === 'wpg:grpSp' || c.nodeName === 'wpg:wgp') {
          var gp2 = child(c, 'wpg:grpSpPr'), x2 = gp2 && child(gp2, 'a:xfrm');
          if (!x2) return;
          var o2 = child(x2, 'a:off'), e2 = child(x2, 'a:ext'), co2 = child(x2, 'a:chOff'), ce2 = child(x2, 'a:chExt');
          var cew = attrNum(ce2, 'cx', 1) || 1, ceh = attrNum(ce2, 'cy', 1) || 1;
          shapes(c, { ox: tf.ox + (attrNum(o2, 'x', 0) - tf.cox) * tf.sx, oy: tf.oy + (attrNum(o2, 'y', 0) - tf.coy) * tf.sy,
                      cox: attrNum(co2, 'x', 0), coy: attrNum(co2, 'y', 0), sx: attrNum(e2, 'cx', 0) / cew * tf.sx, sy: attrNum(e2, 'cy', 0) / ceh * tf.sy }, out);
        }
      });
      return out;
    }
    shapes(g, rootTf, []).forEach(function (it) {
      var sp = it.sp, tf = it.tf, sx = tf.sx, sy = tf.sy;
      function X(v) { return f1(tf.ox + (v - tf.cox) * sx); } function Y(v) { return f1(tf.oy + (v - tf.coy) * sy); }
      var t = xf(sp); if (!t) return;
      var geom = child(t.pr, 'a:prstGeom'), prst = geom ? at(geom, 'prst') : 'rect';
      var ln = child(t.pr, 'a:ln'), noLine = !ln || !!child(ln, 'a:noFill');
      var lw = ln && at(ln, 'w') ? Math.max(0.75, parseFloat(at(ln, 'w')) / EMU_PX) : 0.75;
      var color = 'currentColor';
      var sf = ln && child(ln, 'a:solidFill'), clr = sf && child(sf, 'a:srgbClr');
      if (clr && at(clr, 'val') && at(clr, 'val').toLowerCase() !== '000000') color = '#' + at(clr, 'val');
      var dash = ln && child(ln, 'a:prstDash'), dv = dash ? at(dash, 'val') : '';
      var dashAttr = dv ? (/dot/i.test(dv) ? ' stroke-dasharray="1.5 2.5"' : ' stroke-dasharray="4 3"') : '';
      var tail = ln && child(ln, 'a:tailEnd'), head = ln && child(ln, 'a:headEnd');
      var hasTail = tail && at(tail, 'type') && at(tail, 'type') !== 'none', hasHead = head && at(head, 'type') && at(head, 'type') !== 'none';
      if (prst === 'line' || prst === 'straightConnector1' || prst === 'curvedConnector3' || prst === 'bentConnector3') {
        var x1 = t.fh ? t.x + t.cx : t.x, y1 = t.fv ? t.y + t.cy : t.y, x2 = t.fh ? t.x : t.x + t.cx, y2 = t.fv ? t.y : t.y + t.cy;
        var X1 = X(x1), Y1 = Y(y1), X2 = X(x2), Y2 = Y(y2);
        if (!noLine) body += '<line x1="' + X1 + '" y1="' + Y1 + '" x2="' + X2 + '" y2="' + Y2 + '" stroke="' + color + '" stroke-width="' + f1(lw) + '"' + dashAttr + '/>';
        var dx = X2 - X1, dy = Y2 - Y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
        function arrow(px, py, ux, uy) { var L = 7, Wd = 3.2; return '<polygon points="' + f1(px) + ',' + f1(py) + ' ' + f1(px - L * ux + Wd * -uy) + ',' + f1(py - L * uy + Wd * ux) + ' ' + f1(px - L * ux - Wd * -uy) + ',' + f1(py - L * uy - Wd * ux) + '" fill="' + color + '"/>'; }
        if (hasTail) body += arrow(X2, Y2, dx / len, dy / len);
        if (hasHead) body += arrow(X1, Y1, -dx / len, -dy / len);
        return;
      }
      var tx = child(sp, 'wps:txbx'), content = tx && child(tx, 'w:txbxContent');
      var bp = child(sp, 'wps:bodyPr');
      if (prst === 'ellipse' && !noLine) body += '<ellipse cx="' + X(t.x + t.cx / 2) + '" cy="' + Y(t.y + t.cy / 2) + '" rx="' + f1(t.cx * sx / 2) + '" ry="' + f1(t.cy * sy / 2) + '" fill="none" stroke="' + color + '" stroke-width="' + f1(lw) + '"/>';
      else if (prst === 'rect' && !noLine && !content) body += '<rect x="' + X(t.x) + '" y="' + Y(t.y) + '" width="' + f1(t.cx * sx) + '" height="' + f1(t.cy * sy) + '" fill="none" stroke="' + color + '" stroke-width="' + f1(lw) + '"/>';
      if (content) {
        var lI = attrNum(bp, 'lIns', 91440) / EMU_PX, rI = attrNum(bp, 'rIns', 91440) / EMU_PX, tI = attrNum(bp, 'tIns', 45720) / EMU_PX, bI = attrNum(bp, 'bIns', 45720) / EMU_PX;
        var anc = bp ? (at(bp, 'anchor') || 't') : 't';
        var bx = X(t.x), by = Y(t.y), bw = t.cx * sx, bh = t.cy * sy;
        var paras = kids(content).filter(function (p) { return p.nodeName === 'w:p'; }).map(function (p) {
          var jc = child(p, 'w:pPr') && child(child(p, 'w:pPr'), 'w:jc'), runs = [], fs = 0;
          desc(p, 'w:r');
          kids(p).forEach(function (r) {
            if (r.nodeName !== 'w:r') return;
            var rp = child(r, 'w:rPr'), sz = rp && child(rp, 'w:sz'), it = rp && child(rp, 'w:i'), bo = rp && child(rp, 'w:b'), txt = '';
            kids(r).forEach(function (c) { if (c.nodeName === 'w:t') txt += c.textContent; });
            if (!txt) return;
            var s = sz ? parseFloat(at(sz, 'w:val')) / 2 : ctx.defPt; if (s * 4 / 3 > fs) fs = s * 4 / 3;
            runs.push({ t: txt, i: !!it && at(it, 'w:val') !== '0', b: !!bo && at(bo, 'w:val') !== '0' });
          });
          return { jc: jc ? at(jc, 'w:val') : 'left', runs: runs, fs: fs || ctx.defPt * 4 / 3 };
        }).filter(function (p) { return p.runs.length; });
        if (!paras.length) return;
        var total = 0; paras.forEach(function (p) { total += p.fs * 1.15; });
        var top = anc === 'ctr' ? by + bh / 2 - total / 2 : anc === 'b' ? by + bh - bI - total : by + tI;
        paras.forEach(function (p) {
          var base = top + p.fs * 0.9; top += p.fs * 1.15;
          var px = bx + lI, anchor = 'start';
          if (p.jc === 'center') { px = bx + bw / 2; anchor = 'middle'; } else if (p.jc === 'right') { px = bx + bw - rI; anchor = 'end'; }
          body += '<text x="' + f1(px) + '" y="' + f1(base) + '" font-size="' + f1(p.fs) + '" text-anchor="' + anchor + '" fill="currentColor">' +
            p.runs.map(function (r) { return '<tspan' + (r.i ? ' font-style="italic"' : '') + (r.b ? ' font-weight="bold"' : '') + ' xml:space="preserve">' + esc(r.t) + '</tspan>'; }).join('') + '</text>';
        });
      }
    });
    return '<svg class="ld-fig" width="' + f1(W) + '" height="' + f1(H) + '" viewBox="0 0 ' + f1(W) + ' ' + f1(H) + '" style="max-width:100%;height:auto;vertical-align:middle;font-family:\'Times New Roman\',Times,serif;overflow:visible">' + body + '</svg>';
  }
  function imgHtml(rid, wpx, hpx, ctx) {
    var src = ctx.images[rid]; if (!src) return '';
    var st = 'display:inline-block;vertical-align:middle;max-width:100%;background:url(' + src + ') center/contain no-repeat;';
    if (wpx) st += 'width:' + f1(wpx) + 'px;height:' + f1(hpx) + 'px;';
    return '<span class="ld-img" role="img" style="' + st + '"></span>';
  }
  function drawingToHtml(d, ctx) {
    var holder = child(d, 'wp:inline') || child(d, 'wp:anchor'); if (!holder) return '';
    var ext = child(holder, 'wp:extent'), w = attrNum(ext, 'cx', 0) / EMU_PX, h = attrNum(ext, 'cy', 0) / EMU_PX;
    var grp = desc(holder, 'wpg:wgp');
    if (grp.length) return ctx.mode === 'keepHeader' ? '' : groupToSvg(grp[0], ctx);
    var blip = desc(holder, 'a:blip');
    if (blip.length) return imgHtml(at(blip[0], 'r:embed'), w, h, ctx);
    return '';
  }
  function pictToHtml(p, ctx) {
    var im = desc(p, 'v:imagedata'); if (im.length && at(im[0], 'r:id')) return imgHtml(at(im[0], 'r:id'), 0, 0, ctx);
    return '';
  }
  function altToHtml(ac, ctx) {
    var choice = child(ac, 'mc:Choice'), out = '';
    if (choice) kids(choice).forEach(function (c) { if (c.nodeName === 'w:drawing') out += drawingToHtml(c, ctx); else if (c.nodeName === 'w:pict') out += pictToHtml(c, ctx); });
    return out;
  }
  function runToHtml(r, ctx) {
    var out = '', rp = child(r, 'w:rPr'), va = rp && child(rp, 'w:vertAlign'), vv = va ? at(va, 'w:val') : '';
    kids(r).forEach(function (c) {
      switch (c.nodeName) {
        case 'w:t': { var t = esc(c.textContent); out += vv === 'superscript' ? '<sup>' + t + '</sup>' : vv === 'subscript' ? '<sub>' + t + '</sub>' : t; break; }
        case 'w:tab': out += ' '; break;
        case 'w:br': out += '\u0003'; break;   // xuống dòng mềm: ranh giới dòng, docBlocks sẽ tách
        case 'w:drawing': out += drawingToHtml(c, ctx); break;
        case 'w:pict': out += pictToHtml(c, ctx); break;
        case 'w:object': {
          var ole = desc(c, 'o:OLEObject')[0], lx = ole && ctx.ole ? ctx.ole[at(ole, 'r:id')] : '', mw = lx ? mathWrap(lx) : '';
          out += mw ? ' ' + mw + ' ' : pictToHtml(c, ctx); break;
        }
        case 'mc:AlternateContent': out += altToHtml(c, ctx); break;
      }
    });
    return out;
  }
  function paraToHtml(p, ctx, keepBreaks) {
    var out = '';
    (function walk(node) {
      kids(node).forEach(function (c) {
        switch (c.nodeName) {
          case 'w:r': out += runToHtml(c, ctx); break;
          case 'w:hyperlink': case 'w:smartTag': case 'w:ins': case 'w:sdt': case 'w:sdtContent': case 'w:fldSimple': walk(c); break;
          case 'm:oMath': out += mathWrap(omml(c)); break;
          case 'm:oMathPara': kids(c).forEach(function (m) { if (m.nodeName === 'm:oMath') out += mathWrap(omml(m)); }); break;
          case 'mc:AlternateContent': out += altToHtml(c, ctx); break;
        }
      });
    })(p);
    var res = out.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/(\$) +(?=[.,;:!?)\]])/g, '$1').replace(/([(\[]) +(?=\$)/g, '$1');
    if (!keepBreaks) res = res.replace(/\u0003/g, ' ').replace(/ {2,}/g, ' ');
    return res.trim();
  }
  function tblToHtml(tbl, ctx) {
    var rows = kids(tbl).filter(function (r) { return r.nodeName === 'w:tr'; });
    var h = '<table class="ld-table" style="border-collapse:collapse;margin:8px auto;max-width:100%">';
    rows.forEach(function (tr) {
      h += '<tr>';
      kids(tr).forEach(function (tc) {
        if (tc.nodeName !== 'w:tc') return;
        var pr = child(tc, 'w:tcPr'), gs = pr && child(pr, 'w:gridSpan'), span = gs ? parseInt(at(gs, 'w:val'), 10) : 1;
        var cell = kids(tc).filter(function (p) { return p.nodeName === 'w:p'; }).map(function (p) { return paraToHtml(p, ctx); }).filter(Boolean).join('<br>');
        h += '<td' + (span > 1 ? ' colspan="' + span + '"' : '') + ' style="border:1px solid currentColor;padding:4px 10px;text-align:center;vertical-align:middle">' + cell + '</td>';
      });
      h += '</tr>';
    });
    return h + '</table>';
  }
  function tblRows(tbl, ctx) {   // bảng -> mảng 2 chiều (html mỗi ô)
    return kids(tbl).filter(function (r) { return r.nodeName === 'w:tr'; }).map(function (tr) {
      return kids(tr).filter(function (tc) { return tc.nodeName === 'w:tc'; }).map(function (tc) {
        return kids(tc).filter(function (p) { return p.nodeName === 'w:p'; }).map(function (p) { return paraToHtml(p, ctx); }).filter(Boolean).join(' ');
      });
    });
  }

  // ===================== ĐỌC DOCX =====================
  function mimeOf(name) { var e = (name.split('.').pop() || '').toLowerCase(); return e === 'png' ? 'image/png' : (e === 'jpg' || e === 'jpeg') ? 'image/jpeg' : e === 'gif' ? 'image/gif' : e === 'bmp' ? 'image/bmp' : e === 'svg' ? 'image/svg+xml' : e === 'webp' ? 'image/webp' : null; }
  function loadDocx(buf, deps) {
    var Zip = deps.JSZip, Parser = deps.DOMParser;
    return Zip.loadAsync(buf).then(function (zip) {
      var f = zip.file('word/document.xml'); if (!f) throw new Error('File không phải .docx hợp lệ');
      return Promise.all([f.async('string'), zip.file('word/_rels/document.xml.rels') ? zip.file('word/_rels/document.xml.rels').async('string') : Promise.resolve(''), zip.file('word/styles.xml') ? zip.file('word/styles.xml').async('string') : Promise.resolve('')]).then(function (r) {
        var docXml = new Parser().parseFromString(r[0], 'application/xml'), rels = new Parser().parseFromString(r[1] || '<x/>', 'application/xml');
        var defPt = 12, sm = /<w:docDefaults>[\s\S]*?<w:sz w:val="(\d+)"/.exec(r[2]); if (sm) defPt = parseInt(sm[1], 10) / 2;
        var ctx = { images: {}, ole: {}, defPt: defPt, mode: '', skipped: [] }, jobs = [], skippedImg = {};
        Array.prototype.forEach.call(rels.getElementsByTagName('Relationship'), function (rel) {
          var id = rel.getAttribute('Id'), tg = rel.getAttribute('Target') || '', ty = rel.getAttribute('Type') || '';
          var file = zip.file('word/' + tg.replace(/^\//, '').replace(/^word\//, ''));
          if (/oleObject$/.test(ty)) {   // công thức MathType nhúng (.bin) -> LaTeX
            if (file) jobs.push(file.async('uint8array').then(function (u8) { var lx = mathTypeToLatex(u8); if (lx) ctx.ole[id] = lx; }));
            return;
          }
          if (!/image$/.test(ty)) return; var mm = mimeOf(tg); if (!mm) { skippedImg[id] = tg; return; }
          if (file) jobs.push(file.async('base64').then(function (b) { ctx.images[id] = 'data:' + mm + ';base64,' + b; }));
        });
        return Promise.all(jobs).then(function () {
          // ảnh WMF/EMF đi kèm công thức đã đọc được thì không còn là vấn đề
          var covered = {};
          Array.prototype.forEach.call(desc(docXml, 'w:object'), function (ob) {
            var ole = desc(ob, 'o:OLEObject')[0], im = desc(ob, 'v:imagedata')[0];
            if (ole && im && ctx.ole[at(ole, 'r:id')]) covered[at(im, 'r:id')] = true;
          });
          Object.keys(skippedImg).forEach(function (id) { if (!covered[id]) ctx.skipped.push(skippedImg[id]); });
          return { doc: docXml, ctx: ctx };
        });
      });
    });
  }
  function docBlocks(parsed) {
    var body = parsed.doc.getElementsByTagName('w:body')[0], ctx = parsed.ctx, blocks = [];
    (function walk(node) {
      kids(node).forEach(function (c) {
        if (c.nodeName === 'w:p') {
          var h = paraToHtml(c, ctx, true);
          if (h.indexOf('\u0003') < 0) blocks.push({ kind: 'p', html: h });
          else h.split('\u0003').forEach(function (piece) { piece = piece.trim(); if (piece) blocks.push({ kind: 'p', html: piece }); });   // mỗi dòng mềm là một khối riêng
        }
        else if (c.nodeName === 'w:tbl') blocks.push({ kind: 'tbl', html: tblToHtml(c, ctx), node: c });
        else if (c.nodeName === 'w:sdt') { var sc = child(c, 'w:sdtContent'); if (sc) walk(sc); }
      });
    })(body);
    return { blocks: blocks, ctx: ctx };
  }

  // ===================== TÁCH ĐỀ =====================
  var RE_SEC = /^\s*(?:PHẦN|Phần)\s*(IV|III|II|I|[1-4])(?![A-Za-zÀ-ỹ])/i, RE_Q = /^\s*Câu\s*(\d+)\s*(?:[.:)]\s*|\s+)/i, RE_PART = /^\s*([a-d])\s*\)\s*/i, RE_HET = /^\s*[-–—\s]*HẾT[-–—\s]*$/i;
  var TOK_RE = /<svg[\s\S]*?<\/svg>|<span class="ld-img"[\s\S]*?<\/span>|<table[\s\S]*?<\/table>|\$[^$]*\$/g;
  function protect(s, store) { return s.replace(TOK_RE, function (m) { store.push(m); return '\u0001' + (store.length - 1) + '\u0002'; }); }
  function restore(s, store) { return s.replace(/\u0001(\d+)\u0002/g, function (m, i) { return store[+i]; }); }
  function splitChoices(html) {
    var store = [], s = protect(html, store), L = ['A', 'B', 'C', 'D'], marks = [], from = 0;
    for (var i = 0; i < 4; i++) {
      var re = new RegExp('(^|[\\s.;,:?!)>\\u0002])' + L[i] + '\\s*\\.\\s*', 'g'); re.lastIndex = from;
      var m = re.exec(s); if (!m) return null;
      marks.push({ start: m.index + m[1].length, end: m.index + m[0].length }); from = m.index + m[0].length;
    }
    return marks.map(function (mk, i) { return restore(s.slice(mk.end, i < 3 ? marks[i + 1].start : s.length), store).trim(); });
  }
  function joinBlocks(bs) { return bs.map(function (b) { return b.html; }).filter(Boolean).join('\n'); }

  var FIG_LEAD = /^(?:\s*(?:<span class="ld-img"[^>]*><\/span>|<svg[\s\S]*?<\/svg>))+\s*/, FIG_TAIL = /(?:\s*(?:<span class="ld-img"[^>]*><\/span>|<svg[\s\S]*?<\/svg>))+\s*$/;
  function parseExam(blocks) {
    var pendFig = '', sec = 0, cur = null, groups = { 1: [], 2: [], 3: [], 4: [] }, meta = { minutes: null };
    var roman = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, '1': 1, '2': 2, '3': 3, '4': 4 }, firstTexts = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i], plain = stripTags(b.html);
      if (plain && firstTexts.length < 6) firstTexts.push(plain.slice(0, 70));
      if (!sec) { var tm = /Thời gian làm bài\s*:?\s*(\d+)\s*phút/i.exec(plain); if (tm) meta.minutes = parseInt(tm[1], 10); }
      if (b.kind === 'p' && RE_HET.test(plain)) break;
      var sm = b.kind === 'p' && RE_SEC.exec(plain);
      if (sm) { sec = roman[sm[1].toUpperCase()]; cur = null; continue; }
      if (!sec) continue;
      var bh = b.html, lead = '';
      if (b.kind === 'p') { var lm = FIG_LEAD.exec(bh); if (lm && lm[0].length < bh.length && RE_Q.test(bh.slice(lm[0].length))) { lead = lm[0]; bh = bh.slice(lm[0].length); } }
      // khối chỉ có hình, ngay sau đó là "Câu n" mới (Phần III/IV): hình thuộc câu sau
      if (b.kind === 'p' && sec >= 3 && stripTags(b.html) === '' && /<svg|ld-img/.test(b.html)) {
        var nx = null; for (var j = i + 1; j < blocks.length; j++) if (blocks[j].html) { nx = blocks[j]; break; }
        if (nx && nx.kind === 'p') { var nl = FIG_LEAD.exec(nx.html), nt = nl ? nx.html.slice(nl[0].length) : nx.html; if (RE_Q.test(nt)) { pendFig += b.html; continue; } }
      }
      var qm = b.kind === 'p' && RE_Q.exec(bh);
      if (qm) {
        var fig = pendFig + lead; pendFig = '';
        // Phần III/IV không có phương án: hình nằm cuối câu trước (trước dấu xuống dòng) là hình của câu mới
        if (sec >= 3 && cur && cur.blocks.length) {
          var li = cur.blocks.length - 1; while (li > 0 && cur.blocks[li].fig) li--;   // bỏ qua khối hình đã gắn từ trước
          var lb = cur.blocks[li], tm = FIG_TAIL.exec(lb.html);
          if (tm && lb.kind === 'p' && !lb.fig) { fig = tm[0] + fig; lb.html = lb.html.slice(0, tm.index); if (li > 0 && !stripTags(lb.html) && !/<svg|ld-img/.test(lb.html)) cur.blocks.splice(li, 1); }
        }
        cur = { sec: sec, no: parseInt(qm[1], 10), blocks: [{ kind: 'p', html: bh.replace(RE_Q, '') }] };
        if (fig) cur.blocks.push({ kind: 'p', html: fig, fig: true });
        groups[sec].push(cur); continue;
      }
      if (cur && (b.html && stripTags(b.html) !== '' || /<svg|ld-img|<table/.test(b.html))) cur.blocks.push(b);
    }
    var out = { meta: meta, p1: [], p2: [], p3: [], p4: [], warnings: [] };
    if (!sec) out.warnings.push('Không thấy tiêu đề "PHẦN I/II/III/IV" trong file đề. Các dòng đầu đọc được: ' + firstTexts.join(' ¦ '));
    else if (!groups[1].length && !groups[2].length && !groups[3].length && !groups[4].length) out.warnings.push('Có tiêu đề PHẦN nhưng không thấy dòng bắt đầu bằng "Câu 1."');
    groups[1].forEach(function (q) {
      var bs = q.blocks, ci = -1;
      for (var i = 1; i < bs.length; i++) if (/^\s*A\s*\./.test(bs[i].html)) { ci = i; break; }
      var stemBlocks = bs.slice(0, ci < 0 ? bs.length : ci), chText;
      if (ci < 0) { // phương án nằm ngay đoạn đầu?
        var m = /(^|[\s.;])A\s*\.\s/.exec(bs[0].html);
        if (m) { var st = []; var s0 = protect(bs[0].html, st); var cut = s0.search(/(^|[\s.;\u0002>])A\s*\.\s/); stemBlocks = [{ html: restore(s0.slice(0, cut), st) }]; chText = restore(s0.slice(cut), st) + ' ' + bs.slice(1).map(function (x) { return x.html; }).join(' '); }
      } else chText = bs.slice(ci).map(function (x) { return x.html; }).join(' ');
      var ch = chText && splitChoices(chText);
      if (!ch) { out.warnings.push('Phần I câu ' + q.no + ': không tách được 4 phương án'); return; }
      out.p1.push({ no: q.no, stem: joinBlocks(stemBlocks), choices: ch });
    });
    function withParts(q) {
      var bs = q.blocks, pi = -1;
      for (var i = 0; i < bs.length; i++) if (bs[i].kind === 'p' && RE_PART.test(bs[i].html)) { pi = i; break; }
      var stem = joinBlocks(bs.slice(0, pi < 0 ? bs.length : pi)), parts = [];
      if (pi >= 0) bs.slice(pi).forEach(function (b) {
        var m = b.kind === 'p' && RE_PART.exec(b.html);
        if (m) parts.push({ key: m[1].toLowerCase(), html: b.html.replace(RE_PART, '') });
        else if (parts.length) parts[parts.length - 1].html += '\n' + b.html;
      });
      return { no: q.no, stem: stem, parts: parts };
    }
    groups[2].forEach(function (q) { out.p2.push(withParts(q)); });
    groups[3].forEach(function (q) { out.p3.push({ no: q.no, stem: joinBlocks(q.blocks) }); });
    groups[4].forEach(function (q) { out.p4.push(withParts(q)); });
    return out;
  }

  // ===================== TÁCH ĐÁP ÁN (file Da) =====================
  function pnum(s) { var m = /(\d+(?:[.,]\d+)?)/.exec(String(s)); return m ? parseFloat(m[1].replace(',', '.')) : NaN; }
  function parseAnswers(parsed, code) {
    var ctx = parsed.ctx, body = parsed.doc.getElementsByTagName('w:body')[0];
    var tables = kids(body).filter(function (c) { return c.nodeName === 'w:tbl'; }).map(function (t) { return tblRows(t, ctx); });
    var ans = { p1: null, p2: {}, p3: {}, rubrics: [] }, tfSeen = false;
    function codeCol(head) {   // cột của mã đề trong hàng tiêu đề (chấp nhận "0201", "Mã đề 0201"...)
      for (var i = 1; i < head.length; i++) { var m = /\b(\d{4})\b/.exec(head[i]); if (m && m[1] === code) return i; }
      var hasCode = head.slice(1).some(function (h) { return /\b\d{4}\b/.test(h); });
      return (!hasCode && head.length === 2) ? 1 : -1;
    }
    function normTF(v) { return String(v).normalize('NFC').toUpperCase().replace(/[ĐÐ]/g, 'D').replace(/[^SD]/g, ''); }
    tables.forEach(function (rows) {
      if (!rows.length) return;
      var head = rows[0].map(stripTags), first = head[0] || '';
      var nums = head.slice(1).map(function (h) { return h.replace(/^câu\s*/i, ''); });
      // Phần I (ngang): hàng tiêu đề 1..12, mỗi hàng sau là một mã đề
      if (nums.length >= 12 && nums[0] === '1' && nums[1] === '2') {
        var row = rows.filter(function (r) { return /\b(\d{4})\b/.exec(stripTags(r[0]) || '') && /\b(\d{4})\b/.exec(stripTags(r[0]))[1] === code; })[0] || (rows.length === 2 ? rows[1] : null);
        if (row) ans.p1 = row.slice(1).map(function (c) { return stripTags(c).toUpperCase().replace(/[^A-D]/g, ''); });
        return;
      }
      // Bảng gộp: các hàng mã đề (0201 0202 ...), rồi hàng "Phần 1/2/3", rồi từng câu (số hoặc "Câu n")
      var codes = [], hdrEnd = -1;
      for (var hi = 0; hi < Math.min(3, rows.length); hi++) {
        var found = rows[hi].map(stripTags).filter(function (c) { return /^(?:mã\s*đề\s*)?\d{4}$/i.test(c); });
        if (found.length) { codes = codes.concat(found.map(function (c) { return /\d{4}/.exec(c)[0]; })); hdrEnd = hi; }
      }
      var kc = codes.indexOf(code); if (kc < 0 && codes.length === 1) kc = 0;
      if (hdrEnd >= 0 && kc >= 0 && rows.length > hdrEnd + 2) {
        var secNo = 0, got = 0, RM = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, '1': 1, '2': 2, '3': 3, '4': 4 };
        rows.slice(hdrEnd + 1).forEach(function (r) {
          var cells = r.map(stripTags), lab = cells[0] || '';
          var sm = /^Phần\s*(IV|III|II|I|[1-4])(?![A-Za-zÀ-ỹ])/i.exec(lab);
          if (sm) { secNo = RM[sm[1].toUpperCase()]; return; }
          var v = cells[1 + kc]; if (v === undefined || v === '') return;
          var no = parseInt(lab.replace(/\D/g, ''), 10); if (isNaN(no)) return;
          var tf = normTF(v), kind = secNo || (/^[A-D]$/i.test(v) ? 1 : (/^[SĐÐDsđðd\s]+$/.test(v) && tf.length >= 3 ? 2 : 3));
          if (kind === 1) { ans.p1 = ans.p1 || []; ans.p1[no - 1] = v.toUpperCase().replace(/[^A-D]/g, ''); }
          else if (kind === 2) ans.p2[no] = tf;
          else if (kind === 3) ans.p3[no] = v;
          else return;
          got++;
        });
        if (got) return;
      }
      // Phần I / II / III (dọc): hàng tiêu đề là các mã đề, cột đầu là số câu
      var col = codeCol(head);
      if (col > 0 && rows.length > 1 && /^(câu\s*)?\d+$/i.test(stripTags(rows[1][0] || ''))) {
        var body1 = rows.slice(1), vals = body1.map(function (r) { return stripTags(r[col] || ''); });
        var isP1 = vals.every(function (v) { return /^[A-D]$/i.test(v); });
        var isTF = !isP1 && vals.every(function (v) { return normTF(v).length >= 3 && /^[SĐÐDsđðd\s,;.\-]+$/.test(v); });
        body1.forEach(function (r) {
          var no = parseInt(stripTags(r[0]).replace(/\D/g, ''), 10), v = stripTags(r[col] || '');
          if (isP1) { ans.p1 = ans.p1 || []; ans.p1[no - 1] = v.toUpperCase(); }
          else if (isTF) ans.p2[no] = normTF(v);
          else ans.p3[no] = v;
        });
        return;
      }
      // Phần IV: bảng thang điểm (2 cột "nội dung | 0,25 đ" hoặc 3 cột có nhãn a/b/c/d)
      var SC = /^\d+(?:[.,]\d+)?\s*(?:đ|điểm)?$/i;
      var scored = rows.filter(function (r) { return r.length >= 2 && SC.test(stripTags(r[r.length - 1])); });
      if (rows.length && rows.every(function (r) { return r.length >= 2; }) && scored.length >= Math.ceil(rows.length * 0.6) &&
          scored.some(function (r) { return /đ|điểm/i.test(stripTags(r[r.length - 1])); })) {
        var parts = {}, label = '';
        rows.forEach(function (r) {
          var lb = stripTags(r[0]).toLowerCase(), hasLb = r.length >= 3 && /^[a-d]$/.test(lb); if (hasLb) label = lb;
          var last = stripTags(r[r.length - 1]), isSc = SC.test(last), pt = isSc ? pnum(last) : NaN, line = (hasLb ? r.slice(1, isSc ? r.length - 1 : r.length) : r.slice(0, isSc ? r.length - 1 : r.length)).join(' ');
          var sc = last.replace(/\s*điểm/i, 'đ'); if (!/đ$/.test(sc)) sc += 'đ';
          if (!isSc) { if (!parts[label]) parts[label] = { lines: [], score: 0 }; parts[label].lines.push(line + ' ' + last); return; }
          if (!parts[label]) parts[label] = { lines: [], score: 0 };
          parts[label].lines.push(line + ' <em>(' + sc + ')</em>'); if (!isNaN(pt)) parts[label].score += pt;
        });
        ans.rubrics.push(parts);
      }
    });
    return ans;
  }

  // ===================== DỰNG CÂU HỎI TESTONLINE =====================
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function buildQuestions(exam, ans, info) {
    var base = { grade: String(info.grade), task: info.task, history: String(info.year), level: 'B', source: 'drive:' + info.code }, qs = { p1: [], p2: [], p3: [], p4: [] }, warn = exam.warnings.slice(), dropped = [];
    if (!ans.p1) warn.push('Không đọc được bảng đáp án Phần I (kiểm tra file Da: hàng tiêu đề mã đề ' + info.code + ').');
    exam.p1.forEach(function (q) {
      var letter = ans.p1 && ans.p1[q.no - 1], ci = letter ? letter.charCodeAt(0) - 65 : -1;
      if (!(ci >= 0 && ci < 4)) { warn.push('Phần I câu ' + q.no + ': thiếu đáp án'); dropped.push('Phần I câu ' + q.no + ' (thiếu đáp án)'); return; }
      q.choices.forEach(function (c, i) { if (!stripTags(c) .replace(/[.\s]/g, '') && !/<svg|ld-img/.test(c)) warn.push('Phần I câu ' + q.no + ': phương án ' + 'ABCD'.charAt(i) + ' trống (công thức không đọc được?)'); });
      var cs = q.choices.map(function (c, i) { return { choice: c, answer: i === ci }; });
      var refs = q.choices.some(function (c) { return /(\b[A-D]\b\s*(,|và|hoặc)\s*\b[A-D]\b)|(\bcả\b[^.]*\b[A-D]\b)/i.test(stripTags(c)); });
      if (!refs) cs = shuffle(cs);
      qs.p1.push(Object.assign({ ID: 'LD_' + info.code + '_' + info.year + '_P1_' + q.no, type: 'multipleChoice', mainQuestion: q.stem, choices: cs, score: 0.25 }, base));
    });
    qs.p1 = shuffle(qs.p1);
    exam.p2.forEach(function (q) {
      var key = ans.p2[q.no] || '';
      if (key.length !== q.parts.length) { warn.push('Phần II câu ' + q.no + ': số ý (' + q.parts.length + ') không khớp đáp án (' + key + ')'); if (!key) { dropped.push('Phần II câu ' + q.no + ' (thiếu đáp án Đ/S)'); return; } }
      qs.p2.push(Object.assign({ ID: 'LD_' + info.code + '_' + info.year + '_P2_' + q.no, type: 'trueFalse', mainQuestion: q.stem,
        subQuestions: q.parts.map(function (p, i) { return { question: p.html, answer: key.charAt(i) === 'D' }; }), score: 1 }, base));
    });
    exam.p3.forEach(function (q) {
      var a = ans.p3[q.no]; if (a === undefined || a === '') { warn.push('Phần III câu ' + q.no + ': thiếu đáp án'); dropped.push('Phần III câu ' + q.no + ' (thiếu đáp án)'); return; }
      var alt = a.indexOf(',') >= 0 ? [a, a.replace(',', '.')] : [a];
      qs.p3.push(Object.assign({ ID: 'LD_' + info.code + '_' + info.year + '_P3_' + q.no, type: 'essay', mainQuestion: q.stem, answer: alt, score: 0.5, _origAnswer: a }, base));
    });
    exam.p4.forEach(function (q, idx) {
      var rb = ans.rubrics[idx]; if (!rb) { warn.push('Phần IV câu ' + q.no + ': thiếu thang điểm (vẫn nạp câu, chấm tay)'); rb = { '': { lines: [], score: 1 } }; }
      var parts = {}, subs = [], answers = [], total = 0;
      var plist = q.parts.length ? q.parts : [{ key: 'a', html: 'Trình bày lời giải:' }], merged = null;
      if (!q.parts.length) { merged = { lines: [], score: 0 }; Object.keys(rb).forEach(function (k) { merged.lines = merged.lines.concat(rb[k].lines); merged.score += rb[k].score; }); }
      plist.forEach(function (p) {
        var r = merged || rb[p.key] || { lines: [], score: 0 }; total += r.score;
        var ah = r.lines.join('<br>'); parts[p.key] = { question: p.html, answer: [ah], score: r.score };
        subs.push({ question: p.html, answer: ah, score: r.score }); answers.push(ah);
      });
      qs.p4.push(Object.assign({ ID: 'LD_' + info.code + '_' + info.year + '_P4_' + q.no, type: 'essay_multi', mainQuestion: q.stem, parts: parts, subQuestions: subs, answer: answers, score: total || 1 }, base));
    });
    return { list: [].concat(qs.p1, qs.p2, qs.p3, qs.p4), warnings: warn, dropped: dropped, counts: { p1: qs.p1.length, p2: qs.p2.length, p3: qs.p3.length, p4: qs.p4.length } };
  }

  // ===================== GỌI DRIVE (Apps Script) =====================
  var listCache = {};
  function apiGet(p) {
    var u = CFG.api + '?' + Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
    return fetch(u).then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.success) throw new Error((j && j.error) || 'Không đọc được Drive'); return j; });
  }
  function listFolder(id, force) {
    if (!force && listCache[id]) return Promise.resolve(listCache[id]);
    return apiGet({ action: 'sv_list', folderId: id }).then(function (j) {
      var map = {};   // key = năm|mã
      j.names.forEach(function (n) { var m = NAME_RE.exec(n); if (!m) return; var key = m[3] + '|' + m[2]; map[key] = map[key] || {}; map[key][m[1].toLowerCase()] = n; });
      return (listCache[id] = map);
    });
  }
  function b64buf(b64) { var bin = atob(b64), len = bin.length, u = new Uint8Array(len); for (var i = 0; i < len; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function getDoc(folderId, name) { return apiGet({ action: 'sv_get', folderId: folderId, name: name }).then(function (j) { return b64buf(j.b64); }); }
  function defaultDeps() { return { JSZip: root.JSZip, DOMParser: root.DOMParser }; }
  function loadExam(folderId, entry, info, deps) {
    return Promise.all([getDoc(folderId, entry.de), getDoc(folderId, entry.da)]).then(function (bufs) {
      return Promise.all([loadDocx(bufs[0], deps), loadDocx(bufs[1], deps)]);
    }).then(function (docs) {
      var de = docBlocks(docs[0]), da = parseAnswers({ doc: docs[1].doc, ctx: docs[1].ctx }, info.code);
      var exam = parseExam(de.blocks), res = buildQuestions(exam, da, info);
      res.minutes = exam.meta.minutes;
      var sk = docs[0].ctx.skipped || [];
      if (sk.length) res.warnings.push('Đề có ' + sk.length + ' hình/công thức dạng ' + sk.map(function (t) { return (t.split('.').pop() || '?').toLowerCase(); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('/') + ' (trình duyệt không hiển thị được, có thể là công thức MathType)');
      var nums = function (a) { return a.map(function (q) { return q.no; }).join(','); };
      res.diag = 'câu đọc từ đề: P1[' + nums(exam.p1) + '] P2[' + nums(exam.p2) + '] P3[' + nums(exam.p3) + '] P4[' + nums(exam.p4) + ']' +
        ' | đáp án: P1=' + (da.p1 ? da.p1.length : 'không thấy') + ', P2=' + Object.keys(da.p2).length + ', P3=' + Object.keys(da.p3).length + ', thang điểm P4=' + da.rubrics.length;
      return res;
    });
  }

  // ===================== GIAO DIỆN & KHỞI CHẠY BÀI =====================
  function $(id) { return root.document && root.document.getElementById(id); }
  function note(msg, type) { try { if (typeof root.showNotification === 'function') return root.showNotification(msg, type || 'info'); } catch (e) {} try { alert(msg); } catch (e) {} }
  function setStatus(t, bad) { var s = $('ld-status'); if (s) { s.textContent = t; s.style.color = bad ? '#c0392b' : '#2c7a3f'; } }
  function folderOf(grade, task) { return (CFG.folders[grade] || {})[task] || null; }
  function minutesFor(task, fromDoc) { if (fromDoc) return fromDoc; var k = /^TX/.test(task) ? 'TX' : /^GK/.test(task) ? 'GK' : 'CK'; return CFG.defaultMinutes[k]; }

  function refreshAvailability() {
    var g = $('deploy-grade').value, t = $('deploy-task').value, y = $('deploy-year').value, sel = $('ld-code');
    sel.innerHTML = '<option value="">Ngẫu nhiên</option>';
    var fid = folderOf(g, t);
    if (!fid) { setStatus('Chưa có đề trên Drive cho Lớp ' + g + ' - ' + t + '.', true); return Promise.resolve(); }
    setStatus('Đang kiểm tra đề trên Drive...');
    return listFolder(fid).then(function (map) {
      var years = {}, codes = [];
      Object.keys(map).forEach(function (k) { var p = k.split('|'); if (map[k].de && map[k].da) { years[p[0]] = 1; if (p[0] === String(y)) codes.push(p[1]); } });
      var ys = Object.keys(years).sort();
      if (!ys.length) { setStatus('Thư mục này chưa có đề nào mở cho luyện đề.', true); return; }
      if (!years[y]) { setStatus('Năm ' + y + ' chưa có đề. Các năm có đề: ' + ys.join(', ') + '.', true); return; }
      codes.sort().forEach(function (c) { var o = root.document.createElement('option'); o.value = c; o.textContent = 'Mã đề ' + c; sel.appendChild(o); });
      setStatus('Có ' + codes.length + ' mã đề: ' + codes.join(', ') + '.');
    }).catch(function (e) { setStatus('Không kết nối được Drive: ' + e.message, true); });
  }

  var busy = false;
  function startDriveTest() {
    if (busy) return; busy = true;
    var btn = $('generate-deploy-test'), old = btn.innerHTML;
    var grade = $('deploy-grade').value, task = $('deploy-task').value, year = String($('deploy-year').value), want = $('ld-code').value;
    function done() { busy = false; btn.innerHTML = old; btn.disabled = false; }
    btn.disabled = true; btn.innerHTML = '<div class="loader"></div> Đang tải đề từ Drive...';
    var fid = folderOf(grade, task);
    if (!fid) { note('Chưa có đề trên Drive cho Lớp ' + grade + ' - ' + task, 'error'); return done(); }
    var deps = defaultDeps();
    (deps.JSZip ? Promise.resolve() : new Promise(function (ok, no) { var s = root.document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = function () { no(new Error('Không tải được thư viện JSZip')); }; root.document.head.appendChild(s); }))
      .then(function () { deps = defaultDeps(); return listFolder(fid, true); })
      .then(function (map) {
        var codes = Object.keys(map).map(function (k) { return k.split('|'); }).filter(function (p) { return p[0] === year && map[p[0] + '|' + p[1]].de && map[p[0] + '|' + p[1]].da; }).map(function (p) { return p[1]; });
        if (!codes.length) throw new Error('Chưa có đề ' + task + ' lớp ' + grade + ' năm ' + year + ' trên Drive');
        var code = want && codes.indexOf(want) >= 0 ? want : codes[Math.floor(Math.random() * codes.length)];
        var info = { grade: grade, task: task, year: year, code: code };
        return loadExam(fid, map[year + '|' + code], info, deps).then(function (res) { return { res: res, info: info }; });
      })
      .then(function (o) {
        var res = o.res;
        if (!res.list.length) { pushLog('đề rỗng', [res.diag || '', res.warnings.slice(0, 8)]); console.warn('[luyende_drive] Chi tiết:', res.diag, res.warnings); throw new Error('Không đọc được câu hỏi nào từ file đề (mã ' + o.info.code + '). ' + (res.diag || '') + (res.warnings.length ? ' | ' + res.warnings.slice(0, 3).join(' ; ') : '')); }
        pushLog('đề ' + o.info.code, [res.diag || '', res.list.length + ' câu']);
        if (res.warnings.length) { console.warn('[luyende_drive] Cảnh báo:', res.warnings); pushLog('cảnh báo đề', res.warnings); }
        launch(res, o.info); done();
      })
      .catch(function (e) { console.error('[luyende_drive]', e); note('Lỗi luyện đề: ' + e.message, 'error'); done(); });
  }


  function isAdminUser() {
    try {
      if (root.localStorage && root.localStorage.getItem('ld_dev') === '1') return true;   // cờ nhà phát triển (đặt một lần, xem initDevFlag)
      if (typeof isAdminMode !== 'undefined' && isAdminMode) return true;
      if (typeof adminAuth !== 'undefined' && adminAuth && adminAuth.isAuthenticated) return true;
      var raw = root.localStorage && root.localStorage.getItem('adminAuth');   // admin đã đăng nhập ở trang chủ (logoutAdmin xoá khoá này)
      if (raw) { var o = JSON.parse(raw); if (o && (o.isAuthenticated || o.token)) return true; }
      if (typeof ADMIN_PHONES !== 'undefined' && ADMIN_PHONES && root.localStorage) {
        var ph = root.localStorage.getItem('user_phone');
        if (ph && (Array.isArray(ADMIN_PHONES) ? ADMIN_PHONES.indexOf(ph) >= 0 : String(ADMIN_PHONES).indexOf(ph) >= 0)) return true;
      }
    } catch (e) {}
    return false;
  }

  // Cờ nhà phát triển: mở trang với đuôi  #ld-dev=<devKey>  một lần -> máy này luôn được miễn chống gian lận. Tắt: #ld-dev-off
  function initDevFlag() {
    try {
      var h = decodeURIComponent(root.location.hash || '');
      if (h === '#ld-dev-off') { root.localStorage.removeItem('ld_dev'); }
      else if (CFG.devKey && h === '#ld-dev=' + CFG.devKey) { root.localStorage.setItem('ld_dev', '1'); }
      else return;
      if (root.history && root.history.replaceState) root.history.replaceState(null, '', root.location.pathname + root.location.search);
    } catch (e) {}
  }
  initDevFlag();

  // Admin/giáo viên không bị chống gian lận: chặn khoá trang, bỏ khoá cũ còn sót trên máy này
  function clearLocalAntiCheatLock() {
    try { root.localStorage.removeItem('anticheat_locked_' + root.location.pathname); } catch (e) {}
    var ov = $('anticheat-lock-overlay');
    if (ov) {
      ov.remove();
      Array.prototype.forEach.call(root.document.querySelectorAll('#quiz-content input, #quiz-content textarea, #quiz-content button, #test-section button'), function (el) { el.disabled = false; });
    }
    try { if (typeof antiCheat !== 'undefined' && antiCheat) { antiCheat.locked = false; antiCheat.violations = 0; if (antiCheat.stopPolling) antiCheat.stopPolling(); } } catch (e) {}
  }
  function exemptAdminFromAntiCheat() {
    var ac; try { ac = (typeof antiCheat !== 'undefined') ? antiCheat : null; } catch (e) { ac = null; }
    if (!ac) return false;
    if (!ac.__ldExempt) {
      ac.__ldExempt = true;
      ['lockPage', 'start'].forEach(function (m) {
        var orig = ac[m]; if (typeof orig !== 'function') return;
        ac[m] = function () { if (isAdminUser()) { clearLocalAntiCheatLock(); return; } return orig.apply(this, arguments); };
      });
    }
    if (isAdminUser()) clearLocalAntiCheatLock();
    return true;
  }
  // Bọc displayQuestion: nếu một câu lỗi thì hiện nguyên nhân ngay trong khung câu hỏi (thay vì trống)
  var katexQ = [], katexState = 0;   // 0 chưa nạp, 1 đang nạp, 2 lỗi, 3 sẵn sàng
  function loadKatex(cb) {
    if (typeof root.renderMathInElement === 'function') return cb(true);
    if (katexState === 2) return cb(false);
    katexQ.push(cb); if (katexState === 1) return; katexState = 1;
    var d = root.document, base = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/';
    function flush(ok) { katexState = ok ? 3 : 2; var q = katexQ; katexQ = []; q.forEach(function (f) { try { f(ok); } catch (e) {} }); }
    function script(src, next) { var s = d.createElement('script'); s.src = src; s.onload = next; s.onerror = function () { flush(false); }; d.head.appendChild(s); }
    if (!d.getElementById('ld-katex-css')) { var l = d.createElement('link'); l.id = 'ld-katex-css'; l.rel = 'stylesheet'; l.href = base + 'katex.min.css'; d.head.appendChild(l); }
    function loadAuto() { script(base + 'contrib/auto-render.min.js', function () { flush(typeof root.renderMathInElement === 'function'); }); }
    if (root.katex) loadAuto(); else script(base + 'katex.min.js', loadAuto);
  }
  var KATEX_OPT = { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false };
  function typesetNow() {
    var box = $('quiz-content') || $('test-section'); if (!box) return;
    loadKatex(function (ok) {
      if (ok) { try { root.renderMathInElement(box, KATEX_OPT); } catch (e) { pushLog('katex', [e]); } return; }
      try { if (root.MathJax && typeof root.MathJax.typesetPromise === 'function') root.MathJax.typesetPromise([box]); } catch (e) { pushLog('mathjax', [e]); }
    });
  }
  var guarded = false;
  function guardDisplayQuestion() {
    if (guarded || typeof root.displayQuestion !== 'function') return; guarded = true;
    var orig = root.displayQuestion;
    root.displayQuestion = function (index) {
      try { var rv = orig.apply(this, arguments); if (isDriveTest()) { setTimeout(typesetNow, 30); setTimeout(typesetNow, 400); } return rv; }
      catch (e) {
        console.error('[luyende_drive] displayQuestion(' + index + ') lỗi:', e); pushLog('displayQuestion(' + (index + 1) + ')', [e]);
        var q = gTest()[index] || {}, box = $('quiz-content');
        if (box) box.innerHTML = '<div style="padding:16px;border:2px solid #c0392b;border-radius:8px;color:#c0392b"><b>Không hiển thị được câu ' + (index + 1) + '</b><br>Loại câu: ' + esc(q.type || '?') + '<br>Lỗi: ' + esc(e && e.message || e) + '<br><small>' + esc(String(e && e.stack || '').split('\n').slice(0, 3).join(' | ')) + '</small></div>';
      }
    };
  }


  // currentTest / currentQuestionIndex / quizSubmitted có thể khai báo bằng let (không nằm trên window) -> đọc bằng tên trần
  function gTest() { try { return currentTest || []; } catch (e) { return root.currentTest || []; } }
  function gIdx() { try { return currentQuestionIndex || 0; } catch (e) { return root.currentQuestionIndex || 0; } }
  function gSubmitted() { try { return !!quizSubmitted; } catch (e) { return !!root.quizSubmitted; } }
  // Đề luyện đề từ Drive chỉ vẽ MỘT câu mỗi lần. Các hàm chuyển câu cũ của TestOline ẩn mọi .question-container rồi tìm #question-N nên làm trống khung.
  // Vì vậy trong đề Drive, bấm số câu / Câu trước / Câu tiếp đi thẳng tới displayQuestion.
  function isDriveTest() { try { var q = gTest()[0]; return !!(q && String(q.source).indexOf('drive:') === 0 && !gSubmitted()); } catch (e) { return false; } }
  function goQuestion(idx) {
    var n = gTest().length; if (idx < 0 || idx >= n) return;
    try { if (typeof forceSaveCurrentAnswer === 'function') forceSaveCurrentAnswer(); } catch (e) { pushLog('lưu đáp án', [e]); }
    try { currentQuestionIndex = idx; } catch (e) { root.currentQuestionIndex = idx; }
    (typeof displayQuestion === 'function' ? displayQuestion : root.displayQuestion)(idx);
    try { if (typeof updateProgressBar === 'function') updateProgressBar(); } catch (e) {}
    Array.prototype.forEach.call(root.document.querySelectorAll('.nav-dot'), function (d, i) { d.classList.toggle('active', i === idx); });
  }
  function installDriveNav() {
    root.document.addEventListener('click', function (e) {
      if (!isDriveTest() || !e.target || !e.target.closest) return;
      var dot = e.target.closest('.nav-dot');
      if (dot && dot.parentNode) {
        e.preventDefault(); e.stopImmediatePropagation();
        return goQuestion(Array.prototype.indexOf.call(dot.parentNode.children, dot));
      }
      var btn = e.target.closest('button'); if (!btn || !btn.closest('#test-section')) return;
      var t = (btn.textContent || '').replace(/\s+/g, ' ').trim(), cur = gIdx();
      if (/^Câu tiếp/i.test(t)) { e.preventDefault(); e.stopImmediatePropagation(); goQuestion(cur + 1); }
      else if (/^Câu trước/i.test(t)) { e.preventDefault(); e.stopImmediatePropagation(); goQuestion(cur - 1); }
    }, true);
  }

  function launch(res, info) {
    var minutes = minutesFor(info.task, res.minutes);
    resetQuizState();
    var examCode = generateExamCode();
    currentExamCode = examCode; currentTest = res.list; userAnswers = {}; currentQuestionIndex = 0; quizSubmitted = false;
    testStartTime = new Date();
    var dur = $('duration'); if (dur) dur.value = minutes;
    try { normalizeTestStructure(currentTest); } catch (e) { console.warn('normalizeTestStructure:', e); }
    currentTest.forEach(function (q) { if (q._origAnswer) q._correctAnswerText = q._origAnswer; });
    $('setup-section').classList.add('hidden'); $('test-section').classList.remove('hidden');
    updateTestInfoForDeployMode(info.grade, info.task, info.year, examCode);
    var ti = $('test-info'); if (ti) ti.textContent += ' (đề gốc ' + info.code + ')';
    guardDisplayQuestion();
    displayQuestion(currentQuestionIndex); updateNavigation(); updateProgressBar();
    var td = $('hsktt-timer-display'); if (td) td.style.display = 'block';
    startTimer(minutes * 60);
    if (isAdminUser()) console.info('[luyende_drive] Admin: bỏ qua chống gian lận để thử đề.');
    else try { if (typeof antiCheat !== 'undefined' && antiCheat && typeof antiCheat.start === 'function') antiCheat.start(); } catch (e) { console.warn('antiCheat.start:', e); }
    note('Đã tải đề ' + info.code + ' (' + res.list.length + ' câu, ' + minutes + ' phút).', 'success');
    if (res.dropped && res.dropped.length) setTimeout(function () { note('⚠ Đề thiếu ' + res.dropped.length + ' câu vì: ' + res.dropped.join('; ') + '. Kiểm tra file Da (đáp án).', 'error'); }, 1200);
  }

  function initUI() {
    var panel = $('deploy-mode-panel'), g = $('deploy-grade'), t = $('deploy-task'), y = $('deploy-year');
    if (!panel || !g || !t || !y) return false;
    Array.prototype.forEach.call(g.options, function (o) { if (!CFG.folders[o.value]) { o.disabled = true; o.textContent = o.value + ' (sắp có)'; } });
    Array.prototype.forEach.call(t.options, function (o) { if (!(CFG.folders['10'] && CFG.folders['10'][o.value]) && !(CFG.folders['11'] && CFG.folders['11'][o.value])) { o.disabled = true; o.textContent = o.value + ' (chưa có đề)'; } });
    if (!$('ld-extra')) {
      var box = root.document.createElement('div'); box.id = 'ld-extra'; box.style.cssText = 'margin-top:10px;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
      box.innerHTML = '<label for="ld-code">Mã đề:</label><select id="ld-code"><option value="">Ngẫu nhiên</option></select><span id="ld-status" style="font-size:0.9rem"></span>';
      var ctl = panel.querySelector('.deploy-controls'); (ctl && ctl.parentNode ? ctl.parentNode : panel).appendChild(box);
    }
    ['change', 'input'].forEach(function (ev) { [g, t, y].forEach(function (el) { el.addEventListener(ev, function () { clearTimeout(initUI._t); initUI._t = setTimeout(refreshAvailability, 350); }); }); });
    // chặn trình xử lý cũ (lấy câu hỏi từ ngân hàng) bằng cách bắt sự kiện ở pha capture
    root.document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('#generate-deploy-test');
      if (!b) return; e.preventDefault(); e.stopImmediatePropagation(); startDriveTest();
    }, true);
    // chế độ luyện đề đang được chọn sẵn thì cập nhật luôn
    refreshAvailability();
    return true;
  }


  // ===================== BẢNG NHẬT KÝ LỖI (chỉ admin) =====================
  var logBuf = [], logBtn = null, logBox = null;
  function pushLog(kind, args) {
    try {
      var t = new Date().toLocaleTimeString('vi-VN'), m = Array.prototype.map.call(args, function (a) {
        if (a && a.stack) return a.message + ' @ ' + String(a.stack).split('\n').slice(1, 3).join(' | ');
        if (typeof a === 'object') { try { return JSON.stringify(a).slice(0, 300); } catch (e) { return String(a); } }
        return String(a);
      }).join(' ');
      logBuf.push(t + ' [' + kind + '] ' + m); if (logBuf.length > 60) logBuf.shift();
      if (logBox && logBox.style.display !== 'none') renderLog();
    } catch (e) {}
  }
  function statusLine() {
    var ac = false, lk = null, sub = '';
    try { ac = typeof antiCheat !== 'undefined'; lk = root.localStorage.getItem('anticheat_locked_' + root.location.pathname); } catch (e) {}
    try { sub = ' | câu ' + (gIdx() + 1) + '/' + gTest().length + ' (' + ((gTest()[gIdx()] || {}).type || '?') + ')'; } catch (e) {}
    return 'luyende_drive v1.9 | admin=' + isAdminUser() + ' | antiCheat=' + ac + ' | cờ khoá=' + lk + sub;
  }
  function renderLog() { if (logBox) { logBox.querySelector('pre').textContent = statusLine() + '\n\n' + (logBuf.join('\n') || '(chưa có lỗi nào)'); } }
  function ensureLogUI() {
    if (logBtn || !root.document || !root.document.body || !isAdminUser()) return;
    logBtn = root.document.createElement('button'); logBtn.textContent = '🐞 Nhật ký';
    logBtn.style.cssText = 'position:fixed;left:8px;bottom:70px;z-index:2147483000;padding:6px 10px;border-radius:14px;border:none;background:#444;color:#fff;font-size:12px;opacity:.85;cursor:pointer';
    logBox = root.document.createElement('div');
    logBox.style.cssText = 'display:none;position:fixed;left:8px;bottom:104px;width:min(560px,92vw);max-height:50vh;overflow:auto;z-index:2147483000;background:#111;color:#9fe;border-radius:8px;padding:8px;font:11px/1.4 monospace;white-space:pre-wrap;word-break:break-all';
    logBox.innerHTML = '<button style="float:right;margin-left:6px">Chép</button><pre style="margin:0;white-space:pre-wrap"></pre>';
    logBox.querySelector('button').onclick = function () { try { root.navigator.clipboard.writeText(logBox.querySelector('pre').textContent); this.textContent = 'Đã chép'; } catch (e) { this.textContent = 'Không chép được'; } };
    logBtn.onclick = function () { logBox.style.display = logBox.style.display === 'none' ? 'block' : 'none'; renderLog(); };
    root.document.body.appendChild(logBtn); root.document.body.appendChild(logBox);
  }
  (function hookLogs() {
    if (!root.addEventListener) return;
    root.addEventListener('error', function (e) { pushLog('error', [(e.message || 'lỗi') + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')']); });
    root.addEventListener('unhandledrejection', function (e) { pushLog('promise', [e.reason && (e.reason.message || e.reason) || 'rejection']); });
    var n = 0, t = setInterval(function () { ensureLogUI(); if (logBox && logBox.style.display !== 'none') renderLog(); if (++n > 600) clearInterval(t); }, 1000);
  })();

  // ===================== XUẤT / KHỞI ĐỘNG =====================
  var api = { CFG: CFG, loadDocx: loadDocx, docBlocks: docBlocks, parseExam: parseExam, parseAnswers: parseAnswers, buildQuestions: buildQuestions, splitChoices: splitChoices, omml: omml, groupToSvg: groupToSvg, mathTypeToLatex: mathTypeToLatex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LuyenDeDrive = api;
  if (root.document && root.document.getElementById) {
    setInterval(exemptAdminFromAntiCheat, 1500); exemptAdminFromAntiCheat();   // chạy liên tục: admin vừa đăng nhập xong hoặc vừa bị khoá đều được gỡ ngay
    installDriveNav();
    var tries = 0, go = function () { if (!initUI() && tries++ < 20) setTimeout(go, 300); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
