export interface Reply {
  response: string;
  escalate: boolean;
  escalationReason: string | null;
  templateId: string | null;
  intent: string;
  shouldFollowUp: boolean;
  followUpTiming: string | null;
  attachmentUrls: string[] | null;
  highEngagement: boolean;
  workingMemoryUpdates: WorkingMemoryUpdates | null;
}

export interface WorkingMemoryUpdates {
  collectionState?: {
    areaAskCount?: number | null;
    lastAskedItem?: "area" | "name" | "photos" | "none" | null;
    nameAskCount?: number | null;
    photoAskCount?: number | null;
  } | null;
  communicationStyle?:
    | "detailed"
    | "concise"
    | "casual"
    | "formal"
    | "unknown"
    | null;
  escalationFlags?: string | null;
  keyConcerns?: string | null;
  patientName?: string | null;
  preferredPaymentMethod?:
    | "financing"
    | "layaway"
    | "pay_in_full"
    | "cash_preference"
    | "unknown"
    | null;
  procedureArea?: string | null;
  promisesMade?: string | null;
  targetProcedureWindow?:
    | "within_3_months"
    | "within_6_months"
    | "within_8_months"
    | "within_12_months"
    | "over_12_months"
    | "unknown"
    | null;
}

export interface Message {
  id: string;
  text: string;
}

export interface AgentState {
  message: string;
  patientContext: Record<string, unknown>;
  conversationHistory: string;

  endGoals: Array<{
    id: string;
    description: string;
    resolved: boolean;
    requiredSkill: string | null;
  }>;

  toolResults: Record<string, unknown>;
  loadedSkills: string[];
  actionsHistory: Array<{
    iteration: number;
    reasoning: string;
    action: AgentAction;
    result: unknown;
  }>;

  writeActions: Array<{ tool: string; args: Record<string, unknown> }>;
}

export type AgentAction =
  | { type: "call_tool"; tool: string; args: Record<string, unknown> }
  | { type: "load_skill"; skill: string }
  | { type: "escalate"; reason: string; category?: "human_request" | "cant_handle" }
  | { type: "clarify"; question: string; missingInfo: string }
  | { type: "respond"; skills: string[] };

export interface ToolDefinition {
  fn: (input: Record<string, unknown>) => unknown;
  description: string;
}
