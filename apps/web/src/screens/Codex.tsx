// first-session-redesign.md section 8.1. UI only: all data comes from the
// shared class/skill content already duplicated in frozenIds.ts/copy.ts/
// skillMechanics.ts, with no new stat table. Per architecture.md ("apps/web:
// ... No client-authoritative loot, XP, time, stats or victory") and the
// precedent already recorded in frozenIds.ts and Inventory.tsx's
// GearComparisonPanel, base stats and growth-per-level are NOT duplicated
// here (no endpoint returns them) — the "base stats; growth per level"
// subsection documented in the design doc is shown as codex_unavailable
// rather than invented.
import { useEffect, useRef, useState } from "react";
import { COPY, classCopy, skillCopy } from "../copy.js";
import { skillMechanics } from "../skillMechanics.js";
import { BASE_CLASS_IDS, CLASS_SKILLS } from "../frozenIds.js";

const ROLE_TAG: Record<string, string> = {
  class_vanguard: "Front-line tank",
  class_cleric: "Healer",
  class_ranger: "Ranged striker",
  class_rogue: "Melee striker",
  class_arcanist: "Ranged burst",
  class_herald: "Support",
};

function ClassDetail({ classId, onBack, backTargetId }: { classId: string; onBack?: () => void; backTargetId?: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [classId]);
  const copy = classCopy(classId);
  const skills = CLASS_SKILLS[classId] ?? [];

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
      <p className="disabled-note">{COPY.codex_unavailable}</p>
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
      <p className="disabled-note">
        Some skills list a secondary-class synergy inline in their effect text above; a separate frozen pairing table is not duplicated client-side.
      </p>
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
          <ClassDetail classId={selected} onBack={() => setSelected(null)} />
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
          {selected ? <ClassDetail classId={selected} /> : <p>Select a class to view its details.</p>}
        </div>
      )}
    </main>
  );
}
