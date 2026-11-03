/** Short authored exchanges. At most 2-3 lines before input (spec section 9). */

export interface DialogueLine {
  speaker: string;
  text: string;
}

export const DIALOGUE: Record<string, DialogueLine[]> = {
  village_arrival: [
    { speaker: 'HANDLER', text: 'Valcendre. They changed vehicles somewhere in the village.' },
    { speaker: 'TEMPEST', text: 'Charming place to lose a president’s daughter.' },
  ],
  village_van: [
    { speaker: 'TEMPEST', text: 'Found the transport. Doors wrenched, not forced.' },
    { speaker: 'HANDLER', text: 'Anything on board?' },
  ],
  village_log: [
    { speaker: 'TEMPEST', text: 'A log book. They wrote it down. Who writes it down?' },
    { speaker: 'TEMPEST', text: 'Handover at the Barnabé estate. Six kilometres north.' },
  ],
  village_sigil: [
    { speaker: 'TEMPEST', text: 'Somebody cut a symbol into the stone. And a name.' },
    { speaker: 'TEMPEST', text: 'BELIAL. That is not a kidnapping cell’s letterhead.' },
  ],
  village_exit: [
    { speaker: 'TEMPEST', text: 'This does not look like an ordinary kidnapping cell.' },
    { speaker: 'HANDLER', text: 'It never does, at your age. Get to the estate.' },
  ],
};
