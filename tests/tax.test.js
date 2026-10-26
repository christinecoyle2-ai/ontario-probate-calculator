import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  dollarsToCents,
  computeIncomeTax,
  computeDeemedDispositions,
  computePlanInclusions,
  computeFinalReturn,
  ontarioSurtax,
  ontarioHealthPremium,
  validateAssets,
} from "../app.js";

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(here, "..", "rules", "2026-10-25", "ontario.json"), "utf8")
);

const estateWithSpouse = { spouse_or_clp: { exists: true } };

test("T41 worked example: taxable income 100000 BPA-only", () => {
  const r = computeIncomeTax(rules, {
    taxableIncomeCents: dollarsToCents(100000),
  });
  assert.equal(r.federalCents, dollarsToCents(14392.73));
  assert.equal(r.ontarioBreakdown.basicCents, dollarsToCents(6284.52));
  assert.equal(r.ontarioBreakdown.surtaxCents, dollarsToCents(93.3));
  assert.equal(r.ontarioBreakdown.healthPremiumCents, dollarsToCents(750));
  assert.equal(r.ontarioCents, dollarsToCents(7127.82));
  assert.equal(r.totalCents, dollarsToCents(21520.55));
});

test("T40 surtax boundaries", () => {
  assert.equal(ontarioSurtax(rules, dollarsToCents(5818)), 0);
  assert.equal(ontarioSurtax(rules, dollarsToCents(5819)), 20);
  assert.equal(
    ontarioSurtax(rules, dollarsToCents(7447)),
    dollarsToCents(325.8) + dollarsToCents(0.36)
  );
});

test("Health premium tiers", () => {
  assert.equal(ontarioHealthPremium(rules, dollarsToCents(20000)), 0);
  assert.equal(ontarioHealthPremium(rules, dollarsToCents(25000)), dollarsToCents(300));
  assert.equal(ontarioHealthPremium(rules, dollarsToCents(40000)), dollarsToCents(450));
  assert.equal(ontarioHealthPremium(rules, dollarsToCents(100000)), dollarsToCents(750));
  assert.equal(ontarioHealthPremium(rules, dollarsToCents(1000000)), dollarsToCents(900));
});

test("Zero taxable income yields zero tax", () => {
  const r = computeIncomeTax(rules, { taxableIncomeCents: 0 });
  assert.equal(r.federalCents, 0);
  assert.equal(r.ontarioCents, 0);
});

test("T45 asset with ACB equal to FMV yields zero gain", () => {
  const d = computeDeemedDispositions(
    rules,
    [
      {
        category: "investment",
        ownership: "sole",
        valueCents: dollarsToCents(200000),
        acbCents: dollarsToCents(200000),
      },
    ],
    {}
  );
  assert.equal(d.taxableCapitalGainsCents, 0);
});

test("Deemed disposition 50 percent inclusion", () => {
  const d = computeDeemedDispositions(
    rules,
    [
      {
        category: "out_of_province_real_property",
        ownership: "sole",
        valueCents: dollarsToCents(500000),
        acbCents: dollarsToCents(300000),
      },
    ],
    {}
  );
  assert.equal(d.netGainCents, dollarsToCents(200000));
  assert.equal(d.taxableCapitalGainsCents, dollarsToCents(100000));
});

test("T38 principal residence partial exemption cottage per ITA 40(2)(b)", () => {
  const d = computeDeemedDispositions(
    rules,
    [
      {
        category: "on_real_property",
        ownership: "sole",
        valueCents: dollarsToCents(600000),
        acbCents: dollarsToCents(200000),
        principal_residence: {
          designated: true,
          years_owned_post_1971: 20,
          years_designated: 10,
        },
      },
    ],
    {}
  );
  assert.equal(d.lines[0].gainCents, dollarsToCents(400000));
  assert.equal(d.lines[0].exemptCents, dollarsToCents(220000));
  assert.equal(d.netGainCents, dollarsToCents(180000));
  assert.equal(d.taxableCapitalGainsCents, dollarsToCents(90000));
});

test("Full principal residence exemption when designated all years", () => {
  const d = computeDeemedDispositions(
    rules,
    [
      {
        category: "on_real_property",
        ownership: "sole",
        valueCents: dollarsToCents(900000),
        acbCents: dollarsToCents(500000),
        principal_residence: {
          designated: true,
          years_owned_post_1971: 20,
          years_designated: 20,
        },
      },
    ],
    {}
  );
  assert.equal(d.taxableCapitalGainsCents, 0);
});

test("T39 spousal rollover applies by default and can be disabled", () => {
  const asset = {
    category: "on_real_property",
    ownership: "sole",
    transfersToSpouse: true,
    valueCents: dollarsToCents(700000),
    acbCents: dollarsToCents(250000),
    sellingCostsCents: dollarsToCents(20000),
  };
  const rolled = computeDeemedDispositions(rules, [asset], estateWithSpouse);
  assert.equal(rolled.taxableCapitalGainsCents, 0);
  assert.equal(rolled.lines[0].rolled, true);
  const off = computeDeemedDispositions(
    rules,
    [{ ...asset, spousalRolloverDisabled: true }],
    estateWithSpouse
  );
  assert.equal(off.lines[0].gainCents, dollarsToCents(430000));
  assert.equal(off.taxableCapitalGainsCents, dollarsToCents(215000));
});

