/*!
 * kataloop-stock.js v2.0.0
 * Eigene Filter-, Blätter- und Video-Logik für die Stock-Collection.
 * -----------------------------------------------------------------------------
 * Ersetzt vollständig:  attributes@2, attributes-cmsfilter@1, attributes-cmsload@1
 *                       + die drei eigenen Snippets (History-Blocker,
 *                         URL-Übernahme, Hover-Video)
 * Keine externe Abhängigkeit. Eine Datei, ~9 KB.
 *
 * WARUM EIGENER CODE STATT FINSWEET
 * Finsweet lädt für „Blättern + Filtern" beim Seitenaufruf ALLE CMS-Seiten
 * nach — auf /stockfotos-videos gemessen: 30 Anfragen, ~1,9 MB, jede ~730 ms,
 * bevor überhaupt gefiltert wurde. Diese Engine lädt bedarfsgerecht:
 *   - nur blättern      → genau EINE Seite pro Klick (~64 KB)
 *   - filtern/suchen    → dann erst der ganze Katalog, einmal, mit Ladeanzeige
 * Dazu volle Kontrolle über URL, Scrollen und Video.
 *
 * MARKUP
 * Es werden die vorhandenen Attribute weiterverwendet, damit im Designer
 * NICHTS umgebaut werden muss. Jedes Attribut hat ein neutrales Gegenstück,
 * falls du später umbenennen willst:
 *   fs-cmsfilter-element="list"     →  data-kl-list        (Collection-Wrapper)
 *   fs-cmsfilter-element="filters"  →  data-kl-filters     (Filter-Formular)
 *   fs-cmsfilter-field="kategorie"  →  data-kl-field="…"   (Wert-Träger)
 *   fs-cmsload-element="page-button"→  data-kl-page-button (Vorlage für Zahlen)
 *   fs-cmsload-element="page-dots"  →  data-kl-page-dots
 *   fs-cmsload-element="loader"     →  data-kl-loader
 * Beide Schreibweisen funktionieren gleichzeitig.
 *
 * EINBINDUNG (Webflow, vor </body>) — sonst nichts:
 *   <script src="https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v2.0.0/stock.min.js"></script>
 *
 * Ereignis für eigene Skripte (z. B. das Grid-Skript):
 *   window.addEventListener("kl:rendered", e => e.detail.items)
 */
