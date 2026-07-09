import './styles.css';
import './layout-lab.css';

const STORAGE_KEY = 'grandjeu-layout-lab-v1';

const screens = {
  home: {
    label: 'Home',
    className: 'home-screen',
    body: `
      <section class="challenge-shell home-screen">
        <div class="home-scene">
          <div class="home-team-card">
            <span class="app-emblem">A</span>
            <div class="home-team-meta">
              <strong>Equipe Apollon</strong>
              <span>Sous la protection de Apollon</span>
            </div>
          </div>
        </div>
        <div class="challenge-body home-body">
          <div class="leader-card">
            <div class="leader-title">Mont Olympe</div>
            <ol class="leader-list">
              <li class="leader-row is-me"><span class="leader-rank">I</span><span class="leader-emblem">A</span><span class="leader-name">Apollon</span><strong class="leader-score">120</strong></li>
              <li class="leader-row"><span class="leader-rank">II</span><span class="leader-emblem">H</span><span class="leader-name">Hermes</span><strong class="leader-score">95</strong></li>
              <li class="leader-row"><span class="leader-rank">III</span><span class="leader-emblem">M</span><span class="leader-name">Meduse</span><strong class="leader-score">82</strong></li>
              <li class="leader-row"><span class="leader-rank">IV</span><span class="leader-emblem">S</span><span class="leader-name">Sphinx</span><strong class="leader-score">70</strong></li>
            </ol>
          </div>
          <div class="home-actions">
            <button class="btn btn-ghost btn-sm" type="button">Sortir</button>
          </div>
        </div>
      </section>
    `,
  },
  trivia: {
    label: 'Oracle / Trivia',
    className: 'challenge-trivia',
    body: challengeMarkup(
      'challenge-trivia',
      `
        <div class="trivia-challenge">
          <div class="trivia-count">Question 2 / 5</div>
          <p class="trivia-question-text">Quel dieu porte le caducee?</p>
          <div class="trivia-options">
            <button class="trivia-option" type="button"><span class="option-icon">A</span> Zeus</button>
            <button class="trivia-option" type="button"><span class="option-icon">B</span> Hermes</button>
            <button class="trivia-option" type="button"><span class="option-icon">C</span> Ares</button>
            <button class="trivia-option" type="button"><span class="option-icon">D</span> Apollon</button>
          </div>
        </div>
      `
    ),
  },
  photo: {
    label: 'Heracles / Photo',
    className: 'challenge-photo',
    body: challengeMarkup(
      'challenge-photo',
      `
        <div class="photo-challenge">
          <div class="mission-box">
            <span class="mission-label">Votre travail :</span>
            <p class="mission-target">Rapporter une preuve de courage</p>
            <p class="mission-detail">Prenez une photo avec toute l'equipe.</p>
          </div>
          <button class="btn btn-primary btn-camera" type="button">Prouver l'exploit</button>
          <div class="alert alert-info">La photo sera envoyee aux dieux.</div>
        </div>
      `
    ),
  },
  bounty: {
    label: 'Medusa / Bounty',
    className: 'challenge-bounty',
    body: challengeMarkup(
      'challenge-bounty',
      `
        <div class="photo-challenge">
          <div class="mission-box">
            <span class="mission-label">Meduse a pris possession de :</span>
            <p class="mission-target">Le vieux chene du camp</p>
            <p class="mission-detail">Trouvez la cible et rapportez une preuve.</p>
          </div>
          <button class="btn btn-primary btn-camera" type="button">Petrifier la cible</button>
          <div class="submission-status">
            <span class="badge badge-neutral">En attente du jugement</span>
          </div>
        </div>
      `
    ),
  },
  steps: {
    label: 'Hermes / Steps',
    className: 'challenge-steps',
    body: challengeMarkup(
      'challenge-steps',
      `
        <div class="steps-challenge">
          <div class="ritual-box">
            <p>Active le capteur de pas pour que Hermes compte ta course.</p>
            <button class="btn btn-primary" type="button">Activer le capteur</button>
          </div>
          <div class="steps-counter">
            <span class="steps-value">1284</span>
            <span class="steps-label">pas</span>
          </div>
          <ol class="mini-board">
            <li class="is-me"><span>1. A Apollon</span><strong>1284 pas</strong></li>
            <li><span>2. H Hermes</span><strong>1150 pas</strong></li>
          </ol>
        </div>
      `
    ),
  },
  drawguess: {
    label: 'Muses / Drawing',
    className: 'challenge-drawguess',
    body: challengeMarkup(
      'challenge-drawguess',
      `
        <div class="drawguess-challenge">
          <div class="draw-prompt">
            <span class="draw-prompt-word">Peindre: Minotaure</span>
            <span class="draw-deadline">08:42</span>
          </div>
          <div class="drawing-tool">
            <div class="drawing-toolbar">
              <button class="btn btn-sm" type="button">Noir</button>
              <button class="btn btn-sm" type="button">Effacer</button>
            </div>
            <div class="drawing-canvas"></div>
            <button class="btn btn-primary" type="button">Envoyer</button>
          </div>
        </div>
      `
    ),
  },
  guide: {
    label: 'Ariadne / Guide',
    className: 'challenge-guide',
    body: challengeMarkup(
      'challenge-guide',
      `
        <div class="guide-challenge">
          <div class="compass-hero">
            <svg class="compass-arrow" style="transform: rotate(32deg)" viewBox="0 0 100 100">
              <path d="M50 3 L81 76 L50 58 L19 76 Z" fill="#d9a441" stroke="rgba(36,22,8,0.6)" stroke-width="3.5" stroke-linejoin="round" />
            </svg>
            <div class="compass-distance">184 m</div>
          </div>
          <button class="btn btn-primary" type="button">Activer la boussole</button>
          <p class="hint-live">Suis le fil d'Ariane jusqu'au bout.</p>
        </div>
      `
    ),
  },
  territory: {
    label: 'Ares / Territory',
    className: 'challenge-territory',
    body: challengeMarkup(
      'challenge-territory',
      `
        <div class="territory-challenge">
          <div class="terr-stats">
            <div class="terr-stat">
              <span class="terr-stat-value">340 m2</span>
              <span class="terr-stat-label">ton empire</span>
            </div>
            <div class="terr-stat">
              <span class="terr-stat-value">2e <small>/ 8</small></span>
              <span class="terr-stat-label">rang</span>
            </div>
          </div>
          <div class="sat-map lab-map">
            <span class="lab-map-path"></span>
            <span class="lab-map-zone"></span>
            <span class="lab-map-pin">A</span>
          </div>
          <p class="hint-live">Marche pour tracer ton sillage et capturer le territoire.</p>
        </div>
      `
    ),
  },
  riddle: {
    label: 'Sphinx / Riddle',
    className: 'challenge-riddle',
    body: challengeMarkup(
      'challenge-riddle',
      `
        <div class="riddle-challenge">
          <p class="oracle-quote">Je parle sans bouche et j'entends sans oreilles.</p>
          <div class="riddle-text">Qui suis-je?</div>
          <form class="guess-form">
            <input value="" placeholder="Votre reponse..." />
            <button class="btn btn-primary" type="button">Repondre</button>
          </form>
        </div>
      `
    ),
  },
};

