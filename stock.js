/*!
 * kataloop-stock.js v3.5.0
 * Eigene Filter-, Blätter- und Video-Logik für die Stock-Collection.
 * -----------------------------------------------------------------------------
 * Ersetzt vollständig:  attributes@2, attributes-cmsfilter@1, attributes-cmsload@1
 *                       + die drei eigenen Snippets (History-Blocker,
 *                         URL-Übernahme, Hover-Video)
 * Keine externe Abhängigkeit. Eine Datei, ~22 KB (~8,3 KB gzip).
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
 *   data-kl-text="auswahl"  Suchbegriff UND angehakte Filter, lesbar
 * Die Auswahl steht ausserdem als data-kl-auswahl am <html>.
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
 *     <span data-kl-vorschlag-label>Probiere:</span>   ← optional, s. u.
 *     <a data-kl-vorschlag-vorlage class="…">Vorlage</a>
 *     <a class="…">Feste Auswahl, falls nichts passt</a>
 *   </div>
 * Hat die Vorlage inneres Markup, bekommt [data-kl-vorschlag-text] den Text.
 * [data-kl-vorschlag-label] ist ein einleitender Text („Probiere:"), der VOR
 * den Chips steht und nur sichtbar ist, solange welche da sind (echte
 * Vorschläge ODER feste Auswahl) — nie im ganz leeren Container.
 *
 * EINBINDUNG (Webflow, vor </body>) — sonst nichts:
 *   <script src="https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v3.10.2/stock.min.js"></script>
 *
 * Ereignisse:
 *   window.addEventListener("kl:rendered", e => e.detail.items)   // nach jedem Rendern
 *   window.dispatchEvent(new CustomEvent("kl:neu-suchen"))        // alles zurücksetzen
 */
