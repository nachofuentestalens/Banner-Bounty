// first-session-redesign.md section 8.1. UI only: all data comes from the
// shared class/skill content (frozenIds.ts/copy.ts/skillMechanics.ts for
// names and skill text, @banner-and-bounty/content for base stats, growth
// per level and class-pairing synergies — the same validated package
// apps/server and packages/game already depend on). This is reference
// content display, not client-authoritative gameplay: architecture.md's
// "no client-authoritative ... stats" bars computing a hero's live stats
// client-side, not showing the frozen base-stat table the server itself
// uses to build those heroes.
import { useEffect, useRef, useState } from "react";
import { classCopy, skillCopy } from "../copy.js";
import { skillMechanics } from "../skillMechanics.js";
import { BASE_CLASS_IDS, CLASS_SKILLS } from "../frozenIds.js";
import { getClassBaseStatsV2, SYNERGY_PAIRS } from "@banner-and-bounty/content";

const ROLE_TAG: Record<string, string> = {
  class_vanguard: "Front-line tank",
  class_cleric: "Healer",
  class_ranger: "Ranged striker",
  class_rogue: "Melee striker",
  class_arcanist: "Ranged burst",
  class_herald: "Support",
};

function ClassDetail({
  classId,
  onBack,
  backTargetId,
  onSelectClass,
}: {
  classId: string;
  onBack?: () => void;
  backTargetId?: string;
  onSelectClass: (classId: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [classId]);
  const copy = classCopy(classId);
  const skills = CLASS_SKILLS[classId] ?? [];
  const stats = getClassBaseStatsV2(classId);
  const pairings = SYNERGY_PAIRS.filter((s) => s.primaryClassId === classId);

  return (
    <div className="codex-detail">
      {onBack ? (
        <button type="button" className="codex-back" onClick={onBack}>
          Back to classes
        </button>
      ) : null}
      <h2 ref={headingRef} id={backTargetId} tabIndex={-1}>
        {copy.name}
      </h2>
      <p className="codex-role-tag">{ROLE_TAG[classId] ?? ""}</p>
      <p>{copy.desc}</p>
      <h3>Base stats and growth</h3>
      <table className="compare-table codex-stats-table">
        <thead>
          <tr>
            <th scope="col">Stat</th>
            <th scope="col">Base (Lv 1)</th>
            <th scope="col">Growth per level</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>HP</td>
            <td>{stats.hpBase}</td>
            <td>+{stats.hpGrowth}</td>
          </tr>
          <tr>
            <td>ATK</td>
            <td>{stats.atkBase}</td>
            <td>+{stats.atkGrowth}</td>
          </tr>
          <tr>
            <td>DEF</td>
            <td>{stats.defBase}</td>
            <td>+{stats.defGrowth}</td>
          </tr>
          <tr>
            <td>SPD</td>
            <td>{stats.spd}</td>
            <td>+0 (fixed)</td>
          </tr>
        </tbody>
      </table>
      <h3>Skills</h3>
      <table className="compare-table codex-skills-table">
        <thead>
          <tr>
            <th scope="col">Skill</th>
            <th scope="col">Kind</th>
            <th scope="col">Unlock level</th>
            <th scope="col">Effect</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s.skillId}>
              <td>{skillCopy(s.skillId).name}</td>
              <td>{s.kind === "basic" ? "Basic" : s.kind === "active" ? "Active" : "Passive"}</td>
              <td>{s.unlockLevel}</td>
              <td>{skillMechanics(s.skillId) ?? skillCopy(s.skillId).desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Class pairing</h3>
      {pairings.length > 0 ? (
        <ul className="codex-pairing-list">
          {pairings.map((pair) => (
            <li key={pair.secondaryClassId}>
              <strong>{pair.name}</strong> with{" "}
              <button type="button" className="codex-pairing-link" onClick={() => onSelectClass(pair.secondaryClassId)}>
                {classCopy(pair.secondaryClassId).name}
              </button>
              : {pair.description}
            </li>
          ))}
        </ul>
      ) : (
        <p className="disabled-note">No documented secondary-class synergy for this class yet.</p>
      )}
    </div>
  );
}

export function CodexScreen({ initialClassId }: { initialClassId: string | null }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState<string | null>(initialClassId);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const narrow = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;

  return (
    <main className="screen screen-codex">
      <h1 ref={headingRef} tabIndex={-1}>
        Codex
      </h1>
      {narrow ? (
        selected ? (
          <ClassDetail classId={selected} onBack={() => setSelected(null)} onSelectClass={setSelected} />
        ) : (
          <ul className="codex-class-list">
            {BASE_CLASS_IDS.map((id) => (
              <li key={id}>
                <button type="button" onClick={() => setSelected(id)}>
                  {classCopy(id).name}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="codex-columns">
          <ul className="codex-class-list">
            {BASE_CLASS_IDS.map((id) => (
              <li key={id}>
                <button type="button" className={selected === id ? "nav-link-active" : ""} aria-current={selected === id ? "true" : undefined} onClick={() => setSelected(id)}>
                  {classCopy(id).name}
                </button>
              </li>
            ))}
          </ul>
          {selected ? <ClassDetail classId={selected} onSelectClass={setSelected} /> : <p>Select a class to view its details.</p>}
        </div>
      )}
    </main>
  );
}
