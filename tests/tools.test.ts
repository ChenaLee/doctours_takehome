import { describe, it, expect } from "vitest";
import {
  findClinic,
  getAllClinics,
  getClinicDoctors,
  getClinicPackages,
  getConsultationRescheduleLink,
  getFullCalls,
  getLatestAssessment,
  getPatientContext,
  getPatientImages,
  getPaymentLink,
  getSavedClinics,
  issuePromoCode,
  updateUser,
  updateUserClinicPreferences,
  updateWorkingMemory,
  HEVA_CLINIC_ID,
  HAKAN_CLINIC_ID,
  SILVER_PACKAGE_ID,
  GOLD_PACKAGE_ID,
  SAPPHIRE_PACKAGE_ID,
} from "../src/tools/index.js";
import { toolRegistry, callTool, getToolsByKind } from "../src/tools/registry.js";

// ---------- findClinic ----------

describe("findClinic", () => {
  it("finds by exact clinicId", () => {
    const result = findClinic({ clinicId: HEVA_CLINIC_ID });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Heva Clinic");
  });

  it("finds by exact clinicId (Hakan)", () => {
    const result = findClinic({ clinicId: HAKAN_CLINIC_ID });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Dr. Hakan Clinic");
  });

  it("returns null for unknown clinicId", () => {
    expect(findClinic({ clinicId: "unknown-id" })).toBeNull();
  });

  it("finds by exact name (case-insensitive)", () => {
    const result = findClinic({ clinicName: "heva clinic" });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(HEVA_CLINIC_ID);
  });

  it("finds by partial name", () => {
    const result = findClinic({ clinicName: "Heva" });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(HEVA_CLINIC_ID);
  });

  it("finds Hakan by partial name", () => {
    const result = findClinic({ clinicName: "Hakan" });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(HAKAN_CLINIC_ID);
  });

  it("finds by reverse partial (name contains input)", () => {
    const result = findClinic({ clinicName: "Dr. Hakan Clinic Istanbul" });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(HAKAN_CLINIC_ID);
  });

  it("returns null for empty clinicName", () => {
    expect(findClinic({ clinicName: "" })).toBeNull();
  });

  it("returns null for no matching name", () => {
    expect(findClinic({ clinicName: "nonexistent" })).toBeNull();
  });

  it("returns null when no input provided", () => {
    expect(findClinic({})).toBeNull();
  });

  it("trims whitespace in clinicName", () => {
    const result = findClinic({ clinicName: "  Heva  " });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(HEVA_CLINIC_ID);
  });

  it("prefers clinicId over clinicName when both given", () => {
    const result = findClinic({
      clinicId: HEVA_CLINIC_ID,
      clinicName: "Dr. Hakan Clinic",
    });
    expect(result!.name).toBe("Heva Clinic");
  });
});

// ---------- getAllClinics ----------

describe("getAllClinics", () => {
  it("returns both clinics", () => {
    const result = getAllClinics();
    expect(result.clinics).toHaveLength(2);
  });

  it("contains Heva with correct ID", () => {
    const heva = getAllClinics().clinics.find((c) => c.name === "Heva Clinic");
    expect(heva).toBeDefined();
    expect(heva!.id).toBe(HEVA_CLINIC_ID);
    expect(heva!.slug).toBe("heva");
    expect(heva!.status).toBe("ACTIVE");
  });

  it("contains Dr. Hakan with correct ID", () => {
    const hakan = getAllClinics().clinics.find(
      (c) => c.name === "Dr. Hakan Clinic",
    );
    expect(hakan).toBeDefined();
    expect(hakan!.id).toBe(HAKAN_CLINIC_ID);
    expect(hakan!.slug).toBe("dr-hakan");
  });

  it("Heva has Afro Hair specialty in clinic_flags", () => {
    const heva = getAllClinics().clinics.find((c) => c.id === HEVA_CLINIC_ID)!;
    const speciality = heva.clinic_flags.find((f) => f.name === "Speciality");
    expect(speciality?.value).toBe("Afro Hair");
  });

  it("Dr. Hakan has Hair Transplant specialty", () => {
    const hakan = getAllClinics().clinics.find(
      (c) => c.id === HAKAN_CLINIC_ID,
    )!;
    const speciality = hakan.clinic_flags.find((f) => f.name === "Speciality");
    expect(speciality?.value).toBe("Hair Transplant");
  });

  it("clinics have ai_context with bestFor", () => {
    const heva = getAllClinics().clinics.find((c) => c.id === HEVA_CLINIC_ID)!;
    expect(heva.ai_context.bestFor).toContain("afro and textured hair");
  });
});

