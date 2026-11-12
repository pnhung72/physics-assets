/* ============================================================
 * matrix_planner.js (v2) - Bộ lập MA TRẬN NHÁP cho TX / GK / CK (chờ Admin duyệt, chỉnh tay)
 * Đặt trên GitHub pnhung72/physics-assets/TestOnline/, nối vào TestOline bằng 1 thẻ <script>.
 * KHÔNG sửa hàm nào của TestOline; chỉ đọc allQuestions và trả về đối tượng matrixData.
 *
 * GK / CK  (ma trận chung toàn khối): khung 27 mục = 12 TN + 8 ý Đ/S + 4 TLN + 3 TL = 10,00 điểm
 *          điểm: TN 0,25 | Đ/S 0,25/ý | TLN 0,5 | TL 1,0
 *          tỉ lệ ĐIỂM theo mức B:H:VD = 4:3:3 ; bật useVDC thì 4:3:2:1
 * TX1,TX2,TX4,TX5...: 15 phút = 8 TN x 0,5 (4đ) + 1 câu Đ/S 4 ý (3đ; 0,75/ý) + tự luận 3đ
 *          tỉ lệ B:H:VD:VDC = 4:3:2:1 trong TỪNG PHẦN (làm tròn theo phần dư lớn nhất)
 * ============================================================ */
