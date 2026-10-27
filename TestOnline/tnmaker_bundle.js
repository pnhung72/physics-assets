/* tnmaker_bundle9.js = tnmaker_qr_export (v1.3) + tnmaker_answer_parser (v1.2) + tnmaker_drive (v1.5) + tnmaker_form (v1.1)
   Chỉ tạo QR cho Phần I, II, III (TNMaker tự chấm). Phần IV tự luận chấm tay → không đưa vào QR. */
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
function tnmItemOf(code, r, opts) {
   var s = r.mc.join('') + '#' + r.tf.join('_') + '#' + r.sa.join('_');
   if (opts && opts.trimHash) s = s.replace(/#+$/, '');   // đề chỉ có Phần I/II: bỏ # thừa ở cuối
   return [String(code), s];
}
function tnmQrPayloads(examPackages) {
   return tnmGroupItems(examPackages.map(function (e) { return tnmItemOf(e.code, tnmCollectParts(e)); }));
}
// map = { "0201": { mc:['A',..], tf:['ĐSĐS',..], sa:['3.95',..] }, ... }  (đọc từ file đáp án trên Drive)
function tnmQrPayloadsFromMap(map, opts) {
   return tnmGroupItems(Object.keys(map).map(function (k) { var r = map[k]; return tnmItemOf(k, { mc: r.mc || [], tf: r.tf || [], sa: r.sa || [] }, opts); }));
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
window.TNMakerQR = { run: run, exportQR: exportTNMakerQR, exportExcel: exportTNMakerExcel, payloads: tnmQrPayloads, payloadsFromMap: tnmQrPayloadsFromMap, render: tnmRender, buildXlsxFromMap: tnmXlsxFromMap, version: '1.3' };
})();

;
/*!
 * tnmaker_answer_parser.js (v1.2)
 * v1.2: đọc được chữ D không dấu (=Đúng) trong ô "SDSD"; tiêu đề "đúng, sai"; hàng "Phần 1/2/3" nằm TRONG bảng;
 *       hàng mã đề nằm dưới ô "Mã đề" gộp; số câu không còn bị nhầm với đáp án số của cột bên cạnh.
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
   if (/đúng[\s,;:\/\-–&]*(?:hoặc\s*)?sai/.test(t)) return 'tf';
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
function isCodeOnly(t) {   // "0201" | "Mã đề 0201" | "0201-0203" | "101, 102"
   t = nfc(t).replace(/mã\s*đề/gi, ' ').trim();
   return !!t && /^\d{3,4}(?:\s*[-–+,&\/]\s*\d{3,4}|\s+\d{3,4})*$/.test(t);
}
function rowHasCodes(row) { for (var j = 0; j < row.length; j++) if (isCodeOnly(row[j].t)) return true; return false; }
function headerRow(grid) {
   for (var r = 0; r < Math.min(grid.length, 4); r++)
      for (var c = 0; c < grid[r].length; c++) if (/mã\s*đề/i.test(nfc(grid[r][c].t))) {
         // "Câu hỏi | Mã đề (gộp nhiều cột)" rồi HÀNG KẾ TIẾP mới là 0201 0202 …
         var nx = grid[r + 1];
         if (!rowHasCodes(grid[r]) && nx && nx.length > 1 && !isCodeOnly(nx[0].t)) {
            var k = 0, tot = 0;
            for (var j = 1; j < nx.length; j++) { var tj = nfc(nx[j].t); if (!tj) continue; tot++; if (isCodeOnly(tj)) k++; }
            if (tot && k === tot) return r + 1;
         }
         return r;
      }
   // bố cục không ghi chữ "Mã đề": hàng đầu chỉ có "Câu" + các số mã đề (0201, 0202…)
   for (var r2 = 0; r2 < Math.min(grid.length, 4); r2++) {
      var n = 0, bad = 0;
      for (var c2 = 0; c2 < grid[r2].length; c2++) {
         var t = nfc(grid[r2][c2].t); if (!t) continue;
         if (/^\d{3,4}$/.test(t)) n++; else if (!/^(câu|stt|số câu|lệnh hỏi|ý)$/i.test(t)) bad++;
      }
      if (n >= 1 && !bad) return r2;
   }
   return -1;
}
function hasMaDe(grid, h) { for (var c = 0; c < grid[h].length; c++) if (/mã\s*đề/i.test(nfc(grid[h][c].t))) return true; return false; }
function isCodeCell(t) { t = nfc(t); return /mã\s*đề/i.test(t) || isCodeOnly(t); }
function toDS4(v) {   // "ĐĐSS", "SDSD" (D không dấu = Đúng), "Đ S Đ S", "Đ-S-Đ-S", "Đúng Sai Đúng Sai", "TFTF" → "ĐSĐS" (hoặc null)
   var t = nfc(norm(v)).toLowerCase().replace(/đúng|dung|true/g, 'đ').replace(/sai|false/g, 's').replace(/[\s.,;\/\-–_|]/g, '');
   t = t.replace(/[dt]/g, 'đ').replace(/f/g, 's');
   if (!/^[đs]+$/.test(t)) return null;
   return t.toUpperCase();
}
function isHorizontal(grid, h) {   // Phần I kiểu TX: hàng đầu là số câu 1..N, cột đầu là mã đề
   if (!hasMaDe(grid, h)) return false;
   var nums = 0, tot = 0;
   for (var c = 1; c < grid[h].length; c++) { var t = grid[h][c].t; if (!t) continue; tot++; if (/^(?:câu\s*)?\d{1,2}$/i.test(nfc(t))) nums++; }
   return tot > 0 && nums === tot;
}
function labelNumber(grid, h, row, c) {   // số câu của hàng: cột nhãn gần nhất bên trái; BỎ QUA các cột đáp án của mã đề khác (đáp án số "4", "30" không phải số câu)
   for (var k = c - 1; k >= 0; k--) {
      if (grid[h][k] && isCodeOnly(grid[h][k].t)) continue;
      var m = /^(?:câu\s*)?(\d{1,3})\s*[:.)]?$/i.exec(nfc(row[k] ? row[k].t : '')); if (m) return parseInt(m[1], 10);
   }
   return null;
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
            var mm = /(\d{1,3})/.exec(grid[h][c].t), n = mm ? parseInt(mm[1], 10) : 0; if (!n) continue;
            var v = isMC ? nfc(norm(grid[r][c].t)).toUpperCase() : normSA(grid[r][c].t);
            if (isMC && !/^[A-D]$/.test(v)) v = '';
            codes.forEach(function (cd) { ensure(map, cd)[kind][n - 1] = v; });
         }
      }
      return;
   }
   for (var c2 = 0; c2 < grid[h].length; c2++) {
      var cell = grid[h][c2]; if (cell.dup) continue;
      var cds = isCodeCell(cell.t) ? codesIn(cell.t) : [];
      if (!cds.length) continue;
      for (var r2 = h + 1; r2 < grid.length; r2++) {
         if (!grid[r2][c2]) continue;
         var n2 = labelNumber(grid, h, grid[r2], c2); if (!n2) continue;
         var val = isMC ? nfc(norm(grid[r2][c2].t)).toUpperCase() : normSA(grid[r2][c2].t);
         if (isMC && !/^[A-D]$/.test(val)) val = '';
         cds.forEach(function (cd) { ensure(map, cd)[kind][n2 - 1] = val; });
      }
   }
}
function splitBySections(grid, carry) {   // tờ đáp án 1 bảng duy nhất: các hàng gộp "Phần 1: …", "Phần 2: …" chia bảng thành từng phần
   var marks = [];
   for (var r = 0; r < grid.length; r++) {
      var seen = {}, cnt = 0, only = '';
      for (var c = 0; c < grid[r].length; c++) { var t = norm(grid[r][c].t); if (t && !seen[t]) { seen[t] = 1; cnt++; only = t; } }
      if (cnt === 1) { var k = partKind(only); if (k) marks.push({ r: r, kind: k }); }
   }
   if (!marks.length) return null;
   var head = grid.slice(0, marks[0].r); if (!head.length) head = carry || [];
   return marks.map(function (m, i) {
      var end = i + 1 < marks.length ? marks[i + 1].r : grid.length;
      return { kind: m.kind, head: head, grid: head.concat(grid.slice(m.r + 1, end)) };
   });
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
         if (yi < 0) {   // cả 4 ý nằm trong 1 ô: "ĐĐSS"
            var q4 = labelNumber(grid, h, row, col.c); if (!q4) return;
            var s4 = toDS4(row[col.c].t); if (!s4) return;
            col.codes.forEach(function (cd) {
               data[cd] = data[cd] || {}; data[cd][q4] = data[cd][q4] || [];
               for (var z = 0; z < s4.length && z < 4; z++) data[cd][q4][z] = s4.charAt(z);
               if (s4.length !== 4) warn.push('Mã ' + cd + ' câu Đ/S ' + q4 + ': "' + row[col.c].t + '" không đủ 4 ý');
            });
            return;
         }
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
   var map = {}, warn = [], barem = [], cur = null, order = [], carryHead = [];
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
            var g = tableToGrid(n); if (!g.length) continue;
            var segs = splitBySections(g, carryHead);
            if (segs) {
               if (segs[0].head.length) carryHead = segs[0].head;
               segs.forEach(function (sg) {
                  cur = sg.kind; if (cur === 'essay') return;
                  if (cur === 'tf') parseTf(sg.grid, map, warn); else parseMcSa(sg.grid, cur, map, warn);
               });
               continue;
            }
            if (!cur || cur === 'essay') continue;
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

var api = { parse: parse, _codesIn: codesIn, _normSA: normSA, _toDS4: toDS4, version: '1.2' };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.TNMAnswerParser = api;
})(typeof window !== 'undefined' ? window : globalThis);

;
/*!
 * tnmaker_drive.js (v1.5)
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
   ['10', '11', '12'].forEach(function (g) { ['TX1', 'TX2', 'TX4', 'TX5', 'GK1', 'CK1', 'GK2', 'CK2'].forEach(function (t) { if (FOLDERS[g][t]) r.push({ id: FOLDERS[g][t], label: 'Lớp ' + g + '/' + t }); }); });
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
   if (!configured()) { if (isAdmin()) notify('ℹ️ Chưa cấu hình Drive nên chưa ghi lên Drive (bấm ☁️ TNMaker Drive để cài).', 'info'); return; }
   var c = config || {};
   var grade = String(c.grade || (examPackages[0] && examPackages[0].grade) || ''), type = detectType(c);
   var folder = FOLDERS[grade] && type && FOLDERS[grade][type];
   if (!folder) { if (isAdmin()) notify('ℹ️ Chưa có thư mục Drive cho lớp ' + (grade || '?') + ' / ' + (type || 'loại bài chưa nhận ra') + ' — chỉ lưu trên máy.', 'warning'); return; }
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
      for (var j = 0; j < cs.length; j++) { var v = cs[j].getElementsByTagName('v')[0], t = cs[j].getAttribute('t'); var x = v ? v.textContent : ''; row[col(cs[j].getAttribute('r'))] = t === 's' ? sst[+x] : t === 'inlineStr' ? cs[j].textContent : x; }   // inlineStr: file Excel do thư viện khác (openpyxl…) tạo
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
         else if (/^[ĐđDdSs]{4}$/.test(val.replace(/[\s\-_,;|]/g, ''))) o.tf.push(val.replace(/[\s\-_,;|]/g, '').toUpperCase().replace(/D/g, 'Đ'));   // "SDSD", "Đ S Đ S" → ĐSĐS
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
// 1) thư mục công cụ: tìm MỌI file đáp án chưa có QR_<tên> → tạo QR cùng thư mục
async function convertToolFolder(log) {
   var files = (await driveGet({ action: 'list', folderId: TOOL_FOLDER })).files;
   var have = {}; files.forEach(function (f) { have[f.name] = 1; });
   var todo = files.filter(function (f) {
      if (/^(QR_|TNM_)/i.test(f.name)) return false;
      if (!(/\.(docx|xlsx)$/i.test(f.name) || f.mime === MIME_GDOC)) return false;
      var base = f.name.replace(/\.[^.]+$/, '');
      return !have['QR_' + base + '.docx'] && !have['QR_' + base + '_1.png'];
   }).sort(function (a, b) { return b.updated - a.updated; });
   if (!todo.length) { notify('✅ Thư mục công cụ: mọi file đáp án đã có QR.', 'success'); return { files: 0, codes: 0 }; }
   if (!window.confirm('Thư mục công cụ có ' + todo.length + ' file đáp án chưa có QR:\n\n' + todo.slice(0, 12).map(function (f) { return '• ' + f.name; }).join('\n') + '\n\nTạo QR cho tất cả? (mỗi file sẽ hỏi xác nhận kết quả đọc)')) return { skipped: true };
   var nFiles = 0, nCodes = 0;
   for (var k = 0; k < todo.length; k++) {
      try {
         var r = await makeQrFor(todo[k], TOOL_FOLDER);
         if (r.skipped) { log && log('⏭ Bỏ qua: ' + todo[k].name); continue; }
         nFiles++; nCodes += r.codes; log && log('✔ ' + todo[k].name + ' (' + r.codes + ' mã đề)');
      } catch (e) { log && log('✖ ' + todo[k].name + ' — ' + e.message); }
   }
   notify('✅ Đã tạo QR cho ' + nFiles + '/' + todo.length + ' file trong thư mục công cụ.', 'success');
   return { files: nFiles, codes: nCodes };
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
// Chỉ admin mới thấy bảng ☁️ TNMaker Drive: máy đã bật cờ tnm_admin (bật 1 lần bằng lệnh trong Console)
function isAdmin() { try { return localStorage.getItem('tnm_admin') === '1'; } catch (e) { return false; } }
function buildPanel() {
   if (!isAdmin()) return;
   if (document.getElementById('tnmd-btn')) return;
   var b = document.createElement('button'); b.id = 'tnmd-btn'; b.type = 'button'; b.textContent = '☁️ TNMaker Drive';
   b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99990;background:#c62828;color:#fff;border:none;border-radius:20px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
   var p = document.createElement('div'); p.id = 'tnmd-panel';
   p.style.cssText = 'display:none;position:fixed;left:12px;bottom:56px;z-index:99991;width:min(360px,92vw);background:#fff;color:#222;border-radius:12px;padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:13px';
   p.innerHTML = '<button id="tnmd-x" type="button" title="Đóng" onclick="this.parentNode.style.display=\'none\'" style="position:absolute!important;top:6px!important;right:8px!important;width:auto!important;background:transparent!important;border:none!important;box-shadow:none!important;color:#555!important;font-size:20px!important;line-height:1!important;padding:2px 8px!important;cursor:pointer">✕</button><b>☁️ TNMaker ↔ Google Drive</b>' +
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
   document.getElementById('tnmd-conv').onclick = run(async function () { log('Đang đọc thư mục công cụ…'); var r = await convertToolFolder(log); log(r.skipped ? 'Đã bỏ qua.' : '✔ Xong: ' + r.files + ' file, ' + r.codes + ' mã đề'); });
   document.getElementById('tnmd-scan').onclick = run(async function () { log('Đang quét…'); await scanSchool(log); log('Xong.'); });
}
if (typeof window.TNM_EXPORT_XLSX === 'undefined') window.TNM_EXPORT_XLSX = true;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel); else buildPanel();

window.TNMakerDrive = { hook: hook, afterExport: afterExport, convertToolFolder: convertToolFolder, scanSchool: scanSchool, detectType: detectType, yearTag: yearTag, classify: classify, baseName: baseName, isAnswerFile: isAnswerFile, FOLDERS: FOLDERS, parseXlsxSmart: parseXlsxSmart, ensureDocx: ensureDocx, version: '1.5' };
})();

;
/*!
 * tnmaker_form.js (v1.2)
 * Form nhập đáp án → QR TNMaker (Smart Test, type 5) + Excel + file Word QR, lưu thẳng vào thư mục đề.
 * Chỉ Phần I (TN nhiều lựa chọn), Phần II (Đúng/Sai), Phần III (trả lời ngắn). Phần IV tự luận chấm tay: không có trong form/QR.
 *  - Chọn thư mục: tự tìm form đã lưu (dap_an_form_tnmaker.json) hoặc file Word/Excel đáp án rồi nạp vào form.
 *  - Nhập nhanh: gõ A-D tự nhảy ô; Phần II gõ d/s (hoặc Đ/S) 4 ký tự; dán cả cột; Ctrl+V dán bảng từ Word/Excel.
 *  - Ảnh đáp án (Da.jpg trong thư mục, dán Ctrl+V hoặc Thêm ảnh): xem bên cạnh, hoặc bấm 🤖 để Gemini đọc và điền bảng (v1.2) — luôn đối chiếu bằng mắt.
 */
