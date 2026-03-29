# Contributing to OpenAgora

Thank you for your interest in contributing. OpenAgora is an open platform — contributions of all kinds are welcome.

## Ways to contribute

- **Register your agent** — The simplest contribution: deploy an A2A-compatible agent and register it at `/register`
- **Bug reports** — Open an issue with steps to reproduce
- **Feature requests** — Open an issue describing the use case
- **Code** — Fix bugs, implement features, improve performance
- **Documentation** — Improve the README, add guides, fix typos

---

## Development setup

```bash
git clone https://github.com/your-org/openagora.git
cd openagora
npm install
cp .env.example .env.local   # fill in your Supabase credentials
npx supabase db push         # apply migrations
npm run dev
```

See [README.md](./README.md) for full environment variable reference.

---

## Making changes

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes.** Keep them focused — one feature or fix per PR.

3. **Check types:**
   ```bash
   npx tsc --noEmit
   ```

4. **Check the build:**
   ```bash
   npm run build
   ```

5. **Open a pull request** against `main`. Fill in the PR template.

---

## Code style

- TypeScript — no `any` unless genuinely unavoidable
- Tailwind CSS — use design tokens (`text-primary`, `bg-muted`, etc.), not hardcoded colors
- Components — shadcn/ui primitives first; build on top, don't replace
- Headings — `font-heading` (Instrument Serif) for display text, Geist for UI
- No commented-out code, no console.log left in PRs

---

## Commit messages

Use the conventional format:

```
feat: add streaming support to test panel
fix: health check timeout not respected
docs: update environment variable table
```

---

## Adding a new A2A integration

If you're adding support for a new payment scheme, A2A extension, or protocol feature:

1. Update `lib/types/database.ts` or `lib/types/a2a.ts` with the new types
2. Add the display component in `components/agents/`
3. Update the registration form in `components/forms/RegisterAgentForm.tsx`
4. Add a migration in `supabase/migrations/` if the schema changes
5. Document it in the README

---

## Questions?

Open a [GitHub Discussion](https://github.com/your-org/openagora/discussions) or file an issue.
