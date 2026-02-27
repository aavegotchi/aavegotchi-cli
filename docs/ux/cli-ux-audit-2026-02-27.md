# CLI UX Audit - 2026-02-27

Scope: `aavegotchi-cli` command surface and failure/assistive UX.

## Summary

High-impact discoverability gaps were concentrated around help and mapped writes. This pass implements command-targeted help, mapped alias guidance, and unknown-command suggestions.

## Findings and status

### P0 - Mapped write commands were not self-describing

- Symptom: `ag baazaar buy-now --help` did not provide usage, required flags, or mapped function details.
- Impact: users had to manually inspect external contract ABIs to construct calls.
- Status: fixed in this pass.
- Fix:
  - Added per-command help routing (`ag <command> --help`, `ag help <command>`).
  - Added mapped command help that shows:
    - mapped onchain method,
    - required flags (`--abi-file`, `--address`, `--args-json`, profile),
    - dry-run usage pattern.
  - Added optional ABI-derived signature introspection for mapped help when `--abi-file` is supplied.

### P0 - No command-specific help routing existed

- Symptom: only top-level `ag help` existed.
- Impact: high trial/error cost for all command families.
- Status: fixed in this pass.
- Fix:
  - `ag --help`, `ag <command> --help`, and `ag help <command>` now route to scoped help text.
  - Added scoped help for all currently implemented command families and wrappers.

### P1 - Unknown command recovery was weak

- Symptom: unknown commands did not suggest nearby valid commands.
- Impact: typo recovery was slow.
- Status: fixed in this pass.
- Fix:
  - Added known-command catalog and fuzzy suggestions in `UNKNOWN_COMMAND` error details.

### P1 - Stub command errors lacked actionable alternatives

- Symptom: planned namespace errors did not show mapped command options for that root.
- Impact: users could assume command was impossible when a mapped alias existed.
- Status: fixed in this pass.
- Fix:
  - Stub errors now include `availableMapped` for the failing root plus clearer hint text.

## Residual gaps (next pass)

### P1 - Canonical ABI and contract address registry is still externalized

- Current limitation: mapped help can print exact signature only when `--abi-file` is provided.
- Desired UX: zero-setup command generation for canonical Base addresses and known facets.
- Proposed next step:
  - vendor/maintain a canonical address + ABI registry per chain/profile in-repo,
  - allow mapped commands to default `--address` and signature metadata without user-supplied ABI files.

### P2 - Guided arg templates for mapped commands

- Current state: mapped help provides generic `--args-json` placeholders unless ABI introspection is available.
- Proposed next step:
  - add command-specific argument template examples backed by canonical ABI metadata.
