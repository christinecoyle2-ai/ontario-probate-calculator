import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  dollarsToCents,
  buildProbateBase,
  computeEAT,
} from "../app.js";

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(here, "..", "rules", "2026-10-25", "ontario.json"), "utf8")
);

function base(assets, estate = {}) {
  return buildProbateBase(rules, assets, estate);
}

function hasFlag(line, code) {
  return line.flags.some((f) => f.code === code);
}

test("T16 JTWROS with spouse excluded", () => {
  const r = base([
    {
      category: "bank",
      ownership: "joint_jtwros",
      coowner_relationship: "spouse",
      valueCents: dollarsToCents(500000),
    },
  ]);
  assert.equal(r.baseCents, 0);
  assert.equal(r.lines[0].reasonCode, "joint_right_of_survivorship");
});

test("T17 JTWROS with adult child included until confirmed, flag always rendered", () => {
  const asset = {
    category: "bank",
    ownership: "joint_jtwros",
    coowner_relationship: "adult_child",
    valueCents: dollarsToCents(500000),
  };
  const unconfirmed = base([asset]);
  assert.equal(unconfirmed.baseCents, dollarsToCents(500000));
  assert.equal(
    hasFlag(unconfirmed.lines[0], "joint_adult_child_resulting_trust"),
    true
  );
  const confirmed = base([{ ...asset, jointExclusionConfirmed: true }]);
  assert.equal(confirmed.baseCents, 0);
  assert.equal(
    hasFlag(confirmed.lines[0], "joint_adult_child_resulting_trust"),
    true
  );
});

test("T18 tenancy in common includes deceased share only", () => {
  const r = base([
    {
      category: "on_real_property",
      ownership: "joint_tic",
      tic_share_pct: 25,
      situs: { province: "ON" },
      valueCents: dollarsToCents(600000),
    },
  ]);
  assert.equal(r.baseCents, dollarsToCents(150000));
  assert.equal(hasFlag(r.lines[0], "tic_share_applied"), true);
});

test("T19 registered encumbrance share deducted from TIC interest", () => {
  const r = base([
    {
      category: "on_real_property",
      ownership: "joint_tic",
      tic_share_pct: 25,
      situs: { province: "ON" },
      valueCents: dollarsToCents(600000),
      encumbranceCents: dollarsToCents(200000),
      encumbranceRegisteredOnIncludedOnRealProperty: true,
    },
  ]);
  assert.equal(r.baseCents, dollarsToCents(100000));
  assert.equal(hasFlag(r.lines[0], "encumbrance_share_allocated"), true);
});

test("T20 unsecured line of credit not deductible", () => {
  const r = base([
    {
      category: "on_real_property",
      ownership: "sole",
      situs: { province: "ON" },
      valueCents: dollarsToCents(400000),
      encumbranceCents: dollarsToCents(80000),
      encumbranceRegisteredOnIncludedOnRealProperty: false,
    },
  ]);
  assert.equal(r.baseCents, dollarsToCents(400000));
  assert.equal(hasFlag(r.lines[0], "unsecured_debt_not_deductible"), true);
});

test("RRSP designated to spouse excluded, no designation included", () => {
  const designated = base([
    {
      category: "rrsp",
      ownership: "sole",
      valueCents: dollarsToCents(400000),
      beneficiary: { present: true, type: "spouse_common_law" },
    },
  ]);
  assert.equal(designated.baseCents, 0);
  const none = base([
    {
      category: "rrsp",
      ownership: "sole",
      valueCents: dollarsToCents(400000),
      beneficiary: { present: false },
    },
  ]);
  assert.equal(none.baseCents, dollarsToCents(400000));
});

test("T25/T26 insurance to estate included, named beneficiary excluded", () => {
  const toEstate = base([
    {
      category: "life_insurance",
      ownership: "sole",
      valueCents: dollarsToCents(250000),
      beneficiary: { present: true, type: "estate" },
    },
  ]);
  assert.equal(toEstate.baseCents, dollarsToCents(250000));
  assert.equal(toEstate.lines[0].reasonCode, "insurance_payable_to_estate");
  const named = base([
    {
      category: "life_insurance",
      ownership: "sole",
      valueCents: dollarsToCents(250000),
      beneficiary: { present: true, type: "other_named" },
    },
  ]);
  assert.equal(named.baseCents, 0);
});

test("T27/T28 TFSA successor holder excluded, no beneficiary included", () => {
  const sh = base([
    {
      category: "tfsa",
      ownership: "sole",
      valueCents: dollarsToCents(100000),
      beneficiary: { present: true, type: "successor_holder" },
    },
  ]);
  assert.equal(sh.baseCents, 0);
  const none = base([
    {
      category: "tfsa",
      ownership: "sole",
      valueCents: dollarsToCents(100000),
      beneficiary: { present: false },
    },
  ]);
  assert.equal(none.baseCents, dollarsToCents(100000));
});

