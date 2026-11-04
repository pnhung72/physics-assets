/* kscl-adjust.js v0.1
   Chọn lớp -> đọc thống kê KSCL từ Script70 -> quy ra mức giảm độ khó.
   v0.1 CHƯA sửa câu hỏi: chỉ kiểm tra luồng chọn lớp và đọc số liệu. */
(function () {
  'use strict';
  const TEXT = { giu: 'Giữ nguyên độ khó', nhe: 'Giảm nhẹ', vua: 'Giảm vừa', nhieu: 'Giảm nhiều' };
  let cache = null;
    const API_URL = 'https://script.google.com/macros/s/AKfycbwZtFufSTnRDLon-AIfnPWmafcPqbgBEeFOW7FvYfcKkAtk65bGOJUS_NxthoQcXawLbw/exec';
  if (!window.KSCL_API_URL) window.KSCL_API_URL = API_URL;

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
    if (j && j.success === false) throw new Error(j.message || j.error || 'Script70 báo lỗi');
    let d = (j && j.data !== undefined) ? j.data : j;
    if (d && d.data && !d.cacLop) d = d.data;
    if (!d || !d.cacLop) throw new Error('Dữ liệu ksclStats không đúng định dạng');
    cache = d;
    return d;
  }

  function describe(c) {
    const t = c.tyLePhanTram || {};
    return 'Lớp ' + c.lop + ': ' + c.soHS + ' HS, điểm TB ' + c.diemTB +
      '. Giỏi ' + t.gioi + '% | Khá ' + t.kha + '% | TB ' + t.tb + '% | Yếu ' + t.yeu + '% | Kém ' + t.kem + '%. ' +
      (c.nhoMau ? 'Mẫu quá nhỏ nên giữ nguyên độ khó.' : 'Mức điều chỉnh: ' + (TEXT[c.mucGiam] || c.mucGiam) + '.');
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
        info.textContent = c ? describe(c) : 'Đề được xuất nguyên bản, không điều chỉnh theo lớp.';
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
    if (pick.mucGiam === 'giu') {
      note('✅ ' + describe(pick), 'success');
      return { lop: pick.lop, mucGiam: 'giu' };
    }
    if (typeof window.KSCL.rewrite !== 'function') {
      note('ℹ️ ' + describe(pick) + ' (v0.1 chưa tự sửa câu, đề giữ nguyên)', 'info');
      return { lop: pick.lop, mucGiam: pick.mucGiam, rewritten: 0 };
    }
    try { return await window.KSCL.rewrite(originals, pick, cfg); }
    catch (e) {
      console.warn('[KSCL] rewrite:', e);
      note('⚠️ KSCL: lỗi khi giảm độ khó (' + e.message + ') — giữ nguyên đề gốc.', 'warning');
      return { error: e.message };
    }
  }

   window.KSCL = { version: '0.2', apply: apply, loadStats: loadStats, pickClass: pickClass };

  // Tự gắn vào ExamQA.prepareOriginals (chạy trên đề gốc, trước khi xáo đề)
  function install() {
    const qa = window.ExamQA;
    if (!qa || typeof qa.prepareOriginals !== 'function') return false;
    if (qa.__ksclWrapped) return true;
    const orig = qa.prepareOriginals;
    try {
      qa.prepareOriginals = async function (originals, opts) {
        try { await apply(originals, (opts && opts.exportConfig) || null); }
        catch (e) { console.warn('[KSCL]', e); }
        return orig.apply(this, arguments);
      };
      qa.__ksclWrapped = true;
      console.log('[KSCL] đã gắn vào ExamQA.prepareOriginals');
      return true;
    } catch (e) { console.warn('[KSCL] không gắn được:', e); return true; }
  }
  if (!install()) {
    let n = 0;
    const t = setInterval(function () { if (install() || ++n > 100) clearInterval(t); }, 300);
  }
})();
