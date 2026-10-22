/* =====================================================================
   exam_fill_guard.js — ĐẢM BẢO ĐỀ ĐỦ CÂU THEO MA TRẬN (v1.0)  — TestOline
   Nhúng 1 dòng ở cuối trang, SAU ai_matrix_progress.js và TRƯỚC reward.js:
     <script src="https://cdn.jsdelivr.net/gh/pnhung72/physics-assets@COMMIT/exam_fill_guard.js"></script>

   Vấn đề giải quyết: đề xuất ra thiếu câu (VD: ma trận 8 câu Trắc nghiệm, đề chỉ có 6; Đúng/Sai mất hẳn)
   mà trang vẫn xuất file như bình thường, chỉ báo một dòng thông báo thoáng qua.

   File này làm 4 việc, chỉ bằng cách móc vào hàm của trang (không sửa mã trang):
     1. Sau khi tạo mỗi ĐỀ GỐC, đối chiếu từng ô ma trận (Bài × Loại × Mức) với đề thực tế.
     2. Ô nào thiếu: (a) lấy thêm câu cùng loại còn trong ngân hàng, (b) mượn câu, (c) nhờ AI tạo
        (chỉ khi đã đăng nhập Admin) — rồi nhét thẳng vào đề và đánh số lại.
     3. Vẫn thiếu: HIỆN HỘP THOẠI nêu rõ ô nào thiếu, vì sao; bạn chọn "Dừng" hoặc "Vẫn xuất".
        (Trước đây trang im lặng xuất đề thiếu.)
     4. Kiểm tra lần cuối sau bước "kiểm tra hình" và "AI cân bằng đề" (hai bước này có thể bỏ câu).
   Lỗi của file này không làm hỏng việc tạo đề (trừ khi bạn chủ động bấm "Dừng").
   ===================================================================== */
