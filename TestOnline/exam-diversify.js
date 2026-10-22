/*! exam-diversify.js v1.1
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
 *  v1.1 (đọc kèm TestOline59):
 *   - Phát hiện trùng theo NỘI DUNG (không chỉ theo mã câu): biến thể đã đổi số liệu không bị coi là trùng nữa.
 *   - Cách 1b: dùng lại biến thể AI đã lưu ở các lần xuất trước (aiVbTake) -> không tốn lượt AI.
 *   - Biến thể AI mới được lưu vào kho (aiVbRemember, có lọc trùng) và đẩy lên ngân hàng (aiVbSync).
 *   - PHẦN 2 (cuối file): bản vá chống trùng cho aiBalanceExams / aiVb... của trang, thay cho file ai-variant-guard.js.
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
  // hai câu có cùng NỘI DUNG không? (cùng mã thì chắc chắn cùng; khác mã chỉ cùng khi còn quá giống)
  function dvSameContent(H, a, b) {
    if (a === b || (a.ID != null && String(a.ID) === String(b.ID))) return true;
    try { return dvSimilar(dvText(H, a), dvText(H, b)); } catch (e) { return true; }
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

    var first = new Map();   // mã câu gốc -> [{ q, ei }] các câu KHÁC NỘI DUNG đã thấy (phần tử đầu = câu chuẩn)
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
          var b = dvBase(q), arr = first.get(b);
          if (!arr) { first.set(b, [{ q: q, ei: ei }]); return; }
          var hit = arr.find(function (x) { return x.ei !== ei && dvSameContent(H, x.q, q); });
          if (hit) dups.push({ ex: ex, ei: ei, part: p, idx: idx, q: q, base: b, refQ: arr[0].q });   // trùng nội dung với câu ở đề gốc khác
          else if (!arr.some(function (x) { return x.ei === ei; })) arr.push({ q: q, ei: ei });         // khác nội dung (vd. biến thể đã đổi số liệu) -> không phải trùng
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

    var gi = 0, savedN = 0;
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

      // văn bản các câu cùng gốc đang có trong các đề gốc: biến thể mới phải khác hết
      var seedTexts = (first.get(base) || []).map(function (x) { return dvText(H, x.q); });
      if (!seedTexts.length) seedTexts = [dvText(H, refQ)];

      // Cách 1b: dùng lại biến thể AI đã lưu từ các lần xuất trước (đã lọc trùng khi lưu) -> khỏi hỏi AI
      if (typeof global.aiVbTake === 'function') {
        for (var guard = 0; guard < 40 && todo.length; guard++) {
          var got = null;
          try { got = global.aiVbTake(refQ, usedIds); } catch (e3) { got = null; }
          if (!got) break;
          var gt = dvText(H, got);
          if (seedTexts.some(function (s) { return dvSimilar(s, gt); })) continue;     // gần giống câu đang có -> bỏ cái này, lấy cái khác
          var dd = todo.pop();
          dd.ex.parts[dd.part][dd.idx] = H.aiBuildExamQuestion(got, dd.q, 'variant', got._sol);
          seedTexts.push(gt);
          rep.variants.push(where(dd) + ': câu ' + dd.base + ' trùng đề gốc đầu → dùng lại câu biến thể đã lưu ' + got.ID + ' (không tốn lượt AI)');
        }
        if (!todo.length) continue;
      }

      // Cách 2: AI đổi số liệu/tình huống, >= 3 phương án cho mỗi câu cần đổi, AI tự giải lại để kiểm
      var res = await dvVariants(H, refQ, todo.length, seedTexts);
      todo.forEach(function (d, i) {
        var v = res.ok[i];
        if (v) {
          d.ex.parts[d.part][d.idx] = H.aiBuildExamQuestion(v, d.q, 'variant', v._sol);
          global.DV_LAST_VARIANTS.push(v);
          var note = 'AI đã tự giải lại và khớp đáp án';
          if (typeof global.aiVbRemember === 'function') {        // lưu vào kho (có lọc trùng); không lưu vẫn dùng được trong đề
            var sv = global.aiVbRemember(refQ, v, v._sol);
            if (sv.vid) { usedIds.add(sv.vid); savedN++; note += '; đã lưu để dùng lại'; }
            else note += '; KHÔNG lưu vào kho (' + sv.why + ')';
          }
          rep.variants.push(where(d) + ': câu ' + d.base + ' trùng đề gốc đầu → AI đổi thành ' + v.ID + ' (' + note + ')');
        } else {
          rep.unfixed.push(where(d) + ': vẫn trùng câu ' + d.base + ' với đề gốc đầu. Lí do: ' + (res.why || 'không tạo đủ biến thể') + '. Nên thêm câu vào ngân hàng cho ô này.');
        }
      });
    }
    if (typeof global.aiVbSync === 'function') {                 // đẩy biến thể mới lên ngân hàng (cần đã đăng nhập Admin)
      try {
        var sy = await global.aiVbSync();
        if (sy.saved) H.showNotification('💾 Đã lưu ' + sy.saved + ' câu biến thể AI vào ngân hàng (task AI) để lần sau dùng lại.', 'success');
        else if (sy.skipped && sy.pending) H.showNotification('💾 Có ' + sy.pending + ' câu biến thể đang lưu tạm trong trình duyệt. Đăng nhập Admin rồi gõ aiVbSync() ở Console để đẩy lên ngân hàng.', 'info');
        if (sy.errors && sy.errors.length) console.warn('aiVbSync lỗi:', sy.errors);
      } catch (e4) { console.warn('aiVbSync:', e4); }
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

/* =====================================================================================
   PHẦN 2 — bản vá chống trùng câu cho TestOline59 (thay cho file ai-variant-guard.js)
   Ghi đè 7 hàm của trang: aiVbStore, aiVbWhy, aiVbBankDup, aiVbLocalDup (mới), aiVbRemember, aiMakeVariant, aiBalanceExams.
   Chống trùng: (1) giữa các mã đề trong cùng lần xuất, (2) với biến thể đã lưu của câu gốc khác cùng bài,
   (3) câu Đúng/Sai lí thuyết chỉ đổi câu chữ thì không lưu, (4) kho đầy thì bỏ cái đã lên ngân hàng trước.
   Tự kiểm tra: nếu hàm gốc trong trang KHÔNG phải bản TestOline59 thì không ghi đè.
   Kiểm tra bằng Console:  AI_GUARD_STATUS  ->  'applied' | 'skipped:...'
   ===================================================================================== */
