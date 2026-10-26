import {
  dollarsToCents,
  centsToDollars,
  computeEAT,
  buildProbateBase,
  computeFinalReturn,
  computeTrustTreatments,
  computeEirDeadline,
  validateAssets,
} from "./app.js";

let rules;
let presets = { presets: [] };
try {
  rules = await (await fetch("rules/2026-10-25/ontario.json")).json();
} catch {
  rules = (await import("./rules-bundle.js")).default;
}
try {
  presets = await (await fetch("presets.json")).json();
} catch {
  try {
    presets = (await import("./presets-bundle.js")).default;
  } catch {
    presets = { presets: [] };
  }
}

const fmtWhole = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const fmtCents = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtPct = new Intl.NumberFormat("en-CA", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (cents, decimals = false) =>
  decimals ? fmtCents.format(cents / 100) : fmtWhole.format(cents / 100);

const CATEGORY_LABELS = {
  on_real_property: "Ontario real estate",
  out_of_province_real_property: "Real estate outside Ontario",
  bank: "Bank account",
  investment: "Investment account",
  gic_fixed_income: "GIC, bond or fixed income",
  crypto: "Crypto-assets",
  cash: "Cash",
  vehicle_vessel: "Vehicle or vessel",
  household_goods: "Household goods and furniture",
  jewellery_art_collectibles: "Jewellery, art or collection",
  business_interest: "Sole proprietorship interest",
  public_shares: "Public company shares",
  private_shares: "Private company shares",
  partnership: "Partnership interest",
  farm: "Farm property",
  receivable: "Receivable owed to the deceased",
  rrsp: "RRSP",
  rrif: "RRIF",
  tfsa: "TFSA",
  resp: "RESP (subscriber entitlement)",
  rdsp: "RDSP",
  rpp: "Registered pension plan",
  lira_lif: "LIRA, LIF or locked-in plan",
  annuity: "Annuity",
  life_insurance: "Life insurance",
  segregated_fund: "Segregated fund contract",
  cpp_death_benefit: "CPP death benefit",
  oas_cpp_payable: "OAS/CPP amounts payable",
  digital_asset: "Digital account or domain",
  trust_interest: "Interest in a trust",
  other: "Other property",
};

const REASON_TEXT = {
  asset_of_deceased_in_estate: "Included: asset of the deceased passing through the estate.",
  joint_right_of_survivorship: "Excluded: joint asset passing automatically to the surviving joint owner by right of survivorship.",
  joint_non_spouse_unconfirmed: "Included for now: joint with a non-spouse. Excluded only if beneficial ownership truly passed. Confirm below after reviewing intent and resulting-trust risk.",
  designated_beneficiary: "Excluded: passes outside the estate by beneficiary designation.",
  insurance_payable_to_estate: "Included: insurance proceeds payable to the estate.",
  real_estate_outside_ontario: "Excluded from Ontario estate value; the deemed disposition on the final return still applies.",
  cpp_death_benefit_excluded: "Excluded from estate value; taxable as income of the estate or recipient.",
  held_in_inter_vivos_trust: "Excluded: owned by the trust, not by the deceased.",
  not_in_probated_will: "Excluded: not an asset referred to in the probated will (multiple-wills strategy).",
  ancillary_ontario_assets_only: "Excluded: ancillary appointment or resealing limits the value to Ontario assets.",
  resp_subscriber_entitlement: "Included: part of the RESP the deceased subscriber was entitled to. Subscriber-death rules flagged for review.",
  rdsp_deceased_not_beneficiary: "Excluded: RDSP the deceased subscribed to but was not the beneficiary.",
  rdsp_deceased_was_beneficiary: "Included: RDSP for which the deceased was the beneficiary. Special rules flagged.",
  reserve_exemption_confirmed: "Excluded per your confirmation: property situated on a reserve may be exempt. Ministry confirmation advised.",
  payable_to_estate: "Included: payable to the estate.",
};

const FLAG_TEXT = {
  joint_adult_child_resulting_trust: "Joint ownership with an adult child is fact-specific and can involve a resulting trust and a deemed disposition. Exclusion requires your explicit confirmation. Legal advice recommended.",
  reserve_exemption_possible: "Property situated on a reserve may be exempt from the tax. Confirm with the Ministry of Finance before excluding.",
  reserve_exemption_applied: "You confirmed the reserve exemption for this asset.",
  unsecured_debt_not_deductible: "Unsecured debts, credit cards, vehicle loans and lines of credit not registered against included Ontario real estate cannot reduce the estate value.",
  foreign_or_out_of_province_tax_review: "Excluded from the Ontario base, but the deemed disposition is still taxed in Canada. Foreign tax credit and situs rules need professional review.",
  ancillary_limits_to_ontario_assets: "With an ancillary appointment or resealing, only Ontario-located assets count toward the estate value.",
  multiple_wills_secondary: "This asset is outside the probated will under the multiple-wills strategy. The strategy itself is a legal design: have the wills reviewed by a lawyer.",
  resp_subscriber_death_flag: "RESP subscriber-death rules depend on the plan terms and who acquires subscriber rights. Flagged for professional review.",
  rdsp_special_rules: "RDSP amounts have special tax rules on beneficiary death. Flagged for professional review.",
  oas_cpp_payable_review: "OAS/CPP amounts payable at death: inclusion depends on the payee. Review with the final-return preparer.",
  trust_held_asset: "Asset is held by a trust and is outside the probate base. Trust-level tax is separate.",
  tic_share_applied: "Only the deceased's tenancy-in-common share is included.",
  tic_share_missing: "Tenancy-in-common share percentage missing: the full value was used. Enter the share to correct this.",
  encumbrance_share_allocated: "The registered encumbrance was allocated in proportion to the tenancy-in-common share. Confirm the allocation.",
  designation_on_non_plan_asset: "A beneficiary designation was entered on an asset type that does not normally carry one. Review; the asset was included.",
  spousal_rollover_applied: "Spousal rollover applied: no deemed disposition on this asset. Uncheck on the asset if the rollover should not apply.",
  jtwros_spouse_no_disposition_check_advice: "Joint asset with a spouse: survivorship applies. Whether a partial deemed disposition arises is fact-specific; advice recommended.",
  pre_change_of_use_review: "Change of use can limit the principal residence exemption. The formula was applied; review the designation years.",
  collectible_rules_review: "Collectibles have special rules (per-item $1,000 exemption floor and 28% minimum inclusion for listed personal property in some cases). Gain shown at general rules; review.",
  net_capital_loss_carryforward_review: "Net capital loss position this year. Carry-forward and final-return loss relief are beyond this tool; review with a professional.",
  loss_relief_beyond_current_year_not_modeled: "Only current-year capital losses were applied. Other-year loss relief is not modeled.",
  registered_plan_rollover_conditions: "Rollover conditions confirmed by you: the amount is excluded from the deceased's income. Keep records of the transfer deadline (December 31 of the year after death for RRSP).",
  rollover_transfer_conditions_unconfirmed: "Spouse is sole beneficiary but transfer conditions are not confirmed, so the full value is included in income. Confirm the direct transfer or distribution deadline to remove it.",
  tfsa_post_death_earnings_2026_designation: "Post-death TFSA earnings: from January 1, 2026, earnings to the end of the rollover period can be designated as an exempt contribution for survivors. Review designation steps.",
  credits_beyond_bpa_donations_not_modeled: "Income tax estimate includes the basic personal amount and donation credits only. Age, pension, disability, medical and other credits are not modeled and would reduce tax.",
  donation_credit_rates_pending_verification: "Donation credit rates are pending source verification at the ship gate. The amount is shown as an estimate.",
  donation_carryback_and_probate_treatment_review: "Donations by will: prior-year carryback and the probate treatment of the gifted asset need professional confirmation.",
  income_to_death_is_user_input_flag: "Income accrued to date of death is a user-entered estimate; verify against final statements.",
  alter_ego_trust_taxation_and_21_year_rule: "Alter ego trust: the trust pays tax and the 21-year deemed disposition rule applies. Trust-level tax is outside this tool.",
  alter_ego_death_disposition_review: "Death of the settlor can trigger a deemed disposition inside the alter ego trust. Professional review required.",
  joint_partner_trust_taxation_review: "Joint partner trust: trust-level taxation and survivor mechanics need professional review.",
  inter_vivos_top_rate_taxation: "Most inter vivos trusts pay top-rate flat tax. Trust-level computation is outside this tool.",
  deemed_disposition_21_year: "Trusts face a deemed disposition every 21 years.",
  gre_rates_available_36_months: "Graduated rate estate conditions appear met: the estate can use graduated rates for up to 36 months after death.",
  gre_not_established_top_rate_risk: "Graduated rate estate conditions not established; testamentary trusts otherwise face top-rate tax after 36 months or without designation.",
  spousal_trust_rollover_review: "Spousal or common-law trust: rollover availability depends on trust terms. Review.",
  trust_real_estate_gain_at_trust_level: "Real estate held in the trust is taxed at the trust level, not on the final return.",
  beneficial_interest_possible_inclusion: "A beneficial interest in a trust may itself be estate property. Review with a lawyer.",
  unknown_trust_type_review: "Unknown trust type: review required.",
  cpp_topup_2025: "The CPP death benefit is up to $5,000 (basic $2,500 plus top-up $2,500) for deaths on or after January 1, 2025.",
};

const TRUST_LABELS = {
  alter_ego: "Alter ego trust",
  joint_partner: "Joint partner trust",
  inter_vivos_family: "Inter vivos family trust",
  testamentary_by_will: "Testamentary trust created by the will",
  spousal_clp: "Spousal or common-law trust",
  holds_real_estate: "Trust holding real estate",
  deceased_was_beneficiary: "Trust where the deceased was a beneficiary",
};

const state = { assets: [], trusts: [] };

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...rest) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  const children = rest.flat(Infinity);
  for (const c of children) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
};

