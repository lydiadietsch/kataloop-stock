# JS-Aufschlüsselung — Stock-Übersicht (`/stockfotos-videos`)

Gemessen gegen **Staging** (`kataloop-gmbh.webflow.io`) am 2026-07-23. Zweck:
aufschlüsseln, **was** geladen wird, **bevor** irgendetwas geändert wird
(offener Punkt 5). Keine Änderung — reine Analyse.

## Externe Skripte im HTML

**KORREKTUR 2026-07-23:** GA4 lädt **NICHT** im ersten Aufbau — es hängt hinter
dem Cookie-Consent (`type="fs-cc" fs-cc-categories="analytics"`) und wird erst
ausgeführt, wenn jemand der Analytics-Kategorie zustimmt. Die frühere Aussage
„GA4 ist der größte Hebel" war falsch (das `type`-Attribut übersehen).

**Kritischer Pfad — lädt SOFORT beim ersten Aufbau:**

| Skript | roh | gzip | Kategorie | Bewertung |
|---|---:|---:|---|---|
| jquery-3.5.1 | 87 KB | **30 KB** | Webflow braucht es | Größter Brocken im kritischen Pfad. Nur weg mit Webflow-Umbau (IX2 raus). Schwer. |
| fs-cc.js | 29 KB | 10 KB | Finsweet Cookie-Consent | Muss früh laden (Banner). DSGVO-Pflicht. Bleibt. |
| **cart.min.js** | 38 KB | 10 KB | EIGEN (Warenkorb) | Nötig. |
| **stock.min.js** | 21 KB | 8 KB | EIGEN (Stock-Logik) | Nötig, gut optimiert. |
| webflow.js | 5 KB | 2 KB | Webflow-Runtime (IX2) | Pflicht. |
| finsweet-config.js | 1.7 KB | 0.8 KB | Finsweet Components-Config | **Zu prüfen** — lädt evtl. `fs-cmsnest` (101 solcher Attribute im HTML). Wenn nichts mehr davon aktiv ist: entfernbar. |
| **Summe kritischer Pfad** | **~182 KB** | **~61 KB** | | schlank |

**Erst nach Zustimmung (nicht im kritischen Pfad):**

| Skript | roh | gzip | Kategorie |
|---|---:|---:|---|
| gtag.js (GA4) | 564 KB | 181 KB | Google Analytics — hinter Consent, `async`, lädt dynamisch weiter |

Die von der Nutzerin genannten „3.550 KB / 47 Anfragen" sind also **NICHT**
JS-dominiert im kritischen Pfad (der ist ~61 KB gzip). Die Masse sind Bilder,
Fonts, CSS und — falls die Messung mit akzeptiertem Consent lief — GA4 samt
Sub-Requests. **Für eine echte Priorisierung eine Lighthouse-/Netzwerk-Messung
machen** (nach welchen Ressourcen tatsächlich das meiste Gewicht/die meiste Zeit
geht); die reine Skript-Liste hier reicht dafür nicht.

## Inline-Blöcke (6)

1. **Grid-Höhe** (`getHeight`) — setzt die Zellhöhen je Viewport. **PFLICHT** (stock.js baut darauf).
2. **`hideLastIfDotsBefore()`** — altes Blätter-Embed. **ENTFERNBAR** — `stock.js` macht die Auslassungspunkte selbst (README).
3–6. kleine DOMContentLoaded-Helfer (current-Zustand, body-style, `.w-slider`-Init, `lang`-Auslesung) — je wenige Zeilen, vernachlässigbar.

## Hebel (nach Streichung von GA4)

Der JS-Hebel im kritischen Pfad ist **kleiner als gedacht** — ~61 KB gzip, davon
das meiste Webflow-Pflicht. GA4 ist bereits optimal (hinter Consent). Real bleibt:

1. **finsweet-config prüfen** (0.8 KB + evtl. Folge-Requests): Wird `fs-cmsnest`
   noch gebraucht? Wenn nein, Skript + Attribute raus. Kleiner, sauberer Gewinn.
2. **Inline `hideLastIfDotsBefore`** raus (minimal, aber sauber — `stock.js` macht
   es selbst).
3. **jQuery** (30 KB gzip): der einzige nennenswerte Brocken, aber Webflow-Pflicht
   (IX2). Nur nach echtem Webflow-Umbau los — hoher Aufwand, eher später.

**Wichtiger als am JS zu schrauben:** eine Lighthouse-Messung, um zu sehen, wo
das Gewicht wirklich liegt (vermutlich Bilder/Fonts — s. offene Punkte 3 und 6:
Bild-Element ohne width/height, Schriften vorladen). Erst messen, dann optimieren.

## Ressourcen-Messung 2026-07-23 (Bilder/Videos ausgeklammert)

Echter Browser-Lauf (Performance-API, `messung/mess-server.mjs`), Fonts per curl:

**Übersicht `/stockfotos-videos`** — DOMContentLoaded ~1.3 s
- **Fonts: 5 Dateien = 221 KB**, Start erst bei **~1.24 s** (kein Preload):
  Söhne buch/leicht/kräftig (111 KB) + Serrif Compressed Medium/SemiBold (110 KB).
  Calibre und Ginto Nord werden hier NICHT geladen.
- CSS: 3 Dateien (~40 KB gzip; `webflow.opt.css` mit 28,6 KB gzip der größte).
- **JS: 54 Requests** — die 7 bekannten + ~30 `webflow.achunk.*` (IX2, code-split)
  + Code-Components-Federation (`remoteEntry`/`module/*`/`chunk-*`). DAS ist die
  Quelle der „~47 Anfragen", nicht GA4.

**Unterseite `/stockfotos-videos/[slug]`** — DOMContentLoaded ~1.5 s
- **Fonts: 7 Dateien = 457 KB**, Start ~1.07 s: Söhne (111) + Serrif (110)
  + **Ginto Nord Variable 208 KB** + **calibre-light 28 KB**.
- **JS: 62 Requests** (noch mehr achunks/Federation).

## Font-Hebel (der eigentliche Gewinn liegt hier, nicht am JS)

1. **Preload der above-fold-Fonts** (Übersicht: Söhne buch/kräftig + Serrif
   Medium): `<link rel="preload" as="font" type="font/woff2" crossorigin>` in den
   Webflow-Head (Custom Code — Webflow hat KEINE native Preload-Option). Holt den
   Start von ~1.24 s nach vorn → weniger FOUT/Layout-Shift.
2. **Ginto Nord 208 KB auf der Unterseite** — mit Abstand der größte Font. Prüfen,
   welches Element ihn nutzt; ggf. subsetten oder durch Söhne/Serrif ersetzen.
3. **calibre-light (28 KB, Unterseite)** — Rest der alten Schrift; das Element auf
   Söhne umstellen → 1 Datei + 28 KB weniger.
4. **font-display** (steht auf `swap`) steuert nur, was WÄHREND des Ladens gezeigt
   wird — NICHT wann geladen wird. Gegen den späten Start hilft nur Preload.
