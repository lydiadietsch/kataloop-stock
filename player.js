/**
 * Kataloop Stock – Bedienung der Kaufseite (Lydia, 21.11.2026), ab v4.0.0
 *
 * Alles Sichtbare ist nativ in Webflow gebaut (CMS-Vorlage „Stock-assets Template“,
 * Klassen kl-…, Navigator: „Video-Player (nur Video)“, „Lupe (Foto und Video)“,
 * „Detail-Ebene (Lupe)“). Was Webflow nicht kann, steht im Head-Code der Vorlage
 * (Masken der Blur-Ebenen, Touch, Vollbild). Dieses Skript schaltet nur Zustände um:
 *   is-on     – Leiste und Blur sichtbar (jedes Element einzeln, sonst greift backdrop-filter verspätet)
 *   is-hidden – Icons und Texte, die gerade nicht gelten
 *   is-open   – Detail-Ebene offen
 *   is-solo   – Lupe ohne Kamera-Symbol daneben
 * Bei Fotos entfernt es den Video-Player; die Lupe gilt für Foto und Video.
 * Bauen: esbuild player.js --minify --legal-comments=none --target=es2017 --outfile=player.min.js
 */
(function () {
  var card = document.querySelector('.card.cc-stock');
  if (!card || card.getAttribute('data-kl-ready')) return;
  card.setAttribute('data-kl-ready', '1');
  var q = function (s, root) { return (root || card).querySelector(s); };
  var qa = function (s, root) { return Array.prototype.slice.call((root || card).querySelectorAll(s)); };
  var v = q('video.image.cc-purchase');
  var isVideo = !!v;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var show = function (el, on) { if (el) el.classList.toggle('is-hidden', !on); };
  function play() { var r = v.play(); if (r && r.catch) r.catch(function () {}); }

  // A click on the picture itself does nothing any more (no Webflow zoom, no pause): only the controls act.
  card.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.image.cc-purchase')) e.stopPropagation(); }, true);

  // ---------- Lupe: Foto und Video ----------
  var pill = q('[data-kl=zoom]'), layer = q('[data-kl=zoomlayer]');
  var zImg = q('.cc-purchase-zoom img'), zSrc = zImg && (zImg.currentSrc || zImg.getAttribute('src'));
  var zoomOpen = false, wasPlaying = false;
  function zoomTexts() {
    var type = isVideo ? 'video' : 'photo', st = zoomOpen ? 'out' : 'in', label = '';
    qa('[data-kl-type]', pill).forEach(function (t) {
      var on = t.getAttribute('data-kl-type') === type && t.getAttribute('data-kl-state') === st;
      show(t, on);
      if (on && t.classList.contains('is-long')) label = t.textContent.trim();
    });
    show(q('[data-kl=icon-zoom-in]', pill), !zoomOpen);
    show(q('[data-kl=icon-zoom-out]', pill), zoomOpen);
    pill.setAttribute('aria-pressed', zoomOpen ? 'true' : 'false');
    if (label) pill.setAttribute('aria-label', label);
    fitPill();
  }
  // The pill opens to exactly the width of its current text (CSS variable --kl-open), not to a
  // large maximum: otherwise the ease is spent on empty width and the opening stops abruptly.
  function fitPill() { if (pill) pill.style.setProperty('--kl-open', pill.scrollWidth + 'px'); }
  window.addEventListener('resize', function () { if (pill) fitPill(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (pill) fitPill(); });
  // The zoom photo loads ahead (on hover or focus of the magnifier, on touch devices shortly after
  // the page) and the layer fades in only once it is decoded, so it never appears half-loaded.
  var zEl = layer && q('[data-kl=zoomimg]', layer), zReady = null, wantOpen = false;
  function loadZoom() {
    if (zReady || !zEl) return zReady;
    zEl.removeAttribute('loading'); zEl.setAttribute('decoding', 'async');
    zEl.setAttribute('alt', (zImg && zImg.getAttribute('alt')) || '');
    zReady = new Promise(function (ok) {
      var done = function () { (zEl.decode ? zEl.decode() : Promise.resolve()).catch(function () {}).then(ok); };
      zEl.addEventListener('load', done, { once: true }); zEl.addEventListener('error', ok, { once: true });
      zEl.setAttribute('src', zSrc);
      if (zEl.complete && zEl.naturalWidth) done();
    });
    return zReady;
  }
  function showLayer(open) {
    zoomOpen = open;
    layer.classList.toggle('is-open', open);
    layer.setAttribute('aria-hidden', open ? 'false' : 'true');
    zoomTexts();
  }
  function setZoom(open) {
    wantOpen = open;
    if (!open) { pill.classList.remove('is-loading'); showLayer(false); if (isVideo && wasPlaying) play(); return; }
    if (isVideo) { wasPlaying = !v.paused; v.pause(); }
    var slow = setTimeout(function () { pill.classList.add('is-loading'); }, 120);
    var give = new Promise(function (ok) { setTimeout(ok, 6000); }); // do not hang if the file is missing
    Promise.race([loadZoom(), give]).then(function () {
      clearTimeout(slow); pill.classList.remove('is-loading');
      if (wantOpen) showLayer(true);
    });
  }
  if (pill && layer && zSrc) {
    var cam = q('.stock-icon-wrapper');
    var camShown = !!cam && getComputedStyle(cam).display !== 'none' && qa('img', cam).some(function (i) { return i.offsetWidth > 0; });
    pill.classList.toggle('is-solo', !camShown);
    zoomTexts();
    pill.addEventListener('pointerenter', loadZoom); pill.addEventListener('focus', loadZoom);
    if (window.matchMedia && matchMedia('(hover: none)').matches) {
      var later = function () { setTimeout(loadZoom, 1500); };
      document.readyState === 'complete' ? later() : window.addEventListener('load', later, { once: true });
    }
    pill.addEventListener('click', function (e) { e.stopPropagation(); setZoom(!(zoomOpen || wantOpen)); });
    pill.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoom(!(zoomOpen || wantOpen)); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (zoomOpen || wantOpen)) setZoom(false); });
  } else {
    if (pill) pill.remove();
    if (layer) layer.remove();
  }

  // ---------- Video-Player: nur Video ----------
  var player = q('[data-kl=player]');
  if (!isVideo) { if (player) player.remove(); return; }
  if (!player) return;
  if (reduce) { v.removeAttribute('autoplay'); v.pause(); }
  var fades = qa('[data-kl-fade]', player), big = q('[data-kl=big]', player), toggle = q('[data-kl=toggle]', player);
  var track = q('[data-kl=track]', player), fill = q('[data-kl=fill]', player), knob = q('[data-kl=knob]', player);
  var time = q('[data-kl=time]', player), res = q('[data-kl=res]', player), full = q('[data-kl=full]', player);
  var bar = q('.kl-bar', player);
  // Labels for screen readers, in the language of the page (Webflow sets <html lang>). The
  // visible texts are localized in Webflow; these are the only words that live in the script.
  var EN = /^en/i.test(document.documentElement.lang || '');
  var T = EN ? { play: 'Play', pause: 'Pause', full: 'Full screen', exitFull: 'Exit full screen', track: 'Timeline' }
             : { play: 'Abspielen', pause: 'Pause', full: 'Vollbild', exitFull: 'Vollbild beenden', track: 'Zeitleiste' };
  if (big) big.setAttribute('aria-label', T.play);
  if (track) track.setAttribute('aria-label', T.track);
  if (full) full.setAttribute('aria-label', T.full);
  var fmt = function (s) { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2); };
  // The last frame, not the end: setting currentTime to duration makes a looping video jump to frame 1.
  var FRAME = 1 / 30, end = function () { return Math.max(0, (v.duration || 0) - FRAME); };
  var active = false, dragP = null, starting = v.autoplay && !reduce, overBar = false, hideT;

  function setActive(on) { if (on === active) return; active = on; fades.forEach(function (el) { el.classList.toggle('is-on', on); }); }
  function paused() { return v.paused && dragP == null && !starting; }
  function wake() { setActive(true); clearTimeout(hideT); hideT = setTimeout(function () { if (!overBar && dragP == null && !paused()) setActive(false); }, 3500); }
  function state() {
    var p = paused();
    big.classList.toggle('is-on', p);
    show(q('[data-kl=icon-play]', toggle), v.paused);
    show(q('[data-kl=icon-pause]', toggle), !v.paused);
    toggle.setAttribute('aria-label', v.paused ? T.play : T.pause);
    if (p) { clearTimeout(hideT); setActive(true); }
  }
  function paint() {
    var p = dragP != null ? dragP : (v.duration ? Math.min(1, v.currentTime / end()) : 0);
    fill.style.width = (p * 100) + '%'; knob.style.left = (p * 100) + '%';
    var t = dragP != null ? dragP * end() : v.currentTime;
    time.textContent = fmt(t) + ' / ' + fmt(v.duration);
    track.setAttribute('aria-valuenow', Math.round(t)); track.setAttribute('aria-valuemax', Math.round(v.duration || 0));
  }
  // Delivered width from the page ("(3840×2160px)"), rounded to whole K; Full HD around 1920, below HD.
  function meta() {
    var m = document.body.innerText.match(/\((\d{3,5})\s*[x×]\s*(\d{3,5})px\)/) || [], W = +(m[1] || v.videoWidth || 0);
    if (W) res.textContent = W >= 2500 ? Math.round(W / 1000) + 'K' : W >= 1900 ? 'Full HD' : 'HD';
  }
  var raf = 0; function tick() { paint(); raf = !v.paused ? requestAnimationFrame(tick) : 0; }
  function flip(e) { if (e) e.stopPropagation(); v.paused ? play() : v.pause(); wake(); }

  // Visible while the pointer moves over the media, 3.5 s after it stops; always while over the bar, dragging or paused.
  card.addEventListener('pointermove', function (e) { if (e.pointerType !== 'touch') wake(); });
  card.addEventListener('pointerleave', function () { if (dragP == null && !paused()) { clearTimeout(hideT); setActive(false); } });
  bar.addEventListener('pointerover', function () { overBar = true; wake(); });
  bar.addEventListener('pointerout', function (e) { if (!e.relatedTarget || !bar.contains(e.relatedTarget)) { overBar = false; wake(); } });
  player.addEventListener('focusin', wake);

  toggle.addEventListener('click', flip); big.addEventListener('click', flip);
  [toggle, big, full].forEach(function (b) { b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } }); });
  v.addEventListener('playing', function () { if (starting) { starting = false; state(); } });
  v.addEventListener('play', function () { if (!v.loop) { v.loop = true; if (v.currentTime >= end() - 0.001) v.currentTime = 0; } state(); if (!raf) tick(); });
  v.addEventListener('pause', function () { state(); paint(); });
  v.addEventListener('loadedmetadata', function () { meta(); paint(); });
  v.addEventListener('timeupdate', function () { if (!raf) paint(); });

  // Seeking: one seek at a time, always to the latest position; the loop is off while scrubbing.
  var want = null, seeking = false, resume = false;
  function next() { if (want == null) return; seeking = true; var t = want; want = null; v.currentTime = t; }
  function seekTo(t) { want = Math.min(end(), Math.max(0, t)); if (!seeking) next(); }
  v.addEventListener('seeked', function () { seeking = false; next(); if (!raf) paint(); });
  function pAt(x) { var r = track.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)); }
  track.addEventListener('pointerdown', function (e) {
    e.preventDefault(); try { track.setPointerCapture(e.pointerId); } catch (err) {}
    knob.classList.add('is-on'); resume = !v.paused; v.pause(); v.loop = false;
    dragP = pAt(e.clientX); paint(); seekTo(dragP * end());
  });
  track.addEventListener('pointermove', function (e) { if (dragP == null) return; dragP = pAt(e.clientX); paint(); seekTo(dragP * end()); });
  function release() {
    if (dragP == null) return; var t = dragP * end(); dragP = null; knob.classList.remove('is-on'); seekTo(t);
    state(); paint(); if (resume && t < end() - 0.01) play(); wake();
  }
  track.addEventListener('pointerup', release); track.addEventListener('pointercancel', release);
  track.addEventListener('keydown', function (e) { var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); seekTo(v.currentTime + d); } if (e.key === ' ') { e.preventDefault(); flip(); } });

  // Fullscreen: the whole card (so the bar stays), else the video, else iOS' own player.
  full.addEventListener('click', function (e) {
    e.stopPropagation(); var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    var go = function (n) { var f = n.requestFullscreen || n.webkitRequestFullscreen; if (!f) return Promise.reject(); try { var r = f.call(n); return r && r.then ? r : Promise.resolve(); } catch (err) { return Promise.reject(err); } };
    go(card).catch(function () { return go(v); }).catch(function () { if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); });
  });
  document.addEventListener('fullscreenchange', function () {
    var on = !!document.fullscreenElement;
    show(q('[data-kl=icon-expand]', full), !on); show(q('[data-kl=icon-shrink]', full), on);
    full.setAttribute('aria-label', on ? T.exitFull : T.full);
  });

  if (starting) { var r0 = v.play(); if (r0 && r0.catch) r0.catch(function () { starting = false; state(); }); setTimeout(function () { if (starting && v.paused) { starting = false; state(); } }, 2500); }
  if (v.readyState >= 1) { meta(); paint(); }
  state(); if (!v.paused) tick();
})();