function num(id, fallback = 0) {
  const v = parseFloat($(id)?.value);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function val(id) {
  const sel = id.startsWith("#") ? id : `#${id}`;
  return $(sel)?.value ?? "";
}

function checked(id) {
  const sel = id.startsWith("#") ? id : `#${id}`;
  return $(sel)?.checked === true;
}

function readEstate() {
  const certValue = document.querySelector('input[name="certificate"]:checked')?.value ?? "regular";
  const spouseExists = checked("spouse-exists");
  const rel = val("spouse-relationship");
  const dod = val("date-of-death");
  const monthsSinceDeath =
    dod && !isNaN(new Date(dod))
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(dod + "T00:00:00").getTime()) /
              (1000 * 60 * 60 * 24 * 30.4375)
          )
        )
      : null;
  const trusts = state.trusts.map((t) => ({
    type: t.type,
    gre_designated: t.gre_designated,
    months_since_death: monthsSinceDeath,
  }));
  return {
    certificateRequested: certValue !== "none",
    certificateType: certValue,
    applicationDate: val("application-date") || undefined,
    will_status: document.querySelector('input[name="will-status"]:checked')?.value ?? "will",
    spouse_or_clp: {
      exists: spouseExists,
      relationship: spouseExists ? rel : undefined,
      separated: spouseExists && rel === "separated",
    },
    dateOfDeath: dod,
    other_income_year_of_death_cents: dollarsToCents(num("#other-income")),
    income_to_death_cents:
      dollarsToCents(num("#income-to-death")) +
      state.assets.reduce(
        (s, a) => s + dollarsToCents(a.incomeToDeathDollars || 0),
        0
      ),
    deductions_cents: dollarsToCents(num("#deductions")),
    capital_losses_current_year_cents: dollarsToCents(num("#capital-losses")),
    charity_gifts_cents: dollarsToCents(num("#charity-gifts")),
    certificateIssueDate: val("certificate-issue-date") || undefined,
    trusts,
  };
}

