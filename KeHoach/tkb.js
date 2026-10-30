/* tkb.js - Thoi khoa bieu tu dong cho trang KPI.
   Lay du lieu tu cung API Apps Script cua "Lich bao giang" (action=getTimetable),
   chon "Lan" TKB theo tuan giong het Lich bao giang, do vao bang kpi-timetable.
   Khong nhap tay: cac o chi doc, dong bo lai moi lan dang nhap va moi 30 phut. */
(function () {
  'use strict';
  var KEY_API = 'kpi_tkb_api';
  var CHU_KY_MS = 30 * 60 * 1000;
  var DAYKEYS = [
    ['monday', 'mon', 'Thứ 2', 'thứ 2', 't2'],
    ['tuesday', 'tue', 'Thứ 3', 'thứ 3', 't3'],
    ['wednesday', 'wed', 'Thứ 4', 'thứ 4', 't4'],
    ['thursday', 'thu', 'Thứ 5', 'thứ 5', 't5'],
    ['friday', 'fri', 'Thứ 6', 'thứ 6', 't6'],
    ['saturday', 'sat', 'Thứ 7', 'thứ 7', 't7']
  ];
  var st = { tkb: [], loadedAt: 0, loading: false, err: '' };

  function $(id) { return document.getElementById(id); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }

  // ---- giong het Lich bao giang ----
  function pDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'number') {
      var dn = v > 1e11 ? new Date(v) : new Date(1899, 11, 30 + Math.floor(v));
      return isNaN(dn) ? null : new Date(dn.getFullYear(), dn.getMonth(), dn.getDate());
    }
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return new Date(+m[3], +m[2] - 1, +m[1]);
    var d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function pick(it, names) {
    for (var i = 0; i < names.length; i++) {
      var v = it[names[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }
  function selectTKB(tkb, monday) {
    var groups = {}, noDate = [];
    tkb.forEach(function (it) {
      var s = pDate(pick(it, ['startDate', 'Ngày bắt đầu'])), e = pDate(pick(it, ['endDate', 'Ngày kết thúc']));
      if (!s || !e) { noDate.push(it); return; }
      var k = key(s) + '|' + key(e);
      (groups[k] = groups[k] || { s: s, e: e, items: [] }).items.push(it);
    });
    var arr = Object.keys(groups).map(function (k) { return groups[k]; });
    if (!arr.length) return { items: noDate, from: null };
    var inside = arr.filter(function (g) { return monday >= g.s && monday <= g.e; })
      .sort(function (a, b) { return b.s - a.s; })[0];
    if (!inside) {
      var valid = arr.filter(function (g) { return g.s <= monday; }).sort(function (a, b) { return b.s - a.s; });
      inside = valid.length ? valid[0] : arr.sort(function (a, b) { return a.s - b.s; })[0];
    }
    return { items: inside.items, from: inside.s };
  }

  // ---- chuan hoa ten lop / mon / khoi ----
  var RE_LOP = /(\d{2}\s*[A-Za-zĐđ]\s*\d*)/;
  function codeOf(cn) { var m = String(cn).match(RE_LOP); return m ? m[1].replace(/\s+/g, '') : String(cn).trim(); }
  function gradeOf(cn) { var m = String(cn).match(/(?:^|[^0-9])(10|11|12)\s*[A-Za-zĐđ]/); return m ? m[1] : ''; }
  function subjectOf(cn) {
    var s = String(cn).replace(RE_LOP, '').replace(/[-–_:()\s]+$/g, '').replace(/^[-–_:()\s]+/g, '').trim();
    return s || 'Lý';
  }

  // Tra ve luoi: { 'ngay': { 'tiet': 'Ly-10A12' } }, ngay 2..7 (2 = Thu 2), tiet 1..10 (6..10 = chieu)
  function buildGrid(items) {
    var grid = {}, used = {};
    for (var dow = 0; dow < 6; dow++) {
      items.forEach(function (it) {
        var cn = String(pick(it, DAYKEYS[dow])).trim();
        if (!cn) return;
        var period = parseInt(pick(it, ['period', 'Tiết']), 10);
        if (isNaN(period) || period < 1) return;
        var grade = gradeOf(cn), session = String(pick(it, ['session', 'Buổi']) || 'Sáng');
        if (grade === '11' || grade === '12') session = 'Chiều';
        else if (grade === '10') session = 'Sáng';
        var chieu = session.toLowerCase().indexOf('chiều') > -1;
        var lesson = period > 5 ? period : (chieu ? period + 5 : period);
        if (lesson > 10) return;
        var uk = dow + '|' + lesson + '|' + cn;
        if (used[uk]) return; used[uk] = 1;
        var day = dow + 2;
        (grid[day] = grid[day] || {})[lesson] = subjectOf(cn) + '-' + codeOf(cn);
      });
    }
    return grid;
  }

  function tuanHienThi() {
    var t = new Date();
    if (t.getDay() === 0) t.setDate(t.getDate() + 1); // Chu nhat -> hien tuan sau
    return mondayOf(t);
  }

  // ---- do vao giao dien ----
  function trangThai(msg, loi) {
    var n = $('kpi-tkb-status');
    if (!n) return;
    n.textContent = msg;
    n.style.color = loi ? 'var(--kpi-danger-color)' : 'var(--kpi-gray-color)';
  }
  function appDangHienThi() {
    var a = $('kpi-app');
    return !!a && a.style.display !== 'none' && a.style.display !== '' && typeof kpiData !== 'undefined' && !!kpiData.user;
  }
  function khoaO() {
    var cells = document.querySelectorAll('.kpi-editable-cell');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('data-tkb-lock')) continue;
      var c = cells[i].cloneNode(true);       // go bo trinh nghe nhap tay (prompt)
      c.setAttribute('data-tkb-lock', '1');
      c.style.cursor = 'default';
      cells[i].parentNode.replaceChild(c, cells[i]);
    }
  }
  function render() {
    if (!appDangHienThi() || !st.loadedAt) return;
    khoaO();
    var monday = tuanHienThi();
    var sel = selectTKB(st.tkb, monday);
    var grid = buildGrid(sel.items);
    var cells = document.querySelectorAll('.kpi-editable-cell');
    for (var i = 0; i < cells.length; i++) {
      var d = cells[i].getAttribute('data-day'), l = cells[i].getAttribute('data-lesson');
      cells[i].textContent = (grid[d] && grid[d][l]) || '';
    }
    kpiData.timetable = grid;
    var from = $('kpi-schedule-start-date');
    if (from && sel.from) from.textContent = p2(sel.from.getDate()) + '/' + p2(sel.from.getMonth() + 1) + '/' + sel.from.getFullYear();
    if (typeof updateTimetableSummary === 'function') updateTimetableSummary();
    if (typeof updateDailyProgress === 'function') updateDailyProgress();
    if (typeof saveData === 'function') saveData();
    var soTiet = 0;
    Object.keys(grid).forEach(function (dd) { soTiet += Object.keys(grid[dd]).length; });
    trangThai('Tự động lấy từ Lịch báo giảng, tuần ' + p2(monday.getDate()) + '/' + p2(monday.getMonth() + 1) +
      ' - ' + soTiet + ' tiết. Cập nhật ' + new Date(st.loadedAt).toLocaleTimeString('vi-VN'), false);
  }

  function docApi() { try { return localStorage.getItem(KEY_API) || ''; } catch (e) { return ''; } }
  function tai(force) {
    var api = docApi();
    if (!api) { trangThai('Chưa có địa chỉ API Lịch báo giảng. Dán vào ô bên dưới.', true); return; }
    if (st.loading) return;
    if (!force && st.loadedAt && Date.now() - st.loadedAt < 60000) { render(); return; }
    st.loading = true;
    trangThai('Đang tải thời khóa biểu...', false);
    fetch(api + (api.indexOf('?') > -1 ? '&' : '?') + 'action=getTimetable&t=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var arr = Array.isArray(j) ? j : (j && Array.isArray(j.timetable) ? j.timetable : null);
        if (!arr) throw new Error('phản hồi không có "timetable"');
        st.tkb = arr; st.loadedAt = Date.now(); st.loading = false; render();
      })
      .catch(function (e) { st.loading = false; trangThai('Lỗi tải TKB: ' + e.message, true); });
  }

  function dungGiaoDien() {
    var tbl = $('kpi-timetable-table');
    if (!tbl || $('kpi-tkb-status')) return false;
    var wrap = tbl.parentNode;               // div overflow-x
    var box = document.createElement('div');
    box.style.margin = '0 0 12px';
    var st1 = document.createElement('div');
    st1.id = 'kpi-tkb-status';
    st1.style.fontSize = '0.95em';
    box.appendChild(st1);
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap';
    var inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'kpi-tkb-api';
    inp.placeholder = 'https://script.google.com/macros/s/.../exec (API Lịch báo giảng)';
    inp.style.cssText = 'flex:1;min-width:260px;padding:8px 10px;border:2px solid #ddd;border-radius:6px';
    inp.value = docApi();
    var b = document.createElement('button');
    b.className = 'kpi-btn kpi-btn-sm';
    b.textContent = 'Lưu và tải lại TKB';
    b.addEventListener('click', function () {
      try { localStorage.setItem(KEY_API, inp.value.trim()); } catch (e) {}
      tai(true);
    });
    row.appendChild(inp); row.appendChild(b);
    box.appendChild(row);
    wrap.parentNode.insertBefore(box, wrap);
    // Nut "Dat lai" cu xoa du lieu nhap tay: thay bang tai lai tu nguon
    var rs = $('kpi-reset-timetable');
    if (rs) { var rs2 = rs.cloneNode(true); rs2.innerHTML = '<i class="fas fa-sync-alt"></i> Tải lại từ Lịch báo giảng'; rs.parentNode.replaceChild(rs2, rs); rs2.addEventListener('click', function () { tai(true); }); }
    var sv = $('kpi-save-timetable');
    if (sv && sv.parentNode) sv.parentNode.removeChild(sv);
    return true;
  }

  function khoiDong() {
    if (typeof document === 'undefined' || !$('kpi-app')) return;
    // Khong tao du lieu mau (thoi khoa bieu va cong viec mau) nua
    window.initializeSampleTimetable = function () { if (typeof kpiData !== 'undefined') kpiData.timetable = {}; };
    dungGiaoDien();
    var app = $('kpi-app');
    new MutationObserver(function () { if (appDangHienThi()) { setTimeout(function () { tai(false); }, 150); } })
      .observe(app, { attributes: true, attributeFilter: ['style'] });
    setInterval(function () { if (appDangHienThi()) tai(true); }, CHU_KY_MS);
    tai(false);
  }

  if (typeof window !== 'undefined') window.KPI_TKB = { buildGrid: buildGrid, selectTKB: selectTKB, gradeOf: gradeOf, codeOf: codeOf, subjectOf: subjectOf, pDate: pDate, mondayOf: mondayOf };
  try { khoiDong(); } catch (e) { if (typeof console !== 'undefined') console.error('tkb.js', e); }
})();