# Doctours Concierge — Project Plan

## Problem

A 1,500-line monolithic system prompt handles every patient message. Every rule loads on every turn, making replies worse, debugging impossible, and testing individual behaviors unworkable. The system also lacks escalation support.

## Solution

Decompose the monolith into a **goal-driven agent loop** with scoped skill prompts. The agent identifies the customer's end goals, iteratively gathers data and resolves each goal via tool calls and skill knowledge, then composes a response using only the relevant domain rules. Escalation short-circuits the loop entirely.

## Architecture

### Core concept: end goals vs actions

A customer message expresses **end goals** — what they ultimately want answered or done. Achieving those goals may require **intermediate actions** — tool calls, skill lookups, or even asking the customer for clarification. The agent loops until every end goal is resolved or blocked.

Example:
```
Message: "I'm leaning toward Heva. What packages do they have? Does Heva do afro hair?"

End goals:
  1. Tell the customer about Heva's packages (names, prices, deposits)
  2. Confirm whether Heva handles afro/4C hair
  3. Persist that the customer is leaning toward Heva (side effect)

Actions needed to resolve:
  Goal 1 → getClinicPackages("Heva")
  Goal 2 → check CLINIC_FLAGS (already in context: Speciality=Afro Hair) ✓
  Goal 3 → getAllClinics() to resolve Heva's ID → updateUserClinicPreferences

Agent loop:
  Iteration 1: call getClinicPackages("Heva") → resolves goal 1
  Iteration 2: call getAllClinics() → resolves goal 3's prerequisite
  Iteration 3: all goals resolved → compose response
  Post-response: execute updateUserClinicPreferences (write action)
```

### Architecture diagram

```
message
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ AGENT LOOP                                                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Step (LLM call): given current state, decide:       │     │
│  │                                                     │     │
│  │  • call_tool     → execute tool, update state       │──┐  │
│  │  • load_skill    → add skill knowledge to state     │  │  │
│  │  • escalate      → template reply, EXIT             │  │  │
│  │  • clarify       → reply with question, EXIT        │  │  │
│  │  • respond       → all goals met, EXIT to compose   │  │  │
│  └─────────────────────────────────────────────────────┘  │  │
│       ▲                                                   │  │
│       └───────── loop until exit ─────────────────────────┘  │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                    exit condition
                           │
              ┌────────────┼────────────────┐
              │            │                │
         escalate      clarify          respond
              │            │                │
              ▼            ▼                ▼
        ┌──────────┐ ┌──────────┐  ┌───────────────┐
        │ Template  │ │ Reply    │  │ Response LLM  │
        │ Reply     │ │ with     │  │ (scoped skill │
        │ (no LLM)  │ │ question │  │  prompts +    │
        │           │ │          │  │  tool results) │
        └─────┬─────┘ └────┬─────┘  └───────┬───────┘
              │            │                │
              └────────────┼────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Action Executor  │
                  │ (write tools:    │
                  │  updateMemory,   │
                  │  updatePrefs)    │
                  └────────┬─────────┘
                           │
                           ▼
                       Reply JSON
```

### How the loop works

**State accumulates across iterations:**
```typescript
interface AgentState {
  // Input (immutable)
  message: string;
  patientContext: object;           // constants, working memory, collection status
  conversationHistory: string;

  // Goals (set on first iteration, updated as work progresses)
  endGoals: Array<{
    id: string;
    description: string;
    resolved: boolean;
    requiredSkill: string | null;   // which skill domain this goal needs
  }>;

  // Accumulated across iterations
  toolResults: Record<string, any>; // tool name → result
  loadedSkills: string[];           // skill keys loaded so far
  actionsHistory: Array<{           // trace of what the agent did and why
    iteration: number;
    reasoning: string;
    action: AgentAction;
    result: any;
  }>;

  // Deferred writes (accumulated, executed post-response)
  writeActions: Array<{ tool: string; args: any }>;
}
```

**Each iteration, the LLM decides one action:**
```typescript
type AgentAction =
  | { type: 'call_tool'; tool: string; args: any }
  | { type: 'load_skill'; skill: string }
  | { type: 'escalate'; reason: string }
  | { type: 'clarify'; question: string; missingInfo: string }
  | { type: 'respond'; skills: string[] };
```

