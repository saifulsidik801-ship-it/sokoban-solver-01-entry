// Sokoban solver — per-room push-optimal A*.
//
// Method (found before coding): the generator's levels are a 1-wide hallway with
// 1-4 rooms off it, each room holding 3-4 boxes and as many goals, and a box
// pushed through a door into the hallway can never come back — so every box stays
// in its room and the level's push-optimal count is the SUM of its rooms' optima.
// This program therefore decomposes the level into rooms, solves each room
// independently with a push-state A*, and concatenates the rooms' move sequences
// with hallway walks in between.
//
// Per room, the search is A* over pushes (macro moves): a state is the sorted
// box cells plus the player's reachable region (canonicalised to its lowest cell,
// so the player's exact square inside its region does not multiply states).
// Heuristic: the Hungarian (minimum-assignment) sum of BFS push-distances of
// boxes to goals — admissible, since one push moves one box one cell.
// Deadlock pruning: (a) a static dead-cell table from reverse-pull analysis
// (a cell is live only if a box there can be pushed to a goal, with the player
// able to stand where the pull needs it), (b) 2x2 wall/box blocks with no goal.
// The search is budgeted by EXPANSIONS, never by the clock, so two runs write
// the same bytes. If A* exhausts its budget, a greedy best-first search with the
// same pruning is tried, then the same again without the exit constraint.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const CH = ['u', 'd', 'l', 'r'];
const MAX_EXPANSIONS = 400000;
const MAX_GREEDY = 200000;

interface Level {
  w: number;
  h: number;
  wall: boolean[];
  goals: Set<number>;
  boxes: number[];
  player: number;
}

interface Room {
  cells: boolean[]; // room cells (including the door cell)
  walk: boolean[]; // room cells + hallway-row cells (player area for this room)
  goals: number[];
  boxes: number[]; // initial boxes, sorted
  door: number; // door cell (room side)
  entry: number; // hallway cell adjacent to the door
}

interface Push {
  from: number;
  dir: number;
}

function parse(text: string): Level {
  const rows = text.split('\n').map((r) => r.replace(/\r$/, '')).filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall: boolean[] = new Array(w * h).fill(false);
  const goals = new Set<number>();
  const boxes: number[] = [];
  let player = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '#';
      const i = y * w + x;
      wall[i] = ch === '#';
      if (ch === '.' || ch === '*' || ch === '+') goals.add(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  boxes.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

// Split the level into rooms: remove the hallway row (the player's row) from
// the walkable graph; each remaining connected component holding boxes is a room.
function decompose(lv: Level): Room[] {
  const { w, h, wall } = lv;
  const hwRow = Math.floor(lv.player / w);
  const walkable = (i: number): boolean => !wall[i];
  const inHall = (i: number): boolean => Math.floor(i / w) === hwRow;
  const seen = new Array(w * h).fill(false);
  const rooms: Room[] = [];
  const boxSet = new Set(lv.boxes);
  for (let s = 0; s < w * h; s++) {
    if (!walkable(s) || inHall(s) || seen[s]) continue;
    // BFS this component.
    const comp: number[] = [];
    const q = [s];
    seen[s] = true;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi]!;
      comp.push(c);
      for (let d = 0; d < 4; d++) {
        const n = c + DY[d] * w + DX[d];
        if (n < 0 || n >= w * h) continue;
        if (seen[n] || !walkable(n) || inHall(n)) continue;
        // Stay inside the board columns (no wrap-around).
        if (Math.abs((n % w) - (c % w)) + Math.abs(Math.floor(n / w) - Math.floor(c / w)) !== 1) continue;
        seen[n] = true;
        q.push(n);
      }
    }
    const compSet = new Set(comp);
    const rBoxes = lv.boxes.filter((b) => compSet.has(b));
    if (rBoxes.length === 0) continue;
    const rGoals = [...lv.goals].filter((g) => compSet.has(g));
    // The door: the component cell adjacent to a walkable hallway cell.
    let door = -1;
    let entry = -1;
    const sorted = [...comp].sort((a, b) => a - b);
    outer: for (const c of sorted) {
      for (let d = 0; d < 4; d++) {
        const n = c + DY[d] * w + DX[d];
        if (n < 0 || n >= w * h) continue;
        if (inHall(n) && walkable(n)) {
          door = c;
          entry = n;
          break outer;
        }
      }
    }
    if (door < 0) continue;
    const cells = new Array(w * h).fill(false);
    for (const c of comp) cells[c] = true;
    const walk = cells.slice();
    for (let x = 0; x < w; x++) {
      const i = hwRow * w + x;
      if (walkable(i)) walk[i] = true;
    }
    rooms.push({ cells, walk, goals: rGoals, boxes: rBoxes, door, entry });
  }
  rooms.sort((a, b) => a.door - b.door);
  return rooms;
}

