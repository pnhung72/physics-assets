/* thu.js - Tab "Hop thu": hien thi thu lanh dao chua doc, lay tu Google Apps Script.
   Tu chen tab + noi dung vao trang KPI, khong can sua app.html. */
(function () {
  'use strict';
  var KEY = 'kpi_mail_cfg';
  var CHU_KY_PHUT = 5;
  var NGUONG_GIO = { 'Hiệu trưởng': 2, 'PHT': 4 };
  var emailHop = '';

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
    var a = el('a', 'kpi-btn kpi-btn-sm', 'Mở thư');
    a.href = 'https://mail.google.com/mail/' + (emailHop ? '?authuser=' + encodeURIComponent(emailHop) : 'u/0/') + '#all/' + encodeURIComponent(m.id);
    a.target = '_blank';
    a.rel = 'noopener';
    item.appendChild(a);
    box.appendChild(item);
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
