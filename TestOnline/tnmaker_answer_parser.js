/*!
 * tnmaker_answer_parser.js (v1.0)
 * Đọc file ĐÁP ÁN Word (.docx) đúng mẫu → { codes: { "0201": { mc:[], tf:[], sa:[] } }, barem:[], warnings:[] }
 * Nhận 2 bố cục:
 *   A) Bảng TX của mã:  Phần I: hàng = mã đề, cột = số câu; Phần II: "Mã đề | 101 | 102-104-105 | ..." với cột Câu/ý bên trái
 *   B) Bảng GK/CK của trường: các cặp cột "Câu | Mã đề 0201 | Câu | Mã đề 0202 ...", Phần II có cột "Lệnh hỏi"
 * Tự luận (Phần IV hoặc "Phần III. Tự luận") không đưa vào QR vì không chấm máy được.
 * Dùng:  TNMAnswerParser.parse(arrayBuffer, { JSZip, DOMParser })  → Promise
 */
(function (root) {
'use strict';

function norm(s) { return String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function nfc(s) { try { return s.normalize('NFC'); } catch (e) { return s; } }

// ---------- XML helpers ----------
function kids(node, name) {
   var r = [], c = node.childNodes;
   for (var i = 0; i < c.length; i++) if (c[i].nodeType === 1 && c[i].nodeName === name) r.push(c[i]);
   return r;
}
function firstKid(node, name) { var k = kids(node, name); return k.length ? k[0] : null; }
function textOf(node) {                       // gom w:t, m:t, tab, br — kể cả công thức OMML
   var out = '';
   (function walk(n) {
      var c = n.childNodes;
      for (var i = 0; i < c.length; i++) {
         var x = c[i];
         if (x.nodeType !== 1) continue;
         if (x.nodeName === 'w:t' || x.nodeName === 'm:t') out += x.textContent;
         else if (x.nodeName === 'w:tab' || x.nodeName === 'w:br') out += ' ';
         else if (x.nodeName === 'w:tbl') continue;      // không đệ quy vào bảng lồng
         else walk(x);
      }
   })(node);
   return out;
}
function cellText(tc) {
   return norm(kids(tc, 'w:p').map(textOf).join(' '));
}
function tableToGrid(tbl) {
   var rows = [];
   kids(tbl, 'w:tr').forEach(function (tr) {
      var row = [];
      kids(tr, 'w:tc').forEach(function (tc) {
         var pr = firstKid(tc, 'w:tcPr'), span = 1, vm = null;
         if (pr) {
            var gs = firstKid(pr, 'w:gridSpan'); if (gs) span = parseInt(gs.getAttribute('w:val'), 10) || 1;
            var v = firstKid(pr, 'w:vMerge'); if (v) vm = (v.getAttribute('w:val') === 'restart') ? 'restart' : 'cont';
         }
         var t = cellText(tc);
         for (var k = 0; k < span; k++) row.push({ t: t, dup: k > 0, vm: vm });
      });
      rows.push(row);
   });
   for (var r = 1; r < rows.length; r++)           // trải ô gộp dọc
      for (var c = 0; c < rows[r].length; c++)
         if (rows[r][c].vm === 'cont' && rows[r - 1][c]) rows[r][c] = { t: rows[r - 1][c].t, dup: rows[r][c].dup, vm: 'cont' };
   return rows.map(function (rw) { return rw.map(function (c) { return { t: c.t, dup: c.dup }; }); });
}

// ---------- nhận diện ----------
function partKind(text) {
   var t = nfc(text).toLowerCase();
   if (!/^\s*phần\s+(iv|iii|ii|i|[1-4])\b/.test(t)) return null;
   if (/tự luận/.test(t)) return 'essay';
   if (/đúng\s*[\/\-–]?\s*sai|đúng\s*sai/.test(t)) return 'tf';
   if (/trả lời ngắn/.test(t)) return 'sa';
   if (/nhiều phương án|trắc nghiệm/.test(t)) return 'mc';
   return null;
}
function codesIn(text) {
   var t = nfc(text).replace(/mã\s*đề/gi, ' ');
   return (t.match(/\d{3,4}/g) || []);
}
function toDS(v) {
   var t = nfc(norm(v)).toLowerCase().replace(/[.\s]/g, '');
   if (/^(đ|đúng|true|t|d)$/.test(t)) return 'Đ';
   if (/^(s|sai|false|f)$/.test(t)) return 'S';
   return null;
}
function normSA(v) {
   var t = norm(v).split(/\s+(?:hoặc|or)\s+/i)[0];
   t = t.replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/,/g, '.');
   return t;
}
function ensure(map, code) { if (!map[code]) map[code] = { mc: [], tf: [], sa: [] }; return map[code]; }

// ---------- xử lý từng bảng ----------
function headerRow(grid) {
   for (var r = 0; r < Math.min(grid.length, 4); r++)
      for (var c = 0; c < grid[r].length; c++) if (/mã\s*đề/i.test(nfc(grid[r][c].t))) return r;
   return -1;
}
function isHorizontal(grid, h) {   // Phần I kiểu TX: hàng đầu là số câu 1..N, cột đầu là mã đề
   var nums = 0, tot = 0;
   for (var c = 1; c < grid[h].length; c++) { var t = grid[h][c].t; if (!t) continue; tot++; if (/^\d{1,3}$/.test(t)) nums++; }
   return tot > 0 && nums === tot;
}
function leftNumber(row, from) {
   for (var k = from; k >= 0; k--) { var m = /^(?:câu\s*)?(\d{1,3})$/i.exec(nfc(row[k].t)); if (m) return parseInt(m[1], 10); }
   return null;
}
function parseMcSa(grid, kind, map, warn) {
   var h = headerRow(grid); if (h < 0) { warn.push('Bảng ' + kind + ' không có hàng "Mã đề"'); return; }
   var isMC = kind === 'mc';
   if (isHorizontal(grid, h)) {
      for (var r = h + 1; r < grid.length; r++) {
         var codes = codesIn(grid[r][0].t); if (!codes.length) continue;
         for (var c = 1; c < grid[r].length; c++) {
            var n = parseInt(grid[h][c].t, 10); if (!n) continue;
            var v = isMC ? nfc(norm(grid[r][c].t)).toUpperCase() : normSA(grid[r][c].t);
            if (isMC && !/^[A-D]$/.test(v)) v = '';
            codes.forEach(function (cd) { ensure(map, cd)[kind][n - 1] = v; });
         }
      }
      return;
   }
   for (var c2 = 0; c2 < grid[h].length; c2++) {
      var cell = grid[h][c2]; if (cell.dup) continue;
      var cds = /mã\s*đề/i.test(nfc(cell.t)) ? codesIn(cell.t) : [];
      if (!cds.length) continue;
      for (var r2 = h + 1; r2 < grid.length; r2++) {
         if (!grid[r2][c2]) continue;
         var n2 = leftNumber(grid[r2], c2 - 1); if (!n2) continue;
         var val = isMC ? nfc(norm(grid[r2][c2].t)).toUpperCase() : normSA(grid[r2][c2].t);
         if (isMC && !/^[A-D]$/.test(val)) val = '';
         cds.forEach(function (cd) { ensure(map, cd)[kind][n2 - 1] = val; });
      }
   }
}
function parseTf(grid, map, warn) {
   var h = headerRow(grid); if (h < 0) { warn.push('Bảng Đúng/Sai không có hàng "Mã đề"'); return; }
   var cols = [];
   for (var c = 0; c < grid[h].length; c++) {
      var cell = grid[h][c]; if (cell.dup || !cell.t) continue;
      var t = nfc(cell.t);
      if (/^mã\s*đề$/i.test(t) || /^câu$/i.test(t) || /lệnh\s*hỏi/i.test(t)) continue;
      var cds = codesIn(t); if (cds.length) cols.push({ c: c, codes: cds });
   }
   var data = {};   // code -> q -> [4]
   for (var r = h + 1; r < grid.length; r++) {
      cols.forEach(function (col) {
         var row = grid[r]; if (!row[col.c]) return;
         var yi = -1;
         for (var k = col.c - 1; k >= 0; k--) if (/^[a-d]\s*[\)\.]?$/i.test(nfc(row[k].t))) { yi = k; break; }
         if (yi < 0) return;
         var q = leftNumber(row, yi - 1); if (!q) return;
         var v = toDS(row[col.c].t); if (!v) return;
         var y = nfc(row[yi].t).toLowerCase().charCodeAt(0) - 97;
         col.codes.forEach(function (cd) { data[cd] = data[cd] || {}; data[cd][q] = data[cd][q] || []; data[cd][q][y] = v; });
      });
   }
   Object.keys(data).forEach(function (cd) {
      var m = ensure(map, cd);
      Object.keys(data[cd]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (q) {
         var a = data[cd][q], s = '';
         for (var i = 0; i < 4; i++) s += a[i] || '?';
         if (s.indexOf('?') >= 0) warn.push('Mã ' + cd + ' câu Đ/S ' + q + ' thiếu ý');
         m.tf.push(s);
      });
   });
}

// ---------- chính ----------
async function parse(buf, env) {
   env = env || {};
   var JSZ = env.JSZip || root.JSZip, DP = env.DOMParser || root.DOMParser;
   if (!JSZ || !DP) throw new Error('Thiếu JSZip/DOMParser');
   var zip = await JSZ.loadAsync(buf);
   var f = zip.file('word/document.xml');
   if (!f) throw new Error('Không phải file .docx hợp lệ');
   var doc = new DP().parseFromString(await f.async('string'), 'application/xml');
   var body = doc.getElementsByTagName('w:body')[0];
   var map = {}, warn = [], barem = [], cur = null, order = [];
   (function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
         var n = node.childNodes[i];
         if (n.nodeType !== 1) continue;
         if (n.nodeName === 'w:sdt' || n.nodeName === 'w:sdtContent') { walk(n); continue; }
         if (n.nodeName === 'w:p') {
            var t = norm(textOf(n)); if (!t) continue;
            var pk = partKind(t);
            if (pk) cur = pk;
            if (cur && cur !== 'essay' && /điểm/i.test(t) && barem.length < 14) barem.push((pk ? '' : '') + t.slice(0, 170));
         } else if (n.nodeName === 'w:tbl') {
            if (!cur || cur === 'essay') continue;
            var g = tableToGrid(n); if (!g.length) continue;
            if (cur === 'tf') parseTf(g, map, warn); else parseMcSa(g, cur, map, warn);
         }
      }
   })(body);
   var codes = {};
   Object.keys(map).forEach(function (k) {
      var r = map[k];
      for (var i = 0; i < r.mc.length; i++) if (r.mc[i] === undefined) r.mc[i] = '';
      for (var j = 0; j < r.sa.length; j++) if (r.sa[j] === undefined) r.sa[j] = '';
      if (r.mc.indexOf('') >= 0) warn.push('Mã ' + k + ': thiếu đáp án trắc nghiệm ở câu ' + (r.mc.indexOf('') + 1));
      if (r.sa.indexOf('') >= 0) warn.push('Mã ' + k + ': thiếu đáp án trả lời ngắn ở câu ' + (r.sa.indexOf('') + 1));
      codes[k] = r;
   });
   // đồng nhất số câu giữa các mã đề
   var ks = Object.keys(codes);
   ['mc', 'tf', 'sa'].forEach(function (p) {
      var lens = ks.map(function (k) { return codes[k][p].length; });
      if (lens.length && Math.min.apply(null, lens) !== Math.max.apply(null, lens)) warn.push('Số câu phần "' + p + '" khác nhau giữa các mã đề: ' + lens.join('/'));
   });
   return { codes: codes, barem: barem, warnings: warn };
}

var api = { parse: parse, _codesIn: codesIn, _normSA: normSA };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.TNMAnswerParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
