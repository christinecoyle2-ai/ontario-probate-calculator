export const DOLLARS = 100;
export const THOUSAND_CENTS = 100000;

export function dollarsToCents(d) {
  return Math.round(Number(d) * DOLLARS);
}

export function centsToDollars(c) {
  return c / DOLLARS;
}

export function roundUpTo(cents, unitCents) {
  return Math.ceil(cents / unitCents) * unitCents;
}

export function computeProbateBase(rules, assets) {
  const lines = [];
  const warnings = [];
  let baseCents = 0;
  assets.forEach((a, i) => {
    const encumbranceApplies =
      a.included &&
      a.encumbranceCents > 0 &&
      a.encumbranceRegisteredOnIncludedOnRealProperty === true;
    const encumbranceCents = encumbranceApplies ? a.encumbranceCents : 0;
    if (a.encumbranceCents > 0 && !encumbranceApplies) {
      warnings.push({
        code: "encumbrance_not_deductible",
        assetIndex: i,
        sourceIds: ["S3", "S5"],
      });
    }
    const contributionCents = a.included
      ? Math.max(0, a.valueCents - encumbranceCents)
      : 0;
    if (a.included && a.valueCents - encumbranceCents < 0) {
      warnings.push({
        code: "encumbrance_exceeds_value",
        assetIndex: i,
        sourceIds: ["S3"],
      });
    }
    baseCents += contributionCents;
    lines.push({
      assetIndex: i,
      included: a.included === true,
      valueCents: a.valueCents,
      encumbranceDeductedCents: encumbranceCents,
      contributionCents,
    });
  });
  return { baseCents, lines, warnings };
}

export function smallEstateEligible(rules, baseCents) {
  return baseCents <= dollarsToCents(rules.smallEstate.thresholdDollars);
}

export function computeEAT(rules, input) {
  const {
    baseCents,
    certificateRequested,
    certificateType = "regular",
    applicationDate,
  } = input;
  if (!Number.isInteger(baseCents) || baseCents < 0) {
    return { ok: false, reason: "invalid_base" };
  }
  if (applicationDate && applicationDate < rules.eat.currentRulesApplyFrom) {
    return {
      ok: false,
      reason: "pre2020_not_supported",
      message:
        "This tool covers estate certificate applications made on or after January 1, 2020. Different statutory rates applied before that date (EATA 1998, s. 2(6)).",
    };
  }
  if (certificateRequested === false) {
    return {
      ok: true,
      eatCents: 0,
      roundedCents: 0,
      exempt: false,
      smallEstateEligible: smallEstateEligible(rules, baseCents),
      notes: [{ code: "no_certificate_requested", sourceIds: ["S6"] }],
    };
  }
  if (rules.eat.exemptCertificateTypes.includes(certificateType)) {
    return {
      ok: true,
      eatCents: 0,
      roundedCents: 0,
      exempt: false,
      smallEstateEligible: smallEstateEligible(rules, baseCents),
      notes: [{ code: "exempt_certificate_type", sourceIds: ["S6"] }],
    };
  }
  const roundedCents = roundUpTo(
    baseCents,
    dollarsToCents(rules.eat.roundUpToDollars)
  );
  const exemptionCents = dollarsToCents(rules.eat.exemptionDollars);
  if (roundedCents <= exemptionCents) {
    return {
      ok: true,
      eatCents: 0,
      roundedCents,
      exempt: true,
      smallEstateEligible: smallEstateEligible(rules, baseCents),
      notes: [{ code: "at_or_below_exemption", sourceIds: ["S2", "S4"] }],
    };
  }
  const units = (roundedCents - exemptionCents) / THOUSAND_CENTS;
  const eatCents = dollarsToCents(rules.eat.ratePerThousandDollars) * units;
  return {
    ok: true,
    eatCents,
    roundedCents,
    exempt: false,
    smallEstateEligible: smallEstateEligible(rules, baseCents),
    notes: [{ code: "standard_rate_applied", sourceIds: ["S1", "S4"] }],
  };
}

export function eatClosedFormCrossCheck(rules, baseCents) {
  const roundedUnits = Math.ceil(baseCents / THOUSAND_CENTS);
  const exemptionUnits = rules.eat.exemptionDollars / 1000;
  if (roundedUnits <= exemptionUnits) return 0;
  return dollarsToCents(rules.eat.ratePerThousandDollars) *
    (roundedUnits - exemptionUnits);
}