// BFS over `allowed` cells from `start`, avoiding cells in `blocked`.
// Returns the reached set and its lowest cell index.
function region(
  start: number,
  allowed: boolean[],
  blocked: Set<number>,
  w: number,
  h: number,
): { set: Set<number>; rep: number } {
  const set = new Set<number>();
  if (!allowed[start] || blocked.has(start)) return { set, rep: -1 };
  const q = [start];
  set.add(start);
  let rep = start;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]!;
    if (c < rep) rep = c;
    for (let d = 0; d < 4; d++) {
      const n = c + DY[d] * w + DX[d];
      if (n < 0 || n >= w * h) continue;
      if (!allowed[n] || blocked.has(n) || set.has(n)) continue;
      if (Math.abs((n % w) - (c % w)) + Math.abs(Math.floor(n / w) - Math.floor(c / w)) !== 1) continue;
      set.add(n);
      q.push(n);
    }
  }
  return { set, rep };
}

// BFS distances from `start` over `allowed` cells.
function bfsDist(start: number, allowed: boolean[], w: number, h: number): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  if (!allowed[start]) return dist;
  const q = [start];
  dist[start] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]!;
    for (let d = 0; d < 4; d++) {
      const n = c + DY[d] * w + DX[d];
      if (n < 0 || n >= w * h || dist[n] >= 0 || !allowed[n]) continue;
      if (Math.abs((n % w) - (c % w)) + Math.abs(Math.floor(n / w) - Math.floor(c / w)) !== 1) continue;
      dist[n] = dist[c]! + 1;
      q.push(n);
    }
  }
  return dist;
}

function permutations(n: number): number[][] {
  const out: number[][] = [];
  const a = [...Array(n).keys()];
  const gen = (k: number): void => {
    if (k === n) {
      out.push([...a]);
      return;
    }
    for (let i = k; i < n; i++) {
      [a[k], a[i]] = [a[i]!, a[k]!];
      gen(k + 1);
      [a[k], a[i]] = [a[i]!, a[k]!];
    }
  };
  gen(0);
  return out;
}

interface SearchCtx {
  lv: Level;
  room: Room;
  live: Set<number>; // cells from which a box can still reach a goal
  distToGoal: Int32Array[]; // per goal: BFS distance over room cells
  perms: number[][];
  needExit: boolean;
}

// A box on a non-live cell is dead; a 2x2 block of wall/box with no goal is dead.
function deadAfterPush(ctx: SearchCtx, boxes: number[], moved: number): boolean {
  const { lv, room } = ctx;
  const boxSet = new Set(boxes);
  for (const b of boxes) {
    if (!ctx.live.has(b)) return true;
  }
  const w = lv.w;
  const bx = moved % w;
  const by = Math.floor(moved / w);
  for (let oy = -1; oy <= 0; oy++) {
    for (let ox = -1; ox <= 0; ox++) {
      const x0 = bx + ox;
      const y0 = by + oy;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= lv.h) continue;
      let allBlocked = true;
      let hasGoal = false;
      for (let yy = 0; yy < 2; yy++) {
        for (let xx = 0; xx < 2; xx++) {
          const c = (y0 + yy) * w + (x0 + xx);
          if (lv.goals.has(c)) hasGoal = true;
          if (!lv.wall[c] && !boxSet.has(c)) allBlocked = false;
        }
      }
      if (allBlocked && !hasGoal) return true;
    }
  }
  return false;
}

// Minimum-assignment heuristic; Infinity when some box cannot reach any goal.
function heuristic(ctx: SearchCtx, boxes: number[]): number {
  const n = boxes.length;
  let best = Infinity;
  for (const p of ctx.perms) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = ctx.distToGoal[p[i]!]![boxes[i]!];
      if (d === undefined || d < 0) {
        s = Infinity;
        break;
      }
      s += d;
    }
    if (s < best) best = s;
  }
  return best;
}