(function () {
  "use strict";

  var CFG = {
    suchFeldId: "Search",          // Eingabefeld der Volltextsuche
    /* Nur der Startwert — wird beim Start aus dem Markup ueberschrieben
       (deutsche vs. englische Feldnamen, s. FELD_SAETZE). */
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
    sucheBeimSprachwechsel: true,  // Suchbegriff in den Sprachumschalter-Link mitnehmen
    vorschlaegeMax: 4,             // so viele Gegenvorschläge höchstens
    /* Beschriftung des Chips, der bei „Begriff ok, Filter schliesst aus"
       erscheint. %n wird durch die Trefferzahl ohne Filter ersetzt.
       Sprache nach <html lang>. */
    ohneFilterText: { de: "Ohne Filter (%n)", en: "Without filters (%n)" },
    blendenMs: 300,                // Ein-/Ausblenden der Status-Hüllen
    /* Die ersten Bilder above-fold hoch priorisieren (loading=eager +
       fetchpriority=high). Anzahl je Viewport-Breite: [abBreite, anzahl],
       absteigend, die erste passende Stufe gilt. Auf grossen Monitoren viele,
       auf Mobile (< 768) keine. Werte frei anpassbar; nur Seite 1. */
    eagerStufen: [[1920, 26], [1440, 20], [1280, 14], [992, 10], [768, 6], [0, 0]]
  };

  var VERSION = "3.10.2";
  var d = document;
  var qs = function (s, r) { return (r || d).querySelector(s); };
  var qsa = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var log = function () { if (window.__klStockDebug) console.log.apply(console, ["[kl-stock]"].concat([].slice.call(arguments))); };

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

  /* ── Grundelemente ─────────────────────────────────────────────── */
  var listWrap = qs('[fs-cmsfilter-element="list"], [fs-cmsload-element="list"], [data-kl-list]');
  /* Ohne Collection-Liste gibt es nichts zu filtern, zu blaettern und zu
     suchen — Hover-Videos gibt es aber trotzdem. Die Einzelseiten zeigen
     verwandte Motive in eigenen Listen, die nicht als Stock-Liste getaggt
     sind; frueher stieg das Skript hier komplett aus, weshalb dort ein
     eigenes Snippet im Footer noetig war. Das konnte nur Hover — nicht die
     Mittig-im-Bild-Automatik auf Touch, nicht das faule Metadaten-Laden und
     nicht prefers-reduced-motion. Seit v3.10.1 wird die Video-Logik auch
     ohne Liste gebunden und alles Uebrige uebersprungen; das Snippet kann
     ersatzlos weg. Deshalb steht die Video-Sektion oben: sie darf nicht
     hinter diesem return liegen. */
  if (!listWrap) {
    var nurVideos = function () { videosBinden(d); log("keine Liste — nur Video-Logik gebunden"); };
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", nurVideos);
    else nurVideos();
    window.klStock = { version: VERSION, nurVideo: true, videosBinden: videosBinden };
    return;
  }
  var itemsBox = qs(".w-dyn-items", listWrap) || listWrap;
  var filterForm = qs('[fs-cmsfilter-element="filters"], [data-kl-filters]');

  /* ── Feldnamen je Sprache erkennen ──────────────────────────────
     Webflow lokalisiert nicht nur die Inhalte, sondern auch die FELDNAMEN:
     auf /en heissen die Filter category/type/license/orientation statt
     kategorie/typ/lizenz/ausrichtung — und die WERTE ebenso (animals statt
     tiere, photo statt foto). Finsweet las die Namen aus dem Markup und lief
     deshalb auf beiden Locales; diese Engine hatte sie seit v1.0.0 fest
     verdrahtet, wodurch auf /en NICHTS filterte (gemessen: 0 gefundene
     Steuerungen gegen 246 vorhandene "category"-Elemente).

     Erkannt wird am DOM, nicht an <html lang>: das Markup ist die Wahrheit.
     Gewaehlt wird der Satz mit den MEISTEN Treffern, nicht der erste mit
     irgendeinem — auf der englischen Seite liegt vereinzelt noch ein alter
     deutscher Name herum (1x "kategorie" gegen 250x "category").
     Weitere Sprachen brauchen nur eine Zeile mehr. */
  var FELD_SAETZE = {
    de: ["kategorie", "typ", "lizenz", "ausrichtung"],
    en: ["category", "type", "license", "orientation"]
  };
  var FELD_SPRACHE = "de";           // welcher Satz steht in DIESEM Markup?
  (function feldnamenWaehlen() {
    var beste = -1;
    Object.keys(FELD_SAETZE).forEach(function (spr) {
      var n = 0;
      FELD_SAETZE[spr].forEach(function (f) {
        n += qsa('[fs-cmsfilter-field="' + f + '"], [data-kl-field="' + f + '"]').length;
      });
      if (n > beste) { beste = n; FELD_SPRACHE = spr; }
    });
    CFG.urlFelder = FELD_SAETZE[FELD_SPRACHE];
    log("Filterfelder:", FELD_SPRACHE, CFG.urlFelder.join(", "), "(" + beste + " Elemente)");
  })();

  /* ── Filterwerte zwischen den Sprachen ──────────────────────────
     Webflow lokalisiert auch die WERTE (tiere ↔ animals). Beim Wechsel der
     Sprache soll die getroffene Auswahl erhalten bleiben, statt wie bisher
     verloren zu gehen — der native Umschalter setzt feste Links ohne
     Parameter.

     Bewusst FEST hinterlegt statt aus der Reihenfolge abgeleitet: die
     Kategorien stehen auf der Live-Seite zwar in beiden Sprachen gleich
     sortiert, aber die Staging-Seite zeigt gerade, dass sich das mit einer
     Designer-Aenderung verschiebt. Eine Tabelle ist langweilig und haelt.
     Quelle: Topics-Collection (beide Locales) + die Filterlisten beider
     Live-Seiten, 17 Kategorien plus die drei festen Filtergruppen.

     Waechst die Collection, gehoert hier eine Zeile dazu; ein unbekannter
     Wert faellt beim Wechsel einfach weg (und wird protokolliert), statt
     einen kaputten Filter zu erzeugen. */
  var WERT_DE_EN = {
    filmfotografie: "film-photography", loop: "loop", zeitraffer: "timelapse",
    cinemagraph: "cinemagraph", natur: "nature", tiere: "animals",
    "staedte-gebaeude": "cities-buildings", luftaufnahme: "aerial-photography",
    dinge: "things", "reisen-urlaub": "travel-vacation", arbeit: "work",
    menschen: "people", studio: "studio", hintergrund: "background",
    textur: "texture", "abstrakt-kreativ": "abstract-creative", symbolisch: "symbolic",
    foto: "photo", video: "video",
    kommerziell: "commercial", redaktionell: "editorial",
    hochformat: "portrait", querformat: "landscape"
  };
  var WERT_EN_DE = (function () {
    var r = {};
    for (var k in WERT_DE_EN) if (WERT_DE_EN.hasOwnProperty(k)) r[WERT_DE_EN[k]] = k;
    return r;
  })();

  function feldUebersetzen(feld, ziel) {
    var i = FELD_SAETZE[FELD_SPRACHE].indexOf(feld);
    return (i === -1 || !FELD_SAETZE[ziel]) ? null : FELD_SAETZE[ziel][i];
  }
  function wertUebersetzen(wert, ziel) {
    var tab = ziel === "en" ? WERT_DE_EN : WERT_EN_DE;
    return tab[wert] || null;
  }
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

  /* ── Füllwörter (Stoppwörter) ───────────────────────────────────
     Wer „tomaten tauchen in wasser" tippt, soll dieselben Treffer wie
     „tomaten tauchen wasser" bekommen. Alle Suchwörter müssen vorkommen
     (siehe treffer()) — Artikel, Verhältnis- und Bindewörter stehen aber
     in keinem Stock-Schlagwort und würden die Trefferzahl als Pflichtwort
     auf null drücken. Sie fliegen VOR dem Vergleich raus. Anzeige-Text
     (data-kl-text="suche") und URL bleiben unberührt: die lesen
     angewandteSuche roh, nicht suchBegriffe().

     BEWUSST NICHT in der Liste:
     - Verneinung/Ausschluss (ohne, kein, nicht, without, no) — sie KEHREN
       die Bedeutung um; „haus ohne menschen" dürfte nicht zu „haus menschen"
       werden. Als Pflichtwort geben sie 0 Treffer + Vorschläge, das ist
       ehrlicher als das Gegenteil zu zeigen.
     - Zwiebelwörter, die in der jeweils anderen Sprache Inhalt sind:
       „war" (Krieg), „man" (Mann), „will", „see" (der See!), „it" (IT).
       Ihr stummes Streichen würde echte Suchen zerstören.
     Alles in norm()-Form (klein, ä→ae, ö→oe, ü→ue). Liste bei Bedarf
     ergänzbar. */
  var FUELL = {
    /* neutral in DE & EN — immer sicher */
    in:1, im:1, an:1, am:1, auf:1, aus:1, bei:1, beim:1, mit:1, nach:1,
    von:1, vom:1, zu:1, zum:1, zur:1, ueber:1, unter:1, vor:1, hinter:1,
    neben:1, zwischen:1, durch:1, fuer:1, gegen:1, um:1, ins:1, ans:1, aufs:1,
    und:1, oder:1, aber:1, sondern:1, sowie:1, denn:1,
    als:1, wie:1, wenn:1, weil:1, dass:1, ob:1,
    der:1, das:1, den:1, dem:1, des:1,
    ein:1, eine:1, einen:1, einem:1, einer:1, eines:1,
    ich:1, du:1, er:1, es:1, sie:1, wir:1, ihr:1,
    mich:1, dich:1, sich:1, uns:1, euch:1,
    dieser:1, diese:1, dieses:1, dies:1, hier:1, dort:1, dann:1,
    /* DE Hilfsverben & Partikel — gegen den echten Katalog kollisionsgeprüft
       (kein Treffer in Tags/Titel/Ort). Bewusst NICHT dabei: „waren" (=Waren),
       „will", „war" (=Krieg) — das sind Inhaltswörter. */
    ist:1, sind:1, hat:1, haben:1, wird:1, werden:1, wurde:1, wurden:1,
    auch:1, noch:1, nur:1, schon:1, sehr:1, mehr:1,
    /* Englisch */
    the:1, and:1, or:1, but:1, nor:1, of:1, to:1, for:1, with:1, from:1, by:1,
    into:1, onto:1, over:1, under:1, up:1, off:1, out:1, as:1, on:1, at:1,
    is:1, are:1, was:1, were:1, be:1, been:1, being:1,
    this:1, that:1, these:1, those:1, he:1, she:1, they:1, we:1, you:1,
    your:1, our:1, my:1, here:1, there:1, then:1,
    /* EN Verhältniswörter & Hilfsverben — ebenfalls kollisionsgeprüft.
       „near" fehlt bewusst (kam im Katalog als Inhalt vor). */
    around:1, above:1, below:1, behind:1, beside:1, between:1, during:1,
    along:1, across:1, toward:1, towards:1, inside:1, outside:1, within:1,
    has:1, have:1, had:1, its:1, also:1, just:1, than:1, too:1, about:1
  };
  /* „die" ist DE-Artikel, aber EN-Inhaltswort — nur strippen, wenn die
     Seite nicht ausdrücklich englisch ist (deutsche Seite ist Standard). */
  var SPRACHE = (d.documentElement.getAttribute("lang") || "").slice(0, 2).toLowerCase();
  if (SPRACHE !== "en") FUELL.die = 1;

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
    /* Quelle für die „Meintest du …?"-Vorschläge: NUR Tags + Titel — die
       kuratierten Felder. Die übrigen Suchfelder (Ort, Land, Kamera, Objektiv,
       Kataloop-ID) sollen keine Vorschläge stellen: „berlin", „sony" oder eine
       ID helfen bei einem Tippfehler nicht weiter. Fällt beides leer aus, wird
       auf den vollen Suchtext zurückgegriffen, damit nie gar nichts vorschlägt. */
    var vq = norm(((felder.tags || []).join(" ")) + " " + ((felder.title || []).join(" ")));
    return { el: el, felder: norm2, such: text, vorschlag: vq || text,
             flach: flachT, flachstamm: stammText(flachT) };
  }

  /* Seite 1 steht bereits im HTML (gut für SEO und den ersten Aufbau). */
  seiten[1] = qsa(":scope > .w-dyn-item", itemsBox).map(bauItem);
  if (!seiten[1].length) seiten[1] = qsa(".w-dyn-item", itemsBox).map(bauItem);
  proSeite = seiten[1].length || 1;

  /* Die ersten Bilder above-fold hoch priorisieren. Webflow gibt ALLEN Karten
     loading="lazy" — auch der obersten Reihe (am Staging-HTML gezählt: 168 lazy,
     1 eager). Lazy-Bilder bekommen in Chrome NIEDRIGE Netzwerkpriorität, genau
     das kostet LCP. Die ersten N Karten (N je Viewport-Breite, CFG.eagerStufen)
     bekommen loading="eager" + fetchpriority="high". So früh wie möglich (hier,
     direkt beim Skript-Lauf, nicht erst bei DOMContentLoaded), damit der Browser
     die Priorität noch vor dem Fetch sieht. Bewusst OHNE getBoundingClientRect:
     das erzwänge ein Reflow, und das Raster-Layout muss hier noch nicht stehen —
     die Stufen decken den sichtbaren Bereich je Breite ab. Nur Seite 1. */
  (function priorisiereErste() {
    var breite = window.innerWidth || d.documentElement.clientWidth || 0;
    var anzahl = 0;
    for (var s = 0; s < CFG.eagerStufen.length; s++) {
      if (breite >= CFG.eagerStufen[s][0]) { anzahl = CFG.eagerStufen[s][1]; break; }
    }
    if (anzahl <= 0) return;
    var n = 0;
    for (var i = 0; i < seiten[1].length && n < anzahl; i++) {
      var img = qs("img.cc-stock-tmb", seiten[1][i].el) || qs("img", seiten[1][i].el);
      if (!img) continue;                        // z. B. reine Video-Karte
      img.setAttribute("loading", "eager");
      img.setAttribute("fetchpriority", "high");
      n++;
    }
    if (n) log("Eager:", n, "Bilder priorisiert (Breite", breite + ")");
  })();

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
      "font-size:.72em;letter-spacing:.02em;opacity:.45;transition:opacity .15s;white-space:nowrap}" +
    /* Status-Huellen blenden weich ein und aus, statt zu springen. display
       laesst sich nicht animieren - deshalb erst sichtbar schalten, dann die
       Deckkraft fahren, und beim Ausblenden umgekehrt. */
    "[data-kl-zeigen]{transition:opacity " + CFG.blendenMs + "ms linear}" +
    "[data-kl-zeigen].kl-aus{opacity:0}" +
    "@media (prefers-reduced-motion: reduce){[data-kl-zeigen]{transition:none}}";
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

  /* Nachgeladen wird IMMER über eine blanke URL: origin + pathname + Seitenzahl.
     Bewusst NICHT location.href — das schleppte die aktuellen Parameter mit
     (`?tags=koeln&…_page=2`). Cloudflare nimmt die komplette Query-String in
     den Cache-Schlüssel, also erzeugte jeder neue Suchbegriff 31 URLs, die
     noch nie jemand angefragt hatte: alle MISS, alle bis zum Webflow-Origin.
     Gemessen auf Staging, eine Welle à 12 Seiten:
       sauber (von allen Nutzern geteilt) →  0,28 s   [HIT]
       mit Suchbegriff in der URL         →  4,19 s   [MISS]   ~15× langsamer
     Einzelabruf: 0,08 s gegen 2,24 s. Auf 32 Seiten macht das ~1 s statt ~12 s.
     Die Parameter dürfen weg, weil Webflow sie serverseitig ignoriert — an
     tags, kategorie, typ, lizenz und ausrichtung geprüft, die Antwort ist
     jeweils byte-identisch zur blanken Seite. Nur der Seiten-Parameter wirkt.
     So kommen alle Nutzer und alle Suchen auf DIESELBEN 31 URLs, die damit
     dauerhaft im CDN liegen. (Finsweet machte es genauso: origin + pathname.) */
  function seiteHolen(n) {
    if (seiten[n]) return Promise.resolve(seiten[n]);
    if (!pagParam) return Promise.resolve([]);
    var u = new URL(location.pathname, location.origin);
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

  var ermittlungPromise = null;
  function gesamtErmitteln() {
    if (gesamtSicher || !pagParam) return Promise.resolve(gesamtSeiten);
    if (ermittlungPromise) return ermittlungPromise;   // läuft bereits — nicht doppelt
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
    ermittlungPromise = hoch(2).then(binaer).then(function () {
      gesamtSeiten = Math.max(1, lo);
      gesamtSicher = true;
      inSpeicher(gesamtSeiten);
      log("Seitenzahl ermittelt:", gesamtSeiten, "| geholte Seiten:", Object.keys(seiten).length);
      if (!istGefiltert()) paginationBauen(gesamtSeiten);
      statusAktualisieren();          // „Ende"-Zustand jetzt mit sicherer Zahl neu bewerten
      return gesamtSeiten;
    });
    return ermittlungPromise;
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

    /* Ausgeschaltet wird die Ladeanzeige nur von dem Lauf, der sie auch
       eingeschaltet hat. Sonst passiert Folgendes: laeuft das Vorladen schon,
       haengt sich eine Suche per `return ladeVersprechen` daran; der
       Hintergrund-Abschluss meldete dann „fertig", BEVOR der Vordergrund neu
       gezeichnet hat — fuer einen Moment stand der Zaehler noch auf 0 und der
       Leerhinweis erschien. Ungebremst war das ein einziger Frame und damit
       unsichtbar; mit dem weichen Blenden wurden daraus 300 ms. */
    ladeVersprechen = naechste().then(function () {
      alleGeladen = true; gesamtSicher = true; ladeVersprechen = null;
      inSpeicher(gesamtSeiten);
      if (!hintergrund) ladeAnzeige(false);
      log("Katalog vollständig:", gesamtSeiten, "Seiten");
    }, function (e) {
      ladeVersprechen = null;
      if (!hintergrund) ladeAnzeige(false);
      log("Katalog-Fehler", e);
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
        /* `wert` bleibt kleingeschrieben (Logik/URL), `text` ist die
           Beschriftung, wie sie dasteht - die zeigen wir der Nutzerin. */
        return input ? { input: input, label: label,
                         wert: (w.textContent || "").trim().toLowerCase(),
                         text: (w.textContent || "").trim() } : null;
      /* Leere Wert-Träger verwerfen. Auf der englischen Seite hängt
         fs-cmsfilter-field zusätzlich am (textlosen) Form-Label, also zweimal
         je Checkbox: 26 Träger auf 13 Kategorien, 13 davon leer. aktiveFilter()
         sammelte den Leerwert mit ein und schrieb "?category=animals," — mit
         Komma am Ende. Gefiltert wurde trotzdem richtig (die Werte einer
         Gruppe sind ODER-verknüpft), nur die URL war unsauber. Auf der
         deutschen Seite gibt es das Muster nicht (17 Träger, 0 leer).
         Verwerfen ist gefahrlos: beide Träger liegen im SELBEN Label, die
         Checkbox bleibt über ihren Wert-Träger erreichbar — an 13 Labels /
         13 Checkboxen nachgezählt. Ein leerer Wert könnte ohnehin nie
         treffen, denn feldWerte() legt leere Feldwerte gar nicht erst ab. */
      }).filter(function (s) { return s && s.wert; });
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
    if (!angewandteSuche) return [];
    var alle = norm(angewandteSuche).split(" ")
      .filter(function (w) { return w.length >= CFG.sucheMinZeichen; });
    var ohneFuell = alle.filter(function (w) { return !FUELL[w]; });
    /* Nur entfernen, wenn ein sinntragendes Wort übrig bleibt — sonst würde
       „the"/„und" allein plötzlich den ganzen Katalog zeigen statt nichts. */
    return ohneFuell.length ? ohneFuell : alle;
  }

  function istGefiltert() {
    return Object.keys(aktiveFilter()).length > 0 || suchBegriffe().length > 0;
  }

  /* Muster EINMAL je Suche bauen, nicht je Motiv — bei 3.100 Einträgen
     macht das den Unterschied zwischen flüssig und spürbar. */
  function musterBauen(begriffe) {
    return begriffe.map(function (b) {
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
  }

  /* Punkte eines Motivs für die ganze Frage — 0 heisst „passt nicht".
     ALLE Suchwörter müssen vorkommen. */
  function punkteFuer(it, muster) {
    var summe = 0;
    for (var k = 0; k < muster.length; k++) {
      var m = muster[k], p = 0;
      if (m.exakt.test(it.such)) p = 3;            // „blume" = Tag „Blume"
      else if (m.anfang.test(it.such) || m.ende.test(it.such)) p = 2;  // Blumenstrauß, Bauernhaus
      else if (m.fExakt.test(it.flach) || m.fAnfang.test(it.flach)
            || m.fEnde.test(it.flach)) p = 2;      // „kuste" → Küste, Küstenlandschaft
      else if (m.fExakt.test(it.flachstamm)        // Frage ist die Grundform des Wortes
            || m.fStamm.test(it.flach)             // Grundform der Frage ist das Wort
            || m.fStamm.test(it.flachstamm)) p = 1;   // beide auf Grundform gleich
      if (!p) return 0;
      summe += p;
    }
    return summe;
  }

  /* Filtergruppen sind UND-verknüpft, Werte innerhalb einer Gruppe ODER. */
  function filterPasst(it, f, felder) {
    for (var i = 0; i < felder.length; i++) {
      var soll = f[felder[i]], hat = it.felder[felder[i]] || [], ok = false;
      for (var j = 0; j < soll.length; j++) if (hat.indexOf(soll[j]) !== -1) { ok = true; break; }
      if (!ok) return false;
    }
    return true;
  }

  function treffer() {
    var f = aktiveFilter(), felder = Object.keys(f), begriffe = suchBegriffe();
    var muster = musterBauen(begriffe);
    var liste = alleItems().filter(function (it) {
      if (!filterPasst(it, f, felder)) return false;
      var p = punkteFuer(it, muster);
      if (!p && muster.length) return false;
      it.punkte = p;
      return true;
    });

    /* Rangfolge nur bei aktiver Suche: exakte Treffer zuerst. Damit landet
       bei „Reis" der echte Reis oben und die Reise-Motive darunter. */
    if (begriffe.length) liste.sort(function (a, b) { return b.punkte - a.punkte; });
    return liste;
  }

  /* Wie viele Treffer haette die Suche OHNE die angehakten Filter?
     Damit unterscheidet der Leerzustand zwei sehr verschiedene Faelle:
     „den Begriff gibt es nicht" gegen „den Begriff gibt es, nur nicht in
     dieser Kategorie". Belegter Fall: ?kategorie=tiere&tags=koelner ergab 0
     und bot Tippfehler-Korrekturen an — dabei ist „koelner" richtig
     geschrieben und liefert ohne den Filter 10 Treffer (Koelner Dom …). */
  function trefferOhneFilter() {
    var begriffe = suchBegriffe();
    if (!begriffe.length) return 0;
    var muster = musterBauen(begriffe), items = alleItems(), n = 0;
    for (var i = 0; i < items.length; i++) if (punkteFuer(items[i], muster)) n++;
    return n;
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
     geladenen Motiven bauen — nur aus Tags + Titel (Feld `vorschlag`), nicht
     aus Ort/Kamera/ID — und darin die nächstliegenden Wörter suchen.

     Gebaut wird es erst, wenn es gebraucht wird — also frühestens bei der
     ersten erfolglosen Suche. Und dann ist der Katalog garantiert
     vollständig, denn der Leerzustand erscheint überhaupt erst, wenn die
     Ladephase durch ist.

     Angenehmer Nebeneffekt: jeder Vorschlag stammt aus einem echten Motiv,
     kann also nie ins Leere führen. */
  var wortIndex = null, wortIndexSchluessel = null;
  var NUR_BUCHSTABEN = /^[a-z]+$/;   // norm() hat Umlaute schon zu ae/oe/ue gemacht

  /* Kennung der angehakten Filter — aendert sie sich, muss das Verzeichnis neu
     gebaut werden (es enthaelt ja nur noch Woerter aus der Filtermenge). */
  function filterSchluessel() {
    var f = aktiveFilter();
    return Object.keys(f).sort().map(function (k) {
      return k + "=" + f[k].slice().sort().join("|");
    }).join(";");
  }

  /* Das Verzeichnis enthaelt NUR Woerter aus Motiven, die die aktiven Filter
     passieren. Ohne das schlug die Suche Begriffe vor, die es zwar im Katalog
     gibt, in der gewaehlten Kategorie aber nicht — belegter Fall:
     ?kategorie=tiere&tags=koelner schlug „Koeln" vor, und ein Klick darauf
     fuehrte wieder auf 0 Treffer (Koeln liegt in staedte-gebaeude,
     filmfotografie …, in tiere in keinem einzigen Motiv). Damit gilt die
     Zusage weiter unten wieder: jeder Vorschlag liefert echte Treffer. */
  function wortIndexBauen() {
    var t0 = Date.now();
    var zaehl = Object.create(null);
    var f = aktiveFilter(), felder = Object.keys(f);
    for (var n in seiten) {
      if (!seiten.hasOwnProperty(n)) continue;
      for (var i = 0; i < seiten[n].length; i++) {
        if (felder.length && !filterPasst(seiten[n][i], f, felder)) continue;
        var worte = (seiten[n][i].vorschlag || seiten[n][i].such).split(" ");
        for (var j = 0; j < worte.length; j++) {
          var t = worte[j];
          /* Nur echte Wörter: mindestens vier Buchstaben, keine Ziffern.
             Die Quelle ist ohnehin schon auf Tags + Titel beschränkt; das hier
             hält zusätzlich Zahl-Tags und sehr kurze Kürzel („4k", Jahreszahlen)
             aus den Vorschlägen. Gesucht werden kann danach weiterhin, das hier
             betrifft nur die Vorschläge. */
          if (t.length < 4 || !NUR_BUCHSTABEN.test(t)) continue;
          zaehl[t] = (zaehl[t] || 0) + 1;
        }
      }
    }
    var liste = [];
    for (var wort in zaehl) liste.push([wort, zaehl[wort]]);
    log("Wortverzeichnis:", liste.length, "Wörter in", Date.now() - t0, "ms",
        felder.length ? "(auf Filter eingeschränkt)" : "(ganzer Katalog)");
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
    var schluessel = filterSchluessel();
    if (!wortIndex || wortIndexSchluessel !== schluessel) {
      wortIndex = wortIndexBauen();
      wortIndexSchluessel = schluessel;
    }
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

  /* Ersten Buchstaben groß — charAt/toUpperCase deckt auch Umlaute ab
     (ä→Ä, ö→Ö, ü→Ü); ß steht am Wortanfang nie. */
  function grossErster(w) {
    return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }

  function vorschlaegeBauen() {
    if (!vorschlagBox) return;
    qsa("[data-kl-vorschlag]", vorschlagBox).forEach(function (e) { e.remove(); });

    /* Erst klaeren, WORAN es liegt. Hat der Begriff ohne die Haken Treffer,
       ist er nicht falsch geschrieben — dann waeren Tippfehler-Vorschlaege
       eine Luege („koelner" ist korrekt und bringt ohne Filter 10 Treffer).
       In dem Fall gibt es genau einen Chip, der die Filter loest. */
    var ohneFilter = Object.keys(aktiveFilter()).length ? trefferOhneFilter() : 0;
    var filterIstSchuld = ohneFilter > 0;

    if (filterIstSchuld && vorschlagVorlage) {
      var vorlage = CFG.ohneFilterText[SPRACHE === "en" ? "en" : "de"];
      var fChip = vorschlagVorlage.cloneNode(true);
      fChip.setAttribute("data-kl-vorschlag", "");
      (qs("[data-kl-vorschlag-text]", fChip) || fChip).textContent =
        String(vorlage).replace("%n", String(ohneFilter));
      fChip.addEventListener("click", function (e) { e.preventDefault(); filterLeeren(); });
      vorschlagBox.appendChild(fChip);
    }

    var worte = (!filterIstSchuld && vorschlagVorlage) ? vorschlaegeFinden() : [];
    worte.forEach(function (wort) {
      var chip = vorschlagVorlage.cloneNode(true);
      chip.setAttribute("data-kl-vorschlag", "");
      /* Hat die Vorlage inneres Markup (Icon, Span), wird nur der markierte
         Textträger befüllt — sonst der Chip selbst. */
      var ziel = qs("[data-kl-vorschlag-text]", chip) || chip;
      /* ANGEZEIGT wird großgeschrieben: die Wortart (Nomen/Verb/Adjektiv) ist
         nicht sicher erkennbar, also pauschal groß — es werden ohnehin mehr
         Nomen gesucht. Gesucht wird weiter mit dem kleingeschriebenen `wort`
         (die Suche ist case-insensitiv, Suchfeld/URL bleiben klein). Chip und
         Suchfeld sind nie gleichzeitig zu sehen: ein Vorschlag stammt aus einem
         echten Motiv, der Klick liefert immer Treffer und der Leerzustand
         verschwindet. */
      ziel.textContent = grossErster(wort);
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        begriffSuchen(wort, true);
      });
      vorschlagBox.appendChild(chip);
    });

    /* Echte Treffer verdrängen die feste Auswahl; gibt es keine, bleibt sie
       stehen. Das ist der Hybrid: „Meintest du …?" wenn möglich, sonst die
       gepflegten Chips. Das Label bleibt dabei außen vor — es wird gleich
       eigens geschaltet, sonst würde es wie feste Auswahl behandelt (also
       genau falsch herum: nur SICHTBAR ohne Vorschläge). */
    var eigeneChips = worte.length + (filterIstSchuld ? 1 : 0);
    var festeChips = 0;
    Array.prototype.forEach.call(vorschlagBox.children, function (kind) {
      if (kind.hasAttribute("data-kl-vorschlag")) return;
      if (kind.hasAttribute("data-kl-vorschlag-label")) return;
      kind.classList.toggle(CFG.verstecktKlasse, eigeneChips > 0);
      festeChips++;
    });

    /* Das „Probiere:"-Label steht über den Chips und verschwindet nur, wenn
       gar keine da sind — sichtbar bei echten Vorschlägen ODER fester Auswahl. */
    var hatChips = eigeneChips > 0 || festeChips > 0;
    qsa("[data-kl-vorschlag-label]", vorschlagBox).forEach(function (label) {
      label.classList.toggle(CFG.verstecktKlasse, !hatChips);
    });
    log("Vorschläge:", filterIstSchuld ? "Filter ist schuld (" + ohneFilter + " ohne Filter)"
        : worte.length ? worte.join(", ") : "keine (feste Auswahl)");
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

  /* -- Huellen weich schalten ------------------------------------
     display:none laesst sich nicht animieren. Beim Einblenden wird deshalb
     zuerst die Versteckt-Klasse genommen, der Startzustand (durchsichtig) per
     Reflow festgeschrieben und dann die Deckkraft gefahren; beim Ausblenden
     erst die Deckkraft, danach display:none. Ohne den Reflow springt es ohne
     Uebergang - der Browser fasst beide Aenderungen sonst zusammen.
     Ein laufender Ausblend-Timer wird abgebrochen, wenn die Huelle vorher
     wieder gebraucht wird; bei kurzen Ladephasen passiert genau das. */
  var AUS = "kl-aus";
  var blendTimer = new WeakMap();

  function huelleSchalten(el, an, sofort) {
    var t = blendTimer.get(el);
    if (t) { clearTimeout(t); blendTimer.delete(el); }
    var offen = !el.classList.contains(CFG.verstecktKlasse);
    if (an) {
      if (offen && !el.classList.contains(AUS)) return;      // schon sichtbar
      if (sofort) {
        /* Ohne Einblend-Fade: die Ladeanzeige soll sofort voll dastehen, sonst
           blitzt erst ein halbtransparenter Zwischenzustand auf. transition
           kurz aus, damit auch ein noch laufendes Ausblenden nicht weich
           zurueckfaedt; danach wieder an, damit das AUSblenden weich bleibt. */
        el.style.transition = "none";
        el.classList.remove(AUS);
        el.classList.remove(CFG.verstecktKlasse);
        void el.offsetWidth;
        el.style.transition = "";
        return;
      }
      el.classList.add(AUS);
      el.classList.remove(CFG.verstecktKlasse);
      void el.offsetWidth;
      el.classList.remove(AUS);
    } else {
      if (!offen) return;                                    // schon versteckt
      el.classList.add(AUS);
      blendTimer.set(el, setTimeout(function () {
        el.classList.add(CFG.verstecktKlasse);
        el.classList.remove(AUS);
        blendTimer.delete(el);
      }, CFG.blendenMs));
    }
  }

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

    /* Die GANZE aktuelle Auswahl als lesbarer Satz: Suchbegriff zuerst, dann
       jeder angehakte Filter mit seiner Beschriftung. Der Leerzustand soll
       zeigen, wonach wirklich gesucht wurde - ein Suchbegriff allein
       unterschlaegt, dass vielleicht noch eine Kategorie aktiv war. */
    var auswahl = begriff ? [begriff] : [];
    CFG.urlFelder.forEach(function (feld) {
      steuerungen(feld).forEach(function (st) {
        if (st.input.checked) auswahl.push(st.text);
      });
    });
    var auswahlText = auswahl.join(", ");
    if (auswahlText) w.setAttribute("data-kl-auswahl", auswahlText);
    else w.removeAttribute("data-kl-auswahl");
    qsa('[data-kl-text="auswahl"]').forEach(function (el) { el.textContent = auswahlText; });
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
    /* „Ende" darf ungefiltert NUR gemeldet werden, wenn die Gesamtzahl der
       Seiten wirklich FESTSTEHT. Sie steht fest, wenn w-page-count sie lieferte
       (gesamtSicher) ODER wenn es gar keine Pagination gibt (kein pagParam →
       es kann keine zweite Seite geben).
       Steht sie NICHT fest — leeres/fehlendes w-page-count, und die Sprungsuche
       ist noch nicht durch —, wissen wir NICHT, ob Seite 1 die letzte ist. Dann
       niemals Ende annehmen (seitenJetzt = Infinity), sonst steht der „Ende der
       Liste"-Button auf Seite 1 von 31 und die Nutzer denken, das war alles.
       Das ist der Live-Fall: Webflow rendert w-page-count derzeit leer. */
    var zahlSteht = gesamtSicher || !pagParam;
    var seitenJetzt = istGefiltert()
      ? laufendeSeiten
      : (zahlSteht ? Math.max(gesamtSeiten, 1) : Infinity);
    var ende = zustand === "treffer" && laufendeAnzahl !== null && seite >= seitenJetzt;

    w.setAttribute("data-kl-liste", zustand);
    if (ende) w.setAttribute("data-kl-ende", "");
    else w.removeAttribute("data-kl-ende");

    qsa("[data-kl-zeigen]").forEach(function (el) {
      var rolle = el.getAttribute("data-kl-zeigen");
      var an = rolle === "ende" ? ende : rolle === zustand;
      /* Die Ladeanzeige erscheint OHNE Einblend-Fade (sofort voll da), damit
         beim Laden nichts halbtransparent aufblitzt; „leer" und „ende" blenden
         weiter weich ein. Das Ausblenden bleibt bei allen weich. */
      huelleSchalten(el, an, rolle === "laden");
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
    /* `erzwingen` nur beim Abschluss. Zwischenstände bleiben gesperrt, solange
       die Ladephase läuft und die Maske noch NICHT steht: ladeAnzeige(true)
       startet bloß den 250-ms-Timer (CFG.ladenAbMs), meldet "laden" also erst
       später — ein Zeichnen davor liess die Teiltreffer kurz aufblitzen, und
       die Maske legte sich erst DANACH darüber. Genau dieser Blitzer.
       Jetzt gilt: unter 250 ms gar keine Maske und genau ein sauberer Sprung;
       dauert es länger, bleibt bis zur Maske die alte Liste stehen und alle
       Wellen zeichnen darunter. */
    var zeichneTreffer = function (erzwingen) {
      if (!erzwingen && laedt && !ladenGemeldet) return;
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
    zeichneTreffer();                      // greift nur noch, wenn keine Maske kommt
    alleHolen(zeichneTreffer).then(function () {
      zeichneTreffer(true);                // Abschluss zeichnet IMMER
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

  /* Query selbst zusammenbauen, weil encodeURIComponent zwei Dinge unschoen
     macht: Kommas werden zu %2C (in einer Query laut RFC 3986 erlaubt, also
     zurueck zum Komma) und Leerzeichen zu %20 (als + viel lesbarer). Beides
     ist beim Lesen unkritisch: gelesen wird mit URLSearchParams, und das
     decodiert + laut Formular-Kodierung ohnehin als Leerzeichen. Ein
     literales Plus im Suchbegriff bleibt %2B und wird nicht verwechselt.
       ?kategorie=natur,tiere   statt  ?kategorie=natur%2Ctiere
       ?tags=lorem+ipsum        statt  ?tags=lorem%20ipsum          */
  function queryBauen(p) {
    var teile = [];
    p.forEach(function (v, k) {
      teile.push(encodeURIComponent(k) + "=" +
                 encodeURIComponent(v).replace(/%2C/gi, ",").replace(/%20/g, "+"));
    });
    return teile.join("&");
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
    var q = queryBauen(p);
    var neu = location.pathname + (q ? "?" + q : "") + location.hash;
    if (neu !== location.pathname + location.search + location.hash) history.pushState({ kl: 1 }, "", neu);
    sprachLinksAktualisieren();      // Umschalter traegt die Auswahl mit
  }

  /* ── Sprachumschalter: die Auswahl mitnehmen ────────────────────
     Webflow rendert feste Links (<a hreflang="en" href="/en/stock-photos-videos">),
     die Query faellt beim Wechsel also weg — wer auf Deutsch nach Tieren
     filtert, landet auf Englisch im ungefilterten Katalog. Die Links werden
     deshalb bei jeder Aenderung neu geschrieben, mit uebersetzten Feldnamen
     UND Werten (kategorie=tiere → category=animals).

     Das hreflang-Attribut sagt direkt, wohin der Link zielt — kein Raten am
     Pfad. Der urspruengliche href wird beim ersten Mal in data-kl-basis
     gesichert, damit wiederholtes Schreiben nicht auf sich selbst aufbaut.

     Die Seitenzahl bleibt bewusst weg: in der anderen Sprache faengt man
     sinnvollerweise auf Seite 1 an.

     Der SUCHBEGRIFF laesst sich nicht uebersetzen — die Tags sind lokalisiert
     ("Sonnenuntergang" gegen "sunset"), ein deutsches Wort findet auf der
     englischen Seite also meist nichts. Er wird trotzdem mitgenommen
     (CFG.sucheBeimSprachwechsel): so steht er sichtbar im Feld und kann
     korrigiert werden, statt kommentarlos zu verschwinden. Auf false setzen,
     wenn lieber der ungefilterte Katalog erscheinen soll. */
  function sprachLinksAktualisieren() {
    var links = qsa('.w-locales-item a[hreflang], [data-kl-sprachlink]');
    if (!links.length) return;
    var f = aktiveFilter(), verloren = [];
    links.forEach(function (a) {
      var ziel = (a.getAttribute("hreflang") || "").slice(0, 2).toLowerCase();
      if (!FELD_SAETZE[ziel] || ziel === FELD_SPRACHE) return;
      var basis = a.getAttribute("data-kl-basis");
      if (basis === null) { basis = a.getAttribute("href") || ""; a.setAttribute("data-kl-basis", basis); }
      var u;
      try { u = new URL(basis, location.origin); } catch (e) { return; }
      var p = new URLSearchParams();
      CFG.urlFelder.forEach(function (feld) {
        var werte = f[feld];
        if (!werte || !werte.length) return;
        var zielFeld = feldUebersetzen(feld, ziel);
        if (!zielFeld) return;
        var uebersetzt = [];
        werte.forEach(function (w) {
          var z = wertUebersetzen(w, ziel);
          if (z) uebersetzt.push(z); else verloren.push(feld + "=" + w);
        });
        if (uebersetzt.length) p.set(zielFeld, uebersetzt.join(","));
      });
      if (CFG.sucheBeimSprachwechsel && angewandteSuche) p.set(CFG.suchParam, angewandteSuche);
      var q = queryBauen(p);
      a.setAttribute("href", u.pathname + (q ? "?" + q : ""));
    });
    if (verloren.length) log("Sprachwechsel: kein Gegenstueck fuer", verloren.join(", "));
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

  /* Nur die Haken loesen, den Suchbegriff behalten — fuer den Chip im
     Leerzustand, wenn nicht der Begriff, sondern der Filter schuld ist. */
  function filterLeeren() {
    sperre = true;
    CFG.urlFelder.forEach(function (feld) {
      steuerungen(feld).forEach(function (s) { setzeBox(s, false); });
    });
    seite = 1;
    sperre = false;
    optikSync();
    urlSchreiben();
    zeichne(false);
    log("Filter geloest, Suchbegriff behalten:", angewandteSuche);
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

  /* ── Start ─────────────────────────────────────────────────────── */
  function start() {
    vorschlaegeVorbereiten();          // muss VOR dem ersten Rendern laufen
    ladeAnzeige(false);
    urlLesen();
    sprachLinksAktualisieren();        // beim ersten Laden: urlSchreiben() laeuft hier noch nicht
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
    /* Kam die Seitenzahl NICHT aus dem Markup (leeres/fehlendes w-page-count —
       aktuell der LIVE-Zustand), die Sprungsuche FRÜH anstoßen, nicht erst im
       Vorlade-Leerlauf nach load+800ms. Sonst fehlt die Pagination mehrere
       Sekunden. Im kurzen Leerlauf, damit der erste Bildaufbau Vorrang behält;
       memoisiert, läuft also nicht doppelt mit dem vorladen unten. Der
       „Ende"-Zustand ist dank zahlSteht ohnehin schon korrekt (kein Ende, bis
       die Zahl feststeht) — das hier holt nur die Pagination schneller. */
    if (!gesamtSicher && pagParam) idle(gesamtErmitteln, 100);
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
    version: VERSION,
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