const targets = [
  { id: 'scene', label: 'Scene height', selector: '.challenge-header, .home-scene', defaultHeight: 45 },
  { id: 'body', label: 'Content body', selector: '.challenge-body', defaultWidth: 100, defaultPadding: 14 },
  { id: 'team', label: 'Home team box', selector: '.home-team-card', defaultWidth: 100, defaultPadding: 12 },
  { id: 'leader', label: 'Leaderboard box', selector: '.leader-card', defaultWidth: 100, defaultPadding: 14 },
  { id: 'mission', label: 'Mission box', selector: '.mission-box', defaultWidth: 100, defaultPadding: 12 },
  { id: 'drawPrompt', label: 'Draw prompt', selector: '.draw-prompt', defaultWidth: 100, defaultPadding: 14 },
  { id: 'triviaOptions', label: 'Trivia grid', selector: '.trivia-options', defaultWidth: 100, defaultPadding: 0 },
  { id: 'stepsCounter', label: 'Steps counter', selector: '.steps-counter', defaultWidth: 100, defaultPadding: 10 },
  { id: 'compass', label: 'Compass / guide box', selector: '.compass-hero', defaultWidth: 100, defaultPadding: 0 },
  { id: 'territoryStats', label: 'Territory stats', selector: '.terr-stats', defaultWidth: 100, defaultPadding: 0 },
  { id: 'map', label: 'Map box', selector: '.sat-map', defaultWidth: 100, defaultPadding: 0 },
  { id: 'timer', label: 'Top timer', selector: '.challenge-timer-top', defaultWidth: 0, defaultPadding: 0 },
  { id: 'tabbar', label: 'Bottom tab bar', selector: '.tab-bar', defaultWidth: 100, defaultPadding: 10 },
];

