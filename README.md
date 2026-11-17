# Token Radar — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun · rank](https://make.fun/badge/token-radar-01/ranstar04/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun · reward](https://make.fun/badge/token-radar-01/ranstar04/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol, ranks the ones with no token
yet by what their launch would be worth, and shows a reader how to farm each one.

## The model (radar-3)

Implied value is a comparables model, computed from the snapshot's own figures only — no protocol
name is ever special-cased:

```
implied = TVL × multiple × growth × maturity × breadth
```

- **Multiple, hierarchical** — a category with at least 3 traded comparables uses its own
  median market-cap-to-TVL ratio, shrunk toward its family median with weight n / (n + 3);
  a thin category uses its family median, shrunk the same way toward the snapshot-wide
  median; a category with no family uses the snapshot-wide median directly. Each ratio is
  clamped to 0.05–1.50. A lending protocol is priced like lending protocols trade, a bridge
  like bridges trade. Every row also carries its P10–P90 range and a confidence factor from
  the level and the count of comparables.
- **Growth** — the 7-day TVL change, clamped to −50…+100% and weighed 0.35 when positive,
  0.70 when negative: a fall hurts twice as much as a rise helps.
- **Maturity** — 0.70–1.20 over 2 years listed with no token, then declining back toward
  0.95: waiting two years earns the peak, waiting longer does not (unknown age: 0.90).
- **Breadth** — +2% per extra chain, up to 5.

Each row also carries a **farm verdict**: the launch is assumed to airdrop 2% of the implied
value, split among a rough farmer count by TVL tier and discounted by confidence, against
setup gas, $2 a week for the hold and the hours spent at $10 an hour. Net ≥ +$10 is FARM,
≤ −$10 is SKIP, anything between is THIN.

The model was **backtested, leave-one-out, over the snapshot's own traded tokens** (128):
each token was priced by the same formula with itself removed from the comparables and
compared with its real market cap. The median miss is ×4.45 with 35.9% of tokens within 3×,
against ×4.95 / 35.9% for a flat baseline that prices every token off the single global
median — the hierarchy buys a real improvement. The board states this plainly instead of
pretending to price any single launch precisely; that is what the P10–P90 range is for.

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
- `lib/model.ts` — the comparables model, the farm plans, the backtest and the board checks.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied byte-identical from the kit.
- `screenshots/` — the board, a protocol's detail view and a filtered view (1280×800 JPEG).
- `tools/` — the local gate replica (`check-radar.mjs`) and the screenshot script (`shot.mjs`).
