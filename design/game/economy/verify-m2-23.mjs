// Focused design-table arithmetic audit; not the production combat simulator.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const doc = readFileSync(new URL('./gear.md', import.meta.url), 'utf8');
const rows = doc.split('\n').filter(x => x.startsWith('| '))
  .map(x => x.split('|').slice(1, -1).map(s => s.trim()));
const weights = rows.filter(r => /^\d+\/\d+\/\d+\/\d+$/.test(r.at(-1)));
assert.equal(weights.length, 7);
for (const r of weights) assert.equal(r.at(-1).split('/').map(Number).reduce((a,b)=>a+b),100);
const affixes = rows.filter(r => ['weapon','armor','trinket'].includes(r[0]) && r.length === 5);
assert.equal(affixes.length, 10);
for (const row of affixes) for (const cell of row.slice(2)) {
  const [lo,hi] = cell.split('-').map(Number);
  assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo > 0 && hi >= lo);
}
// Exhaust all legal ordered affix configurations and guarantee a reforge alternative.
let configurations = 0;
for (const slot of ['weapon','armor','trinket']) {
  const pool = affixes.filter(r=>r[0] === slot);
  for (let count=1; count<=3; count++) {
    const visit = (chosen) => {
      if (chosen.length < count) {
        for (let id=0; id<pool.length; id++) if (!chosen.some(x=>x.id === id)) {
          const [lo,hi] = pool[id][count+1].split('-').map(Number);
          for (let value=lo;value<=hi;value++) visit([...chosen,{id,value}]);
        }
        return;
      }
      configurations++;
      for (let selected=0;selected<count;selected++) {
        let alternatives=0;
        for (let id=0;id<pool.length;id++) {
          if (chosen.some((x,i)=>i!==selected && x.id === id)) continue;
          const [lo,hi]=pool[id][count+1].split('-').map(Number);
          alternatives += hi-lo+1-(id===chosen[selected].id ? 1:0);
        }
        assert.ok(alternatives>0);
      }
    };
    visit([]);
  }
}
const quantile=(p,q)=>Math.ceil(Math.log(1-q)/Math.log(1-p));
assert.deepEqual([.1,.5,.9,.95].map(q=>quantile(.25,q)),[1,3,9,11]);
assert.deepEqual([.5,.9].map(q=>quantile(.0125,q)),[56,184]);
assert.deepEqual([.025,.05].map(p=>quantile(p,.5)),[28,14]);
assert.deepEqual([45,150,420,675].map(x=>Math.ceil(x/4)),[12,38,105,169]);
const recipes=Object.fromEntries(rows.filter(r=>/^`(?:craft|reforge)_/.test(r[0]))
  .map(r=>[r[0].replaceAll('`',''),r.slice(2).map(Number)]));
assert.equal(Object.keys(recipes).length,6);
const spend=[0,0,0,0];
for (const name of ['craft_uncommon','craft_rare','craft_epic','reforge_rare','reforge_rare'])
  recipes[name].forEach((v,i)=>spend[i]+=v);
assert.deepEqual(spend,[1500,80,16,8]);
const ordinary=rows.find(r=>r[0] === 'dungeon 1 ordinary').slice(1,6).map(Number);
const boss=rows.find(r=>r[0] === 'dungeon 1 final boss').slice(1,6).map(Number);
const run=ordinary.map((v,i)=>2*v+boss[i]);
assert.deepEqual(run,[32,80,8,2,1]);
const week=run.map((v,i)=>14*v+([1680,4200,0,0,0][i]));
assert.deepEqual(week,[2128,5320,112,28,14]);
const remainder=week.slice(1).map((v,i)=>v-spend[i]);
assert.deepEqual(remainder,[3820,32,12,6]);
assert.equal(remainder[0]-450-600-750,2020);
assert.equal(Math.floor(18*115/100),20); // Published gear example.
console.log(JSON.stringify({result:'PASS',rarityRows:weights.length,affixRows:affixes.length,
  reforgeConfigurations:configurations,recipeRows:6,firstDropQuantiles:[1,3,9,11],
  firstRareQuantiles:[56,184],threeFloorRun:run,week,spend,remainder,
  naturalEpicChance14Intro:1-.98**14,naturalEpicChance28Advanced:1-.95**28,
  limitation:'Analytical table audit only; no production combat/pacing acceptance.'},null,2));
