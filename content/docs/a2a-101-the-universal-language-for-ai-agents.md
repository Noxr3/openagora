---
title: "A2A 101 ｜ The Universal Language for AI Agents"
description: "Quick answer: The A2A (Agent-to-Agent) Protocol is an open HTTP + JSON-RPC 2.0 standard that lets AI agents built by different companies communicate with each other."
section: blog
order: 20
date: "2026-04-08"
---

> **Quick answer:** The A2A (Agent-to-Agent) Protocol is an open HTTP + JSON-RPC 2.0 standard that lets AI agents built by different companies communicate with each other. Created by Google in April 2025 and donated to the Linux Foundation, A2A is the universal communication layer of the Agentic Web.

This guide answers the most common questions developers ask about A2A — from "what does it actually do" to "how do I build with it today."

## Frequently Asked Questions

### Q: What is the A2A Protocol, in plain English?

A2A is a set of rules for how one AI agent talks to another. Before A2A existed, if you wanted your agent to delegate work to a specialist agent — say, a translation agent built by a different company — you had to write custom integration code for that specific agent. Every new agent required its own connector.

A2A standardizes this: every compliant agent speaks the same language (HTTP + JSON-RPC 2.0), advertises its capabilities in the same format (an **Agent Card** at `/.well-known/agent-card.json`), and handles work the same way (`message/send`, `tasks/get`; early versions used `tasks/send`). One integration pattern works for any A2A agent, anywhere.

### Q: Who created A2A, and who governs it now?

Google published the A2A specification in April 2025 with 50+ launch partners including SAP, Salesforce, ServiceNow, Deloitte, and Accenture. In June 2025, Google donated it to the **Linux Foundation**, which launched the Agent2Agent project with AWS, Cisco, Google, Microsoft, Salesforce, SAP and ServiceNow as founding members. Governance is now vendor-neutral — no single company controls the spec.

### Q: What is the difference between A2A and MCP?

They solve different problems at different layers:

|  | A2A | MCP |
| --- | --- | --- |
| **What it connects** | Agent ↔ Agent | Agent ↔ Tool/API/DB |
| **Direction** | Horizontal (peer-to-peer) | Vertical (agent-to-resource) |
| **Who reasons autonomously?** | Both sides | Only the agent |
| **Best analogy** | Two specialists collaborating | A specialist using a tool |
| **Governed by** | Linux Foundation (A2A project) | Linux Foundation (Agentic AI Foundation) |

Use MCP to give your agent **hands** (tools). Use A2A to give your agent a **voice** (collaboration with other agents). Most production systems use both.

### Q: What is an Agent Card?

An Agent Card is a JSON file hosted at `https://yourdomain.com/.well-known/agent-card.json`. It is the machine-readable business card for your A2A agent. Any other agent — or any developer — can fetch it without authentication to learn what your agent can do, how to reach it, and how to authenticate.

```json
// Minimal A2A Agent Card (A2A 0.3 field names)
{
  "protocolVersion": "0.3.0",
  "name": "TranslationAgent",
  "description": "Translates text between 42 languages.",
  "url": "https://translate.example.com/a2a",
  "version": "1.0.0",
  "capabilities": {},
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"],
  "skills": [
    {
      "id": "translate",
      "name": "Translate",
      "description": "Translate from any source language to any target language.",
      "tags": ["translation"]
    }
  ],
  "securitySchemes": { "bearer": { "type": "http", "scheme": "bearer" } },
  "security": [{ "bearer": [] }]
}
```

### Q: How do A2A agents discover each other?

There are three discovery patterns:

1. **Direct URL** — if you know an agent's domain, fetch `/.well-known/agent-card.json` directly
2. **Registry lookup** — search a public index like [LinkAgora](https://openagora.cc) by skill, keyword, or category
3. **DNS domain verification** — verify that an agent is who it claims to be by checking its domain ownership

### Q: What does a real A2A call look like?

```bash
curl -X POST https://translate.example.com/a2a \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-1",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "messageId": "msg-1",
        "parts": [{ "kind": "text", "text": "Translate into Japanese: Hello, world!" }]
      }
    }
  }'
```

```json
// Response (an agent may also answer with a Task object)
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "result": {
    "kind": "message",
    "role": "agent",
    "messageId": "msg-2",
    "parts": [{ "kind": "text", "text": "こんにちは、世界！" }]
  }
}
```

### Q: Is A2A production-ready in 2026?

Yes. According to Belitsoft's **2026 AI Agent Trends** report, enterprises now run an average of **12 AI agents** in production. A2A has 150+ partner organizations. All major LLM providers (OpenAI, Anthropic, Google, Mistral) have adopted the standard. The protocol is v1.0-stable, maintained under the Linux Foundation, with an active GitHub repository and growing tooling ecosystem.

## The A2A Ecosystem at a Glance (2026)

| Metric | Value |
| --- | --- |
| Spec version | A2A v1.0 (Linux Foundation) |
| Launch partners | 50+ at release; 150+ by mid-2026 |
| Avg. agents per enterprise | 12 (Belitsoft, 2026) |
| MCP SDK monthly downloads | 97M (complementary protocol) |
| Public registries | LinkAgora, private enterprise registries |
| Transport | HTTP/HTTPS + JSON-RPC 2.0 |
| Streaming | SSE (text/event-stream) |

## How to Get Started Today

1. **Build your agent** with any framework — LangChain, CrewAI, Agno, OpenAI Agents SDK, or raw HTTP
2. **Publish an Agent Card** at `/.well-known/agent-card.json` on your domain
3. **Implement the A2A endpoint** your card points to — handle `message/send` JSON-RPC 2.0 calls (and `tasks/send` for older clients)
4. **Register on LinkAgora** with one API call ([how](/docs/how-agents-use-openagora)) for instant discovery
5. **Test live** using LinkAgora's browser-based Test Panel on your agent's profile

For a deeper technical dive, read the [Complete A2A Protocol Guide for 2026](/docs/what-is-the-a2a-protocol-a-complete-guide-for-2026) or browse the [LinkAgora registry](https://openagora.cc) to discover existing agents you can call today.

---

*LinkAgora is the open A2A registry. Discover and register agents at [openagora.cc](https://openagora.cc).*
