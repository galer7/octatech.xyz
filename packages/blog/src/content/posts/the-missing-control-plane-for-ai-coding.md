---
title: "The Missing Control Plane for AI Coding"
description: "Every layer of the AI coding stack exists — except the one that lets humans choose when to review and when to let it rip. That's what we're building next."
date: 2026-02-08
tags: ["ai", "development-workflow", "claude-code", "engineering", "octatech"]
author: "Octatech Team"
---

The AI coding stack has three layers. Two of them are solved. The third — the one that actually matters for teams — doesn't exist yet.

## The Three Layers

Here's the model we've been converging on after studying how the most productive AI-native developers actually work:

```
Layer 3:  Control Plane     ← MISSING
Layer 2:  Outer Loop        ← Ralph loops, Gas Town, Loom
Layer 1:  Inner Loop        ← Claude Code, Amp, Aider, Cline, OpenCode
Layer 0:  Model             ← Claude Opus, Sonnet, GPT, Gemini
```

**Layer 0 — the model** is what everyone talks about. Claude, GPT, Gemini. The raw intelligence. Not much to do here as a developer except pick one.

**Layer 1 — the inner loop** is a single agent session. You give it a task, it reads files, calls tools, edits code, runs tests. Claude Code, Amp, Aider, Cline — they all do this. The session lives and dies within a single context window. When context fills up, the session is over.

