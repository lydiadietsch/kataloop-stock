/*!
 * kataloop-stock.js v3.4.0
 * Eigene Filter-, Blätter- und Video-Logik für die Stock-Collection.
 * -----------------------------------------------------------------------------
 * Ersetzt vollständig:  attributes@2, attributes-cmsfilter@1, attributes-cmsload@1
 *                       + die drei eigenen Snippets (History-Blocker,
 *                         URL-Übernahme, Hover-Video)
 * Keine externe Abhängigkeit. Eine Datei, 17,7 KB (6,8 KB gzip).
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
 * STATUS-ANZEIGEN (ab v3.4.0)
 * Der Zustand der Liste wird am <html> gemeldet, damit sich Webflow-Elemente
 * daran hängen können, ohne dass dieses Skript sie kennen muss:
 *   data-kl-liste="laden" | "treffer" | "leer"
 *   data-kl-ende            gesetzt, sobald die letzte Seite erreicht ist
 * Eine Hülle in Webflow bekommt die Rolle und ist im Designer versteckt:
 *   <div data-kl-zeigen="leer" class="… u-d-none">   → Kein Bild gefunden
 *   <div data-kl-zeigen="ende" class="… u-d-none">   → Ende der Liste
 * Das Skript schaltet nur die Klasse u-d-none um — Layout, Breakpoints und
 * Sichtbarkeits-Grundzustand bleiben in Webflow. Texte darin werden befüllt:
 *   data-kl-text="suche"    der Suchbegriff
 *   data-kl-text="anzahl"   die Trefferzahl (nur wenn sie feststeht)
 * Der Suchbegriff steht zusätzlich als data-kl-suche am <html> — Code-
 * Komponenten im Shadow DOM lesen ihn von dort selbst.
 *
 * Dieses Skript zeichnet KEINE Ladeanzeige mehr. Wer eine will, baut sie in
 * Webflow und hängt sie an data-kl-zeigen="laden"; gemeldet wird der Zustand
 * erst nach CFG.ladenAbMs, damit bei schnellen Filtern nichts aufblitzt.
 *
 * GEGENVORSCHLÄGE
 * Findet die Suche nichts, schlägt das Skript Begriffe vor, die es im Katalog
 * wirklich gibt (Wortanfang, Umlaut-Varianten, Tippfehler). Ausgegeben werden
 * sie als Klone einer in Webflow gestalteten Vorlage:
 *   <div data-kl-vorschlaege>
 *     <a data-kl-vorschlag-vorlage class="…">Vorlage</a>
 *     <a class="…">Feste Auswahl, falls nichts passt</a>
 *   </div>
 * Hat die Vorlage inneres Markup, bekommt [data-kl-vorschlag-text] den Text.
 *
 * EINBINDUNG (Webflow, vor </body>) — sonst nichts:
 *   <script src="https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v3.4.0/stock.min.js"></script>
 *
 * Ereignisse:
 *   window.addEventListener("kl:rendered", e => e.detail.items)   // nach jedem Rendern
 *   window.dispatchEvent(new CustomEvent("kl:neu-suchen"))        // alles zurücksetzen
 */