(function () {
  "use strict";

  var CFG = {
    suchFeldId: "Search",          // Eingabefeld der Volltextsuche
    urlFelder: ["kategorie", "typ", "lizenz", "ausrichtung"], // Filter, die in die URL dürfen
    suchParam: "tags",             // Suchbegriff ↔ ?tags=
    randSeiten: 1,                 // wie viele Zahlen um die aktuelle Seite
    scrollExtra: 12,               // Abstand unter der Kopfleiste
    ladeGleichzeitig: 4,           // parallele Seiten-Abrufe
    aktivKlasse: "w--current",     // Klasse der aktiven Seitenzahl
    videoVorladen: "600px"         // ab dieser Nähe Video-Metadaten holen
  };

  var d = document;
  var qs = function (s, r) { return (r || d).querySelector(s); };
  var qsa = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var log = function () { if (window.__klStockDebug) console.log.apply(console, ["[kl-stock]"].concat([].slice.call(arguments))); };

  /* ── Grundelemente ─────────────────────────────────────────────── */
  var listWrap = qs('[fs-cmsfilter-element="list"], [fs-cmsload-element="list"], [data-kl-list]');
  if (!listWrap) return;                                  // keine Liste → nichts zu tun
  var itemsBox = qs(".w-dyn-items", listWrap) || listWrap;
  var filterForm = qs('[fs-cmsfilter-element="filters"], [data-kl-filters]');
  var suchFeld = d.getElementById(CFG.suchFeldId);
  var loader = qs('[fs-cmsload-element="loader"], [data-kl-loader]');
  var dotsTmpl = qs('[fs-cmsload-element="page-dots"], [data-kl-page-dots]');
  var btnTmpl = qs('[fs-cmsload-element="page-button"], [data-kl-page-button]');
  var zahlenBox = btnTmpl ? btnTmpl.parentElement : null;
  var weiterBtn = qs(".w-pagination-next");
  var zurueckBtn = qs(".w-pagination-previous");

  /* Finsweet-Automatiken abschalten, falls die Skripte doch noch irgendwo
     hängen: ohne diese Attribute fasst Finsweet die Liste nicht an. */
  qsa("[fs-cmsfilter-showquery], [fs-cmsload-mode], [fs-cmsload-resetix]").forEach(function (el) {
    el.removeAttribute("fs-cmsfilter-showquery");
    el.removeAttribute("fs-cmsload-mode");
    el.removeAttribute("fs-cmsload-resetix");
  });
  qsa('[fs-cmsload-element="scroll-anchor"]').forEach(function (el) {
    el.setAttribute("data-kl-anchor", "");
    el.removeAttribute("fs-cmsload-element");
  });

  /* ── Text-Normalisierung (Umlaute, Interpunktion) ──────────────── */
  function norm(s) {
    var t = (s || "").toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
    if (t.normalize) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");  // Akzente weg
    return t.replace(/[^a-z0-9]+/g, " ").trim();
  }

  /* ── Datenmodell ───────────────────────────────────────────────── */
  var seiten = {};            // Seitenzahl → Array von Item-Objekten
  var alleGeladen = false;    // wurden alle Seiten geholt?
  var ladeVersprechen = null;
  var seite = 1;
  var proSeite = 0;
  var gesamtSeiten = 1;
  var pagParam = "";          // z. B. "e19e26fd_page"

  function feldWerte(el) {
    var map = {};
    qsa("[fs-cmsfilter-field], [data-kl-field]", el).forEach(function (f) {
      var namen = (f.getAttribute("fs-cmsfilter-field") || f.getAttribute("data-kl-field") || "")
        .split(",").map(function (n) { return n.trim().toLowerCase(); }).filter(Boolean);
      var wert = (f.textContent || "").trim();
      if (!wert) return;
      namen.forEach(function (n) { (map[n] = map[n] || []).push(wert); });
    });
    return map;
  }

  function bauItem(el) {
    var felder = feldWerte(el);
    var such = [];
    for (var k in felder) such.push(felder[k].join(" "));
    var norm2 = {};
    for (var f in felder) norm2[f] = felder[f].map(function (v) { return v.trim().toLowerCase(); });
    return { el: el, felder: norm2, such: norm(such.join(" ")) };
  }

  /* Seite 1 steht bereits im HTML (gut für SEO und den ersten Aufbau). */
  seiten[1] = qsa(":scope > .w-dyn-item", itemsBox).map(bauItem);
  if (!seiten[1].length) seiten[1] = qsa(".w-dyn-item", itemsBox).map(bauItem);
  proSeite = seiten[1].length || 1;

  /* Seitenzahl + Parameter aus der vorhandenen Blätter-Leiste lesen. */
  (function ermittlePaginierung() {
    var href = (weiterBtn && weiterBtn.getAttribute("href")) || "";
    var m = href.match(/[?&]([^=]*_page)=(\d+)/);
    if (m) pagParam = m[1];
    var zahlen = qsa('[fs-cmsload-element="page-button"], [data-kl-page-button]')
      .map(function (b) { return parseInt(b.textContent.trim(), 10); })
      .filter(function (n) { return !isNaN(n); });
    qsa("a[href*='_page=']").forEach(function (a) {
      var mm = a.getAttribute("href").match(/[?&]([^=]*_page)=(\d+)/);
      if (mm) { pagParam = pagParam || mm[1]; zahlen.push(parseInt(mm[2], 10)); }
    });
    gesamtSeiten = zahlen.length ? Math.max.apply(null, zahlen) : 1;
    log("Paginierung:", pagParam, "Seiten:", gesamtSeiten, "pro Seite:", proSeite);
  })();

  /* ── Nachladen ─────────────────────────────────────────────────── */
  function ladeAnzeige(an) {
    if (loader) loader.style.display = an ? "" : "none";
    listWrap.setAttribute("aria-busy", an ? "true" : "false");
  }

  var hatWeiter = {};         // Seitenzahl → gibt es eine Folgeseite?

  function seiteHolen(n) {
    if (seiten[n]) return Promise.resolve(seiten[n]);
    if (!pagParam) return Promise.resolve([]);
    var u = new URL(location.href);
    u.searchParams.set(pagParam, String(n));
    return fetch(u.toString(), { credentials: "same-origin" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var box = qs('[fs-cmsfilter-element="list"] .w-dyn-items, [fs-cmsload-element="list"] .w-dyn-items, [data-kl-list] .w-dyn-items', doc);
        var items = box ? qsa(":scope > .w-dyn-item", box).map(function (el) { return bauItem(d.importNode(el, true)); }) : [];
        seiten[n] = items;
        hatWeiter[n] = !!qs(".w-pagination-next", doc);
        return items;
      })
      .catch(function (e) { log("Seite", n, "fehlgeschlagen", e); seiten[n] = []; hatWeiter[n] = false; return []; });
  }

  /* ── Wie viele Seiten gibt es? ──────────────────────────────────
     Webflow schreibt die Gesamtzahl NICHT ins HTML (kein rel="next", und
     Range-Anfragen beantwortet der CDN mit dem vollen Dokument). Statt wie
     Finsweet alle 30 Seiten zu holen, suchen wir das Ende: 2, 4, 8, 16, 32 …
     bis eine Seite leer ist, danach halbieren. Das sind ~6-9 Abrufe statt 30,
     sie laufen im Hintergrund, und jede geholte Seite bleibt im Speicher —
     für späteres Blättern oder Filtern ist sie damit schon da.
     Das Ergebnis liegt in der sessionStorage: pro Sitzung also EINMAL. */
  var gesamtSicher = false;
  var schluessel = "kl-stock-seiten:" + location.pathname;

  function ausSpeicher() {
    try {
      var roh = sessionStorage.getItem(schluessel);
      if (!roh) return 0;
      var o = JSON.parse(roh);
      if (Date.now() - o.t > 30 * 60 * 1000) return 0;      // nach 30 min neu prüfen
      return o.n || 0;
    } catch (e) { return 0; }
  }
  function inSpeicher(n) {
    try { sessionStorage.setItem(schluessel, JSON.stringify({ n: n, t: Date.now() })); } catch (e) {}
  }

  function gesamtErmitteln() {
    if (gesamtSicher || !pagParam) return Promise.resolve(gesamtSeiten);
    var gemerkt = ausSpeicher();
    if (gemerkt) { gesamtSeiten = gemerkt; gesamtSicher = true; return Promise.resolve(gesamtSeiten); }

    var lo = 1, hi = 0;
    function pruefe(n) {
      return seiteHolen(n).then(function (items) {
        return { leer: items.length === 0, weiter: !!hatWeiter[n] };
      });
    }
    function hoch(n) {
      if (n > 4096) { hi = n; return Promise.resolve(); }
      return pruefe(n).then(function (r) {
        if (r.leer) { hi = n; return; }                      // zu weit
        lo = n;
        if (!r.weiter) { hi = n + 1; return; }               // genau die letzte Seite
        return hoch(n * 2);
      });
    }
    function binaer() {
      if (hi - lo <= 1) return Promise.resolve();
      var m = Math.floor((lo + hi) / 2);
      return pruefe(m).then(function (r) {
        if (r.leer) hi = m; else { lo = m; if (!r.weiter) hi = m + 1; }
        return binaer();
      });
    }
    return hoch(2).then(binaer).then(function () {
      gesamtSeiten = Math.max(1, lo);
      gesamtSicher = true;
      inSpeicher(gesamtSeiten);
      log("Seitenzahl ermittelt:", gesamtSeiten, "| geholte Seiten:", Object.keys(seiten).length);
      if (!istGefiltert()) paginationBauen(gesamtSeiten);
      return gesamtSeiten;
    });
  }

  /* Alle Seiten holen — nur nötig, sobald wirklich gefiltert wird. */
  function alleHolen() {
    if (alleGeladen) return Promise.resolve();
    if (ladeVersprechen) return ladeVersprechen;
    if (!gesamtSicher) {                       // erst wissen, wie viele Seiten es sind
      ladeAnzeige(true);
      return (ladeVersprechen = gesamtErmitteln().then(function () {
        ladeVersprechen = null; return alleHolen();
      }));
    }
    ladeAnzeige(true);
    var offen = [];
    for (var n = 2; n <= gesamtSeiten; n++) if (!seiten[n]) offen.push(n);
    log("hole", offen.length, "Seiten");
    var i = 0;
    function naechste() {
      if (i >= offen.length) return Promise.resolve();
      return seiteHolen(offen[i++]).then(naechste);
    }
    var spuren = [];
    for (var s = 0; s < CFG.ladeGleichzeitig; s++) spuren.push(naechste());
    ladeVersprechen = Promise.all(spuren).then(function () {
      alleGeladen = true; ladeVersprechen = null; ladeAnzeige(false);
    });
    return ladeVersprechen;
  }

  function alleItems() {
    var out = [];
    for (var n = 1; n <= gesamtSeiten; n++) if (seiten[n]) out = out.concat(seiten[n]);
    return out;
  }

  /* ── Filter lesen ──────────────────────────────────────────────── */
  function steuerungen(feld) {
    if (!filterForm) return [];
    return qsa('[fs-cmsfilter-field="' + feld + '"], [data-kl-field="' + feld + '"]', filterForm)
      .map(function (w) {
        var label = w.closest("label");
        var input = label && label.querySelector('input[type="checkbox"], input[type="radio"]');
        return input ? { input: input, label: label, wert: (w.textContent || "").trim().toLowerCase() } : null;
      }).filter(Boolean);
  }

  function aktiveFilter() {
    var f = {};
    CFG.urlFelder.forEach(function (feld) {
      var an = steuerungen(feld).filter(function (s) { return s.input.checked; })
        .map(function (s) { return s.wert; });
      if (an.length) f[feld] = an;
    });
    return f;
  }

  function suchBegriffe() {
    var v = suchFeld ? suchFeld.value.trim() : "";
    return v ? norm(v).split(" ").filter(Boolean) : [];
  }

  function istGefiltert() {
    return Object.keys(aktiveFilter()).length > 0 || suchBegriffe().length > 0;
  }

  function treffer() {
    var f = aktiveFilter(), begriffe = suchBegriffe(), felder = Object.keys(f);
    return alleItems().filter(function (it) {
      for (var i = 0; i < felder.length; i++) {
        var soll = f[felder[i]], hat = it.felder[felder[i]] || [];
        var ok = false;
        for (var j = 0; j < soll.length; j++) if (hat.indexOf(soll[j]) !== -1) { ok = true; break; }
        if (!ok) return false;                       // Gruppen sind UND-verknüpft
      }
      for (var k = 0; k < begriffe.length; k++) {    // alle Suchwörter müssen vorkommen
        if (it.such.indexOf(begriffe[k]) === -1) return false;
      }
      return true;
    });
  }

  /* ── Rendern ───────────────────────────────────────────────────── */
  var leerHinweis = null;
  function zeigeLeer(an, text) {
    if (an && !leerHinweis) {
      leerHinweis = d.createElement("div");
      leerHinweis.className = "w-dyn-empty kl-empty";
      leerHinweis.setAttribute("role", "status");
      leerHinweis.textContent = text || "Keine Treffer. Bitte Filter oder Suchbegriff anpassen.";
      itemsBox.parentNode.insertBefore(leerHinweis, itemsBox.nextSibling);
    }
    if (leerHinweis) leerHinweis.style.display = an ? "" : "none";
    itemsBox.style.display = an ? "none" : "";
  }

  function render(liste, seitenZahl) {
    var frag = d.createDocumentFragment();
    liste.forEach(function (it) { frag.appendChild(it.el); });
    itemsBox.textContent = "";
    itemsBox.appendChild(frag);
    zeigeLeer(liste.length === 0);
    paginationBauen(seitenZahl);
    videosBinden(itemsBox);
    /* Webflow-Interaktionen für neu eingehängte Karten neu anmelden. */
    try { if (window.Webflow && window.Webflow.require) window.Webflow.require("ix2").init(); } catch (e) {}
    window.dispatchEvent(new CustomEvent("kl:rendered", { detail: { items: liste.map(function (i) { return i.el; }) } }));
  }

  function zeichne(scrollen) {
    var gefiltert = istGefiltert();
    if (!gefiltert) {
      /* Ungefiltert: genau EINE Seite holen statt des ganzen Katalogs. */
      ladeAnzeige(!seiten[seite]);
      seiteHolen(seite).then(function (items) {
        ladeAnzeige(false);
        render(items, Math.max(gesamtSeiten, 1));
        if (scrollen) nachObenScrollen();
      });
      return;
    }
    alleHolen().then(function () {
      var t = treffer();
      var seitenZahl = Math.max(1, Math.ceil(t.length / proSeite));
      if (seite > seitenZahl) seite = 1;
      render(t.slice((seite - 1) * proSeite, seite * proSeite), seitenZahl);
      if (scrollen) nachObenScrollen();
    });
  }

  /* ── Blätter-Leiste ────────────────────────────────────────────── */
  function paginationBauen(gesamt) {
    if (!zahlenBox || !btnTmpl) return;
    qsa(".kl-page", zahlenBox).forEach(function (e) { e.remove(); });
    if (gesamt <= 1) {
      if (weiterBtn) weiterBtn.style.display = "none";
      if (zurueckBtn) zurueckBtn.style.display = "none";
      return;
    }
    var zeigen = [];
    for (var n = 1; n <= gesamt; n++) {
      if (n === 1 || n === gesamt || Math.abs(n - seite) <= CFG.randSeiten) zeigen.push(n);
    }
    var vorher = 0;
    zeigen.forEach(function (n) {
      if (vorher && n - vorher > 1 && dotsTmpl) {
        var pt = dotsTmpl.cloneNode(true);
        pt.classList.add("kl-page");
        pt.removeAttribute("fs-cmsload-element");
        pt.style.display = "";
        zahlenBox.appendChild(pt);
      }
      var b = btnTmpl.cloneNode(true);
      b.classList.add("kl-page");
      b.removeAttribute("fs-cmsload-element");
      b.style.display = "";
      var innen = b.firstElementChild || b;
      innen.textContent = String(n);
      b.setAttribute("href", "?" + pagParam + "=" + n);
      b.classList.toggle(CFG.aktivKlasse, n === seite);
      if (n === seite) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      b.addEventListener("click", function (e) { e.preventDefault(); geheZuSeite(n); });
      zahlenBox.appendChild(b);
      vorher = n;
    });
    btnTmpl.style.display = "none";
    if (dotsTmpl) dotsTmpl.style.display = "none";
    if (weiterBtn) {
      weiterBtn.style.display = seite < gesamt ? "" : "none";
      weiterBtn.setAttribute("href", "?" + pagParam + "=" + Math.min(seite + 1, gesamt));
    }
    if (zurueckBtn) {
      zurueckBtn.style.display = seite > 1 ? "" : "none";
      zurueckBtn.setAttribute("href", "?" + pagParam + "=" + Math.max(seite - 1, 1));
    }
  }

  function geheZuSeite(n) {
    seite = n;
    urlSchreiben();
    zeichne(true);
  }

  if (weiterBtn) weiterBtn.addEventListener("click", function (e) { e.preventDefault(); geheZuSeite(seite + 1); });
  if (zurueckBtn) zurueckBtn.addEventListener("click", function (e) { e.preventDefault(); geheZuSeite(Math.max(1, seite - 1)); });

  /* ── Scrollen: nur beim Blättern ───────────────────────────────── */
  function kopfHoehe() {
    var h = 0;
    qsa("header, .navbar, [data-nav], .w-nav").forEach(function (el) {
      var st = getComputedStyle(el);
      if (st.position !== "fixed" && st.position !== "sticky") return;
      var r = el.getBoundingClientRect();
      if (r.top <= 1 && r.height > h && r.height < window.innerHeight * 0.4) h = r.height;
    });
    return h;
  }

  function nachObenScrollen() {
    var ziel = qs("[data-kl-anchor]") || listWrap.closest("section") || listWrap;
    /* Erst nach dem Layout messen — sonst springt man auf eine veraltete
       Position (das war der Fehler auf Mobile). */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var y = ziel.getBoundingClientRect().top + window.pageYOffset - kopfHoehe() - CFG.scrollExtra;
        var weich = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, y), behavior: weich ? "smooth" : "auto" });
      });
    });
  }

  /* ── URL ↔ Filter ──────────────────────────────────────────────── */
  var sperre = false;

  function setzeBox(s, an) {
    if (s.input.checked === an) return false;
    s.input.checked = an;
    var box = s.label.querySelector(".w-checkbox-input");   // Webflow zeichnet die Box als DIV
    if (box) box.classList.toggle("w--redirected-checked", an);
    return true;
  }

  function urlLesen() {
    var p = new URLSearchParams(location.search);
    sperre = true;
    CFG.urlFelder.forEach(function (feld) {
      var soll = (p.get(feld) || "").split(",").map(function (v) { return v.trim().toLowerCase(); }).filter(Boolean);
      steuerungen(feld).forEach(function (s) { setzeBox(s, soll.indexOf(s.wert) !== -1); });
    });
    if (suchFeld) suchFeld.value = p.get(CFG.suchParam) || "";
    var sn = parseInt(p.get(pagParam) || "1", 10);
    seite = isNaN(sn) || sn < 1 ? 1 : sn;
    sperre = false;
  }

  function urlSchreiben() {
    if (sperre) return;
    var p = new URLSearchParams();
    CFG.urlFelder.forEach(function (feld) {
      var an = steuerungen(feld).filter(function (s) { return s.input.checked; }).map(function (s) { return s.wert; });
      if (an.length) p.set(feld, an.join(","));
    });
    if (suchFeld && suchFeld.value.trim()) p.set(CFG.suchParam, suchFeld.value.trim());
    if (seite > 1) p.set(pagParam, String(seite));
    var neu = location.pathname + (p.toString() ? "?" + p.toString() : "") + location.hash;
    if (neu !== location.pathname + location.search + location.hash) history.pushState({ kl: 1 }, "", neu);
  }

  var tippTimer = null;
  if (filterForm) {
    filterForm.addEventListener("change", function (e) {
      if (!e.target.closest("label")) return;
      seite = 1; urlSchreiben(); zeichne(false);          // Filtern scrollt NICHT
    });
    filterForm.addEventListener("submit", function (e) { e.preventDefault(); });
  }
  if (suchFeld) {
    suchFeld.addEventListener("input", function () {
      clearTimeout(tippTimer);
      tippTimer = setTimeout(function () { seite = 1; urlSchreiben(); zeichne(false); }, 250);
    });
  }
  window.addEventListener("popstate", function () { urlLesen(); zeichne(false); });

  /* ── Hover-Video ───────────────────────────────────────────────── */
  var beruehrung = !window.matchMedia("(hover: hover)").matches;
  var wenigerBewegung = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var datenSparen = !!(navigator.connection && navigator.connection.saveData);

  var metaBeobachter = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      if (e.target.preload !== "metadata") e.target.preload = "metadata";
      metaBeobachter.unobserve(e.target);
    });
  }, { rootMargin: CFG.videoVorladen }) : null;

  function abspielen(v) {
    var los = function () {
      var p = v.play();
      if (p && p.catch) p.catch(function () {
        v.muted = true; v.setAttribute("muted", "");
        var n = v.play(); if (n && n.catch) n.catch(function () {});
      });
    };
    if (v.readyState >= 2) return los();
    v.addEventListener("canplay", function once() { v.removeEventListener("canplay", once); los(); }, { once: true });
    if (v.preload === "none") v.preload = "metadata";
    if (v.readyState < 2) v.load();
  }
  function anhalten(v) { try { v.pause(); v.currentTime = 0; } catch (e) {} }

  function videosBinden(scope) {
    qsa(".u-link-cover", scope || d).forEach(function (link) {
      if (link.dataset.klHover) return;
      link.dataset.klHover = "1";
      var card = link.closest(".card");
      var v = card && qs(".hover-video", card);
      if (!v) return;
      v.muted = true;
      v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
      v.removeAttribute("controls");
      if (metaBeobachter && !datenSparen) { v.preload = "none"; metaBeobachter.observe(v); }
      else v.preload = "metadata";
      if (wenigerBewegung || beruehrung) return;
      link.addEventListener("mouseenter", function () { abspielen(v); });
      link.addEventListener("mouseleave", function () { anhalten(v); });
      link.addEventListener("focusin", function () { abspielen(v); });
      link.addEventListener("focusout", function () { anhalten(v); });
    });
    if (beruehrung) mobileBinden(scope);
  }

  /* Mobile: das Video der Karte spielt, die gerade mittig im Bild steht. */
  var mobilBeobachter = null, mobilAktuell = null;
  function mobileBinden(scope) {
    if (wenigerBewegung || datenSparen || !("IntersectionObserver" in window)) return;
    if (!mobilBeobachter) {
      mobilBeobachter = new IntersectionObserver(mobileWaehlen, { threshold: [0, 0.35, 0.6, 0.9], rootMargin: "-15% 0px -15% 0px" });
    }
    qsa(".hover-video", scope || d).forEach(function (v) {
      if (v.dataset.klMobil) return;
      v.dataset.klMobil = "1";
      mobilBeobachter.observe(v);
    });
  }
  function mobileWaehlen() {
    var mitte = window.innerHeight / 2, best = null, nah = Infinity;
    qsa(".hover-video").forEach(function (v) {
      var r = v.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      var sicht = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (sicht < r.height * 0.5) return;
      var dist = Math.abs((r.top + r.bottom) / 2 - mitte);
      if (dist < nah) { nah = dist; best = v; }
    });
    if (best === mobilAktuell) return;
    if (mobilAktuell) anhalten(mobilAktuell);
    mobilAktuell = best;
    if (best) abspielen(best);
  }

  /* ── Start ─────────────────────────────────────────────────────── */
  function start() {
    ladeAnzeige(false);
    urlLesen();
    videosBinden(d);
    /* Nur neu rendern, wenn die URL etwas verlangt — sonst bleibt das
       server-gerenderte Seite-1-Markup unangetastet stehen (schnellster Start). */
    if (istGefiltert() || seite !== 1) zeichne(false);
    else paginationBauen(gesamtSeiten);
    /* Seitenzahl im Hintergrund ermitteln — blockiert nichts und macht die
       Blätter-Leiste vollständig. Ergebnis gilt für die ganze Sitzung. */
    var spaeter = function () { gesamtErmitteln(); };
    if (window.requestIdleCallback) requestIdleCallback(spaeter, { timeout: 4000 });
    else setTimeout(spaeter, 2000);
    log("bereit", { seiten: gesamtSeiten, proSeite: proSeite, param: pagParam });
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start);
  else start();

  window.klStock = {
    version: "2.0.0",
    zustand: function () {
      return {
        seite: seite, gesamtSeiten: gesamtSeiten, proSeite: proSeite,
        alleGeladen: alleGeladen, geladeneSeiten: Object.keys(seiten).length,
        gefiltert: istGefiltert(), treffer: istGefiltert() && alleGeladen ? treffer().length : null,
        karten: qsa(".u-link-cover").length,
        gebunden: qsa(".u-link-cover[data-kl-hover]").length
      };
    },
    geheZuSeite: geheZuSeite,
    zeichne: zeichne,
    alleHolen: alleHolen
  };
})();
