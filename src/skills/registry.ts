import { coreSkill } from "./core.js";
import { pricingSkill } from "./pricing.js";
import { clinicInfoSkill } from "./clinic-info.js";
import { consultationSkill } from "./consultation.js";
import { assessmentSkill } from "./assessment.js";
import { paymentSkill } from "./payment.js";
import { collectionSkill } from "./collection.js";
import { toolRegistry } from "../tools/registry.js";

export interface SkillDefinition {
  prompt: string;
  description: string;
}

export const skillRegistry: Record<string, SkillDefinition> = {
  core: {
    prompt: coreSkill,
    description: "Base system prompt: identity, voice, constraints, stages, tool usage (always loaded)",
  },
  pricing: {
    prompt: pricingSkill,
    description: "Package facts, financing geography, insurance, CareCredit, what matters vs nice to have",
  },
  "clinic-info": {
    prompt: clinicInfoSkill,
    description: "Clinic status tiers, clinic website, creator partnerships, travel readiness",
  },
  consultation: {
    prompt: consultationSkill,
    description: "Consultation format, rescheduling, booking confirmation, phone contact",
  },
  assessment: {
    prompt: assessmentSkill,
    description: "Assessment contents, revisions, no turnaround promises",
  },
  payment: {
    prompt: paymentSkill,
    description: "Deposits, payment vs checkout links, deposit eligibility, reversibility, time-bound pause",
  },
  collection: {
    prompt: collectionSkill,
    description: "Area/name/photo collection, image guidance and delays, concern reflection",
  },
};

export function getSkillPrompt(name: string): string | null {
  return skillRegistry[name]?.prompt ?? null;
}

/** Registered tools a skill's rules reference (e.g. "getPaymentLinkTool"), derived from its prompt text. */
export function getSkillTools(name: string): string[] {
  const prompt = getSkillPrompt(name);
  if (!prompt) return [];
  return Object.keys(toolRegistry).filter((tool) =>
    new RegExp(`\\b${tool}(Tool)?\\b`).test(prompt),
  );
}

export function getSkillDescriptions(): Array<{ name: string; description: string; tools: string[] }> {
  return Object.entries(skillRegistry).map(([name, def]) => ({
    name,
    description: def.description,
    tools: getSkillTools(name),
  }));
}
