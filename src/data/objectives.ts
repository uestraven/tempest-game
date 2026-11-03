/**
 * Data-defined objective chain with stable IDs and explicit dependencies
 * (spec section 13). The runtime state machine in systems/Objectives.ts is
 * event-driven and idempotent: completing an ID twice changes nothing.
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
    text: "Find Suzanne's transport in the village.",
    clue: 'The van is here. Still warm.',
    requires: [],
  },
  {
    id: 'V2',
    text: 'Inspect the transport log.',
    clue: 'Transport log: offloaded at the Barnabé estate, 6 km north.',
    requires: ['V1'],
  },
  {
    id: 'V3',
    text: 'Examine the inscription on the garage wall.',
    clue: 'Carved beneath the sigil: BELIAL.',
    requires: ['V2'],
    optional: true,
  },
  {
    id: 'VX',
    text: 'Leave Valcendre by the north road.',
    clue: 'Valcendre is behind you.',
    requires: ['V2'],
  },
];

export const OPTIONAL_CLUES: Record<string, string> = {
  hymn: 'Torn hymn page - the same sigil, inked over the staves.',
  radio: 'The radio crackles to life. Something will come looking.',
};