function engineAsset(a, estate) {
  const asset = {
    category: a.category,
    description: a.description,
    situs: {
      country: a.outsideCanada ? "OTHER" : "CA",
      province: a.category === "out_of_province_real_property" ? "OTHER" : "ON",
      on_reserve: a.onReserve === true,
    },
    ownership: a.ownership,
    tic_share_pct: a.ticSharePct,
    coowner_relationship: a.coownerRelationship,
    jointExclusionConfirmed: a.jointExclusionConfirmed === true,
    reserveExemptionConfirmed: a.reserveExemptionConfirmed === true,
    in_probated_will: a.inProbatedWill !== false,
    beneficiary: {
      present: a.beneficiaryType !== "none",
      type:
        a.beneficiaryType === "spouse"
          ? "spouse_common_law"
          : a.beneficiaryType === "successor_holder"
            ? "successor_holder"
            : a.beneficiaryType === "estate"
              ? "estate"
              : a.beneficiaryType === "dependent_child"
                ? "financially_dependent_child"
                : a.beneficiaryType === "other_named"
                  ? "other_named"
                  : undefined,
      sole: a.beneficiarySole === true,
    },
    transferConditionsMet: a.transferConditionsMet === true,
    valueCents: dollarsToCents(a.valueDollars || 0),
    acbCents: dollarsToCents(a.acbDollars || 0),
    sellingCostsCents: dollarsToCents(a.sellingCostsDollars || 0),
    encumbranceCents: dollarsToCents(a.encumbranceDollars || 0),
    encumbranceRegisteredOnIncludedOnRealProperty: a.encumbranceRegistered === true,
    principal_residence: {
      designated: a.preDesignated === true,
      years_owned_post_1971: Number(a.preYearsOwned) || 0,
      years_designated: Number(a.preYearsDesignated) || 0,
      change_of_use: a.preChangeOfUse === true,
    },
    incomeToDeathCents: dollarsToCents(a.incomeToDeathDollars || 0),
    postDeathIncomeCents: dollarsToCents(a.postDeathIncomeDollars || 0),
    transfersToSpouse: a.transfersToSpouse === true,
    spousalRolloverDisabled: a.spousalRolloverDisabled === true,
    rdspDeceasedWasBeneficiary: a.rdspDeceasedWasBeneficiary === true,
    valuation_source: a.valuationSource,
  };
  if (asset.category === "on_real_property" && a.outsideOntarioRealEstate) {
    asset.category = "out_of_province_real_property";
  }
  return asset;
}

const REAL_ESTATE = ["on_real_property", "out_of_province_real_property"];
const CAPITAL = [
  ...REAL_ESTATE,
  "investment",
  "gic_fixed_income",
  "crypto",
  "public_shares",
  "private_shares",
  "partnership",
  "farm",
  "business_interest",
  "jewellery_art_collectibles",
];
const REGISTERED = ["rrsp", "rrif", "tfsa", "resp", "rdsp", "rpp", "lira_lif", "annuity"];
const INCOME_ACCRUAL = ["bank", "investment", "gic_fixed_income"];
const NO_OWNERSHIP = ["cpp_death_benefit", "oas_cpp_payable"];

function field(labelText, input) {
  const id = input.id || crypto.randomUUID();
  input.id = id;
  return el("p", { class: "field" }, [el("label", { for: id }, labelText), input]);
}

function bind(input, asset, key, transform) {
  input.addEventListener("input", () => {
    asset[key] = transform ? transform(input) : input.value;
    recompute();
  });
  return input;
}

