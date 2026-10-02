/*
 * Themes. A theme is a palette, a wordmark, a background scene and an optional
 * intro card — enough to make the same quiz engine look like a different show.
 *
 * Three ship built in. More can be dropped into DATA_DIR/themes/*.json at run time
 * without rebuilding the image, which is how you add your own without touching
 * this file.
 *
 * On artwork: the scenes are drawn in code, so nothing here embeds anyone's
 * frames, stills or logos. A theme may name its own `backdropImage`, served from
 * DATA_DIR/assets — that file is whatever you put there, and what you are
 * entitled to use is your call.
 */
import fs from "node:fs";
import path from "node:path";

/** Only these CSS custom properties may be themed, and only as hex colours. */
export const PALETTE_KEYS = [
  "paper", "surface", "sunk", "ink", "muted", "hair",
  "red", "gold", "green", "azure",
  "tile-edge", "on-solid", "panel-shadow",
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const BUILTIN_THEMES = [
  {
    id: "comic",
    name: "Comic Press",
    blurb: "A page coming off the press: three ink screens at different angles, deliberately out of register, with speed lines, drifting ink bursts and paper grain. Newsprint by day, late edition by night.",
    scene: "comic",
    wordmark: { lead: "MARVEL", tail: "Quiz" },
    intro: {
      title: "MARVEL QUIZ",
      subtitle: "Six guesses each. The clock is running.",
      everyMs: 15000,
    },
    palette: {
      paper: "#EDE6D6",
      surface: "#FBF7EC",
      sunk: "#E0D8C4",
      ink: "#16130E",
      muted: "#6A6153",
      hair: "#CCC2AC",
      red: "#D01E28",
      gold: "#F2B617",
      green: "#1C7A47",
      azure: "#1B64B8",
      "tile-edge": "#BFB5A0",
      "on-solid": "#FFFFFF",
      "panel-shadow": "#16130E",
    },
    paletteDark: {
      paper: "#14130E",
      surface: "#1E1C15",
      sunk: "#171510",
      ink: "#F2ECDC",
      muted: "#9A917F",
      hair: "#332F24",
      red: "#FF4A4A",
      gold: "#FFC83D",
      green: "#35B37E",
      azure: "#5B9BFF",
      "tile-edge": "#3A3528",
      "on-solid": "#14130E",
      "panel-shadow": "#000000",
    },
  },
  {
    id: "hud",
    name: "Tactical Readout",
    blurb: "The briefing-screen look: counter-rotating instrument rings over a receding floor grid, a scan sweep and corner brackets. Steel and cyan. The best fit for a film quiz on a big screen.",
    scene: "hud",
    wordmark: { lead: "MARVEL", tail: "Quiz" },
    intro: {
      title: "MARVEL QUIZ",
      subtitle: "Six guesses each. The clock is running.",
      everyMs: 15000,
    },
    palette: {
      paper: "#070B12",
      surface: "#0E1826",
      sunk: "#0A1220",
      ink: "#DCE8F5",
      muted: "#7B93AD",
      hair: "#1C2D42",
      red: "#FF4D5E",
      gold: "#FFC24A",
      green: "#3DE0A8",
      azure: "#4FD4FF",
      "tile-edge": "#2A4259",
      "on-solid": "#070B12",
      "panel-shadow": "#02060C",
    },
    paletteDark: {},
  },
  {
    id: "cosmic",
    name: "Cosmic Gauntlet",
    blurb: "Deep space, drifting embers and a pulsing core, with a title card that assembles itself. The one for a big screen.",
    scene: "cosmic",
    wordmark: { lead: "MARVEL", tail: "Quiz" },
    intro: {
      title: "MARVEL QUIZ",
      subtitle: "Six guesses each. The clock is running.",
      everyMs: 14000,
    },
    palette: {
      paper: "#0B0B14",
      surface: "#15152A",
      sunk: "#0E0E1C",
      ink: "#EFEAFF",
      muted: "#9A95C4",
      hair: "#2C2C50",
      red: "#FF3B5C",
      gold: "#FFC24A",
      green: "#2FD6A0",
      azure: "#7C9BFF",
      "tile-edge": "#3A3A66",
      "on-solid": "#0B0B14",
      "panel-shadow": "#05050C",
    },
    paletteDark: {},         // already dark; one palette for both
  },
];

function validateTheme(raw, id) {
  const t = raw || {};
  const out = {
    id: String(t.id || id || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32),
    name: String(t.name || t.id || "Untitled").slice(0, 48),
    blurb: String(t.blurb || "").slice(0, 160),
    scene: String(t.scene || "comic").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32),
    wordmark: {
      lead: String(t.wordmark?.lead ?? "MARVEL").slice(0, 14),
      tail: String(t.wordmark?.tail ?? "Quiz").slice(0, 18),
    },
    intro: null,
    palette: {},
    paletteDark: {},
    backdropImage: null,
  };
  if (!out.id) return [false, "A theme needs an id (letters, digits, dash or underscore)."];

  for (const bucket of ["palette", "paletteDark"]) {
    const src = t[bucket] || {};
    for (const key of PALETTE_KEYS) {
      const v = src[key];
      if (v == null) continue;
      if (!HEX.test(String(v).trim())) {
        return [false, `Theme "${out.id}": ${bucket}.${key} must be a hex colour (got "${v}").`];
      }
      out[bucket][key] = String(v).trim();
    }
  }

  if (t.intro) {
    out.intro = {
      title: String(t.intro.title || out.name).slice(0, 40),
      subtitle: String(t.intro.subtitle || "").slice(0, 90),
      everyMs: Math.min(120000, Math.max(6000, Number(t.intro.everyMs) || 14000)),
    };
  }

  /* A file the operator dropped in DATA_DIR/assets, referenced by name only. */
  if (t.backdropImage) {
    const safe = String(t.backdropImage).replace(/[^A-Za-z0-9._-]/g, "");
    if (safe && safe !== "." && safe !== "..") out.backdropImage = safe;
  }

  return [true, out];
}

let cache = null;

/** Built-ins plus anything valid in DATA_DIR/themes. Later ids win. */
export function loadThemes(dataDir) {
  if (cache) return cache;
  const list = [];
  for (const t of BUILTIN_THEMES) {
    const [ok, res] = validateTheme(t);
    if (ok) list.push(res);
  }

  const dir = path.join(dataDir, "themes");
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch (e) {
    /* no custom themes; perfectly normal */
  }
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const [ok, res] = validateTheme(raw, path.basename(f, ".json"));
      if (!ok) {
        console.warn(`[themes] ${f}: ${res}`);
        continue;
      }
      const at = list.findIndex((x) => x.id === res.id);
      if (at >= 0) list[at] = res;
      else list.push(res);
    } catch (e) {
      console.warn(`[themes] ${f}: ${e.message}`);
    }
  }

  cache = list;
  return cache;
}

export function reloadThemes() {
  cache = null;
}

export function findTheme(dataDir, id) {
  const all = loadThemes(dataDir);
  return all.find((t) => t.id === id) || all[0];
}
