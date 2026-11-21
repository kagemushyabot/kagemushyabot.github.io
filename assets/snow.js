/* Seasonal intro + falling snow. Overlay and canvas are created in JS so a
   script failure never blocks the site. Snow falls during the intro; the 30s
   fade timer starts only after the intro reveals the page. */
(function () {
  var FALL_MS = 30000;
  var FADE_MS = 4000;
  var DPR_CAP = 2;
  var LINE1_FADE_MS = 700;
  var LINE1_HOLD_MS = 2000;
  var CROSS_MS = 800;
  var LINE2_HOLD_MS = 2000;
  var INTRO_OUT_MS = 1000;
  var INTRO_KEY = 'seasonIntroSeen';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas, ctx, raf = 0, flakes = [], sprites = [];
  var cssW = 0, cssH = 0, dpr = 1;
  var siteElapsed = 0, last = 0, spawning = true, cleaned = false;
  var siteClockStarted = false;
  var introEl = null, introActive = false, introLeaving = false;
  var introPage = 0;
  var introTimers = [];
  var onResize, onVis, onSkip;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function isMobile(w) {
    return w < 700 || (window.matchMedia && window.matchMedia('(max-width: 700px)').matches);
  }

  function targetCount(w, h) {
    var n = Math.round((w * h) / 18000);
    return isMobile(w) ? clamp(n, 14, 36) : clamp(n, 32, 78);
  }

  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    introTimers.push(id);
    return id;
  }

  function clearIntroTimers() {
    for (var i = 0; i < introTimers.length; i++) clearTimeout(introTimers[i]);
    introTimers = [];
  }

  function hexPath(g, r, start) {
    g.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = (start || 0) + i * Math.PI / 3;
      var x = Math.cos(a) * r;
      var y = Math.sin(a) * r;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }

  function sixArms(g, drawArm) {
    for (var i = 0; i < 6; i++) {
      g.save();
      g.rotate(i * Math.PI / 3);
      drawArm(g);
      g.restore();
    }
  }

  // Classic fern-like dendrite: long rib, branching laterals, tiny twigs.
  function drawDendrite(g) {
    var L = 86;
    sixArms(g, function (g) {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(L, 0);
      var i, t, len, tw, j, bx, by, ang;
      var stations = [
        [0.28, 0.36],
        [0.48, 0.26],
        [0.68, 0.16],
        [0.84, 0.09]
      ];
      for (i = 0; i < stations.length; i++) {
        t = stations[i][0];
        len = stations[i][1] * L;
        bx = t * L;
        for (ang = -1; ang <= 1; ang += 2) {
          g.moveTo(bx, 0);
          g.lineTo(bx + Math.cos(ang * Math.PI / 3) * len, Math.sin(ang * Math.PI / 3) * len);
        }
        if (i < 2) {
          tw = len * 0.38;
          for (ang = -1; ang <= 1; ang += 2) {
            var ex = bx + Math.cos(ang * Math.PI / 3) * len * 0.58;
            var ey = Math.sin(ang * Math.PI / 3) * len * 0.58;
            for (j = -1; j <= 1; j += 2) {
              var a2 = ang * Math.PI / 3 + j * Math.PI / 3;
              g.moveTo(ex, ey);
              g.lineTo(ex + Math.cos(a2) * tw, ey + Math.sin(a2) * tw);
            }
          }
        }
      }
      g.stroke();
    });
    hexPath(g, 9, 0);
    g.stroke();
    hexPath(g, 4.5, 0);
    g.fill();
    g.stroke();
  }

  // Plate / star: hexagonal core with broad kite plates and an inner ring.
  function drawPlate(g) {
    var L = 84;
    hexPath(g, 22, Math.PI / 6);
    g.fill();
    g.stroke();
    hexPath(g, 13, Math.PI / 6);
    g.stroke();
    sixArms(g, function (g) {
      g.beginPath();
      g.moveTo(18, 0);
      g.lineTo(36, 11);
      g.lineTo(L, 0);
      g.lineTo(36, -11);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(28, 0);
      g.lineTo(L - 6, 0);
      g.stroke();
      g.beginPath();
      g.moveTo(48, 0);
      g.lineTo(58, 8);
      g.moveTo(48, 0);
      g.lineTo(58, -8);
      g.stroke();
    });
    hexPath(g, 7, Math.PI / 6);
    g.fill();
    g.stroke();
  }

  // Simple stellar: six spokes, paired side branches, tip forks, small center star.
  function drawStellar(g) {
    var L = 86;
    sixArms(g, function (g) {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(L, 0);
      var pairs = [
        [0.36, 0.28],
        [0.62, 0.2],
        [0.82, 0.11]
      ];
      var i, t, len, ang;
      for (i = 0; i < pairs.length; i++) {
        t = pairs[i][0];
        len = pairs[i][1] * L;
        for (ang = -1; ang <= 1; ang += 2) {
          g.moveTo(t * L, 0);
          g.lineTo(t * L + Math.cos(ang * Math.PI / 3) * len, Math.sin(ang * Math.PI / 3) * len);
        }
      }
      // tip fork
      g.moveTo(L, 0);
      g.lineTo(L + 6, 7);
      g.moveTo(L, 0);
      g.lineTo(L + 6, -7);
      g.stroke();
      // small diamond near mid-arm
      g.beginPath();
      g.moveTo(0.48 * L - 4, 0);
      g.lineTo(0.48 * L, 3.2);
      g.lineTo(0.48 * L + 4, 0);
      g.lineTo(0.48 * L, -3.2);
      g.closePath();
      g.fill();
      g.stroke();
    });
    hexPath(g, 11, 0);
    g.stroke();
    hexPath(g, 5, 0);
    g.fill();
    g.stroke();
  }

  function paintCrystal(g, cx, cy, drawer) {
    var layers = [
      { stroke: 'rgba(90, 165, 215, 0.42)', fill: 'rgba(150, 205, 235, 0.10)', width: 5.2 },
      { stroke: 'rgba(110, 180, 225, 0.92)', fill: 'rgba(185, 225, 245, 0.42)', width: 2.6 },
      { stroke: 'rgba(230, 245, 255, 0.96)', fill: 'rgba(255, 255, 255, 0.55)', width: 1.15 }
    ];
    var i;
    for (i = 0; i < layers.length; i++) {
      g.save();
      g.translate(cx, cy);
      g.strokeStyle = layers[i].stroke;
      g.fillStyle = layers[i].fill;
      g.lineWidth = layers[i].width;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      drawer(g);
      g.restore();
    }
  }

  function makeCrystalSprite(drawer) {
    var s = 220;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    paintCrystal(g, s / 2, s / 2, drawer);
    return c;
  }

  function makeDotSprite() {
    var s = 48;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var cx = s / 2, cy = s / 2, r = 18;
    var grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.35, 'rgba(210,235,250,0.75)');
    grd.addColorStop(0.62, 'rgba(140,195,230,0.45)');
    grd.addColorStop(0.82, 'rgba(80,150,200,0.28)');
    grd.addColorStop(1, 'rgba(80,150,200,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  function makeFlake(anywhere) {
    var roll = Math.random();
    var size, vy, alpha, sprite, spin;
    if (roll < 0.16) {
      sprite = 3;
      size = 3.4 + Math.random() * 3.6;
      vy = (30 + Math.random() * 34) * 1.75;
      alpha = 0.55 + Math.random() * 0.35;
      spin = 0;
    } else if (roll < 0.54) {
      sprite = (Math.random() * 3) | 0;
      size = 10 + Math.random() * 8;
      vy = (22 + Math.random() * 20) * 1.75;
      alpha = 0.78 + Math.random() * 0.2;
      spin = (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.35);
    } else if (roll < 0.88) {
      sprite = (Math.random() * 3) | 0;
      size = 20 + Math.random() * 10;
      vy = (15 + Math.random() * 14) * 1.75;
      alpha = 0.82 + Math.random() * 0.16;
      spin = (Math.random() < 0.5 ? -1 : 1) * (0.1 + Math.random() * 0.22);
    } else {
      sprite = (Math.random() * 3) | 0;
      size = 36 + Math.random() * 20;
      vy = (9 + Math.random() * 9) * 1.75;
      alpha = 0.88 + Math.random() * 0.12;
      spin = (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.1);
    }
    return {
      baseX: Math.random() * cssW,
      y: anywhere ? Math.random() * cssH : -size - Math.random() * 50,
      size: size,
      vy: vy,
      amp: 6 + Math.random() * 20,
      freq: 0.5 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      alpha: alpha,
      sprite: sprite,
      rot: Math.random() * Math.PI * 2,
      spin: spin,
      alive: true
    };
  }

  function ensureLargeFlakes(want) {
    var large = 0, i;
    for (i = 0; i < flakes.length; i++) {
      if (flakes[i].size >= 36) large++;
    }
    var need = Math.min(8, Math.max(3, Math.round(want * 0.1)));
    for (i = 0; i < flakes.length && large < need; i++) {
      if (flakes[i].size < 36 && flakes[i].sprite !== 3) {
        flakes[i].sprite = (Math.random() * 3) | 0;
        flakes[i].size = 36 + Math.random() * 20;
        flakes[i].vy = (9 + Math.random() * 9) * 1.75;
        flakes[i].alpha = 0.88 + Math.random() * 0.12;
        flakes[i].spin = (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.1);
        large++;
      }
    }
  }

  function resize() {
    if (!canvas) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    var nextDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var scaleX = cssW ? w / cssW : 1;
    cssW = w;
    cssH = h;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (scaleX !== 1) {
      for (var i = 0; i < flakes.length; i++) flakes[i].baseX *= scaleX;
    }

    if (!spawning) return;
    var want = targetCount(w, h);
    while (flakes.length < want) flakes.push(makeFlake(true));
    if (flakes.length > want) flakes.length = want;
    ensureLargeFlakes(want);
  }

  function startSiteClock() {
    if (siteClockStarted) return;
    siteClockStarted = true;
    siteElapsed = 0;
  }

  function tick(now) {
    if (cleaned) return;
    raf = requestAnimationFrame(tick);

    if (document.hidden) {
      last = now;
      return;
    }

    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (siteClockStarted) {
      siteElapsed += dt * 1000;
      if (siteElapsed >= FALL_MS + FADE_MS) {
        cleanupSnow();
        return;
      }
      spawning = siteElapsed < FALL_MS;
      if (!spawning && canvas) {
        canvas.style.opacity = String(1 - Math.min(1, (siteElapsed - FALL_MS) / FADE_MS));
      }
    } else {
      spawning = true;
    }

    if (!canvas || !ctx) return;

    var t = now / 1000;
    ctx.clearRect(0, 0, cssW, cssH);

    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      if (!f.alive) continue;
      f.y += f.vy * dt;
      f.rot += f.spin * dt;
      var x = f.baseX + Math.sin(t * f.freq + f.phase) * f.amp;
      var half = f.size / 2;

      if (f.y - half > cssH + 8) {
        if (spawning) {
          var fresh = makeFlake(false);
          f.baseX = fresh.baseX;
          f.y = fresh.y;
          f.size = fresh.size;
          f.vy = fresh.vy;
          f.amp = fresh.amp;
          f.freq = fresh.freq;
          f.phase = fresh.phase;
          f.alpha = fresh.alpha;
          f.sprite = fresh.sprite;
          f.rot = fresh.rot;
          f.spin = fresh.spin;
          f.alive = true;
        } else {
          f.alive = false;
        }
        continue;
      }

      var spr = sprites[f.sprite];
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.translate(x, f.y);
      if (f.spin) ctx.rotate(f.rot);
      ctx.drawImage(spr, -half, -half, f.size, f.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function cleanupSnow() {
    if (cleaned) return;
    cleaned = true;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    ctx = null;
    flakes = [];
  }

  function injectFont() {
    if (document.getElementById('season-intro-font')) return;
    var style = document.createElement('style');
    style.id = 'season-intro-font';
    style.textContent =
      '@font-face{font-family:"Yeseva One";src:url("/assets/fonts/YesevaOne-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:swap;}' +
      '@media print{#season-intro,canvas[data-season-snow]{display:none!important}}' +      '@media (min-width:1600px){#season-intro [data-intro-a],#season-intro [data-intro-b]{white-space:nowrap}}' +      '@media (max-width:1599px){#season-intro [data-intro-br]{display:none}}';
    document.head.appendChild(style);
  }

  function styleLine(el, sizeExpr) {
    el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'margin:0',
      'padding:0 0.5rem',
      'opacity:0',
      'transform:translateY(12px)',
      'transition:none'
    ].join(';');
    var inner = document.createElement('div');
    inner.setAttribute('data-intro-text', '');
    inner.style.cssText = [
      'width:100%',
      'font-family:"Yeseva One",Georgia,"Times New Roman",serif',
      'font-weight:400',
      'font-size:' + sizeExpr,
      'line-height:1.25',
      'letter-spacing:0.005em',
      'color:#E02020',
      'text-align:center',
      'text-wrap:balance'
    ].join(';');
    el.appendChild(inner);
    return inner;
  }

  function buildIntro() {
    var wrap = document.createElement('div');
    wrap.id = 'season-intro';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', "Season's Greetings");
    wrap.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:9990',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:2rem 1.5rem 4rem',
      'background:linear-gradient(180deg,#f8f4ec 0%,#efe8dc 100%)',
      'color:#E02020',
      'text-align:center',
      'cursor:pointer',
      'opacity:1',
      'transform:translateY(0)',
      'transition:none'
    ].join(';');

    var stage = document.createElement('div');
    stage.setAttribute('data-intro-stage', '');
    stage.style.cssText = [
      'position:relative',
      'width:100%',
      'max-width:100%',
      'min-height:14rem'
    ].join(';');

    var line1 = document.createElement('h1');
    line1.setAttribute('data-intro-line', '1');
    styleLine(line1, 'clamp(2.4rem,7vw,5.25rem)').textContent = "Season's Greetings";

    var line2 = document.createElement('p');
    line2.setAttribute('data-intro-line', '2');
    styleLine(line2, 'clamp(2.7rem,8.2vw,6.1rem)').innerHTML =
      '<span data-intro-a>Wishing you a Merry Christmas</span> <br data-intro-br><span data-intro-b>and Happy New Year</span>';
    line2.setAttribute('aria-hidden', 'true');

    var hint = document.createElement('p');
    hint.textContent = 'Click or press any key to continue';
    hint.style.cssText = [
      'position:absolute',
      'left:0',
      'right:0',
      'bottom:1.6rem',
      'margin:0',
      'font-family:"IBM Plex Sans",system-ui,sans-serif',
      'font-size:0.75rem',
      'letter-spacing:0.08em',
      'color:#8a7e72'
    ].join(';');

    stage.appendChild(line1);
    stage.appendChild(line2);
    wrap.appendChild(stage);
    wrap.appendChild(hint);
    document.body.appendChild(wrap);
    introEl = wrap;
    introActive = true;
    introPage = 1;

    function fadeMs(ms) {
      return (reduced ? 80 : ms) + 'ms ease';
    }

    function showLine1() {
      var t = fadeMs(LINE1_FADE_MS);
      line1.style.transition = 'opacity ' + t + ',transform ' + t;
      line1.style.opacity = '1';
      line1.style.transform = 'translateY(0)';
    }

    function crossToLine2() {
      var t = fadeMs(CROSS_MS);
      line1.style.transition = 'opacity ' + t + ',transform ' + t;
      line2.style.transition = 'opacity ' + t + ',transform ' + t;
      line1.style.opacity = '0';
      line1.style.transform = 'translateY(-12px)';
      line2.style.opacity = '1';
      line2.style.transform = 'translateY(0)';
      line1.setAttribute('aria-hidden', 'true');
      line2.removeAttribute('aria-hidden');
      wrap.setAttribute('aria-label', 'Wishing you a Merry Christmas and Happy New Year');
    }

    var started = false;
    function startTimeline() {
      if (started) return;
      started = true;
      if (reduced) showLine1();
      else requestAnimationFrame(showLine1);

      var fade1 = reduced ? 80 : LINE1_FADE_MS;
      var hold1 = reduced ? 900 : LINE1_HOLD_MS;
      var cross = reduced ? 160 : CROSS_MS;
      var hold2 = reduced ? 900 : LINE2_HOLD_MS;

      later(crossToLine2, fade1 + hold1);
      later(function () { introPage = 2; }, fade1 + hold1 + cross);
      later(dismissIntro, fade1 + hold1 + cross + hold2);
    }

    var fallback = setTimeout(startTimeline, 1200);
    introTimers.push(fallback);
    if (document.fonts && document.fonts.load) {
      document.fonts.load('400 64px "Yeseva One"').then(function () {
        clearTimeout(fallback);
        startTimeline();
      }, function () {
        clearTimeout(fallback);
        startTimeline();
      });
    }

    onSkip = function (e) {
      if (!introActive || introLeaving) return;
      if (e && e.type === 'keydown' && e.key === 'Tab') return;
      if (e && e.type === 'keydown') e.preventDefault();
      dismissIntro();
    };
    wrap.addEventListener('click', onSkip);
    wrap.addEventListener('touchend', onSkip, { passive: true });
    document.addEventListener('keydown', onSkip);
  }

  function dismissIntro() {
    if (!introActive || introLeaving) return;
    introLeaving = true;
    introPage = 0;
    clearIntroTimers();
    try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
    document.removeEventListener('keydown', onSkip);

    if (!introEl) {
      introActive = false;
      introLeaving = false;
      startSiteClock();
      return;
    }

    var ms = reduced ? 120 : INTRO_OUT_MS;
    introEl.style.cursor = 'default';
    introEl.style.transition = 'opacity ' + ms + 'ms ease, transform ' + ms + 'ms ease';
    introEl.style.opacity = '0';
    introEl.style.transform = 'translateY(-28px)';
    setTimeout(function () {
      if (introEl && introEl.parentNode) introEl.parentNode.removeChild(introEl);
      introEl = null;
      introActive = false;
      introLeaving = false;
      startSiteClock();
    }, ms + 40);
  }

  function startSnow() {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-season-snow', '');
    canvas.style.cssText = [
      'position:fixed',
      'inset:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:10000',
      'display:block'
    ].join(';');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d', { alpha: true });
    sprites = [
      makeCrystalSprite(drawDendrite),
      makeCrystalSprite(drawPlate),
      makeCrystalSprite(drawStellar),
      makeDotSprite()
    ];

    onResize = resize;
    onVis = function () { last = performance.now(); };
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVis);

    resize();
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function shouldShowIntro() {
    try {
      if (sessionStorage.getItem(INTRO_KEY) === '1') return false;
    } catch (e) {}
    return true;
  }

  function init() {
    injectFont();
    var showIntro = shouldShowIntro();
    if (showIntro) buildIntro();
    if (!reduced) {
      startSnow();
      if (!showIntro) startSiteClock();
    }
  }

  window.SNOW = {
    getElapsed: function () { return siteElapsed; },
    isActive: function () { return !cleaned && !!canvas; },
    isSpawning: function () { return spawning && !cleaned && !!canvas; },
    isIntro: function () { return introActive && !introLeaving; },
    isIntroLeaving: function () { return introLeaving; },
    getIntroPage: function () { return introPage; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
