# Kataloop Stock — eigene Filter-, Blätter- und Video-Logik

Ein Skript für alle Seiten mit der Stock-Collection. **Keine Fremdbibliothek**,
keine Finsweet-Skripte mehr. Eine Datei, 21,3 KB (8,1 KB gzip).

- `stock.js` — Quelldatei (bearbeiten)
- `stock.min.js` — minifiziert, wird in Webflow geladen

```
https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v3.10.0/stock.min.js
```

---

## ⚠️ Wichtigste Regel

**Nach jeder Änderung: neuer Tag → URL in Webflow austauschen → publishen.**
Ein Push auf `main` allein ändert live nichts.

---

## Was in Webflow zu tun ist

**In den Seiten-Einstellungen von `/stockfotos-videos` (vor `</body>`) diese
sechs Blöcke ersatzlos löschen:**

1. `@finsweet/attributes@2/attributes.js` (das `fs-list`-Skript)
2. Den `history.replaceState`-Blocker („Verhindert nur beim ersten Laden …")
3. `@finsweet/attributes-cmsfilter@1/cmsfilter.js`
4. `@finsweet/attributes-cmsload@1/cmsload.js`
5. Das „Filterwerte aus der URL übernehmen"-Snippet
6. Das Hover-Video-Snippet

**Dazu ein siebter Block, der NICHT in den Seiten-Einstellungen steht:** das
Embed `hideLastIfDotsBefore()` liegt im Canvas **innerhalb der Blätter-Leiste**
(`.page-numbers-wrapper` → unsichtbares Embed `u-d-none w-embed`). Die
Auslassungspunkte setzt das Skript selbst; das Embed kann weg. Es richtet
keinen Schaden an, wenn es bleibt (die Vorlagen werden aus dem DOM genommen,
sein Selektor findet nichts mehr — so getestet), es läuft dann nur unnötig bei
jeder DOM-Änderung mit.

Übrig bleibt **eine** Zeile:

```html
<script src="https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v3.10.0/stock.min.js"></script>
```

**Bleiben MUSS:** das Grid-Skript im `<head>` (`setGrid`/`cc-stock-tmb` samt
`.stock-collection-wrapper::after`-Style), Cookie-Consent, Cart-Skript, GA.
**Und im Canvas:** die Ladeanzeige (`fs-cmsload-element="loader"`) — die benutzt
dieses Skript als Ladeanzeige — sowie die Vorlagen für Seitenzahl und
Auslassungspunkte (`page-button`, `page-dots`) und die Weiter-/Zurück-Buttons. Das Grid-Skript hängt an einem eigenen MutationObserver und
bekommt neue Karten automatisch mit; zusätzlich feuert dieses Skript
`window.dispatchEvent(new CustomEvent("kl:rendered", { detail: { items } }))`.

**Auf `/stockmedien/[slug]`** dieselbe Zeile einfügen — dort fehlten die Skripte
bisher komplett (deshalb tote `href="#"`-Blätter-Buttons, sichtbarer nativer
Zurück-Pfeil, falsch ladende Folgeseiten). Am einfachsten: Zeile in die
**Site-weiten** Einstellungen. Ohne Collection-Liste tut das Skript nichts.

**Im Designer nichts umbauen.** Die vorhandenen `fs-…`-Attribute werden als reine
Datenattribute weiterverwendet (Finsweet ist nur noch ein Namensschema im
Markup, keine Abhängigkeit). Jedes hat ein neutrales Gegenstück, falls du später
umbenennen willst — beide Schreibweisen funktionieren gleichzeitig:

| bisher | Alternative |
|---|---|
| `fs-cmsfilter-element="list"` | `data-kl-list` |
| `fs-cmsfilter-element="filters"` | `data-kl-filters` |
| `fs-cmsfilter-field="kategorie"` | `data-kl-field="kategorie"` |
| `fs-cmsfilter-field="category"` (EN-Locale) | `data-kl-field="category"` |
| `fs-cmsload-element="page-button"` | `data-kl-page-button` |
| `fs-cmsload-element="page-dots"` | `data-kl-page-dots` |
| `fs-cmsload-element="loader"` | `data-kl-loader` |

---

## Alle `data-kl-`-Attribute auf einen Blick

Referenz für die Stock-Übersicht (`/stockfotos-videos`). Details in den
jeweiligen Abschnitten unten.

**Struktur — du setzt sie im Designer** (oder nutzt die `fs-…`-Entsprechung, s. o.):

| Attribut | wohin | Zweck |
|---|---|---|
| `data-kl-list` | Collection-Liste | die Stock-Liste |
| `data-kl-filters` | Filter-Form | Container der Filter |
| `data-kl-field="kategorie"` | Filter-Wert | ein Filterfeld (kategorie, typ, lizenz, …) |
| `data-kl-page-button` | Blätter-Leiste | Vorlage für die Seitenzahlen |
| `data-kl-page-dots` | Blätter-Leiste | Vorlage für „…" |
| `data-kl-loader` | Ladeanzeige | die vorhandene Webflow-Ladeanzeige |

**Status am `<html>` — das Skript setzt sie** (Code-Komponenten im Shadow DOM lesen sie):

| Attribut | Werte |
|---|---|
| `data-kl-liste` | `laden` · `treffer` · `leer` |
| `data-kl-ende` | gesetzt nur auf der echten letzten Seite (nie auf Seite 1, s. u.) |
| `data-kl-suche` | reiner Suchbegriff |
| `data-kl-auswahl` | Suchbegriff **+** angehakte Filter (lesbar, z. B. `hund, Natur, Video`) |

**Status-Hüllen — du setzt sie im Designer**, das Skript schaltet nur `u-d-none`:

| Attribut | Zweck |
|---|---|
| `data-kl-zeigen="leer"` | Hülle um „Kein Bild gefunden" |
| `data-kl-zeigen="ende"` | Hülle um „Ende der Liste" |
| `data-kl-zeigen="laden"` | Hülle um die Ladeanzeige (erscheint ohne Fade) |
| `data-kl-text="suche"` | wird mit dem Suchbegriff befüllt |
| `data-kl-text="anzahl"` | Trefferzahl (nur wenn sie feststeht) |
| `data-kl-text="auswahl"` | Suchbegriff + Filter, lesbar |

**Gegenvorschläge — in der Leer-Hülle:**

| Attribut | Zweck |
|---|---|
| `data-kl-vorschlaege` | Container der Vorschläge |
| `data-kl-vorschlag-vorlage` | ein Chip als Klon-Vorlage |
| `data-kl-vorschlag-text` | Textträger im Chip (falls inneres Markup) |
| `data-kl-vorschlag-label` | einleitender Text „Probiere:" (nur sichtbar, wenn Chips dastehen) |

**Ereignis:** `window.dispatchEvent(new CustomEvent("kl:neu-suchen"))` setzt Filter
+ Suche zurück (auch `window.klStock.neueSuche()`).

---

## Statusanzeigen (ab v3.4.0, Blenden ab v3.5.0)

Für die Webflow-Komponenten „Kein Bild gefunden" und „Ende der Liste". Das
Skript kennt ihre Namen nicht — es meldet nur seinen Zustand, den Rest macht
Webflow.

**Am `<html>`:**

| Attribut | Werte |
|---|---|
| `data-kl-liste` | `laden` · `treffer` · `leer` |
| `data-kl-ende` | gesetzt, **nur** wenn die letzte Seite erreicht ist UND die Seitenzahl feststeht (nie auf Seite 1 von 31 — s. o.) |
| `data-kl-suche` | der reine Suchbegriff |
| `data-kl-auswahl` | die **ganze** Auswahl: Suchbegriff, dann jeder angehakte Filter |

`data-kl-auswahl` gibt es, weil der Suchbegriff allein die halbe Wahrheit ist:
Wer „hund" sucht **und** eine Kategorie angehakt hat, bekommt vielleicht genau
deshalb nichts — im Leerzustand soll beides stehen. Die Filter erscheinen mit
ihrer Beschriftung so, wie sie im Designer dasteht (die kleingeschriebene
Fassung braucht nur die Logik und die URL). Beispiel: `hund, Natur, Video`.

`laden` wird **erst nach 250 ms** gemeldet (`CFG.ladenAbMs`). Eine Anzeige, die
für 80 ms aufpoppt, sieht genauso billig aus wie ein Ladebalken — und bei
geladenem Katalog filtert die Liste ohnehin ohne jeden Abruf.

Die Hüllen **blenden weich ein und aus**, 300 ms linear (`CFG.blendenMs`).
`display` lässt sich nicht animieren, deshalb wird beim Einblenden erst
sichtbar geschaltet und dann die Deckkraft gefahren, beim Ausblenden
umgekehrt. Ein laufender Ausblend-Timer bricht ab, wenn die Hülle vorher
wieder gebraucht wird — bei kurzen Ladephasen passiert genau das.

**Ausnahme Ladeanzeige** (`data-kl-zeigen="laden"`, ab v3.6.0): sie erscheint
**ohne Einblend-Fade**, sofort voll sichtbar — sonst blitzt beim Laden erst ein
halbtransparenter Zwischenzustand auf. Das **Ausblenden** bleibt auch hier weich
(300 ms). Die 250-ms-Schwelle davor gilt weiter: sehr kurze Ladephasen zeigen gar
keine Anzeige.

**Im Designer** kommt um jede Komponente eine Hülle mit ihrer Rolle, versteckt
über die vorhandene Klasse `u-d-none`:

```html
<div data-kl-zeigen="leer" class="… u-d-none">   <!-- Kein Bild gefunden -->
<div data-kl-zeigen="ende" class="… u-d-none">   <!-- Ende der Liste -->
```

Das Skript schaltet **nur diese eine Klasse** um. Absichtlich kein
`style.display`: so bleibt das Layout (flex/grid, Breakpoints) in Webflow, und
weil „versteckt" der ausgelieferte Zustand ist, kann beim Seitenaufbau nichts
aufblitzen, bevor das Skript läuft. Ohne JavaScript bleibt alles verborgen —
richtig herum.

**Texte darin** werden befüllt, egal wo sie stehen:

| Attribut | Inhalt |
|---|---|
| `data-kl-text="suche"` | der Suchbegriff |
| `data-kl-text="anzahl"` | die Trefferzahl — **nur wenn sie feststeht** |
| `data-kl-text="auswahl"` | Suchbegriff **und** angehakte Filter, lesbar |

Die Trefferzahl bleibt leer, solange der Katalog lädt: ein Zwischenstand wäre
schlicht falsch. Ungefiltert steht sie erst, wenn alle Seiten da sind (die
letzte Seite ist meist nur teilweise gefüllt, hochrechnen wäre geraten).

**Zurücksetzen** — der Button „Neue Suche starten" feuert nur ein Ereignis:

```js
window.dispatchEvent(new CustomEvent("kl:neu-suchen"))
```

Das Skript nimmt alle Haken raus, leert das Suchfeld, schreibt eine saubere
URL, rendert Seite 1 und scrollt zu `#nav-top` — ohne Neuladen. Auch direkt
aufrufbar: `window.klStock.neueSuche()`.

---

## Gegenvorschläge („Meintest du …?")

Findet die Suche nichts, schlägt das Skript Begriffe vor, **die es im Katalog
wirklich gibt** — ein Vorschlag kann also nie ins Leere führen.

Gefunden wird über ein Wortverzeichnis aus allen geladenen Motiven (Tags,
Titel, Orte, Kamera). Gesucht wird in dieser Rangfolge: Wortanfang, dann die
Umlaut-Variante, dann Tippfehler nach Levenshtein — bei Wörtern bis fünf
Zeichen ein Fehler, darüber zwei (bei kurzen Wörtern wäre „hund" sonst
plötzlich „mund", „rund", „bund"). Bei Gleichstand gewinnt das häufigere Wort.

**Kosten** (gemessen an 3.100 Motiven): Verzeichnis **24.902 Wörter in 40 ms**,
einmalig und erst bei der ersten erfolglosen Suche gebaut — danach **7–8 ms**
je Suche. Wer nie danebentippt, zahlt nichts.

**Ausgabe** nach demselben Muster wie die Blätter-Leiste: du gestaltest **einen**
Chip in Webflow, das Skript nimmt ihn als Vorlage aus dem DOM und klont ihn.

```html
<div data-kl-vorschlaege>
  <a data-kl-vorschlag-vorlage class="stock-check-btn …">Vorlage</a>
  <a class="stock-check-btn …">Natur</a>      <!-- feste Auswahl -->
  <a class="stock-check-btn …">Tiere</a>      <!-- falls nichts passt -->
</div>
```

Deine Klassen, dein Hover — die Klone sind echte Webflow-Elemente, das Skript
setzt nur Text und Klick. Hat die Vorlage inneres Markup (Icon, Span), bekommt
`[data-kl-vorschlag-text]` den Text, sonst der Chip selbst.

**Großschreibung** (ab v3.6.0): der angezeigte Text beginnt mit einem
Großbuchstaben. Die Wortart lässt sich nicht sicher erkennen (Nomen? Verb?),
also pauschal groß — es werden ohnehin mehr Nomen gesucht. **Gesucht** wird
weiter kleingeschrieben (die Suche ist case-insensitiv, Suchfeld und URL bleiben
klein). Chip und Suchfeld sind dabei nie gleichzeitig zu sehen: ein Vorschlag
stammt aus einem echten Motiv, der Klick liefert immer Treffer und der
Leerzustand verschwindet.

Alles außer der Vorlage ist die **feste Auswahl**: Gibt es echte Vorschläge,
treten sie an ihre Stelle; gibt es keine, bleibt sie stehen. Den Container am
besten **in** die Leer-Hülle legen, dann verschwindet er mit ihr.

**Einleitender Text vor den Chips** (z. B. „Probiere:", ab v3.6.0): ein Element
mit `data-kl-vorschlag-label` als **erstes Kind** des Containers. Es ist genau
dann sichtbar, wenn Chips dastehen — echte Vorschläge **oder** feste Auswahl —
und verschwindet nur im ganz leeren Container. Wichtig: das Label ist **kein**
fester-Auswahl-Element; ohne das Attribut würde es wie die feste Auswahl
behandelt und stünde genau falsch herum da (nur ohne Vorschläge).

```html
<div data-kl-vorschlaege>
  <span data-kl-vorschlag-label>Probiere:</span>
  <a data-kl-vorschlag-vorlage class="stock-check-btn …">Vorlage</a>
  <a class="stock-check-btn …">Natur</a>
</div>
```

Zahl der Vorschläge: `CFG.vorschlaegeMax` (4).

---

## Zwei Sprachen (ab v3.9.2 / v3.10.0)

Webflow lokalisiert bei der Stock-Collection **drei** Dinge — das Skript muss alle drei kennen:

| | Deutsch | Englisch |
|---|---|---|
| Feldnamen | `kategorie`, `typ`, `lizenz`, `ausrichtung` | `category`, `type`, `license`, `orientation` |
| Filterwerte | `tiere`, `foto`, `hochformat` | `animals`, `photo`, `portrait` |
| Motiv-Tags | „Sonnenuntergang, Wolken …" | „sunset, clouds …" |

**Feldnamen** werden aus dem Markup erkannt (`FELD_SAETZE`), und zwar der Satz mit den **meisten** Treffern — auf der deutschen Seite liegen einzelne englische Streuelemente herum. Weitere Sprachen brauchen nur einen Eintrag mehr.

**Filterwerte** stehen in `WERT_DE_EN` (23 Paare, siehe Kommentar dort). Bewusst fest hinterlegt statt aus der Reihenfolge abgeleitet — die Sortierung der Kategorie-Liste kann sich im Designer ändern.

**Der Suchbegriff lässt sich nicht übersetzen.** Weil die Tags lokalisiert sind, findet `?tags=hund` auf der englischen Seite nichts. Er wird trotzdem mitgenommen, damit er sichtbar im Feld steht und korrigiert werden kann — `CFG.sucheBeimSprachwechsel: false` schaltet das ab, dann erscheint der ungefilterte Katalog.

Umgeschrieben werden alle `.w-locales-item a[hreflang]`. Ein eigenes Element lässt sich mit `data-kl-sprachlink` zusätzlich anmelden; der ursprüngliche `href` wird beim ersten Mal in `data-kl-basis` gesichert.

---

## Wann was geladen wird

| Aktion | Kosten |
|---|---|
| Seite öffnen | **0 Abrufe** — Seite 1 steht im HTML, die Seitenzahl auch |
| Blättern | 1 Abruf, meist 0 (Seite liegt schon vom Vorladen bereit) |
| Filtern/Suchen | **0 Abrufe**, sobald das Vorladen durch ist |

**Die Seitenzahl** liest das Skript idealerweise aus dem Markup: Webflow rendert
im Blätter-Bereich ein `<div class="w-page-count">1 / 31</div>` (bzw. ein
aria-label „…of 31") — solange die Collection-Liste eine feste Item-Zahl pro
Seite hat. **ACHTUNG — aktuell ist das Element LIVE aber LEER** (` / ` ohne
Zahlen; die Webflow-Einstellung liefert sie zurzeit nicht). Dann ermittelt das
Skript die Seitenzahl per **Sprungsuche** (exponentiell hoch, dann binär,
~5 Abrufe) — **ab v3.8.0 früh beim Start** statt erst im Vorlade-Leerlauf, sonst
fehlt die Pagination mehrere Sekunden.

> **Verbindlich (v3.8.0-Fix, war eine Katastrophe):** Solange die Gesamtzahl
> NICHT feststeht — leeres/fehlendes `w-page-count` und Sprungsuche noch nicht
> durch —, meldet das Skript **NIEMALS** `data-kl-ende`. Sonst stünde der
> „Ende der Liste"-Button auf **Seite 1 von 31**, und die Nutzer denken, das war
> alles. „Ende" gilt ungefiltert nur, wenn die Zahl sicher ist (`gesamtSicher`)
> oder es gar keine Pagination gibt (kein `_page`-Parameter = keine zweite
> Seite). Getestet mit UND ohne leeres `w-page-count` (Audit `pruefstand/audit.js`,
> je 23/23; Prüfstand 78/78). **Wenn Webflow die Seitenzahl je wieder ins Markup
> rendert, wird die Sprungsuche automatisch übersprungen** — beide Fälle laufen.

**Der Katalog wird im Hintergrund vorgeladen**, sobald die Seite fertig ist
(nach `load` + Leerlauf), in Wellen zu sechs mit Leerlauf-Pause dazwischen —
so blockiert weder das Holen noch das Auswerten der Dokumente die Seite.
Wer nach ein paar Sekunden filtert, bekommt das Ergebnis sofort.

**Klickt jemand früher**, ist trotzdem alles in Ordnung: der Ladebalken erscheint
synchron (4 ms gemessen), die bereits geladenen Treffer stehen sofort, der Rest
wächst nach. Kein leeres Warten.

Der Unterschied zu Finsweet liegt im Zeitpunkt, nicht in der Menge: Finsweet holt
den Katalog **während** des Seitenaufbaus (blockiert Bilder und Hauptthread),
dieses Skript **danach**.

**Die ersten Bilder werden priorisiert** (ab v3.8.0). Webflow gibt allen
Grid-Karten `loading="lazy"` — auch der obersten Reihe (am Staging-HTML gezählt:
168 lazy, 1 eager). Lazy-Bilder bekommen in Chrome **niedrige Netzwerk-Priorität**,
was das LCP kostet. Das Skript setzt den ersten *N* Karten von Seite 1
`loading="eager"` + `fetchpriority="high"` — und zwar so früh wie möglich (beim
Skript-Lauf, nicht erst bei `DOMContentLoaded`), damit der Browser die Priorität
noch vor dem Fetch sieht. *N* richtet sich nach der Viewport-Breite
(`CFG.eagerStufen`, `[abBreite, anzahl]`): auf großen Monitoren bis 26, auf Mobile
(< 768) keine — dort ist meist ein Hero das LCP, nicht das Grid. Nur Seite 1; beim
Blättern zählt der LCP-Hebel nicht. Bewusst **ohne** `getBoundingClientRect`: das
erzwänge ein Reflow, und das Raster-Layout muss zu dem frühen Zeitpunkt noch nicht
stehen — die Stufen decken den sichtbaren Bereich je Breite ab.

## Was sonst gelöst ist

| Problem | Lösung |
|---|---|
| Hover-Video tot nach Filtern/Blättern | Bindung läuft nach jedem Rendern erneut (`data-kl-hover` verhindert Doppel-Listener) |
| Video-Metadaten für alle Karten | erst bei Sichtnähe (`preload="none"` → `metadata` per IntersectionObserver) |
| Kein Playback auf Mobile | Video der mittig sichtbaren Karte spielt automatisch, immer nur eines |
| Ankersprung beim Filtern | passiert nicht mehr — gesprungen wird **nur** beim Blättern |
| Anker mobil an falscher Stelle | Ziel wird **nach** dem Rendern gemessen, fixe/klebende Kopfleiste wird abgezogen |
| `?kategorie=…` von der Detailseite | wird beim Laden übernommen, inklusive Webflow-Checkbox-Optik |
| unsaubere URLs | geschrieben werden nur `?kategorie=&typ=&lizenz=&ausrichtung=&tags=` (+ Seitenzahl); Zurück-Taste funktioniert |
| Umlaute in der Suche | „Städte" findet „staedte" und umgekehrt (`ä→ae`, `ß→ss`, Akzente weg) |
| „Affe" fand „Waffe", „Waffe" fand „Waffel" | Wortkanten-Treffer brauchen jetzt Substanz: am Wortanfang mindestens 3 Zeichen Rest, am Wortende mindestens 4 davor. An 15 Wortpaaren: **0 Fehler** (vorher 6). Komposita bleiben: „Haus" findet Bauernhaus und Gewächshaus, „Affe" findet Berberaffe — aber nicht Giraffe |
| „kuste" fand nichts | zweite Umlaut-Stufe (`ae→a`): 1.839 der 8.484 Katalogwörter enthalten aufgelöste Umlaute. „kuste" 0 → **159** Treffer, „grun" 67 → 164, „hauser" 2 → 25 |
| „Haus" fand „Häuser" nicht | Grundform wird **in beide Richtungen** verglichen — „haus" kürzt sich zu „hau", „haeuser" aber zu „haus". Gilt für alle Umlaut-Plurale (Baum↔Bäume, Stadt↔Städte, Vogel↔Vögel) |
| „8k" und „50mp" fanden nichts | aus den Pixelmaßen jeder Karte wird ein Suchwort: Videos in K-Klassen, Fotos in Megapixeln. „8k" 0 → 2, „50mp" 0 → **211** |
| „foodfotografie" fand nichts | Bindestrich-Wörter werden zusätzlich zusammengezogen abgelegt (278 solcher Wörter in 500 Motiven) |
| falsche Reihenfolge bei „Reis"/„Reise" | Rangfolge: exakter Treffer (3) vor Wortkante (2) vor Grundform (1) |
| „tomaten tauchen **in** wasser" fand weniger als ohne „in" (ab v3.9.0) | Füllwörter (Artikel, Verhältnis- & Bindewörter, DE **und** EN, ~150 Wörter) fliegen vor dem Vergleich raus, weil **alle** Suchwörter Pflicht sind und „in", „und", „the" … in keinem Schlagwort stehen. Anzeige-Text und URL bleiben unberührt. **Nicht** entfernt: Verneinung/Ausschluss (ohne, kein, without — sie kehren die Bedeutung um) und Zwiebelwörter, die anderssprachig Inhalt sind (war=Krieg, man=Mann, see=der See, boot, tag, hell, waren=Waren). „die" nur, wenn `<html lang>` ≠ `en`. Liste gegen den echten Katalog kollisionsgeprüft |
| Sprachwechsel verwarf die ganze Auswahl (ab v3.10.0) | Webflows Umschalter rendert feste Links (`<a hreflang="en" href="/en/stock-photos-videos">`) — wer auf Deutsch nach Tieren filterte, landete auf Englisch im ungefilterten Katalog. Die Links werden jetzt bei jeder Änderung neu geschrieben, mit übersetzten **Feldnamen und Werten**: `?kategorie=tiere,zeitraffer&typ=video` → `?category=animals,timelapse&type=video`. Tabelle mit 23 Paaren, eindeutig in beide Richtungen; unbekannte Werte fallen weg statt einen kaputten Filter zu erzeugen. Die Seitenzahl bleibt bewusst weg (in der anderen Sprache startet man auf Seite 1) |
| `?category=animals,` mit Komma am Ende (ab v3.9.3) | Auf der englischen Seite hängt `fs-cmsfilter-field` zusätzlich am textlosen Form-Label — **26 Träger auf 13 Kategorien, 13 davon leer** (auf Deutsch: 17 Träger, 0 leer). `aktiveFilter()` sammelte den Leerwert mit ein. Gefiltert wurde trotzdem korrekt (Werte einer Gruppe sind ODER-verknüpft), nur die URL war unsauber. `steuerungen()` verwirft leere Wert-Träger jetzt. Gefahrlos, weil beide Träger im selben Label liegen (13 Labels / 13 Checkboxen nachgezählt) |
| **Auf `/en` filterte gar nichts** (ab v3.9.2) | Webflow lokalisiert auch die **Feldnamen**: auf Englisch heissen die Filter `category`, `type`, `license`, `orientation` — und die Werte ebenso (`animals` statt `tiere`). `CFG.urlFelder` war seit v1.0.0 fest deutsch, also fand `aktiveFilter()` auf `/en` **0 Steuerungen** bei 246 vorhandenen `category`-Elementen; ein Klick auf einen Filter änderte weder Treffer noch URL. Finsweet las die Namen aus dem Markup und lief deshalb auf beiden Locales — beim Umbau ist das untergegangen. Jetzt wird der Feldsatz **aus dem DOM erkannt** (`FELD_SAETZE`), und zwar der mit den **meisten** Treffern: auf der deutschen Seite liegen 17 englische Streuelemente herum (545 zu 17), auf der englischen 0 deutsche (0 zu 552). Weitere Sprachen brauchen eine Zeile mehr |
| Vorschlag führte trotzdem auf 0 Treffer (ab v3.9.2) | Das Wortverzeichnis für „Meintest du …?" wurde über den **ganzen** Katalog gebaut und kannte die angehakten Filter nicht. Belegter Fall: `?kategorie=tiere&tags=koelner` schlug „Koeln" vor — Koeln liegt in *staedte-gebaeude*, *filmfotografie* …, in *tiere* in **keinem einzigen** Motiv, der Klick landete wieder bei 0. Der Index wird jetzt nur aus Motiven gebaut, die die Filter passieren (Cache über `filterSchluessel()`, Neubau nur bei Filterwechsel) |
| Leerzustand nannte die falsche Ursache (ab v3.9.2) | „koelner" ist **richtig geschrieben** und liefert ohne Filter 10 Treffer — trotzdem kamen Tippfehler-Korrekturen, als hätte man sich vertippt. Jetzt prüft das Skript erst `trefferOhneFilter()`: hat der Begriff ohne die Haken Treffer, erscheint **statt** der Tippfehler-Chips genau ein Chip „Ohne Filter (10)", der die Filter löst und den Begriff behält. Text über `CFG.ohneFilterText` (de/en, `%n` = Trefferzahl), Sprache nach `<html lang>`. Nutzt die vorhandene Chip-Vorlage — **keine Designer-Arbeit nötig** |
| Deep-Link mit Suchbegriff lud quälend langsam (ab v3.9.1) | Nachgeladen wurde über `location.href` — die Parameter der aktuellen Suche wanderten in jede Abruf-URL (`?tags=koeln&…_page=2`). Cloudflare nimmt die ganze Query-String in den Cache-Schlüssel, also erzeugte **jeder neue Suchbegriff 31 fabrikneue URLs**: alle MISS, alle bis zum Origin. Jetzt wird immer `origin + pathname + Seitenzahl` geholt. Gemessen (Staging, eine Welle à 12 Seiten): **0,28 s statt 4,19 s**, Einzelabruf 0,08 s statt 2,24 s — auf 32 Seiten rund **1 s statt 12 s**. Die Parameter dürfen weg, weil Webflow sie serverseitig ignoriert (an tags, kategorie, typ, lizenz, ausrichtung geprüft: byte-identische Antwort). Genau so machte es auch Finsweet |
| Gegenvorschläge schlugen Orte/Kameras/IDs vor (ab v3.9.0) | Das Wortverzeichnis für „Meintest du …?" wird jetzt **nur aus Tags + Titel** gebaut (Feld `vorschlag`), nicht mehr aus Ort/Land/Kamera/Objektiv/Kataloop-ID. Fällt beides leer, Rückfall auf den vollen Suchtext |
| Blätter-Leiste sprang auf Seite 31 | gleitendes Fenster aus 5 Zahlen: `1 2 3 4 5 …`, bei Seite 5 dann `… 3 4 5 6 7 …` |
| Aktiver Filter bleibt farblos | Die gelbe Optik hängt an `.stock-check-btn.fs-cmsfilter_active` — diese Klasse setzt das Skript jetzt selbst (zusätzlich `.kl-aktiv`), auch beim Laden aus der URL |
| „Ich klicke und nichts passiert" | Ladebalken über der Liste + ausgegraute Karten **synchron beim Klick** (nach 9 ms gemessen), Treffer werden nach jeder Lade-Welle nachgezogen |
| Ladebalken über der Liste sah billig aus | Ersatzlos raus — samt Abdunkeln der Karten und der alten Webflow-Ladeanzeige (die wird einmal versteckt und nicht mehr angefasst; sie kann im Designer gelöscht werden). Eine Ladeanzeige gestaltest du jetzt selbst und hängst sie an `data-kl-zeigen="laden"` |
| Leerzeichen als `%20` in der URL | Wird als `+` geschrieben: `?tags=lorem+ipsum` statt `?tags=lorem%20ipsum`. Beim Lesen unkritisch, `URLSearchParams` decodiert `+` laut Formular-Kodierung ohnehin als Leerzeichen; ein literales Plus bleibt `%2B` und wird nicht verwechselt |
| Leerhinweis blitzte trotz Fix noch einen Frame | `alleHolen` schaltete die Ladeanzeige nur bei einem Vordergrund-Lauf EIN, am Ende aber immer AUS. Läuft das Vorladen schon, hängt sich eine Suche per `return ladeVersprechen` daran — der Hintergrund-Abschluss meldete Vollzug, bevor der Vordergrund neu gezeichnet hatte, und für einen Frame stand der Zähler auf 0. Unsichtbar, solange hart geschaltet wurde; mit dem weichen Blenden wurden daraus **300 ms sichtbarer Blitzer**. Jetzt schaltet nur aus, wer auch eingeschaltet hat |
| Leerhinweis blitzte während der Suche auf | `zeichne()` zeigt erst das bereits Geladene — bei einem Begriff, der auf Seite 1 fehlt, sind das 0 Treffer, und der Leerhinweis erschien, obwohl noch geladen wurde. Er kommt jetzt erst, wenn die Ladephase durch ist. Gemessen an einer Kopie der Staging-Seite mit gebremster Leitung: vorher **2.311 ms sichtbar (137 Bilder)**, danach **kein einziges Bild** |
| „Ende der Liste" stand auf Seite 1 | Beim normalen Seitenaufruf rendert das Skript bewusst nicht neu (Seite 1 kommt fertig vom Server) — die Zähler blieben auf ihren Startwerten und `seite 1 >= 1` ergab „Ende". Der Zustand wird jetzt aus dem ausgelieferten Markup gesetzt, und solange nichts gezählt wurde, wird auch nichts behauptet |

---

## Prüfstand (gegen eine 1:1-Kopie der Staging-Seite, echte Karten)

- Start: **0** Katalog-Abrufe, 100/100 Karten mit Hover verdrahtet
- Seitenzahl: **31 gefunden mit 9 Abrufen**, in `sessionStorage` gemerkt
- Blättern auf Seite 2: 0 zusätzliche Abrufe (lag schon im Speicher), echte
  Seite-2-Inhalte, genau **ein** Scroll, aktive Zahl markiert, Leiste
  `[1][2][3][…][31]`
- Filter „Tiere": lädt einmal nach, **alle 100 gezeigten Karten sind Tiere**,
  403 Treffer auf 5 Seiten, **kein** Scrollsprung
- Suche „strand" kombiniert mit Filter → `?kategorie=tiere&tags=strand`, 31 Treffer
- Unsinns-Suche → Leerhinweis, Blätter-Leiste leer
- Zurück-Taste → Filter, Checkbox und Suchfeld wiederhergestellt

Beim Testen im Hintergrund-Tab laufen weder `requestAnimationFrame` noch
`behavior:"smooth"` — Scroll-Prüfungen dort über das Abfangen von `scrollTo`.

---

## Debug

Suche: `sucheAbEnter: true` in der CFG schaltet das Tippen ab — dann filtert
erst Enter. Standard ist Live-Suche ab 2 Zeichen, Enter wirkt sofort und
schließt auf dem Handy die Tastatur.

Der Hinweis „⏎ Enter" im Feld ist **aus** (`enterHinweis: ""`). Grund: Live-
Filtern kostet gemessen 1,4 ms je Tastendruck und null Netzabrufe — Enter
erzwingt also nichts, was nicht ohnehin sofort passiert. Ein Hinweis würde eine
Funktion ankündigen, die es so nicht gibt. Zum Einschalten einen Text eintragen.

**Bauen:** `esbuild stock.js --minify --legal-comments=none --target=es2017 --outfile=stock.min.js`

```js
window.__klStockDebug = true;   // vor dem Skript setzen
window.klStock.zustand();       // Seite, Seitenzahl, geladene Seiten, Treffer, Bindungen
window.klStock.geheZuSeite(5);
window.klStock.alleHolen();     // Katalog vorladen
```
