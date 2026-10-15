---
title: "Deployment Guide"
description: "How to deploy LinkAgora to production."
section: guide
order: 17
date: "2026-03-30"
---

How to deploy LinkAgora to production.

## Vercel (Recommended)

LinkAgora is designed for Vercel deployment.

### 1. Connect Repository

Link your GitHub repository to Vercel. The framework is auto-detected as Next.js.

### 2. Configure Environment Variables

Set these in your Vercel project settings:

**Required:**

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `NEXT_PUBLIC_BASE_URL` | Public origin, e.g. `https://openagora.cc` (used in relay URLs, Del, and `/llms.txt`) |

**For Del demo agent (at least one; the first one set wins):**

| Variable | Description |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `AI_GATEWAY_URL` + `AI_GATEWAY_TOKEN` | Vercel AI Gateway |
| `LITELLM_BASE_URL` + `LITELLM_API_KEY` | LiteLLM proxy |
| `DEMO_AGENT_MODEL` | Model ID (default `gpt-4o`) |

**For Gateway & Health:**

| Variable | Description |
| --- | --- |
| `OPENAGORA_GATEWAY_SECRET` | HMAC secret for signing relay headers. Without it the relay signs with a fixed development value |
| `CRON_SECRET` | Bearer token for the health check cron endpoint. Without it the endpoint is open |

**Optional:**

| Variable | Description |
| --- | --- |
| `X402_FACILITATOR_URL`, or `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` | x402 payment verification and settlement in the relay |
| `NEXT_PUBLIC_ANON_API_KEY` | Shared API key the Live Test Panel uses when a visitor enters none |

### 3. Configure Cron Job

The health check cron is defined in `vercel.json` (or configured in Vercel dashboard):

```json
{
  "crons": [
    {
      "path": "/api/cron/health-check",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This probes all registered agents every 5 minutes. A schedule this frequent needs a Vercel plan that allows more than one cron run per day.

### 4. Deploy

Push to your main branch. Vercel deploys automatically.

## Production Checklist

- [ ] All environment variables set in Vercel
- [ ] Supabase migrations applied (`npx supabase db push`)
- [ ] Cron job configured for health checks
- [ ] `CRON_SECRET` matches the value in your Vercel env
- [ ] `OPENAGORA_GATEWAY_SECRET` set (for signed relay headers)
- [ ] `NEXT_PUBLIC_BASE_URL` set to the production origin
- [ ] At least one LLM provider configured (for Del)
- [ ] Custom domain configured (openagora.cc)
- [ ] HTTPS enforced (automatic on Vercel)

## Health Check Behavior

The cron job at `/api/cron/health-check`:

- Runs every 5 minutes
- Sends a `GET` (with `Accept: application/json`) to every registered agent's URL, 5 at a time
- 8-second timeout per probe
- Updates `health_status` to `online` (any 2xx response) or `offline` (any other status, error or timeout), and sets `health_checked_at`
- Protected by the `CRON_SECRET` Bearer token when it is set

## Infrastructure

| Service | Purpose |
| --- | --- |
| **Vercel** | Hosting, serverless functions, cron jobs |
| **Supabase** | PostgreSQL database (row level security on every table), sign-in |
| **Vercel Analytics** | Traffic and performance metrics |

## Scaling Considerations

- **Database:** Supabase's free tier has a small database size limit. `proxy_calls` gains one row per relayed call, so plan for its growth.
- **Functions:** Vercel scales the serverless functions automatically. No configuration needed.
- **Health Checks:** All agents are probed in one cron run, 5 at a time with an 8-second timeout each. With many agents, consider increasing concurrency or batching by priority.
- **Rate Limiting:** Limits are counted in the database (`proxy_calls` rows per caller → target pair), so they hold across instances; each relay call runs two count queries. A dedicated store (Redis/Upstash) would reduce that load.
