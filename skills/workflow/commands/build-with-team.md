Implement a feature using coordinated multi-agent team execution.

## Steps

1. Read the spec: $ARGUMENTS
   - The spec must be `approved`, or must have approved child specs from `/breakdown`
   - If the spec has child specs, read ALL of them
   - If any child specs are still `draft`, STOP and tell the user to approve them first
   - Read `CLAUDE.md` for project conventions
   - Read `.agentctx/context/architecture.md` for directory structure
   - Read relevant module files in `.agentctx/context/modules/`

2. Create a feature branch if not already on one:
   ```bash
   git checkout -b feat/{NNNN}-{name}
   ```

3. Create a checkpoint before starting:
   Stage any existing changes and tag: `cp-{NNNN}-pre-build`

---

### Phase 1 — Define Contracts

Before spawning any agents, define the contracts between teams. This is the most critical step.

**Database to Backend contracts:**
- Schema: table definitions, column types, constraints, indexes
- Repository interface: method signatures for CRUD operations
- DTOs: TypeScript interfaces for data transfer between layers

**Backend to Frontend/Mobile contracts:**
- Endpoint URLs: exact paths, HTTP methods
- Request shapes: TypeScript interfaces for request bodies/params
- Response shapes: TypeScript interfaces for success and error responses
- Error format: standard error envelope structure
- Auth flow: how authentication tokens are passed and validated

**Cross-cutting contracts:**
- Auth flow: token format, header names, refresh mechanism
- Error envelope: `{ error: { code: string, message: string, details?: unknown } }`
- URL conventions: `/api/v1/{resource}` patterns
- Pagination: cursor vs offset, response shape
- Naming conventions: camelCase for JSON, kebab-case for URLs

Write all contracts to a temporary file: `.agentctx/specs/{NNNN}-contracts.md` for reference.

---

### Phase 2 — Spawn Agents

Use the Agent tool to spawn agents simultaneously. Each agent receives:

**Agent assignment template:**
```
You are the {TEAM} agent for spec {NNNN}: {title}.

YOUR OWNERSHIP (only modify these files/directories):
{list of files/dirs from the spec}

CONTRACTS YOU PRODUCE:
{interfaces/schemas other agents consume from you}

CONTRACTS YOU CONSUME:
{interfaces/schemas you consume from other agents}

REQUIREMENTS:
{team-specific requirements from the child spec}

ACCEPTANCE CRITERIA:
{team-specific acceptance criteria}

CONVENTIONS:
{relevant conventions from CLAUDE.md}

VALIDATION CHECKLIST:
- [ ] All files are within my ownership boundaries
- [ ] My produced contracts match the agreed interfaces
- [ ] My consumed contracts are used correctly
- [ ] All acceptance criteria are addressed
- [ ] Tests are written for my domain
```

Spawn agents in this order (but ALL simultaneously, not sequentially):
- **Database agent**: schema migrations, seed data
- **Backend agent**: API endpoints, services, middleware
- **Frontend agent** (if applicable): pages, components, state
- **Mobile agent** (if applicable): screens, native components
- **QA agent**: tests — starts writing tests from contracts IMMEDIATELY, does not wait for implementation

---

### Phase 3 — Coordinate

While agents are working:
- Monitor progress through the Agent tool responses
- If an agent needs a contract change, pause and coordinate:
  1. The requesting agent proposes the change
  2. All consuming agents confirm they can accommodate
  3. Update `.agentctx/specs/{NNNN}-contracts.md`
  4. Notify all affected agents of the change
- Track completion status of each agent
- The QA agent validates test cases against contracts in parallel — it does NOT wait for implementation to finish

---

### Phase 4 — Integrate

After all agents complete:

1. **Contract diff**: Compare the implemented interfaces against the original contracts
   - If any mismatches exist, route back to the responsible agent for correction

2. **Domain validation**: Each agent validates their own domain:
   - Backend: all endpoints respond correctly, middleware works
   - Frontend: components render, state management works
   - Mobile: screens navigate, native features function
   - QA: all tests pass

3. **QA confirmation**: The QA agent runs the full test suite and confirms all acceptance criteria pass

4. **End-to-end validation**: Run the full flow from user action through all layers
   - Read the parent spec's acceptance criteria
   - Verify each criterion against the integrated system

5. **Finalize**:
   - Update spec statuses to `completed`
   - Create or update module files in `.agentctx/context/modules/`
   - Create a checkpoint: `cp-{NNNN}-done`
   - Print summary of what was built

---

## Anti-Patterns — DO NOT DO THESE

### 1. Spawning WITHOUT contracts
**Wrong**: "Backend agent, build the user API. Frontend agent, build the user page."
**Why it fails**: Each agent invents its own interfaces. They won't connect.
**Right**: Define exact TypeScript interfaces for requests/responses BEFORE spawning.

### 2. Sequential spawning
**Wrong**: Build backend first, then frontend, then tests.
**Why it fails**: 3x slower and prevents parallel validation.
**Right**: Spawn all agents simultaneously. Contracts enable parallel work.

### 3. QA waiting for implementation
**Wrong**: "QA agent, wait until backend and frontend are done, then write tests."
**Why it fails**: Tests become an afterthought. Bugs are found late.
**Right**: QA writes tests from contracts immediately. Tests are ready before code.

### 4. Agents modifying files they don't own
**Wrong**: Backend agent edits a frontend component to fix integration.
**Why it fails**: Merge conflicts, broken ownership, untested changes.
**Right**: Agent reports the issue. Lead coordinates a contract change. Owning agent makes the fix.

## Important
- Contracts are the foundation — spend time getting them right
- Every agent must know their file ownership boundaries
- The QA agent is a first-class participant, not an afterthought
- If the feature is small enough for one agent, skip team coordination and just use `/implement`
