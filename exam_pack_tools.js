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
     3. ExamPack.manualAI(prompt, reason) — khi Gemini hết quota/không có key: hiện hộp thoại
        "sao chép yêu cầu -> dán vào AI khác -> dán kết quả JSON về", rồi trả kết quả như aiGemini().
        Có nút nổi "🧩 AI dán tay: BẬT/TẮT" (góc trái dưới, chỉ Admin thấy) để bật/tắt, nhớ lựa chọn.
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
    resetManual();
    var text = out.map(function (e) { return e.code; }).join(' → ');
    ExamPack.lastOrderText = text;
    try { console.log('🔀 Thứ tự đề trong file (xen kẽ đề gốc): ' + text); } catch (e) {}
    if (notify && groups.length > 1) notify('🔀 Thứ tự đề trong file đã xen kẽ đề gốc: ' + text + ' — in nhiều bản rồi phát lần lượt, hai bạn cạnh nhau sẽ khác đề gốc.', 'info');
    return out;
  }


  /* ---------- 3) AI dán tay: hết quota / không có key -> sao chép yêu cầu, dán vào AI khác, dán kết quả về ---------- */
  var MANUAL = { skippedAt: 0, count: 0, queue: Promise.resolve() };
  var SKIP_MS = 5 * 60 * 1000;   // bấm "Bỏ qua AI" thì 5 phút sau (hoặc sau khi xuất xong) mới hỏi lại

  function extractJson(text) {
    var s = String(text || '').trim();
    var fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(s);
    if (fence) s = fence[1].trim();
    try { return JSON.parse(s); } catch (e) {}
    var a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
    throw new Error('Không đọc được JSON. Hãy copy toàn bộ kết quả của AI (từ dấu { hoặc [ đến hết).');
  }
  function copyText(txt) {
    var done = function () { return true; };
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt).then(done, function () { return legacyCopy(txt); }); } catch (e) {}
    return Promise.resolve(legacyCopy(txt));
  }
  function legacyCopy(txt) {
    try {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return !!ok;
    } catch (e) { return false; }
  }

  function openManualDialog(promptText, reason) {
    return new Promise(function (resolve, reject) {
      var n = ++MANUAL.count;
      var el = function (tag, css, text) { var x = document.createElement(tag); if (css) x.style.cssText = css; if (text != null) x.textContent = text; return x; };
      var btn = function (color, text) { return el('button', 'background:' + color + ';color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;margin:4px 6px 4px 0;font-size:14px;', text); };
      var ov = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:12px;');
      var box = el('div', 'background:#fff;color:#222;max-width:880px;width:100%;max-height:92vh;overflow:auto;border-radius:14px;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.4);text-align:left;');
      box.appendChild(el('h3', 'margin:0 0 6px;color:#4361ee;', '🧩 Nhờ AI khác xử lý (dán tay) — lượt ' + n));
      if (reason) box.appendChild(el('div', 'background:#fff3cd;border-radius:8px;padding:8px 10px;font-size:13px;margin-bottom:8px;', 'AI tự động đang lỗi hoặc hết hạn mức: ' + reason));
      box.appendChild(el('div', 'font-size:14px;line-height:1.5;margin-bottom:6px;',
        'Cách làm: (1) Bấm "Sao chép yêu cầu". (2) Dán vào ChatGPT, Claude hoặc Gemini bản web rồi gửi. (3) Copy toàn bộ kết quả JSON, dán vào ô bên dưới và bấm "Dùng kết quả này". Trang sẽ làm tiếp như thể AI tự động đã trả lời.'));
      var full = String(promptText) + '\n\n(Chỉ trả về đúng MỘT khối JSON hợp lệ, không giải thích thêm bên ngoài JSON.)';
      var pbox = el('textarea', 'width:100%;height:110px;font-size:12px;margin:6px 0;box-sizing:border-box;'); pbox.readOnly = true; pbox.value = full;
      var bCopy = btn('#2563eb', '📋 Sao chép yêu cầu');
      var ta = el('textarea', 'width:100%;height:150px;font-family:monospace;font-size:12px;margin:6px 0;box-sizing:border-box;');
      ta.placeholder = 'Dán kết quả JSON của AI vào đây...';
      var bUse = btn('#16a34a', '✅ Dùng kết quả này');
      var bSkip = btn('#6b7280', 'Bỏ qua AI, tiếp tục xuất đề');
      var msg = el('div', 'font-size:13px;margin-top:4px;min-height:18px;');
      bCopy.onclick = function () {
        copyText(full).then(function (ok) { msg.textContent = ok ? '✅ Đã sao chép. Hãy dán vào AI khác rồi gửi.' : 'Chưa tự sao chép được: bấm vào ô yêu cầu, Ctrl+A rồi Ctrl+C.'; });
      };
      bUse.onclick = function () {
        var raw = ta.value.trim();
        if (!raw) { msg.textContent = 'Chưa có nội dung để dùng.'; return; }
        var obj;
        try { obj = extractJson(raw); } catch (e) { msg.textContent = '❌ ' + e.message; return; }
        ov.remove(); resolve(obj);
      };
      bSkip.onclick = function () {
        MANUAL.skippedAt = Date.now();
        ov.remove(); reject(new Error('Đã bỏ qua AI (chế độ dán tay)'));
      };
      box.appendChild(pbox); box.appendChild(bCopy); box.appendChild(ta); box.appendChild(bUse); box.appendChild(bSkip); box.appendChild(msg);
      ov.appendChild(box); document.body.appendChild(ov);
    });
  }

  // Trả về Promise<object JSON>, giống hệt aiGemini(); từ chối khi người dùng bấm "Bỏ qua AI".
  function manualAI(promptText, reason) {
    if (Date.now() - MANUAL.skippedAt < SKIP_MS) return Promise.reject(new Error('Đã bỏ qua AI (chế độ dán tay)'));
    var run = MANUAL.queue.then(function () {
      if (Date.now() - MANUAL.skippedAt < SKIP_MS) throw new Error('Đã bỏ qua AI (chế độ dán tay)');
      return openManualDialog(promptText, reason);
    });
    MANUAL.queue = run.catch(function () {});
    return run;
  }
  function resetManual() { MANUAL.skippedAt = 0; MANUAL.count = 0; }


  /* ---------- 4) Nút bật/tắt "AI dán tay" (chỉ hiện với Admin, nhớ lựa chọn trên máy) ---------- */
  var LS_MANUAL = 'exam_manual_ai_off';   // '1' = đã tắt
  function manualOn() { return window.AI_MANUAL_FALLBACK !== false; }
  function setManual(on) {
    window.AI_MANUAL_FALLBACK = on ? true : false;
    try { if (on) localStorage.removeItem(LS_MANUAL); else localStorage.setItem(LS_MANUAL, '1'); } catch (e) {}
    paintToggle();
  }
  var TOGGLE = null;
  function isAdminNow() {
    try { if (isAdminAuthenticated === true && adminRole === 'full') return true; } catch (e) {}
    return false;
  }
  function paintToggle() {
    if (!TOGGLE) return;
    var on = manualOn();
    TOGGLE.textContent = '🧩 AI dán tay: ' + (on ? 'BẬT' : 'TẮT');
    TOGGLE.style.background = on ? '#16a34a' : '#6b7280';
    TOGGLE.title = on
      ? 'Khi Gemini hết quota/không có key, trang sẽ hiện hộp "sao chép yêu cầu -> dán vào AI khác -> dán kết quả về". Bấm để TẮT.'
      : 'Đang tắt: Gemini lỗi thì bỏ qua bước AI, vẫn xuất đề bình thường. Bấm để BẬT.';
  }
  function initToggle() {
    try { if (localStorage.getItem(LS_MANUAL) === '1') window.AI_MANUAL_FALLBACK = false; } catch (e) {}
    if (typeof document === 'undefined') return;
    function ensure() {
      var admin = isAdminNow();
      if (admin && !TOGGLE && document.body) {
        TOGGLE = document.createElement('button');
        TOGGLE.id = 'exam-manual-ai-toggle';
        TOGGLE.type = 'button';
        TOGGLE.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147482000;color:#fff;border:0;border-radius:20px;' +
          'padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);opacity:.92;';
        TOGGLE.onclick = function () { setManual(!manualOn()); };
        document.body.appendChild(TOGGLE);
        paintToggle();
      }
      if (TOGGLE) TOGGLE.style.display = admin ? '' : 'none';
    }
    ensure();
    setInterval(ensure, 2000);   // Admin đăng nhập sau khi tải trang -> nút tự hiện
  }

  var ExamPack = { guardImages: guardImages, arrange: arrange, manualAI: manualAI, setManual: setManual, resetManual: resetManual, extractJson: extractJson, hasPlaceholder: hasPlaceholder, badReason: badReason, lastOrderText: '', version: '1.2' };
  window.ExamPack = ExamPack;
  initToggle();
})();
