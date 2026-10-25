/*! tnmaker_cham_core.js (v0.1) — lõi CHẤM ĐIỂM dùng chung cho TX / GK / CK.
 * Không đụng DOM, không đụng Drive: nhận kết quả của tnreader.js + đáp án JSON (do tao_dapan.py tạo từ file Word)
 * và trả điểm + giải trình. Chạy được trên trình duyệt (window.TNCham) và Node.
 *
 * Đầu vào  : key  = nội dung dapan_*.json
 *            rd   = kết quả TNReader.readSheet(...)   (rd.made, rd.p1, rd.p2, rd.p3)
 *            opt  = { made:'0201' (ghi đè mã đề nếu thầy sửa tay), tay:{ tl:0..3, saiDonVi:true/false },
 *                     loai:'GK1', mau:'M02', anh:'tên/đường dẫn ảnh' }
 * Đầu ra   : { tong, p1, p2, p3, tl, tru, made, cauSai, p2Sai, p3Sai, trong, canXem[], loi[], giaiTrinh }
 *   - loi    : lỗi chặn (không chấm được, ví dụ mã đề không có trong đáp án)
 *   - canXem : điều cần thầy xem lại (ô tô mờ/tô đôi, câu trả lời ngắn đọc không chắc...) — máy KHÔNG đoán.
 */
