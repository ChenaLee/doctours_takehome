import { describe, it, expect } from "vitest";
import {
  buildStepPrompt,
  parseStepResponse,
} from "../src/agent/prompts/step.js";
import { toolRegistry, getToolsByKind } from "../src/tools/registry.js";
import { skillRegistry } from "../src/skills/registry.js";
import {
  createAgentState,
  addGoal,
  addToolResult,
  addAction,
} from "../src/agent/state.js";

const DUMMY_CONTEXT = { name: "Jordan Hale", tier: "pre_deposit" };
const DUMMY_HISTORY = "[Sep 26] Alex: Did any clinic catch your eye?";

// ---------- buildStepPrompt ----------

describe("buildStepPrompt", () => {
  it("contains planning agent identity", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 1);
    expect(prompt).toContain("planning agent");
  });

  it("contains patient context", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 1);
    expect(prompt).toContain("Jordan Hale");
    expect(prompt).toContain("pre_deposit");
  });

  it("contains the patient message", () => {
    const state = createAgentState(
      "What packages does Heva have?",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
    );
    const prompt = buildStepPrompt(state, 1);
    expect(prompt).toContain("What packages does Heva have?");
  });

  it("contains conversation history", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 1);
    expect(prompt).toContain("Did any clinic catch your eye?");
  });

  it("shows no goals on iteration 1", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 1);
    expect(prompt).toContain("None yet");
    expect(prompt).toContain("iteration 1");
  });

  it("shows goals when present", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "Get Heva packages",
      resolved: false,
      requiredSkill: "pricing",
    });
    addGoal(state, {
      id: "g2",
      description: "Confirm afro hair specialty",
      resolved: true,
      requiredSkill: null,
    });
    const prompt = buildStepPrompt(state, 2);
    expect(prompt).toContain("[UNRESOLVED] g1: Get Heva packages");
    expect(prompt).toContain("[RESOLVED] g2: Confirm afro hair specialty");
    expect(prompt).toContain("(skill: pricing)");
  });

  it("includes tool results when present", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addToolResult(state, "getClinicPackages", {
      packages: [{ name: "Silver" }],
    });
    const prompt = buildStepPrompt(state, 2);
    expect(prompt).toContain("DATA GATHERED SO FAR");
    expect(prompt).toContain("getClinicPackages");
    expect(prompt).toContain("Silver");
  });

  it("includes action history when present", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addAction(
      state,
      1,
      "Need package data",
      { type: "call_tool", tool: "getClinicPackages", args: {} },
      {},
    );
    const prompt = buildStepPrompt(state, 2);
    expect(prompt).toContain("ACTIONS TAKEN");
    expect(prompt).toContain("Iteration 1");
    expect(prompt).toContain("call_tool");
    expect(prompt).toContain("Need package data");
  });

  it("lists all available tools", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 1);
    expect(prompt).toContain("AVAILABLE TOOLS");
    expect(prompt).toContain("getAllClinics");
    expect(prompt).toContain("getClinicPackages");
    expect(prompt).toContain("getPaymentLink");
  });

  it("lists all available skills", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 1);
    expect(prompt).toContain("AVAILABLE SKILLS");
    expect(prompt).toContain("pricing");
    expect(prompt).toContain("consultation");
    expect(prompt).toContain("assessment");
  });

  it("splits tools into available and deferred sections from the registry", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 1);
    const deferredIdx = prompt.indexOf("# DEFERRED TOOLS");
    const skillsIdx = prompt.indexOf("# AVAILABLE SKILLS");
    const deferredSection = prompt.slice(deferredIdx, skillsIdx);
    for (const { name } of getToolsByKind("deferred")) {
      expect(deferredSection).toContain(`- ${name}:`);
    }
    for (const { name } of getToolsByKind("immediate")) {
      expect(deferredSection).not.toContain(`- ${name}:`);
    }
  });

  it("picks up newly registered tools and skills without prompt changes", () => {
    toolRegistry.chargeCard = {
      fn: () => ({ charged: true }),
      description: "Charges the patient's card on file",
      kind: "immediate",
    };
    skillRegistry.visas = { prompt: "visa rules", description: "Travel visa requirements" };
    try {
      const prompt = buildStepPrompt(createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY), 1);
      expect(prompt).toContain("- chargeCard: Charges the patient's card on file");
      expect(prompt).toContain("- visas: Travel visa requirements");
    } finally {
      delete toolRegistry.chargeCard;
      delete skillRegistry.visas;
    }
  });

  it("injects rules for skills required by goals", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(buildStepPrompt(state, 1)).not.toContain("# SKILL RULES");
    addGoal(state, { id: "g1", description: "pay", resolved: false, requiredSkill: "payment" });
    const prompt = buildStepPrompt(state, 2);
    expect(prompt).toContain("# SKILL RULES");
    expect(prompt).toContain("## skill: payment");
    expect(prompt).toContain("CHECKOUT link");
  });

  it("annotates skills with the tools they rely on", () => {
    const prompt = buildStepPrompt(createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY), 1);
    expect(prompt).toMatch(/- assessment: .*\(relies on: [^)]*getLatestAssessment/);
  });

  it("capability boundary does not hard-code specific forbidden actions", () => {
    const prompt = buildStepPrompt(createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY), 1);
    const boundary = prompt.slice(
      prompt.indexOf("# CRITICAL — CAPABILITY BOUNDARY"),
      prompt.indexOf("# TASK"),
    );
    expect(boundary).toContain("COMPLETE set of capabilities");
    expect(boundary).not.toMatch(/charg(e|ing) (a )?card|move money|moving money/i);
  });

  it("includes response format instructions", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 1);
    expect(prompt).toContain("call_tool");
    expect(prompt).toContain("escalate");
    expect(prompt).toContain("clarify");
    expect(prompt).toContain("respond");
    expect(prompt).toContain('"reasoning"');
    expect(prompt).toContain('"goalsUpdate"');
  });

  it("includes current iteration number", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const prompt = buildStepPrompt(state, 3);
    expect(prompt).toContain("Current iteration: 3");
  });
});

