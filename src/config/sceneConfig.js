// The "art line" per screen: the % of the view height where the background
// illustration ends and the content box may begin. Content never crosses this
// line upward; it stacks from the bottom and takes whatever room it needs.
// Tune visually on any device with ?tune=1, then bake the values here.
export const SCENE_LINES = {
  home: 53,
  steps: 46,
  trivia: 42,
  bounty: 39,
  photo: 39,
  drawguess: 38,
  guide: 47,
  territory: 34,
  riddle: 59,
};

const STORAGE_KEY = 'olympe-scene-lines';

export function loadLineOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveLineOverride(screen, value) {
  const overrides = loadLineOverrides();
  overrides[screen] = Math.round(value * 10) / 10;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  return overrides;
}

export function clearLineOverrides() {
  localStorage.removeItem(STORAGE_KEY);
}
