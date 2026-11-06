// Independent numeric oracle from classes.md: L5 Vanguard DEF10, Thick Hide11,
// Fortify floor(11*1.3)=14; enemy ATK26, Weaken floor(26*.7)=18.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulateBattleV2 } from '../../packages/game/dist/combat2.js';
const equipment = { weapon: null, armor: null, trinket: null };
const hero = (id, slotIndex, primaryClassId, active, passive) => ({ kind: 'hero', id, slotIndex, primaryClassId, secondaryClassId: null, level: 5, equipment, skillLoadout: { active: [active, ''], passive: [passive, ''] } });
const party = [hero('bait', 0, 'class_ranger', 'aimed_shot', 'hunters_focus'), hero('tank', 1, 'class_vanguard', 'bulwark_call', 'thick_hide'), hero('support', 3, 'class_herald', 'discordant_verse', 'encore')];
const enemy = [{ kind: 'enemy', id: 'boss', slotIndex: 0, enemyId: 'boss_tollkeeper', stats: { maxHp: 1000, atk: 26, def: 8, spd: 5 }, isBoss: true }];
const seed = 777001;
const result = simulateBattleV2(party, enemy, 'boss', seed);
let fortified = false, weakened = false;
const samples = [], casts = [];
for (const e of result.events) {
  if (e.targetId === 'tank' && e.statusApplied?.statusId === 'status_fortify') fortified = true;
  if (e.targetId === 'tank' && e.statusExpired === 'status_fortify') fortified = false;
  if (e.targetId === 'boss' && e.statusApplied?.statusId === 'status_weaken') weakened = true;
  if (e.targetId === 'boss' && e.statusExpired === 'status_weaken') weakened = false;
  if (e.sourceId === 'tank' && e.statusApplied?.statusId === 'status_taunt') casts.push(e.round);
  if (e.sourceId !== 'boss' || e.targetId !== 'tank' || !e.damageBreakdown?.steps.some(s => s.kind === 'attack')) continue;
  const steps = e.damageBreakdown.steps;
  assert.equal(steps.find(s => s.kind === 'attack').value, 26);
  assert.equal(steps.find(s => s.kind === 'defense').value, 11);
  const atk = (steps.find(s => s.kind === 'weaken') ?? steps.find(s => s.kind === 'attack')).value;
  const def = (steps.find(s => s.kind === 'fortify') ?? steps.find(s => s.kind === 'defense')).value;
  assert.equal(atk, weakened ? 18 : 26);
  assert.equal(def, fortified ? 14 : 11);
  // Boss normal basic attacks: floor DEF/2 reduction; critical is final 3/2.
  if (steps.some(s => s.kind === 'base_damage')) {
    const base = Math.max(1, atk - Math.floor(def / 2));
    assert.equal(steps.find(s => s.kind === 'base_damage').value, base);
    const skillDamage = e.type === 'toll_smash' ? Math.floor(base * 1.5) : base;
    assert.equal(e.damageBreakdown.damage, e.crit ? Math.floor(skillDamage * 1.5) : skillDamage);
  }
  samples.push({ round: e.round, fortified, weakened, atk, def, event: e });
}
assert.ok(samples.some(s => s.fortified && s.weakened), 'active buff/debuff arithmetic must be exercised');
assert.ok(samples.some(s => !s.fortified), 'expired buff arithmetic must be exercised');
assert.ok(casts.length > 1, 'repeated cooldown use required');
for (let i = 1; i < casts.length; i++) assert.ok(casts[i] - casts[i - 1] >= 3);
const firstRedirect = result.events.find(e => e.sourceId === 'boss' && e.round === 2 && e.targetId);
assert.equal(firstRedirect.targetId, 'tank');
fs.mkdirSync('qa/artifacts/M2-closure/status-math', { recursive: true });
fs.writeFileSync('qa/artifacts/M2-closure/status-math/evidence.json', JSON.stringify({ seed, party, enemy, result, samples, casts, firstRedirect }, null, 2));
console.log(JSON.stringify({ samples: samples.map(({event, ...s}) => s), casts, tauntTarget: firstRedirect.targetId }));
