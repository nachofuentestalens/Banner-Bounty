import { useEffect, useRef, useState } from "react";
import { post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, EquipmentSlot, Hero, ItemInstance } from "../types.js";
import { COPY, affixCopy, classCopy, composeItemName, itemCopy, rarityLabel } from "../copy.js";
import { isActivityActive, fieldedHeroIds } from "../rules.js";
import { ITEM_DEFINITION_IDS, itemSlot } from "../frozenIds.js";

type SlotFilter = "all" | EquipmentSlot;
type OwnerFilter = "all" | "equipped" | "unequipped";

function ownerLabel(item: ItemInstance, heroes: Hero[]): string {
  if (!item.equippedBy) return "Unequipped";
  const hero = heroes.find((h) => h.heroId === item.equippedBy);
  if (!hero) return "Unequipped";
  const slot = (Object.entries(hero.equipment).find(([, id]) => id === item.itemInstanceId)?.[0] as EquipmentSlot | undefined) ?? "weapon";
  return `${classCopy(hero.primaryClassId).name} (${slot})`;
}

/**
 * Current-vs-candidate comparison, text-only. ui-spec.md's
 * GearComparisonPanel calls for a numeric HP/ATK/DEF "Now -> After" table
 * computed from "the already-fetched hero's current effective stats" — but
 * no endpoint currently returns a hero's computed effective stats (only raw
 * level/class/spec/equipment IDs), and apps/web must not compute them
 * itself (architecture.md: "apps/web: ... No client-authoritative loot, XP,
 * time, stats or victory"). This is a recorded, reversible degradation
 * pending a contracts.md extension (see reports/engineering/M1-10.md) that
 * adds a server-computed effectiveStats field to GET /account/state; once
 * that lands this panel can show real deltas again.
 */
