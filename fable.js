/* fable.js - Hoạt hình truyện "Rùa và Thỏ" chạy nền trong khung #quote-container.
   Không thêm chiều cao, không đẩy bố cục: toàn bộ nằm đè (absolute) vào khoảng trống bên phải câu danh ngôn. */
(function () {
  if (window.__fableLoaded) return; window.__fableLoaded = true;
  try { console.log('[fable] v4: cành hoa + danh ngôn chạy trong vùng trắng'); } catch (e) {}
  var D = 44; /* thời lượng 1 vòng truyện (giây) */

  var HARE = '<svg viewBox="0 0 120 100"><ellipse cx="54" cy="64" rx="32" ry="20" fill="#fff" stroke="#c9ccdb" stroke-width="2"/><circle cx="20" cy="58" r="9" fill="#fff" stroke="#c9ccdb" stroke-width="2"/><ellipse cx="82" cy="16" rx="5.5" ry="19" fill="#fff" stroke="#c9ccdb" stroke-width="2" transform="rotate(-10 82 16)"/><ellipse cx="82" cy="17" rx="2.6" ry="13" fill="#ffb3c7" transform="rotate(-10 82 17)"/><ellipse cx="97" cy="16" rx="5.5" ry="19" fill="#fff" stroke="#c9ccdb" stroke-width="2" transform="rotate(8 97 16)"/><ellipse cx="97" cy="17" rx="2.6" ry="13" fill="#ffb3c7" transform="rotate(8 97 17)"/><ellipse cx="89" cy="44" rx="17" ry="14" fill="#fff" stroke="#c9ccdb" stroke-width="2"/><circle cx="96" cy="41" r="3" fill="#2b2d42"/><circle cx="97" cy="40" r="1" fill="#fff"/><ellipse cx="104" cy="47" rx="3" ry="2.2" fill="#ff7aa2"/><circle cx="92" cy="49" r="3.5" fill="#ffc2d4" opacity=".7"/><ellipse cx="78" cy="86" rx="15" ry="6" fill="#fff" stroke="#c9ccdb" stroke-width="2"/><ellipse cx="36" cy="86" rx="17" ry="7" fill="#fff" stroke="#c9ccdb" stroke-width="2"/></svg>';
  var HARE_Z = '<svg viewBox="0 0 120 100"><ellipse cx="54" cy="70" rx="34" ry="18" fill="#fff" stroke="#c9ccdb" stroke-width="2"/><circle cx="19" cy="68" r="9" fill="#fff" stroke="#c9ccdb" stroke-width="2"/><ellipse cx="78" cy="62" rx="5.5" ry="19" fill="#fff" stroke="#c9ccdb" stroke-width="2" transform="rotate(-75 78 62)"/><ellipse cx="90" cy="48" rx="5.5" ry="19" fill="#fff" stroke="#c9ccdb" stroke-width="2" transform="rotate(-62 90 48)"/><ellipse cx="88" cy="62" rx="17" ry="14" fill="#fff" stroke="#c9ccdb" stroke-width="2"/><path d="M90 60 q5 4 10 0" fill="none" stroke="#2b2d42" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="103" cy="66" rx="3" ry="2.2" fill="#ff7aa2"/><circle cx="92" cy="68" r="3.5" fill="#ffc2d4" opacity=".7"/><ellipse cx="60" cy="88" rx="22" ry="6" fill="#fff" stroke="#c9ccdb" stroke-width="2"/></svg>';
  var TORT = '<svg viewBox="0 0 120 90"><ellipse cx="38" cy="76" rx="9" ry="8" fill="#9ccc65"/><ellipse cx="82" cy="76" rx="9" ry="8" fill="#9ccc65"/><path d="M14 66 l-9 3 9 5z" fill="#9ccc65"/><circle cx="104" cy="54" r="13" fill="#aed581"/><circle cx="109" cy="50" r="3" fill="#2b2d42"/><circle cx="110" cy="49" r="1" fill="#fff"/><path d="M104 60 q5 4 10 0" fill="none" stroke="#2b2d42" stroke-width="2" stroke-linecap="round"/><circle cx="101" cy="58" r="3" fill="#ffb4a2" opacity=".7"/><path d="M18 72 Q18 20 60 20 Q102 20 102 72 Z" fill="#2e9e5b" stroke="#1b6b3a" stroke-width="3"/><path d="M60 20 V72 M36 36 L60 48 L84 36 M26 58 L60 48 L94 58" fill="none" stroke="#1b6b3a" stroke-width="2.4" opacity=".55"/><path d="M34 38 Q44 26 58 25" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/></svg>';


  /* Cành hoa tỏa hương "bay ngược gió" */
  var FLOWER = '<svg viewBox="0 0 120 200" preserveAspectRatio="xMidYMax meet" style="overflow:visible"><defs>' +
    '<radialGradient id="fbPg" cx="50%" cy="85%" r="90%"><stop offset="0" stop-color="#ff7fb0"/><stop offset=".55" stop-color="#ffb3d1"/><stop offset="1" stop-color="#fff0f6"/></radialGradient>' +
    '<linearGradient id="fbSg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd54a" stop-opacity="0"/><stop offset=".5" stop-color="#ff9ec4"/><stop offset="1" stop-color="#ffd54a" stop-opacity="0"/></linearGradient>' +
    '<g id="fbBloom">' + [0, 72, 144, 216, 288].map(function (a) { return '<ellipse cx="0" cy="-17" rx="10" ry="18" fill="url(#fbPg)" stroke="#ff9ec4" stroke-width=".8" transform="rotate(' + a + ')"/>'; }).join('') +
    '<circle r="6.5" fill="#ffd54a"/><circle r="2.4" fill="#f59f00"/></g></defs>' +
    '<ellipse cx="70" cy="198" rx="26" ry="3.5" fill="#86cf7a" opacity=".8"/>' +
    '<g fill="none" stroke="#7a8cff" stroke-width="2" stroke-linecap="round">' +
      '<path class="fb-wd" d="M-70 120 h34 q8 0 8 -7" stroke="#8fc3d6"/><path class="fb-wd w2" d="M-84 150 h40 q8 0 8 7" stroke="#8fc3d6"/><path class="fb-wd w3" d="M-64 88 h30" stroke="#8fc3d6"/></g>' +
    '<g class="fb-plant">' +
      '<path d="M72 197 C66 160 56 130 62 80" fill="none" stroke="#4f9a4a" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M65 140 C76 128 86 118 93 104" fill="none" stroke="#4f9a4a" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M62 162 C52 152 40 146 31 134" fill="none" stroke="#4f9a4a" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M64 150 Q82 138 92 148 Q78 162 64 150Z" fill="#6cbf5c"/><path d="M62 178 Q44 166 32 176 Q46 190 62 178Z" fill="#7ccf6c"/><path d="M63 114 Q78 104 86 113 Q76 124 63 114Z" fill="#6cbf5c"/>' +
      '<g class="fb-bloom2"><use href="#fbBloom" transform="translate(30 128) scale(.5) rotate(20)"/></g>' +
      '<g class="fb-bloom3"><use href="#fbBloom" transform="translate(94 100) scale(.42) rotate(-15)"/></g>' +
      '<g class="fb-bloom1"><use href="#fbBloom" transform="translate(62 62)"/></g>' +
    '</g>' +
    '<g fill="none" stroke="url(#fbSg)" stroke-width="3" stroke-linecap="round">' +
      '<path class="fb-sc" d="M62 58 C40 44 22 52 4 34 S-34 22 -60 2"/><path class="fb-sc d2" d="M60 66 C36 66 20 80 0 70 S-40 66 -64 50"/><path class="fb-sc d3" d="M58 52 C44 30 30 28 14 10 S-14 -6 -36 -20"/></g>' +
    '<g transform="translate(58 60)"><path class="fb-fp" d="M0 0 c3 -5 8 -3 7 2 c-3 4 -8 3 -7 -2z" fill="#ffb3d1"/></g>' +
    '<g transform="translate(66 70)"><path class="fb-fp f2" d="M0 0 c3 -5 8 -3 7 2 c-3 4 -8 3 -7 -2z" fill="#ff9ec4"/></g>' +
    '<g transform="translate(54 76)"><path class="fb-fp f3" d="M0 0 c3 -5 8 -3 7 2 c-3 4 -8 3 -7 -2z" fill="#ffd1e3"/></g>' +
    '</svg>';

  var css = [
    '#quote-container{position:relative;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;min-height:190px}',
    '#quote-container #quote{box-sizing:border-box;max-width:none;margin:0 0 18px;font-size:clamp(1.15rem,1.2vw + .5rem,1.6rem);line-height:1.5}',
    '.fb-qv{display:block;overflow:hidden;white-space:nowrap}',
    '.fb-qt{display:inline-block;white-space:nowrap}.fb-qt>span{display:inline-block}.fb-qt>span+span{display:none}',
    '.fb-qv.run{-webkit-mask-image:linear-gradient(90deg,#000 0,#000 80%,transparent 100%);mask-image:linear-gradient(90deg,#000 0,#000 80%,transparent 100%)}',
    '.fb-qv.run .fb-qt>span{padding-right:70px}.fb-qv.run .fb-qt>span+span{display:inline-block}',
    '.fb-qv.run .fb-qt{animation:fbMarq var(--fbd,14s) linear 1.5s infinite}.fb-qv.run:hover .fb-qt{animation-play-state:paused}',
    '@keyframes fbMarq{to{transform:translateX(-50%)}}',
    '.fb-qby{display:block;margin-top:8px;font-size:.62em;font-style:normal;font-weight:600;letter-spacing:.3px;color:#1e5f74;opacity:.85}',
    '#quote-container #quote,#quote-container #new-quote{position:relative;z-index:2}',
    '.fb-stage{position:absolute;top:0;bottom:0;right:0;width:58%;overflow:hidden;pointer-events:none;z-index:1;container-type:size;border-radius:0 15px 15px 0;-webkit-mask-image:linear-gradient(to right,transparent 0,#000 8%);mask-image:linear-gradient(to right,transparent 0,#000 8%)}',
    '.fb-stage *{box-sizing:border-box}',
    '.fb-sky{position:absolute;inset:0;background:linear-gradient(180deg,#b9e6ff 0%,#e6f7ff 58%,#fff3cf 100%)}',
    '.fb-sun{position:absolute;top:8%;right:6%;width:13cqh;height:13cqh;min-width:22px;min-height:22px;border-radius:50%;background:radial-gradient(circle,#fffbe0 0%,#ffd54a 60%,#ffb300 100%);box-shadow:0 0 18px 8px rgba(255,214,74,.55);animation:fbPulse 4s ease-in-out infinite}',
    '.fb-cloud{position:absolute;height:10px;width:46px;border-radius:20px;background:#fff;opacity:.9;box-shadow:14px -7px 0 2px #fff,28px 0 0 0 #fff;animation:fbCloud 48s linear infinite}',
    '.fb-cloud.c1{top:22%;left:-12%}.fb-cloud.c2{top:40%;left:-12%;animation-duration:70s;animation-delay:-30s;transform:scale(.7)}',
    '.fb-hill{position:absolute;bottom:14%;border-radius:50% 50% 0 0}',
    '.fb-hill.h1{left:-6%;width:58%;height:38%;background:#b7e0a5}.fb-hill.h2{right:-8%;width:62%;height:30%;background:#9fd48f}',
    '.fb-ground{position:absolute;left:0;right:0;bottom:0;height:20%;background:linear-gradient(#86cf7a,#5cae5c)}',
    '.fb-track{position:absolute;left:3%;right:4%;bottom:5%;height:8%;border-radius:20px;background:rgba(255,236,179,.75)}',
    '.fb-deco{position:absolute;line-height:1;white-space:nowrap}',
    '.fb-tree{left:57%;bottom:12%;font-size:clamp(34px,46cqh,76px)}',
    '.fb-flag{left:86%;bottom:11%;font-size:clamp(22px,30cqh,48px);transform-origin:20% 100%;animation:fbWave 1.6s ease-in-out infinite}',
    '.fb-flower{bottom:2%;font-size:clamp(10px,13cqh,20px);animation:fbSway 3s ease-in-out infinite}',
    '.fb-spark{color:#ffe27a;font-size:12px;animation:fbTwinkle 2.4s ease-in-out infinite}',
    '.fb-actors{position:absolute;inset:0;animation:fbFade ' + D + 's linear infinite}',
    '.fb-actor{position:absolute;bottom:9%;height:40px;height:clamp(40px,40cqh,88px);aspect-ratio:1.2}',
    '.fb-actor svg{width:100%;height:100%;display:block;overflow:visible}',
    '.fb-tort{animation:fbTort ' + D + 's linear infinite}',
    '.fb-hare{animation:fbHare ' + D + 's linear infinite}',
    '.fb-bob{position:absolute;inset:0;animation:fbBobSlow 1.4s ease-in-out infinite}',
    '.fb-bob.fast{animation:fbBobFast .35s ease-in-out infinite}',
    '.fb-awake{position:absolute;inset:0;animation:fbAwake ' + D + 's linear infinite}',
    '.fb-sleep{position:absolute;inset:0;opacity:0;animation:fbSleep ' + D + 's linear infinite}',
    '.fb-z{position:absolute;left:62%;top:-18%;font-weight:700;color:#5b6bd8;font-size:13px;opacity:0;animation:fbZ 2.4s ease-out infinite}',
    '.fb-z:nth-child(2){animation-delay:.8s;left:74%;font-size:16px}.fb-z:nth-child(3){animation-delay:1.6s;left:86%;font-size:19px}',
    '.fb-wow{position:absolute;left:55%;top:-30%;font-size:20px;opacity:0;animation:fbWow ' + D + 's linear infinite}',
    '.fb-win{position:absolute;left:78%;bottom:48%;font-size:clamp(22px,26cqh,40px);opacity:0;animation:fbWin ' + D + 's linear infinite}',
    '.fb-cap{position:absolute;left:50%;top:6px;transform:translateX(-50%);max-width:94%;padding:3px 14px;border-radius:20px;font-size:12.5px;font-weight:600;color:#1e5f74;background:rgba(255,255,255,.82);box-shadow:0 2px 8px rgba(0,0,0,.08);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0}',
    '.fb-cap.last{color:#9a5b00;background:rgba(255,246,205,.95)}',
    '@keyframes fbPulse{50%{transform:scale(1.12)}}',
    '@keyframes fbCloud{to{transform:translateX(1200px)}}',
    '@keyframes fbWave{50%{transform:skewX(-8deg) rotate(3deg)}}',
    '@keyframes fbSway{50%{transform:rotate(8deg)}}',
    '@keyframes fbTwinkle{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1.2)}}',
    '@keyframes fbBobSlow{50%{transform:translateY(-3px)}}',
    '@keyframes fbBobFast{50%{transform:translateY(-8px) rotate(-3deg)}}',
    '@keyframes fbZ{0%{opacity:0;transform:translateY(8px)}30%{opacity:1}100%{opacity:0;transform:translateY(-22px)}}',
    '@keyframes fbFade{0%{opacity:0}2%,95%{opacity:1}99%,100%{opacity:0}}',
    '@keyframes fbTort{0%,6%{left:13%}78%,100%{left:80%}}',
    '@keyframes fbHare{0%,6%{left:5%}16%{left:56%}20%,66%{left:60%}78.5%,100%{left:74%}}',
    '@keyframes fbAwake{0%,19.9%{opacity:1}20%,65.9%{opacity:0}66%,100%{opacity:1}}',
    '@keyframes fbSleep{0%,19.9%{opacity:0}20%,65.9%{opacity:1}66%,100%{opacity:0}}',
    '@keyframes fbWow{0%,79%{opacity:0;transform:scale(.4)}81%,93%{opacity:1;transform:scale(1)}95%,100%{opacity:0}}',
    '@keyframes fbWin{0%,77%{opacity:0;transform:translateY(10px) scale(.4)}80%,93%{opacity:1;transform:none}96%,100%{opacity:0}}',
    '.fb-flower-box{position:absolute;right:58%;top:0;bottom:0;width:clamp(84px,9%,170px);z-index:1;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}',
    '.fb-flower-box svg{width:100%;flex:1 1 auto;min-height:0;display:block}',
    '.fb-flabel{font-size:11.5px;line-height:1.25;text-align:center;font-style:italic;font-weight:600;color:#a23d6e;padding:2px 0 6px;text-shadow:0 1px 0 #fff}',
    '.fb-plant{transform-origin:72px 197px;animation:fbPlant 5s ease-in-out infinite}',
    '.fb-bloom1{transform-origin:62px 62px;animation:fbBloom 3.2s ease-in-out infinite}',
    '.fb-bloom2{transform-origin:30px 128px;animation:fbBloom 3.8s ease-in-out infinite -1s}',
    '.fb-bloom3{transform-origin:94px 100px;animation:fbBloom 4.2s ease-in-out infinite -2s}',
    '.fb-sc{stroke-dasharray:70 260;stroke-dashoffset:70;opacity:0;animation:fbScent 4.8s ease-out infinite}',
    '.fb-sc.d2{animation-delay:1.6s}.fb-sc.d3{animation-delay:3.2s}',
    '.fb-wd{opacity:0;animation:fbWind 3.8s ease-in-out infinite}.fb-wd.w2{animation-delay:1.2s}.fb-wd.w3{animation-delay:2.4s}',
    '.fb-fp{opacity:0;animation:fbPetal 5s ease-out infinite}.fb-fp.f2{animation-delay:1.7s}.fb-fp.f3{animation-delay:3.3s}',
    '@keyframes fbPlant{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2.5deg)}}',
    '@keyframes fbBloom{50%{transform:scale(1.08)}}',
    '@keyframes fbScent{0%{stroke-dashoffset:70;opacity:0}15%{opacity:.95}100%{stroke-dashoffset:-210;opacity:0}}',
    '@keyframes fbWind{0%{opacity:0;transform:translateX(0)}20%,75%{opacity:.5}100%{opacity:0;transform:translateX(210px)}}',
    '@keyframes fbPetal{0%{opacity:0;transform:translate(0,0) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translate(-58px,-16px) rotate(200deg)}}',
    '@media (max-width:820px){.fb-flower-box{display:none}#quote-container{min-height:150px}#quote-container #quote{max-width:100%}.fb-stage{width:100%;opacity:.4;border-radius:15px;-webkit-mask-image:none;mask-image:none}.fb-cap{display:none}}',
    '@media (prefers-reduced-motion:reduce){.fb-qv,.fb-qv.run{white-space:normal!important;overflow:visible!important;-webkit-mask-image:none!important;mask-image:none!important}.fb-qv .fb-qt{animation:none!important;display:block;white-space:normal}.fb-qv .fb-qt>span{padding:0!important}.fb-qv .fb-qt>span+span{display:none!important}.fb-stage{display:none}.fb-flower-box *{animation:none!important}.fb-sc,.fb-wd,.fb-fp{display:none}}'
  ];

  /* Phụ đề từng đoạn truyện: [bắt đầu %, kết thúc %, nội dung] */
  var caps = [
    [2, 14, '🐰 Thỏ khoe: “Mình chạy nhanh nhất rừng!” – 🐢 Rùa mỉm cười: “Ta cùng thi nhé.”'],
    [14.5, 21.5, '🏁 “Một, hai, ba… chạy!” Thỏ phóng như gió.'],
    [22, 47, '😴 Thỏ chủ quan, nằm ngủ dưới gốc cây… Zzz…'],
    [48, 71, '🐢 Rùa vẫn kiên trì bò từng bước, từng bước.'],
    [72, 86, '🏆 Rùa chạm vạch đích! Thỏ tỉnh dậy thì đã muộn.'],
    [87, 97, '🌟 Chậm mà chắc – kiên trì sẽ chiến thắng!']
  ];
  var capHtml = '';
  caps.forEach(function (c, i) {
    css.push('@keyframes fbC' + i + '{0%,' + (c[0] - 1) + '%{opacity:0;transform:translate(-50%,5px)}' + c[0] + '%,' + c[1] + '%{opacity:1;transform:translate(-50%,0)}' + (c[1] + 1) + '%,100%{opacity:0}}');
    css.push('.fb-cap.n' + i + '{animation:fbC' + i + ' ' + D + 's linear infinite}');
    capHtml += '<div class="fb-cap n' + i + (i === caps.length - 1 ? ' last' : '') + '">' + c[2] + '</div>';
  });

  var flowers = [['8%', '🌼'], ['21%', '🌸'], ['33%', '🌷'], ['47%', '🌼'], ['70%', '🌸'], ['79%', '🌷'], ['93%', '🌼']]
    .map(function (f, i) { return '<span class="fb-deco fb-flower" style="left:' + f[0] + ';animation-delay:-' + i * 0.4 + 's">' + f[1] + '</span>'; }).join('');
  var sparks = [['12%', '18%'], ['30%', '30%'], ['44%', '14%'], ['64%', '26%'], ['78%', '12%'], ['90%', '34%']]
    .map(function (s, i) { return '<span class="fb-deco fb-spark" style="left:' + s[0] + ';top:' + s[1] + ';animation-delay:-' + i * 0.5 + 's">✦</span>'; }).join('');

  var html = '<div class="fb-sky"></div><div class="fb-sun"></div><div class="fb-cloud c1"></div><div class="fb-cloud c2"></div>' +
    '<div class="fb-hill h1"></div><div class="fb-hill h2"></div><div class="fb-ground"></div><div class="fb-track"></div>' + sparks +
    '<span class="fb-deco fb-tree">🌳</span><span class="fb-deco fb-flag">🏁</span>' + flowers +
    '<div class="fb-actors">' +
      '<div class="fb-actor fb-tort"><div class="fb-bob">' + TORT + '</div></div>' +
      '<div class="fb-actor fb-hare"><div class="fb-awake"><div class="fb-bob fast">' + HARE + '</div></div>' +
        '<div class="fb-sleep">' + HARE_Z + '<span class="fb-z">z</span><span class="fb-z">z</span><span class="fb-z">Z</span></div>' +
        '<span class="fb-wow">❗</span></div>' +
      '<div class="fb-win">🏆✨</div>' +
    '</div>' + capHtml;

  function init() {
    var box = document.getElementById('quote-container');
    if (!box) return false;                       /* trang không có khung danh ngôn (không phải trang chủ) */
    if (box.querySelector('.fb-stage')) return true;
    var st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
    var stage = document.createElement('div'); stage.className = 'fb-stage'; stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = html; box.insertBefore(stage, box.firstChild);
    var fl = document.createElement('div'); fl.className = 'fb-flower-box'; fl.setAttribute('aria-hidden', 'true');
    fl.innerHTML = FLOWER + '<div class="fb-flabel">Tri thức là hương<br>bay ngược gió</div>';
    box.insertBefore(fl, stage.nextSibling);
    var q = document.getElementById('quote');
    /* Chữ danh ngôn chỉ được hiện trong vùng trắng bên trái cành hoa; câu dài sẽ tự chạy ngang trong vùng đó */
    function fit() {
      var qv = q && q.querySelector('.fb-qv'); if (!qv) return;
      var narrow = window.matchMedia('(max-width:820px)').matches, flw = box.querySelector('.fb-flower-box');
      var qr = q.getBoundingClientRect(), limit = (narrow || !flw) ? box.getBoundingClientRect().right - 16 : flw.getBoundingClientRect().left - 14;
      var inner = Math.max(140, limit - qr.left - 40);       /* 40 = lề trái/phải của #quote */
      q.style.width = (inner + 40) + 'px'; qv.style.width = inner + 'px';
      var t = qv.querySelector('.fb-qt'); qv.classList.remove('run');
      var w = t.firstChild.getBoundingClientRect().width;
      if (w > inner + 1) { t.style.setProperty('--fbd', Math.round((w + 70) / 32) + 's'); qv.classList.add('run'); }
    }
    function fmt() {
      if (!q || q.querySelector('.fb-qv')) return;
      var t = q.textContent.trim(); if (!t) return;
      var i = t.lastIndexOf(' – '), by = '', main = t;
      if (i >= 8) { main = t.slice(0, i); by = t.slice(i + 3); }
      q.textContent = '';
      var qv = document.createElement('span'); qv.className = 'fb-qv';
      var qt = document.createElement('span'); qt.className = 'fb-qt';
      [0, 1].forEach(function () { var sp = document.createElement('span'); sp.textContent = main; qt.appendChild(sp); });
      qv.appendChild(qt); q.appendChild(qv);
      if (by) { var b = document.createElement('span'); b.className = 'fb-qby'; b.textContent = '— ' + by; q.appendChild(b); }
      fit();
    }
    if (q) {
      fmt();
      try { new MutationObserver(fmt).observe(q, { childList: true }); } catch (e) {}
      var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(fit, 150); });
      window.addEventListener('load', function () { setTimeout(fit, 100); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    }
    return true;
  }
  if (!init()) {
    document.addEventListener('DOMContentLoaded', init);
    setTimeout(init, 1500);
  }
})();
