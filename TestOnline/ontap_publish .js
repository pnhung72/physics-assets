/* ontap_publish.js - thêm nút "Xuất JSON lên GitHub" vào trang TestOnline.
 * Đặt file này ở: physics-assets/TestOnline/ontap_publish.js
 * Gắn vào TestOnline bằng 1 dòng <script> (xem hướng dẫn). Không sửa mã TestOnline hiện có.
 * Nút chỉ hiện khi thầy đã đăng nhập quản trị; việc ghi lên GitHub do Apps Script làm (token KHÔNG nằm ở đây).
 */
(function () {
  'use strict';
  if (window.__ontapPublishLoaded) return;
  window.__ontapPublishLoaded = true;

  var API = 'https://script.google.com/macros/s/AKfycbyq99M8liZkOpFpfDHehz4j5sXCUrLcM_CkwYwMvBYLcfhnN8VvtTAYSG-A71GEN9Yh/exec';
  var PAGES = 'https://pnhung72.github.io/physics-assets/OnTap/';
  var LOAI = ['TX1','TX2','TX3','TX4','TX5','TX6','GK1','GK2','CK1','CK2','TNPT','ĐGNL','TĐH'];
  var BTN_ID = 'ontap-publish-btn';

  function note(msg, type) {
    if (typeof showNotification === 'function') showNotification(msg, type || 'info'); else alert(msg);
  }

  // Lấy dữ liệu ma trận hiện tại, cùng định dạng với nút "Tải ma trận (JSON)"
  function layMaTran() {
    var md, rc;
    try { md = (typeof matrixData !== 'undefined') ? matrixData : window.matrixData; } catch (e) {}
    try { rc = (typeof requiredCounts !== 'undefined') ? requiredCounts : window.requiredCounts; } catch (e) {}
    var t = document.getElementById('test-topic-input');
    return { matrixData: md, testTopic: t ? t.value.trim() : '', requiredCounts: rc || {},
             timestamp: new Date().toISOString(), version: '1.0' };
  }
  function lopTuMaTran(md) {
    var s = {};
    Object.keys(md || {}).forEach(function (k) { var m = /^(\d{2})_/.exec(k); if (m) s[m[1]] = 1; });
    var a = Object.keys(s);
    return a.length === 1 ? a[0] : '';
  }
  function boDau(s) { return String(s).replace(/Đ/g, 'D'); }

  function moHop() {
    var data = layMaTran();
    if (!data.matrixData || !Object.keys(data.matrixData).length) {
      note('Chưa có ma trận để đăng. Hãy tạo ma trận trước.', 'error');
      return;
    }
    var lop0 = lopTuMaTran(data.matrixData), pw0 = '';
    // Loại bài: lấy theo CHỮ hiển thị của ô #test-task (giá trị của TX5/TX6 trong ô này đang là TX3/TX4 nên không dùng .value)
    var loai0 = '';
    try {
      var sel = document.getElementById('test-task');
      if (sel && sel.selectedIndex >= 0) loai0 = String(sel.options[sel.selectedIndex].text || '').trim();
    } catch (e) {}
    try { pw0 = sessionStorage.getItem('ontap_pw') || ''; } catch (e) {}

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;border-radius:12px;padding:20px;max-width:440px;width:100%;font:15px/1.5 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.3)';
    var optL = ['10', '11', '12'].map(function (l) { return '<option' + (l === lop0 ? ' selected' : '') + '>' + l + '</option>'; }).join('');
    var optT = LOAI.map(function (l) { return '<option' + (l === loai0 ? ' selected' : '') + '>' + l + '</option>'; }).join('');
    var st = 'width:100%;padding:8px;border:1px solid #bbb;border-radius:8px;font:inherit;margin:2px 0 10px';
    box.innerHTML =
      '<h3 style="margin:0 0 8px">Đăng ma trận cho học sinh ôn tập</h3>' +
      '<p style="margin:0 0 10px;color:#555;font-size:.9rem">Ma trận gồm ' + Object.keys(data.matrixData).length + ' bài. Học sinh sẽ chọn đúng Lớp và Loại bài này trên trang Ôn tập.</p>' +
      '<label>Lớp<select id="op-lop" style="' + st + '">' + optL + '</select></label>' +
      '<label>Loại bài<select id="op-loai" style="' + st + '">' + optT + '</select></label>' +
      '<label>Mật khẩu đăng ma trận<input id="op-pw" type="password" autocomplete="off" style="' + st + '"></label>' +
      '<div id="op-msg" role="status" style="min-height:1.4em;margin-bottom:10px;font-size:.9rem"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button type="button" id="op-cancel" style="padding:8px 14px;border:1px solid #bbb;background:#fff;border-radius:8px;cursor:pointer">Đóng</button>' +
      '<button type="button" id="op-ok" style="padding:8px 16px;border:0;background:#6f42c1;color:#fff;border-radius:8px;cursor:pointer;font-weight:600">Đăng lên GitHub</button></div>';
    ov.appendChild(box);
    document.body.appendChild(ov);

    var q = function (id) { return box.querySelector('#' + id); };
    q('op-pw').value = pw0;
    q('op-cancel').addEventListener('click', function () { ov.remove(); });
    q('op-ok').addEventListener('click', function () {
      var lop = q('op-lop').value, loai = q('op-loai').value, pw = q('op-pw').value;
      var msg = q('op-msg');
      if (!pw) { msg.style.color = '#c0392b'; msg.textContent = 'Hãy nhập mật khẩu.'; return; }
      var ok = q('op-ok'); ok.disabled = true; ok.textContent = 'Đang đăng…';
      msg.style.color = '#555'; msg.textContent = 'Đang gửi lên GitHub…';
      fetch(API, { method: 'POST', body: JSON.stringify({
        action: 'onTapDangMaTran', password: pw, lop: lop, loai: boDau(loai), matrix: data
      }) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.success) throw new Error(res.error || 'Không đăng được');
          try { sessionStorage.setItem('ontap_pw', pw); } catch (e) {}
          var link = PAGES + '?lop=' + lop + '&loai=' + encodeURIComponent(boDau(loai));
          msg.style.color = '#1e7e34';
          msg.innerHTML = 'Đã đăng. Học sinh thấy sau khoảng 1–5 phút.<br><a href="' + link + '" target="_blank" rel="noopener">Mở trang ôn tập</a>';
          note('Đã đăng ma trận ' + lop + ' – ' + loai + ' lên GitHub.', 'success');
        })
        .catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = e.message; })
        .then(function () { ok.disabled = false; ok.textContent = 'Đăng lên GitHub'; });
    });
  }

  // Chèn nút cạnh "Tải ma trận (JSON)"; chỉ hiện khi đã đăng nhập quản trị
  function dongBo() {
    var holder = document.getElementById('action-buttons-container');
    if (!holder) return;
    var admin = true;
    try { if (typeof isAdminAuthenticated !== 'undefined') admin = !!isAdminAuthenticated; } catch (e) {}
    var b = document.getElementById(BTN_ID);
    if (!admin) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('button');
    b.id = BTN_ID; b.type = 'button';
    b.textContent = '🚀 Xuất JSON lên GitHub';
    b.title = 'Đăng ma trận này để học sinh chọn ở trang Ôn tập';
    b.style.backgroundColor = '#6f42c1';
    b.addEventListener('click', moHop);
    var ref = document.getElementById('download-matrix-json');
    if (ref && ref.parentNode === holder) ref.insertAdjacentElement('afterend', b); else holder.appendChild(b);
  }
  setInterval(dongBo, 2000);
  dongBo();
})();
