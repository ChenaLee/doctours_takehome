# Design Decisions & Considerations

Key decisions made during planning, with rationale and trade-offs.

---

## D1: Goal-driven agent loop (not a fixed pipeline)

**Decision:** The system uses an iterative agent loop that decomposes the customer's message into end goals, then loops — calling tools, loading skills, or deciding to clarify — until all goals are resolved.

**What changed from the earlier pipeline design:**
The original plan used a fixed sequence: classify → plan tools → execute → respond. The user pointed out two problems:
1. Tool planning is a reasoning task — the orchestrator can't deterministically know which tools are needed without understanding the question, tool capabilities, and inter-tool dependencies.
2. A single pass can't handle the case where a tool result reveals the need for *another* tool call not anticipated upfront. The system needs to loop.

**How the loop works:**
```
Init: create AgentState from message + patient context
Loop:
  1. LLM sees: message, goals (resolved/unresolved), data gathered, actions taken
  2. LLM decides next action: call_tool / escalate / clarify / respond
  3. Orchestrator executes the action, updates state
  4. If action was respond/escalate/clarify → exit loop
  5. Otherwise → iterate
Post-loop:
  If respond → compose final reply with scoped skill prompts
  Execute deferred write actions
  Return Reply
```

**Why a loop instead of a plan-then-execute model:**
- A plan-then-execute model assumes all required actions can be determined upfront. But tool result A may reveal that tool B is also needed: "What packages does Heva have?" → getClinicPackages → result shows packages → agent realizes it should also check getLatestAssessment since the patient asked about paying from the assessment.
- The loop lets the agent REACT to each result and adjust its strategy.
- Escalation and clarification become natural exit conditions rather than special cases.

**Trade-off:** More LLM calls per message (2-5 typically). Each iteration is a separate `claude --print` call. Mitigated by:
- The agent prompt is small (~250 lines) — each call is fast
- Simple messages (consultation, escalation) resolve in 1-2 iterations
- Max iteration safety cap (8) prevents runaway loops

---

## D2: End goals vs first actions — the agent's core distinction

**Decision:** The agent's first iteration both decomposes the message into end goals AND decides the first action. Subsequent iterations assess progress and decide next steps.

**What "end goals" means:**
End goals are what the customer ultimately needs — the things the response must address. They're derived from the message and patient context.

Example decomposition:
```
Message: "I'm leaning toward Heva. What packages do they have, and can I pay
         from the assessment? I have 4C curls — does Heva do afro hair?"

End goals:
  1. Provide Heva package details (names, prices, deposits)
  2. Explain that they can pay from the assessment (Book button)
  3. Confirm Heva specializes in afro/4C hair
  4. Persist clinic preference for Heva (side effect)
```

**What "first action" means:**
The immediate next step toward resolving the highest-priority unresolved goal. Not the full plan — just one step. The loop handles the rest.

**Why not plan all actions upfront:**
- Tool results may change the plan. If getClinicPackages returns unexpected data, the agent might need additional calls.
- Some goals resolve without tools (domain knowledge in context). The agent discovers this during reasoning, not during planning.
- Upfront planning requires the LLM to predict tool outputs. Step-by-step reasoning after seeing each result is more reliable.

---

## D3: LLM-based tool planning (not deterministic mapping)

**Decision:** The agent LLM decides which tools to call and with what arguments at each iteration, rather than a static intent→tool mapping.

**Why the tool planner needs LLM:**

1. **Argument construction requires understanding.** "What does Dr. Hakan cost?" → the agent must understand "Dr. Hakan" is a clinic name and construct `{clinicName: "Dr. Hakan"}` as the argument. A static map would need NER + argument templates for every variation.

2. **Tool choice depends on what data is already available.** If CLINIC_FLAGS already contains the afro hair answer, no tool call is needed. If patient context already has a selectedClinicId, the agent doesn't need getAllClinics to resolve it. The LLM can reason about what's already in state.

