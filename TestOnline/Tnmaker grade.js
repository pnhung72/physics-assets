/** TNMaker Grade v0.1 — tính điểm TX1 từ đáp án đã đọc + khóa chấm. Chạy trình duyệt (window.TNGrade) và Node. */
(function (root) {
  function normDS(x) {              // chấp nhận Đ, D, T, true -> 'Đ'; S, F, false -> 'S'; còn lại = bỏ trống
    if (x === true) return 'Đ'; if (x === false) return 'S';
    var s = String(x == null ? '' : x).trim().toUpperCase();
    if (s === 'Đ' || s === 'D' || s === 'T' || s === 'ĐÚNG') return 'Đ';
    if (s === 'S' || s === 'F' || s === 'SAI') return 'S';
    return '';
  }
  /**
   * key   : object đọc từ dapan_TX1_HK1_2025-2026.json
   * mon   : 'vl10' | 'vl11'
   * made  : '101'...
   * ans   : { mcq:{1:'A',...,8:'D'}, ds:{a:'Đ',b:'S',c:'S',d:'Đ'} }   (rỗng/null = không tô)
   * tay   : { tl: 0..3, saiDonVi: true/false }  — câu 10 giáo viên nhập tay
   */
  function grade(key, mon, made, ans, tay) {
    var K = key[mon], B = key.barem, r = { made: made, loi: [], canXem: [] };
    if (!K || !K.mcq[made]) { r.loi.push('Mã đề ' + made + ' không có trong khóa ' + mon); return r; }
    var kq = K.mcq[made], d1 = 0, sai = [];
    for (var i = 0; i < kq.length; i++) {
      var a = String((ans.mcq || {})[i + 1] || '').toUpperCase();
      if (a === kq[i]) d1 += B.mcqMoiCau; else sai.push(i + 1);
      if (!a) r.canXem.push('Câu ' + (i + 1) + ' bỏ trống/không đọc được');
    }
    var kd = Array.from(K.ds[made]), dung = 0;
    ['a', 'b', 'c', 'd'].forEach(function (k, j) {
      var v = normDS((ans.ds || {})[k]);
      if (!v) r.canXem.push('Câu 9' + k + ' chưa tô');
      if (v === kd[j]) dung++;
    });
    var d2 = B.ds[dung];
    tay = tay || {};
    var d3 = Math.max(0, Math.min(B.tlToiDa, +tay.tl || 0));
    var tru = tay.saiDonVi ? B.truSaiDonVi : 0;
    r.p1 = d1; r.p2 = d2; r.p3 = d3; r.cauSai = sai; r.soYDungCau9 = dung; r.truDonVi = tru;
    r.tong = Math.max(0, Math.round((d1 + d2 + d3 - tru) * 100) / 100);
    r.daTinhCau10 = tay.tl != null;
    return r;
  }
  var api = { grade: grade, normDS: normDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TNGrade = api;
})(typeof window !== 'undefined' ? window : this);