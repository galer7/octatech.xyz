---
title: "How HumanLayer Uses an AI-Enabled Development Pipeline"
description: "A deep dive into HumanLayer's research, plan, implement approach — and why you still can't outsource the thinking to AI."
date: 2026-02-07
tags: ["ai", "development-workflow", "claude-code", "engineering"]
author: "Octatech Team"
---

*This review was conducted at commit [`531d270`](https://github.com/humanlayer/humanlayer/commit/531d270ed839da44917ca4fef5d6c77111855d2b). All links point to that snapshot — the codebase may have evolved since.*

After studying the [HumanLayer codebase](https://github.com/humanlayer/humanlayer) — their git history, merged PRs, Claude Code skills, and internal tooling — a clear picture emerges of how a small team ships fast with AI assistance. But the most interesting finding isn't what AI does for them. It's what it can't do.

## The Pipeline

HumanLayer has built a structured development pipeline codified as Claude Code skills (slash commands). The core loop is:

```
Research → Plan → Implement → Validate
```

Each step is a separate Claude Code skill that can be invoked:

- [`/ralph_research`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/ralph_research.md) — picks the highest priority ticket, investigates the codebase, and produces a research document
- [`/ralph_plan`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/ralph_plan.md) — takes a researched ticket, creates a detailed implementation plan with phases, file-level specificity, and success criteria
- [`/ralph_impl`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/ralph_impl.md) — takes a planned ticket, sets up a git worktree, launches a Claude Code session to implement, commit, and open a PR
- [`/validate_plan`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/validate_plan.md) — checks that implementation matches the plan

The plans are stored in a separate "thoughts" git repository, linked back to Linear tickets. PRs reference them explicitly. For example, [PR #859](https://github.com/humanlayer/humanlayer/pull/859) (multi-profile thoughts support) says in its description:

> "Built using humanlayer's research -> plan -> implement -> validate workflows"
> "Implementation docs: `thoughts/shared/plans/2025-11-13-GH-843-multi-profile-thoughts-support.md`"

And [PR #779](https://github.com/humanlayer/humanlayer/pull/779) (tagged stable build system) references three documents: two plan files and a research doc.

This isn't theoretical. It's practiced. There's even a meta-[PR #700](https://github.com/humanlayer/humanlayer/pull/700) titled "Add manual verification pause points between implementation phases" — a fix for the problem of AI agents rushing through multi-phase plans without waiting for human verification.

## The Plans Are Serious

An implementation plan in this system isn't a vague outline. The plan template is defined in [`create_plan.md`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/create_plan.md) and includes:

- **Current State Analysis** — what exists today, with `file:line` references
- **Desired End State** — a specification, not a wish
- **"What We're NOT Doing"** — explicit scope boundaries to prevent creep
- **Phased implementation** — each phase lists exact files to change, with code snippets
- **Success criteria per phase** — split into automated (e.g., `make test`) and manual (e.g., "feature works in UI")
- **Pause points** — the agent must stop between phases and wait for human confirmation

The rule is: **"No Open Questions in Final Plan."** If something is unclear, you stop and resolve it before writing the plan. The plan must be complete and actionable.

The execution side is handled by [`implement_plan.md`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/implement_plan.md), which follows the plan phase by phase, runs automated checks, and pauses for human verification between phases.

## The Hard Constraint: Ralph Only Does Small Things

Here's where it gets interesting. The Ralph pipeline — the automated loop that can research, plan, and implement a ticket end-to-end — has a hard gate:

> "Select the highest priority SMALL or XS issue from the list. If no SMALL or XS issues exist, EXIT IMMEDIATELY and inform the user."

This appears in all three Ralph skills: [`ralph_research`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/ralph_research.md), [`ralph_plan`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/ralph_plan.md), and [`ralph_impl`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/ralph_impl.md). The system literally refuses to work on anything medium or larger.

There is no "big Ralph loop." There is no skill that takes a large goal, breaks it into pieces, and loops over them. The [`/oneshot`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/oneshot.md) command (which chains research, plan, and implement in one go) still filters for XS/S tickets only.

## You Still Need to Think

This is the most important observation. The pipeline handles the *execution* of well-scoped work beautifully. But the *scoping itself* — deciding what's a ticket, how big it should be, how to sequence multiple tickets toward a larger goal — is entirely manual.

There is no `/breakdown` command. There are no sizing definitions (what makes something XS vs. S vs. M). There's no documented process for going from "we need to refactor SessionDetail" to five sequential tickets (ENG-2301 through ENG-2305, labeled Plan A through Plan E).

The evidence from the git history shows how this plays out:

- The **daemon** ([`hld/`](https://github.com/humanlayer/humanlayer/tree/531d270ed839da44917ca4fef5d6c77111855d2b/hld)) was built across 5 sequential branches (`daemon`, `daemon2`, `daemon3`, `daemon4`, `daemon5`), each merged before the next ([PR #188](https://github.com/humanlayer/humanlayer/pull/188) through [PR #192](https://github.com/humanlayer/humanlayer/pull/192)). A human decided those boundaries.
- The **SessionDetail refactor** was split into 5 Linear tickets, ordered from safest (quick wins/tech debt) to riskiest (responsive layout). A human sequenced those ([PR #731](https://github.com/humanlayer/humanlayer/pull/731), [#733](https://github.com/humanlayer/humanlayer/pull/733), [#739](https://github.com/humanlayer/humanlayer/pull/739), [#752](https://github.com/humanlayer/humanlayer/pull/752), [#753](https://github.com/humanlayer/humanlayer/pull/753)).
- The **PostHog integration** was 3 separate tickets across infrastructure, init integration, and event tracking. A human decomposed that ([PR #776](https://github.com/humanlayer/humanlayer/pull/776), [#772](https://github.com/humanlayer/humanlayer/pull/772), [#786](https://github.com/humanlayer/humanlayer/pull/786)).

In every case, a person decided the breakdown. Then AI executed each piece.

## This Is Not a Geoffrey Huntley Ralph Loop

[Geoffrey Huntley's vision](https://ghuntley.com/specs) of the Ralph Loop is: create a big enough plan, press go, leave the computer running for hours, come back to a completed feature.

That's not what HumanLayer does. Their "Ralph" is closer to a single-ticket executor than an autonomous loop. It:

1. Picks ONE small ticket
2. Does ONE research pass
3. Creates ONE plan
4. Implements it in ONE session (with a 15-minute timeout)
5. Commits, opens a PR, and stops

There is no looping. There is no multi-ticket orchestration. The human is the loop. You run `/ralph_impl`, it finishes, you check the PR, you run it again for the next ticket. The intelligence that decides *what to work on next* and *how work relates to other work* stays with the human.

## What This Tells Us

HumanLayer's pipeline is optimized for a specific shape of work: **small, well-scoped, pre-decomposed tickets where the hard thinking has already been done by a human**. Within that shape, AI handles the tedious parts excellently — reading the codebase, writing a detailed plan, implementing across multiple files, running tests, writing PR descriptions.

But the strategic layer — What should we build? How should we break it down? What's the right sequence? What's the right scope for each piece? — remains human work. And there's no tooling to change that, which suggests the team considers it a feature, not a gap.

The ticket management itself is handled through [`/linear`](https://github.com/humanlayer/humanlayer/blob/531d270ed839da44917ca4fef5d6c77111855d2b/.claude/commands/linear.md), which integrates with Linear's 12-state workflow (from Triage through Done). But the skill only creates and manages individual tickets — it doesn't help you decompose a big goal into smaller ones.

The lesson: if you want to use AI effectively for development, don't try to make one giant plan and hope the AI can execute it. Instead, invest your human thinking time in decomposition. Break the work into pieces small enough that each one is obvious to implement. Then let AI handle the obvious parts at speed.

The thinking is yours. The typing is theirs.
