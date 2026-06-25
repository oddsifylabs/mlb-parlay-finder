# VIC MLB Props — Maintenance & Monitoring Plan

## Primary Focus Project
**Repository:** https://github.com/oddsifylabs/mlb-parlay-finder  
**Standard:** A+ Turtle Doctrine Compliance (100/100)  
**Owner:** Ms. Anderson — Web Development Specialist

---

## 📊 Daily Monitoring Checklist

### Automated Checks (Cron Jobs)
| Time | Check | Action |
|------|-------|--------|
| 6:00 AM | Build health check | Alert if build fails |
| 9:00 AM | API endpoint health | Test all 5 API routes |
| 12:00 PM | Database integrity | Verify SQLite tables |
| 6:00 PM | Error log review | Check for new errors |
| 11:00 PM | Daily summary report | Send to Telegram |

### Manual Weekly Reviews
- [ ] Turtle Doctrine compliance audit
- [ ] User feedback review
- [ ] Performance metrics (load time, API response)
- [ ] Dependency updates available
- [ ] Signal detection accuracy (if data available)

---

## 🔧 Maintenance Tasks

### Weekly
1. **Check for Next.js updates** — Review changelog, test in dev
2. **Review error logs** — Look for patterns
3. **Test all API endpoints** — Ensure responses are valid
4. **Verify database growth** — Check SQLite file size

### Monthly
1. **Turtle Doctrine compliance audit** — Re-read Chapters 6-11, verify alignment
2. **Performance profiling** — Lighthouse scores, bundle size
3. **Security review** — Dependencies, API key handling
4. **Backup database** — Export SQLite data

### Quarterly
1. **Major version updates** — Next.js, React, TypeScript
2. **Feature roadmap review** — New signals, integrations
3. **User experience audit** — Navigation, clarity, speed
4. **Documentation refresh** — README, workflow docs

---

## 🚨 Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Build failures | 1 | 2+ | Immediate fix required |
| API errors | >5% | >10% | Investigate endpoint |
| Page load time | >3s | >5s | Optimize bundle |
| Database size | >100MB | >500MB | Archive old data |
| TypeScript errors | 1+ | 5+ | Fix before next deploy |

---

## 📁 Key Files to Watch

| File | Purpose | Change Frequency |
|------|---------|------------------|
| `lib/signals.ts` | Signal detection logic | Low (stable) |
| `lib/bankroll.ts` | Position sizing | Low (stable) |
| `lib/db/history.ts` | Database schema | Medium (enhancements) |
| `app/page.tsx` | Main UI | Medium (UX improvements) |
| `app/api/*/route.ts` | API endpoints | Medium (bug fixes) |
| `README.md` | Documentation | Low (feature updates) |

---

## 🛠️ Common Issues & Fixes

### Build Failures
```bash
# Check TypeScript errors
npm run build 2>&1 | grep "error"

# Common fix: type mismatches in page.tsx
# Solution: Add explicit type annotations to useMemo/filter callbacks
```

### API Endpoint Errors
```bash
# Test individual endpoints
curl http://localhost:3000/api/clv?action=summary
curl http://localhost:3000/api/bankroll?action=summary
curl http://localhost:3000/api/workflow?action=vic_scan
```

### Database Corruption
```bash
# Backup first
cp data/mlb-parlay-finder.sqlite data/backup-$(date +%Y%m%d).sqlite

# Verify integrity
sqlite3 data/mlb-parlay-finder.sqlite "PRAGMA integrity_check;"
```

### Signal Detection Issues
- Verify `lib/signals.ts` thresholds match Chapter 8 specs
- Check historical CLV values against book data
- Test with mock data if live API unavailable

---

## 📈 Performance Benchmarks

| Metric | Target | Current |
|--------|--------|---------|
| Lighthouse Performance | >90 | TBD |
| Lighthouse Accessibility | >95 | TBD |
| Lighthouse Best Practices | >95 | TBD |
| Lighthouse SEO | >90 | TBD |
| First Contentful Paint | <1.5s | TBD |
| Time to Interactive | <3.5s | TBD |
| Bundle Size | <500KB | TBD |

**Action:** Run initial Lighthouse audit to establish baseline.

---

## 🔐 Security Checklist

- [ ] API keys stored in `.env.local` (not committed)
- [ ] SQLite database not exposed via public routes
- [ ] No sensitive data in client-side code
- [ ] CORS configured correctly
- [ ] Rate limiting on API endpoints (future)
- [ ] Input validation on all POST requests

---

## 📝 Change Log Template

```markdown
## [Version] - YYYY-MM-DD

### Added
- New feature description

### Changed
- Modified component/feature

### Fixed
- Bug fix description

### Turtle Doctrine Compliance
- Chapter X: Verified/Updated [feature]
```

---

## 🎯 A+ Compliance Verification

Before any merge to main, verify:

| Chapter | Feature | Status |
|---------|---------|--------|
| 6 | Contrarian Premium (Tickets vs. Money) | ✅ |
| 7 | VIC Command Center (Signals/CLV/Bankroll tabs) | ✅ |
| 8 | Six Signals Engine | ✅ |
| 9 | MLB Signal Patterns (market priority) | ✅ |
| 10 | Bankroll Engineering (tiers, drawdown) | ✅ |
| 11 | Daily Routine (workflow automation) | ✅ |

**Any feature that breaks compliance must be fixed before merge.**

---

## 📞 Emergency Contacts

| Issue | Priority | Response Time |
|-------|----------|---------------|
| Build failure | Critical | Immediate |
| API downtime | Critical | 1 hour |
| Data loss | Critical | Immediate |
| UI bug | Medium | 24 hours |
| Feature request | Low | Weekly review |

---

## 🔄 Deployment Process

1. **Develop** — Feature branch, test locally
2. **Review** — Turtle Doctrine compliance check
3. **Build** — `npm run build` (must pass)
4. **Commit** — Descriptive message with compliance note
5. **Push** — `git push origin main`
6. **Verify** — Check GitHub Actions (if CI added)
7. **Monitor** — Watch for errors in first hour

---

*Last updated: $(date +%Y-%m-%d)*  
*Next review: $(date -d '+7 days' +%Y-%m-%d)*
