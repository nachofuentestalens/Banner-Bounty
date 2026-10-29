# First playable: a company worth returning to

M1 proved a satisfying prepare, dispatch, collect, improve loop with a three-hero company and a locally hosted authoritative server. It was a small playable vertical slice, not a public launch, and the owner's M1 playtest verdict was that it was "way too basic" and the fights were "extremely boring" — too little to see, too little tactical depth. M2 (see `design/studio/milestones/M2.md`) answers that directly: watchable combat with a full battle view and playback controls, a larger dual-class hero roster with real skill decisions, formations, and gear crafting.

The owner wants a genre-deep team-builder: a larger roster of heroes who each combine two classes with real skills, cooldowns, buffs/debuffs, taunt/threat, formations, gear rarity/affixes, and crafting — with mostly text UI (graphics later), deterministic server-authoritative combat, asynchronous multiplayer, and local PC testing without paid hosting; development directed through prompts. Idle Adventure is a genre reference for depth and feel, not an asset or text source: https://store.steampowered.com/app/714020/Idle_Adventure/. Never copy its names, text, or assets.

## Player promise

Recruit a company, choose complementary builds, send it on a bounty, understand the combat outcome, and return to meaningful progression. Decisions should be readable and consequential without constant clicking. Tone: grounded, inviting frontier fantasy with brief flashes of dry humor.

## M1 scope (delivered and accepted — see `design/studio/release-verdict.md`)

- Exactly three starter heroes: Vanguard, Ranger, and Arcanist; two specializations per class.
- A three-slot ordered party; equipment, basic affixes, experience and levels.
- One expedition area with a small enemy roster; one manually challenged dungeon boss.
- Automatic deterministic combat with a readable event log and clear outcome.
- Capped offline progress, persistent local server saves, and explicit catch-up behavior.
- Two local test accounts in separate browser sessions; one asynchronous battle against a published team snapshot.
- Usable desktop browser interface with keyboard access and responsive narrow layout.
- A documented local launch path, repeatable test data, automated checks, and a short playtest script.

## M2 scope: watchable combat and depth

M1's class count, specialization model, and lack of crafting were deliberate first-playable cuts,
not permanent exclusions. M2 (`design/studio/milestones/M2.md`) removes those cuts: a larger
dual-class roster, real skills with cooldowns/buffs/taunt, formations, gear rarity/affixes, and
crafting/reforging, alongside a battle view that shows every unit's HP and status effects with a
turn-by-turn action feed and pause/step/speed/skip controls. See that document for the full scope,
out-of-scope list, and acceptance checks.

## Exclusions still in effect

No live cooperative combat, matchmaking beyond the existing async arena snapshot model, shared
market, guilds, chat, monetization, procedural campaign, mobile app, Steam integration, desktop
packaging, generated art campaign, rendered 3D/real-time graphics, or public account system. Gold
may be earned and displayed; an economy with shops is not required. No recurring production
infrastructure.

## Authority and defaults

The owner authorized the recommended web/server approach and this milestone setup. Names, numbers, balance targets, art direction, and account flow in the design documents are working defaults chosen for progress, not additional owner-approved requirements. Assigned designers may tune them inside M1 and document the result. Game Director resolves scope; CTO resolves technical contracts. Neither should repeatedly ask the owner about routine reversible choices.

## Done means

A fresh local install can complete the acceptance walkthrough in `design/qa/acceptance.md`; real checks have evidence; no unresolved save-loss, reward-duplication, startup, or account-isolation blocker remains. QA certifies technical behavior and the Game Director records the playability verdict. The owner remains the final judge of enjoyment; a working build does not prove product-market fit.

## M3 scope: readable choices and company competition

M2's current verdict is withheld, with specific closure evidence in
[reports/M2-30.md](reports/M2-30.md). The next bounded milestone is
[milestones/M3.md](milestones/M3.md): reliable fight access, deferred next-fight loadouts,
measured fight-length expedition pacing, an eight-class roster with specializations, three races,
class reference/respec, one additional dungeon, and local asynchronous team seasons/tournaments.

M3 extends the earlier unranked arena boundary to standings and a four-entry bracket. Team PvP
means five-hero company snapshots controlled by one account per side, with labelled local fixture
opponents for testing. It adds no public accounts, online matchmaking infrastructure, live human
co-control, paid hosting or real-time combat. Existing exclusions otherwise remain. Production
implementation follows M2 closure; this is scope direction, not a delivery claim.
