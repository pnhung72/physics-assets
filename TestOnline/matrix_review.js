/* ============================================================
 * matrix_review.js - Màn hình "Ma trận đề xuất (chờ duyệt)" cho TestOline (chỉ Admin)
 * Cần nạp SAU matrix_planner.js. Đặt trên GitHub pnhung72/physics-assets/TestOnline/,
 * nối vào TestOline bằng thẻ <script> ở cuối file (như luyende_drive.js).
 *
 * Luồng: lấy thông báo kiểm tra từ Lịch báo giảng (action ktNotices) -> chọn bài kiểm tra
 *        -> "Lập ma trận nháp" -> chỉnh tay từng ô -> "Duyệt: nạp vào trang".
 * "Duyệt" chỉ nạp ma trận vào matrixData và hiển thị như khi tự tạo; việc LƯU vẫn do nút
 * "Lưu ma trận" có sẵn của TestOline đảm nhiệm (không đổi luồng lưu cũ).
 * ============================================================ */
(function (root) {
  'use strict';
  var P = root.MatrixPlanner;
  if (!P) { console.warn('[MXR] Chưa nạp matrix_planner.js'); return; }

  var LS_URL = 'mxr_lbg_url', LS_KEY = 'mxr_lbg_key';
  var AUTH_PARAM = root.MXR_AUTH_PARAM || 'token';      // tên tham số mã truy cập của Lịch báo giảng
  var TASKS = ['TX1', 'TX2', 'TX3', 'TX4', 'TX5', 'TX6', 'GK1', 'GK2', 'CK1', 'CK2'];
  var S = { notices: [], showPast: false, idx: -1, taskType: '', useVDC: false, plan: null, matrix: null, skipped: [], msg: '', snd: { date: '', period: '', resend: false } };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function kindOf(t) { return /^TX/i.test(String(t || '')) ? 'TX' : 'GK'; }
  function typeName(t, kind) {
    if (t === 'multipleChoice') return 'Trắc nghiệm';
    if (t === 'trueFalse') return 'Đúng/Sai (ý)';
    if (t === 'essay') return kind === 'TX' ? 'Tự luận' : 'Trả lời ngắn';
    return 'Tự luận';
  }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); }
  function f2(x) { return (Math.round(x * 100) / 100).toFixed(2).replace('.', ','); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function isAdmin() { try { return typeof isAdminMode !== 'undefined' && !!isAdminMode; } catch (e) { return false; } }

  // Loại bài TestOline đoán từ thông báo (Admin có thể đổi ở ô chọn)
  function taskTypeOf(n) {
    var sem = n.semester || 1;
    if (n.type === 'KTTX') { var m = String(n.examRaw || '').match(/(\d)\s*$/); return 'TX' + ((sem - 1) * 3 + (m ? +m[1] : 1)); }
    if (n.type === 'KTCK') return 'CK' + sem;
    return 'GK' + sem;
  }

  // Các bài sẽ kiểm tra -> danh sách {chapter, lesson, periods}; bài không số hoặc chưa có trong ngân hàng được liệt kê riêng
  function expandLessons(n, bank) {
    var map = {}, order = [], skipped = [];
    (n.lessons || []).forEach(function (l) {
      var nos = l.nos || [];
      if (!nos.length) { skipped.push(l.name); return; }
      nos.forEach(function (no) {
        var ch = bank.chapterOf(String(n.grade), String(no));
        if (!ch) { skipped.push('Bài ' + no + ' (chưa có câu hỏi trong ngân hàng)'); return; }
        var k = ch + '_' + no;
        if (!map[k]) { map[k] = { chapter: ch, lesson: no, name: 'Bài ' + no, periods: 0 }; order.push(k); }
        map[k].periods += (l.periods || 1) / nos.length;
      });
    });
    return { lessons: order.map(function (k) { return map[k]; }), skipped: skipped };
  }

  function calcStats(matrix, taskType) {
    var unit = P.PRESETS[kindOf(taskType)].unit;
    var st = P.pointsByLevel(matrix, unit), parts = {}, tf = 0, items = 0;
    P.TYPES.forEach(function (t) { parts[t] = { B: 0, H: 0, VD: 0, VDC: 0, n: 0 }; });
    Object.keys(matrix).forEach(function (k) {
      P.TYPES.forEach(function (t) { P.LEVELS.forEach(function (l) {
        var v = parseInt(matrix[k][t][l], 10) || 0;
        parts[t][l] += v; parts[t].n += v; items += v;
        if (t === 'trueFalse') tf += v;
      }); });
    });
    return { pct: st.pct, total: st.total, parts: parts, tf: tf, items: items, unit: unit };
  }

  function buildPlan() {
    var n = S.notices[S.idx];
    if (!n) return;
    if (typeof allQuestions === 'undefined' || !allQuestions || !Object.keys(allQuestions).length) {
      S.msg = 'Ngân hàng câu hỏi chưa tải xong, hãy đợi rồi thử lại.'; return;
    }
    var bank = P.bankFromQuestions(allQuestions, {
      tfCountLesson: (typeof tfCountItems === 'function') ? tfCountItems : null
    });
    var ex = expandLessons(n, bank);
    S.skipped = ex.skipped;
    if (!ex.lessons.length) { S.plan = null; S.matrix = null; S.msg = 'Không có bài nào khớp ngân hàng câu hỏi để lập ma trận.'; return; }
    S.plan = P.plan({ grade: String(n.grade), taskType: S.taskType, topic: S.taskType, lessons: ex.lessons, avail: bank.avail, useVDC: S.useVDC });
    S.matrix = JSON.parse(JSON.stringify(S.plan.matrixData));
    S.msg = '';
  }

  /* ---------- lấy thông báo từ Lịch báo giảng ---------- */
  function cfg(force) {
    var url = localStorage.getItem(LS_URL), key = localStorage.getItem(LS_KEY);
    if (force || !url) { url = root.prompt('Dán địa chỉ web app Lịch báo giảng (kết thúc bằng /exec):', url || ''); if (url) localStorage.setItem(LS_URL, url.trim()); }
    if (force || !key) { key = root.prompt('Nhập mã truy cập của Lịch báo giảng:', ''); if (key) localStorage.setItem(LS_KEY, key.trim()); }
    return { url: localStorage.getItem(LS_URL), key: localStorage.getItem(LS_KEY) };
  }
  function loadNotices(force) {
    var c = cfg(force);
    if (!c.url || !c.key) { S.msg = 'Chưa có địa chỉ hoặc mã truy cập.'; render(); return Promise.resolve(); }
    S.msg = 'Đang tải thông báo kiểm tra...'; render();
    return fetch(c.url + '?action=ktNotices&' + AUTH_PARAM + '=' + encodeURIComponent(c.key))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.status !== 'success') {
          if (j.code === 'UNAUTHORIZED') localStorage.removeItem(LS_KEY);
          throw new Error(j.message || 'Lỗi không rõ');
        }
        S.notices = (j.notices || []).slice().sort(function (a, b) { return String(a.startDate).localeCompare(String(b.startDate)); });
        S.idx = -1; S.plan = null; S.matrix = null; S.msg = '';
        var t = todayStr();
        for (var i = 0; i < S.notices.length; i++) if (String(S.notices[i].endDate) >= t) { select(i); break; }
        if (S.idx < 0 && S.notices.length) select(0);
      })
      .catch(function (e) { S.msg = 'Không tải được thông báo: ' + e.message; })
      .then(render);
  }
  function select(i) {
    S.idx = i; var n = S.notices[i];
    S.taskType = n ? taskTypeOf(n) : ''; S.plan = null; S.matrix = null; S.skipped = [];
    S.snd.date = n ? String(n.endDate || '').slice(0, 10) : ''; S.snd.period = ''; S.snd.resend = false;   // TL: gửi học sinh
  }

  /* ---------- giao diện ---------- */
  function visibleNotices() {
    var t = todayStr(), out = [];
    S.notices.forEach(function (n, i) { if (S.showPast || String(n.endDate) >= t) out.push(i); });
    return out;
  }
  function render() {
    var box = document.getElementById('mxr-modal');
    if (!box || box.style.display === 'none') return;
    var n = S.notices[S.idx], h = '';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
         '<h3 style="margin:0;color:#222">🧩 Ma trận đề xuất (chờ duyệt)</h3>' +
         '<span><button data-mxr="cfg" style="margin-right:8px">⚙ Cấu hình</button><button data-mxr="close">✖ Đóng</button></span></div>';
    if (S.msg) h += '<div style="padding:8px;background:#fff3cd;border-left:4px solid #ffc107;color:#000;margin-bottom:10px">' + esc(S.msg) + '</div>';
    if (!S.notices.length) {
      h += '<button data-mxr="load">Tải thông báo kiểm tra từ Lịch báo giảng</button>';
    } else {
      h += '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px;color:#000">';
      h += '<select data-mxr="notice" style="max-width:100%">';
      visibleNotices().forEach(function (i) {
        var x = S.notices[i];
        h += '<option value="' + i + '"' + (i === S.idx ? ' selected' : '') + '>K' + esc(x.grade) + ' · ' + esc(x.examRaw) + ' · HK' + x.semester + ' · tuần ' + x.week + ' · ' + (x.lessons || []).length + ' bài</option>';
      });
      h += '</select> ';
      h += '<label><input type="checkbox" data-mxr="past"' + (S.showPast ? ' checked' : '') + '> hiện cả bài đã qua</label>';
      h += '<label>Loại bài: <select data-mxr="task">' + TASKS.map(function (t) { return '<option' + (t === S.taskType ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>';
      if (kindOf(S.taskType) === 'GK') h += '<label><input type="checkbox" data-mxr="vdc"' + (S.useVDC ? ' checked' : '') + '> có VDC (4:3:2:1)</label>';
      h += '<button data-mxr="plan">⚙ Lập ma trận nháp</button></div>';
      if (n) h += '<div style="color:#444;font-size:0.9em;margin-bottom:8px">Các bài sẽ kiểm tra: ' + (n.lessons || []).map(function (l) { return esc(l.name); }).join(' | ') + '</div>';
    }
    if (S.matrix) h += '<div id="mxr-grid">' + gridHtml() + '</div><div id="mxr-stats">' + statsHtml() + '</div>' +
      '<div style="margin-top:10px"><button data-mxr="approve" style="background:#198754;color:#fff;padding:8px 14px;border:0;border-radius:6px">✅ Duyệt: nạp vào ma trận của trang</button></div>' + sendHtml();
    box.firstChild.innerHTML = h;
  }
  function gridHtml() {
    var kind = kindOf(S.taskType), th = 'padding:4px;border:1px solid #ccc;background:#4361ee;color:#fff;text-align:center;font-size:0.85em;';
    var h = '<div style="overflow-x:auto"><table style="border-collapse:collapse;color:#000"><tr><th style="' + th + '" rowspan="2">Bài</th>';
    P.TYPES.forEach(function (t) { h += '<th style="' + th + '" colspan="4">' + typeName(t, kind) + '</th>'; });
    h += '</tr><tr>';
    P.TYPES.forEach(function () { P.LEVELS.forEach(function (l) { h += '<th style="' + th + '">' + l + '</th>'; }); });
    h += '</tr>';
    Object.keys(S.matrix).forEach(function (k) {
      h += '<tr><td style="padding:4px;border:1px solid #ccc;white-space:nowrap">' + esc(k.split('_').slice(1).join('.')) + '</td>';
      P.TYPES.forEach(function (t) { P.LEVELS.forEach(function (l) {
        h += '<td style="border:1px solid #ccc"><input type="number" min="0" style="width:46px" data-k="' + esc(k) + '" data-t="' + t + '" data-l="' + l + '" value="' + (S.matrix[k][t][l] || 0) + '"></td>';
      }); });
      h += '</tr>';
    });
    return h + '</table></div>';
  }
  function statsHtml() {
    var st = calcStats(S.matrix, S.taskType), kind = kindOf(S.taskType), p = S.plan, h = '';
    var td = 'padding:5px 8px;border:1px solid #ccc;text-align:center;';
    h += '<div style="margin-top:10px;padding:10px;background:#f8f9fa;border:1px solid #ddd;border-radius:6px;color:#000;font-size:0.92em">';
    h += '<b>Tổng:</b> ' + st.items + ' mục, ' + f2(st.total) + ' điểm (Đúng/Sai tính theo ý: ' + st.tf + ' ý).<br>';
    var tgt = p ? p.levelTarget : {};
    h += '<table style="border-collapse:collapse;margin:8px 0"><tr><th style="' + td + '">Mức</th>' + P.LEVELS.map(function (l) { return '<th style="' + td + '">' + l + '</th>'; }).join('') + '</tr>';
    h += '<tr><td style="' + td + '">% điểm hiện tại</td>' + P.LEVELS.map(function (l) { return '<td style="' + td + '">' + f1(st.pct[l]) + '%</td>'; }).join('') + '</tr>';
    if (kind === 'GK') {
      h += '<tr><td style="' + td + '">Quy định</td>' + P.LEVELS.map(function (l) { return '<td style="' + td + '">' + f1(tgt[l] || 0) + '%</td>'; }).join('') + '</tr>';
      h += '<tr><td style="' + td + '">Chênh lệch</td>' + P.LEVELS.map(function (l) {
        var d = st.pct[l] - (tgt[l] || 0), ok = Math.abs(d) <= 2.5;
        return '<td style="' + td + 'color:' + (ok ? '#155724' : '#b45309') + ';font-weight:bold">' + (d > 0 ? '+' : '') + f1(d) + '</td>';
      }).join('') + '</tr>';
    }
    h += '</table>';
    if (kind === 'TX') h += '<small>Với TX, tỉ lệ 4:3:2:1 áp dụng trong từng phần (xem số câu theo mức ở bảng trên).</small><br>';
    var w = [];
    if (p) { (p.warnings || []).forEach(function (x) { w.push(x); }); (p.shortages || []).forEach(function (x) { w.push('Thiếu câu: ' + typeName(x.type, kind) + ' mức ' + x.level + ' cần ' + x.need + ', ngân hàng có ' + x.have + '.'); }); }
    S.skipped.forEach(function (x) { w.push('Không đưa vào ma trận: ' + x); });
    if (st.tf % 4) w.push('Tổng số ý Đúng/Sai = ' + st.tf + ' không chia hết cho 4.');
    if (Math.abs(st.total - 10) > 0.005) w.push('Tổng điểm gốc ' + f2(st.total) + ' khác 10,00 (hệ thống quy về thang 10 theo tỉ lệ khi chấm).');
    h += w.map(function (x) { return '<div style="color:#b45309">⚠️ ' + esc(x) + '</div>'; }).join('');
    return h + '</div>';
  }
  function refreshStats() { var el = document.getElementById('mxr-stats'); if (el) el.innerHTML = statsHtml(); }

  function approve() {
    if (!S.matrix) return;
    var m = JSON.parse(JSON.stringify(S.matrix)), n = S.notices[S.idx];
    try {
      matrixData = m;                                           // biến toàn cục của TestOline
      try { currentMatrixId = null; } catch (e) {}
      var ti = document.getElementById('test-topic-input');
      if (ti) { ti.value = S.taskType; ti.dispatchEvent(new Event('input', { bubbles: true })); }
      var g = document.getElementById('grade');
      if (g && n) g.value = String(n.grade);
      ['displayMatrix', 'updateMatrixStatus', 'updateActionButtonsState'].forEach(function (f) {
        try { if (typeof root[f] === 'function') root[f](); } catch (e) { console.warn('[MXR] ' + f, e); }
      });
      if (typeof showNotification === 'function') showNotification('Đã nạp ma trận ' + S.taskType + ' khối ' + (n ? n.grade : '') + ' vào trang. Kiểm tra rồi bấm "Lưu ma trận".', 'success');
      document.getElementById('mxr-modal').style.display = 'none';
    } catch (e) {
      S.msg = 'Không nạp được ma trận vào trang: ' + e.message; render();
    }
  }

  /* ---------- gửi thông báo + ma trận cho học sinh (qua dự án Đăng ký học) ---------- */
  function sendHtml() {
    var sd = S.snd, h = '';
    h += '<div style="margin-top:14px;padding:10px;border:1px solid #cfe2ff;background:#f4f8ff;border-radius:6px;color:#000">';
    h += '<b>📧 Gửi lịch kiểm tra + ma trận cho học sinh (đã có tài khoản)</b>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0">';
    h += '<label>Ngày kiểm tra: <input type="date" data-snd="date" value="' + esc(sd.date) + '"></label>';
    h += '<label>Tiết: <input type="text" data-snd="period" value="' + esc(sd.period) + '" placeholder="vd: tiết cuối cùng trong tuần" style="width:220px"></label>';
    h += '<label><input type="checkbox" data-mxr="snd-resend"' + (sd.resend ? ' checked' : '') + '> gửi lại (ma trận đã sửa)</label></div>';
    h += '<button data-mxr="snd-count">👥 Xem số học sinh sẽ nhận</button> ';
    h += '<button data-mxr="snd-test">✉ Gửi thử cho tôi</button> ';
    h += '<button data-mxr="snd-send" style="background:#0d6efd;color:#fff;border:0;border-radius:6px;padding:6px 12px">🚀 Gửi cho học sinh</button>';
    h += '<div id="mxr-snd-res" style="margin-top:8px;white-space:pre-wrap"></div></div>';
    return h;
  }
  function setSndRes(txt) { var el = document.getElementById('mxr-snd-res'); if (el) el.textContent = txt; }
  function buildSendPayload() {
    var n = S.notices[S.idx], st = calcStats(S.matrix, S.taskType), kind = kindOf(S.taskType), titles = {}, types = {}, rows = [];
    (n.lessons || []).forEach(function (l) { if ((l.nos || []).length === 1) titles[l.nos[0]] = l.name; });
    P.TYPES.forEach(function (t) { types[t] = typeName(t, kind); });
    Object.keys(S.matrix).forEach(function (k) {
      var no = k.split('_')[2], cells = {}, sum = 0;
      P.TYPES.forEach(function (t) {
        cells[t] = {};
        P.LEVELS.forEach(function (l) { var v = parseInt(S.matrix[k][t][l], 10) || 0; cells[t][l] = v; sum += v; });
      });
      if (sum) rows.push({ label: titles[no] || ('Bài ' + no), cells: cells });
    });
    return {
      grade: String(n.grade), taskType: S.taskType, examRaw: n.examRaw, typeCode: n.type, semester: n.semester, week: n.week,
      startDate: n.startDate, endDate: n.endDate, examDate: S.snd.date, period: S.snd.period, minutes: P.PRESETS[kind].minutes,
      kind: kind, types: types, rows: rows, pct: st.pct, total: st.total, items: st.items, tf: st.tf,
      pageUrl: root.location.origin + root.location.pathname, resend: !!S.snd.resend
    };
  }
  function sendNotice(mode) {
    if (!S.matrix) return;
    var tok = ''; try { tok = root.sessionStorage.getItem('adminAuthToken') || ''; } catch (e) {}
    var url = root.MXR_SEND_URL || (typeof ADMIN_AUTH_API !== 'undefined' ? ADMIN_AUTH_API : '');
    if (!tok || !url) { setSndRes('Chưa đăng nhập Admin (thiếu token) hoặc thiếu địa chỉ máy chủ. Hãy đăng nhập Admin lại.'); return; }
    if (mode !== 'count' && !S.snd.date) { setSndRes('Hãy chọn ngày kiểm tra trước.'); return; }
    if (mode === 'send' && !root.confirm('Gửi thư lịch kiểm tra + ma trận cho học sinh khối ' + S.notices[S.idx].grade + '?\nBạn nên bấm "Gửi thử cho tôi" để xem thư trước.')) return;
    var body = new URLSearchParams();
    body.append('action', 'sendExamNotice'); body.append('token', tok); body.append('mode', mode);
    body.append('payload', JSON.stringify(buildSendPayload()));
    setSndRes('Đang xử lý...');
    fetch(url, { method: 'POST', body: body })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.success) throw new Error((j && (j.message || j.error)) || 'Lỗi không rõ');
        setSndRes((j.data && j.data.text) || 'Xong.');
      })
      .catch(function (e) { setSndRes('Lỗi: ' + e.message); });
  }

  function onClick(ev) {
    var a = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-mxr');
    if (!a) return;
    if (a === 'close') document.getElementById('mxr-modal').style.display = 'none';
    else if (a === 'cfg') loadNotices(true);
    else if (a === 'load') loadNotices(false);
    else if (a === 'plan') { buildPlan(); render(); }
    else if (a === 'approve') approve();
    else if (a === 'snd-count' || a === 'snd-test' || a === 'snd-send') sendNotice(a.slice(4));
  }
  function onChange(ev) {
    var t = ev.target, a = t && t.getAttribute && t.getAttribute('data-mxr');
    if (a === 'notice') { select(parseInt(t.value, 10)); render(); }
    else if (a === 'past') { S.showPast = !!t.checked; render(); }
    else if (a === 'task') { S.taskType = t.value; S.plan = null; S.matrix = null; render(); }
    else if (a === 'vdc') { S.useVDC = !!t.checked; S.plan = null; S.matrix = null; render(); }
    else if (a === 'snd-resend') { S.snd.resend = !!t.checked; }
  }
  function onInput(ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute('data-snd')) { S.snd[t.getAttribute('data-snd')] = t.value; return; }
    if (!t || !t.getAttribute || !t.getAttribute('data-k') || !S.matrix) return;
    var v = parseInt(t.value, 10); if (isNaN(v) || v < 0) v = 0;
    S.matrix[t.getAttribute('data-k')][t.getAttribute('data-t')][t.getAttribute('data-l')] = v;
    refreshStats();
  }

  function open() {
    var box = document.getElementById('mxr-modal');
    if (!box) {
      box = document.createElement('div');
      box.id = 'mxr-modal';
      box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:20px;';
      box.innerHTML = '<div style="background:#fff;color:#000;border-radius:10px;padding:16px;max-width:1100px;width:100%;"></div>';
      box.addEventListener('click', onClick);
      box.addEventListener('change', onChange);
      box.addEventListener('input', onInput);
      document.body.appendChild(box);
    }
    box.style.display = 'flex';
    if (!S.notices.length) loadNotices(false); else render();
  }

  // Nút mở màn hình: chỉ hiện với Admin
  function ensureButton() {
    var bar = document.getElementById('mxr-bar');
    if (!isAdmin()) { if (bar) bar.style.display = 'none'; return; }
    if (bar) { bar.style.display = 'block'; return; }
    var anchor = document.getElementById('matrix-status');
    if (!anchor || !anchor.parentNode) return;
    bar = document.createElement('div');
    bar.id = 'mxr-bar';
    bar.style.cssText = 'margin:0 0 15px;';
    bar.innerHTML = '<button type="button" id="mxr-open" style="padding:8px 14px;border:1px solid #4361ee;border-radius:6px;background:#eef2ff;color:#1e2a78;cursor:pointer">🧩 Ma trận đề xuất từ Lịch báo giảng</button>';
    anchor.parentNode.insertBefore(bar, anchor);
    bar.querySelector('#mxr-open').addEventListener('click', open);
  }
  setInterval(ensureButton, 1500);
  ensureButton();

  root.MatrixReview = { open: open, __test: { taskTypeOf: taskTypeOf, expandLessons: expandLessons, calcStats: calcStats, state: S, buildPlan: buildPlan, select: select, render: render, approve: approve, statsHtml: statsHtml, gridHtml: gridHtml } };
})(typeof window !== 'undefined' ? window : globalThis);