(function () {
'use strict';
if (window.TNMForm) return;

var LS_DRAFT = 'tnmf_draft';
var JSON_NAME = 'dap_an_form_tnmaker.json';
var PARTS = [
   { k: 'mc', t: 'Phần I — Trắc nghiệm nhiều lựa chọn', hint: 'gõ A/B/C/D' },
   { k: 'tf', t: 'Phần II — Đúng/Sai (4 ý a,b,c,d)', hint: 'gõ d/s ×4 (VD dsds → ĐSĐS)' },
   { k: 'sa', t: 'Phần III — Trả lời ngắn', hint: 'số, dấu phẩy hoặc chấm đều được' }
];
var S = { cols: [], n: { mc: 18, tf: 4, sa: 6 }, title: '', base: '', barem: [], dir: null, saveDir: null, dirName: '', cands: [], trimHash: false, imgs: [], imgFiles: [], imgSel: -1, rot: 0, zoom: 100, loaded: '' };
var root = null, saveTimer = null;

function nfc(s) { s = String(s == null ? '' : s); try { return s.normalize('NFC'); } catch (e) { return s; } }
function notify(m, t) { if (typeof window.showNotification === 'function') window.showNotification(m, t || 'info'); else console.log('[TNMForm]', m); }
function $(sel, ctx) { return (ctx || root).querySelector(sel); }
function $$(sel, ctx) { return Array.prototype.slice.call((ctx || root).querySelectorAll(sel)); }
function el(tag, attrs, kids) {
   var e = document.createElement(tag);
   Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e[k] = attrs[k]; else e.setAttribute(k, attrs[k]);
   });
   (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
   return e;
}

// ===================== chuẩn hoá giá trị =====================
function normMC(v) {
   v = nfc(v).trim().toUpperCase();
   if (/^[1-4]$/.test(v)) return 'ABCD'.charAt(+v - 1);
   return v.slice(-1);
}
function normTF(v) {     // d / đ / Đ / "đúng" → Đ ; s / "sai" → S ; ký tự lạ → ?
   var t = nfc(v).toLowerCase().replace(/đúng/g, 'đ').replace(/sai/g, 's').replace(/[\s_\-–.,;|\/]/g, '');
   var o = '';
   for (var i = 0; i < t.length; i++) { var c = t.charAt(i); o += (c === 'đ' || c === 'd') ? 'Đ' : (c === 's') ? 'S' : '?'; }
   return o;
}
function normSA(v) {
   var P = window.TNMAnswerParser;
   if (P && P._normSA) return P._normSA(v);
   return String(v || '').trim().replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/,/g, '.');
}
function shownSA(v) { return String(v || '').replace(/\./g, ','); }
function okCell(k, v) {
   if (k === 'mc') return /^[A-D]$/.test(v);
   if (k === 'tf') return /^[ĐS]{4}$/.test(v);
   return /^-?\d+(\.\d+)?$/.test(v);
}
function newCol(code) { return { code: code || '', mc: [], tf: [], sa: [] }; }

// ===================== dữ liệu ↔ map =====================
function toMap() {
   var map = {};
   S.cols.forEach(function (c) {
      if (!c.code) return;
      var r = { mc: [], tf: [], sa: [] };
      PARTS.forEach(function (p) { for (var i = 0; i < S.n[p.k]; i++) r[p.k].push(c[p.k][i] || ''); });
      map[c.code] = r;
   });
   return map;
}
function fromMap(codes) {
   var ks = Object.keys(codes).sort();
   S.cols = ks.map(function (k) {
      var c = newCol(k), r = codes[k];
      PARTS.forEach(function (p) { c[p.k] = (r[p.k] || []).slice(); });
      return c;
   });
   PARTS.forEach(function (p) {
      var m = 0; S.cols.forEach(function (c) { m = Math.max(m, c[p.k].length); });
      S.n[p.k] = m;
   });
}
function fromJson(o) {
   if (o && o.columns && Array.isArray(o.columns)) {
      S.cols = o.columns.map(function (c) { var x = newCol(String(c.code)); PARTS.forEach(function (p) { x[p.k] = (c[p.k] || []).slice(); }); return x; });
      if (o.n) { S.n = { mc: o.n.mc || 0, tf: o.n.tf || 0, sa: o.n.sa || 0 }; }
      else { PARTS.forEach(function (p) { var m = 0; S.cols.forEach(function (c) { m = Math.max(m, c[p.k].length); }); S.n[p.k] = m; }); }
      S.title = o.title || S.title; S.barem = o.barem || [];
      return;
   }
   var m = (o && (o.codes || o.data || o.answers)) || o;      // chấp nhận { codes: {mã:{mc,tf,sa}} } hoặc map trực tiếp
   var codes = {};
   Object.keys(m || {}).forEach(function (k) { var r = m[k]; if (r && (r.mc || r.tf || r.sa)) codes[k] = r; });
   if (!Object.keys(codes).length) throw new Error('File JSON không đúng định dạng form');
   fromMap(codes); S.title = (o && o.title) || S.title;
}
function toJson() {
   return { app: 'TNMaker-form', version: 1, title: S.title, base: S.base, n: S.n, barem: S.barem, savedAt: new Date().toISOString(),
      columns: S.cols.filter(function (c) { return c.code; }).map(function (c) {
         var o = { code: c.code }; PARTS.forEach(function (p) { o[p.k] = []; for (var i = 0; i < S.n[p.k]; i++) o[p.k].push(c[p.k][i] || ''); }); return o;
      }) };
}
function saveDraft() {
   clearTimeout(saveTimer);
   saveTimer = setTimeout(function () { try { localStorage.setItem(LS_DRAFT, JSON.stringify(toJson())); } catch (e) {} }, 600);
}