(function () {
  "use strict";

  var CFG = {
    suchFeldId: "Search",          // Eingabefeld der Volltextsuche
    urlFelder: ["kategorie", "typ", "lizenz", "ausrichtung"], // Filter, die in die URL dürfen
    suchParam: "tags",             // Suchbegriff ↔ ?tags=
    sucheMinZeichen: 2,            // ab so vielen Zeichen wird gesucht
    sucheAbEnter: false,           // true = erst auf Enter suchen, nicht beim Tippen
    sucheVerzoegerungMs: 250,      // Wartezeit nach dem letzten Tastendruck
    enterHinweis: "",              // Hinweis im Suchfeld; leer = aus (Live-Suche braucht kein Enter)
    enterHinweisAbstand: 44,       // px vom rechten Feldrand (Platz für die Lupe)
    fensterSeiten: 5,              // so viele Seitenzahlen zeigt die Leiste (gleitendes Fenster)
    scrollExtra: 12,               // Abstand unter der Kopfleiste
    ladeGleichzeitig: 4,           // parallele Seiten-Abrufe
    aktivKlasse: "w--current",     // Klasse der aktiven Seitenzahl
    videoVorladen: "600px",        // ab dieser Nähe Video-Metadaten holen
    verstecktKlasse: "u-d-none",   // Webflow-Klasse, mit der Status-Hüllen versteckt sind
    seitenAnfangId: "nav-top",     // Scrollziel für „Neue Suche starten"
    ladenAbMs: 250,                // so lange muss geladen werden, bis „laden" gemeldet wird
    vorschlaegeMax: 4              // so viele Gegenvorschläge höchstens
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
  /* Vorlagen aus dem DOM NEHMEN (nicht nur ausblenden): sonst findet ein
     fremdes Snippet wie hideLastIfDotsBefore() sie noch, zählt sie als echte
     Blätter-Buttons und blendet sie wieder ein. Als Speicher-Vorlage
     funktionieren sie genauso. */
  if (btnTmpl && btnTmpl.parentNode) btnTmpl.parentNode.removeChild(btnTmpl);
  if (dotsTmpl && dotsTmpl.parentNode) dotsTmpl.parentNode.removeChild(dotsTmpl);
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

  /* Leichte deutsche Grundform: hängt gängige Beugungsendungen ab.
     „rote"→„rot", „Blumen"→„blum", „Bäume"→„baeum". Bewusst grob — sie soll
     Beugung überbrücken, nicht Wortbedeutung erraten. Der Nebeneffekt
     („Reis" trifft auch „Reise") wird über die Rangfolge abgefangen:
     exakte Treffer stehen oben. */
  var ENDUNGEN = ["innen", "ern", "en", "er", "es", "em", "in", "e", "n", "s"];
  function stamm(w) {
    for (var i = 0; i < ENDUNGEN.length; i++) {
      var e = ENDUNGEN[i];
      if (w.length - e.length >= 3 && w.slice(-e.length) === e) return w.slice(0, -e.length);
    }
    return w;
  }
  function stammText(t) { return t ? t.split(" ").map(stamm).join(" ") : ""; }
  /* Zweite Stufe der Umlaut-Behandlung: norm() macht ä→ae, hier wird daraus a.
     Damit findet „kuste" die Küste und „hauser" die Häuser — 1.839 der 8.484
     Wörter im Katalog enthalten aufgelöste Umlaute, ohne diese Stufe waren sie
     für alle unerreichbar, die weder Umlaut noch „ae" tippen. Löst nebenbei die
     Umlaut-Plurale (Haus↔Häuser, Baum↔Bäume), an denen die Stammform scheitert.
     Preis: „schon" und „schön" gelten als gleich — bei einer Bildsuche der
     richtige Tausch. */
  function flach(t) { return t ? t.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u") : ""; }
  function esc(q) { return q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  /* Treffer nur als ganzes Wort oder an einer Wortkante — und dort nur, wenn
     genug übrig bleibt: am Anfang mindestens 3 Zeichen, am Ende mindestens 4.
     Vorher genügte EIN Zeichen, deshalb fand „Affe" die „Waffe", „Waffe" die
     „Waffel" und „Eis" den „Kreis". Die Schwelle am Ende ist höher, weil im
     Deutschen dort das Grundwort steht: „Haus" soll Bauernhaus und Gewächshaus
     finden, aber „Affe" nicht Giraffe. An 15 Wortpaaren geprüft: 0 Fehler
     (aus = 6 Fehler, ≥3 = 1, ≥5 = 2). Bekannte Ausreißer im Katalog: „eis"
     trifft auch Ägäis und Sicherheitshinweis — 2 von 68. */
  function anfangMuster(t) { return new RegExp("(^| )" + esc(t) + "[a-z0-9]{3,}"); }
  function endeMuster(t) { return new RegExp("[a-z0-9]{4,}" + esc(t) + "( |$)"); }
  function exaktMuster(t) { return new RegExp("(^| )" + esc(t) + "( |$)"); }

  /* ── Datenmodell ───────────────────────────────────────────────── */
  var seiten = {};            // Seitenzahl → Array von Item-Objekten
  var alleGeladen = false;    // wurden alle Seiten geholt?
  var ladeVersprechen = null;
  var seite = 1;
  var proSeite = 0;
  var gesamtSeiten = 1;
  var pagParam = "";          // z. B. "e19e26fd_page"
  var gesamtSicher = false;   // ist die Seitenzahl verlässlich bekannt?

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

  /* Aus den Pixelmaßen ein Wort machen, nach dem Menschen tatsächlich suchen:
     Videos in K-Klassen (8k, 4k …), Fotos in Megapixeln (50mp). Die Maße stehen
     ohnehin in jeder Karte — ohne das findet „8k" null Treffer, obwohl 8K-Videos
     im Katalog liegen. */
  function massWorte(felder) {
    var b = parseInt((felder.width || [])[0], 10), h = parseInt((felder.height || [])[0], 10);
    if (!b || !h) return "";
    var lang = Math.max(b, h), istVideo = /video/i.test((felder.typ || [])[0] || "");
    if (istVideo) return lang >= 7680 ? "8k" : lang >= 5120 ? "5k" : lang >= 3840 ? "4k"
                        : lang >= 2560 ? "2k" : "hd";
    return Math.round(b * h / 1e6) + "mp";
  }

  function bauItem(el) {
    var felder = feldWerte(el);
    var such = [];
    for (var k in felder) such.push(felder[k].join(" "));
    var norm2 = {};
    for (var f in felder) norm2[f] = felder[f].map(function (v) { return v.trim().toLowerCase(); });
    var roh = such.join(" ");
    /* Bindestrich-Wörter zusätzlich zusammengezogen ablegen: norm() macht aus
       „Food-Fotografie" zwei Wörter, „foodfotografie" fände sie sonst nie.
       278 solcher Wörter allein in den ersten 500 Motiven. */
    var zusatz = (roh.match(/[^\s]+-[^\s]+/g) || []).map(function (x) { return norm(x.replace(/-/g, "")); });
    var text = norm(roh + " " + massWorte(felder)) + (zusatz.length ? " " + zusatz.join(" ") : "");
    var flachT = flach(text);
    return { el: el, felder: norm2, such: text, flach: flachT, flachstamm: stammText(flachT) };
  }

  /* Seite 1 steht bereits im HTML (gut für SEO und den ersten Aufbau). */
  seiten[1] = qsa(":scope > .w-dyn-item", itemsBox).map(bauItem);
  if (!seiten[1].length) seiten[1] = qsa(".w-dyn-item", itemsBox).map(bauItem);
  proSeite = seiten[1].length || 1;

  /* Seitenzahl + Parameter aus dem Markup lesen.
     Webflow rendert im Blätter-Bereich ein verstecktes Element
     <div class="w-page-count">1 / 31</div> (bzw. aria-label "Page 1 of 31").
     Damit ist die Gesamtzahl OHNE einen einzigen Abruf bekannt — genau daraus
     liest auch Finsweet sie. Fehlt das Element, greift die Sprungsuche unten. */
  (function ermittlePaginierung() {
    var href = (weiterBtn && weiterBtn.getAttribute("href")) || "";
    var m = href.match(/[?&]([^=]*_page)=(\d+)/);
    if (m) pagParam = m[1];
    if (!pagParam) {
      qsa("a[href*='_page=']").forEach(function (a) {
        var mm = a.getAttribute("href").match(/[?&]([^=]*_page)=(\d+)/);
        if (mm && !pagParam) pagParam = mm[1];
      });
    }
    var zaehler = qs(".w-page-count, [data-kl-page-count]");
    if (zaehler) {
      var txt = (zaehler.textContent || "") + " " + (zaehler.getAttribute("aria-label") || "");
      var z = txt.match(/(\d+)\s*(?:\/|of|von)\s*(\d+)/i);
      if (z) { gesamtSeiten = parseInt(z[2], 10) || 1; gesamtSicher = true; }
    }
    log("Paginierung:", pagParam, "| Seiten:", gesamtSeiten, gesamtSicher ? "(aus w-page-count)" : "(unbekannt)", "| pro Seite:", proSeite);
  })();

  /* ── Nachladen ─────────────────────────────────────────────────── */
  /* Rückmeldung MUSS sofort kommen — der eingebaute Loader sitzt unten in der
     Blätter-Leiste und ist beim Filtern gar nicht im Bild. Deshalb zusätzlich
     ein Balken direkt über der Liste und ein Ausgrauen der Karten. */
  var stil = d.createElement("style");
  stil.textContent =
    /* Dieses Skript zeichnet KEINE Ladeanzeige mehr (Nutzerin-Vorgabe): weder
       den laufenden Balken noch das Abdunkeln der Karten. Wer eine will, baut
       sie in Webflow und hängt sie an data-kl-zeigen="laden" — dann bestimmt
       das Design sie. Die Klasse .kl-laedt und aria-busy bleiben am
       Listen-Wrapper, damit man sich anhängen kann. */
    ".kl-suchhinweis{position:absolute;transform:translateY(-50%);pointer-events:none;" +
      "font-size:.72em;letter-spacing:.02em;opacity:.45;transition:opacity .15s;white-space:nowrap}";
  d.head.appendChild(stil);

  /* Die alte Webflow-Ladeanzeige wird EINMAL versteckt und nie wieder
     angefasst — sonst stünde sie ab jetzt dauerhaft im Bild. Sie kann im
     Designer gelöscht werden; das Skript braucht sie nicht mehr. */
  if (loader) loader.style.display = "none";

  var laedt = false;                 // lädt gerade etwas? (innen)
  var ladenGemeldet = false;         // schon lange genug, um es zu zeigen? (außen)
  var ladeTimer = 0;

  /* Getrennt, weil beides Verschiedenes leistet: `laedt` verhindert sofort,
     dass der Leerhinweis aufblitzt, solange noch geladen wird. Nach außen
     gemeldet wird „laden" dagegen erst nach CFG.ladenAbMs — eine Anzeige, die
     für 80 ms aufpoppt, sieht genauso billig aus wie der alte Balken. */
  function ladeAnzeige(an) {
    laedt = an;
    if (an) {
      if (!ladeTimer && !ladenGemeldet) {
        ladeTimer = setTimeout(function () {
          ladeTimer = 0;
          ladenGemeldet = true;
          statusAktualisieren();
        }, CFG.ladenAbMs);
      }
    } else {
      if (ladeTimer) { clearTimeout(ladeTimer); ladeTimer = 0; }
      ladenGemeldet = false;
    }
    listWrap.classList.toggle("kl-laedt", an);
    if (filterForm) filterForm.classList.toggle("kl-warte", an);
    listWrap.setAttribute("aria-busy", an ? "true" : "false");
    statusAktualisieren();
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

  /* Katalog laden.
     Ist die Seitenzahl bekannt (Normalfall), werden alle fehlenden Seiten
     in Wellen geholt — im Vordergrund breit (schnell), im Hintergrund
     schmaler und mit Leerlauf-Pause dazwischen, damit das Parsen der
     Dokumente die Seite nicht ruckeln lässt.
     Ohne Seitenzahl (Element fehlt) wird gesucht, bis eine Seite leer ist. */
  function alleHolen(zwischenstand, hintergrund) {
    if (alleGeladen) return Promise.resolve();
    if (ladeVersprechen) return ladeVersprechen;
    var welle = hintergrund ? 6 : 12, n = 2, ende = false;
    if (!hintergrund) ladeAnzeige(true);

    function naechste() {
      if (ende) return Promise.resolve();
      var jobs = [], nummern = [];
      for (var i = 0; i < welle; i++) {
        if (gesamtSicher && n > gesamtSeiten) { ende = true; break; }
        if (n > 4096) { ende = true; break; }
        nummern.push(n); jobs.push(seiteHolen(n)); n++;
      }
      if (!jobs.length) return Promise.resolve();
      return Promise.all(jobs).then(function (res) {
        res.forEach(function (items, i) {
          if (items.length) gesamtSeiten = Math.max(gesamtSeiten, nummern[i]);
          else if (!gesamtSicher) ende = true;      // Ende des Katalogs gefunden
        });
        if (zwischenstand) zwischenstand();
        if (ende) return;
        return hintergrund ? new Promise(function (fertig) { idle(function () { fertig(naechste()); }, 300); })
                           : naechste();
      });
    }

    ladeVersprechen = naechste().then(function () {
      alleGeladen = true; gesamtSicher = true; ladeVersprechen = null;
      inSpeicher(gesamtSeiten);
      ladeAnzeige(false);
      log("Katalog vollständig:", gesamtSeiten, "Seiten");
    }, function (e) {
      ladeVersprechen = null; ladeAnzeige(false); log("Katalog-Fehler", e);
    });
    return ladeVersprechen;
  }

  function idle(fn, delay) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: (delay || 300) + 1200 });
    else setTimeout(fn, delay || 300);
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

  var angewandteSuche = "";        // was gerade tatsächlich gefiltert ist
  function suchBegriffe() {
    return angewandteSuche
      ? norm(angewandteSuche).split(" ").filter(function (w) { return w.length >= CFG.sucheMinZeichen; })
      : [];
  }

  function istGefiltert() {
    return Object.keys(aktiveFilter()).length > 0 || suchBegriffe().length > 0;
  }

  function treffer() {
    var f = aktiveFilter(), felder = Object.keys(f), begriffe = suchBegriffe();
    /* Muster EINMAL je Suche bauen, nicht je Motiv — bei 3.100 Einträgen
       macht das den Unterschied zwischen flüssig und spürbar. */
    var muster = begriffe.map(function (b) {
      /* Drei Stufen, absteigend im Rang: (1) das Wort selbst, (2) Wortanfang
         mit mindestens 3 Zeichen Rest — das sind die Komposita, (3) Umlaute
         reduziert und Grundform, jeweils in BEIDE Richtungen verglichen
         (Frage↔Wort). Erst die beidseitige Prüfung bringt „Haus" mit „Häuser"
         zusammen: „haus" kürzt sich zu „hau", „haeuser" aber zu „haus". */
      var fb = flach(b);
      return { exakt: exaktMuster(b), anfang: anfangMuster(b), ende: endeMuster(b),
               fExakt: exaktMuster(fb), fAnfang: anfangMuster(fb), fEnde: endeMuster(fb),
               fStamm: exaktMuster(stamm(fb)) };
    });

    var liste = alleItems().filter(function (it) {
      for (var i = 0; i < felder.length; i++) {
        var soll = f[felder[i]], hat = it.felder[felder[i]] || [], ok = false;
        for (var j = 0; j < soll.length; j++) if (hat.indexOf(soll[j]) !== -1) { ok = true; break; }
        if (!ok) return false;                       // Filtergruppen sind UND-verknüpft
      }
      var punkte = 0;
      for (var k = 0; k < muster.length; k++) {      // ALLE Suchwörter müssen vorkommen
        var m = muster[k], p = 0;
        if (m.exakt.test(it.such)) p = 3;            // „blume" = Tag „Blume"
        else if (m.anfang.test(it.such) || m.ende.test(it.such)) p = 2;  // Blumenstrauß, Bauernhaus
        else if (m.fExakt.test(it.flach) || m.fAnfang.test(it.flach)
              || m.fEnde.test(it.flach)) p = 2;     // „kuste" → Küste, Küstenlandschaft
        else if (m.fExakt.test(it.flachstamm)       // Frage ist die Grundform des Wortes
              || m.fStamm.test(it.flach)            // Grundform der Frage ist das Wort
              || m.fStamm.test(it.flachstamm)) p = 1;  // beide auf Grundform gleich
        if (!p) return false;
        punkte += p;
      }
      it.punkte = punkte;
      return true;
    });

    /* Rangfolge nur bei aktiver Suche: exakte Treffer zuerst. Damit landet
       bei „Reis" der echte Reis oben und die Reise-Motive darunter. */
    if (begriffe.length) liste.sort(function (a, b) { return b.punkte - a.punkte; });
    return liste;
  }

  /* Einen Begriff anwenden — von der Tastatur wie von einem Vorschlags-Chip.
     `insFeld` nur bei den Chips: beim Tippen würde das Zurückschreiben den
     Cursor bewegen. */
  function begriffSuchen(wort, insFeld) {
    if (insFeld && suchFeld) suchFeld.value = wort;
    if (wort === angewandteSuche) return;
    angewandteSuche = wort;
    seite = 1;
    urlSchreiben();
    zeichne(false);
  }

  /* ── Gegenvorschläge ───────────────────────────────────────────
     Findet die Suche nichts, ist die beste Antwort ein Begriff, den es im
     Katalog WIRKLICH gibt. Dafür einmal ein Wortverzeichnis aus allen
     geladenen Motiven bauen (Tags, Titel, Orte, Kamera …) und darin die
     nächstliegenden Wörter suchen.

     Gebaut wird es erst, wenn es gebraucht wird — also frühestens bei der
     ersten erfolglosen Suche. Und dann ist der Katalog garantiert
     vollständig, denn der Leerzustand erscheint überhaupt erst, wenn die
     Ladephase durch ist.

     Angenehmer Nebeneffekt: jeder Vorschlag stammt aus einem echten Motiv,
     kann also nie ins Leere führen. */
  var wortIndex = null;
  var NUR_BUCHSTABEN = /^[a-z]+$/;   // norm() hat Umlaute schon zu ae/oe/ue gemacht

  function wortIndexBauen() {
    var t0 = Date.now();
    var zaehl = Object.create(null);
    for (var n in seiten) {
      if (!seiten.hasOwnProperty(n)) continue;
      for (var i = 0; i < seiten[n].length; i++) {
        var worte = seiten[n][i].such.split(" ");
        for (var j = 0; j < worte.length; j++) {
          var t = worte[j];
          /* Nur echte Wörter: mindestens vier Buchstaben, keine Ziffern.
             Sonst landen Kataloop-IDs, Kameramodelle und die Pixelwörter
             („50mp", „8k") im Verzeichnis — als Vorschlag hilft das niemandem,
             und es bläht die Suche unnötig auf. Gesucht werden kann danach
             weiterhin, das hier betrifft nur die Vorschläge. */
          if (t.length < 4 || !NUR_BUCHSTABEN.test(t)) continue;
          zaehl[t] = (zaehl[t] || 0) + 1;
        }
      }
    }
    var liste = [];
    for (var wort in zaehl) liste.push([wort, zaehl[wort]]);
    log("Wortverzeichnis:", liste.length, "Wörter in", Date.now() - t0, "ms");
    return liste;
  }

  /* Levenshtein mit Deckel: sobald feststeht, dass der Abstand über `max`
     liegt, wird abgebrochen. Ohne den Deckel kostet der Vergleich gegen
     tausende Wörter spürbar Zeit. */
  function abstand(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var vorher = [], jetzt = [], i, j;
    for (j = 0; j <= lb; j++) vorher[j] = j;
    for (i = 1; i <= la; i++) {
      jetzt[0] = i;
      var best = i;
      for (j = 1; j <= lb; j++) {
        var kosten = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        jetzt[j] = Math.min(jetzt[j - 1] + 1, vorher[j] + 1, vorher[j - 1] + kosten);
        if (jetzt[j] < best) best = jetzt[j];
      }
      if (best > max) return max + 1;
      var tausch = vorher; vorher = jetzt; jetzt = tausch;
    }
    return vorher[lb];
  }

  function vorschlaegeFinden() {
    var tSuche = Date.now();
    var gesucht = suchBegriffe().filter(function (b) { return b.length >= 3; });
    if (!gesucht.length) return [];
    if (!wortIndex) wortIndex = wortIndexBauen();
    if (!wortIndex.length) return [];

    var gefunden = Object.create(null);
    gesucht.forEach(function (b) {
      /* Kurze Wörter vertragen nur einen Tippfehler — bei zweien wäre „hund"
         plötzlich „mund", „rund", „bund". */
      var maxAbstand = b.length <= 5 ? 1 : 2;
      var fb = flach(b);
      for (var i = 0; i < wortIndex.length; i++) {
        var wort = wortIndex[i][0], haeufig = wortIndex[i][1], rang = 0;
        if (wort === b) continue;
        if (wort.indexOf(b) === 0 || b.indexOf(wort) === 0) rang = 3;
        else if (flach(wort).indexOf(fb) === 0) rang = 2;
        else if (abstand(b, wort, maxAbstand) <= maxAbstand) rang = 1;
        if (!rang) continue;
        var alt = gefunden[wort];
        if (!alt || rang > alt.rang) gefunden[wort] = { wort: wort, rang: rang, haeufig: haeufig };
      }
    });

    var liste = [];
    for (var w in gefunden) liste.push(gefunden[w]);
    liste.sort(function (a, b) {
      return b.rang - a.rang || b.haeufig - a.haeufig || a.wort.length - b.wort.length;
    });
    log("Vorschlagssuche:", Date.now() - tSuche, "ms für", wortIndex.length, "Wörter");
    return liste.slice(0, CFG.vorschlaegeMax).map(function (e) { return e.wort; });
  }

  /* Ausgabe nach dem Muster der Blätter-Leiste: die Nutzerin gestaltet EINEN
     Chip in Webflow, das Skript nimmt ihn als Vorlage aus dem DOM und klont
     ihn. So bleiben es echte Webflow-Elemente mit ihren Klassen und ihrem
     Hover — das Skript setzt nur Text und Klick.

       <div data-kl-vorschlaege>
         <a data-kl-vorschlag-vorlage class="…">Vorlage</a>
         <a class="…">Feste Auswahl, falls nichts passt</a>
       </div>                                                              */
  var vorschlagBox = null, vorschlagVorlage = null;

  /* Erst bei DOMContentLoaded suchen, nicht schon beim Ausführen des Skripts:
     der Container darf irgendwo auf der Seite stehen, auch hinter dem
     Skript-Tag. Trotzdem früh genug — die Vorlage muss aus dem DOM sein,
     bevor der erste Leerzustand sie als überzähligen Chip zeigen könnte. */
  function vorschlaegeVorbereiten() {
    vorschlagBox = qs("[data-kl-vorschlaege]");
    vorschlagVorlage = vorschlagBox ? qs("[data-kl-vorschlag-vorlage]", vorschlagBox) : null;
    if (vorschlagVorlage) {
      vorschlagVorlage.removeAttribute("data-kl-vorschlag-vorlage");
      if (vorschlagVorlage.parentNode) vorschlagVorlage.parentNode.removeChild(vorschlagVorlage);
    }
  }

  function vorschlaegeBauen() {
    if (!vorschlagBox) return;
    qsa("[data-kl-vorschlag]", vorschlagBox).forEach(function (e) { e.remove(); });

    var worte = vorschlagVorlage ? vorschlaegeFinden() : [];
    worte.forEach(function (wort) {
      var chip = vorschlagVorlage.cloneNode(true);
      chip.setAttribute("data-kl-vorschlag", "");
      /* Hat die Vorlage inneres Markup (Icon, Span), wird nur der markierte
         Textträger befüllt — sonst der Chip selbst. */
      var ziel = qs("[data-kl-vorschlag-text]", chip) || chip;
      ziel.textContent = wort;
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        begriffSuchen(wort, true);
      });
      vorschlagBox.appendChild(chip);
    });

    /* Echte Treffer verdrängen die feste Auswahl; gibt es keine, bleibt sie
       stehen. Das ist der Hybrid: „Meintest du …?" wenn möglich, sonst die
       gepflegten Chips. */
    Array.prototype.forEach.call(vorschlagBox.children, function (kind) {
      if (kind.hasAttribute("data-kl-vorschlag")) return;
      kind.classList.toggle(CFG.verstecktKlasse, worte.length > 0);
    });
    log("Vorschläge:", worte.length ? worte.join(", ") : "keine (feste Auswahl)");
  }

  /* ── Zustand nach außen melden ─────────────────────────────────
     Ein Attribut am <html>, an das sich Webflow-Elemente hängen können,
     ohne dass dieses Skript ihre Namen kennen muss:

       data-kl-liste = "laden" | "treffer" | "leer"
       data-kl-ende  = gesetzt, sobald die letzte Seite erreicht ist

     Hüllen mit data-kl-zeigen="leer|treffer|ende" bekommen die Webflow-
     Klasse aus CFG.verstecktKlasse an- bzw. abgeschaltet. Absichtlich
     kein style.display: so behält Webflow die Hoheit über das Layout
     (flex/grid/Breakpoints), und weil „versteckt" der ausgelieferte
     Zustand ist, blitzt beim Seitenaufbau nichts auf, bevor dieses
     Skript läuft. Ohne Skript bleibt alles verborgen — richtig herum.

     Texte mit data-kl-text="suche" bekommen den Suchbegriff,
     data-kl-text="anzahl" die Trefferzahl — Letztere nur, wenn sie
     wirklich feststeht (Katalog vollständig geladen), sonst stünde dort
     zwischendurch eine zu kleine Zahl. */
  var laufendeAnzahl = null;      // gerendert auf dieser Seite
  var laufendeGesamt = null;      // Treffer insgesamt, null = noch unbekannt
  var laufendeSeiten = 1;

  var vorschlagFuer = null;         // für welchen Begriff stehen die Chips gerade?

  function statusAktualisieren() {
    var w = d.documentElement;

    /* Der Begriff hängt nicht am Ladezustand und wird immer gepflegt. Er steht
       zusätzlich am <html>, weil Code-Komponenten im Shadow DOM liegen und von
       hier aus nicht befüllt werden können — ein Attribut lesen sie selbst. */
    var begriff = angewandteSuche || (suchFeld ? suchFeld.value.trim() : "");
    if (begriff) w.setAttribute("data-kl-suche", begriff);
    else w.removeAttribute("data-kl-suche");
    qsa('[data-kl-text="suche"]').forEach(function (el) { el.textContent = begriff; });
    if (laufendeGesamt !== null)
      qsa('[data-kl-text="anzahl"]').forEach(function (el) { el.textContent = String(laufendeGesamt); });

    /* Der Leerhinweis richtet sich nach `laedt` DIREKT, nicht nach dem nach
       außen gemeldeten Zustand: solange geladen wird, darf er nie erscheinen
       (das war der Blitzer). */
    zeigeLeer(!laedt && laufendeAnzahl === 0);

    /* Wird gerade geladen, es aber noch nicht lange genug, um es zu zeigen,
       bleibt der zuletzt gemeldete Zustand einfach stehen — so flackert bei
       schnellen Filtern nichts auf. */
    if (laedt && !ladenGemeldet) return;

    var zustand = laedt ? "laden" : laufendeAnzahl === 0 ? "leer" : "treffer";
    /* Solange noch nichts gezählt wurde, wird auch nichts behauptet: sonst
       stünde beim allerersten Aufruf seite (1) >= laufendeSeiten (1) da und
       „Ende der Liste" erschiene auf Seite 1 von 31.
       Ungefiltert zählt immer die LEBENDE Seitenzahl: fehlt w-page-count,
       wächst gesamtSeiten erst während der Sprungsuche auf den echten Wert. */
    var seitenJetzt = istGefiltert() ? laufendeSeiten : Math.max(gesamtSeiten, 1);
    var ende = zustand === "treffer" && laufendeAnzahl !== null && seite >= seitenJetzt;

    w.setAttribute("data-kl-liste", zustand);
    if (ende) w.setAttribute("data-kl-ende", "");
    else w.removeAttribute("data-kl-ende");

    qsa("[data-kl-zeigen]").forEach(function (el) {
      var rolle = el.getAttribute("data-kl-zeigen");
      var an = rolle === "ende" ? ende : rolle === zustand;
      el.classList.toggle(CFG.verstecktKlasse, !an);
    });

    /* Gegenvorschläge nur neu bauen, wenn sich der Begriff geändert hat —
       statusAktualisieren() läuft bei jedem Rendern. */
    if (zustand === "leer") {
      if (begriff !== vorschlagFuer) { vorschlagFuer = begriff; vorschlaegeBauen(); }
    } else vorschlagFuer = null;
  }

  /* ── Rendern ───────────────────────────────────────────────────── */
  var leerHinweis = null;
  function zeigeLeer(an, text) {
    /* Bringt die Seite eine eigene Leer-Hülle mit (Webflow-Komponente),
       baut dieses Skript keinen zweiten Hinweis daneben. */
    if (an && !leerHinweis && !qs('[data-kl-zeigen="leer"]')) {
      leerHinweis = d.createElement("div");
      leerHinweis.className = "w-dyn-empty kl-empty";
      leerHinweis.setAttribute("role", "status");
      leerHinweis.textContent = text || "Keine Treffer. Bitte Filter oder Suchbegriff anpassen.";
      itemsBox.parentNode.insertBefore(leerHinweis, itemsBox.nextSibling);
    }
    if (leerHinweis) leerHinweis.style.display = an ? "" : "none";
    itemsBox.style.display = an ? "none" : "";
  }

  function render(liste, seitenZahl, gesamt) {
    var frag = d.createDocumentFragment();
    liste.forEach(function (it) { frag.appendChild(it.el); });
    itemsBox.textContent = "";
    itemsBox.appendChild(frag);
    laufendeAnzahl = liste.length;
    laufendeGesamt = gesamt === undefined ? null : gesamt;
    laufendeSeiten = seitenZahl;
    statusAktualisieren();
    paginationBauen(seitenZahl);
    videosBinden(itemsBox);
    /* KEIN ix2.init() hier: das setzt sämtliche Interaktions-Zustände der Seite
       zurück (unter anderem den aktiven Filter-Chip) und kostet spürbar Zeit. */
    window.dispatchEvent(new CustomEvent("kl:rendered", { detail: { items: liste.map(function (i) { return i.el; }) } }));
  }

  /* Ungefiltert steht die Gesamtzahl erst fest, wenn alle Seiten da sind —
     die letzte Seite ist meist nur teilweise gefüllt, hochrechnen wäre
     geraten. Vorher: null (die Anzeige bleibt dann einfach stehen). */
  function ungefiltertGesamt() {
    if (!alleGeladen) return null;
    var n = 0;
    for (var k in seiten) if (seiten.hasOwnProperty(k)) n += seiten[k].length;
    return n;
  }

  function zeichne(scrollen) {
    var gefiltert = istGefiltert();
    if (!gefiltert) {
      /* Ungefiltert: genau EINE Seite holen statt des ganzen Katalogs. */
      ladeAnzeige(!seiten[seite]);
      seiteHolen(seite).then(function (items) {
        ladeAnzeige(false);
        render(items, Math.max(gesamtSeiten, 1), ungefiltertGesamt());
        if (scrollen) nachObenScrollen();
      });
      return;
    }
    var zeichneTreffer = function () {
      var t = treffer();
      var seitenZahl = Math.max(1, Math.ceil(t.length / proSeite));
      if (seite > seitenZahl) seite = 1;
      /* Die Trefferzahl stimmt erst, wenn der Katalog vollständig ist —
         vorher wäre sie nur der bisher geladene Ausschnitt. */
      render(t.slice((seite - 1) * proSeite, seite * proSeite), seitenZahl,
             alleGeladen ? t.length : null);
    };
    if (alleGeladen) {                     // alles da → sofort und ohne Balken
      ladeAnzeige(false);
      zeichneTreffer();
      if (scrollen) nachObenScrollen();
      return;
    }
    ladeAnzeige(true);                     // SOFORT sichtbar, vor dem ersten Abruf
    zeichneTreffer();                      // zeigt schon, was bereits geladen ist
    alleHolen(zeichneTreffer).then(function () {
      zeichneTreffer();
      ladeAnzeige(false);                  // MUSS in jedem Fall aus (war der Hänger)
      if (scrollen) nachObenScrollen();
    }, function () { ladeAnzeige(false); });
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
    /* Gleitendes Fenster aus CFG.fensterSeiten Zahlen um die aktuelle Seite.
       Bewusst OHNE Sprung auf die letzte Seite: die besten Ergebnisse stehen
       vorn, ein „31" lädt nur zum Wegspringen ein. Punkte zeigen an, dass davor
       bzw. dahinter noch mehr kommt.
         Seite 1  →  1 2 3 4 5 …
         Seite 5  →  … 3 4 5 6 7 …
         Seite 31 →  … 27 28 29 30 31          */
    var fenster = Math.max(1, CFG.fensterSeiten);
    var start = Math.min(Math.max(1, seite - Math.floor(fenster / 2)), Math.max(1, gesamt - fenster + 1));
    var ende = Math.min(start + fenster - 1, gesamt);

    var punkte = function () {
      if (!dotsTmpl) return;
      var pt = dotsTmpl.cloneNode(true);
      pt.classList.add("kl-page");
      pt.removeAttribute("fs-cmsload-element");
      pt.style.display = "";
      zahlenBox.appendChild(pt);
    };

    if (start > 1) punkte();
    for (var n = start; n <= ende; n++) {
      (function (nr) {
        var b = btnTmpl.cloneNode(true);
        b.classList.add("kl-page");
        b.removeAttribute("fs-cmsload-element");
        b.style.display = "";
        var innen = b.firstElementChild || b;
        innen.textContent = String(nr);
        b.setAttribute("href", "?" + pagParam + "=" + nr);
        b.classList.toggle(CFG.aktivKlasse, nr === seite);
        if (nr === seite) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
        b.addEventListener("click", function (e) { e.preventDefault(); geheZuSeite(nr); });
        zahlenBox.appendChild(b);
      })(n);
    }
    if (ende < gesamt) punkte();

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
    var geaendert = s.input.checked !== an;
    s.input.checked = an;
    var box = s.label.querySelector(".w-checkbox-input");   // Webflow zeichnet die Box als DIV
    if (box) box.classList.toggle("w--redirected-checked", an);
    optikEins(s, an);
    return geaendert;
  }

  /* Der gelbe Aktiv-Zustand hängt an der Klasse .fs-cmsfilter_active auf dem
     Label (so hat Finsweet ihn gesetzt, so ist er im Designer gestylt).
     Beim Klick setzt sie sonst niemand mehr — also machen wir das. */
  function optikEins(s, an) {
    s.label.classList.toggle("fs-cmsfilter_active", an);
    s.label.classList.toggle("kl-aktiv", an);              // neutrale Zweitklasse
  }
  function optikSync() {
    CFG.urlFelder.forEach(function (feld) {
      steuerungen(feld).forEach(function (s) { optikEins(s, s.input.checked); });
    });
  }

  function urlLesen() {
    var p = new URLSearchParams(location.search);
    sperre = true;
    CFG.urlFelder.forEach(function (feld) {
      var soll = (p.get(feld) || "").split(",").map(function (v) { return v.trim().toLowerCase(); }).filter(Boolean);
      steuerungen(feld).forEach(function (s) { setzeBox(s, soll.indexOf(s.wert) !== -1); });
    });
    if (suchFeld) suchFeld.value = p.get(CFG.suchParam) || "";
    angewandteSuche = p.get(CFG.suchParam) || "";
    optikSync();
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
    if (angewandteSuche) p.set(CFG.suchParam, angewandteSuche);
    if (seite > 1) p.set(pagParam, String(seite));
    /* URLSearchParams kodiert Kommas als %2C. In einer Query ist das Komma
       laut RFC 3986 erlaubt — also selbst zusammenbauen, das liest sich besser:
       ?kategorie=natur,tiere statt ?kategorie=natur%2Ctiere */
    var teile = [];
    p.forEach(function (v, k) { teile.push(encodeURIComponent(k) + "=" + encodeURIComponent(v).replace(/%2C/gi, ",")); });
    var neu = location.pathname + (teile.length ? "?" + teile.join("&") : "") + location.hash;
    if (neu !== location.pathname + location.search + location.hash) history.pushState({ kl: 1 }, "", neu);
  }

  /* ── Neue Suche starten ────────────────────────────────────────
     Alles zurück auf Anfang: Haken raus, Suchfeld leer, saubere URL,
     Seite 1 — ohne Neuladen. Ausgelöst per Event, damit die Webflow-
     Komponente nichts über den Aufbau dieses Skripts wissen muss:

       window.dispatchEvent(new CustomEvent("kl:neu-suchen"))

     Gescrollt wird zum Seitenanfang (CFG.seitenAnfangId), NICHT zur
     Liste — anders als beim Blättern soll man oben wieder anfangen. */
  function zumSeitenanfang() {
    var ziel = d.getElementById(CFG.seitenAnfangId);
    var y = ziel ? ziel.getBoundingClientRect().top + window.pageYOffset : 0;
    var weich = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, y), behavior: weich ? "smooth" : "auto" });
  }

  function neueSuche() {
    sperre = true;                                   // kein URL-Schreiben je Haken
    CFG.urlFelder.forEach(function (feld) {
      steuerungen(feld).forEach(function (s) { setzeBox(s, false); });
    });
    if (suchFeld) suchFeld.value = "";
    angewandteSuche = "";
    seite = 1;
    sperre = false;
    optikSync();
    urlSchreiben();
    zeichne(false);                                  // scrollt selbst nicht
    zumSeitenanfang();
    log("neue Suche");
  }

  window.addEventListener("kl:neu-suchen", function () { neueSuche(); });

  var tippTimer = null;
  if (filterForm) {
    filterForm.addEventListener("change", function (e) {
      if (!e.target.closest("label")) return;
      optikSync();                                        // gelber Aktiv-Zustand
      ladeAnzeige(true);                                  // sofort Rückmeldung
      seite = 1; urlSchreiben(); zeichne(false);          // Filtern scrollt NICHT
    });
    filterForm.addEventListener("submit", function (e) { e.preventDefault(); });
  }
  if (suchFeld) {
    /* Optionaler Hinweis im Feld. Standardmäßig aus: die Suche filtert live
       (gemessen 1,4 ms je Tastendruck, null Netzabrufe), Enter erzwingt also
       nichts — es wendet nur sofort an und schließt auf dem Handy die Tastatur.
       Ein Hinweis würde eine Funktion ankündigen, die es so nicht gibt.
       Zum Einschalten in der CFG einen Text eintragen. */
    var hinweis = null, feldEltern = suchFeld.parentElement;
    if (CFG.enterHinweis && feldEltern) {
      hinweis = d.createElement("span");
      hinweis.className = "kl-suchhinweis";
      hinweis.textContent = CFG.enterHinweis;
      hinweis.setAttribute("aria-hidden", "true");
      if (getComputedStyle(feldEltern).position === "static") feldEltern.style.position = "relative";
      feldEltern.appendChild(hinweis);
    }
    var hinweisSetzen = function () {
      if (!hinweis || !feldEltern) return;
      var zeigen = !!suchFeld.value.trim();
      hinweis.style.opacity = zeigen ? "" : "0";
      if (!zeigen) return;
      hinweis.style.top = (suchFeld.offsetTop + suchFeld.offsetHeight / 2) + "px";
      hinweis.style.right = (feldEltern.clientWidth - suchFeld.offsetLeft - suchFeld.offsetWidth
                             + CFG.enterHinweisAbstand) + "px";
    };

    var suchen = function (sofort) {
      var wert = suchFeld.value.trim();
      /* Zu kurz zählt wie leer — sonst zeigt die Liste noch Treffer zu
         „hund", während im Feld nur „h" steht. */
      if (wert.length < CFG.sucheMinZeichen) wert = "";
      begriffSuchen(wert, false);
      hinweisSetzen();
    };

    suchFeld.addEventListener("input", function () {
      hinweisSetzen();
      clearTimeout(tippTimer);
      if (CFG.sucheAbEnter) {
        if (!suchFeld.value.trim() && angewandteSuche) suchen(true);   // Leeren wirkt sofort
        return;
      }
      tippTimer = setTimeout(function () { suchen(false); }, CFG.sucheVerzoegerungMs);
    });
    suchFeld.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(tippTimer);
        suchen(true);
        suchFeld.blur();                                  // schließt die Tastatur auf dem Handy
      } else if (e.key === "Escape" && suchFeld.value) {
        suchFeld.value = ""; clearTimeout(tippTimer); suchen(true);
      }
    });
    suchFeld.addEventListener("focus", hinweisSetzen);
    suchFeld.addEventListener("blur", function () { setTimeout(hinweisSetzen, 120); });
    window.addEventListener("resize", hinweisSetzen);
    hinweisSetzen();
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
    vorschlaegeVorbereiten();          // muss VOR dem ersten Rendern laufen
    ladeAnzeige(false);
    urlLesen();
    videosBinden(d);
    /* Nur neu rendern, wenn die URL etwas verlangt — sonst bleibt das
       server-gerenderte Seite-1-Markup unangetastet stehen (schnellster Start). */
    if (istGefiltert() || seite !== 1) zeichne(false);
    else {
      /* Seite 1 kommt fertig vom Server, render() läuft hier absichtlich NICHT.
         Dann muss der Zustand von Hand auf den ausgelieferten Stand gesetzt
         werden — sonst meldet die Statusanzeige Werte, die nie gezählt wurden. */
      laufendeAnzahl = seiten[1].length;
      laufendeSeiten = Math.max(gesamtSeiten, 1);
      laufendeGesamt = ungefiltertGesamt();
      statusAktualisieren();
      paginationBauen(gesamtSeiten);
    }
    /* Katalog im HINTERGRUND vorladen, sobald die Seite fertig ist.
       Der erste Bildaufbau bleibt unangetastet (nichts davor), aber wer nach
       ein paar Sekunden filtert, bekommt das Ergebnis sofort — das ist der
       Punkt, an dem die alte Fassung sich zäh angefühlt hat. */
    var vorladen = function () {
      if (!ladeVersprechen && !alleGeladen) {
        if (!gesamtSicher && pagParam) gesamtErmitteln().then(function () { alleHolen(null, true); });
        else alleHolen(null, true);
      }
    };
    if (d.readyState === "complete") idle(vorladen, 800);
    else window.addEventListener("load", function () { idle(vorladen, 800); });
    log("bereit", { seiten: gesamtSeiten, proSeite: proSeite, param: pagParam });
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start);
  else start();

  window.klStock = {
    version: "3.4.0",
    zustand: function () {
      return {
        seite: seite, gesamtSeiten: gesamtSeiten, proSeite: proSeite,
        alleGeladen: alleGeladen, geladeneSeiten: Object.keys(seiten).length,
        gefiltert: istGefiltert(), treffer: istGefiltert() && alleGeladen ? treffer().length : null,
        status: d.documentElement.getAttribute("data-kl-liste"),
        ende: d.documentElement.hasAttribute("data-kl-ende"),
        karten: qsa(".u-link-cover").length,
        gebunden: qsa(".u-link-cover[data-kl-hover]").length
      };
    },
    geheZuSeite: geheZuSeite,
    zeichne: zeichne,
    alleHolen: alleHolen,
    neueSuche: neueSuche
  };
})();