// Push-state search for one room. `greedy` ranks by h only; `needExit` requires
// the final state to let the player walk back to the door (so the next room is
// reachable). Returns the push list or null.
function searchRoom(ctx: SearchCtx, greedy: boolean, maxExp: number): Push[] | null {
  const { lv, room } = ctx;
  const w = lv.w;
  const h = lv.h;
  const n = room.boxes.length;
  const dcell = (d: number): number => DY[d]! * w + DX[d]!;

  // State arrays, indexed by state id.
  const sBoxes: number[][] = [];
  const sPlayer: number[] = [];
  const sParent: number[] = [];
  const sPushFrom: number[] = [];
  const sPushDir: number[] = [];
  const sG: number[] = [];
  const sKey: string[] = [];
  const best = new Map<string, number>();

  const initRegion = region(room.entry, room.walk, new Set(room.boxes), w, h);
  if (initRegion.rep < 0) return null;
  const initKey = room.boxes.join(',') + '|' + initRegion.rep;
  sBoxes.push([...room.boxes]);
  sPlayer.push(room.entry);
  sParent.push(-1);
  sPushFrom.push(-1);
  sPushDir.push(-1);
  sG.push(0);
  sKey.push(initKey);
  best.set(initKey, 0);

  // Binary heap on (f, h, seq).
  interface HeapEntry {
    f: number;
    h: number;
    seq: number;
    id: number;
  }
  const heap: HeapEntry[] = [];
  let seq = 0;
  const h0 = heuristic(ctx, room.boxes);
  if (h0 === Infinity) return null;
  const hLess = (a: HeapEntry, b: HeapEntry): boolean =>
    a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.seq < b.seq)));
  const hPush = (e: HeapEntry): void => {
    let i = heap.length;
    heap.push(e);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!hLess(heap[i]!, heap[p]!)) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  const hPop = (): HeapEntry => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && hLess(heap[c + 1]!, heap[c]!)) c++;
        if (!hLess(heap[c]!, heap[i]!)) break;
        [heap[i], heap[c]] = [heap[c]!, heap[i]!];
        i = c;
      }
    }
    return top;
  };
  hPush({ f: greedy ? h0 : h0, h: h0, seq: seq++, id: 0 });

  let expansions = 0;
  while (heap.length > 0) {
    const { id } = hPop();
    const g = sG[id]!;
    if (best.get(sKey[id]!) !== g) continue; // superseded by a cheaper route
    if (expansions++ >= maxExp) return null;
    const boxes = sBoxes[id]!;
    const boxSet = new Set(boxes);
    const reg = region(sPlayer[id]!, room.walk, boxSet, w, h);
    // Goal test: every box on a goal, and (unless last room) the player can
    // walk back to the door.
    let solved = true;
    for (const b of boxes) {
      if (!room.goals.includes(b)) {
        solved = false;
        break;
      }
    }
    if (solved && (!ctx.needExit || reg.set.has(room.door))) {
      const pushes: Push[] = [];
      for (let t = id; t > 0; t = sParent[t]!) {
        pushes.push({ from: sPushFrom[t]!, dir: sPushDir[t]! });
      }
      pushes.reverse();
      return pushes;
    }
    for (let bi = 0; bi < n; bi++) {
      const b = boxes[bi]!;
      for (let d = 0; d < 4; d++) {
        const t = b + dcell(d);
        if (!room.cells[t] || boxSet.has(t)) continue; // never into the hallway
        const behind = b - dcell(d);
        if (!room.walk[behind] || !reg.set.has(behind)) continue;
        const nb = boxes.slice();
        nb[bi] = t;
        nb.sort((a, b2) => a - b2);
        if (deadAfterPush(ctx, nb, t)) continue;
        const hh = heuristic(ctx, nb);
        if (hh === Infinity) continue;
        const nReg = region(b, room.walk, new Set(nb), w, h);
        if (nReg.rep < 0) continue;
        const key = nb.join(',') + '|' + nReg.rep;
        const g2 = g + 1;
        const prev = best.get(key);
        if (prev !== undefined && prev <= g2) continue;
        best.set(key, g2);
        const nid = sBoxes.length;
        sBoxes.push(nb);
        sPlayer.push(b);
        sParent.push(id);
        sPushFrom.push(b);
        sPushDir.push(d);
        sG.push(g2);
        sKey.push(key);
        hPush({ f: greedy ? hh : g2 + hh, h: hh, seq: seq++, id: nid });
      }
    }
  }
  return null;
}

