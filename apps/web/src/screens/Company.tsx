import { useEffect, useRef, useState } from "react";
import { patch, post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, Hero } from "../types.js";
import { COPY, classCopy, composeItemName, specializationCopy } from "../copy.js";
import { canChooseSpecialization, isExpeditionActive, isSpecUnlocked } from "../rules.js";
import { CLASS_SPECIALIZATIONS } from "../frozenIds.js";

function PrimaryActionBanner({ state, onGoExpedition }: { state: AccountState; onGoExpedition: () => void }) {
  let message: string;
  if (state.expedition.status === "none") {
    message = "Start your first expedition";
  } else if (state.expedition.status === "active") {
    message = `Expedition running — ${state.expedition.cyclesCompletedSinceStart} cycles so far`;
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

function GearSlot({ hero, slot, inventory }: { hero: Hero; slot: "weapon" | "armor" | "trinket"; inventory: AccountState["inventory"] }) {
  const itemId = hero.equipment[slot];
  const item = itemId ? inventory.find((i) => i.itemInstanceId === itemId) : null;
  return (
    <li>
      <span className="slot-label">{slot[0]!.toUpperCase() + slot.slice(1)}:</span> {item ? composeItemName(item.definitionId, item.affixId) : "Empty"}
    </li>
  );
}

function SpecializationPicker({ hero, expeditionActive, accountRevision, controller, refetch }: { hero: Hero; expeditionActive: boolean; accountRevision: number; controller: AccountStateController; refetch: () => void }) {
  const specializations = CLASS_SPECIALIZATIONS[hero.classId];
  const [pending, setPending] = useState(false);

  if (!isSpecUnlocked(hero)) {
    return <p className="disabled-note">{COPY.disabled_spec_locked_level}</p>;
  }
  if (hero.specializationId !== null) return null;
  if (!canChooseSpecialization(hero, expeditionActive)) {
    return <p className="disabled-note">{COPY.disabled_spec_locked_expedition}</p>;
  }
  if (!specializations) return null;

  async function choose(specializationId: string) {
    setPending(true);
    await runMutation(async () => {
      await post(`/hero/specialization`, mutationPayload(accountRevision, { heroId: hero.heroId, specializationId }));
      refetch();
    }, controller);
    setPending(false);
  }

  return (
    <div className="spec-picker" role="group" aria-label="Choose specialization">
      {specializations.map((specId) => {
        const copy = specializationCopy(specId);
        return (
          <button type="button" key={specId} disabled={pending} onClick={() => choose(specId)}>
            {copy.name}
            <span className="spec-desc">{copy.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

function HeroCard({
  hero,
  inventory,
  slotIndex,
  partyOrder,
  expeditionActive,
  accountRevision,
  controller,
  refetch,
}: {
  hero: Hero;
  inventory: AccountState["inventory"];
  slotIndex: number;
  partyOrder: [string, string, string];
  expeditionActive: boolean;
  accountRevision: number;
  controller: AccountStateController;
  refetch: () => void;
}) {
  const classCopyEntry = classCopy(hero.classId);
  const specCopy = hero.specializationId ? specializationCopy(hero.specializationId) : null;
  const headingId = `hero-card-${hero.heroId}`;
  const [moving, setMoving] = useState(false);

  async function move(direction: -1 | 1) {
    const newOrder = [...partyOrder] as [string, string, string];
    const target = slotIndex + direction;
    if (target < 0 || target > 2) return;
    [newOrder[slotIndex], newOrder[target]] = [newOrder[target]!, newOrder[slotIndex]!];
    setMoving(true);
    await runMutation(async () => {
      await patch(`/party/order`, mutationPayload(accountRevision, { order: newOrder }));
      refetch();
    }, controller);
    setMoving(false);
  }

  return (
    <section className="hero-card" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {classCopyEntry.name} <span className="hero-level">Lv {hero.level}</span>
      </h2>
      <p className="hero-spec">
        {specCopy ? `${specCopy.name} — ${specCopy.desc}` : isSpecUnlocked(hero) ? "Unspecialized — specialization available" : "Unspecialized until level 3"}
      </p>
      {/* Raw XP only: the next-level threshold is a server-owned formula
          (packages/game's xpToNext). Per architecture.md ("apps/web: ...
          No client-authoritative loot, XP, time, stats or victory") this
          screen shows only what the server reported, not a recomputed
          target — see reports/engineering/M1-10.md for the contracts.md
          proposal to add a server-supplied value here. */}
      <p className="hero-xp">XP {hero.xp}</p>
      <ul className="hero-gear">
        <GearSlot hero={hero} slot="weapon" inventory={inventory} />
        <GearSlot hero={hero} slot="armor" inventory={inventory} />
        <GearSlot hero={hero} slot="trinket" inventory={inventory} />
      </ul>
      <SpecializationPicker hero={hero} expeditionActive={expeditionActive} accountRevision={accountRevision} controller={controller} refetch={refetch} />
      <div className="party-order-control">
        <button type="button" onClick={() => move(-1)} disabled={slotIndex === 0 || moving} aria-disabled={slotIndex === 0}>
          Move up
        </button>
        <button type="button" onClick={() => move(1)} disabled={slotIndex === 2 || moving} aria-disabled={slotIndex === 2}>
          Move down
        </button>
      </div>
    </section>
  );
}

export function CompanyScreen({ state, controller, onGoExpedition }: { state: AccountState; controller: AccountStateController; onGoExpedition: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (!state.partyOrder) {
    return (
      <main className="screen">
        <h1 ref={headingRef} tabIndex={-1}>
          Company
        </h1>
        <p>{COPY.disabled_party_incomplete}</p>
      </main>
    );
  }

  const order = state.partyOrder.order;
  const expeditionActive = isExpeditionActive(state);
  const refetch = () => controller.refetch();

  return (
    <main className="screen screen-company">
      <h1 ref={headingRef} tabIndex={-1}>
        Company
      </h1>
      <PrimaryActionBanner state={state} onGoExpedition={onGoExpedition} />
      {expeditionActive ? (
        <p className="inline-note">
          {COPY.expedition_loadout_locked.title}: {COPY.expedition_loadout_locked.body}
        </p>
      ) : null}
      <div className="hero-card-grid">
        {order.map((heroId, index) => {
          const hero = state.heroes.find((h) => h.heroId === heroId);
          if (!hero) return null;
          return (
            <HeroCard
              key={heroId}
              hero={hero}
              inventory={state.inventory}
              slotIndex={index}
              partyOrder={order}
              expeditionActive={expeditionActive}
              accountRevision={state.revision}
              controller={controller}
              refetch={refetch}
            />
          );
        })}
      </div>
    </main>
  );
}
