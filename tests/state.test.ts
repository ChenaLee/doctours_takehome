import { describe, it, expect } from "vitest";
import {
  createAgentState,
  addToolResult,
  markGoalResolved,
  addGoal,
  setGoals,
  addAction,
  addWriteAction,
  getUnresolvedGoals,
  allGoalsResolved,
} from "../src/agent/state.js";
import type { AgentAction } from "../src/types.js";

const DUMMY_CONTEXT = { name: "Jordan Hale", tier: "pre_deposit" };
const DUMMY_HISTORY = "[Sep 26] Alex: Did any clinic catch your eye?";

describe("createAgentState", () => {
  it("sets message from input", () => {
    const state = createAgentState("Hello", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(state.message).toBe("Hello");
  });

  it("sets patientContext from input", () => {
    const state = createAgentState("Hello", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(state.patientContext).toEqual(DUMMY_CONTEXT);
  });

  it("sets conversationHistory from input", () => {
    const state = createAgentState("Hello", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(state.conversationHistory).toBe(DUMMY_HISTORY);
  });

  it("starts with empty endGoals", () => {
    const state = createAgentState("Hello", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(state.endGoals).toEqual([]);
  });

  it("starts with empty toolResults", () => {
    const state = createAgentState("Hello", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(state.toolResults).toEqual({});
  });

  it("starts with empty loadedSkills", () => {
    const state = createAgentState("Hello", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(state.loadedSkills).toEqual([]);
  });

  it("starts with empty actionsHistory", () => {
    const state = createAgentState("Hello", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(state.actionsHistory).toEqual([]);
  });

  it("starts with empty writeActions", () => {
    const state = createAgentState("Hello", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(state.writeActions).toEqual([]);
  });
});

describe("addToolResult", () => {
  it("stores result under tool name", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addToolResult(state, "getClinicPackages", { packages: ["Silver"] });
    expect(state.toolResults["getClinicPackages"]).toEqual({
      packages: ["Silver"],
    });
  });

  it("overwrites previous result for same tool", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addToolResult(state, "getAllClinics", { clinics: [] });
    addToolResult(state, "getAllClinics", { clinics: ["Heva"] });
    expect(state.toolResults["getAllClinics"]).toEqual({
      clinics: ["Heva"],
    });
  });

  it("preserves other tool results", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addToolResult(state, "getAllClinics", { clinics: [] });
    addToolResult(state, "getClinicPackages", { packages: [] });
    expect(state.toolResults["getAllClinics"]).toEqual({ clinics: [] });
    expect(state.toolResults["getClinicPackages"]).toEqual({ packages: [] });
  });
});

describe("goal management", () => {
  it("addGoal appends a goal", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "Get packages",
      resolved: false,
      requiredSkill: "pricing",
    });
    expect(state.endGoals).toHaveLength(1);
    expect(state.endGoals[0].id).toBe("g1");
    expect(state.endGoals[0].resolved).toBe(false);
  });

  it("addGoal keeps existing goals", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: false,
      requiredSkill: null,
    });
    addGoal(state, {
      id: "g2",
      description: "B",
      resolved: false,
      requiredSkill: null,
    });
    expect(state.endGoals).toHaveLength(2);
  });

  it("setGoals replaces all goals", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "old",
      description: "Old",
      resolved: true,
      requiredSkill: null,
    });
    setGoals(state, [
      {
        id: "new1",
        description: "New 1",
        resolved: false,
        requiredSkill: null,
      },
      {
        id: "new2",
        description: "New 2",
        resolved: false,
        requiredSkill: "pricing",
      },
    ]);
    expect(state.endGoals).toHaveLength(2);
    expect(state.endGoals[0].id).toBe("new1");
  });

  it("markGoalResolved sets resolved to true", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: false,
      requiredSkill: null,
    });
    markGoalResolved(state, "g1");
    expect(state.endGoals[0].resolved).toBe(true);
  });

  it("markGoalResolved does nothing for unknown id", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: false,
      requiredSkill: null,
    });
    markGoalResolved(state, "unknown");
    expect(state.endGoals[0].resolved).toBe(false);
  });

  it("getUnresolvedGoals returns only unresolved", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: true,
      requiredSkill: null,
    });
    addGoal(state, {
      id: "g2",
      description: "B",
      resolved: false,
      requiredSkill: null,
    });
    const unresolved = getUnresolvedGoals(state);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].id).toBe("g2");
  });

  it("allGoalsResolved returns true when all resolved", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: true,
      requiredSkill: null,
    });
    addGoal(state, {
      id: "g2",
      description: "B",
      resolved: true,
      requiredSkill: null,
    });
    expect(allGoalsResolved(state)).toBe(true);
  });

  it("allGoalsResolved returns false when any unresolved", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addGoal(state, {
      id: "g1",
      description: "A",
      resolved: true,
      requiredSkill: null,
    });
    addGoal(state, {
      id: "g2",
      description: "B",
      resolved: false,
      requiredSkill: null,
    });
    expect(allGoalsResolved(state)).toBe(false);
  });

  it("allGoalsResolved returns true for empty goals", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    expect(allGoalsResolved(state)).toBe(true);
  });
});

describe("addAction", () => {
  it("appends action with iteration number", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const action: AgentAction = {
      type: "call_tool",
      tool: "getAllClinics",
      args: {},
    };
    addAction(state, 1, "Need clinic list", action, { clinics: [] });
    expect(state.actionsHistory).toHaveLength(1);
    expect(state.actionsHistory[0].iteration).toBe(1);
    expect(state.actionsHistory[0].reasoning).toBe("Need clinic list");
    expect(state.actionsHistory[0].action).toEqual(action);
    expect(state.actionsHistory[0].result).toEqual({ clinics: [] });
  });

  it("preserves order of actions", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addAction(
      state,
      1,
      "First",
      { type: "call_tool", tool: "a", args: {} },
      null,
    );
    addAction(
      state,
      2,
      "Second",
      { type: "call_tool", tool: "b", args: {} },
      null,
    );
    addAction(
      state,
      3,
      "Third",
      { type: "respond", skills: ["pricing"] },
      null,
    );
    expect(state.actionsHistory).toHaveLength(3);
    expect(state.actionsHistory[0].iteration).toBe(1);
    expect(state.actionsHistory[2].iteration).toBe(3);
  });

  it("stores escalate action", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    const action: AgentAction = {
      type: "escalate",
      reason: "Patient demands human",
    };
    addAction(state, 1, "Escalating", action, null);
    expect(state.actionsHistory[0].action.type).toBe("escalate");
  });
});

describe("addWriteAction", () => {
  it("appends a deferred write action", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addWriteAction(state, "updateWorkingMemory", { memory: { name: "J" } });
    expect(state.writeActions).toHaveLength(1);
    expect(state.writeActions[0].tool).toBe("updateWorkingMemory");
    expect(state.writeActions[0].args).toEqual({ memory: { name: "J" } });
  });

  it("accumulates multiple write actions", () => {
    const state = createAgentState("Hi", DUMMY_CONTEXT, DUMMY_HISTORY);
    addWriteAction(state, "updateWorkingMemory", {});
    addWriteAction(state, "updateUserClinicPreferences", {
      clinicSelection: {},
    });
    expect(state.writeActions).toHaveLength(2);
  });
});
