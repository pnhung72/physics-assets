/* tnmaker_bundle.js = tnmaker_qr_export (v1.2) + tnmaker_answer_parser (v1.0) + tnmaker_drive (v1.0) */
/*!
 * tnmaker_qr_export.js  (v1.2)
 * Xuất mã QR đáp án chuẩn TNMaker (Smart Test, type 5) vào file Word riêng,
 * và (tuỳ chọn) file Excel đáp án mẫu SmartTest (sheet BTPRO).
 * Đặt cùng thư mục với exam_docx_export.js:  physics-assets/TestOnline/tnmaker_qr_export.js
 *
 * Gọi từ trang chính:  window.TNMakerQR.run(examPackages)
 *   - window.TNM_EXPORT_XLSX = true  → xuất kèm file .xlsx
 * Phụ thuộc có sẵn trong trang: JSZip, window.ExamRules, window.ExamDocx (docx), window.currentExportConfig.
 */
(function () {
'use strict';
function notify(msg, type) {
   if (typeof window.showNotification === 'function') window.showNotification(msg, type);
   else console.log('[TNMakerQR]', msg);
}
// ===== [TNMaker] Xuất file Excel đáp án đúng mẫu "SmartTest" để nhập vào qr-code.tnmaker.net =====
// Cấu trúc: sheet "BTPRO"; hàng 1 = "Câu\Mã đề" + các mã đề; cột A = số câu liên tục (Phần I → II → III).
// Trắc nghiệm: A/B/C/D | Đúng-Sai: "ĐĐSĐ" | Trả lời ngắn: số dùng dấu phẩy (54,6). Tự luận không đưa vào.
function tnmCollectParts(exam) {
   var all = [];
   if (exam.parts) { ['I', 'II', 'III', 'IV'].forEach(function (p) { if (exam.parts[p]) all.push.apply(all, exam.parts[p]); }); }
   else { all = exam.testData || exam.questions || []; }
   var buckets = { I: [], II: [], III: [] };
   all.forEach(function (q) {
      if (!q) return;
      var t = q.type === 'essay-multi' ? 'essay_multi' : q.type;
      var p = window.ExamRules ? window.ExamRules.partOf(t) : null;
      if (buckets[p]) buckets[p].push(q);
   });
   var r = { mc: [], tf: [], sa: [] };
   buckets.I.forEach(function (q) {
      var i = (q.choices || []).findIndex(function (c) { return c.isCorrect === true || c.answer === 'true' || c.answer === true; });
      r.mc.push(i >= 0 ? String.fromCharCode(65 + i) : '');
   });
   buckets.II.forEach(function (q) {
      r.tf.push((q.subQuestions || []).map(function (s) { return (s.answer === true || s.answer === 'true') ? 'Đ' : 'S'; }).join(''));
   });
   buckets.III.forEach(function (q) {
      var a = Array.isArray(q.answer) ? q.answer[0] : q.answer;
      a = String(a == null ? '' : a).replace(/<[^>]*>/g, '').replace(/\\[()\[\]]|\$/g, '')
         .replace(/\{,\}/g, ',')                                  // LaTeX 2{,}5 → 2,5
         .replace(/\\(?:,|;|:|!|quad|qquad|left|right|displaystyle)/g, '')
         .replace(/\\(?:text|mathrm)\{[^}]*\}/g, '')              // bỏ đơn vị dạng \text{m/s}
         .replace(/[{}]/g, '')
         .replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/,/g, '.');   // dạng chuẩn: dấu chấm
      r.sa.push(a);
   });
   return r;
}
function tnmCollectAnswers(exam) {          // dùng cho Excel (Smart Test): trả lời ngắn dùng dấu phẩy
   var r = tnmCollectParts(exam);
   return r.mc.concat(r.tf, r.sa.map(function (s) { return s.replace(/\./g, ','); }));
}
function tnmColName(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function tnmEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
async function tnmBuildXlsx(examPackages) {
   var cols = examPackages.map(function (e) { return { code: String(e.code), ans: e._ans || tnmCollectAnswers(e) }; });
   var nQ = Math.max.apply(null, cols.map(function (c) { return c.ans.length; }).concat([0]));
   var sst = [], sstMap = {};
   function si(s) { s = String(s); if (!(s in sstMap)) { sstMap[s] = sst.length; sst.push(s); } return sstMap[s]; }
   var rows = [];
   var r1 = '<c r="A1" t="s"><v>' + si('Câu\\Mã đề') + '</v></c>';
   cols.forEach(function (c, j) { r1 += '<c r="' + tnmColName(j + 1) + '1" t="s"><v>' + si(c.code) + '</v></c>'; });
   rows.push('<row r="1">' + r1 + '</row>');
   for (var q = 0; q < nQ; q++) {
      var rn = q + 2, r = '<c r="A' + rn + '"><v>' + (q + 1) + '</v></c>';
      cols.forEach(function (c, j) {
         var v = c.ans[q];
         if (v !== undefined && v !== '') r += '<c r="' + tnmColName(j + 1) + rn + '" t="s"><v>' + si(v) + '</v></c>';
      });
      rows.push('<row r="' + rn + '">' + r + '</row>');
   }
   var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
   var NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
   var RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
   var zip = new JSZip();
   zip.file('[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
   zip.file('_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
   zip.file('xl/workbook.xml', X + '<workbook ' + NS + ' ' + RNS + '><sheets><sheet name="BTPRO" sheetId="1" r:id="rId1"/></sheets></workbook>');
   zip.file('xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>');
   zip.file('xl/worksheets/sheet1.xml', X + '<worksheet ' + NS + '><sheetData>' + rows.join('') + '</sheetData></worksheet>');
   zip.file('xl/sharedStrings.xml', X + '<sst ' + NS + ' count="' + sst.length + '" uniqueCount="' + sst.length + '">' + sst.map(function (s) { return '<si><t xml:space="preserve">' + tnmEsc(s) + '</t></si>'; }).join('') + '</sst>');
   return { blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), cols: cols, nQ: nQ };
}
async function tnmXlsxFromMap(map) {
   if (typeof JSZip === 'undefined') throw new Error('Chưa tải được thư viện JSZip');
   var pk = Object.keys(map).map(function (k) { var r = map[k]; return { code: k, _ans: (r.mc || []).concat(r.tf || [], (r.sa || []).map(function (x) { return String(x).replace(/\./g, ','); })) }; });
   return (await tnmBuildXlsx(pk)).blob;
}
async function exportTNMakerExcel(examPackages) {
   if (typeof JSZip === 'undefined') throw new Error('Chưa tải được thư viện JSZip');
   var res = await tnmBuildXlsx(examPackages);
   var blank = [];
   res.cols.forEach(function (c) { for (var i = 0; i < res.nQ; i++) if (!c.ans[i]) blank.push('mã ' + c.code + ' câu ' + (i + 1)); });
   var a = document.createElement('a');
   var url = URL.createObjectURL(res.blob);
   a.href = url; a.download = 'Dap_an_TNMaker_' + new Date().toISOString().slice(0, 10) + '.xlsx';
   document.body.appendChild(a); a.click(); document.body.removeChild(a);
   setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
   if (blank.length) notify('⚠️ File đáp án TNMaker còn ô trống: ' + blank.slice(0, 5).join(', ') + (blank.length > 5 ? '…' : ''), 'warning');
   else notify('✅ Đã xuất file đáp án TNMaker (.xlsx) — mở qr-code.tnmaker.net, chọn định dạng Smart Test rồi tải file lên.', 'success');
   return res;
}

// ===== [TNMaker] Mã QR đáp án (định dạng Smart Test, type 5) → file Word riêng =====
// Mỗi mã đề:  "<trắc nghiệm liền>#<Đ/S cách nhau _>#<trả lời ngắn cách nhau _>"
var TNM_QR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
var TNM_QR_MAX_BYTES = 1700;   // vượt mức này thì tách thành nhiều QR cho dễ quét
function tnmByteLen(s) { return new TextEncoder().encode(s).length; }
function tnmGroupItems(items) {
   var groups = [], cur = {}, curN = 0;
   function str(o) { var x = JSON.parse(JSON.stringify(o)); x.success = true; x.type = 5; return JSON.stringify(x); }
   items.forEach(function (it) {
      var t = {}; Object.keys(cur).forEach(function (k) { t[k] = cur[k]; }); t[it[0]] = it[1];
      if (curN > 0 && tnmByteLen(str(t)) > TNM_QR_MAX_BYTES) { groups.push(cur); cur = {}; curN = 0; }
      cur[it[0]] = it[1]; curN++;
   });
   if (curN > 0) groups.push(cur);
   return groups.map(function (g) { return { codes: Object.keys(g), text: str(g) }; });
}
function tnmItemOf(code, r) { return [String(code), r.mc.join('') + '#' + r.tf.join('_') + '#' + r.sa.join('_')]; }
function tnmQrPayloads(examPackages) {
   return tnmGroupItems(examPackages.map(function (e) { return tnmItemOf(e.code, tnmCollectParts(e)); }));
}
// map = { "0201": { mc:['A',..], tf:['ĐSĐS',..], sa:['3.95',..] }, ... }  (đọc từ file đáp án trên Drive)
function tnmQrPayloadsFromMap(map) {
   return tnmGroupItems(Object.keys(map).map(function (k) { var r = map[k]; return tnmItemOf(k, { mc: r.mc || [], tf: r.tf || [], sa: r.sa || [] }); }));
}
function tnmLoadQrLib() {
   if (typeof qrcode !== 'undefined') return Promise.resolve();
   return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = TNM_QR_URL;
      s.onload = res; s.onerror = function () { rej(new Error('Không tải được thư viện QR')); };
      document.head.appendChild(s);
   });
}
function tnmQrMatrix(text) {
   var fn = qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8'];
   if (fn) qrcode.stringToBytes = fn;
   var qr = qrcode(0, 'M'); qr.addData(text, 'Byte'); qr.make();
   var n = qr.getModuleCount(), m = [];
   for (var r = 0; r < n; r++) { var row = []; for (var c = 0; c < n; c++) row.push(qr.isDark(r, c)); m.push(row); }
   return m;
}
async function tnmQrPngBytes(matrix) {
   var n = matrix.length, cell = 8, quiet = 4, size = (n + quiet * 2) * cell;
   var cv = document.createElement('canvas'); cv.width = cv.height = size;
   var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000';
   for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (matrix[r][c]) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
   var blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
   return new Uint8Array(await blob.arrayBuffer());
}
function tnmSave(blob, name) {
   var a = document.createElement('a'), url = URL.createObjectURL(blob);
   a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
   setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}
