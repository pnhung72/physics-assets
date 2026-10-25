/*! tnmaker_champhieu_drive.js (v0.5) — v0.4: ghi điểm vào sổ Quản lí điểm (lớp mình dạy: TX trung bình cộng + ghi chú ô; GK/CK giữ nguyên, không ghi đè) hoặc file riêng (chấm chéo); điểm quy đổi về thang 10; hoàn tác lần ghi. v0.3: nạp SAU tnmaker_bundle.js. v0.3: cơ cấu điểm chỉnh được trên giao diện (lưu theo lớp/loại bài). v0.2: dùng lõi Tnmaker_cham_core.js + khóa JSON (dapan_<loại>_vl<lớp>.json), bỏ Tnmaker_grade.js/Tnmaker_champhieu.js/dapan_TX1.js.
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
   x.font = 'bold ' + sc * 100 + 'px sans-serif'; var t0 = A([180, 480]); x.fillText(String(Math.round((r.d10 != null ? r.d10 : k.tong) * 100) / 100), t0[0], t0[1]);
   x.font = 'bold ' + sc * 34 + 'px sans-serif'; var t1 = A([130, 560]); x.fillText('P1 ' + k.p1 + ' | P2 ' + k.p2 + ' | C10 ' + k.tl + ' | ' + k.tong + '/' + (r.toiDa || ''), t1[0], t1[1]);
}
function ten(s) { return String(s || '').trim().replace(/[\\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 40); }
// ================= v0.4: sổ điểm / chấm chéo =================
var LS_U = 'tnm_so_url', lopData = null, lastRun = null;
var LOAI = { TX1: { hk: '1', cot: 'TX1' }, TX2: { hk: '1', cot: 'TX2' }, TX4: { hk: '2', cot: 'TX1' }, TX5: { hk: '2', cot: 'TX2' },
             GK1: { hk: '1', cot: 'GK' }, GK2: { hk: '2', cot: 'GK' }, CK1: { hk: '1', cot: 'CK' }, CK2: { hk: '2', cot: 'CK' } };
function laTX() { return /^TX/.test($('cp-loai').value); }
function lopTen() { return String(($('cp-lt') && $('cp-lt').value) || '').trim().toUpperCase().replace(/\s+/g, ''); }
function r3(x) { return Math.round(x * 1000) / 1000; }
function chuan(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function toiDaSo() {
   if (!curKey) return 0;
   var ms = Object.keys(curKey.made || {}), M = ms.length && curKey.made[ms[0]], D = diemDocUI();
   if (!M) return 0;
   return r3(M.p1.length * D.p1 + Object.keys(M.p2).length * Math.max.apply(null, D.p2) + M.p3.length * D.p3 + D.tl);
}
function soConf() {
   var u = '', t = '';
   try { u = localStorage.getItem(LS_U) || ''; } catch (e) {}
   if (!u && $('cp-su')) u = $('cp-su').value.trim();
   if (!u && typeof ADMIN_AUTH_API !== 'undefined') u = ADMIN_AUTH_API;
   try { t = sessionStorage.getItem('adminAuthToken') || ''; if (!t) t = (JSON.parse(localStorage.getItem('adminAuth') || '{}').tok) || ''; } catch (e) {}
   if (!u) throw new Error('Chưa có địa chỉ /exec của script Quản lí điểm (dán ở mục “Kết nối sổ điểm”).');
   if (!t) throw new Error('Chưa đăng nhập quản trị trên trang này (cần để ghi sổ). Hãy đăng nhập admin rồi thử lại.');
   return { url: u, token: t };
}
async function soGoi(body) {
   var c = soConf(); body.token = c.token;
   var r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }), j = await r.json();
   if (!j.success) throw new Error(j.message || j.error || 'Lỗi không rõ');
   return j.data;
}
async function bam(f) {
   try { var h = await crypto.subtle.digest('SHA-1', await f.arrayBuffer()); return Array.from(new Uint8Array(h)).slice(0, 10).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
   catch (e) { return ('f' + f.size + '_' + f.lastModified).slice(0, 40); }
}
async function napLop() {
   var lop = lopTen(), info = $('cp-li'), che = $('cp-che').value, L = LOAI[$('cp-loai').value]; lopData = null;
   $('cp-dl').innerHTML = '';
   if (!lop) { info.textContent = 'Nhập tên lớp (vd 10A13) để ghi điểm.'; draw(); return; }
   var m = /^(1[01])/.exec(lop); if (m && $('cp-lop').value !== m[1]) { $('cp-lop').value = m[1]; datKhoa(); }
   if (che === 'cheo') lopData = { mode: 'cheo', hs: [] };
   else {
      try { var d = await soGoi({ action: 'nhapDiemLay', lop: lop, hocKy: L.hk }); lopData = { mode: 'so', hs: d.hocSinh || [], khoa: d.khoa || {}, sheet: d.sheet }; }
      catch (e) {
         if (che === 'auto' && /Không tìm thấy sổ điểm/.test(e.message)) lopData = { mode: 'cheo', hs: [] };
         else { info.innerHTML = '<span style="color:#b00020">' + esc(e.message) + '</span>'; draw(); return; }
      }
   }
   if (lopData.mode === 'so') {
      $('cp-dl').innerHTML = lopData.hs.map(function (h) { return '<option value="' + esc(h.ten + ' (' + h.id + ')') + '">'; }).join('');
      info.innerHTML = '📒 <b>GHI SỔ</b> – ' + esc(lopData.sheet) + ' · ' + lopData.hs.length + ' học sinh' + (lopData.khoa[L.cot] ? ' · <span style="color:#b00020">🔒 cột ' + L.cot + ' đang khóa</span>' : '');
   } else info.innerHTML = '📁 <b>CHẤM CHÉO</b> – lớp ' + esc(lop) + ' không nằm trong sổ của bạn: điểm lưu vào file riêng, không đụng sổ.';
   draw();
}
function timHS(r) {
   if (!lopData || lopData.mode !== 'so') return null;
   var s = String(r.hs || '').trim(), m = /\((\d+)\)\s*$/.exec(s), c = chuan(s);
   if (m) { var h = lopData.hs.filter(function (x) { return String(x.id) === m[1]; }); return h.length === 1 ? { h: h[0] } : { err: 'ID ' + m[1] + ' không có trong sổ' }; }
   if (!c) return { err: 'Chưa nhập tên' };
   var ds = lopData.hs.filter(function (x) { return chuan(x.ten) === c; });
   if (ds.length === 1) return { h: ds[0] };
   if (ds.length > 1) return { err: ds.length + ' học sinh trùng tên: chọn từ danh sách gợi ý để lấy ID' };
   ds = lopData.hs.filter(function (x) { var w = chuan(x.ten); return w.slice(-(c.length + 1)) === ' ' + c; });   // gõ tên gọi, vd "Huyền"
   if (ds.length === 1) return { h: ds[0] };
   if (ds.length > 1) return { err: 'Tên "' + s + '" khớp ' + ds.length + ' học sinh: chọn từ danh sách gợi ý' };
   return { err: 'Không thấy "' + s + '" trong sổ lớp ' + lopTen() };
}
function trangThaiHS(r) {
   if (!lopData) return '<div style="color:#a15c00;font-size:12px">⚠ Chưa có lớp: nhập tên lớp ở trên</div>';
   if (lopData.mode === 'cheo') return '<div style="font-size:12px;color:#555">📁 Chấm chéo → file riêng' + (String(r.hs).trim() ? '' : ' (nhập tên HS)') + '</div>';
   var t = timHS(r), cot = LOAI[$('cp-loai').value].cot;
   if (t.err) return '<div style="color:#b00020;font-size:12px">✖ ' + esc(t.err) + '</div>';
   var v = t.h.diem && t.h.diem[cot];
   return '<div style="font-size:12px;color:#064">✔ ' + esc(t.h.ten) + ' (ID ' + esc(t.h.id) + ') · ô ' + cot + ': ' +
      (v === null || v === undefined ? 'trống → ghi mới' : v + (laTX() ? ' → sẽ tính trung bình với điểm này' : ' → đã có điểm, sẽ KHÔNG ghi đè (trừ khi tick cho phép)')) + '</div>';
}
function tinh(r) {
   if (!r.rd.ok) { r.kq = { loi: [r.rd.msg || 'Chưa đọc được phiếu'], canXem: [] }; return; }
   if (!curKey) { r.kq = { loi: ['Chưa có đáp án cho lớp/loại bài này'], canXem: [] }; return; }
   var tay = { saiDonVi: r.sai }; if (String(r.tay).trim() !== '') tay.tl = String(r.tay).replace(',', '.');
   r.kq = TNCham.cham(Object.assign({}, curKey, { diem: diemDocUI() }), r.rd, { made: r.made, tay: tay, loai: $('cp-loai').value, mau: 'M02', anh: r.f.name });
   r.toiDa = toiDaSo(); r.d10 = r.toiDa > 0 ? r3(r.kq.tong * 10 / r.toiDa) : r.kq.tong;
}
function kqHtml(r) { var k = r.kq; if (k.loi && k.loi.length) return '<span style="color:#b00020">' + esc(k.loi.join('; ')) + '</span>';
   return '<b style="font-size:18px">' + r.d10 + ' điểm</b> <small>(thang 10; gốc ' + k.tong + '/' + r.toiDa + ') P1 ' + k.p1 + ' + P2 ' + k.p2 + (k.p3 ? ' + P3 ' + k.p3 : '') + ' + câu 10 ' + k.tl + (k.tru ? ' − ' + k.tru : '') + '</small>' +
      trangThaiHS(r) +
      (k.canXem || []).map(function (c) { return '<div style="color:#a15c00;font-size:12px">⚠ ' + esc(c) + '</div>'; }).join(''); }
function hopLe(r) {
   if (r.done) return 'đã lưu rồi';
   if (!r.ghi) return 'bỏ qua (không tick lưu)';
   if (!r.kq || (r.kq.loi && r.kq.loi.length)) return 'bài chưa chấm được';
   if (!r.kq.canXem || r.kq.canXem.some(function (c) { return /tự luận/.test(c); })) return 'chưa nhập điểm câu 10 hợp lệ';
   if (!ten(r.hs)) return 'chưa nhập tên học sinh';
   if (!(r.d10 > 0)) return 'điểm 0 (hệ thống coi là chưa có điểm)';
   if (lopData && lopData.mode === 'so') { var t = timHS(r); if (t.err) return t.err; }
   return '';
}
var TT = { da_ghi: '✔ đã ghi', ok: '✔ sẽ ghi', ghi_de: '✔ sẽ ghi (ô đã có điểm)', khong_doi: '= không đổi', loi: '✖ lỗi', bo_qua: '⏭ cột khóa', xung_dot: '✖ ô vừa bị đổi, hãy tải lại lớp',
   can_xac_nhan: '⏭ ô đã có điểm: không ghi đè', trung_anh: '⏭ ảnh này đã được ghi điểm trước đó', loi_sau_ghi: '✖ đọc lại không khớp, kiểm tra ô' };
async function luu() {
   var khoi = $('cp-lop').value, loai = $('cp-loai').value, F = (folders()[khoi] || {})[loai], out = $('cp-log'), lop = lopTen(), LA = LOAI[loai]; out.textContent = '';
   if (!F) { out.textContent = 'Chưa có thư mục Chấm bài cho lớp ' + khoi + ' / ' + loai + ' (dán danh sách thư mục ở trên rồi bấm Lưu).'; return; }
   if (!lop) { out.textContent = 'Chưa nhập tên lớp (vd 10A13).'; return; }
   if (!lopData) await napLop();
   if (!lopData) { out.textContent = 'Chưa tải được lớp: ' + $('cp-li').textContent; return; }
   var d = new Date(), ymd = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
   var dung = [];
   rows.forEach(function (r) { var e = hopLe(r); if (e) out.textContent += '⏭ ' + ((r.hs || r.f.name.slice(-20))) + ': ' + e + '\n'; else dung.push(r); });
   if (!dung.length) { note('Không có bài nào hợp lệ để lưu.', 'warning'); return; }
   var thuTu = {}, trung = false;
   dung.forEach(function (r) { var k = lopData.mode === 'so' ? timHS(r).h.id : chuan(r.hs); if (thuTu[k]) trung = true; thuTu[k] = 1; });
   if (trung) { out.textContent += '✖ Có học sinh xuất hiện hai lần trong cùng đợt. Chấm từng bài riêng (bỏ tick lưu ở bài trùng) rồi chạy lại.\n'; return; }
   // đặt tên ảnh + giải trình
   dung.forEach(function (r) { r.nm = 'L' + lop + '_' + loai + '_' + ten(r.hs) + '_' + r.kq.made + '_' + ymd + '.jpg';
      r.gt = Object.assign({}, r.kq.giaiTrinh, { anh: r.nm, lop: lop, tong: r.kq.tong, toiDa: r.toiDa, thang10: r.d10 }); });
   var kqSo = null, chuaGhi = false;
   if (lopData.mode === 'so') {
      var changes = dung.map(function (r) { var h = timHS(r).h, cu = h.diem ? h.diem[LA.cot] : null;
         return { id: h.id, cot: LA.cot, moi: r.d10, cheDo: laTX() ? 'tb' : 'thay', anhId: r.aid, giaiTrinh: r.gt, cu: cu === undefined ? null : cu }; });
      var xt = await soGoi({ action: 'nhapDiemXemTruoc', lop: lop, hocKy: LA.hk, changes: changes });
      var tong = xt.tomTat || {}, dong = xt.ketQua.map(function (x, i) { return '• ' + ((dung[i].hs) || x.ten) + ' (ID ' + x.id + '): ' + (TT[x.trangThai] || x.trangThai) + (x.thongBao ? ' – ' + x.thongBao : ''); });
      var coDe = xt.ketQua.some(function (x) { return x.trangThai === 'ghi_de'; });
      var msg = 'GHI VÀO SỔ ' + xt.sheet + ' – cột ' + LA.cot + ' (' + loai + ')\n\n' + dong.join('\n') + '\n\n' +
         (coDe ? (laTX() ? 'Ô đã có điểm sẽ được TRUNG BÌNH CỘNG với điểm mới, ghi chú ô lưu đủ lịch sử.\n' :
                 ($('cp-ghide').checked ? 'Bạn đã tick cho phép GHI ĐÈ điểm đã có.\n' : 'Ô đã có điểm sẽ được GIỮ NGUYÊN (không ghi đè).\n')) : '') + '\nTiếp tục?';
      if (!confirm(msg)) { out.textContent += 'Đã hủy, chưa ghi gì.\n'; return; }
      kqSo = { xt: xt };
   } else {
      if (!confirm('CHẤM CHÉO lớp ' + lop + ' (' + loai + '): ' + dung.length + ' bài sẽ lưu vào file riêng, KHÔNG ghi vào sổ của bạn.\nTiếp tục?')) { out.textContent += 'Đã hủy.\n'; return; }
   }
   // 1) lưu ảnh có mực đỏ lên Drive
   var anhOk = {};
   for (var i = 0; i < dung.length; i++) { var r = dung[i];
      try { var cv = document.createElement('canvas'); cv.width = r.cv.width; cv.height = r.cv.height; cv.getContext('2d').drawImage(r.cv, 0, 0); var keep = r.cv; r.cv = cv; ve(r); r.cv = keep;
         var blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', .85); });
         await dUp(F, r.nm, blob); anhOk[i] = true; out.textContent += '🖼 ' + r.nm + '\n'; } catch (e) { out.textContent += '✖ ảnh ' + r.nm + ': ' + e.message + ' (bài này không ghi điểm)\n'; } }
   var ghiRows = dung.filter(function (r, i) { return anhOk[i]; });
   if (!ghiRows.length) { note('Không lưu được ảnh nào nên chưa ghi điểm.', 'warning'); return; }
   // 2) ghi điểm
   if (lopData.mode === 'so') {
      var ch2 = ghiRows.map(function (r) { var h = timHS(r).h, cu = h.diem ? h.diem[LA.cot] : null;
         return { id: h.id, cot: LA.cot, moi: r.d10, cheDo: laTX() ? 'tb' : 'thay', anhId: r.aid, giaiTrinh: r.gt, cu: cu === undefined ? null : cu }; });
      var g = await soGoi({ action: 'nhapDiemGhi', lop: lop, hocKy: LA.hk, changes: ch2, nguon: 'champhieu', xacNhanGhiDe: laTX() ? true : $('cp-ghide').checked });
      g.ketQua.forEach(function (x, i) { out.textContent += (TT[x.trangThai] || x.trangThai) + ' ' + (ghiRows[i].hs) + ' (ID ' + x.id + ') ' + (x.moi !== null && x.moi !== undefined ? '→ ô ' + x.moi : '') + (x.thongBao ? ' – ' + x.thongBao : '') + '\n'; });
      g.ketQua.forEach(function (x, i) { if (/^(da_ghi|trung_anh|khong_doi)$/.test(x.trangThai)) ghiRows[i].done = true; });
      var n = (g.tomTat && g.tomTat.da_ghi) || 0; lastRun = g.runId || null; $('cp-undo').style.display = lastRun ? '' : 'none';
      out.textContent += '\nĐã ghi ' + n + ' ô vào sổ' + (g.tbmCapNhat ? ', đã cập nhật TBM' : '') + (lastRun ? '. Mã lần nhập: ' + lastRun : '') + '\n';
      note('📒 Đã ghi ' + n + ' điểm vào sổ ' + g.sheet + '.', n ? 'success' : 'warning');
      await napLop();
   } else {
      var rowsC = ghiRows.map(function (r) { return { ten: String(r.hs).trim(), made: r.kq.made, thang10: r.d10, tong: r.kq.tong, toiDa: r.toiDa, p1: r.kq.p1, p2: r.kq.p2, p3: r.kq.p3, tl: r.kq.tl, tru: r.kq.tru, anh: r.nm, anhId: r.aid, giaiTrinh: r.gt }; });
      var c = await soGoi({ action: 'chamCheoGhi', lop: lop, bai: loai, hocKy: LA.hk, rows: rowsC });
      c.ketQua.forEach(function (x, i) { if (/^(da_ghi|trung_anh)$/.test(x.trangThai)) ghiRows[i].done = true; });
      c.ketQua.forEach(function (x) { out.textContent += (x.trangThai === 'da_ghi' ? '✔ đã lưu ' : '⏭ ' + (x.thongBao || x.trangThai) + ' ') + x.ten + '\n'; });
      out.textContent += '\nFile chấm chéo: ' + c.file + ' (sheet ' + c.sheet + ')\n';
      note('📁 Đã lưu ' + c.daGhi + ' bài chấm chéo vào file riêng.', c.daGhi ? 'success' : 'warning'); draw();
   }
}
async function hoanTac() {
   var out = $('cp-log'); if (!lastRun) { out.textContent = 'Chưa có lần ghi nào để hoàn tác.'; return; }
   if (!confirm('Hoàn tác lần ghi ' + lastRun + '? Chỉ các ô chưa bị ai đổi sau đó mới được khôi phục.')) return;
   var g = await soGoi({ action: 'nhapDiemHoanTac', runId: lastRun, nguon: 'champhieu' });
   out.textContent = 'Đã hoàn tác ' + g.khoiPhuc + ' ô.' + ((g.boQua || []).length ? '\nBỏ qua:\n' + g.boQua.join('\n') : ''); lastRun = null; $('cp-undo').style.display = 'none'; await napLop();
}
function tuDienSBD() {
   var m = $('cp-sbd') ? $('cp-sbd').value : 'off';
   if (m === 'off' || !lopData || lopData.mode !== 'so') return;
   rows.forEach(function (r) { if (String(r.hs).trim() || !r.rd.sbd || !/^\d+$/.test(r.rd.sbd)) return;
      var n = parseInt(r.rd.sbd, 10), h = lopData.hs.filter(function (x) { return m === 'id' ? String(x.id) === String(n) : parseInt(x.stt, 10) === n; });
      if (h.length === 1) r.hs = h[0].ten + ' (' + h[0].id + ')'; });
}
function tomTat() {
   var e = $('cp-sum'); if (!e) return; var ok = 0, xem = 0, cho = 0, xong = 0;
   rows.forEach(function (r) { if (r.done) { xong++; return; } if (hopLe(r)) cho++; else { ok++; if (r.kq.canXem && r.kq.canXem.length) xem++; } });
   e.textContent = rows.length + ' bài · ' + ok + ' sẵn sàng' + (xem ? ' (' + xem + ' có ⚠ nên xem ảnh)' : '') + ' · ' + cho + ' chưa đủ thông tin/lỗi · ' + xong + ' đã lưu';
}
function draw() { var box = $('cp-ds'); box.innerHTML = ''; tuDienSBD();
   rows.forEach(function (r, i) { tinh(r); var d = document.createElement('div'); d.style.cssText = 'border:1px solid #bbb;border-radius:8px;padding:6px;margin:6px 0' + (r.done ? ';opacity:.5' : '');
      d.innerHTML = '<small>' + esc(r.f.name.slice(-28)) + (r.rd.ok ? '' : ' — <span style="color:#b00020">' + esc(r.rd.msg) + '</span>') + '</small> <button type="button" data-del="1" style="float:right">✕ bỏ</button><br>' +
         'Tên HS <input data-k="hs" size="26" list="cp-dl" value="' + esc(r.hs) + '"> Mã đề <input data-k="made" size="5" value="' + esc(r.made) + '"> Câu 10 (0–' + diemDocUI().tl + ') <input data-k="tay" size="4" value="' + esc(r.tay) + '"> ' +
         '<label><input type="checkbox" data-k="sai"' + (r.sai ? ' checked' : '') + '> sai đơn vị</label> <label><input type="checkbox" data-k="ghi"' + (r.ghi ? ' checked' : '') + '> lưu</label>' +
         '<div id="cp-r' + i + '">' + (r.done ? '<b style="color:#064">✔ đã lưu</b>' : kqHtml(r)) + '</div>';
      d.querySelector('[data-del]').onclick = function () { rows.splice(i, 1); draw(); };
      d.querySelectorAll('[data-k]').forEach(function (el) {
         el.oninput = el.onchange = function () { var k = el.dataset.k; r[k] = (k === 'sai' || k === 'ghi') ? el.checked : el.value; tinh(r); if (!r.done) $('cp-r' + i).innerHTML = kqHtml(r); tomTat(); };
         el.onkeydown = function (ev) {   // Enter: tên → câu 10 → tên của bài kế tiếp
            if (ev.key !== 'Enter') return; ev.preventDefault();
            var k = el.dataset.k, nx = k === 'hs' ? d.querySelector('[data-k="tay"]') : (k === 'tay' ? (box.children[i + 1] && box.children[i + 1].querySelector('[data-k="hs"]')) : null);
            if (nx) { nx.focus(); nx.select && nx.select(); } };
      });
      box.appendChild(d); });
   tomTat(); }
async function nap(files) { try { await loadDeps(); if (!curKey) { curKey = await layKhoa($('cp-lop').value, $('cp-loai').value); diemNap(); } } catch (e) { $('cp-log').textContent = e.message; return; }
   var trung = 0;
   for (var i = 0; i < files.length; i++) { var aid = await bam(files[i]);
      if (rows.some(function (r) { return r.aid === aid; })) { trung++; continue; }     // cùng một ảnh đã có trong danh sách
      var o = await docAnh(files[i]); rows.push({ f: files[i], cv: o.cv, rd: o.rd, made: o.rd.made || '', hs: '', tay: '', sai: false, ghi: true, aid: aid }); }
   $('cp-fi').value = '';
   if (trung) $('cp-log').textContent = 'Bỏ qua ' + trung + ' ảnh trùng (đã có trong danh sách).';
   draw(); var f = $('cp-ds').querySelector('[data-k="hs"]'); if (f && !f.value) f.focus(); }
async function kiemTra() { var F = folders(), out = $('cp-log'); out.textContent = ''; var ids = []; Object.keys(F).forEach(function (g) { Object.keys(F[g]).forEach(function (t) { ids.push([g + '/' + t, F[g][t]]); }); });
   if (!ids.length) { out.textContent = 'Chưa có thư mục nào.'; return; }
   for (var i = 0; i < ids.length; i++) { try { await dList(ids[i][1]); out.textContent += '✔ Lớp ' + ids[i][0] + '\n'; } catch (e) { out.textContent += '✖ Lớp ' + ids[i][0] + ': ' + e.message + '\n'; } } }
function build() {
   var p = $('tnmd-panel'); if (!p || $('cp-btn')) return;
   var b = document.createElement('button'); b.id = 'cp-btn'; b.type = 'button'; b.textContent = '📝 Chấm phiếu'; b.style.cssText = 'width:100%;margin-top:6px'; p.insertBefore(b, $('tnmd-log'));
   var dlg = document.createElement('div'); dlg.id = 'cp-dlg'; dlg.style.cssText = 'display:none;position:fixed;inset:3vh 3vw;z-index:99995;background:#fff;color:#222;border-radius:12px;padding:14px;overflow:auto;box-shadow:0 6px 30px rgba(0,0,0,.5);font-size:14px';
   dlg.innerHTML = '<button type="button" onclick="this.parentNode.style.display=\'none\'" style="float:right">✕ Đóng</button><b>📝 Chấm phiếu TX/GK/CK (mẫu M02) → ghi sổ hoặc file chấm chéo + lưu ảnh mực đỏ</b><br>' +
      'Khối <select id="cp-lop"><option>10</option><option>11</option></select> Lớp <input id="cp-lt" size="7" placeholder="10A13"> Loại bài <select id="cp-loai"><option>TX1</option><option>TX2</option><option>TX4</option><option>TX5</option><option>GK1</option><option>GK2</option><option>CK1</option><option>CK2</option></select> Mẫu <select id="cp-mau"><option>M02 – Phiếu TLTN 2025 (mã đề 4 số)</option></select><br>' +
      'Chế độ <select id="cp-che"><option value="auto">Tự nhận (có sổ → ghi sổ, không có → chấm chéo)</option><option value="so">Chỉ ghi sổ (lớp tôi dạy)</option><option value="cheo">Chỉ chấm chéo (file riêng)</option></select> <button type="button" id="cp-nl">Tải lớp</button> ' +
      'Số báo danh <select id="cp-sbd"><option value="off">không dùng</option><option value="id">SBD = ID trong sổ</option><option value="stt">SBD = STT trong sổ</option></select> <label><input type="checkbox" id="cp-ghide"> cho phép ghi đè GK/CK đã có điểm</label><div id="cp-li" style="margin:4px 0"></div><datalist id="cp-dl"></datalist>' +
      '<details id="cp-dd"><summary>⚙️ Cơ cấu điểm (sửa được, lưu theo lớp/loại bài; điểm ghi sổ được quy về thang 10 theo tổng tối đa)</summary>' +
      'Phần I: mỗi câu đúng <input id="cp-d1" size="5"> điểm &nbsp; Phần III: mỗi câu <input id="cp-d3" size="5"> &nbsp; Tự luận tối đa <input id="cp-dtl" size="5"> &nbsp; Trừ sai đơn vị <input id="cp-dtru" size="5"><br>' +
      'Phần II, số ý đúng → điểm: 0 ý <input id="cp-d2-0" size="4"> 1 ý <input id="cp-d2-1" size="4"> 2 ý <input id="cp-d2-2" size="4"> 3 ý <input id="cp-d2-3" size="4"> 4 ý <input id="cp-d2-4" size="4"> ' +
      '<button type="button" id="cp-dr">Khôi phục theo file khóa</button><br><small id="cp-dmax"></small></details>' +
      '<details><summary>Kết nối sổ điểm (địa chỉ /exec của script Quản lí điểm)</summary><input id="cp-su" style="width:100%" placeholder="Để trống: dùng địa chỉ đăng nhập admin của trang"><small>Cần đăng nhập admin trên trang này (token tự lấy).</small></details>' +
      '<details><summary>Thư mục Chấm bài (dán 1 lần)</summary><textarea id="cp-tf" rows="4" style="width:100%" placeholder="Dán nguyên danh sách: Lớp 10: link TX: link 1: link 2: link ..."></textarea><button type="button" id="cp-sf">Lưu thư mục</button> <button type="button" id="cp-kt">Kiểm tra thư mục</button></details>' +
      '<input type="file" id="cp-fi" accept="image/*" multiple> <small>Chỉ chọn ảnh phiếu trả lời. Câu 10 viết tay: nhập điểm 0–3. Mỗi học sinh một bài trong mỗi đợt.</small><div id="cp-sum" style="font-weight:bold;margin:6px 0"></div><div id="cp-ds"></div>' +
      '<button type="button" id="cp-go"><b>☁️ Chấm, ghi điểm và lưu ảnh lên Drive</b></button> <button type="button" id="cp-undo" style="display:none">↩ Hoàn tác lần ghi vừa rồi</button><pre id="cp-log" style="background:#f6f6f6;padding:6px;white-space:pre-wrap"></pre>';
   document.body.appendChild(dlg);
   try { $('cp-su').value = localStorage.getItem(LS_U) || ''; } catch (e) {}
   b.onclick = function () { dlg.style.display = 'block'; p.style.display = 'none'; };
   $('cp-fi').onchange = function () { nap(this.files); };
   ['cp-d1', 'cp-d3', 'cp-dtl', 'cp-dtru', 'cp-d2-0', 'cp-d2-1', 'cp-d2-2', 'cp-d2-3', 'cp-d2-4'].forEach(function (id) { $(id).oninput = diemDoi; });
   $('cp-dr').onclick = diemKhoiPhuc; datKhoa();
   $('cp-lop').onchange = datKhoa; $('cp-loai').onchange = function () { datKhoa(); napLop().catch(function () {}); };
   $('cp-lt').onchange = $('cp-che').onchange = $('cp-nl').onclick = function () { napLop().catch(function (e) { $('cp-li').textContent = e.message; }); };
   try { $('cp-lt').value = localStorage.getItem('tnm_cham_lt') || ''; $('cp-che').value = localStorage.getItem('tnm_cham_che') || 'auto'; $('cp-sbd').value = localStorage.getItem('tnm_cham_sbd') || 'off'; } catch (e) {}
   $('cp-lt').addEventListener('change', function () { try { localStorage.setItem('tnm_cham_lt', lopTen()); } catch (e) {} });
   $('cp-che').addEventListener('change', function () { try { localStorage.setItem('tnm_cham_che', this.value); } catch (e) {} });
   $('cp-sbd').onchange = function () { try { localStorage.setItem('tnm_cham_sbd', this.value); } catch (e) {} draw(); };
   if (lopTen()) napLop().catch(function () {});
   $('cp-su').onchange = function () { try { localStorage.setItem(LS_U, this.value.trim()); } catch (e) {} };
   $('cp-sf').onclick = function () { var m = parseFolders($('cp-tf').value); try { localStorage.setItem(LS_F, JSON.stringify(m)); } catch (e) {} $('cp-log').textContent = 'Đã nhận: ' + Object.keys(m).map(function (g) { return 'Lớp ' + g + ' (' + Object.keys(m[g]).join(', ') + ')'; }).join('; '); };
   $('cp-kt').onclick = function () { kiemTra().catch(function (e) { $('cp-log').textContent = e.message; }); };
   var busy = false;
   $('cp-go').onclick = function () { if (busy) return; busy = true; $('cp-go').disabled = true;
      luu().catch(function (e) { $('cp-log').textContent += '\n✖ ' + e.message; }).then(function () { busy = false; $('cp-go').disabled = false; }); };
   $('cp-undo').onclick = function () { hoanTac().catch(function (e) { $('cp-log').textContent = e.message; }); };
}
var tries = 0, iv = setInterval(function () { build(); if ($('cp-btn') || ++tries > 40) clearInterval(iv); }, 500);
window.TNMakerChamPhieu = { parseFolders: parseFolders, version: '0.5' };
})();