const sliderDefs = [
  { key: 'x', label: 'X position', min: -160, max: 160, step: 1, unit: 'px', base: 0 },
  { key: 'y', label: 'Y position', min: -220, max: 220, step: 1, unit: 'px', base: 0 },
  { key: 'width', label: 'Width', min: 35, max: 130, step: 1, unit: '%', base: 100 },
  { key: 'height', label: 'Height / min-height', min: 0, max: 75, step: 1, unit: 'dvh', base: 0 },
  { key: 'padding', label: 'Padding', min: 0, max: 36, step: 1, unit: 'px', base: 0 },
  { key: 'scale', label: 'Scale', min: 60, max: 140, step: 1, unit: '%', base: 100 },
  { key: 'bgY', label: 'Art vertical focus', min: 0, max: 100, step: 1, unit: '%', base: 0 },
];

let state = loadState();
let currentScreen = state.screen || 'home';
let currentTarget = state.target || 'leader';
let currentScope = state.scope || 'all';

function challengeMarkup(typeClass, content) {
  return `
    <section class="challenge-shell ${typeClass}">
      <div class="challenge-timer-top">08:42</div>
      <div class="challenge-header challenge-scene"></div>
      <div class="challenge-body">${content}</div>
    </section>
  `;
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { values: {} };
    return normalizeState(stored);
  } catch {
    return { values: { all: {} } };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeState(stored) {
  if (!stored.values) return { ...stored, values: { all: {} } };
  if (stored.values.all || Object.keys(stored.values).some((key) => key.startsWith('screen:'))) return stored;
  return { ...stored, values: { all: stored.values } };
}

function activeScopeKey() {
  return currentScope === 'screen' ? `screen:${currentScreen}` : 'all';
}

function targetDefaults(targetId) {
  const target = targets.find((item) => item.id === targetId);
  return {
    x: 0,
    y: 0,
    width: target?.defaultWidth ?? 100,
    height: target?.defaultHeight ?? 0,
    padding: target?.defaultPadding ?? 0,
    scale: 100,
    bgY: 0,
  };
}

function scopedValues(scopeKey, targetId) {
  return state.values[scopeKey]?.[targetId] || null;
}

function valuesFor(targetId, scopeKey = activeScopeKey()) {
  const defaults = targetDefaults(targetId);
  if (scopeKey === 'all') return { ...defaults, ...(scopedValues('all', targetId) || {}) };
  return {
    ...defaults,
    ...(scopedValues('all', targetId) || {}),
    ...(scopedValues(scopeKey, targetId) || {}),
  };
}

function setValue(key, value) {
  const scopeKey = activeScopeKey();
  state.values[scopeKey] = state.values[scopeKey] || {};
  state.values[scopeKey][currentTarget] = { ...valuesFor(currentTarget, scopeKey), [key]: Number(value) };
  saveState();
  renderSliders();
  applyOverrides();
}

function renderApp() {
  const root = document.querySelector('#layout-lab');
  root.innerHTML = `
    <main class="lab-page">
      <aside class="lab-panel">
        <h1 class="lab-title">Layout Lab</h1>
        <p class="lab-subtitle">Tune boxes visually, then copy the generated CSS.</p>
        <p class="lab-save-note">
          Your tweaks auto-save in this browser. To save them in the real app, copy the CSS on the right and add it to
          <strong>src/styles.css</strong>.
        </p>

        <div class="lab-field">
          <label for="screen-select">Screen</label>
          <select id="screen-select">
            ${Object.entries(screens)
              .map(([id, screen]) => `<option value="${id}">${screen.label}</option>`)
              .join('')}
          </select>
        </div>

        <div class="lab-field">
          <label for="target-select">Box</label>
          <select id="target-select">
            ${targets.map((target) => `<option value="${target.id}">${target.label}</option>`).join('')}
          </select>
        </div>

        <div class="lab-field">
          <label>Change scope</label>
          <div class="lab-segments">
            <button class="lab-segment" data-scope="all" type="button">All screens</button>
            <button class="lab-segment" data-scope="screen" type="button">This screen only</button>
          </div>
        </div>

        <div id="slider-list"></div>

        <div class="lab-actions">
          <button class="lab-action" id="copy-css" type="button">Copy CSS</button>
          <button class="lab-action secondary" id="reset-target" type="button">Reset box</button>
          <button class="lab-action secondary" id="reset-all" type="button">Reset all</button>
          <button class="lab-action" id="fit-phone" type="button">Fit view</button>
        </div>
      </aside>

      <section class="lab-phone-wrap">
        <div class="lab-phone" id="phone">
          <div class="app-shell" style="--team-color:#d9a441">
            <div class="app-view" id="preview"></div>
            <nav class="tab-bar">
              <button class="tab-btn ${currentScreen === 'home' ? 'is-active' : ''}" type="button">
                <span class="tab-icon">H</span>
                <span class="tab-label">Accueil</span>
              </button>
              <button class="tab-btn ${currentScreen !== 'home' ? 'is-active' : ''}" type="button">
                <span class="tab-icon">D</span>
                <span class="tab-label">Defi</span>
              </button>
            </nav>
          </div>
        </div>
      </section>

      <aside class="lab-code">
        <h2 class="lab-title">Generated CSS</h2>
        <textarea id="css-output" readonly></textarea>
        <p class="lab-note">Paste this at the end of src/styles.css, or ask Codex to apply it.</p>
      </aside>
    </main>
    <style id="lab-overrides"></style>
  `;

  document.querySelector('#screen-select').value = currentScreen;
  document.querySelector('#target-select').value = currentTarget;
  syncScopeButtons();
  document.querySelector('#screen-select').addEventListener('change', (event) => {
    currentScreen = event.target.value;
    state.screen = currentScreen;
    saveState();
    renderPreview();
  });
  document.querySelector('#target-select').addEventListener('change', (event) => {
    currentTarget = event.target.value;
    state.target = currentTarget;
    saveState();
    renderSliders();
    applyOverrides();
  });
  document.querySelectorAll('.lab-segment').forEach((button) => {
    button.addEventListener('click', () => {
      currentScope = button.dataset.scope;
      state.scope = currentScope;
      saveState();
      syncScopeButtons();
      renderSliders();
      applyOverrides();
    });
  });
  document.querySelector('#copy-css').addEventListener('click', copyCss);
  document.querySelector('#reset-target').addEventListener('click', resetTarget);
  document.querySelector('#reset-all').addEventListener('click', resetAll);
  document.querySelector('#fit-phone').addEventListener('click', fitPhone);

  renderPreview();
  renderSliders();
  applyOverrides();
}

function syncScopeButtons() {
  document.querySelectorAll('.lab-segment').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.scope === currentScope);
  });
}

