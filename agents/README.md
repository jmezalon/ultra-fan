# Agent Team Operating Model

This folder defines specialized project agents so work can progress in parallel with clear ownership.

## Agents
- `architect-agent.md`
- `design-agent.md`
- `test-agent.md`
- `ci-cd-agent.md`
- `product-manager-agent.md`

## How To Run In Parallel
1. Assign each agent a branch (`codex/<agent>-<topic>`).
2. Assign each agent a bounded scope from `agents/tasks-board.md`.
3. Require each agent to produce artifacts listed in its playbook.
4. Merge in this order unless blocked: Architecture -> Design -> QA -> CI/CD -> PM release decision.

## Global Guardrails
- Never bypass authz checks for convenience.
- Never merge without tests for changed behavior.
- Never release if stream entitlement gating is broken.
- Keep decision logs in `agents/tasks-board.md` under the relevant track.
