# Ontario Probate Calculator

Public-facing interactive calculator for a law firm website. Estimates Estate Administration Tax, income tax on death, registered plans and trusts from a scenario or dollar value.

## Rules

- Jurisdiction: Ontario, Canada. Rules version 2026-10-25.
- Official primary sources only. Every displayed figure traces to a source id in `rules/2026-10-25/ontario.json`.
- Never invent a rate, threshold or formula.
- Public project. No client or confidential data. Nothing leaves the browser.
- Plain HTML, CSS and JavaScript. No framework, no build step beyond the bundle script.
- Tests with `node --test`. Keep the EAT worked examples passing. Node is not on the default PATH; use `~/.nvm/versions/node/v24.21.0/bin/node`.
- After editing any JSON in `rules/` or `presets.json`, run `npm run bundle` to regenerate the fallback bundles.
- Accessibility: keyboard, labels, contrast, 320 px and 768 px layouts.
- Review with a browser and a Netlify preview before calling it ready.

## Files

- `PROJECT.md`: status, decisions, gaps, links, next action.
- `README.md`: how to run, structure, design rules.
- `REVIEW_NOTES.md`: verification status, corrections, open ship-gate items.
- `sources.json`: pointer to the authoritative source register.
- `rules/2026-10-25/ontario.json`: rates and the S1 to S24 register.
- `tests/`: eat, probate-base, tax, trusts.