// ===================== giao diện =====================
var CSS = '#tnmf{position:fixed;inset:0;z-index:99995;background:#f3f4f6;color:#1f2937;font:14px/1.4 system-ui,"Segoe UI",Arial,sans-serif;display:none;flex-direction:column}' +
'#tnmf.on{display:flex}#tnmf *{box-sizing:border-box}' +
'#tnmf .hd{background:#e65100;color:#fff;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
'#tnmf .hd b{font-size:15px}#tnmf .hd .sp{flex:1}' +
'#tnmf button{cursor:pointer;border:1px solid #bbb;background:#fff;color:#222;border-radius:6px;padding:5px 10px;font-size:13px}' +
'#tnmf button:hover{background:#fff3e0}#tnmf button.pri{background:#e65100;color:#fff;border-color:#bf360c;font-weight:600}' +
'#tnmf button.pri:hover{background:#bf360c}#tnmf .hd button{border-color:#fff8}' +
'#tnmf .tb{padding:8px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#fff;border-bottom:1px solid #ddd}' +
'#tnmf .tb label{display:inline-flex;gap:4px;align-items:center}#tnmf .tb input[type=number]{width:54px;padding:3px}' +
'#tnmf .tb input[type=text]{padding:4px 6px;min-width:160px}' +
'#tnmf .st{padding:5px 12px;background:#fffde7;border-bottom:1px solid #eee;font-size:12.5px;min-height:26px}' +
'#tnmf table.g th{color:#263238!important;font-size:13px!important;text-shadow:none!important}#tnmf table.g th.sec{color:#4e342e!important}#tnmf table.g input{color:#111!important;font-family:inherit!important}#tnmf table.g input.x{color:#b71c1c!important}#tnmf .st,#tnmf .tb,#tnmf .ft,#tnmf .rb{color:#1f2937!important}' +
'#tnmf .hp{display:none;position:absolute;top:44px;left:0;right:0;bottom:0;z-index:20;background:#fff;overflow:auto;padding:14px 18px 30px}#tnmf .hp.on{display:block}' +
'#tnmf .hp,#tnmf .hp *{color:#1f2937!important}#tnmf .hp h3{margin:14px 0 6px!important;font-size:16px!important;color:#bf360c!important}#tnmf .hp h2{margin:0 0 8px!important;font-size:19px!important}' +
'#tnmf .hp ol,#tnmf .hp ul{margin:4px 0 4px 22px!important;padding:0!important}#tnmf .hp li{margin:3px 0!important}#tnmf .hp kbd{background:#eee;border:1px solid #bbb;border-radius:4px;padding:0 5px;font-size:12px}' +
'#tnmf .hp .bx{background:#fff8e1;border:1px solid #ffcc80;border-radius:8px;padding:8px 12px;margin:8px 0}#tnmf .hp button{color:#fff!important}' +
'#tnmf .mn{flex:1;display:flex;min-height:0}#tnmf .gw{flex:1;overflow:auto;padding:8px}' +
'#tnmf table.g{border-collapse:collapse;background:#fff}' +
'#tnmf table.g th,#tnmf table.g td{border:1px solid #cfd4da;padding:0;text-align:center}' +
'#tnmf table.g th{background:#eceff1;font-weight:600;padding:3px 8px;white-space:nowrap;position:sticky;left:0;z-index:1}' +
'#tnmf table.g thead th{position:sticky;top:0;z-index:2}#tnmf table.g th.sec{background:#ffe0b2;text-align:left;left:0;font-size:13px}' +
'#tnmf table.g input{width:100%;min-width:86px;border:0;padding:5px 4px;text-align:center;font-size:14px;background:transparent;outline:none}' +
'#tnmf table.g input:focus{background:#e3f2fd;box-shadow:inset 0 0 0 2px #1976d2}' +
'#tnmf table.g input.mc{min-width:56px;font-weight:700;font-size:15px}#tnmf table.g input.tf{letter-spacing:3px;font-weight:700}' +
'#tnmf table.g input.e{background:#fff59d}#tnmf table.g input.x{background:#ffcdd2;color:#b71c1c}' +
'#tnmf table.g input.pc{border-bottom:2px dashed #e65100;background:#fff8e1;font-size:12px;font-weight:400;letter-spacing:0}' +
'#tnmf table.g input.code{font-weight:700;background:#e8eaf6;min-width:90px}#tnmf table.g input.code.x{background:#ffcdd2}' +
'#tnmf .rm{font-size:11px;padding:0 5px!important;margin-left:2px;border-color:transparent!important;background:transparent!important}' +
'#tnmf .ip{width:300px;max-width:42vw;border-left:1px solid #ccc;background:#fafafa;display:flex;flex-direction:column}' +
'#tnmf .gw.ai table.g input:not(.e):not(.x){background:#e3f2fd}' +
'#tnmf .ip .bar{padding:6px;display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid #ddd;background:#fff}' +
'#tnmf .ip .th{display:flex;gap:4px;overflow-x:auto;padding:4px;border-bottom:1px solid #ddd}' +
'#tnmf .ip .th img{height:44px;border:2px solid transparent;cursor:pointer}#tnmf .ip .th img.sel{border-color:#e65100}' +
'#tnmf .ip .vw{flex:1;overflow:auto;padding:6px;text-align:center}#tnmf .ip .vw img{transition:transform .15s;max-width:none}' +
'#tnmf .ip .em{color:#777;padding:14px;font-size:12.5px;text-align:left}' +
'#tnmf .ft{background:#fff;border-top:1px solid #ccc;padding:8px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
'#tnmf .rb{max-height:34vh;overflow:auto;background:#fff;border-top:1px solid #ccc;padding:8px 12px;display:none;font-size:12.5px}' +
'#tnmf .rb.on{display:block}#tnmf .rb table{border-collapse:collapse;width:100%}#tnmf .rb td,#tnmf .rb th{border:1px solid #ddd;padding:3px 6px;text-align:left;font-family:Consolas,monospace;vertical-align:top;word-break:break-all}' +
'#tnmf .rb td.bad{background:#ffcdd2}#tnmf .rb td.emp{background:#fff59d}' +
'#tnmf .qr{display:flex;gap:10px;flex-wrap:wrap;padding:6px 12px;background:#e8f5e9;border-top:1px solid #a5d6a7}#tnmf .qr:empty{display:none}' +
'#tnmf .qr img{width:150px;height:150px;image-rendering:pixelated;border:1px solid #888;background:#fff}' +
'#tnmf .qr .fl{font-size:12.5px;align-self:center}' +
'@media(max-width:700px){#tnmf .mn{flex-direction:column}#tnmf .ip{width:auto;max-width:none;max-height:36vh;border-left:0;border-top:1px solid #ccc}}';


