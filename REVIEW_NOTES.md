# Review notes: Ontario Probate and Estate Cost Calculator

Date: 2026-10-25, deploy record 2026-10-26. Rules version: 2026-10-25. Status: Phases 1-5 built and verified; review build deployed behind Netlify team login. Release still gated on the open ship-gate items below.

## Source verification status

All 24 sources in the register were actually fetched and read on 2026-10-25. Method per source is recorded in rules/2026-10-25/ontario.json:

- Fetched live: ontario.ca Estate Administration Tax page (updated 2026-06-24), ontario.ca small-estate page, laws-lois.justice.gc.ca ITA s. 40, 54, 70, 104, 248 (current to 2026-09-30), pm.gc.ca capital-gains release, data.ontario.ca MOF 2026 rates XLSX, EIR guide PDF (downloaded 2.2 MB, text extraction failed; the 180-day rule is confirmed by the live EAT page instead).
- Verified via Wayback snapshots because canada.ca refused all direct fetches and the e-Laws API returned 502: EATA 1998 ss. 1(1), 2(2)(b), 2(6.1) (snapshot 2026-06-15); CRA RC4177 (2026-05-13); RRIF income (2026-02-09); TFSA successor holder (2026-04-15); TFSA beneficiary (2026-05-18); tax brackets 2026 (2026-10-19); T4032ON surtax and health premium (2026-09-04); CRA indexation (2026-08-23); CPP death benefit (2026-10-17); RC4092 RESP (2026-09-10).

## Corrections made to the planning document during verification

1. CPP death benefit is up to $5,000 since 2025-01-01 (basic $2,500 plus top-up $2,500), not the flat $2,500 the plan implied. Engine caps inclusion at $5,000.
2. The federal first bracket for 2026 is 14%, not 15% (legislated reduction). Brackets: 58,523 / 117,045 / 181,440 / 258,482.
3. The plan's PRE worked example mislabelled ITA 40(2)(b): A - (A x B/C) is the REMAINING gain; the exempt portion is A x B/C. Cottage example corrected: owned 20, designated 10, gain 400,000 gives exempt 220,000, remaining 180,000, taxable capital gain 90,000 (plan had 110,000). The engine implements the statute's direction; the initial engine draft had the same swap and was fixed before Phase 3 sign-off.
4. The plan's C9 worked example total of 21,520.57 came from double-rounding intermediates. Engine spec: round each output line once. Correct values: federal 14,392.73, Ontario basic 6,284.52, surtax 93.30, premium 750, Ontario 7,127.82, total 21,520.55. Tests encode the engine spec.
5. The plan's T34 expected EAT of 1,500 for a base of 150,001 was wrong: 150,001 rounds up to 151,000, EAT 1,515. Test corrected.
6. EATA s. 1(1) was amended by 2024, c. 12, Sched. 2, s. 1, in force 2024-05-16. Register updated.
7. Ontario surtax and health premium were missing from the plan entirely; both are now modelled (decision 2).
8. New 2026 rule captured: TFSA post-death earnings can be designated exempt contributions from 2026-01-01 (flag shown).

## Independent verification

- finance-verifier subagent independently recomputed EAT examples, the full 2026 tax worked example, surtax boundaries, health premium tiers, PRE formula direction, donation credits and RRSP/RRIF logic: all PASS, no numeric discrepancies. It confirmed the single documentation defect (PRE formula string mislabel), since fixed in the rules JSON.
- Engine test suite: 62/62 pass (node --test, Node v24.21.0).
- Static HTML audit (html_ui_audit.py): 0 mechanical findings.
- Browser QA 2026-10-26 in headless Chrome (CDP device metrics at 320px and 768px): sample estate renders end to end with EAT $8,250 on base $600,000, taxable income $136,800, federal $23,023.25, Ontario $12,872.33 including surtax $1,887.40 and health premium $750, total income tax $35,895.58, EIR deadline 2027-05-31 with weekend rollover, source footnotes and flags rendered. No uncaught console errors. No horizontal overflow at 320px or 768px (clientWidth equals scrollWidth at both).
- Browser QA found and fixed four UI bugs: el() helper dropped sibling children so multi-row tables showed one row; val() and checked() passed bare ids to querySelector so date, select and checkbox reads were silently empty (which hid the EIR deadline line); boot() appended an extra empty asset after a preset load; result tables forced horizontal page overflow on narrow screens, fixed with per-table scroll and wrap rules.

