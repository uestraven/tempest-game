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

  // --- V1: the convoy's last stop. Two sources, one beat. ---
  village_tracks: [
    { speaker: 'TEMPEST', text: 'The tires are heavy. Delivery vehicle.' },
    { speaker: 'TEMPEST', text: 'Someone stopped here in a hurry.' },
  ],
  village_stall: [
    { speaker: 'TEMPEST', text: 'Someone put up a fight. Not for very long.' },
  ],

  // --- V2: where she was taken. Two sources, one beat. ---
  village_waybill: [
    { speaker: 'TEMPEST', text: 'A carter’s waybill. Route ends at the transport depot.' },
    { speaker: 'HANDLER', text: 'Then that is where you are going.' },
  ],
  village_overheard: [
    { speaker: 'GUARD', text: 'The depot. Tonight. Nobody signs for it.' },
    { speaker: 'TEMPEST', text: 'The depot. Good enough.' },
  ],

  // --- V3: arrival at the depot. ---
  village_depot: [{ speaker: 'TEMPEST', text: 'Depot yard. The office first.' }],

  // --- V5: the ledger and the key. ---
  village_ledger: [
    { speaker: 'TEMPEST', text: 'Barnabé. Every vehicle, every payment, every transfer.' },
    { speaker: 'TEMPEST', text: 'His name is on all of it. This was not a kidnapping cell.' },
  ],

  // --- V4: the transport. ---
  village_van: [
    { speaker: 'TEMPEST', text: 'Passenger restraints. Fresh blood.' },
    { speaker: 'TEMPEST', text: 'She was alive when they moved her.' },
  ],

  // --- V6: the wounded cultist. Non-combatant, scripted, dies willingly. ---
  village_cultist: [
    { speaker: 'TEMPEST', text: 'Who took the girl?' },
    { speaker: 'CULTIST', text: 'He has waited longer than you can imagine.' },
    { speaker: 'TEMPEST', text: 'Who?' },
    { speaker: 'CULTIST', text: 'Look behind the transport. You’ll see.' },
  ],

  // --- V7: BELIAL. Named, never explained. ---
  village_belial: [
    { speaker: 'TEMPEST', text: 'Belial. Means nothing to me.' },
    { speaker: 'HANDLER', text: 'It means nothing to our files either. Ignore it.' },
    { speaker: 'TEMPEST', text: 'The ledger points at the Barnabé estate. I am going north.' },
  ],

  // --- V8: departure. ---
  village_exit: [
    { speaker: 'TEMPEST', text: 'She survived the transport. Barnabé moved her himself.' },
    { speaker: 'HANDLER', text: 'And the word carved in the wall?' },
    { speaker: 'TEMPEST', text: 'Still means nothing. Tell me when it does.' },
  ],

  // --- rejection at the exit ---
  village_exit_blocked: [
    { speaker: 'TEMPEST', text: 'Not yet. There is something behind that transport.' },
  ],
};
