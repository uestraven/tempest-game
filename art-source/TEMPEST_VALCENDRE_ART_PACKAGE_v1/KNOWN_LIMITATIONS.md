# TEMPEST Valcendre v1 — remaining limitations after B.2-03A recovery

## Missing-file status

**B.2-03A has been physically included and source-production assets revalidated.** No required B.2-03A source files are missing. The former `ARCHITECTURE_PROOF_MISSING.md` placeholder was removed.

## Accepted proof limitations (not package blockers)

- The B.2-03A 32-tile modular atlas is an **additive proof**, not a replacement of the game's 48-slot legacy tilesheet. Engine remapping still requires a coding-agent design.
- The window and door source components have an opaque plaster backdrop. Applying them on ashlar limestone requires masking, a separately authorized source-art variant, or suitable facade composition. No source art was changed in this consolidation.
- The supplied roof family is slate only. Terracotta and gables remain future art tasks; neither was fabricated.
- Plinth placement in this proof can consume a full 16px tile row; Art Bible v2 requests a 3px strip; evaluate visually in-engine rather than silently change geometry.
- Some source manifests and the palette's `PROPOSED_FOR_REVIEW` metadata reflect the time they were authored. Their bytes were preserved. Package-level approval and audits supersede those historical status notes **only for the controlled proof batch**.

## Open B.2-04 integration risks

- Fountain origin/anchor (16,29) must not change map coordinates/collision at market (24,47).
- Market stall 80×48 base and canopy use shared local (0,0); engine owns actor y-sorting. Canopy must never add collision or unintentionally hide V1 clue at (30,47).
- Lookout pistol is baked into aim/fire sprites; disable duplicate weapon overlay and position muzzle flash from manifest.
- Lookout contrast on dark garage floors and animation in motion are not validated by static art previews.
- Roof foreground sorting, 16px modular alignment, window/plaster patches, surface continuity, and concealment read require real native 480×270 game captures.
- Tempest source directional sheets remain approved **reference** artwork; not part of this batch's production asset directory.
- Other enemy characters, portraits and remaining 45 legacy props are outside this proof package.

**This package has no missing art-file blockers for a small, controlled market-slice integration. It is not a complete game-art replacement or a completed browser integration.**