3. **Prerequisite chains are situational.** "I want to pay" might need:
   - If selectedPackageId exists: just getPaymentLink(type: "payment", id)
   - If selectedClinicId exists but no package: getClinicPackages first, then maybe clarify which package
   - If neither: need to ask which clinic, which package — a clarification, not a tool call

   A static map can't capture these conditional chains without encoding every branch.

4. **Multi-intent messages create non-obvious tool plans.** "Does Heva do afro hair and what's the Gold package?" requires the agent to realize it needs getClinicPackages to answer the package question, but can answer the afro hair question from CLINIC_FLAGS already in context. Only an LLM can reliably make this distinction.

**Trade-off:** The LLM might call an unnecessary tool or miss one. Mitigated by:
- The loop self-corrects: if a goal is still unresolved after an iteration, the agent tries another action
- The agent prompt includes short descriptions of each tool's purpose
- Tool calls are cheap (local functions, not network calls)

---

## D4: When the agent asks for clarification

**Decision:** The agent can exit the loop with a `clarify` action when it lacks information that only the customer can provide.

**When this triggers:**
1. **Ambiguous reference.** "What packages do they have?" — who is "they"? If conversation history or patient context resolves it, the agent proceeds. If not, it asks.
2. **Missing selection prerequisite.** "I want to pay" but no clinic or package is selected, and the message doesn't name one. The agent needs to ask which one.
3. **Ambiguous intent.** "Can you book me?" — book a consultation? A procedure? If context doesn't disambiguate, the agent asks.

**When this does NOT trigger:**
- The agent should always try to resolve ambiguity from context first. Conversation history, working memory, and patient state often contain the answer.
- If the message is clear enough to proceed with a reasonable interpretation, the agent should proceed rather than ask. Over-clarifying is worse than a slightly imperfect response.

**How clarification works in the Reply:**
- The response IS the clarifying question (embedded naturally in a helpful reply)
- `escalate: false` (this is normal conversation, not a handoff)
- The response answers whatever CAN be answered, then asks for the missing piece
- This mirrors how a real coordinator would handle it

---

## D5: Reconsidered — LangGraph is now a legitimate option

**Decision:** Recommend a hand-rolled agent loop, but acknowledge LangGraph as a viable alternative for this architecture.

**What changed:** The earlier pipeline design had no cycles — LangGraph was overkill. The agent loop architecture introduces:
- A cycle (the loop itself)
- Conditional exit edges (respond / escalate / clarify)
- State that accumulates across iterations
- Multiple action types at each node

These are exactly what LangGraph models well.

**Why hand-rolled is still recommended:**
1. **The loop body is ~50 lines of TypeScript.** It's a while loop with a switch on action.type. Wrapping this in a graph framework adds abstraction without reducing complexity.
2. **State is a plain object.** AgentState is a TypeScript interface with simple update functions. LangGraph's state management adds typed channels and reducers — powerful for multi-agent systems, overhead for a single agent.
3. **`claude --print` requires a custom LLM wrapper regardless.** LangGraph's built-in LLM integrations (ChatAnthropic, etc.) use API keys. We'd write a custom ChatModel adapter, losing the framework's main convenience.
4. **No multi-agent coordination.** There's one agent. LangGraph's strength is orchestrating multiple agents — supervisor patterns, parallel branches, handoffs. We have none of that.
5. **Debuggability.** The action history in AgentState is a plain array. `console.log(state.actionsHistory)` shows exactly what happened. A graph framework adds its own logging/tracing layer that may obscure rather than clarify.

**When to switch to LangGraph:**
- If the system adds multiple specialized agents (a medical agent + a billing agent + a scheduling agent) that need coordination
- If the loop gets complex branches (not just a single cycle but nested sub-loops)
- If the team prefers LangGraph's tooling (LangSmith tracing, LangGraph Studio visualization)
- If the project moves to an API-key LLM backend, unlocking LangGraph's native LLM integrations

