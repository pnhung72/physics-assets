/* =====================================================================
   ai_matrix_progress.js — Thanh tiến trình AI tạo câu hỏi (màu xanh ngọc) cho TestOline  (v1.0)
   Nhúng 1 dòng ở cuối trang, SAU exam_pack_tools.js và TRƯỚC reward.js:
     <script src="https://cdn.jsdelivr.net/gh/pnhung72/physics-assets@main/ai_matrix_progress.js"></script>

   Khi AI được nhờ tạo câu cho các ô ma trận còn thiếu, file này:
     1. Hiện khung tiến trình ngay TRÊN bảng ma trận: thanh tổng (xanh ngọc, có sọc chạy), số câu đã tạo / cần tạo,
        ô đang làm (Bài · Loại · Mức), thời gian còn lại ước lượng, và danh sách từng việc: ⏳ chờ · 🔄 đang tạo · ✅ xong · 🧩 cần dán tay · ❌ chưa đủ.
     2. Tô trực tiếp trong từng ô của ma trận: viền + thanh nhỏ xanh ngọc, nhãn "đã tạo/cần tạo" (✓ khi xong).
     3. Cuối cùng tổng hợp: "Đã tạo được → Trắc nghiệm: H ×3, VD ×2 | Trả lời ngắn: VD ×3 ..."
   Chỉ vẽ giao diện, không thay đổi cách tạo câu. Lỗi của file này không làm hỏng việc tạo đề.
   ===================================================================== */