(function (root) {
  'use strict';
  var R3 = function (x) { return Math.round(x * 1000) / 1000; };

  function normDS(v) { v = String(v == null ? '' : v).trim().toUpperCase(); return v === 'Đ' || v === 'D' ? 'Đ' : v === 'S' ? 'S' : ''; }

  // "0,75" / "0.75" / " 18 " -> số; không đọc được -> null
  function soTL(s) {
    s = String(s == null ? '' : s).replace(/\s+/g, '').replace(',', '.');
    if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return null;
    var x = parseFloat(s); return isFinite(x) ? x : null;
  }
  function bangTL(a, b) {
    var x = soTL(a), y = soTL(b);
    if (x !== null && y !== null) return Math.abs(x - y) < 1e-9;
    return String(a).trim() === String(b).trim();
  }

  function cham(key, rd, opt) {
    opt = opt || {};
    var out = { tong: 0, p1: 0, p2: 0, p3: 0, tl: 0, tru: 0, made: '', cauSai: [], p2Sai: {}, p3Sai: [], trong: { p1: [], p2: [], p3: [] },
                canXem: [], loi: [], giaiTrinh: null };
    if (!key || !key.made) { out.loi.push('Chưa có đáp án.'); return out; }
    if (!rd || !rd.ok) { out.loi.push((rd && rd.msg) || 'Chưa đọc được phiếu.'); return out; }

    var made = String(opt.made != null && opt.made !== '' ? opt.made : rd.made || '').trim();
    out.made = made;
    if (!/^\d{4}$/.test(made)) { out.loi.push('Mã đề đọc chưa đủ 4 chữ số ("' + made + '"). Hãy nhập mã đề.'); return out; }
    var K = key.made[made];
    if (!K) { out.loi.push('Mã đề ' + made + ' không có trong đáp án (có: ' + Object.keys(key.made).join(', ') + ').'); return out; }

    var D = key.diem, nP1 = K.p1.length, nP2 = Object.keys(K.p2).length, nP3 = K.p3.length, i, q;

    /* ---- Phần I ---- */
    for (i = 1; i <= nP1; i++) {
      var a = rd.p1 && rd.p1[String(i)], dung = K.p1[i - 1].toUpperCase();
      if (!a) { out.canXem.push('Câu ' + i + ' (Phần I): phiếu không có ô này'); continue; }
      if (a.flag) out.canXem.push('Câu ' + i + ' (Phần I): ' + moTaCo(a.flag) + (a.v ? ', máy đọc ' + a.v : ''));
      if (!a.v) { if (!a.flag) out.trong.p1.push(i); continue; }
      if (String(a.v).toUpperCase() === dung) out.p1 += D.p1; else out.cauSai.push(i);
    }
    // tô ngoài phạm vi đề (ví dụ câu 13..40 của phiếu 40 câu): báo, không tính
    if (rd.p1) Object.keys(rd.p1).forEach(function (k) { if (+k > nP1 && rd.p1[k] && rd.p1[k].v) out.canXem.push('Phiếu có tô câu ' + k + ' (Phần I) nhưng đề chỉ có ' + nP1 + ' câu'); });

    /* ---- Phần II ---- */
    for (q = 1; q <= nP2; q++) {
      var ks = K.p2[String(q)], ok = 0, sai = [], r = rd.p2 && rd.p2[String(q)];
      if (!r) { out.canXem.push('Câu ' + q + ' (Phần II): phiếu không có ô này'); continue; }
      'abcd'.split('').forEach(function (y, j) {
        var c = r[y], dungY = normDS(ks[j]);
        if (!c) return;
        if (c.flag) out.canXem.push('Câu ' + q + y + ' (Phần II): ' + moTaCo(c.flag));
        var v = normDS(c.v);
        if (!v) { if (!c.flag) out.trong.p2.push(q + y); return; }
        if (v === dungY) ok++; else sai.push(y);
      });
      out.p2 += D.p2[ok]; out.p2Sai[q] = sai;
    }

    /* ---- Phần III (trả lời ngắn) ---- */
    for (q = 1; q <= nP3; q++) {
      var s = rd.p3 && rd.p3[String(q)];
      if (!s) { out.canXem.push('Câu ' + q + ' (Phần III): phiếu không có ô này'); continue; }
      if (s.bad || /\?/.test(s.v)) { out.canXem.push('Câu ' + q + ' (Phần III): ô tô mờ/tô đôi, máy đọc "' + s.v + '" — cần xem ảnh'); continue; }
      if (s.v === '') { out.trong.p3.push(q); continue; }
      if (bangTL(s.v, K.p3[q - 1])) out.p3 += D.p3; else out.p3Sai.push({ cau: q, doc: s.v, dung: K.p3[q - 1] });
    }

    /* ---- Tự luận (thầy nhập) + trừ đơn vị ---- */
    var tay = opt.tay || {};
    if (tay.tl !== undefined && tay.tl !== null && tay.tl !== '') {
      var t = soTL(tay.tl);
      if (t === null || t < 0 || t > D.tl) out.canXem.push('Điểm tự luận phải từ 0 đến ' + D.tl);
      else out.tl = t;
    } else out.canXem.push('Chưa nhập điểm tự luận (0–' + D.tl + ')');
    if (tay.saiDonVi) out.tru = D.truDonVi;

    out.p1 = R3(out.p1); out.p2 = R3(out.p2); out.p3 = R3(out.p3);
    out.tong = Math.max(0, R3(out.p1 + out.p2 + out.p3 + out.tl - out.tru));
    if (out.tong <= 0) out.canXem.push('Tổng điểm 0: cổng ghi điểm coi 0 là "chưa có điểm". Hãy kiểm tra phiếu.');

    out.giaiTrinh = { loai: opt.loai || key.loai || '', maDe: made, mau: opt.mau || '', anh: opt.anh || '',
                      tn: out.p1, ds: out.p2, sa: out.p3, tl: out.tl, tru: out.tru || undefined };
    return out;
  }

  function moTaCo(f) { return { nhat: 'tô nhạt', to_doi: 'tô nhiều ô', nghi_tay_xoa: 'nghi có tẩy xóa', trong: 'để trống' }[f] || f; }

  // Tạo 1 mục thay đổi gửi cổng nhập điểm (nhapDiemXemTruoc / nhapDiemGhi). cu = điểm thầy đã thấy trong ô khi mở danh sách.
  function taoThayDoi(o) {
    return { id: o.id, cot: o.cot, moi: o.kq.tong, cheDo: 'tb', anhId: o.anhId || '', giaiTrinh: o.kq.giaiTrinh,
             cu: o.cu === undefined ? undefined : o.cu };
  }

  var api = { cham: cham, taoThayDoi: taoThayDoi, soTL: soTL, bangTL: bangTL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TNCham = api;
})(typeof window !== 'undefined' ? window : this);