**The honest assessment:** LangGraph would work here. It's not wrong — it's just more framework than this problem needs right now. The architecture is designed so that migrating to LangGraph later is straightforward: AgentState maps to graph state, each action type maps to a node, and the loop maps to a cycle edge.

---

## D6: Two-phase LLM usage — planning vs composition

**Decision:** The agent loop and the response composition use DIFFERENT prompts optimized for different tasks.

**Agent loop prompt (~250 lines):**
- Goal: decide what to do next
- Contains: tool descriptions, skill descriptions, state summary, decision schema
- Does NOT contain: full domain rules (pricing accuracy, voice guidelines, link placement, etc.)
- Output: structured JSON (action + reasoning)
- Optimized for: planning, tool selection, goal tracking

**Response composition prompt (variable, ~150-500 lines):**
- Goal: compose the patient-facing reply
- Contains: core identity + ONLY the relevant skill prompts + all tool results
- Does NOT contain: tool descriptions, action schema, planning instructions
- Output: Reply JSON
- Optimized for: domain-correct, well-voiced responses

**Why separate:**
- The monolith's problem is that all rules load on every turn. If the agent loop prompt included all domain rules, we'd recreate the monolith.
- Planning and composing are different cognitive tasks. The planner needs to know WHAT tools do. The composer needs to know HOW to apply domain rules.
- Skills are scoped to the response phase. A pricing question's response loads the pricing skill. The planner doesn't need pricing rules to decide "I should call getClinicPackages" — it just needs to know the tool exists and what it returns.

---

## D7: Claude Code CLI as the LLM backend

**Decision:** Shell out to `claude --print` for all LLM calls. No API key required.

**Interface:**
```bash
# Short prompts
claude --print --system-prompt "system prompt" "user message"

# Long prompts (via temp files if needed)
claude --print --system-prompt "$(cat /tmp/system.txt)" "$(cat /tmp/user.txt)"
```

**Why:**
- User specified no API key will be provided
- Claude Code CLI uses existing authentication — zero setup for anyone with Claude Code
- `--print` mode is non-interactive, one-shot — perfect for agent loop iterations

**Trade-offs:**
- Subprocess overhead per call. Acceptable: each call takes seconds, and messages are processed one at a time.
- No streaming. Fine: we need the full response to parse JSON.
- No native tool_use protocol. Our architecture doesn't need it: tools are pre-called by the orchestrator.
- Output parsing depends on stdout format. We instruct the LLM to return JSON and parse it.

---

## D8: Skill decomposition — domain-based, not stage-based

**Decision:** Skills are split by domain (pricing, clinic info, consultation, etc.), not by pipeline stage (LEAD, PRE_CLINICAL_SENT, etc.).

**Why domain over stage:**
- A pricing question can arrive at any stage. Stage-based skills duplicate pricing rules.
- Domain skills compose: a message about pricing + clinic info loads two skills. A stage skill loads one monolithic stage block.
- Domain skills are independently testable: "does the pricing skill include basePrice rules?" is clear. "Does the LEAD skill handle pricing correctly?" conflates concerns.

**Core identity (always loaded, ~50 lines):**
- Coordinator name, role, first person voice
- Plain text only, no markdown
- Link placement (URLs on last line)
- Response mode (answer what was asked, then stop)
- Output schema

**Domain skills (loaded on demand):**
| Skill | Lines | Key rules |
|-------|-------|-----------|
| pricing | ~200 | Package facts, financing geography, what matters vs nice to have |
| clinic-info | ~100 | Status tiers, clinic website, clinic_flags, afro hair |
| consultation | ~60 | Free phone call, rescheduling, static booking URL |
| assessment | ~80 | Assessment context, no turnaround promises, revisions |
| payment | ~200 | Deposit rules, two-link logic, insurance, CareCredit, reversibility |
| collection | ~150 | Collection persistence, image guidance, info collection |

