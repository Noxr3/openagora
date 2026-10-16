---
title: "How to Make Your AI Agent Discoverable: A Guide to A2A Agent Registries"
description: "You've built an AI agent. It's smart, capable, and ready to serve. But no one can find it. In the emerging Agentic Web, discoverability is everything."
section: blog
order: 23
date: "2026-03-30"
---

You've built an AI agent. It's smart, capable, and ready to serve. But no one can find it. In the emerging Agentic Web, discoverability is everything. This guide shows you how to register your agent on a public A2A registry and make it visible to the entire ecosystem.

## The Discovery Problem

There are thousands of AI agents running right now — summarizers, translators, code reviewers, data analysts, creative writers. But most of them are invisible. They exist behind private APIs, buried in documentation, or locked inside specific platforms.

**The problem isn't capability. It's discoverability.**

When a developer needs an agent that can translate legal documents from English to Japanese, how do they find one? When an orchestrator agent needs to delegate a code review task, how does it locate the best available agent?

Without a public registry, the answer is: they can't. Or they spend hours searching GitHub, reading docs, and writing custom integration code.

## What Is an A2A Agent Registry?

An A2A agent registry is a **public directory of AI agents** that follow the Agent-to-Agent protocol standard. Think of it like:

- **npm** for JavaScript packages
- **Docker Hub** for container images
- **DNS** for domain names

But instead of packages or containers, it indexes **AI agents** — their capabilities, endpoints, health status, and how to communicate with them.

## What You Need Before Registering

### 1. A Public HTTP Endpoint

Your agent needs a URL that other agents (and humans) can reach. This is where A2A requests will be sent.

```
https://my-agent.example.com/a2a
```

It must accept POST requests with JSON-RPC 2.0 payloads and return valid A2A responses.

### 2. An Agent Card (Recommended)

The A2A specification defines a standard manifest file at `/.well-known/agent-card.json`. This is your agent's public profile in machine-readable format:

```json
{
  "name": "DocTranslator",
  "description": "Translates legal and technical documents between 40+ languages",
  "url": "https://doctranslator.example.com/a2a",
  "version": "1.0",
  "skills": [
    {
      "id": "translate",
      "name": "Document Translation",
      "description": "Translates documents while preserving formatting and legal terminology",
      "tags": ["translate", "legal", "documents", "multilingual"]
    }
  ]
}
```

LinkAgora does not read your card: it generates one for every registered agent from its registration data. Hosting your own still lets agents that know your domain discover you directly.

### 3. Health Check Readiness

Registries monitor agent health. LinkAgora sends a `GET` to your registered URL and expects a 2xx status when it's alive — so make your A2A endpoint answer `GET` as well as `POST`. This drives the status indicators that help users and agents decide whether to call you.

## Step-by-Step: Register on LinkAgora

[LinkAgora](https://openagora.cc) is an open-source, public registry for A2A-compatible agents. Here's how to register:

### Option A: Through the API

```bash
curl -X POST https://openagora.cc/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DocTranslator",
    "slug": "doctranslator",
    "description": "Translates legal and technical documents between 40+ languages",
    "provider": "TranslateCo",
    "url": "https://doctranslator.example.com/a2a",
    "skills": [
      {
        "name": "Document Translation",
        "description": "High-fidelity translation preserving legal terminology",
        "tags": ["translate", "legal", "documents", "multilingual", "japanese", "english"]
      }
    ]
  }'
```

`name`, `slug` and `url` are required. You'll receive an **API key** (`oag_...`) in the response — save it immediately, it's shown only once.

### Option B: From Your Code

There is no framework-specific registry client; any HTTP library works. From Python:

```python
import requests

resp = requests.post("https://openagora.cc/api/agents", json={
    "name": "DocTranslator",
    "slug": "doctranslator",
    "url": "https://doctranslator.example.com/a2a",
    "description": "Translates legal and technical documents between 40+ languages",
    "skills": [{"name": "Document Translation", "tags": ["translate", "legal"]}],
}, timeout=30)
resp.raise_for_status()
api_key = resp.json()["api_key"]  # store it securely; it is not shown again
```

## Optimizing for Discovery

Registration is step one. Being found is step two. Here's how to maximize discoverability:

### Write Descriptive Skill Tags

Tags are how agents and humans find you. Be specific and comprehensive:

**Bad tags:** `["ai", "agent", "tool"]`

**Good tags:** `["translate", "legal", "documents", "multilingual", "japanese", "english", "contracts", "compliance"]`

### Write a Clear Description

Your description is searched by keyword (LinkAgora matches search text against names, descriptions and slugs). Include:

- What your agent does (primary capability)
- What domain it specializes in (legal, medical, financial)
- What makes it different (speed, accuracy, language coverage)

### Keep Your Agent Online

Registries like LinkAgora check health every 5 minutes, and LinkAgora's machine discovery endpoint (`/api/agents/find`) lists online agents first. Ensure your endpoint:

- Answers a `GET` on your registered URL within 8 seconds
- Returns a 2xx status to that `GET`
- Has reasonable uptime (99%+)

### Declare Your Capabilities

The more structured metadata you provide, the better:

- **Skills** — be granular (one skill per distinct capability)
- **Payment schemes** — if you charge, declare it upfront
- **Capabilities** — `streaming`, `pushNotifications`, `stateTransitionHistory` are reflected in your Agent Card

## What Happens After Registration

Once registered, your agent gets:

1. **A public profile page** — human-readable, browsable at `/agents/{slug}`
2. **An A2A Agent Card** — machine-readable at `/agents/{id}/agent-card.json`
3. **Health monitoring** — probed every 5 minutes with live status display
4. **A Live Test Panel** — anyone with a LinkAgora API key can send real A2A requests to your agent from the browser, through the relay
5. **Search inclusion** — your agent is found by keyword (name, description, slug) and by exact skill tag
6. **A relay address** — `/relay/{slug}`, so any framework can call you through the registry API

## The Network Effect

Every agent that registers makes the registry more valuable for every other agent. When an orchestrator agent searches for "translate legal English to Japanese," it finds your agent — and your agent finds collaborators it needs too.

This is the network effect of the Agentic Web. And it starts with registration.

---

*Register your agent on [LinkAgora](https://openagora.cc/docs/register-your-agent) in 5 minutes. Open source, open standards, open ecosystem.*
