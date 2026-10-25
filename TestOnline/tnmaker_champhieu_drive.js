/*! tnmaker_champhieu_drive.js (v0.3) — nạp SAU tnmaker_bundle.js. v0.3: cơ cấu điểm chỉnh được trên giao diện (lưu theo lớp/loại bài). v0.2: dùng lõi Tnmaker_cham_core.js + khóa JSON (dapan_<loại>_vl<lớp>.json), bỏ Tnmaker_grade.js/Tnmaker_champhieu.js/dapan_TX1.js.
 * Thêm nút "📝 Chấm phiếu" vào bảng ☁️ TNMaker Drive: đọc phiếu M02 -> chấm TX1 -> vẽ mực đỏ -> lưu ảnh vào thư mục "Chấm bài" trên Drive.
 * Tự nạp thêm (cùng thư mục với file này): tnreader.js, Tnmaker_cham_core.js, layout_TLTN.js; khóa đáp án dapan_TX1_vl10.json tải theo lớp/loại bài. */
(function () {
'use strict';
var BASE = (document.currentScript && document.currentScript.src || '').replace(/[^\/]*$/, '');
var DEPS = ['tnreader.js', 'Tnmaker_cham_core.js', 'layout_TLTN.js'];
var keyCache = {}, curKey = null, LS_D = 'tnm_cham_diem_';
// ---- Cơ cấu điểm: mặc định lấy từ file khóa, thầy sửa trên giao diện, lưu theo lớp/loại bài ----
function num(v, d) { var x = parseFloat(String(v).replace(',', '.')); return isFinite(x) && x >= 0 ? x : d; }
function dKey() { return LS_D + $('cp-loai').value + '_' + $('cp-lop').value; }
function diemMacDinh() { return curKey && curKey.diem ? JSON.parse(JSON.stringify(curKey.diem)) : { p1: 0, p2: [0, 0, 0, 0, 0], p3: 0, tl: 0, truDonVi: 0 }; }
function diemDocUI() {
   var m = diemMacDinh(), D = { p1: num($('cp-d1').value, m.p1), p2: [], p3: num($('cp-d3').value, m.p3), tl: num($('cp-dtl').value, m.tl), truDonVi: num($('cp-dtru').value, m.truDonVi) };
   for (var i = 0; i < 5; i++) D.p2.push(num($('cp-d2-' + i).value, (m.p2 || [])[i] || 0));
   return D;
}
function diemGhiUI(D) {
   $('cp-d1').value = D.p1; $('cp-d3').value = D.p3; $('cp-dtl').value = D.tl; $('cp-dtru').value = D.truDonVi;
   for (var i = 0; i < 5; i++) $('cp-d2-' + i).value = (D.p2 || [])[i] != null ? D.p2[i] : 0;
}
function diemTongToiDa() {
   if (!curKey) return '';
   var ms = Object.keys(curKey.made || {}), M = ms.length && curKey.made[ms[0]], D = diemDocUI();
   if (!M) return '';
   var s = M.p1.length * D.p1 + Object.keys(M.p2).length * Math.max.apply(null, D.p2) + M.p3.length * D.p3 + D.tl;
   return 'Tổng tối đa: ' + Math.round(s * 100) / 100 + ' (' + M.p1.length + ' câu P1, ' + Object.keys(M.p2).length + ' câu P2, ' + M.p3.length + ' câu P3 + tự luận)';
}
function diemNap() {
   var D = diemMacDinh();
   try { var s = localStorage.getItem(dKey()); if (s) D = Object.assign(D, JSON.parse(s)); } catch (e) {}
   diemGhiUI(D); $('cp-dmax').textContent = diemTongToiDa();
}
function diemDoi() {
   try { localStorage.setItem(dKey(), JSON.stringify(diemDocUI())); } catch (e) {}
   $('cp-dmax').textContent = diemTongToiDa(); capNhat();
}
function diemKhoiPhuc() { try { localStorage.removeItem(dKey()); } catch (e) {} diemNap(); capNhat(); }
function capNhat() { rows.forEach(function (r, i) { tinh(r); var e = $('cp-r' + i); if (e) e.innerHTML = kqHtml(r); }); }
function normDS(v) { v = String(v == null ? '' : v).trim().toUpperCase(); return v === 'Đ' || v === 'D' ? 'Đ' : v === 'S' ? 'S' : ''; }
async function layKhoa(lop, loai) {
   var fn = 'dapan_' + loai + '_vl' + lop + '.json';
   if (keyCache[fn]) return keyCache[fn];
   var r = await fetch(BASE + fn + '?v=' + Date.now());
   if (!r.ok) throw new Error('Chưa có đáp án ' + fn + ' (đặt cùng thư mục với file này)');
   return keyCache[fn] = await r.json();
}
async function datKhoa() {
   try { await loadDeps(); curKey = await layKhoa($('cp-lop').value, $('cp-loai').value); $('cp-log').textContent = ''; diemNap(); }
   catch (e) { curKey = null; $('cp-log').textContent = e.message; }
   draw();
}
var LS_F = 'tnm_cham_folders', rows = [], depsOk = null;
function $(i) { return document.getElementById(i); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function note(m, t) { if (typeof window.showNotification === 'function') window.showNotification(m, t || 'info'); else console.log('[ChamPhieu]', m); }
function loadDeps() {
   if (depsOk) return depsOk;
   return depsOk = DEPS.reduce(function (p, f) { return p.then(function () { return new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = BASE + f; s.onload = ok; s.onerror = function () { depsOk = null; no(new Error('Không nạp được ' + f + ' (đã tải cùng thư mục chưa?)')); }; document.head.appendChild(s); }); }); }, Promise.resolve());
}
// ---- Drive (dùng chung url/token với bảng ☁️) ----
function conf() { var u = '', t = ''; try { u = localStorage.getItem('tnm_drive_url') || ''; t = localStorage.getItem('tnm_drive_token') || ''; } catch (e) {}
   if (!u && $('tnmd-url')) u = $('tnmd-url').value.trim(); if (!t && $('tnmd-tok')) t = $('tnmd-tok').value.trim();
   if (!u || !t) throw new Error('Chưa nhập địa chỉ /exec và token ở bảng ☁️ TNMaker Drive'); return { url: u, token: t }; }
async function dList(id) { var c = conf(), r = await fetch(c.url + '?action=list&folderId=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(c.token)), j = await r.json(); if (!j.success) throw new Error(j.error); return j.files; }
function b64(blob) { return new Promise(function (ok, no) { var f = new FileReader(); f.onload = function () { ok(String(f.result).split(',')[1]); }; f.onerror = no; f.readAsDataURL(blob); }); }
async function dUp(folderId, name, blob) { var c = conf(), r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
   body: JSON.stringify({ token: c.token, action: 'upload', folderId: folderId, name: name, mime: blob.type, b64: await b64(blob), overwrite: true }) }), j = await r.json(); if (!j.success) throw new Error(j.error); return j; }
// ---- Thư mục Chấm bài: dán nguyên danh sách link bạn đã soạn, mã tự tách theo Lớp / TX,GK,CK / số ----
function parseFolders(t) {
   var re = /(Lớp\s*1[0-2]|TX|GK|CK|\b\d\b)\s*:?\s*https?:\/\/drive\.google\.com\/drive\/folders\/([\w-]+)/g, m, g = null, grp = null, map = {};
   while ((m = re.exec(t))) { var lab = m[1], L = /Lớp\s*(1[0-2])/.exec(lab);
      if (L) { g = L[1]; grp = null; map[g] = {}; } else if (/^(TX|GK|CK)$/.test(lab)) grp = lab; else if (g && grp) map[g][grp + lab] = m[2]; }
   return map;
}
function folders() { try { return JSON.parse(localStorage.getItem(LS_F) || '{}'); } catch (e) { return {}; } }
// ---- đọc ảnh ----
async function docAnh(f) {
   var bm = await createImageBitmap(f), s = Math.min(1, 1800 / bm.width), w = Math.round(bm.width * s), h = Math.round(bm.height * s), c = document.createElement('canvas');
   c.width = w; c.height = h; var x = c.getContext('2d'); x.drawImage(bm, 0, 0, w, h);
   var d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h); for (var i = 0; i < g.length; i++) g[i] = (d[4 * i] * .299 + d[4 * i + 1] * .587 + d[4 * i + 2] * .114) | 0;
   return { cv: c, rd: TNReader.readSheet({ w: w, h: h, data: g }, TN_LAYOUT) };
}
function tinh(r) {
   if (!r.rd.ok) { r.kq = { loi: [r.rd.msg || 'Chưa đọc được phiếu'], canXem: [] }; return; }
   if (!curKey) { r.kq = { loi: ['Chưa có đáp án cho lớp/loại bài này'], canXem: [] }; return; }
   var tay = { saiDonVi: r.sai }; if (String(r.tay).trim() !== '') tay.tl = String(r.tay).replace(',', '.');
   r.kq = TNCham.cham(Object.assign({}, curKey, { diem: diemDocUI() }), r.rd, { made: r.made, tay: tay, loai: $('cp-loai').value, mau: 'M02', anh: r.f.name });
}
function kqHtml(r) { var k = r.kq; if (k.loi && k.loi.length) return '<span style="color:#b00020">' + esc(k.loi.join('; ')) + '</span>';
   return '<b style="font-size:18px">' + k.tong + ' điểm</b> <small>P1 ' + k.p1 + ' + P2 ' + k.p2 + ' + câu 10 ' + k.tl + (k.tru ? ' − ' + k.tru : '') + '</small>' +
      (k.canXem || []).map(function (c) { return '<div style="color:#a15c00;font-size:12px">⚠ ' + esc(c) + '</div>'; }).join(''); }
