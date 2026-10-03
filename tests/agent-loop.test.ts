import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../src/agent/loop.js";
import type { LlmCaller } from "../src/engine/claude.js";
import { MAX_ITERATIONS } from "../src/agent/safety.js";

const DUMMY_CONTEXT = { name: "Jordan Hale", tier: "pre_deposit" };
const DUMMY_HISTORY = "[Sep 26] Alex: Did any clinic catch your eye?";

function mockLlm(responses: string[]): LlmCaller {
  let call = 0;
  return async () => {
    if (call >= responses.length) {
      throw new Error(`Mock LLM called ${call + 1} times but only ${responses.length} responses provided`);
    }
    return responses[call++];
  };
}

describe("runAgentLoop", () => {
  it("escalate on first iteration terminates immediately", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Patient demands a human",
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
      }),
    ]);

    const state = await runAgentLoop(
      "I demand to talk to a human",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
      llm,
    );

    expect(state.actionsHistory).toHaveLength(1);
    expect(state.actionsHistory[0].action.type).toBe("escalate");
    expect(state.endGoals).toHaveLength(1);
    expect(state.endGoals[0].resolved).toBe(true);
  });

  it("call_tool then respond takes two iterations", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Need Heva package data",
        goalsUpdate: [
          {
            id: "g1",
            description: "Get Heva packages",
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
      }),
      JSON.stringify({
        reasoning: "Have all data needed",
        goalsUpdate: [
          {
            id: "g1",
            description: "Get Heva packages",
            resolved: true,
            requiredSkill: "pricing",
          },
        ],
        action: { type: "respond", skills: ["pricing"] },
        writeActions: [
          {
            tool: "updateWorkingMemory",
            args: { memory: { keyConcerns: "packages" } },
          },
        ],
      }),
    ]);

    const state = await runAgentLoop(
      "What packages does Heva have?",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
      llm,
    );

    expect(state.actionsHistory).toHaveLength(2);
    expect(state.actionsHistory[0].action.type).toBe("call_tool");
    expect(state.actionsHistory[1].action.type).toBe("respond");

    expect(state.toolResults["getClinicPackages"]).toBeDefined();
    const pkgResult = state.toolResults["getClinicPackages"] as {
      packages: Array<{ name: string }>;
    };
    expect(pkgResult.packages).toHaveLength(2);

    expect(state.endGoals[0].resolved).toBe(true);
    expect(state.writeActions).toHaveLength(1);
    expect(state.writeActions[0].tool).toBe("updateWorkingMemory");
  });

  it("stores tool result in state after call_tool", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Get all clinics",
        goalsUpdate: [
          {
            id: "g1",
            description: "List clinics",
            resolved: false,
            requiredSkill: null,
          },
        ],
        action: { type: "call_tool", tool: "getAllClinics", args: {} },
        writeActions: [],
      }),
      JSON.stringify({
        reasoning: "Done",
        goalsUpdate: [
          {
            id: "g1",
            description: "List clinics",
            resolved: true,
            requiredSkill: null,
          },
        ],
        action: { type: "respond", skills: ["clinic-info"] },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop("List clinics", DUMMY_CONTEXT, DUMMY_HISTORY, llm);

    const clinics = state.toolResults["getAllClinics"] as {
      clinics: unknown[];
    };
    expect(clinics.clinics).toHaveLength(2);
  });

  it("clarify exits the loop", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Ambiguous clinic reference",
        goalsUpdate: [
          {
            id: "g1",
            description: "Get pricing",
            resolved: false,
            requiredSkill: "pricing",
          },
        ],
        action: {
          type: "clarify",
          question: "Which clinic are you asking about?",
          missingInfo: "clinic name",
        },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop(
      "How much is it?",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
      llm,
    );

    expect(state.actionsHistory).toHaveLength(1);
    expect(state.actionsHistory[0].action.type).toBe("clarify");
  });

  it("load_skill adds to loadedSkills", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Need pricing knowledge",
        goalsUpdate: [
          {
            id: "g1",
            description: "Answer pricing",
            resolved: false,
            requiredSkill: "pricing",
          },
        ],
        action: { type: "load_skill", skill: "pricing" },
        writeActions: [],
      }),
      JSON.stringify({
        reasoning: "All good",
        goalsUpdate: [
          {
            id: "g1",
            description: "Answer pricing",
            resolved: true,
            requiredSkill: "pricing",
          },
        ],
        action: { type: "respond", skills: ["pricing"] },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop("Price?", DUMMY_CONTEXT, DUMMY_HISTORY, llm);
    expect(state.loadedSkills).toContain("pricing");
  });

  it("does not duplicate loadedSkills", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Load pricing",
        goalsUpdate: [
          { id: "g1", description: "A", resolved: false, requiredSkill: null },
        ],
        action: { type: "load_skill", skill: "pricing" },
        writeActions: [],
      }),
      JSON.stringify({
        reasoning: "Load pricing again",
        goalsUpdate: [],
        action: { type: "load_skill", skill: "pricing" },
        writeActions: [],
      }),
      JSON.stringify({
        reasoning: "Done",
        goalsUpdate: [
          { id: "g1", description: "A", resolved: true, requiredSkill: null },
        ],
        action: { type: "respond", skills: ["pricing"] },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop("Price?", DUMMY_CONTEXT, DUMMY_HISTORY, llm);
    expect(state.loadedSkills.filter((s) => s === "pricing")).toHaveLength(1);
  });

  it("multiple tool calls across iterations", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Need packages and clinic ID",
        goalsUpdate: [
          {
            id: "g1",
            description: "Get packages",
            resolved: false,
            requiredSkill: "pricing",
          },
          {
            id: "g2",
            description: "Save clinic preference",
            resolved: false,
            requiredSkill: null,
          },
        ],
        action: {
          type: "call_tool",
          tool: "getClinicPackages",
          args: { clinicName: "Heva" },
        },
        writeActions: [],
      }),
      JSON.stringify({
        reasoning: "Now get clinic ID",
        goalsUpdate: [
          {
            id: "g1",
            description: "Get packages",
            resolved: true,
            requiredSkill: "pricing",
          },
        ],
        action: { type: "call_tool", tool: "getAllClinics", args: {} },
        writeActions: [],
      }),
      JSON.stringify({
        reasoning: "All resolved",
        goalsUpdate: [
          {
            id: "g2",
            description: "Save clinic preference",
            resolved: true,
            requiredSkill: null,
          },
        ],
        action: { type: "respond", skills: ["pricing"] },
        writeActions: [
          {
            tool: "updateUserClinicPreferences",
            args: { clinicSelection: { selectedClinicId: "some-id" } },
          },
        ],
      }),
    ]);

    const state = await runAgentLoop(
      "I'm leaning toward Heva. What packages do they have?",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
      llm,
    );

    expect(state.actionsHistory).toHaveLength(3);
    expect(state.toolResults["getClinicPackages"]).toBeDefined();
    expect(state.toolResults["getAllClinics"]).toBeDefined();
    expect(state.endGoals.every((g) => g.resolved)).toBe(true);
    expect(state.writeActions).toHaveLength(1);
  });

  it("adds fallback respond action at max iterations", async () => {
    const toolCallResponse = JSON.stringify({
      reasoning: "Still gathering",
      goalsUpdate: [
        {
          id: "g1",
          description: "Infinite goal",
          resolved: false,
          requiredSkill: "pricing",
        },
      ],
      action: { type: "call_tool", tool: "getAllClinics", args: {} },
      writeActions: [],
    });

    const responses = Array(MAX_ITERATIONS).fill(toolCallResponse);
    const llm = mockLlm(responses);

    const state = await runAgentLoop("test", DUMMY_CONTEXT, DUMMY_HISTORY, llm);

    const lastAction = state.actionsHistory.at(-1)!;
    expect(lastAction.action.type).toBe("respond");
    expect(lastAction.reasoning).toContain("Max iterations");
  });

  it("sets goals from first iteration goalsUpdate", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Decomposing",
        goalsUpdate: [
          {
            id: "g1",
            description: "Answer about packages",
            resolved: false,
            requiredSkill: "pricing",
          },
          {
            id: "g2",
            description: "Confirm afro hair",
            resolved: true,
            requiredSkill: "clinic-info",
          },
        ],
        action: {
          type: "call_tool",
          tool: "getClinicPackages",
          args: { clinicName: "Heva" },
        },
        writeActions: [],
      }),
      JSON.stringify({
        reasoning: "Done",
        goalsUpdate: [
          {
            id: "g1",
            description: "Answer about packages",
            resolved: true,
            requiredSkill: "pricing",
          },
        ],
        action: { type: "respond", skills: ["pricing", "clinic-info"] },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop(
      "What packages does Heva have? Do they do afro hair?",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
      llm,
    );

    expect(state.endGoals).toHaveLength(2);
    expect(state.endGoals[0].id).toBe("g1");
    expect(state.endGoals[0].resolved).toBe(true);
    expect(state.endGoals[1].id).toBe("g2");
    expect(state.endGoals[1].resolved).toBe(true);
  });

  it("adds new goals discovered mid-loop", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Start",
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
      }),
      JSON.stringify({
        reasoning: "Found we also need clinic ID to save preference",
        goalsUpdate: [
          {
            id: "g1",
            description: "Get packages",
            resolved: true,
            requiredSkill: "pricing",
          },
          {
            id: "g2",
            description: "Save preference",
            resolved: false,
            requiredSkill: null,
          },
        ],
        action: { type: "call_tool", tool: "getAllClinics", args: {} },
        writeActions: [],
      }),
      JSON.stringify({
        reasoning: "All done",
        goalsUpdate: [
          {
            id: "g2",
            description: "Save preference",
            resolved: true,
            requiredSkill: null,
          },
        ],
        action: { type: "respond", skills: ["pricing"] },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop(
      "I want Heva packages",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
      llm,
    );

    expect(state.endGoals).toHaveLength(2);
    expect(state.endGoals[1].id).toBe("g2");
    expect(state.endGoals[1].resolved).toBe(true);
  });

  it("accumulates write actions across iterations", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Start",
        goalsUpdate: [
          { id: "g1", description: "A", resolved: false, requiredSkill: null },
        ],
        action: { type: "call_tool", tool: "getAllClinics", args: {} },
        writeActions: [
          { tool: "updateWorkingMemory", args: { memory: { a: 1 } } },
        ],
      }),
      JSON.stringify({
        reasoning: "Done",
        goalsUpdate: [
          { id: "g1", description: "A", resolved: true, requiredSkill: null },
        ],
        action: { type: "respond", skills: [] },
        writeActions: [
          {
            tool: "updateUserClinicPreferences",
            args: { clinicSelection: {} },
          },
        ],
      }),
    ]);

    const state = await runAgentLoop("test", DUMMY_CONTEXT, DUMMY_HISTORY, llm);
    expect(state.writeActions).toHaveLength(2);
    expect(state.writeActions[0].tool).toBe("updateWorkingMemory");
    expect(state.writeActions[1].tool).toBe("updateUserClinicPreferences");
  });

  it("respond with no prior tool calls works", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Can answer from context",
        goalsUpdate: [
          {
            id: "g1",
            description: "Answer consultation question",
            resolved: true,
            requiredSkill: "consultation",
          },
        ],
        action: { type: "respond", skills: ["consultation"] },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop(
      "Is the consultation free?",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
      llm,
    );

    expect(state.actionsHistory).toHaveLength(1);
    expect(state.actionsHistory[0].action.type).toBe("respond");
    expect(Object.keys(state.toolResults)).toHaveLength(0);
  });

  it("cant_handle escalation preserves category", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Cannot charge cards",
        goalsUpdate: [
          {
            id: "g1",
            description: "Charge card",
            resolved: true,
            requiredSkill: null,
          },
        ],
        action: {
          type: "escalate",
          reason: "Asked to charge a card number",
          category: "cant_handle",
        },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop(
      "Charge my card ending in 4242",
      DUMMY_CONTEXT,
      DUMMY_HISTORY,
      llm,
    );

    const action = state.actionsHistory[0].action;
    expect(action.type).toBe("escalate");
    if (action.type === "escalate") {
      expect(action.category).toBe("cant_handle");
      expect(action.reason).toBe("Asked to charge a card number");
    }
  });
});

describe("runAgentLoop tool kind enforcement", () => {
  it("refuses call_tool on a deferred tool and drops non-deferred writeActions", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Try a deferred tool immediately",
        goalsUpdate: [{ id: "g1", description: "x", resolved: false, requiredSkill: null }],
        action: { type: "call_tool", tool: "updateWorkingMemory", args: { memory: { a: 1 } } },
        writeActions: [{ tool: "getPaymentLink", args: {} }],
      }),
      JSON.stringify({
        reasoning: "done",
        goalsUpdate: [{ id: "g1", description: "x", resolved: true, requiredSkill: null }],
        action: { type: "respond", skills: [] },
        writeActions: [],
      }),
    ]);

    const state = await runAgentLoop("hi", DUMMY_CONTEXT, DUMMY_HISTORY, llm);

    expect(state.toolResults).not.toHaveProperty("updateWorkingMemory");
    expect(state.actionsHistory[0].result).toEqual({
      error: "updateWorkingMemory is not an available tool",
    });
    expect(state.writeActions).toHaveLength(0);
  });
});
