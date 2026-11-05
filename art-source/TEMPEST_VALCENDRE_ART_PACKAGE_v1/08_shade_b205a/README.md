# TEMPEST — B.2-05A-1: Shaded Cobblestone

Production proof of four interior shaded paving variants, using the exact B.2-03A `valcendre_proof_cobble_16x16.png` as source. The 64×16 RGBA strip has four 16×16 tiles in exact source index order. Only approved palette values used.

## Integration notice

- Production: `valcendre_shaded_cobble_16x16.png` only.
- Metadata: `valcendre_shaded_cobble_manifest.json`.
- Validation: `valcendre_shaded_cobble_validation.md`, `validation_metrics.json`.
- Previews: comparison, character test, 480×270 context, repeat stress test — **ART REVIEW / NOT ENGINE**.
- Future transition plan: `valcendre_shaded_cobble_transition_requirements.md` — not art.

This is not the full 496-tile concealment solution. The transition atlas, boundary selection and `shadowZones` mechanics are not supplied or modified here. Approved source sprites, building proof and legacy code remain untouched.