var HELP_HTML = '<h2>📖 Hướng dẫn nhanh — tạo QR đáp án cho TNMaker</h2>' +
'<div class="bx"><b>Mục đích:</b> đưa đáp án của đề (Phần I, II, III) vào form, kiểm tra, rồi tạo <b>một mã QR chứa tất cả mã đề</b> để quét vào app TNMaker. Phần IV (tự luận) chấm tay nên không có trong QR.</div>' +
'<h3>Bước 1 — Đưa đáp án vào form (chọn 1 trong 3 cách)</h3>' +
'<b>Cách A. Từ file của giáo viên (nhanh nhất)</b><ol>' +
'<li>Bấm <b>📁 Chọn thư mục chứa đề</b> → chọn thư mục có file đáp án (dùng Chrome hoặc Edge; bấm "Cho phép" khi trình duyệt hỏi).</li>' +
'<li>Form tự tìm file đáp án (tên bắt đầu <i>Da…</i> hoặc có chữ <i>đáp án</i>, định dạng Word hoặc Excel) và điền vào bảng. Nếu đã từng lưu form ở thư mục này, form tự nạp lại bản đã lưu.</li>' +
'<li>Thư mục có nhiều file → chọn file khác ở danh sách thả xuống cạnh nút. Muốn chọn thẳng một file → bấm <b>📄 Đọc file Word/Excel đáp án…</b></li></ol>' +
'<b>Cách B. Dán từ Word / Excel</b><ol>' +
'<li>Mở file đáp án, bôi đen bảng đáp án của <u>một phần</u> rồi <kbd>Ctrl</kbd>+<kbd>C</kbd>.</li>' +
'<li>Bấm vào ô <b>Câu 1</b> của phần đó trong form rồi <kbd>Ctrl</kbd>+<kbd>V</kbd>. Form tự bỏ cột "Câu", nhận mã đề ở hàng tiêu đề, đổi dấu phẩy thập phân. Làm lần lượt Phần I → II → III.</li>' +
'<li>Dán nguyên một cột: bấm vào ô <b>gạch đứt màu cam</b> (dòng "dán cột") rồi dán chuỗi, VD <code>CACDACCADCBD</code> (Phần I) hoặc <code>ĐSĐS SSĐĐ</code> (Phần II).</li></ol>' +
'<b>Cách C. Gõ tay</b><ol>' +
'<li>Gõ mã đề vào ô trên cùng của mỗi cột (VD 0201). Cần thêm cột → <b>➕ Thêm mã đề</b>; xoá cột → dấu ✕ cạnh mã đề.</li>' +
'<li><b>Phần I:</b> gõ A, B, C hoặc D (hoặc phím 1–4) → tự nhảy xuống ô dưới.</li>' +
'<li><b>Phần II:</b> gõ 4 chữ <b>d</b>/<b>s</b>, VD <code>dsds</code> → ĐSĐS, đủ 4 ký tự tự nhảy ô.</li>' +
'<li><b>Phần III:</b> gõ số (dấu phẩy hay dấu chấm đều được, số âm dùng dấu −), nhấn <kbd>Enter</kbd> để xuống ô dưới.</li>' +
'<li>Số câu mỗi phần chỉnh ở 3 ô <b>Phần I / II / III</b> trên thanh công cụ (mặc định 18 – 4 – 6). Dán dài hơn thì bảng tự mở rộng.</li></ol>' +
'<b>Có ảnh đáp án?</b> Bấm <b>Thêm ảnh</b> hoặc <kbd>Ctrl</kbd>+<kbd>V</kbd> để dán ảnh vào khung bên phải; dùng − ＋ ⟳ để phóng to, xoay. Bấm <b>🤖 Đọc ảnh đáp án</b> để Gemini đọc ảnh đang xem và điền vào bảng (lần đầu dán khóa Gemini API, lưu trên trình duyệt này). Ô nền xanh là do AI điền — <u>luôn đối chiếu bằng mắt</u> với ảnh (dễ nhầm Đ/S, B/D, 0,25) trước khi tạo QR. Thư mục có ảnh <code>Da.jpg</code> thì ảnh tự hiện ở khung này.' +
'<h3>Bước 2 — Kiểm tra</h3><ul>' +
'<li>Ô <b style="background:#fff59d">vàng</b> = còn trống · ô <b style="background:#ffcdd2">đỏ</b> = sai định dạng (Phần I phải là A–D, Phần II đủ 4 ký tự Đ/S, Phần III phải là số).</li>' +
'<li>Dòng trạng thái phía trên bảng cho biết số mã đề và số ô trống.</li>' +
'<li>Bấm <b>🔍 Đọc lại để đối chiếu</b>: mỗi mã đề hiện thành một dòng, đối chiếu với bản gốc của giáo viên. Đáp án nhập sai thì QR cũng sai theo, bước này rất đáng làm.</li></ul>' +
'<h3>Bước 3 — Tạo QR và lưu</h3><ul>' +
'<li>Bấm <b>✅ Tạo QR &amp; lưu vào thư mục</b>. Công cụ ghi vào thư mục đã chọn 4 file: <code>dap_an_form_tnmaker.json</code> (lần sau tự nạp lại), <code>QR_….docx</code> (Word chứa QR), <code>QR_….png</code> (ảnh QR), <code>TNM_….xlsx</code> (Excel Smart Test).</li>' +
'<li>Chưa chọn thư mục hoặc trình duyệt không cho ghi (Firefox/Safari) → các file được tải về máy.</li>' +
'<li>Ít mã đề thì chỉ 1 QR; nhiều mã đề thì tự tách thành vài QR (ghi rõ "QR 1/2…" và các mã đề trong đó).</li>' +
'<li>Chọn <b>📤 Xuất Excel + mở qr-code.tnmaker.net</b> nếu muốn dùng trang web của TNMaker: chọn định dạng <i>Smart Test</i> rồi kéo file Excel vào.</li>' +
'<li>Đề chỉ có Phần I và II mà app TNMaker báo lỗi → tích ô <b>bỏ # thừa</b> rồi tạo lại.</li></ul>' +
'<h3>Bước 4 — Dùng trong app TNMaker</h3><ul><li>Trong app chọn nhập đáp án bằng QR rồi quét mã (in từ file Word hoặc mở ảnh PNG trên màn hình). QR là của giáo viên, không phát cho học sinh.</li></ul>' +
'<h3>Phím tắt &amp; lưu ý</h3><ul>' +
'<li><kbd>Enter</kbd> / <kbd>↓</kbd> xuống ô dưới · <kbd>↑</kbd> lên · <kbd>←</kbd> <kbd>→</kbd> sang mã đề bên cạnh · <kbd>Esc</kbd> đóng form.</li>' +
'<li>Dữ liệu đang nhập tự lưu nháp trên máy này, đóng form mở lại vẫn còn. Muốn làm đề khác → <b>🗑 Xoá hết</b>.</li>' +
'<li>Công cụ không có phần gõ công thức vì QR chỉ chứa chữ cái, Đ/S và số.</li></ul>' +
'<p><button type="button" id="f-hok" class="pri" style="padding:8px 18px;background:#e65100!important">Đã hiểu, bắt đầu nhập</button></p>';
function helpSeen() { try { return localStorage.getItem('tnmf_help_seen') === '1'; } catch (e) { return false; } }
function showHelp(on) {
   var hp = $('#f-hp'); if (!hp) return;
   hp.classList.toggle('on', on !== undefined ? on : !hp.classList.contains('on'));
   if (!hp.classList.contains('on')) { try { localStorage.setItem('tnmf_help_seen', '1'); } catch (e) {} }
}

function build() {
   if (root) return;
   var st = el('style'); st.textContent = CSS; document.head.appendChild(st);
   root = el('div', { id: 'tnmf' });
   root.innerHTML =
   '<div class="hd"><b>📷 QR đáp án TNMaker</b><span id="f-ld"></span><span class="sp"></span>' +
   '<button type="button" id="f-help">❓ Hướng dẫn</button><button type="button" id="f-x">✕ Đóng</button></div>' +
   '<div class="hp" id="f-hp">' + HELP_HTML + '</div>' +
   '<div class="tb">' +
   '<button type="button" id="f-dir" class="pri">📁 Chọn thư mục chứa đề</button>' +
   '<select id="f-cand" style="max-width:260px;display:none"></select>' +
   '<button type="button" id="f-file">📄 Đọc file Word/Excel đáp án…</button>' +
   '<button type="button" id="f-ai" title="Gemini đọc đáp án trong ảnh đang xem (khung bên phải) rồi điền vào bảng">🤖 Đọc ảnh đáp án</button>' +
   '<button type="button" id="f-key" title="Nhập / đổi khóa Gemini API">🔑</button>' +
   '<button type="button" id="f-add">➕ Thêm mã đề</button>' +
   '<label>Phần I <input type="number" id="n-mc" min="0" max="60"></label>' +
   '<label>Phần II <input type="number" id="n-tf" min="0" max="20"></label>' +
   '<label>Phần III <input type="number" id="n-sa" min="0" max="30"></label>' +
   '<label>Tên bài <input type="text" id="f-title" placeholder="VD: GK1 Vật lí 11"></label>' +
   '<label title="Đề không có Phần III thì bỏ dấu # thừa ở cuối chuỗi QR"><input type="checkbox" id="f-trim"> bỏ # thừa</label>' +
   '<button type="button" id="f-clr">🗑 Xoá hết</button>' +
   '</div>' +
   '<div class="st" id="f-st"></div>' +
   '<div class="mn"><div class="gw" id="f-gw"></div>' +
   '<div class="ip"><div class="bar"><button type="button" id="i-add" title="Chọn ảnh đáp án (hoặc Ctrl+V để dán ảnh)">🖼 Thêm ảnh</button>' +
   '<button type="button" id="i-m">−</button><button type="button" id="i-p">＋</button><button type="button" id="i-r">⟳</button><button type="button" id="i-d">✕</button></div>' +
   '<div class="th" id="i-th"></div><div class="vw" id="i-vw"><div class="em">Ctrl+V để dán ảnh đáp án vào đây (hoặc kéo thả). Bấm 🤖 Đọc ảnh đáp án để Gemini điền vào bảng, rồi đối chiếu bằng mắt trước khi tạo QR.</div></div></div></div>' +
   '<div class="qr" id="f-qr"></div>' +
   '<div class="rb" id="f-rb"></div>' +
   '<div class="ft"><button type="button" id="f-go" class="pri">✅ Tạo QR &amp; lưu vào thư mục</button>' +
   '<button type="button" id="f-x2">📤 Xuất Excel + mở qr-code.tnmaker.net</button>' +
   '<button type="button" id="f-rd">🔍 Đọc lại để đối chiếu</button>' +
   '<span style="color:#666;font-size:12px">Phím: Enter/↓ xuống ô dưới · dán cột ở ô gạch đứt · Ctrl+V dán bảng</span></div>';
   document.body.appendChild(root);
   var fi = el('input', { type: 'file', id: 'f-fi', accept: '.docx,.xlsx,.json', style: 'display:none' });
   var ii = el('input', { type: 'file', id: 'f-ii', accept: 'image/*', multiple: 'multiple', style: 'display:none' });
   var di = el('input', { type: 'file', id: 'f-di', style: 'display:none' }); di.setAttribute('webkitdirectory', ''); di.setAttribute('multiple', '');
   root.appendChild(fi); root.appendChild(ii); root.appendChild(di);
   wire(); render(); refreshToolbar();
}
function open() { build(); root.classList.add('on'); if (!S.cols.length) { restoreDraft(); } status(); if (!helpSeen()) showHelp(true); }
function close() { if (root) root.classList.remove('on'); }

function restoreDraft() {
   try { var d = localStorage.getItem(LS_DRAFT); if (d) { var o = JSON.parse(d); if (o.columns && o.columns.length) { fromJson(o); render(); refreshToolbar(); setLoaded('bản nháp trước trên máy này'); return; } } } catch (e) {}
   if (!S.cols.length) { S.cols = [newCol('')]; render(); }
}
function setLoaded(t) { S.loaded = t; $('#f-ld').textContent = t ? '· đã nạp: ' + t : ''; }
function refreshToolbar() {
   $('#n-mc').value = S.n.mc; $('#n-tf').value = S.n.tf; $('#n-sa').value = S.n.sa;
   $('#f-title').value = S.title; $('#f-trim').checked = S.trimHash;
}

