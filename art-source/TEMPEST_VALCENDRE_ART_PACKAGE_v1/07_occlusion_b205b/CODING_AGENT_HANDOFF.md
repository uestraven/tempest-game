# TEMPEST — B.2-05B coding-agent handoff

## Approved art-side decision: NO production PNG edits

The existing 80×48 canopy and wooden base should stay byte-identical. The observed failure is consistent with an entire opaque canopy drawn above the character, not with damaged pixels in the canopy.

**Do not import a revised canopy:** this package intentionally supplies none. Preserve the source base/canopy and existing stall geometry.

## Requested rendering behavior (not code)

1. Confirm the actual integrated canopy's world top-left; B.2-03B-2 manifest *suggests* `(464,752)` only.
2. Draw the original canopy texture using **two non-overlapping source rectangles** with original local origin and native nearest-neighbor sampling: back roof `(0,0,80,17)` and front valance `(0,17,80,31)`. Ensure the second source rectangle starts at world/local y+17, rather than y0.
3. For actors entering the awning footprint **from the north and near the evidence**: draw `ground → whole structural base → back roof → actor → front valance → lower counter redraw (crop base y=26..47)`. The posts remain UNDER the front beam, as in the original source, while the lower counter remains correctly in front of the actor's lower body. With no actor, this entire source-rectangle composition must be **pixel-identical** to the approved base+canopy assembly.
4. For actors south/in front of the stall, draw `ground → base → full canopy → actor`. For actors clearly beside its x-extent, usual depth sorting is fine. For actors well north of the awning, full-canopy foreground is fine. Apply spatial rules consistently to Tempest and NPCs.
5. No changes to collision x29–33/y49, clue (30,47), HUD prompt, `shadowZones`, detection, mission logic or range. Keep current evidence marker/prompt above decorative occlusion using existing layering.
6. Capture actual B.2-04 in-engine 480×270 frame and compare Tempest at same feet position before/after. Verify motion at boundaries and no visual depth popping.

The provided three PNG previews are **ART REVIEW — NOT ENGINE**. Pixel-test placement `feet world (488,776)` is a plausible approach tile and must not be misrepresented as the user's recorded interaction location. Full canopy foreground covers 234/288 sprite pixels there; source-rect rendering reduces that to 76/288 in a static composition. At actual tile-center feet `(488,760)`, the existing canopy only covers 36/288 pixels in that model; actual origin/foot placement is required to localize the runtime issue.

**Art approval recommendation:** No repaint; approve the source-rect depth contract for engine trial, contingent on the real runtime capture.
