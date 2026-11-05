/* exam_ai_batch.js — Làm nhanh bước "AI dán tay" của TestOline (KHÔNG sửa TestOline)
   Nối vào trang bằng 1 thẻ <script> ở cuối TestOline, SAU exam_pack_tools.js:
   1) Hộp thoại "Nhờ AI khác tạo câu" (aiManualDialog): thêm nút "Sao chép phần k/n" gộp nhiều mục
      thành vài văn bản đánh số, và MỘT ô dán nhận kết quả của nhiều mục (tách theo dòng "### MỤC k").
      Cách làm cũ theo từng mục vẫn còn (mở mục "Làm từng mục riêng").
   2) Khi Gemini báo bận/hết hạn mức MỘT lần, các lần gọi sau trong vài phút bỏ qua ngay,
      không chờ thử lại từng mục (aiGenCall/bank_ai_generate và aiGeminiApi).
   Tắt toàn bộ: window.AI_BATCH_OFF = true trước khi nạp file. Chỉnh:
     window.AI_BATCH_JOBS_PER_PART = 5      (số mục mỗi phần sao chép)
     window.AI_BATCH_COOLDOWN_MS  = 600000  (thời gian bỏ qua Gemini sau khi báo bận)
   Máy chủ vẫn cần 2 action sẵn có của TestOline: bank_ai_prompt và bank_ai_import. */
(function (root) {
'use strict';
if (root.ExamAiBatch || root.AI_BATCH_OFF) return;
if (typeof root.aiManualDialog !== 'function' || typeof root.aiGenCall !== 'function') {
  console.warn('ExamAiBatch: không thấy aiManualDialog/aiGenCall của TestOline, bỏ qua.');
  return;
}

/* ---------- tiện ích ---------- */
function numCfg(name, def) { var v = parseInt(root[name], 10); return v > 0 ? v : def; }
function msgOf(e) { return String(e && e.message ? e.message : e); }
var QUOTA_RX = /\b429\b|\b503\b|RESOURCE_EXHAUSTED|quota|hạn mức|\bbận\b|\bbusy\b|rate[_ -]?limit|overload|unavailable|quá tải/i;
function cooldown() { return numCfg('AI_BATCH_COOLDOWN_MS', 10 * 60 * 1000); }

function copyText(t) {
  if (typeof root.aiCopyText === 'function') return root.aiCopyText(t);
  if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
    return root.navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; });
  }
  return Promise.resolve(false);
}
function extractJson(t) {
  if (typeof root.aiExtractJson === 'function') return root.aiExtractJson(t);
  JSON.parse(t); return t;
}

/* ---------- 1) Không chờ lại khi Gemini đã báo bận ---------- */
var genDownUntil = 0, apiDownUntil = 0;
var origGenCall = root.aiGenCall;
root.aiGenCall = async function (body) {
  var gated = !!(body && body.action === 'bank_ai_generate');     // chỉ chặn bước nhờ Gemini tự tạo câu
  if (gated && Date.now() < genDownUntil) {
    throw new Error('Gemini đang bận (vừa thử chưa được) — chuyển thẳng sang dán tay để khỏi chờ');
  }
  try {
    var r = await origGenCall.apply(root, arguments);
    if (gated) genDownUntil = 0;
    return r;
  } catch (e) {
    if (gated && QUOTA_RX.test(msgOf(e))) genDownUntil = Date.now() + cooldown();
    throw e;
  }
};
if (typeof root.aiGeminiApi === 'function') {
  var origApi = root.aiGeminiApi;
  root.aiGeminiApi = async function () {
    if (Date.now() < apiDownUntil) throw new Error('Gemini đang bận (đã thử ít phút trước) — chuyển sang dán tay');
    try {
      var r = await origApi.apply(root, arguments);
      apiDownUntil = 0;
      return r;
    } catch (e) {
      if (QUOTA_RX.test(msgOf(e))) apiDownUntil = Date.now() + cooldown();
      throw e;
    }
  };
}
function resetBreaker() { genDownUntil = 0; apiDownUntil = 0; }

