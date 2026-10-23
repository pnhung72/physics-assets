/*!
 * download_guard.js  (v1.3)  -  Bảo vệ nút "Tải gói đề" của TestOnline
 * ---------------------------------------------------------------------------
 * Đặt tại: physics-assets/TestOnline/download_guard.js
 * Nạp ở CUỐI trang TestOnline (sau mọi <script> khác), 1 dòng duy nhất:
 *   <script src="https://cdn.jsdelivr.net/gh/pnhung72/physics-assets@<MÃ-COMMIT>/TestOnline/download_guard.js"></script>
 *
 * Việc file này làm (không cần sửa mã trong trang):
 *  1) Sửa mã khóa Vật lí 12 trong COURSE_MAP (NNzA3... -> NzA3...).
 *  2) Bọc window.downloadPackage: hỏi server "số điện thoại này đã mua khóa của
 *     lớp trong đề chưa?" trước khi cho mở hộp thoại xuất.
 *  3) Bọc window.processExport: lớp phòng thủ thứ hai (chặn gọi thẳng từ F12).
 *
 * v1.3: hiện hạn dùng gói đề Word sau khi xác thực.
 * v1.2: nhận token admin từ cả sessionStorage (adminAuthToken) lẫn localStorage
 * (ae_session của đăng nhập trang chủ, adminAuth của nút "Chế độ Admin").
 * Token luôn được server xác thực lại qua validateToken.
 *
 * LƯU Ý BẢO MẬT: file này nằm trên repo public nên chỉ là lớp ngăn người dùng
 * thông thường. Quyền thật nằm ở server (action authorizeDownload trong script
 * "API Thanh toán"). Đừng đặt mật khẩu/khóa bí mật vào file này.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__tgDownloadGuard) return;
  window.__tgDownloadGuard = true;

  // ===== CẤU HÌNH =====
  // URL /exec của script "API Thanh toán" ĐÃ VÁ. Để trống = dùng PHYSICS_PAYMENT_API của trang.
  var AUTH_API_OVERRIDE = '';

  function authApi() {
    if (AUTH_API_OVERRIDE) return AUTH_API_OVERRIDE;
    if (window.TG_DOWNLOAD_AUTH_API) return window.TG_DOWNLOAD_AUTH_API;
    try { return PHYSICS_PAYMENT_API; } catch (e) { return ''; }
  }

  // ===== 1) SỬA COURSE_MAP (khóa Vật lí 12 đang sai một chữ N) =====
  try {
    if (typeof COURSE_MAP === 'object' && COURSE_MAP && COURSE_MAP['3'] === 'NNzA3MjQ5ODIwNDgz') {
      COURSE_MAP['3'] = 'NzA3MjQ1ODIwNDgz';
    }
  } catch (e) {}

  var origDownload = window.downloadPackage;
  var origExport = window.processExport;
  if (typeof origDownload !== 'function' || typeof origExport !== 'function') {
    console.warn('[download_guard] Chưa thấy downloadPackage/processExport - guard KHÔNG hoạt động. Hãy nạp file này ở cuối trang.');
    return;
  }

  // ===== Tiện ích =====
  function notify(msg, type) {
    try { showNotification(msg, type || 'info'); } catch (e) { try { window.alert(msg); } catch (x) {} }
  }
  function getMatrix() {
    try { if (typeof matrixData !== 'undefined' && matrixData) return matrixData; } catch (e) {}
    return window.matrixData || {};
  }
  function gradesList() {
    var set = {}, keys = Object.keys(getMatrix() || {});
    keys.forEach(function (k) { var g = String(k).split('_')[0]; if (g) set[g] = 1; });
    return Object.keys(set).sort();
  }
  function flag(name) { try { return !!(new Function('return typeof ' + name + ' !== "undefined" && ' + name + ';'))(); } catch (e) { return false; } }

  var auth = { token: null, exp: 0, grades: '' };
  var checking = false;

  function hasValidToken(grades) {
    return !!auth.token && Date.now() < auth.exp - 5000 && auth.grades === grades.join(',');
  }
  function askServer(phone, grades) {
    var url = authApi() + '?action=authorizeDownload&phone=' + encodeURIComponent(phone) +
              '&grades=' + encodeURIComponent(grades.join(','));
    return fetch(url).then(function (r) { return r.json(); });
  }

  // Lấy token admin ở mọi nơi các hệ đăng nhập có thể lưu. Chỉ là token do server cấp;
  // quyền thật vẫn do server quyết định qua validateToken bên dưới.
  function getAdminToken() {
    try {
      var t = sessionStorage.getItem('adminAuthToken');
      if (t) return t;
    } catch (e) {}
    try {   // đăng nhập ở ô "admin" trên trang chủ (theme)
      var ae = JSON.parse(localStorage.getItem('ae_session') || 'null');
      if (ae && ae.token && (Date.now() - (ae.ts || 0)) < 86400000) return ae.token;
    } catch (e) {}
    try {   // đăng nhập bằng nút đỏ "Chế độ Admin" của trang TestOnline
      var sv = JSON.parse(localStorage.getItem('adminAuth') || 'null');
      if (sv && sv.tok && (Date.now() - (sv.t || 0)) < 86400000) return sv.tok;
    } catch (e) {}
    return '';
  }

  // Admin: LUÔN hỏi lại server (validateToken, role 'full'). Không tin cờ chỉ lưu ở trình duyệt.
  async function adminValidated() {
    try {
      var tok = getAdminToken();
      if (!tok) return false;
      var api = (typeof ADMIN_AUTH_API !== 'undefined') ? ADMIN_AUTH_API : '';
      if (!api) return false;
      var body = new URLSearchParams();
      body.append('action', 'validateToken');
      body.append('token', tok);
      var r = await fetch(api, { method: 'POST', body: body });
      var j = await r.json();
      return !!(j && j.success && j.data && j.data.valid && (j.data.role || 'full') === 'full');
    } catch (e) { return false; }
  }

  // true = được phép tải. Lỗi mạng/lỗi server = từ chối (không mở quyền).
  async function requireAccess() {
    var grades = gradesList();
    if (!grades.length) { notify('❌ Không xác định được khối lớp của đề', 'error'); return false; }
    if (hasValidToken(grades)) return true;
    // Admin đã đăng nhập (token do server cấp, được server xác thực lại) -> miễn kiểm tra mua khóa.
    if (await adminValidated()) {
      auth = { token: 'admin', exp: Date.now() + 30 * 60 * 1000, grades: grades.join(',') };
      return true;
    }
    if (!authApi()) { notify('❌ Chưa cấu hình máy chủ kiểm tra quyền tải.', 'error'); return false; }

    var phone = '';
    try { phone = (localStorage.getItem('userPhone') || '').trim(); } catch (e) {}
    if (!phone) {
      phone = (window.prompt('Nhập số điện thoại đã mua khóa học/tài liệu để tải gói đề:') || '').trim();
      if (!phone) return false;
    }

    for (var attempt = 0; attempt < 2; attempt++) {
      var res;
      try {
        notify('⏳ Đang kiểm tra quyền tải...', 'info');
        res = await askServer(phone, grades);
      } catch (err) {
        console.error('[download_guard] lỗi kiểm tra quyền:', err);
        notify('❌ Không kết nối được máy chủ kiểm tra quyền. Vui lòng thử lại sau.', 'error');
        return false;
      }

      if (res && res.allowed && res.token) {
        try { localStorage.setItem('userPhone', phone); } catch (e) {}
        auth = { token: res.token, exp: res.expiresAt, grades: grades.join(',') };
        if (res.plan && res.plan !== 'course' && res.plan !== 'beta' && res.until) {
          notify('✅ Gói đề Word còn hiệu lực: ' + res.until, 'success');
        }
        return true;
      }

      var reason = res && res.reason;
      if (reason === 'TOO_MANY_TRIES') { notify('⚠️ Bạn đã thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.', 'warning'); return false; }
      if (reason === 'SERVER_ERROR' || reason === 'INVALID_GRADE') { notify('❌ Không kiểm tra được quyền tải lúc này. Vui lòng thử lại sau.', 'error'); return false; }

      // NOT_PURCHASED / MISSING_INFO: cho biết cần mua gì
      var missing = (res && res.missingGrades && res.missingGrades.length) ? res.missingGrades : grades;
      var lines = [], link = '';
      missing.forEach(function (g) {
        var offers = (res && res.offers && res.offers[g]) || [];
        offers.forEach(function (o) {
          var price = Number(o.price) > 0 ? ' - ' + Number(o.price).toLocaleString('vi-VN') + 'đ' : '';
          lines.push('• ' + o.name + price);
          if (!link && o.url) link = o.url;
        });
      });
      var need = lines.length ? lines.join('\n') : 'Khóa học/Tài liệu tương ứng với lớp ' + missing.join(', ');
      var msg = 'Số ' + phone.slice(0, 4) + '*** chưa có quyền tải đề lớp ' + missing.join(', ') +
                '.\nMua một trong các sản phẩm sau để tải:\n' + need;
      if (link && window.confirm(msg + '\n\nMở trang mua ngay?')) window.open(link, '_blank');
      else notify('🔒 ' + msg.replace(/\n/g, ' '), 'warning');

      if (attempt === 0) {
        var other = (window.prompt('Nhập số điện thoại khác (Hủy để thôi):') || '').trim();
        if (!other) return false;
        phone = other;
      }
    }
    return false;
  }

  // ===== 2) BỌC downloadPackage =====
  window.downloadPackage = async function (format) {
    var self = this, args = arguments;
    // Chưa có ma trận / đang mở hộp thoại / đang xuất: để hàm gốc tự báo như cũ.
    if (!Object.keys(getMatrix() || {}).length || flag('isModalShowing') || flag('isExporting')) {
      return origDownload.apply(self, args);
    }
    if (checking) return;
    checking = true;
    var ok = false;
    try { ok = await requireAccess(); } finally { checking = false; }
    if (!ok) return;
    return origDownload.apply(self, args);
  };

  // ===== 3) BỌC processExport (phòng thủ lớp hai) =====
  window.processExport = async function () {
    if (!hasValidToken(gradesList())) {
      throw new Error('Chưa xác thực quyền tải. Vui lòng bấm tải lại.');
    }
    return origExport.apply(this, arguments);
  };

  console.log('[download_guard] v1.3 đã bật kiểm tra quyền tải gói đề');
})();