(function () {
  'use strict';
  if (window.EXAMGUARD) return;

  var LV = { B: 'Biết', H: 'Hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
  var TN = { multipleChoice: 'Trắc nghiệm', trueFalse: 'Đúng/Sai', essay: 'Trả lời ngắn', essay_multi: 'Tự luận' };
  var state = { choice: null, log: [] };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nType(t) { return t === 'essay-multi' ? 'essay_multi' : t; }
  function tName(t) { try { return BRW_TYPE_NAME[t] || TN[t] || t; } catch (e) { return TN[t] || t; } }
  function hasToken() { try { return typeof aiGenToken === 'function' && !!aiGenToken(); } catch (e) { return false; } }
  function lessonOfQ(q) {
    if (q.lesson !== undefined && q.lesson !== null && String(q.lesson) !== '') return String(q.lesson);
    var m = String(q.topic || '').match(/(\d+)/); return m ? m[1] : '';
  }
  function slotOfQ(q) { return [q.grade, q.chapter, lessonOfQ(q)].join('_') + '|' + nType(q.type) + '|' + String(q.level || '').toUpperCase(); }
  function allQs(exam) {
    var a = [];
    Object.keys((exam && exam.parts) || {}).forEach(function (pk) { (exam.parts[pk] || []).forEach(function (q) { if (q) a.push(q); }); });
    return a;
  }
  function matrix() { try { if (typeof matrixData !== 'undefined' && matrixData) return matrixData; } catch (e) {} return window.matrixData || null; }
  function bank() { try { return Object.keys(allQuestions || {}).map(function (k) { return allQuestions[k]; }); } catch (e) { return []; } }

  /* ---- đối chiếu ma trận ↔ đề: trả về các ô còn thiếu ---- */
  function computeShort(exam) {
    var md = matrix();
    if (!md || !exam || !exam.parts) return null;
    var itemMode = !!window.TF_ITEM_MODE, want = {}, got = {}, wantT = {}, gotT = {};
    Object.keys(md).forEach(function (key) {
      var types = md[key] || {};
      Object.keys(types).forEach(function (t) {
        Object.keys(types[t] || {}).forEach(function (l) {
          var n = parseInt(types[t][l], 10) || 0; if (!n) return;
          var tt = nType(t);
          want[key + '|' + tt + '|' + l] = n; wantT[tt] = (wantT[tt] || 0) + n;
        });
      });
    });
    allQs(exam).forEach(function (q) {
      var t = nType(q.type), k = q._slot ? q._slot : slotOfQ(q);
      var inc = (itemMode && t === 'trueFalse') ? ((q.subQuestions || []).length || 4) : 1;
      got[k] = (got[k] || 0) + inc; gotT[t] = (gotT[t] || 0) + inc;
    });
    var short = [];
    Object.keys(want).forEach(function (k) {
      var p = k.split('|'), kk = p[0].split('_'), t = p[1], l = p[2];
      if (itemMode && t === 'trueFalse') return;         // chế độ tính theo ý do trang tự xử lí
      var g = got[k] || 0;
      if (g < want[k]) short.push({ key: p[0], grade: kk[0], chapter: kk[1], lesson: kk[2], label: 'L' + kk[0] + '-C' + kk[1] + '-B' + kk[2], type: t, level: l, need: want[k], got: g });
    });
    return { short: short, wantT: wantT, gotT: gotT, itemMode: itemMode };
  }

  function renumber(exam) {
    var n = 1; exam.partRanges = {};
    ['I', 'II', 'III', 'IV'].forEach(function (pk) {
      var a = exam.parts[pk];
      if (a && a.length) { exam.partRanges[pk] = { start: n, end: n + a.length - 1, count: a.length }; a.forEach(function (q) { q.number = n++; }); }
    });
  }
  function pushMade(exam, made) {
    var clean = (typeof cleanQuestionText === 'function') ? cleanQuestionText : function (x) { return x; };
    var added = 0;
    (made || []).forEach(function (q) {
      var part = window.ExamRules && window.ExamRules.partOf(q.type);
      if (!part) { state.log.push('Câu ' + q.ID + ' có type "' + q.type + '" không được trang nhận diện → bỏ.'); return; }
      exam.parts[part] = exam.parts[part] || [];
      exam.parts[part].push(Object.assign({}, q, {
        _slot: slotOfQ(q), questionText: clean(q.mainQuestion || q.question || ''),
        choices: q.choices || [], subQuestions: q.subQuestions || [], answer: q.answer || '', parts: q.parts || {},
        score: window.ExamRules.pointsOf(q.type)
      }));
      added++;
    });
    if (added) renumber(exam);
    return added;
  }
  function usedIds(exam) {
    var s = new Set();
    allQs(exam).forEach(function (q) {
      s.add(q.ID); if (q._srcId != null) s.add(q._srcId);
      (q.subQuestions || []).forEach(function (x) { if (x && x._srcId != null) s.add(x._srcId); });
    });
    return s;
  }
  // (a) câu cùng loại, cùng bài, cùng mức còn nằm trong ngân hàng mà đề chưa dùng
  function directFill(exam, info) {
    var used = usedIds(exam), made = [], pool = bank();
    function samLesson(q, lesson) { try { return examSameLesson(q, lesson); } catch (e) { return lessonOfQ(q) === String(lesson); } }
    info.short.forEach(function (c) {
      var need = c.need - c.got;
      var cands = pool.filter(function (q) {
        return q && !q._borrowed && String(q.grade) === c.grade && String(q.chapter) === c.chapter && samLesson(q, c.lesson) &&
               nType(q.type) === c.type && String(q.level || '').toUpperCase() === c.level && !used.has(q.ID);
      });
      for (var i = 0; i < cands.length && need > 0; i++) { used.add(cands[i].ID); made.push(cands[i]); need--; }
    });
    return made;
  }

  /* ---- bổ sung câu thiếu: ngân hàng → mượn → AI ---- */
  async function repair(exam) {
    var info = computeShort(exam);
    if (!info || !info.short.length) return info;
    for (var round = 0; round < 2 && info.short.length; round++) {
      var made = directFill(exam, info);
      if (made.length) { pushMade(exam, made); info = computeShort(exam); if (!info.short.length) break; }
      var ctx = null, left = null;
      try {
        ctx = brwNewCtx(usedIds(exam));
        var shorts = info.short.map(function (c) { return { grade: c.grade, chapter: c.chapter, lesson: c.lesson, type: c.type, level: c.level, need: c.need - c.got }; });
        var r1 = brwFill(shorts, bank(), null, ctx);
        if (r1.made.length) pushMade(exam, r1.made);
        left = r1.failed;
      } catch (e) {
        console.warn('EXAMGUARD mượn câu:', e);
        left = info.short.map(function (c) { return { label: c.label, type: c.type, level: c.level, need: c.need - c.got, missing: c.need - c.got }; });
      }
      if (left && left.length && ctx && hasToken() && window.AI_FILL_ENABLED !== false && typeof window.aiFillShortage === 'function') {
        try {
          var r2 = await window.aiFillShortage(left, ctx);
          if (r2 && r2.made && r2.made.length) pushMade(exam, r2.made);
        } catch (e) { state.log.push('AI lỗi: ' + String((e && e.message) || e).slice(0, 160)); console.warn('EXAMGUARD AI:', e); }
      }
      try { if (ctx && typeof brwAnnounce === 'function') brwAnnounce(ctx); } catch (e) {}
      info = computeShort(exam);
    }
    return info;
  }

  /* ---- hộp thoại: nêu rõ thiếu gì, vì sao ---- */
  function reasonFor(c) {
    var pool = bank(), n = 0;
    pool.forEach(function (q) {
      if (q && !q._borrowed && String(q.grade) === c.grade && String(q.chapter) === c.chapter && lessonOfQ(q) === String(c.lesson) &&
          nType(q.type) === c.type && String(q.level || '').toUpperCase() === c.level) n++;
    });
    if (!hasToken()) return 'ngân hàng chỉ có ' + n + ' câu loại này, mượn câu không đủ, và AI KHÔNG chạy vì chưa đăng nhập Admin';
    if (window.AI_FILL_ENABLED === false) return 'ngân hàng chỉ có ' + n + ' câu, AI đang tắt (AI_FILL_ENABLED = false)';
    return 'ngân hàng có ' + n + ' câu, mượn và AI đều không bù được (xem Console / báo cáo AI để biết máy chủ loại câu vì sao)';
  }
  function dialog(info, title, extra) {
    return new Promise(function (resolve) {
      var rows = ['multipleChoice', 'trueFalse', 'essay', 'essay_multi'].filter(function (t) { return info.wantT[t] || info.gotT[t]; }).map(function (t) {
        var w = info.wantT[t] || 0, g = info.gotT[t] || 0;
        return '<tr style="' + (g < w ? 'background:#fecaca;font-weight:700' : '') + '"><td>' + esc(tName(t)) + '</td><td>' + w + '</td><td>' + g + '</td><td>' + (g < w ? 'thiếu ' + (w - g) : '✓') + '</td></tr>';
      }).join('');
      var cells = info.short.map(function (c) {
        return '<li><b>' + esc(c.label) + ' · ' + esc(tName(c.type)) + ' · ' + esc(LV[c.level] || c.level) + '</b>: cần ' + c.need + ', đề có ' + c.got + ' — ' + esc(reasonFor(c)) + '</li>';
      }).join('');
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:12px;';
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;color:#222;max-width:720px;width:100%;max-height:92vh;overflow:auto;border-radius:14px;padding:18px 22px;border-top:6px solid #dc2626;text-align:left;font-size:14px;line-height:1.5;';
      box.innerHTML = '<h3 style="margin:0 0 8px;color:#b91c1c">❌ ' + esc(title) + '</h3>' +
        '<table style="border-collapse:collapse;margin:6px 0"><tr><th style="border:1px solid #ddd;padding:3px 10px">Loại câu</th><th style="border:1px solid #ddd;padding:3px 10px">Ma trận</th><th style="border:1px solid #ddd;padding:3px 10px">Đề</th><th style="border:1px solid #ddd;padding:3px 10px"></th></tr>' +
        rows.replace(/<td>/g, '<td style="border:1px solid #ddd;padding:3px 10px;text-align:center">') + '</table>' +
        '<ul style="margin:6px 0 6px 18px;padding:0">' + cells + '</ul>' +
        (extra ? '<div style="background:#fff3cd;border-radius:8px;padding:8px 10px;margin:6px 0">' + extra + '</div>' : '') +
        '<div style="margin-top:10px"></div>';
      var b1 = document.createElement('button'), b2 = document.createElement('button');
      b1.textContent = 'Dừng, tôi sẽ xử lí rồi xuất lại'; b2.textContent = 'Vẫn xuất đề thiếu câu';
      b1.style.cssText = 'background:#dc2626;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;margin-right:8px;';
      b2.style.cssText = 'background:#6b7280;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer;';
      b1.onclick = function () { ov.remove(); resolve(false); };
      b2.onclick = function () { ov.remove(); resolve(true); };
      box.appendChild(b1); box.appendChild(b2); ov.appendChild(box); document.body.appendChild(ov);
    });
  }
  function stopError(info) {
    var e = new Error('Đã dừng xuất đề: còn thiếu ' + info.short.reduce(function (s, c) { return s + (c.need - c.got); }, 0) + ' câu so với ma trận.');
    e.__examguard = true; return e;
  }

  async function ensureFull(exam, code) {
    var info = computeShort(exam);
    if (!info || !info.short.length) { try { renumber(exam); } catch (e) {} return; }
    info = await repair(exam);
    try { renumber(exam); } catch (e) {}
    try { if (window.AIPROG && window.AIPROG.reconcile) window.AIPROG.reconcile(exam, code); } catch (e) {}
    if (!info || !info.short.length) return;
    if (state.choice === 'go') return;
    var extra = !hasToken() ? '👉 Đăng nhập <b>Admin</b> rồi xuất lại để AI tự tạo câu còn thiếu.' : (state.log.length ? esc(state.log.slice(0, 3).join(' | ')) : '');
    var go = await dialog(info, 'Đề gốc ' + (code || '') + ' CÒN THIẾU CÂU so với ma trận', extra);
    if (go) { state.choice = 'go'; return; }
    throw stopError(info);
  }

  /* ---- móc vào hàm của trang ---- */
  function wrap(name, make) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__exg) return false;
    var w = make(orig); w.__exg = true; window[name] = w; return true;
  }
  function install() {
    var a = wrap('generateOriginalExamFromMatrix', function (orig) {
      return async function (code) {
        var ex = await orig.apply(this, arguments);
        try { await ensureFull(ex, code); } catch (e) { if (e && e.__examguard) throw e; console.warn('EXAMGUARD:', e); }
        return ex;
      };
    });
    var b = wrap('generateCompleteExamPackage', function (orig) {
      return async function () {
        state.choice = null; state.log = [];
        var res = await orig.apply(this, arguments);
        try {
          var bad = null;
          (res || []).forEach(function (ex) { if (bad || ex.isShuffled) return; var i = computeShort(ex); if (i && i.short.length) bad = i; });
          if (bad && state.choice !== 'go') {
            var go = await dialog(bad, 'Sau bước kiểm tra hình / AI cân bằng đề, đề lại bị THIẾU CÂU', 'Hai bước đó có thể đã bỏ câu (thiếu hình, trùng đề). Xem Báo cáo AI để biết câu nào bị thay/bỏ.');
            if (!go) throw stopError(bad);
            state.choice = 'go';
          }
        } catch (e) { if (e && e.__examguard) throw e; console.warn('EXAMGUARD cuối:', e); }
        return res;
      };
    });
    return a && b;
  }
  window.EXAMGUARD = { computeShort: computeShort, repair: repair, ensureFull: ensureFull, state: state };
  var tries = 0;
  (function go() {
    var ok = false;
    try { ok = install(); } catch (e) { console.warn('exam_fill_guard:', e); }
    if (!ok && ++tries < 40) setTimeout(go, 500);
    else if (!ok) console.warn('exam_fill_guard.js: không tìm thấy generateOriginalExamFromMatrix/generateCompleteExamPackage.');
  })();
})();
