/** TNMaker ChamPhieu v0.2 — cầu nối: kết quả TNReader.readSheet  ->  TNGrade.grade
 *  Dùng: TNChamPhieu.cham(key, 'vl10', readResult, {tay:{...}, cauDS:'1', cauTL:'1', soCauMCQ:8, footerMade:'103'})
 *  Chạy trình duyệt (window.TNChamPhieu, cần TNGrade đã nạp) và Node.
 *  v0.2: (1) mã đề tô trên phiếu có số 0 đầu (0107) được ghép với khóa 107; (2) các cờ "tô nhạt / tô đôi / nghi tẩy xóa"
 *        nay được đưa vào danh sách "cần xem" (bản 0.1 tạo cờ nhưng không chuyển ra giao diện); (3) bỏ lỗi gọi G.normMade không tồn tại. */
(function (root) {
  function getGrade() { return (typeof require === 'function' && typeof module !== 'undefined') ? require('./Tnmaker_grade.js') : root.TNGrade; }
  function normMade(s) { return String(s == null ? '' : s).replace(/\D/g, '').replace(/^0+(?=\d)/, ''); }
  function timMa(key, mon, made) {          // thử nguyên văn, bỏ số 0 đầu, rồi dạng 4 chữ số
    var K = key && key[mon], n = normMade(made), c = [String(made), n, ('0000' + n).slice(-4)];
    if (K && K.mcq) for (var i = 0; i < c.length; i++) if (K.mcq[c[i]]) return c[i];
    return n;
  }

  function chuyen(rd, o) {
    o = o || {};
    var n = o.soCauMCQ || 8, co = [], ans = { mcq: {}, ds: {}, tl: null, co: co };
    for (var i = 1; i <= n; i++) { var c = (rd.p1 || {})[i]; ans.mcq[i] = c && c.v ? c.v : ''; }
    var kds = o.cauDS || Object.keys(rd.p2 || {})[0], ds = (rd.p2 || {})[kds] || {};
    ['a', 'b', 'c', 'd'].forEach(function (k) { ans.ds[k] = ds[k] && ds[k].v ? ds[k].v : ''; });
    var ktl = o.cauTL || Object.keys(rd.p3 || {})[0], tl = (rd.p3 || {})[ktl];
    if (tl && !tl.bad && tl.v && !/\?/.test(tl.v)) ans.tl = tl.v;      // câu điền số không dùng trong TX1 (câu 10 viết tay)
    var TEN = { nhat: 'tô nhạt', to_doi: 'tô đôi', nghi_tay_xoa: 'nghi tẩy xóa', trong: 'để trống', khong_co_o: 'không có ô' };
    (rd.flags || []).forEach(function (f) {
      var loai = TEN[f.loai] || f.loai, vi;
      // chỉ giữ cờ của các câu thuộc bài (phiếu có 40 câu P1, 8 câu P2, 6 câu P3 nhưng bài chỉ dùng một phần)
      if (f.v === 'P1' && f.c > n) return;
      if (f.v === 'P2' && String(f.c) !== String(kds)) return;
      if (f.v === 'P3') return;                          // câu viết tay/điền số: giáo viên nhập, không báo cờ P3
      if (f.v === 'SBD') return;                         // SBD để ngỏ
      if (f.loai === 'trong' && (f.v === 'P1' || f.v === 'P2')) return;   // câu trống đã được grade báo riêng
      if (f.v === 'P1') vi = 'Câu ' + f.c; else if (f.v === 'P2') vi = 'Câu Đ/S ý ' + f.y;
      else if (f.v === 'MaDe') vi = 'Mã đề cột ' + f.vi; else vi = f.v;
      co.push(vi + ': ' + loai);
    });
    return ans;
  }

  function cham(key, mon, rd, o) {
    o = o || {};
    if (!rd || !rd.ok) return { loi: [(rd && rd.msg) || 'Không đọc được phiếu'], canXem: [] };
    var G = getGrade(), raw = rd.made;
    if (!raw || /[^0-9]/.test(raw)) return { loi: ['Không đọc được mã đề (' + raw + '). Nhập mã đề thủ công.'], canXem: [], made: raw };
    var made = timMa(key, mon, raw), ans = chuyen(rd, o), r = G.grade(key, mon, made, ans, o.tay || {});
    r.canXem = r.canXem || [];
    ans.co.forEach(function (c) { r.canXem.push(c); });          // đưa cờ của bộ đọc ra giao diện
    if (o.footerMade && normMade(o.footerMade) !== normMade(made))
      r.canXem.push('Lệch mã đề: học sinh tô ' + raw + ', chân phiếu ghi ' + o.footerMade);
    r.madeTo = raw; r.sbd = rd.sbd; r.doc = ans;
    return r;
  }
  var api = { cham: cham, chuyen: chuyen, normMade: normMade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TNChamPhieu = api;
})(typeof window !== 'undefined' ? window : this);
