import { SOUND_RADIUS } from '../core/constants';

export type WeaponId = 'pistol' | 'shotgun';

export interface WeaponDef {
  id: WeaponId;
  label: string;
  magazine: number;
  startingReserve: number;
  /** Damage per ray. The shotgun's five rays total 90 at point blank. */
  damagePerRay: number;
  rays: number;
  /** Total spread across all rays, radians. Fixed - no random deviation. */
  spread: number;
  range: number;
  fireInterval: number;
  /** Full-magazine reload, or per-shell for the interruptible shotgun reload. */
  reloadTime: number;
  reloadPerShell: boolean;
  soundRadius: number;
  /** Fraction of damage remaining at max range (1 = no falloff). */
  falloffAtMaxRange: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    label: 'SUPPRESSED PISTOL',
    magazine: 8,
    startingReserve: 24,
    damagePerRay: 34,
    rays: 1,
    spread: 0,
    range: 220,
    fireInterval: 0.36,
    reloadTime: 1.2,
    reloadPerShell: false,
    soundRadius: SOUND_RADIUS.pistol,
    falloffAtMaxRange: 1,
  },
  shotgun: {
    id: 'shotgun',
    label: 'PUMP SHOTGUN',
    magazine: 4,
    startingReserve: 8,
    damagePerRay: 18,
    rays: 5,
    spread: 0.3,
    range: 110,
    fireInterval: 0.85,
    reloadTime: 0.55,
    reloadPerShell: true,
    soundRadius: SOUND_RADIUS.shotgun,
    falloffAtMaxRange: 0.25,
  },
};
