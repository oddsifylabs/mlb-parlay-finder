# VIC MLB Props — Daily Workflow Automation

## Turtle Doctrine Chapter 11: The Daily Routine

This document describes the automated daily workflow for VIC MLB Props.

## Schedule

| Time | Task | Automation |
|------|------|------------|
| Morning (8:00 AM) | Injury and Weather Check | Cron job |
| 10:00 AM | VIC SCAN — Initial signal scan | Cron job |
| Noon | Grade Signals, Backtest Cross-Reference | Manual review |
| 1 Hour Pre-First Pitch | Final Line Check, CLV Snapshot | Cron job |
| Post-Game | Grade, Log, Review Tomorrow's Openers | Cron job |

## Cron Jobs Setup

Add these to your crontab or use the Hermes cronjob tool:

```bash
# Morning injury/weather check (8:00 AM)
0 8 * * * cd /path/to/mlb-parlay-finder && curl -s http://localhost:3000/api/workflow?action=morning_check >> logs/workflow.log

# VIC SCAN (10:00 AM)
0 10 * * * cd /path/to/mlb-parlay-finder && curl -s http://localhost:3000/api/workflow?action=vic_scan >> logs/workflow.log

# Pre-first pitch line check (dynamic — adjust based on game times)
0 17 * * * cd /path/to/mlb-parlay-finder && curl -s http://localhost:3000/api/workflow?action=pre_pitch >> logs/workflow.log

# Post-game grading (11:00 PM)
0 23 * * * cd /path/to/mlb-parlay-finder && curl -s http://localhost:3000/api/workflow?action=post_game >> logs/workflow.log
```

## API Workflow Endpoint

Create `/app/api/workflow/route.ts` with the following automations:

### Morning Check (8:00 AM)
- Fetch injury reports from MLB API
- Fetch weather forecasts for all game venues
- Flag games with:
  - Starting pitcher changes
  - Key player injuries
  - Wind > 15 mph
  - Precipitation > 30%

### VIC SCAN (10:00 AM)
- Run initial parlay generation
- Detect signals (STEAM, RLM, LINE_FREEZE, etc.)
- Send Telegram alert for high-confidence signals

### Pre-Pitch Check (1 Hour Before First Game)
- Final line comparison
- CLV snapshot (record opening lines)
- Lineup confirmation status
- Send final recommendations

### Post-Game (11:00 PM)
- Fetch game results
- Update CLV records with closing lines
- Calculate P&L for the day
- Generate daily summary report

## Telegram Alert Configuration

Add to `.env.local`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Alert thresholds
ALERT_MIN_SIGNAL_SCORE=0.04  # Only alert signals with 4%+ CLV
ALERT_MIN_EDGE=0.02          # Only alert 2%+ edge
```

## Weather Integration

Use OpenWeatherMap or similar:

```env
WEATHER_API_KEY=your_openweathermap_key
```

## Lineup Integration

Use MLB Stats API:

```env
MLB_API_KEY=your_mlb_stats_api_key
```

## Manual Review Checklist

### Noon Review
- [ ] Cross-reference VIC signals with backtest data
- [ ] Check for conflicting syndicate action
- [ ] Verify no late injury news
- [ ] Confirm weather hasn't changed significantly

### Pre-Pitch Review
- [ ] Confirm lineups are official
- [ ] Check final line movement
- [ ] Verify CLV vs opening line
- [ ] Place bets only on confirmed signals

### Post-Game Review
- [ ] Log all results in VIC Portfolio
- [ ] Calculate daily CLV
- [ ] Review any system overrides
- [ ] Preview tomorrow's pitching matchups

## Emergency Stop Conditions

Per Chapter 10, stop betting when:
- [ ] 30% drawdown reached
- [ ] Multiple key injuries in single game
- [ ] Weather delays/Postponements
- [ ] Technical issues with data feeds
