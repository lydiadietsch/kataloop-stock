# Kataloop Stock — eigene Filter-, Blätter- und Video-Logik

Ein Skript für alle Seiten mit der Stock-Collection. **Keine Fremdbibliothek**,
keine Finsweet-Skripte mehr. Eine Datei, 12 KB.

- `stock.js` — Quelldatei (bearbeiten)
- `stock.min.js` — minifiziert, wird in Webflow geladen

```
https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v2.0.0/stock.min.js
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
<script src="https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v2.0.0/stock.min.js"></script>
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

## Der entscheidende Unterschied: wann geladen wird

Finsweet muss für „Blättern **und** Filtern" den ganzen Katalog kennen und holt
ihn deshalb bei **jedem** Seitenaufruf komplett: gemessen **30 Anfragen, ~1,9 MB**,
jede ~730 ms — bevor irgendjemand gefiltert hat.

Dieses Skript unterscheidet:

| Aktion | Kosten |
|---|---|
| Seite öffnen | **0 Anfragen** — Seite 1 steht bereits im HTML |
| Blättern | **1 Anfrage** pro Seite (~64 KB), danach im Speicher |
| Seitenzahl bestimmen | **~9 Anfragen einmal pro Sitzung**, im Hintergrund (siehe unten) |
| Filtern/Suchen | erst dann der ganze Katalog, **einmal**, mit Ladeanzeige |

**Warum überhaupt eine Suche nach der Seitenzahl?** Webflow schreibt die
Gesamtzahl nirgends ins HTML (kein `rel="next"`, und Bereichs-Anfragen
beantwortet der CDN mit dem vollen Dokument). Statt alle 30 Seiten zu holen,
sucht das Skript das Ende per Sprungsuche: 2, 4, 8, 16, 32 … bis eine Seite leer
ist, dann halbieren — **9 statt 30 Abrufe**, und jede dabei geholte Seite bleibt
im Speicher (Blättern dorthin kostet später nichts). Das Ergebnis liegt 30 Minuten
in der `sessionStorage`, gilt also für die ganze Sitzung inklusive
Detailseiten-Besuchen.

---

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
| Umlaute in der Suche | „Städte" findet „staedte" und umgekehrt |

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

```js
window.__klStockDebug = true;   // vor dem Skript setzen
window.klStock.zustand();       // Seite, Seitenzahl, geladene Seiten, Treffer, Bindungen
window.klStock.geheZuSeite(5);
window.klStock.alleHolen();     // Katalog vorladen
```