function buildAssetCard(asset, index) {
  const card = el("div", { class: "asset-card" });
  const title = el("h3", {}, `Asset ${index + 1}: ${CATEGORY_LABELS[asset.category] || asset.category}`);
  const remove = el("button", {
    type: "button",
    class: "remove",
    onclick: () => {
      state.assets.splice(index, 1);
      renderAssets();
      recompute();
    },
  }, "Remove asset");
  card.append(title, remove);

  const body = el("div", { class: "grid" });

  const catSelect = el("select", {}, Object.entries(CATEGORY_LABELS).map(([v, l]) =>
    el("option", { value: v, ...(asset.category === v ? { selected: "selected" } : {}) }, l)
  ));
  catSelect.addEventListener("change", () => {
    asset.category = catSelect.value;
    renderAssets();
    recompute();
  });
  body.append(field("Category", catSelect));

  body.append(field("Description (optional)", bind(el("input", { type: "text", value: asset.description || "" }), asset, "description")));

  const valueInput = el("input", { type: "number", min: "0", step: "0.01", value: asset.valueDollars ?? "" });
  bind(valueInput, asset, "valueDollars", (i) => parseFloat(i.value) || 0);
  body.append(field("Value at date of death ($)", valueInput));

  const valSource = el("select", {}, ["statement", "appraisal", "estimate", "other"].map((v) =>
    el("option", { value: v, ...(asset.valuationSource === v ? { selected: "selected" } : {}) }, v)
  ));
  body.append(field("Source of valuation", bind(valSource, asset, "valuationSource")));

  if (!NO_OWNERSHIP.includes(asset.category)) {
    const own = el("select", {}, [
      ["sole", "Sole ownership"],
      ["joint_jtwros", "Joint with right of survivorship"],
      ["joint_tic", "Tenancy in common (share)"],
      ["trust_held", "Held in an inter vivos trust"],
    ].map(([v, l]) => el("option", { value: v, ...(asset.ownership === v ? { selected: "selected" } : {}) }, l)));
    body.append(field("Ownership", bind(own, asset, "ownership", (i) => { asset.ownership = i.value; renderAssets(); return i.value; })));
  }

  if (asset.ownership === "joint_tic") {
    const share = el("input", { type: "number", min: "1", max: "100", step: "1", value: asset.ticSharePct ?? "" });
    body.append(field("Deceased's share (%)", bind(share, asset, "ticSharePct", (i) => parseFloat(i.value) || 0)));
  }

  if (asset.ownership === "joint_jtwros") {
    const rel = el("select", {}, [
      ["spouse", "Spouse"],
      ["common_law", "Common-law partner"],
      ["adult_child", "Adult child"],
      ["other", "Other person"],
    ].map(([v, l]) => el("option", { value: v, ...(asset.coownerRelationship === v ? { selected: "selected" } : {}) }, l)));
    body.append(field("Joint owner relationship", bind(rel, asset, "coownerRelationship", (i) => { asset.coownerRelationship = i.value; renderAssets(); return i.value; })));
    if (asset.coownerRelationship && !["spouse", "common_law"].includes(asset.coownerRelationship)) {
      const confirm = el("input", { type: "checkbox" });
      confirm.checked = asset.jointExclusionConfirmed === true;
      body.append(el("label", {}, [
        confirm,
        " I confirm beneficial ownership truly passed to the joint owner (excludes it from the estate value). Fact-specific: resulting-trust risk flagged.",
      ]));
      confirm.addEventListener("change", () => {
        asset.jointExclusionConfirmed = confirm.checked;
        recompute();
      });
    }
  }

  if (REAL_ESTATE.includes(asset.category)) {
    const reserve = el("input", { type: "checkbox" });
    reserve.checked = asset.onReserve === true;
    reserve.addEventListener("change", () => {
      asset.onReserve = reserve.checked;
      renderAssets();
      recompute();
    });
    body.append(el("label", {}, [reserve, " Property situated on a reserve"]));
    if (asset.onReserve) {
      const rc = el("input", { type: "checkbox" });
      rc.checked = asset.reserveExemptionConfirmed === true;
      rc.addEventListener("change", () => {
        asset.reserveExemptionConfirmed = rc.checked;
        recompute();
      });
      body.append(el("label", {}, [rc, " I confirm the reserve exemption applies (Ministry confirmation advised)"]));
    }
  }

  if (asset.category === "on_real_property") {
    const out = el("input", { type: "checkbox" });
    out.checked = asset.outsideOntarioRealEstate === true;
    out.addEventListener("change", () => {
      asset.outsideOntarioRealEstate = out.checked;
      if (out.checked) asset.category = "out_of_province_real_property";
      renderAssets();
      recompute();
    });
    body.append(el("label", {}, [out, " Real estate is located outside Ontario"]));
  }

  if (!NO_OWNERSHIP.includes(asset.category)) {
    const ben = el("select", {}, [
      ["none", "No beneficiary designation"],
      ["estate", "Payable to the estate"],
      ["spouse", "Spouse or common-law partner named"],
      ["dependent_child", "Financially dependent child or grandchild named"],
      ["other_named", "Other named beneficiary"],
      ...(asset.category === "tfsa" ? [["successor_holder", "Successor holder named"]] : []),
    ].map(([v, l]) => el("option", { value: v, ...((asset.beneficiaryType || "none") === v ? { selected: "selected" } : {}) }, l)));
    body.append(field("Beneficiary designation", bind(ben, asset, "beneficiaryType", (i) => { asset.beneficiaryType = i.value; renderAssets(); return i.value; })));
  }

  if (["rrsp", "rrif"].includes(asset.category) && asset.beneficiaryType === "spouse") {
    const sole = el("input", { type: "checkbox" });
    sole.checked = asset.beneficiarySole === true;
    sole.addEventListener("change", () => {
      asset.beneficiarySole = sole.checked;
      renderAssets();
      recompute();
    });
    body.append(el("label", {}, [sole, " Spouse is the SOLE beneficiary"]));
    if (asset.beneficiarySole) {
      const met = el("input", { type: "checkbox" });
      met.checked = asset.transferConditionsMet === true;
      met.addEventListener("change", () => {
        asset.transferConditionsMet = met.checked;
        recompute();
      });
      body.append(el("label", {}, [met, " Transfer or distribution conditions will be met (deadline: December 31 of the year after death for RRSP; RRIF designated-benefit conditions)"]));
    }
  }

  if (REAL_ESTATE.includes(asset.category)) {
    const enc = el("input", { type: "number", min: "0", step: "0.01", value: asset.encumbranceDollars ?? "" });
    body.append(field("Mortgage or lien amount ($)", bind(enc, asset, "encumbranceDollars", (i) => parseFloat(i.value) || 0)));
    const reg = el("input", { type: "checkbox" });
    reg.checked = asset.encumbranceRegistered === true;
    reg.addEventListener("change", () => {
      asset.encumbranceRegistered = reg.checked;
      recompute();
    });
    body.append(el("label", {}, [reg, " Encumbrance is registered against this real estate (only registered encumbrances are deductible)"]));
  }

  if (REAL_ESTATE.includes(asset.category) || asset.category === "jewellery_art_collectibles") {
    const des = el("input", { type: "checkbox" });
    des.checked = asset.preDesignated === true;
    des.addEventListener("change", () => {
      asset.preDesignated = des.checked;
      renderAssets();
      recompute();
    });
    body.append(el("label", {}, [des, " Designated as a principal residence for some or all years"]));
    if (asset.preDesignated) {
      const owned = el("input", { type: "number", min: "0", step: "1", value: asset.preYearsOwned ?? "" });
      body.append(field("Years owned (since 1971 or acquisition)", bind(owned, asset, "preYearsOwned", (i) => parseInt(i.value) || 0)));
      const designated = el("input", { type: "number", min: "0", step: "1", value: asset.preYearsDesignated ?? "" });
      body.append(field("Years designated as principal residence", bind(designated, asset, "preYearsDesignated", (i) => parseInt(i.value) || 0)));
      const change = el("input", { type: "checkbox" });
      change.checked = asset.preChangeOfUse === true;
      change.addEventListener("change", () => {
        asset.preChangeOfUse = change.checked;
        recompute();
      });
      body.append(el("label", {}, [change, " Part of the property had a change of use (rental or business)"]));
    }
  }

  if (CAPITAL.includes(asset.category) || asset.category === "jewellery_art_collectibles") {
    const acb = el("input", { type: "number", min: "0", step: "0.01", value: asset.acbDollars ?? "" });
    body.append(field("Adjusted cost base ($)", bind(acb, asset, "acbDollars", (i) => parseFloat(i.value) || 0)));
    const costs = el("input", { type: "number", min: "0", step: "0.01", value: asset.sellingCostsDollars ?? "" });
    body.append(field("Selling costs ($, optional)", bind(costs, asset, "sellingCostsDollars", (i) => parseFloat(i.value) || 0)));
    if (checked("spouse-exists")) {
      const toSpouse = el("input", { type: "checkbox" });
      toSpouse.checked = asset.transfersToSpouse === true;
      toSpouse.addEventListener("change", () => {
        asset.transfersToSpouse = toSpouse.checked;
        renderAssets();
        recompute();
      });
      body.append(el("label", {}, [toSpouse, " This asset transfers to the spouse (rollover applies by default)"]));
      if (asset.transfersToSpouse) {
        const off = el("input", { type: "checkbox" });
        off.checked = asset.spousalRolloverDisabled === true;
        off.addEventListener("change", () => {
          asset.spousalRolloverDisabled = off.checked;
          recompute();
        });
        body.append(el("label", {}, [off, " Turn OFF the spousal rollover (elect to trigger the gain)"]));
      }
    }
  }

  if (INCOME_ACCRUAL.includes(asset.category)) {
    const inc = el("input", { type: "number", min: "0", step: "0.01", value: asset.incomeToDeathDollars ?? "" });
    body.append(field("Interest or income accrued to date of death ($, optional)", bind(inc, asset, "incomeToDeathDollars", (i) => parseFloat(i.value) || 0)));
  }

  if (asset.category === "tfsa") {
    const post = el("input", { type: "number", min: "0", step: "0.01", value: asset.postDeathIncomeDollars ?? "" });
    body.append(field("TFSA earnings after death ($, optional)", bind(post, asset, "postDeathIncomeDollars", (i) => parseFloat(i.value) || 0)));
  }

  if (asset.category === "rdsp") {
    const was = el("input", { type: "checkbox" });
    was.checked = asset.rdspDeceasedWasBeneficiary === true;
    was.addEventListener("change", () => {
      asset.rdspDeceasedWasBeneficiary = was.checked;
      recompute();
    });
    body.append(el("label", {}, [was, " The deceased was the RDSP beneficiary"]));
  }

  if (document.querySelector('input[name="certificate"]:checked')?.value === "limited_to_will_assets") {
    const inWill = el("input", { type: "checkbox" });
    inWill.checked = asset.inProbatedWill !== false;
    inWill.addEventListener("change", () => {
      asset.inProbatedWill = inWill.checked;
      recompute();
    });
    body.append(el("label", {}, [inWill, " This asset is referred to in the probated (primary) will"]));
  }

  card.append(body);
  return card;
}

