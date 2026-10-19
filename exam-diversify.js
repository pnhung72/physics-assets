/*! exam-diversify.js v1.0
 *  Đa dạng hóa câu hỏi giữa các ĐỀ GỐC trong "Tải Gói Đề (Word)".
 *
 *  Vấn đề: ngân hàng chỉ có 1 câu cho một ô (bài × loại × mức) -> đề gốc nào cũng lấy đúng câu đó
 *  (hoặc cùng một câu mượn) -> các đề gốc giống hệt nhau ở ô ấy, mà aiBalanceExams lại coi
 *  "giống hệt" là "tương đương" nên bỏ qua.
 *
 *  Giải pháp (chạy SAU aiBalanceExams, TRƯỚC khi xáo ra các mã đề):
 *   1) Tìm câu trùng giữa các đề gốc khác nhau (so theo câu gốc: ID, hoặc _srcId với câu mượn).
 *   2) Cách 1: ngân hàng còn câu khác cùng ô, chưa dùng -> thay (dùng aiFindReplacement có sẵn).
 *   3) Cách 2: không còn -> AI viết >= 3 phương án đổi số liệu/tình huống cho mỗi câu cần đổi,
 *      từng phương án được AI TỰ GIẢI LẠI (không xem đáp án) và chỉ nhận khi khớp đáp án đã gán,
 *      đồng thời phải khác câu gốc và khác các biến thể khác.
 *   4) Không làm được -> giữ nguyên và ghi vào báo cáo.
 *  Các mã đề cùng một đề gốc vẫn giống nhau (chỉ xáo thứ tự) như yêu cầu.
 *
 *  Gọi từ trang chính (xem HUONG_DAN_TICH_HOP.md):
 *     await window.dvDiversify(originals, rep, { ...các hàm của trang... });
 */