export function computeEirDeadline(rules, certificateIssueDate) {
  if (!certificateIssueDate) return null;
  const d = new Date(certificateIssueDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + rules.filing.estateInformationReturnDays);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const DESIGNATED_EXCLUDED_CATEGORIES = new Set([
  "rrsp",
  "rrif",
  "tfsa",
  "life_insurance",
  "rpp",
  "lira_lif",
  "segregated_fund",
  "annuity",
]);

export function classifyAsset(rules, asset, estate = {}) {
  const flags = [];
  const benType = asset.beneficiary?.present
    ? asset.beneficiary.type
    : "none";
  const hasNonEstateDesignation =
    asset.beneficiary?.present === true && benType !== "estate";

  if (asset.situs?.on_reserve === true) {
    if (asset.reserveExemptionConfirmed === true) {
      flags.push({ code: "reserve_exemption_applied", sourceIds: ["S5"] });
      return {
        included: false,
        reasonCode: "reserve_exemption_confirmed",
        sourceIds: ["S5"],
        flags,
      };
    }
    flags.push({ code: "reserve_exemption_possible", sourceIds: ["S5"] });
  }

  if (
    estate.certificateType === "limited_to_will_assets" &&
    asset.in_probated_will === false
  ) {
    flags.push({ code: "multiple_wills_secondary", sourceIds: ["S5"] });
    return {
      included: false,
      reasonCode: "not_in_probated_will",
      sourceIds: ["S5"],
      flags,
    };
  }

  if (
    estate.certificateType === "ancillary_resealing" &&
    asset.situs?.country === "CA" &&
    asset.situs?.province &&
    asset.situs.province !== "ON"
  ) {
    flags.push({ code: "ancillary_limits_to_ontario_assets", sourceIds: ["S5"] });
    return {
      included: false,
      reasonCode: "ancillary_ontario_assets_only",
      sourceIds: ["S5"],
      flags,
    };
  }

  if (asset.category === "cpp_death_benefit") {
    return {
      included: false,
      reasonCode: "cpp_death_benefit_excluded",
      sourceIds: ["S5", "S20"],
      flags,
    };
  }

  if (asset.category === "rdsp") {
    if (asset.rdspDeceasedWasBeneficiary === true) {
      flags.push({ code: "rdsp_special_rules", sourceIds: ["S5"] });
      return {
        included: true,
        reasonCode: "rdsp_deceased_was_beneficiary",
        sourceIds: ["S5"],
        flags,
      };
    }
    return {
      included: false,
      reasonCode: "rdsp_deceased_not_beneficiary",
      sourceIds: ["S5"],
      flags,
    };
  }

  if (asset.category === "resp") {
    flags.push({ code: "resp_subscriber_death_flag", sourceIds: ["S24"] });
    return {
      included: true,
      reasonCode: "resp_subscriber_entitlement",
      sourceIds: ["S5", "S24"],
      flags,
    };
  }

  if (asset.category === "oas_cpp_payable") {
    flags.push({ code: "oas_cpp_payable_review", sourceIds: ["S5"] });
    if (hasNonEstateDesignation) {
      return {
        included: false,
        reasonCode: "designated_beneficiary",
        sourceIds: ["S5"],
        flags,
      };
    }
    return {
      included: true,
      reasonCode: "payable_to_estate",
      sourceIds: ["S5"],
      flags,
    };
  }

  if (asset.ownership === "trust_held") {
    flags.push({ code: "trust_held_asset", sourceIds: ["S5"] });
    return {
      included: false,
      reasonCode: "held_in_inter_vivos_trust",
      sourceIds: ["S5"],
      flags,
    };
  }

  if (asset.ownership === "joint_jtwros") {
    const spouseLike = ["spouse", "common_law"].includes(
      asset.coowner_relationship
    );
    if (!spouseLike) {
      flags.push({
        code: "joint_adult_child_resulting_trust",
        sourceIds: ["S5"],
      });
      if (asset.jointExclusionConfirmed !== true) {
        return {
          included: true,
          reasonCode: "joint_non_spouse_unconfirmed",
          sourceIds: ["S5"],
          flags,
        };
      }
    }
    return {
      included: false,
      reasonCode: "joint_right_of_survivorship",
      sourceIds: ["S5", "S6"],
      flags,
    };
  }

  if (
    asset.category === "out_of_province_real_property" ||
    (asset.category === "on_real_property" &&
      asset.situs?.province &&
      asset.situs.province !== "ON")
  ) {
    flags.push({ code: "foreign_or_out_of_province_tax_review", sourceIds: ["S8"] });
    return {
      included: false,
      reasonCode: "real_estate_outside_ontario",
      sourceIds: ["S5"],
      flags,
    };
  }

  if (hasNonEstateDesignation) {
    if (DESIGNATED_EXCLUDED_CATEGORIES.has(asset.category)) {
      return {
        included: false,
        reasonCode: "designated_beneficiary",
        sourceIds: ["S5"],
        flags,
      };
    }
    flags.push({ code: "designation_on_non_plan_asset", sourceIds: ["S5"] });
  }

  if (
    asset.category === "life_insurance" &&
    (!asset.beneficiary?.present || benType === "estate")
  ) {
    return {
      included: true,
      reasonCode: "insurance_payable_to_estate",
      sourceIds: ["S5"],
      flags,
    };
  }

  return {
    included: true,
    reasonCode: "asset_of_deceased_in_estate",
    sourceIds: ["S5"],
    flags,
  };
}

export function buildProbateBase(rules, assets, estate = {}) {
  const classified = assets.map((a, i) => {
    const c = classifyAsset(rules, a, estate);
    let share = 1;
    if (a.ownership === "joint_tic") {
      if (!(a.tic_share_pct > 0 && a.tic_share_pct <= 100)) {
        c.flags.push({ code: "tic_share_missing", sourceIds: ["S5"] });
        share = 1;
      } else {
        share = a.tic_share_pct / 100;
        c.flags.push({ code: "tic_share_applied", sourceIds: ["S5"] });
      }
    }
    const valueCents = Math.round(a.valueCents * share);
    const encumbranceCents = Math.round((a.encumbranceCents || 0) * share);
    if (a.encumbranceCents > 0 && share < 1) {
      c.flags.push({ code: "encumbrance_share_allocated", sourceIds: ["S3"] });
    }
    if (
      a.encumbranceCents > 0 &&
      a.encumbranceRegisteredOnIncludedOnRealProperty !== true
    ) {
      c.flags.push({ code: "unsecured_debt_not_deductible", sourceIds: ["S5"] });
    }
    return { assetIndex: i, ...c, valueCents, encumbranceCents };
  });
  const baseAssets = classified.map((c) => ({
    valueCents: c.valueCents,
    included: c.included,
    encumbranceCents: c.encumbranceCents,
    encumbranceRegisteredOnIncludedOnRealProperty:
      assets[c.assetIndex]
        .encumbranceRegisteredOnIncludedOnRealProperty === true,
  }));
  const base = computeProbateBase(rules, baseAssets);
  return {
    baseCents: base.baseCents,
    lines: classified.map((c, i) => ({ ...c, ...base.lines[i] })),
    warnings: base.warnings.map((w) => ({
      ...w,
      assetIndex: w.assetIndex,
    })),
  };
}

const CAPITAL_CATEGORIES = new Set([
  "on_real_property",
  "out_of_province_real_property",
  "investment",
  "gic_fixed_income",
  "crypto",
  "public_shares",
  "private_shares",
  "partnership",
  "farm",
  "business_interest",
  "jewellery_art_collectibles",
]);

function roundCents(x) {
  return Math.round(x);
}

function taxOnBrackets(brackets, tiCents) {
  let tax = 0;
  for (const b of brackets) {
    const from = dollarsToCents(b.from);
    const to = b.to === null ? tiCents : dollarsToCents(b.to);
    if (tiCents > from) {
      tax += (Math.min(tiCents, to) - from) * b.rate;
    }
  }
  return tax;
}

export function ontarioSurtax(rules, onBasicTaxCents) {
  const s = rules.ontarioTax.surtax;
  const t1 = dollarsToCents(s.tier1ThresholdDollars);
  const t2 = dollarsToCents(s.tier2ThresholdDollars);
  let surtax = 0;
  if (onBasicTaxCents > t1) surtax += (onBasicTaxCents - t1) * s.tier1Rate;
  if (onBasicTaxCents > t2) surtax += (onBasicTaxCents - t2) * s.tier2Rate;
  return roundCents(surtax);
}

export function ontarioHealthPremium(rules, taxableIncomeCents) {
  const ti = taxableIncomeCents;
  for (const t of rules.ontarioTax.healthPremium.tiers) {
    const from = dollarsToCents(t.from);
    const to = t.to === null ? Infinity : dollarsToCents(t.to);
    if (ti > from && ti <= to) {
      return roundCents(Math.min(t.cap * DOLLARS, t.base * DOLLARS + (ti - dollarsToCents(t.overBase)) * t.rate));
    }
  }
  return 0;
}

export function federalBpaCents(rules, taxableIncomeCents) {
  const f = rules.federalTax;
  const max = dollarsToCents(f.bpaMaxDollars);
  const min = dollarsToCents(f.bpaMinDollars);
  const from = dollarsToCents(f.bpaPhaseOutFrom);
  const to = dollarsToCents(f.bpaPhaseOutTo);
  if (taxableIncomeCents <= from) return max;
  if (taxableIncomeCents >= to) return min;
  return max - ((max - min) * (taxableIncomeCents - from)) / (to - from);
}

function donationCredit(rules, donationsCents, level) {
  const cfg = level === "federal" ? rules.federalTax.donationCredit : rules.ontarioTax.donationCredit;
  if (!(donationsCents > 0)) return 0;
  const first = dollarsToCents(cfg.firstDollars);
  const below = Math.min(donationsCents, first);
  const above = Math.max(0, donationsCents - first);
  return roundCents(below * cfg.rateBelow + above * cfg.rateAbove);
}

export function computeIncomeTax(rules, input) {
  const ti = Math.max(0, input.taxableIncomeCents || 0);
  const donations = input.donationsCents || 0;
  const fedGross = taxOnBrackets(rules.federalTax.brackets, ti);
  const fedBpa = federalBpaCents(rules, ti);
  const fedBpaCredit = fedBpa * rules.federalTax.brackets[0].rate;
  const fedDonation = donationCredit(rules, donations, "federal");
  const federalCents = roundCents(Math.max(0, fedGross - fedBpaCredit - fedDonation));
  const onGross = taxOnBrackets(rules.ontarioTax.brackets, ti);
  const onBpaCredit = dollarsToCents(rules.ontarioTax.bpaDollars) * rules.ontarioTax.brackets[0].rate;
  const onDonation = donationCredit(rules, donations, "ontario");
  const onBasic = roundCents(Math.max(0, onGross - onBpaCredit - onDonation));
  const surtax = ontarioSurtax(rules, onBasic);
  const ohp = ontarioHealthPremium(rules, ti);
  const ontarioCents = onBasic + surtax + ohp;
  let marginal = null;
  for (let i = rules.federalTax.brackets.length - 1; i >= 0; i--) {
    if (ti > dollarsToCents(rules.federalTax.brackets[i].from)) {
      marginal = { federalRate: rules.federalTax.brackets[i].rate, bracketIndex: i };
      break;
    }
  }
  return {
    taxableIncomeCents: ti,
    federalCents,
    ontarioCents,
    ontarioBreakdown: { basicCents: onBasic, surtaxCents: surtax, healthPremiumCents: ohp },
    federalBreakdown: { grossCents: roundCents(fedGross), bpaCreditCents: roundCents(fedBpaCredit), donationCreditCents: fedDonation },
    ontarioCreditBreakdown: { bpaCreditCents: roundCents(onBpaCredit), donationCreditCents: onDonation },
    totalCents: federalCents + ontarioCents,
    marginalFederalRate: marginal ? marginal.federalRate : 0,
    flags: [
      { code: "credits_beyond_bpa_donations_not_modeled", sourceIds: ["S18"] },
      { code: "donation_credit_rates_pending_verification", sourceIds: [] },
    ],
  };
}

export function spousalRolloverApplies(asset, estate) {
  return (
    estate.spouse_or_clp?.exists === true &&
    asset.transfersToSpouse === true &&
    asset.spousalRolloverDisabled !== true
  );
}

export function computeDeemedDispositions(rules, assets, estate = {}) {
  const lines = [];
  const flags = [];
  let netGainCents = 0;
  assets.forEach((a, i) => {
    if (!CAPITAL_CATEGORIES.has(a.category)) return;
    if (spousalRolloverApplies(a, estate)) {
      flags.push({ code: "spousal_rollover_applied", assetIndex: i, sourceIds: ["S8"] });
      lines.push({ assetIndex: i, gainCents: 0, exemptCents: 0, taxableGainCents: 0, rolled: true });
      return;
    }
    if (a.ownership === "joint_jtwros" && ["spouse", "common_law"].includes(a.coowner_relationship)) {
      flags.push({ code: "jtwros_spouse_no_disposition_check_advice", assetIndex: i, sourceIds: ["S8"] });
    }
    if (a.ownership === "joint_tic" && !(a.tic_share_pct > 0)) return;
    const share = a.ownership === "joint_tic" ? a.tic_share_pct / 100 : 1;
    const value = Math.round((a.valueCents || 0) * share);
    const acb = Math.round((a.acbCents || 0) * share);
    const costs = Math.round((a.sellingCostsCents || 0) * share);
    let gain = value - acb - costs;
    let exempt = 0;
    const pre = a.principal_residence;
    if (pre?.designated === true) {
      const C = pre.years_owned_post_1971 || 0;
      const B = Math.min(C, 1 + (pre.years_designated || 0));
      if (C > 0 && gain > 0) {
        exempt = (gain * Math.min(B, C)) / C;
      }
      if (pre.change_of_use === true) {
        flags.push({ code: "pre_change_of_use_review", assetIndex: i, sourceIds: ["S21"] });
      }
    }
    const gainAfterExempt = gain - exempt;
    if (["jewellery_art_collectibles"].includes(a.category)) {
      flags.push({ code: "collectible_rules_review", assetIndex: i, sourceIds: ["S8"] });
    }
    netGainCents += gainAfterExempt;
    lines.push({ assetIndex: i, gainCents: gain, exemptCents: roundCents(exempt), taxableGainCents: 0, rolled: false });
  });
  const losses = Math.max(0, estate.capital_losses_current_year_cents || 0);
  const netAfterLosses = netGainCents - losses;
  const taxableCapitalGainsCents = roundCents(Math.max(0, netAfterLosses * rules.capitalGains.inclusionRate));
  lines.forEach((l) => {
    l.taxableGainCents = l.rolled ? 0 : Math.max(0, roundCents((l.gainCents - l.exemptCents) * rules.capitalGains.inclusionRate));
  });
  if (netAfterLosses < 0) {
    flags.push({ code: "net_capital_loss_carryforward_review", sourceIds: ["S8"] });
  }
  if (losses > 0) {
    flags.push({ code: "loss_relief_beyond_current_year_not_modeled", sourceIds: [] });
  }
  return { lines, flags, netGainCents, taxableCapitalGainsCents };
}

export function computePlanInclusions(rules, assets, estate = {}) {
  const lines = [];
  const flags = [];
  let totalCents = 0;
  assets.forEach((a, i) => {
    const ben = a.beneficiary || {};
    const add = (cents, note) => {
      totalCents += cents;
      lines.push({ assetIndex: i, category: a.category, inclusionCents: cents, note });
    };
    if (a.category === "rrsp" || a.category === "rrif") {
      const soleSpouse =
        ben.present === true &&
        ben.type === "spouse_common_law" &&
        ben.sole === true;
      if (soleSpouse && a.transferConditionsMet === true) {
        flags.push({ code: "registered_plan_rollover_conditions", assetIndex: i, sourceIds: a.category === "rrsp" ? ["S10"] : ["S11"] });
        add(0, "rollover");
      } else if (soleSpouse) {
        flags.push({ code: "rollover_transfer_conditions_unconfirmed", assetIndex: i, sourceIds: a.category === "rrsp" ? ["S10"] : ["S11"] });
        add(a.valueCents || 0, "fmv_included_conditions_unconfirmed");
      } else {
        add(a.valueCents || 0, ben.present ? "taxed_to_beneficiary_or_estate" : "no_designation_fmv_included");
      }
      return;
    }
    if (a.category === "tfsa") {
      add(0, "tfsa_nil_at_death");
      if ((a.postDeathIncomeCents || 0) > 0) {
        flags.push({ code: "tfsa_post_death_earnings_2026_designation", assetIndex: i, sourceIds: ["S13"] });
        totalCents += 0;
      }
      return;
    }
    if (a.category === "cpp_death_benefit") {
      const cap = dollarsToCents(rules.cppDeathBenefit.maxDollars);
      add(Math.min(a.valueCents || 0, cap), "cpp_death_benefit_taxable_excluded_from_eat");
      return;
    }
    if (a.category === "oas_cpp_payable") {
      add(a.valueCents || 0, "oas_cpp_payable_income");
      flags.push({ code: "oas_cpp_payable_review", assetIndex: i, sourceIds: ["S5"] });
      return;
    }
    if (a.category === "life_insurance") {
      add(0, "insurance_generally_not_taxable");
      return;
    }
  });
  return { lines, flags, totalCents };
}

export function validateAssets(assets) {
  const errors = [];
  assets.forEach((a, i) => {
    if (typeof a.valueCents === "number" && a.valueCents < 0) {
      errors.push({ assetIndex: i, code: "negative_value" });
    }
    if (a.ownership === "joint_jtwros" && a.beneficiary?.present === true) {
      errors.push({ assetIndex: i, code: "contradictory_jtwros_designation" });
    }
    if (a.ownership === "joint_tic" && !(a.tic_share_pct > 0 && a.tic_share_pct <= 100)) {
      errors.push({ assetIndex: i, code: "tic_share_required" });
    }
    if (a.category === "on_real_property" && a.situs?.province && a.situs.province !== "ON") {
      errors.push({ assetIndex: i, code: "ontario_category_with_out_of_province_situs" });
    }
  });
  return errors;
}

export function computeFinalReturn(rules, input) {
  const { assets, estate = {} } = input;
  const errors = validateAssets(assets);
  if (errors.length > 0) return { ok: false, errors };
  const dispositions = computeDeemedDispositions(rules, assets, estate);
  const plans = computePlanInclusions(rules, assets, estate);
  const otherIncome = Math.max(0, estate.other_income_year_of_death_cents || 0);
  const incomeToDeath = Math.max(0, estate.income_to_death_cents || 0);
  const deductions = Math.max(0, estate.deductions_cents || 0);
  const donations = Math.max(0, estate.charity_gifts_cents || 0);
  const taxableIncomeCents = Math.max(
    0,
    otherIncome + incomeToDeath + dispositions.taxableCapitalGainsCents + plans.totalCents - deductions
  );
  const tax = computeIncomeTax(rules, { taxableIncomeCents, donationsCents: donations });
  if (incomeToDeath > 0) {
    tax.flags.push({ code: "income_to_death_is_user_input_flag", sourceIds: ["S8"] });
  }
  if (donations > 0) {
    tax.flags.push({ code: "donation_carryback_and_probate_treatment_review", sourceIds: [] });
  }
  return {
    ok: true,
    taxableIncomeCents,
    components: {
      otherIncomeCents: otherIncome,
      incomeToDeathCents: incomeToDeath,
      taxableCapitalGainsCents: dispositions.taxableCapitalGainsCents,
      planInclusionsCents: plans.totalCents,
      deductionsCents: deductions,
      donationsCents: donations,
    },
    dispositions,
    plans,
    tax,
  };
}

export function computeTrustTreatments(rules, trusts = [], estate = {}) {
  return trusts.map((t) => {
    const baseTreatment = {
      excludedFromProbateBase: true,
      noteCode: "trust_assets_not_owned_by_deceased",
      sourceIds: ["S5"],
    };
    const flags = [];
    let greEligible = false;
    switch (t.type) {
      case "alter_ego":
        flags.push({ code: "alter_ego_trust_taxation_and_21_year_rule", sourceIds: ["S23"] });
        flags.push({ code: "alter_ego_death_disposition_review", sourceIds: ["S23"] });
        break;
      case "joint_partner":
        flags.push({ code: "joint_partner_trust_taxation_review", sourceIds: ["S23"] });
        break;
      case "inter_vivos_family":
        flags.push({ code: "inter_vivos_top_rate_taxation", sourceIds: [] });
        flags.push({ code: "deemed_disposition_21_year", sourceIds: ["S23"] });
        break;
      case "testamentary_by_will": {
        baseTreatment.excludedFromProbateBase = false;
        baseTreatment.noteCode = "testamentary_trust_assets_pass_through_estate";
        baseTreatment.sourceIds = ["S5"];
        const months = t.months_since_death;
        greEligible =
          t.gre_designated === true &&
          typeof months === "number" &&
          months >= 0 &&
          months <= rules.trusts.greWindowMonths &&
          estate.no_other_gre_designation !== false;
        flags.push({
          code: greEligible
            ? "gre_rates_available_36_months"
            : "gre_not_established_top_rate_risk",
          sourceIds: ["S22"],
        });
        break;
      }
      case "spousal_clp":
        flags.push({ code: "spousal_trust_rollover_review", sourceIds: ["S8"] });
        break;
      case "holds_real_estate":
        flags.push({ code: "trust_real_estate_gain_at_trust_level", sourceIds: ["S5"] });
        break;
      case "deceased_was_beneficiary":
        flags.push({ code: "beneficial_interest_possible_inclusion", sourceIds: ["S5"] });
        baseTreatment.excludedFromProbateBase = false;
        baseTreatment.noteCode = "beneficial_interest_review_required";
        break;
      default:
        flags.push({ code: "unknown_trust_type_review", sourceIds: [] });
    }
    return { ...baseTreatment, greEligible, flags };
  });
}
