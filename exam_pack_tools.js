/* =====================================================================
   exam_pack_tools.js — Cải tiến xuất "Gói đề" cho TestOline
   Nhúng 1 dòng ở cuối trang, ngay TRƯỚC reward.js (cạnh hinh_thieu.js):
     <script src="https://cdn.jsdelivr.net/gh/pnhung72/physics-assets@main/exam_pack_tools.js"></script>

   Gồm 2 chức năng, gọi từ generateCompleteExamPackage:
     1. ExamPack.guardImages(originals, ctx)  — chạy TRƯỚC khi tạo đề xáo.
        Câu nào trong đề gốc có ảnh giữ chỗ (src rỗng / transparent.gif) hoặc link ảnh
        không tải được -> tự thay bằng câu khác CÙNG bài, CÙNG dạng, CÙNG mức độ nhưng hình tốt.
        Không có câu thay -> báo rõ ID câu + nguyên nhân để vá bằng bảng "Hình thiếu".
        Vì đề xáo là bản sao của đề gốc nên đề xáo cũng sạch theo.
     2. ExamPack.arrange(allExams)  — chạy SAU khi có đủ đề.
        Xếp thứ tự xuất file xen kẽ giữa các đề gốc: 101,104,107,102,105,108,103,106,109...
        In nguyên file (nhiều bản, sắp xếp từng bộ) rồi phát lần lượt -> hai bạn ngồi cạnh
        nhau không bao giờ cùng đề gốc.
   ===================================================================== */
