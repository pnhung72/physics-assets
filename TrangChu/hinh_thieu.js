/* =====================================================================
   hinh_thieu.js — Bảng "Hình thiếu" cho TestOline (chạy sau khối BankLint)
   Nhúng 1 dòng ở cuối trang, ngay TRƯỚC reward.js:
     <script src="https://cdn.jsdelivr.net/gh/pnhung72/physics-assets@main/hinh_thieu.js"></script>
   Chức năng (chỉ hiện với admin full):
     1. Quét ngân hàng: câu có ảnh giữ chỗ (src rỗng / transparent.gif) hoặc đề nhắc "hình..." mà không có hình.
     2. AI (Gemini) vẽ lại hình dạng SVG để xem trước; bấm "Vẽ lại" nếu chưa ưng.
     3. Tải hình về máy (PNG / SVG) để tự đưa lên Blogger lấy link.
     4. Dán link hình thật -> "Áp dụng": ghi thẳng vào ngân hàng (qua BankLint.commit, như các bản vá khác).
        Hoặc "Nhúng luôn hình AI" nếu chưa có link (hình PNG nhỏ nằm trong nội dung câu).
   ===================================================================== */
(function () {
  'use strict';
  if (window.HinhThieu) return;

  var FALLBACK_API = 'https://script.google.com/macros/s/AKfycbxdocxDem4OwqhrsGsiEX1WqJzzulLR36vjE5J0zB_D81tByFvS0GytzszQeaMGi5I0VQ/exec';
  var PAGE_SIZE = 12;
  var LS_DRAFT = 'ht_drafts_v1';          // nháp: hình AI đã vẽ + link đang gõ (mất khi xóa dữ liệu trình duyệt, không ảnh hưởng ngân hàng)
  var EMBED_MAX = 180000;                 // giới hạn độ dài ảnh nhúng (ký tự data URL)

  var RAW = null;                          // { map:{id:question}, dups, errors }
  var ST = { items: [], lab: 'all', q: '', page: 1, loading: false };
  var BUSY = {};
  var DRAFT = (function () { try { return JSON.parse(localStorage.getItem(LS_DRAFT) || '{}'); } catch (e) { return {}; } })();
  function saveDraft() { try { localStorage.setItem(LS_DRAFT, JSON.stringify(DRAFT)); } catch (e) {} }

  /* ---------- tiện ích ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
  function toast(m, t) { try { if (typeof showNotification === 'function') return showNotification(m, t || 'info'); } catch (e) {} alert(m); }
  function isAdmin() { try { return isAdminAuthenticated === true && adminRole === 'full'; } catch (e) { return false; } }
  function readUrl() { try { if (typeof QUESTIONS_API_URL !== 'undefined' && QUESTIONS_API_URL) return QUESTIONS_API_URL; } catch (e) {} return FALLBACK_API; }
  function getPath(o, p) { for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; } return o; }
  function setPath(o, p, v) { for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) return false; o = o[p[i]]; } o[p[p.length - 1]] = v; return true; }
  function plain(h) { return String(h == null ? '' : h).replace(/<img[^>]*>/gi, ' [HÌNH] ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

  /* ---------- đọc ngân hàng (giống BankLint: bản thô từ API) ---------- */
  function buildRaw(j) {
    var labels = j.labels || j.data || {}, map = {}, dups = [];
    Object.keys(labels).forEach(function (label) {
      var sets = labels[label] || {};
      [sets.quizData, sets.extraPracticeData].forEach(function (part) {
        Object.keys(part || {}).forEach(function (id) {
          var q = part[id]; if (!(q && typeof q === 'object')) return;
          q.ID = id; q._srcPost = label;
          if (map[id]) { dups.push({ id: id, kept: map[id]._srcPost, skipped: label }); return; }
          map[id] = q;
        });
      });
    });
    return { map: map, dups: dups, errors: j.errors || [] };
  }
  function loadRaw() {
    return fetch(readUrl() + '?all=1&_=' + Date.now(), { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && (j.error || j.message)) || 'API trả về lỗi');
        RAW = buildRaw(j);
        if (window.BankLint && BankLint._setRaw) BankLint._setRaw(RAW.map, RAW.dups, RAW.errors);
        return RAW;
      });
  }

  /* ---------- phát hiện vị trí thiếu hình ---------- */
  var IMG_RE = /<img\b[^>]*>/gi;
  function srcOf(tag) { var m = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i); return m ? String(m[1] || m[2] || m[3] || '').trim() : ''; }
  function isPh(tag) { var s = srcOf(tag); return !s || /transparent\.gif/i.test(s) || /^about:blank$/i.test(s); }
  function lazyOf(tag) {   // đường dẫn thật đôi khi còn nằm ở data-src / data-original
    var m = tag.match(/\sdata-(?:src|original|lazy-src)\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    var u = m ? (m[1] || m[2]) : ''; return /^https?:\/\//i.test(u) ? u : '';
  }
  function fields(q) {
    var o = [];
    if (typeof q.mainQuestion === 'string') o.push({ p: ['mainQuestion'], t: q.mainQuestion, n: 'Đề bài' });
    else if (typeof q.question === 'string') o.push({ p: ['question'], t: q.question, n: 'Đề bài' });
    if (Array.isArray(q.choices)) q.choices.forEach(function (c, i) { if (c && typeof c.choice === 'string') o.push({ p: ['choices', i, 'choice'], t: c.choice, n: 'Phương án ' + 'ABCD'.charAt(i) }); });
    if (Array.isArray(q.subQuestions)) q.subQuestions.forEach(function (s, i) { if (s && typeof s.question === 'string') o.push({ p: ['subQuestions', i, 'question'], t: s.question, n: 'Ý ' + (i + 1) }); });
    if (typeof q.explanation === 'string') o.push({ p: ['explanation'], t: q.explanation, n: 'Lời giải' });
    return o;
  }
  function findSlots(q) {
    var slots = [], hasReal = !!(q.imageUrl && String(q.imageUrl).trim()), all = '';
    fields(q).forEach(function (f) {
      all += ' ' + f.t; var n = -1;
      f.t.replace(IMG_RE, function (tag) {
        n++;
        if (isPh(tag)) slots.push({ key: f.p.join('.') + '#' + n, path: f.p, field: f.n, idx: n, hint: lazyOf(tag) });
        else hasReal = true;
        return tag;
      });
    });
    if (!slots.length && !hasReal) {
      var refFig = /(?:hình\s*(?:bên|vẽ|sau|dưới|\d)|đồ thị\s*(?:bên|sau|hình|như hình)|sơ đồ\s*(?:bên|sau)|biểu đồ\s*(?:bên|sau))/i.test(plain(all));
      var f0 = fields(q)[0];
      if (refFig && f0) slots.push({ key: f0.p.join('.') + '#new', path: f0.p, field: f0.n + ' (thêm hình mới)', idx: -1, append: true, hint: '' });
    }
    return slots;
  }
  function scan() {
    var items = [];
    Object.keys(RAW.map).forEach(function (id) {
      var q = RAW.map[id]; if (!q || typeof q !== 'object') return;
      var s = findSlots(q); if (s.length) items.push({ qid: id, label: q._srcPost || '', q: q, slots: s });
    });
    ST.items = items;
  }

  /* ---------- thay hình trong nội dung ---------- */
  function okUrl(u) { return /^https:\/\/[^\s"'<>]+$/i.test(u) || /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(u); }
  function setSrc(tag, u) {
    var t = /\ssrc\s*=/i.test(tag)
      ? tag.replace(/(\s)src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, function (m, sp) { return sp + 'src="' + u + '"'; })
      : tag.replace(/<img/i, function () { return '<img src="' + u + '"'; });
    t = t.replace(/\s(?:data-src|data-original|data-lazy-src|srcset)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    if (!/\sstyle\s*=/i.test(t)) t = t.replace(/<img/i, '<img style="max-width:100%;height:auto;margin:8px 0"');
    return t;
  }
  function replaceNth(text, idx, u) {
    var n = -1;
    return text.replace(IMG_RE, function (tag) { n++; return n === idx ? setSrc(tag, u) : tag; });
  }
  function newText(text, slot, u) {
    return slot.append ? text + '<br><img src="' + u + '" style="max-width:100%;height:auto;margin:8px 0">' : replaceNth(text, slot.idx, u);
  }

  /* ---------- ghi vào ngân hàng ---------- */
  function failText(r) { var f = (r && r.server && r.server.failed) || []; return f.length ? f.slice(0, 2).map(function (x) { return x.id + ': ' + x.reason; }).join('; ') : 'Máy chủ không ghi được (kiểm tra đăng nhập admin)'; }
  function patchLive(qid, slot, u) {   // cập nhật bản đang chạy trong trang để xuất đề dùng ngay hình mới
    try {
      var aq = window.allQuestions && window.allQuestions[qid]; if (!aq) return;
      var t = getPath(aq, slot.path);
      if (typeof t !== 'string') return;
      if (slot.append) setPath(aq, slot.path, newText(t, slot, u));
      else if ((t.match(IMG_RE) || []).length > slot.idx) setPath(aq, slot.path, replaceNth(t, slot.idx, u));
    } catch (e) {}
  }
  function commitSlot(it, slot, url) {
    url = String(url || '').trim();
    if (!okUrl(url)) return Promise.reject(new Error('Link phải bắt đầu bằng https:// (ví dụ link ảnh Blogger)'));
    if (!(window.BankLint && BankLint.commit)) return Promise.reject(new Error('Chưa có BankLint — chức năng này cần khối "Rà soát ngân hàng" của trang'));
    var f = fields(it.q).filter(function (x) { return x.p.join('.') === slot.path.join('.'); })[0];
    if (!f) return Promise.reject(new Error('Không tìm thấy vị trí cần thay'));
    var to = newText(f.t, slot, url);
    if (to === f.t) return Promise.reject(new Error('Không thay được nội dung'));
    return BankLint.commit([{ qid: it.qid, label: it.q._srcPost || '', ops: [{ path: slot.path, from: f.t, to: to }] }])
      .then(function (r) {
        if (!r || !r.mem) throw new Error(failText(r));
        setPath(it.q, slot.path, to); patchLive(it.qid, slot, url);
        delete DRAFT[it.qid + '|' + slot.key]; saveDraft();
        scan();
      });
  }

  /* ---------- AI vẽ hình (Gemini, dùng chung khóa API của trang) ---------- */
  function getKey() {
    var k = ''; try { k = sessionStorage.getItem('exam_gemini_key') || localStorage.getItem('exam_gemini_key_admin_saved') || ''; } catch (e) {}
    if (!k) { k = (window.prompt('Dán API key Gemini để AI vẽ hình (để trống = hủy)') || '').trim(); if (k) try { sessionStorage.setItem('exam_gemini_key', k); } catch (e) {} }
    return k;
  }
  function modelName() { try { if (typeof AI_GEMINI_MODEL !== 'undefined' && AI_GEMINI_MODEL) return AI_GEMINI_MODEL; } catch (e) {} return 'gemini-2.5-flash'; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function geminiJson(prompt) {
    var key = getKey(); if (!key) throw new Error('Chưa có API key Gemini');
    var waits = [4000, 10000, 20000];
    for (var n = 0; ; n++) {
      var res;
      try {
        res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelName()) + ':generateContent', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } })
        });
      } catch (e) { throw new Error('Không kết nối được tới Gemini'); }
      var data = null; try { data = await res.json(); } catch (e) {}
      if (res.ok) {
        var parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
        var text = parts ? parts.map(function (p) { return p.text || ''; }).join('') : '';
        var m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        try { return JSON.parse(m ? m[1] : text); } catch (e) { throw new Error('Không đọc được JSON từ Gemini'); }
      }
      var msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      if ([429, 500, 502, 503, 504].indexOf(res.status) !== -1 && n < waits.length) { await sleep(waits[n]); continue; }
      if (/API key/i.test(msg)) try { sessionStorage.removeItem('exam_gemini_key'); } catch (e) {}
      throw new Error('Gemini: ' + msg);
    }
  }
  function cleanSvg(s) {
    if (typeof s !== 'string') return '';
    var m = s.match(/<svg[\s\S]*<\/svg>/i); if (!m) return '';
    s = m[0].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '');
    if (!/xmlns\s*=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    return /viewBox\s*=\s*"[^"]+"/i.test(s) ? s : '';
  }
  function promptFor(q, slot) {
    var o = { lop: q.grade || '', de: plain(q.mainQuestion != null ? q.mainQuestion : q.question).slice(0, 1200), vi_tri_hinh: slot.field };
    if (Array.isArray(q.choices)) o.lua_chon = q.choices.map(function (c) { return plain(c.choice || c.text).slice(0, 300); });
    if (Array.isArray(q.subQuestions)) o.cac_y = q.subQuestions.map(function (s) { return plain(s.question).slice(0, 300); });
    return 'Bạn là giáo viên Vật lí THPT (chương trình GDPT 2018). Câu hỏi sau bị mất hình minh họa (chỗ có chữ [HÌNH]). Hãy VẼ LẠI hình đó.\n' +
      'Quy tắc:\n- Chỉ vẽ phần hình mà đề mô tả hoặc tham chiếu, đúng các số liệu có trong đề; không tự thêm số liệu.\n' +
      '- KHÔNG vẽ hoặc ghi đáp án, kết quả cần tìm, không đánh dấu phương án đúng.\n' +
      '- Xuất đúng MỘT thẻ <svg> hoàn chỉnh, viewBox="0 0 600 380", nền trong suốt, nét đen (#000) dày 2, chữ Arial cỡ 18 viết tiếng Việt/ký hiệu vật lí (không dùng LaTeX), mũi tên dùng <marker> hoặc <polygon>. Đồ thị phải có trục, vạch chia và nhãn đơn vị.\n' +
      '- Không dùng ảnh ngoài, script, font ngoài.\n' +
      '- Nếu hình cần ảnh chụp thật hoặc đề không đủ dữ kiện để vẽ đúng, trả "svg" rỗng và giải thích trong "ly_do".\n' +
      'Chỉ trả JSON: {"svg":"<svg ...>...</svg>","mo_ta":"mô tả ngắn hình đã vẽ","ly_do":""}\n\nCÂU HỎI:\n' + JSON.stringify(o);
  }
  function svgUri(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function svgToPng(svg, width) {
    return new Promise(function (resolve, reject) {
      var vb = (svg.match(/viewBox\s*=\s*"([^"]+)"/i) || [])[1], p = (vb || '').trim().split(/[\s,]+/).map(Number);
      if (p.length !== 4 || !(p[2] > 0) || !(p[3] > 0)) return reject(new Error('SVG thiếu viewBox hợp lệ'));
      var W = width || 1200, H = Math.round(W * p[3] / p[2]);
      var sized = svg.replace(/<svg\b([^>]*)>/i, function (m, a) { return '<svg' + a.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '') + ' width="' + W + '" height="' + H + '">'; });
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
        try { var url = c.toDataURL('image/png'); c.toBlob(function (b) { resolve({ blob: b, dataUrl: url }); }, 'image/png'); } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('Không dựng được ảnh từ SVG (SVG có thể sai cú pháp) — bấm "Vẽ lại"')); };
      img.src = svgUri(sized);
    });
  }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

  /* ---------- giao diện ---------- */
  function css() {
    if (document.getElementById('ht-style')) return;
    var s = document.createElement('style'); s.id = 'ht-style';
    s.textContent = '#ht-launch{position:fixed;left:14px;bottom:58px;z-index:99990;background:#6f42c1;color:#fff;border:0;border-radius:24px;padding:10px 16px;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}' +
      '#ht-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99992;display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:20px 10px}' +
      '#ht-box{background:#fff;color:#222;border-radius:10px;width:min(980px,100%);padding:16px;font-size:14px}#ht-box h3{margin:0 0 6px}' +
      '.ht-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.ht-bar select,.ht-bar input{padding:5px 8px;border:1px solid #bbb;border-radius:6px}' +
      '.ht-btn{border:0;border-radius:6px;padding:6px 11px;cursor:pointer;font-size:13px;background:#e9ecef}.ht-btn.p{background:#198754;color:#fff}.ht-btn.b{background:#0d6efd;color:#fff}.ht-btn.v{background:#6f42c1;color:#fff}.ht-btn[disabled]{opacity:.45;cursor:not-allowed}' +
      '.ht-q{border:1px solid #ddd;border-radius:8px;padding:10px;margin:10px 0;background:#fafafa}.ht-id{background:#212529;color:#fff;border-radius:4px;padding:1px 7px;font-size:12px;margin-right:6px}' +
      '.ht-st{color:#555;font-size:13px;margin:4px 0}.ht-slot{border-top:1px dashed #ccc;padding:8px 0}.ht-prev{background:#fff;border:1px solid #ddd;border-radius:6px;padding:6px;margin:6px 0;display:inline-block;max-width:100%}.ht-prev img{max-width:100%;max-height:300px;display:block}' +
      '.ht-link{width:min(520px,100%);padding:5px 8px;border:1px solid #bbb;border-radius:6px}.ht-note{background:#fff8e1;border:1px solid #ffe08a;border-radius:6px;padding:6px 8px;font-size:13px;margin:6px 0}';
    document.head.appendChild(s);
  }
  function modal() {
    var m = document.getElementById('ht-modal'); if (m) return m;
    css(); m = document.createElement('div'); m.id = 'ht-modal'; m.setAttribute('data-html2canvas-ignore', 'true');
    m.innerHTML = '<div id="ht-box"></div>'; document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) m.style.display = 'none'; var b = e.target.closest && e.target.closest('[data-act]'); if (b) act(b); });
    m.addEventListener('input', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('ht-link')) { var k = t.getAttribute('data-k'); DRAFT[k] = DRAFT[k] || {}; DRAFT[k].link = t.value; saveDraft(); }
      else if (t.id === 'ht-search') { ST.q = t.value.toLowerCase(); ST.page = 1; clearTimeout(modal._t); modal._t = setTimeout(function () { render(); var s = document.getElementById('ht-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 250); }
    });
    m.addEventListener('change', function (e) { if (e.target.id === 'ht-lab') { ST.lab = e.target.value; ST.page = 1; render(); } });
    return m;
  }
  function visible() {
    return ST.items.filter(function (it) {
      if (ST.lab !== 'all' && it.label !== ST.lab) return false;
      return !ST.q || (it.qid + ' ' + it.label + ' ' + plain(it.q.mainQuestion || it.q.question)).toLowerCase().indexOf(ST.q) !== -1;
    });
  }
  function render() {
    var box = document.getElementById('ht-box'); if (!box) return;
    if (ST.loading) { box.innerHTML = '<h3>🖼️ Hình thiếu</h3><p>Đang tải ngân hàng câu hỏi…</p>'; return; }
    var vis = visible(), pages = Math.max(1, Math.ceil(vis.length / PAGE_SIZE)); if (ST.page > pages) ST.page = pages;
    var labs = {}; ST.items.forEach(function (it) { labs[it.label] = 1; });
    var slotsN = ST.items.reduce(function (a, it) { return a + it.slots.length; }, 0);
    var h = '<h3>🖼️ Hình thiếu — ' + ST.items.length + ' câu, ' + slotsN + ' vị trí</h3>' +
      '<div class="ht-note">Hình AI vẽ chỉ để minh họa: <b>thầy cô cần xem lại đúng/sai về vật lí</b> trước khi dùng. Hình đơn giản (vectơ, quãng đường, mạch cơ bản, đồ thị đường thẳng) thường ổn; hình phức tạp dễ sai. Link dán vào sẽ được <b>ghi thẳng vào ngân hàng</b>.</div>' +
      '<div class="ht-bar"><select id="ht-lab"><option value="all">Tất cả bài</option>' +
      Object.keys(labs).sort().map(function (l) { return '<option value="' + esc(l) + '"' + (ST.lab === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>' +
      '<input id="ht-search" placeholder="Tìm mã câu / nội dung" value="' + esc(ST.q) + '">' +
      '<button class="ht-btn" data-act="reload">↻ Tải lại ngân hàng</button><button class="ht-btn" data-act="csv">⬇ Xuất danh sách (CSV)</button><button class="ht-btn" data-act="close">✖ Đóng</button></div>';
    vis.slice((ST.page - 1) * PAGE_SIZE, ST.page * PAGE_SIZE).forEach(function (it) {
      h += '<div class="ht-q"><div><span class="ht-id">' + esc(it.qid) + '</span><span style="color:#6c757d;font-size:12px">' + esc(it.label) + '</span></div>' +
        '<div class="ht-st">' + esc(clip(plain(it.q.mainQuestion || it.q.question), 320)) + '</div>';
      it.slots.forEach(function (s) {
        var k = it.qid + '|' + s.key, d = DRAFT[k] || {}, a = 'data-q="' + esc(it.qid) + '" data-s="' + esc(s.key) + '"', busy = BUSY[k] ? ' disabled' : '';
        h += '<div class="ht-slot"><b>' + esc(s.field) + (s.append ? '' : ' · hình #' + (s.idx + 1)) + '</b> ' +
          '<button class="ht-btn v" data-act="draw" ' + a + busy + '>' + (BUSY[k] ? '⏳ Đang vẽ…' : (d.svg ? '🔁 Vẽ lại' : '✨ AI vẽ lại')) + '</button>' +
          (s.hint ? ' <button class="ht-btn" data-act="hint" ' + a + ' data-u="' + esc(s.hint) + '">Dùng link có sẵn (data-src)</button>' : '');
        if (d.svg) {
          h += '<div class="ht-prev"><img alt="hình AI vẽ" src="' + svgUri(d.svg) + '"></div>' + (d.note ? '<div class="ht-st">' + esc(d.note) + '</div>' : '') +
            '<div><button class="ht-btn b" data-act="png" ' + a + '>⬇ Tải PNG</button> <button class="ht-btn" data-act="svg" ' + a + '>⬇ Tải SVG</button> <button class="ht-btn p" data-act="embed" ' + a + '>💾 Nhúng luôn hình AI vào câu</button></div>';
        } else if (d.err) h += '<div class="ht-st" style="color:#b02a37">' + esc(d.err) + '</div>';
        h += '<div style="margin-top:6px"><input class="ht-link" data-k="' + esc(k) + '" placeholder="Dán link hình thật (https://…)" value="' + esc(d.link || '') + '"> <button class="ht-btn p" data-act="apply" ' + a + '>✔ Áp dụng link</button></div></div>';
      });
      h += '</div>';
    });
    if (!vis.length) h += '<p>Không còn câu nào thiếu hình 🎉</p>';
    h += '<div class="ht-bar"><button class="ht-btn" data-act="prev"' + (ST.page <= 1 ? ' disabled' : '') + '>◀</button> Trang ' + ST.page + '/' + pages + ' <button class="ht-btn" data-act="next"' + (ST.page >= pages ? ' disabled' : '') + '>▶</button></div>';
    box.innerHTML = h;
  }
  function find(b) {
    var it = ST.items.filter(function (x) { return x.qid === b.getAttribute('data-q'); })[0]; if (!it) return {};
    var sl = it.slots.filter(function (s) { return s.key === b.getAttribute('data-s'); })[0];
    return { it: it, slot: sl, k: it.qid + '|' + (sl && sl.key) };
  }
  function keepScroll(fn) { var m = document.getElementById('ht-modal'), y = m ? m.scrollTop : 0; fn(); if (m) m.scrollTop = y; }
  function act(b) {
    var a = b.getAttribute('data-act'), x = (b.hasAttribute('data-q') ? find(b) : {});
    if (a === 'close') return (document.getElementById('ht-modal').style.display = 'none');
    if (a === 'prev') { ST.page--; return render(); }
    if (a === 'next') { ST.page++; return render(); }
    if (a === 'reload') return open(true);
    if (a === 'csv') return exportCsv();
    if (!x.it || !x.slot) return;
    var d = DRAFT[x.k] = DRAFT[x.k] || {};
    if (a === 'hint') { d.link = b.getAttribute('data-u'); saveDraft(); return keepScroll(render); }
    if (a === 'draw') {
      BUSY[x.k] = 1; d.err = ''; keepScroll(render);
      geminiJson(promptFor(x.it.q, x.slot)).then(function (j) {
        var svg = cleanSvg(j && j.svg);
        if (!svg) throw new Error((j && j.ly_do) || 'AI không vẽ được hình này — hãy lấy hình thật rồi dán link');
        d.svg = svg; d.note = (j.mo_ta || '') + (j.ly_do ? ' · ' + j.ly_do : ''); d.err = '';
      }).catch(function (e) { d.err = e.message; }).then(function () { delete BUSY[x.k]; saveDraft(); keepScroll(render); });
      return;
    }
    if (!d.svg && (a === 'png' || a === 'svg' || a === 'embed')) return;
    var base = 'hinh_' + x.it.qid.replace(/[^\w.-]/g, '_') + '_' + (x.slot.idx < 0 ? 'moi' : x.slot.idx + 1);
    if (a === 'svg') return download(new Blob([d.svg], { type: 'image/svg+xml' }), base + '.svg');
    if (a === 'png') return svgToPng(d.svg, 1200).then(function (r) { download(r.blob, base + '.png'); }).catch(function (e) { toast('❌ ' + e.message, 'error'); });
    if (a === 'embed') {
      return svgToPng(d.svg, 800).then(function (r) {
        if (r.dataUrl.length > EMBED_MAX) throw new Error('Hình quá nặng để nhúng (' + Math.round(r.dataUrl.length / 1000) + ' KB) — hãy tải PNG, đưa lên Blogger rồi dán link');
        return commitSlot(x.it, x.slot, r.dataUrl);
      }).then(function () { toast('✅ Đã nhúng hình vào câu ' + x.it.qid, 'success'); keepScroll(render); })
        .catch(function (e) { toast('❌ ' + e.message, 'error'); });
    }
    if (a === 'apply') {
      return commitSlot(x.it, x.slot, d.link).then(function () { toast('✅ Đã ghi link hình vào câu ' + x.it.qid, 'success'); keepScroll(render); })
        .catch(function (e) { toast('❌ ' + e.message, 'error'); });
    }
  }
  function exportCsv() {
    var rows = [['ma_cau', 'bai', 'vi_tri', 'link_hinh_that']];
    ST.items.forEach(function (it) { it.slots.forEach(function (s) { rows.push([it.qid, it.label, s.field + (s.append ? '' : ' #' + (s.idx + 1)), (DRAFT[it.qid + '|' + s.key] || {}).link || '']); }); });
    var csv = '\ufeff' + rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'hinh_thieu_' + new Date().toISOString().slice(0, 10) + '.csv');
  }
  function open(force) {
    var m = modal(); m.style.display = 'flex';
    if (RAW && !force) { scan(); return render(); }
    ST.loading = true; render();
    loadRaw().then(function () { ST.loading = false; scan(); render(); })
      .catch(function (e) { ST.loading = false; document.getElementById('ht-box').innerHTML = '<h3>🖼️ Hình thiếu</h3><p style="color:#b02a37">Không tải được ngân hàng: ' + esc(e.message) + '</p><button class="ht-btn" data-act="close">Đóng</button>'; });
  }
  function ensureLauncher() {
    var b = document.getElementById('ht-launch');
    if (isAdmin()) {
      if (!b) { css(); b = document.createElement('button'); b.id = 'ht-launch'; b.type = 'button'; b.textContent = '🖼️ Hình thiếu'; b.setAttribute('data-html2canvas-ignore', 'true'); b.addEventListener('click', function () { open(false); }); document.body.appendChild(b); }
    } else if (b) b.remove();
  }
  setInterval(ensureLauncher, 1500); ensureLauncher();

  window.HinhThieu = { open: open, scan: findSlots, _t: { findSlots: findSlots, replaceNth: replaceNth, newText: newText, cleanSvg: cleanSvg, isPh: isPh, okUrl: okUrl } };
})();