async function tnmBuildQrDocx(D, groups, pngs, meta) {
   var P = D.Paragraph, T = D.TextRun, AL = D.AlignmentType, kids = [];
   groups.forEach(function (g, i) {
      if (i > 0) kids.push(new P({ pageBreakBefore: true, children: [] }));
      kids.push(new P({ alignment: AL.CENTER, children: [new T({ text: 'MÃ QR ĐÁP ÁN – TNMAKER (Smart Test)', bold: true, size: 30, font: 'Times New Roman' })] }));
      if (meta && meta.title) kids.push(new P({ alignment: AL.CENTER, children: [new T({ text: meta.title, size: 26, font: 'Times New Roman' })] }));
      kids.push(new P({ alignment: AL.CENTER, spacing: { before: 120, after: 120 }, children: [new T({ text: 'Mã đề: ' + g.codes.join(', ') + (groups.length > 1 ? '   (QR ' + (i + 1) + '/' + groups.length + ')' : ''), size: 26, font: 'Times New Roman' })] }));
      kids.push(new P({ alignment: AL.CENTER, children: [new D.ImageRun({ type: 'png', data: pngs[i], transformation: { width: 380, height: 380 } })] }));
      if (meta && meta.barem && meta.barem.length && i === 0) {
         kids.push(new P({ spacing: { before: 200 }, children: [new T({ text: 'Barem điểm (trích từ file đáp án – cài trong app TNMaker nếu cần):', bold: true, size: 22, font: 'Times New Roman' })] }));
         meta.barem.forEach(function (ln) { kids.push(new P({ children: [new T({ text: '• ' + ln, size: 22, font: 'Times New Roman' })] })); });
      }
      kids.push(new P({ alignment: AL.CENTER, spacing: { before: 160 }, children: [new T({ text: 'Dành cho giáo viên – KHÔNG phát cho học sinh. Trong app TNMaker chọn "Nhập đáp án bằng QR" rồi quét mã này.', italics: true, size: 22, font: 'Times New Roman' })] }));
   });
   return await D.Packer.toBlob(new D.Document({ sections: [{ children: kids }] }));
}
// Dựng QR + file Word (không tải xuống). Trả về { kind:'docx', blob, groups } hoặc { kind:'png', pngs, groups }
async function tnmRender(groups, meta) {
   await tnmLoadQrLib();
   var pngs = [];
   for (var i = 0; i < groups.length; i++) pngs.push(await tnmQrPngBytes(tnmQrMatrix(groups[i].text)));
   var D = window.docx || (window.ExamDocx && window.ExamDocx.docx);
   if (D && D.ImageRun && D.Packer) return { kind: 'docx', blob: await tnmBuildQrDocx(D, groups, pngs, meta), groups: groups, pngs: pngs };
   return { kind: 'png', pngs: pngs, groups: groups };
}
async function exportTNMakerQR(examPackages, config) {
   var groups = tnmQrPayloads(examPackages);
   var cfg = config || window.currentExportConfig || {}, stamp = new Date().toISOString().slice(0, 10);
   var r = await tnmRender(groups, { title: cfg.examName || '' });
   if (r.kind === 'docx') tnmSave(r.blob, 'QR_dap_an_TNMaker_' + stamp + '.docx');
   else r.pngs.forEach(function (b, i) { tnmSave(new Blob([b], { type: 'image/png' }), 'QR_dap_an_TNMaker_' + stamp + '_' + (i + 1) + '.png'); });
   notify('✅ Đã xuất ' + groups.length + ' mã QR đáp án TNMaker (' + examPackages.length + ' mã đề).', 'success');
   return groups;
}


