/* thu.js - Tab "Hop thu": hien thi thu lanh dao chua doc, lay tu Google Apps Script.
   Tu chen tab + noi dung vao trang KPI, khong can sua app.html. */
(function () {
  'use strict';
  var KEY = 'kpi_mail_cfg';
  var CHU_KY_PHUT = 5;
  var NGUONG_GIO = { 'Hiệu trưởng': 2, 'PHT': 4 };
  var emailHop = '';
  var lanTai = 0;

  (function themStyle() {
    var st = document.createElement('style');
    st.textContent = '.kpi-mail-body{white-space:pre-wrap;word-break:break-word;background:#f7f7f9;border-radius:6px;padding:10px 12px;margin:8px 0;font-size:14px;line-height:1.5;color:#333;max-height:260px;overflow:auto}' +
      '.kpi-mail-meta{font-size:12px;color:#777;margin-top:6px}' +
      '.kpi-mail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}';
    document.head.appendChild(st);
  })();

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function docCfg() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function ghiCfg(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

  function dinhDangGio(g) {
    if (g < 1) return Math.max(1, Math.round(g * 60)) + ' phút';
    if (g < 48) return g.toFixed(1) + ' giờ';
    return Math.round(g / 24) + ' ngày';
  }
  function nguongCua(ten) {
    return ten.indexOf('Hiệu trưởng') === 0 ? NGUONG_GIO['Hiệu trưởng'] : NGUONG_GIO['PHT'];
  }
  function trangThai(msg, loi) {
    var n = $('kpi-mail-status');
    if (!n) return;
    n.textContent = msg;
    n.className = 'kpi-drive-status ' + (loi ? 'disconnected' : 'connected');
  }
  function capNhatNhan(soThu) {
    var tab = document.querySelector('.kpi-tab[data-tab="kpi-mail"]');
    if (tab) tab.textContent = 'Hộp thư' + (soThu > 0 ? ' (' + soThu + ')' : '');
  }

  function themMuc(box, m, nguong) {
    var item = el('div', 'kpi-work-item');
    if (m.gio >= nguong) { item.style.borderColor = 'var(--kpi-danger-color)'; item.style.background = '#ffebee'; }
    var head = el('div', 'kpi-work-item-header');
    head.appendChild(el('div', 'kpi-work-item-title', m.tieuDe || '(không tiêu đề)'));
    head.appendChild(el('div', 'kpi-work-item-time', 'chưa đọc ' + dinhDangGio(m.gio)));
    item.appendChild(head);
    item.appendChild(el('div', 'kpi-mail-meta', 'Đang tải nội dung...')).setAttribute('data-meta', m.id);
    var nd = el('div', 'kpi-mail-body', '');
    nd.setAttribute('data-body', m.id);
    nd.style.display = 'none';
    item.appendChild(nd);
    var acts = el('div', 'kpi-mail-actions');
    var a = el('a', 'kpi-btn kpi-btn-sm', 'Mở thư');
    a.href = (emailHop && emailHop.indexOf('@') > 0)
      ? 'https://mail.google.com/a/' + emailHop.split('@')[1] + '/#all/' + encodeURIComponent(m.id)
      : 'https://mail.google.com/mail/u/0/#all/' + encodeURIComponent(m.id);
    a.target = '_blank';
    a.rel = 'noopener';
    acts.appendChild(a);
    var b = el('button', 'kpi-btn kpi-btn-sm', 'Đánh dấu đã đọc');
    b.addEventListener('click', function () { daDoc(m.id, b); });
    acts.appendChild(b);
    item.appendChild(acts);
    box.appendChild(item);
  }

  function duongDan(c, tham) {
    return c.url + (c.url.indexOf('?') > -1 ? '&' : '?') + 'token=' + encodeURIComponent(c.token) + tham;
  }

  function taiNoiDung(ids) {
    var c = docCfg();
    if (!ids.length || !c.url || !c.token) return;
    var lan = ++lanTai;
    fetch(duongDan(c, '&action=noiDung&ids=' + encodeURIComponent(ids.join(','))), { redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (lan !== lanTai) return;
        if (d.loi) throw new Error(d.loi);
        if (!d.noiDung) throw new Error('Script chưa có chức năng xem nội dung (cần tạo Phiên bản mới)');
        ids.forEach(function (id) {
          var meta = document.querySelector('[data-meta="' + id + '"]');
          var body = document.querySelector('[data-body="' + id + '"]');
          var t = d.noiDung[id];
          if (!meta || !body) return;
          if (!t) { meta.textContent = '(Không đọc được nội dung thư này)'; return; }
          meta.textContent = 'Từ: ' + t.tu + ' - ' + t.ngay + (t.dinhKem && t.dinhKem.length ? ' - Đính kèm: ' + t.dinhKem.join(', ') : '');
          body.textContent = t.nd || '(Thư không có nội dung chữ)';
          body.style.display = '';
        });
      })
      .catch(function (e) {
        document.querySelectorAll('[data-meta]').forEach(function (n) { n.textContent = 'Không tải được nội dung: ' + e.message; });
      });
  }

  function daDoc(id, nut) {
    var c = docCfg();
    nut.disabled = true;
    nut.textContent = 'Đang xử lý...';
    fetch(duongDan(c, '&action=daDoc&id=' + encodeURIComponent(id)), { redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (d.loi) throw new Error(d.loi);
        if (!d.ok) throw new Error('Script chưa có chức năng đánh dấu đã đọc (cần tạo Phiên bản mới)');
        tai();
      })
      .catch(function (e) { nut.disabled = false; nut.textContent = 'Đánh dấu đã đọc'; trangThai('Lỗi: ' + e.message, true); });
  }

  function ve(d) {
    var box = $('kpi-mail-list');
    box.textContent = '';
    var ld = d.lanhDao || [];
    var nhom = {};
    ld.forEach(function (m) { (nhom[m.ld] = nhom[m.ld] || []).push(m); });
    var ten = Object.keys(nhom);
    if (!ten.length) box.appendChild(el('div', 'kpi-empty-tab', 'Không có thư lãnh đạo nào chưa đọc.'));
    ten.forEach(function (t) {
      var h = el('h3', null, t + ' - ' + nhom[t].length + ' thư chưa đọc');
      h.style.margin = '15px 0 8px';
      box.appendChild(h);
      nhom[t].forEach(function (m) { themMuc(box, m, nguongCua(t)); });
    });
    var khac = d.khac || [];
    if (khac.length) {
      var h2 = el('h3', null, 'Thư khác chưa đọc (3 ngày) - ' + khac.length);
      h2.style.margin = '25px 0 8px';
      box.appendChild(h2);
      khac.forEach(function (k) {
        var it = el('div', 'kpi-work-item');
        it.appendChild(el('div', 'kpi-work-item-title', k.tieuDe || '(không tiêu đề)'));
        it.appendChild(el('div', 'kpi-work-item-meta', k.tu || ''));
        box.appendChild(it);
      });
    }
    capNhatNhan(ld.length);
    taiNoiDung(ld.slice(0, 10).map(function (m) { return m.id; }));
  }

  function tai() {
    var c = docCfg();
    if (!c.url || !c.token) { trangThai('Chưa cấu hình URL và mã bảo vệ.', true); return; }
    trangThai('Đang tải...', false);
    var u = c.url + (c.url.indexOf('?') > -1 ? '&' : '?') + 'token=' + encodeURIComponent(c.token);
    fetch(u, { redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (d.loi) throw new Error(d.loi);
        emailHop = d.me || emailHop;
        ve(d);
        trangThai('Cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN') + (emailHop ? ' - hộp thư ' + emailHop : ''), false);
      })
      .catch(function (e) { trangThai('Lỗi: ' + e.message, true); });
  }

  function dungGiaoDien() {
    var tabs = document.querySelector('.kpi-tabs');
    var cuoi = document.querySelectorAll('.kpi-tab-content');
    if (!tabs || !cuoi.length || $('kpi-mail')) return false;

    var tab = el('div', 'kpi-tab', 'Hộp thư');
    tab.setAttribute('data-tab', 'kpi-mail');
    tab.addEventListener('click', function () {
      document.querySelectorAll('.kpi-tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.kpi-tab-content').forEach(function (x) { x.classList.remove('active'); });
      tab.classList.add('active');
      $('kpi-mail').classList.add('active');
      tai();
    });
    tabs.appendChild(tab);

    var nd = el('div', 'kpi-tab-content');
    nd.id = 'kpi-mail';
    var card = el('div', 'kpi-card');
    card.appendChild(el('h2', null, 'Hộp thư công tác - thư lãnh đạo chưa đọc'));
    card.appendChild(el('p', null, 'Dữ liệu lấy từ Google Apps Script của hộp thư công tác, tự làm mới mỗi ' + CHU_KY_PHUT + ' phút.'));

    var f1 = el('div', 'kpi-form-group');
    f1.appendChild(el('label', null, 'URL Web app Apps Script:'));
    var inUrl = el('input'); inUrl.type = 'text'; inUrl.id = 'kpi-mail-url'; inUrl.placeholder = 'https://script.google.com/macros/s/.../exec';
    f1.appendChild(inUrl);
    var f2 = el('div', 'kpi-form-group');
    f2.appendChild(el('label', null, 'Mã bảo vệ (token):'));
    var inTok = el('input'); inTok.type = 'password'; inTok.id = 'kpi-mail-token'; inTok.placeholder = 'Dán mã do hàm datToken() tạo';
    f2.appendChild(inTok);
    card.appendChild(f1);
    card.appendChild(f2);

    var btn = el('button', 'kpi-btn', 'Lưu và tải thư');
    btn.addEventListener('click', function () {
      ghiCfg({ url: inUrl.value.trim(), token: inTok.value.trim() });
      tai();
    });
    card.appendChild(btn);

    var st = el('div', 'kpi-drive-status disconnected', 'Chưa tải.');
    st.id = 'kpi-mail-status';
    st.style.marginTop = '15px';
    card.appendChild(st);
    var ds = el('div'); ds.id = 'kpi-mail-list';
    card.appendChild(ds);
    nd.appendChild(card);
    cuoi[cuoi.length - 1].parentNode.insertBefore(nd, cuoi[cuoi.length - 1].nextSibling);

    var c = docCfg();
    inUrl.value = c.url || '';
    inTok.value = c.token || '';
    return true;
  }

  if (dungGiaoDien()) {
    tai();
    setInterval(tai, CHU_KY_PHUT * 60 * 1000);
  }
})();
