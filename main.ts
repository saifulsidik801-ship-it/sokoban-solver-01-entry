// Sokoban v5 PROTOTYPE (stage 1, ungolfed) — implements DESIGN.md §3 exactly.
// Push-level BFS per room over (sorted room boxes + canonical player region),
// one shared flood-fill-with-parents F, full move-prefix strings per BFS state,
// level kept as a plain string. No deadlock pruning, no golf yet.
import f from "fs";

let { MAKEFUN_INPUT_DIR: I = "/input", MAKEFUN_OUTPUT_DIR: O = "/output" } = process.env;

// Globals for the current level: t = level string, W = width, b = all box cells.
let t = "", W = 0;
const K = [-1, 1, 0, 0]; // filled in Z once W is known: [-1, 1, -W, W]
const C = "lrud"; // move letter for a step delta, by K.indexOf(delta)

// F(start, B, O): flood fill from `start` onto cells that are not walls and not
// in blocker lists B or O. Returns parent map m: m[cell] = cell stepped from,
// m[start] = -1; m.c = lowest reachable cell (exact canonical region minimum).
function F(start, B, O) {
  const m = {};
  const q = [start];
  m[start] = -1;
  let c = start;
  for (let i = 0; i < q.length; i++) {
    const x = q[i];
    for (const d of K) {
      const n = x + d;
      if (t[n] === "#") continue;
      if (n in m) continue;
      if (B.includes(n) || O.includes(n)) continue;
      m[n] = x;
      q.push(n);
      if (n < c) c = n;
    }
  }
  m.c = c;
  return m;
}

// S(roomBoxes, startPlayer, otherBoxes): push-BFS for one room.
// Returns [moves, endBoxes, endPlayer] on success, 0 if the queue exhausts.
function S(roomBoxes, startPlayer, otherBoxes) {
  const P = new Map(); // state key -> full move-prefix string
  const m0 = F(startPlayer, roomBoxes, otherBoxes);
  const k0 = roomBoxes + "," + m0.c;
  P.set(k0, "");
  const Q = [[roomBoxes, startPlayer]];
  for (let i = 0; i < Q.length; i++) {
    const [B, q] = Q[i];
    const m = F(q, B, otherBoxes);
    const k = B + "," + m.c;
    // Goal test on POP: first goal state popped is push-optimal (BFS order).
    if (B.every((x) => ".*+".includes(t[x]))) {
      console.error(`room states=${P.size} boxes=${B.length}`);
      return [P.get(k), B, q];
    }
    for (let j = 0; j < B.length; j++) {
      for (const d of K) {
        const o = B[j]; // box cell
        const u = o - d; // cell the player must stand on to push
        const v = o + d; // target cell
        if (!(u in m)) continue;
        if (t[v] === "#") continue;
        if (B.includes(v)) continue;
        if (otherBoxes.includes(v)) continue;
        const N = [...B];
        N[j] = v;
        N.sort((a, b) => a - b);
        const m2 = F(o, N, otherBoxes);
        const k2 = N + "," + m2.c;
        if (P.has(k2)) continue;
        // Walk segment: follow m's parents from u back to q, prepended.
        let seg = "";
        for (let cell = u; cell !== q; ) {
          const parent = m[cell];
          seg = C[K.indexOf(cell - parent)] + seg;
          cell = parent;
        }
        seg += C[K.indexOf(d)]; // the push itself
        P.set(k2, P.get(k) + seg);
        Q.push([N, o]);
      }
    }
  }
  console.error(`room FAILED states=${P.size} boxes=${roomBoxes.length}`);
  return 0;
}

// Z(text): solve one whole level by decomposing into rooms via the door scan.
function Z(text) {
  const rows = text.split("\n");
  W = rows[0].length;
  K[2] = -W;
  K[3] = W;
  t = rows.join("");
  let b = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "$" || t[i] === "*") b.push(i);
  }
  let p = t.indexOf("@");
  const H = (p / W) | 0; // hallway row (always 8 on generator levels)
  let ans = "";
  // Doors: rows H-1 and H+1 hold floor cells ONLY at doors (§1.2).
  for (const y of [-1, 1]) {
    for (let x = 0; x < W; x++) {
      const d = (H + y) * W + x;
      if (t[d] === "#") continue;
      const e = d + y * W; // cell just inside the door
      const rm = F(e, [d], []); // door blocked: region is exactly the room
      const R = b.filter((c) => c === d || c in rm);
      if (R.length === 0) continue;
      const O = b.filter((c) => !(c === d || c in rm));
      const v = S(R, p, O);
      if (!v) return "";
      ans += v[0];
      p = v[2];
      b = O.concat(v[1]);
    }
  }
  return ans;
}

for (const id of f.readdirSync(I)) {
  const dir = O + "/" + id;
  f.mkdirSync(dir, { recursive: true });
  let s = "";
  try {
    s = Z(f.readFileSync(I + "/" + id + "/level.txt") + "");
  } catch {
    s = "";
  }
  f.writeFileSync(dir + "/solution.txt", s);
}
