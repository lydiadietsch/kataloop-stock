/*!
 * kataloop-stock.js — Stock-Collection (Fotos & Videos)
 * -----------------------------------------------------------------------------
 * Ein Skript für ALLE Seiten mit einer Finsweet-CMS-Liste (Stockfotos/-Videos,
 * Stockmedien-Teaser, Kategorie-Seiten). Es ersetzt:
 *
 *   - das Hover-Video-Snippet
 *   - das „URL-Filter übernehmen"-Snippet
 *   - den history.replaceState-Blocker
 *   - das Finsweet-Attributes-v2-Skript (auf diesen Seiten wirkungslos)
 *
 * Was es tut:
 *   1. LADEZEIT  — lädt Finsweet (cmsfilter + cmsload) erst, wenn es gebraucht
 *      wird. Ohne das zieht die Seite beim Aufruf den KOMPLETTEN Katalog als
 *      HTML nach (gemessen: 30 Anfragen / ~1,9 MB), bevor überhaupt etwas
 *      passiert. Jetzt: Seite 1 sofort sichtbar, der Rest kommt im Leerlauf
 *      oder bei der ersten Filter-/Seiten-Interaktion.
 *   2. HOVER-VIDEO — bindet sich an JEDE Karte, auch an nachgeladene und
 *      neu gefilterte (das war der Fehler der alten Fassung: einmalig beim
 *      DOMContentLoaded gebunden → nach Filter/Seitenwechsel tot).
 *   3. MOBILE — auf Touch-Geräten spielt das Video der Karte, die gerade
 *      mittig im Bild steht (immer nur EINES gleichzeitig).
 *   4. SCROLL — springt NUR beim Blättern nach oben, nicht beim Filtern,
 *      und mit korrektem Abstand unter der (mobilen) Kopfleiste.
 *   5. URL — hält ?kategorie=…&typ=…&lizenz=…&tags=… und die Filter synchron,
 *      in beide Richtungen, auch bei Zurück/Vorwärts im Browser.
 *
 * Einbindung (Webflow → Seiten- oder Site-Einstellungen, VOR </body>):
 *   <script src="https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v1.0.0/stock.min.js"></script>
 * Sonst nichts mehr — die alten Snippets ersatzlos löschen.
 *
 * Das Skript prüft selbst, ob die Seite eine Finsweet-Liste hat. Auf allen
 * anderen Seiten tut es nichts (kein Fehler, keine Kosten).
 */