(function () {
  'use strict';
  if (window.ExamPack) return;

  var PARTS = ['I', 'II', 'III', 'IV'];
  var IMG_RE = /<img\b[^>]*>/gi;

  /* ---------- nhận diện ảnh (cùng quy tắc với exam_docx_export.js và hinh_thieu.js) ---------- */
  function srcOf(tag) {
    var m = String(tag).match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    return m ? String(m[1] || m[2] || m[3] || '').trim() : '';
  }
  function isPh(src) { return !src || /transparent\.(gif|png)|blank\.(gif|png)|^about:blank/i.test(src); }

  function htmlFields(q) {   // đúng các trường mà bộ xuất Word đọc ảnh
    var o = [];
    o.push(q.mainQuestion || q.question || '');
    (q.choices || []).forEach(function (c) { o.push((c && (c.choice || c.text)) || ''); });
    (q.subQuestions || []).forEach(function (s) { o.push((s && s.question) || ''); });
    Object.keys(q.parts || {}).forEach(function (k) { o.push((q.parts[k] && q.parts[k].question) || ''); });
    o.push(Array.isArray(q.answer) ? q.answer[0] : q.answer);
    return o.filter(function (x) { return typeof x === 'string'; });
  }
  function imgSrcs(q) {
    var r = [];
    htmlFields(q).forEach(function (t) {
      (t.match(IMG_RE) || []).forEach(function (tag) { r.push(srcOf(tag).replace(/&amp;/g, '&')); });
    });
    return r;
  }
  function hasPlaceholder(q) { return imgSrcs(q).some(isPh); }

  /* ---------- thử tải link ảnh (giống cách bộ xuất Word tải) ---------- */
  var LINK_CACHE = {};   // src -> true (tải được) | false (hỏng)
  function checkSrc(src) {
    if (isPh(src)) return Promise.resolve(false);
    if (/^data:/i.test(src)) return Promise.resolve(true);
    if (src in LINK_CACHE) return Promise.resolve(LINK_CACHE[src]);
    if (typeof fetch !== 'function') return Promise.resolve(true);
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
    return fetch(src, ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function (ab) { return ab && ab.byteLength > 0; })
      .catch(function () { return false; })
      .then(function (ok) { if (timer) clearTimeout(timer); LINK_CACHE[src] = ok; return ok; });
  }
  // Trả về lí do hỏng ('' = hình tốt): 'giữ chỗ' | 'link không tải được'
  function badReason(q) {
    var srcs = imgSrcs(q);
    if (srcs.some(isPh)) return Promise.resolve('ảnh giữ chỗ (chưa có link hình thật)');
    return Promise.all(srcs.map(checkSrc)).then(function (oks) {
      return oks.every(Boolean) ? '' : 'link ảnh không tải được (hỏng link hoặc máy chủ ảnh chặn CORS)';
    });
  }

  /* ---------- bỏ thẻ ảnh giữ chỗ khỏi bản đề (ngân hàng giữ nguyên) ---------- */
  function stripPhStr(s) {
    if (typeof s !== 'string') return s;
    return s.replace(IMG_RE, function (tag) { return isPh(srcOf(tag)) ? '' : tag; })
            .replace(/(?:\s*<br\s*\/?>)+\s*$/i, '').trim();
  }
  function stripPlaceholders(q) {
    ['mainQuestion', 'question', 'questionText'].forEach(function (k) { if (typeof q[k] === 'string') q[k] = stripPhStr(q[k]); });
    (q.choices || []).forEach(function (c) { if (!c) return; if (typeof c.choice === 'string') c.choice = stripPhStr(c.choice); if (typeof c.text === 'string') c.text = stripPhStr(c.text); });
    (q.subQuestions || []).forEach(function (s) { if (s && typeof s.question === 'string') s.question = stripPhStr(s.question); });
    Object.keys(q.parts || {}).forEach(function (k) { if (q.parts[k] && typeof q.parts[k].question === 'string') q.parts[k].question = stripPhStr(q.parts[k].question); });
    if (typeof q.answer === 'string') q.answer = stripPhStr(q.answer);
    else if (Array.isArray(q.answer) && typeof q.answer[0] === 'string') q.answer[0] = stripPhStr(q.answer[0]);
  }
  // Đề bài có nhắc hình/đồ thị/bảng thì KHÔNG được bỏ ảnh (sẽ làm đề thiếu dữ kiện)
  function refersFigure(q) {
    var t = htmlFields(q).join(' ').replace(IMG_RE, ' ').replace(/<[^>]+>/g, ' ');
    return /(hình\s*(?:bên|vẽ|sau|dưới|\d)|như hình|đồ thị|sơ đồ|biểu đồ|bảng\s*(?:số liệu|sau|bên))/i.test(t);
  }

  /* ---------- 1) Chặn câu thiếu hình ---------- */
  function shuffled(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function sameLessonDefault(c, lesson) { return String(c.lesson) === String(lesson); }

  function guardImages(originals, ctx) {
    ctx = ctx || {};
    var bank = ctx.bank || [];
    var typeOf = ctx.typeOf || function (q) { return q && q.type; };
    var sameLesson = ctx.sameLesson || sameLessonDefault;
    var notify = ctx.notify || function () {};
    var report = { swapped: [], stripped: [], stuck: {} };   // stuck: ID -> { reason, codes:[...] }

    function findReplacement(old, ex, used) {
      var key = String(old._slot || '').split('|')[0].split('_');   // grade_chapter_lesson
      var grade = key.length === 3 ? key[0] : String(old.grade);
      var chapter = key.length === 3 ? key[1] : String(old.chapter);
      var lesson = key.length === 3 ? key[2] : old.lesson;
      var type = typeOf(old), level = old.level;
      var pool = shuffled(bank.filter(function (c) {
        return c && !used[c.ID] && String(c.grade) === grade && String(c.chapter) === chapter &&
          sameLesson(c, lesson) && typeOf(c) === type && c.level === level && !hasPlaceholder(c);
      }));
      var i = 0;
      function next() {
        if (i >= pool.length || i >= 8) return Promise.resolve(null);   // thử tối đa 8 câu ứng viên
        var c = pool[i++];
        return badReason(c).then(function (why) { return why ? next() : c; });
      }
      return next();
    }

    function makeExamQ(c, old) {
      var cc = JSON.parse(JSON.stringify(c));
      var txt = cc.mainQuestion || cc.question || '';
      return Object.assign({}, cc, {
        _slot: old._slot, _imgSwapped: true, number: old.number, type: cc.type, level: cc.level,
        questionText: ctx.clean ? ctx.clean(txt) : txt,
        choices: cc.choices || [], subQuestions: cc.subQuestions || [], answer: cc.answer || '', parts: cc.parts || {},
        score: old.score
      });
    }

    var chain = Promise.resolve();
    originals.forEach(function (ex) {
      var used = {};
      PARTS.forEach(function (p) { (ex.parts[p] || []).forEach(function (q) { used[q.ID] = 1; }); });
      PARTS.forEach(function (p) {
        (ex.parts[p] || []).forEach(function (q, idx) {
          chain = chain.then(function () {
            return badReason(q).then(function (why) {
              if (!why) return;
              return findReplacement(q, ex, used).then(function (c) {
                if (c) {
                  used[c.ID] = 1;
                  ex.parts[p][idx] = makeExamQ(c, q);
                  report.swapped.push({ code: ex.code, number: q.number, from: q.ID, to: c.ID, why: why });
                } else if (ctx.stripPlaceholder && hasPlaceholder(q) && !refersFigure(q)) {
                  // không có câu thay, đề bài không cần hình -> bỏ thẻ ảnh giữ chỗ khỏi bản đề
                  stripPlaceholders(q);
                  return badReason(q).then(function (why2) {
                    if (why2) {
                      var s2 = report.stuck[q.ID] || (report.stuck[q.ID] = { reason: why2, codes: [], number: q.number });
                      s2.codes.push(ex.code);
                    } else {
                      q._imgStripped = true;
                      report.stripped.push({ code: ex.code, number: q.number, id: q.ID });
                    }
                  });
                } else {
                  var s = report.stuck[q.ID] || (report.stuck[q.ID] = { reason: why, codes: [], number: q.number });
                  s.codes.push(ex.code);
                }
              });
            });
          });
        });
      });
    });

    return chain.then(function () {
      if (report.swapped.length) {
        notify('🖼️ Đã thay ' + report.swapped.length + ' câu bị thiếu hình bằng câu khác cùng bài/dạng/mức độ (' +
          report.swapped.map(function (s) { return 'đề ' + s.code + ' câu ' + s.number; }).join(', ') + ').', 'success');
      }
      if (report.stripped.length) {
        var sid = {}; report.stripped.forEach(function (x) { (sid[x.id] = sid[x.id] || []).push(x.code); });
        notify('✂️ Câu ' + Object.keys(sid).map(function (id) { return id + ' (đề gốc ' + sid[id].join(', ') + ')'; }).join('; ') +
          ' có ảnh giữ chỗ nhưng đề bài đủ dữ kiện bằng chữ — đã bỏ thẻ ảnh trong bản đề (ngân hàng giữ nguyên). Muốn có hình thật thì dán link bằng bảng "Hình thiếu".', 'info');
      }
      var ids = Object.keys(report.stuck);
      if (ids.length) {
        notify('⚠️ ' + ids.length + ' câu thiếu hình mà KHÔNG có câu thay: ' + ids.map(function (id) {
          var s = report.stuck[id];
          return id + ' (đề gốc ' + s.codes.join(', ') + ' — ' + s.reason + ')';
        }).join('; ') + '. Mở bảng "Hình thiếu" để dán link hình thật cho các ID này (đề xáo sẽ lấy theo).', 'warning');
      }
      try { console.log('🖼️ ExamPack.guardImages:', report); } catch (e) {}
      return report;
    });
  }

  /* ---------- 2) Xếp thứ tự xuất file: xen kẽ giữa các đề gốc ---------- */
  function arrange(exams, notify) {
    var groups = [], idx = {};
    exams.forEach(function (e) {
      var g = e.isShuffled ? e.originalCode : e.code;
      if (!(g in idx)) { idx[g] = groups.length; groups.push([]); }
      groups[idx[g]].push(e);
    });
    groups.forEach(function (g) { g.sort(function (a, b) { return a.code - b.code; }); });
    groups.sort(function (a, b) { return a[0].code - b[0].code; });
    var max = 0; groups.forEach(function (g) { if (g.length > max) max = g.length; });
    var out = [];
    for (var k = 0; k < max; k++) groups.forEach(function (g) { if (g[k]) out.push(g[k]); });
    out.forEach(function (e, i) { e.printSeq = i + 1; });
    var text = out.map(function (e) { return e.code; }).join(' → ');
    ExamPack.lastOrderText = text;
    try { console.log('🔀 Thứ tự đề trong file (xen kẽ đề gốc): ' + text); } catch (e) {}
    if (notify && groups.length > 1) notify('🔀 Thứ tự đề trong file đã xen kẽ đề gốc: ' + text + ' — in nhiều bản rồi phát lần lượt, hai bạn cạnh nhau sẽ khác đề gốc.', 'info');
    return out;
  }

  var ExamPack = { guardImages: guardImages, arrange: arrange, hasPlaceholder: hasPlaceholder, badReason: badReason, lastOrderText: '', version: '1.0' };
  window.ExamPack = ExamPack;
})();
