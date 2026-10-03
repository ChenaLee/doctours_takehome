import { describe, it, expect } from "vitest";
import { coreSkill } from "../src/skills/core.js";
import { pricingSkill } from "../src/skills/pricing.js";
import { clinicInfoSkill } from "../src/skills/clinic-info.js";
import { consultationSkill } from "../src/skills/consultation.js";
import { assessmentSkill } from "../src/skills/assessment.js";
import { paymentSkill } from "../src/skills/payment.js";
import { collectionSkill } from "../src/skills/collection.js";
import {
  skillRegistry,
  getSkillPrompt,
  getSkillDescriptions,
} from "../src/skills/registry.js";

const allSkills = {
  core: coreSkill,
  pricing: pricingSkill,
  "clinic-info": clinicInfoSkill,
  consultation: consultationSkill,
  assessment: assessmentSkill,
  payment: paymentSkill,
  collection: collectionSkill,
};

// ---------- Each skill exports a non-empty prompt ----------

describe("skill prompts are non-empty", () => {
  for (const [name, prompt] of Object.entries(allSkills)) {
    it(`${name} is a non-empty string`, () => {
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(50);
    });
  }
});

// ---------- Line count limits ----------

describe("skill line counts", () => {
  it("core is under 60 lines", () => {
    const lines = coreSkill.split("\n").length;
    expect(lines).toBeLessThan(60);
  });

  for (const [name, prompt] of Object.entries(allSkills)) {
    it(`${name} is under 250 lines`, () => {
      const lines = prompt.split("\n").length;
      expect(lines).toBeLessThan(250);
    });
  }
});

// ---------- Content boundaries: skills contain expected topics ----------

describe("pricing skill content", () => {
  it("contains basePrice", () => {
    expect(pricingSkill).toContain("basePrice");
  });

  it("contains currency", () => {
    expect(pricingSkill).toContain("currency");
  });

  it("contains FINANCING GEOGRAPHY", () => {
    expect(pricingSkill).toContain("FINANCING GEOGRAPHY");
  });

  it("contains HEALTH INSURANCE", () => {
    expect(pricingSkill).toContain("HEALTH INSURANCE");
  });

  it("does NOT contain image upload", () => {
    expect(pricingSkill.toLowerCase()).not.toContain("image upload");
  });

  it("does NOT contain consultation format", () => {
    expect(pricingSkill.toLowerCase()).not.toContain("phone call");
  });
});

describe("consultation skill content", () => {
  it("contains free phone call", () => {
    expect(consultationSkill.toLowerCase()).toContain("free phone call");
  });

  it("contains consultation URL", () => {
    expect(consultationSkill).toContain(
      "https://www.doctours.com/consultation",
    );
  });

  it("does NOT contain FINANCING GEOGRAPHY", () => {
    expect(consultationSkill).not.toContain("FINANCING GEOGRAPHY");
  });

  it("does NOT contain basePrice", () => {
    expect(consultationSkill).not.toContain("basePrice");
  });
});

describe("assessment skill content", () => {
  it("contains turnaround promises prohibition", () => {
    expect(assessmentSkill).toContain("TURNAROUND");
  });

  it("contains revision handling", () => {
    expect(assessmentSkill.toLowerCase()).toContain("revision");
  });

  it("does NOT contain deposit rules", () => {
    expect(assessmentSkill.toLowerCase()).not.toContain("refundable less");
  });
});

describe("payment skill content", () => {
  it("contains deposit rules", () => {
    expect(paymentSkill.toLowerCase()).toContain("deposit");
  });

  it("contains REVERSIBILITY", () => {
    expect(paymentSkill).toContain("REVERSIBILITY");
  });

  it("contains TIME-BOUND PAUSE", () => {
    expect(paymentSkill).toContain("TIME-BOUND PAUSE");
  });

  it("contains two-link logic", () => {
    expect(paymentSkill).toContain("PAYMENT link");
    expect(paymentSkill).toContain("CHECKOUT link");
  });

  it("does NOT contain image guidance", () => {
    expect(paymentSkill.toLowerCase()).not.toContain("front, top, back");
  });
});

describe("clinic-info skill content", () => {
  it("contains CLINIC STATUS TIERS", () => {
    expect(clinicInfoSkill).toContain("CLINIC STATUS TIERS");
  });

  it("contains CLINIC WEBSITE", () => {
    expect(clinicInfoSkill).toContain("CLINIC WEBSITE");
  });

  it("contains recommended/limited/do_not_recommend", () => {
    expect(clinicInfoSkill).toContain("recommended");
    expect(clinicInfoSkill).toContain("limited");
    expect(clinicInfoSkill).toContain("do_not_recommend");
  });

  it("does NOT contain deposit amount", () => {
    expect(clinicInfoSkill).not.toContain("$25");
  });
});