(function () {
  "use strict";

  /* ───────────────────────── Einstellungen ───────────────────────── */
  var CFG = {
    // Finsweet v1 — wird bei Bedarf nachgeladen (Reihenfolge zählt)
    fsScripts: [
      "https://cdn.jsdelivr.net/npm/@finsweet/attributes-cmsfilter@1/cmsfilter.js",
      "https://cdn.jsdelivr.net/npm/@finsweet/attributes-cmsload@1/cmsload.js"
    ],
    idleDelay: 1200,          // ms nach dem load-Event, dann Finsweet im Leerlauf holen
    // Filter, die in der URL auftauchen dürfen: URL-Parameter → fs-cmsfilter-field
    urlFields: { kategorie: "kategorie", typ: "typ", lizenz: "lizenz" },
    searchParam: "tags",      // Suchfeld ↔ ?tags=
    searchId: "Search",
    scrollExtra: 12,          // zusätzlicher Abstand unter der Kopfleiste (px)
    videoSelector: ".hover-video",
    linkSelector: ".u-link-cover",
    cardSelector: ".card",
    mobileAutoplay: true,     // Touch: Video der mittigen Karte spielen
    preloadMargin: "600px"    // so früh werden Video-Metadaten geholt
  };

  /* ───────────────────────── kleine Helfer ───────────────────────── */
  var d = document;
  var qs = function (s, r) { return (r || d).querySelector(s); };
  var qsa = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var isTouch = !window.matchMedia("(hover: hover)").matches;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  function fire(el, type) { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) {} }
  function idle(fn, delay) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: delay + 2000 });
    else setTimeout(fn, delay);
  }

  /* Gibt es hier überhaupt eine CMS-Liste? Sonst sofort raus. */
  var listEl = qs('[fs-cmsfilter-element="list"], [fs-cmsload-element="list"]');
  if (!listEl) return;

  /* ═══════════════════════ 1) Finsweet nachladen ═══════════════════════
     Finsweet startet sofort und lädt bei „pagination + filter" ALLE
     CMS-Seiten im Hintergrund. Das ist der mit Abstand größte Kostenpunkt
     der Seite. Wir verschieben ihn hinter den ersten Bildaufbau. */
  var fsStarted = false;

  function startFinsweet(grund) {
    if (fsStarted) return;
    fsStarted = true;
    if (window.__klStockDebug) console.log("[kl-stock] Finsweet laden:", grund);

    /* Zwei Finsweet-Automatiken abschalten, BEVOR die Skripte laufen —
       wir machen beides selbst und kontrolliert:
         showquery   → Finsweet schreibt/liest die URL nach eigenem Schema
         scroll-anchor → Finsweet scrollt nach JEDEM Rendern (auch beim Filtern) */
    qsa("[fs-cmsfilter-showquery]").forEach(function (el) { el.removeAttribute("fs-cmsfilter-showquery"); });
    qsa('[fs-cmsload-element="scroll-anchor"]').forEach(function (el) {
      el.setAttribute("data-kl-anchor", "");            // merken: das ist unser Sprungziel
      el.removeAttribute("fs-cmsload-element");
    });

    CFG.fsScripts.forEach(function (src) {
      var s = d.createElement("script");
      s.src = src;
      s.async = false;                                   // Reihenfolge beibehalten
      d.head.appendChild(s);
    });
  }

  /* Sofort, wenn die URL schon einen Filter oder eine Seite mitbringt … */
  var params = new URLSearchParams(location.search);
  var hasFilterParam = Object.keys(CFG.urlFields).some(function (p) { return params.has(p); }) ||
                       params.has(CFG.searchParam) ||
                       Array.prototype.some.call(params.keys(), function (k) { return /_page$/.test(k); });

  /* … sonst bei der ersten Berührung von Filter, Suche oder Blätter-Leiste … */
  function armInteraction() {
    var zonen = ['[fs-cmsfilter-element="filters"]', ".pagination-wrapper", ".w-pagination-wrapper", "#" + CFG.searchId];
    var handler = function (e) {
      if (zonen.some(function (z) { return e.target.closest && e.target.closest(z); })) startFinsweet("Interaktion");
    };
    ["pointerdown", "keydown", "focusin"].forEach(function (t) {
      d.addEventListener(t, handler, { capture: true, passive: true });
    });
  }

  if (hasFilterParam) startFinsweet("URL-Parameter");
  else {
    armInteraction();
    /* … und spätestens im Leerlauf, damit späteres Filtern sofort reagiert. */
    if (d.readyState === "complete") idle(function () { startFinsweet("Leerlauf"); }, CFG.idleDelay);
    else window.addEventListener("load", function () {
      setTimeout(function () { idle(function () { startFinsweet("Leerlauf"); }, CFG.idleDelay); }, CFG.idleDelay);
    });
  }

  /* ═══════════════════════ 2) Hover-Video ═══════════════════════
     Wichtig gegenüber der alten Fassung:
       - erneut aufrufbar (Filter/Blättern erzeugen NEUE Karten)
       - data-kl-hover verhindert doppelte Listener
       - spielt auch, wenn die Metadaten noch nicht da sind (canplay)
       - Metadaten werden erst geholt, wenn die Karte in Sichtnähe kommt */
  var metaObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var v = en.target;
          if (v.preload !== "metadata") v.preload = "metadata";
          metaObserver.unobserve(v);
        });
      }, { rootMargin: CFG.preloadMargin })
    : null;

  function prepareVideo(v) {
    v.muted = true;                       // Property UND Attribut (Firefox/iOS)
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.removeAttribute("controls");
    if (metaObserver && !saveData) {      // spart Anfragen beim ersten Aufbau
      v.preload = "none";
      metaObserver.observe(v);
    } else {
      v.preload = "metadata";
    }
  }

  function playVideo(v) {
    var go = function () {
      var p = v.play();
      if (p && p.catch) p.catch(function () {
        v.muted = true; v.setAttribute("muted", "");
        var again = v.play();
        if (again && again.catch) again.catch(function () {});
      });
    };
    if (v.readyState >= 2) { go(); return; }
    var once = function () { v.removeEventListener("canplay", once); go(); };
    v.addEventListener("canplay", once, { once: true });
    if (v.preload === "none") v.preload = "metadata";
    if (v.readyState < 2) v.load();
  }

  function stopVideo(v) {
    try { v.pause(); v.currentTime = 0; } catch (e) {}
  }

  function initHoverVideo(scope) {
    qsa(CFG.linkSelector, scope || d).forEach(function (link) {
      if (link.dataset.klHover) return;
      link.dataset.klHover = "1";
      var card = link.closest(CFG.cardSelector);
      if (!card) return;
      var v = qs(CFG.videoSelector, card);
      if (!v) return;
      prepareVideo(v);
      if (reduced) return;                // kein automatisches Abspielen
      if (!isTouch) {
        link.addEventListener("mouseenter", function () { playVideo(v); });
        link.addEventListener("mouseleave", function () { stopVideo(v); });
        link.addEventListener("focusin", function () { playVideo(v); });
        link.addEventListener("focusout", function () { stopVideo(v); });
      }
    });
    if (isTouch) refreshMobileVideos(scope);
  }

  /* ═══════════════════════ 3) Mobile: mittige Karte spielt ═══════════════════════
     Auf Touch-Geräten gibt es kein Hover. Statt „Antippen startet" (verschluckt
     den ersten Tap auf den Link) spielt automatisch das Video, das gerade am
     weitesten mittig im Bild steht — immer nur eines. */
  var mobileObserver = null;
  var mobileCurrent = null;

  function refreshMobileVideos(scope) {
    if (!CFG.mobileAutoplay || reduced || saveData || !("IntersectionObserver" in window)) return;
    if (!mobileObserver) {
      mobileObserver = new IntersectionObserver(pickMobileVideo, {
        threshold: [0, 0.35, 0.6, 0.9],
        rootMargin: "-15% 0px -15% 0px"       // „mittiger Streifen" des Bildschirms
      });
    }
    qsa(CFG.videoSelector, scope || d).forEach(function (v) {
      if (v.dataset.klMobile) return;
      v.dataset.klMobile = "1";
      mobileObserver.observe(v);
    });
  }

  function pickMobileVideo() {
    var mitte = window.innerHeight / 2;
    var best = null, bestDist = Infinity;
    qsa(CFG.videoSelector).forEach(function (v) {
      var r = v.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      var sichtbar = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (sichtbar < r.height * 0.5) return;             // mindestens halb im Bild
      var dist = Math.abs((r.top + r.bottom) / 2 - mitte);
      if (dist < bestDist) { bestDist = dist; best = v; }
    });
    if (best === mobileCurrent) return;
    if (mobileCurrent) stopVideo(mobileCurrent);
    mobileCurrent = best;
    if (best) playVideo(best);
  }

  /* ═══════════════════════ 4) Scrollen nur beim Blättern ═══════════════════════ */
  var scrollNachRender = false;

  function headerHoehe() {
    /* Höhe einer fixierten/klebenden Kopfleiste messen — auf Mobile ist sie
       oft höher/anders als auf Desktop, deshalb messen statt raten. */
    var h = 0;
    qsa("header, .navbar, [data-nav], .w-nav").forEach(function (el) {
      var st = getComputedStyle(el);
      if (st.position !== "fixed" && st.position !== "sticky") return;
      var r = el.getBoundingClientRect();
      if (r.top <= 1 && r.height > h && r.height < window.innerHeight * 0.4) h = r.height;
    });
    return h;
  }

  function scrollToList() {
    var ziel = qs("[data-kl-anchor]") || listEl.closest("section") || listEl;
    /* Erst NACH dem Rendern messen: die Liste hat gerade ihre Höhe geändert.
       Zwei Frames warten, sonst springt man auf eine veraltete Position —
       genau der Fehler auf Mobile. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var y = ziel.getBoundingClientRect().top + window.pageYOffset - headerHoehe() - CFG.scrollExtra;
        window.scrollTo({ top: Math.max(0, y), behavior: reduced ? "auto" : "smooth" });
      });
    });
  }

  d.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(
      '[fs-cmsload-element="page-button"], .w-pagination-next, .w-pagination-previous, .pagination a'
    );
    if (!t) return;
    startFinsweet("Blättern");
    scrollNachRender = true;
    /* Notnagel: kommt binnen 900 ms keine Render-Meldung (andere Finsweet-
       Instanzart, Seite schon im Cache), trotzdem nach oben. */
    setTimeout(function () {
      if (scrollNachRender) { scrollNachRender = false; scrollToList(); }
    }, 900);
  }, true);

  /* ═══════════════════════ 5) URL ↔ Filter ═══════════════════════
     Ein Weg rein (Seitenaufruf, Zurück-Taste), ein Weg raus (Filterwechsel).
     Kein history-Blocker mehr: der hat Finsweet die eigene Zustandsführung
     zerschossen (verschwundene Blätter-Buttons, halb geladene Seiten). */

  /* Ein Filter-Steuerelement = Webflow-Checkbox-Label mit verstecktem
     [fs-cmsfilter-field="…"]-Element, das den Wert trägt. */
  function filterSteuerungen(feld) {
    var form = qs('[fs-cmsfilter-element="filters"]') || d;
    return qsa('[fs-cmsfilter-field="' + feld + '"]', form)
      .map(function (wert) {
        var label = wert.closest("label");
        var input = label && label.querySelector('input[type="checkbox"], input[type="radio"]');
        return input ? { input: input, label: label, wert: (wert.textContent || "").trim().toLowerCase() } : null;
      })
      .filter(Boolean);
  }

  function setzeCheckbox(steuerung, an) {
    if (steuerung.input.checked === an) return false;
    steuerung.input.checked = an;
    /* Webflow zeichnet die Box als DIV daneben — ohne diese Klasse sieht der
       Filter „aus", obwohl er aktiv ist. */
    var box = steuerung.label.querySelector(".w-checkbox-input");
    if (box) box.classList.toggle("w--redirected-checked", an);
    fire(steuerung.input, "input");
    fire(steuerung.input, "change");
    return true;
  }

  var schreibsperre = false;

  function ausUrlUebernehmen() {
    var p = new URLSearchParams(location.search);
    var geaendert = false;
    schreibsperre = true;

    Object.keys(CFG.urlFields).forEach(function (param) {
      var feld = CFG.urlFields[param];
      var gewuenscht = (p.get(param) || "").split(",")
        .map(function (v) { return v.trim().toLowerCase(); })
        .filter(Boolean);
      filterSteuerungen(feld).forEach(function (s) {
        geaendert = setzeCheckbox(s, gewuenscht.indexOf(s.wert) !== -1) || geaendert;
      });
    });

    var suche = d.getElementById(CFG.searchId);
    var suchwert = p.get(CFG.searchParam) || "";
    if (suche && suche.value !== suchwert) {
      suche.value = suchwert;
      fire(suche, "input"); fire(suche, "change");
      geaendert = true;
    }

    schreibsperre = false;
    return geaendert;
  }

  function inUrlSchreiben() {
    if (schreibsperre) return;
    var p = new URLSearchParams(location.search);
    /* Finsweet-eigene Parameter nicht anfassen (Seitenzahl), unsere neu setzen. */
    Object.keys(CFG.urlFields).forEach(function (param) {
      var werte = filterSteuerungen(CFG.urlFields[param])
        .filter(function (s) { return s.input.checked; })
        .map(function (s) { return s.wert; });
      if (werte.length) p.set(param, werte.join(","));
      else p.delete(param);
    });
    var suche = d.getElementById(CFG.searchId);
    if (suche && suche.value.trim()) p.set(CFG.searchParam, suche.value.trim());
    else p.delete(CFG.searchParam);

    var neu = location.pathname + (p.toString() ? "?" + p.toString() : "") + location.hash;
    if (neu !== location.pathname + location.search + location.hash) {
      history.replaceState(history.state, "", neu);
    }
  }

  var schreibTimer = null;
  d.addEventListener("change", function (e) {
    if (!e.target.closest || !e.target.closest('[fs-cmsfilter-element="filters"]')) return;
    startFinsweet("Filterwechsel");
    clearTimeout(schreibTimer);
    schreibTimer = setTimeout(inUrlSchreiben, 60);
  }, true);
  d.addEventListener("input", function (e) {
    if (!e.target || e.target.id !== CFG.searchId) return;
    startFinsweet("Suche");
    clearTimeout(schreibTimer);
    schreibTimer = setTimeout(inUrlSchreiben, 300);     // Tippen abwarten
  }, true);

  window.addEventListener("popstate", function () {
    if (!fsStarted) startFinsweet("Zurück-Taste");
    ausUrlUebernehmen();
  });

  /* ═══════════════════════ Anbindung an Finsweet ═══════════════════════ */
  var hydriert = false;

  function nachRender(scope) {
    initHoverVideo(scope);
    if (scrollNachRender) { scrollNachRender = false; scrollToList(); }
  }

  window.fsAttributes = window.fsAttributes || [];
  window.fsAttributes.push(["cmsfilter", function (instanzen) {
    instanzen.forEach(function (inst) {
      if (inst._klBound) return;
      inst._klBound = true;
      var li = inst.listInstance;
      if (li && li.on) li.on("renderitems", function () {
        nachRender((li.list || li.listElement || d));
      });
    });
    if (!hydriert) {
      hydriert = true;
      /* Filter aus der URL setzen und einmal anwenden. */
      if (ausUrlUebernehmen()) {
        setTimeout(function () {
          instanzen.forEach(function (i) { if (i.applyFilters) i.applyFilters(false); });
        }, 0);
      }
    }
  }]);
  window.fsAttributes.push(["cmsload", function (instanzen) {
    instanzen.forEach(function (inst) { nachRender(inst.list || inst.listElement || d); });
    /* Nachgeladene Seiten kommen als neue Items: erneut binden. */
    instanzen.forEach(function (inst) {
      if (inst._klLoadBound || !inst.on) return;
      inst._klLoadBound = true;
      inst.on("renderitems", function () { nachRender(inst.list || inst.listElement || d); });
    });
  }]);

  /* Sicherheitsnetz: auch ohne Finsweet (z. B. Teaser-Seiten ohne Filter)
     sollen Hover-Videos funktionieren, und ein DOM-Wechsel darf uns nicht
     entkommen. Der Observer ist billig — er reagiert nur auf childList. */
  function boot() {
    initHoverVideo(d);
    if ("MutationObserver" in window) {
      /* Der Observer ist zugleich das Sicherheitsnetz fürs Scrollen: Finsweet
         meldet „renderitems" nicht bei jeder Instanz-Art zuverlässig, eine
         DOM-Änderung in der Liste dagegen schon. Beides läuft über nachRender(),
         das doppelte Aufrufe selbst abfängt (data-kl-hover / scrollNachRender). */
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) { nachRender(listEl); break; }
        }
      });
      mo.observe(listEl, { childList: true, subtree: true });
    }
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* Für die Fehlersuche: window.__klStockDebug = true; vor dem Skript setzen. */
  window.klStock = {
    version: "1.0.0",
    startFinsweet: startFinsweet,
    initHoverVideo: initHoverVideo,
    ausUrlUebernehmen: ausUrlUebernehmen,
    inUrlSchreiben: inUrlSchreiben,
    zustand: function () {
      return {
        finsweetGestartet: fsStarted,
        karten: qsa(CFG.linkSelector).length,
        gebunden: qsa(CFG.linkSelector + "[data-kl-hover]").length,
        videos: qsa(CFG.videoSelector).length,
        touch: isTouch
      };
    }
  };
})();
