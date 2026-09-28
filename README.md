# Pack Check

A free, single-page web app: paste a prompt pack for an AI agent and get it
checked against the seven things every solid pack needs. Sibling of
[Agent House Rules](https://agent-house-rules.pages.dev).

## The seven checks

1. **Title** — starts with `# Prompt Pack: <name>`
2. **Who it's for** — names the audience in plain words
3. **Provenance** — names a live book or account with real fills (a backtest alone doesn't count)
4. **Disclosure** — says it's education, not financial advice, with losable-bankroll framing
5. **The prompt** — the actual instructions to hand to the agent
6. **Risk rules** — hard stops (or caps) plus a never-add-to-losers rule (highest weight)
7. **Why it works + metrics** — honest mechanism, no hype, plus what to measure

Each check reports Pass / Weak / Missing with a one-line explanation.

## Red flags

- Win-rate theater / profit guarantees ("90% win rate", "guaranteed", "can't lose", "risk-free")
- Martingale language ("double down", "average down", "add to losers") — negated forms
  like "never add to losers" are correctly ignored
- Track-record fabrication ("backtested" with no live claim, hypothetical/simulated results)
- Missing disclosure entirely
- No stop-loss language at all

Each flag shows the matched quote from the pack.

## Buttons

- **Check my pack** — runs the analysis, shows score (e.g. "6/7 sections + 1 red flag") and a verdict
- **Load a sample pack** — fills in a short clean pack so you can see what passing looks like
- **Copy report** — the results as a Markdown checklist
- **Copy blank template** — the canonical 7-section skeleton to fill in
- **Start over** — resets

## Technical

- `index.html` + `app.js` + `style.css`. No build step.
- 100% client-side: no network calls, no storage, no tracking, no cookies.
- Monochrome, system font, works with JavaScript disabled for nothing (checker needs JS;
  the page says so).
- `window.__packCheck` exposes `{ analyze, checks, sample, template }` as a read-only
  test hook.

## Deploy (Cloudflare Pages)

```sh
cd pack-check
npx wrangler pages deploy . --project-name pack-check
```

Any static host works — it's three files.

## Honest framing

Pack Check is a checklist, not a guarantee. It reads the words in a pack; it can't
verify a track record is real. A pack that passes all seven checks can still lose
money — that's what the disclosure is for.

## License

MIT — see LICENSE. Copyright 2026 Orbital Desk LLC.

## Roadmap

- Paid native apps (iOS / Android), same playbook as House Rules: free web funnel,
  paid apps behind it.
- Deeper checks (e.g. sizing math sanity, section-length balance) once the canonical
  pack spec stabilizes.