function solveOneRoom(lv: Level, room: Room, isLast: boolean): Push[] | null {
  const w = lv.w;
  const h = lv.h;
  const dcell = (d: number): number => DY[d]! * w + DX[d]!;
  // Goal distances over room cells.
  const distToGoal = room.goals.map((g) => bfsDist(g, room.cells, w, h));
  // Reverse-pull live table: a cell is live if a box there can be pushed to a
  // goal (player reachability approximated by ignoring boxes).
  const live = new Set<number>(room.goals);
  let changed = true;
  while (changed) {
    changed = false;
    for (const x of [...live]) {
      for (let d = 0; d < 4; d++) {
        const p = x - dcell(d);
        const s = x - 2 * dcell(d);
        if (p < 0 || p >= w * h || s < 0 || s >= w * h) continue;
        if (!room.cells[p] || !room.walk[s] || live.has(p)) continue;
        live.add(p);
        changed = true;
      }
    }
  }
  const ctx: SearchCtx = {
    lv,
    room,
    live,
    distToGoal,
    perms: permutations(room.boxes.length),
    needExit: !isLast,
  };
  let r = searchRoom(ctx, false, MAX_EXPANSIONS);
  if (r) return r;
  r = searchRoom(ctx, true, MAX_GREEDY);
  if (r) return r;
  if (!isLast) {
    ctx.needExit = false;
    r = searchRoom(ctx, false, MAX_EXPANSIONS);
    if (r) return r;
    r = searchRoom(ctx, true, MAX_GREEDY);
    if (r) return r;
  }
  return null;
}

// Shortest walk (no pushes) from `from` to `to`, avoiding `boxes`. Null if none.
function walkPath(from: number, to: number, boxes: number[], lv: Level): string | null {
  if (from === to) return '';
  const w = lv.w;
  const h = lv.h;
  const blocked = new Set(boxes);
  const parent = new Int32Array(w * h).fill(-2);
  const pdir = new Int8Array(w * h).fill(-1);
  const q = [from];
  parent[from] = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]!;
    for (let d = 0; d < 4; d++) {
      const n = c + DY[d]! * w + DX[d]!;
      if (n < 0 || n >= w * h || parent[n] !== -2) continue;
      if (lv.wall[n] || blocked.has(n)) continue;
      if (Math.abs((n % w) - (c % w)) + Math.abs(Math.floor(n / w) - Math.floor(c / w)) !== 1) continue;
      parent[n] = c;
      pdir[n] = d;
      if (n === to) {
        let moves = '';
        for (let t = n; t !== from; t = parent[t]!) moves = CH[pdir[t]!] + moves;
        return moves;
      }
      q.push(n);
    }
  }
  return null;
}

// Replay the move string on the level; true only if every step is legal and
// every box ends on a goal.
function replay(lv: Level, moves: string): boolean {
  const w = lv.w;
  const boxes = new Set(lv.boxes);
  let p = lv.player;
  for (const ch of moves) {
    const d = CH.indexOf(ch);
    if (d < 0) return false;
    const q = p + DY[d]! * w + DX[d]!;
    if (lv.wall[q]) return false;
    if (boxes.has(q)) {
      const t = q + DY[d]! * w + DX[d]!;
      if (lv.wall[t] || boxes.has(t)) return false;
      boxes.delete(q);
      boxes.add(t);
    }
    p = q;
  }
  for (const b of boxes) {
    if (!lv.goals.has(b)) return false;
  }
  return true;
}

function solve(text: string): string {
  const lv = parse(text);
  const rooms = decompose(lv);
  // Every box must belong to exactly one room.
  let covered = 0;
  for (const r of rooms) covered += r.boxes.length;
  if (rooms.length === 0 || covered !== lv.boxes.length) return '';
  let curBoxes = [...lv.boxes].sort((a, b) => a - b);
  let curPlayer = lv.player;
  let moves = '';
  const w = lv.w;
  for (let ri = 0; ri < rooms.length; ri++) {
    const room = rooms[ri]!;
    const pushes = solveOneRoom(lv, room, ri === rooms.length - 1);
    if (!pushes) return '';
    for (const p of pushes) {
      const d = DY[p.dir]! * w + DX[p.dir]!;
      const behind = p.from - d;
      const path = walkPath(curPlayer, behind, curBoxes, lv);
      if (path === null) return '';
      moves += path;
      moves += CH[p.dir];
      const idx = curBoxes.indexOf(p.from);
      curBoxes[idx] = p.from + d;
      curBoxes.sort((a, b) => a - b);
      curPlayer = p.from;
    }
  }
  if (!replay(lv, moves)) return '';
  return moves;
}

for (const id of readdirSync(I).sort()) {
  const moves = solve(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
