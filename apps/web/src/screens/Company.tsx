import { useEffect, useRef, useState } from "react";
import { patch, post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, Hero } from "../types.js";
import { COPY, classCopy, composeItemName, skillCopy } from "../copy.js";
import { isActivityActive, isSecondaryClassUnlocked, canAssignSecondaryClass } from "../rules.js";
import { BASE_CLASS_IDS, CLASS_SKILLS, unlockedSkillPool } from "../frozenIds.js";
import { SkillLabel } from "../components/SkillLabel.js";
import { skillMechanics } from "../skillMechanics.js";

function PrimaryActionBanner({ state, onGoExpedition }: { state: AccountState; onGoExpedition: () => void }) {
  let message: string;
  if (state.expedition.status === "none" && state.dungeon.status === "none") {
    message = "Start your first expedition";
  } else if (state.expedition.status === "active") {
    message = `Expedition running — ${state.expedition.cyclesCompletedSinceStart} cycles so far`;
  } else if (state.dungeon.status === "active") {
    message = `Dungeon run active — floor ${state.dungeon.currentFloor}`;
  } else {
    message = "Rewards ready to collect";
  }
  return (
    <div className="primary-action-banner">
      <button type="button" onClick={onGoExpedition}>
        {message}
      </button>
    </div>
  );
}