**Iteration prompt sees:**
- The original message and patient context
- The current end goals (with resolved/unresolved status)
- All tool results gathered so far
- The action history (what was tried and what it returned)
- Available tools (names + short descriptions)
- Available skills (names + short descriptions)

**The agent decides by reasoning:**
1. Which end goals are still unresolved?
2. What information is missing to resolve the next one?
3. Can a tool call get that information?
4. Do I have enough info to respond, or do I need more?
5. Am I stuck — do I need to ask the customer?
6. Should this go to a human?

**Loop terminates when:**
- `respond`: all goals resolved → compose response with scoped skills
- `escalate`: human needed → return template reply
- `clarify`: missing info → return reply asking the customer
- Max iterations reached (safety: 8) → respond with what we have

### Response composition (final LLM call)

When the loop exits with `respond`, the agent has accumulated:
- All tool results needed to answer
- The list of relevant skills (tagged by goals)

The response composer loads:
- Core identity prompt (~50 lines, always loaded)
- Only the skill prompts relevant to the resolved goals
- All tool results as data context

This final LLM call applies the domain rules (pricing accuracy, voice guidelines, link placement, financing geography, etc.) to compose the patient-facing reply. The domain rules are NOT in the agent loop — the loop focuses on planning and data gathering. The response composer focuses on applying knowledge correctly.

### Read vs Write tool separation

**Read tools** — called DURING the agent loop as the agent gathers data. The agent decides which to call and with what arguments.

**Write tools** — accumulated as deferred actions during the loop, executed AFTER the response is composed. The agent (or the response LLM) specifies them, but they run last. This keeps the loop side-effect-free until completion.

```
Agent loop (read tools) → Response composer (skills) → Write executor → Reply
```

---

## File Structure

```
src/
  types.ts                 # Reply, WorkingMemoryUpdates, AgentState, AgentAction
  constants.ts             # All constants from the spec (verbatim)

  tools/
    index.ts               # All tool functions copied from the .md spec
    registry.ts            # Tool name → function + short description for agent prompt

  agent/
    loop.ts                # Core agent loop: init state → iterate → terminate
    state.ts               # AgentState creation and updates
    prompts/
      step.ts              # Per-iteration prompt: "given state, decide next action"
      responder.ts         # Final response composition prompt (with scoped skills)
    safety.ts              # Max iteration guard, fallback behavior

  skills/
    core.ts                # Always-loaded: identity, voice, output schema (~50 lines)
    pricing.ts             # PACKAGE & CLINIC FACTS, FINANCING GEOGRAPHY,
                           #   WHAT MATTERS vs NICE TO HAVE
    clinic-info.ts         # CLINIC STATUS TIERS, CLINIC WEBSITE, clinic_flags
    consultation.ts        # Consultation format, scheduling, static URL
    assessment.ts          # Assessment context, no turnaround promises, revisions
    payment.ts             # Deposit rules, two-link logic, HEALTH INSURANCE,
                           #   CARECREDIT, REVERSIBILITY
    escalation.ts          # Template handler — returns Reply directly, no LLM
    collection.ts          # COLLECTION PERSISTENCE, IMAGE GUIDANCE
    registry.ts            # Skill name → prompt text + short description
                           # Interface supports swapping to vector-based retrieval
                           # when skill catalog grows (see decisions.md D15)

  engine/
    claude.ts              # Wraps `claude --print` subprocess calls
    response-parser.ts     # LLM output → Reply + write actions
    user-message.ts        # Builds user message from template

  pipeline.ts              # Entry: message → agent loop → response compose → Reply
  index.ts                 # CLI: read JSON stdin → pipeline per message → JSON stdout

tests/
  unit/
    tools.test.ts          # Every tool function
    state.test.ts          # AgentState creation, updates, goal tracking
    escalation.test.ts     # Escalation templates
    prompt-builder.test.ts # Prompt assembly, skill scoping, size checks
    response-parser.test.ts# Reply extraction
    safety.test.ts         # Max iteration guard
  integration/
    agent-loop.test.ts     # Agent loop on sample messages (with LLM)
    e2e.test.ts            # Full pipeline with 5 sample messages (with LLM)
```

---

## Milestones

### M1: Foundation — Types, Constants, Tools

Set up the TypeScript project. Define all types. Copy tool implementations verbatim from the spec. Build registries for dynamic dispatch.

