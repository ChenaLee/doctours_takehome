import { describe, it, expect } from "vitest";
import { buildResponderPrompt } from "../src/agent/prompts/responder.js";
import { createAgentState, addToolResult } from "../src/agent/state.js";
import { coreSkill } from "../src/skills/core.js";
import { pricingSkill } from "../src/skills/pricing.js";
import { consultationSkill } from "../src/skills/consultation.js";

const DUMMY_CONTEXT = { name: "Jordan Hale", tier: "pre_deposit" };
const DUMMY_HISTORY = "";

describe("buildResponderPrompt", () => {
  it("always includes core skill", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, []);
    expect(prompt).toContain("IDENTITY");
    expect(prompt).toContain("VOICE");
  });

  it("includes requested skills", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, ["pricing"]);
    expect(prompt).toContain("FINANCING GEOGRAPHY");
    expect(prompt).toContain("basePrice");
  });

  it("includes multiple requested skills", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, ["pricing", "consultation"]);
    expect(prompt).toContain("FINANCING GEOGRAPHY");
    expect(prompt).toContain("# CONSULTATION RESCHEDULING");
  });

  it("does not include unrequested skills", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, ["consultation"]);
    expect(prompt).not.toContain("# FINANCING GEOGRAPHY");
    expect(prompt).not.toContain("# COLLECTION PERSISTENCE");
  });

  it("ignores unknown skill names", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, ["nonexistent"]);
    expect(prompt).toContain("IDENTITY");
    expect(prompt).not.toContain("# FINANCING GEOGRAPHY");
  });

  it("includes tool results when present", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addToolResult(state, "getClinicPackages", {
      clinicName: "Heva Clinic",
      packages: [{ name: "Silver", basePrice: 3000 }],
    });
    const prompt = buildResponderPrompt(state, ["pricing"]);
    expect(prompt).toContain("TOOL RESULTS");
    expect(prompt).toContain("getClinicPackages");
    expect(prompt).toContain("Silver");
    expect(prompt).toContain("3000");
  });

  it("omits tool results section when none gathered", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, []);
    expect(prompt).not.toContain("TOOL RESULTS");
  });

  it("includes patient context", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, []);
    expect(prompt).toContain("Jordan Hale");
    expect(prompt).toContain("PRE_CLINICAL_SENT");
    expect(prompt).toContain("Afro Hair");
    expect(prompt).toContain("Alex");
  });

  it("includes collection status", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, []);
    expect(prompt).toContain("Collection Status");
    expect(prompt).toContain("Everything is collected");
  });

  it("includes working memory", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, []);
    expect(prompt).toContain("<working_memory_data>");
    expect(prompt).toContain('"communicationStyle":"casual"');
  });

  it("includes output format instructions", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, []);
    expect(prompt).toContain("OUTPUT FORMAT");
    expect(prompt).toContain('"reply"');
    expect(prompt).toContain('"response"');
    expect(prompt).toContain('"escalate"');
    expect(prompt).toContain('"intent"');
    expect(prompt).toContain("templateId is always null");
  });

  it("includes coordinator name", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildResponderPrompt(state, []);
    expect(prompt).toContain("responding in a chat thread as Alex");
    expect(prompt).toContain("I'm Alex, your Patient Care Coordinator at Doctours.");
  });

  it("fills every known placeholder and keeps instruction placeholders", () => {
    const prompt = buildResponderPrompt(createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY), []);
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(prompt).toContain("{{clinic.slug}}");
  });

  it("includes the core prompt once even when core is requested", () => {
    const prompt = buildResponderPrompt(
      createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY),
      ["core", "pricing", "pricing"],
    );
    expect(prompt.split("# IDENTITY").length - 1).toBe(1);
    expect(prompt.split("# FINANCING GEOGRAPHY").length - 1).toBe(1);
  });
});