function RecruitPanel({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const [classId, setClassId] = useState(BASE_CLASS_IDS[0]!);
  const [pending, setPending] = useState(false);
  const cost = 150 * state.heroes.length;

  async function recruit() {
    setPending(true);
    await runMutation(async () => {
      await post("/hero/recruit", mutationPayload(state.revision, { primaryClassId: classId }));
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  return (
    <section className="recruit-panel" aria-labelledby="recruit-heading">
      <h2 id="recruit-heading">Recruit</h2>
      <p>
        Roster: {state.heroes.length} / 20 heroes. Gold: {state.gold}. Next recruit costs {cost} gold.
      </p>
      <label htmlFor="recruit-class">Class</label>
      <select id="recruit-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
        {BASE_CLASS_IDS.map((id) => (
          <option key={id} value={id}>
            {classCopy(id).name}
          </option>
        ))}
      </select>
      <button type="button" onClick={recruit} disabled={pending || state.heroes.length >= 20 || state.gold < cost}>
        {pending ? COPY.state_action_pending.label : COPY.action_recruit}
      </button>
    </section>
  );
}

function SkillSelect({ id, value, options, onChange, disabled }: { id: string; value: string; options: readonly string[]; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <span className="skill-choice">
    <select id={id} value={value} title={value ? `${skillCopy(value).desc} ${skillMechanics(value) ?? ""}` : undefined} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">(empty)</option>
      {options.map((skillId) => (
        <option key={skillId} value={skillId} title={`${skillCopy(skillId).desc} ${skillMechanics(skillId) ?? ""}`}>
          {skillCopy(skillId).name}
        </option>
      ))}
    </select>
    {value && <SkillLabel skillId={value} />}
    </span>
  );
}

function HeroCard({ hero, inventory, activityActive, accountRevision, controller, refetch }: { hero: Hero; inventory: AccountState["inventory"]; activityActive: boolean; accountRevision: number; controller: AccountStateController; refetch: () => void }) {
  const headingId = `hero-card-${hero.heroId}`;
  const [secondaryChoice, setSecondaryChoice] = useState(hero.secondaryClassId ?? BASE_CLASS_IDS.find((c) => c !== hero.primaryClassId)!);
  const [active, setActive] = useState<[string, string]>(hero.skillLoadout.active);
  const [passive, setPassive] = useState<[string, string]>(hero.skillLoadout.passive);
  const [pending, setPending] = useState<"secondary" | "loadout" | null>(null);

  const activeOptions = unlockedSkillPool(hero.primaryClassId, hero.secondaryClassId, hero.level, "active");
  const passiveOptions = unlockedSkillPool(hero.primaryClassId, hero.secondaryClassId, hero.level, "passive");
  const canDual = canAssignSecondaryClass(hero, activityActive);
  const loadoutLocked = activityActive;

  async function assignSecondary() {
    setPending("secondary");
    await runMutation(async () => {
      await post("/hero/secondary-class", mutationPayload(accountRevision, { heroId: hero.heroId, secondaryClassId: secondaryChoice }));
      refetch();
    }, controller);
    setPending(null);
  }

  async function saveLoadout() {
    setPending("loadout");
    await runMutation(async () => {
      await patch("/hero/loadout", mutationPayload(accountRevision, { heroId: hero.heroId, active, passive }));
      refetch();
    }, controller);
    setPending(null);
  }

  const equipped = (["weapon", "armor", "trinket"] as const).map((slot) => {
    const id = hero.equipment[slot];
    const item = id ? inventory.find((i) => i.itemInstanceId === id) : null;
    return item ? composeItemName(item.definitionId, item.affixes) : "Empty";
  });

  return (
    <section className="hero-card" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {classCopy(hero.primaryClassId).name}
        {hero.secondaryClassId ? ` / ${classCopy(hero.secondaryClassId).name}` : ""} <span className="hero-level">Lv {hero.level}</span>
      </h2>
      <p className="hero-xp">XP {hero.xp}</p>
      <p className="hero-gear-summary">Gear: {equipped.join(", ")}</p>
      {hero.effectiveStats ? (
        <p className="hero-stats">
          HP {hero.effectiveStats.maxHp} / ATK {hero.effectiveStats.atk} / DEF {hero.effectiveStats.def} / SPD {hero.effectiveStats.spd}
        </p>
      ) : null}

      {!isSecondaryClassUnlocked(hero) ? (
        <p className="disabled-note">Reach level 3 to assign a secondary class.</p>
      ) : (
        <div className="secondary-class-picker">
          <label htmlFor={`${headingId}-secondary`}>Secondary class</label>
          <select id={`${headingId}-secondary`} value={secondaryChoice} onChange={(e) => setSecondaryChoice(e.target.value)} disabled={!canDual}>
            {BASE_CLASS_IDS.filter((c) => c !== hero.primaryClassId).map((c) => (
              <option key={c} value={c}>
                {classCopy(c).name}
              </option>
            ))}
          </select>
          <button type="button" onClick={assignSecondary} disabled={!canDual || pending !== null}>
            {pending === "secondary" ? COPY.state_action_pending.label : COPY.action_assign_secondary}
          </button>
          {!canDual && activityActive ? <span className="disabled-note">Locked during an active expedition/dungeon.</span> : null}
        </div>
      )}

      <div className="loadout-editor">
        <h3>Skill loadout</h3>
        <details className="skill-reference">
          <summary>Inspect available skills</summary>
          <p>Hover, focus or tap a skill for its effect. Active slot 1 takes priority when ready; otherwise slot 2, then Basic Attack.</p>
          <ul>{[...new Set([...(CLASS_SKILLS[hero.primaryClassId] ?? []).filter((s) => s.kind === "basic").map((s) => s.skillId), ...activeOptions, ...passiveOptions])].map((skillId) => <li key={skillId}><SkillLabel skillId={skillId} /></li>)}</ul>
        </details>
        <label htmlFor={`${headingId}-active0`}>Active 1</label>
        <SkillSelect id={`${headingId}-active0`} value={active[0]} options={activeOptions} onChange={(v) => setActive([v, active[1]])} disabled={loadoutLocked} />
        <label htmlFor={`${headingId}-active1`}>Active 2</label>
        <SkillSelect id={`${headingId}-active1`} value={active[1]} options={activeOptions} onChange={(v) => setActive([active[0], v])} disabled={loadoutLocked} />
        <label htmlFor={`${headingId}-passive0`}>Passive 1</label>
        <SkillSelect id={`${headingId}-passive0`} value={passive[0]} options={passiveOptions} onChange={(v) => setPassive([v, passive[1]])} disabled={loadoutLocked} />
        <label htmlFor={`${headingId}-passive1`}>Passive 2</label>
        <SkillSelect id={`${headingId}-passive1`} value={passive[1]} options={passiveOptions} onChange={(v) => setPassive([passive[0], v])} disabled={loadoutLocked} />
        <button type="button" onClick={saveLoadout} disabled={loadoutLocked || pending !== null}>
          {pending === "loadout" ? COPY.state_action_pending.label : COPY.action_save_loadout}
        </button>
        {loadoutLocked ? <p className="disabled-note">{COPY.expedition_loadout_locked.body}</p> : null}
      </div>
    </section>
  );
}

function FormationEditor({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const current = state.formation?.slots ?? [null, null, null, null, null];
  const [slots, setSlots] = useState<[string | null, string | null, string | null, string | null, string | null]>(current);
  const [pending, setPending] = useState(false);

  function setSlot(index: number, heroId: string | null) {
    const next = [...slots] as typeof slots;
    // Assigning a hero already fielded elsewhere moves it here instead of
    // duplicating it, so picking the same hero into two selects acts as a
    // swap rather than requiring the user to clear the old slot first.
    if (heroId) {
      const existingIndex = next.indexOf(heroId);
      if (existingIndex >= 0) next[existingIndex] = null;
    }
    next[index] = heroId;
    setSlots(next);
  }

  async function save() {
    setPending(true);
    await runMutation(async () => {
      await patch("/party/formation", mutationPayload(state.revision, { slots }));
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  const heroName = (heroId: string) => {
    const hero = state.heroes.find((h) => h.heroId === heroId);
    return hero ? classCopy(hero.primaryClassId).name : heroId;
  };

  return (
    <section className="formation-editor" aria-labelledby="formation-heading">
      <h2 id="formation-heading">Formation</h2>
      <p>Front row (slots 1-3) takes hits first unless an enemy ignores row protection; back row (slots 4-5) is protected until the front row falls.</p>
      <div className="formation-rows">
        <div className="formation-row">
          <h3>Front row</h3>
          {[0, 1, 2].map((i) => (
            <select key={i} aria-label={`Front row slot ${i + 1}`} value={slots[i] ?? ""} onChange={(e) => setSlot(i, e.target.value || null)}>
              <option value="">(empty)</option>
              {state.heroes.map((h) => (
                <option key={h.heroId} value={h.heroId}>
                  {heroName(h.heroId)}
                  {slots.includes(h.heroId) && slots[i] !== h.heroId ? " (fielded elsewhere)" : ""}
                </option>
              ))}
            </select>
          ))}
        </div>
        <div className="formation-row">
          <h3>Back row</h3>
          {[3, 4].map((i) => (
            <select key={i} aria-label={`Back row slot ${i - 2}`} value={slots[i] ?? ""} onChange={(e) => setSlot(i, e.target.value || null)}>
              <option value="">(empty)</option>
              {state.heroes.map((h) => (
                <option key={h.heroId} value={h.heroId}>
                  {heroName(h.heroId)}
                  {slots.includes(h.heroId) && slots[i] !== h.heroId ? " (fielded elsewhere)" : ""}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>
      <button type="button" onClick={save} disabled={pending || slots.every((s) => s === null)}>
        {pending ? COPY.state_action_pending.label : COPY.action_save_formation}
      </button>
    </section>
  );
}

export function CompanyScreen({ state, controller, onGoExpedition }: { state: AccountState; controller: AccountStateController; onGoExpedition: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const activityActive = isActivityActive(state);
  const refetch = () => controller.refetch();

  return (
    <main className="screen screen-company">
      <h1 ref={headingRef} tabIndex={-1}>
        Company
      </h1>
      <PrimaryActionBanner state={state} onGoExpedition={onGoExpedition} />
      {activityActive ? (
        <p className="inline-note">
          {COPY.expedition_loadout_locked.title}: {COPY.expedition_loadout_locked.body}
        </p>
      ) : null}
      <RecruitPanel state={state} controller={controller} />
      <FormationEditor state={state} controller={controller} />
      <h2>Roster</h2>
      <div className="hero-card-grid">
        {state.heroes.map((hero) => (
          <HeroCard key={hero.heroId} hero={hero} inventory={state.inventory} activityActive={activityActive} accountRevision={state.revision} controller={controller} refetch={refetch} />
        ))}
      </div>
    </main>
  );
}