async function run(examPackages, config) {
   var out = {};
   out.qr = await exportTNMakerQR(examPackages, config);
   if (window.TNM_EXPORT_XLSX) { try { out.xlsx = await exportTNMakerExcel(examPackages); } catch (e) { console.error('TNMaker xlsx:', e); } }
   return out;
}
window.TNMakerQR = { run: run, exportQR: exportTNMakerQR, exportExcel: exportTNMakerExcel, payloads: tnmQrPayloads, payloadsFromMap: tnmQrPayloadsFromMap, render: tnmRender, buildXlsxFromMap: tnmXlsxFromMap, version: '1.2' };
})();

;
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

;
/*!
 * tnmaker_drive.js (v1.0)
 * - Mỗi lần "Tải Gói Đề (Word)": tự ghi Đề + Đáp án + Excel đáp án + QR TNMaker lên đúng thư mục Drive (theo lớp + loại bài), tên theo quy tắc.
 * - "Chuyển đáp án QR": đọc file đáp án Word/Excel trong thư mục công cụ → tạo QR TNMaker → ghi vào cùng thư mục.
 * - "Quét đề nhà trường": tìm đáp án GK/CK chưa có QR trong các thư mục → tạo QR.
 * Cần nạp SAU: JSZip, tnmaker_qr_export.js, tnmaker_answer_parser.js. Cần Code.gs đã triển khai.
 *
 * Quy tắc tên file (do mã ghi):
 *   De2025-2026_L11_TX1_20261024-1530.docx        đề (mã soạn)
 *   Da2025-2026_L11_TX1_20261024-1530.docx        đáp án
 *   QR_Da2025-2026_L11_TX1_20261024-1530.docx     QR TNMaker
 *   TNM_Da2025-2026_L11_TX1_20261024-1530.xlsx    Excel Smart Test
 *   DeT… / DaT… : đề/đáp án do nhà trường soạn (bạn tự tải lên) — mã vẫn tìm thấy và tạo QR_DaT….docx
 */