/* ---------- 2) Tách kết quả AI theo dòng "### MỤC k" ---------- */
function splitSegments(raw) {
  var re = /^[ \t>*#_=\-]*M[ỤU]C[ \t]*(\d{1,3})\b[^\n{\[]*$/gim, marks = [], m;
  while ((m = re.exec(raw))) marks.push({ idx: parseInt(m[1], 10), start: m.index, end: re.lastIndex });
  return marks.map(function (mk, k) {
    return { idx: mk.idx, text: raw.slice(mk.end, k + 1 < marks.length ? marks[k + 1].start : raw.length) };
  });
}

/* ---------- 3) Hộp thoại dán tay mới (cùng hợp đồng với aiManualDialog cũ) ---------- */
// jobs: [{title, body}] -> Promise<mảng kết quả theo từng mục: [[câu đã lưu], ...]>
function dialog(jobs, reason) {
  return new Promise(function (resolve) {
    var N = jobs.length;
    var results = jobs.map(function () { return []; });
    var prompts = [], done = [];

    var el = function (tag, css, text) { var x = document.createElement(tag); if (css) x.style.cssText = css; if (text != null) x.textContent = text; return x; };
    var btn = function (color, text) { return el('button', 'background:' + color + ';color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;margin:4px 6px 4px 0;font-size:14px;', text); };
    var ov = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:12px;');
    var box = el('div', 'background:#fff;color:#222;max-width:880px;width:100%;max-height:92vh;overflow:auto;border-radius:14px;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.4);text-align:left;');
    box.id = 'exam-ai-batch-box';
    box.appendChild(el('h3', 'margin:0 0 6px;color:#4361ee;', '🧩 Nhờ AI khác tạo câu (dán tay) — ' + N + ' mục'));
    if (reason) box.appendChild(el('div', 'background:#fff3cd;border-radius:8px;padding:8px 10px;font-size:13px;margin-bottom:8px;', 'AI tự động đang lỗi hoặc hết hạn mức: ' + reason));

    async function getPrompt(i) {
      if (prompts[i]) return prompts[i];
      var r = await root.aiGenCall(Object.assign({}, jobs[i].body, { action: 'bank_ai_prompt', token: root.aiGenToken() }));
      if (!r || !r.prompt) throw new Error('Máy chủ không trả về nội dung yêu cầu');
      prompts[i] = r.prompt;
      return r.prompt;
    }
    async function importJob(i, json) {
      var r = await root.aiGenCall(Object.assign({}, jobs[i].body, { action: 'bank_ai_import', token: root.aiGenToken(), rawText: json }));
      var saved = (r && r.saved) || [], dropped = (r && r.dropped) || [];
      results[i] = results[i].concat(saved);
      if (dropped.length) console.warn('AI (dán tay): câu bị loại', dropped);
      if (saved.length) done[i] = true;
      return { saved: saved.length, dropped: dropped.length };
    }

    /* ----- Khối "Làm nhanh" (chỉ khi có từ 2 mục trở lên) ----- */
    if (N > 1) {
      var per = numCfg('AI_BATCH_JOBS_PER_PART', 5), nParts = Math.ceil(N / per);
      var fast = el('div', 'border:2px solid #16a34a;border-radius:10px;padding:10px;margin:8px 0;background:#f0fdf4;');
      fast.appendChild(el('div', 'font-weight:700;margin-bottom:4px;', '⚡ Làm nhanh: gộp ' + N + ' mục vào ' + nParts + ' lần dán'));
      fast.appendChild(el('div', 'font-size:13px;line-height:1.5;margin-bottom:6px;',
        '(1) Bấm sao chép từng phần, dán vào ChatGPT, Claude hoặc Gemini bản web rồi gửi. (2) Copy kết quả của AI, dán vào CÙNG ô bên dưới (có nhiều phần thì dán nối tiếp nhau). (3) Bấm "Nạp tất cả". Trang tự tách theo "### MỤC k" và báo mục nào còn thiếu.'));
      var fmsg = el('div', 'font-size:13px;margin:4px 0;min-height:18px;');
      var pbox = el('textarea', 'display:none;width:100%;height:90px;font-size:12px;margin:6px 0;box-sizing:border-box;'); pbox.readOnly = true;

      var buildPart = async function (p) {
        var a = p * per, b = Math.min(N, a + per), out = [];
        out.push('Dưới đây có ' + (b - a) + ' yêu cầu độc lập, đánh số MỤC ' + (a + 1) + ' đến MỤC ' + b + '. Hãy làm TỪNG mục đúng theo nội dung riêng của mục đó (mỗi mục tự nêu loại câu, mức độ, số câu và định dạng JSON).\n' +
          'ĐỊNH DẠNG TRẢ LỜI BẮT BUỘC: với mỗi mục, viết một dòng riêng "### MỤC <số>" rồi ngay bên dưới là MỘT khối JSON hợp lệ theo đúng định dạng mà mục đó yêu cầu. Làm đủ các mục, đúng thứ tự, không giải thích thêm bên ngoài JSON.');
        for (var i = a; i < b; i++) {
          fmsg.textContent = 'Đang lấy yêu cầu từ máy chủ (' + (i - a + 1) + '/' + (b - a) + ')...';
          var pr = await getPrompt(i);
          out.push('========== MỤC ' + (i + 1) + ' / ' + N + ': ' + jobs[i].title + ' ==========\n' + pr);
        }
        return out.join('\n\n');
      };
      var partRow = el('div', 'display:flex;flex-wrap:wrap;');
      var partBtns = [];
      for (var p = 0; p < nParts; p++) (function (p) {
        var a = p * per + 1, b = Math.min(N, (p + 1) * per);
        var bp = btn('#2563eb', '📋 Sao chép phần ' + (p + 1) + '/' + nParts + ' (mục ' + a + '–' + b + ')');
        bp.onclick = async function () {
          bp.disabled = true;
          try {
            var text = await buildPart(p);
            pbox.value = text; pbox.style.display = 'block';
            var ok = await copyText(text);
            fmsg.textContent = ok ? '✅ Đã sao chép phần ' + (p + 1) + '/' + nParts + ' (' + text.length + ' ký tự). Hãy dán vào AI khác rồi gửi.'
                                  : 'Chưa tự sao chép được: bấm vào ô yêu cầu bên dưới, Ctrl+A rồi Ctrl+C.';
          } catch (e) {
            fmsg.textContent = '❌ ' + msgOf(e) + (/unknown|không hỗ trợ|invalid_action|action/i.test(msgOf(e)) ? ' (có thể máy chủ Apps Script chưa có action bank_ai_prompt)' : '');
          }
          bp.disabled = false;
        };
        partBtns.push(bp); partRow.appendChild(bp);
      })(p);
      var allTa = el('textarea', 'width:100%;height:150px;font-family:monospace;font-size:12px;margin:6px 0;box-sizing:border-box;');
      allTa.placeholder = 'Dán kết quả của AI vào đây (một hoặc nhiều phần, mỗi mục bắt đầu bằng dòng ### MỤC k)...';
      var bAll = btn('#16a34a', '⬇️ Nạp tất cả');
      var rep = el('div', 'font-size:13px;line-height:1.6;margin-top:4px;');
      var addLine = function (t, color) { rep.appendChild(el('div', 'color:' + color + ';', t)); };

      bAll.onclick = async function () {
        var raw = String(allTa.value || '').normalize('NFC').trim();
        if (!raw) { fmsg.textContent = 'Chưa có nội dung để nạp.'; return; }
        var segs = splitSegments(raw);
        if (!segs.length) { fmsg.textContent = '❌ Không thấy dòng "### MỤC <số>" trong kết quả. Hãy nhờ AI trả lời đúng định dạng, hoặc dùng mục "Làm từng mục riêng" bên dưới.'; return; }
        bAll.disabled = true; rep.textContent = '';
        for (var k = 0; k < segs.length; k++) {
          var idx = segs[k].idx, i = idx - 1;
          if (i < 0 || i >= N) { addLine('⚠ MỤC ' + idx + ': không có trong danh sách (bỏ qua)', '#92400e'); continue; }
          if (done[i]) { addLine('MỤC ' + idx + ': đã nạp trước đó, bỏ qua', '#6b7280'); continue; }
          try {
            var json = extractJson(segs[k].text);
            fmsg.textContent = 'Đang kiểm tra và lưu MỤC ' + idx + '...';
            var r = await importJob(i, json);
            addLine((r.saved ? '✅' : '⚠') + ' MỤC ' + idx + ' (' + jobs[i].title + '): lưu ' + r.saved + ' câu' + (r.dropped ? ', loại ' + r.dropped + ' câu không đạt (xem Console)' : ''), r.saved ? '#166534' : '#92400e');
          } catch (e) { addLine('❌ MỤC ' + idx + ': ' + msgOf(e), '#b91c1c'); }
        }
        var left = []; for (var j = 0; j < N; j++) if (!done[j]) left.push(j + 1);
        fmsg.textContent = left.length ? 'Còn chưa nạp: MỤC ' + left.join(', ') + '. Dán thêm kết quả rồi bấm Nạp tiếp.' : '🎉 Đã nạp đủ ' + N + ' mục. Bấm "Xong, tiếp tục tạo đề".';
        bAll.disabled = false;
      };
      fast.appendChild(partRow); fast.appendChild(pbox); fast.appendChild(allTa); fast.appendChild(bAll); fast.appendChild(fmsg); fast.appendChild(rep);
      box.appendChild(fast);
    }

    /* ----- Cách cũ: từng mục riêng (giữ nguyên chức năng) ----- */
    var holder = N > 1 ? el('details', 'margin:8px 0;') : el('div', '');
    if (N > 1) holder.appendChild(el('summary', 'cursor:pointer;font-weight:600;padding:4px 0;', 'Làm từng mục riêng (cách cũ, dùng khi một mục bị lỗi)'));
    jobs.forEach(function (job, i) {
      var card = el('div', 'border:1px solid #d0d7e2;border-radius:10px;padding:10px;margin:10px 0;');
      card.appendChild(el('div', 'font-weight:700;margin-bottom:4px;', (N > 1 ? 'MỤC ' + (i + 1) + ': ' : '') + job.title));
      var bCopy = btn('#2563eb', '📋 Sao chép yêu cầu');
      var pb = el('textarea', 'display:none;width:100%;height:90px;font-size:12px;margin:6px 0;box-sizing:border-box;'); pb.readOnly = true;
      var ta = el('textarea', 'width:100%;height:110px;font-family:monospace;font-size:12px;margin:6px 0;box-sizing:border-box;');
      ta.placeholder = 'Dán kết quả JSON của AI vào đây...';
      var bImp = btn('#16a34a', '⬇️ Nạp vào ngân hàng');
      var msg = el('div', 'font-size:13px;margin-top:4px;min-height:18px;');
      bCopy.onclick = async function () {
        bCopy.disabled = true; msg.textContent = 'Đang lấy yêu cầu từ máy chủ...';
        try {
          var pr = await getPrompt(i);
          pb.value = pr; pb.style.display = 'block';
          var ok = await copyText(pr);
          msg.textContent = ok ? '✅ Đã sao chép. Hãy dán vào AI khác rồi gửi.' : 'Chưa tự sao chép được: bấm vào ô yêu cầu, Ctrl+A rồi Ctrl+C.';
        } catch (e) { msg.textContent = '❌ ' + msgOf(e); }
        bCopy.disabled = false;
      };
      bImp.onclick = async function () {
        var raw = ta.value.trim();
        if (!raw) { msg.textContent = 'Chưa có nội dung để nạp.'; return; }
        var json;
        try { json = extractJson(raw); } catch (e) { msg.textContent = '❌ ' + msgOf(e); return; }
        bImp.disabled = true; msg.textContent = 'Đang kiểm tra và lưu vào ngân hàng...';
        try {
          var r = await importJob(i, json);
          msg.textContent = '✅ Đã lưu ' + r.saved + ' câu' + (r.dropped ? ', loại ' + r.dropped + ' câu không đạt (xem Console)' : '') + '. Tổng đã nạp cho mục này: ' + results[i].length + '.';
          ta.value = '';
        } catch (e) { msg.textContent = '❌ ' + msgOf(e); }
        bImp.disabled = false;
      };
      card.appendChild(bCopy); card.appendChild(pb); card.appendChild(ta); card.appendChild(bImp); card.appendChild(msg);
      holder.appendChild(card);
    });
    box.appendChild(holder);

    var fin = btn('#4361ee', 'Xong, tiếp tục tạo đề');
    fin.onclick = function () { ov.remove(); resolve(results); };
    var skip = btn('#6b7280', 'Bỏ qua (không nạp thêm)');
    skip.onclick = function () { ov.remove(); resolve(results); };
    box.appendChild(fin); box.appendChild(skip);
    ov.appendChild(box); document.body.appendChild(ov);
  });
}

root.aiManualDialog = dialog;           // aiFillShortage gọi aiManualDialog(...) theo tên toàn cục nên nhận bản mới
root.ExamAiBatch = { version: '1.0', splitSegments: splitSegments, resetBreaker: resetBreaker, dialog: dialog };
})(typeof window !== 'undefined' ? window : globalThis);