describe("collection skill content", () => {
  it("contains COLLECTION PERSISTENCE", () => {
    expect(collectionSkill).toContain("COLLECTION PERSISTENCE");
  });

  it("contains IMAGE GUIDANCE", () => {
    expect(collectionSkill).toContain("IMAGE GUIDANCE");
  });

  it("contains image-upload URL", () => {
    expect(collectionSkill).toContain(
      "https://www.doctours.com/image-upload",
    );
  });

  it("contains CONCERN REFLECTION", () => {
    expect(collectionSkill).toContain("CONCERN REFLECTION");
  });

  it("does NOT contain Klarna", () => {
    expect(collectionSkill).not.toContain("Klarna");
  });
});

describe("core skill content", () => {
  it("contains IDENTITY", () => {
    expect(coreSkill).toContain("IDENTITY");
  });

  it("contains VOICE", () => {
    expect(coreSkill).toContain("VOICE");
  });

  it("contains plain text / no markdown rule", () => {
    expect(coreSkill.toLowerCase()).toContain("no markdown");
  });

  it("contains link placement", () => {
    expect(coreSkill).toContain("LINK PLACEMENT");
  });

  it("does NOT contain package pricing details", () => {
    expect(coreSkill).not.toContain("basePrice");
    expect(coreSkill).not.toContain("listPrice");
  });
});

// ---------- No cross-skill rule duplication ----------

describe("no cross-skill duplication", () => {
  it("FINANCING GEOGRAPHY rule body only in pricing", () => {
    const others = Object.entries(allSkills).filter(
      ([name]) => name !== "pricing",
    );
    for (const [name, prompt] of others) {
      expect(
        prompt,
        `${name} should not define the Klarna/PayPal yes/no/unknown rule`,
      ).not.toContain("yes (US or Canada)");
    }
  });

  it("COLLECTION PERSISTENCE only in collection", () => {
    const others = Object.entries(allSkills).filter(
      ([name]) => name !== "collection",
    );
    for (const [name, prompt] of others) {
      expect(
        prompt,
        `${name} should not have COLLECTION PERSISTENCE`,
      ).not.toContain("COLLECTION PERSISTENCE");
    }
  });

  it("CLINIC STATUS TIERS only in clinic-info", () => {
    const others = Object.entries(allSkills).filter(
      ([name]) => name !== "clinic-info",
    );
    for (const [name, prompt] of others) {
      expect(
        prompt,
        `${name} should not have CLINIC STATUS TIERS`,
      ).not.toContain("CLINIC STATUS TIERS");
    }
  });
});

// ---------- Registry ----------

describe("skillRegistry", () => {
  it("contains all 7 skills", () => {
    expect(Object.keys(skillRegistry)).toHaveLength(7);
  });

  const expectedSkills = [
    "core",
    "pricing",
    "clinic-info",
    "consultation",
    "assessment",
    "payment",
    "collection",
  ];

  for (const name of expectedSkills) {
    it(`has ${name} registered`, () => {
      expect(skillRegistry[name]).toBeDefined();
      expect(typeof skillRegistry[name].prompt).toBe("string");
      expect(skillRegistry[name].prompt.length).toBeGreaterThan(0);
    });

    it(`${name} has a description under 100 chars`, () => {
      expect(skillRegistry[name].description.length).toBeLessThan(100);
    });
  }
});

describe("getSkillPrompt", () => {
  it("returns prompt for existing skill", () => {
    const prompt = getSkillPrompt("pricing");
    expect(prompt).toBe(pricingSkill);
  });

  it("returns null for unknown skill", () => {
    expect(getSkillPrompt("nonexistent")).toBeNull();
  });
});

describe("getSkillDescriptions", () => {
  it("returns all 7 skills with name and description", () => {
    const descriptions = getSkillDescriptions();
    expect(descriptions).toHaveLength(7);
    for (const desc of descriptions) {
      expect(desc.name.length).toBeGreaterThan(0);
      expect(desc.description.length).toBeGreaterThan(0);
    }
  });

  it("includes pricing skill", () => {
    const descriptions = getSkillDescriptions();
    const pricing = descriptions.find((d) => d.name === "pricing");
    expect(pricing).toBeDefined();
    expect(pricing!.description).toContain("Package facts");
  });
});