// ---- bảng nhập ----
function render() {
   var gw = $('#f-gw'), keep = document.activeElement && document.activeElement.dataset ? { p: document.activeElement.dataset.p, i: document.activeElement.dataset.i, c: document.activeElement.dataset.c } : null;
   var t = el('table', { class: 'g' }), thead = el('thead'), hr = el('tr', {}, [el('th', { text: 'Mã đề →' })]);
   S.cols.forEach(function (c, ci) {
      var inp = el('input', { class: 'code', 'data-p': 'code', 'data-c': ci, placeholder: 'mã đề', value: c.code });
      var rm = el('button', { type: 'button', class: 'rm', title: 'Xoá mã đề này', text: '✕' });
      rm.onclick = function () { if (window.confirm('Xoá mã đề ' + (c.code || '(trống)') + '?')) { S.cols.splice(ci, 1); if (!S.cols.length) S.cols.push(newCol('')); render(); status(); saveDraft(); } };
      hr.appendChild(el('th', {}, [inp, rm]));
   });
   thead.appendChild(hr); t.appendChild(thead);
   var tb = el('tbody');
   PARTS.forEach(function (p) {
      if (!S.n[p.k]) return;
      var sec = el('tr', {}, [el('th', { class: 'sec', colspan: S.cols.length + 1, text: p.t + '  (' + S.n[p.k] + ' câu)' })]);
      tb.appendChild(sec);
      var pr = el('tr', {}, [el('th', { text: 'dán cột' })]);
      S.cols.forEach(function (c, ci) { pr.appendChild(el('td', {}, [el('input', { class: 'pc', 'data-p': p.k, 'data-pc': '1', 'data-c': ci, placeholder: p.k === 'mc' ? 'CACDAC…' : p.k === 'tf' ? 'ĐSĐS ĐĐSS…' : '3,95 12 …', title: 'Dán cả cột một lần (' + p.hint + ')' })])); });
      tb.appendChild(pr);
      for (var i = 0; i < S.n[p.k]; i++) {
         var tr = el('tr', {}, [el('th', { text: 'Câu ' + (i + 1) })]);
         S.cols.forEach(function (c, ci) {
            tr.appendChild(el('td', {}, [el('input', { class: p.k, 'data-p': p.k, 'data-i': i, 'data-c': ci, autocomplete: 'off', spellcheck: 'false', inputmode: p.k === 'sa' ? 'decimal' : 'text' })]));
         });
         tb.appendChild(tr);
      }
   });
   t.appendChild(tb); gw.innerHTML = ''; gw.appendChild(t);
   syncDom();
   if (keep && keep.p) focusCell(keep.p, +keep.i, +keep.c);
}
function cellInput(p, i, c) { return root.querySelector('input[data-p="' + p + '"][data-i="' + i + '"][data-c="' + c + '"]'); }
function focusCell(p, i, c) { var e = cellInput(p, i, c); if (e) { e.focus(); e.select && e.select(); } return !!e; }
function syncDom() {
   $$('#f-gw input[data-i]').forEach(function (e) {
      var p = e.dataset.p, c = S.cols[+e.dataset.c]; if (!c) return;
      var v = c[p][+e.dataset.i] || ''; var show = p === 'sa' ? shownSA(v) : v;
      if (document.activeElement !== e) e.value = show;
      mark(e, p, v);
   });
   $$('#f-gw input.code').forEach(function (e) { e.classList.toggle('x', !e.value.trim()); });
}
function mark(e, p, v) { e.classList.toggle('e', v === ''); e.classList.toggle('x', v !== '' && !okCell(p, v)); }
function setVal(p, c, i, v) {
   var col = S.cols[c]; if (!col) return;
   while (col[p].length < i) col[p].push('');
   col[p][i] = v;
}
function advance(p, i, c) {
   if (focusCell(p, i + 1, c)) return;
   var idx = PARTS.map(function (x) { return x.k; }).indexOf(p);
   for (var k = idx + 1; k < PARTS.length; k++) if (S.n[PARTS[k].k] && focusCell(PARTS[k].k, 0, c)) return;
}
function ensureSize(p, len) { if (len > S.n[p]) { S.n[p] = len; return true; } return false; }

function onInput(e) {
   var t = e.target, p = t.dataset.p; if (!p) return;
   var c = +t.dataset.c;
   if (p === 'code') { S.cols[c].code = t.value.trim(); t.classList.toggle('x', !t.value.trim()); status(); saveDraft(); return; }
   if (t.dataset.pc) return;
   var i = +t.dataset.i, v;
   if (p === 'mc') {
      if (!t.value) { setVal(p, c, i, ''); mark(t, p, ''); status(); saveDraft(); return; }
      v = normMC(t.value);
      if (!/^[A-D]$/.test(v)) { t.value = S.cols[c].mc[i] || ''; return; }    // bỏ ký tự không hợp lệ
      t.value = v; setVal(p, c, i, v); mark(t, p, v); status(); saveDraft(); advance(p, i, c); return;
   }
   if (p === 'tf') {
      v = normTF(t.value).slice(0, 4); t.value = v; setVal(p, c, i, v); mark(t, p, v); status(); saveDraft();
      if (v.length >= 4) advance(p, i, c); return;
   }
   v = normSA(t.value); setVal(p, c, i, v); mark(t, p, v); status(); saveDraft();
}
function onKey(e) {
   var t = e.target, p = t.dataset && t.dataset.p; if (!p || p === 'code') return;
   var i = +t.dataset.i, c = +t.dataset.c, pc = t.dataset.pc;
   if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (pc) { focusCell(p, 0, c); return; }
      advance(p, i, c);
   } else if (e.key === 'ArrowUp' && !pc) { e.preventDefault(); if (i > 0) focusCell(p, i - 1, c); }
   else if (e.key === 'ArrowRight' && (t.selectionStart === t.value.length)) { e.preventDefault(); if (pc) { var n = root.querySelector('input[data-p="' + p + '"][data-pc="1"][data-c="' + (c + 1) + '"]'); n && n.focus(); } else focusCell(p, i, c + 1); }
   else if (e.key === 'ArrowLeft' && t.selectionStart === 0) { e.preventDefault(); if (pc) { var m = root.querySelector('input[data-p="' + p + '"][data-pc="1"][data-c="' + (c - 1) + '"]'); m && m.focus(); } else focusCell(p, i, c - 1); }
   else if (e.key === 'Backspace' && !t.value && !pc && i > 0 && p !== 'sa') { e.preventDefault(); focusCell(p, i - 1, c); }
}

