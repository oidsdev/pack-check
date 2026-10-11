# Bugbot review rules — Pack Check (oidsdev/pack-check)

Validation tool for agent skill packs.

## Blocking (must flag)

- **No secrets or credentials** in code, examples, or test fixtures.
- **Validation must not have false negatives on security.** Flag any change
  that weakens detection of secrets, unsafe install commands, or PII in
  packs being validated.
- **No destructive operations** without explicit user confirmation.

## Non-blocking (suggest)

- Copy must be brief and human. No em dashes.
- Validation error messages should tell the pack author exactly what to fix.

## Context

- This tool guards the quality bar for the skill ecosystem. Its own bar
  must be at least as high as what it enforces.
