/* kscl-adjust.js v1.1
   Chọn lớp -> đọc thống kê KSCL (TX1 lần đầu) từ Script -> tính tỉ lệ câu cần giảm theo khoảng cách so với mặt bằng chung
   tỉ lệ = K x (M - điểm TB lớp) / M  (M = điểm TB KSCL chung có trọng số sĩ số) -> AI viết lại một phần câu cho dễ hơn.
   Giữ nguyên loại câu, vị trí, điểm và _slot nên tỉ lệ B/H/VD của đề không đổi.
   Có lỗi ở bất kỳ bước nào thì giữ nguyên câu gốc, không làm hỏng việc xuất đề. */
(function () {
  'use strict';
  const TEXT = { giu: 'Giữ nguyên độ khó', nhe: 'Giảm nhẹ', vua: 'Giảm vừa', nhieu: 'Giảm nhiều' };
  const K = 1.5;            // hệ số điều chỉnh độ mạnh (giáo viên chọn)
  const MIN_TY_LE = 0.05;   // dưới 5% số câu thì coi như không cần giảm
  const TRAN = 0.8;         // không bao giờ sửa quá 80% số câu của đề
  const HUONG_DAN = {
    nhe: 'GIẢM NHẸ: số liệu tròn, dễ tính hơn; giữ số bước giải, bỏ bớt dữ kiện gây rối.',
    vua: 'GIẢM VỪA: bớt khoảng 1 bước giải, số liệu đơn giản, dữ kiện nêu rõ ràng; phương án nhiễu dễ phân biệt hơn.',
    nhieu: 'GIẢM NHIỀU: chỉ còn 1-2 bước cơ bản, áp dụng trực tiếp công thức, số liệu tròn, dữ kiện cho trực tiếp; phương án nhiễu rõ sai.'
  };
  let cache = null;

  function note(msg, type) {
    if (typeof showNotification === 'function') showNotification(msg, type || 'info');
    else console.log('[KSCL]', msg);
  }

  async function loadStats() {
    if (cache) return cache;
    const base = window.KSCL_API_URL;
    if (!base) throw new Error('Chưa cấu hình window.KSCL_API_URL');
    const res = await fetch(base + (base.indexOf('?') < 0 ? '?' : '&') + 'action=ksclStats');
    const j = await res.json();
    if (j && j.success === false) throw new Error(j.message || j.error || 'Script báo lỗi');
    let d = (j && j.data !== undefined) ? j.data : j;
    if (d && d.data && !d.cacLop) d = d.data;
    if (!d || !d.cacLop) throw new Error('Dữ liệu ksclStats không đúng định dạng');
    cache = d;
    return d;
  }

  // Điểm TB KSCL chung của các lớp (có trọng số sĩ số, bỏ lớp mẫu quá nhỏ)
  function matBangChung(stats) {
    let t = 0, n = 0;
    Object.keys(stats.cacLop).forEach(function (k) {
      const c = stats.cacLop[k];
      if (!c.nhoMau && c.soHS > 0) { t += c.diemTB * c.soHS; n += c.soHS; }
    });
    return n ? t / n : null;
  }
  // Tỉ lệ số câu cần giảm cho một lớp, từ 0 đến TRAN
  function tyLeGiam(c, stats) {
    if (!c || c.nhoMau) return 0;
    const M = matBangChung(stats);
    if (!M) return 0;
    const r = K * (M - c.diemTB) / M;
    return r >= MIN_TY_LE ? Math.min(r, TRAN) : 0;
  }
  function mucTuTyLe(r) { return r < 0.2 ? 'nhe' : (r < 0.4 ? 'vua' : 'nhieu'); }

  function describe(c, stats) {
    const t = c.tyLePhanTram || {};
    return 'Lớp ' + c.lop + ': ' + c.soHS + ' HS, điểm TB KSCL ' + c.diemTB +
      '. Giỏi ' + t.gioi + '% | Khá ' + t.kha + '% | TB ' + t.tb + '% | Yếu ' + t.yeu + '% | Kém ' + t.kem + '%. ' +
      (c.nhoMau ? 'Mẫu quá nhỏ nên giữ nguyên độ khó.' : (function () {
        const M = stats ? matBangChung(stats) : null, r = stats ? tyLeGiam(c, stats) : 0;
        if (!M) return '';
        return 'Điểm TB chung ' + M.toFixed(2) + '. ' + (r ? 'Giảm độ khó khoảng ' + Math.round(r * 100) + '% số câu.' : 'Không cần giảm độ khó.');
      })());
  }

  // Trả về đối tượng lớp được chọn, hoặc null nếu giáo viên chọn "không điều chỉnh"
  function pickClass(stats) {
    return new Promise(function (resolve) {
      const list = Object.keys(stats.cacLop).map(function (k) { return stats.cacLop[k]; })
        .sort(function (a, b) { return a.lop.localeCompare(b.lop, 'vi', { numeric: true }); });
      let last = '';
      try { last = localStorage.getItem('kscl_last_lop') || ''; } catch (e) {}

      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100003;display:flex;align-items:center;justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;color:#222;padding:22px;border-radius:12px;width:90%;max-width:440px;';
      const h = document.createElement('h3');
      h.textContent = '🎯 Điều chỉnh độ khó theo lớp (KSCL)';
      h.style.cssText = 'margin:0 0 12px;color:#4361ee;';
      const lb = document.createElement('label');
      lb.textContent = 'Lớp sẽ dùng đề này:';
      lb.style.fontWeight = '600';
      const sel = document.createElement('select');
      sel.style.cssText = 'width:100%;padding:8px;margin:6px 0 10px;';
      const o0 = document.createElement('option');
      o0.value = ''; o0.textContent = '— Không điều chỉnh (xuất đề như cũ) —';
      sel.appendChild(o0);
      list.forEach(function (c) {
        const o = document.createElement('option');
        o.value = c.lop; o.textContent = c.lop;
        if (c.lop === last) o.selected = true;
        sel.appendChild(o);
      });
      const info = document.createElement('div');
      info.style.cssText = 'background:#f0f4ff;padding:10px;border-radius:8px;font-size:13px;min-height:56px;';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:12px;margin-top:16px;';
      const ok = document.createElement('button');
      ok.textContent = 'Tiếp tục';
      ok.style.cssText = 'flex:1;padding:10px;border:none;border-radius:8px;background:#28a745;color:#fff;font-weight:700;cursor:pointer;';
      const no = document.createElement('button');
      no.textContent = 'Bỏ qua';
      no.style.cssText = 'flex:1;padding:10px;border:none;border-radius:8px;background:#6c757d;color:#fff;font-weight:700;cursor:pointer;';
      row.appendChild(ok); row.appendChild(no);
      [h, lb, sel, info, row].forEach(function (x) { box.appendChild(x); });
      ov.appendChild(box); document.body.appendChild(ov);

      function refresh() {
        const c = list.filter(function (x) { return x.lop === sel.value; })[0];
        info.textContent = c ? describe(c, stats) : 'Đề được xuất nguyên bản, không điều chỉnh theo lớp.';
      }
      sel.addEventListener('change', refresh); refresh();
      function done(v) { ov.remove(); resolve(v); }
      ok.addEventListener('click', function () {
        const c = list.filter(function (x) { return x.lop === sel.value; })[0] || null;
        try { localStorage.setItem('kscl_last_lop', sel.value); } catch (e) {}
        done(c);
      });
      no.addEventListener('click', function () { done(null); });
    });
  }

  /* ---------- Giảm độ khó bằng AI ---------- */

  function shapeOf(q, type) {
    if (type === 'multipleChoice') return '{"de":"...","lua_chon":["...", ... đúng ' + (q.choices || []).length + ' phương án theo thứ tự cũ],"loi_giai":"giải ngắn"}';
    if (type === 'trueFalse') return '{"de":"...","cac_y":["...", ... đúng ' + (q.subQuestions || []).length + ' ý theo thứ tự cũ],"loi_giai":"giải ngắn"}';
    if (type === 'essay') return '{"de":"...","dap_an":"...","loi_giai":"giải ngắn"}';
    if (type === 'essay_multi') return '{"de":"...","cac_phan":{' + Object.keys(q.parts || {}).sort().map(function (k) { return '"' + k + '":{"de":"...","dap_an":"..."}'; }).join(',') + '},"loi_giai":"giải ngắn"}';
    return null;
  }

  async function makeEasier(q, muc) {
    const type = examTypeOf(q);
    const shape = shapeOf(q, type);
    if (!shape) return null;
    return await aiGemini(
      'Bạn là giáo viên Vật lí giàu kinh nghiệm. Hãy viết MỘT CÂU MỚI DỄ HƠN câu gốc dưới đây, dành cho lớp học yếu.\n' +
      '- ' + HUONG_DAN[muc] + '\n' +
      '- Giữ nguyên dạng bài, chủ đề kiến thức, đơn vị và CÁCH VIẾT CÔNG THỨC (LaTeX/ký hiệu như câu gốc).\n' +
      '- Tự giải lại cẩn thận để đáp án chính xác; số liệu phải hợp lí về vật lí.\n' +
      '- Trắc nghiệm nhiều lựa chọn: phương án ĐÚNG phải nằm ĐÚNG VỊ TRÍ cũ (cùng thứ tự).\n' +
      '- Đúng/Sai: mỗi ý giữ nguyên Đúng/Sai theo đúng thứ tự cũ.\n' +
      '- Không dùng hình vẽ, đồ thị, bảng.\n' +
      'Trả lời CHỈ một JSON đúng dạng: ' + shape + '\n\nCÂU GỐC:\n' + JSON.stringify(aiFull(q)));
  }

  async function oneQuestion(old, muc) {
    for (let t = 0; t < 2; t++) {                       // thử tối đa 2 lần
      try {
        const out = await makeEasier(old, muc);
        const c = aiApplyVariant(old, out);
        if (!c) continue;
        if (!(await aiVerifyVariant(c))) continue;      // AI tự giải lại, sai đáp án thì bỏ
        return aiBuildExamQuestion(c, old, 'variant', out.loi_giai);
      } catch (e) { console.warn('[KSCL] câu lỗi:', e); }
    }
    return null;
  }

  async function rewrite(originals, pick, cfg) {
    const ty = pick.tyLe || 0, muc = mucTuTyLe(ty);
    const rep = { lop: pick.lop, tyLe: ty, rewritten: 0, failed: 0, skipped: '' };
    if (!ty) { rep.skipped = 'không cần giảm'; return rep; }
    if (!originals || !originals.length) { rep.skipped = 'không có đề'; return rep; }
    if (typeof aiGemini !== 'function' || typeof aiApplyVariant !== 'function' || typeof aiVerifyVariant !== 'function' ||
        typeof aiBuildExamQuestion !== 'function' || typeof examTypeOf !== 'function' || typeof aiFull !== 'function') {
      rep.skipped = 'thiếu hàm AI của trang'; return rep;
    }
    if (typeof aiGetKey === 'function' && !aiGetKey()) { rep.skipped = 'chưa có API key Gemini'; note('ℹ️ KSCL: chưa có API key Gemini nên không giảm độ khó.', 'info'); return rep; }

    const PARTS = ['I', 'II', 'III', 'IV'];
    const khoOf = function (q) { try { return ((AI_CACHE[q.ID] || {}).kho) || 0; } catch (e) { return 0; } };

    // Nếu chưa có điểm độ khó thì nhờ AI chấm một lần
    const all = [];
    originals.forEach(function (ex) { PARTS.forEach(function (p) { ((ex.parts || {})[p] || []).forEach(function (q) { if (q) all.push(q); }); }); });
    if (typeof aiRate === 'function' && all.length && all.every(function (q) { return khoOf(q) === 0; })) {
      try { await aiRate(all); } catch (e) { console.warn('[KSCL] aiRate:', e); }
    }

    note('🎯 KSCL: ' + describe(pick, cache), 'info');
    let done = 0, total = 0;
    const jobs = [];
    originals.forEach(function (ex) {
      const cands = [];
      PARTS.forEach(function (p) {
        ((ex.parts || {})[p] || []).forEach(function (q, idx) {
          if (!q || q._ai) return;
          try { if (aiHasFigure(q)) return; } catch (e) {}
          cands.push({ ex: ex, part: p, idx: idx, q: q });
        });
      });
      cands.sort(function (a, b) { return khoOf(b.q) - khoOf(a.q); });   // câu khó nhất sửa trước
      const n = Math.round(cands.length * ty);
      cands.slice(0, n).forEach(function (j) { jobs.push(j); });
    });
    total = jobs.length;

    for (const j of jobs) {
      done++;
      note('🎯 KSCL: đang giảm độ khó câu ' + done + '/' + total + '...', 'info');
      const nq = await oneQuestion(j.q, muc);
      if (nq) { j.ex.parts[j.part][j.idx] = nq; rep.rewritten++; } else rep.failed++;
    }
    note('✅ KSCL ' + pick.lop + ': đã giảm độ khó ' + rep.rewritten + '/' + total + ' câu' +
         (rep.failed ? ' (' + rep.failed + ' câu giữ nguyên vì AI không viết/kiểm tra được)' : '') + '.', rep.failed ? 'warning' : 'success');
    return rep;
  }

  // Không bao giờ ném lỗi ra ngoài: có lỗi thì đề vẫn xuất bình thường
  async function apply(originals, cfg) {
    let stats;
    try { stats = await loadStats(); }
    catch (e) {
      console.warn('[KSCL]', e);
      note('⚠️ KSCL: không đọc được thống kê lớp (' + e.message + ') — xuất đề như cũ.', 'warning');
      return { skipped: e.message };
    }
    const pick = await pickClass(stats);
    if (!pick) return { skipped: 'không chọn lớp' };
    window.KSCL_LAST = pick;
    const ty = tyLeGiam(pick, stats);
    if (!ty) {
      note('✅ ' + describe(pick, stats), 'success');
      return { lop: pick.lop, tyLe: 0 };
    }
    try { return await window.KSCL.rewrite(originals, Object.assign({}, pick, { tyLe: ty }), cfg); }
    catch (e) {
      console.warn('[KSCL] rewrite:', e);
      note('⚠️ KSCL: lỗi khi giảm độ khó (' + e.message + ') — giữ nguyên đề gốc.', 'warning');
      return { error: e.message };
    }
  }

  window.KSCL = { version: '1.1', apply: apply, rewrite: rewrite, loadStats: loadStats, pickClass: pickClass,
                  tyLeGiam: tyLeGiam, matBangChung: matBangChung };
})();
