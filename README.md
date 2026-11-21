[![Sokoban Solver on make.fun](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?referral=mxhczr02)
[![Rank](https://make.fun/badge/sokoban-solver-01-run-20261121/saifulsidik801-ship-it/sokoban-solver-01-entry/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![Reward](https://make.fun/badge/sokoban-solver-01-run-20261121/saifulsidik801-ship-it/sokoban-solver-01-entry/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

# Sokoban Solver

A push-optimal Sokoban solver for make.fun's "Build the best Sokoban solver, 21 November 2026" bounty.

## Method

The generator's levels are a 1-wide hallway with 1–4 rooms off it, each room
holding 3–4 boxes and as many goals — and a box pushed through a door into the
hallway can never come back. So every box stays in its room and the level's
push-optimal count is the **sum of its rooms' optima**. This program:

1. **Decomposes** the level into rooms (connected components off the hallway row).
2. **Solves each room independently** with push-state A* (macro pushes):
   - Hungarian (minimum-assignment) heuristic over BFS push-distances of boxes
     to goals — admissible, so the first solution found is push-optimal.
   - Deadlock pruning: a static dead-cell table from reverse-pull analysis,
     plus 2×2 wall/box blocks with no goal.
   - Transposition table on (sorted boxes, player reachable-region) states.
   - The goal test also requires the player to be able to walk back out of
     the door, so the next room stays reachable.
3. **Concatenates** the rooms' move sequences with shortest hallway walks in
   between, and replays the whole solution to verify it before writing it.

The search is budgeted by expansions, never by the clock, so two runs write
the same bytes. Fallbacks (greedy best-first, then without the exit
constraint) run only if A* exhausts its budget.

## Results (practice set, kit scorer)

- **Score 1,000,000** — all 5 instances solved in exactly P* pushes
  (13 / 16 / 29 / 47 / 60), total wall time ~0.7 s (limit 60 s).
- Verified on 3 extra sets drawn from other drand rounds with the kit's own
  generator: **1,000,000 on each**, every instance in exactly P*.
- House baseline (plain-astar 1.0.0) scores **200,000** on the same practice set.

## Run

```sh
node main.ts
```

Reads `/input/<id>/level.txt` (or `$MAKEFUN_INPUT_DIR`) and writes
`/output/<id>/solution.txt` (or `$MAKEFUN_OUTPUT_DIR`). Node 22, no
dependencies, no network.

## License

MIT — see [LICENSE](LICENSE).