**Subtasks:**
1. `npm init`, tsconfig, vitest setup
2. `types.ts` — Reply, WorkingMemoryUpdates, AgentState, AgentAction interfaces
3. `tools/index.ts` — all tool functions from the .md, unchanged
4. `tools/registry.ts` — maps tool names to functions + short descriptions (for the agent prompt)
5. `constants.ts` — all constants (PATIENT_SUMMARY, CLINIC_FLAGS, etc.)

**Tests (unit, no LLM):**
- All tool functions return correct data (same as before — see appendix)
- Tool registry maps every tool name to its function
- Tool registry descriptions are concise (< 100 chars each)
- Constants match spec values

---

### M2: Agent State & Safety

Define the agent state machine. State tracks end goals, accumulated tool results, loaded skills, and action history. Safety mechanisms prevent infinite loops.

**Subtasks:**
1. `agent/state.ts` — AgentState creation from message + context, state update helpers
2. `agent/safety.ts` — max iteration guard (default 8), fallback: compose response with whatever data is gathered

**Tests (unit, no LLM):**
- Initial state has empty goals, toolResults, actionsHistory
- `addToolResult(state, "getClinicPackages", result)` updates toolResults
- `markGoalResolved(state, goalId)` sets resolved: true
- `addAction(state, action)` appends to history with iteration number
- Safety: loop terminates at max iterations, returns respond action
- Safety: escalation action terminates loop immediately

---

### M3: Escalation Handler

Template-based, no LLM. Handles two categories: explicit human requests and capability-exceeding requests. The agent loop's `escalate` action triggers this directly.

**Subtasks:**
1. `skills/escalation.ts` — maps escalation type + reason to a Reply
2. Sensitive data scrubber (regex: card numbers, SSNs — applied before any LLM sees the message)

**Tests (unit, no LLM):**
- human_request → `{escalate: true, escalationReason: "Asked to talk to a human", response: "I'm getting a person for you."}`
- cant_handle with card → response does NOT contain any digits from original card number
- All escalation replies: one sentence, no URLs, no sales content
- `shouldFollowUp: false`, `templateId: null`, `attachmentUrls: null`

---

### M4: Skill Prompts & Registry