**Layer 2 — the outer loop** is what happens *between* sessions. Something spawns a fresh agent, gives it a focused task, collects the output, and decides what to do next. This is where [Ralph loops](https://ghuntley.com/specs), [Gas Town](https://github.com/steveyegge/gastown), [Geoffrey Huntley's Loom](https://github.com/ghuntley/loom), and [HumanLayer's pipeline](https://github.com/humanlayer/humanlayer) operate.

**Layer 3 — the control plane** would let you toggle between autonomous and interactive execution, route tickets based on complexity, and give humans a purpose-built interface for reviewing AI-generated research, plans, and code. It doesn't exist.

## What Exists at Each Layer

### Inner Loop (Solved)

The inner loop tools all converge on the same architecture: a REPL that sends prompts to an LLM, receives tool calls back, executes them (file edits, bash commands, web searches), and loops until the task is done or context runs out.

The differences between Claude Code, Amp, Aider, and Cline are real but shrinking. They all support multiple models, tool use, and some form of plan-then-execute. The inner loop is commoditized.

### Outer Loop (Partially Solved, Diverging Approaches)

This is where it gets interesting. Three different groups have independently arrived at the same insight — **fresh context per phase is the key architectural decision** — but they've built very different systems around it.

**HumanLayer's Ralph Pipeline** splits development into discrete phases, each running in a fresh Claude Code session:

1. [`/ralph_research`](https://github.com/humanlayer/humanlayer) — picks the highest priority ticket, investigates the codebase, produces a research document
2. [`/ralph_plan`](https://github.com/humanlayer/humanlayer) — reads the research doc in a clean context, creates a detailed implementation plan
3. [`/ralph_impl`](https://github.com/humanlayer/humanlayer) — reads the plan in a clean context, sets up a git worktree, implements, commits, opens a PR

Each phase gets the full context window dedicated to its job. The research agent doesn't waste tokens on implementation details. The implementation agent doesn't waste tokens on codebase exploration — it just reads the plan and executes. Artifacts (markdown documents in a `thoughts/` directory) are the handoff mechanism between phases.

The hard constraint: Ralph only handles XS/S tickets. There is no "big Ralph loop." A human decomposes large features into small tickets, and Ralph executes them one at a time. The human is the orchestrator.

**Steve Yegge's Gas Town** takes a different approach: scale through parallelism. A "Mayor" agent decomposes work into small tasks ("beads"), then 20-30+ "Polecat" agents execute them simultaneously in isolated git worktrees. A "Refinery" agent handles merges. The [GUPP principle](https://github.com/steveyegge/gastown) (Gas Town Universal Propulsion Principle) means agents never wait for confirmation — they grab work and execute immediately.

Gas Town doesn't have research→plan→implement phasing. The Mayor does all the planning upfront, then Polecats just execute. There are no human gates between steps. This makes it fast but means planning quality is entirely front-loaded onto the human. Yegge reportedly spends hours planning before unleashing agents.

Cost: roughly $100/hour in API tokens at scale.

**Geoffrey Huntley's Loom** is the most ambitious. It's a full platform — 80+ Rust crates — that reimagines the entire development stack around autonomous agents. Key concepts:

- **Weavers** are agents running in Kubernetes pods with remote execution environments
- **Threads** are serialized conversation sessions (audit trails) that persist across agent restarts and can be loaded as context into other agents
- **Spool** is a source control system built on a JJ fork, designed for agents rather than humans
- A **server-side LLM proxy** means API keys never leave the server — clients just talk to the proxy
- Full **eBPF auditing** of everything an agent does inside a weaver
- **WireGuard networking** between the server, local machine, and remote weavers

In his [live demo](https://www.youtube.com/watch?v=zX_Wq9wAyxI), Huntley described the core philosophy:

> "Everything that we have today has been built under the false assumption for humans. Now that we have this brand new computer, we can reimagine the last 40 years of computing and design it around autonomous agents first, humans second."

Loom's approach to loops is recursive: an agent can spawn weavers, run Ralph loops inside them, port-forward running services between weavers for cross-agent verification, and feed thread outcomes back as context. "Meta loops" — loops orchestrating loops. The entire system was built in three days over New Year's Eve using the same Ralph loop technique it's designed to support.

All three projects share the same conviction: the important architectural boundary is between agent sessions, not within them. Fresh context per task. Artifacts as handoff. Git worktrees for isolation.

## What's Missing: The Control Plane

None of these systems answer the question: **who decides what runs autonomously and what requires human review?**

Right now, the answer is implicit:
- HumanLayer: the human manually invokes each Ralph phase
- Gas Town: everything runs autonomously (GUPP principle)
- Loom: Huntley drives it by hand, plans to automate later

There's no middle ground. No tool that lets you say: "auto-approve research on XS tickets, require review on plans for M+ tickets, auto-merge implementations if tests pass."

The tools that come closest to a review interface are either too narrow or too tied to existing paradigms:

- **[Vibe Kanban](https://github.com/BloopAI/vibe-kanban)** — open-source kanban board with built-in diff review for AI agent output, but no phase-gated approval
- **[Continue Mission Control](https://blog.continue.dev/introducing-mission-control-your-ai-dashboard/)** — web dashboard with an Inbox for tracking what needs review, but still in beta
- **[GitHub Agent HQ](https://github.blog/news-insights/company-news/welcome-home-agents/)** — multi-agent orchestration with Plan Mode inside GitHub's UI, but approval is PR-based
- **[Google Antigravity](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)** — "Manager View" for orchestrating agents with reviewable Artifacts, but locked to the Gemini ecosystem
- **[Opcode](https://opcode.sh/)** — desktop GUI wrapping Claude Code with visual Plan Mode, but single-session focused

Linear, Jira, and GitHub Issues are the wrong UI for this. They were designed for humans tracking human work. What we need is a purpose-built interface where AI does the work and humans review the output at stage gates.

## The Two Modes

The missing control plane needs to support two fundamentally different modes of operation:

**Autonomous mode — "Let it rip overnight."** You have a pre-approved plan or a batch of well-scoped tickets. The system chains research→plan→implement automatically, uses git worktrees for isolation, and produces PRs for morning review. This is Gas Town's model. This is what you want for grinding through a backlog of bug fixes or implementing a feature you've already designed.

**Interactive mode — "Incremental development."** A ticket arrives. The system auto-runs research. The research doc lands in your inbox. You read it, maybe edit it, and approve. The system runs planning. The plan lands in your inbox. You review, adjust scope, approve. Implementation runs. A PR appears. Standard code review.

The smart version lets you mix modes per phase:

```
Ticket ENG-302 (size: XS, type: bug)
  Research:    [auto-approve]     ← low risk, just codebase exploration
  Plan:        [auto-approve]     ← XS bugs have obvious plans
  Implement:   [auto-approve if tests pass]

Ticket ENG-303 (size: L, type: new feature)
  Research:    [auto-approve]     ← still low risk
  Plan:        [require review]   ← this is where human judgment matters
  Implement:   [require review]   ← large changes need human eyes
```

Complexity routing. Per-phase approval policies. Automatic escalation when an agent is uncertain or tests fail. This is the control plane.

## What We're Building

Octatech's next project is this control plane. Here's what we know so far about the architecture:

**Git worktrees as the isolation primitive.** Every phase runs in its own worktree. Research, planning, and implementation never share a working directory. This is already proven by HumanLayer, Gas Town, and Loom.

**Account rotation for inner loop tools.** Many teams run multiple Claude Code (or other) subscription accounts. The system takes the next available account for each agent session, rotating when rate limits or quotas are hit. This is how you scale to many concurrent agents without hitting per-account ceilings.

**Pluggable inner loops.** The control plane doesn't care whether the agent underneath is Claude Code, Amp, Aider, or Loom. It spawns a session, passes a task, collects the output. The inner loop is a black box.

**Artifacts as the handoff format.** Research produces a markdown document. Planning produces a plan document. Implementation produces a PR. These are the reviewable units. They're stored in git (like HumanLayer's `thoughts/` directory), not in a database.

**A review UI that isn't a ticket tracker.** A web interface with columns for each phase — Backlog, Research Review, Plan Review, Code Review, Done. Each card expands to show the full artifact. Approve/reject buttons trigger the next phase or send feedback to the agent for revision.

**Ralph loops as the automation engine.** The system wraps the research→plan→implement pattern in a configurable loop. For autonomous mode, the loop runs end-to-end. For interactive mode, the loop pauses at configured gates and posts to the review inbox.

We don't have all the answers yet. The relationship between the control plane and existing issue trackers (Linear, GitHub Issues) needs to be figured out — probably bidirectional sync rather than replacement. The prompting strategy for each phase needs to be tunable per-project. The account rotation mechanism needs to handle different providers with different rate limiting models.

But the core thesis is clear: the inner loop and outer loop are solved problems. The missing piece is the layer that lets teams decide how much autonomy to grant, per ticket, per phase, and gives humans a purpose-built interface for the review moments that matter.

That's the control plane. That's what we're building.
