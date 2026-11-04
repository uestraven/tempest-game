#!/usr/bin/env python3
"""Emits valcendre_proof_manifest.json. Indices are derived, never typed twice."""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

COLS, ROWS = 8, 4
NAMES = [
    "wall_limestone_a", "wall_limestone_b", "wall_plaster", "wall_plaster_course",
    "wall_edge_top", "wall_edge_bottom", "wall_edge_left", "wall_edge_right",
    "wall_corner_tl", "wall_corner_tr", "wall_corner_bl", "wall_corner_br",
    "wall_plinth", "shade_footing", "shade_under_eave", "shade_corner",
    "roof_slate_a", "roof_slate_b", "roof_ridge", "roof_eave",
    "roof_edge_left", "roof_edge_right", "roof_corner_tl", "roof_corner_tr",
    "roof_corner_bl", "roof_corner_br", "roof_to_facade", "roof_eave_corner_l",
    "roof_eave_corner_r", "roof_ridge_end_l", "roof_ridge_end_r", "threshold",
]

FAMILY = {
    **{n: "masonry" for n in NAMES[:13]},
    **{n: "structural_shadow" for n in NAMES[13:16]},
    **{n: "slate_roof" for n in NAMES[16:31]},
    "threshold": "ground_detail",
}

OPACITY = {
    "shade_footing": "binary_alpha_overlay",
    "shade_under_eave": "binary_alpha_overlay",
    "shade_corner": "binary_alpha_overlay",
}

CONNECTS = {
    "wall_limestone_a": "fill. Tiles freely with wall_limestone_b; the two carry opposite bonds so neighbours never repeat. Joint rows at y0 and y8 align on every masonry tile.",
    "wall_limestone_b": "fill. Alternate bond for wall_limestone_a.",
    "wall_plaster": "fill. Quiet facade surface; no horizontal line of its own except a 2px worn band at y14-15.",
    "wall_plaster_course": "place as the TOP row of a 2-row facade; carries the single course line at y0-1.",
    "wall_edge_top": "top row of a wall run with no roof above it.",
    "wall_edge_bottom": "bottom row of a wall run meeting the ground.",
    "wall_edge_left": "west end of a wall run. Lit return face in column 0-1.",
    "wall_edge_right": "east end of a wall run. 1px recess at column 14, shaded return at 15.",
    "wall_corner_tl": "north-west outside corner. Carries both the lit return and the cap.",
    "wall_corner_tr": "north-east outside corner. Cap plus shaded return.",
    "wall_corner_bl": "south-west outside corner. Lit return plus footing.",
    "wall_corner_br": "south-east outside corner. Shaded return plus footing.",
    "wall_plinth": "bottom row of a building, between facade and paving.",
    "shade_footing": "OVERLAY on the paving row immediately south of a wall. Offset it 2-4px east for the north-west light.",
    "shade_under_eave": "OVERLAY on the facade row immediately below an eave.",
    "shade_corner": "OVERLAY on the paving column immediately east of a building.",
    "roof_slate_a": "roof plane fill. Alternate with roof_slate_b to break the 16px period.",
    "roof_slate_b": "roof plane fill, opposite bond, carries two sparse glints.",
    "roof_ridge": "top row of a roof. Lit cap at y0-1.",
    "roof_eave": "bottom row of a roof. 3px fascia at y11-14 and a recessed underside at y15.",
    "roof_edge_left": "west verge of a roof.",
    "roof_edge_right": "east verge of a roof.",
    "roof_corner_tl": "ridge meeting the west verge.",
    "roof_corner_tr": "ridge meeting the east verge.",
    "roof_corner_bl": "eave meeting the west verge (eave corner transition).",
    "roof_corner_br": "eave meeting the east verge (eave corner transition).",
    "roof_to_facade": "single-tile transition where an eave sits directly on plaster; use INSTEAD of roof_eave + wall_plaster when the building is only one roof row tall.",
    "roof_eave_corner_l": "eave underside wrapping onto a west masonry return.",
    "roof_eave_corner_r": "eave underside wrapping onto an east masonry return.",
    "roof_ridge_end_l": "ridge terminating at a west verge, bond B.",
    "roof_ridge_end_r": "ridge terminating at an east verge, bond B.",
    "threshold": "ground tile placed on the paving directly south of a door. Opaque; replaces the paving tile.",
}