Extract focused prompt sections from the monolith. Each skill is a self-contained domain prompt. The registry maps skill names to prompt text + one-line descriptions (used in the agent's decision prompt).

**Subtasks:**
1. `skills/core.ts` — always-loaded identity, voice, output rules (~50 lines)
2. `skills/pricing.ts` — package facts, financing, pricing rules (~200 lines)
3. `skills/clinic-info.ts` — clinic status, specialties, website rules (~100 lines)
4. `skills/consultation.ts` — consultation format, scheduling (~60 lines)
5. `skills/assessment.ts` — assessment rules, revisions (~80 lines)
6. `skills/payment.ts` — deposit, payment links, insurance, CareCredit (~200 lines)
7. `skills/collection.ts` — info collection, image guidance (~150 lines)
8. `skills/registry.ts` — name → prompt + description mapping

**Tests (unit, no LLM):**
- Each skill exports a non-empty prompt string
- Pricing skill contains "basePrice" and "currency" but NOT "image upload"
- Consultation skill contains "free phone call" but NOT "FINANCING GEOGRAPHY"
- Core is under 60 lines
- Each individual skill is under 250 lines
- Registry has descriptions under 100 chars (for agent prompt compactness)
- No skill duplicates rules from another skill

---

### M5: Agent Loop & LLM Engine

The core agent loop. Each iteration calls the LLM with accumulated state, gets a decision, executes it, updates state, and checks for termination.

**Subtasks:**
1. `engine/claude.ts` — subprocess wrapper for `claude --print -s "system" "user msg"`
2. `agent/prompts/step.ts` — the per-iteration prompt:
   - Current goals (resolved / unresolved)
   - Tool results so far
   - Actions taken so far
   - Available tools (names + descriptions from registry)
   - Available skills (names + descriptions from registry)
   - Decision schema (call_tool / load_skill / escalate / clarify / respond)
3. `agent/loop.ts` — the while loop: init → iterate → terminate
4. `engine/user-message.ts` — builds user message from template

**Per-iteration prompt structure (~250 lines):**
```
You are a planning agent for a patient concierge system.

CONTEXT:
  Patient: {{patientContext summary}}
  Message: "{{message}}"

END GOALS (from your analysis):
  {{goals with resolved/unresolved status}}

DATA GATHERED SO FAR:
  {{tool results}}

ACTIONS TAKEN:
  {{action history with reasoning}}

AVAILABLE TOOLS:
  {{tool names + one-line descriptions}}

AVAILABLE SKILLS (domain knowledge for response):
  {{skill names + one-line descriptions}}

TASK:
Decide the next action. Return JSON:
{
  "reasoning": "why this action",
  "goalsUpdate": [{"id": "...", "resolved": true/false, "description": "..."}],
  "action": { "type": "...", ... },
  "writeActions": [{"tool": "...", "args": {...}}]  // optional, deferred
}

On the FIRST iteration, also populate goalsUpdate with your initial end goal
decomposition derived from the message.

RULES:
- If a goal can be resolved from data already gathered or from patient context → mark it resolved, no tool call needed
- If a goal needs tool data → call_tool with the specific tool and arguments
- If you cannot determine what tool to call because the message is ambiguous → clarify
- If the patient asks for something outside system capability → escalate
- If ALL goals are resolved → respond, listing which skills the response needs
- A tool's result may reveal that a FURTHER tool call is needed (prerequisite data).
  Add a new goal if needed and continue.
- You may call only ONE tool per iteration. Assess the result before choosing the next.
```

**First iteration special behavior:**
On the first call, the LLM receives the message and context but no goals yet. It must:
1. Decompose the message into end goals (populate goalsUpdate)
2. Decide the first action

This combines "planning" and "first step" into one call, saving a round-trip.

**Tests (with LLM):**
- "What packages does Heva have?" → first iteration decomposes into goals, calls getClinicPackages
- Agent correctly marks goals resolved after receiving tool results
- Agent terminates with `respond` when all goals are met
- Agent terminates with `escalate` for "I demand a human"
- Agent calls multiple tools across iterations when goals require it
- Max iteration safety triggers after 8 loops
- "I'm leaning toward Heva" → agent includes updateUserClinicPreferences as a write action

---

### M6: Response Composition

When the agent loop exits with `respond`, compose the patient-facing reply using scoped skill prompts and all gathered tool data.

**Subtasks:**
1. `agent/prompts/responder.ts` — the response composition prompt
2. `engine/response-parser.ts` — parse LLM output into Reply + validate
3. Post-response write executor

**Response prompt structure:**
```
SYSTEM = core identity
       + only the skills listed in the respond action
       + all tool results from the agent loop
       + patient context (constants, working memory, collection status)
       + output schema (Reply interface + actions array)

USER = user message template (filled)
```

**LLM output format:**
```json
{
  "reply": {
    "response": "...",
    "escalate": false,
    "escalationReason": null,
    "templateId": null,
    "intent": "answer pricing and clinic specialty question",
    "shouldFollowUp": false,
    "followUpTiming": null,
    "attachmentUrls": null,
    "highEngagement": true,
    "workingMemoryUpdates": { ... }
  },
  "actions": [
    {"tool": "updateWorkingMemory", "args": {...}}
  ]
}
```

**Tests (with LLM):**
- Response parser extracts valid Reply from LLM JSON output
- Response parser rejects malformed output (missing fields)
- Responses contain no markdown (`**`, `#`, `*`)
- URLs appear on the last line of response text
- `templateId` is always null
- If `escalate: true`, `escalationReason` is non-null
- If `escalate: false`, `escalationReason` is null

---

### M7: CLI & End-to-End

Wire everything together. Build the CLI entry point. Test against the 5 sample messages.

**Subtasks:**
1. `pipeline.ts` — full orchestration:
   ```
   message → init agent state → agent loop → response compose → write actions → Reply
   ```
2. `index.ts` — CLI: read JSON from stdin or file arg, write JSON array to stdout
3. End-to-end testing

**CLI interface:**
```bash
cat messages.json | node dist/index.js         # from stdin
node dist/index.js messages.json               # from file
# Output: JSON array of Reply objects to stdout
```

**End-to-end tests (with LLM):**

| Message ID | escalate | Key assertions |
|-----------|----------|----------------|
| heva-packages | false | Afro/4C hair specialty. Silver $3,000/$500 deposit. Gold $4,500/$600 deposit. Assessment link on last line. |
| hakan-price | false | Sapphire $3,200/$500 deposit. |
| consultation | false | Free. Phone call. Consultation URL on last line. |
| demand-human | true | One short sentence. No URLs. No sales content. |
| charge-card | true | No "4242" in response. Mentions getting a person. |

**Structural assertions (all 5):**
- Output is valid JSON array of 5 Reply objects matching the interface
- No markdown in any response
- URLs on last line
- `templateId` null for all
- Escalation fields consistent

**Agent loop behavior assertions:**
- heva-packages: agent calls getClinicPackages("Heva"), resolves afro hair from CLINIC_FLAGS, total ≤ 4 iterations
- hakan-price: agent calls getClinicPackages("Dr. Hakan"), total ≤ 3 iterations
- consultation: agent recognizes no tool needed (domain knowledge), total ≤ 2 iterations
- demand-human: agent escalates on first iteration, total = 1 iteration
- charge-card: agent escalates on first iteration, total = 1 iteration

---

### M8: README

**Subtasks:**
1. Architecture overview with diagram
2. How the agent loop works (end goals → actions → resolution)
3. What loads per turn (core + only relevant skills)
4. How escalation works (short-circuit)
5. How to add a new skill (e.g., fertility, dental)
6. How to add a new tool
7. Prerequisites: Node.js 18+, Claude Code CLI authenticated
8. Install & run commands
9. Trace/debug: the agent's action history shows exactly what it did and why

---

## Dependency Graph

```
M1 (types, tools, constants)
  │
  ├──► M2 (agent state, safety)
  │      │
  │      └──► M5 (agent loop, LLM engine)
  │             │
  │             └──► M6 (response composition)
  │                    │
  │                    └──► M7 (CLI, e2e) ──► M8 (README)
  │
  ├──► M3 (escalation handler) ──────────────► M7
  │
  └──► M4 (skill prompts, registry) ─────────► M5, M6
```

**What needs LLM vs what doesn't:**

| Component | Needs LLM? |
|-----------|-----------|
| Tools (M1) | No |
| Constants (M1) | No |
| Agent state (M2) | No |
| Safety guards (M2) | No |
| Escalation handler (M3) | No |
| Skill prompts (M4) | No (static text) |
| Skill registry (M4) | No |
| Agent loop logic (M5) | Yes (each iteration) |
| Claude CLI wrapper (M5) | Infrastructure |
| Response composition (M6) | Yes (one call) |
| Response parser (M6) | No |
| CLI (M7) | No |
| E2E tests (M7) | Yes |

---

## Appendix: Tool test cases (M1)

- `getAllClinics()` → 2 clinics (Heva, Dr. Hakan) with correct IDs
- `getClinicPackages({clinicName: "Heva"})` → Silver ($3,000/$500) and Gold ($4,500/$600)
- `getClinicPackages({clinicName: "Dr. Hakan"})` → Sapphire ($3,200/$500)
- `getClinicPackages({clinicName: "nonexistent"})` → null
- `findClinic({clinicId: HEVA_ID})` → Heva
- `findClinic({clinicName: "heva"})` → Heva (case-insensitive)
- `findClinic({clinicName: "Hakan"})` → Dr. Hakan (partial match)
- `getPaymentLink({type: "payment", clinicPackageId: SILVER_ID})` → status "ready", correct URL
- `getPaymentLink({type: "checkout", clinicId: HEVA_ID})` → status "ready", correct URL
- `getPaymentLink({type: "payment"})` → status "missing_input"
- `getPaymentLink({type: "checkout", clinicId: "bogus"})` → null
- `getLatestAssessment()` → hasAssessment true, assessmentUrl present
- `getConsultationRescheduleLink()` → status "no_consultation"
- `issuePromoCode()` → status "not_on_list"
- `updateUser()` → updated false, reason "name_already_set"
- `getPatientImages()` → 5 images, allAnglesUploaded true
- `getFullCalls()` → 1 call, summary includes "hairline"
- `getSavedClinics()` → 2 clinics, ranking 1 and 2
- `getPatientContext()` → pipelineStatus "PRE_CLINICAL_SENT", name "Jordan Hale"