**Even loading 3 skills: ~400 + 50 core = ~450 lines — still 3x smaller than the monolith.**

---

## D9: Read vs Write tool separation

**Decision:** Read tools execute DURING the agent loop. Write tools are deferred and execute AFTER the response is composed.

**Read tools (during loop):**
getAllClinics, getClinicPackages, getClinicDoctors, getSavedClinics, getPatientContext, getPatientImages, getLatestAssessment, getConsultationRescheduleLink, getFullCalls, issuePromoCode

**Write tools (post-response):**
updateUser, updateUserClinicPreferences, updateWorkingMemory

**Why:**
1. **Side-effect-free loop.** The loop is pure: it gathers data and reasons about it. No state changes until the response is committed. If the loop hits max iterations or an error, nothing has been written.
2. **Testable.** Can test the loop and response composition without worrying about write side effects.
3. **Auditable.** The action history shows what the agent intended to write. The post-response executor does exactly that, and logs it.
4. **Rollback-friendly.** If response composition fails, the writes never execute.

**How writes are specified:**
The agent accumulates write actions in `state.writeActions` during the loop. The response LLM can also add write actions (e.g., workingMemoryUpdates in the Reply). Both are executed after the Reply is finalized.

---

## D10: Reusing tool implementations verbatim

**Decision:** Copy the TypeScript tool functions from the .md spec unchanged.

**Why:**
- The spec says these are "the only tools" — their behavior is ground truth
- They're deterministic (no external calls, no real side effects)
- Reimplementing risks subtle behavioral differences
- They serve as both production code and test oracle

**What we add:**
- A registry mapping tool names to functions + descriptions (for the agent prompt)
- Type annotations (the spec has them inline)
- A uniform calling interface so the agent can invoke tools by name

---

## D11: Loop safety — max iterations and fallback

**Decision:** The agent loop has a hard cap of 8 iterations. If reached, it composes a response with whatever data has been gathered.

**Why 8:**
- The most complex sample message ("heva-packages") needs ~3-4 iterations. 8 gives headroom for harder messages.
- More than 8 iterations suggests the agent is stuck — either on an impossible goal or in a cycle.
- Each iteration is an LLM call. At 8, that's 8 planner calls + 1 responder call = 9 total. Beyond that, latency becomes a problem.

**Fallback behavior when max is reached:**
- Compose a response with whatever tool data has been gathered
- Mark unresolved goals in the action history (for debugging)
- Don't escalate unless the agent explicitly decided to — max iterations is a safety net, not an escalation signal
- The response may be incomplete, but it's better than no response

**Other safety measures:**
- The agent cannot call the same tool with the same arguments twice (loop detection)
- Escalation action terminates immediately — no further iterations
- Clarification action terminates immediately — the question IS the response

---

## D12: The agent prompt sees tool/skill descriptions, not full content

**Decision:** The per-iteration agent prompt includes SHORT descriptions of available tools and skills (one line each), not their full implementations or prompt text.

**Why:**
- The agent needs to know WHAT a tool does to decide whether to call it, not HOW it's implemented
- Full tool implementations would bloat the agent prompt (defeating the context-reduction goal)
- Full skill prompts would recreate the monolith in the agent loop prompt
- One-line descriptions are enough for planning: "getClinicPackages — returns packages with prices, deposits, and addons for a clinic"

**Example tool descriptions for the agent prompt:**
```
getClinicPackages(clinicName | clinicId) — packages with names, prices, deposits, addons
getAllClinics() — all clinics with IDs, names, addresses, flags, specialties
getLatestAssessment(userId) — assessment link, graft range, share status
getPaymentLink(type, clinicPackageId | clinicId) — deposit payment or checkout URL
getSavedClinics(userId) — patient's recommended clinics with rankings
getPatientContext(userId) — patient profile, pipeline status, selection preferences
getPatientImages(userId) — which intake photo angles have been uploaded
```

