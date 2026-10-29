/*!
 * luyende_drive.js  v1.0
 * Chế độ "Luyện đề" của TestOnline lấy đề từ Google Drive (De_<mã>_<năm>.docx + Da_<mã>_<năm>.docx).
 * - Đọc nguyên file .docx: chữ, công thức Word (OMML -> LaTeX), ảnh, đồ thị vẽ bằng khung hình (-> SVG), bảng.
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
    defaultMinutes: { TX: 15, GK: 45, CK: 45 }
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
  function mathWrap(latex) { latex = String(latex).replace(/\$/g, '').replace(/\s*\n\s*/g, ' ').trim(); return latex ? '$' + esc(latex) + '$' : ''; }

  // ===================== HÌNH VẼ: nhóm khung hình -> SVG =====================
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
        case 'w:br': out += ' '; break;
        case 'w:drawing': out += drawingToHtml(c, ctx); break;
        case 'w:pict': out += pictToHtml(c, ctx); break;
        case 'w:object': out += pictToHtml(c, ctx); break;
        case 'mc:AlternateContent': out += altToHtml(c, ctx); break;
      }
    });
    return out;
  }
  function paraToHtml(p, ctx) {
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
    return out.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
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
        var ctx = { images: {}, defPt: defPt, mode: '' }, jobs = [];
        Array.prototype.forEach.call(rels.getElementsByTagName('Relationship'), function (rel) {
          var id = rel.getAttribute('Id'), tg = rel.getAttribute('Target') || '', ty = rel.getAttribute('Type') || '';
          if (!/image$/.test(ty)) return; var mm = mimeOf(tg); if (!mm) return;
          var file = zip.file('word/' + tg.replace(/^\//, '').replace(/^word\//, ''));
          if (file) jobs.push(file.async('base64').then(function (b) { ctx.images[id] = 'data:' + mm + ';base64,' + b; }));
        });
        return Promise.all(jobs).then(function () { return { doc: docXml, ctx: ctx }; });
      });
    });
  }
  function docBlocks(parsed) {
    var body = parsed.doc.getElementsByTagName('w:body')[0], ctx = parsed.ctx, blocks = [];
    (function walk(node) {
      kids(node).forEach(function (c) {
        if (c.nodeName === 'w:p') { var h = paraToHtml(c, ctx); blocks.push({ kind: 'p', html: h }); }
        else if (c.nodeName === 'w:tbl') blocks.push({ kind: 'tbl', html: tblToHtml(c, ctx), node: c });
        else if (c.nodeName === 'w:sdt') { var sc = child(c, 'w:sdtContent'); if (sc) walk(sc); }
      });
    })(body);
    return { blocks: blocks, ctx: ctx };
  }

  // ===================== TÁCH ĐỀ =====================
  var RE_SEC = /^\s*(?:PHẦN|Phần)\s+(IV|III|II|I)\b/i, RE_Q = /^\s*Câu\s+(\d+)\s*[.:]\s*/i, RE_PART = /^\s*([a-d])\s*\)\s*/i, RE_HET = /^\s*[-–—\s]*HẾT[-–—\s]*$/i;
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

  function parseExam(blocks) {
    var sec = 0, cur = null, groups = { 1: [], 2: [], 3: [], 4: [] }, meta = { minutes: null };
    var roman = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4 };
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i], plain = stripTags(b.html);
      if (!sec) { var tm = /Thời gian làm bài\s*(\d+)\s*phút/i.exec(plain); if (tm) meta.minutes = parseInt(tm[1], 10); }
      if (b.kind === 'p' && RE_HET.test(plain)) break;
      var sm = b.kind === 'p' && RE_SEC.exec(plain);
      if (sm) { sec = roman[sm[1].toUpperCase()]; cur = null; continue; }
      if (!sec) continue;
      var qm = b.kind === 'p' && RE_Q.exec(b.html);
      if (qm) { cur = { sec: sec, no: parseInt(qm[1], 10), blocks: [{ kind: 'p', html: b.html.replace(RE_Q, '') }] }; groups[sec].push(cur); continue; }
      if (cur && (b.html && stripTags(b.html) !== '' || /<svg|ld-img|<table/.test(b.html))) cur.blocks.push(b);
    }
    var out = { meta: meta, p1: [], p2: [], p3: [], p4: [], warnings: [] };
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
    tables.forEach(function (rows) {
      if (!rows.length) return;
      var head = rows[0].map(stripTags), first = head[0] || '';
      // Phần I: hàng tiêu đề 1..12, mỗi hàng sau là một mã đề
      if (/Mã\s*Đề/i.test(first) && head[1] === '1' && head.length >= 13) {
        var row = rows.filter(function (r) { return stripTags(r[0]) === code; })[0] || (rows.length === 2 ? rows[1] : null);
        if (row) ans.p1 = row.slice(1).map(function (c) { return stripTags(c).toUpperCase(); });
        return;
      }
      // Phần II / III: hàng tiêu đề là các mã đề, cột đầu là số câu
      if (/Mã\s*Đề/i.test(first) && /^\d{4}$/.test(head[1] || '')) {
        var col = head.indexOf(code); if (col < 0 && head.length === 2) col = 1; if (col < 0) return;
        var isTF = rows.slice(1).every(function (r) { return /^[SĐD]{3,}$/i.test(stripTags(r[col] || '')); });
        rows.slice(1).forEach(function (r) { var no = parseInt(stripTags(r[0]), 10), v = stripTags(r[col] || ''); if (isTF) ans.p2[no] = v.toUpperCase().replace(/Đ/g, 'D'); else ans.p3[no] = v; });
        return;
      }
      // Phần IV: bảng thang điểm, cột cuối chứa "điểm"
      if (rows.every(function (r) { return r.length >= 3 && /điểm/i.test(stripTags(r[r.length - 1])); })) {
        var parts = {}, label = '';
        rows.forEach(function (r) {
          var lb = stripTags(r[0]).toLowerCase(); if (/^[a-d]$/.test(lb)) label = lb;
          var pt = pnum(r[r.length - 1]), line = r.slice(1, r.length - 1).join(' ');
          if (!parts[label]) parts[label] = { lines: [], score: 0 };
          parts[label].lines.push(line + ' <em>(' + stripTags(r[r.length - 1]).replace(/\s*điểm/i, 'đ') + ')</em>'); if (!isNaN(pt)) parts[label].score += pt;
        });
        ans.rubrics.push(parts);
      }
    });
    return ans;
  }

  // ===================== DỰNG CÂU HỎI TESTONLINE =====================
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function buildQuestions(exam, ans, info) {
    var base = { grade: String(info.grade), task: info.task, history: String(info.year), level: 'B', source: 'drive:' + info.code }, qs = { p1: [], p2: [], p3: [], p4: [] }, warn = exam.warnings.slice();
    exam.p1.forEach(function (q) {
      var letter = ans.p1 && ans.p1[q.no - 1], ci = letter ? letter.charCodeAt(0) - 65 : -1;
      if (!(ci >= 0 && ci < 4)) { warn.push('Phần I câu ' + q.no + ': thiếu đáp án'); return; }
      var cs = q.choices.map(function (c, i) { return { choice: c, answer: i === ci }; });
      var refs = q.choices.some(function (c) { return /(\b[A-D]\b\s*(,|và|hoặc)\s*\b[A-D]\b)|(\bcả\b[^.]*\b[A-D]\b)/i.test(stripTags(c)); });
      if (!refs) cs = shuffle(cs);
      qs.p1.push(Object.assign({ ID: 'LD_' + info.code + '_' + info.year + '_P1_' + q.no, type: 'multipleChoice', mainQuestion: q.stem, choices: cs, score: 0.25 }, base));
    });
    qs.p1 = shuffle(qs.p1);
    exam.p2.forEach(function (q) {
      var key = ans.p2[q.no] || '';
      if (key.length !== q.parts.length) { warn.push('Phần II câu ' + q.no + ': số ý (' + q.parts.length + ') không khớp đáp án (' + key + ')'); if (!key) return; }
      qs.p2.push(Object.assign({ ID: 'LD_' + info.code + '_' + info.year + '_P2_' + q.no, type: 'trueFalse', mainQuestion: q.stem,
        subQuestions: q.parts.map(function (p, i) { return { question: p.html, answer: key.charAt(i) === 'D' }; }), score: 1 }, base));
    });
    exam.p3.forEach(function (q) {
      var a = ans.p3[q.no]; if (a === undefined || a === '') { warn.push('Phần III câu ' + q.no + ': thiếu đáp án'); return; }
      var alt = a.indexOf(',') >= 0 ? [a, a.replace(',', '.')] : [a];
      qs.p3.push(Object.assign({ ID: 'LD_' + info.code + '_' + info.year + '_P3_' + q.no, type: 'essay', mainQuestion: q.stem, answer: alt, score: 0.5, _origAnswer: a }, base));
    });
    exam.p4.forEach(function (q, idx) {
      var rb = ans.rubrics[idx]; if (!rb) { warn.push('Phần IV câu ' + q.no + ': thiếu thang điểm'); return; }
      var parts = {}, subs = [], answers = [], total = 0;
      q.parts.forEach(function (p) {
        var r = rb[p.key] || { lines: [], score: 0 }; total += r.score;
        var ah = r.lines.join('<br>'); parts[p.key] = { question: p.html, answer: [ah], score: r.score };
        subs.push({ question: p.html, answer: ah, score: r.score }); answers.push(ah);
      });
      qs.p4.push(Object.assign({ ID: 'LD_' + info.code + '_' + info.year + '_P4_' + q.no, type: 'essay_multi', mainQuestion: q.stem, parts: parts, subQuestions: subs, answer: answers, score: total || 1 }, base));
    });
    return { list: [].concat(qs.p1, qs.p2, qs.p3, qs.p4), warnings: warn, counts: { p1: qs.p1.length, p2: qs.p2.length, p3: qs.p3.length, p4: qs.p4.length } };
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
      res.minutes = exam.meta.minutes; return res;
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
        var res = o.res; if (!res.list.length) throw new Error('Không đọc được câu hỏi nào từ file đề');
        if (res.warnings.length) console.warn('[luyende_drive] Cảnh báo:', res.warnings);
        launch(res, o.info); done();
      })
      .catch(function (e) { console.error('[luyende_drive]', e); note('Lỗi luyện đề: ' + e.message, 'error'); done(); });
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
    displayQuestion(currentQuestionIndex); updateNavigation(); updateProgressBar();
    var td = $('hsktt-timer-display'); if (td) td.style.display = 'block';
    startTimer(minutes * 60);
    try { if (typeof antiCheat !== 'undefined' && antiCheat && typeof antiCheat.start === 'function') antiCheat.start(); } catch (e) { console.warn('antiCheat.start:', e); }
    note('Đã tải đề ' + info.code + ' (' + res.list.length + ' câu, ' + minutes + ' phút).', 'success');
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

  // ===================== XUẤT / KHỞI ĐỘNG =====================
  var api = { CFG: CFG, loadDocx: loadDocx, docBlocks: docBlocks, parseExam: parseExam, parseAnswers: parseAnswers, buildQuestions: buildQuestions, splitChoices: splitChoices, omml: omml, groupToSvg: groupToSvg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LuyenDeDrive = api;
  if (root.document && root.document.getElementById) {
    var tries = 0, go = function () { if (!initUI() && tries++ < 20) setTimeout(go, 300); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