// ---- vẽ bút tích đỏ ----
function ve(r) {
   var c = r.cv, x = c.getContext('2d'), L = TN_LAYOUT, rd = r.rd, k = r.kq, M = curKey && curKey.made[k.made];
   var H = TNReader.solveH(L.anchors, rd.corners), A = function (p) { return TNReader.applyH(H, p[0], p[1]); };
   var o = A(L.anchors[0]), u = A([L.anchors[0][0] + 100, L.anchors[0][1]]), sc = Math.hypot(u[0] - o[0], u[1] - o[1]) / 100;
   x.strokeStyle = x.fillStyle = '#d00000'; x.lineWidth = Math.max(2, sc * 5);
   function cross(p) { var q = A(p), d = sc * 16; x.beginPath(); x.moveTo(q[0] - d, q[1] - d); x.lineTo(q[0] + d, q[1] + d); x.moveTo(q[0] + d, q[1] - d); x.lineTo(q[0] - d, q[1] + d); x.stroke(); }
   (k.cauSai || []).forEach(function (q) { var ch = rd.p1[q] && rd.p1[q].v; if (ch) cross(L.p1[q]['ABCD'.indexOf(ch)]);
      if (M && M.p1[q - 1]) { var t = A(L.p1[q][3]); x.font = 'bold ' + sc * 34 + 'px sans-serif'; x.fillText(M.p1[q - 1], t[0] + sc * 45, t[1] + sc * 12); } });
   ((k.p2Sai || {})['1'] || []).forEach(function (y) { var v = normDS(rd.p2['1'][y].v); if (v) cross(L.p2['1'][y][v === 'Đ' ? 0 : 1]); });
   x.font = 'bold ' + sc * 100 + 'px sans-serif'; var t0 = A([180, 480]); x.fillText(String(k.tong), t0[0], t0[1]);
   x.font = 'bold ' + sc * 34 + 'px sans-serif'; var t1 = A([130, 560]); x.fillText('P1 ' + k.p1 + ' | P2 ' + k.p2 + ' | C10 ' + k.tl, t1[0], t1[1]);
}
function ten(s) { return String(s || '').trim().replace(/[\\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 40); }
async function luu() {
   var lop = $('cp-lop').value, loai = $('cp-loai').value, F = (folders()[lop] || {})[loai], out = $('cp-log'); out.textContent = '';
   if (!F) { out.textContent = 'Chưa có thư mục Chấm bài cho lớp ' + lop + ' / ' + loai + ' (dán danh sách thư mục ở trên rồi bấm Lưu).'; return; }
   var d = new Date(), ymd = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2), n = 0;
   for (var i = 0; i < rows.length; i++) { var r = rows[i];
      if (!r.ghi || !r.kq || (r.kq.loi && r.kq.loi.length)) { out.textContent += '⏭ ' + r.f.name.slice(-20) + ': bỏ qua\n'; continue; }
      if (!r.kq.canXem || r.kq.canXem.some(function (c) { return /tự luận/.test(c); })) { out.textContent += '✖ ' + r.f.name.slice(-20) + ': chưa nhập điểm câu 10 hợp lệ\n'; continue; }
      if (!ten(r.hs)) { out.textContent += '✖ ' + r.f.name.slice(-20) + ': chưa nhập tên học sinh\n'; continue; }
      try { var cv = document.createElement('canvas'); cv.width = r.cv.width; cv.height = r.cv.height; cv.getContext('2d').drawImage(r.cv, 0, 0); var keep = r.cv; r.cv = cv; ve(r); r.cv = keep;
         var blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', .85); }), nm = 'L' + lop + '_' + loai + '_' + ten(r.hs) + '_' + r.kq.made + '_' + ymd + '.jpg';
         await dUp(F, nm, blob); n++; out.textContent += '✔ ' + nm + '\n'; } catch (e) { out.textContent += '✖ ' + r.f.name.slice(-20) + ': ' + e.message + '\n'; } }
   note('☁️ Đã lưu ' + n + ' ảnh phiếu đã chấm lên Drive.', n ? 'success' : 'warning');
}
function draw() { var box = $('cp-ds'); box.innerHTML = '';
   rows.forEach(function (r, i) { tinh(r); var d = document.createElement('div'); d.style.cssText = 'border:1px solid #bbb;border-radius:8px;padding:6px;margin:6px 0';
      d.innerHTML = '<small>' + esc(r.f.name.slice(-28)) + (r.rd.ok ? '' : ' — <span style="color:#b00020">' + esc(r.rd.msg) + '</span>') + '</small><br>' +
         'Tên HS <input data-k="hs" size="22" value="' + esc(r.hs) + '"> Mã đề <input data-k="made" size="5" value="' + esc(r.made) + '"> Câu 10 (0–' + diemDocUI().tl + ') <input data-k="tay" size="4" value="' + esc(r.tay) + '"> <label><input type="checkbox" data-k="sai"' + (r.sai ? ' checked' : '') + '> sai đơn vị</label> <label><input type="checkbox" data-k="ghi"' + (r.ghi ? ' checked' : '') + '> lưu</label>' +
         '<div id="cp-r' + i + '">' + kqHtml(r) + '</div>';
      d.querySelectorAll('[data-k]').forEach(function (el) { el.oninput = el.onchange = function () { var k = el.dataset.k; r[k] = (k === 'sai' || k === 'ghi') ? el.checked : el.value; tinh(r); $('cp-r' + i).innerHTML = kqHtml(r); }; });
      box.appendChild(d); }); }
