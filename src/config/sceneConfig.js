// The "art line" per screen: the % of the view height where the background
// illustration ends and the content box may begin. Content never crosses this
// line upward; it stacks from the bottom and takes whatever room it needs.
// Tune visually on any device with ?tune=1, then bake the values here.
export const SCENE_LINES = {
  home: 56.8,
  steps: 51.5,
  trivia: 46.3,
  bounty: 45.9,
  photo: 44.2,
  drawguess: 45.8,
  guide: 53,
  territory: 41,
  riddle: 62.8,
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