function renderPreview() {
  document.querySelector('#preview').innerHTML = screens[currentScreen].body;
  document.querySelectorAll('.tab-btn').forEach((button, index) => {
    button.classList.toggle('is-active', currentScreen === 'home' ? index === 0 : index === 1);
  });
  applyOverrides();
}

function renderSliders() {
  const values = valuesFor(currentTarget);
  const list = document.querySelector('#slider-list');
  list.innerHTML = sliderDefs
    .map(
      (slider) => `
        <div class="lab-slider">
          <div class="lab-slider-head">
            <span class="lab-slider-label">${slider.label}</span>
          <span class="lab-slider-value" id="value-${slider.key}">${values[slider.key]}${slider.unit}</span>
          </div>
          <div class="lab-slider-controls">
            <input
            id="slider-${slider.key}"
            type="range"
            min="${slider.min}"
            max="${slider.max}"
            step="${slider.step}"
            value="${values[slider.key]}"
            />
            <input
              aria-label="${slider.label} number"
              id="number-${slider.key}"
              type="number"
              min="${slider.min}"
              max="${slider.max}"
              step="${slider.step}"
              value="${values[slider.key]}"
            />
          </div>
        </div>
      `
    )
    .join('');

  sliderDefs.forEach((slider) => {
    document.querySelector(`#slider-${slider.key}`).addEventListener('input', (event) => {
      setValue(slider.key, event.target.value);
    });
    document.querySelector(`#number-${slider.key}`).addEventListener('input', (event) => {
      setValue(slider.key, event.target.value);
    });
  });
}

