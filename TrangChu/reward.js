/* reward.js - Phần thưởng & lời động viên sau khi nộp bài
   Tự chèn giao diện vào trang, không cần sửa HTML. */
(function () {
  if (window.__rewardLoaded) return; window.__rewardLoaded = true;
  var st = document.createElement('style');
  st.textContent = "#rw-overlay{position:fixed;inset:0;z-index:5000;display:none;align-items:center;justify-content:center;background:rgba(20,16,60,.78);padding:14px}\n#rw-overlay.show{display:flex;animation:rwFade .35s ease}\n@keyframes rwFade{from{opacity:0}to{opacity:1}}\n#rw-canvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5001}\n.rw-card{position:relative;z-index:5002;width:100%;max-width:440px;max-height:94vh;overflow-y:auto;background:#fff;border-radius:24px;padding:26px 22px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.45);animation:rwPop .6s cubic-bezier(.2,1.5,.4,1)}\n@keyframes rwPop{from{transform:scale(.4) translateY(60px);opacity:0}to{transform:none;opacity:1}}\n.rw-ribbon{display:inline-block;padding:6px 18px;border-radius:30px;color:#fff;font-weight:700;font-size:.95rem;letter-spacing:.5px;margin-bottom:6px}\n.rw-medal{width:190px;height:190px;margin:4px auto 0;animation:rwFloat 2.4s ease-in-out infinite}\n.rw-medal svg{width:100%;height:100%;filter:drop-shadow(0 10px 14px rgba(0,0,0,.25))}\n@keyframes rwFloat{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-10px) rotate(2deg)}}\n.rw-title{font-size:1.55rem;font-weight:800;margin:6px 0 2px;color:#2b2d6e}\n.rw-score{font-size:2.6rem;font-weight:800;line-height:1.1;margin:0;background:linear-gradient(135deg,#4361ee,#f72585);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}\n.rw-score small{font-size:1.2rem;-webkit-text-fill-color:#6c757d}\n.rw-stars{font-size:2rem;letter-spacing:6px;margin:6px 0}\n.rw-stars span{display:inline-block;opacity:0;transform:scale(0) rotate(-90deg);animation:rwStar .5s forwards}\n@keyframes rwStar{to{opacity:1;transform:scale(1) rotate(0)}}\n.rw-msg{font-size:1.08rem;line-height:1.55;color:#333;background:#f5f7ff;border-radius:16px;padding:12px 14px;margin:10px 0}\n.rw-stats{display:flex;gap:8px;justify-content:center;margin:10px 0;flex-wrap:wrap}\n.rw-chip{background:#fff7e0;border:1px solid #ffe08a;border-radius:20px;padding:5px 12px;font-size:.9rem;font-weight:600;color:#7a5b00}\n.rw-coll{margin-top:12px;padding-top:12px;border-top:2px dashed #e3e6f5}\n.rw-coll h4{margin:0 0 8px;font-size:.95rem;color:#4361ee}\n.rw-coll-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}\n.rw-coll-item{width:46px;height:46px;border-radius:12px;background:#eef0fb;display:flex;align-items:center;justify-content:center;font-size:1.6rem;position:relative}\n.rw-coll-item.off{filter:grayscale(1);opacity:.28}\n.rw-coll-item.new{background:#fff2b3;box-shadow:0 0 0 3px #ffc107;animation:rwNew 1s ease infinite}\n@keyframes rwNew{50%{transform:scale(1.15)}}\n.rw-btn{margin-top:14px;border:0;cursor:pointer;color:#fff;font-weight:700;font-size:1.05rem;padding:12px 30px;border-radius:30px;background:linear-gradient(135deg,#4361ee,#7b2ff7);box-shadow:0 6px 16px rgba(67,97,238,.4)}\n.rw-btn:active{transform:scale(.96)}";
  document.head.appendChild(st);
  var ov = document.createElement('div');
  ov.id = 'rw-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = '<canvas id="rw-canvas"></canvas><div class="rw-card" id="rw-card"></div>';
  function mount() { document.body.appendChild(ov); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
(function () {
  /* ---------- 1. CÁC MỨC THƯỞNG (sửa nội dung ở đây) ---------- */
  var TIERS = [
    { min: 9, id: 'cup', emoji: '🏆', name: 'Cúp Vàng Nhà Vô Địch', ribbon: '🌟 XUẤT SẮC 🌟', color: '#f5a623', stars: 5,
      msgs: ['Tuyệt vời quá! Em làm bài chắc chắn như một nhà khoa học thực thụ!',
             'Điểm số này là phần thưởng cho sự chăm chỉ của em. Cô/thầy rất tự hào!',
             'Quá đỉnh! Em xứng đáng đứng trên bục vinh quang hôm nay!'] },
    { min: 8, id: 'medal', emoji: '🥇', name: 'Huy Chương Vàng', ribbon: '🎉 RẤT GIỎI 🎉', color: '#ff7a00', stars: 4,
      msgs: ['Giỏi lắm! Chỉ còn một bước nhỏ nữa là chạm tới điểm tuyệt đối!',
             'Em đã nắm vững kiến thức rồi. Tiếp tục phát huy nhé!',
             'Kết quả rất ấn tượng! Cố thêm chút nữa là có cúp vàng đó!'] },
    { min: 6.5, id: 'rocket', emoji: '🚀', name: 'Phi Hành Gia Tiến Bộ', ribbon: '👏 KHÁ TỐT 👏', color: '#2ea8ff', stars: 3,
      msgs: ['Em đang bay lên rất nhanh! Xem lại vài câu nữa là tăng tốc hơn nữa.',
             'Làm tốt lắm! Mỗi lần luyện tập là một lần em giỏi hơn.',
             'Nền tảng của em khá vững. Cố gắng thêm một chút là lên huy chương vàng!'] },
    { min: 5, id: 'sprout', emoji: '🌱', name: 'Cây Mầm Chăm Chỉ', ribbon: '💪 ĐẠT YÊU CẦU 💪', color: '#34c759', stars: 2,
      msgs: ['Cây mầm đã nảy lên rồi! Tưới thêm chút kiến thức là lớn nhanh thôi.',
             'Em đã làm được rồi, giờ xem lại các câu sai để tiến bộ hơn nhé!',
             'Không tệ chút nào! Lần sau em chắc chắn sẽ làm tốt hơn.'] },
    { min: 0, id: 'shield', emoji: '🛡️', name: 'Khiên Dũng Cảm', ribbon: '❤️ CỐ LÊN NÀO ❤️', color: '#9b5de5', stars: 1,
      msgs: ['Dám thử sức đã là dũng cảm rồi! Sai ở đâu, mình sửa ở đó là giỏi lên ngay.',
             'Đừng nản nhé! Những nhà bác học nổi tiếng cũng từng làm sai rất nhiều lần.',
             'Em hãy xem lại đáp án rồi làm lại, lần sau chắc chắn sẽ khá hơn!'] }
  ];

  /* ---------- 2. HÌNH ẢNH SVG CHO TỪNG PHẦN THƯỞNG ---------- */
  var SVGS = {
    cup: '<svg viewBox="0 0 200 200"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#f59f00"/></linearGradient></defs><path d="M55 30h90v50a45 45 0 0 1-90 0z" fill="url(#g1)"/><path d="M55 40H30c0 30 12 45 32 48M145 40h25c0 30-12 45-32 48" fill="none" stroke="#f59f00" stroke-width="9" stroke-linecap="round"/><rect x="90" y="120" width="20" height="30" fill="#f59f00"/><rect x="65" y="148" width="70" height="18" rx="6" fill="#c77700"/><rect x="55" y="164" width="90" height="14" rx="6" fill="#8a5300"/><path d="M100 48l7 15 17 2-12 12 3 17-15-8-15 8 3-17-12-12 17-2z" fill="#fff8d6"/><ellipse cx="78" cy="52" rx="7" ry="16" fill="#fff" opacity=".45" transform="rotate(12 78 52)"/></svg>',
    medal: '<svg viewBox="0 0 200 200"><path d="M65 10l35 60 35-60z" fill="#e63946"/><path d="M80 10l20 35 20-35z" fill="#ff6b6b"/><circle cx="100" cy="115" r="62" fill="#f59f00"/><circle cx="100" cy="115" r="50" fill="#ffd43b"/><circle cx="100" cy="115" r="42" fill="none" stroke="#fff3bf" stroke-width="3" stroke-dasharray="4 5"/><path d="M100 85l9 20 22 2-16 15 5 22-20-12-20 12 5-22-16-15 22-2z" fill="#f08c00"/></svg>',
    rocket: '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#dbeafe"/><circle cx="40" cy="50" r="3" fill="#fff"/><circle cx="160" cy="40" r="4" fill="#fff"/><circle cx="150" cy="150" r="3" fill="#fff"/><path d="M85 140q15 50 30 0z" fill="#ff922b"/><path d="M92 140q8 28 16 0z" fill="#ffe066"/><path d="M100 25c28 25 32 70 22 115H78c-10-45-6-90 22-115z" fill="#f1f3f5"/><path d="M100 25c14 12 22 28 26 45H74c4-17 12-33 26-45z" fill="#e63946"/><circle cx="100" cy="88" r="14" fill="#4dabf7" stroke="#495057" stroke-width="4"/><path d="M78 110l-25 30 27-8zM122 110l25 30-27-8z" fill="#e63946"/></svg>',
    sprout: '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#e6fcf5"/><path d="M60 140h80l-10 42H70z" fill="#c2693a"/><rect x="55" y="132" width="90" height="14" rx="5" fill="#d9825a"/><path d="M100 132V80" stroke="#2f9e44" stroke-width="7" stroke-linecap="round"/><path d="M100 95c-5-30-30-42-55-38 2 28 25 44 55 38z" fill="#51cf66"/><path d="M100 80c8-28 32-38 55-32-3 28-26 40-55 32z" fill="#69db7c"/><circle cx="85" cy="150" r="3" fill="#7a3b17"/><circle cx="112" cy="160" r="3" fill="#7a3b17"/></svg>',
    shield: '<svg viewBox="0 0 200 200"><path d="M100 14l68 24v52c0 46-30 78-68 96-38-18-68-50-68-96V38z" fill="#7048e8"/><path d="M100 28l54 19v43c0 38-24 65-54 80-30-15-54-42-54-80V47z" fill="#9775fa"/><path d="M100 62l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z" fill="#ffe066"/></svg>'
  };

  /* ---------- 3. BỘ SƯU TẬP (lưu trên máy học sinh) ---------- */
  var KEY = 'rw_collection_v1';
  function loadColl() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function saveColl(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

  /* ---------- 4. ÂM THANH + PHÁO GIẤY ---------- */
  function chime(good) {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      var ctx = new A(), notes = good ? [523, 659, 784, 1047] : [392, 494, 587];
      notes.forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        var t = ctx.currentTime + i * 0.13;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.start(t); o.stop(t + 0.4);
      });
    } catch (e) {}
  }
  var raf;
  function confetti(amount) {
    var cv = document.getElementById('rw-canvas'), cx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    var cols = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff7ab6'], ps = [];
    for (var i = 0; i < amount; i++) ps.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .6,
      w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3,
      r: Math.random() * 6, vr: -.2 + Math.random() * .4, c: cols[i % cols.length] });
    cancelAnimationFrame(raf);
    (function draw() {
      cx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
      });
      ps = ps.filter(function (p) { return p.y < cv.height + 30; });
      if (ps.length) raf = requestAnimationFrame(draw); else cx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  /* ---------- 5. HIỂN THỊ POPUP ---------- */
  function pickTier(score) { for (var i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) return TIERS[i]; return TIERS[TIERS.length - 1]; }

  window.showRewardPopup = function (score, correct, total, timeText) {
    score = Number(score) || 0;
    var tier = pickTier(score);
    var msg = tier.msgs[Math.floor(Math.random() * tier.msgs.length)];
    var nameEl = document.getElementById('user-name');
    var name = nameEl && nameEl.value ? nameEl.value.trim().split(' ').pop() : '';
    if (name) msg = name + ' ơi, ' + msg.charAt(0).toLowerCase() + msg.slice(1);

    var coll = loadColl(), isNew = !coll[tier.id];
    coll[tier.id] = (coll[tier.id] || 0) + 1; saveColl(coll);

    var stars = '';
    for (var s = 0; s < 5; s++) stars += '<span style="animation-delay:' + (0.5 + s * 0.18) + 's;color:' + (s < tier.stars ? '#ffc107' : '#d9dce8') + '">★</span>';
    var collHtml = TIERS.map(function (t) {
      return '<div class="rw-coll-item ' + (coll[t.id] ? (t.id === tier.id && isNew ? 'new' : '') : 'off') + '" title="' + t.name + '">' + t.emoji + '</div>';
    }).join('');

    document.getElementById('rw-card').innerHTML =
      '<span class="rw-ribbon" style="background:' + tier.color + '">' + tier.ribbon + '</span>' +
      '<div class="rw-medal">' + SVGS[tier.id] + '</div>' +
      '<h2 class="rw-title" id="rw-title">' + tier.name + '</h2>' +
      '<p class="rw-score">' + score.toFixed(1) + '<small> / 10</small></p>' +
      '<div class="rw-stars">' + stars + '</div>' +
      '<div class="rw-msg">' + msg + '</div>' +
      '<div class="rw-stats">' +
        (total ? '<span class="rw-chip">✅ Đúng ' + correct + '/' + total + ' câu</span>' : '') +
        (timeText ? '<span class="rw-chip">⏱️ ' + timeText + '</span>' : '') +
        (isNew ? '<span class="rw-chip" style="background:#e7f9ec;border-color:#9be3b0;color:#1b7a3a">🎁 Phần thưởng mới!</span>' : '') +
      '</div>' +
      '<div class="rw-coll"><h4>🎒 Bộ sưu tập phần thưởng của em</h4><div class="rw-coll-row">' + collHtml + '</div></div>' +
      '<button class="rw-btn" id="rw-close">Xem chi tiết bài làm ➜</button>';

    document.getElementById('rw-overlay').classList.add('show');
    document.getElementById('rw-close').onclick = function () {
      document.getElementById('rw-overlay').classList.remove('show'); cancelAnimationFrame(raf);
      var cv = document.getElementById('rw-canvas'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    };
    confetti(score >= 8 ? 220 : score >= 5 ? 120 : 60);
    chime(score >= 5);
  };

  /* ---------- 6. TỰ ĐỘNG KÍCH HOẠT KHI CÓ KẾT QUẢ ---------- */
  var last = 0;
  function onResult() {
    var now = Date.now(); if (now - last < 3000) return; last = now;
    setTimeout(function () {
      var r = window.finalScoreInfo || {};
      if (typeof r.score !== 'number') return;
      var t = typeof getElapsedTime === 'function' ? getElapsedTime() : '';
      window.showRewardPopup(r.score, r.correctCount || 0, r.totalQuestions || 0, t);
    }, 600);
  }
  function arm() {
    var sd = document.getElementById('score-display');
    if (!sd) return setTimeout(arm, 800);
    new MutationObserver(function () { if (sd.innerHTML.trim()) onResult(); }).observe(sd, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
})();
