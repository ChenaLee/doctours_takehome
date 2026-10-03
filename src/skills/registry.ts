import { coreSkill } from "./core.js";
import { pricingSkill } from "./pricing.js";
import { clinicInfoSkill } from "./clinic-info.js";
import { consultationSkill } from "./consultation.js";
import { assessmentSkill } from "./assessment.js";
import { paymentSkill } from "./payment.js";
import { collectionSkill } from "./collection.js";

export interface SkillDefinition {
  prompt: string;
  description: string;
}

export const skillRegistry: Record<string, SkillDefinition> = {
  core: {
    prompt: coreSkill,
    description: "Identity, voice, response format, conversation awareness",
  },
  pricing: {
    prompt: pricingSkill,
    description: "Package facts, financing geography, health insurance, what matters vs nice to have",
  },
  "clinic-info": {
    prompt: clinicInfoSkill,
    description: "Clinic status tiers, clinic website rules, clinic selection guidance",
  },
  consultation: {
    prompt: consultationSkill,
    description: "Consultation format, scheduling, rescheduling, booking confirmation",
  },
  assessment: {
    prompt: assessmentSkill,
    description: "Assessment context, no turnaround promises, revisions",
  },
  payment: {
    prompt: paymentSkill,
    description: "Deposit rules, payment links, reversibility, time-bound pause",
  },
  collection: {
    prompt: collectionSkill,
    description: "Info collection, image guidance, concern reflection",
  },
};

export function getSkillPrompt(name: string): string | null {
  return skillRegistry[name]?.prompt ?? null;
}

export function getSkillDescriptions(): Array<{ name: string; description: string }> {
  return Object.entries(skillRegistry).map(([name, def]) => ({
    name,
    description: def.description,
  }));
}
