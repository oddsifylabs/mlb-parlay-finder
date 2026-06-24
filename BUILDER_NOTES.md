# Builder Upgrade Notes

This build adds the requested parlay-builder and prop-filter upgrades.

## Parlay builder

- 3-leg, 4-leg, and 5-leg tabs.
- Builder modes:
  - Safe: stronger edge/CLV requirements and more diversified cards.
  - Balanced: default ranking across score, EV, edge, and model bonuses.
  - Low-correlation: prioritizes one leg per game and market diversity.
  - Aggressive: allows more plus-money/upside legs while still blocking obvious duplicate player/market conflicts.
- Each card now shows Mode and Risk.

## Prop market filters

- Pitcher filters: strikeouts, outs, hits allowed, earned runs, walks, pitcher win.
- Hitter filters: hits, total bases, H+R+RBI, RBIs, runs, HRs, singles, doubles, walks, strikeouts, stolen bases.
- Game filters: moneyline, run line, totals.
- Quick buttons: Core, Pitcher only, Hitter only, Game only, Clear.
- Optional alternate props toggle.

## Notes

The app still uses DraftKings as the target sportsbook and consensus no-vig pricing as the fair-probability baseline. All plays should be confirmed in DraftKings before betting.
