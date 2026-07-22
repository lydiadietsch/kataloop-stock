# Kataloop Stock — eigene Filter-, Blätter- und Video-Logik

Ein Skript für alle Seiten mit der Stock-Collection. **Keine Fremdbibliothek**,
keine Finsweet-Skripte mehr. Eine Datei, 17,7 KB (6,8 KB gzip).

- `stock.js` — Quelldatei (bearbeiten)
- `stock.min.js` — minifiziert, wird in Webflow geladen

```
https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v3.4.0/stock.min.js
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
<script src="https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v3.4.0/stock.min.js"></script>
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
| `fs-cmsload-element="page-button"` | `data-kl-page-button` |
| `fs-cmsload-element="page-dots"` | `data-kl-page-dots` |
| `fs-cmsload-element="loader"` | `data-kl-loader` |

---

## Statusanzeigen (ab v3.4.0)

Für die Webflow-Komponenten „Kein Bild gefunden" und „Ende der Liste". Das
Skript kennt ihre Namen nicht — es meldet nur seinen Zustand, den Rest macht
Webflow.

**Am `<html>`:**

| Attribut | Werte |
|---|---|
| `data-kl-liste` | `laden` · `treffer` · `leer` |
| `data-kl-ende` | gesetzt, sobald die letzte Seite erreicht ist |

`laden` wird **erst nach 250 ms** gemeldet (`CFG.ladenAbMs`). Eine Anzeige, die
für 80 ms aufpoppt, sieht genauso billig aus wie ein Ladebalken — und bei
geladenem Katalog filtert die Liste ohnehin ohne jeden Abruf.

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

Alles außer der Vorlage ist die **feste Auswahl**: Gibt es echte Vorschläge,
treten sie an ihre Stelle; gibt es keine, bleibt sie stehen. Den Container am
besten **in** die Leer-Hülle legen, dann verschwindet er mit ihr.

Zahl der Vorschläge: `CFG.vorschlaegeMax` (4).

---

## Wann was geladen wird

| Aktion | Kosten |
|---|---|
| Seite öffnen | **0 Abrufe** — Seite 1 steht im HTML, die Seitenzahl auch |
| Blättern | 1 Abruf, meist 0 (Seite liegt schon vom Vorladen bereit) |
| Filtern/Suchen | **0 Abrufe**, sobald das Vorladen durch ist |

**Die Seitenzahl steht im Markup.** Webflow rendert im Blätter-Bereich ein
verstecktes `<div class="w-page-count">1 / 31</div>`. Daraus liest das Skript die
Gesamtzahl — ohne einen einzigen Abruf. (Genau daraus liest sie auch Finsweet.)
Fehlt das Element auf einer Seite, sucht das Skript das Ende per Sprungsuche.

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
| Blätter-Leiste sprang auf Seite 31 | gleitendes Fenster aus 5 Zahlen: `1 2 3 4 5 …`, bei Seite 5 dann `… 3 4 5 6 7 …` |
| Aktiver Filter bleibt farblos | Die gelbe Optik hängt an `.stock-check-btn.fs-cmsfilter_active` — diese Klasse setzt das Skript jetzt selbst (zusätzlich `.kl-aktiv`), auch beim Laden aus der URL |
| „Ich klicke und nichts passiert" | Ladebalken über der Liste + ausgegraute Karten **synchron beim Klick** (nach 9 ms gemessen), Treffer werden nach jeder Lade-Welle nachgezogen |
| Ladebalken über der Liste sah billig aus | Ersatzlos raus — samt Abdunkeln der Karten und der alten Webflow-Ladeanzeige (die wird einmal versteckt und nicht mehr angefasst; sie kann im Designer gelöscht werden). Eine Ladeanzeige gestaltest du jetzt selbst und hängst sie an `data-kl-zeigen="laden"` |
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