function buildTrustCard(trust, index) {
  const card = el("div", { class: "trust-card" });
  const sel = el("select", {}, Object.entries(TRUST_LABELS).map(([v, l]) =>
    el("option", { value: v, ...(trust.type === v ? { selected: "selected" } : {}) }, l)
  ));
  sel.addEventListener("change", () => {
    trust.type = sel.value;
    recompute();
  });
  const gre = el("input", { type: "checkbox" });
  gre.checked = trust.gre_designated === true;
  gre.addEventListener("change", () => {
    trust.gre_designated = gre.checked;
    recompute();
  });
  const remove = el("button", {
    type: "button",
    class: "remove",
    onclick: () => {
      state.trusts.splice(index, 1);
      renderTrusts();
      recompute();
    },
  }, "Remove trust");
  card.append(
    el("h3", {}, `Trust ${index + 1}`),
    remove,
    field("Trust type", sel),
    el("label", {}, [gre, " Estate designates itself as the graduated rate estate (testamentary trusts, within 36 months of death)"])
  );
  return card;
}

function renderAssets() {
  const list = $("#asset-list");
  list.innerHTML = "";
  state.assets.forEach((a, i) => list.append(buildAssetCard(a, i)));
}

function renderTrusts() {
  const list = $("#trusts-list");
  list.innerHTML = "";
  state.trusts.forEach((t, i) => list.append(buildTrustCard(t, i)));
}

function srcSup(ids) {
  return ids
    .filter((id) => rules.sources.some((s) => s.id === id))
    .map((id) => `<sup><a href="#src-${id}" aria-label="Source ${id}">${id}</a></sup>`)
    .join("");
}

function estimateFees(baseCents, receiptsCents, disbursementsCents) {
  const executor = Math.round((receiptsCents + disbursementsCents) * 0.025);
  let legal;
  if (baseCents <= dollarsToCents(50000)) legal = 75000;
  else if (baseCents <= dollarsToCents(300000)) legal = 500000;
  else if (baseCents <= dollarsToCents(1000000)) legal = 1125000;
  else legal = 2500000;
  return { executorCents: executor, legalCents: legal };
}

function marginalCombinedRate(ti, onBasic) {
  let fed = 0;
  for (const b of rules.federalTax.brackets) {
    if (ti > dollarsToCents(b.from)) fed = b.rate;
  }
  let on = 0;
  for (const b of rules.ontarioTax.brackets) {
    if (ti > dollarsToCents(b.from)) on = b.rate;
  }
  const s = rules.ontarioTax.surtax;
  let mult = 1;
  if (onBasic > dollarsToCents(s.tier1ThresholdDollars)) mult += s.tier1Rate;
  if (onBasic > dollarsToCents(s.tier2ThresholdDollars)) mult += s.tier2Rate;
  return fed + on * mult;
}

