/*!
 * tnmaker_qr_export.js  (v1.0)
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
      a = String(a == null ? '' : a).replace(/<[^>]*>/g, '').replace(/\\[()]|\$/g, '')
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
   var cols = examPackages.map(function (e) { return { code: String(e.code), ans: tnmCollectAnswers(e) }; });
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
function tnmQrPayloads(examPackages) {
   var items = examPackages.map(function (e) {
      var r = tnmCollectParts(e);
      return [String(e.code), r.mc.join('') + '#' + r.tf.join('_') + '#' + r.sa.join('_')];
   });
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
      kids.push(new P({ alignment: AL.CENTER, spacing: { before: 160 }, children: [new T({ text: 'Dành cho giáo viên – KHÔNG phát cho học sinh. Trong app TNMaker chọn "Nhập đáp án bằng QR" rồi quét mã này.', italics: true, size: 22, font: 'Times New Roman' })] }));
   });
   return await D.Packer.toBlob(new D.Document({ sections: [{ children: kids }] }));
}
async function exportTNMakerQR(examPackages) {
   await tnmLoadQrLib();
   var groups = tnmQrPayloads(examPackages), pngs = [];
   for (var i = 0; i < groups.length; i++) pngs.push(await tnmQrPngBytes(tnmQrMatrix(groups[i].text)));
   var cfg = window.currentExportConfig || {}, stamp = new Date().toISOString().slice(0, 10);
   var D = window.docx || (window.ExamDocx && window.ExamDocx.docx);
   if (D && D.ImageRun && D.Packer) {
      var blob = await tnmBuildQrDocx(D, groups, pngs, { title: cfg.examName || '' });
      tnmSave(blob, 'QR_dap_an_TNMaker_' + stamp + '.docx');
   } else {
      pngs.forEach(function (b, i) { tnmSave(new Blob([b], { type: 'image/png' }), 'QR_dap_an_TNMaker_' + stamp + '_' + (i + 1) + '.png'); });
   }
   notify('✅ Đã xuất ' + groups.length + ' mã QR đáp án TNMaker (' + examPackages.length + ' mã đề).', 'success');
   return groups;
}


async function run(examPackages) {
   var out = {};
   out.qr = await exportTNMakerQR(examPackages);
   if (window.TNM_EXPORT_XLSX) { try { out.xlsx = await exportTNMakerExcel(examPackages); } catch (e) { console.error('TNMaker xlsx:', e); } }
   return out;
}
window.TNMakerQR = { run: run, exportQR: exportTNMakerQR, exportExcel: exportTNMakerExcel, payloads: tnmQrPayloads, version: '1.0' };
})();
