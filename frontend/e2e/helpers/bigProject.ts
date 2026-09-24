// The AC25 fixture: a valid C5 export document with 200 tasks and 250 finish-to-start links, plus
// a move-drag that is known by construction to cascade and to change the critical set.
//
// Shape (all dates in UTC day steps from PROJECT_START):
// - A side chain t1 -> t2 -> t3 (rows 0-2), each 2 days with zero slack, ending SIDE_SLACK days
//   before the project end. It is not critical, and nothing else depends on it.
// - LAYERS layers of the remaining 197 tasks. Every task in layer i starts on the layer's first
//   day, and links only run from layer i to layer i + 1. The first task of each layer (the spine)
//   lasts LAYER_DAYS, so its link to the next spine task has zero slack and the last spine task
//   sets the project end. Every other task is shorter, so it has slack and is not critical.
//
// Moving t1 by SIDE_SLACK + 2 days pushes t2 and t3 by the same amount, so t3 ends 2 days after
// the old project end: t1, t2 and t3 become the whole critical set and the spine drops out.
import { addDays, daysBetween } from "../../src/timeline/dates.ts";

export interface BigProjectDrag {
  /** Key of the task to move-drag (not critical before the drag). */
  taskKey: string;
  /** How many days to drag it right. */
  deltaDays: number;
  /** Key of a task the drag cascades to, which then ends after the old project end. */
  cascadedKey: string;
}

interface DocTask {
  key: string;
  name: string;
  start: string;
  end: string;
  duration: number;
  milestone: boolean;
  percent_complete: number;
  assignee: string | null;
  predecessors: string[];
}

interface DocPerson {
  key: string;
  name: string;
  colour: string;
}

export interface BigProjectDoc {
  format: "hg-gantt";
  version: 1;
  project: { name: string };
  people: DocPerson[];
  tasks: DocTask[];
}

export const BIG_TASKS = 200;
export const BIG_DEPENDENCIES = 250;

const PROJECT_START = "2026-10-05";
const LAYERS = 10;
const LAYER_DAYS = 5;
const SIDE_DAYS = 2;
const SIDE_LENGTH = 3;
const SIDE_SLACK = 3;

const PEOPLE: DocPerson[] = [
  { key: "p1", name: "Ana", colour: "#2563eb" },
  { key: "p2", name: "Ben", colour: "#ea580c" },
  { key: "p3", name: "Chloe", colour: "#16a34a" },
  { key: "p4", name: "Dev", colour: "#7c3aed" },
];

/** Layer i index j is a milestone for these (i, j) pairs; never a spine task or the last layer. */
const MILESTONES = new Set(["2:5", "4:9", "6:3", "8:12"]);

function key(index: number): string {
  return `t${index + 1}`;
}

function task(
  index: number,
  name: string,
  start: string,
  duration: number,
  milestone: boolean,
  predecessors: number[],
): DocTask {
  return {
    key: key(index),
    name,
    start,
    end: milestone ? start : addDays(start, duration - 1),
    duration: milestone ? 0 : duration,
    milestone,
    percent_complete: milestone ? 0 : (index * 37) % 101,
    assignee: index % 5 === 4 ? null : (PEOPLE[index % PEOPLE.length]?.key ?? null),
    predecessors: [...predecessors].sort((a, b) => a - b).map(key),
  };
}

/** Throws if a start is before its earliest allowed start, or the counts are off. */
function check(tasks: DocTask[]): void {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  let links = 0;
  for (const t of tasks) {
    for (const predKey of t.predecessors) {
      links += 1;
      const pred = byKey.get(predKey);
      if (pred === undefined) {
        throw new Error(`bigProject: ${t.key} names unknown predecessor ${predKey}`);
      }
      const earliest = t.milestone ? pred.end : addDays(pred.end, 1);
      if (daysBetween(earliest, t.start) < 0) {
        throw new Error(`bigProject: ${t.key} starts before ${predKey} allows`);
      }
    }
  }
  if (tasks.length !== BIG_TASKS || links !== BIG_DEPENDENCIES) {
    throw new Error(`bigProject: built ${tasks.length} tasks and ${links} links`);
  }
}

export function buildBigProject(): { doc: BigProjectDoc; drag: BigProjectDrag } {
  const layerTasks = BIG_TASKS - SIDE_LENGTH;
  const layerDeps = BIG_DEPENDENCIES - (SIDE_LENGTH - 1);
  const projectEnd = addDays(PROJECT_START, LAYERS * LAYER_DAYS - 1);

  // Layer sizes as even as possible: 20 in the first 7 layers, 19 in the last 3.
  const sizes = Array.from(
    { length: LAYERS },
    (_, i) => Math.floor(layerTasks / LAYERS) + (i < layerTasks % LAYERS ? 1 : 0),
  );
  const firstIndex: number[] = [];
  let next = SIDE_LENGTH;
  for (const size of sizes) {
    firstIndex.push(next);
    next += size;
  }
  const at = (layer: number, j: number) => (firstIndex[layer] as number) + j;

  // One link into every task after layer 0 (index j from j mod the previous layer's size, so each
  // spine task follows the previous one), then extra links spread over the layers up to the total.
  const preds = new Map<number, number[]>();
  let links = 0;
  for (let i = 1; i < LAYERS; i += 1) {
    const prevSize = sizes[i - 1] as number;
    for (let j = 0; j < (sizes[i] as number); j += 1) {
      preds.set(at(i, j), [at(i - 1, j % prevSize)]);
      links += 1;
    }
  }
  for (let round = 0; links < layerDeps; round += 1) {
    for (let i = 1; i < LAYERS && links < layerDeps; i += 1) {
      const prevSize = sizes[i - 1] as number;
      const j = (round * 7 + i * 3 + 1) % (sizes[i] as number);
      const list = preds.get(at(i, j)) as number[];
      const pred = at(i - 1, (j * 5 + round * 3 + 2) % prevSize);
      if (!list.includes(pred)) {
        list.push(pred);
        links += 1;
      }
    }
  }

  const tasks: DocTask[] = [];
  const sideStart = addDays(projectEnd, -(SIDE_LENGTH * SIDE_DAYS - 1) - SIDE_SLACK);
  for (let s = 0; s < SIDE_LENGTH; s += 1) {
    const start = addDays(sideStart, s * SIDE_DAYS);
    tasks.push(task(s, `Side ${s + 1}`, start, SIDE_DAYS, false, s === 0 ? [] : [s - 1]));
  }
  for (let i = 0; i < LAYERS; i += 1) {
    const start = addDays(PROJECT_START, i * LAYER_DAYS);
    for (let j = 0; j < (sizes[i] as number); j += 1) {
      const index = at(i, j);
      const spine = j === 0;
      // Non-spine tasks last 1 to LAYER_DAYS - 1 days, so they always have slack.
      const duration = spine ? LAYER_DAYS : 1 + ((i * 31 + j * 17) % (LAYER_DAYS - 1));
      const milestone = MILESTONES.has(`${i}:${j}`);
      const name = spine ? `Stage ${i + 1} lead` : `Stage ${i + 1} task ${j}`;
      tasks.push(task(index, name, start, duration, milestone, preds.get(index) ?? []));
    }
  }
  check(tasks);

  return {
    doc: {
      format: "hg-gantt",
      version: 1,
      project: { name: "Big programme" },
      people: PEOPLE,
      tasks,
    },
    drag: { taskKey: key(0), deltaDays: SIDE_SLACK + 2, cascadedKey: key(SIDE_LENGTH - 1) },
  };
}