// ---- dán cột / dán bảng ----
function splitItems(p, text) {
   text = nfc(text).trim();
   if (p === 'mc') return text.replace(/[^A-Za-z1-4]/g, '').split('').map(normMC);
   if (p === 'tf') {
      var parts = text.split(/[\s;|\t\n\r]+/).filter(Boolean);
      if (parts.every(function (x) { return normTF(x).length === 4; })) return parts.map(normTF);
      var all = normTF(text), o = []; for (var k = 0; k < all.length; k += 4) o.push(all.slice(k, k + 4)); return o;
   }
   return text.split(/[\t\n\r;|_]+|\s+/).filter(Boolean).map(normSA);
}
function pasteColumn(p, c, i0, items) {
   if (!S.cols[c]) return;
   var grew = ensureSize(p, i0 + items.length);
   items.forEach(function (v, k) { setVal(p, c, i0 + k, v); });
   if (grew) render(); else syncDom();
   status(); saveDraft();
}
function parseTsv(text) {
   return text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(function (r) { return r.split('\t').map(function (x) { return nfc(x).trim(); }); });
}
function pasteTable(p, c0, i0, text) {
   var rows = parseTsv(text), codes = null;
   if (rows.length >= 2 && /mã\s*đề/i.test(rows[0][0] || '') && rows[0].slice(1).every(function (x) { return /^(câu\s*)?\d{1,3}$/i.test(x); }) &&
       rows.slice(1).every(function (r) { return /^(mã\s*đề\s*)?\d{3,4}$/i.test(r[0] || ''); })) {      // bảng TX: mã đề theo hàng → xoay lại
      var tr = [['Mã đề'].concat(rows.slice(1).map(function (r) { return r[0]; }))];
      for (var q = 1; q < rows[0].length; q++) tr.push([rows[0][q]].concat(rows.slice(1).map(function (r) { return r[q] === undefined ? '' : r[q]; })));
      rows = tr;
   }
   if (rows.length && rows[0].some(function (x) { return /mã\s*đề|^câu$|^stt$/i.test(x); })) {      // hàng tiêu đề
      codes = rows[0].map(function (x) { var m = /(\d{3,4})/.exec(x); return m ? m[1] : null; });
      rows = rows.slice(1);
   }
   var ncol = Math.max.apply(null, rows.map(function (r) { return r.length; }).concat([0]));
   var colVals = [];
   for (var j = 0; j < ncol; j++) colVals.push(rows.map(function (r) { return r[j] === undefined ? '' : r[j]; }));
   // bỏ cột nhãn (Câu n / 1,2,3… liên tiếp / a,b,c,d)
   function isLabel(vals, idx) {
      var ne = vals.filter(Boolean); if (!ne.length) return false;
      if (ne.every(function (x) { return /^câu\s*\d+[a-d]?$/i.test(x) || /^(câu|ý|lệnh hỏi)$/i.test(x); })) return true;
      if (p === 'tf' && ne.length >= 4 && ne.slice(0, 4).map(function (x) { return x.replace(/[\).]/g, '').toLowerCase(); }).join('') === 'abcd') return true;
      if (ncol >= 2 && idx === 0 && ne.length >= 2 && ne.every(function (x, k) { return /^\d+$/.test(x) && +x === +ne[0] + k; })) return true;
      return false;
   }
   var data = [], dcodes = [];
   colVals.forEach(function (vals, idx) { if (!isLabel(vals, idx)) { data.push(vals); dcodes.push(codes ? codes[idx] : null); } });
   if (!data.length) { notify('Không nhận ra dữ liệu trong bảng đã dán', 'warning'); return; }
   var grew = false;
   if (codes) {      // bảng có tiêu đề mã đề: bỏ các cột trống chưa có mã để khỏi thừa cột
      var before = S.cols.length;
      S.cols = S.cols.filter(function (cc) { return cc.code || PARTS.some(function (pp) { return cc[pp.k].some(Boolean); }); });
      if (S.cols.length !== before) grew = true;
   }
   data.forEach(function (vals, j) {
      var ci;
      if (dcodes[j]) { ci = -1; S.cols.forEach(function (cc, k) { if (cc.code === dcodes[j]) ci = k; }); if (ci < 0) { S.cols.push(newCol(dcodes[j])); ci = S.cols.length - 1; grew = true; } }
      else { ci = c0 + j; while (ci >= S.cols.length) { S.cols.push(newCol('')); grew = true; } }
      var items;
      if (p === 'tf') {
         var single = vals.filter(Boolean);
         items = (single.length && single.every(function (x) { return normTF(x).length === 1; })) ? chunk4(single.map(normTF)) : vals.map(normTF);
      } else if (p === 'mc') items = vals.map(function (x) { return x ? normMC(x) : ''; });
      else items = vals.map(function (x) { return normSA(x); });
      var start = dcodes[j] ? 0 : i0;
      if (ensureSize(p, start + items.length)) grew = true;
      items.forEach(function (v, k) { setVal(p, ci, start + k, v); });
   });
   if (grew) render(); else syncDom();
   status(); saveDraft();
   notify('📋 Đã dán bảng: ' + data.length + ' cột × ' + (data[0] || []).length + ' hàng.', 'success');
}
function chunk4(a) { var o = []; for (var k = 0; k < a.length; k += 4) o.push(a.slice(k, k + 4).join('')); return o; }
function onPaste(e) {
   var cd = e.clipboardData; if (!cd) return;
   var files = Array.prototype.slice.call(cd.files || []).filter(function (f) { return /^image\//.test(f.type); });
   if (!files.length && cd.items) Array.prototype.forEach.call(cd.items, function (it) { if (it.kind === 'file' && /^image\//.test(it.type)) { var f = it.getAsFile(); if (f) files.push(f); } });
   if (files.length) { e.preventDefault(); addImages(files); return; }
   var t = e.target, p = t.dataset && t.dataset.p; if (!p) return;
   var text = cd.getData('text/plain'); if (!text) return;
   var c = +t.dataset.c, i = +t.dataset.i || 0;
   if (p === 'code') {
      var toks = text.split(/[\s,;\t]+/).filter(Boolean);
      if (toks.length > 1) { e.preventDefault(); toks.forEach(function (x, k) { var m = /(\d{3,4})/.exec(x); while (c + k >= S.cols.length) S.cols.push(newCol('')); S.cols[c + k].code = m ? m[1] : x; }); render(); status(); saveDraft(); }
      return;
   }
   var multi = /[\t\n]/.test(text.replace(/\s+$/, ''));
   if (t.dataset.pc) { e.preventDefault(); if (multi) pasteTable(p, c, 0, text); else pasteColumn(p, c, 0, splitItems(p, text)); return; }
   if (multi) { e.preventDefault(); pasteTable(p, c, i, text); return; }
   var items = splitItems(p, text);
   if (items.length > 1 && !(p === 'tf' && items.length === 1)) { e.preventDefault(); pasteColumn(p, c, i, items); }
}

// ---- ảnh tham chiếu ----
function addImages(files) {
   files.forEach(function (f) { var u = URL.createObjectURL(f); S.imgs.push(u); S.imgFiles.push(f); S.imgSel = S.imgs.length - 1; });
   S.rot = 0; S.zoom = 100; drawImgs();
}
function drawImgs() {
   var th = $('#i-th'), vw = $('#i-vw'); th.innerHTML = '';
   S.imgs.forEach(function (u, k) { var im = el('img', { src: u, class: k === S.imgSel ? 'sel' : '' }); im.onclick = function () { S.imgSel = k; S.rot = 0; S.zoom = 100; drawImgs(); }; th.appendChild(im); });
   if (S.imgSel < 0 || !S.imgs[S.imgSel]) { vw.innerHTML = '<div class="em">Ctrl+V để dán ảnh đáp án vào đây (hoặc kéo thả). Bấm 🤖 Đọc ảnh đáp án để Gemini điền vào bảng, rồi đối chiếu bằng mắt trước khi tạo QR.</div>'; return; }
   vw.innerHTML = ''; var im2 = el('img', { src: S.imgs[S.imgSel] });
   im2.style.width = S.zoom + '%'; im2.style.transform = 'rotate(' + S.rot + 'deg)'; if (S.rot % 180) im2.style.margin = '20% 0';
   vw.appendChild(im2);
}

// ---- tình trạng / đọc lại ----
function stats() {
   var empty = 0, bad = 0, total = 0, noCode = 0, dup = {}, dups = [];
   S.cols.forEach(function (c) {
      if (!c.code) noCode++; else { if (dup[c.code]) dups.push(c.code); dup[c.code] = 1; }
      PARTS.forEach(function (p) { for (var i = 0; i < S.n[p.k]; i++) { total++; var v = c[p.k][i] || ''; if (!v) empty++; else if (!okCell(p.k, v)) bad++; } });
   });
   return { empty: empty, bad: bad, total: total, noCode: noCode, dups: dups };
}
function status() {
   if (!root) return; var s = stats(), m = [];
   m.push(S.cols.filter(function (c) { return c.code; }).length + ' mã đề · ' + S.n.mc + ' TN + ' + S.n.tf + ' Đ/S + ' + S.n.sa + ' trả lời ngắn');
   m.push(s.empty ? '🟨 ' + s.empty + ' ô trống' : '✅ đủ ô');
   if (s.bad) m.push('🟥 ' + s.bad + ' ô sai định dạng');
   if (s.noCode) m.push('🟥 ' + s.noCode + ' cột chưa có mã đề');
   if (s.dups.length) m.push('🟥 trùng mã: ' + s.dups.join(', '));
   $('#f-st').textContent = m.join('   |   ');
   if ($('#f-rb').classList.contains('on')) readback();
}
function readback() {
   var rb = $('#f-rb'), h = '<b>Đọc lại để đối chiếu với bản gốc</b> (ô vàng = trống, ô đỏ = sai định dạng)<table><tr><th>Mã đề</th><th>Phần I</th><th>Phần II</th><th>Phần III</th></tr>';
   S.cols.forEach(function (c) {
      var a = [], b = [], d = [], ba = false, bb = false, bd = false;
      for (var i = 0; i < S.n.mc; i++) { var v = c.mc[i] || ''; if (!v) ba = true; else if (!okCell('mc', v)) ba = true; a.push(v || '·'); if ((i + 1) % 5 === 0 && i + 1 < S.n.mc) a.push(' '); }
      for (var j = 0; j < S.n.tf; j++) { var w = c.tf[j] || ''; if (!okCell('tf', w)) bb = true; b.push((j + 1) + ':' + (w || '····')); }
      for (var k = 0; k < S.n.sa; k++) { var z = c.sa[k] || ''; if (!okCell('sa', z)) bd = true; d.push((k + 1) + ':' + (z ? shownSA(z) : '—')); }
      h += '<tr><td>' + esc(c.code || '?') + '</td><td class="' + (ba ? 'bad' : '') + '">' + esc(a.join('')) + '</td><td class="' + (bb ? 'bad' : '') + '">' + esc(b.join('  ')) + '</td><td class="' + (bd ? 'bad' : '') + '">' + esc(d.join('  ')) + '</td></tr>';
   });
   rb.innerHTML = h + '</table>';
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ===================== thư mục / file =====================
function answerNameOk(n) {
   return /(^|[^a-z])(da|dap[_\-\s]?an)|đáp\s*án|dap_an/i.test(n.replace(/^(De|Đề)/, '')) || /^Da/i.test(n);
}
function isAnswerName(n) {
   n = nfc(n);
   if (/^(QR_|TNM_|~\$)/i.test(n)) return false;
   if (!/\.(docx|xlsx)$/i.test(n)) return false;
   return answerNameOk(n);
}
function isAnswerImg(n) {      // Da.JPG, Da_1.jpg, dap_an.png … (ảnh chụp đáp án)
   n = nfc(n);
   if (/^(QR_|TNM_|~\$)/i.test(n)) return false;
   if (!/\.(jpe?g|png|webp)$/i.test(n)) return false;
   return answerNameOk(n);
}
async function readDir(h, rel, depth, out) {
   for await (var pair of h.entries()) {
      var name = pair[0], e = pair[1];
      if (e.kind === 'file') {
         var kind = /form.*\.json$/i.test(name) && /tnmaker|form|dap/i.test(name) ? 'json' : isAnswerName(name) ? 'doc' : isAnswerImg(name) ? 'img' : null;
         if (!kind) continue;
         var f = await e.getFile();
         out.push({ name: name, rel: rel + name, kind: kind, handle: e, dir: h, time: f.lastModified });
      } else if (e.kind === 'directory' && depth < 1 && !/^\./.test(name)) await readDir(e, rel + name + '/', depth + 1, out);
   }
}
async function pickDir() {
   if (window.showDirectoryPicker) {
      var h; try { h = await window.showDirectoryPicker({ id: 'tnmqr', mode: 'readwrite' }); } catch (e) { if (e && e.name === 'AbortError') return; throw e; }
      S.dir = h; S.saveDir = h; S.dirName = h.name; S.cands = [];
      await readDir(h, '', 0, S.cands);
      await afterScan();
   } else $('#f-di').click();
}
async function afterScan() {
   var sel = $('#f-cand'); sel.innerHTML = '';
   var rank = { json: 0, doc: 1, img: 2 };
   S.cands.sort(function (a, b) { return (rank[a.kind] - rank[b.kind]) || b.time - a.time; });
   S.cands.forEach(function (c, k) { var o = el('option', { value: k, text: (c.kind === 'json' ? '💾 ' : c.kind === 'img' ? '🖼 ' : '📄 ') + c.rel + '  (' + new Date(c.time).toLocaleDateString('vi-VN') + ')' }); sel.appendChild(o); });
   sel.style.display = S.cands.length ? '' : 'none';
   // ảnh đáp án trong thư mục → đưa vào khung xem ảnh bên phải
   S.imgs = []; S.imgFiles = []; S.imgSel = -1;
   var ims = S.cands.filter(function (c) { return c.kind === 'img'; });
   for (var q = 0; q < ims.length; q++) {
      try { var imf = await ims[q].handle.getFile(); addImages([imf]); ims[q].imgIdx = S.imgs.length - 1; } catch (e) { ims[q].imgIdx = -1; }
   }
   if (ims.length) { S.imgSel = Math.max(0, ims[0].imgIdx); S.rot = 0; S.zoom = 100; drawImgs(); }
   if (!S.cands.length) { setLoaded(''); drawImgs(); $('#f-st').textContent = '📁 \"' + S.dirName + '\": không thấy form đã lưu, file Word/Excel hay ảnh đáp án (tên bắt đầu Da…/đáp án…). Hãy nhập tay, dán bảng, thêm ảnh rồi bấm \"🤖 Đọc ảnh đáp án\", hoặc bấm \"Đọc file Word/Excel đáp án…\". Khi tạo QR, file sẽ được lưu vào thư mục này.'; return; }
   var first = S.cands[0];
   if (first.kind === 'img') { await readImageGemini({ auto: true, idx: first.imgIdx }); }
   else {
      await loadCand(0);
      if (ims.length) $('#f-st').textContent += '   |   🖼 thư mục có ' + ims.length + ' ảnh đáp án — bấm \"🤖 Đọc ảnh đáp án\" để đối chiếu';
   }
}
async function loadCand(k) {
   var c = S.cands[k]; if (!c) return;
   try {
      if (c.kind === 'img') {
         if (c.imgIdx >= 0) { S.imgSel = c.imgIdx; S.rot = 0; S.zoom = 100; drawImgs(); }
         $('#f-cand').value = k;
         await readImageGemini({ idx: c.imgIdx });
         return;
      }
      var f = await c.handle.getFile();
      await loadFile(f, c.rel); S.saveDir = c.dir || S.dir;
      $('#f-cand').value = k;
   } catch (e) { notify('⚠️ Không đọc được ' + c.name + ': ' + e.message, 'warning'); $('#f-st').textContent = '⚠️ ' + c.name + ': ' + e.message; }
}
async function loadFile(f, label) {
   var gwx = $('#f-gw'); if (gwx) gwx.classList.remove('ai');
   var name = f.name, buf = await f.arrayBuffer(), p;
   if (/\.json$/i.test(name)) { fromJson(JSON.parse(new TextDecoder('utf-8').decode(buf))); S.base = S.base || ''; }
   else {
      if (/\.xlsx$/i.test(name)) { var D = window.TNMakerDrive; if (!D || !D.parseXlsxSmart) throw new Error('Thiếu bộ đọc Excel'); p = await D.parseXlsxSmart(buf); }
      else p = await window.TNMAnswerParser.parse(buf, { JSZip: window.JSZip, DOMParser: window.DOMParser });
      if (!Object.keys(p.codes).length) throw new Error('Không đọc được mã đề nào trong "' + name + '" (bảng không đúng mẫu?) — bạn có thể dán bảng hoặc nhập tay');
      fromMap(p.codes); S.barem = p.barem || []; S.base = name.replace(/\.[^.]+$/, '');
      if (!S.title) S.title = S.base;
      if (p.warnings && p.warnings.length) setTimeout(function () { $('#f-st').textContent += '   ⚠️ ' + p.warnings.slice(0, 3).join(' · '); }, 0);
   }
   render(); refreshToolbar(); setLoaded(label || name); status(); saveDraft();
}
async function loadFromInputFolder(files) {
   var cands = [];
   files.forEach(function (f) {
      var rel = f.webkitRelativePath || f.name, nm = f.name;
      var kind = /form.*\.json$/i.test(nm) ? 'json' : isAnswerName(nm) ? 'doc' : isAnswerImg(nm) ? 'img' : null;
      if (kind && rel.split('/').length <= 3) cands.push({ name: nm, rel: rel, kind: kind, time: f.lastModified, file: f, handle: { getFile: function () { return Promise.resolve(f); } } });
   });
   S.dirName = files.length && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : ''; S.cands = cands; S.dir = null; S.saveDir = null;
   await afterScan();
}

// ===================== đọc ảnh đáp án bằng Gemini =====================
var LS_KEY = 'tnmf_gemini_key', LS_MODEL = 'tnmf_gemini_model';
var MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
var AI_PROMPT = 'Đây là ảnh chụp ĐÁP ÁN một đề kiểm tra Vật lí THPT Việt Nam. Ảnh gồm các bảng: ' +
   'Phần 1 trắc nghiệm nhiều lựa chọn (A/B/C/D), Phần 2 trắc nghiệm đúng/sai (mỗi câu có 4 ý a,b,c,d, viết dạng Đ/S, ví dụ ĐSSĐ hoặc DSSD), Phần 3 trả lời ngắn (số). ' +
   'BỎ QUA Phần 4 tự luận/biểu điểm, và mọi chữ mờ lộ xuyên từ mặt sau tờ giấy hoặc từ trang bên dưới. ' +
   'Bảng có thể bố trí hàng = mã đề, cột = câu hoặc ngược lại (hàng = câu, cột = mã đề): đọc đúng theo tiêu đề hàng và cột, không đoán theo vị trí. Mã đề thường gồm 4 chữ số (ví dụ 0201). ' +
   'Chỉ trả về MỘT đối tượng JSON, không thêm chữ nào khác, đúng cấu trúc: ' +
   '{"title":"...","codes":[{"code":"0201","mc":["C","B"],"tf":["SĐSĐ","ĐSSS"],"sa":["3","56,6"]}]}. ' +
   'Quy tắc: mc là mảng đáp án A/B/C/D theo thứ tự câu 1,2,3…; tf là mảng theo thứ tự câu 1,2…, mỗi phần tử đúng 4 kí tự chỉ gồm Đ hoặc S; ' +
   'sa là mảng theo thứ tự câu 1,2…, giữ nguyên số như in (dấu phẩy thập phân), không thêm đơn vị; ' +
   'title là tiêu đề in đầu tờ, dạng "Đáp án đề kiểm tra giữa kỳ HK1 2026-2027 – Vật lí 10" (đúng kì, năm học, môn, khối trong ảnh). ' +
   'Tuyệt đối không bịa: ô nào không đọc rõ thì để chuỗi rỗng "" (riêng tf dùng ? cho ý không rõ). Phải liệt kê đủ mọi mã đề có trong ảnh.';
var aiBusy = false;

function getKey(force) {
   var k = ''; try { k = localStorage.getItem(LS_KEY) || ''; } catch (e) {}
   if (!k || force) {
      var v = window.prompt('Dán khóa Gemini API (tạo miễn phí ở aistudio.google.com/apikey).\nKhóa chỉ được lưu trên trình duyệt của máy này, không gửi đi đâu ngoài Google.', k);
      if (v === null) return k;
      k = String(v).trim();
      try { if (k) localStorage.setItem(LS_KEY, k); else localStorage.removeItem(LS_KEY); } catch (e) {}
   }
   return k;
}
async function prepImage(file, rot) {
   try {
      var bmp = await createImageBitmap(file), w = bmp.width, h = bmp.height, sc = Math.min(1, 2400 / Math.max(w, h));
      var rw = Math.round(w * sc), rh = Math.round(h * sc), sw = (rot === 90 || rot === 270);
      var cv = document.createElement('canvas'); cv.width = sw ? rh : rw; cv.height = sw ? rw : rh;
      var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate((rot || 0) * Math.PI / 180); ctx.drawImage(bmp, -rw / 2, -rh / 2, rw, rh);
      return { mime: 'image/jpeg', b64: cv.toDataURL('image/jpeg', 0.92).split(',')[1] };
   } catch (e) {
      var b64 = await new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.onerror = function () { rej(new Error('Không đọc được file ảnh')); }; fr.readAsDataURL(file); });
      return { mime: file.type || 'image/jpeg', b64: b64 };
   }
}
async function callGemini(key, parts) {
   var models = [], lastErr = null;
   try { var m0 = localStorage.getItem(LS_MODEL); if (m0) models.push(m0); } catch (e) {}
   MODELS.forEach(function (m) { if (models.indexOf(m) < 0) models.push(m); });
   for (var i = 0; i < models.length; i++) {
      var m = models[i], r, j;
      try {
         r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } })
         });
      } catch (e) { throw new Error('Không kết nối được Gemini (' + e.message + ') — kiểm tra mạng'); }
      j = await r.json().catch(function () { return {}; });
      if (r.ok) {
         var cand = j.candidates && j.candidates[0], text = '';
         if (cand && cand.content && cand.content.parts) text = cand.content.parts.filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('');
         if (!text) { lastErr = new Error('Gemini không trả kết quả' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '')); continue; }
         try { localStorage.setItem(LS_MODEL, m); } catch (e) {}
         return text;
      }
      var msg = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (r.status === 403 || (r.status === 400 && /api key/i.test(msg))) throw new Error('Khóa Gemini bị từ chối: ' + msg + ' — bấm 🔑 để nhập lại');
      lastErr = new Error(msg + ' [' + m + ']');
      if (r.status === 404 || r.status === 429 || r.status === 503 || (r.status === 400 && /model/i.test(msg))) continue;
      throw lastErr;
   }
   throw lastErr || new Error('Gemini không phản hồi');
}
function parseAi(text) {
   var t = String(text || '').replace(/```json|```/g, '').trim(), o;
   try { o = JSON.parse(t); } catch (e) {
      var a = t.indexOf('{'), z = t.lastIndexOf('}');
      if (a < 0 || z <= a) throw new Error('Gemini trả về dữ liệu không đúng định dạng');
      o = JSON.parse(t.slice(a, z + 1));
   }
   var list = Array.isArray(o) ? o : (o.codes || o.data || []), codes = {};
   function arr(x, f) { return (Array.isArray(x) ? x : []).map(function (v) { return f(v == null ? '' : String(v)); }); }
   list.forEach(function (c) {
      var k = String(c.code == null ? '' : c.code).replace(/\D/g, ''); if (!k) return;
      codes[k] = { mc: arr(c.mc, normMC), tf: arr(c.tf, normTF), sa: arr(c.sa, normSA) };
   });
   if (!Object.keys(codes).length) throw new Error('Gemini không đọc được mã đề nào — chụp rõ hơn hoặc nhập tay');
   return { title: String(o.title || '').trim(), codes: codes };
}
function applyAi(ai, name) {
   var had = S.cols.some(function (c) { return c.code && PARTS.some(function (p) { return c[p.k].some(function (v) { return v; }); }); });
   if (had) {
      var cur = toMap(), diff = 0, tot = 0;
      Object.keys(ai.codes).forEach(function (k) {
         var r = ai.codes[k], o = cur[k];
         PARTS.forEach(function (p) { r[p.k].forEach(function (v, i) { tot++; if (!o || (o[p.k][i] || '') !== v) diff++; }); });
      });
      Object.keys(cur).forEach(function (k) { if (!ai.codes[k]) diff++; });
      if (!diff) { $('#f-st').textContent = '✅ Ảnh \"' + name + '\" khớp hoàn toàn với dữ liệu đang có (' + tot + ' ô) — không cần thay.'; return; }
      if (!window.confirm('Ảnh khác dữ liệu đang có ở ' + diff + ' / ' + tot + ' ô (hoặc khác mã đề).\n\nNếu khác nhiều có thể bạn đang nạp nhầm file của khối khác.\n\nThay dữ liệu đang có bằng kết quả đọc từ ảnh?')) {
         $('#f-st').textContent = '↩ Giữ nguyên dữ liệu cũ (ảnh khác ở ' + diff + ' / ' + tot + ' ô).'; return;
      }
   }
   fromMap(ai.codes); S.barem = []; S.base = '';
   S.title = ai.title ? ai.title + ' (đọc từ ảnh ' + name + ')' : (S.title || '(đọc từ ảnh ' + name + ')');
   render(); refreshToolbar(); setLoaded('🤖 đọc từ ảnh ' + name); status(); saveDraft();
   $('#f-gw').classList.add('ai');
   var rb = $('#f-rb'); rb.classList.add('on'); readback();
   var lens = {}; PARTS.forEach(function (p) { S.cols.forEach(function (c) { lens[p.k + c.code] = c[p.k].length; }); });
   var warn = []; PARTS.forEach(function (p) { var s = {}; S.cols.forEach(function (c) { s[c[p.k].length] = 1; }); if (Object.keys(s).length > 1) warn.push('số câu ' + p.t.split(' — ')[0] + ' không đều giữa các mã đề'); });
   $('#f-st').textContent += '   |   🤖 Gemini đã đọc xong — ô nền xanh là do AI điền, hãy đối chiếu với ảnh bên phải trước khi tạo QR' + (warn.length ? '   ⚠️ ' + warn.join('; ') : '');
   notify('🤖 Đã đọc ' + Object.keys(ai.codes).length + ' mã đề từ ảnh — hãy đối chiếu bằng mắt rồi mới tạo QR.', 'success');
}
async function readImageGemini(opt) {
   opt = opt || {};
   if (aiBusy) return;
   var idx = (opt.idx != null && opt.idx >= 0) ? opt.idx : S.imgSel;
   if (idx < 0 || !S.imgFiles[idx]) throw new Error('Chưa có ảnh: bấm \"Thêm ảnh\", Ctrl+V dán ảnh, hoặc chọn thư mục có ảnh Da.jpg');
   var key = getKey(false);
   if (!key) { $('#f-st').textContent = '🔑 Cần khóa Gemini API để đọc ảnh — bấm nút 🔑 để nhập, rồi bấm \"🤖 Đọc ảnh đáp án\".'; if (!opt.auto) throw new Error('Chưa nhập khóa Gemini API'); return; }
   aiBusy = true; var btn = $('#f-ai'); btn.disabled = true; $('#f-st').textContent = '⏳ Gemini đang đọc ảnh đáp án… (khoảng 10–40 giây)';
   try {
      var file = S.imgFiles[idx], img = await prepImage(file, idx === S.imgSel ? S.rot : 0);
      var text = await callGemini(key, [{ text: AI_PROMPT }, { inline_data: { mime_type: img.mime, data: img.b64 } }]);
      applyAi(parseAi(text), file.name || 'ảnh dán');
   } catch (e) { $('#f-st').textContent = '⚠️ ' + e.message; throw e; }
   finally { aiBusy = false; btn.disabled = false; }
}
function jsonName() {      // mỗi khối một file: dap_an_form_tnmaker_K10.json (không ghi đè nhau)
   var m = nfc(S.title || '').match(/(?:v.t\s*l.|kh.i|l.p)\s*(1[0-2])/i);
   return m ? 'dap_an_form_tnmaker_K' + m[1] + '.json' : JSON_NAME;
}

