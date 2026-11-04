/* kscl-rewrite.js v1.0
   Gắn thêm window.KSCL.rewrite(originals, pick, cfg) cho kscl-adjust.js.
   Dùng lại các hàm AI sẵn có của TestOline2: aiGemini, aiFull, aiHasFigure, aiApplyVariant,
   aiVerifyVariant, aiBuildExamQuestion. Mỗi câu: AI viết lại dễ hơn -> AI tự giải lại để kiểm đáp án
   -> đạt thì thay câu, không đạt thì GIỮ NGUYÊN câu gốc. Không bao giờ ném lỗi ra ngoài. */
(function () {
  'use strict';
  var PARTS = ['I', 'II', 'III', 'IV'];
  var CONCURRENCY = 3;       // số câu gọi AI song song
  var MAX_CONSEC_FAIL = 5;   // lỗi liên tiếp quá số này thì dừng (tránh đốt quota Gemini)
  var TYPES = ['multipleChoice', 'trueFalse', 'essay', 'essay_multi'];

  var RULES = {
    nhe: 'GIẢM NHẸ: dùng số liệu tròn, dễ tính hơn; bỏ các dữ kiện gây rối; lời dẫn rõ ràng hơn; ' +
         'nếu có bước tính phụ thì làm gọn lại. Số bước giải giảm khoảng 0-1 bước.',
    vua: 'GIẢM VỪA: số liệu đẹp, dễ tính nhẩm; giảm khoảng 1 bước giải; nêu rõ đại lượng/công thức cần dùng ' +
         'trong lời dẫn; phương án nhiễu (nếu có) ít gây nhầm lẫn hơn.',
    nhieu: 'GIẢM NHIỀU: số liệu rất đẹp, ít bước nhất có thể nhưng vẫn đúng bài/đúng kiến thức; ' +
           'lời dẫn gợi ý hướng làm; phương án nhiễu khác biệt rõ ràng; tránh bẫy đơn vị hoặc đổi đơn vị phức tạp.'
  };

  function note(msg, type) {
    if (typeof showNotification === 'function') showNotification(msg, type || 'info');
    else console.log('[KSCL]', msg);
  }

  // Lấy các hàm của TestOline2 tại thời điểm gọi (không phải lúc nạp file)
  function api() {
    var A = {}, missing = [];
    function pick(name, v) { if (typeof v === 'function') A[name] = v; else missing.push(name); }
    pick('aiGemini', typeof aiGemini === 'function' ? aiGemini : null);
    pick('aiGetKey', typeof aiGetKey === 'function' ? aiGetKey : null);
    pick('examTypeOf', typeof examTypeOf === 'function' ? examTypeOf : null);
    pick('aiFull', typeof aiFull === 'function' ? aiFull : null);
    pick('aiHasFigure', typeof aiHasFigure === 'function' ? aiHasFigure : null);
    pick('aiApplyVariant', typeof aiApplyVariant === 'function' ? aiApplyVariant : null);
    pick('aiVerifyVariant', typeof aiVerifyVariant === 'function' ? aiVerifyVariant : null);
    pick('aiBuildExamQuestion', typeof aiBuildExamQuestion === 'function' ? aiBuildExamQuestion : null);
    A.missing = missing;
    return A;
  }

  function shapeOf(q, type) {
    if (type === 'multipleChoice')
      return '{"de":"...","lua_chon":["...", ... đúng ' + (q.choices || []).length + ' phương án theo thứ tự cũ],"loi_giai":"giải ngắn"}';
    if (type === 'trueFalse')
      return '{"de":"...","cac_y":["...", ... đúng ' + (q.subQuestions || []).length + ' ý theo thứ tự cũ],"loi_giai":"giải ngắn"}';
    if (type === 'essay')
      return '{"de":"...","dap_an":"...","loi_giai":"giải ngắn"}';
    return '{"de":"...","cac_phan":{' + Object.keys(q.parts || {}).sort().map(function (k) {
      return '"' + k + '":{"de":"...","dap_an":"..."}';
    }).join(',') + '},"loi_giai":"giải ngắn"}';
  }

  function classContext(pick) {
    var t = pick.tyLePhanTram || {};
    return 'Lớp ' + pick.lop + ', điểm TB bài khảo sát đầu năm ' + pick.diemTB +
      '; Giỏi ' + t.gioi + '%, Khá ' + t.kha + '%, TB ' + t.tb + '%, Yếu ' + t.yeu + '%, Kém ' + t.kem + '%.';
  }

  function buildPrompt(A, q, type, pick, level) {
    return 'Bạn là giáo viên Vật lí giàu kinh nghiệm. Hãy VIẾT LẠI câu gốc dưới đây thành một câu DỄ HƠN ' +
      'để phù hợp với lớp có năng lực thấp hơn mặt bằng chung.\n' +
      'THỐNG KÊ LỚP: ' + classContext(pick) + '\n' +
      'MỨC ĐIỀU CHỈNH: ' + RULES[level] + '\n' +
      'BẮT BUỘC:\n' +
      '- Giữ nguyên bài học, kiến thức trọng tâm, dạng câu hỏi, số phương án/số ý và MỨC NHẬN THỨC của câu gốc ' +
      '(câu Biết vẫn là Biết, Hiểu vẫn là Hiểu, Vận dụng vẫn là Vận dụng; chỉ nhẹ đi, KHÔNG hạ cấp mức).\n' +
      '- Giữ nguyên CÁCH VIẾT CÔNG THỨC (LaTeX/ký hiệu như câu gốc) và đơn vị chuẩn.\n' +
      '- Tự giải lại cẩn thận để đáp án chính xác; số liệu hợp lí về vật lí; đề không mâu thuẫn.\n' +
      '- Trắc nghiệm nhiều lựa chọn: phương án ĐÚNG phải nằm ĐÚNG VỊ TRÍ cũ, các phương án nhiễu hợp lí.\n' +
      '- Đúng/Sai: mỗi ý giữ nguyên Đúng/Sai theo đúng thứ tự cũ.\n' +
      '- Không dùng hình vẽ, đồ thị, bảng.\n' +
      'Trả lời CHỈ một JSON đúng dạng: ' + shapeOf(q, type) + '\n\nCÂU GỐC:\n' + JSON.stringify(A.aiFull(q));
  }

  // Nhãn trong file Word cho câu do KSCL sửa (nếu bật AI_MARK_IN_WORD)
  function patchMark() {
    try {
      var orig = window.aiMarkTag;
      if (typeof orig !== 'function' || orig.__kscl) return;
      var w = function (q) {
        if (q && q._ai === 'kscl') {
          var on = (typeof AI_MARK_IN_WORD !== 'undefined') && AI_MARK_IN_WORD;
          return on ? '<span style="color:#c00000;font-size:10pt;font-weight:bold;">[AI-giảm độ khó]</span> ' : '';
        }
        return orig.apply(this, arguments);
      };
      w.__kscl = true;
      window.aiMarkTag = w;
    } catch (e) {}
  }

  async function rewrite(originals, pick, cfg) {
    var A = api();
    if (A.missing.length) {
      var m = 'thiếu hàm của TestOline2: ' + A.missing.join(', ');
      note('⚠️ KSCL: ' + m + ' — giữ nguyên đề gốc.', 'warning');
      return { error: m };
    }
    if (!A.aiGetKey()) {
      note('⚠️ KSCL: chưa có API key Gemini nên chưa giảm độ khó được — xuất đề như cũ.', 'warning');
      return { skipped: 'không có API key' };
    }
    var level = pick && pick.mucGiam;
    if (!RULES[level]) return { skipped: 'mức điều chỉnh: ' + level };
    if (!Array.isArray(originals) || !originals.length) return { skipped: 'không có đề gốc' };
    patchMark();

    // 1) gom các câu cần sửa
    var tasks = [], skipFig = 0, skipType = 0;
    originals.forEach(function (ex, ei) {
      PARTS.forEach(function (p) {
        var arr = (ex && ex.parts && ex.parts[p]) || [];
        arr.forEach(function (q, idx) {
          if (!q || typeof q !== 'object') return;
          var type;
          try { type = A.examTypeOf(q); } catch (e) { type = null; }
          if (TYPES.indexOf(type) < 0) { skipType++; return; }
          var fig = false;
          try { fig = A.aiHasFigure(q); } catch (e) {}
          if (fig) { skipFig++; return; }
          tasks.push({ ex: ex, ei: ei, p: p, idx: idx, q: q, type: type });
        });
      });
    });
    if (!tasks.length) {
      note('ℹ️ KSCL: không có câu nào đủ điều kiện để giảm độ khó.', 'info');
      return { lop: pick.lop, mucGiam: level, rewritten: 0, skippedFigure: skipFig, skippedType: skipType };
    }
    note('🎯 KSCL: AI đang giảm độ khó ' + tasks.length + ' câu cho lớp ' + pick.lop +
         ' (' + level + '). Vui lòng đợi, có thể mất vài phút...', 'info');

    // 2) xử lý từng câu
    var cache = {}, changes = [], done = 0, fail = 0, consec = 0, aborted = false, next = 0, finished = 0;

    async function doOne(t) {
      var key = String(t.q.ID);
      var chosen = null, out = cache[key];
      if (out) {
        chosen = A.aiApplyVariant(t.q, out);
      } else {
        for (var attempt = 0; attempt < 2 && !chosen; attempt++) {
          var o = await A.aiGemini(buildPrompt(A, t.q, t.type, pick, level));
          var c = A.aiApplyVariant(t.q, o);
          if (!c) continue;
          var ok = await A.aiVerifyVariant(c);   // AI tự giải lại, so với đáp án đã gán
          if (ok) { chosen = c; out = o; }
        }
        if (chosen) cache[key] = out;
      }
      if (!chosen) return false;
      var nq = A.aiBuildExamQuestion(chosen, t.q, 'kscl', (out && out.loi_giai) || '');
      var before = t.q.mainQuestion || t.q.question || '';
      t.ex.parts[t.p][t.idx] = nq;
      changes.push({ de: t.ei + 1, phan: t.p, cau: t.q.number, truoc: before, sau: nq.mainQuestion || nq.question || '' });
      return true;
    }

    async function worker() {
      while (!aborted) {
        var k = next++;
        if (k >= tasks.length) return;
        var okk = false;
        try { okk = await doOne(tasks[k]); }
        catch (e) { console.warn('[KSCL] câu lỗi:', e); }
        if (okk) { done++; consec = 0; } else { fail++; consec++; }
        finished++;
        if (consec >= MAX_CONSEC_FAIL) aborted = true;
        if (finished % 10 === 0) note('🎯 KSCL: đã xử lý ' + finished + '/' + tasks.length + ' câu...', 'info');
      }
    }
    var workers = [];
    for (var w = 0; w < CONCURRENCY; w++) workers.push(worker());
    await Promise.all(workers);

    window.KSCL_CHANGES = changes;   // xem lại bằng console: console.table(KSCL_CHANGES)
    var rep = { lop: pick.lop, mucGiam: level, rewritten: done, failed: fail,
                untouched: Math.max(0, tasks.length - finished), aborted: aborted,
                skippedFigure: skipFig, skippedType: skipType };
    window.KSCL_REPORT = rep;
    if (aborted) {
      note('⚠️ KSCL: gặp lỗi AI liên tiếp nên dừng sớm. Đã giảm độ khó ' + done + ' câu, các câu còn lại giữ nguyên.', 'warning');
    } else {
      note('✅ KSCL: đã giảm độ khó ' + done + '/' + tasks.length + ' câu cho lớp ' + pick.lop +
           (fail ? ' (' + fail + ' câu không qua kiểm đáp án nên giữ nguyên)' : '') +
           (skipFig ? '; ' + skipFig + ' câu có hình/bảng giữ nguyên' : '') + '.', 'success');
    }
    return rep;
  }

  // kscl-adjust.js có thể nạp sau file này, nên chờ window.KSCL xuất hiện rồi gắn rewrite
  function attach() {
    if (!window.KSCL) return false;
    window.KSCL.rewrite = rewrite;
    window.KSCL.rewriteVersion = '1.0';
    return true;
  }
  if (!attach()) {
    var n = 0, timer = setInterval(function () {
      if (attach() || ++n > 300) clearInterval(timer);
    }, 100);
  }
})();