(function (root) {
  'use strict';

  var LEVELS = ['B', 'H', 'VD', 'VDC'];
  var TYPES = ['multipleChoice', 'trueFalse', 'essay', 'essay_multi'];
  var ALLOWED = {
    multipleChoice: ['B', 'H', 'VD', 'VDC'],
    trueFalse: ['B', 'H', 'VD', 'VDC'],
    essay: ['B', 'H', 'VD', 'VDC'],
    essay_multi: ['VD', 'VDC']
  };

  var PRESETS = {
    GK: {
      mode: 'global', minutes: 45,
      frame: { multipleChoice: 12, trueFalse: 8, essay: 4, essay_multi: 3 },
      unit: { multipleChoice: 0.25, trueFalse: 0.25, essay: 0.5, essay_multi: 1.0 }
    },
    TX: {
      mode: 'perPart', minutes: 15,
      frame: { multipleChoice: 8, trueFalse: 4, essay: 1, essay_multi: 0 },
      unit: { multipleChoice: 0.5, trueFalse: 0.75, essay: 3.0, essay_multi: 0 },
      essayLevel: 'VD'     // 1 câu tự luận 3đ: mặc định mức VD (như các ma trận TX1 đã dùng)
    }
  };

  function zeroRow() {
    var r = {};
    TYPES.forEach(function (t) { r[t] = { B: 0, H: 0, VD: 0, VDC: 0 }; });
    return r;
  }
  function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }

  function pointsByLevel(matrix, unit) {
    var p = { B: 0, H: 0, VD: 0, VDC: 0 }, total = 0;
    Object.keys(matrix || {}).forEach(function (k) {
      TYPES.forEach(function (t) {
        var r = (matrix[k] || {})[t] || {};
        LEVELS.forEach(function (l) {
          var v = (parseInt(r[l], 10) || 0) * (unit[t] || 0);
          p[l] += v; total += v;
        });
      });
    });
    var pct = {};
    LEVELS.forEach(function (l) { pct[l] = total ? Math.round(p[l] / total * 1000) / 10 : 0; });
    return { points: p, total: total, pct: pct };
  }

  /* ---------- chế độ GLOBAL (GK/CK): tối ưu điểm theo mức trên toàn đề ---------- */
  function comps(n, allowed, capT) {
    var out = [];
    (function rec(i, left, cur) {
      if (i === 4) { if (left === 0) out.push(cur.slice()); return; }
      if (allowed.indexOf(LEVELS[i]) < 0) { cur[i] = 0; rec(i + 1, left, cur); return; }
      for (var c = 0; c <= left; c++) {
        if (c > capT[i]) break;
        cur[i] = c; rec(i + 1, left - c, cur);
      }
    })(0, n, [0, 0, 0, 0]);
    return out;
  }
  function entries(frame, unit, type, capFn, ref, useVDC, rv) {
    var capT = LEVELS.map(function (l) { return capFn(type, l); });
    var allowed = ALLOWED[type].filter(function (l) { return useVDC || l !== 'VDC'; });
    return comps(frame[type] || 0, allowed, capT).map(function (c) {
      var d = 0;
      if (ref && ref[type]) for (var i = 0; i < 4; i++) d += Math.abs(c[i] - (ref[type][LEVELS[i]] || 0));
      if (c[3] > 0 && c[2] === 0 && allowed.indexOf('VD') >= 0) d += 30;   // có VDC mà chưa có VD cùng loại: phạt nhẹ
      // Trải đều: mỗi loại câu nên có mức độ gần tỉ lệ chung (tránh dồn cả loại vào một mức)
      if (rv) { var rs = sum(rv), n0 = frame[type] || 0; for (var q = 0; q < 4; q++) d += Math.abs(c[q] - n0 * rv[q] / rs); }
      return { c: c, p: c.map(function (x) { return x * unit[type]; }), d: d };
    });
  }
  function solveGlobal(frame, unit, tgtPts, capFn, ref, useVDC, rv) {
    var MC = entries(frame, unit, 'multipleChoice', capFn, ref, useVDC, rv), TF = entries(frame, unit, 'trueFalse', capFn, ref, useVDC, rv);
    var SA = entries(frame, unit, 'essay', capFn, ref, useVDC, rv), ES = entries(frame, unit, 'essay_multi', capFn, ref, useVDC, rv);
    if (!MC.length || !TF.length || !SA.length || !ES.length) return null;
    var A = [], B = [], i, j;
    for (i = 0; i < MC.length; i++) for (j = 0; j < TF.length; j++)
      A.push({ p: [0, 1, 2, 3].map(function (k) { return MC[i].p[k] + TF[j].p[k]; }), d: MC[i].d + TF[j].d, a: i, b: j });
    for (i = 0; i < SA.length; i++) for (j = 0; j < ES.length; j++)
      B.push({ p: [0, 1, 2, 3].map(function (k) { return SA[i].p[k] + ES[j].p[k]; }), d: SA[i].d + ES[j].d, a: i, b: j });
    var best = null, bestCost = Infinity;
    for (i = 0; i < A.length; i++) {
      var a = A[i];
      for (j = 0; j < B.length; j++) {
        var b = B[j];
        var cost = Math.abs(a.p[0] + b.p[0] - tgtPts[0]) + Math.abs(a.p[1] + b.p[1] - tgtPts[1]) +
                   Math.abs(a.p[2] + b.p[2] - tgtPts[2]) + Math.abs(a.p[3] + b.p[3] - tgtPts[3]) + 0.01 * (a.d + b.d);
        if (cost < bestCost) { bestCost = cost; best = { a: a, b: b }; }
      }
    }
    var pick = { multipleChoice: MC[best.a.a], trueFalse: TF[best.a.b], essay: SA[best.b.a], essay_multi: ES[best.b.b] }, res = {};
    TYPES.forEach(function (t) { res[t] = {}; LEVELS.forEach(function (l, k) { res[t][l] = pick[t].c[k]; }); });
    return res;
  }

  /* ---------- chế độ PER-PART (TX): chia theo tỉ lệ trong từng phần ---------- */
  // Chia n mục theo tỉ lệ (phần dư lớn nhất), rồi dồn phần vượt cap sang mức kề
  function splitByRatio(n, ratioVec, capVec, mask) {
    var rv = ratioVec.map(function (r, i) { return mask[i] ? r : 0; });
    var s = sum(rv), ideal = rv.map(function (r) { return n * r / s; });
    var out = ideal.map(Math.floor), left = n - sum(out);
    var order = ideal.map(function (v, i) { return { i: i, f: v - Math.floor(v) }; })
      .filter(function (x) { return mask[x.i]; })
      .sort(function (a, b) { return b.f - a.f || b.i - a.i; });
    for (var k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++;
    var moved = [];
    for (var i = 3; i >= 0; i--) {
      while (out[i] > capVec[i]) {
        var done = false;
        [-1, 1, -2, 2, -3, 3].forEach(function (d) {
          var j = i + d;
          if (done || j < 0 || j > 3 || !mask[j] || out[j] >= capVec[j]) return;
          out[i]--; out[j]++; moved.push({ from: LEVELS[i], to: LEVELS[j] }); done = true;
        });
        if (!done) break;    // không còn chỗ: giữ nguyên, sẽ báo thiếu
      }
    }
    return { out: out, moved: moved };
  }
  function solvePerPart(frame, ratio, capFn, essayLevel, useVDC, notes) {
    var rv = LEVELS.map(function (l) { return ratio[l] || 0; });
    var res = {};
    TYPES.forEach(function (t) {
      res[t] = { B: 0, H: 0, VD: 0, VDC: 0 };
      var n = frame[t] || 0;
      if (!n) return;
      var mask = LEVELS.map(function (l) { return ALLOWED[t].indexOf(l) >= 0 && (useVDC || l !== 'VDC'); });
      var cap = LEVELS.map(function (l) { return capFn(t, l); });
      var r;
      if (n === 1 && essayLevel && t === 'essay') {
        var cv = [0, 0, 0, 0], li = LEVELS.indexOf(essayLevel); cv[li] = 1;
        r = splitByRatio(1, cv.map(function (x) { return x ? 1 : 0; }), cap, mask);
      } else {
        r = splitByRatio(n, rv, cap, mask);
      }
      LEVELS.forEach(function (l, i) { res[t][l] = r.out[i]; });
      r.moved.forEach(function (m) { notes.push(t + ': thiếu câu mức ' + m.from + ', chuyển 1 câu sang mức ' + m.to + '.'); });
    });
    return res;
  }

  /* ---------- chia câu vào các bài theo số tiết, không vượt số câu khả dụng ---------- */
  function allocate(counts, lessons, availFn) {
    var m = {}, totalItems = 0, wsum = 0;
    lessons.forEach(function (l) { m[l.key] = zeroRow(); l.n = 0; wsum += l.weight; });
    TYPES.forEach(function (t) { LEVELS.forEach(function (lv) { totalItems += counts[t][lv]; }); });
    lessons.forEach(function (l) { l.target = totalItems * l.weight / wsum; });
    var cells = [];
    TYPES.forEach(function (t) {
      LEVELS.forEach(function (lv) {
        var k = counts[t][lv];
        if (!k) return;
        var tot = 0;
        lessons.forEach(function (l) { tot += availFn(l.key, t, lv); });
        cells.push({ type: t, level: lv, k: k, scarcity: tot / k });
      });
    });
    cells.sort(function (x, y) { return x.scarcity - y.scarcity; });
    cells.forEach(function (c) {
      for (var u = 0; u < c.k; u++) {
        var best = null;
        lessons.forEach(function (l) {
          if (availFn(l.key, c.type, c.level) - m[l.key][c.type][c.level] <= 0) return;
          var def = l.target - l.n;
          if (!best || def > best.def + 1e-9) best = { l: l, def: def };
        });
        if (!best) continue;
        m[best.l.key][c.type][c.level]++;
        best.l.n++;
      }
    });
    return m;
  }

  function kindOf(taskType) { return /^TX/i.test(String(taskType || '')) ? 'TX' : 'GK'; }   // CK dùng khung GK

  /* plan({
   *   grade:'11', taskType:'GK2' | 'CK1' | 'TX1' ..., topic:'GK2',
   *   lessons:[{chapter:2, lesson:8, name:'Bài 8...', periods:2}, ...],      // các bài sẽ kiểm tra
   *   avail:(key,type,level)=>số câu khả dụng,                                // key = 'lớp_chương_bài'
   *   useVDC:false,            // GK/CK: false = 4:3:3 ; true = 4:3:2:1.  TX luôn 4:3:2:1 (trừ khi truyền false)
   *   ratio, frame, unit, essayLevel, ref   // tuỳ chọn, ghi đè mặc định
   * }) */
  function plan(o) {
    var kind = kindOf(o.taskType), P = PRESETS[kind];
    var frame = o.frame || P.frame, unit = o.unit || P.unit;
    var useVDC = (o.useVDC === undefined) ? (kind === 'TX') : !!o.useVDC;
    var ratio = o.ratio || (useVDC ? { B: 4, H: 3, VD: 2, VDC: 1 } : { B: 4, H: 3, VD: 3, VDC: 0 });
    var frameTotal = 0;
    TYPES.forEach(function (t) { frameTotal += (frame[t] || 0) * (unit[t] || 0); });
    var sumR = LEVELS.reduce(function (s, l) { return s + (ratio[l] || 0); }, 0);
    var tgtPts = LEVELS.map(function (l) { return (ratio[l] || 0) / sumR * frameTotal; });
    var tgtPct = {}; LEVELS.forEach(function (l) { tgtPct[l] = Math.round((ratio[l] || 0) / sumR * 1000) / 10; });

    var lessons = o.lessons.map(function (x) {
      return { key: o.grade + '_' + x.chapter + '_' + x.lesson, name: x.name || '', weight: x.periods > 0 ? x.periods : 1 };
    });
    var avail = o.avail;
    function capReal(t, l) { var s = 0; lessons.forEach(function (x) { s += avail(x.key, t, l); }); return s; }

    var warnings = [], shortages = [], fallback = false, counts;
    if (P.mode === 'global') {
      var rvec = LEVELS.map(function (l) { return ratio[l] || 0; });
      counts = solveGlobal(frame, unit, tgtPts, capReal, o.ref, useVDC, rvec);
      if (!counts) {
        fallback = true;
        counts = solveGlobal(frame, unit, tgtPts, function () { return Infinity; }, o.ref, useVDC, rvec);
      }
    } else {
      counts = solvePerPart(frame, ratio, capReal, o.essayLevel || P.essayLevel, useVDC, warnings);
    }
    TYPES.forEach(function (t) {
      LEVELS.forEach(function (l) {
        var have = capReal(t, l);
        if (counts[t][l] > have) { shortages.push({ type: t, level: l, need: counts[t][l], have: have }); fallback = true; }
      });
    });
    if (fallback) warnings.push('Ngân hàng chưa đủ câu cho một số ô; ma trận giữ đúng khung và tỉ lệ, các ô thiếu liệt kê ở shortages (cần AI soạn thêm hoặc mượn câu).');
    var matrix = allocate(counts, lessons, fallback ? function () { return 1e9; } : avail);

    var stat = pointsByLevel(matrix, unit), items = 0, tfItems = 0, partStats = {};
    var tot = {};
    TYPES.forEach(function (t) { tot[t] = { B: 0, H: 0, VD: 0, VDC: 0 }; });
    Object.keys(matrix).forEach(function (k) { TYPES.forEach(function (t) { LEVELS.forEach(function (l) { tot[t][l] += matrix[k][t][l]; }); }); });
    TYPES.forEach(function (t) {
      var n = sum(LEVELS.map(function (l) { return tot[t][l]; }));
      if (!n) return;
      partStats[t] = { counts: tot[t], points: Math.round(n * (unit[t] || 0) * 100) / 100 };
    });
    Object.keys(matrix).forEach(function (k) {
      TYPES.forEach(function (t) { LEVELS.forEach(function (l) {
        items += matrix[k][t][l];
        if (t === 'trueFalse') tfItems += matrix[k][t][l];
      }); });
    });
    if (tfItems % 4) warnings.push('Tổng số ý Đúng/Sai = ' + tfItems + ' không chia hết cho 4.');
    lessons.forEach(function (l) { if (!l.n) warnings.push('Chưa có câu nào cho ' + l.key + ' ' + l.name); });

    return {
      grade: o.grade, taskType: o.taskType || null, topic: o.topic || o.taskType || '', kind: kind, minutes: P.minutes,
      matrixData: matrix, items: items, questions: items - Math.round(tfItems * 3 / 4), partStats: partStats,
      points: Math.round(stat.total * 100) / 100,
      levelPct: stat.pct, levelTarget: tgtPct, useVDC: useVDC,
      lessons: lessons.map(function (l) { return { key: l.key, name: l.name, items: l.n }; }),
      shortages: shortages, warnings: warnings, fallback: fallback
    };
  }

  // Lấy số câu khả dụng từ allQuestions của TestOline (cùng cách dựng với buildQuestionIndex)
  function bankFromQuestions(allQuestions, opts) {
    opts = opts || {};
    var idx = {}, chapterOf = {};
    Object.keys(allQuestions || {}).forEach(function (id) {
      var q = allQuestions[id];
      if (!q || typeof q !== 'object') return;
      var type = q.type === 'essay-multi' ? 'essay_multi' : q.type;
      var lesson = (q.lesson !== undefined && q.lesson !== null && String(q.lesson) !== '') ? String(q.lesson) : null;
      if (lesson === null && q.topic) { var m = String(q.topic).match(/(\d+)/); if (m) lesson = m[1]; }
      if (lesson === null) return;
      chapterOf[q.grade + '|' + lesson] = String(q.chapter);
      var k = q.grade + '_' + q.chapter + '_' + lesson;
      (idx[k] = idx[k] || []).push({ type: type, level: q.level, q: q });
    });
    // Đúng/Sai tính theo ý: nếu trang có tfCountItems(câuCủaBài, mức) thì truyền vào opts.tfCountLesson; không thì tạm tính 4 ý/câu
    var tfLesson = opts.tfCountLesson || null;
    return {
      chapterOf: function (grade, lesson) { return chapterOf[grade + '|' + lesson]; },
      avail: function (key, type, level) {
        var all = idx[key] || [];
        if (type === 'trueFalse' && tfLesson) return tfLesson(all.map(function (x) { return x.q; }), level) || 0;
        var n = all.filter(function (x) { return x.type === type && x.level === level; }).length;
        return type === 'trueFalse' ? n * 4 : n;
      }
    };
  }

  var api = { plan: plan, pointsByLevel: pointsByLevel, bankFromQuestions: bankFromQuestions,
              PRESETS: PRESETS, LEVELS: LEVELS, TYPES: TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MatrixPlanner = api;
})(typeof window !== 'undefined' ? window : globalThis);