// ===================== lưu & tạo QR =====================
async function writeTo(dir, name, blob) {
   var fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable();
   await w.write(blob); await w.close();
}
function download(blob, name) {
   var a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
   setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
}
function sanitize(n) { return nfc(n).replace(/[\\\/:*?"<>|]+/g, '_').trim(); }
function baseName() {
   var b = S.base || S.title || S.dirName || ('Dap_an_' + new Date().toISOString().slice(0, 10));
   b = sanitize(b).replace(/^(QR_|TNM_)/i, '').replace(/\s+/g, '_'); return b || 'Dap_an';
}
async function ensureReady() {
   if (!window.TNMakerQR) throw new Error('Chưa nạp được thư viện QR');
   if (typeof window.JSZip === 'undefined') throw new Error('Chưa nạp được JSZip (cần cho file Excel)');
   if (window.TNMakerDrive && window.TNMakerDrive.ensureDocx) await window.TNMakerDrive.ensureDocx();
}
function checkBeforeGo() {
   var s = stats(), valid = S.cols.filter(function (c) { return c.code; }).length;
   if (!valid) throw new Error('Chưa có mã đề nào (điền mã đề ở hàng trên cùng)');
   if (s.noCode) throw new Error('Có cột chưa điền mã đề');
   if (s.dups.length) throw new Error('Trùng mã đề: ' + s.dups.join(', '));
   if (s.bad) throw new Error('Còn ' + s.bad + ' ô sai định dạng (tô đỏ) — sửa rồi tạo lại');
   if (s.empty && !window.confirm('Còn ' + s.empty + ' ô trống (tô vàng). Ô trống sẽ làm lệch câu khi chấm.\n\nVẫn tạo QR?')) throw new Error('Đã huỷ — hãy điền các ô vàng');
}
async function go() {
   checkBeforeGo(); await ensureReady();
   var map = toMap(), base = baseName(), outDir = S.saveDir || S.dir, files = [];
   var groups = window.TNMakerQR.payloadsFromMap(map, { trimHash: S.trimHash });
   var r = await window.TNMakerQR.render(groups, { title: S.title || base, barem: S.barem });
   var xl = await window.TNMakerQR.buildXlsxFromMap(map);
   files.push({ name: jsonName(), blob: new Blob([JSON.stringify(toJson(), null, 1)], { type: 'application/json' }) });
   if (r.kind === 'docx') files.push({ name: 'QR_' + base + '.docx', blob: r.blob });
   r.pngs.forEach(function (b, i) { files.push({ name: 'QR_' + base + (r.pngs.length > 1 ? '_' + (i + 1) : '') + '.png', blob: new Blob([b], { type: 'image/png' }) }); });
   files.push({ name: 'TNM_' + base + '.xlsx', blob: xl });
   var saved = [], where;
   if (outDir) {
      try { for (var i = 0; i < files.length; i++) { await writeTo(outDir, files[i].name, files[i].blob); saved.push(files[i].name); } where = 'thư mục "' + (S.dirName || outDir.name) + '"'; }
      catch (e) { notify('⚠️ Không ghi được vào thư mục (' + e.message + ') — chuyển sang tải về.', 'warning'); outDir = null; saved = []; }
   }
   if (!outDir) { files.forEach(function (f, k) { setTimeout(function () { download(f.blob, f.name); }, k * 350); }); saved = files.map(function (f) { return f.name; }); where = 'thư mục Tải xuống (trình duyệt này không ghi thẳng vào thư mục được)'; }
   showQr(r, groups, saved, where);
   notify('✅ Đã tạo ' + groups.length + ' mã QR cho ' + Object.keys(map).length + ' mã đề.', 'success');
}
function showQr(r, groups, saved, where) {
   var box = $('#f-qr'); box.innerHTML = '';
   r.pngs.forEach(function (b, i) { var u = URL.createObjectURL(new Blob([b], { type: 'image/png' })); box.appendChild(el('div', {}, [el('img', { src: u }), el('div', { class: 'fl', text: 'QR ' + (i + 1) + '/' + groups.length + ' · mã ' + groups[i].codes.join(', ') })])); });
   box.appendChild(el('div', { class: 'fl' }, [document.createTextNode('💾 Đã lưu vào ' + where + ': ' + saved.join(' · '))]));
}
async function sendExcel() {
   checkBeforeGo(); await ensureReady();
   var map = toMap(), base = baseName(), blob = await window.TNMakerQR.buildXlsxFromMap(map), name = 'TNM_' + base + '.xlsx', outDir = S.saveDir || S.dir;
   if (outDir) { try { await writeTo(outDir, name, blob); } catch (e) { download(blob, name); } } else download(blob, name);
   window.open('https://qr-code.tnmaker.net', '_blank');
   notify('📤 Đã xuất ' + name + '. Ở trang qr-code.tnmaker.net: chọn "Smart Test" rồi kéo file Excel vào.', 'success');
}

// ===================== nối sự kiện =====================
function guard(fn) { return function () { var a = arguments; Promise.resolve().then(function () { return fn.apply(null, a); }).catch(function (e) { notify('⚠️ ' + e.message, 'warning'); var st = $('#f-st'); if (st) st.textContent = '⚠️ ' + e.message; }); }; }
function wire() {
   $('#f-x').onclick = close;
   $('#f-help').onclick = function () { showHelp(); };
   $('#f-hok').onclick = function () { showHelp(false); };
   $('#f-dir').onclick = guard(pickDir);
   $('#f-cand').onchange = guard(function () { return loadCand(+$('#f-cand').value); });
   $('#f-file').onclick = function () { $('#f-fi').click(); };
   $('#f-ai').onclick = guard(function () { return readImageGemini(); });
   $('#f-key').onclick = function () { var k = getKey(true); notify(k ? '🔑 Đã lưu khóa Gemini trên trình duyệt này.' : '🔑 Chưa có khóa Gemini.', k ? 'success' : 'warning'); };
   $('#f-fi').onchange = guard(async function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) { await loadFile(f, f.name); } });
   $('#f-di').onchange = guard(function (e) { var fs = Array.prototype.slice.call(e.target.files); e.target.value = ''; return loadFromInputFolder(fs); });
   $('#f-add').onclick = function () { S.cols.push(newCol('')); render(); status(); var inp = $$('#f-gw input.code'); inp[inp.length - 1].focus(); };
   $('#f-clr').onclick = function () { if (window.confirm('Xoá toàn bộ dữ liệu đang nhập?')) { $('#f-gw').classList.remove('ai'); S.cols = [newCol('')]; S.base = ''; S.barem = []; setLoaded(''); render(); status(); saveDraft(); } };
   ['mc', 'tf', 'sa'].forEach(function (k) {
      $('#n-' + k).onchange = function () { var v = Math.max(0, Math.min(60, parseInt(this.value, 10) || 0)); S.n[k] = v; render(); status(); saveDraft(); };
   });
   $('#f-title').oninput = function () { S.title = this.value; saveDraft(); };
   $('#f-trim').onchange = function () { S.trimHash = this.checked; };
   $('#f-go').onclick = guard(go);
   $('#f-x2').onclick = guard(sendExcel);
   $('#f-rd').onclick = function () { var rb = $('#f-rb'); rb.classList.toggle('on'); if (rb.classList.contains('on')) readback(); };
   var gw = $('#f-gw');
   gw.addEventListener('input', onInput); gw.addEventListener('keydown', onKey);
   gw.addEventListener('focusin', function (e) { if (e.target.select && e.target.dataset && e.target.dataset.i !== undefined) e.target.select(); });
   gw.addEventListener('focusout', function (e) { var t = e.target; if (t.dataset && t.dataset.p === 'sa' && t.dataset.i !== undefined) t.value = shownSA(S.cols[+t.dataset.c].sa[+t.dataset.i] || ''); });
   root.addEventListener('paste', onPaste);
   $('#i-add').onclick = function () { $('#f-ii').click(); };
   $('#f-ii').onchange = function (e) { addImages(Array.prototype.slice.call(e.target.files)); e.target.value = ''; };
   $('#i-p').onclick = function () { S.zoom = Math.min(400, S.zoom + 25); drawImgs(); };
   $('#i-m').onclick = function () { S.zoom = Math.max(25, S.zoom - 25); drawImgs(); };
   $('#i-r').onclick = function () { S.rot = (S.rot + 90) % 360; drawImgs(); };
   $('#i-d').onclick = function () { if (S.imgSel >= 0) { S.imgs.splice(S.imgSel, 1); S.imgFiles.splice(S.imgSel, 1); S.imgSel = S.imgs.length - 1; drawImgs(); } };
   root.addEventListener('dragover', function (e) { e.preventDefault(); });
   root.addEventListener('drop', function (e) { var fs = Array.prototype.slice.call(e.dataTransfer.files || []).filter(function (f) { return /^image\//.test(f.type); }); if (fs.length) { e.preventDefault(); addImages(fs); } });
   document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('on') && !/INPUT|SELECT/.test((e.target || {}).tagName || '')) close(); });
}

function buildButton() {
   if (document.getElementById('tnmf-btn')) return;
   var admin = false; try { admin = localStorage.getItem('tnm_admin') === '1'; } catch (e) {}
   var b = el('button', { id: 'tnmf-btn', type: 'button', text: '📷 QR đáp án TNMaker' });
   b.style.cssText = 'position:fixed;left:' + (admin ? '160px' : '12px') + ';bottom:12px;z-index:99989;background:#ef6c00;color:#fff;border:none;border-radius:20px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
   b.onclick = open; document.body.appendChild(b);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildButton); else buildButton();

window.TNMForm = { open: open, close: close, state: S, toMap: toMap, fromMap: fromMap, fromJson: fromJson, toJson: toJson, normTF: normTF, normSA: normSA, normMC: normMC, _pasteTable: pasteTable, _splitItems: splitItems, showHelp: showHelp, readImage: readImageGemini, version: '1.2' };
})();
