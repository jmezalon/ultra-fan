# Project Agents

Use these project agents for parallel execution:
- Architect Agent: `agents/architect-agent.md`
- Design Agent: `agents/design-agent.md`
- Test Agent: `agents/test-agent.md`
- CI/CD Agent: `agents/ci-cd-agent.md`
- Product Manager Agent: `agents/product-manager-agent.md`

## Operating Protocol
1. Read `agents/README.md` and `agents/tasks-board.md` first.
2. Keep each agent in a dedicated branch with prefix `codex/`.
3. Do not modify another agent's scope without explicit handoff note.
4. Update `agents/tasks-board.md` status and decision log after every meaningful change.
5. Use PRD acceptance criteria in `docs/mvp-prd.md` as release truth.

## Quality Bar
- Authz and entitlement checks are non-negotiable for any stream access path.
- Regressions in control-room state flow block release.
- CI green + test signoff required before merge.
