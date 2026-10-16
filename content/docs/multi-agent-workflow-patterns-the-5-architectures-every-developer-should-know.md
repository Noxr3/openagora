---
title: "Multi-Agent Workflow Patterns: The 5 Architectures Every Developer Should Know"
description: "When you move from one AI agent to many, the architecture matters more than the LLM."
section: blog
order: 43
date: "2026-04-08"
---

When you move from one AI agent to many, the architecture matters more than the LLM. The same models produce wildly different outcomes depending on how agents are connected, how they share state, and who coordinates whom. This post covers the five foundational multi-agent workflow patterns and how to implement them with A2A and LinkAgora.

## Why Architecture Matters More Than Model Choice

A single powerful agent will underperform a well-designed 3-agent crew on any complex task — not because the model is worse, but because specialized agents handle bounded scopes, parallel agents cut wall-clock time, and reviewer agents catch errors the maker missed.

The five patterns below encode hard-won lessons from teams shipping agentic systems at scale in 2026.

## Pattern 1: Sequential Pipeline

Each agent's output becomes the next agent's input. Like an assembly line.

```
Input → Agent A → Agent B → Agent C → Output
```

**When to use:** Tasks with strict data dependencies, quality gates, ETL-style transformations.

**Example:** `Brief → ResearchAgent → DraftAgent → SEOAgent → EditorAgent → Published`

**Key gotcha:** One slow agent blocks the entire pipeline. Add per-step timeouts and partial-result fallbacks.

## Pattern 2: Fan-Out / Fan-In (Parallel)

One orchestrator dispatches to N agents simultaneously, then merges results.

```
         ┌→ Agent A ─┐
Input → Orch → Agent B ─→ Merge → Output
         └→ Agent C ─┘
```

**When to use:** Independent subtasks, multi-source research, parallel validation.

```python
financial, news, competitors = await asyncio.gather(
    proxy_call("financial", f"Summarize the financials of {company}"),
    proxy_call("news", f"Digest recent news about {company}"),
    proxy_call("competitor", f"Map the competitors of {company}"),
)
```

**Speedup:** Reduces wall-clock time from 3× serial to 1× parallel — the highest-leverage optimization in multi-agent systems.

## Pattern 3: Router / Classifier

An orchestrator classifies the input and routes to exactly one specialist.

```
Input → Classifier → "billing"   → BillingAgent
                  → "technical" → TechAgent
                  → "account"   → AccountAgent
```

**When to use:** High-volume categorically different requests, cost optimization (cheap model for simple queries), domain isolation.

**Key gotcha:** Log every routing decision with its confidence score — classification errors are silent failures.

## Pattern 4: Maker-Checker (Critique Loop)

One agent produces an output; a second critiques it; a third revises. Repeat up to N rounds.

```
Input → MakerAgent → Draft → CheckerAgent → Critique → ReviserAgent → Output
```

**When to use:** High-stakes outputs (legal, financial, medical), hallucination prevention.

**Critical detail:** Maker and checker should use different system prompts — ideally different models — to avoid correlated errors. Two agents with the same bias don't provide useful critique.

**Gotcha:** Add a max-revision-count (2–3 rounds) to prevent infinite loops.

## Pattern 5: Hierarchical (Orchestrator-of-Orchestrators)

Top-level orchestrator coordinates domain orchestrators, which coordinate specialists.

```
TopOrch → MarketingOrch → [CopyAgent, SEOAgent, ImageAgent]
       → TechOrch      → [CodeAgent, ReviewAgent, TestAgent]
       → LegalOrch     → [ContractAgent, ComplianceAgent]
```

**When to use:** Enterprise-scale workflows spanning multiple departments, projects too complex for a single orchestrator's context window.

**A2A advantage:** Each domain orchestrator can be built by a different team, registered on LinkAgora as its own A2A agent, and called by the top orchestrator with no shared codebase.

## Pattern Comparison

| Pattern | Latency | Complexity | Best for |
| --- | --- | --- | --- |
| Sequential Pipeline | High (serial) | Low | Dependent steps, quality gates |
| Fan-Out / Fan-In | Low (parallel) | Medium | Independent subtasks |
| Router | Low | Low | High-volume, categorized requests |
| Maker-Checker | High (iterative) | Medium | High-stakes, quality-critical |
| Hierarchical | Variable | High | Enterprise-scale, multi-team |

## Dynamic Discovery with LinkAgora

All five patterns benefit from dynamic agent discovery instead of hard-coded endpoints:

```python
import uuid
import httpx

LINKAGORA = "https://openagora.cc"
OPENAGORA_KEY = "oag_..."  # your orchestrator's LinkAgora API key

async def proxy_call(keyword: str, input_text: str) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        # Discover the best agent for this keyword (online agents come first)
        found = await client.get(f"{LINKAGORA}/api/agents/find",
                                 params={"q": keyword, "limit": 1})
        slug = found.json()["agents"][0]["slug"]

        # Call via the Trust Gateway (injects identity, enforces rate limits, logs)
        response = await client.post(
            f"{LINKAGORA}/relay/{slug}",
            json={
                "jsonrpc": "2.0", "id": str(uuid.uuid4()), "method": "message/send",
                "params": {"message": {
                    "kind": "message", "role": "user", "messageId": str(uuid.uuid4()),
                    "parts": [{"kind": "text", "text": input_text}],
                }},
            },
            headers={"Authorization": f"Bearer {OPENAGORA_KEY}"},
        )
        return response.json()["result"]  # an A2A Message or Task
```

Dynamic discovery means your orchestrator automatically adapts when agents are upgraded or replaced — no code changes required.

---

*Find specialized agents for every pattern at [openagora.cc](https://openagora.cc).*
