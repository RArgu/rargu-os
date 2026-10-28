// Home positions and sizes in sheet px (spec 001, layout table). demoH is the
// height reserved for the window's demo area; bar is the title bar text (mock).
export const SHEET = { w: 3000, h: 1640 };

export interface Slot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  demoH: number;
  bar: string;
  /** Quick tools only: the label on the card */
  tool?: string;
}

export const LAYOUT: Slot[] = [
  {
    id: "castlesiege",
    x: 360,
    y: 100,
    w: 620,
    // 003 T1: the wide layout at 40 px cells under the 27 px menu row;
    // 003 T8: the window ends at the status bar (no strip under it)
    // 015 R6: -23.25 px (one blurb line at 15 px / 23.25 px); not an integer, so
    // the status bar to window bottom gap stays 0.38 to 1.02 px in every engine
    h: 630.75,
    demoH: 427,
    bar: "castlesiege — vs. bot",
  },
  {
    id: "castlewars",
    x: 1040,
    y: 140,
    w: 600,
    h: 522,
    demoH: 314,
    bar: "castlewars — barracks",
  },
  {
    id: "pentimento",
    x: 1720,
    y: 80,
    w: 600,
    // 005 option C: the mock's height after a run, so all five lines show
    h: 612,
    demoH: 404,
    bar: "pentimento — the workflow it's built for",
  },
  {
    id: "crawler",
    x: 400,
    y: 860,
    w: 680,
    // 006 T3: the mock's lists and footer under the real project text
    h: 499,
    demoH: 265,
    bar: 'crawl — topic: "protein structure prediction"',
  },
  {
    id: "insider",
    x: 1160,
    y: 800,
    w: 680,
    // 006 T4: the mock's four flagged cards beside the chart, and the note
    h: 528,
    demoH: 320,
    bar: "spike-scan — example market",
  },
  // 004 T2: the Quick tools at mock v0.7's rectangles (owner, 2026-10-24):
  // outer = manifest client + 4 border + 33 title bar; demo h = 27 menu row
  // + client h
  {
    id: "paint",
    x: 1920,
    y: 760,
    w: 434,
    h: 350,
    demoH: 313,
    bar: "quick paint",
    tool: "Paint",
  },
  {
    id: "music",
    x: 2400,
    y: 700,
    w: 556,
    h: 348,
    demoH: 311,
    bar: "music maker",
    tool: "Music",
  },
  {
    id: "notes",
    x: 1920,
    y: 1150,
    w: 424,
    h: 364,
    demoH: 327,
    bar: "notes.txt",
    tool: "Notes",
  },
];
