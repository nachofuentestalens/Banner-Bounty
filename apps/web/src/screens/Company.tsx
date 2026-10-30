import { useEffect, useRef, useState } from "react";
import { patch, post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, Hero } from "../types.js";
import { COPY, classCopy, composeItemName, skillCopy } from "../copy.js";
import { isActivityActive, isSecondaryClassUnlocked, canAssignSecondaryClass, nextGoal, heroOrdinalLabel } from "../rules.js";
import { BASE_CLASS_IDS, CLASS_SKILLS, unlockedSkillPool } from "../frozenIds.js";
import { SkillLabel } from "../components/SkillLabel.js";
import { skillMechanics } from "../skillMechanics.js";
import { NextStep } from "../components/NextStep.js";
import { FirstDispatchGuide, isFirstDispatchGuideDismissed } from "../components/FirstDispatchGuide.js";
import type { Screen } from "../App.js";
import type { EquipmentSlot } from "../types.js";

/**
 * Heuristic only (first-session-redesign.md 4.3's "formation hint" calls for
 * a back-row marker "from the shared class data, not a new table"; no such
 * per-class row-affinity flag currently exists in frozenIds.ts). This list
 * is a readable approximation — healer/caster/support classes — not a
 * frozen design classification; flagged as a limitation in the task report.
 */
const BACKLINE_HINT_CLASSES = new Set(["class_cleric", "class_arcanist", "class_herald"]);