(function (global) {
  'use strict';

  var CFG = Object.assign({
    TRIES_PER_NEED: 3,     // mỗi câu cần đổi: AI viết ít nhất ngần này phương án để chọn
    MAX_CANDIDATES: 8,     // tối đa số phương án xin AI trong 1 lần gọi
    MAX_ROUNDS: 2,         // số vòng xin thêm nếu chưa đủ biến thể đạt
    GAP_MS: 1500,          // nghỉ giữa các lần gọi AI (tránh 429)
    PREFER_BANK: true,     // ưu tiên thay bằng câu khác trong ngân hàng trước khi nhờ AI
    NUM_JACCARD_MAX: 0.5,  // hai câu có tập số liệu giống nhau quá mức này => coi là chưa đổi
    TEXT_JACCARD_MAX: 0.8  // câu không có số: độ giống từ ngữ tối đa
  }, global.DV_CFG || {});
  global.DV_CFG = CFG;
  global.DV_LAST_VARIANTS = [];

  var PARTS = ['I', 'II', 'III', 'IV'];

  /* ---------- tiện ích ---------- */
  function dvBase(q) {
    return String(q._srcId || q.ID).replace(/_AI\d+$/, '');
  }
  function dvText(H, q) {
    var o = H.aiFull(q);
    delete o.id;
    return JSON.stringify(o);
  }
  function dvNums(s) {
    return (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map(function (x) { return x.replace(',', '.'); });
  }
  function dvJaccard(a, b) {
    var A = new Set(a), B = new Set(b);
    if (!A.size && !B.size) return 1;
    var inter = 0;
    A.forEach(function (x) { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }
  function dvWords(s) {
    return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean);
  }
  // true nếu hai câu (dạng chuỗi) còn quá giống nhau
  function dvSimilar(a, b) {
    if (a === b) return true;
    var na = dvNums(a), nb = dvNums(b);
    if (new Set(na).size >= 2 || new Set(nb).size >= 2) return dvJaccard(na, nb) > CFG.NUM_JACCARD_MAX;
    return dvJaccard(dvWords(a), dvWords(b)) > CFG.TEXT_JACCARD_MAX;
  }
  function dvShape(H, refQ) {
    var type = H.examTypeOf(refQ);
    if (type === 'multipleChoice') return '{"de":"...","lua_chon":["...", ... đúng ' + (refQ.choices || []).length + ' phương án theo thứ tự cũ],"loi_giai":"giải ngắn"}';
    if (type === 'trueFalse') return '{"de":"...","cac_y":["...", ... đúng ' + (refQ.subQuestions || []).length + ' ý theo thứ tự cũ],"loi_giai":"giải ngắn"}';
    if (type === 'essay') return '{"de":"...","dap_an":"...","loi_giai":"giải ngắn"}';
    if (type === 'essay_multi') return '{"de":"...","cac_phan":{' + Object.keys(refQ.parts || {}).sort().map(function (k) { return '"' + k + '":{"de":"...","dap_an":"..."}'; }).join(',') + '},"loi_giai":"giải ngắn"}';
    return null;
  }

  /* ---------- xin AI n phương án biến thể ---------- */
  async function dvAsk(H, refQ, n, avoidTexts) {
    var shape = dvShape(H, refQ);
    if (!shape) return { fail: 'loại câu chưa hỗ trợ' };
    var avoid = '';
    if (avoidTexts.length) {
      var nums = avoidTexts.map(function (t) { return '[' + dvNums(t).slice(0, 12).join(', ') + ']'; }).join(' ; ');
      avoid = '\n\nBỘ SỐ LIỆU ĐÃ DÙNG Ở CÁC ĐỀ KHÁC (phải khác hẳn, không lặp lại): ' + nums;
    }
    var prompt =
      'Bạn là giáo viên Vật lí giàu kinh nghiệm. Hãy viết ' + n + ' CÂU BIẾN THỂ KHÁC NHAU ĐÔI MỘT của câu gốc dưới đây.\n' +
      '- Giữ nguyên dạng bài, kiến thức, độ khó, số bước giải, đơn vị và CÁCH VIẾT CÔNG THỨC (LaTeX/ký hiệu như câu gốc).\n' +
      '- ĐỔI TẤT CẢ số liệu chính (không chỉ đổi một số), có thể đổi vật thể/tình huống nhưng không đổi dạng bài. Câu lí thuyết không có số thì đổi cách hỏi, ví dụ, mệnh đề.\n' +
      '- Tự giải lại cẩn thận để đáp án chính xác; số liệu phải hợp lí về vật lí.\n' +
      '- Trắc nghiệm nhiều lựa chọn: phương án ĐÚNG phải nằm ĐÚNG VỊ TRÍ cũ; các phương án nhiễu hợp lí.\n' +
      '- Đúng/Sai: mỗi ý giữ nguyên Đúng/Sai theo đúng thứ tự cũ.\n' +
      '- Không dùng hình vẽ, đồ thị, bảng.\n' +
      'Trả lời CHỈ một JSON array gồm đúng ' + n + ' phần tử, mỗi phần tử đúng dạng: ' + shape +
      '\n\nCÂU GỐC:\n' + JSON.stringify(H.aiFull(refQ)) + avoid;
    var out = await H.aiGemini(prompt);
    var list = Array.isArray(out) ? out : (out && Array.isArray(out.items) ? out.items : (out ? [out] : []));
    return { list: list };
  }

  // Trả về { ok:[câu biến thể đã được AI tự giải lại và khớp], why:'lí do nếu thiếu' }
  async function dvVariants(H, refQ, want, usedTexts) {
    var ok = [], why = '', seen = usedTexts.slice();
    if (H.aiHasFigure(refQ)) return { ok: ok, why: 'câu có hình/đồ thị/bảng nên AI không đổi số liệu được' };
    for (var round = 0; round < CFG.MAX_ROUNDS && ok.length < want; round++) {
      var n = Math.min(CFG.MAX_CANDIDATES, Math.max(3, (want - ok.length) * CFG.TRIES_PER_NEED));
      var res;
      try { res = await dvAsk(H, refQ, n, seen); }
      catch (e) { why = e.message || String(e); break; }
      if (res.fail) { why = res.fail; break; }
      for (var i = 0; i < res.list.length && ok.length < want; i++) {
        var item = res.list[i];
        var c = H.aiApplyVariant(refQ, item);
        if (!c) { why = 'AI trả về dữ liệu sai cấu trúc'; continue; }
        var t = dvText(H, c);
        if (seen.some(function (s) { return dvSimilar(s, t); })) { why = 'biến thể còn giống câu đã có'; continue; }
        var pass = false;
        try { await H.aiSleep(CFG.GAP_MS); pass = await H.aiVerifyVariant(c); }
        catch (e2) { why = e2.message || String(e2); break; }
        if (!pass) { why = 'AI tự giải lại ra đáp án khác đáp án đã gán'; continue; }
        c._sol = item.loi_giai;
        c._dv = true;
        ok.push(c); seen.push(t);
      }
    }
    return { ok: ok, why: ok.length >= want ? '' : why };
  }

  /* ---------- HÀM CHÍNH ---------- */
  async function dvDiversify(originals, rep, H) {
    rep = rep || {};
    ['replaced', 'variants', 'unfixed'].forEach(function (k) { rep[k] = rep[k] || []; });
    if (!originals || originals.length < 2) return rep;

    var first = new Map();   // câu gốc -> { q, ei }
    var dups = [];
    var usedIds = new Set();
    originals.forEach(function (ex) {
      PARTS.forEach(function (p) {
        (ex.parts[p] || []).forEach(function (q) { if (q && q.ID != null) usedIds.add(String(q.ID)); });
      });
    });
    originals.forEach(function (ex, ei) {
      PARTS.forEach(function (p) {
        (ex.parts[p] || []).forEach(function (q, idx) {
          if (!q || q.ID == null) return;
          var b = dvBase(q), f = first.get(b);
          if (!f) { first.set(b, { q: q, ei: ei }); return; }
          if (f.ei === ei) return;                       // cùng một đề gốc: không phải trùng
          dups.push({ ex: ex, ei: ei, part: p, idx: idx, q: q, base: b, refQ: f.q });
        });
      });
    });
    if (!dups.length) return rep;

    var where = function (d) { return 'Mã đề ' + d.ex.code + ', câu ' + d.q.number; };
    var noKey = !!(rep.skipped && /API key/i.test(rep.skipped));
    if (noKey) {
      rep.skipped = '';
      rep.unfixed.push('Chưa có API key Gemini nên chưa đổi được ' + dups.length + ' câu trùng giữa các đề gốc:');
      dups.forEach(function (d) { rep.unfixed.push(where(d) + ': trùng câu ' + d.base + ' với đề gốc đầu'); });
      return rep;
    }

    var groups = new Map();
    dups.forEach(function (d) {
      if (!groups.has(d.base)) groups.set(d.base, []);
      groups.get(d.base).push(d);
    });

    var gi = 0;
    for (var entry of groups) {
      var base = entry[0], list = entry[1], refQ = list[0].refQ, todo = list.slice();
      gi++;
      H.showNotification('🧬 Đa dạng hóa câu ' + base + ' (' + gi + '/' + groups.size + '): cần ' + todo.length + ' câu khác...', 'info');

      // Cách 1: câu khác trong ngân hàng, cùng ô ma trận, chưa dùng ở đề gốc nào
      if (CFG.PREFER_BANK) {
        for (var k = todo.length - 1; k >= 0; k--) {
          var d = todo[k];
          if (!d.q._slot || !H.aiFindReplacement) continue;
          try {
            var ref = H.getRating(refQ.ID) || { kho: 5, dang: 'khac' };
            var cand = await H.aiFindReplacement(d.q._slot, ref, usedIds);
            if (cand) {
              d.ex.parts[d.part][d.idx] = H.aiBuildExamQuestion(cand, d.q, 'replaced');
              usedIds.add(String(cand.ID));
              rep.replaced.push(where(d) + ': thay câu trùng ' + d.base + ' bằng câu ' + cand.ID + ' trong ngân hàng');
              todo.splice(k, 1);
            }
          } catch (e) { break; }
        }
      }
      if (!todo.length) continue;

      // Cách 2: AI đổi số liệu/tình huống, >= 3 phương án cho mỗi câu cần đổi, AI tự giải lại để kiểm
      var res = await dvVariants(H, refQ, todo.length, [dvText(H, refQ)]);
      todo.forEach(function (d, i) {
        var v = res.ok[i];
        if (v) {
          d.ex.parts[d.part][d.idx] = H.aiBuildExamQuestion(v, d.q, 'variant', v._sol);
          global.DV_LAST_VARIANTS.push(v);
          rep.variants.push(where(d) + ': câu ' + d.base + ' trùng đề gốc đầu → AI đổi thành ' + v.ID + ' (AI đã tự giải lại và khớp đáp án)');
        } else {
          rep.unfixed.push(where(d) + ': vẫn trùng câu ' + d.base + ' với đề gốc đầu. Lí do: ' + (res.why || 'không tạo đủ biến thể') + '. Nên thêm câu vào ngân hàng cho ô này.');
        }
      });
    }
    return rep;
  }

  // Tải các biến thể AI vừa tạo (JSON) để đưa vào ngân hàng sau khi đã tự kiểm tra
  function dvDownloadVariants() {
    var data = JSON.stringify(global.DV_LAST_VARIANTS, null, 2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'Bien_the_AI_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  global.dvDiversify = dvDiversify;
  global.dvDownloadVariants = dvDownloadVariants;
  global.dvFindSimilar = dvSimilar;
})(window);