function applyOverrides() {
  const css = buildCss({ scoped: true });
  const style = document.querySelector('#lab-overrides');
  const output = document.querySelector('#css-output');
  if (style) style.textContent = css;
  if (output) output.value = buildCss({ scoped: false });
  highlightTarget();
}

function buildCss({ scoped }) {
  const blocks = [];
  const scopeEntries = Object.entries(state.values || {}).filter(([, values]) => values && Object.keys(values).length);

  for (const [scopeKey, scopeValues] of scopeEntries) {
    if (scoped && scopeKey !== 'all' && scopeKey !== `screen:${currentScreen}`) continue;
    const screenId = scopeKey.startsWith('screen:') ? scopeKey.slice('screen:'.length) : null;
    const screenClass = screenId ? screens[screenId]?.className : null;
    const prefix = selectorPrefix({ scoped, screenClass });

    for (const target of targets) {
      const hasCustom = scopeValues[target.id];
      if (!hasCustom) continue;
      const values = valuesFor(target.id, scopeKey);

      const transform = `translate(${values.x}px, ${values.y}px) scale(${values.scale / 100})`;
      const rules = [
        'position: relative;',
        `transform: ${transform};`,
        'transform-origin: center center;',
      ];

      if (values.width > 0) rules.push(`width: ${values.width}%;`);
      if (values.height > 0) rules.push(`min-height: ${values.height}dvh;`);
      if (values.padding > 0 || target.id === 'body' || target.id === 'tabbar') {
        rules.push(`padding: ${values.padding}px;`);
      }

      const label = screenId ? `${screens[screenId]?.label || screenId} only` : 'all screens';
      blocks.push(`/* ${target.label} - ${label} */\n${prefixSelectors(prefix, target.selector)} {\n  ${rules.join('\n  ')}\n}`);

      if ((target.id === 'scene' || target.id === 'body') && values.bgY > 0) {
        blocks.push(`${shellSelector({ scoped, screenClass })}::before {\n  background-position: center ${values.bgY}%;\n}`);
      }
    }
  }

  return blocks.length
    ? `/* Layout Lab overrides */\n${blocks.join('\n\n')}\n`
    : '/* Move sliders to generate CSS overrides. */\n';
}

function selectorPrefix({ scoped, screenClass }) {
  const labPrefix = scoped ? '.layout-lab-preview ' : '';
  if (!screenClass) return labPrefix;
  return `${labPrefix}.${screenClass} `;
}

function prefixSelectors(prefix, selector) {
  return selector
    .split(',')
    .map((part) => `${prefix}${part.trim()}`)
    .join(',\n');
}

function shellSelector({ scoped, screenClass }) {
  const labPrefix = scoped ? '.layout-lab-preview ' : '';
  return screenClass ? `${labPrefix}.${screenClass}.challenge-shell` : `${labPrefix}.challenge-shell`;
}

function highlightTarget() {
  document.querySelectorAll('.lab-highlight').forEach((node) => {
    node.classList.remove('lab-highlight');
    node.removeAttribute('data-lab-name');
  });

  const target = targets.find((item) => item.id === currentTarget);
  if (!target) return;
  document.querySelectorAll(`#preview ${target.selector}, .tab-bar${target.selector === '.tab-bar' ? '' : '-nope'}`).forEach((node) => {
    node.classList.add('lab-highlight');
    node.dataset.labName = target.label;
  });

  document.querySelector('#preview')?.classList.add('layout-lab-preview');
  document.querySelector('.lab-phone .app-shell')?.classList.add('layout-lab-preview');
}

async function copyCss() {
  const css = document.querySelector('#css-output').value;
  await navigator.clipboard.writeText(css);
  const button = document.querySelector('#copy-css');
  button.textContent = 'Copied';
  setTimeout(() => {
    button.textContent = 'Copy CSS';
  }, 900);
}

function resetTarget() {
  const scopeKey = activeScopeKey();
  if (state.values[scopeKey]) delete state.values[scopeKey][currentTarget];
  saveState();
  renderSliders();
  applyOverrides();
}

function resetAll() {
  state.values = {};
  saveState();
  renderSliders();
  applyOverrides();
}

function fitPhone() {
  document.querySelector('#phone')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

renderApp();
