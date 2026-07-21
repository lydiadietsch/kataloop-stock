# Kataloop Stock — Skript für die Stock-Collection

Ein Skript für alle Seiten mit einer Finsweet-CMS-Liste (Stockfotos/-Videos,
Stockmedien-Teaser). Ersetzt vier bisherige Snippets und behebt die gemeldeten
Probleme.

- `stock.js` — Quelldatei (bearbeiten)
- `stock.min.js` — minifiziert, wird in Webflow geladen (7,9 KB)

Einbindung wie beim Cart-Skript über jsDelivr, festgepinnt auf einen Tag:

```
https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v1.0.0/stock.min.js
```

---

## ⚠️ Wichtigste Regel

**Nach jeder Änderung: neuer Tag → URL in Webflow austauschen → publishen.**
Ein Push auf `main` allein ändert live nichts.

---

## Was in Webflow zu tun ist

**Auf `/stockfotos-videos` (Seiten-Einstellungen → Vor `</body>`):**

Diese vier Blöcke **löschen**:

1. `<script ... @finsweet/attributes@2/attributes.js ... fs-list>` — lädt ~25 Dateien
   nach und hat auf dieser Seite nichts zu tun (die Seite nutzt durchgehend die
   v1-Attribute `fs-cmsfilter-*` / `fs-cmsload-*`, kein einziges `fs-list-*`).
2. `<script ... attributes-cmsfilter@1 ...>` und `<script ... attributes-cmsload@1 ...>`
   — die lädt das neue Skript selbst nach, zum richtigen Zeitpunkt.
3. Den `history.replaceState`-Blocker („Verhindert nur beim ersten Laden …").
4. Das „Filterwerte aus der URL übernehmen"-Snippet **und** das Hover-Video-Snippet.

Danach steht dort nur noch:

```html
<script src="https://cdn.jsdelivr.net/gh/lydiadietsch/kataloop-stock@v1.0.0/stock.min.js"></script>
```

**Auf `/stockmedien/[slug]` (Teaser-Seiten):** dort fehlen die Finsweet-Skripte
komplett — deshalb sind die Blätter-Buttons dort tote Links (`href="#"`), der
native „Zurück"-Pfeil taucht wieder auf und Seite 2 lädt falsch. Dieselbe eine
Zeile einfügen, dann verhalten sich beide Seiten identisch.

Am einfachsten: die Zeile in die **Site-weiten** Einstellungen legen. Das Skript
prüft selbst, ob die Seite eine CMS-Liste hat, und tut sonst nichts.

**Im Designer nichts umbauen nötig.** Das Skript entfernt `fs-cmsfilter-showquery`
und `fs-cmsload-element="scroll-anchor"` zur Laufzeit selbst, bevor Finsweet
startet — beide Automatiken übernimmt es kontrolliert.

---

## Was es löst

| Problem | Lösung |
|---|---|
| Seite lädt langsam | Finsweet wird erst im Leerlauf geladen. Vorher: 30 Anfragen / ~1,9 MB Katalog-HTML **vor** dem ersten Bild. Gemessen im Prüfstand: Katalog-Nachladen startet jetzt erst ~2 s nach `load`. |
| ~25 überflüssige Anfragen | Attributes v2 fliegt raus (kein einziges `fs-list-*`-Attribut auf der Seite). |
| Hover-Video tot nach Filtern/Blättern | Bindung ist wiederholbar und läuft nach jedem Rendern erneut (`data-kl-hover` verhindert Doppel-Listener). Zusätzlich ein MutationObserver als Netz. |
| Video-Metadaten für alle Karten | Werden erst geholt, wenn die Karte in Sichtweite kommt (`preload="none"` → `metadata` per IntersectionObserver). |
| Kein Playback auf Mobile | Auf Touch-Geräten spielt automatisch das Video, das mittig im Bild steht — immer nur eines. |
| Ankersprung beim Filtern | Passiert nicht mehr. Gesprungen wird **nur** beim Blättern. |
| Anker springt auf Mobile falsch | Ziel wird **nach** dem Rendern gemessen (2 Frames) und eine fixe/klebende Kopfleiste wird abgezogen. |
| `?kategorie=…` von der Detailseite lädt nicht immer | Eigene, deterministische Übernahme aus der URL beim Laden (inkl. Webflow-Checkbox-Optik) — nicht mehr Finsweets `showquery` gegen ein eigenes Snippet. |
| URL wird unsauber | Beim Filtern wird `?kategorie=…&typ=…&lizenz=…&tags=…` geschrieben, sonst nichts. Zurück-Taste wird unterstützt. |

---

## Prüfstand

`stock.js` wurde gegen eine 1:1-Kopie der Staging-Seite getestet (lokaler Server,
echte Finsweet-Skripte, echte Karten):

- Finsweet-Nachladen: `cmsfilter.js` erst bei 6,7 s statt sofort; Katalog-Fetches
  ab 6,8 s statt vor dem ersten Bild
- Hover-Bindung: 100/100 Karten, auch nach Filter und Seitenwechsel
- `?kategorie=tiere` beim Laden → Chip aktiv, nur Tier-Motive (Screenshot geprüft)
- Klick auf Kategorie → `?kategorie=…`, **kein** Scrollsprung
- Klick auf Seite 2/3/4 → genau ein Scroll auf den Anker (Ziel 496 px bei Anker 508 px)

Hinweis zum Testen im Hintergrund-Tab: dort laufen weder `requestAnimationFrame`
noch `behavior: "smooth"` — der Scroll wirkt dann wirkungslos, obwohl der Code
stimmt. Im Prüfstand wurde deshalb der `scrollTo`-Aufruf abgefangen statt das
Ergebnis gemessen.

---

## Debug

```js
window.__klStockDebug = true;   // vor dem Skript setzen → Log, wann Finsweet lädt
window.klStock.zustand();       // { finsweetGestartet, karten, gebunden, videos, touch }
window.klStock.startFinsweet(); // sofort nachladen
```
