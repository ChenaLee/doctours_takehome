import type { Reply, AgentState } from "./types.js";
import type { LlmCaller } from "./engine/claude.js";
import { runAgentLoop } from "./agent/loop.js";
import { handleEscalation } from "./agent/escalation.js";
import { buildResponderPrompt } from "./agent/prompts/responder.js";
import { buildUserMessage } from "./engine/user-message.js";
import { parseReplyResponse } from "./engine/response-parser.js";
import { callTool, toolRegistry } from "./tools/registry.js";
import {
  PATIENT_SUMMARY,
  CLINIC_FLAGS,
  COLLECTION_STATUS,
  WORKING_MEMORY,
  PIPELINE_STATUS,
  PATIENT_NAME,
  TIER,
} from "./constants.js";

export async function processMessage(
  messageText: string,
  llm: LlmCaller,
  conversationHistory?: string,
): Promise<Reply> {
  const patientContext = buildPatientContext();
  const history = conversationHistory ?? "";

  const state = await runAgentLoop(messageText, patientContext, history, llm);

  const lastAction = state.actionsHistory.at(-1);
  if (!lastAction) {
    throw new Error("Agent loop produced no actions");
  }

  let reply: Reply;
  let postActions: Array<{ tool: string; args: Record<string, unknown> }> = [];

  switch (lastAction.action.type) {
    case "escalate": {
      const category = lastAction.action.category;
      reply = handleEscalation(category, lastAction.action.reason);
      break;
    }

    case "clarify": {
      reply = buildClarifyReply(lastAction.action.question);
      break;
    }

    case "respond": {
      const skills = lastAction.action.skills;
      const composed = await composeResponse(state, skills, messageText, llm);
      reply = composed.reply;
      postActions = composed.actions;
      break;
    }

    default:
      throw new Error(`Unexpected terminal action: ${lastAction.action.type}`);
  }

  const allWriteActions = [...state.writeActions, ...postActions];
  executeWriteActions(allWriteActions);

  return reply;
}

async function composeResponse(
  state: AgentState,
  skills: string[],
  messageText: string,
  llm: LlmCaller,
): Promise<{ reply: Reply; actions: Array<{ tool: string; args: Record<string, unknown> }> }> {
  const systemPrompt = buildResponderPrompt(state, skills);
  const userMessage = buildUserMessage(messageText);
  const raw = await llm(systemPrompt, userMessage);
  return parseReplyResponse(raw);
}

export function executeWriteActions(
  actions: Array<{ tool: string; args: Record<string, unknown> }>,
): void {
  for (const action of actions) {
    if (toolRegistry[action.tool]?.kind !== "deferred") continue;
    try {
      callTool(action.tool, action.args);
    } catch {
      // Write actions are best-effort; don't fail the reply
    }
  }
}

function buildClarifyReply(question: string): Reply {
  return {
    response: question,
    escalate: false,
    escalationReason: null,
    templateId: null,
    intent: "clarify missing information",
    shouldFollowUp: false,
    followUpTiming: null,
    attachmentUrls: null,
    highEngagement: false,
    workingMemoryUpdates: null,
  };
}

function buildPatientContext(): Record<string, unknown> {
  return {
    patientSummary: PATIENT_SUMMARY,
    clinicFlags: CLINIC_FLAGS,
    collectionStatus: COLLECTION_STATUS,
    workingMemory: WORKING_MEMORY,
    pipelineStatus: PIPELINE_STATUS,
    patientName: PATIENT_NAME,
    tier: TIER,
  };
}