function GearComparisonPanel({
  item,
  heroes,
  inventory,
  expeditionActive,
  accountRevision,
  controller,
  onDone,
}: {
  item: ItemInstance;
  heroes: Hero[];
  inventory: ItemInstance[];
  expeditionActive: boolean;
  accountRevision: number;
  controller: AccountStateController;
  onDone: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const slot = itemSlot(item.definitionId);
  const [heroId, setHeroId] = useState(heroes[0]?.heroId ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const hero = heroes.find((h) => h.heroId === heroId);
  if (!hero) return null;

  // hero.equipment holds item *instance* IDs; copy lookups need the definition.
  const currentItemId = hero.equipment[slot];
  const currentItem = currentItemId ? inventory.find((i) => i.itemInstanceId === currentItemId) : undefined;

  async function confirm() {
    setPending(true);
    await runMutation(async () => {
      await post("/equipment/equip", mutationPayload(accountRevision, { heroId, itemInstanceId: item.itemInstanceId, slot }));
      await controller.refetch();
      onDone();
    }, controller);
    setPending(false);
  }

  return (
    <div className="gear-comparison-panel" ref={panelRef} tabIndex={-1}>
      <h3>
        Compare: {composeItemName(item.definitionId, item.affixes)} ({rarityLabel(item.rarityId)})
      </h3>
      <label htmlFor="compare-hero-select">Hero</label>
      <select id="compare-hero-select" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
        {heroes.map((h) => (
          <option key={h.heroId} value={h.heroId}>
            {classCopy(h.primaryClassId).name}
          </option>
        ))}
      </select>
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">Now</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{currentItem ? composeItemName(currentItem.definitionId, currentItem.affixes) : "Empty"}</td>
            <td>{composeItemName(item.definitionId, item.affixes)}</td>
          </tr>
          <tr>
            <td>{currentItem ? itemCopy(currentItem.definitionId).desc : "—"}</td>
            <td>{itemCopy(item.definitionId).desc}</td>
          </tr>
        </tbody>
      </table>
      <p className="disabled-note">Exact stat change isn&apos;t shown yet — the server doesn&apos;t report computed hero stats in M1.</p>
      {expeditionActive ? <p className="disabled-note">{COPY.disabled_equip_locked_expedition}</p> : null}
      <div className="compare-actions">
        <button type="button" onClick={confirm} disabled={pending || expeditionActive}>
          {pending ? COPY.state_action_pending.label : "Confirm equip"}
        </button>
        <button type="button" onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  heroes,
  expeditionActive,
  accountRevision,
  controller,
  selected,
  onSelect,
  fitsEmptySlot,
}: {
  item: ItemInstance;
  heroes: Hero[];
  expeditionActive: boolean;
  accountRevision: number;
  controller: AccountStateController;
  selected: boolean;
  onSelect: () => void;
  fitsEmptySlot: boolean;
}) {
  const [pending, setPending] = useState(false);
  const equippedHero = item.equippedBy ? heroes.find((h) => h.heroId === item.equippedBy) : undefined;
  const slot = (equippedHero && (Object.entries(equippedHero.equipment).find(([, id]) => id === item.itemInstanceId)?.[0] as EquipmentSlot | undefined)) ?? itemSlot(item.definitionId);

  const [reforging, setReforging] = useState(false);

  async function unequip() {
    if (!equippedHero) return;
    setPending(true);
    await runMutation(async () => {
      await post("/equipment/unequip", mutationPayload(accountRevision, { heroId: equippedHero.heroId, slot }));
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  async function reforge(affixIndex: number) {
    setReforging(true);
    await runMutation(async () => {
      await post("/reforge", mutationPayload(accountRevision, { itemInstanceId: item.itemInstanceId, affixIndex }));
      await controller.refetch();
    }, controller);
    setReforging(false);
  }

  return (
    <li className="item-row">
      <span className="item-name">
        {composeItemName(item.definitionId, item.affixes)} <span className="rarity-tag">({rarityLabel(item.rarityId)})</span>
      </span>
      <span className="item-desc">{itemCopy(item.definitionId).desc}</span>
      <span className="item-owner">{ownerLabel(item, heroes)}</span>
      {!item.equippedBy && fitsEmptySlot ? <span className="fits-slot-badge">Fits an empty slot</span> : null}
      {item.equippedBy ? (
        <button type="button" onClick={unequip} disabled={pending || expeditionActive}>
          {pending ? COPY.state_action_pending.label : COPY.action_unequip}
        </button>
      ) : (
        <button type="button" onClick={onSelect} aria-expanded={selected} disabled={expeditionActive}>
          {COPY.action_equip}
        </button>
      )}
      {!item.equippedBy && item.rarityId !== "common" ? (
        <span className="reforge-row">
          {item.affixes.map((affix, i) => (
            <button key={i} type="button" disabled={reforging || expeditionActive} onClick={() => reforge(i)} title={`Reforge this item's ${affixCopy(affix.affixId).name} affix`}>
              {reforging ? COPY.state_action_pending.label : `${COPY.action_reforge} ${affixCopy(affix.affixId).name}`}
            </button>
          ))}
        </span>
      ) : null}
    </li>
  );
}

const RECIPES = [
  { recipeId: "craft_uncommon", label: "Craft uncommon" },
  { recipeId: "craft_rare", label: "Craft rare" },
  { recipeId: "craft_epic", label: "Craft epic" },
] as const;

function CraftingPanel({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const [recipeId, setRecipeId] = useState<string>(RECIPES[0].recipeId);
  const [definitionId, setDefinitionId] = useState<string>(ITEM_DEFINITION_IDS[0]!);
  const [pending, setPending] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const unequippedCount = state.inventory.filter((i) => !i.equippedBy).length;

  async function craft() {
    setPending(true);
    setResultMessage(null);
    const payload: Record<string, unknown> = { recipeId, definitionId };
    if (unequippedCount >= 100) {
      const replacement = state.inventory.find((i) => !i.equippedBy);
      if (replacement) payload.replacementItemInstanceId = replacement.itemInstanceId;
    }
    await runMutation(async () => {
      const { data } = await post<{ item: ItemInstance }>("/craft", mutationPayload(state.revision, payload));
      setResultMessage(`Crafted ${composeItemName(data.item.definitionId, data.item.affixes)} (${rarityLabel(data.item.rarityId)}).`);
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  return (
    <section className="crafting-panel" aria-labelledby="crafting-heading">
      <h2 id="crafting-heading">Crafting</h2>
      <p>
        Materials: {state.materials.scrap} scrap, {state.materials.sigil} sigil, {state.materials.core} core.
      </p>
      <label htmlFor="craft-recipe">Recipe</label>
      <select id="craft-recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
        {RECIPES.map((r) => (
          <option key={r.recipeId} value={r.recipeId}>
            {r.label}
          </option>
        ))}
      </select>
      <label htmlFor="craft-definition">Item</label>
      <select id="craft-definition" value={definitionId} onChange={(e) => setDefinitionId(e.target.value)}>
        {ITEM_DEFINITION_IDS.map((id) => (
          <option key={id} value={id}>
            {itemCopy(id).name}
          </option>
        ))}
      </select>
      <button type="button" onClick={craft} disabled={pending}>
        {pending ? COPY.state_action_pending.label : COPY.action_craft}
      </button>
      {resultMessage ? <p role="status">{resultMessage}</p> : null}
    </section>
  );
}

export function InventoryScreen({ state, controller, initialSlotFilter }: { state: AccountState; controller: AccountStateController; initialSlotFilter?: EquipmentSlot | null }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [slotFilter, setSlotFilter] = useState<SlotFilter>(initialSlotFilter ?? "all");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => {
    if (!initialSlotFilter) return null;
    const fits = state.inventory.find((i) => !i.equippedBy && itemSlot(i.definitionId) === initialSlotFilter);
    return fits?.itemInstanceId ?? null;
  });

  const expeditionActive = isActivityActive(state);
  const unequippedCount = state.inventory.filter((i) => !i.equippedBy).length;

  const filtered = state.inventory.filter((item) => {
    if (slotFilter !== "all" && itemSlot(item.definitionId) !== slotFilter) return false;
    if (ownerFilter === "equipped" && !item.equippedBy) return false;
    if (ownerFilter === "unequipped" && item.equippedBy) return false;
    return true;
  });

  const selectedItem = selectedItemId ? state.inventory.find((i) => i.itemInstanceId === selectedItemId) ?? null : null;
  const fielded = fieldedHeroIds(state);
  const fitsEmptySlot = (item: ItemInstance) => !item.equippedBy && state.heroes.some((h) => fielded.includes(h.heroId) && h.equipment[itemSlot(item.definitionId)] === null);

  return (
    <main className="screen screen-inventory">
      <h1 ref={headingRef} tabIndex={-1}>
        Inventory
      </h1>
      {expeditionActive ? <p className="inline-note">{COPY.disabled_equip_locked_expedition}</p> : null}
      <CraftingPanel state={state} controller={controller} />
      <div className="inventory-filter-bar">
        <label htmlFor="slot-filter">Slot</label>
        <select id="slot-filter" value={slotFilter} onChange={(e) => setSlotFilter(e.target.value as SlotFilter)}>
          <option value="all">All slots</option>
          <option value="weapon">Weapon</option>
          <option value="armor">Armor</option>
          <option value="trinket">Trinket</option>
        </select>
        <label htmlFor="owner-filter">Status</label>
        <select id="owner-filter" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value as OwnerFilter)}>
          <option value="all">All items</option>
          <option value="equipped">Equipped</option>
          <option value="unequipped">Unequipped</option>
        </select>
        {unequippedCount >= 100 ? (
          <p className="inline-note">
            {COPY.inventory_overflow.title} (100/100)
          </p>
        ) : null}
      </div>
      {state.inventory.length === 0 ? (
        <div className="empty-state">
          <p>{COPY.state_empty_inventory.label}</p>
          <p>{COPY.state_empty_inventory.desc}</p>
        </div>
      ) : (
        <ul className="item-grid">
          {filtered.map((item) => (
            <ItemRow
              key={item.itemInstanceId}
              item={item}
              heroes={state.heroes}
              expeditionActive={expeditionActive}
              accountRevision={state.revision}
              controller={controller}
              selected={selectedItemId === item.itemInstanceId}
              onSelect={() => setSelectedItemId(item.itemInstanceId === selectedItemId ? null : item.itemInstanceId)}
              fitsEmptySlot={fitsEmptySlot(item)}
            />
          ))}
        </ul>
      )}
      {selectedItem && !expeditionActive ? (
        <GearComparisonPanel
          item={selectedItem}
          heroes={state.heroes}
          inventory={state.inventory}
          expeditionActive={expeditionActive}
          accountRevision={state.revision}
          controller={controller}
          onDone={() => setSelectedItemId(null)}
        />
      ) : null}
    </main>
  );
}