## Engine specification decisions

- Integer cents everywhere; each result line rounded once; EAT always whole dollars; statutory round-up to the nearest $1,000.
- Spousal rollover applies by default for capital assets marked as transferring to the spouse when a spouse exists; user can disable per asset (T39).
- Joint with a non-spouse is INCLUDED until the user explicitly confirms beneficial ownership passed (resulting-trust flag always shown). No silent exclusion.
- RRSP/RRIF rollover requires sole spouse AND user-confirmed transfer conditions; otherwise full FMV into income with an explanatory flag.
- Multiple wills: base restricted to assets flagged as in the probated will when a limited certificate is selected (S5 exception).
- Ancillary/resealing: non-Ontario-situs Canadian assets excluded (S5 exception).
- Reserve property: included until the user confirms the possible exemption (S5).
- Low-income Ontario tax reduction not modelled for v1 (death-year returns exceed the reduction threshold in effectively all modelled cases); documented in the rules JSON.
- Pre-2020 application dates hard-stop with a message rather than modelling historic rates (decision 9).

## Open items and ship gate

1. Re-fetch the live e-Laws text of EATA 1998 once the API recovers; today's verification used the 2026-06-15 Wayback snapshot (still 502 on 2026-10-26 retry).
2. Donation credit rates: standard rates modelled, flagged pending primary-source verification; the 33% top-bracket donation rate (relevant above about $258,482 taxable income) is not modelled.
3. Small estate certificate court fee: the schedule (S26, page updated 2026-04-09) names no small-estate-specific fee, so the UI shows the general $232 application fee with an explicit confirm-with-court note. A small-estate-specific amount, if any, remains unconfirmed.
4. Resolved 2026-10-26: ITA s. 146.3(1) successor-annuitant mechanics confirmed live (S25); Superior Court estate application fees confirmed live (S26) and added to the fee card and totals as a statutory line ($232 regular, $138 succeeding or during litigation).
5. Browser QA done headlessly (320/768px, sample estate end to end). A human pass on a real device is still recommended before launch.
6. Resolved 2026-10-26: repository is github.com/christinecoyle2-ai/ontario-probate-calculator (public, commit e36da14) and a Netlify draft deploy was built from that commit. The URL is behind Netlify team protection, so only a signed-in team member can open it; giving the firm access needs the protection removed or a site password set, which requires the principal's approval.
7. Estate Information Return guide PDF text extraction failed; non-blocking, but retry at the ship gate.

## How to run

See README.md. Local server: python3 -m http.server 4173 in this folder, open http://localhost:4173/. Tests: ~/.nvm/versions/node/v24.21.0/bin/node --test tests/*.test.js.

## Deploy record

- 2026-10-26: Netlify project `ontario-probate-calculator-review`, draft deploy of the site files from commit e36da14.
- Draft URL: https://6adf000e69826051619c7113--ontario-probate-calculator-review.netlify.app/
- Deployed files (site only): index.html, styles.css, ui.js, app.js, rules-bundle.js, presets-bundle.js, presets.json, rules/2026-10-25/ontario.json. Internal notes, tests and scripts are not published.
- Access: Netlify team protection returns 401 to anyone not signed in.
- Checks on the deployed artifact (served locally from the same directory): 63 of 63 node tests pass; sample estate shows EAT $8,250, taxable income $136,800, tax $35,895, court filing fee $232, EIR deadline 2027-05-31; no page overflow at 320px; only console error is a missing favicon.ico.
- Duplicate copy at `/Users/christine/probate-calculator` is older: its ui.js and rules JSON lack the court fee card and the S25/S26 entries. This folder is authoritative.