function renderResults() {
  const results = $("#results");
  const hardStop = $("#hard-stop");
  results.innerHTML = "";
  hardStop.hidden = true;

  const estate = readEstate();
  const engineAssets = state.assets.map((a) => engineAsset(a, estate));
  const validationErrors = validateAssets(engineAssets);

  if (validationErrors.length > 0) {
    const card = el("div", { class: "card error" });
    card.append(el("h3", {}, "Fix these input errors first"));
    const ul = el("ul", {});
    for (const e of validationErrors) {
      ul.append(el("li", {}, `Asset ${(e.assetIndex ?? 0) + 1}: ${e.code.replaceAll("_", " ")}`));
    }
    card.append(ul);
    results.append(card);
    return;
  }

  const base = buildProbateBase(rules, engineAssets, estate);
  const eat = computeEAT(rules, {
    baseCents: base.baseCents,
    certificateRequested: estate.certificateRequested,
    certificateType: estate.certificateType,
    applicationDate: estate.applicationDate,
  });

  if (!eat.ok && eat.reason === "pre2020_not_supported") {
    hardStop.hidden = false;
    hardStop.textContent = eat.message;
    return;
  }

  const finalReturn = computeFinalReturn(rules, {
    assets: engineAssets,
    estate: {
      ...estate,
      other_income_year_of_death_cents: estate.other_income_year_of_death_cents,
    },
  });

  const trustTreatments = computeTrustTreatments(rules, estate.trusts, estate);

  const receiptsCents = engineAssets.reduce((s, a) => s + Math.max(0, a.valueCents), 0);
  const disbursementsCents =
    engineAssets.reduce((s, a) => s + Math.max(0, a.encumbranceCents), 0) +
    dollarsToCents(num("#taxes-owing"));
  const est = estimateFees(base.baseCents, receiptsCents, disbursementsCents);
  const usingEstimate = checked("use-fee-estimate");
  const legalCents = usingEstimate ? est.legalCents : dollarsToCents(num("#fee-legal"));
  const executorCents = usingEstimate ? est.executorCents : dollarsToCents(num("#fee-executor"));
  const disbursementUserCents = dollarsToCents(num("#fee-disbursements"));
  const funeralCents = dollarsToCents(num("#fee-funeral"));
  const taxesOwingCents = dollarsToCents(num("#taxes-owing"));

  const eatCard = el("div", { class: "card statutory" });
  eatCard.append(
    el("h3", { html: `Estate Administration Tax (probate fee) <span class="tag stat">Statutory</span>${srcSup(["S1", "S4"])}` }),
    el("div", { class: "big-number" }, money(eat.ok ? eat.eatCents : 0)),
    el("p", { class: "chip", html: `<strong>Applied because:</strong> ${eatNoteText(eat)} ${srcSup(eat.ok ? eat.notes.flatMap((n) => n.sourceIds) : ["S1"])}` }),
    el("p", { class: "chip", html: `Estate value for tax: <strong>${money(base.baseCents)}</strong>${eat.ok && !eat.exempt && eat.eatCents > 0 ? `, rounded up to <strong>${money(eat.roundedCents)}</strong>` : ""} ${srcSup(["S3", "S4"])}` }),
  );
  if (eat.ok && eat.smallEstateEligible && estate.certificateRequested) {
    eatCard.append(el("p", { class: "chip", html: `Small Estate Certificate available (estate of $150,000 or less). Court fee amount not yet confirmed and not included. ${srcSup(["S19"])}` }));
  }
  const eir = computeEirDeadline(rules, estate.certificateIssueDate);
  if (eir && estate.certificateRequested) {
    eatCard.append(el("p", { class: "chip", html: `Estate Information Return due by <strong>${eir}</strong> (180 calendar days after the certificate is issued; weekends roll to the next business day, statutory holidays not modeled). ${srcSup(["S7"])}` }));
  }
  results.append(eatCard);

  const recon = el("div", { class: "card" });
  recon.append(el("h3", { html: `Probate base reconciliation <span class="tag stat">Statutory rules</span>` }));
  const table = el("table");
  table.append(el("thead", {}, el("tr", {}, [
    el("th", {}, "Asset"),
    el("th", {}, "Status and reason"),
    el("th", { class: "num" }, "Value"),
    el("th", { class: "num" }, "Encumbrance deducted"),
    el("th", { class: "num" }, "Counts toward base"),
  ])));
  const tbody = el("tbody");
  base.lines.forEach((line, i) => {
    const a = engineAssets[i];
    const label = a.description || CATEGORY_LABELS[a.category] || a.category;
    const tag = line.included
      ? `<span class="tag incl">Included</span>`
      : `<span class="tag excl">Excluded</span>`;
    const reason = REASON_TEXT[line.reasonCode] || line.reasonCode;
    const flagTexts = line.flags.map((f) => FLAG_TEXT[f.code] || f.code);
    tbody.append(el("tr", {}, [
      el("td", {}, `${i + 1}. ${label}`),
      el("td", {
        html: `${tag} ${reason} ${srcSup(line.sourceIds)}${flagTexts.map((t) => `<span class="chip"><strong>Flag:</strong> ${t}</span>`).join("")}`,
      }),
      el("td", { class: "num" }, money(line.valueCents)),
      el("td", { class: "num" }, money(line.encumbranceDeductedCents)),
      el("td", { class: "num" }, money(line.contributionCents)),
    ]));
  });
  tbody.append(el("tr", { class: "total" }, [
    el("td", { colspan: "4" }, "Estate value for tax (probate base)"),
    el("td", { class: "num" }, money(base.baseCents)),
  ]));
  table.append(tbody);
  recon.append(table);
  base.warnings.forEach((w) => {
    recon.append(el("p", { class: "chip", html: `<strong>Warning:</strong> asset ${(w.assetIndex ?? 0) + 1}: ${w.code.replaceAll("_", " ")} ${srcSup(w.sourceIds || [])}` }));
  });
  results.append(recon);

  if (finalReturn.ok) {
    const taxCard = el("div", { class: "card statutory" });
    taxCard.append(el("h3", { html: `Income tax estimate, final return <span class="tag est">Estimate</span>${srcSup(["S8", "S14", "S15"])}` }));
    const c = finalReturn.components;
    const compTable = el("table");
    compTable.append(el("tbody", {},
      row("Other income in year of death", c.otherIncomeCents),
      row("Interest and income accrued to date of death", c.incomeToDeathCents),
      row("Taxable capital gains (50% inclusion, 2026)", c.taxableCapitalGainsCents, ["S9"]),
      row("RRSP, RRIF and other plan inclusions", c.planInclusionsCents, ["S10", "S11"]),
      row("Deductions", -c.deductionsCents),
      el("tr", { class: "total" }, [el("td", {}, "Taxable income"), el("td", { class: "num" }, money(finalReturn.taxableIncomeCents))]),
    ));
    taxCard.append(compTable);
    const t = finalReturn.tax;
    const taxTable = el("table");
    taxTable.append(el("tbody", {},
      row("Federal tax before credits", t.federalBreakdown.grossCents, ["S14"]),
      row("Federal basic personal amount credit", -t.federalBreakdown.bpaCreditCents, ["S18"]),
      row("Federal donation credit", -t.federalBreakdown.donationCreditCents),
      el("tr", {}, [el("td", { html: "<strong>Federal tax</strong>" }), el("td", { class: "num", html: `<strong>${money(t.federalCents, true)}</strong>` })]),
      row("Ontario tax after credits, before surtax", t.ontarioBreakdown.basicCents, ["S15"]),
      row("Ontario surtax", t.ontarioBreakdown.surtaxCents, ["S16"]),
      row("Ontario health premium", t.ontarioBreakdown.healthPremiumCents, ["S17"]),
      el("tr", {}, [el("td", { html: "<strong>Ontario tax</strong>" }), el("td", { class: "num", html: `<strong>${money(t.ontarioCents, true)}</strong>` })]),
      el("tr", { class: "total" }, [el("td", {}, "Total income tax estimate"), el("td", { class: "num" }, money(t.totalCents, true))]),
    ));
    taxCard.append(taxTable);
    const mtr = marginalCombinedRate(finalReturn.taxableIncomeCents, t.ontarioBreakdown.basicCents);
    taxCard.append(el("p", { class: "mtr", html: `Derived for you: top combined marginal rate at this income level is about <strong>${fmtPct.format(mtr)}</strong> (federal plus Ontario, including surtax effect where applicable). You never need to enter a rate.` }));
    results.append(taxCard);
  }

  if (trustTreatments.length > 0) {
    const trustCard = el("div", { class: "card" });
    trustCard.append(el("h3", {}, "Trust treatments"));
    const ul = el("ul", { class: "flag-list" });
    estate.trusts.forEach((t, i) => {
      const tr = trustTreatments[i];
      ul.append(el("li", {
        html: `<strong>${TRUST_LABELS[t.type] || t.type}:</strong> ${tr.excludedFromProbateBase ? "outside the probate base" : "assets pass through the estate"}${tr.greEligible ? "; graduated rate estate conditions met (36-month window)" : ""} ${srcSup(tr.sourceIds)}${tr.flags.map((f) => `<span class="chip"><strong>Flag:</strong> ${FLAG_TEXT[f.code] || f.code} ${srcSup(f.sourceIds || [])}</span>`).join("")}`,
      }));
    });
    trustCard.append(ul);
    results.append(trustCard);
  }

  const allFlags = collectFlags(base, finalReturn);
  if (allFlags.length > 0) {
    const flagCard = el("div", { class: "card" });
    flagCard.append(el("h3", { html: `Review flags <span class="tag flag">Action or review needed</span>` }));
    const ul = el("ul", { class: "flag-list" });
    allFlags.forEach((f) => {
      ul.append(el("li", { html: `${FLAG_TEXT[f.code] || f.code} ${srcSup(f.sourceIds || [])}` }));
    });
    flagCard.append(ul);
    results.append(flagCard);
  }

  const feeCard = el("div", { class: "card estimate" });
  const courtFeeCents = !estate.certificateRequested
    ? 0
    : rules.eat.exemptCertificateTypes.includes(estate.certificateType)
      ? dollarsToCents(rules.courtFees.succeedingOrDuringLitigationDollars)
      : dollarsToCents(rules.courtFees.regularApplicationDollars);
  feeCard.append(
    el("h3", { html: `Professional fees and costs <span class="tag est">Estimate, not a government figure</span>` }),
    el("table", {}, el("tbody", {},
      row("Superior Court filing fee for the certificate application (statutory fee schedule)", courtFeeCents, ["S26"]),
      row("Legal fees", legalCents),
      row("Executor compensation", executorCents),
      row("Disbursements", disbursementUserCents),
      row("Funeral costs (estate cost only, never reduces the tax)", funeralCents),
      row("Income taxes owing at death", taxesOwingCents),
    )),
  );
  if (estate.certificateType === "small_estate") {
    feeCard.append(el("p", { class: "chip", html: `The court fee schedule does not name a separate small estate certificate fee, so the general $232 application fee is shown. Confirm with the court. ${srcSup(["S26"])}` }));
  }
  if (usingEstimate) {
    feeCard.append(el("p", { class: "chip", html: "Estimate defaults applied: executor about 2.5% of capital receipts plus 2.5% of disbursements (court-reviewed convention, not a statute), legal fee midpoint by estate size. Edit any field to override." }));
  }
  results.append(feeCard);

  const eatCents = eat.ok ? eat.eatCents : 0;
  const incomeTaxCents = finalReturn.ok ? finalReturn.tax.totalCents : 0;
  const totalCost = eatCents + incomeTaxCents + courtFeeCents + legalCents + executorCents + disbursementUserCents;
  const netToBeneficiaries = receiptsCents - disbursementsCents - totalCost - funeralCents;
  const totalCard = el("div", { class: "card statutory" });
  totalCard.append(
    el("h3", {}, "Total estate cost and net to beneficiaries"),
    el("table", {}, el("tbody", {},
      row("Estate Administration Tax (statutory)", eatCents),
      row("Court filing fee (statutory schedule)", courtFeeCents, ["S26"]),
      row("Income tax estimate", incomeTaxCents),
      row("Professional fees and disbursements (estimate)", legalCents + executorCents + disbursementUserCents),
      el("tr", { class: "total" }, [el("td", {}, "Total estate cost"), el("td", { class: "num" }, money(totalCost))]),
      row("Gross value of all assets entered", receiptsCents),
      row("Less: debts, encumbrances and taxes owing", -(disbursementsCents + funeralCents)),
      el("tr", { class: "total" }, [el("td", {}, "Indicative net to beneficiaries"), el("td", { class: "num" }, money(netToBeneficiaries))]),
    ))
  );
  totalCard.append(el("p", { class: "chip" }, "Joint and designated assets shown in the gross total pass directly to survivors and are not available to pay estate costs."));
  results.append(totalCard);
}

