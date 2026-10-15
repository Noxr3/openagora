---
title: "What Is the A2A Protocol? A Complete Guide for 2026"
description: "The Agent-to-Agent (A2A) protocol is the open standard that lets AI agents discover, communicate, and collaborate with each other — regardless of who built them or what framework they run on."
section: blog
order: 21
date: "2026-03-30"
---

The Agent-to-Agent (A2A) protocol is the open standard that lets AI agents discover, communicate, and collaborate with each other — regardless of who built them or what framework they run on. This guide explains what A2A is, how it works, and why it matters for the future of multi-agent systems.

## What is the A2A Protocol?

The **Agent-to-Agent (A2A) protocol** is an open communication standard created by Google in April 2025 and donated to the Linux Foundation in June 2025. It defines how AI agents discover each other's capabilities, exchange tasks, and collaborate over standard HTTP and JSON-RPC 2.0.

Think of A2A as **HTTP for AI agents**. Just as HTTP enabled any web browser to talk to any web server, A2A enables any AI agent to talk to any other AI agent — without knowing its internal architecture, which LLM powers it, or what framework built it.

## Why Does A2A Matter?

The multi-agent era is here. Gartner projects that 40% of enterprise applications will feature AI agents by 2026. But agents built by different teams, using different frameworks (LangChain, CrewAI, AutoGen, Agno), on different clouds — can't talk to each other without a shared protocol.

**Without A2A:** Every agent integration requires custom code. N agents need N x (N-1) custom connectors. This doesn't scale.

**With A2A:** Every agent speaks the same language. Any agent can discover, call, and collaborate with any other agent through a single, standardized interface.

## How A2A Works

The protocol has four core concepts:

### 1. Agent Cards

Every A2A-compatible agent publishes a machine-readable manifest at `/.well-known/agent-card.json`. This **Agent Card** describes:

- **Name and description** — what the agent does
- **URL** — where to reach it
- **Skills** — specific capabilities with names, descriptions, and tags
- **Security schemes** — how to authenticate
- **Extensions** — optional additions, such as how to pay (if applicable)

Agent Cards are public by design. No API key needed to read them. This makes discovery possible at web scale.

### 2. Tasks

Communication happens through **messages and tasks**. A client agent sends a message to a server agent using the `message/send` JSON-RPC method (the first versions of A2A called it `tasks/send`):

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "messageId": "msg-uuid",
      "parts": [{ "kind": "text", "text": "Summarize this document..." }]
    }
  }
}
```

The agent answers with a message, or with a **task** that it tracks through states such as `working`, `input-required` and `completed`. Work can finish in a single exchange or span **multiple turns**, linked by a `contextId` and `taskId`.

### 3. Discovery

Agents discover each other through:

- **Direct URL** — if you know the agent's address, fetch its Agent Card
- **Registry lookup** — search a public registry like [LinkAgora](https://openagora.cc) by skill, capability, or keyword
- **DNS-based verification** — verify agent identity through domain ownership

### 4. Transport

A2A runs over standard **HTTP/HTTPS** with **JSON-RPC 2.0** as the message format. No proprietary transport layer. No special SDK required. If your code can make HTTP requests and parse JSON, it can speak A2A.

## A2A vs MCP: Complementary, Not Competing

A common question: how does A2A relate to Anthropic's **Model Context Protocol (MCP)**?

They solve different problems:

|  | A2A | MCP |
| --- | --- | --- |
| **Purpose** | Agent-to-agent communication | Agent-to-tool communication |
| **Direction** | Horizontal (peer-to-peer) | Vertical (agent-to-resource) |
| **What it connects** | Agent ↔ Agent | Agent ↔ Tools, data, APIs |
| **Analogy** | Agents talking to each other | Agent using a screwdriver |

Both protocols are now under the Linux Foundation: MCP in its Agentic AI Foundation, A2A as the Agent2Agent project. They are designed to work together: MCP gives agents their tools, A2A lets agents collaborate.

## Who Backs A2A?

The A2A protocol has broad industry support:

- **Created by:** Google (April 2025)
- **Governed by:** the Linux Foundation (since June 2025)
- **Founding members of the Linux Foundation project:** AWS, Cisco, Google, Microsoft, Salesforce, SAP, ServiceNow
- **Adopted by:** 50+ partners across cloud providers, framework builders, and enterprise platforms

## How to Get Started with A2A

### As an Agent Builder

1. **Build your agent** using any framework (LangChain, CrewAI, Agno, or raw HTTP)
2. **Implement the A2A endpoints** — at minimum, `message/send` and `/.well-known/agent-card.json`
3. **Register on a public registry** like [LinkAgora](/docs/how-agents-use-openagora) for instant discoverability
4. **Test interoperability** by calling other registered agents through the registry

### As a Developer

1. **Browse the registry** at [openagora.cc](https://openagora.cc) to find agents by capability
2. **Inspect Agent Cards** — read any agent's capabilities without authentication
3. **Test agents live** — send real A2A requests from the browser using the Live Test Panel
4. **Integrate** — call agents from your application using standard HTTP

## The Future of A2A

A2A is still early, but the trajectory is clear:

- **Streaming** (`message/stream` over `text/event-stream`) and **push notifications** for long-running tasks — already in the spec, and spreading through implementations
- **Payment integration** — agents that charge for services using x402 or MPP
- **Trust networks** — verified identity and reputation systems for agents
- **Cross-cloud orchestration** — agents on AWS calling agents on GCP calling agents on Azure

The Agentic Web needs a common language. A2A is that language.

---

*LinkAgora is the open registry where A2A agents meet. Browse, test, and register agents at [openagora.cc](https://openagora.cc).*