manifest = {
    "package": "TEMPEST_B2-03A_Architecture_Proof",
    "task": "B.2-03A — Valcendre modular architecture and ground proof",
    "palette": {
        "source": "public/assets/tmp/valcendre_palette.json",
        "schema_version": "2.0",
        "environment_colours": 53,
        "colours_used_by_this_package": 27,
        "policy": "every opaque pixel is an exact approved palette hex; no new colours introduced",
    },
    "pixel_grid": {"environment_tile": [16, 16], "native_view": [480, 270]},
    "light_direction": "upper-left / northwest; cast shadow falls south and east",
    "status": "PROOF — additive. Does NOT replace public/assets/environments/valcendre_tiles_16x16.png "
              "and makes no claim on its 48 indexed slots. Remapping and integration belong to the coding agent.",
    "alpha": {
        "rule": "binary only — alpha is 0 or 255, never between",
        "verified_partial_alpha_pixels": 0,
        "opaque_assets": [
            "valcendre_proof_cobble_16x16.png",
            "valcendre_proof_window_32x32.png",
            "valcendre_proof_door_16x32.png",
        ],
        "assets_containing_transparency": {
            "valcendre_proof_architecture_16x16.png": "only the three structural_shadow overlay tiles "
                                                      "(indices 13, 14, 15) contain alpha-0 pixels; "
                                                      "all 29 other tiles are fully opaque",
        },
        "no_baked_background": True,
    },
    "files": [
        {
            "filename": "valcendre_proof_cobble_16x16.png",
            "dimensions_px": [64, 16],
            "tile_px": [16, 16],
            "atlas": {"columns": 4, "rows": 1, "tile_count": 4},
            "opaque": True,
            "layer": "ground",
            "tiles": [
                {"index": i, "name": f"cobble_{i}",
                 "connection": "all four variants are freely interchangeable in any orientation of "
                               "neighbour; no joint pixel lands on a tile boundary, so there is no 16px lattice"}
                for i in range(4)
            ],
            "notes": "coursed pavé. Horizontal joints at y2, y8, y13 give 6,5,5 spacing when stacked and never "
                     "a joint on the 16px boundary. One wrap course is identical in all four variants, which is "
                     "what makes them interchangeable.",
        },
        {
            "filename": "valcendre_proof_architecture_16x16.png",
            "dimensions_px": [COLS * 16, ROWS * 16],
            "tile_px": [16, 16],
            "atlas": {"columns": COLS, "rows": ROWS, "tile_count": len(NAMES)},
            "opaque": False,
            "layer": "architecture, except indices 13-15 which are overlays",
            "tiles": [
                {
                    "index": i,
                    "name": n,
                    "atlas_cell": {"col": i % COLS, "row": i // COLS},
                    "pixel_origin": [(i % COLS) * 16, (i // COLS) * 16],
                    "family": FAMILY[n],
                    "opacity": OPACITY.get(n, "opaque"),
                    "connection": CONNECTS[n],
                }
                for i, n in enumerate(NAMES)
            ],
        },
        {
            "filename": "valcendre_proof_window_32x32.png",
            "dimensions_px": [32, 32],
            "component": True,
            "opaque": True,
            "span_tiles": [2, 2],
            "anchor": {
                "convention": "top-left, grid-aligned",
                "note": "the 23x19 window motif sits at x4..x28, y2..y20 inside the 32x32 field; the rest is "
                        "plaster_2 so the component drops onto a plaster facade with no halo. On a limestone "
                        "facade the surrounding plaster must be masked or the component re-exported.",
            },
            "layer": "architecture, same layer as the facade it replaces",
            "notes": "shuttered limestone window. Weathered French blue shutters with louvre slats, dark "
                     "aperture with mullion and transom, lit limestone sill with a recessed underside. "
                     "Window openings do not imply passability.",
        },
        {
            "filename": "valcendre_proof_door_16x32.png",
            "dimensions_px": [16, 32],
            "component": True,
            "opaque": True,
            "span_tiles": [1, 2],
            "anchor": {
                "convention": "top-left, grid-aligned",
                "note": "place so the lower tile coincides with the plinth row; the component's own base rows "
                        "(y28-31) are the door's foot, and the separate `threshold` tile goes on the paving "
                        "row below it.",
            },
            "layer": "architecture",
            "notes": "wooden doorway with limestone lintel, framed plank leaf, iron handle. DRAWN AS A "
                     "COMPONENT ONLY — placement must not imply a traversable route where the engine has none.",
        },
    ],
    "suggested_assembly_order": [
        "1. paving — fill the ground with the four cobble variants in any distribution",
        "2. cast shadow — stamp shade_footing on the paving south of the building and shade_corner on the "
           "column east of it, offset 2-4px for the north-west light",
        "3. threshold — place on the paving directly south of where the door will go",
        "4. roof ridge row — roof_corner_tl, roof_ridge xN, roof_corner_tr",
        "5. roof plane rows — roof_edge_left, alternating roof_slate_a / roof_slate_b, roof_edge_right",
        "6. roof eave row — roof_corner_bl, roof_eave xN, roof_corner_br",
        "7. facade upper row — wall_edge_left, wall_plaster_course xN, wall_edge_right",
        "8. facade lower row — wall_edge_left, wall_plaster xN, wall_edge_right",
        "9. plinth row — wall_corner_bl, wall_plinth xN, wall_corner_br",
        "10. shade_under_eave overlay on the facade's top row",
        "11. window and door components last, over the facade rows",
    ],
    "layering_requirements": {
        "ground": "cobble and threshold are opaque ground; threshold replaces a paving tile rather than overlaying it",
        "structural_shadow": "indices 13-15 are binary-alpha overlays and must draw ABOVE the ground and BELOW "
                             "the building and any actor",
        "architecture": "opaque; draws above the ground",
        "components": "window and door draw at the same depth as the facade they sit in",
        "actors": "unchanged; characters must still sort above ground and shadow and below nothing in this package",
    },
    "collision": {
        "statement": "THIS PACKAGE MAKES NO COLLISION CLAIM. No footprint, cover definition, map coordinate or "
                     "mission value is proposed or implied. Which of these tiles are solid is entirely the "
                     "coding agent's decision.",
        "art_side_observation": "the eave band is part of the building's solid visual footprint per art bible 5.2, "
                                "but whether it collides is not an art decision",
    },
    "reference_images": [
        "valcendre_proof_building_assembly.png — native 480x270, assembled from exported tiles only",
        "valcendre_proof_assembly_3x.png — the same scene at integer 3x",
        "valcendre_proof_contact_sheet.png — every tile at 6x with transparency checkered",
        "valcendre_proof_ground_tests.png — four paving distributions over 12x8 tiles",
        "valcendre_proof_seam_tests.png — masonry block with all four corners, and a roof with ridge and eave",
    ],
}

with open(os.path.join(HERE, "valcendre_proof_manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=1)
print(f"manifest: {len(NAMES)} atlas tiles + 4 cobble + 2 components")
