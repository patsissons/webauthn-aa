# Agent guide

Working notes for AI agents (and humans) contributing to this repo. See
[`README.md`](README.md) for the project overview and stack.

## Golden rule: validate before you call work done

After completing any change, run the full validation gate and make sure it
passes. If it fails, **fix the regression** — do not leave the tree broken or
hand back failing work.

```bash
pnpm validate
```

`pnpm validate` runs the following steps **in order**, stopping at the first
failure:

1. `pnpm format:check` — Prettier formatting is consistent
2. `pnpm typecheck` — TypeScript has no errors (`turbo run typecheck`)
3. `pnpm lint` — ESLint passes (`eslint .`)
4. `pnpm test` — unit tests pass (`turbo run test`, Vitest)
5. `pnpm test:e2e` — end-to-end tests pass (`playwright test`, full stack)

Each step is also runnable on its own (handy while iterating); `pnpm validate`
is just the meta-script that chains them.

## Formatting

This repo uses **Prettier** (config in `.prettierrc.json`). After writing or
editing files, run:

```bash
pnpm format        # writes formatting fixes across the repo
```

`pnpm format:check` (the read-only variant used by `pnpm validate`) will fail
CI/validation if anything is unformatted, so format as you go rather than
leaving it for the gate to catch.

## Linting

**ESLint** (flat config in `eslint.config.mjs`) provides basic correctness
linting. Type-aware rules are intentionally off — `pnpm typecheck` owns type
safety. Use `pnpm lint:fix` to auto-fix what's mechanically fixable.

## Tests

- Unit tests are Vitest (`*.test.ts`), colocated with the code they cover.
- End-to-end tests are Playwright specs under `e2e/`. `pnpm test:e2e` boots the
  full stack (both Next apps + both PocketBase instances) via the Playwright
  `webServer` config, so it needs the PocketBase binary present (`pnpm install`
  downloads it).
- e2e runs against **isolated** PocketBase data dirs (`pocketbase/*/pb_data_test`,
  gitignored) via the `dev:test` script, so they never pollute the `pnpm dev`
  database. The test webServer uses the same ports and does not reuse an existing
  one — stop a manually-running `pnpm dev` before running e2e.
- Shared e2e helpers and fixtures live in `e2e/support/` (e.g. the fake-ID
  specimen fixtures in `e2e/support/fake-id.ts`).

## Script reference

| Script              | What it does                                 |
| ------------------- | -------------------------------------------- |
| `pnpm validate`     | format:check → typecheck → lint → test → e2e |
| `pnpm format`       | Prettier write (use after editing files)     |
| `pnpm format:check` | Prettier check (no writes)                   |
| `pnpm lint`         | ESLint                                       |
| `pnpm lint:fix`     | ESLint with `--fix`                          |
| `pnpm typecheck`    | `tsc --noEmit` across the workspace          |
| `pnpm test`         | Vitest unit suites                           |
| `pnpm test:e2e`     | Playwright end-to-end suite                  |
