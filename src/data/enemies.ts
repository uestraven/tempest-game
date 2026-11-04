import type { CharacterKey } from '../art/AssetRegistry';

export type EnemyKind = 'lookout' | 'enforcer' | 'zealot' | 'ascendant';

export interface EnemyDef {
  kind: EnemyKind;
  label: string;
  /** Production sprite sheet this archetype renders with. */
  sheet: CharacterKey;
  hp: number;
  /** Damage dealt to the player by one successful attack. */
  damage: number;
  attack: 'ranged' | 'melee';
  /** Seconds between shots/swings once in combat. */
  attackInterval: number;
  /** Visible telegraph before the attack lands. */
  telegraph: number;
  /** Preferred engagement distance, in pixels. */
  engageRange: number;
  patrolSpeed: number;
  investigateSpeed: number;
  combatSpeed: number;
  tint: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  lookout: {
    kind: 'lookout',
    sheet: 'lookout_guard',
    label: 'Lookout',
    hp: 60,
    damage: 12,
    attack: 'ranged',
    attackInterval: 1.4,
    telegraph: 0.45,
    engageRange: 170,
    patrolSpeed: 44,
    investigateSpeed: 78,
    combatSpeed: 66,
    tint: 0x6e3a3a,
  },
  enforcer: {
    kind: 'enforcer',
    sheet: 'enforcer',
    label: 'Enforcer',
    hp: 100,
    damage: 16,
    attack: 'ranged',
    attackInterval: 1.1,
    telegraph: 0.45,
    engageRange: 160,
    patrolSpeed: 48,
    investigateSpeed: 88,
    combatSpeed: 82,
    tint: 0x55344a,
  },
  zealot: {
    kind: 'zealot',
    sheet: 'zealot_cultist',
    label: 'Zealot',
    hp: 60,
    damage: 20,
    attack: 'melee',
    attackInterval: 1.0,
    telegraph: 0.4,
    engageRange: 20,
    patrolSpeed: 50,
    investigateSpeed: 96,
    combatSpeed: 118,
    tint: 0x7a6a3a,
  },
  ascendant: {
    kind: 'ascendant',
    sheet: 'ascendant_cultist',
    label: 'Ascendant',
    hp: 130,
    damage: 25,
    attack: 'melee',
    attackInterval: 1.3,
    telegraph: 0.55,
    engageRange: 22,
    patrolSpeed: 42,
    investigateSpeed: 80,
    combatSpeed: 92,
    tint: 0x3f3550,
  },
};
