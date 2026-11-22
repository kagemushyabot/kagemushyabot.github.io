/* Seasonal intro + falling snow. Overlay and canvas are created in JS so a
   script failure never blocks the site. The intro (fireplace video, greeting,
   music) stays until the visitor clicks/taps or presses a key; the snow only
   falls on the website, starting when the intro is dismissed. */
(function () {
  var FALL_MS = 30000;
  var FADE_MS = 4000;
  var DPR_CAP = 2;
  var INTRO_OUT_MS = 1000;
  var TEXT_FADE_MS = 1800;
  var INTRO_FONT_NAME = 'Mountains of Christmas';
  var INTRO_FONT_URL = '/assets/fonts/MountainsofChristmas-Bold.woff2';
  var INTRO_FONT_STACK = '"' + INTRO_FONT_NAME + '",Georgia,"Times New Roman",serif';
  var INTRO_TEXT_Y = '31%';
  var INTRO_TEXT_Y_MOBILE = '42%';
  var INTRO_VIDEO_WEBM = '/assets/intro/fireplace-loop.webm';
  var INTRO_VIDEO_MP4 = '/assets/intro/fireplace-loop.mp4';
  var INTRO_POSTER = '/assets/intro/fireplace-poster.jpg';
  var MUSIC_TRACKS = [
    { id: 'wish', src: '/assets/audio/we-wish-you-a-merry-christmas-music-box.mp3', title: 'We Wish You a Merry Christmas' },
    { id: 'deck', src: '/assets/audio/deck-the-halls-music-box.mp3', title: 'Deck the Halls' },
    { id: 'tannenbaum', src: '/assets/audio/o-tannenbaum-music-box.mp3', title: 'O Christmas Tree' }
  ];
  var MUSIC_VOL = 0.15;
  var MUSIC_FADE_IN_MS = 1500;
  var MUSIC_FADE_OUT_MS = 3000;
  var MUSIC_HOLD_AFTER_ENTER_MS = 5000;
  function pickMusicTrack() {
    var q = '';
    try {
      var m = location.search.match(/[?&]snowtrack=([^&]*)/);
      q = m ? decodeURIComponent(m[1]).toLowerCase() : '';
    } catch (err) {}
    var i;
    if (q) {
      for (i = 0; i < MUSIC_TRACKS.length; i++) {
        if (MUSIC_TRACKS[i].id === q || MUSIC_TRACKS[i].title.toLowerCase().indexOf(q) !== -1 || MUSIC_TRACKS[i].src.indexOf(q) !== -1) {
          return MUSIC_TRACKS[i];
        }
      }
    }
    return MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
  }
  var musicPick = pickMusicTrack();
  var MUSIC_SRC = musicPick.src;
  var INTRO_KEY = 'seasonIntroSeen';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas, ctx, raf = 0, flakes = [], sprites = [], shardSprites = [];
  var cssW = 0, cssH = 0, dpr = 1;
  var siteElapsed = 0, last = 0, spawning = true, cleaned = false;
  var siteClockStarted = false;
  var snowStarted = false;
  var introEl = null, introActive = false, introLeaving = false;
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
  var audioEl = null;
  var musicMuted = false;
  var musicBlocked = false;
  var musicStopping = false;
  var reelPlayed = false;
  // Start the snow fade-out as soon as the main page's top reel video plays.
  document.addEventListener('play', function (e) {
    var v = e.target;
    if (v && v.closest && v.closest('[data-reel]')) reelPlayed = true;
  }, true);
  var volRaf = 0;
  var musicToggleBtn = null;
  var introVideo = null;
  var introHint = null;

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
    if (isMusicToggleEvent(e)) return;
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
    if (isMusicToggleEvent(e)) return;
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
      // The top reel video started playing: jump straight to the fade-out.
      if (reelPlayed && siteElapsed < FALL_MS) siteElapsed = FALL_MS;
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
      '@font-face{font-family:"' + INTRO_FONT_NAME + '";src:url("' + INTRO_FONT_URL + '") format("woff2");font-weight:700;font-style:normal;font-display:swap;}' +
      '@media print{#season-intro,canvas[data-season-snow],#season-music-toggle{display:none!important}}' +
      '#season-intro{position:fixed;inset:0;z-index:9990;overflow:hidden;cursor:pointer;background:#2a1408;' +
      'opacity:1;transform:translateY(0);-webkit-tap-highlight-color:transparent}' +
      '#season-intro [data-intro-media]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
      'object-position:62% 50%;display:block;pointer-events:none}' +
      '#season-intro [data-intro-shade]{position:absolute;inset:0;pointer-events:none;' +
      'background:linear-gradient(180deg,rgba(30,10,2,.08) 0%,rgba(30,10,2,0) 30%,rgba(20,8,2,0) 75%,rgba(20,8,2,.34) 100%)}' +
      '#season-intro [data-intro-block]{position:absolute;left:50%;top:' + INTRO_TEXT_Y + ';width:min(94vw,1560px);' +
      'transform:translate(-50%,-50%);pointer-events:none}' +
      '#season-intro [data-intro-title]{position:relative;margin:0;padding:0;' +
      'font-family:' + INTRO_FONT_STACK + ';font-weight:700;' +
      'font-size:clamp(3.05rem,6.6vw,8.25rem);line-height:1.24;letter-spacing:.012em;font-kerning:normal;text-align:center;' +
      'opacity:0;transform:translateY(10px);' +
      'transition:opacity ' + TEXT_FADE_MS + 'ms ease,transform ' + TEXT_FADE_MS + 'ms ease}' +
      '#season-intro.is-in [data-intro-title]{opacity:1;transform:translateY(0)}' +
      '#season-intro [data-intro-layer]{display:block}' +
      // Two stacked copies: all shadows/glow underneath, all letter fills on top, so a
      // bouncing letter's shadow can never paint over its neighbour's glyph.
      '#season-intro [data-intro-layer="shade"]{position:absolute;left:0;top:0;width:100%;color:transparent}' +
      '#season-intro [data-intro-layer="base"]{position:relative;color:#FFF8EE;text-shadow:none!important}' +
      '#season-intro [data-intro-layer="shade"]{color:transparent;' +
      'text-shadow:0 0 1px rgba(96,20,10,.6),0 .04em .06em rgba(44,10,2,.55),0 .05em .34em rgba(30,8,2,.42),' +
      '0 0 .18em rgba(255,250,240,.38),0 0 .5em rgba(255,244,228,.18)}' +
      '#season-intro [data-intro-line]{white-space:nowrap}' +
      '#season-intro [data-intro-word]{display:inline-block;white-space:nowrap}' +
      '#season-intro [data-intro-ch]{display:inline-block;transform-origin:50% 100%;will-change:transform}' +
      '#season-intro.is-in [data-intro-ch]{animation:season-bounce var(--bounce-cycle,5000ms) linear infinite;' +
      'animation-delay:calc(var(--i) * var(--bounce-stagger,70ms) + .45s)}' +
      '@keyframes season-bounce{' +
      '0%{transform:translateY(0) scaleY(1);animation-timing-function:cubic-bezier(.3,0,.4,1)}' +
      '1.4%{transform:translateY(0) scaleY(.95);animation-timing-function:cubic-bezier(.25,.6,.45,1)}' +
      '5.5%{transform:translateY(-.11em) scaleY(1.03);animation-timing-function:cubic-bezier(.55,0,.75,.45)}' +
      '9.6%{transform:translateY(0) scaleY(.97);animation-timing-function:ease-out}' +
      '12%,100%{transform:translateY(0) scaleY(1)}}' +
      '#season-intro [data-intro-line="3"]{display:block}' +
      '#season-intro [data-intro-hint]{position:absolute;left:0;right:0;bottom:1.7rem;margin:0;padding:0 5.75rem;' +
      'font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:.78rem;font-weight:400;' +
      'letter-spacing:.18em;text-transform:uppercase;text-align:center;color:rgba(255,236,212,.78);' +
      'text-shadow:0 1px 6px rgba(20,6,0,.7);pointer-events:none;opacity:0;transition:opacity 1.6s ease 1.4s}' +
      '#season-intro.is-in [data-intro-hint]{opacity:1;animation:season-hint 3.6s ease-in-out 3s infinite}' +
      '@keyframes season-hint{0%,100%{opacity:1}50%{opacity:.55}}' +
      '#season-music-toggle{position:absolute;left:1.4rem;bottom:1.4rem;z-index:2;width:4.2rem;height:4.2rem;' +
      'padding:0;margin:0;border:0;border-radius:50%;background:rgba(30,12,4,.5);color:rgba(255,236,212,.95);box-shadow:0 0 0 1.5px rgba(255,236,212,.35),0 2px 10px rgba(0,0,0,.35);' +
      'cursor:pointer;opacity:.9;display:flex;align-items:center;justify-content:center;pointer-events:auto;' +
      'transition:opacity .2s ease,background .2s ease}' +
      '#season-music-toggle:hover,#season-music-toggle:focus-visible{opacity:1;background:rgba(30,12,4,.65)}' +
      '#season-music-toggle svg{width:2.7rem;height:2.7rem;display:block}' +
      '#season-intro [data-intro-fill]{display:none}' +
      '@media (min-width:821px){' +
      '#season-intro [data-intro-fill]{display:block;position:absolute;inset:-60px;pointer-events:none;' +
      'background:#2a1408 url("' + INTRO_POSTER + '") center/cover no-repeat;filter:blur(30px) brightness(.48) saturate(1.1)}' +
      '#season-intro [data-intro-media]{left:50%;right:auto;width:auto;height:100%;aspect-ratio:16/9;max-width:none;' +
      'transform:translateX(-50%);object-position:50% 50%;' +
      '-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 3%,#000 97%,transparent 100%);' +
      'mask-image:linear-gradient(90deg,transparent 0,#000 3%,#000 97%,transparent 100%)}' +
      '#season-intro [data-intro-block]{width:min(96vw,1800px,170vh)}' +
      '#season-intro [data-intro-title]{font-size:clamp(3.05rem,min(6.6vw,11.7vh),8.25rem)}}' +
      '@media (max-width:700px){#season-intro [data-intro-block]{top:' + INTRO_TEXT_Y_MOBILE + ';width:96vw}' +
      '#season-intro [data-intro-title]{font-size:clamp(2.2rem,11.8vw,3.7rem);line-height:1.26;letter-spacing:.006em}' +
      '#season-intro [data-intro-line]{display:block}' +
      '#season-intro [data-intro-hint]{font-size:.7rem;bottom:1.45rem}}' +
      '@media (max-width:420px){#season-music-toggle{left:.9rem;bottom:1rem;width:3.5rem;height:3.5rem}#season-music-toggle svg{width:2.25rem;height:2.25rem}#season-intro [data-intro-hint]{padding:0 4.75rem}}' +
      '@media (prefers-reduced-motion:reduce){#season-intro [data-intro-title],#season-intro [data-intro-hint],#season-intro [data-intro-ch]{transition:opacity .3s ease;transform:none;animation:none!important}}';
    document.head.appendChild(style);
  }

  var ICON_SPEAKER =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M16 9a3.5 3.5 0 0 1 0 6"/><path d="M17.7 7a6 6 0 0 1 0 10"/></svg>';
  var ICON_MUTED =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M16 9.5 21 14.5M21 9.5 16 14.5"/></svg>';

  function isMusicToggleEvent(e) {
    var t = e && e.target;
    if (!t) return false;
    if (t.id === 'season-music-toggle') return true;
    return !!(t.closest && t.closest('#season-music-toggle'));
  }

  function ensureAudio() {
    if (audioEl) return audioEl;
    audioEl = document.createElement('audio');
    audioEl.src = MUSIC_SRC;
    audioEl.preload = 'auto';
    audioEl.loop = false;
    audioEl.addEventListener('ended', playNextTrack);
    audioEl.setAttribute('playsinline', '');
    audioEl.setAttribute('aria-hidden', 'true');
    audioEl.volume = 0;
    audioEl.style.display = 'none';
    (document.body || document.documentElement).appendChild(audioEl);
    return audioEl;
  }

  // When a track ends, continue with a different random track.
  function playNextTrack() {
    if (!audioEl || musicMuted) return;
    var choices = MUSIC_TRACKS.filter(function (t) { return t.src !== musicPick.src; });
    if (!choices.length) choices = MUSIC_TRACKS;
    musicPick = choices[Math.floor(Math.random() * choices.length)];
    MUSIC_SRC = musicPick.src;
    audioEl.src = MUSIC_SRC;
    var p;
    try { p = audioEl.play(); } catch (err) { p = null; }
    if (p && p.catch) p.catch(function () {});
    syncMusicToggle();
  }

  function isMusicPlaying() {
    return !!(audioEl && !audioEl.paused && !audioEl.muted && !musicStopping);
  }

  function syncMusicToggle() {
    if (!musicToggleBtn) return;
    var showMuted = musicMuted || !isMusicPlaying();
    musicToggleBtn.setAttribute('aria-label', showMuted ? 'Play music' : 'Mute music');
    musicToggleBtn.setAttribute('aria-pressed', showMuted ? 'true' : 'false');
    musicToggleBtn.innerHTML = showMuted ? ICON_MUTED : ICON_SPEAKER;
  }

  // Ramp audio volume; iOS ignores element volume, which is harmless here.
  function rampVolume(target, ms, done) {
    if (!audioEl) return;
    if (volRaf) cancelAnimationFrame(volRaf);
    var from = audioEl.volume || 0;
    var t0 = performance.now();
    function step(now) {
      var k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      try { audioEl.volume = clamp(from + (target - from) * k, 0, 1); } catch (err) {}
      if (k < 1) {
        volRaf = requestAnimationFrame(step);
      } else {
        volRaf = 0;
        if (done) done();
      }
    }
    volRaf = requestAnimationFrame(step);
  }

  function startMusic() {
    if (musicMuted || musicStopping || !introActive || introLeaving) return Promise.resolve(false);
    ensureAudio();
    audioEl.muted = false;
    if (!audioEl.paused) {
      rampVolume(MUSIC_VOL, MUSIC_FADE_IN_MS);
      syncMusicToggle();
      return Promise.resolve(true);
    }
    try { audioEl.volume = 0; } catch (err) {}
    var p;
    try { p = audioEl.play(); } catch (err2) { p = null; }
    if (p && p.then) {
      return p.then(function () {
        musicBlocked = false;
        rampVolume(MUSIC_VOL, MUSIC_FADE_IN_MS);
        syncMusicToggle();
        return true;
      }).catch(function () {
        musicBlocked = true;
        syncMusicToggle();
        return false;
      });
    }
    if (!audioEl.paused) rampVolume(MUSIC_VOL, MUSIC_FADE_IN_MS);
    syncMusicToggle();
    return Promise.resolve(!audioEl.paused);
  }

  function stopMusic(ms) {
    if (!audioEl || musicStopping) return;
    if (audioEl.paused) return;
    musicStopping = true;
    syncMusicToggle();
    rampVolume(0, ms, function () {
      try { audioEl.pause(); } catch (err) {}
      musicStopping = false;
    });
  }

  function toggleMusic() {
    if (isMusicPlaying()) {
      musicMuted = true;
      rampVolume(0, 250, function () {
        if (musicMuted && audioEl) {
          try { audioEl.pause(); } catch (err) {}
        }
        syncMusicToggle();
      });
      syncMusicToggle();
    } else {
      musicMuted = false;
      startMusic();
    }
  }

  function buildMusicToggle(wrap) {
    var btn = document.createElement('button');
    btn.id = 'season-music-toggle';
    btn.type = 'button';
    musicToggleBtn = btn;
    syncMusicToggle();
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMusic();
    });
    btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    btn.addEventListener('touchend', function (e) { e.stopPropagation(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') e.stopPropagation();
    });
    wrap.appendChild(btn);
  }

  function wordsHTML(text) {
    return text.split(' ').map(function (w) { return '<span data-intro-word>' + w + '</span>'; }).join(' ');
  }

  // Per-letter spans for the looping bounce wave. Words stay unbroken
  // (each word is an inline-block nowrap span), so line breaks only happen at spaces.
  var BOUNCE_STAGGER_MS = 70;
  var bounceIndex = 0;
  function lettersHTML(text) {
    return text.split(' ').map(function (w) {
      var out = '';
      for (var i = 0; i < w.length; i++) {
        out += '<span data-intro-ch style="--i:' + (bounceIndex++) + '">' + w.charAt(i) + '</span>';
      }
      return '<span data-intro-word>' + out + '</span>';
    }).join(' ');
  }
  function titleHTML() {
    bounceIndex = 0;
    return '<span data-intro-line="1">' + lettersHTML('Wishing you a') + '</span> ' +
      '<span data-intro-line="2">' + lettersHTML('Merry Christmas') + '</span> ' +
      '<span data-intro-line="3">' + lettersHTML('and Happy New Year') + '</span>';
  }

  function buildIntro() {
    var wrap = document.createElement('div');
    wrap.id = 'season-intro';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Wishing you a Merry Christmas and Happy New Year');

    var media;
    if (reduced) {
      media = document.createElement('img');
      media.src = INTRO_POSTER;
      media.alt = '';
    } else {
      media = document.createElement('video');
      media.muted = true;
      media.defaultMuted = true;
      media.loop = true;
      media.autoplay = true;
      media.playsInline = true;
      media.setAttribute('muted', '');
      media.setAttribute('loop', '');
      media.setAttribute('autoplay', '');
      media.setAttribute('playsinline', '');
      media.setAttribute('preload', 'auto');
      media.setAttribute('disablepictureinpicture', '');
      media.poster = INTRO_POSTER;
      var s1 = document.createElement('source');
      s1.src = INTRO_VIDEO_WEBM;
      s1.type = 'video/webm';
      var s2 = document.createElement('source');
      s2.src = INTRO_VIDEO_MP4;
      s2.type = 'video/mp4';
      // MP4 (H.264) first: every mobile browser decodes it in hardware. Safari on
      // iOS/iPadOS may otherwise pick the WebM (VP9) and stall. WebM stays as a fallback.
      // ?introvideo=webm forces the WebM first (testing the watchdog fallback only).
      if (/[?&]introvideo=webm\b/.test(location.search)) { media.appendChild(s1); media.appendChild(s2); }
      else { media.appendChild(s2); media.appendChild(s1); }
      introVideo = media;
    }
    media.setAttribute('data-intro-media', '');
    media.setAttribute('aria-hidden', 'true');

    var shade = document.createElement('div');
    shade.setAttribute('data-intro-shade', '');

    var title = document.createElement('h1');
    title.setAttribute('data-intro-title', '');
    title.setAttribute('aria-label', 'Wishing you a Merry Christmas and Happy New Year');
    title.innerHTML =
      '<span data-intro-layer="shade" aria-hidden="true">' + titleHTML() + '</span>' +
      '<span data-intro-layer="base" aria-hidden="true">' + titleHTML() + '</span>';
    // One bounce cycle = the wave across all letters + a short hop + a ~1.7 s pause.
    var bounceCycle = bounceIndex * BOUNCE_STAGGER_MS + 600 + 1700;
    title.style.setProperty('--bounce-cycle', bounceCycle + 'ms');
    title.style.setProperty('--bounce-stagger', BOUNCE_STAGGER_MS + 'ms');

    var block = document.createElement('div');
    block.setAttribute('data-intro-block', '');
    block.appendChild(title);

    var hint = document.createElement('p');
    hint.setAttribute('data-intro-hint', '');
    var touch = window.matchMedia && window.matchMedia('(hover: none)').matches;
    hint.textContent = touch ? 'Tap to enter' : 'Click to enter';
    introHint = hint;

    var fill = document.createElement('div');
    fill.setAttribute('data-intro-fill', '');
    fill.setAttribute('aria-hidden', 'true');
    wrap.appendChild(fill);
    wrap.appendChild(media);
    wrap.appendChild(shade);
    wrap.appendChild(block);
    wrap.appendChild(hint);
    buildMusicToggle(wrap);
    document.body.appendChild(wrap);
    introEl = wrap;
    introActive = true;

    if (introVideo) {
      kickIntroVideo();
      keepIntroVideoPlaying(introVideo, wrap);
    }

    function showText() {
      if (introEl) introEl.classList.add('is-in');
    }
    var fallback = setTimeout(showText, 900);
    introTimers.push(fallback);
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 64px "' + INTRO_FONT_NAME + '"').then(function () {
        clearTimeout(fallback);
        requestAnimationFrame(showText);
      }, function () {
        clearTimeout(fallback);
        showText();
      });
    }

    startMusic();

    onSkip = function (e) {
      if (!introActive || introLeaving) return;
      if (e && e.type !== 'keydown' && isMusicToggleEvent(e)) return;
      if (e && e.type === 'keydown') {
        if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
        e.preventDefault();
      }
      if (e && (e.type === 'click' || e.type === 'touchend') && ignoreIntroSkip) return;
      dismissIntro();
    };
    wrap.addEventListener('click', onSkip);
    document.addEventListener('keydown', onSkip);
  }

  // ---- intro video keep-alive (mobile: autoplay refusal, Low Power Mode, loop stalls) ----
  var introWatchdog = 0;
  function kickIntroVideo() {
    var v = introVideo;
    if (!v || !introActive) return;
    try {
      var vp = v.play();
      if (vp && vp.catch) vp.catch(function () {});
    } catch (err) {}
  }
  function keepIntroVideoPlaying(v, wrap) {
    var lastT = -1, stuck = 0, reloads = 0;
    function live() { return introVideo === v && introActive && !introLeaving; }
    // Manual loop fallback in case the native loop does not restart.
    v.addEventListener('ended', function () {
      if (!live()) return;
      try { v.currentTime = 0; } catch (err) {}
      kickIntroVideo();
    });
    // Resume if the browser pauses it (power saving, interruption, tab switch).
    v.addEventListener('pause', function () {
      if (!live() || document.hidden) return;
      setTimeout(function () { if (live() && v.paused && !document.hidden) kickIntroVideo(); }, 250);
    });
    v.addEventListener('stalled', function () { if (live()) kickIntroVideo(); });
    document.addEventListener('visibilitychange', function () {
      if (live() && !document.hidden) kickIntroVideo();
    });
    // A touch is a user gesture: lets play() succeed where autoplay was refused.
    wrap.addEventListener('touchstart', function () { if (live()) kickIntroVideo(); }, { passive: true, capture: true });
    wrap.addEventListener('pointerdown', function () { if (live()) kickIntroVideo(); }, { passive: true, capture: true });
    // Watchdog: playback must advance while the intro is visible. WebKit can freeze on
    // the loop seek (time stuck, not paused); re-seek, then reload, preferring the MP4.
    if (introWatchdog) clearInterval(introWatchdog);
    introWatchdog = setInterval(function () {
      if (!live()) { clearInterval(introWatchdog); introWatchdog = 0; return; }
      if (document.hidden) { lastT = -1; stuck = 0; return; }
      var t = v.currentTime;
      if (v.paused || v.ended || t === lastT) {
        stuck++;
        if (v.ended || (v.duration && t >= v.duration - 0.1) || stuck === 2) {
          try { v.currentTime = 0; } catch (err) {}
        }
        if (stuck >= 3 && reloads < 3) {
          reloads++;
          stuck = 0;
          var webm = v.querySelector('source[type="video/webm"]');
          if (webm && /\.webm(\?|$)/.test(v.currentSrc || '')) v.removeChild(webm);
          try { v.load(); } catch (err2) {}
        }
        kickIntroVideo();
      } else {
        stuck = 0;
      }
      lastT = t;
    }, 1500);
  }

  function dismissIntro() {
    if (!introActive || introLeaving) return;
    introLeaving = true;
    clearIntroTimers();
    try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
    document.removeEventListener('keydown', onSkip);
    // Keep the music at full volume for a few seconds on the site, then fade out.
    setTimeout(function () { stopMusic(MUSIC_FADE_OUT_MS); }, MUSIC_HOLD_AFTER_ENTER_MS);
    if (!reduced) startSnow();
    revealScore();

    if (!introEl) {
      introActive = false;
      introLeaving = false;
      startSiteClock();
      return;
    }

    var ms = reduced ? 120 : INTRO_OUT_MS;
    introEl.style.cursor = 'default';
    introEl.style.pointerEvents = 'none';
    introEl.style.transition = 'opacity ' + ms + 'ms ease, transform ' + ms + 'ms ease';
    introEl.style.opacity = '0';
    introEl.style.transform = 'translateY(-28px)';
    setTimeout(function () {
      if (introWatchdog) { clearInterval(introWatchdog); introWatchdog = 0; }
      if (introVideo) {
        try { introVideo.pause(); } catch (err) {}
        introVideo.removeAttribute('src');
        while (introVideo.firstChild) introVideo.removeChild(introVideo.firstChild);
        try { introVideo.load(); } catch (err2) {}
        introVideo = null;
      }
      if (introEl && introEl.parentNode) introEl.parentNode.removeChild(introEl);
      introEl = null;
      musicToggleBtn = null;
      introActive = false;
      introLeaving = false;
      startSiteClock();
    }, ms + 40);
  }

  function startSnow() {
    if (snowStarted || cleaned) return;
    snowStarted = true;
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
    if (showIntro) {
      buildIntro();
    } else if (!reduced) {
      startSnow();
      startSiteClock();
    } else {
      startSiteClock();
    }
  }

  window.SNOW = {
    getElapsed: function () { return siteElapsed; },
    isActive: function () { return !cleaned && !!canvas; },
    isSpawning: function () { return spawning && !cleaned && !!canvas; },
    isSnowStarted: function () { return snowStarted; },
    isIntro: function () { return introActive && !introLeaving; },
    isIntroLeaving: function () { return introLeaving; },
    dismissIntro: function () { dismissIntro(); },
    getScore: function () { return score; },
    reelPlayed: function () { return reelPlayed; },
    musicVolume: function () { return audioEl ? audioEl.volume : 0; },
    musicTargetVolume: function () { return MUSIC_VOL; },
    isMusicPlaying: function () { return isMusicPlaying(); },
    isMusicBlocked: function () { return musicBlocked; },
    musicTime: function () { return audioEl ? audioEl.currentTime : 0; },
    musicTrack: function () { return musicPick ? musicPick.id : null; },
    musicSrc: function () { return MUSIC_SRC; },
    musicTitle: function () { return musicPick ? musicPick.title : ''; },
    tracks: function () { return MUSIC_TRACKS.map(function (t) { return t.id; }); }
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