function RecruitDisclosure({ state, controller, onOpenCodexClass }: { state: AccountState; controller: AccountStateController; onOpenCodexClass: (classId: string) => void }) {
  const [classId, setClassId] = useState(BASE_CLASS_IDS[0]!);
  const [pending, setPending] = useState(false);
  const cost = 150 * state.heroes.length;
  const canAfford = state.gold >= cost;
  const rosterFull = state.heroes.length >= 20;

  async function recruit() {
    setPending(true);
    await runMutation(async () => {
      await post("/hero/recruit", mutationPayload(state.revision, { primaryClassId: classId }));
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  return (
    <details className="recruit-panel">
      <summary>Recruit a hero (next costs {cost} gold)</summary>
      <fieldset>
        <legend>Class</legend>
        {BASE_CLASS_IDS.map((id) => (
          <label key={id} className="recruit-class-option">
            <input type="radio" name="recruit-class" value={id} checked={classId === id} onChange={() => setClassId(id)} />
            <strong>{classCopy(id).name}</strong> — {classCopy(id).desc}{" "}
            <button type="button" onClick={() => onOpenCodexClass(id)}>
              {COPY.codex_about_class}
            </button>
          </label>
        ))}
      </fieldset>
      <button type="button" onClick={recruit} disabled={pending || rosterFull || !canAfford}>
        {pending ? COPY.state_action_pending.label : COPY.action_recruit}
      </button>
      {!canAfford ? <p className="disabled-note">{COPY.recruit_cannot_afford}</p> : null}
      {rosterFull ? <p className="disabled-note">{COPY.recruit_roster_full}</p> : null}
    </details>
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

function HeroBuild({ hero, inventory, activityActive, accountRevision, controller, refetch, onOpenCodexClass }: { hero: Hero; inventory: AccountState["inventory"]; activityActive: boolean; accountRevision: number; controller: AccountStateController; refetch: () => void; onOpenCodexClass: (classId: string) => void }) {
  const headingId = `hero-build-${hero.heroId}`;
  const [secondaryChoice, setSecondaryChoice] = useState(hero.secondaryClassId ?? BASE_CLASS_IDS.find((c) => c !== hero.primaryClassId)!);
  const [active, setActive] = useState<[string, string]>(hero.skillLoadout.active);
  const [passive, setPassive] = useState<[string, string]>(hero.skillLoadout.passive);
  const [pending, setPending] = useState<"secondary" | "loadout" | null>(null);

  const activeOptions = unlockedSkillPool(hero.primaryClassId, hero.secondaryClassId, hero.level, "active");
  const passiveOptions = unlockedSkillPool(hero.primaryClassId, hero.secondaryClassId, hero.level, "passive");
  const canDual = canAssignSecondaryClass(hero, activityActive);
  const loadoutLocked = activityActive;
  const loadoutDirty = active[0] !== hero.skillLoadout.active[0] || active[1] !== hero.skillLoadout.active[1] || passive[0] !== hero.skillLoadout.passive[0] || passive[1] !== hero.skillLoadout.passive[1];

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
    <div id={headingId} className="hero-build">
      <p className="hero-gear-summary">Gear: {equipped.join(", ")}</p>
      <button type="button" onClick={() => onOpenCodexClass(hero.primaryClassId)}>
        {COPY.codex_about_class}
      </button>

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
          {!canDual && activityActive ? <span className="disabled-note">{COPY.expedition_loadout_locked.body}</span> : null}
        </div>
      )}

      <div className="loadout-editor">
        <h4>
          Skill loadout {loadoutDirty ? <span className="unsaved-marker">[{COPY.formation_unsaved}]</span> : null}
        </h4>
        <details className="skill-reference">
          <summary>Inspect available skills</summary>
          <p>Hover, focus or tap a skill for its effect. Active slot 1 takes priority when ready; otherwise slot 2, then Basic Attack.</p>
          <ul>
            {[...new Set([...(CLASS_SKILLS[hero.primaryClassId] ?? []).filter((s) => s.kind === "basic").map((s) => s.skillId), ...activeOptions, ...passiveOptions])].map((skillId) => (
              <li key={skillId}>
                <SkillLabel skillId={skillId} />
              </li>
            ))}
          </ul>
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
    </div>
  );
}

function HeroRow({ hero, heroes, inventory, activityActive, accountRevision, controller, refetch, onOpenCodexClass, rowLabel, registerRef }: { hero: Hero; heroes: Hero[]; inventory: AccountState["inventory"]; activityActive: boolean; accountRevision: number; controller: AccountStateController; refetch: () => void; onOpenCodexClass: (classId: string) => void; rowLabel: string; registerRef: (el: HTMLElement | null) => void }) {
  const ordinal = heroOrdinalLabel(heroes, hero.heroId);
  return (
    <li className="hero-row" ref={registerRef}>
      <details>
        <summary>
          <strong>{ordinal}</strong> Lv {hero.level} <span className="hero-row-field">({rowLabel} row)</span>
          {/* No XP-to-next-level threshold is exposed by the server (architecture.md forbids computing it client-side), so this shows the raw XP count rather than a fabricated-max progress bar. */}
          <span className="hero-row-field" role="status" aria-label={`XP ${hero.xp}`}>
            XP {hero.xp}
          </span>
          {hero.effectiveStats ? (
            <span className="hero-row-field">
              HP {hero.effectiveStats.maxHp} / ATK {hero.effectiveStats.atk} / DEF {hero.effectiveStats.def} / SPD {hero.effectiveStats.spd}
            </span>
          ) : null}
          <span className="hero-row-field">Gear {(["weapon", "armor", "trinket"] as const).filter((s) => hero.equipment[s]).length}/3</span>
        </summary>
        <details>
          <summary>Build</summary>
          <HeroBuild hero={hero} inventory={inventory} activityActive={activityActive} accountRevision={accountRevision} controller={controller} refetch={refetch} onOpenCodexClass={onOpenCodexClass} />
        </details>
      </details>
    </li>
  );
}

type FormationSlots = [string | null, string | null, string | null, string | null, string | null];

const rowOfSlotIndex = (i: number) => (i < 3 ? "Front" : "Back");

/** Module-level (not nested inside FormationBoard's render) so React keeps
 * stable identity across re-renders instead of remounting every slot's DOM
 * — a nested component definition would otherwise get a new function
 * reference on every state change, tearing down and rebuilding the whole
 * board (and detaching mid-interaction elements like an open radio list)
 * each time a slot is picked. */
function FormationSlot({
  index,
  heroes,
  draft,
  openSlot,
  setOpenSlot,
  pick,
  activityActive,
}: {
  index: number;
  heroes: readonly Hero[];
  draft: FormationSlots;
  openSlot: number | null;
  setOpenSlot: (i: number | null) => void;
  pick: (index: number, heroId: string) => void;
  activityActive: boolean;
}) {
  const heroId = draft[index];
  return (
    <div className="formation-slot">
      <button type="button" aria-expanded={openSlot === index} onClick={() => setOpenSlot(openSlot === index ? null : index)} disabled={activityActive}>
        {heroId ? `${heroOrdinalLabel(heroes, heroId)} Lv${heroes.find((h) => h.heroId === heroId)?.level ?? 1}` : "(empty)"}
      </button>
      {openSlot === index ? (
        <fieldset className="formation-slot-picker">
          <legend>
            Choose a hero for {rowOfSlotIndex(index)} slot {index < 3 ? index + 1 : index - 2}
          </legend>
          {heroes.map((h) => {
            const currentSlotIndex = draft.indexOf(h.heroId);
            return (
              <label key={h.heroId}>
                <input type="radio" name={`formation-slot-${index}`} checked={draft[index] === h.heroId} onChange={() => pick(index, h.heroId)} />
                {heroOrdinalLabel(heroes, h.heroId)}, {classCopy(h.primaryClassId).name}, Lv {h.level}
                {currentSlotIndex >= 0 ? ` (currently ${rowOfSlotIndex(currentSlotIndex)})` : " (bench)"}
              </label>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}

function FormationBoard({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const serverSlots = state.formation?.slots ?? [null, null, null, null, null];
  const [draft, setDraft] = useState<[string | null, string | null, string | null, string | null, string | null]>(serverSlots);
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const activityActive = isActivityActive(state);
  const dirty = draft.some((s, i) => s !== serverSlots[i]);

  /** Deliberately leaves the picker open after a pick (toggle the slot
   * button again to close it): auto-closing would yank focus out from
   * under a keyboard/screen-reader user mid-interaction, with nowhere
   * defined for it to land. */
  function pick(index: number, heroId: string) {
    const next = [...draft] as typeof draft;
    const existingIndex = next.indexOf(heroId);
    if (existingIndex >= 0) next[existingIndex] = null;
    next[index] = heroId;
    setDraft(next);
  }

  async function save() {
    setPending(true);
    await runMutation(async () => {
      await patch("/party/formation", mutationPayload(state.revision, { slots: draft }));
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  function discard() {
    setDraft(serverSlots);
    setOpenSlot(null);
  }

  const backlineInFront = draft.slice(0, 3).some((id) => {
    const hero = id ? state.heroes.find((h) => h.heroId === id) : null;
    return hero && BACKLINE_HINT_CLASSES.has(hero.primaryClassId);
  });

  return (
    <section className="formation-editor" aria-labelledby="formation-heading">
      <div className="formation-header">
        <h2 id="formation-heading">Formation{dirty ? <span className="unsaved-marker"> [{COPY.formation_unsaved}]</span> : null}</h2>
        <div className="formation-save-bar">
          <button type="button" onClick={save} disabled={pending || !dirty || activityActive}>
            {pending ? COPY.state_action_pending.label : COPY.action_save_formation}
          </button>
          <button type="button" onClick={discard} disabled={!dirty}>
            Discard
          </button>
        </div>
      </div>
      <p>Front row takes hits first; back row is protected until the front row falls.</p>
      <div className="formation-rows">
        <div className="formation-row">
          <h3>Front row</h3>
          {[0, 1, 2].map((i) => (
            <FormationSlot key={i} index={i} heroes={state.heroes} draft={draft} openSlot={openSlot} setOpenSlot={setOpenSlot} pick={pick} activityActive={activityActive} />
          ))}
        </div>
        <div className="formation-row">
          <h3>Back row</h3>
          {[3, 4].map((i) => (
            <FormationSlot key={i} index={i} heroes={state.heroes} draft={draft} openSlot={openSlot} setOpenSlot={setOpenSlot} pick={pick} activityActive={activityActive} />
          ))}
        </div>
      </div>
      {backlineInFront ? <p className="inline-note">{COPY.formation_hint_backline}</p> : null}
      {activityActive ? <p className="disabled-note">{COPY.expedition_loadout_locked.body}</p> : null}
    </section>
  );
}

export function CompanyScreen({
  state,
  controller,
  onNavigate,
  onOpenCodexClass,
  onOpenInventorySlot,
  focusHeroId,
  onFocusHeroConsumed,
}: {
  state: AccountState;
  controller: AccountStateController;
  onNavigate: (screen: Screen) => void;
  onOpenCodexClass: (classId: string) => void;
  onOpenInventorySlot: (slot?: EquipmentSlot) => void;
  focusHeroId: string | null;
  onFocusHeroConsumed: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const heroRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [guideDismissed, setGuideDismissed] = useState(isFirstDispatchGuideDismissed());
  const activityActive = isActivityActive(state);
  const refetch = () => controller.refetch();
  const goal = nextGoal(state);
  const showGuide = goal.id === "dispatch" && !guideDismissed;

  function focusHeroRow(heroId: string) {
    const el = heroRefs.current[heroId];
    if (el) {
      el.querySelectorAll("details").forEach((d) => {
        d.open = true;
      });
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  useEffect(() => {
    if (!focusHeroId) return;
    focusHeroRow(focusHeroId);
    onFocusHeroConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusHeroId]);

  return (
    <main className="screen screen-company">
      <div className="company-header">
        <h1 ref={headingRef} tabIndex={-1}>
          Company
        </h1>
        <p className="company-summary-line">
          Gold {state.gold} | Roster {state.heroes.length}/20
        </p>
      </div>
      <NextStep state={state} onNavigate={onNavigate} onOpenInventorySlot={onOpenInventorySlot} onFocusHeroBuild={focusHeroRow} />
      {showGuide ? (
        <FirstDispatchGuide state={state} controller={controller} onDismiss={() => setGuideDismissed(true)} onNavigate={onNavigate} onFocusHero={focusHeroRow} />
      ) : null}
      <FormationBoard state={state} controller={controller} />
      <h2>Roster</h2>
      <ul className="hero-row-list">
        {state.heroes.map((hero) => (
          <HeroRow
            key={hero.heroId}
            hero={hero}
            heroes={state.heroes}
            inventory={state.inventory}
            activityActive={activityActive}
            accountRevision={state.revision}
            controller={controller}
            refetch={refetch}
            onOpenCodexClass={onOpenCodexClass}
            rowLabel={(() => {
              const slots: readonly (string | null)[] = state.formation?.slots ?? [];
              const idx = slots.indexOf(hero.heroId);
              return idx < 0 ? "Bench" : idx < 3 ? "Front" : "Back";
            })()}
            registerRef={(el) => {
              heroRefs.current[hero.heroId] = el;
            }}
          />
        ))}
      </ul>
      <RecruitDisclosure state={state} controller={controller} onOpenCodexClass={onOpenCodexClass} />
    </main>
  );
}
