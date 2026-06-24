# VIC MLB Props

**Player Prop Intelligence + Parlay Builder**

VIC MLB Props is a USB-friendly Next.js app for finding DraftKings MLB player prop value and building 3, 4, and 5-leg parlay candidates. It uses the Oddsify Labs VIC framework: **Value • Information • Closing Line Edge**.

## What's included

- Live DraftKings MLB prop odds via The Odds API
- 3-leg, 4-leg, and 5-leg parlay tabs
- Builder modes: Conservative, Standard, Portfolio Mode, High EV
- Pitcher, hitter, and game market filters
- Upcoming-games-only filter
- Oddsify/VIC Score and leg-level score breakdown
- SQLite-backed VIC Portfolio history
- USB start scripts

## Run

1. Add your API key to `.env.local`:

```env
ODDS_API_KEY=your_key_here
```

2. Start dev mode:

```powershell
npm install
npm run dev
```

Or double-click `start-usb-dev.bat` from the USB build.

Open `http://localhost:3000`.

## Notes

This tool is informational only. Confirm every line in DraftKings before betting. Never wager more than you can afford to lose.
