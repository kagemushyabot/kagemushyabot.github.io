(function () {
  'use strict';
  var root = document.documentElement;
  var header = document.querySelector('.site-header');

  /* header height -> --hdr (for the pinned banner offset) */
  function setHdr() {
    if (header) root.style.setProperty('--hdr', header.offsetHeight + 'px');
    var st = document.querySelector('[data-stage]');
    if (st) root.style.setProperty('--stage-h', st.offsetHeight + 'px');
  }
  setHdr(); window.addEventListener('resize', setHdr); window.addEventListener('load', setHdr);

  /* ---------- reel banner ---------- */
  var reel = document.querySelector('[data-reel]');
  var video = reel && reel.querySelector('video');
  var vwrap = reel && reel.querySelector('.reel-video');
  var playBtn = reel && reel.querySelector('[data-reel-play]');
  var durEl = reel && reel.querySelector('[data-reel-dur]');
  function fmt(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  if (video) {
    video.addEventListener('loadedmetadata', function () { if (durEl && isFinite(video.duration)) durEl.textContent = fmt(video.duration); });
    var start = function () { video.muted = true; video.controls = true; vwrap.classList.add('is-playing'); var p = video.play(); if (p && p.catch) p.catch(function () {}); };
    playBtn.addEventListener('click', start);
    video.addEventListener('click', function () { if (!video.controls) start(); });
  }

  /* banner dims as the grid sheet slides over it; pause when fully covered */
  var stage = document.querySelector('[data-stage]');
  var sheet = document.querySelector('[data-sheet]');
  var work = document.querySelector('.work-c');
  var ticking = false;
  function update() {
    ticking = false;
    if (!stage || !sheet) return;
    var s = stage.getBoundingClientRect(), t = sheet.getBoundingClientRect();
    var cover = Math.max(0, Math.min(1, (s.bottom - t.top) / Math.max(1, s.height)));
    work.style.setProperty('--cover', cover.toFixed(3));
    reel.style.setProperty('--cover', cover.toFixed(3));
    if (cover > 0.97 && video && !video.paused) video.pause();
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  /* ---------- project modal ---------- */
  var dataEl = document.getElementById('work-data');
  var pm = document.querySelector('[data-pm]');
  if (!dataEl || !pm) return;
  var DATA = JSON.parse(dataEl.textContent);
  var stageEl = pm.querySelector('[data-pm-stage]');
  var thumbsEl = pm.querySelector('[data-pm-thumbs]');
  var textEl = pm.querySelector('[data-pm-text]');
  var titleEl = pm.querySelector('[data-pm-title]');
  var creditEl = pm.querySelector('[data-pm-credit]');
  var cur = null, idx = 0, lastFocus = null;
  var PLAY = '<span class="pm-vbadge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l12-7z"/></svg></span>';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function linkify(s) {
    return esc(s).replace(/(https?:\/\/[^\s)]+|www\.[^\s)]+)/g, function (u) {
      var href = /^www\./.test(u) ? 'http://' + u : u;
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    });
  }
  function thumbSrc(m) { return m.t === 'yt' ? 'https://img.youtube.com/vi/' + encodeURIComponent(m.id) + '/mqdefault.jpg' : m.src; }

  function show(i) {
    var list = cur.media; idx = (i + list.length) % list.length;
    var m = list[idx];
    stageEl.innerHTML = '';
    if (m.t === 'yt') {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube.com/embed/' + encodeURIComponent(m.id) + '?autoplay=1&mute=1&rel=0';
      f.title = cur.title + ' — video';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.allowFullscreen = true;
      stageEl.appendChild(f);
    } else {
      var im = document.createElement('img');
      im.src = m.src; im.alt = cur.title; im.decoding = 'async';
      stageEl.appendChild(im);
    }
    Array.prototype.forEach.call(thumbsEl.children, function (b, n) { b.setAttribute('aria-current', n === idx ? 'true' : 'false'); });
  }

  function open(key, trigger) {
    cur = DATA[key]; if (!cur) return;
    lastFocus = trigger;
    titleEl.textContent = cur.title;
    creditEl.textContent = cur.credit || ''; creditEl.hidden = !cur.credit;
    thumbsEl.innerHTML = '';
    cur.media.forEach(function (m, n) {
      var b = document.createElement('button'); b.type = 'button';
      b.setAttribute('aria-label', (m.t === 'yt' ? 'Video ' : 'Image ') + (n + 1));
      b.innerHTML = '<img loading="lazy" decoding="async" alt="" src="' + esc(thumbSrc(m)) + '">' + (m.t === 'yt' ? PLAY : '');
      var ti = b.querySelector('img'); ti.addEventListener('error', function () { b.classList.add('no-thumb'); ti.remove(); });
      b.addEventListener('click', function () { show(n); });
      thumbsEl.appendChild(b);
    });
    var html = '';
    (cur.text || []).forEach(function (t) { html += '<p>' + linkify(t) + '</p>'; });
    if (cur.notes && cur.notes.length) html += '<ul>' + cur.notes.map(function (n) { return '<li>' + linkify(n) + '</li>'; }).join('') + '</ul>';
    textEl.innerHTML = html;
    pm.classList.toggle('single', cur.media.length < 2);
    pm.hidden = false; document.body.classList.add('pm-open');
    show(0);
    pm.querySelector('.pm-close').focus();
  }
  function close() {
    pm.hidden = true; document.body.classList.remove('pm-open');
    stageEl.innerHTML = ''; /* unloads any video */
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var t = e.target instanceof Element ? e.target : null; if (!t) return;
    var tile = t.closest('[data-project]');
    if (tile) { open(tile.getAttribute('data-project'), tile); return; }
    if (t.closest('[data-pm-close]')) close();
    else if (t.closest('[data-pm-prev]')) show(idx - 1);
    else if (t.closest('[data-pm-next]')) show(idx + 1);
  });
  document.addEventListener('keydown', function (e) {
    if (pm.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'Tab') { /* keep focus inside the dialog */
      var f = pm.querySelectorAll('button:not([disabled]),a[href]');
      var vis = Array.prototype.filter.call(f, function (n) { return n.offsetParent !== null; });
      if (!vis.length) return;
      var first = vis[0], last = vis[vis.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();

/* hover previews: desktop pointer only, loaded lazily on first hover */
(function () {
  if (!window.matchMedia || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  Array.prototype.forEach.call(document.querySelectorAll('.tile .pv'), function (v) {
    var tile = v.closest('.tile'), timer = 0, hot = false;
    v.addEventListener('playing', function () { if (hot) tile.classList.add('is-pv'); });
    tile.addEventListener('mouseenter', function () {
      hot = true; clearTimeout(timer);
      if (!v.getAttribute('src')) { v.setAttribute('src', v.getAttribute('data-src')); v.preload = 'auto'; }
      v.muted = true; var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
    tile.addEventListener('mouseleave', function () {
      hot = false; tile.classList.remove('is-pv');
      timer = setTimeout(function () { if (!hot) { v.pause(); try { v.currentTime = 0; } catch (e) {} } }, 450);
    });
  });
})();