**Example skill descriptions for the agent prompt:**
```
pricing — package prices, deposits, financing options, what matters vs nice to have
clinic-info — clinic specialties, afro hair, status tiers, clinic websites
consultation — consultation format (free phone call), scheduling, rescheduling
assessment — assessment content, turnaround, revisions, Book button
payment — deposit mechanics, payment links, insurance, CareCredit, reversibility
collection — patient info collection: procedure area, name, photos
```

---

## D13: Sensitive data handling — scrub before any LLM sees it

**Decision:** Card numbers and other sensitive data are detected and masked BEFORE the message reaches any LLM call (including the classifier/planner).

**Why:**
- Even if the agent correctly escalates, the LLM still processed the card number. Model providers may log inputs.
- The escalation response is a template that never sees the original text — but the agent loop prompt does.
- Better to mask: "Charge the deposit on my card ending in [REDACTED]" → the agent can still recognize this as an escalation without seeing the actual digits.

**What gets masked:**
- Card numbers (sequences of 4+ digits that look like card numbers)
- The original message is preserved in state for the escalation reason, but the masked version goes to LLMs

**What does NOT get masked:**
- Dollar amounts ("$3,000" is important context, not sensitive data)
- Dates, phone numbers (already in patient context — the system knows them)

---

## D14: Testing strategy — LLM boundary

**Decision:** Draw a clear line between tests that need the LLM and tests that don't.

**No-LLM tests (fast, deterministic, run on every change):**
- All tool functions (M1)
- Agent state management (M2)
- Safety guards — max iterations, loop detection (M2)
- Escalation templates — correct Reply shape, no card numbers (M3)
- Skill prompts — content checks, size limits (M4)
- Skill registry — complete, descriptions under limits (M4)
- Response parser — JSON parsing, field validation (M6)
- Prompt builder — correct assembly, scoping (M5)

**LLM tests (slower, run on integration):**
- Agent loop on each sample message — correct tool calls, goal resolution (M5)
- Classifier accuracy on edge cases (M5)
- End-to-end with 5 sample messages — correct facts, formatting, escalation (M7)
- Response quality — no markdown, link placement, voice (M7)

This split means >60% of the codebase is testable with fast, deterministic unit tests. LLM tests validate the full pipeline and are expected to have some variance in wording (but not in facts or structure).

---

## D15: Vector DB for skill discovery — not now, design for it

**Decision:** Don't implement vector-based skill retrieval for the current 7-skill system. But design the skill registry interface so the selection mechanism is swappable — from "agent reads descriptions" today to "vector search pre-filters" when the catalog grows.

### Where vector search would fit in the architecture

```
message
  │
  ▼
┌─────────────────────────┐
│ Skill Retriever          │  ← this component is the swap point
│ (today: agent reads list)│
│ (later: vector search)   │
└──────────┬──────────────┘
           │ candidate skills
           ▼
     Agent Loop (confirms/refines skill selection)
           │
           ▼
     Response Composer (loads confirmed skills)
```

The retriever narrows the candidate set. The agent loop confirms which candidates are actually needed (and can add more if a goal reveals a dependency). The response composer loads only the confirmed skills.

### Why NOT now (7 skills)

1. **Listing 7 descriptions costs ~7 lines of agent prompt.** That's negligible context. The agent LLM reads them in a single glance and selects accurately. Vector search infrastructure (embedding model, vector store, index) adds real complexity to solve a non-problem.

2. **Skill selection isn't pure retrieval — it requires reasoning.** "I want to pay for Heva's Gold" needs both the payment skill AND the pricing skill (to verify the package exists and resolve its ID). Embedding similarity would rank "payment" highest, but might rank "pricing" lower than "clinic-info" because the message mentions a clinic name. The agent LLM understands the transitive dependency; cosine similarity doesn't.

