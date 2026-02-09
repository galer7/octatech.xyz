---
title: "Backpressure Is Infrastructure, Not a Feature"
description: "Why your AI agent's quality gates should be static project infrastructure — maintained in a different mindset than the features they protect."
date: 2026-02-07
tags: ["ai", "development-workflow", "backpressure", "engineering"]
author: "Octatech Team"
---

*This is the companion piece to [How HumanLayer Uses an AI-Enabled Development Pipeline](/blog/humanlayer-ai-development-pipeline). That article covered the research-plan-implement loop. This one covers what keeps the loop honest.*

## The Problem With Smart Agents

Geoffrey Huntley [defines backpressure](https://ghuntley.com/pressure/) as "setting up structure around agents to provide automated feedback on quality and correctness." The word "structure" is doing the heavy lifting. Backpressure isn't something the agent decides to do. It's something the agent runs into whether it wants to or not.

This matters because of a tempting mistake: when you write an implementation plan for an AI agent, you might include a step like "run the linter before committing." The agent reads this, nods along, and then — sometimes — skips it. Not maliciously. It just gets focused on the next phase, or the context window rotates, or it decides the code looks clean enough. Instructions in a prompt are suggestions. Infrastructure is a wall.

The question isn't "can the agent run quality checks?" It can. The question is: **what happens when it forgets?**

## Two Layers of Quality

Every project that uses AI agents for development needs to think about quality in two distinct layers.

### Layer 1: The Harness (Static, Project-Level)

This is infrastructure that exists in the repository before any agent touches it:

```
make check    →  lint + typecheck + format
make test     →  unit + integration tests
pre-commit    →  hooks that fire automatically on git commit
CI pipeline   →  runs on push, blocks merge
```

These are declared once in `CLAUDE.md`:

```markdown
## Quality Gates
After ANY code change, run `make check test`.
Do not commit if either fails.
```

And in pre-commit hooks that fire regardless of what the agent's prompt says. Huntley calls pre-commit hooks his favorite backpressure mechanism, noting they were "previously annoying for human developers" but are now invaluable since "humans aren't the ones doing the software development anymore."

The harness has one job: **reject bad output automatically, every time, without the agent needing to remember.** A pre-commit hook that runs `make check` doesn't care about the agent's context window. It doesn't care if the prompt said to check. It fires on every commit attempt. If the check fails, the commit is rejected. The agent sees the error, fixes it, tries again. That's the ralph loop in miniature — deterministic failure that forces correction.

### Layer 2: Plan-Level Assertions (Dynamic, Feature-Specific)

This is what gets generated during the planning phase. It's NOT new infrastructure — it's **assertions that exercise the existing infrastructure**:

```markdown
## Success Criteria - Phase 2

### Automated
- [ ] `make check test` passes
- [ ] New endpoint returns 200 for valid auth token
- [ ] New endpoint returns 401 for expired token
- [ ] Migration runs cleanly on fresh DB

### Manual
- [ ] Button appears in sidebar
- [ ] Clicking it opens the modal
```

Notice what this doesn't say. It doesn't say "install a new linter." It doesn't say "add a security scanner." It says "write tests that check X" and then the existing `make test` — the harness — verifies them. The plan produces assertions. The harness enforces them.

## Different Mindsets for Different Work

Here's the insight that clicked for us: **you maintain backpressure infrastructure in a fundamentally different mindset than you build features.**

When you're working on a feature, you're thinking forward. What does the user need? What's the smallest scope? Which files do I touch? The plan is specific, time-bound, and disposable — once the PR merges, the plan is history.

When you're working on backpressure infrastructure, you're thinking laterally. What class of mistakes can I prevent across ALL future work? A new lint rule isn't for one PR — it's for every PR from now on. A new test fixture isn't for one feature — it's for every feature that touches that subsystem. This is investment that compounds.

The two should never be mixed in the same plan. If during a feature plan you discover "we have no auth testing at all," that's a new ticket. The feature plan notes the gap and either blocks on it or accepts the risk. The infrastructure ticket gets its own plan, its own PR, its own review. Once merged, every future agent session benefits — including the one that found the gap.

```
Feature ticket:  "Add user deletion endpoint"
  → Plan references existing gates
  → Adds feature-specific test cases
  → make check test validates everything

Infra ticket:   "Add API security scanning to CI"
  → Separate plan, separate PR
  → Once merged, ALL future agent work benefits
  → Every ralph loop now has stronger backpressure, for free
```

This separation is why it compounds. Each infrastructure improvement makes every future feature plan cheaper to validate.

## The Strength Hierarchy

Not all backpressure is equal. The key variable is: **can the agent skip it?**

| Mechanism | Fires when | Agent can skip it? | Strength |
|---|---|---|---|
| Pre-commit hooks | Every `git commit` | No | Strongest |
| CI pipeline | Every `git push` | No | Strong |
| `CLAUDE.md` instructions | Agent reads it at session start | Yes, if context rotates | Medium |
| Plan success criteria | Agent reads the plan | Yes, if it rushes | Weaker |
| Inline prompt reminders | Agent reads the prompt | Yes, easily | Weakest |

The pattern is clear. **The less the agent has to "remember," the stronger the backpressure.** Pre-commit hooks and CI pipelines are infrastructure — they exist outside the agent's context window. `CLAUDE.md` is read once at the start of a session, so it's durable but not bulletproof. Plan criteria are read when the agent gets to that phase, which means context pressure can push them out.

The practical takeaway: invest in the top of this hierarchy. A pre-commit hook that runs `make check` in 5 seconds is worth more than 50 lines of prompt instructions telling the agent to be careful.

## What HumanLayer Gets Right

Looking at HumanLayer's setup at commit [`531d270`](https://github.com/humanlayer/humanlayer/commit/531d270ed839da44917ca4fef5d6c77111855d2b), they layer backpressure at multiple levels:

**Infrastructure layer** (can't skip):
- Pre-commit hooks: case conflict checks, YAML validation, trailing whitespace, Ruff linting
- `make check test` as the universal quality gate
- Linear status transitions as phase gates — the ticket must move through "research in review" and "plan in review" before reaching "ready for dev"

**Convention layer** (hard to skip):
- [`implement_plan.md`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/implement_plan.md) requires pausing between phases for manual verification
- Plan mismatch detection — if reality doesn't match the plan, execution stops and asks the human
- `TODO(0)` annotations mean "never merge" — a grep for `TODO(0)` in CI would catch these

**Cultural layer** (relies on prompt compliance):
- Read-only agent philosophy — sub-agents document what IS, never recommend changes
- "No Open Questions in Final Plan" policy
- Size filtering — ralph commands refuse tickets larger than SMALL

The strongest mechanisms are the ones the agent never has to think about. The pre-commit hook fires whether the agent remembers or not. The Linear status machine requires human approval between phases whether the agent wants to skip ahead or not.

## Calibrating the Pressure

Huntley warns that backpressure requires calibration — "just enough" to reject bad output without creating excessive delays. This is real. A test suite that takes 10 minutes per run will make your ralph loops crawl. A linter with 200 opinionated rules will generate so many failures that the agent spends more time fixing style than building features.

The sweet spot for AI agent backpressure:

- **Fast**: checks should complete in seconds, not minutes. The agent is in a loop — every delay multiplies.
- **Clear**: error messages should tell the agent exactly what's wrong and how to fix it. "Lint error on line 42: unused import" is good. "Build failed" is not.
- **Relevant**: every check should catch a class of real mistakes the agent actually makes. Don't add checks for problems you've never seen.

If your `make check` takes 30 seconds and your `make test` takes 2 minutes, that's 2.5 minutes of backpressure per iteration. In a ralph loop that runs 20 iterations, that's 50 minutes of verification. Worth it if those checks catch real issues. Not worth it if they're checking for theoretical problems.

## How to Start

If your project has no backpressure today and you want to add it for AI agent workflows:

**Week 1**: Get `make check` and `make test` working reliably from the command line. Document them in `CLAUDE.md`. This alone gives the agent a quality gate it can run after every change.

**Week 2**: Add pre-commit hooks for the fastest checks — formatting, type errors, import sorting. These should run in under 5 seconds. Now the agent can't commit bad code even if it tries.

**Week 3**: Add CI that runs the full suite on push. This catches anything the pre-commit hooks miss — integration tests, security checks, build verification. Now bad code can't reach main even if it gets committed locally.

**After that**: improve the harness based on what you observe. Watch the agent work. When you see it make the same mistake twice, add a check that catches it. When you see a check that never fails, consider removing it — it's adding latency without value.

Each improvement is a separate ticket, a separate PR, a separate review. Feature work benefits automatically.

## The Compound Effect

Here's why this framing matters. When backpressure is infrastructure, it compounds. Every check you add makes every future agent session better. Every lint rule you write catches mistakes across every feature. Every test fixture you build makes every future test easier to write.

When backpressure is per-plan ("remember to check X"), it doesn't compound. The next plan has to remember to include it again. The next agent session starts from zero. You're doing the same work repeatedly instead of investing once.

The strongest AI development setups will be the ones where the harness is so good that the plan barely needs to mention quality. The plan says "implement X" and the harness ensures X is correct. The agent doesn't need to be told to check — the walls are already there.

Build the walls. Then let the agent run.