function row(label, cents, srcIds = []) {
  const td1 = cents < 0 ? `(${money(-cents, true)})` : money(cents, true);
  return el("tr", {}, [
    el("td", { html: `${label} ${srcSup(srcIds)}` }),
    el("td", { class: "num" }, td1),
  ]);
}

function eatNoteText(eat) {
  if (!eat.ok) return "Not computable with the current inputs.";
  const n = eat.notes[0]?.code;
  if (n === "no_certificate_requested") return "No estate certificate will be applied for, so no tax is owed.";
  if (n === "exempt_certificate_type") return "This certificate type carries no Estate Administration Tax.";
  if (n === "at_or_below_exemption") return "Estate value is $50,000 or less, so the estate is exempt (the Estate Information Return is still due within 180 days).";
  return "Value above $50,000: $15 for every $1,000 or part thereof above $50,000, after rounding the value up to the nearest $1,000.";
}

function collectFlags(base, finalReturn) {
  const seen = new Set();
  const out = [];
  const push = (f) => {
    const key = f.code;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(f);
    }
  };
  base.lines.forEach((l) => l.flags.forEach(push));
  base.warnings.forEach(push);
  if (finalReturn.ok) {
    finalReturn.dispositions.flags.forEach(push);
    finalReturn.plans.flags.forEach(push);
    finalReturn.tax.flags.forEach(push);
  }
  return out;
}

