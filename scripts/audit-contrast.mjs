#!/usr/bin/env node
// M2-08: scriptable WCAG contrast-ratio audit of apps/web/src/styles.css.
//
// Reads the real --color-* custom properties from styles.css (not a copy of
// the values) and checks the actual foreground/background pairs that occur
// on the five core screens (Expedition, Inventory, Company, Boss, Arena),
// including disabled-button opacity blending and non-text focus indicators.
//
// Usage: node scripts/audit-contrast.mjs [--json]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, "..", "apps", "web", "src", "styles.css");
const css = readFileSync(cssPath, "utf8");

function readTokens(source) {
  const rootMatch = source.match(/:root\s*{([^}]*)}/);
  if (!rootMatch) throw new Error("No :root block found in styles.css");
  const tokens = {};
  for (const line of rootMatch[1].split(";")) {
    const m = line.match(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/);
    if (m) tokens[`--${m[1]}`] = m[2];
  }
  return tokens;
}

const tokens = readTokens(css);

function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// CSS `opacity` blends both text and background toward whatever is behind
// the element (not toward each other), so compute the apparent color seen
// by the viewer before measuring contrast.
function blend(hexFg, hexBackdrop, alpha) {
  const fg = hexToRgb(hexFg);
  const bd = hexToRgb(hexBackdrop);
  const mix = (a, b) => Math.round(a * alpha + b * (1 - alpha));
  const r = mix(fg.r, bd.r);
  const g = mix(fg.g, bd.g);
  const b = mix(fg.b, bd.b);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function toHex(name) {
  const v = tokens[name];
  if (!v) throw new Error(`Missing token ${name} in styles.css :root`);
  return v;
}

const THRESHOLD = { text: 4.5, "large-text": 3.0, "ui-component": 3.0 };

const cases = [
  // Expedition screen
  { screen: "Expedition", el: ".screen body text", fg: "--color-text", bg: "--color-bg", role: "text" },
  { screen: "Expedition", el: ".inline-note / .disabled-note on screen bg", fg: "--color-text-muted", bg: "--color-bg", role: "text" },
  { screen: "Expedition", el: "button label (brass)", fg: "--color-brass-text", bg: "--color-brass", role: "text" },
  { screen: "Expedition", el: "button:disabled label, opacity .55 over screen bg", fgDisabled: ["--color-brass-text", "--color-brass", "--color-bg"], role: "text", exempt: "inactive control (WCAG 1.4.3 does not apply to disabled components); all buttons above render with the real HTML disabled attribute" },
  { screen: "Expedition", el: "combat-log-table cell border (UI component) on screen bg", fg: "--color-border", bg: "--color-bg", role: "ui-component" },
  { screen: "Shared/Cards", el: "hero-card/item-row/panel border (UI component) on panel bg", fg: "--color-border", bg: "--color-bg-panel", role: "ui-component" },

  // Inventory screen
  { screen: "Inventory", el: ".item-name on item-row (panel bg)", fg: "--color-text", bg: "--color-bg-panel", role: "text" },
  { screen: "Inventory", el: ".item-desc on item-row (panel bg)", fg: "--color-text-muted", bg: "--color-bg-panel", role: "text" },
  { screen: "Inventory", el: ".disabled-note on screen bg", fg: "--color-text-muted", bg: "--color-bg", role: "text" },
  { screen: "Inventory", el: ".empty-state on screen bg", fg: "--color-text-muted", bg: "--color-bg", role: "text" },
  { screen: "Inventory", el: "compare-table text on gear-comparison-panel (panel bg)", fg: "--color-text", bg: "--color-bg-panel", role: "text" },

  // Company screen
  { screen: "Company", el: ".hero-card body text (panel bg)", fg: "--color-text", bg: "--color-bg-panel", role: "text" },
  { screen: "Company", el: ".hero-level on hero-card (panel bg)", fg: "--color-text-muted", bg: "--color-bg-panel", role: "text" },
  { screen: "Company", el: ".spec-picker button, normal (spec-desc on brass bg)", fg: "--color-bg-panel", bg: "--color-brass", role: "text" },
  { screen: "Company", el: ".spec-picker button:disabled, spec-desc opacity .55 over hero-card (panel bg)", fgDisabled: ["--color-bg-panel", "--color-brass", "--color-bg-panel"], role: "text", exempt: "inactive control (WCAG 1.4.3 does not apply to disabled components); Company.tsx renders this button with the real HTML disabled attribute" },
  { screen: "Company", el: ".primary-action-banner border (brass) on panel-raised bg (UI component)", fg: "--color-brass", bg: "--color-bg-panel-raised", role: "ui-component" },

  // Boss screen
  { screen: "Boss", el: ".reward-state-badge text (no override, screen bg)", fg: "--color-text", bg: "--color-bg", role: "text" },
  { screen: "Boss", el: "button label (brass) on screen", fg: "--color-brass-text", bg: "--color-brass", role: "text" },

  // Arena screen
  { screen: "Arena", el: ".empty-state (no published opponent) on screen bg", fg: "--color-text-muted", bg: "--color-bg", role: "text" },
  { screen: "Arena", el: "compare-table text on snapshot-preview-panel (panel bg)", fg: "--color-text", bg: "--color-bg-panel", role: "text" },
  { screen: "Arena", el: ".disabled-note on screen bg", fg: "--color-text-muted", bg: "--color-bg", role: "text" },

  // Shared chrome (nav bar / focus / toasts) — appears on every screen
  { screen: "Shared/NavBar", el: ".nav-link text on nav-bar (panel bg)", fg: "--color-text", bg: "--color-bg-panel", role: "text" },
  { screen: "Shared/NavBar", el: ".nav-link-active text on panel-raised bg", fg: "--color-text", bg: "--color-bg-panel-raised", role: "text" },
  { screen: "Shared/Focus", el: "focus ring on screen bg (UI component)", fg: "--focus-ring", bg: "--color-bg", role: "ui-component" },
  { screen: "Shared/Focus", el: "focus ring on panel bg (UI component)", fg: "--focus-ring", bg: "--color-bg-panel", role: "ui-component" },
  { screen: "Shared/Focus", el: "focus ring on panel-raised bg (UI component)", fg: "--focus-ring", bg: "--color-bg-panel-raised", role: "ui-component" },
  // Note: a brass-fill button's own fill color is intentionally NOT checked
  // here. `outline` with a positive `outline-offset` (styles.css line ~63)
  // paints outside the element's border box, so the ring is always rendered
  // over the *parent's* background (screen/panel/panel-raised, all checked
  // above), never over the button's own brass fill.
  { screen: "Shared/Toast", el: "toast-offline/server_error border (red) on screen bg (UI component)", fg: "--color-red", bg: "--color-bg", role: "ui-component" },
  { screen: "Shared/Toast", el: "toast-conflict border (teal) on screen bg (UI component)", fg: "--color-teal", bg: "--color-bg", role: "ui-component" },
  { screen: "Shared/Toast", el: "toast-rejected border (brass) on screen bg (UI component)", fg: "--color-brass", bg: "--color-bg", role: "ui-component" },
];

const results = cases.map((c) => {
  let fgHex;
  if (c.fgDisabled) {
    const [fgToken, bgToken, backdropToken] = c.fgDisabled;
    fgHex = blend(toHex(fgToken), toHex(backdropToken), 0.55);
  } else {
    fgHex = toHex(c.fg);
  }
  const bgHex = c.fgDisabled ? blend(toHex(c.fgDisabled[1]), toHex(c.fgDisabled[2]), 0.55) : toHex(c.bg);
  const ratio = contrastRatio(fgHex, bgHex);
  const threshold = THRESHOLD[c.role];
  const meets = ratio >= threshold;
  return {
    screen: c.screen,
    element: c.el,
    role: c.role,
    fg: fgHex,
    bg: bgHex,
    ratio: Math.round(ratio * 100) / 100,
    threshold,
    meets,
    exempt: c.exempt ?? null,
    pass: meets || Boolean(c.exempt),
  };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const col = (s, n) => String(s).padEnd(n);
  console.log(col("Screen", 16) + col("Element", 58) + col("Ratio", 8) + col("Need", 6) + "Result");
  for (const r of results) {
    const label = r.meets ? "PASS" : r.exempt ? "EXEMPT" : "FAIL";
    console.log(
      col(r.screen, 16) + col(r.element, 58) + col(r.ratio.toFixed(2), 8) + col(r.threshold.toFixed(1), 6) + label,
    );
  }
  const failed = results.filter((r) => !r.meets && !r.exempt);
  const exempted = results.filter((r) => !r.meets && r.exempt);
  console.log(`\n${results.length} checks, ${failed.length} failing, ${exempted.length} exempt (measured but below threshold on inactive controls).`);
  if (failed.length) process.exitCode = 1;
}