// ---------- parseStepResponse ----------

describe("parseStepResponse", () => {
  it("parses a valid call_tool response", () => {
    const raw = JSON.stringify({
      reasoning: "Need Heva package data",
      goalsUpdate: [
        {
          id: "g1",
          description: "Get packages",
          resolved: false,
          requiredSkill: "pricing",
        },
      ],
      action: {
        type: "call_tool",
        tool: "getClinicPackages",
        args: { clinicName: "Heva" },
      },
      writeActions: [],
    });
    const decision = parseStepResponse(raw);
    expect(decision.reasoning).toBe("Need Heva package data");
    expect(decision.goalsUpdate).toHaveLength(1);
    expect(decision.goalsUpdate[0].id).toBe("g1");
    expect(decision.action.type).toBe("call_tool");
    if (decision.action.type === "call_tool") {
      expect(decision.action.tool).toBe("getClinicPackages");
      expect(decision.action.args).toEqual({ clinicName: "Heva" });
    }
  });

  it("parses an escalate response", () => {
    const raw = JSON.stringify({
      reasoning: "Patient wants a human",
      goalsUpdate: [
        {
          id: "g1",
          description: "Transfer to human",
          resolved: true,
          requiredSkill: null,
        },
      ],
      action: {
        type: "escalate",
        reason: "Asked to talk to a human",
        category: "human_request",
      },
      writeActions: [],
    });
    const decision = parseStepResponse(raw);
    expect(decision.action.type).toBe("escalate");
    if (decision.action.type === "escalate") {
      expect(decision.action.reason).toBe("Asked to talk to a human");
      expect(decision.action.category).toBe("human_request");
    }
  });

  it("parses a cant_handle escalation", () => {
    const raw = JSON.stringify({
      reasoning: "Cannot charge cards",
      goalsUpdate: [],
      action: {
        type: "escalate",
        reason: "Asked to charge a card number",
        category: "cant_handle",
      },
      writeActions: [],
    });
    const decision = parseStepResponse(raw);
    if (decision.action.type === "escalate") {
      expect(decision.action.category).toBe("cant_handle");
    }
  });

  it("parses a respond action with skills", () => {
    const raw = JSON.stringify({
      reasoning: "All goals resolved",
      goalsUpdate: [
        { id: "g1", description: "A", resolved: true, requiredSkill: null },
      ],
      action: { type: "respond", skills: ["pricing", "clinic-info"] },
      writeActions: [
        {
          tool: "updateWorkingMemory",
          args: { memory: { patientName: "Jordan" } },
        },
      ],
    });
    const decision = parseStepResponse(raw);
    expect(decision.action.type).toBe("respond");
    if (decision.action.type === "respond") {
      expect(decision.action.skills).toEqual(["pricing", "clinic-info"]);
    }
    expect(decision.writeActions).toHaveLength(1);
    expect(decision.writeActions[0].tool).toBe("updateWorkingMemory");
  });

  it("parses a clarify action", () => {
    const raw = JSON.stringify({
      reasoning: "Need to know which clinic",
      goalsUpdate: [],
      action: {
        type: "clarify",
        question: "Which clinic are you interested in?",
        missingInfo: "clinic selection",
      },
      writeActions: [],
    });
    const decision = parseStepResponse(raw);
    expect(decision.action.type).toBe("clarify");
    if (decision.action.type === "clarify") {
      expect(decision.action.question).toBe(
        "Which clinic are you interested in?",
      );
      expect(decision.action.missingInfo).toBe("clinic selection");
    }
  });

  it("parses a load_skill action", () => {
    const raw = JSON.stringify({
      reasoning: "Need pricing knowledge",
      goalsUpdate: [],
      action: { type: "load_skill", skill: "pricing" },
      writeActions: [],
    });
    const decision = parseStepResponse(raw);
    expect(decision.action.type).toBe("load_skill");
    if (decision.action.type === "load_skill") {
      expect(decision.action.skill).toBe("pricing");
    }
  });

  it("extracts JSON from markdown fences", () => {
    const raw = `Here's my decision:
\`\`\`json
{
  "reasoning": "test",
  "goalsUpdate": [],
  "action": {"type": "respond", "skills": []},
  "writeActions": []
}
\`\`\``;
    const decision = parseStepResponse(raw);
    expect(decision.reasoning).toBe("test");
    expect(decision.action.type).toBe("respond");
  });

  it("extracts JSON from text with surrounding prose", () => {
    const raw = `I'll respond now. {"reasoning": "done", "goalsUpdate": [], "action": {"type": "respond", "skills": ["pricing"]}, "writeActions": []} That's my decision.`;
    const decision = parseStepResponse(raw);
    expect(decision.reasoning).toBe("done");
  });

  it("throws on missing reasoning", () => {
    const raw = JSON.stringify({
      goalsUpdate: [],
      action: { type: "respond", skills: [] },
    });
    expect(() => parseStepResponse(raw)).toThrow("reasoning");
  });

  it("throws on missing action", () => {
    const raw = JSON.stringify({
      reasoning: "test",
      goalsUpdate: [],
    });
    expect(() => parseStepResponse(raw)).toThrow("action");
  });

  it("throws on unknown action type", () => {
    const raw = JSON.stringify({
      reasoning: "test",
      goalsUpdate: [],
      action: { type: "unknown_action" },
      writeActions: [],
    });
    expect(() => parseStepResponse(raw)).toThrow("Unknown action type");
  });

  it("parses cantDo on a cant_handle escalation", () => {
    const decision = parseStepResponse(JSON.stringify({
      reasoning: "no tool sends email",
      action: { type: "escalate", reason: "r", category: "cant_handle", cantDo: "send an email" },
    }));
    if (decision.action.type === "escalate") {
      expect(decision.action.cantDo).toBe("send an email");
    }
  });

  it("defaults escalate category to human_request", () => {
    const raw = JSON.stringify({
      reasoning: "escalating",
      goalsUpdate: [],
      action: { type: "escalate", reason: "patient wants human" },
      writeActions: [],
    });
    const decision = parseStepResponse(raw);
    if (decision.action.type === "escalate") {
      expect(decision.action.category).toBe("human_request");
    }
  });

  it("handles missing goalsUpdate gracefully", () => {
    const raw = JSON.stringify({
      reasoning: "test",
      action: { type: "respond", skills: [] },
    });
    const decision = parseStepResponse(raw);
    expect(decision.goalsUpdate).toEqual([]);
  });

  it("handles missing writeActions gracefully", () => {
    const raw = JSON.stringify({
      reasoning: "test",
      goalsUpdate: [],
      action: { type: "respond", skills: [] },
    });
    const decision = parseStepResponse(raw);
    expect(decision.writeActions).toEqual([]);
  });
});
