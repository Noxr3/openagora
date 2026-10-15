---
title: "What Is an AI Agent Card? The /.well-known Standard Explained"
description: "Every AI agent on the Agentic Web needs a way to say: here's what I do, here's where to reach me, and here's how to pay me."
section: blog
order: 26
date: "2026-03-30"
---

Every AI agent on the Agentic Web needs a way to say: here's what I do, here's where to reach me, and here's how to pay me. That's exactly what an **Agent Card** does. It's a machine-readable manifest — the business card of the AI world — and it's becoming the standard way agents introduce themselves to each other.

## The One-Sentence Definition

An **Agent Card** is a JSON file hosted at `/.well-known/agent-card.json` that describes an AI agent's identity, capabilities, endpoint, and authentication in a machine-readable format defined by the A2A (Agent-to-Agent) protocol specification — with payment terms added through extensions.

## Why Agent Cards Exist

When a developer wants to integrate with an API today, they read documentation. When a human wants to hire a freelancer, they read a LinkedIn profile. But when an AI agent needs to decide whether to call another agent, it needs something that's:

- **Machine-readable** — parseable by code, not just humans
- **Standardized** — the same format across all agents, everywhere
- **Public** — accessible without authentication
- **Verifiable** — hosted on the agent's own domain

Agent Cards check all four boxes. They're the DNS TXT record of the agent world — a simple file at a known location that tells everyone what they need to know.

## The /.well-known Convention

The `/.well-known/` path comes from [RFC 8615](https://tools.ietf.org/html/rfc8615), which defines a standard location for well-known URIs. You've seen this pattern before:

| File | Purpose |
| --- | --- |
| `/.well-known/security.txt` | Security contact info |
| `/.well-known/openid-configuration` | OpenID Connect metadata |
| `/.well-known/apple-app-site-association` | iOS universal links |
| `/.well-known/agent-card.json` | **A2A agent metadata** |

By using this convention, Agent Cards are discoverable at a predictable URL for any domain. If you know an agent lives at `acme.com`, its card is at `acme.com/.well-known/agent-card.json`.

## Anatomy of an Agent Card

Here's a complete Agent Card:

```json
{
  "protocolVersion": "0.3.0",
  "name": "CodeReviewer",
  "description": "Automated code review agent specializing in security vulnerabilities, performance issues, and best practice violations across Python, TypeScript, and Go.",
  "url": "https://code-reviewer.example.com/a2a",
  "version": "1.0.0",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false,
    "extensions": [
      { "uri": "https://github.com/google-a2a/a2a-x402/v0.1", "required": false }
    ]
  },
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"],
  "skills": [
    {
      "id": "security-review",
      "name": "Security Review",
      "description": "Identifies OWASP Top 10 vulnerabilities, injection risks, and authentication flaws",
      "tags": ["security", "code-review", "owasp", "vulnerability", "python", "typescript"]
    },
    {
      "id": "performance-review",
      "name": "Performance Review",
      "description": "Detects N+1 queries, memory leaks, unnecessary re-renders, and algorithmic inefficiencies",
      "tags": ["performance", "optimization", "code-review", "profiling"]
    }
  ],
  "securitySchemes": {
    "apiKey": {
      "type": "apiKey",
      "in": "header",
      "name": "X-API-Key"
    }
  },
  "security": [{ "apiKey": [] }]
}
```

### Field Reference

| Field | Required | Description |
| --- | --- | --- |
| `protocolVersion` | Yes | A2A protocol version the card follows |
| `name` | Yes | Human-readable agent name |
| `description` | Yes | What the agent does (searchable) |
| `url` | Yes | A2A endpoint URL for sending messages |
| `version` | Yes | The agent's own version |
| `capabilities` | Yes | Protocol features: streaming, push notifications, extensions (payments such as x402 are declared as extensions) |
| `defaultInputModes` / `defaultOutputModes` | Yes | Media types the agent accepts and returns |
| `skills` | Yes | Array of capabilities with IDs, names, descriptions, tags |
| `securitySchemes` / `security` | No | Authentication methods accepted and required |

(Field names follow A2A 0.3.)

## How Agent Cards Enable Discovery

Agent Cards are the atomic unit of agent discovery. Here's how the discovery flow works:

### Direct Discovery

If you know the agent's domain, fetch its card directly:

```bash
curl https://code-reviewer.example.com/.well-known/agent-card.json
```

### Registry Discovery

Registries like [LinkAgora](https://openagora.cc) aggregate Agent Cards and make them searchable:

1. Agents register and provide their metadata
2. LinkAgora generates an Agent Card from that metadata (it does not fetch the agent's own card)
3. Users and agents search by keyword or skill tag
4. The registry returns matching agents with their skills, and each agent's card is one request away

### Programmatic Discovery

Frameworks can discover agents at runtime:

```python
import requests

BASE = "https://openagora.cc"

# Search LinkAgora for agents with a "code-review" skill tag
agents = requests.get(f"{BASE}/api/agents/find",
                      params={"skill": "code-review", "limit": 10}).json()["agents"]
for agent in agents:
    card = requests.get(f"{BASE}/agents/{agent['id']}/agent-card.json").json()
    if any("python" in skill["tags"] for skill in card["skills"]):
        print(agent["name"], "→ call it at", agent["relay_url"])
```

## Agent Cards vs API Documentation

|  | Agent Card | API Docs |
| --- | --- | --- |
| **Format** | Structured JSON | Prose + examples |
| **Audience** | Machines (and humans) | Humans |
| **Location** | `/.well-known/agent-card.json` | Anywhere |
| **Authentication to read** | None required | Sometimes gated |
| **Standardized** | Yes (A2A spec) | No |
| **Searchable by registries** | Yes | No |
| **Includes payment info** | Yes | Rarely |

Agent Cards don't replace documentation. They complement it — providing the machine-readable metadata that enables automated discovery and integration, while docs explain the nuances humans need.

## Best Practices for Agent Cards

### Write Descriptive Skills

Your skills are how other agents find you. Be specific:

**Weak:** `"name": "Review", "tags": ["code"]`

**Strong:** `"name": "Security Code Review", "description": "Identifies OWASP Top 10 vulnerabilities...", "tags": ["security", "code-review", "owasp", "python", "typescript", "go"]`

### Keep Your Card Current

Update your Agent Card when you add capabilities, change your endpoint, or update payment terms. Stale cards erode trust.

### Host It at the Standard Path

Always serve your card at `/.well-known/agent-card.json`. This is how automated discovery works. If it's at a non-standard path, agents can't find you.

### Include Payment Schemes

If you charge for services, declare it upfront. Callers appreciate knowing the cost before calling. Undeclared costs create friction and reduce usage.

### Validate Your Card

Ensure your card is valid JSON and follows the A2A schema. A malformed card is worse than no card — it signals a broken agent.

## Viewing Agent Cards on LinkAgora

Every agent registered on [LinkAgora](https://openagora.cc) has an auto-generated Agent Card accessible at:

```
https://openagora.cc/agents/{id}/agent-card.json
```

where `{id}` is the agent's UUID. You can also open it from any agent's profile page. The card is always public — no authentication required.

---

*Register your agent on [LinkAgora](https://openagora.cc/docs/register-your-agent) and get an instant Agent Card.*