function renderSources() {
  const list = $("#sources-list");
  list.innerHTML = "";
  const table = el("table");
  table.append(el("thead", {}, el("tr", {}, [
    el("th", {}, "ID"),
    el("th", {}, "Rule"),
    el("th", {}, "Source, section, effective and as-of dates"),
    el("th", {}, "Status"),
  ])));
  const tbody = el("tbody");
  for (const s of rules.sources) {
    tbody.append(el("tr", { id: `src-${s.id}` }, [
      el("td", {}, s.id),
      el("td", {}, s.rule),
      el("td", { html: `<a href="${s.url}" rel="noopener">${s.citation}</a><br><span class="src">${s.section} · effective ${s.effective} · as of ${s.asOf} · checked ${s.checked} · ${s.method}</span>` }),
      el("td", {}, s.status),
    ]));
  }
  table.append(tbody);
  list.append(table);
}

function populatePresets() {
  const sel = $("#preset-select");
  for (const p of presets.presets) {
    sel.append(el("option", { value: p.id }, p.label));
  }
  sel.addEventListener("change", () => applyPreset(sel.value));
}

function applyPreset(id) {
  const p = presets.presets.find((x) => x.id === id);
  if (!p) return;
  const certRadio = document.querySelector(`input[name="certificate"][value="${p.estate.certificate_type || "regular"}"]`);
  if (certRadio) certRadio.checked = true;
  const willRadio = document.querySelector(`input[name="will-status"][value="${p.estate.will_status || "will"}"]`);
  if (willRadio) willRadio.checked = true;
  $("#spouse-exists").checked = p.estate.spouse_or_clp?.exists === true;
  state.assets = p.assets.map((a) => ({
    valueDollars: 0,
    ownership: a.ownership || "sole",
    beneficiaryType: a.beneficiary?.present ? (a.beneficiary.type === "successor_holder" ? "successor_holder" : a.beneficiary.type === "spouse_common_law" ? "spouse" : a.beneficiary.type === "estate" ? "estate" : "other_named") : "none",
    beneficiarySole: a.beneficiary?.sole,
    coownerRelationship: a.coowner_relationship,
    inProbatedWill: a.in_probated_will,
    encumbranceRegistered: a.encumbranceRegisteredOnIncludedOnRealProperty,
    preDesignated: a.principal_residence?.designated,
    ...a,
    category: a.category,
  }));
  renderAssets();
  recompute();
}

function loadSample() {
  document.querySelector('input[name="certificate"][value="regular"]').checked = true;
  document.querySelector('input[name="will-status"][value="will"]').checked = true;
  $("#spouse-exists").checked = true;
  $("#spouse-relationship").value = "spouse";
  $("#date-of-death").value = "2026-09-15";
  $("#application-date").value = "2026-11-01";
  $("#certificate-issue-date").value = "2026-12-01";
  $("#other-income").value = "30000";
  state.trusts = [];
  state.assets = [
    {
      category: "on_real_property",
      description: "Ontario home (principal residence)",
      ownership: "sole",
      valueDollars: 800000,
      encumbranceDollars: 300000,
      encumbranceRegistered: true,
      acbDollars: 350000,
      preDesignated: true,
      preYearsOwned: 22,
      preYearsDesignated: 22,
      beneficiaryType: "none",
      valuationSource: "appraisal",
    },
    {
      category: "bank",
      description: "Joint chequing with spouse",
      ownership: "joint_jtwros",
      coownerRelationship: "spouse",
      valueDollars: 500000,
      beneficiaryType: "none",
      valuationSource: "statement",
    },
    {
      category: "rrsp",
      description: "RRSP, spouse sole beneficiary",
      ownership: "sole",
      valueDollars: 400000,
      beneficiaryType: "spouse",
      beneficiarySole: true,
      transferConditionsMet: true,
      valuationSource: "statement",
    },
    {
      category: "tfsa",
      description: "TFSA, spouse successor holder",
      ownership: "sole",
      valueDollars: 100000,
      beneficiaryType: "successor_holder",
      valuationSource: "statement",
    },
    {
      category: "bank",
      description: "Sole savings account",
      ownership: "sole",
      valueDollars: 100000,
      beneficiaryType: "none",
      incomeToDeathDollars: 1800,
      valuationSource: "statement",
    },
    {
      category: "out_of_province_real_property",
      description: "Florida condo",
      ownership: "sole",
      valueDollars: 500000,
      acbDollars: 300000,
      beneficiaryType: "none",
      valuationSource: "estimate",
    },
    {
      category: "cpp_death_benefit",
      description: "CPP death benefit",
      valueDollars: 5000,
      beneficiaryType: "estate",
      valuationSource: "statement",
    },
  ];
  renderTrusts();
  renderAssets();
  recompute();
}

let recomputeTimer = null;
function recompute() {
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(renderResults, 150);
}

function wire() {
  document.querySelectorAll("input, select, textarea").forEach((n) => {
    n.addEventListener("change", () => {
      if (n.id === "spouse-exists" || n.name === "certificate") renderAssets();
      recompute();
    });
  });
  $("#add-asset").addEventListener("click", () => {
    state.assets.push({ category: "bank", ownership: "sole", beneficiaryType: "none" });
    renderAssets();
    recompute();
  });
  $("#add-trust").addEventListener("click", () => {
    state.trusts.push({ type: "testamentary_by_will", gre_designated: false });
    renderTrusts();
    recompute();
  });
  $("#use-fee-estimate").addEventListener("change", recompute);
  $("#load-sample").addEventListener("click", loadSample);
  if (new URLSearchParams(location.search).get("sample") === "1") {
    loadSample();
  }
}

function boot() {
  $("#rules-version").textContent = rules.version;
  populatePresets();
  renderSources();
  wire();
  if (state.assets.length === 0) {
    state.assets.push({ category: "on_real_property", ownership: "sole", beneficiaryType: "none" });
  }
  renderAssets();
  renderResults();
}

boot();
