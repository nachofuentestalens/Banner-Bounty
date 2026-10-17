// XP curve and leveling (design/game/economy/baseline.md section 1).

export function xpToNext(level: number): number | null {
  if (level < 1 || level >= 10) return null;
  return 15 * level;
}

export interface LevelState {
  readonly level: number;
  readonly xp: number;
}

/**
 * Applies a single reward transaction's XP gain, looping level-ups per
 * baseline.md section 1. At the level-10 cap, any remaining XP from this
 * transaction is discarded (never banked) — the cumulative-XP table there
 * sums exactly to 675 with no remainder tracked at the cap.
 */
export function applyXpGain(hero: LevelState, xpGained: number): LevelState {
  let level = hero.level;
  let xp = hero.xp + xpGained;
  while (level < 10) {
    const need = xpToNext(level)!;
    if (xp >= need) {
      xp -= need;
      level += 1;
    } else {
      break;
    }
  }
  if (level >= 10) xp = 0;
  return { level, xp };
}