async function nap(files) { try { await loadDeps(); if (!curKey) { curKey = await layKhoa($('cp-lop').value, $('cp-loai').value); diemNap(); } } catch (e) { $('cp-log').textContent = e.message; return; }
   for (var i = 0; i < files.length; i++) { var o = await docAnh(files[i]); rows.push({ f: files[i], cv: o.cv, rd: o.rd, made: o.rd.made || '', hs: '', tay: '', sai: false, ghi: true }); } draw(); }
async function kiemTra() { var F = folders(), out = $('cp-log'); out.textContent = ''; var ids = []; Object.keys(F).forEach(function (g) { Object.keys(F[g]).forEach(function (t) { ids.push([g + '/' + t, F[g][t]]); }); });
   if (!ids.length) { out.textContent = 'Chưa có thư mục nào.'; return; }
   for (var i = 0; i < ids.length; i++) { try { await dList(ids[i][1]); out.textContent += '✔ Lớp ' + ids[i][0] + '\n'; } catch (e) { out.textContent += '✖ Lớp ' + ids[i][0] + ': ' + e.message + '\n'; } } }
function build() {
   var p = $('tnmd-panel'); if (!p || $('cp-btn')) return;
   var b = document.createElement('button'); b.id = 'cp-btn'; b.type = 'button'; b.textContent = '📝 Chấm phiếu'; b.style.cssText = 'width:100%;margin-top:6px'; p.insertBefore(b, $('tnmd-log'));
   var dlg = document.createElement('div'); dlg.id = 'cp-dlg'; dlg.style.cssText = 'display:none;position:fixed;inset:3vh 3vw;z-index:99995;background:#fff;color:#222;border-radius:12px;padding:14px;overflow:auto;box-shadow:0 6px 30px rgba(0,0,0,.5);font-size:14px';
   dlg.innerHTML = '<button type="button" onclick="this.parentNode.style.display=\'none\'" style="float:right">✕ Đóng</button><b>📝 Chấm phiếu TX (mẫu M02) → lưu ảnh có mực đỏ vào Chấm bài</b><br>' +
      'Lớp <select id="cp-lop"><option>10</option><option>11</option></select> Loại bài <select id="cp-loai"><option>TX1</option><option>TX2</option><option>TX4</option><option>TX5</option><option>GK1</option><option>GK2</option><option>CK1</option><option>CK2</option></select> Mẫu <select id="cp-mau"><option>M02 – Phiếu TLTN 2025 (mã đề 4 số)</option></select><br>' +
      '<details id="cp-dd"><summary>⚙️ Cơ cấu điểm (sửa được, lưu theo lớp/loại bài)</summary>' +
      'Phần I: mỗi câu đúng <input id="cp-d1" size="5"> điểm &nbsp; Phần III: mỗi câu <input id="cp-d3" size="5"> &nbsp; Tự luận tối đa <input id="cp-dtl" size="5"> &nbsp; Trừ sai đơn vị <input id="cp-dtru" size="5"><br>' +
      'Phần II, số ý đúng → điểm: 0 ý <input id="cp-d2-0" size="4"> 1 ý <input id="cp-d2-1" size="4"> 2 ý <input id="cp-d2-2" size="4"> 3 ý <input id="cp-d2-3" size="4"> 4 ý <input id="cp-d2-4" size="4"> ' +
      '<button type="button" id="cp-dr">Khôi phục theo file khóa</button><br><small id="cp-dmax"></small></details>' +
      '<details><summary>Thư mục Chấm bài (dán 1 lần)</summary><textarea id="cp-tf" rows="4" style="width:100%" placeholder="Dán nguyên danh sách: Lớp 10: link TX: link 1: link 2: link ..."></textarea><button type="button" id="cp-sf">Lưu thư mục</button> <button type="button" id="cp-kt">Kiểm tra thư mục</button></details>' +
      '<input type="file" id="cp-fi" accept="image/*" multiple> <small>Chỉ chọn ảnh phiếu trả lời. Câu 10 viết tay: nhập điểm 0–3.</small><div id="cp-ds"></div><button type="button" id="cp-go"><b>☁️ Chấm và lưu ảnh lên Drive</b></button><pre id="cp-log" style="background:#f6f6f6;padding:6px;white-space:pre-wrap"></pre>';
   document.body.appendChild(dlg);
   b.onclick = function () { dlg.style.display = 'block'; p.style.display = 'none'; };
   $('cp-fi').onchange = function () { nap(this.files); };
   ['cp-d1', 'cp-d3', 'cp-dtl', 'cp-dtru', 'cp-d2-0', 'cp-d2-1', 'cp-d2-2', 'cp-d2-3', 'cp-d2-4'].forEach(function (id) { $(id).oninput = diemDoi; });
   $('cp-dr').onclick = diemKhoiPhuc; datKhoa();
   $('cp-lop').onchange = datKhoa; $('cp-loai').onchange = datKhoa;
   $('cp-sf').onclick = function () { var m = parseFolders($('cp-tf').value); try { localStorage.setItem(LS_F, JSON.stringify(m)); } catch (e) {} $('cp-log').textContent = 'Đã nhận: ' + Object.keys(m).map(function (g) { return 'Lớp ' + g + ' (' + Object.keys(m[g]).join(', ') + ')'; }).join('; '); };
   $('cp-kt').onclick = function () { kiemTra().catch(function (e) { $('cp-log').textContent = e.message; }); };
   $('cp-go').onclick = function () { luu().catch(function (e) { $('cp-log').textContent = e.message; }); };
}
var tries = 0, iv = setInterval(function () { build(); if ($('cp-btn') || ++tries > 40) clearInterval(iv); }, 500);
window.TNMakerChamPhieu = { parseFolders: parseFolders, version: '0.3' };
})();