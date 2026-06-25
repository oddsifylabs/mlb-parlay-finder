# Oddsify Props Deep Dive Model Integration

This build incorporates the uploaded `Oddsify Labs - MLB Player Props Deep Dive` framework into the parlay engine.

## What is active now

The app still uses Hard Rock Bet odds and a non-Hard Rock Bet no-vig consensus fair probability as the live baseline. On top of that, it now applies the Oddsify prop-priority model:

1. Pitcher Strikeouts
2. Batter Total Bases
3. Pitcher Outs Recorded
4. Batter Hits
5. Batter Home Runs
6. Batter Hits + Runs + RBIs
7. Pitcher Earned Runs
8. Batter Stolen Bases
9. Pitcher Walks

Each leg receives:

- model category
- market softness rating
- EV ceiling rating
- CLV confidence rating
- quarter-Kelly sizing suggestion
- model reasons shown on the parlay card

## What is not active yet

The deep dive references Statcast, BvP, park, weather, confirmed lineups, catcher pop time, delivery time, manager hooks, bullpen workload, and pitch-level data. Those feeds are not bundled in this USB app yet, so the current version uses market consensus as the probability backbone and applies the Oddsify framework as a risk/priority layer.

## Recommended next integrations

1. Statcast/Savant feed
2. Weather and park factor feed
3. Confirmed lineup feed
4. Pitcher workload/bullpen database
5. CLV Pro sync for closing line tracking
