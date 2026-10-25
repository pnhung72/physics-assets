/**
 * TNReader v0.1 — đọc phiếu trả lời trắc nghiệm từ ảnh chụp.
 * Chạy được trên trình duyệt (window.TNReader) và Node (module.exports).
 * Đầu vào: ảnh xám {w,h,data:Uint8Array}, bố cục (layout JSON), tùy chọn.
 * Đầu ra : đáp án đã đọc + cờ nghi ngờ cho từng câu (KHÔNG đoán bừa).
 */
(function (root) {
  'use strict';

  /* ---------- tiện ích ảnh ---------- */
  function downscale(img, maxW) {
    var s = Math.min(1, maxW / img.w), w = Math.round(img.w * s), h = Math.round(img.h * s);
    var out = new Uint8Array(w * h), inv = 1 / s;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      // lấy trung bình khối để giữ nét mảnh khi thu nhỏ
      var x0 = Math.floor(x * inv), y0 = Math.floor(y * inv), x1 = Math.min(img.w, Math.floor((x + 1) * inv)), y1 = Math.min(img.h, Math.floor((y + 1) * inv)), a = 0, n = 0;
      for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) { a += img.data[yy * img.w + xx]; n++; }
      out[y * w + x] = n ? a / n : 255;
    }
    return { w: w, h: h, data: out, scale: s };
  }

  // Ngưỡng thích nghi (chịu được bóng đổ): điểm tối hơn 78% trung bình cục bộ
  function adaptiveBinary(g, win, ratio) {
    var w = g.w, h = g.h, I = new Float64Array((w + 1) * (h + 1));
    for (var y = 0; y < h; y++) { var row = 0; for (var x = 0; x < w; x++) { row += g.data[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    var bin = new Uint8Array(w * h), r = win >> 1;
    for (var y2 = 0; y2 < h; y2++) {
      var ya = Math.max(0, y2 - r), yb = Math.min(h, y2 + r + 1);
      for (var x2 = 0; x2 < w; x2++) {
        var xa = Math.max(0, x2 - r), xb = Math.min(w, x2 + r + 1);
        var s = I[yb * (w + 1) + xb] - I[ya * (w + 1) + xb] - I[yb * (w + 1) + xa] + I[ya * (w + 1) + xa];
        var m = s / ((xb - xa) * (yb - ya));
        bin[y2 * w + x2] = (g.data[y2 * w + x2] < m * ratio && g.data[y2 * w + x2] < 140) ? 1 : 0;
      }
    }
    return bin;
  }

  function components(bin, w, h) {
    var lab = new Int32Array(w * h), comps = [], stack = [], id = 0;
    for (var i = 0; i < w * h; i++) {
      if (!bin[i] || lab[i]) continue;
      id++; var minx = w, miny = h, maxx = 0, maxy = 0, n = 0, sx = 0, sy = 0;
      stack.length = 0; stack.push(i); lab[i] = id;
      while (stack.length) {
        var p = stack.pop(), px = p % w, py = (p / w) | 0;
        n++; sx += px; sy += py;
        if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var q = ny * w + nx; if (bin[q] && !lab[q]) { lab[q] = id; stack.push(q); }
        }
      }
      comps.push({ x0: minx, y0: miny, w: maxx - minx + 1, h: maxy - miny + 1, n: n, cx: sx / n, cy: sy / n });
    }
    return comps;
  }

  /* ---------- tìm 4 ô vuông định vị ---------- */
  function findCorners(img) {
    var g = downscale(img, 1000);
    var bin = adaptiveBinary(g, Math.max(31, Math.round(g.w / 6)), 0.78);
    var cs = components(bin, g.w, g.h), cand = [];
    var minS = g.w * 0.008, maxS = g.w * 0.07;
    cs.forEach(function (c) {
      var ar = c.w / c.h, fill = c.n / (c.w * c.h);
      if (c.w >= minS && c.w <= maxS && ar > 0.75 && ar < 1.33 && fill > 0.80) cand.push(c);
    });
    if (cand.length < 4) return { ok: false, msg: 'Chỉ thấy ' + cand.length + ' ô vuông định vị (cần 4). Hãy chụp đủ bốn góc phiếu.' };
    var corners = [[0, 0], [g.w, 0], [0, g.h], [g.w, g.h]], pick = [], used = {};
    for (var k = 0; k < 4; k++) {
      var best = -1, bd = 1e18;
      cand.forEach(function (c, i) {
        if (used[i]) return; var d = Math.pow(c.cx - corners[k][0], 2) + Math.pow(c.cy - corners[k][1], 2);
        if (d < bd) { bd = d; best = i; }
      });
      used[best] = 1; pick.push(cand[best]);
    }
    var inv = 1 / g.scale;
    // tinh chỉnh tâm trên ảnh gốc: trọng tâm điểm tối quanh ô
    var pts = pick.map(function (c) { return refineCenter(img, c.cx * inv, c.cy * inv, c.w * inv); });
    return { ok: true, pts: pts, sizePx: pick.map(function (c) { return c.w * inv; }) };
  }
  function refineCenter(img, cx, cy, size) {
    var r = Math.round(size * 0.9), x0 = Math.max(0, Math.round(cx - r)), x1 = Math.min(img.w, Math.round(cx + r)), y0 = Math.max(0, Math.round(cy - r)), y1 = Math.min(img.h, Math.round(cy + r));
    var mn = 255, mx = 0, y, x, v;
    for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) { v = img.data[y * img.w + x]; if (v < mn) mn = v; if (v > mx) mx = v; }
    var th = (mn + mx) / 2, sx = 0, sy = 0, n = 0;
    for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) if (img.data[y * img.w + x] < th) { sx += x; sy += y; n++; }
    return n ? [sx / n + 0.5, sy / n + 0.5] : [cx, cy];
  }

  /* ---------- phép chiếu (homography) ---------- */
  function solveH(src, dst) {
    var A = [], b = [], i;
    for (i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var n = 8, M = A.map(function (r, k) { return r.concat([b[k]]); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      for (var r2 = c + 1; r2 < n; r2++) { var f = M[r2][c] / M[c][c]; for (var k2 = c; k2 <= n; k2++) M[r2][k2] -= f * M[c][k2]; }
    }
    var h = new Array(n);
    for (var r3 = n - 1; r3 >= 0; r3--) { var s = M[r3][n]; for (var k3 = r3 + 1; k3 < n; k3++) s -= M[r3][k3] * h[k3]; h[r3] = s / M[r3][r3]; }
    return h.concat([1]);
  }
  function applyH(H, x, y) { var d = H[6] * x + H[7] * y + 1; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; }

  /* ---------- đo độ đậm một ô tròn ---------- */
  function bubbleScore(img, H, cx, cy, r, off) {
    var c = applyH(H, cx, cy), e = applyH(H, cx + r, cy), f = applyH(H, cx, cy + r);
    var rx = Math.hypot(e[0] - c[0], e[1] - c[1]), ry = Math.hypot(f[0] - c[0], f[1] - c[1]), rr = (rx + ry) / 2;
    if (off) { c[0] += off[0]; c[1] += off[1]; }
    var inner = rr * 0.58, sum = 0, n = 0, step = Math.max(0.7, inner / 5), x, y;
    for (y = -inner; y <= inner; y += step) for (x = -inner; x <= inner; x += step) {
      if (x * x + y * y > inner * inner) continue;
      sum += sample(img, c[0] + x, c[1] + y); n++;
    }
    var mean = sum / n, bg = [], ang;
    for (ang = 0; ang < 360; ang += 30) for (var rad = rr * 1.5; rad <= rr * 1.9; rad += rr * 0.2) bg.push(sample(img, c[0] + rad * Math.cos(ang * Math.PI / 180), c[1] + rad * Math.sin(ang * Math.PI / 180)));
    bg.sort(function (a, b) { return a - b; });
    var white = bg[Math.floor(bg.length * 0.75)] || 255;   // phần trên của vành ngoài = giấy trắng
    return { s: Math.max(0, Math.min(1, (white - mean) / Math.max(white, 60))), mean: mean, white: white, cx: c[0], cy: c[1], r: rr };
  }
  // Căn chỉnh theo khối: tìm độ dịch (dx,dy) làm vành in sẵn của cả khối khớp nhất (vành không đổi dù ô có tô hay chưa)
  function alignGroup(img, H, pts, R) {
    var c0 = applyH(H, pts[0][0], pts[0][1]), e0 = applyH(H, pts[0][0] + R, pts[0][1]), rr = Math.hypot(e0[0] - c0[0], e0[1] - c0[1]);
    var base = pts.map(function (p) { return applyH(H, p[0], p[1]); });
    var span = Math.max(2, rr * 0.55), best = null, step = Math.max(0.5, rr * 0.08), dx, dy;
    function ring(dx, dy) {
      var tot = 0, k = 0;
      for (var i = 0; i < base.length; i++) {
        for (var a = 0; a < 360; a += 45) {
          var ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
          var edge = sample(img, base[i][0] + dx + rr * 0.95 * ca, base[i][1] + dy + rr * 0.95 * sa);
          var out = sample(img, base[i][0] + dx + rr * 1.6 * ca, base[i][1] + dy + rr * 1.6 * sa);
          tot += out - edge; k++;                  // vành tối hơn nền ngoài vành
        }
      }
      return tot / k;
    }
    for (dx = -span; dx <= span; dx += step) for (dy = -span; dy <= span; dy += step) {
      var v = ring(dx, dy); if (!best || v > best.v) best = { v: v, dx: dx, dy: dy };
    }
    return [best.dx, best.dy];
  }

  function sample(img, x, y) {
    x = Math.max(0, Math.min(img.w - 1.001, x)); y = Math.max(0, Math.min(img.h - 1.001, y));
    var x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, d = img.data, w = img.w;
    return (d[y0 * w + x0] * (1 - fx) + d[y0 * w + x0 + 1] * fx) * (1 - fy) + (d[(y0 + 1) * w + x0] * (1 - fx) + d[(y0 + 1) * w + x0 + 1] * fx) * fy;
  }

  /* ---------- quyết định ô nào được tô ---------- */
  var OPT = { tToi: 0.16, tNhat: 0.07, tTuongDoi: 0.55 };
  // scores: mảng điểm đậm; trả {idx:[...], cờ}
  function decide(scores, th) {
    th = th || OPT; var mx = 0, i; for (i = 0; i < scores.length; i++) if (scores[i] > mx) mx = scores[i];
    var idx = [];
    for (i = 0; i < scores.length; i++) if (scores[i] >= th.tToi && scores[i] >= mx * th.tTuongDoi) idx.push(i);
    var flag = null;
    if (idx.length === 0) { flag = mx >= th.tNhat ? 'nhat' : null; }   // 'nhat' = có dấu mờ, cần xem; null = để trống
    else if (idx.length > 1) flag = 'to_doi';
    else {
      // có 1 ô đậm nhưng ô khác cũng khá đậm -> nghi tẩy xóa/tô lem
      var second = 0; for (i = 0; i < scores.length; i++) if (i !== idx[0] && scores[i] > second) second = scores[i];
      if (second >= th.tNhat * 1.6) flag = 'nghi_tay_xoa';
      else if (scores[idx[0]] < th.tToi * 1.4) flag = 'nhat';
    }
    return { idx: idx, flag: flag, scores: scores, max: mx };
  }

  /* ---------- đọc cả phiếu ---------- */
  function readSheet(img, L, opt) {
    var th = Object.assign({}, OPT, opt || {});
    var cr = findCorners(img);
    if (!cr.ok) return { ok: false, msg: cr.msg };
    var H = solveH(L.anchors, cr.pts), R = L.radius;
    var res = { ok: true, form: L.id, corners: cr.pts, sbd: null, made: null, p1: {}, p2: {}, p3: {}, flags: [], bubbles: [] };
    var offMap = new Map(), q0;
    function flat(a) { return [].concat.apply([], a); }
    function group(pts) { pts = pts.filter(Boolean); if (!pts.length) return; var o = alignGroup(img, H, pts, R); pts.forEach(function (p) { offMap.set(p, o); }); }
    if (L.sbd) group(flat(L.sbd));
    if (L.made) group(flat(L.made));
    if (L.q) { for (q0 = 0; q0 < 2; q0++) group(flat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return L.q[String(q0 * 10 + i)]; }))); }
    if (L.p1) { for (q0 = 0; q0 < 4; q0++) group(flat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return L.p1[String(q0 * 10 + i)]; }))); }
    if (L.p2) { for (q0 = 0; q0 < 4; q0++) group(flat([1, 2].map(function (i) { var rows = L.p2[String(q0 * 2 + i)]; return flat(Object.keys(rows).map(function (k) { return rows[k]; })); }))); }
    if (L.p3) { for (var qq in L.p3) group(flat(L.p3[qq].map(function (col) { return Object.keys(col).map(function (k) { return col[k]; }); }))); }
    function sc(p) { var b = bubbleScore(img, H, p[0], p[1], R, offMap.get(p)); res.bubbles.push([b.cx, b.cy, b.r]); return b.s; }
    function digits(cols, name) {
      var s = '', fl = [];
      cols.forEach(function (col, ci) {
        var d = decide(col.map(sc), th);
        if (d.idx.length === 1 && !d.flag) s += d.idx[0];
        else { s += d.idx.length === 0 && !d.flag ? '_' : '?'; if (d.flag || d.idx.length !== 1) res.flags.push({ v: name, vi: ci + 1, loai: d.flag || (d.idx.length === 0 ? 'trong' : 'to_doi') }); }
      });
      return s;
    }
    if (L.sbd) res.sbd = digits(L.sbd, 'SBD');
    if (L.made) res.made = digits(L.made, 'MaDe');
    var q, k;
    if (L.q) for (q in L.q) {            // phiếu 20 câu: 1 phần
      var d1 = decide(L.q[q].map(sc), th);
      res.p1[q] = pack(d1, 'ABCD');
      if (d1.flag || d1.idx.length !== 1) res.flags.push({ v: 'P1', c: +q, loai: d1.flag || (d1.idx.length ? 'to_doi' : 'trong') });
    }
    if (L.p1) for (q in L.p1) {
      var d2 = decide(L.p1[q].map(sc), th);
      res.p1[q] = pack(d2, 'ABCD');
      if (d2.flag || d2.idx.length !== 1) res.flags.push({ v: 'P1', c: +q, loai: d2.flag || (d2.idx.length ? 'to_doi' : 'trong') });
    }
    if (L.p2) for (q in L.p2) {
      res.p2[q] = {};
      'abcd'.split('').forEach(function (ch) {
        var pr = L.p2[q][ch]; if (!pr || !pr[0] || !pr[1]) { res.p2[q][ch] = { v: null, flag: 'khong_co_o' }; return; }
        var d3 = decide(pr.map(sc), th), v = d3.idx.length === 1 ? (d3.idx[0] === 0 ? 'D' : 'S') : null;
        res.p2[q][ch] = { v: v, flag: d3.flag, idx: d3.idx };
        if (d3.flag || d3.idx.length > 1) res.flags.push({ v: 'P2', c: +q, y: ch, loai: d3.flag || 'to_doi' });
      });
    }
    if (L.p3) for (q in L.p3) {
      var str = '', bad = false;
      L.p3[q].forEach(function (col, ci) {
        var keys = Object.keys(col), d4 = decide(keys.map(function (kk) { return sc(col[kk]); }), th);
        if (d4.idx.length === 1 && !d4.flag) str += keys[d4.idx[0]];
        else if (d4.idx.length === 0 && !d4.flag) { /* cột trống: bỏ qua */ }
        else { bad = true; res.flags.push({ v: 'P3', c: +q, cot: ci + 1, loai: d4.flag || 'to_doi' }); str += '?'; }
      });
      res.p3[q] = { v: str, bad: bad };
    }
    return res;
  }
  function pack(d, letters) { return { v: d.idx.length === 1 ? letters[d.idx[0]] : null, flag: d.flag, idx: d.idx, max: +d.max.toFixed(3) }; }

  var api = { readSheet: readSheet, findCorners: findCorners, decide: decide, solveH: solveH, applyH: applyH, OPT: OPT, _sample: sample, _bubbleScore: bubbleScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TNReader = api;
})(typeof window !== 'undefined' ? window : this);
