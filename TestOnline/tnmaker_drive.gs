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
function cfg() { try { return { url: localStorage.getItem(LS_URL) || '', token: localStorage.getItem(LS_TOK) || '' }; } catch (e) { return { url: '', token: '' }; } }
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

// ===== Bảng điều khiển nhỏ =====
function buildPanel() {
   if (document.getElementById('tnmd-btn')) return;
   var b = document.createElement('button'); b.id = 'tnmd-btn'; b.type = 'button'; b.textContent = '☁️ TNMaker Drive';
   b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99990;background:#c62828;color:#fff;border:none;border-radius:20px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
   var p = document.createElement('div'); p.id = 'tnmd-panel';
   p.style.cssText = 'display:none;position:fixed;left:12px;bottom:56px;z-index:99991;width:min(360px,92vw);background:#fff;color:#222;border-radius:12px;padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:13px';
   p.innerHTML = '<b>☁️ TNMaker ↔ Google Drive</b>' +
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

window.TNMakerDrive = { afterExport: afterExport, convertToolFolder: convertToolFolder, scanSchool: scanSchool, detectType: detectType, yearTag: yearTag, classify: classify, baseName: baseName, isAnswerFile: isAnswerFile, FOLDERS: FOLDERS, version: '1.0' };
})();