3. **Multi-intent messages need multiple skills from different domains.** Vector search returns top-K by similarity to the whole message. But a message like "Does Heva do afro hair, what's the Gold package, and is the consultation free?" needs clinic-info + pricing + consultation — three different domains with different relevance vectors. Top-3 retrieval might work here, but it's fragile: the consultation part of the message has low token weight relative to the Heva/package content, so the consultation skill might fall to position 4+.

4. **Adds a dependency.** The spec says "We clone it and run it." An embedding model (local or API) and a vector store add setup friction. The current system runs with just Node.js and Claude Code.

### Why it WILL make sense (30+ skills)

The spec explicitly names extensibility as a goal: "A new line of care, such as fertility, means pasting another domain into the same prompt." If DocTours adds fertility, dental, bariatric surgery, dermatology, ophthalmology, etc., the catalog could reach 30-50 specialized skills. At that point:

1. **Agent prompt bloat.** Listing 50 skill descriptions in the agent prompt adds ~50 lines and dilutes the agent's attention. Vector search pre-filters to a manageable candidate set (top 5-8) before the agent sees them.

2. **Skill fragments, not monoliths.** At scale, skills should decompose further: "financing for US patients" and "financing for non-US patients" as separate retrievable units. Vector search can load the exact relevant fragment instead of the entire pricing skill. This further reduces response-phase context.

3. **Dynamic catalog.** If skills are added/updated frequently (clinic-specific policies, seasonal promos), the vector index updates automatically on embed. No agent prompt changes needed.

4. **Cross-domain retrieval.** A patient asking about "hair transplant recovery and dental veneers on the same trip" touches two care lines. Vector search naturally retrieves both, even if neither is the "top" match individually.

### How to design for it now

The skill registry interface should abstract the selection mechanism:

```typescript
interface SkillRegistry {
  // Returns candidate skills relevant to the message/goals
  getCandidates(message: string, goals: string[]): Promise<SkillCandidate[]>;

  // Returns the full prompt text for a skill
  getPrompt(skillKey: string): string;
}

interface SkillCandidate {
  key: string;
  description: string;
  relevanceScore: number;  // 1.0 for agent-selected, 0-1 for vector similarity
}
```

**Today's implementation:** `getCandidates` returns all 7 skills with their descriptions (score 1.0). The agent LLM filters.

**Future implementation:** `getCandidates` embeds the message, queries the vector store, returns top-K with similarity scores. The agent LLM confirms/refines.

The agent loop and response composer are unchanged — they just see a (possibly shorter) list of candidate skills. The swap is behind the registry interface.

### A middle ground: keyword index

Between "list all 7" and "full vector DB," there's a lightweight option for 15-30 skills: a keyword/tag index. Each skill is tagged with trigger terms (pricing: "cost", "price", "package", "$", "deposit", "financing"; consultation: "consultation", "free call", "schedule", "phone"). A fast keyword match pre-filters candidates.

This is deterministic, needs no embedding model, and handles 80% of cases. The agent LLM handles the remaining 20% (multi-intent, ambiguous, or dependency-based selections). It's the right middle step before committing to vector infrastructure.

### Other uses for vector search in this system

Beyond skill selection, vector search could help with:

- **Policy lookup at scale.** If policy documents grow beyond what fits in skill prompts (hundreds of pages of clinic-specific policies), RAG retrieval would fetch the relevant paragraphs. Not needed now — all policy fits in 7 skills.

- **Conversation history search.** If conversations span months with hundreds of messages, vector search could find relevant prior exchanges. Not needed now — RECENT_CONVERSATION_SUMMARY is a fixed context window.

- **FAQ matching.** If patients frequently ask the same questions, a vector index of canonical Q&A pairs could bypass the full agent loop for common queries. This is a performance optimization, not a correctness one.

None of these justify the infrastructure overhead today, but they're worth noting as the system scales.