test("T21 RRSP sole spouse with conditions met rolls, zero income", () => {
  const p = computePlanInclusions(
    rules,
    [
      {
        category: "rrsp",
        valueCents: dollarsToCents(400000),
        beneficiary: { present: true, type: "spouse_common_law", sole: true },
        transferConditionsMet: true,
      },
    ],
    {}
  );
  assert.equal(p.totalCents, 0);
});

test("T22 RRSP spouse not sole fails exception, full FMV included", () => {
  const p = computePlanInclusions(
    rules,
    [
      {
        category: "rrsp",
        valueCents: dollarsToCents(400000),
        beneficiary: { present: true, type: "spouse_common_law", sole: false },
      },
    ],
    {}
  );
  assert.equal(p.totalCents, dollarsToCents(400000));
});

test("T23 RRIF designated benefit with conditions met, zero inclusion", () => {
  const p = computePlanInclusions(
    rules,
    [
      {
        category: "rrif",
        valueCents: dollarsToCents(300000),
        beneficiary: { present: true, type: "spouse_common_law", sole: true },
        transferConditionsMet: true,
      },
    ],
    {}
  );
  assert.equal(p.totalCents, 0);
  assert.equal(p.lines[0].note, "rollover");
});

test("T24 RRIF no designation, full FMV into income", () => {
  const p = computePlanInclusions(
    rules,
    [{ category: "rrif", valueCents: dollarsToCents(300000) }],
    {}
  );
  assert.equal(p.totalCents, dollarsToCents(300000));
});

test("T25/T26 insurance never adds income tax", () => {
  const p = computePlanInclusions(
    rules,
    [
      {
        category: "life_insurance",
        valueCents: dollarsToCents(250000),
        beneficiary: { present: true, type: "estate" },
      },
      {
        category: "life_insurance",
        valueCents: dollarsToCents(250000),
        beneficiary: { present: true, type: "other_named" },
      },
    ],
    {}
  );
  assert.equal(p.totalCents, 0);
});

test("T27/T28 TFSA nil inclusion, post-death earnings flag from 2026", () => {
  const p = computePlanInclusions(
    rules,
    [
      {
        category: "tfsa",
        valueCents: dollarsToCents(100000),
        beneficiary: { present: true, type: "successor_holder" },
        postDeathIncomeCents: dollarsToCents(5000),
      },
      { category: "tfsa", valueCents: dollarsToCents(100000) },
    ],
    {}
  );
  assert.equal(p.totalCents, 0);
  assert.equal(
    p.flags.some((f) => f.code === "tfsa_post_death_earnings_2026_designation"),
    true
  );
});

test("T37 CPP death benefit capped at 5000 included as income", () => {
  const p = computePlanInclusions(
    rules,
    [{ category: "cpp_death_benefit", valueCents: dollarsToCents(5000) }],
    {}
  );
  assert.equal(p.totalCents, dollarsToCents(5000));
});

test("Donation credit computed with pending-verification flag", () => {
  const r = computeIncomeTax(rules, {
    taxableIncomeCents: dollarsToCents(100000),
    donationsCents: dollarsToCents(100000),
  });
  const fedExpected =
    Math.round(dollarsToCents(200) * 0.14) +
    Math.round(dollarsToCents(99800) * 0.29);
  assert.equal(r.federalBreakdown.donationCreditCents, fedExpected);
  assert.equal(
    r.flags.some((f) => f.code === "donation_credit_rates_pending_verification"),
    true
  );
});

test("T46 validation catches negative values and contradictions", () => {
  const errors = validateAssets([
    { category: "bank", valueCents: -5 },
    {
      category: "bank",
      ownership: "joint_jtwros",
      valueCents: 100,
      beneficiary: { present: true, type: "other_named" },
    },
    { category: "on_real_property", ownership: "joint_tic", valueCents: 100 },
  ]);
  const codes = errors.map((e) => e.code);
  assert.ok(codes.includes("negative_value"));
  assert.ok(codes.includes("contradictory_jtwros_designation"));
  assert.ok(codes.includes("tic_share_required"));
});

test("Final return aggregates components", () => {
  const r = computeFinalReturn(rules, {
    assets: [
      {
        category: "rrif",
        valueCents: dollarsToCents(300000),
        beneficiary: { present: false },
      },
      { category: "cpp_death_benefit", valueCents: dollarsToCents(5000) },
      {
        category: "investment",
        ownership: "sole",
        valueCents: dollarsToCents(200000),
        acbCents: dollarsToCents(100000),
      },
    ],
    estate: {
      other_income_year_of_death_cents: dollarsToCents(30000),
      income_to_death_cents: dollarsToCents(5000),
      deductions_cents: 0,
    },
  });
  assert.equal(r.ok, true);
  assert.equal(
    r.taxableIncomeCents,
    dollarsToCents(300000 + 5000 + 30000 + 5000 + 50000)
  );
  assert.ok(r.tax.totalCents > 0);
});

test("Final return rejects invalid assets", () => {
  const r = computeFinalReturn(rules, {
    assets: [{ category: "bank", valueCents: -100 }],
    estate: {},
  });
  assert.equal(r.ok, false);
});
