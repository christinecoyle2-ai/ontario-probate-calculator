import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeTrustTreatments, dollarsToCents, buildProbateBase } from "../app.js";

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(here, "..", "rules", "2026-10-25", "ontario.json"), "utf8")
);

test("T32 alter ego trust assets excluded from base, tax flagged", () => {
  const base = buildProbateBase(rules, [
    { category: "investment", ownership: "trust_held", valueCents: dollarsToCents(1000000) },
  ]);
  assert.equal(base.baseCents, 0);
  const t = computeTrustTreatments(rules, [{ type: "alter_ego" }]);
  assert.equal(t[0].excludedFromProbateBase, true);
  assert.ok(t[0].flags.some((f) => f.code === "alter_ego_trust_taxation_and_21_year_rule"));
});

test("T33 testamentary trust GRE within 36 months when designated", () => {
  const t = computeTrustTreatments(
    rules,
    [{ type: "testamentary_by_will", gre_designated: true, months_since_death: 24 }],
    {}
  );
  assert.equal(t[0].greEligible, true);
  assert.equal(t[0].excludedFromProbateBase, false);
});

test("GRE fails outside 36 months or without designation", () => {
  const late = computeTrustTreatments(
    rules,
    [{ type: "testamentary_by_will", gre_designated: true, months_since_death: 37 }],
    {}
  );
  assert.equal(late[0].greEligible, false);
  const undesignated = computeTrustTreatments(
    rules,
    [{ type: "testamentary_by_will", gre_designated: false, months_since_death: 5 }],
    {}
  );
  assert.equal(undesignated[0].greEligible, false);
});

test("Joint partner and inter vivos trusts excluded with flags", () => {
  const t = computeTrustTreatments(rules, [
    { type: "joint_partner" },
    { type: "inter_vivos_family" },
  ]);
  assert.equal(t[0].excludedFromProbateBase, true);
  assert.equal(t[1].excludedFromProbateBase, true);
  assert.ok(t[1].flags.some((f) => f.code === "deemed_disposition_21_year"));
});
