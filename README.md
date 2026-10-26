# Ontario Probate and Estate Cost Calculator

Estimate tool for Ontario Estate Administration Tax (probate fees) and income tax on death. Public self-serve, English, Ontario only, 2026 rules. Estimates only, not legal or tax advice.

## Run locally

```
cd probate-calculator
python3 -m http.server 4173
# open http://localhost:4173/
```

Opening index.html directly from disk also works: the app falls back to bundled copies of the rules and presets when fetch is unavailable.

## Tests

```
~/.nvm/versions/node/v24.21.0/bin/node --test tests/*.test.js
```

Requires Node 18 or newer (developed on v24.21.0 via nvm; node is not on the default PATH on this machine).

## Structure

```
index.html          intake flow and results panels
styles.css          AA-contrast styling, estimate vs statutory visual split, 320px support
app.js              pure computation engine (no DOM), integer cents throughout
ui.js               browser wiring: conditional fields, results, source footnotes, presets
presets.json        scenario presets
rules/2026-10-25/   versioned rules JSON with the full verified source register S1-S24
rules-bundle.js     generated fallback copy (npm run bundle)
presets-bundle.js   generated fallback copy (npm run bundle)
scripts/bundle.mjs  regenerates the fallback bundles from the JSON sources
tests/              node --test suites: eat, probate-base, tax, trusts
```

After editing any JSON in rules/ or presets.json, run `npm run bundle` (or `node scripts/bundle.mjs`) to regenerate the fallback bundles.

## Design rules

- Users enter raw facts only. Marginal rates, the probate base, taxable income and all taxes are derived and displayed.
- Every computed result line shows the condition that triggered it plus superscript source ids linking to the source register with URL, section, effective date, as-of date and verification method.
- Flags never change a number without an explicit user selection (for example the joint-with-adult-child exclusion confirmation).
- Professional fee figures are user-entered or clearly labelled estimates with a dashed border and an "Estimate, not a government figure" tag. Statutory figures carry a "Statutory" tag.
- All money is integer cents; each output line is rounded exactly once; EAT is always whole dollars.
- No data leaves the browser. No analytics. No secrets are stored (password and access fields are deliberately absent).

## Known gaps (tracked in REVIEW_NOTES.md)

- Small estate certificate court fee: amount unconfirmed, intentionally hidden.
- Donation credit rates: modelled at standard rates, flagged pending source verification at the ship gate; the 33% top-bracket donation rate is not modelled.
- Income tax estimate includes BPA and donation credits only; age, pension, disability and medical credits are not modelled and would reduce tax.
- Ship gate: re-fetch the live e-Laws text of the Estate Administration Tax Act (verification on 2026-10-25 used a 2026-06-15 archive snapshot because the e-Laws API returned 502).
