/*! exam_qa_gate.js  (v1.0)
 *  Cổng chất lượng cho "Tải Gói Đề": chính xác khoa học, chính tả, định dạng, tương đương giữa các mã đề.
 *
 *  Nhúng 1 dòng ở cuối trang TestOline (đã có sẵn trong TestOline62/63):
 *    <script src="https://cdn.jsdelivr.net/gh/pnhung72/physics-assets@main/exam_qa_gate.js"></script>
 *
 *  Hai hàm trang chính đã gọi:
 *   1) await ExamQA.prepareOriginals(originals, { exportConfig })
 *        Tự sửa CHẮC CHẮN về chính tả/định dạng trên đề gốc (khoảng trắng thừa, dấu cách trước dấu câu,
 *        thiếu cách sau dấu phẩy...). Không đụng công thức ($...$), thẻ HTML, đáp án, số liệu.
 *   2) const ok = await ExamQA.gate(examPackages, { exportConfig, examName, aiVerify, ai, notify })
 *        Kiểm tra toàn bộ gói đề. Có LỖI -> hiện báo cáo, người dùng chọn "Quay lại sửa" (false) hoặc "Vẫn xuất" (true).
 *        Chỉ có CẢNH BÁO -> báo ngắn rồi cho xuất (true).
 *        aiVerify=true: nhờ AI tự giải lại từng câu (qua ai.aiVerifyVariant) để đối chiếu đáp án đã lưu.
 *
 *  Chỉ ĐỌC dữ liệu khi kiểm tra; chỉ prepareOriginals mới sửa chữ (idempotent, chạy lại không đổi thêm).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExamQA = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var PARTS = ['I', 'II', 'III', 'IV'];
  var PART_LABEL = { I: 'Phần I (nhiều lựa chọn)', II: 'Phần II (đúng/sai)', III: 'Phần III (trả lời ngắn)', IV: 'Phần IV (tự luận)' };

  /* ------------------------------------------------------------------ */
  /*  Tiện ích                                                           */
  /* ------------------------------------------------------------------ */
  function isTrue(v) {
    if (v === true || v === 1) return true;
    return ['true', 'đúng', 'dung', 'đ', '1'].indexOf(String(v == null ? '' : v).toLowerCase().trim()) !== -1;
  }
  function plain(t) {
    return String(t == null ? '' : t).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\$[^$]*\$/g, ' X ').replace(/\s+/g, ' ').trim();
  }
  function firstOf(a) { return Array.isArray(a) ? a[0] : a; }
  function typeOf(q) { return q && q.type === 'essay-multi' ? 'essay_multi' : (q ? q.type : ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /** Duyệt mọi trường CHỮ HIỂN THỊ của một câu. fn(chuỗi, nhãn) -> chuỗi mới (hoặc undefined = giữ). */
  function eachText(q, fn) {
    function go(obj, key, label) {
      if (!obj || typeof obj[key] !== 'string') return;
      var r = fn(obj[key], label);
      if (typeof r === 'string' && r !== obj[key]) obj[key] = r;
    }
    ['mainQuestion', 'question', 'questionText'].forEach(function (k) { go(q, k, 'đề bài'); });
    (q.choices || []).forEach(function (c, i) { go(c, 'choice', 'phương án ' + 'ABCDEF'.charAt(i)); go(c, 'text', 'phương án ' + 'ABCDEF'.charAt(i)); });
    (q.subQuestions || []).forEach(function (s, i) { go(s, 'question', 'ý ' + String.fromCharCode(97 + i)); });
    Object.keys(q.parts || {}).sort().forEach(function (k) { go(q.parts[k], 'question', 'ý ' + k); });
  }

  /** Áp dụng hàm sửa chỉ lên đoạn chữ thường (bỏ qua thẻ HTML và công thức). */
  var SKIP_RE = /(<[^>]+>|\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|https?:\/\/\S+)/;
  function onPlainSegments(str, fix) {
    var parts = String(str).split(SKIP_RE);
    for (var i = 0; i < parts.length; i += 2) parts[i] = fix(parts[i]);   // chỉ phần chẵn là chữ thường (split có nhóm bắt)
    return parts.join('');
  }

  /** Sửa chắc chắn: không làm đổi nghĩa/số liệu. */
  function safeFix(str) {
    var s = String(str);
    s = s.replace(/&nbsp;/gi, ' ');
    s = onPlainSegments(s, function (t) {
      t = t.replace(/[ \t\u00A0]{2,}/g, ' ');                              // nhiều khoảng trắng -> 1
      t = t.replace(/[ \u00A0]+([,;:?!\)])/g, '$1');                       // bỏ cách TRƯỚC dấu câu
      t = t.replace(/([a-zà-ỹ\)])([,;])(?=[A-Za-zÀ-ỹ])/g, '$1$2 ');       // thêm cách SAU dấu , ; khi dính chữ
      t = t.replace(/\(\s+/g, '(');                                         // "( abc" -> "(abc"
      return t;
    });
    return s.replace(/^\s+|\s+$/g, '');
  }

  /* ------------------------------------------------------------------ */
  /*  1) Tự sửa chắc chắn trên đề gốc                                    */
  /* ------------------------------------------------------------------ */
  function prepareOriginals(originals /*, opts */) {
    var fixed = 0, touched = 0;
    (originals || []).forEach(function (ex) {
      PARTS.forEach(function (p) {
        ((ex.parts && ex.parts[p]) || []).forEach(function (q) {
          if (!q) return;
          var before = fixed;
          eachText(q, function (s) { var n = safeFix(s); if (n !== s) fixed++; return n; });
          if (fixed > before) touched++;
        });
      });
    });
    if (typeof console !== 'undefined') console.log('[ExamQA] prepareOriginals: sửa ' + fixed + ' chỗ trong ' + touched + ' câu.');
    return Promise.resolve({ fixed: fixed, questions: touched });
  }

  /* ------------------------------------------------------------------ */
  /*  2) Kiểm tra                                                         */
  /* ------------------------------------------------------------------ */
  function newReport() {
    var seen = {};
    return {
      errors: [], warns: [], infos: [],
      add: function (level, code, where, msg) {
        var key = level + '|' + code + '|' + where + '|' + msg;
        if (seen[key]) return; seen[key] = 1;
        (level === 'E' ? this.errors : level === 'W' ? this.warns : this.infos).push({ code: code, where: where, msg: msg });
      }
    };
  }

  function whereOf(ex, part, idx, q) {
    return 'Mã ' + ex.code + ' · ' + PART_LABEL[part].split(' (')[0] + ' · Câu ' + (idx + 1) + (q && q.ID ? ' (ID ' + q.ID + ')' : '');
  }

  function checkMath(txt, add, where, label) {
    var dollars = (String(txt).replace(/\\\$/g, '').match(/\$/g) || []).length;
    if (dollars % 2) add('E', 'math', where, label + ': dấu $ của công thức không chẵn (thiếu hoặc thừa 1 dấu $).');
    var m = String(txt).match(/\$[^$]*\$/g) || [];
    m.forEach(function (f) {
      var o = (f.match(/\{/g) || []).length, c = (f.match(/\}/g) || []).length;
      if (o !== c) add('E', 'math', where, label + ': công thức lệch ngoặc nhọn { } → ' + f.slice(0, 50));
      if ((f.match(/\\left/g) || []).length !== (f.match(/\\right/g) || []).length) add('E', 'math', where, label + ': công thức lệch \\left / \\right → ' + f.slice(0, 50));
    });
  }

  function checkText(txt, add, where, label) {
    var raw = String(txt);
    if (/<img\b[^>]*\bsrc\s*=\s*["']?\s*(["']|>|transparent|data:image\/gif)/i.test(raw) || /<img\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(raw))
      add('E', 'img', where, label + ': hình đang trống/giữ chỗ (chưa có ảnh thật).');
    checkMath(raw, add, where, label);
    var t = onPlainSegments(raw.replace(/&nbsp;/gi, ' '), function (x) { return x; });
    var p = plain(raw);
    if (/[\uFFFD]|&[a-z]+;|&#\d+;/i.test(raw.replace(/&nbsp;/gi, ''))) add('W', 'char', where, label + ': có ký tự lạ/thực thể HTML (VD �, &amp;).');
    var o = (p.match(/\(/g) || []).length, c = (p.match(/\)/g) || []).length;
    if (o !== c) add('W', 'paren', where, label + ': dấu ngoặc ( ) không khớp.');
    if (/(^|[\s,;.])([A-Za-zÀ-ỹ]{2,})\s+\2(?=[\s,;.?!]|$)/i.test(p)) add('W', 'dup', where, label + ': lặp từ liền nhau → "' + (p.match(/([A-Za-zÀ-ỹ]{2,})\s+\1(?=[\s,;.?!]|$)/i) || [''])[0] + '".');
    var spaced = onPlainSegments(raw, function (x) { return x; });
    if (/[ \u00A0]{2,}/.test(spaced.replace(/<[^>]+>/g, ''))) add('W', 'space', where, label + ': còn khoảng trắng thừa.');
    return p;
  }

  function checkQuestion(q, part, ex, idx, rep, ctx) {
    var add = rep.add.bind(rep);
    var where = whereOf(ex, part, idx, q);
    var type = typeOf(q);
    var stem = checkText(q.mainQuestion || q.question || '', add, where, 'đề bài');
    if (!stem) add('E', 'empty', where, 'đề bài trống.');
    ctx.kyki.push(String(q.mainQuestion || q.question || ''));

    if (type === 'multipleChoice') {
      var ch = q.choices || [];
      if (ch.length !== 4) add('E', 'mc4', where, 'trắc nghiệm có ' + ch.length + ' phương án (cần đúng 4: A, B, C, D).');
      var ok = ch.filter(function (c) { return c.isCorrect === true || isTrue(c.answer); }).length;
      if (ok !== 1) add('E', 'mc1', where, 'trắc nghiệm có ' + ok + ' đáp án đúng (cần đúng 1).');
      var seen = {};
      ch.forEach(function (c, i) {
        var tx = checkText(c.choice || c.text || '', add, where, 'phương án ' + 'ABCDEF'.charAt(i));
        ctx.kyki.push(String(c.choice || c.text || ''));
        if (!tx) add('E', 'empty', where, 'phương án ' + 'ABCDEF'.charAt(i) + ' trống.');
        else if (seen[tx]) add('E', 'dupchoice', where, 'hai phương án trùng nội dung (' + 'ABCDEF'.charAt(seen[tx] - 1) + ' và ' + 'ABCDEF'.charAt(i) + ').');
        else seen[tx] = i + 1;
      });
      var ci = ch.findIndex(function (c) { return c.isCorrect === true || isTrue(c.answer); });
      if (ci >= 0) ctx.correctPos[ex.code] = (ctx.correctPos[ex.code] || []).concat([ci]);
    } else if (type === 'trueFalse') {
      var subs = q.subQuestions || [];
      if (subs.length !== 4) add('E', 'tf4', where, 'đúng/sai có ' + subs.length + ' ý (cần đúng 4: a, b, c, d).');
      subs.forEach(function (s, i) {
        var tx = checkText(s.question || '', add, where, 'ý ' + String.fromCharCode(97 + i));
        ctx.kyki.push(String(s.question || ''));
        if (!tx) add('E', 'empty', where, 'ý ' + String.fromCharCode(97 + i) + ' trống.');
        if (s.answer === undefined || s.answer === null || s.answer === '') add('E', 'noans', where, 'ý ' + String.fromCharCode(97 + i) + ' chưa có đáp án Đúng/Sai.');
      });
    } else if (type === 'essay') {
      if (!plain(firstOf(q.answer))) add('E', 'noans', where, 'trả lời ngắn chưa có đáp án.');
    } else if (type === 'essay_multi') {
      var ks = Object.keys(q.parts || {});
      var hasAns = plain(firstOf(q.answer)) || plain(q.solution) || ks.some(function (k) { return plain(firstOf(q.parts[k] && q.parts[k].answer)) || plain(q.parts[k] && q.parts[k].solution); });
      if (!hasAns) add('E', 'noans', where, 'tự luận chưa có đáp án/hướng dẫn chấm.');
      ks.forEach(function (k) { checkText((q.parts[k] && q.parts[k].question) || '', add, where, 'ý ' + k); ctx.kyki.push(String((q.parts[k] && q.parts[k].question) || '')); });
    } else {
      add('W', 'type', where, 'không nhận ra loại câu "' + type + '".');
    }
  }

  function levelSig(ex) {
    var m = {};
    PARTS.forEach(function (p) { ((ex.parts && ex.parts[p]) || []).forEach(function (q) { var k = p + ':' + (q && q.level ? q.level : '?'); m[k] = (m[k] || 0) + 1; }); });
    return m;
  }
  function sigText(m) { return Object.keys(m).sort().map(function (k) { return k + '=' + m[k]; }).join(', '); }

  /** Kiểm tra cấu trúc/định dạng/tương đương (không cần mạng). Trả về báo cáo. */
  function inspect(examPackages, opts) {
    opts = opts || {};
    var rep = newReport();
    var ctx = { kyki: [], correctPos: {} };
    var list = (examPackages || []).filter(function (e) { return e && e.parts; });
    if (!list.length) { rep.add('W', 'none', 'Gói đề', 'không có đề nào để kiểm tra.'); return rep; }

    list.forEach(function (ex) {
      var ids = {};
      PARTS.forEach(function (p) {
        ((ex.parts[p]) || []).forEach(function (q, i) {
          if (!q) return;
          checkQuestion(q, p, ex, i, rep, ctx);
          if (q.ID != null) {
            if (ids[q.ID]) rep.add('E', 'dupid', whereOf(ex, p, i, q), 'câu bị dùng 2 lần trong cùng một đề.');
            ids[q.ID] = 1;
          }
        });
      });
      // phân bố đáp án A/B/C/D của Phần I
      var pos = ctx.correctPos[ex.code] || [];
      if (pos.length >= 5) {
        var cnt = [0, 0, 0, 0]; pos.forEach(function (i) { if (i >= 0 && i < 4) cnt[i]++; });
        var mx = Math.max.apply(null, cnt);
        if (mx / pos.length >= 0.6) rep.add('W', 'abcd', 'Mã ' + ex.code, 'đáp án Phần I lệch: ' + 'ABCD'.charAt(cnt.indexOf(mx)) + ' chiếm ' + mx + '/' + pos.length + ' câu.');
      }
    });

    // tương đương giữa các mã đề: cùng số câu mỗi phần, cùng số câu theo mức nhận thức
    var base = list[0], bsig = levelSig(base);
    list.slice(1).forEach(function (ex) {
      PARTS.forEach(function (p) {
        var a = ((base.parts[p]) || []).length, b = ((ex.parts[p]) || []).length;
        if (a !== b) rep.add('E', 'count', 'Mã ' + ex.code + ' so với ' + base.code, PART_LABEL[p] + ' có ' + b + ' câu, trong khi mã ' + base.code + ' có ' + a + ' câu.');
      });
      var s = levelSig(ex);
      if (sigText(s) !== sigText(bsig)) rep.add('E', 'level', 'Mã ' + ex.code + ' so với ' + base.code, 'phân bố mức độ khác nhau → ' + sigText(s) + ' ≠ ' + sigText(bsig));
    });

    // thống nhất chính tả "kì/kỳ" trong toàn bộ gói đề
    var allTxt = ctx.kyki.join(' ').toLowerCase();
    var nKy = (allTxt.match(/\bchu k[ỳy]\b/g) || []).length, nKi = (allTxt.match(/\bchu k[ìi]\b/g) || []).length;
    if (nKy && nKi) rep.add('W', 'kyki', 'Toàn gói đề', 'dùng lẫn "chu kỳ" (' + nKy + ' lần) và "chu kì" (' + nKi + ' lần) — nên thống nhất một cách viết.');
    return rep;
  }

  /* ------------------------------------------------------------------ */
  /*  AI tự giải lại để đối chiếu đáp án (chính xác khoa học)             */
  /* ------------------------------------------------------------------ */
  async function aiCheck(examPackages, rep, opts) {
    var ai = opts.ai || {}, notify = opts.notify || function () {};
    if (typeof ai.aiVerifyVariant !== 'function') { rep.add('W', 'ai', 'Kiểm tra AI', 'không có hàm AI để tự giải lại.'); return; }
    var sleep = ai.aiSleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var uniq = [], seen = {};
    (examPackages || []).forEach(function (ex) {
      PARTS.forEach(function (p) {
        ((ex.parts && ex.parts[p]) || []).forEach(function (q, i) {
          var key = q && (q.ID != null ? 'id:' + q.ID : 'tx:' + plain(q.mainQuestion).slice(0, 80));
          if (!q || seen[key]) return; seen[key] = 1; uniq.push({ q: q, ex: ex, p: p, i: i });
        });
      });
    });
    var MAX = opts.maxAI || 40, delay = opts.aiDelayMs != null ? opts.aiDelayMs : 1500;
    var todo = uniq.slice(0, MAX), fails = 0, checked = 0, bad = 0;
    if (uniq.length > MAX) rep.add('W', 'ai', 'Kiểm tra AI', 'chỉ tự giải lại ' + MAX + '/' + uniq.length + ' câu (giới hạn để tiết kiệm lượt AI).');
    for (var k = 0; k < todo.length; k++) {
      var it = todo[k];
      try {
        var ok = await ai.aiVerifyVariant(it.q);
        checked++; fails = 0;
        if (ok === false) { bad++; rep.add('E', 'sci', whereOf(it.ex, it.p, it.i, it.q), 'AI tự giải ra đáp án KHÁC đáp án đã lưu — cần thầy/cô xem lại tính chính xác của đề hoặc đáp án.'); }
      } catch (e) {
        fails++;
        if (fails >= 3) { rep.add('W', 'ai', 'Kiểm tra AI', 'AI lỗi/hết lượt liên tiếp nên dừng sau ' + checked + ' câu (' + String(e && e.message || e).slice(0, 80) + ').'); break; }
      }
      if ((k + 1) % 5 === 0) notify('🔎 AI đã tự giải lại ' + (k + 1) + '/' + todo.length + ' câu...', 'info');
      if (k < todo.length - 1) await sleep(delay);
    }
    rep.infos.push({ code: 'aiDone', where: 'Kiểm tra AI', msg: 'đã tự giải lại ' + checked + ' câu, ' + bad + ' câu lệch đáp án.' });
  }

  /* ------------------------------------------------------------------ */
  /*  Hộp báo cáo                                                         */
  /* ------------------------------------------------------------------ */
  function showDialog(rep) {
    return new Promise(function (resolve) {
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;';
      function rows(list, color) {
        return list.slice(0, 80).map(function (r) { return '<li style="margin:4px 0;"><b style="color:' + color + '">' + esc(r.where) + ':</b> ' + esc(r.msg) + '</li>'; }).join('') +
          (list.length > 80 ? '<li>… và ' + (list.length - 80) + ' mục nữa (xem Console).</li>' : '');
      }
      box.innerHTML = '<div style="background:#fff;border-radius:10px;max-width:760px;width:92%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.4);">' +
        '<div style="padding:14px 18px;border-bottom:1px solid #ddd;font-size:17px;font-weight:700;">🛡️ Báo cáo kiểm tra chất lượng gói đề</div>' +
        '<div style="padding:12px 18px;overflow:auto;font-size:14px;line-height:1.45;">' +
        '<div style="margin-bottom:8px;"><b style="color:#c62828;">' + rep.errors.length + ' lỗi cần xử lý</b> · <b style="color:#ef6c00;">' + rep.warns.length + ' cảnh báo</b></div>' +
        (rep.errors.length ? '<div style="font-weight:700;color:#c62828;">LỖI</div><ul style="margin:4px 0 10px 18px;padding:0;">' + rows(rep.errors, '#c62828') + '</ul>' : '') +
        (rep.warns.length ? '<div style="font-weight:700;color:#ef6c00;">CẢNH BÁO</div><ul style="margin:4px 0 10px 18px;padding:0;">' + rows(rep.warns, '#ef6c00') + '</ul>' : '') +
        '</div><div style="padding:12px 18px;border-top:1px solid #ddd;display:flex;gap:10px;justify-content:flex-end;">' +
        '<button id="qa-back" style="padding:8px 16px;border:0;border-radius:6px;background:#1565c0;color:#fff;font-weight:700;cursor:pointer;">Quay lại sửa</button>' +
        '<button id="qa-go" style="padding:8px 16px;border:1px solid #999;border-radius:6px;background:#fff;cursor:pointer;">Vẫn xuất</button></div></div>';
      document.body.appendChild(box);
      function done(v) { try { document.body.removeChild(box); } catch (e) {} resolve(v); }
      box.querySelector('#qa-back').onclick = function () { done(false); };
      box.querySelector('#qa-go').onclick = function () { done(true); };
    });
  }

  /** Cổng chính. true = cho xuất tiếp, false = dừng để sửa. */
  async function gate(examPackages, opts) {
    opts = opts || {};
    var notify = opts.notify || function () {};
    var rep;
    try {
      rep = inspect(examPackages, opts);
      if (opts.aiVerify) await aiCheck(examPackages, rep, opts);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[ExamQA] gate lỗi, bỏ qua kiểm tra:', err);
      notify('⚠️ Bộ kiểm tra chất lượng gặp lỗi nên bỏ qua (' + (err && err.message) + ').', 'warning');
      return true;   // không để lỗi của bộ kiểm tra chặn việc xuất đề
    }
    if (typeof console !== 'undefined') { console.log('[ExamQA] lỗi:', rep.errors, 'cảnh báo:', rep.warns); }
    if (!rep.errors.length) {
      notify(rep.warns.length ? '✅ Đề đạt kiểm tra, còn ' + rep.warns.length + ' cảnh báo nhỏ (xem Console).' : '✅ Đề đạt kiểm tra chất lượng.', 'info');
      return true;
    }
    if (opts.silent || typeof document === 'undefined') return false;
    return showDialog(rep);
  }

  return { version: '1.0', prepareOriginals: prepareOriginals, gate: gate, inspect: inspect, safeFix: safeFix };
});