(function () {
  'use strict';
  if (window.AIPROG) return;
  window.AIPROG = (function () {
   const TEAL = '#14b8a6', TEAL_D = '#0f766e', TEAL_L = '#ccfbf1';
   const LV_FULL = { B: 'Biết', H: 'Hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
   let jobs = {}, order = [], finished = false, dismissed = false, obs = null, t0 = 0;

   const typeName = t => { try { return BRW_TYPE_NAME[t] || t; } catch (e) { return t; } };
   const normType = t => (t === 'essay-multi' ? 'essay_multi' : t);
   const jobKey = f => f.label + '|' + f.type + '|' + f.level;
   const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
   const ICON = { queued: '⏳', run: '🔄', done: '✅', fail: '❌', manual: '🧩', skip: '⏭️' };
   const TEXT = { queued: 'Đang chờ', run: 'Đang tạo', done: 'Xong', fail: 'Chưa đủ', manual: 'Cần dán tay', skip: 'Bỏ qua' };

   function injectCss() {
      if (document.getElementById('aiprog-css')) return;
      const st = document.createElement('style');
      st.id = 'aiprog-css';
      st.textContent = `
#ai-progress-panel{margin:10px 0 12px;padding:12px 14px;border:2px solid ${TEAL};border-radius:12px;background:#f0fdfa;text-align:left;}
#ai-progress-panel .ap-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;color:${TEAL_D};}
#ai-progress-panel .ap-track{height:16px;border-radius:9px;background:${TEAL_L};overflow:hidden;margin:8px 0 6px;}
#ai-progress-panel .ap-fill{height:100%;width:0;background:${TEAL};border-radius:9px;transition:width .4s ease;}
#ai-progress-panel.ap-running .ap-fill{background-image:linear-gradient(45deg,rgba(255,255,255,.28) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.28) 50%,rgba(255,255,255,.28) 75%,transparent 75%);background-size:22px 22px;animation:ap-stripe 1s linear infinite;}
@keyframes ap-stripe{to{background-position:22px 0;}}
#ai-progress-panel .ap-now{font-size:.92em;color:#134e4a;min-height:1.3em;}
#ai-progress-panel .ap-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
#ai-progress-panel .ap-chip{display:inline-flex;align-items:center;gap:6px;font-size:.82em;padding:3px 8px;border-radius:14px;background:#fff;border:1px solid ${TEAL};color:#134e4a;}
#ai-progress-panel .ap-chip.run{background:${TEAL_L};font-weight:700;}
#ai-progress-panel .ap-chip.done{background:${TEAL};color:#fff;}
#ai-progress-panel .ap-chip.fail,#ai-progress-panel .ap-chip.skip{border-color:#dc2626;color:#b91c1c;background:#fef2f2;}
#ai-progress-panel .ap-chip.manual{border-color:#d97706;color:#92400e;background:#fffbeb;}
#ai-progress-panel .ap-sum{margin-top:8px;font-size:.88em;color:#134e4a;}
#ai-progress-panel button.ap-x{width:auto;padding:2px 10px;font-size:.8em;background:${TEAL_D};border-radius:6px;}
#matrix-table td.aiprog-cell{position:relative;}
#matrix-table td.aiprog-cell .aiprog-bar{position:absolute;left:3px;right:3px;bottom:1px;height:5px;border-radius:3px;background:${TEAL_L};overflow:hidden;pointer-events:none;}
#matrix-table td.aiprog-cell .aiprog-bar i{display:block;height:100%;width:0;background:${TEAL};transition:width .4s ease;}
#matrix-table td.aiprog-cell .aiprog-tag{position:absolute;top:0;right:2px;font-size:10px;font-weight:700;color:${TEAL_D};pointer-events:none;}
#matrix-table td.aiprog-cell[data-ap="queued"]{outline:2px dashed ${TEAL};outline-offset:-2px;}
#matrix-table td.aiprog-cell[data-ap="run"]{outline:2px solid ${TEAL};outline-offset:-2px;background:#f0fdfa;}
#matrix-table td.aiprog-cell[data-ap="run"] .aiprog-bar i{background-image:linear-gradient(45deg,rgba(255,255,255,.35) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.35) 50%,rgba(255,255,255,.35) 75%,transparent 75%);background-size:10px 10px;animation:ap-stripe 1s linear infinite;}
#matrix-table td.aiprog-cell[data-ap="done"]{background:${TEAL_L};outline:2px solid ${TEAL};outline-offset:-2px;}
#matrix-table td.aiprog-cell[data-ap="manual"]{outline:2px solid #d97706;outline-offset:-2px;}
#matrix-table td.aiprog-cell[data-ap="manual"] .aiprog-tag{color:#92400e;}
#matrix-table td.aiprog-cell[data-ap="fail"],#matrix-table td.aiprog-cell[data-ap="skip"]{outline:2px solid #dc2626;outline-offset:-2px;}
#matrix-table td.aiprog-cell[data-ap="fail"] .aiprog-tag,#matrix-table td.aiprog-cell[data-ap="skip"] .aiprog-tag{color:#b91c1c;}
#matrix-table td.aiprog-cell[data-ap="fail"] .aiprog-bar i,#matrix-table td.aiprog-cell[data-ap="skip"] .aiprog-bar i{background:#dc2626;}`;
      document.head.appendChild(st);
   }

   function cellOf(j) {
      const m = /^L(\d+)-C(\d+)-B(\d+)$/.exec(j.label);
      if (!m) return null;
      const key = m[1] + '_' + m[2] + '_' + m[3];
      const ins = document.querySelectorAll('#matrix-table input.matrix-input-compact');
      for (const inp of ins) {
         if (inp.dataset.key === key && String(inp.dataset.level).toUpperCase() === j.level && normType(inp.dataset.type) === normType(j.type)) {
            return inp.closest('td');
         }
      }
      return null;
   }

   function pct(j) { return j.target > 0 ? Math.min(100, Math.round(j.got * 100 / j.target)) : 0; }

   function paintCells() {
      if (dismissed) return;
      order.forEach(k => {
         const j = jobs[k];
         const td = cellOf(j);
         if (!td) return;
         td.classList.add('aiprog-cell');
         td.dataset.ap = j.state;
         let bar = td.querySelector('.aiprog-bar'), tag = td.querySelector('.aiprog-tag');
         if (!bar) { bar = document.createElement('div'); bar.className = 'aiprog-bar'; bar.appendChild(document.createElement('i')); td.appendChild(bar); }
         if (!tag) { tag = document.createElement('div'); tag.className = 'aiprog-tag'; td.appendChild(tag); }
         bar.firstChild.style.width = (j.state === 'done' ? 100 : pct(j)) + '%';
         tag.textContent = (j.state === 'done' ? '✓ ' : '') + j.got + '/' + j.target;
         td.title = `${j.label} · ${typeName(j.type)} · ${LV_FULL[j.level] || j.level}: ${TEXT[j.state]} (AI đã tạo ${j.got}/${j.target} câu, cần dùng ${j.need})`;
      });
      if (obs) obs.takeRecords();   // bỏ qua các thay đổi do chính mình vừa vẽ
   }

   function clearCells() {
      document.querySelectorAll('#matrix-table td.aiprog-cell').forEach(td => {
         td.classList.remove('aiprog-cell'); delete td.dataset.ap; td.removeAttribute('title');
         td.querySelectorAll('.aiprog-bar,.aiprog-tag').forEach(x => x.remove());
      });
      if (obs) obs.takeRecords();
   }

   function ensurePanel() {
      let p = document.getElementById('ai-progress-panel');
      if (p) return p;
      const host = document.getElementById('matrix-display');
      if (!host || !host.parentNode) return null;
      p = document.createElement('div');
      p.id = 'ai-progress-panel';
      host.parentNode.insertBefore(p, host);   // ngay trên bảng ma trận
      return p;
   }

   function renderPanel() {
      const p = ensurePanel();
      if (!p) return;
      if (dismissed) { p.style.display = 'none'; return; }
      p.style.display = '';
      const list = order.map(k => jobs[k]);
      const total = list.reduce((s, j) => s + j.target, 0);
      const got = list.reduce((s, j) => s + Math.min(j.got, j.target), 0);
      const percent = total ? Math.min(100, Math.round(got * 100 / total)) : 0;
      const cur = list.find(j => j.state === 'run');
      const queued = list.filter(j => j.state === 'queued' || j.state === 'run');
      const callsLeft = queued.reduce((s, j) => s + Math.max(1, Math.ceil((j.target - j.got) / (typeof AI_GEN_MAX_PER_CALL !== 'undefined' ? AI_GEN_MAX_PER_CALL : 5))), 0);
      const eta = callsLeft * ((typeof AI_GEN_GAP_MS !== 'undefined' ? AI_GEN_GAP_MS : 4800) / 1000 + 3);
      const doneN = list.filter(j => j.state === 'done').length;
      p.className = finished ? '' : 'ap-running';
      let now;
      if (finished) {
         const bad = list.filter(j => j.state === 'fail' || j.state === 'skip').length;
         const man = list.filter(j => j.state === 'manual').length;
         now = `Hoàn tất sau ${Math.round((Date.now() - t0) / 1000)} giây: ${doneN}/${list.length} ô đủ câu` + (man ? `, ${man} ô cần dán tay` : '') + (bad ? `, ${bad} ô chưa đủ` : '') + '.';
      } else if (cur) {
         now = `Đang tạo: <b>${esc(cur.label)}</b> · ${esc(typeName(cur.type))} · mức <b>${esc(cur.level)}</b> (${cur.got}/${cur.target} câu) — còn khoảng ${Math.round(eta)} giây`;
      } else if (list.some(j => j.state === 'manual')) {
         now = '🧩 AI tự động gặp lỗi/hết hạn mức — đang chờ bạn dán kết quả ở hộp thoại "Nhờ AI khác tạo câu".';
      } else {
         now = 'Đang chuẩn bị...';
      }
      const chips = list.map(j => `<span class="ap-chip ${j.state}" title="${esc(TEXT[j.state])}">${ICON[j.state]} ${esc(j.label)} · ${esc(typeName(j.type))} · ${esc(j.level)} <b>${j.got}/${j.target}</b></span>`).join('');
      // tổng hợp đã tạo theo Loại × Mức
      const agg = {};
      list.forEach(j => { if (j.got > 0) { const k = typeName(j.type); (agg[k] = agg[k] || {}); agg[k][j.level] = (agg[k][j.level] || 0) + j.got; } });
      const sum = Object.keys(agg).map(k => `<b>${esc(k)}</b>: ` + ['B', 'H', 'VD', 'VDC'].filter(l => agg[k][l]).map(l => `${l} ×${agg[k][l]}`).join(', ')).join(' &nbsp;|&nbsp; ');
      p.innerHTML =
         `<div class="ap-head"><span>🤖 AI tạo câu: ${got}/${total} câu (${percent}%) · ${doneN}/${list.length} ô xong</span>` +
         (finished ? '<button type="button" class="ap-x" id="ap-close">Ẩn</button>' : '') + '</div>' +
         `<div class="ap-track"><div class="ap-fill" style="width:${percent}%"></div></div>` +
         `<div class="ap-now">${now}</div><div class="ap-list">${chips}</div>` +
         `<div class="ap-sum">${sum ? 'Đã tạo được → ' + sum : 'Chưa có câu nào được tạo.'}</div>`;
      const x = p.querySelector('#ap-close');
      if (x) x.onclick = () => { dismissed = true; clearCells(); renderPanel(); };
   }

   function refresh() { try { injectCss(); renderPanel(); paintCells(); } catch (e) { console.warn('AIPROG:', e); } }

   function watchTable() {
      if (obs) return;
      const tbl = document.getElementById('matrix-table');
      if (!tbl) return;
      let t = null;
      obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { try { paintCells(); } catch (e) {} }, 200); });
      obs.observe(tbl, { childList: true, subtree: true });
   }

   function findJob(b) { return b ? jobs[jobKey({ label: b.label, type: b.type, level: b.level })] : null; }
   return {
      active() { return order.length > 0 && !finished; },
      start(failed) {
         try {
            if (obs) { obs.disconnect(); obs = null; }
            clearCells();
            jobs = {}; order = []; finished = false; dismissed = false; t0 = Date.now();
            const minNew = parseInt(window.AI_GEN_MIN_NEW, 10) || 0;
            (failed || []).forEach(f => {
               const k = jobKey(f);
               if (jobs[k]) return;
               jobs[k] = { label: f.label, type: f.type, level: f.level, need: f.missing, target: Math.max(f.missing, minNew), got: 0, state: 'queued' };
               order.push(k);
            });
            refresh(); watchTable();
            const p = document.getElementById('ai-progress-panel');
            if (p && p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'center' });
         } catch (e) { console.warn('AIPROG.start:', e); }
      },
      // bắt đầu 1 lượt gọi AI cho (bài, loại, mức); việc đang chạy trước đó được chốt trạng thái
      run(b) {
         try {
            const j = findJob(b); if (!j) return;
            order.forEach(k => { const o = jobs[k]; if (o !== j && o.state === 'run') o.state = o.got >= o.need ? 'done' : 'fail'; });
            j.state = 'run'; refresh();
         } catch (e) {}
      },
      add(b, n) { try { const j = findJob(b); if (j && n > 0) { j.got += n; refresh(); } } catch (e) {} },
      manual(b) { try { const j = findJob(b); if (j && j.state !== 'done') { j.state = 'manual'; refresh(); } } catch (e) {} },
      // kết thúc: ô nào không còn trong danh sách "vẫn thiếu" là đã xong
      finish(failed, result) {
         try {
            const still = new Set(((result && result.failed) || []).map(jobKey));
            order.forEach(k => { jobs[k].state = still.has(k) ? 'fail' : 'done'; });
            finished = true; refresh();
         } catch (e) {}
      },
      abort() { try { order.forEach(k => { const j = jobs[k]; if (j.state === 'run' || j.state === 'queued') j.state = 'fail'; }); finished = true; refresh(); } catch (e) {} }
   };
  })();

  /* ---------- móc vào các hàm AI của trang (không cần sửa mã trang) ---------- */
  function hasToken() { try { return typeof aiGenToken === 'function' && !!aiGenToken(); } catch (e) { return false; } }
  function wrap(name, make) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__aiprog) return false;
    var w = make(orig); w.__aiprog = true; window[name] = w; return true;
  }
  function install() {
    var ok1 = wrap('aiFillShortage', function (orig) {
      return async function (failed, ctx) {
        var on = hasToken() && Array.isArray(failed) && failed.length;
        if (on) AIPROG.start(failed);
        try {
          var r = await orig.apply(this, arguments);
          if (on) AIPROG.finish(failed, r);
          return r;
        } catch (e) { if (on) AIPROG.abort(); throw e; }
      };
    });
    var ok2 = wrap('aiGenCall', function (orig) {
      return async function (body) {
        var act = body && body.action;
        if (act === 'bank_ai_generate' && AIPROG.active()) AIPROG.run(body);
        var res = await orig.apply(this, arguments);
        if ((act === 'bank_ai_generate' || act === 'bank_ai_import') && res && AIPROG.active()) AIPROG.add(body, (res.saved || []).length);
        return res;
      };
    });
    var ok3 = wrap('aiManualDialog', function (orig) {
      return function (jobs, reason) {
        try { (jobs || []).forEach(function (j) { AIPROG.manual(j && j.body); }); } catch (e) {}
        return orig.apply(this, arguments);
      };
    });
    return ok1 && ok2 && ok3;
  }
  var tries = 0;
  (function go() {
    var done = false;
    try { done = install(); } catch (e) { console.warn('ai_matrix_progress:', e); }
    var ready = typeof window.aiFillShortage === 'function' && window.aiFillShortage.__aiprog &&
                typeof window.aiGenCall === 'function' && window.aiGenCall.__aiprog;
    if (!ready && ++tries < 40) setTimeout(go, 500);
    else if (!ready) console.warn('ai_matrix_progress.js: không tìm thấy aiFillShortage/aiGenCall — thanh tiến trình không hoạt động.');
  })();
})();