(function () {
'use strict';
var LS_URL = 'tnm_drive_url', LS_TOK = 'tnm_drive_token';
var DEFAULT_URL = 'https://script.google.com/macros/s/AKfycby3afxdLUYnOwgGrn3SoFAtQYUlF7QlE9mbvSBOABGDVIlXFW6z93APJqaWsnr8eb9Ozw/exec';   // địa chỉ /exec (không phải bí mật). TOKEN thì chỉ nhập trên trang, KHÔNG ghi vào file này.
var MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
var MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var MIME_GDOC = 'application/vnd.google-apps.document';

// ===== Thư mục Drive (lớp 12: thêm sau, để trống = chưa ghi lên Drive) =====
var FOLDERS = {
   '10': { TX1: '1_GTP5wCXa7onGk4iAYX1Ts4Ps1poinNQ', TX2: '1ip_tnq96cVLtTtBxhFPtKYoGiuiQfZA4', TX4: '1lI166A9Xwh0iHQxMyIYvPpYqukp5_q9A', TX5: '1SoByDxZwC-X89Btr_IlW4sH_s1ttlfJe',
          GK1: '19Rp2lfy9qcJuyCaM9yEcruOXL2V9nu8F', CK1: '1Fu5kC_rMeG_sBSqbxGBiA5O5Q80eA2Jo', GK2: '1EE3Iy9HI_EkNHaxJcuLNEzmo-hHclm-h', CK2: '1yaxmGHO-n11gytik6mXw26IJhmD9ExZi' },
   '11': { TX1: '1WrrQJzehWRePGlP9prCUKEzqjchVWde7', TX2: '1k9G-f1iiSDPL-CN9JeheLwvoLhOkUNT2', TX4: '1HckVVWWzhpWl4A_WlyYSwX8Woic_NbUP', TX5: '1TpJpg9UuJkqXuck_CQa2p0IsduEP8vce',
          GK1: '1qU8iSwBfOcVwvCA_r4wSOfKlF2gV20op', GK2: '1u_XU6sMw52INVOYj2vf5_0LsJpqK2jja', CK1: '1PY4lI5BnDbEQOK-7rocrGDPfrxbZaPlu', CK2: '1h0y5s1ZnYJqoJGRz4B4h8lqkp_vPEous' },
   '12': {}
};
var TOOL_FOLDER = '1Umbn376GBd4E_c-qvNvcO8roraaNqFcm';
var SAMPLE = { TX: '1TEQLUZo9LGGf58sZeGeJKWOG3N8WZKkJ', GK: '14qvSc9lzJnuVuhVilNYIYqp7ksL-obb-', CK: '1lhfBZ0N2cLa27H4yxiPVkWaB0L7L3sp_' };   // Đề mẫu = đề nhà trường
function scanFolders() {
   var r = [{ id: SAMPLE.GK, label: 'Đề mẫu/GK' }, { id: SAMPLE.CK, label: 'Đề mẫu/CK' }];
   ['10', '11', '12'].forEach(function (g) { ['GK1', 'CK1', 'GK2', 'CK2'].forEach(function (t) { if (FOLDERS[g][t]) r.push({ id: FOLDERS[g][t], label: 'Lớp ' + g + '/' + t }); }); });
   return r;
}

function notify(m, t) { if (typeof window.showNotification === 'function') window.showNotification(m, t || 'info'); else console.log('[TNMDrive]', m); }
function cfg() { try { return { url: localStorage.getItem(LS_URL) || DEFAULT_URL, token: localStorage.getItem(LS_TOK) || '' }; } catch (e) { return { url: DEFAULT_URL, token: '' }; } }
function configured() { var c = cfg(); return !!(c.url && c.token); }

// ===== Bắt các file Word/Excel do trang tải xuống (để ghi thêm lên Drive) =====
var blobUrls = {}, caught = [];
(function () {
   var oc = URL.createObjectURL;
   URL.createObjectURL = function (b) { var u = oc.apply(URL, arguments); if (b instanceof Blob) { blobUrls[u] = b; var ks = Object.keys(blobUrls); if (ks.length > 40) delete blobUrls[ks[0]]; } return u; };
   function rec(a) {
      try {
         if (!a || !a.download || !blobUrls[a.href]) return;
         var b = blobUrls[a.href];
         for (var i = 0; i < caught.length; i++) if (caught[i].blob === b) return;
         caught.push({ name: a.download, blob: b, t: Date.now() });
         if (caught.length > 30) caught.shift();
      } catch (e) {}
   }
   var ac = HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click = function () { rec(this); return ac.apply(this, arguments); };
   var de = EventTarget.prototype.dispatchEvent;
   EventTarget.prototype.dispatchEvent = function (ev) { if (this instanceof HTMLAnchorElement && ev && ev.type === 'click') rec(this); return de.apply(this, arguments); };
})();

// ===== Quy tắc tên =====
function pad(n) { return (n < 10 ? '0' : '') + n; }
function stamp() { var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()); }
function yearTag(c) {
   var m = String((c && c.schoolYear) || '').match(/(\d{4})\D+(\d{4})/);
   if (m) return m[1] + '-' + m[2];
   var d = new Date(), y = d.getFullYear();
   return d.getMonth() >= 7 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
}
function detectType(c) {
   var n = String((c && c.examName) || '') + ' ' + String((c && c.semester) || '');
   var m = /(?:^|[^A-Za-z0-9])(TX|GK|CK)\s*(\d)/i.exec(n);
   if (m) return m[1].toUpperCase() + m[2];
   var hk = /KỲ\s*(II|2)\b/i.test(n) ? '2' : '1';
   if (/giữa/i.test(n)) return 'GK' + hk;
   if (/cuối/i.test(n)) return 'CK' + hk;
   return null;
}
function baseName(role, c, type, tag) { return role + yearTag(c) + '_L' + String(c.grade || '') + '_' + type + '_' + tag; }
function classify(name) {
   if (/\.xlsx$/i.test(name)) return /tnmaker|dap_?an/i.test(name) ? 'xlsx' : null;
   if (/^QR_/i.test(name)) return 'qr';
   if (/^de[_\-\s]?thi/i.test(name)) return 'de';
   if (/^(dap[_\-\s]?an|đáp án)/i.test(name)) return 'da';
   return null;
}

// ===== Gọi Drive =====
async function driveGet(params) {
   var c = cfg(); if (!configured()) throw new Error('Chưa cấu hình Drive (mở bảng ☁️ TNMaker Drive)');
   var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
   var r = await fetch(c.url + (c.url.indexOf('?') >= 0 ? '&' : '?') + q + '&t=' + encodeURIComponent(c.token));
   var j = await r.json(); if (!j.success) throw new Error(j.error || 'Lỗi Drive'); return j;
}
function blobToB64(blob) { return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(String(fr.result).split(',')[1]); }; fr.onerror = no; fr.readAsDataURL(blob); }); }
async function driveUpload(folderId, name, blob, mime) {
   var c = cfg(); if (!configured()) throw new Error('Chưa cấu hình Drive');
   var r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: c.token, action: 'upload', folderId: folderId, name: name, mime: mime || blob.type, b64: await blobToB64(blob), overwrite: true }) });
   var j = await r.json(); if (!j.success) throw new Error(j.error || 'Lỗi ghi Drive'); return j;
}
function b64ToBytes(b64) { var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

// ===== Sau khi xuất đề: ghi lên Drive =====
async function afterExport(examPackages, config) {
   if (!configured()) { notify('ℹ️ Chưa cấu hình Drive nên chưa ghi lên Drive (bấm ☁️ TNMaker Drive để cài).', 'info'); return; }
   var c = config || {};
   var grade = String(c.grade || (examPackages[0] && examPackages[0].grade) || ''), type = detectType(c);
   var folder = FOLDERS[grade] && type && FOLDERS[grade][type];
   if (!folder) { notify('ℹ️ Chưa có thư mục Drive cho lớp ' + (grade || '?') + ' / ' + (type || 'loại bài chưa nhận ra') + ' — chỉ lưu trên máy.', 'warning'); return; }
   await new Promise(function (r) { setTimeout(r, 1200); });
   var tag = stamp(), now = Date.now(), cc = { schoolYear: c.schoolYear, grade: grade };
   var items = caught.filter(function (x) { return now - x.t < 180000 && !x.done; });
   var ok = 0, fail = [];
   for (var i = 0; i < items.length; i++) {
      var it = items[i], k = classify(it.name); if (!k) continue;
      var nm = k === 'de' ? baseName('De', cc, type, tag) + '.docx'
             : k === 'da' ? baseName('Da', cc, type, tag) + '.docx'
             : k === 'qr' ? 'QR_' + baseName('Da', cc, type, tag) + '.docx'
             : 'TNM_' + baseName('Da', cc, type, tag) + '.xlsx';
      try { await driveUpload(folder, nm, it.blob, it.blob.type || (/xlsx$/.test(nm) ? MIME_XLSX : MIME_DOCX)); it.done = true; ok++; }
      catch (e) { fail.push(nm + ': ' + e.message); }
   }
   if (fail.length) notify('⚠️ Ghi Drive lỗi ' + fail.length + ' file: ' + fail[0], 'warning');
   if (ok) notify('☁️ Đã ghi ' + ok + ' file lên Drive (lớp ' + grade + ' / ' + type + ').', 'success');
   else if (!fail.length) notify('ℹ️ Không bắt được file nào để ghi lên Drive (trình duyệt chặn tải?).', 'warning');
}

// ===== Đọc file đáp án (Word hoặc Excel Smart Test) =====
async function parseXlsxSmart(buf) {
   var zip = await JSZip.loadAsync(buf), sst = [];
   var ss = zip.file('xl/sharedStrings.xml'); 
   if (ss) { var d = new DOMParser().parseFromString(await ss.async('string'), 'application/xml'); var si = d.getElementsByTagName('si'); for (var i = 0; i < si.length; i++) sst.push(si[i].textContent); }
   var sh = zip.file('xl/worksheets/sheet1.xml'); if (!sh) throw new Error('Không đọc được sheet đầu của Excel');
   var sd = new DOMParser().parseFromString(await sh.async('string'), 'application/xml'), rows = sd.getElementsByTagName('row'), grid = [];
   function col(ref) { var m = /^([A-Z]+)/.exec(ref)[1], n = 0; for (var i = 0; i < m.length; i++) n = n * 26 + m.charCodeAt(i) - 64; return n - 1; }
   for (var r = 0; r < rows.length; r++) {
      var cs = rows[r].getElementsByTagName('c'), row = [];
      for (var j = 0; j < cs.length; j++) { var v = cs[j].getElementsByTagName('v')[0], t = cs[j].getAttribute('t'); var x = v ? v.textContent : ''; row[col(cs[j].getAttribute('r'))] = t === 's' ? sst[+x] : x; }
      grid.push(row);
   }
   var codes = {}, warn = [];
   if (!grid.length) throw new Error('Excel trống');
   for (var c = 1; c < grid[0].length; c++) {
      var code = String(grid[0][c] || '').trim(); if (!code) continue;
      var o = { mc: [], tf: [], sa: [] };
      for (var q = 1; q < grid.length; q++) {
         var val = String((grid[q] && grid[q][c]) || '').trim(); if (!val) continue;
         if (/^[A-D]$/i.test(val)) o.mc.push(val.toUpperCase());
         else if (/^[ĐS]{4}$/.test(val)) o.tf.push(val);
         else o.sa.push(val.replace(/,/g, '.'));
      }
      codes[code] = o;
   }
   return { codes: codes, barem: [], warnings: warn };
}
async function loadAnswers(file) {
   var j = await driveGet({ action: 'get', fileId: file.id }), buf = b64ToBytes(j.b64);
   if (/\.xlsx$/i.test(file.name) || j.mime === MIME_XLSX) return parseXlsxSmart(buf);
   return window.TNMAnswerParser.parse(buf, { JSZip: window.JSZip, DOMParser: window.DOMParser });
}
async function ensureDocx() {
   if (window.docx && window.docx.ImageRun) return;
   try {
      if (typeof loadExamDocxLib === 'function') await loadExamDocxLib();
      if (window.ExamDocx && typeof DOCX_NPM_URL !== 'undefined') await window.ExamDocx.loadDocx(DOCX_NPM_URL);
   } catch (e) { console.warn('TNMDrive: chưa nạp được thư viện docx', e); }
}
function summary(p) {
   var ks = Object.keys(p.codes), f = ks.length ? p.codes[ks[0]] : { mc: [], tf: [], sa: [] };
   return ks.length + ' mã đề (' + ks.slice(0, 8).join(', ') + (ks.length > 8 ? '…' : '') + '); mỗi mã: ' + f.mc.length + ' TN, ' + f.tf.length + ' Đ/S, ' + f.sa.length + ' trả lời ngắn';
}
// Đọc 1 file đáp án → tạo QR + Excel → ghi vào folderId
async function makeQrFor(file, folderId, opts) {
   opts = opts || {};
   var p = await loadAnswers(file);
   if (!Object.keys(p.codes).length) throw new Error('Không đọc được mã đề nào trong "' + file.name + '" (bảng không đúng mẫu?)');
   if (opts.confirm !== false) {
      var msg = '📄 ' + file.name + '\n' + summary(p) + (p.warnings.length ? '\n\n⚠️ ' + p.warnings.slice(0, 5).join('\n⚠️ ') : '') + '\n\nTạo QR TNMaker và ghi vào Drive?';
      if (!window.confirm(msg)) return { skipped: true };
   }
   await ensureDocx();
   var base = file.name.replace(/\.[^.]+$/, '');
   var groups = window.TNMakerQR.payloadsFromMap(p.codes);
   var r = await window.TNMakerQR.render(groups, { title: base, barem: p.barem });
   if (r.kind === 'docx') await driveUpload(folderId, 'QR_' + base + '.docx', r.blob, MIME_DOCX);
   else for (var i = 0; i < r.pngs.length; i++) await driveUpload(folderId, 'QR_' + base + '_' + (i + 1) + '.png', new Blob([r.pngs[i]], { type: 'image/png' }), 'image/png');
   try { await driveUpload(folderId, 'TNM_' + base + '.xlsx', await window.TNMakerQR.buildXlsxFromMap(p.codes), MIME_XLSX); } catch (e) { console.warn('xlsx:', e); }
   return { groups: groups.length, codes: Object.keys(p.codes).length };
}
function isAnswerFile(f) {
   if (/^(QR_|TNM_)/i.test(f.name)) return false;
   if (!(/\.(docx|xlsx)$/i.test(f.name) || f.mime === MIME_GDOC)) return false;
   return /^(DaT?\d|DaT?_|Da\d|đáp án|dap_?an)/i.test(f.name.normalize ? f.name.normalize('NFC') : f.name);
}

// 1) thư mục công cụ: lấy file mới nhất (không phải QR_/TNM_) → QR cùng thư mục
async function convertToolFolder() {
   var l = (await driveGet({ action: 'list', folderId: TOOL_FOLDER })).files.filter(function (f) { return !/^(QR_|TNM_)/i.test(f.name) && (/\.(docx|xlsx)$/i.test(f.name) || f.mime === MIME_GDOC); });
   if (!l.length) throw new Error('Thư mục công cụ chưa có file đáp án (.docx / .xlsx)');
   l.sort(function (a, b) { return b.updated - a.updated; });
   var res = await makeQrFor(l[0], TOOL_FOLDER);
   if (!res.skipped) notify('✅ Đã tạo QR cho "' + l[0].name + '" (' + res.codes + ' mã đề) — xem trong thư mục công cụ.', 'success');
   return res;
}
// 2) quét đề nhà trường: đáp án chưa có QR_<tên>.docx
async function scanSchool(log) {
   var todo = [];
   var fs = scanFolders();
   for (var i = 0; i < fs.length; i++) {
      var files; try { files = (await driveGet({ action: 'list', folderId: fs[i].id })).files; } catch (e) { log && log('⚠️ ' + fs[i].label + ': ' + e.message); continue; }
      var have = {}; files.forEach(function (f) { have[f.name] = 1; });
      files.filter(isAnswerFile).forEach(function (f) {
         var base = f.name.replace(/\.[^.]+$/, '');
         if (!have['QR_' + base + '.docx'] && !have['QR_' + base + '_1.png']) todo.push({ file: f, folder: fs[i].id, label: fs[i].label });
      });
   }
   if (!todo.length) { notify('✅ Không có đáp án nào thiếu QR.', 'success'); return []; }
   if (!window.confirm('Tìm thấy ' + todo.length + ' file đáp án chưa có QR:\n\n' + todo.slice(0, 12).map(function (x) { return '• ' + x.label + ': ' + x.file.name; }).join('\n') + '\n\nTạo QR cho tất cả? (mỗi file sẽ hỏi xác nhận kết quả đọc)')) return [];
   var out = [];
   for (var k = 0; k < todo.length; k++) {
      try { var r = await makeQrFor(todo[k].file, todo[k].folder); out.push({ name: todo[k].file.name, r: r }); log && log('✔ ' + todo[k].file.name); }
      catch (e) { out.push({ name: todo[k].file.name, error: e.message }); log && log('✖ ' + todo[k].file.name + ' — ' + e.message); }
   }
   notify('✅ Quét xong: ' + out.filter(function (x) { return x.r && !x.r.skipped; }).length + '/' + todo.length + ' file đã tạo QR.', 'success');
   return out;
}

// Gọi từ trang ngay sau khi xuất Word: tạo QR + Excel rồi ghi lên Drive
function hook(examPackages) {
   var cfg0 = Object.assign({}, window.currentExportConfig || {});
   setTimeout(function () {
      var Q = window.TNMakerQR;
      if (!Q) { notify('⚠️ Chưa nạp được tnmaker_qr_export.js', 'warning'); return; }
      Q.run(examPackages, cfg0).then(function () { return afterExport(examPackages, cfg0); })
         .catch(function (e) { notify('⚠️ Không xuất được QR/Drive: ' + e.message, 'warning'); });
   }, 900);
}

// ===== Bảng điều khiển nhỏ =====
function buildPanel() {
   if (document.getElementById('tnmd-btn')) return;
   var b = document.createElement('button'); b.id = 'tnmd-btn'; b.type = 'button'; b.textContent = '☁️ TNMaker Drive';
   b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99990;background:#c62828;color:#fff;border:none;border-radius:20px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
   var p = document.createElement('div'); p.id = 'tnmd-panel';
   p.style.cssText = 'display:none;position:fixed;left:12px;bottom:56px;z-index:99991;width:min(360px,92vw);background:#fff;color:#222;border-radius:12px;padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:13px';
   p.innerHTML = '<button id="tnmd-x" type="button" title="Đóng" style="position:absolute!important;top:6px!important;right:8px!important;width:auto!important;background:transparent!important;border:none!important;box-shadow:none!important;color:#555!important;font-size:20px!important;line-height:1!important;padding:2px 8px!important;cursor:pointer">✕</button><b>☁️ TNMaker ↔ Google Drive</b>' +
      '<div style="margin:8px 0 4px">Địa chỉ Apps Script (/exec)</div><input id="tnmd-url" style="width:100%;box-sizing:border-box;padding:6px">' +
      '<div style="margin:6px 0 4px">Mã bảo vệ (token)</div><input id="tnmd-tok" type="password" style="width:100%;box-sizing:border-box;padding:6px">' +
      '<div style="display:flex;gap:6px;margin:8px 0"><button id="tnmd-save" type="button">Lưu</button><button id="tnmd-ping" type="button">Thử kết nối</button></div>' +
      '<hr><button id="tnmd-conv" type="button" style="width:100%;margin-bottom:6px">🔁 Chuyển đáp án (thư mục công cụ) → QR</button>' +
      '<button id="tnmd-scan" type="button" style="width:100%">🔎 Quét đề nhà trường chưa có QR (GK/CK)</button>' +
      '<pre id="tnmd-log" style="max-height:110px;overflow:auto;background:#f6f6f6;padding:6px;margin:8px 0 0;white-space:pre-wrap"></pre>';
   document.body.appendChild(b); document.body.appendChild(p);
   var log = function (m) { var l = document.getElementById('tnmd-log'); l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; };
   var c = cfg(); document.getElementById('tnmd-url').value = c.url; document.getElementById('tnmd-tok').value = c.token;
   b.onclick = function () { p.style.display = p.style.display === 'none' ? 'block' : 'none'; };
   function run(fn) { return function () { fn().catch(function (e) { log('✖ ' + e.message); notify('⚠️ ' + e.message, 'warning'); }); }; }
   document.getElementById('tnmd-save').onclick = function () { try { localStorage.setItem(LS_URL, document.getElementById('tnmd-url').value.trim()); localStorage.setItem(LS_TOK, document.getElementById('tnmd-tok').value.trim()); log('Đã lưu cấu hình.'); } catch (e) { log('Không lưu được: ' + e.message); } };
   document.getElementById('tnmd-ping').onclick = run(async function () { document.getElementById('tnmd-save').click(); await driveGet({ action: 'ping' }); log('✔ Kết nối Drive thành công'); });
   document.getElementById('tnmd-conv').onclick = run(async function () { log('Đang đọc thư mục công cụ…'); var r = await convertToolFolder(); log(r.skipped ? 'Đã bỏ qua.' : '✔ Xong: ' + r.codes + ' mã đề'); });
   document.getElementById('tnmd-scan').onclick = run(async function () { log('Đang quét…'); await scanSchool(log); log('Xong.'); });
}
if (typeof window.TNM_EXPORT_XLSX === 'undefined') window.TNM_EXPORT_XLSX = true;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel); else buildPanel();

window.TNMakerDrive = { hook: hook, afterExport: afterExport, convertToolFolder: convertToolFolder, scanSchool: scanSchool, detectType: detectType, yearTag: yearTag, classify: classify, baseName: baseName, isAnswerFile: isAnswerFile, FOLDERS: FOLDERS, version: '1.0' };
})();
