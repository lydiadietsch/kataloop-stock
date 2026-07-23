# JS-Aufschlüsselung — Stock-Übersicht (`/stockfotos-videos`)

Gemessen gegen **Staging** (`kataloop-gmbh.webflow.io`) am 2026-07-23. Zweck:
aufschlüsseln, **was** geladen wird, **bevor** irgendetwas geändert wird
(offener Punkt 5). Keine Änderung — reine Analyse.

## Externe Skripte (statisch im HTML)

| Skript | roh | gzip | Kategorie | Bewertung |
|---|---:|---:|---|---|
| **gtag.js** (GA4) | 564 KB | **181 KB** | Google Analytics | **Mit ABSTAND der größte Brocken.** Lädt dynamisch weiter (analytics/collect) → Quelle vieler der ~47 Anfragen. |
| jquery-3.5.1 | 87 KB | 30 KB | Webflow braucht es | Nur weg, wenn keine IX2/jQuery-Abhängigkeit mehr. Schwer. |
| fs-cc.js | 29 KB | 10 KB | Finsweet Cookie-Consent | DSGVO-Pflicht. Bleibt. |
| **cart.min.js** | 38 KB | 10 KB | EIGEN (Warenkorb) | Nötig. |
| **stock.min.js** | 21 KB | 8 KB | EIGEN (Stock-Logik) | Nötig, gut optimiert. |
| webflow.js | 5 KB | 2 KB | Webflow-Runtime (IX2) | Pflicht. |
| finsweet-config.js | 1.7 KB | 0.8 KB | Finsweet Components-Config | **Zu prüfen** — lädt evtl. `fs-cmsnest` (101 solcher Attribute im HTML). Wenn nichts mehr davon aktiv ist: entfernbar. |
| **Summe statisch** | **~747 KB** | **~242 KB** | | |

Die von der Nutzerin genannten „3.550 KB / 47 Anfragen" umfassen mehr als diese
7 (dynamische GA-Sub-Requests, CSS, Fonts, Bilder, die Katalog-Vorlade-Abrufe von
`stock.js`). Bei den **Skripten** dominiert eindeutig **GA4**.

## Inline-Blöcke (6)

1. **Grid-Höhe** (`getHeight`) — setzt die Zellhöhen je Viewport. **PFLICHT** (stock.js baut darauf).
2. **`hideLastIfDotsBefore()`** — altes Blätter-Embed. **ENTFERNBAR** — `stock.js` macht die Auslassungspunkte selbst (README).
3–6. kleine DOMContentLoaded-Helfer (current-Zustand, body-style, `.w-slider`-Init, `lang`-Auslesung) — je wenige Zeilen, vernachlässigbar.

## Größte Hebel (Reihenfolge nach Wirkung)

1. **GA4 verzögern** (181 KB gzip): gtag erst **nach** Consent/Interaktion oder
   `requestIdleCallback` laden, statt im kritischen Pfad. Größter Einzelgewinn,
   ohne Analytics zu verlieren. (Hängt mit offenem Punkt 8 „Suchbegriffe an GA4"
   zusammen — beides über dieselbe GA-Einbindung.)
2. **finsweet-config prüfen** (0.8 KB + evtl. Folge-Requests): Wird `fs-cmsnest`
   noch gebraucht? Wenn nein, Skript + Attribute raus.
3. **jQuery** (30 KB gzip): nur nach Webflow-Umbau (IX2 raus) los. Aufwand hoch,
   Gewinn mittel — eher später.
4. **Inline `hideLastIfDotsBefore`** raus (minimal, aber sauber).

## Einzelseiten (`/stockmedien/[slug]`)

Nutzerin nannte 61 Anfragen / 4.009 KB. Nicht separat vermessen — erwartbar
dieselbe Skript-Basis + mehr Bilder (7-Bilder-Listen, s. offener Punkt 3/6).
Vor Optimierung dort dieselbe Messung wiederholen.
