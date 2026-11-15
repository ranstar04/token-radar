# Token Radar — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol, ranks the ones with no token
yet by what their launch would be worth, and shows a reader how to farm each one.

## The model (radar-2)

Implied value is a comparables model, computed from the snapshot's own figures only — no protocol
name is ever special-cased:

```
implied = TVL × category multiple × growth × maturity × breadth
```

- **Category multiple** — the category's median market-cap-to-TVL ratio among the snapshot's own
  live-token protocols (at least 3 comparables), or the whole snapshot's median when a category is
  too thin. A lending protocol is priced like lending protocols trade, a bridge like bridges trade.
  Clamped to 0.05–1.50.
- **Growth** — the 7-day TVL change, clamped to −50…+100% and weighed 0.35.
- **Maturity** — 0.70–1.20 over 1,460 days listed with no token (unknown age: 0.90).
- **Breadth** — +3% per extra chain, up to 10.

The board covers all 40 watchlist protocols plus every rankable pre-token protocol below the
$50M floor. Live-token protocols are set aside and shown at their market values, never ranked.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` into the output directory. Open `out/dashboard/index.html`
in a browser — no network needed.

## Layout

- `main.ts` — the runner: snapshot in, ranked board and dossier out.
- `lib/model.ts` — the comparables model, the farm plans and the board checks.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied byte-identical from the kit.
- `screenshots/` — the board, a protocol's detail view and a filtered view (1280×800 JPEG).
- `tools/` — the local gate replica (`check-radar.mjs`) and the screenshot script (`shot.mjs`).