// ---------- getClinicDoctors ----------

describe("getClinicDoctors", () => {
  it("returns doctor for Heva by name", () => {
    const result = getClinicDoctors({ clinicName: "Heva" });
    expect(result).not.toBeNull();
    expect(result!.doctors).toHaveLength(1);
    expect(result!.doctors[0].name).toBe("Dr. Sibel");
  });

  it("returns doctor for Hakan by ID", () => {
    const result = getClinicDoctors({ clinicId: HAKAN_CLINIC_ID });
    expect(result).not.toBeNull();
    expect(result!.doctors).toHaveLength(1);
    expect(result!.doctors[0].name).toBe("Dr. Hakan");
  });

  it("returns null for unknown clinic", () => {
    expect(getClinicDoctors({ clinicName: "nonexistent" })).toBeNull();
  });
});

// ---------- getClinicPackages ----------

describe("getClinicPackages", () => {
  it("returns Heva packages: Silver and Gold", () => {
    const result = getClinicPackages({ clinicName: "Heva" });
    expect(result).not.toBeNull();
    expect(result!.clinicName).toBe("Heva Clinic");
    expect(result!.currency).toBe("USD");
    expect(result!.packages).toHaveLength(2);

    const names = result!.packages.map((p) => p.name);
    expect(names).toContain("Silver");
    expect(names).toContain("Gold");
  });

  it("Silver is $3,000 with $500 deposit", () => {
    const result = getClinicPackages({ clinicName: "Heva" })!;
    const silver = result.packages.find((p) => p.name === "Silver")!;
    expect(silver.basePrice).toBe(3000);
    expect(silver.depositAmount).toBe(500);
    expect(silver.id).toBe(SILVER_PACKAGE_ID);
  });

  it("Gold is $4,500 with $600 deposit", () => {
    const result = getClinicPackages({ clinicName: "Heva" })!;
    const gold = result.packages.find((p) => p.name === "Gold")!;
    expect(gold.basePrice).toBe(4500);
    expect(gold.depositAmount).toBe(600);
    expect(gold.id).toBe(GOLD_PACKAGE_ID);
  });

  it("Gold has aiContext about doctor involvement", () => {
    const result = getClinicPackages({ clinicName: "Heva" })!;
    const gold = result.packages.find((p) => p.name === "Gold")!;
    expect(gold.aiContext).toContain("doctor makes every incision");
  });

  it("Silver has 3 hotel nights included", () => {
    const result = getClinicPackages({ clinicName: "Heva" })!;
    const silver = result.packages.find((p) => p.name === "Silver")!;
    expect(silver.includedAddons).toHaveLength(1);
    expect(silver.includedAddons[0].name).toBe("Hotel");
    expect(silver.includedAddons[0].includedQuantity).toBe(3);
  });

  it("returns Dr. Hakan packages: Sapphire only", () => {
    const result = getClinicPackages({ clinicName: "Dr. Hakan" });
    expect(result).not.toBeNull();
    expect(result!.clinicName).toBe("Dr. Hakan Clinic");
    expect(result!.packages).toHaveLength(1);
    expect(result!.packages[0].name).toBe("Sapphire");
  });

  it("Sapphire is $3,200 with $500 deposit", () => {
    const result = getClinicPackages({ clinicName: "Dr. Hakan" })!;
    const sapphire = result.packages[0];
    expect(sapphire.basePrice).toBe(3200);
    expect(sapphire.depositAmount).toBe(500);
    expect(sapphire.id).toBe(SAPPHIRE_PACKAGE_ID);
  });

  it("returns null for nonexistent clinic", () => {
    expect(getClinicPackages({ clinicName: "nonexistent" })).toBeNull();
  });

  it("works with clinicId", () => {
    const result = getClinicPackages({ clinicId: HEVA_CLINIC_ID });
    expect(result).not.toBeNull();
    expect(result!.packages).toHaveLength(2);
  });

  it("includes clinic_flags in result", () => {
    const result = getClinicPackages({ clinicName: "Heva" })!;
    const speciality = result.clinic_flags.find(
      (f) => f.name === "Speciality",
    );
    expect(speciality?.value).toBe("Afro Hair");
  });
});

