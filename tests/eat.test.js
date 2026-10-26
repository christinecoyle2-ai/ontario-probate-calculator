import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  dollarsToCents,
  computeEAT,
  computeProbateBase,
  eatClosedFormCrossCheck,
  smallEstateEligible,
  computeEirDeadline,
} from "../app.js";

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(here, "..", "rules", "2026-10-25", "ontario.json"), "utf8")
);

function eat(baseDollars, extra = {}) {
  return computeEAT(rules, {
    baseCents: dollarsToCents(baseDollars),
    certificateRequested: true,
    applicationDate: "2026-06-01",
    ...extra,
  });
}

test("Ontario page example: 240000 yields 2850", () => {
  const r = eat(240000);
  assert.equal(r.eatCents, dollarsToCents(2850));
});

test("Rounding: 239250 rounds to 240000 and yields 2850", () => {
  const r = eat(239250);
  assert.equal(r.roundedCents, dollarsToCents(240000));
  assert.equal(r.eatCents, dollarsToCents(2850));
});

test("T2 zero estate yields 0", () => {
  assert.equal(eat(0).eatCents, 0);
});

test("T35 at exemption 50000 yields 0", () => {
  const r = eat(50000);
  assert.equal(r.eatCents, 0);
  assert.equal(r.exempt, true);
});

test("T35 just over exemption 50001 yields 15", () => {
  assert.equal(eat(50001).eatCents, dollarsToCents(15));
});

test("T35 exact 51000 yields 15", () => {
  assert.equal(eat(51000).eatCents, dollarsToCents(15));
});

test("Large estate 1000001 yields 14265", () => {
  assert.equal(eat(1000001).eatCents, dollarsToCents(14265));
});

test("T34 small estate boundary 150000 eligible and yields 1500", () => {
  const r = eat(150000);
  assert.equal(r.smallEstateEligible, true);
  assert.equal(r.eatCents, dollarsToCents(1500));
});

test("T34 small estate boundary 150001 not eligible and yields 1515", () => {
  const r = eat(150001);
  assert.equal(r.smallEstateEligible, false);
  assert.equal(r.eatCents, dollarsToCents(1515));
});

test("T36 no certificate requested yields 0 with note", () => {
  const r = eat(900000, { certificateRequested: false });
  assert.equal(r.eatCents, 0);
  assert.equal(r.notes[0].code, "no_certificate_requested");
});

test("T36 exempt certificate types yield 0", () => {
  for (const t of rules.eat.exemptCertificateTypes) {
    const r = eat(900000, { certificateType: t });
    assert.equal(r.eatCents, 0);
    assert.equal(r.notes[0].code, "exempt_certificate_type");
  }
});

test("Pre-2020 application hard stops", () => {
  const r = eat(240000, { applicationDate: "2019-06-01" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "pre2020_not_supported");
});

test("T42 encumbrance exceeding value clamps contribution to 0 with warning", () => {
  const { baseCents, warnings } = computeProbateBase(rules, [
    {
      valueCents: dollarsToCents(300000),
      included: true,
      encumbranceCents: dollarsToCents(350000),
      encumbranceRegisteredOnIncludedOnRealProperty: true,
    },
    { valueCents: dollarsToCents(100000), included: true },
  ]);
  assert.equal(baseCents, dollarsToCents(100000));
  assert.equal(
    warnings.some((w) => w.code === "encumbrance_exceeds_value"),
    true
  );
});

test("Unregistered encumbrance is not deducted and warns", () => {
  const { baseCents, warnings } = computeProbateBase(rules, [
    {
      valueCents: dollarsToCents(800000),
      included: true,
      encumbranceCents: dollarsToCents(80000),
      encumbranceRegisteredOnIncludedOnRealProperty: false,
    },
  ]);
  assert.equal(baseCents, dollarsToCents(800000));
  assert.equal(
    warnings.some((w) => w.code === "encumbrance_not_deductible"),
    true
  );
});

test("Registered mortgage deducted: 800k house less 300k mortgage plus 100k cash gives base 600k and EAT 8250", () => {
  const { baseCents } = computeProbateBase(rules, [
    {
      valueCents: dollarsToCents(800000),
      included: true,
      encumbranceCents: dollarsToCents(300000),
      encumbranceRegisteredOnIncludedOnRealProperty: true,
    },
    { valueCents: dollarsToCents(100000), included: true },
  ]);
  assert.equal(baseCents, dollarsToCents(600000));
  const r = computeEAT(rules, {
    baseCents,
    certificateRequested: true,
    applicationDate: "2026-06-01",
  });
  assert.equal(r.eatCents, dollarsToCents(8250));
});

test("Small estate eligibility function", () => {
  assert.equal(smallEstateEligible(rules, dollarsToCents(150000)), true);
  assert.equal(smallEstateEligible(rules, dollarsToCents(150000.01)), false);
});

test("Closed-form cross-check matches engine across boundary values", () => {
  const values = [
    0, 1, 999, 1000, 1001, 49999, 50000, 50001, 51000, 51001, 239250,
    240000, 999001, 1000001, 150000, 150001, 2850000.5,
  ];
  for (const v of values) {
    const cents = dollarsToCents(v);
    const r = computeEAT(rules, {
      baseCents: cents,
      certificateRequested: true,
      applicationDate: "2026-06-01",
    });
    assert.equal(
      r.eatCents,
      eatClosedFormCrossCheck(rules, cents),
      `mismatch at ${v}`
    );
  }
});

test("EAT is always an exact whole dollar amount", () => {
  for (const v of [50001, 123456, 999999, 2850001]) {
    const r = eat(v);
    assert.equal(r.eatCents % 100, 0);
  }
});

test("T44 EIR deadline is 180 calendar days with weekend rollover", () => {
  assert.equal(computeEirDeadline(rules, "2026-12-24"), "2027-06-22");
});

test("Negative base rejected", () => {
  const r = computeEAT(rules, {
    baseCents: -1,
    certificateRequested: true,
    applicationDate: "2026-06-01",
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid_base");
});

test("Court fee schedule present from S26", () => {
  assert.equal(rules.courtFees.regularApplicationDollars, 232);
  assert.equal(rules.courtFees.succeedingOrDuringLitigationDollars, 138);
  assert.equal(rules.courtFees.smallEstateApplicationDollars, null);
});