(function () {
   'use strict';
   var NEED = ['aiVbStore', 'aiVbWhy', 'aiVbBankDup', 'aiVbRemember', 'aiMakeVariant', 'aiBalanceExams', 'aiVbLoad', 'aiVbBankPool', 'aiHash', 'aiGemini', 'aiRate'];
   var EXPECT_FP = 'ou1q92';   // dấu vân tay của 6 hàm gốc trong TestOline59
   function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
   function skip(why) { window.AI_GUARD_STATUS = 'skipped:' + why; console.warn('[ai-variant-guard] KHÔNG áp dụng — ' + why); }
   if (window.AI_GUARD_STATUS === 'applied') return;
   for (var i = 0; i < NEED.length; i++) if (typeof window[NEED[i]] !== 'function') return skip('thiếu hàm ' + NEED[i] + ' (trang chưa phải bản 59?)');
   try { if (typeof AI_CACHE === 'undefined' || typeof AI_VB_KEY === 'undefined' || typeof AI_VB_MAX === 'undefined') return skip('thiếu biến AI_CACHE / AI_VB_KEY / AI_VB_MAX'); } catch (e) { return skip('thiếu biến dùng chung'); }
   var cur = ['aiVbStore', 'aiVbWhy', 'aiVbBankDup', 'aiVbRemember', 'aiMakeVariant', 'aiBalanceExams'].map(function (k) { return String(window[k]).replace(/\s+/g, ''); }).join('|');
   if (hash(cur) !== EXPECT_FP && !window.AI_GUARD_FORCE) return skip('các hàm trong trang đã khác bản 59 (đặt window.AI_GUARD_FORCE = true trước khi nạp file này nếu vẫn muốn ghi đè)');

   window.aiVbStore = function aiVbStore(o) {
      try {
         const flat = [];
         Object.keys(o).forEach(k => ((o[k] && o[k].list) || []).forEach(v => flat.push({ k: k, id: v.id, t: v.t || 0, s: v.bankId ? 0 : 1 })));
         if (flat.length > AI_VB_MAX) {       // bỏ trước những cái ĐÃ nằm trong ngân hàng (mất cũng không sao), giữ lại cái chưa đẩy lên
            flat.sort((a, b) => (a.s - b.s) || (a.t - b.t)).slice(0, flat.length - AI_VB_MAX).forEach(x => { o[x.k].list = o[x.k].list.filter(v => v.id !== x.id); });
         }
         window.localStorage.setItem(AI_VB_KEY, JSON.stringify(o));
         return true;
      } catch (e) { return false; }
   };

   window.aiVbWhy = function aiVbWhy(refQ, cand, others, lite) {
      if (!aiVbText(aiVbStem(cand))) return 'đề rỗng';
      if (aiVbText(aiVbStem(cand)) === aiVbText(aiVbStem(refQ))) return 'trùng đề với câu gốc';
      const all = [refQ].concat(others || []), ca = aiVbCorrect(cand);
      if (aiVbIsCalc(refQ)) {
         const nc = aiVbNums(cand);
         for (const x of all) {
            const nx = aiVbNums(x);
            const ov = nc.length ? nc.filter(n => nx.indexOf(n) >= 0).length / nc.length : 1;
            if (ov > 0.5) return 'số liệu gần giống câu đã có (' + Math.round(ov * 100) + '% số trùng)';
            if (!lite && ca && ca === aiVbCorrect(x)) return 'cùng đáp án với câu đã có';
         }
         return '';
      }
      // câu lí thuyết dạng Đúng/Sai: đổi câu chữ vẫn giữ nguyên mẫu Đúng/Sai nên không có gì để phân biệt với câu gốc -> không đưa vào kho
      if (!lite && examTypeOf(cand) === 'trueFalse') return 'câu Đúng/Sai lí thuyết chỉ đổi câu chữ, dễ trùng ý với câu gốc';
      for (const x of all) {
         if (aiVbSim(aiVbFull(cand), aiVbFull(x)) >= 0.8) return 'câu chữ quá giống câu đã có';
         if (!lite && ca && ca === aiVbCorrect(x)) return 'cùng đáp án (hỏi lại cùng một ý) với câu đã có';
      }
      return '';
   };

   window.aiVbBankDup = function aiVbBankDup(cand, meta, calcRef) {    // so với các câu đã có trong ngân hàng cùng bài (calcRef: loại câu lấy theo câu GỐC, vì câu biến thể chưa được AI chấm dạng)
      const stem = aiVbStem(cand), full = aiVbFull(cand), ca = aiVbCorrect(cand), calc = (calcRef === undefined) ? aiVbIsCalc(cand) : calcRef;
      for (const x of aiVbBankPool(meta)) {
         if (aiVbText(aiVbStem(x)) === aiVbText(stem)) return 'trùng đề với câu đã có trong ngân hàng';
         if (aiVbSim(aiVbFull(x), full) >= 0.9) return 'quá giống câu trong ngân hàng';
         if (!calc && ca && ca === aiVbCorrect(x) && aiVbSim(aiVbStem(x), stem) >= 0.5) return 'hỏi lại ý đã có trong ngân hàng';
      }
      return '';
   };

   window.aiVbLocalDup = function aiVbLocalDup(cand, meta, calc, selfKey) {
      const o = aiVbLoad(), stem = aiVbText(aiVbStem(cand)), full = aiVbFull(cand), ca = aiVbCorrect(cand), nc = aiVbNums(cand);
      for (const k of Object.keys(o)) {
         if (k === selfKey) continue;
         for (const v of ((o[k] && o[k].list) || [])) {
            const m = v && v.meta, x = v && v.q;
            if (!m || !x || String(m.grade) !== String(meta.grade) || String(m.chapter) !== String(meta.chapter) || String(m.lesson) !== String(meta.lesson)) continue;
            if (aiVbText(aiVbStem(x)) === stem) return 'trùng đề với biến thể đã lưu của câu ' + k;
            const sim = aiVbSim(aiVbFull(x), full);
            if (sim >= 0.9) return 'quá giống biến thể đã lưu của câu ' + k;
            if (calc) {
               const nx = aiVbNums(x), ov = nc.length ? nc.filter(n => nx.indexOf(n) >= 0).length / nc.length : 1;
               if (sim >= 0.8 && ov > 0.5) return 'cùng dạng và gần cùng số liệu với biến thể đã lưu của câu ' + k;
            } else if (ca && ca === aiVbCorrect(x) && aiVbSim(aiVbStem(x), aiVbStem(cand)) >= 0.5) return 'hỏi lại ý đã có ở biến thể đã lưu của câu ' + k;
         }
      }
      return '';
   };

   window.aiVbRemember = function aiVbRemember(refQ, c2, sol) {
      const res = { vid: '', why: '' };
      try {
         if (!refQ || !c2 || refQ.ID == null) { res.why = 'thiếu dữ liệu'; return res; }
         const o = aiVbLoad(), key = String(refQ.ID), sig = aiVbSig(refQ);
         let ent = o[key];
         if (!ent || ent.sig !== sig) ent = o[key] = { sig: sig, list: [] };   // câu gốc đã sửa nội dung -> bỏ biến thể cũ
         const cand = JSON.parse(JSON.stringify(c2));
         cand._sol = sol || cand._sol || '';
         const vid = key + '_V' + aiHash(aiVbFull(cand));
         if (ent.list.some(v => v.id === vid)) { res.vid = vid; return res; }
         const meta = aiVbMeta(refQ);
         let why = aiVbWhy(refQ, cand, ent.list.map(v => v.q));
         const calcRef = aiVbIsCalc(refQ);
         if (!why) why = aiVbBankDup(cand, meta, calcRef);
         if (!why) why = aiVbLocalDup(cand, meta, calcRef, key);
         if (why) { res.why = why; return res; }
         cand.ID = vid; delete cand._ai; delete cand._aiSolution;
         ent.list.push({ id: vid, t: Date.now(), q: cand, meta: meta });
         if (!aiVbStore(o)) { res.why = 'không ghi được vào bộ nhớ trình duyệt'; return res; }
         res.vid = vid; return res;
      } catch (e) { res.why = 'lỗi: ' + (e && e.message || e); return res; }
   };

   window.aiMakeVariant = async function aiMakeVariant(refQ, avoid) {
      const type = examTypeOf(refQ);
      if (aiHasFigure(refQ)) return { fail: 'câu chuẩn có hình/đồ thị/bảng nên AI không tạo biến thể được' };
      let shape;
      if (type === 'multipleChoice') shape = '{"de":"...","lua_chon":["...", ... đúng ' + (refQ.choices || []).length + ' phương án theo thứ tự cũ],"loi_giai":"giải ngắn"}';
      else if (type === 'trueFalse') shape = '{"de":"...","cac_y":["...", ... đúng ' + (refQ.subQuestions || []).length + ' ý theo thứ tự cũ],"loi_giai":"giải ngắn"}';
      else if (type === 'essay') shape = '{"de":"...","dap_an":"...","loi_giai":"giải ngắn"}';
      else if (type === 'essay_multi') shape = '{"de":"...","cac_phan":{' + Object.keys(refQ.parts || {}).sort().map(k => '"' + k + '":{"de":"...","dap_an":"..."}').join(',') + '},"loi_giai":"giải ngắn"}';
      else return { fail: 'loại câu chưa hỗ trợ' };
      const out = await aiGemini(
         'Bạn là giáo viên Vật lí giàu kinh nghiệm. Hãy viết MỘT CÂU BIẾN THỂ của câu gốc dưới đây.\n' +
         '- Giữ nguyên dạng bài, kiến thức, độ khó, số bước giải, đơn vị và CÁCH VIẾT CÔNG THỨC (LaTeX/ký hiệu như câu gốc). Chỉ đổi số liệu và/hoặc tình huống cho khác.\n' +
         '- Tự giải lại cẩn thận để đáp án chính xác; số liệu phải hợp lí về vật lí.\n' +
         '- Trắc nghiệm nhiều lựa chọn: phương án ĐÚNG phải nằm ĐÚNG VỊ TRÍ cũ (cùng thứ tự), các phương án nhiễu phải hợp lí.\n' +
         '- Đúng/Sai: mỗi ý giữ nguyên Đúng/Sai theo đúng thứ tự cũ.\n' +
         '- Không dùng hình vẽ, đồ thị, bảng.\n' +
         'Trả lời CHỈ một JSON đúng dạng: ' + shape + '\n\nCÂU GỐC:\n' + JSON.stringify(aiFull(refQ)) +
         (avoid && avoid.length ? '\n\nCÁC BIẾN THỂ ĐÃ DÙNG Ở MÃ ĐỀ KHÁC (tuyệt đối KHÔNG lặp lại đề hay số liệu của chúng; phải đổi sang số liệu và tình huống khác hẳn. Với câu lí thuyết không có số liệu thì hỏi sang một ý khác của cùng kiến thức):\n' + JSON.stringify(avoid.map(aiBrief)) : ''));
      return { out };
   };

   window.aiBalanceExams = async function aiBalanceExams(originals) {
      const rep = { replaced: [], variants: [], unfixed: [], skipped: '' };
      if (!originals || originals.length < 2) { rep.skipped = 'Chỉ có 1 đề gốc nên không có gì để so sánh.'; return rep; }
      if (!aiGetKey()) { rep.skipped = 'Chưa có API key Gemini nên bỏ qua bước AI.'; return rep; }
      const PARTS = ['I', 'II', 'III', 'IV'];
    
      // gom các câu theo "ô ma trận" (cùng bài, cùng loại, cùng mức)
      const slots = {};
      originals.forEach((ex, ei) => PARTS.forEach(p => (ex.parts[p] || []).forEach((q, idx) => {
         if (q && q._slot) (slots[q._slot] = slots[q._slot] || []).push({ ex: ex, ei: ei, part: p, idx: idx });
      })));
      const slotKeys = Object.keys(slots).sort();
      const getQ = e => e.ex.parts[e.part][e.idx];
    
      showNotification('🤖 AI đang chấm độ khó thực tế của các câu...', 'info');
      await aiRate(slotKeys.flatMap(k => slots[k].map(getQ)));
    
      const usedIds = new Set();
      const usedVars = {};                                   // ID câu gốc -> các biến thể đã đưa vào đề trong lần xuất này (kể cả cái không lưu), để hai mã đề không bao giờ trùng nhau
      originals.forEach(ex => PARTS.forEach(p => (ex.parts[p] || []).forEach(q => { if (q && q.ID != null) usedIds.add(String(q.ID)); })));
    
      const kho = e => ((AI_CACHE[getQ(e).ID] || {}).kho) || 0;
      for (const k of slotKeys) {
         const byExam = {};
         slots[k].forEach(e => (byExam[e.ei] = byExam[e.ei] || []).push(e));
         const exIdx = Object.keys(byExam).map(Number).sort((a, b) => a - b);
         if (exIdx.length < 2) continue;
         const rank = list => list.slice().sort((a, b) => kho(a) - kho(b));
         const refs = rank(byExam[exIdx[0]]);                       // đề gốc đầu tiên làm chuẩn
         const [, type, level] = k.split('|');
    
         for (const ei of exIdx.slice(1)) {
            const mine = rank(byExam[ei]);
            for (let r = 0; r < mine.length && r < refs.length; r++) {
               const refQ = getQ(refs[r]), cur = mine[r], curQ = getQ(cur);
               const rr = AI_CACHE[refQ.ID], cr = AI_CACHE[curQ.ID];
               if (!rr || !cr || aiEquiv(rr, cr)) continue;           // tương đương (hoặc chưa chấm được) -> giữ nguyên
               const where = 'Mã đề ' + cur.ex.code + ', câu ' + curQ.number + ' (' + type + ', mức ' + level + ')';
               showNotification('🔄 ' + where + ' chưa tương đương, đang xử lí...', 'info');
    
               // Cách 1: tìm câu tương đương trong ngân hàng
               const cand = await aiFindReplacement(k, rr, usedIds);
               if (cand) {
                  cur.ex.parts[cur.part][cur.idx] = aiBuildExamQuestion(cand, curQ, 'replaced');
                  usedIds.add(String(cand.ID));
                  rep.replaced.push(where + ': thay câu ' + curQ.ID + ' bằng câu ' + cand.ID + ' (độ khó ' + cr.kho + ' → ' + AI_CACHE[cand.ID].kho + ', chuẩn ' + rr.kho + ')');
                  continue;
               }
               // Cách 2: không có câu thay thế -> AI đổi số liệu từ câu chuẩn
               const rk = String(refQ.ID); usedVars[rk] = usedVars[rk] || [];
               let made = aiVbTake(refQ, usedIds), why = '';        // đã có biến thể lưu từ lần trước -> dùng luôn, khỏi hỏi AI
               if (made && aiVbWhy(refQ, made, usedVars[rk], true)) made = null;   // gần giống câu đã dùng ở mã đề khác -> bỏ, nhờ AI viết câu mới
               for (let t = 0; t < 2 && !made; t++) {                  // tối đa 2 lần thử
                  try {
                     const v = await aiMakeVariant(refQ, usedVars[rk]);
                     if (v.fail) { why = v.fail; break; }
                     const c2 = aiApplyVariant(refQ, v.out);
                     if (!c2) { why = 'AI trả về dữ liệu sai cấu trúc'; continue; }
                     const near = aiVbWhy(refQ, c2, usedVars[rk], true);
                     if (near) { why = 'biến thể AI viết ra quá giống câu đã dùng (' + near + ')'; continue; }
                     if (!(await aiVerifyVariant(c2))) { why = 'AI tự giải lại ra đáp án khác đáp án đã gán nên không dùng biến thể'; continue; }
                     c2._sol = v.out.loi_giai; made = c2;
                  } catch (e) { why = e.message; break; }
               }
               if (made) {
                  usedVars[rk].push(made);
                  let note = 'AI đã tự giải lại và khớp đáp án';
                  if (made._fromBank) note = 'dùng lại câu biến thể đã lưu, không tốn lượt AI';
                  else {
                     const sv = aiVbRemember(refQ, made, made._sol);
                     if (sv.vid) { usedIds.add(sv.vid); note += '; đã lưu để dùng lại'; }
                     else note += '; KHÔNG lưu vào kho (' + sv.why + ')';
                  }
                  cur.ex.parts[cur.part][cur.idx] = aiBuildExamQuestion(made, curQ, 'variant', made._sol);
                  rep.variants.push(where + ': AI đổi số liệu từ câu chuẩn ' + refQ.ID + ' → ' + made.ID + ' (' + note + ')');
                  continue;
               }
               // Cách 3: không xử lí được -> giữ nguyên và báo cáo
               rep.unfixed.push(where + ': giữ nguyên câu ' + curQ.ID + ' (độ khó ' + cr.kho + ' so với chuẩn ' + rr.kho + '). Lí do: ' + why);
            }
         }
      }
      try {                                              // đẩy các biến thể mới lên ngân hàng (cần đã đăng nhập Admin)
         const sy = await aiVbSync();
         if (sy.saved) showNotification('💾 Đã lưu ' + sy.saved + ' câu biến thể AI vào ngân hàng (task AI) để lần sau dùng lại.', 'success');
         else if (sy.skipped && sy.pending) showNotification('💾 Có ' + sy.pending + ' câu biến thể đang lưu tạm trong trình duyệt. Đăng nhập Admin rồi gõ aiVbSync() ở Console để đẩy lên ngân hàng.', 'info');
         if (sy.errors && sy.errors.length) console.warn('aiVbSync lỗi:', sy.errors);
         if (sy.dropped && sy.dropped.length) console.warn('aiVbSync câu bị máy chủ loại:', sy.dropped);
      } catch (e) { console.warn('aiVbSync:', e); }
      return rep;
   };

   window.AI_GUARD_STATUS = 'applied';
   console.log('[ai-variant-guard] đã áp dụng bản vá chống trùng câu.');
})();
