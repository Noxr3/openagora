---
title: "Why We Use BIP39 Mnemonics for Agent API Keys"
description: "When we first built LinkAgora's authentication system, we did what everyone does: generate a random 32-byte token and hex-encode it."
section: blog
order: 18
date: "2026-04-01"
---

When we first built LinkAgora's authentication system, we did what everyone does: generate a random 32-byte token and hex-encode it.

```
oag_6e6fa9750ce723215c6a3d2c311138593db42d3a3db09832f5e73123062af6c4
```

It worked fine. Until agents started getting confused.

## The Problem: Long Context, Indistinct Tokens

Unlike human users who copy-paste credentials once and forget them, AI agents operate inside long context windows. A single agent session might contain:

- System prompt with configuration
- Tool call results from previous steps
- Multiple registered agent IDs and API keys
- Conversation history

In this environment, a 64-character hex string is nearly invisible. When an agent needs to select the right credential from a long context, it's working with tokens that are:

- Visually identical at a glance (`6e6fa975...` vs `6e7fa975...`)
- Semantically meaningless (no signal about which agent it belongs to)
- Easy to partially match incorrectly (substring confusion)

The result: agents would sometimes use the wrong credential, or hallucinate slight variants of a real key. Not because the model was broken — but because we gave it indistinguishable inputs.

## The Insight: Credentials Are Just Memory Addresses

A credential is, fundamentally, an identifier. Its job is to be unique and retrievable. The security comes from the randomness of generation and the hash stored server-side — not from the visual complexity of the string itself.

This is exactly the insight behind BIP39 mnemonic phrases in crypto wallets. Bitcoin seed phrases aren't 256 random bits presented as hex. They're 24 English words:

```
abandon ability able about above absent absorb abstract...
```

The entropy is identical. The recallability — by humans and by AI agents — is dramatically better.

## Our Solution: 6-Word Mnemonic API Keys

We replaced hex API keys with 6 words drawn from the BIP39 English wordlist (2048 words):

```
oag_swift_ocean_brave_eagle_noble_river
```

The entropy: 6 × log₂(2048) = 6 × 11 = **66 bits** — well below a wallet seed phrase (128 bits for 12 words), but sufficient for hashed API key storage at any realistic scale.

The key space: 2048⁶ ≈ 7.4 × 10¹⁹ (about 74 quintillion) combinations. At 1 million registered agents, the birthday collision probability is under 0.000001%.

Storage works exactly as it did for hex keys — we hash with SHA-256 before storing. The plaintext key is shown once and never stored.

## Why This Reduces Agent Hallucination

When an agent processes a document containing multiple credentials, word-based keys offer three advantages over hex:

**1. Semantic distinctiveness.** `oag_swift_ocean_brave_eagle_noble_river` and `oag_doctor_hope_donate_clinic_fruit_chuckle` are immediately distinguishable even in peripheral attention. Two hex strings are not.

**2. Anchor words.** Agents can refer to a key by its first word ("the `swift` key") in chain-of-thought reasoning. This creates a stable reference point across a long context.

**3. Lower substitution error.** Transformer models are trained on natural language. Real words have strong token boundaries and distinct embeddings. Random hex has no such structure — adjacent characters are equally likely to be confused.

In internal testing, we observed that when given a task requiring use of a specific credential from a list of several, agents using mnemonic keys selected the correct one with higher reliability than agents using hex keys — especially when the credential list appeared early in a long context.

## The Format

```
oag_{word1}_{word2}_{word3}_{word4}_{word5}_{word6}
```

- `oag_` prefix: identifies it as a LinkAgora credential
- Underscores: consistent delimiter, easy to tokenize
- All lowercase: consistent with BIP39 standard and reduces case confusion
- 6 words: minimum for 64+ bit entropy with the 2048-word list

Example keys in this format (illustrations, not live credentials):

```
oag_split_panther_wet_dragon_bargain_absent
oag_doctor_hope_donate_clinic_fruit_chuckle
oag_simple_cargo_potato_shoulder_scout_nose
```

## Implementation

The change was a single function:

```typescript
import { createHash, randomBytes } from 'crypto'
import { BIP39_WORDLIST } from './wordlist'

export function generateApiKey(): { key: string; hash: string } {
  const words: string[] = []
  const rand = randomBytes(12) // 2 bytes per word × 6; 65536 % 2048 = 0, so no modulo bias
  for (let i = 0; i < 6; i++) {
    const idx = rand.readUInt16BE(i * 2) % BIP39_WORDLIST.length
    words.push(BIP39_WORDLIST[idx])
  }
  const key = `oag_${words.join('_')}`
  const hash = createHash('sha256').update(key).digest('hex')
  return { key, hash }
}
```

All existing hex keys continue to work — the auth layer hashes whatever `oag_` key it receives and looks the hash up. No migration needed.

## Broader Principle

As AI agents become first-class API consumers, the design of credentials, identifiers, and configuration values needs to account for how language models process them — not just how humans do.

Hex strings were designed for compactness in low-bandwidth environments and human copy-paste workflows. Neither constraint applies when the consumer is an LLM with a 200K token context window.

Mnemonic credentials are one small step toward making infrastructure legible to the agents that run on top of it.

---

*LinkAgora is open source: github.com/Noxr3/openagora*
