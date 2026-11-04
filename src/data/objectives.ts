/**
 * The Valcendre objective chain: eight beats with stable IDs and explicit
 * dependencies (docs/level-design/valcendre-rework.md §3).
 *
 * Array order is NARRATIVE order, which is what drives the HUD's active-objective
 * pointer. Note that it is not ID order: V5 (the depot ledger) comes before V4
 * (the van), because the ledger carries the garage key.
 *
 * ID REUSE WARNING. In the Phase B prototype V3 was an OPTIONAL BELIAL
 * inscription and VX was the exit. Both meanings are gone: V3 is now depot
 * traversal and V7 is the mandatory BELIAL discovery. An older save carrying the
 * previous meanings must never be read as progress in this chain, which is what
 * the SAVE_VERSION bump to 2 prevents (see systems/Save.ts).
 */

export interface ObjectiveDef {
  id: string;
  /** Single-line HUD text shown while this objective is the active one. */
  text: string;
  /** Top-centre clue notification shown once, when the objective completes. */
  clue?: string;
  requires: string[];
  /** Optional objectives never gate the active-objective pointer. */
  optional?: boolean;
}

export const OBJECTIVES: ObjectiveDef[] = [
  {
    id: 'V1',
    text: "Investigate the convoy's last stop in the market.",
    clue: 'They stopped here. Not for long.',
    requires: [],
  },
  {
    id: 'V2',
    text: 'Determine where Suzanne was taken.',
    clue: 'The delivery route ends at the Valcendre transport depot.',
    requires: ['V1'],
  },
  {
    id: 'V3',
    text: 'Reach the transport depot.',
    clue: 'Inside the depot yard. The office is the place to start.',
    requires: ['V2'],
  },
  {
    id: 'V5',
    text: 'Search the depot office for records.',
    clue: 'Barnabé. His name is on all of it. The garage key was on the desk.',
    requires: ['V3'],
  },
  {
    id: 'V4',
    text: "Locate Suzanne's transport in the garage.",
    clue: 'She was alive when they moved her.',
    requires: ['V5'],
  },
  {
    id: 'V6',
    text: 'Deal with the wounded man by the dock.',
    clue: 'He would not take help. He wanted to go.',
    requires: ['V4'],
  },
  {
    id: 'V7',
    text: 'Look behind the transport.',
    clue: 'Carved into the stone: BELIAL.',
    requires: ['V6'],
  },
  {
    id: 'V8',
    text: 'Leave Valcendre by the north road.',
    clue: 'Valcendre is behind you.',
    requires: ['V7'],
  },
];

/** The last mandatory beat before the level may be left. */
export const FINAL_OBJECTIVE = 'V8';
/** The beat the exit gate checks. */
export const EXIT_REQUIRES = 'V7';

export const OPTIONAL_CLUES: Record<string, string> = {
  hymn: 'Torn hymn page - the same sigil, inked over the staves.',
  radio: 'The radio crackles to life. Something will come looking.',
};
