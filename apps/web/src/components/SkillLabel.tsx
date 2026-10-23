import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { skillCopy } from "../copy.js";
import { skillMechanics } from "../skillMechanics.js";

/** Shared by build choices and replay skills. Click also supports touch users. */
export function SkillLabel({ skillId }: { skillId: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const cancelClose = () => clearTimeout(timer.current);
  function show() {
    cancelClose();
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 488)), top: Math.max(8, Math.min(rect.bottom, window.innerHeight / 2 - 8)) });
    setOpen(true);
  }
  function leave() {
    cancelClose();
    if (document.activeElement !== button.current) timer.current = setTimeout(() => setOpen(false), 200);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = skillCopy(skillId);
  const mechanics = skillMechanics(skillId);
  if (!mechanics) return <span>{copy.name}</span>;
  return (
    <span className="skill-help" onMouseEnter={show} onMouseLeave={leave}>
      <button ref={button} type="button" className="skill-label" aria-describedby={open ? id : undefined}
        onFocus={show} onBlur={() => setOpen(false)}
        onClick={show} onKeyDown={(e) => { if (e.key === "Escape") { cancelClose(); setOpen(false); e.stopPropagation(); } }}>
        {copy.name}
      </button>
      {open && createPortal(<span id={id} role="tooltip" className="skill-tooltip" style={position} onMouseEnter={cancelClose} onMouseLeave={leave}>
        <strong>{copy.name}</strong><span>{copy.desc}</span><span>{mechanics}</span>
      </span>, document.body)}
    </span>
  );
}
