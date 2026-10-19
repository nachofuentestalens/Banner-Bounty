# First playable gameplay defaults

These are implementation defaults to refine in M1-02 and M1-04. Keep scope fixed; publish exact numeric tables and edge cases before combat implementation.

## Loop and content budget

Choose party/loadout -> start the Old Road expedition -> collect XP, gold and gear -> stop and improve builds -> defeat the Tollkeeper -> publish a team -> challenge another local company's snapshot.

- Three starter heroes, one of each class, available immediately. No recruitment currency or character creation wizard.
- Ordered party of exactly three distinct owned heroes. Front position influences enemy targeting; reorder outside expeditions.
- Levels 1-10; all three expedition participants receive XP, including a hero defeated during a winning battle. Specialization unlocks at level 3.
- Three equipment slots per hero: weapon, armor, trinket. At least 9 base item definitions and 3 affixes; common items have no affix, uncommon items have one. Stable instance IDs, explicit slot restrictions and stat comparison.
- Old Road: three normal enemy definitions, chosen deterministically per expedition cycle, one enemy team per cycle. One boss encounter: the Tollkeeper.
- An expedition cycle is 60 seconds. A loss consumes the cycle and awards no loot/XP/gold; no permanent death or item loss. Each battle begins with full HP and fresh battle-local effects.
- Eight-hour offline cap. Display elapsed, credited, discarded time and completed cycles in the collection summary.
- Boss is a manual challenge outside an expedition, with a deterministic server-generated seed and no entry cost. First victory grants a one-time reward; later victories provide only a report for M1. Atomic claim flag prevents repeated rewards.
- Gold is a visible earned resource; no shop or crafting is required. Inventory holds at most 100 unequipped item instances; excess drops convert to documented gold amounts in the same reward transaction.

## Classes and specialization direction

| Class | Base role | Choice A | Choice B |
| --- | --- | --- | --- |
| Vanguard | Durable front-line attacker | Guardian: protect an ally | Berserker: trade resilience for damage |
| Ranger | Fast focused attacker | Marksman: finish weakened targets | Pathfinder: support party tempo |
| Arcanist | Magical damage/support | Pyromancer: damage over time | Warden: healing and sustain |

Each class needs one default action and each specialization one distinct automatic ability/passive. No player scripting or skill tree. Specialization selection and free switching are allowed outside expeditions; clearly display the effect. Designers must prevent a three-class composition from requiring a single mandatory specialization to clear M1.

## Combat rules to freeze

Discrete rounds; all surviving actors act once in speed order with stable ID tie-breaks. Resolve abilities, target selection, damage mitigation, healing cap, death, status duration, win/loss and timeout deterministically. Use integer math and explicitly defined rounding. A defeated actor cannot act later that round. Maximum 100 rounds; timeout counts as a loss in PvE and draw in arena. Logs retain a bounded recent event list plus totals.

M1-02 supplies exact stats, action formulas, ability priority/cooldowns, target ties, status stacking, and examples. M1-04 supplies XP requirements, rewards, drop/affix probabilities and overflow conversion. Implementation should follow these tables rather than invent competing numbers.

## Initial pacing targets (hypotheses)

First equipment improvement within about 5 minutes, specialization within 10-15 minutes, and first boss clear within 20-40 minutes of ordinary progression. These are targets to measure and tune, not claims about an unbuilt game. Test several fixed seeds and builds; document variance. A development-only clock advance can accelerate QA and must not be exposed as a normal player reward action.
