# Project status: Ontario Probate and Estate Cost Calculator

Last updated: 2026-10-26.

## Status

Phases 1-5 built and locally verified. Review build deployed to Netlify on 2026-10-26 from commit e36da14, but the URL sits behind Netlify team protection, so it opens only for a signed-in team member. Not yet release-ready: the ship-gate items in REVIEW_NOTES.md remain.

- Engine: 63/63 node tests pass (eat, probate-base, tax, trusts).
- Math independently verified by the finance-verifier subagent: no numeric discrepancies.
- Browser-verified end to end with the sample estate (EAT $8,250 on a $600,000 base; taxable income $136,800; total income tax estimate $35,895.58; EIR deadline 2027-05-31). No console errors beyond a missing favicon.
- Layout verified at 320px and 768px with no horizontal overflow.

## Decisions (all accepted 2026-10-25)

1. Full 2026 bracket model (federal + Ontario), including surtax and health premium.
2. Professional fees: user-entered, plus labelled situation-based estimate defaults.
3. Donation credit computed, flagged pending primary-source verification.
4. Multiple wills: computed per-asset in-probated-will toggle with strategy flag.
5. Small estate module shipped; court fee field hidden until sourced.
6. Public self-serve, English only, Ontario only.
7. Pre-2020 certificate applications hard-stop.
8. Live e-Laws re-check at ship gate.

## Gaps

- Small estate certificate court fee: schedule names none, so the general $232 application fee is shown with a confirm-with-court note (S26).
- Donation credit rates flagged; 33% top-bracket donation rate not modelled.
- Credits beyond BPA and donations not modelled (age, pension, disability, medical).
- e-Laws live text still 502 as of 2026-10-26; register verified via 2026-06-15 Wayback snapshot.
- Review URL requires a Netlify sign-in. Sharing with the firm needs protection removed or a site password, which needs approval.
- Favicon missing, which produces the only console error.

## Links

- Local run: python3 -m http.server 4173 in this folder, open http://localhost:4173/
- Sample estate: http://localhost:4173/index.html?sample=1
- Review build: https://6adf000e69826051619c7113--ontario-probate-calculator-review.netlify.app/ (Netlify login required)
- Repository: https://github.com/christinecoyle2-ai/ontario-probate-calculator
- Review notes: REVIEW_NOTES.md
- Sources: sources.json pointing at rules/2026-10-25/ontario.json

## Next action

Decide how the firm sees the review: remove Netlify protection for the preview or set a site password. Then close the remaining ship-gate items (live e-Laws re-check, donation credit primary source, EIR guide PDF text).
