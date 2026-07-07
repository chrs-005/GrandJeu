// Geometry helpers + the territory-conquest engine (paper.io on foot).
// The field is a flat grid of square cells anchored on a GPS center point.
// Grid state is one string: '.' = free, '0'..'4' = owned by team index.
// Each team also has a pending trail (walked cells outside its territory);
// re-entering its own territory captures the trail plus every enclosed cell.

export const EMPTY_CELL = '.';

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildField(centerLat, centerLng, cellSizeM, cols, rows) {
  const latPerCell = cellSizeM / 111320;
  const lngPerCell = cellSizeM / (111320 * Math.cos((centerLat * Math.PI) / 180));
  return {
    centerLat,
    centerLng,
    cellSizeM,
    cols,
    rows,
    latPerCell,
    lngPerCell,
    originLat: centerLat + (rows / 2) * latPerCell, // north-west corner
    originLng: centerLng - (cols / 2) * lngPerCell,
  };
}

export function latLngToCell(field, lat, lng) {
  const row = Math.floor((field.originLat - lat) / field.latPerCell);
  const col = Math.floor((lng - field.originLng) / field.lngPerCell);
  if (row < 0 || row >= field.rows || col < 0 || col >= field.cols) return -1;
  return row * field.cols + col;
}

// Bresenham line between two cell indexes, so fast walkers/GPS gaps still
// leave a continuous trail.
function lineCells(field, from, to) {
  let x0 = from % field.cols;
  let y0 = Math.floor(from / field.cols);
  const x1 = to % field.cols;
  const y1 = Math.floor(to / field.cols);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const cells = [];
  for (;;) {
    cells.push(y0 * field.cols + x0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return cells;
}

// Turn the trail into territory, then flood-fill from the field border:
// every cell the flood cannot reach is enclosed by the team → captured too.
function capture(gridArr, field, teamChar, trail) {
  for (const c of trail) gridArr[c] = teamChar;
  const { cols, rows } = field;
  const total = cols * rows;
  const reachable = new Uint8Array(total);
  const stack = [];
  for (let x = 0; x < cols; x++) stack.push(x, (rows - 1) * cols + x);
  for (let y = 0; y < rows; y++) stack.push(y * cols, y * cols + cols - 1);
  while (stack.length) {
    const c = stack.pop();
    if (c < 0 || c >= total || reachable[c] || gridArr[c] === teamChar) continue;
    reachable[c] = 1;
    const x = c % cols;
    if (x > 0) stack.push(c - 1);
    if (x < cols - 1) stack.push(c + 1);
    stack.push(c - cols, c + cols);
  }
  for (let c = 0; c < total; c++) {
    if (!reachable[c] && gridArr[c] !== teamChar) gridArr[c] = teamChar;
  }
}

const MAX_LINE_CELLS = 8; // beyond this the GPS jumped — restart from the new cell
const MAX_TRAIL_CELLS = 800;

// Apply one GPS move for a team. Returns the new grid/trail or null if the
// team is not part of the game. `challenge` needs: config.field,
// config.teamIndex, grid, trails, lastCell.
export function applyMove(challenge, uid, cellIdx) {
  const field = challenge.config.field;
  const teamIdx = challenge.config.teamIndex?.[uid];
  if (teamIdx == null) return null;
  const teamChar = String(teamIdx);

  const gridArr = (challenge.grid || EMPTY_CELL.repeat(field.cols * field.rows)).split('');
  let trail = (challenge.trails || {})[uid] || [];
  const trailSet = new Set(trail);
  const last = (challenge.lastCell || {})[uid];
  let captured = false;

  // First contact: seed a 3×3 home base so the team has land to return to.
  if (!gridArr.includes(teamChar) && !trail.length) {
    const x = cellIdx % field.cols;
    const y = Math.floor(cellIdx / field.cols);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < field.cols && ny >= 0 && ny < field.rows) {
          gridArr[ny * field.cols + nx] = teamChar;
        }
      }
    }
    return { grid: gridArr.join(''), trail: [], lastCell: cellIdx, captured: true };
  }

  let path = last != null && last !== cellIdx ? lineCells(field, last, cellIdx) : [cellIdx];
  if (path.length > MAX_LINE_CELLS) path = [cellIdx];

  for (const c of path) {
    if (gridArr[c] === teamChar) {
      if (trail.length) {
        capture(gridArr, field, teamChar, trail);
        trail = [];
        trailSet.clear();
        captured = true;
      }
    } else if (!trailSet.has(c) && trail.length < MAX_TRAIL_CELLS) {
      trail.push(c);
      trailSet.add(c);
    }
  }

  return { grid: gridArr.join(''), trail, lastCell: cellIdx, captured };
}

// Owned-cell counts per team index: [12, 0, 34, ...]
export function countCells(grid, teamCount) {
  const counts = new Array(teamCount).fill(0);
  for (let i = 0; i < grid.length; i++) {
    const idx = grid.charCodeAt(i) - 48; // '0' → 0
    if (idx >= 0 && idx < teamCount) counts[idx]++;
  }
  return counts;
}