test("T29 out-of-province real estate excluded from base with tax flag", () => {
  const r = base([
    {
      category: "out_of_province_real_property",
      ownership: "sole",
      situs: { country: "US", province: "FL" },
      valueCents: dollarsToCents(500000),
    },
  ]);
  assert.equal(r.baseCents, 0);
  assert.equal(
    hasFlag(r.lines[0], "foreign_or_out_of_province_tax_review"),
    true
  );
});

test("T30 foreign bank account included wherever situated", () => {
  const r = base([
    {
      category: "bank",
      ownership: "sole",
      situs: { country: "US" },
      valueCents: dollarsToCents(50000),
    },
  ]);
  assert.equal(r.baseCents, dollarsToCents(50000));
});

test("T31 multiple wills with limited certificate probates primary will assets only", () => {
  const r = base(
    [
      {
        category: "bank",
        ownership: "sole",
        in_probated_will: true,
        valueCents: dollarsToCents(300000),
      },
      {
        category: "private_shares",
        ownership: "sole",
        in_probated_will: false,
        valueCents: dollarsToCents(700000),
      },
    ],
    { certificateType: "limited_to_will_assets" }
  );
  assert.equal(r.baseCents, dollarsToCents(300000));
  const eat = computeEAT(rules, {
    baseCents: r.baseCents,
    certificateRequested: true,
    certificateType: "limited_to_will_assets",
    applicationDate: "2026-06-01",
  });
  assert.equal(eat.eatCents, dollarsToCents(3750));
  assert.equal(hasFlag(r.lines[1], "multiple_wills_secondary"), true);
});

test("Trust-held assets excluded with flag", () => {
  const r = base([
    {
      category: "investment",
      ownership: "trust_held",
      valueCents: dollarsToCents(1000000),
    },
  ]);
  assert.equal(r.baseCents, 0);
  assert.equal(r.lines[0].reasonCode, "held_in_inter_vivos_trust");
});

test("T37 base side: CPP death benefit excluded", () => {
  const r = base([
    { category: "cpp_death_benefit", valueCents: dollarsToCents(5000) },
  ]);
  assert.equal(r.baseCents, 0);
});

test("T43 reserve property included with flag until exemption confirmed", () => {
  const asset = {
    category: "on_real_property",
    ownership: "sole",
    situs: { province: "ON", on_reserve: true },
    valueCents: dollarsToCents(200000),
  };
  const unconfirmed = base([asset]);
  assert.equal(unconfirmed.baseCents, dollarsToCents(200000));
  assert.equal(
    hasFlag(unconfirmed.lines[0], "reserve_exemption_possible"),
    true
  );
  const confirmed = base([{ ...asset, reserveExemptionConfirmed: true }]);
  assert.equal(confirmed.baseCents, 0);
});

test("RESP subscriber entitlement included with S24 flag", () => {
  const r = base([
    { category: "resp", ownership: "sole", valueCents: dollarsToCents(40000) },
  ]);
  assert.equal(r.baseCents, dollarsToCents(40000));
  assert.equal(hasFlag(r.lines[0], "resp_subscriber_death_flag"), true);
});

test("RDSP excluded when deceased was not beneficiary, included when they were", () => {
  const notBen = base([
    {
      category: "rdsp",
      valueCents: dollarsToCents(60000),
      rdspDeceasedWasBeneficiary: false,
    },
  ]);
  assert.equal(notBen.baseCents, 0);
  const wasBen = base([
    {
      category: "rdsp",
      valueCents: dollarsToCents(60000),
      rdspDeceasedWasBeneficiary: true,
    },
  ]);
  assert.equal(wasBen.baseCents, dollarsToCents(60000));
});

test("OAS/CPP payable to estate included with review flag", () => {
  const r = base([
    { category: "oas_cpp_payable", valueCents: dollarsToCents(1200) },
  ]);
  assert.equal(r.baseCents, dollarsToCents(1200));
  assert.equal(hasFlag(r.lines[0], "oas_cpp_payable_review"), true);
});

test("Full pipeline: house with mortgage, joint account, TFSA successor, cash", () => {
  const r = base([
    {
      category: "on_real_property",
      ownership: "sole",
      situs: { province: "ON" },
      valueCents: dollarsToCents(800000),
      encumbranceCents: dollarsToCents(300000),
      encumbranceRegisteredOnIncludedOnRealProperty: true,
    },
    {
      category: "bank",
      ownership: "joint_jtwros",
      coowner_relationship: "spouse",
      valueCents: dollarsToCents(500000),
    },
    {
      category: "tfsa",
      ownership: "sole",
      valueCents: dollarsToCents(100000),
      beneficiary: { present: true, type: "successor_holder" },
    },
    { category: "bank", ownership: "sole", valueCents: dollarsToCents(100000) },
  ]);
  assert.equal(r.baseCents, dollarsToCents(600000));
  const eat = computeEAT(rules, {
    baseCents: r.baseCents,
    certificateRequested: true,
    applicationDate: "2026-06-01",
  });
  assert.equal(eat.eatCents, dollarsToCents(8250));
});
