import { describe, it, expect } from "vitest";
import {
  MAX_ITERATIONS,
  shouldTerminate,
  createFallbackAction,
} from "../src/agent/safety.js";
import { createAgentState, addGoal, addAction } from "../src/agent/state.js";

const DUMMY_CONTEXT = { name: "Jordan Hale" };
const DUMMY_HISTORY = "";

describe("MAX_ITERATIONS", () => {
  it("is 8", () => {
    expect(MAX_ITERATIONS).toBe(8);
  });
});

describe("shouldTerminate", () => {
  it("returns false at iteration 1", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(shouldTerminate(state, 1)).toBe(false);
  });

  it("returns false at iteration 7", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(shouldTerminate(state, 7)).toBe(false);
  });

  it("returns true at iteration 8 (max)", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(shouldTerminate(state, 8)).toBe(true);
  });

  it("returns true beyond max iterations", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(shouldTerminate(state, 10)).toBe(true);
  });

  it("returns true when last action was escalate", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addAction(
      state,
      1,
      "Escalating",
      { type: "escalate", reason: "Human requested" },
      null,
    );
    expect(shouldTerminate(state, 2)).toBe(true);
  });

  it("returns true when last action was respond", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addAction(
      state,
      1,
      "All done",
      { type: "respond", skills: ["pricing"] },
      null,
    );
    expect(shouldTerminate(state, 2)).toBe(true);
  });

  it("returns true when last action was clarify", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addAction(
      state,
      1,
      "Need info",
      { type: "clarify", question: "Which clinic?", missingInfo: "clinic" },
      null,
    );
    expect(shouldTerminate(state, 2)).toBe(true);
  });

  it("returns false when last action was call_tool", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addAction(
      state,
      1,
      "Getting data",
      { type: "call_tool", tool: "getAllClinics", args: {} },
      { clinics: [] },
    );
    expect(shouldTerminate(state, 2)).toBe(false);
  });

  it("returns false when last action was load_skill", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addAction(
      state,
      1,
      "Loading skill",
      { type: "load_skill", skill: "pricing" },
      null,
    );
    expect(shouldTerminate(state, 2)).toBe(false);
  });
});

describe("createFallbackAction", () => {
  it("returns a respond action", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const action = createFallbackAction(state);
    expect(action.type).toBe("respond");
  });

  it("includes skills from goals' requiredSkill", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: false,
      requiredSkill: "pricing",
    });
    addGoal(state, {
      id: "g2",
      description: "B",
      resolved: true,
      requiredSkill: "clinic-info",
    });
    const action = createFallbackAction(state);
    expect(action.type).toBe("respond");
    if (action.type === "respond") {
      expect(action.skills).toContain("pricing");
      expect(action.skills).toContain("clinic-info");
    }
  });

  it("deduplicates skills", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: false,
      requiredSkill: "pricing",
    });
    addGoal(state, {
      id: "g2",
      description: "B",
      resolved: false,
      requiredSkill: "pricing",
    });
    const action = createFallbackAction(state);
    if (action.type === "respond") {
      expect(action.skills).toEqual(["pricing"]);
    }
  });

  it("returns empty skills when goals have no requiredSkill", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: false,
      requiredSkill: null,
    });
    const action = createFallbackAction(state);
    if (action.type === "respond") {
      expect(action.skills).toEqual([]);
    }
  });

  it("returns empty skills when no goals", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const action = createFallbackAction(state);
    if (action.type === "respond") {
      expect(action.skills).toEqual([]);
    }
  });
});
