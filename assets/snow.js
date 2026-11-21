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

  var canvas, ctx, raf = 0, flakes = [], sprites = [], shardSprites = [];
  var cssW = 0, cssH = 0, dpr = 1;
  var siteElapsed = 0, last = 0, spawning = true, cleaned = false;
  var siteClockStarted = false;
  var introEl = null, introActive = false, introLeaving = false;
  var introPage = 0;
  var introTimers = [];
  var onResize, onVis, onSkip, onPointer, onSwallow;
  var bursts = [];
  var ignoreIntroSkip = false;
  var ignoreIntroSkipTimer = 0;
  var BURST_SHARD_CAP = 80;
  var SHARD_GRAVITY = 420;
  var HIT_RADIUS_SCALE = 1.15;
  var HIT_RADIUS_MIN = 14;
  var SWALLOW_MS = 600;
  var swallowUntil = 0;
  var swallowPointerId = null;
  var swallowTimer = 0;
  var swallowSeenUp = false;
  var score = 0;
  var scoreEl = null, scoreValEl = null, scoreVisible = false;
  var SWALLOW_EVENTS = ['pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'touchcancel'];
  var snowDebug = /[?&]snowdebug(?:&|=|$)/.test(location.search);

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

  function makeDiamondShard() {
    var s = 48;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    paintCrystal(g, s / 2, s / 2, function (g) {
      g.beginPath();
      g.moveTo(18, 0);
      g.lineTo(4, -8);
      g.lineTo(-18, 0);
      g.lineTo(4, 8);
      g.closePath();
      g.fill();
      g.stroke();
    });
    return c;
  }

  function makeSparkleSprite() {
    var s = 48;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    paintCrystal(g, s / 2, s / 2, function (g) {
      var i, len;
      for (i = 0; i < 4; i++) {
        g.save();
        g.rotate(i * Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(16, 0);
        g.moveTo(7, -3.5);
        g.lineTo(16, 0);
        g.lineTo(7, 3.5);
        g.stroke();
        g.restore();
      }
      hexPath(g, 3.2, 0);
      g.fill();
      g.stroke();
    });
    return c;
  }

  function makeChipSprite() {
    var s = 48;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    paintCrystal(g, s / 2, s / 2, function (g) {
      g.beginPath();
      g.moveTo(14, -3);
      g.lineTo(2, -11);
      g.lineTo(-15, 1);
      g.lineTo(-4, 10);
      g.lineTo(10, 7);
      g.closePath();
      g.fill();
      g.stroke();
    });
    return c;
  }

  // Small crystals keep the current v3 speed. Mid/large scale up with size
  // so nearer (bigger) flakes fall faster for a parallax/depth feel.
  function smallFlakeSpeed() {
    return (22 + Math.random() * 20) * 1.75;
  }

  function speedScaleForSize(size) {
    if (size >= 36) return 1.8 + Math.min(1, (size - 36) / 20) * 0.7;
    if (size >= 18) return 1 + ((size - 18) / 18) * 0.8;
    return 1;
  }

  function makeFlake(anywhere) {
    var roll = Math.random();
    var size, vy, alpha, sprite, spin, amp;
    if (roll < 0.16) {
      sprite = 3;
      size = 3.4 + Math.random() * 3.6;
      vy = (30 + Math.random() * 34) * 1.75;
      alpha = 0.55 + Math.random() * 0.35;
      spin = 0;
      amp = 6 + Math.random() * 20;
    } else if (roll < 0.54) {
      sprite = (Math.random() * 3) | 0;
      size = 10 + Math.random() * 8;
      vy = (22 + Math.random() * 20) * 1.75;
      alpha = 0.78 + Math.random() * 0.2;
      spin = (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.35);
      amp = 6 + Math.random() * 20;
    } else if (roll < 0.88) {
      sprite = (Math.random() * 3) | 0;
      size = 20 + Math.random() * 10;
      vy = smallFlakeSpeed() * speedScaleForSize(size);
      alpha = 0.86 + Math.random() * 0.13;
      spin = (Math.random() < 0.5 ? -1 : 1) * (0.1 + Math.random() * 0.22);
      amp = 8 + Math.random() * 24;
    } else {
      sprite = (Math.random() * 3) | 0;
      size = 36 + Math.random() * 20;
      vy = smallFlakeSpeed() * speedScaleForSize(size);
      alpha = 0.92 + Math.random() * 0.08;
      spin = (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.1);
      amp = 12 + Math.random() * 28;
    }
    return {
      baseX: Math.random() * cssW,
      y: anywhere ? Math.random() * cssH : -size - Math.random() * 50,
      size: size,
      vy: vy,
      amp: amp,
      freq: 0.5 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      alpha: alpha,
      sprite: sprite,
      rot: Math.random() * Math.PI * 2,
      spin: spin,
      alive: true
    };
  }

  function applyLargeMotion(f) {
    f.size = 36 + Math.random() * 20;
    f.vy = smallFlakeSpeed() * speedScaleForSize(f.size);
    f.alpha = 0.92 + Math.random() * 0.08;
    f.spin = (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.1);
    f.amp = 12 + Math.random() * 28;
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
        applyLargeMotion(flakes[i]);
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

  function flakeDrawnX(f, tSec) {
    if (f.drawX != null) return f.drawX;
    return f.baseX + Math.sin(tSec * f.freq + f.phase) * f.amp;
  }

  function shardCount() {
    var n = 0, i;
    for (i = 0; i < bursts.length; i++) n += bursts[i].shards.length;
    return n;
  }

  function spawnBurst(x, y, flakeSize) {
    var n = 8 + ((Math.random() * 7) | 0);
    var room = BURST_SHARD_CAP - shardCount();
    if (room <= 0) n = 0;
    else if (n > room) n = room;
    var shards = [];
    var i, ang, spd, spr, size0;
    for (i = 0; i < n; i++) {
      ang = (i / Math.max(n, 1)) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      spd = 180 + Math.random() * 260;
      spr = (Math.random() * shardSprites.length) | 0;
      size0 = Math.max(7, Math.min(20, 7 + flakeSize * 0.22 + Math.random() * 6));
      shards.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 50,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 9),
        size0: size0,
        life: 0.5 + Math.random() * 0.2,
        age: 0,
        sprite: spr,
        alpha: 0.85 + Math.random() * 0.15
      });
    }
    bursts.push({
      x: x,
      y: y,
      age: 0,
      life: 0.62,
      ringLife: 0.34,
      ringMax: 40 + flakeSize * 1.15,
      shards: shards
    });
  }

  function burstPoints(f) {
    if (!f) return 3;
    // Soft dots (sprite 3, ~3–7px) and small crystals (10–18) are harder to hit → 3.
    if (f.sprite === 3 || f.size < 19) return 3;
    // Medium crystals (20–30). The 31–35 gap is unused; treat as medium if it appears.
    if (f.size <= 33) return 2;
    // Large crystals (36–56)
    return 1;
  }

  function formatScore(n) {
    n = Math.max(0, Math.min(9999, n | 0));
    var s = String(n);
    while (s.length < 4) s = '0' + s;
    return s;
  }

  function injectScoreStyle() {
    if (document.getElementById('season-score-style')) return;
    var style = document.createElement('style');
    style.id = 'season-score-style';
    style.textContent =
      '#season-score{margin-left:auto;flex:0 0 auto;display:inline-flex;align-items:center;gap:.4rem;' +
      'font-family:var(--font-sans),"IBM Plex Sans",system-ui,sans-serif;font-size:1em;font-weight:500;' +
      'letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted,#a8a39a);line-height:1;' +
      'white-space:nowrap;pointer-events:none;user-select:none;opacity:0;transition:opacity .45s ease}' +
      '#season-score.is-visible{opacity:1}' +
      '#season-score.is-done{opacity:.55}' +
      '#season-score svg{width:1em;height:1em;display:block;flex:none;color:#c7e3f6}' +
      '#season-score .season-score-num{font-variant-numeric:tabular-nums lining-nums;' +
      'font-feature-settings:"tnum" 1,"lnum" 1;' +
      'font-family:"IBM Plex Sans",var(--font-sans),ui-monospace,Menlo,Consolas,monospace,system-ui,sans-serif;' +
      'display:inline-block;min-width:4ch;width:4ch;text-align:right;letter-spacing:.08em;' +
      'color:var(--text,#f2f0ec);transform-origin:50% 50%}' +
      '#season-score.is-bump .season-score-num{animation:season-score-bump .38s ease}' +
      '@keyframes season-score-bump{0%{transform:scale(1)}35%{transform:scale(1.22)}100%{transform:scale(1)}}' +
      '#season-score.season-score-fixed{position:fixed;top:1.15rem;right:max(1.5rem,var(--pad,1.5rem));' +
      'z-index:95;margin-left:0}' +
      '.season-score-pop{position:fixed;left:0;top:0;z-index:10001;pointer-events:none;' +
      'font-family:"IBM Plex Sans",var(--font-sans),system-ui,sans-serif;font-variant-numeric:tabular-nums;' +
      'font-size:1.05rem;font-weight:600;letter-spacing:.06em;color:#f3fbff;' +
      'text-shadow:0 1px 2px rgba(0,0,0,.65),0 0 10px rgba(160,210,240,.75);' +
      'animation:season-score-pop .68s ease forwards;will-change:transform,opacity}' +
      '@keyframes season-score-pop{0%{opacity:1;transform:translate(-50%,-50%) translateY(0)}' +
      '40%{opacity:1;transform:translate(-50%,-50%) translateY(-12px)}' +
      '100%{opacity:0;transform:translate(-50%,-50%) translateY(-30px)}}' +
      '@media print{#season-score,.season-score-pop{display:none!important}}' +
      '@media (max-width:420px){#season-score{gap:.35em}}';
    document.head.appendChild(style);
  }

  function ensureScore() {
    injectScoreStyle();
    if (scoreEl && scoreEl.parentNode) return scoreEl;
    var el = document.createElement('div');
    el.id = 'season-score';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Snow burst score 0000');
    el.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round">' +
      '<path d="M12 2v20"/><path d="M4.05 6.5 19.95 17.5"/><path d="M4.05 17.5 19.95 6.5"/>' +
      '<path d="M12 5.6 10.2 3.4M12 5.6l1.8-2.2"/>' +
      '<path d="M12 18.4 10.2 20.6M12 18.4l1.8 2.2"/>' +
      '<path d="M6.7 7.9 4.4 6.6M6.7 7.9 5.8 10.4"/>' +
      '<path d="M17.3 16.1 19.6 17.4M17.3 16.1 18.2 13.6"/>' +
      '<path d="M6.7 16.1 4.4 17.4M6.7 16.1 5.8 13.6"/>' +
      '<path d="M17.3 7.9 19.6 6.6M17.3 7.9 18.2 10.4"/>' +
      '</svg><span class="season-score-num">0000</span>';
    var nav = document.querySelector('nav.site-nav') || document.querySelector('.site-nav');
    var header = document.querySelector('header.site-header') || document.querySelector('.site-header');
    if (nav) {
      nav.appendChild(el);
    } else if (header) {
      header.appendChild(el);
    } else {
      el.classList.add('season-score-fixed');
      (document.body || document.documentElement).appendChild(el);
    }
    scoreEl = el;
    scoreValEl = el.querySelector('.season-score-num');
    if (scoreValEl) scoreValEl.textContent = formatScore(score);
    return el;
  }

  function revealScore() {
    if (!scoreEl) ensureScore();
    if (!scoreEl || scoreVisible) return;
    scoreVisible = true;
    requestAnimationFrame(function () {
      if (scoreEl) scoreEl.classList.add('is-visible');
    });
  }

  function dimScore() {
    if (!scoreEl) return;
    scoreEl.classList.add('is-done');
    scoreEl.classList.remove('is-bump');
  }

  function spawnScorePop(pts, x, y) {
    var pop = document.createElement('div');
    pop.className = 'season-score-pop';
    pop.textContent = '+' + pts;
    pop.style.left = Math.round(x) + 'px';
    pop.style.top = Math.round(y - 18) + 'px';
    document.body.appendChild(pop);
    setTimeout(function () {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    }, 780);
  }

  function addScore(pts, x, y) {
    if (!pts) return;
    score = Math.min(9999, score + pts);
    if (!scoreValEl) ensureScore();
    if (scoreValEl) scoreValEl.textContent = formatScore(score);
    if (scoreEl) {
      scoreEl.setAttribute('aria-label', 'Snow burst score ' + formatScore(score));
      scoreEl.classList.remove('is-bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('is-bump');
      setTimeout(function () {
        if (scoreEl) scoreEl.classList.remove('is-bump');
      }, 400);
    }
    spawnScorePop(pts, x, y);
  }

  function burstFlake(f, now) {
    if (!f || !f.alive) return false;
    var tSec = (now || last || performance.now()) / 1000;
    var x = flakeDrawnX(f, tSec);
    var y = f.y;
    var pts = burstPoints(f);
    f.alive = false;
    f.respawnAt = (now || performance.now()) + 450 + Math.random() * 400;
    spawnBurst(x, y, f.size || 16);
    addScore(pts, x, y);
    return true;
  }

  function hitTestFlake(px, py) {
    var tSec = (last || performance.now()) / 1000;
    var best = null, bestD = Infinity, i, f, x, y, r, dx, dy, d;
    for (i = 0; i < flakes.length; i++) {
      f = flakes[i];
      if (!f.alive) continue;
      x = flakeDrawnX(f, tSec);
      y = f.y;
      r = hitRadius(f);
      dx = px - x;
      dy = py - y;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r && d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  function burstAt(px, py) {
    var f = hitTestFlake(px, py);
    if (!f) return false;
    return burstFlake(f, performance.now());
  }

  function hitRadius(f) {
    return Math.max((f.size / 2) * HIT_RADIUS_SCALE, HIT_RADIUS_MIN);
  }

  function markIgnoreIntroSkip() {
    ignoreIntroSkip = true;
    if (ignoreIntroSkipTimer) clearTimeout(ignoreIntroSkipTimer);
    ignoreIntroSkipTimer = setTimeout(function () {
      ignoreIntroSkip = false;
      ignoreIntroSkipTimer = 0;
    }, 500);
  }

  function clearSwallow() {
    swallowUntil = 0;
    swallowPointerId = null;
    swallowSeenUp = false;
    if (swallowTimer) {
      clearTimeout(swallowTimer);
      swallowTimer = 0;
    }
  }

  function armSwallow(pointerId) {
    swallowPointerId = pointerId;
    swallowSeenUp = false;
    swallowUntil = performance.now() + SWALLOW_MS;
    if (swallowTimer) clearTimeout(swallowTimer);
    swallowTimer = setTimeout(function () {
      swallowPointerId = null;
      swallowUntil = 0;
      swallowTimer = 0;
    }, SWALLOW_MS);
  }

  function isSwallowing(e) {
    if (swallowPointerId == null && swallowUntil <= 0) return false;
    if (performance.now() > swallowUntil) {
      clearSwallow();
      return false;
    }
    if (e && e.pointerId != null && swallowPointerId != null && e.pointerId !== swallowPointerId) {
      return false;
    }
    return true;
  }

  function swallowEvent(e) {
    if (!isSwallowing(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (e.type === 'pointerup' || e.type === 'mouseup' || e.type === 'touchend') swallowSeenUp = true;
    if (e.type === 'click') clearSwallow();
  }

  function pointerXY(e) {
    if (e.clientX != null && e.clientY != null && !(e.touches && e.touches.length)) {
      return { x: e.clientX, y: e.clientY };
    }
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches[0]) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return null;
  }

  function onPointerDown(e) {
    if (cleaned || !canvas) return;
    if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
    if (e.type === 'mousedown' && e.button != null && e.button !== 0) return;
    if (isSwallowing(e)) {
      if (swallowSeenUp) {
        clearSwallow();
      } else {
        swallowEvent(e);
        return;
      }
    }
    var pt = pointerXY(e);
    if (!pt) return;
    if (!burstAt(pt.x, pt.y)) return;
    markIgnoreIntroSkip();
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    armSwallow(e.pointerId != null ? e.pointerId : 'mouse');
  }

  function updateBursts(dt) {
    var i, b, j, s, k, size, alpha, spr, half;
    for (i = bursts.length - 1; i >= 0; i--) {
      b = bursts[i];
      b.age += dt;
      for (j = b.shards.length - 1; j >= 0; j--) {
        s = b.shards[j];
        s.age += dt;
        if (s.age >= s.life) {
          b.shards.splice(j, 1);
          continue;
        }
        s.vy += SHARD_GRAVITY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.spin * dt;
      }
      if (b.age >= b.life && !b.shards.length) bursts.splice(i, 1);
    }
  }

  function drawBursts(ctx) {
    var i, b, j, s, k, ringT, rad, alpha, spr, half, flash;
    for (i = 0; i < bursts.length; i++) {
      b = bursts[i];
      ringT = Math.min(1, b.age / b.ringLife);
      if (ringT < 1) {
        rad = 10 + ringT * b.ringMax;
        alpha = (1 - ringT) * 0.95;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(210, 235, 255, 1)';
        ctx.lineWidth = 3.4 * (1 - ringT) + 1.2;
        ctx.stroke();
        flash = (1 - ringT) * 0.55;
        if (flash > 0.02) {
          ctx.globalAlpha = flash;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 8 + ringT * 18, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 1)';
          ctx.fill();
        }
        ctx.restore();
      }
      for (j = 0; j < b.shards.length; j++) {
        s = b.shards[j];
        k = s.age / s.life;
        size = s.size0 * (1 - k * 0.85);
        alpha = s.alpha * (1 - k * k);
        spr = shardSprites[s.sprite];
        if (!spr || size < 0.4 || alpha < 0.02) continue;
        half = size / 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.drawImage(spr, -half, -half, size, size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function startSiteClock() {
    if (siteClockStarted) return;
    siteClockStarted = true;
    siteElapsed = 0;
    revealScore();
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

    updateBursts(dt);

    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      if (!f.alive) {
        if (f.respawnAt && now >= f.respawnAt) {
          f.respawnAt = 0;
          if (spawning) {
            var born = makeFlake(false);
            f.baseX = born.baseX;
            f.y = born.y;
            f.size = born.size;
            f.vy = born.vy;
            f.amp = born.amp;
            f.freq = born.freq;
            f.phase = born.phase;
            f.alpha = born.alpha;
            f.sprite = born.sprite;
            f.rot = born.rot;
            f.spin = born.spin;
            f.alive = true;
            f.drawX = f.baseX;
          }
        }
        continue;
      }
      f.y += f.vy * dt;
      f.rot += f.spin * dt;
      var x = f.baseX + Math.sin(t * f.freq + f.phase) * f.amp;
      f.drawX = x;
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
    drawBursts(ctx);
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
    if (onPointer) {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('touchstart', onPointer, true);
    }
    if (onSwallow) {
      for (var si = 0; si < SWALLOW_EVENTS.length; si++) {
        window.removeEventListener(SWALLOW_EVENTS[si], onSwallow, true);
      }
    }
    onPointer = null;
    onSwallow = null;
    clearSwallow();
    if (ignoreIntroSkipTimer) {
      clearTimeout(ignoreIntroSkipTimer);
      ignoreIntroSkipTimer = 0;
    }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    ctx = null;
    flakes = [];
    bursts = [];
    dimScore();
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
      if (e && (e.type === 'click' || e.type === 'touchend') && ignoreIntroSkip) return;
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
    revealScore();
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
    shardSprites = [makeDiamondShard(), makeSparkleSprite(), makeChipSprite(), makeDotSprite()];

    onResize = resize;
    onVis = function () { last = performance.now(); };
    onPointer = onPointerDown;
    onSwallow = swallowEvent;
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    var cap = { capture: true, passive: false };
    if (window.PointerEvent) {
      window.addEventListener('pointerdown', onPointer, cap);
    } else {
      window.addEventListener('mousedown', onPointer, cap);
      window.addEventListener('touchstart', onPointer, cap);
    }
    for (var ei = 0; ei < SWALLOW_EVENTS.length; ei++) {
      window.addEventListener(SWALLOW_EVENTS[ei], onSwallow, cap);
    }

    ensureScore();
    resize();
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function isReloadNavigation() {
    try {
      var entries = performance.getEntriesByType && performance.getEntriesByType('navigation');
      if (entries && entries[0] && entries[0].type) return entries[0].type === 'reload';
    } catch (e) {}
    try {
      if (performance.navigation && performance.navigation.type === 1) return true;
    } catch (e2) {}
    return false;
  }

  function shouldShowIntro() {
    if (isReloadNavigation()) return true;
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
    getIntroPage: function () { return introPage; },
    getScore: function () { return score; }
  };

  if (snowDebug) {
    window.SNOW.getFlakePositions = function () {
      var tSec = (last || performance.now()) / 1000;
      var out = [], i, f;
      for (i = 0; i < flakes.length; i++) {
        f = flakes[i];
        if (!f.alive) continue;
        out.push({
          i: i,
          x: flakeDrawnX(f, tSec),
          y: f.y,
          size: f.size,
          radius: hitRadius(f)
        });
      }
      return out;
    };
    window.SNOW.burstAt = function (x, y) { return burstAt(x, y); };
    window.SNOW.burstIndex = function (i) {
      var f = flakes[i];
      return burstFlake(f, performance.now());
    };
    window.SNOW.burstCount = function () { return bursts.length; };
    window.SNOW.hitRadiusFor = function (size) {
      return Math.max((size / 2) * HIT_RADIUS_SCALE, HIT_RADIUS_MIN);
    };
    window.SNOW.forceCleanup = function () { cleanupSnow(); };
    window.SNOW.placeFlakeAt = function (x, y, kind) {
      var f = null, i, tSec, best = -1;
      for (i = 0; i < flakes.length; i++) {
        if (!flakes[i].alive) continue;
        if (flakes[i].size > best) {
          best = flakes[i].size;
          f = flakes[i];
        }
      }
      if (!f) return null;
      tSec = (last || performance.now()) / 1000;
      if (kind === 'dot') {
        f.sprite = 3;
        f.size = 6;
      } else if (kind === 'small') {
        if (f.sprite === 3) f.sprite = 0;
        f.size = 14;
      } else if (kind === 'medium') {
        if (f.sprite === 3) f.sprite = 1;
        f.size = 24;
      } else if (kind === 'large') {
        if (f.sprite === 3) f.sprite = 2;
        f.size = 44;
      }
      f.amp = 0;
      f.vy = 0;
      f.y = y;
      f.baseX = x;
      f.drawX = x;
      f.alive = true;
      return { x: x, y: y, size: f.size, radius: hitRadius(f), points: burstPoints(f), sprite: f.sprite };
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
