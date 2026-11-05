/* exam_khoi_plan.js — Đề chung toàn khối (lớp 10: A7,A9,A13 | lớp 11: B11,B12,B15)
   Nguồn điểm: action ksclDiem của Apps Script (TX1 HK1, lần làm đầu tiên, ẩn danh).
   Không dùng AI để tính; AI chỉ là tùy chọn qua nút "Sao chép kế hoạch" / ô dán kết quả.
   Nối vào trang bằng 1 thẻ <script> ở cuối TestOline (giống exam_qa_gate.js). */
(function (root) {
'use strict';
if (root.ExamKhoiPlan) return;

var DEFAULT_API = 'https://script.google.com/macros/s/AKfycbwZtFufSTnRDLon-AIfnPWmafcPqbgBEeFOW7FvYfcKkAtk65bGOJUS_NxthoQcXawLbw/exec';
var LEVELS = ['B', 'H', 'VD', 'VDC'];
var TYPE_NAME = { multipleChoice: 'Trắc nghiệm', trueFalse: 'Đúng/Sai', essay: 'Trả lời ngắn' };
var BANDS = ['kem', 'yeu', 'tb', 'kha', 'gioi', 'xs'];
var BAND_NAME = { kem: 'Kém <3,5', yeu: 'Yếu 3,5–<5', tb: 'TB 5–<6,5', kha: 'Khá 6,5–<8', gioi: 'Giỏi 8–<9', xs: 'Xuất sắc ≥9' };
function bandOf(s) { return s < 3.5 ? 'kem' : s < 5 ? 'yeu' : s < 6.5 ? 'tb' : s < 8 ? 'kha' : s < 9 ? 'gioi' : 'xs'; }
var TF_TABLE = [0, 0.1, 0.25, 0.5, 1];          // điểm câu Đúng/Sai theo số ý đúng
var GUESS = { multipleChoice: 0.25, trueFalse: 0.5, essay: 0 };

function defaultCfg() {
  return {
    a: 1.2,                                            // độ dốc đường cong đáp ứng câu hỏi
    b: { B: -1.2, H: -0.2, VD: 0.8, VDC: 1.8 },        // độ khó từng mức, tính theo "độ lệch chuẩn so với HS trung bình khối"
    shift: 0,                                          // hiệu chỉnh chung (+ = HS thấy đề khó hơn dự báo)
    reps: 24,                                          // số lần mô phỏng mỗi học sinh
    step: 5,                                           // bước lưới tỉ lệ điểm (%)
    limits: { B: [20, 80], H: [10, 50], VD: [0, 30], VDC: [0, 10] },
    target: { kem: 0.05, yeu: 0.10, tb: 0.40, kha: 0.38, gioi: 0.05, xs: 0.02, tol: 0.03, scope: 'khoi' },   // trần từng mức; scope: khoi | weak | all
    structure: { multipleChoice: { n: 18, pt: 0.25 }, trueFalse: { n: 4, pt: 1 }, essay: { n: 6, pt: 0.25 } },
    seed: 20261105
  };
}

/* ---------- tiện ích ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
function sdev(a, m) { if (a.length < 2) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / (a.length - 1)); }
function r2(x) { return Math.round(x * 100) / 100; }
function pct(x) { return (x * 100).toFixed(1).replace('.', ',') + '%'; }
function f1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); }

// chia total phần tử theo trọng số w (tổng 1), tổng luôn đúng bằng total
function alloc(total, w) {
  var raw = w.map(function (x) { return x * total; });
  var base = raw.map(Math.floor);
  var rest = total - base.reduce(function (s, x) { return s + x; }, 0);
  var idx = raw.map(function (x, i) { return i; }).sort(function (i, j) { return (raw[j] - base[j]) - (raw[i] - base[i]) || i - j; });
  for (var k = 0; k < rest; k++) base[idx[k]]++;
  return base;
}

// fr = tỉ lệ [B,H,VD,VDC] (tổng 1) -> danh sách nhóm câu {t, l, n, pt}
function buildItems(fr, st) {
  var items = [];
  Object.keys(st).forEach(function (t) {
    alloc(st[t].n, fr).forEach(function (n, i) { if (n > 0) items.push({ t: t, l: LEVELS[i], n: n, pt: st[t].pt }); });
  });
  return items;
}
function countsOf(items) {
  var c = {};
  items.forEach(function (g) { (c[g.t] = c[g.t] || { B: 0, H: 0, VD: 0, VDC: 0 })[g.l] = g.n; });
  return c;
}
function pointsByLevel(items) {
  var p = { B: 0, H: 0, VD: 0, VDC: 0 }, tot = 0;
  items.forEach(function (g) { var v = g.n * g.pt; p[g.l] += v; tot += v; });
  LEVELS.forEach(function (l) { p[l] = tot ? p[l] / tot : 0; });
  return { frac: p, total: tot };
}

/* ---------- dựng lại điểm từng em từ số liệu ksclStats (script74 có sẵn, không cần sửa) ---------- */
// ksclStats chỉ trả số HS theo 5 mức (kém/yếu/TB/khá/giỏi>=8) + điểm TB lớp.
// Rải đều điểm trong từng mức, rồi uốn nhẹ (lũy thừa p) để điểm TB khớp đúng diemTB của lớp.
function rebuildScores(x) {
  var pb = x.phanBo || {}, B = [[pb.kem || 0, 1, 3.5], [pb.yeu || 0, 3.5, 5], [pb.tb || 0, 5, 6.5], [pb.kha || 0, 6.5, 8], [pb.gioi || 0, 8, 10]];
  function build(p) {
    var pts = [];
    B.forEach(function (b) { for (var j = 0; j < b[0]; j++) pts.push(b[1] + (b[2] - b[1]) * Math.pow((j + 0.5) / b[0], p)); });
    return pts;
  }
  var target = Number(x.diemTB), lo = 0.2, hi = 5, p = 1, pts = build(1);
  if (!pts.length) return [];
  if (isFinite(target)) {
    for (var i = 0; i < 40; i++) { p = (lo + hi) / 2; pts = build(p); if (mean(pts) > target) lo = p; else hi = p; }
  }
  return pts.map(function (v) { return Math.round(v * 100) / 100; });
}

/* ---------- mô hình dự báo ---------- */
function pCorrect(theta, level, cfg) {
  return 1 / (1 + Math.exp(-cfg.a * (theta - (cfg.b[level] + cfg.shift))));
}
function scoreOnce(theta, items, rng, cfg) {
  var s = 0, i, k, j, g, p, q, c;
  for (i = 0; i < items.length; i++) {
    g = items[i]; p = pCorrect(theta, g.l, cfg);
    if (g.t === 'multipleChoice') {
      q = GUESS.multipleChoice + (1 - GUESS.multipleChoice) * p;
      for (k = 0; k < g.n; k++) if (rng() < q) s += g.pt;
    } else if (g.t === 'trueFalse') {
      q = GUESS.trueFalse + (1 - GUESS.trueFalse) * p;
      for (k = 0; k < g.n; k++) { c = 0; for (j = 0; j < 4; j++) if (rng() < q) c++; s += g.pt * TF_TABLE[c]; }
    } else {
      for (k = 0; k < g.n; k++) if (rng() < p) s += g.pt;
    }
  }
  return Math.round(s * 100) / 100;
}

// classes: [{key, lop, ds:[điểm KSCL]}]; trả về thống kê dự báo từng lớp + SD toàn khối
function simulate(items, classes, mu, sd, cfg) {
  var rng = mulberry32(cfg.seed), out = {}, all = [];
  classes.forEach(function (c) {
    var arr = [];
    c.ds.forEach(function (x) {
      var theta = (x - mu) / sd;
      for (var r = 0; r < cfg.reps; r++) arr.push(scoreOnce(theta, items, rng, cfg));
    });
    var n = arr.length, cnt = { kem: 0, yeu: 0, tb: 0, kha: 0, gioi: 0, xs: 0 };
    arr.forEach(function (s) { cnt[bandOf(s)]++; all.push(s); });
    var o = { lop: c.lop, mean: mean(arr) };
    BANDS.forEach(function (k) { o[k] = cnt[k] / n; });
    out[c.key] = o;
  });
  var m = mean(all), pc = { kem: 0, yeu: 0, tb: 0, kha: 0, gioi: 0, xs: 0 };
  all.forEach(function (s) { pc[bandOf(s)]++; });
  var pooled = { lop: 'Toàn khối', mean: m };
  BANDS.forEach(function (k) { pooled[k] = pc[k] / all.length; });
  return { byClass: out, pooled: pooled, sd: sdev(all, m) };
}

function scopeList(sim, weakKey, cfg) {
  var sc = cfg.target.scope;
  if (sc === 'weak') return [sim.byClass[weakKey]];
  if (sc === 'all') return Object.keys(sim.byClass).map(function (k) { return sim.byClass[k]; });
  return [sim.pooled];
}
// vi phạm = phần vượt trần + dung sai, cộng dồn trên các mức
function penaltyOf(sim, weakKey, strongKey, cfg) {
  var T = cfg.target, p = 0;
  scopeList(sim, weakKey, cfg).forEach(function (v) {
    BANDS.forEach(function (k) { p += Math.max(0, v[k] - T[k] - T.tol); });
  });
  return p;
}
function passOf(sim, weakKey, strongKey, cfg) {
  var T = cfg.target, ok = {};
  BANDS.forEach(function (k) { ok[k] = scopeList(sim, weakKey, cfg).every(function (v) { return v[k] <= T[k] + T.tol + 1e-9; }); });
  return ok;
}

// Tìm cơ cấu mức độ B/H/VD/VDC (theo điểm) thỏa các ràng buộc và phân hóa tốt nhất (SD toàn khối lớn nhất)
function planKhoi(classes, cfg) {
  classes = classes.filter(function (c) { return c.ds && c.ds.length; });
  if (!classes.length) throw new Error('Không có dữ liệu điểm KSCL');
  var pool = []; classes.forEach(function (c) { pool = pool.concat(c.ds); });
  var mu = mean(pool), sd = sdev(pool, mu) || 1;
  classes.forEach(function (c) { c.tb = mean(c.ds); });
  var sorted = classes.slice().sort(function (a, b) { return a.tb - b.tb; });
  var weakKey = sorted[0].key, strongKey = sorted[sorted.length - 1].key;

  var L = cfg.limits, st = cfg.step, seen = {}, cands = [];
  for (var B = L.B[0]; B <= L.B[1]; B += st)
    for (var H = L.H[0]; H <= L.H[1]; H += st)
      for (var VD = L.VD[0]; VD <= L.VD[1]; VD += st) {
        var VDC = 100 - B - H - VD;
        if (VDC < L.VDC[0] || VDC > L.VDC[1]) continue;
        var items = buildItems([B / 100, H / 100, VD / 100, VDC / 100], cfg.structure);
        var key = JSON.stringify(countsOf(items));
        if (seen[key]) continue; seen[key] = 1;
        var real = pointsByLevel(items).frac, bad = false;       // sau khi làm tròn số câu, tỉ lệ điểm thực vẫn phải nằm trong giới hạn
        LEVELS.forEach(function (l) { var v = real[l] * 100; if (v < L[l][0] - st / 2 - 1e-9 || v > L[l][1] + st / 2 + 1e-9) bad = true; });
        if (bad) continue;
        var sim = simulate(items, classes, mu, sd, cfg);
        cands.push({ items: items, sim: sim, pen: penaltyOf(sim, weakKey, strongKey, cfg), pass: passOf(sim, weakKey, strongKey, cfg) });
      }
  if (!cands.length) throw new Error('Không dựng được phương án nào với cấu trúc đề này (kiểm tra số câu từng phần)');
  cands.sort(function (a, b) {
    var fa = a.pen < 1e-9, fb = b.pen < 1e-9;
    if (fa !== fb) return fa ? -1 : 1;
    if (!fa && Math.abs(a.pen - b.pen) > 1e-9) return a.pen - b.pen;
    return b.sim.sd - a.sim.sd;
  });
  return { weakKey: weakKey, strongKey: strongKey, mu: mu, sd: sd, tested: cands.length,
           feasible: cands.filter(function (c) { return c.pen < 1e-9; }).length,
           best: cands[0], top: cands.slice(0, 5), classes: classes };
}

/* ---------- ma trận ---------- */
function distribute(counts, lessonKeys) {
  var m = {}, L = lessonKeys.length, off = 0;
  lessonKeys.forEach(function (k) { m[k] = {}; });
  Object.keys(counts).forEach(function (t) {
    lessonKeys.forEach(function (k) { m[k][t] = { B: 0, H: 0, VD: 0, VDC: 0 }; });
    LEVELS.forEach(function (l) {
      for (var i = 0; i < counts[t][l]; i++) m[lessonKeys[(off + i) % L]][t][l]++;
      off += counts[t][l];
    });
  });
  return m;
}

function planText(plan, cfg, khoi, lessonKeys) {
  var b = plan.best, c = countsOf(b.items), pb = pointsByLevel(b.items), t = [];
  t.push('NHIỆM VỤ: Soạn/rà soát ma trận ĐỀ KIỂM TRA CHUNG toàn khối ' + khoi + ' (Vật lí, thang 10).');
  t.push('');
  t.push('1) DỮ LIỆU NỀN (bài khảo sát đầu năm = TX1 HK1, lần làm đầu tiên, ẩn danh)');
  plan.classes.forEach(function (x) {
    var d = x.ds.slice().sort(function (p, q) { return p - q; });
    t.push('- ' + x.lop + ': ' + d.length + ' HS, điểm TB ' + f1(x.tb) + ', trung vị ' + f1(d[Math.floor((d.length - 1) / 2)]));
  });
  t.push('Lớp yếu nhất: ' + plan.classes.filter(function (x) { return x.key === plan.weakKey; })[0].lop +
         '; lớp giỏi nhất: ' + plan.classes.filter(function (x) { return x.key === plan.strongKey; })[0].lop);
  t.push('');
  t.push('2) RÀNG BUỘC CẦN ĐẠT (xếp loại: kém <3,5; yếu 3,5-<5; TB 5-<6,5; khá 6,5-<8; giỏi 8-<9; xuất sắc >=9)');
  t.push('- Tỉ lệ tối đa mỗi mức: ' + BANDS.map(function (k) { return BAND_NAME[k] + ' <= ' + pct(cfg.target[k]); }).join('; ') + ' (dung sai ' + pct(cfg.target.tol) + ' mỗi mức)');
  t.push('- Áp dụng cho: ' + (cfg.target.scope === 'weak' ? 'lớp yếu nhất' : cfg.target.scope === 'all' ? 'từng lớp' : 'toàn khối gộp'));
  t.push('- Đề không dễ lấy điểm 10 nhưng dễ đạt trung bình, có phân hóa.');
  t.push('');
  t.push('3) KẾ HOẠCH HỆ THỐNG ĐỀ XUẤT (mô phỏng, chưa kiểm chứng thực tế)');
  t.push('Tỉ lệ điểm theo mức: B ' + pct(pb.frac.B) + ', H ' + pct(pb.frac.H) + ', VD ' + pct(pb.frac.VD) + ', VDC ' + pct(pb.frac.VDC));
  Object.keys(c).forEach(function (ty) {
    t.push('- ' + TYPE_NAME[ty] + ' (' + cfg.structure[ty].n + ' câu, ' + cfg.structure[ty].pt + ' đ/câu): B=' + c[ty].B + ', H=' + c[ty].H + ', VD=' + c[ty].VD + ', VDC=' + c[ty].VDC);
  });
  var fmtB = function (s) { return BANDS.map(function (k) { return BAND_NAME[k] + ' ' + pct(s[k]); }).join('; '); };
  t.push('Dự báo toàn khối: TB ' + f1(b.sim.pooled.mean) + ' (' + fmtB(b.sim.pooled) + ')');
  t.push('Dự báo từng lớp: ' + plan.classes.map(function (x) { var s = b.sim.byClass[x.key]; return x.lop + ' (TB ' + f1(s.mean) + '; ' + fmtB(s) + ')'; }).join(' | '));
  t.push('');
  t.push('4) PHẠM VI BÀI: ' + (lessonKeys.length ? lessonKeys.join(', ') : '(chưa nhập — hãy liệt kê các bài cần kiểm tra)'));
  t.push('');
  t.push('5) YÊU CẦU CHO AI');
  t.push('- Kiểm tra kế hoạch có hợp lí không; nếu muốn điều chỉnh, giữ tổng số câu từng loại không đổi và nêu lí do ngắn.');
  t.push('- Phân bổ số câu theo loại x mức độ vào TỪNG BÀI trong phạm vi trên (tổng theo loại x mức độ đúng bằng bảng ở mục 3, hoặc bảng điều chỉnh của bạn).');
  t.push('- Trả lời CHỈ bằng một khối JSON, không giải thích ngoài JSON, đúng dạng:');
  t.push('{"matrix":{"<nhãn bài>":{"multipleChoice":{"B":0,"H":0,"VD":0,"VDC":0},"trueFalse":{"B":0,"H":0,"VD":0,"VDC":0},"essay":{"B":0,"H":0,"VD":0,"VDC":0}}},"ghi_chu":"..."}');
  return t.join('\n');
}

/* ---------- API công khai (dùng được cả để kiểm thử) ---------- */
root.ExamKhoiPlan = { defaultCfg: defaultCfg, planKhoi: planKhoi, simulate: simulate, buildItems: buildItems, countsOf: countsOf,
                      pointsByLevel: pointsByLevel, distribute: distribute, rebuildScores: rebuildScores, planText: planText, alloc: alloc };
if (typeof document === 'undefined') return;

/* ====================== GIAO DIỆN (chỉ Admin) ====================== */
var ST = { khoi: '10', data: null, plan: null, cfg: defaultCfg(), lessons: [] };
var $ = function (id) { return document.getElementById(id); };

function isAdmin() { try { return typeof aiIsAdmin === 'function' && !!aiIsAdmin(); } catch (e) { return false; } }
function apiUrl() { return root.KHOI_PLAN_API || (typeof ADMIN_AUTH_API !== 'undefined' ? ADMIN_AUTH_API : DEFAULT_API); }
function msg(t, cls) { var e = $('ekp-msg'); if (e) { e.textContent = t; e.style.color = cls === 'err' ? '#b91c1c' : cls === 'ok' ? '#166534' : '#334155'; } }

function currentLessonKeys() {
  var keys = [];
  try { if (typeof matrixData !== 'undefined' && matrixData) keys = Object.keys(matrixData); } catch (e) {}
  if (!keys.length) keys = ($('ekp-lessons').value || '').split(/[\s,;]+/).filter(Boolean);
  return keys;
}

function readCfg() {
  var c = defaultCfg();
  c.structure.multipleChoice.n = Math.max(0, parseInt($('ekp-n-tn').value, 10) || 0);
  c.structure.trueFalse.n = Math.max(0, parseInt($('ekp-n-ds').value, 10) || 0);
  c.structure.essay.n = Math.max(0, parseInt($('ekp-n-tln').value, 10) || 0);
  c.shift = parseFloat(String($('ekp-shift').value).replace(',', '.')) || 0;
  var tol = parseFloat(String($('ekp-margin').value).replace(',', '.'));
  if (tol >= 0 && tol <= 20) c.target.tol = tol / 100;
  c.target.scope = $('ekp-scope').value;
  return c;
}

var KHOI_LOP = { '10': ['10a7', '10a9', '10a13'], '11': ['11b11', '11b12', '11b15'] };
async function loadData() {
  msg('Đang tải số liệu KSCL...');
  var r = await fetch(apiUrl() + '?action=ksclStats'), j = await r.json();
  if (j && j.success === false) throw new Error(j.message || j.error || 'Máy chủ báo lỗi');
  var d = (j && (j.data || j.result)) || j;
  if (!d || !d.cacLop) throw new Error('Máy chủ không trả số liệu KSCL (kiểm tra action ksclStats)');
  var out = {}, thieu = [];
  KHOI_LOP[ST.khoi].forEach(function (k) { if (d.cacLop[k]) out[k] = d.cacLop[k]; else thieu.push(k); });
  if (!Object.keys(out).length) throw new Error('Chưa có dữ liệu lớp nào của khối ' + ST.khoi);
  ST.data = { cacLop: out, thieuLop: thieu };
  return ST.data;
}

function classesFrom(d) {
  return Object.keys(d.cacLop).map(function (k) {
    var x = d.cacLop[k];
    return { key: k, lop: x.lop, ds: (x.diemLan1 && x.diemLan1.length ? x.diemLan1.slice() : rebuildScores(x)) };
  });
}

async function compute() {
  try {
    ST.cfg = readCfg();
    var d = await loadData();
    msg('Đang mô phỏng (điểm từng em dựng lại xấp xỉ từ phổ điểm KSCL + điểm TB lớp)...');
    await new Promise(function (r) { setTimeout(r, 30); });
    ST.plan = planKhoi(classesFrom(d), ST.cfg);
    ST.lessons = currentLessonKeys();
    render();
    var miss = (d.thieuLop || []);
    msg(ST.plan.feasible ? 'Xong: có ' + ST.plan.feasible + '/' + ST.plan.tested + ' phương án đạt đủ ràng buộc.' :
        'Không phương án nào đạt đủ ràng buộc; hiển thị phương án gần nhất.' , ST.plan.feasible ? 'ok' : 'err');
    if (miss.length) msg($('ekp-msg').textContent + ' Thiếu dữ liệu lớp: ' + miss.join(', '), 'err');
  } catch (e) { msg(String(e && e.message ? e.message : e), 'err'); }
}

function render() {
  var p = ST.plan, b = p.best, c = countsOf(b.items), pb = pointsByLevel(b.items), h = [];
  var tick = function (ok) { return ok ? '✔' : '✘'; };
  h.push('<b>Cơ cấu điểm theo mức:</b> B ' + pct(pb.frac.B) + ' · H ' + pct(pb.frac.H) + ' · VD ' + pct(pb.frac.VD) + ' · VDC ' + pct(pb.frac.VDC));
  h.push('<table style="border-collapse:collapse;margin:6px 0;font-size:13px"><tr><th style="border:1px solid #cbd5e1;padding:3px 8px">Loại</th><th style="border:1px solid #cbd5e1;padding:3px 8px">B</th><th style="border:1px solid #cbd5e1;padding:3px 8px">H</th><th style="border:1px solid #cbd5e1;padding:3px 8px">VD</th><th style="border:1px solid #cbd5e1;padding:3px 8px">VDC</th></tr>' +
    Object.keys(c).map(function (t) { return '<tr><td style="border:1px solid #cbd5e1;padding:3px 8px">' + TYPE_NAME[t] + '</td>' + LEVELS.map(function (l) { return '<td style="border:1px solid #cbd5e1;padding:3px 8px;text-align:center">' + c[t][l] + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>');
  var td = 'border:1px solid #cbd5e1;padding:3px 6px;text-align:center';
  var row = function (cells) { return '<tr>' + cells.map(function (v) { return '<td style="' + td + '">' + v + '</td>'; }).join('') + '</tr>'; };
  var T = ST.cfg.target;
  h.push('<table style="border-collapse:collapse;font-size:13px"><tr>' + ['Lớp', 'HS', 'TB KSCL', 'TB dự báo'].concat(BANDS.map(function (k) { return BAND_NAME[k]; })).map(function (x) { return '<th style="' + td + '">' + x + '</th>'; }).join('') + '</tr>' +
    row(['<b>Trần yêu cầu</b>', '', '', ''].concat(BANDS.map(function (k) { return '≤ ' + pct(T[k]); }))) +
    p.classes.map(function (x) {
      var s = b.sim.byClass[x.key], tag = x.key === p.weakKey ? ' (yếu nhất)' : x.key === p.strongKey ? ' (giỏi nhất)' : '';
      return row([x.lop + tag, x.ds.length, f1(x.tb), f1(s.mean)].concat(BANDS.map(function (k) { return pct(s[k]); })));
    }).join('') +
    row(['<b>Toàn khối</b>', p.classes.reduce(function (a, x) { return a + x.ds.length; }, 0), f1(p.mu), f1(b.sim.pooled.mean)].concat(BANDS.map(function (k) { return pct(b.sim.pooled[k]) + ' ' + (b.sim.pooled[k] <= T[k] + T.tol + 1e-9 ? '✔' : '✘'); }))) +
    '</table>');
  h.push('<div style="margin-top:6px">Đạt trần (có dung sai) theo phạm vi "' + (T.scope === 'weak' ? 'lớp yếu nhất' : T.scope === 'all' ? 'từng lớp' : 'toàn khối') + '": ' + BANDS.map(function (k) { return BAND_NAME[k] + ' ' + tick(b.pass[k]); }).join(' · ') + '</div>');
  h.push('<div style="color:#64748b;font-size:12px;margin-top:4px">Đây là dự báo bằng mô hình, không phải cam kết. Sau khi chấm đề thật, so sánh với bảng trên rồi chỉnh ô "Hiệu chỉnh độ khó".</div>');
  $('ekp-result').innerHTML = h.join('');
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); return Promise.resolve();
}
async function copyPlan() {
  if (!ST.plan) { msg('Hãy bấm "Tính kế hoạch" trước.', 'err'); return; }
  var keys = currentLessonKeys();
  await copyText(planText(ST.plan, ST.cfg, ST.khoi, keys));
  msg('Đã sao chép kế hoạch. Dán vào AI khác, rồi dán JSON AI trả về vào ô bên dưới.', 'ok');
}

function applyMatrixObj(m) {
  if (typeof matrixData === 'undefined') throw new Error('Không thấy biến matrixData của trang');
  Object.keys(m).forEach(function (k) {
    if (!matrixData[k] || typeof matrixData[k] !== 'object') matrixData[k] = {};
    Object.keys(m[k]).forEach(function (t) { matrixData[k][t] = Object.assign({}, matrixData[k][t] || {}, m[k][t]); });
  });
  ['updateMatrixDisplay', 'renderMatrixTableSafe', 'updateMatrixStatus'].forEach(function (fn) {
    try { if (typeof root[fn] === 'function') root[fn](); } catch (e) { console.warn('ExamKhoiPlan: ' + fn, e); }
  });
}
function applyPlan() {
  if (!ST.plan) { msg('Hãy bấm "Tính kế hoạch" trước.', 'err'); return; }
  var keys = currentLessonKeys();
  if (!keys.length) { msg('Chưa có danh sách bài: dựng ma trận trước hoặc nhập nhãn bài (VD L10-C1-B1) vào ô phạm vi.', 'err'); return; }
  try { applyMatrixObj(distribute(countsOf(ST.plan.best.items), keys)); msg('Đã nạp ma trận (' + keys.length + ' bài) vào trang. Kiểm tra lại bảng ma trận.', 'ok'); }
  catch (e) { msg(String(e.message || e), 'err'); }
}
function importPaste() {
  var raw = ($('ekp-paste').value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    var j = JSON.parse(raw), m = j.matrix || j;
    Object.keys(m).forEach(function (k) {
      Object.keys(m[k]).forEach(function (t) {
        if (!TYPE_NAME[t]) throw new Error('Loại câu lạ: ' + t);
        LEVELS.forEach(function (l) { var v = Number(m[k][t][l]); if (!(v >= 0) || v % 1) throw new Error(k + '/' + t + '/' + l + ' không phải số nguyên >= 0'); m[k][t][l] = v; });
      });
    });
    applyMatrixObj(m); msg('Đã nạp JSON từ AI vào ma trận (' + Object.keys(m).length + ' bài).', 'ok');
  } catch (e) { msg('JSON không hợp lệ: ' + (e.message || e), 'err'); }
}

function buildUI() {
  if ($('ekp-btn')) return;
  var btn = document.createElement('button');
  btn.id = 'ekp-btn'; btn.type = 'button'; btn.textContent = '📊 Đề chung khối';
  btn.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99990;padding:9px 14px;border:0;border-radius:10px;background:#1e5f74;color:#fff;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  var box = document.createElement('div');
  box.id = 'ekp-box';
  box.style.cssText = 'display:none;position:fixed;inset:0;z-index:99991;background:rgba(15,23,42,.55);overflow:auto';
  box.innerHTML =
    '<div style="background:#fff;color:#0f172a;max-width:780px;margin:24px auto;padding:16px 18px;border-radius:12px;font-size:14px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:16px">Đề kiểm tra chung toàn khối</b><button id="ekp-x" type="button" style="border:0;background:none;font-size:20px;cursor:pointer">✕</button></div>' +
    '<div style="margin:8px 0;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
    'Khối <select id="ekp-khoi"><option value="10">10 (A7, A9, A13)</option><option value="11">11 (B11, B12, B15)</option></select>' +
    ' Số câu TN <input id="ekp-n-tn" type="number" value="18" min="0" style="width:52px"> Đ/S <input id="ekp-n-ds" type="number" value="4" min="0" style="width:46px"> TLN <input id="ekp-n-tln" type="number" value="6" min="0" style="width:46px">' +
    ' Áp trần cho <select id="ekp-scope"><option value="khoi">toàn khối</option><option value="weak">lớp yếu nhất</option><option value="all">từng lớp</option></select>' +
        ' Hiệu chỉnh độ khó <input id="ekp-shift" type="text" value="0" style="width:46px" title="+ nếu đề thật khó hơn dự báo, − nếu dễ hơn"> Dung sai mỗi mức (điểm %) <input id="ekp-margin" type="text" value="3" style="width:40px"></div>' +
    '<div>Phạm vi bài (nhãn, cách nhau bởi dấu phẩy; bỏ trống nếu ma trận đã có bài): <input id="ekp-lessons" type="text" style="width:100%;box-sizing:border-box" placeholder="L10-C1-B1, L10-C1-B2"></div>' +
    '<div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap">' +
    '<button id="ekp-go" type="button" style="padding:7px 12px">Tính kế hoạch</button>' +
    '<button id="ekp-apply" type="button" style="padding:7px 12px">Nạp vào ma trận</button>' +
    '<button id="ekp-copy" type="button" style="padding:7px 12px">Sao chép kế hoạch (cho AI khác)</button></div>' +
    '<div id="ekp-msg" style="min-height:18px;margin:4px 0"></div><div id="ekp-result"></div>' +
    '<div style="margin-top:10px">Dán JSON do AI khác trả về:<textarea id="ekp-paste" rows="4" style="width:100%;box-sizing:border-box"></textarea>' +
    '<button id="ekp-import" type="button" style="padding:7px 12px;margin-top:4px">Nạp JSON vào ma trận</button></div></div>';
  document.body.appendChild(btn); document.body.appendChild(box);
  btn.onclick = function () { box.style.display = 'block'; };
  $('ekp-x').onclick = function () { box.style.display = 'none'; };
  $('ekp-khoi').onchange = function () { ST.khoi = this.value; ST.plan = null; $('ekp-result').innerHTML = ''; };
  $('ekp-go').onclick = compute; $('ekp-apply').onclick = applyPlan;
  $('ekp-copy').onclick = copyPlan; $('ekp-import').onclick = importPaste;
}
function tick() {
  var has = !!$('ekp-btn');
  if (isAdmin()) { if (!has) buildUI(); } else if (has) { $('ekp-btn').remove(); $('ekp-box').remove(); }
}
setInterval(tick, 1500); tick();
})(typeof window !== 'undefined' ? window : globalThis);
