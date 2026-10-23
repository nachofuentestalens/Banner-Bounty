// M2-29 check 8 follow-up: directly exercise combat.md 8.2's taunt-redirect rule
// (a single-target offensive action must target the active taunter, skipping
// row/HP/position rules) via packages/game's pure combat engine, bypassing the
// server/HTTP layer so the scenario is fully controlled and seeded.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulateBattleV2 } from '../../packages/game/dist/combat2.js';

const out = fileURLToPath(new URL('../../qa/artifacts/M2-29/mechanics/', import.meta.url));
fs.mkdirSync(out, { recursive: true });

const SEED = 777001;
const emptyEquipment = { weapon: null, armor: null, trinket: null };

// ally_bait: slot 0 (front), no taunt skill — the pool's natural pick by both
// position (lowest slot) and, once damaged, lowest-HP%.
const allyBait = {
  kind: 'hero', id: 'ally_bait', slotIndex: 0, primaryClassId: 'class_ranger', secondaryClassId: null,
  level: 1, equipment: emptyEquipment,
  skillLoadout: { active: ['aimed_shot', ''], passive: ['hunters_focus', ''] },
};
// vanguard: slot 1 (front, higher slot index than ally_bait), casts bulwark_call
// (self-targeted status_taunt, classes.md 5.1) on its first action.
const vanguard = {
  kind: 'hero', id: 'vanguard_taunter', slotIndex: 1, primaryClassId: 'class_vanguard', secondaryClassId: null,
  level: 1, equipment: emptyEquipment,
  skillLoadout: { active: ['bulwark_call', ''], passive: ['thick_hide', ''] },
};
// Tollkeeper boss: on round%3 !== 0, tollkeeperAction uses pickLowestPosition
// over the single-target pool (combat2.ts) — with no taunt that is slot 0
// (ally_bait); with an active taunt the pool collapses to the taunter only.
const boss = {
  kind: 'enemy', id: 'boss_tollkeeper#0', slotIndex: 0, enemyId: 'boss_tollkeeper',
  stats: { maxHp: 220, atk: 26, def: 8, spd: 5 }, isBoss: true,
};

const result = simulateBattleV2([allyBait, vanguard], [boss], 'boss', SEED);
fs.writeFileSync(`${out}/taunt-redirect-report.json`, JSON.stringify({ seed: SEED, result }, null, 2));

const events = result.events;
const tauntCast = events.find((e) => e.skillId === 'bulwark_call' && e.statusApplied?.statusId === 'status_taunt');
assert.ok(tauntCast, 'expected bulwark_call to apply status_taunt at least once');
const tauntRound = tauntCast.round;

// First boss single-target action in a later round while taunt is active
// (duration 2, so still active the round after cast).
const bossHitAfterTaunt = events.find(
  (e) => e.sourceId === 'boss_tollkeeper#0' && e.round > tauntRound && e.type !== 'tidal_surge',
);
assert.ok(bossHitAfterTaunt, 'expected a boss single-target action in a round after taunt was cast');

const redirected = bossHitAfterTaunt.targetId === 'vanguard_taunter';
const report = {
  seed: SEED,
  tauntCastRound: tauntRound,
  tauntCastEvent: tauntCast,
  bossActionRound: bossHitAfterTaunt.round,
  bossActionEvent: bossHitAfterTaunt,
  naturalTargetWithoutTaunt: 'ally_bait (slot 0, lowest position)',
  actualTarget: bossHitAfterTaunt.targetId,
  check8TauntStatus: redirected ? 'PASS' : 'FAIL',
};
fs.writeFileSync(`${out}/taunt-redirect-verdict.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert.equal(bossHitAfterTaunt.targetId, 'vanguard_taunter', 'combat.md 8.2 taunt override: single-target boss action must hit the taunter, not the lowest-position/lowest-HP hero');
console.log('PASS: taunt redirect confirmed');