// ---------- getPaymentLink ----------

describe("getPaymentLink", () => {
  it("returns payment link for Silver package", () => {
    const result = getPaymentLink({
      type: "payment",
      clinicPackageId: SILVER_PACKAGE_ID,
    });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("ready");
    expect(result!.linkType).toBe("payment");
    expect(result!.clinicPackageName).toBe("Silver");
    expect(result!.clinicName).toBe("Heva Clinic");
    expect(result!.url).toBe(
      `https://www.doctours.com/payment/${SILVER_PACKAGE_ID}`,
    );
  });

  it("returns payment link for Gold package", () => {
    const result = getPaymentLink({
      type: "payment",
      clinicPackageId: GOLD_PACKAGE_ID,
    });
    expect(result!.status).toBe("ready");
    expect(result!.clinicPackageName).toBe("Gold");
  });

  it("returns payment link for Sapphire package", () => {
    const result = getPaymentLink({
      type: "payment",
      clinicPackageId: SAPPHIRE_PACKAGE_ID,
    });
    expect(result!.status).toBe("ready");
    expect(result!.clinicPackageName).toBe("Sapphire");
    expect(result!.clinicName).toBe("Dr. Hakan Clinic");
  });

  it("returns checkout link for Heva clinic", () => {
    const result = getPaymentLink({
      type: "checkout",
      clinicId: HEVA_CLINIC_ID,
    });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("ready");
    expect(result!.linkType).toBe("checkout");
    expect(result!.clinicName).toBe("Heva Clinic");
    expect(result!.url).toBe("https://www.doctours.com/clinic/heva/checkout");
  });

  it("returns checkout link for Hakan clinic", () => {
    const result = getPaymentLink({
      type: "checkout",
      clinicId: HAKAN_CLINIC_ID,
    });
    expect(result!.url).toBe(
      "https://www.doctours.com/clinic/dr-hakan/checkout",
    );
  });

  it("returns missing_input for payment without clinicPackageId", () => {
    const result = getPaymentLink({ type: "payment" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("missing_input");
    expect(result!.reason).toBe("missing_or_malformed_clinic_package_id");
    expect(result!.url).toBeNull();
  });

  it("returns null for checkout with bogus clinicId", () => {
    expect(
      getPaymentLink({ type: "checkout", clinicId: "bogus" }),
    ).toBeNull();
  });

  it("returns null for unknown type", () => {
    expect(getPaymentLink({ type: "refund" })).toBeNull();
  });

  it("returns null when no type given", () => {
    expect(getPaymentLink({})).toBeNull();
  });

  it("payment with valid package ignores clinicId", () => {
    const result = getPaymentLink({
      type: "payment",
      clinicPackageId: SILVER_PACKAGE_ID,
      clinicId: HAKAN_CLINIC_ID,
    });
    expect(result!.clinicName).toBe("Heva Clinic");
  });
});

// ---------- getLatestAssessment ----------

describe("getLatestAssessment", () => {
  it("returns assessment data", () => {
    const result = getLatestAssessment({});
    expect(result.hasAssessment).toBe(true);
    expect(result.assessmentUrl).toBe(
      "https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333",
    );
    expect(result.shareStatus).toBe("available");
  });

  it("returns graft range", () => {
    const result = getLatestAssessment({});
    expect(result.graftRange.low).toBe(2500);
    expect(result.graftRange.high).toBe(3200);
  });

  it("has hairline drawing", () => {
    expect(getLatestAssessment({}).hasHairlineDrawing).toBe(true);
  });
});

// ---------- getConsultationRescheduleLink ----------

describe("getConsultationRescheduleLink", () => {
  it("returns no_consultation status", () => {
    const result = getConsultationRescheduleLink({});
    expect(result.status).toBe("no_consultation");
    expect(result.reason).toBe("no_consultation_on_file");
    expect(result.url).toBeNull();
    expect(result.consultationTime).toBeNull();
  });
});

// ---------- getFullCalls ----------

describe("getFullCalls", () => {
  it("returns 1 call", () => {
    const result = getFullCalls({});
    expect(result.count).toBe(1);
    expect(result.calls).toHaveLength(1);
  });

  it("call summary mentions hairline", () => {
    const call = getFullCalls({}).calls[0];
    expect(call.summary).toContain("hairline");
  });

  it("call summary mentions 4C curls", () => {
    const call = getFullCalls({}).calls[0];
    expect(call.summary).toContain("4C curls");
  });

  it("call is outbound and completed", () => {
    const call = getFullCalls({}).calls[0];
    expect(call.direction).toBe("outbound");
    expect(call.result).toBe("completed");
  });
});

// ---------- getPatientContext ----------

describe("getPatientContext", () => {
  it("returns correct pipeline status", () => {
    const result = getPatientContext({});
    expect(result.pipelineStatus).toBe("PRE_CLINICAL_SENT");
  });

  it("returns correct patient name", () => {
    expect(getPatientContext({}).name).toBe("Jordan Hale");
  });

  it("returns correct email", () => {
    expect(getPatientContext({}).email).toBe("jordan.hale@example.invalid");
  });

  it("has no selected clinic or package", () => {
    const prefs = getPatientContext({}).clinicSelectionPreferences;
    expect(prefs.selectedClinicId).toBeNull();
    expect(prefs.selectedPackageId).toBeNull();
  });

  it("has tentative procedure dates", () => {
    const dates = getPatientContext({}).tentativeProcedureDates;
    expect(dates.strength).toBe("medium");
    expect(dates.text).toBe("within about 6 months");
  });
});

// ---------- getPatientImages ----------

describe("getPatientImages", () => {
  it("reports all 5 angles uploaded", () => {
    const result = getPatientImages({});
    expect(result.allAnglesUploaded).toBe(true);
    expect(result.imageCount).toBe(5);
    expect(result.hasImages).toBe(true);
  });

  it("lists all 5 uploaded angles", () => {
    const result = getPatientImages({});
    expect(result.uploadedAngles).toEqual([
      "front",
      "top",
      "left",
      "right",
      "back",
    ]);
  });

  it("has no missing angles", () => {
    expect(getPatientImages({}).missingAngles).toHaveLength(0);
  });

  it("each angle has a URL", () => {
    const angles = getPatientImages({}).angles;
    for (const key of ["front", "top", "left", "right", "back"] as const) {
      expect(angles[key].uploaded).toBe(true);
      expect(angles[key].urls).toHaveLength(1);
      expect(angles[key].urls[0]).toContain(key);
    }
  });
});

// ---------- getSavedClinics ----------

describe("getSavedClinics", () => {
  it("returns 2 saved clinics", () => {
    const result = getSavedClinics({});
    expect(result.count).toBe(2);
    expect(result.savedClinics).toHaveLength(2);
  });

  it("clinics are ranked 1 and 2", () => {
    const result = getSavedClinics({});
    expect(result.savedClinics[0].ranking).toBe(1);
    expect(result.savedClinics[1].ranking).toBe(2);
  });

  it("includes full clinic objects", () => {
    const result = getSavedClinics({});
    expect(result.savedClinics[0].clinic.name).toBe("Heva Clinic");
    expect(result.savedClinics[1].clinic.name).toBe("Dr. Hakan Clinic");
  });

  it("recommendation status is available", () => {
    expect(getSavedClinics({}).recommendationStatus).toBe("available");
  });
});

// ---------- issuePromoCode ----------

describe("issuePromoCode", () => {
  it("returns not_on_list status", () => {
    const result = issuePromoCode({});
    expect(result.status).toBe("not_on_list");
    expect(result.reason).toBe("patient_not_on_sent_out_list");
  });

  it("has null code and amount", () => {
    const result = issuePromoCode({});
    expect(result.code).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.paymentUrl).toBeNull();
  });
});

// ---------- updateUser ----------

describe("updateUser", () => {
  it("returns not updated (name already set)", () => {
    const result = updateUser({});
    expect(result.updated).toBe(false);
    expect(result.reason).toBe("name_already_set");
  });

  it("returns existing name", () => {
    const result = updateUser({
      firstName: "Other",
      lastName: "Name",
    });
    expect(result.firstName).toBe("Jordan");
    expect(result.lastName).toBe("Hale");
  });
});

// ---------- updateUserClinicPreferences ----------

describe("updateUserClinicPreferences", () => {
  it("succeeds with valid Heva clinic ID", () => {
    const result = updateUserClinicPreferences({
      clinicSelection: { selectedClinicId: HEVA_CLINIC_ID },
    });
    expect(result).not.toBeNull();
    expect(result!.updated).toBe(true);
    expect(result!.clinicSelection.selectedClinicId).toBe(HEVA_CLINIC_ID);
  });

  it("succeeds with valid package ID", () => {
    const result = updateUserClinicPreferences({
      clinicSelection: {
        selectedClinicId: HEVA_CLINIC_ID,
        selectedPackageId: SILVER_PACKAGE_ID,
      },
    });
    expect(result).not.toBeNull();
    expect(result!.clinicSelection.selectedPackageId).toBe(SILVER_PACKAGE_ID);
  });

  it("returns null for invalid clinic ID", () => {
    const result = updateUserClinicPreferences({
      clinicSelection: { selectedClinicId: "bad-id" },
    });
    expect(result).toBeNull();
  });

  it("returns null for invalid package ID", () => {
    const result = updateUserClinicPreferences({
      clinicSelection: { selectedPackageId: "bad-id" },
    });
    expect(result).toBeNull();
  });

  it("succeeds with no selections (nulls)", () => {
    const result = updateUserClinicPreferences({ clinicSelection: {} });
    expect(result).not.toBeNull();
    expect(result!.updated).toBe(true);
    expect(result!.clinicSelection.selectedClinicId).toBeNull();
  });

  it("returns tentative procedure dates", () => {
    const result = updateUserClinicPreferences({ clinicSelection: {} })!;
    expect(result.tentativeProcedureDates.text).toBe("within about 6 months");
  });
});

// ---------- updateWorkingMemory ----------

describe("updateWorkingMemory", () => {
  it("always returns success", () => {
    expect(updateWorkingMemory({}).success).toBe(true);
  });

  it("returns success regardless of input", () => {
    expect(
      updateWorkingMemory({ memory: { patientName: "Test" } }).success,
    ).toBe(true);
  });
});

// ---------- Tool Registry ----------

describe("toolRegistry", () => {
  const expectedTools = [
    "getAllClinics",
    "getClinicDoctors",
    "getClinicPackages",
    "getConsultationRescheduleLink",
    "getFullCalls",
    "getLatestAssessment",
    "getPatientContext",
    "getPatientImages",
    "getPaymentLink",
    "getSavedClinics",
    "issuePromoCode",
    "updateUser",
    "updateUserClinicPreferences",
    "updateWorkingMemory",
  ];

  it("contains all 14 tools", () => {
    expect(Object.keys(toolRegistry)).toHaveLength(14);
  });

  for (const name of expectedTools) {
    it(`has ${name} registered`, () => {
      expect(toolRegistry[name]).toBeDefined();
      expect(typeof toolRegistry[name].fn).toBe("function");
    });

    it(`${name} has a description under 100 chars`, () => {
      expect(toolRegistry[name].description.length).toBeLessThan(100);
    });
  }

  it("every tool declares a kind", () => {
    for (const def of Object.values(toolRegistry)) {
      expect(["immediate", "deferred"]).toContain(def.kind);
    }
  });

  it("getToolsByKind partitions the registry", () => {
    const immediate = getToolsByKind("immediate").map((t) => t.name);
    const deferred = getToolsByKind("deferred").map((t) => t.name);
    expect(immediate.length + deferred.length).toBe(Object.keys(toolRegistry).length);
    expect(immediate).toContain("getPaymentLink");
    expect(deferred).toContain("updateWorkingMemory");
  });

  it("callTool dispatches to the right function", () => {
    const result = callTool("getAllClinics", {}) as { clinics: unknown[] };
    expect(result.clinics).toHaveLength(2);
  });

  it("callTool passes arguments through", () => {
    const result = callTool("getClinicPackages", {
      clinicName: "Heva",
    }) as { packages: unknown[] };
    expect(result.packages).toHaveLength(2);
  });

  it("callTool throws for unknown tool", () => {
    expect(() => callTool("nonexistent", {})).toThrow("Unknown tool");
  });
});

// ---------- Constants sanity checks ----------

describe("constants", () => {
  // Import inline to test module loads
  it("HUMAN_MESSAGES has 5 entries", async () => {
    const { HUMAN_MESSAGES } = await import("../src/constants.js");
    expect(HUMAN_MESSAGES).toHaveLength(5);
  });

  it("HUMAN_MESSAGES IDs match expected set", async () => {
    const { HUMAN_MESSAGES } = await import("../src/constants.js");
    const ids = HUMAN_MESSAGES.map((m) => m.id);
    expect(ids).toEqual([
      "heva-packages",
      "hakan-price",
      "consultation",
      "demand-human",
      "charge-card",
    ]);
  });

  it("PIPELINE_STATUS is PRE_CLINICAL_SENT", async () => {
    const { PIPELINE_STATUS } = await import("../src/constants.js");
    expect(PIPELINE_STATUS).toBe("PRE_CLINICAL_SENT");
  });

  it("GRAFT_RANGE has correct min/max", async () => {
    const { GRAFT_RANGE } = await import("../src/constants.js");
    expect(GRAFT_RANGE.min).toBe(2500);
    expect(GRAFT_RANGE.max).toBe(3200);
  });

  it("USER_MESSAGE_TEMPLATE has expected placeholders", async () => {
    const { USER_MESSAGE_TEMPLATE } = await import("../src/constants.js");
    expect(USER_MESSAGE_TEMPLATE).toContain("{{HUMAN_MESSAGE}}");
    expect(USER_MESSAGE_TEMPLATE).toContain(
      "{{RECENT_CONVERSATION_SUMMARY}}",
    );
  });

  it("WORKING_MEMORY is valid JSON", async () => {
    const { WORKING_MEMORY } = await import("../src/constants.js");
    const parsed = JSON.parse(WORKING_MEMORY);
    expect(parsed.patientName).toBe("Jordan");
    expect(parsed.procedureArea).toBe("hairline");
    expect(parsed.communicationStyle).toBe("casual");
  });
});
