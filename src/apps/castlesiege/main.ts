// CastleSiege (SPEC §7.14): Rodrigo's strategy game on the vendored engine,
// against the main-thread bot or a second person on the same device. The
// board is DOM: 63 square buttons with the pieces drawn over them.
import "./styles.css";
import type { MenuItem, OS } from "../../sdk/os";
import { h, scale } from "../../ui/dom";
import { bottomBar, button, radioGroup } from "../../ui/widgets";
import { closeMenus, popupMenu } from "../../ui/menu";
import { baseOf, errorMessage } from "../lib/open";
import { loadPalette } from "../lib/palette";
import { buildSprites, PIECE_NAMES } from "./art";
import { LEVELS, STYLES, levelOf, think, type Style } from "./bot";
import {
  applyAction,
  legalActionsForPiece,
  validateAction,
  type Action,
  type GameState,
  type Ruleset,
  type XY,
} from "./engine/index";
import {
  RULESET,
  isBotTurn,
  newSave,
  readSave,
  replay,
  serialize,
  setOptions,
  sideToMove,
  undo,
  type Mode,
  type Save,
  type Side,
} from "./session";
import { Music, THEME, VICTORY } from "./music";

interface Config {
  /** the looping game theme (Options > Music); off until the visitor asks */
  music: boolean;
}

const GAMES = "~/Documents/Games";
const ONLINE = "https://castlesiege.fly.dev";
/** a bot reply is never shown sooner than this, as in the original game */
const MIN_BOT_MS = 300;
/** cell sizes in logical px, largest first (SPEC §7.14) */
const CELLS = [40, 32, 24, 16];
/** the board frame, each side, logical px */
const FRAME = 3;
const FILES = "abcdefghijklmnopqrstuvwxyz";

const WINS: Record<string, string> = {
  regicide: "the King has fallen",
  castleClear: "every Wall is down",
  militaryDefeat: "no army is left",
  noLegalMove: "no legal move is left",
};

const sideName = (s: string): string => (s === "black" ? "Black" : "White");
const square = (p: XY): string => `${FILES[p.x]}${p.y + 1}`;
const isAbort = (err: unknown): boolean =>
  (err as { name?: string } | null)?.name === "AbortError";

export default async function main(os: OS): Promise<void> {
  // 003 R1: each start is a new default game, and nothing is saved for the
  // next start (no autosave)
  const config: Config = { music: false };
  let save: Save = newSave();

  /** the ruleset in play */
  let ruleset: Ruleset = RULESET;
  let states: GameState[] = replay(save, ruleset);
  let state = states[states.length - 1];
  let selected: string | null = null;
  let targets = new Map<string, Action & { attack: boolean }>();
  /** a move-list row being looked at, or null for the live position */
  let preview: number | null = null;
  let flipped = false;
  let thinking = false;
  let botCtl: AbortController | null = null;
  let cursor: XY = { x: 3, y: 0 };
  let cell = 24;
  let sprites = buildSprites(await loadPalette(os));
  /** bumps when the sprites are redrawn, so the reference redraws too */
  let spriteKey = 0;
  let shownRef = "";
  const pieceEls = new Map<string, HTMLElement>();
  let sheet: "pieces" | "moves" | null = null;
  /** the victory title screen was put away for this game (not saved) */
  let victoryDismissed = false;
  const music = new Music(os);

  const win = os.ui.createWindow({ title: "CastleSiege" });
  const compact = (): boolean => os.env.DISPLAY_POLICY === "compact";

  // ----- DOM -----

  const board = h("div", {
    class: "cs-board",
    attrs: { role: "grid", "aria-label": "Board" },
  });
  const piecesLayer = h("div", { class: "cs-pieces" });
  const frame = h("div", { class: "cs-frame" }, board, piecesLayer);
  const boardWrap = h("div", { class: "cs-boardwrap" }, frame);
  const turnEl = h("div", {
    class: "cs-turn",
    attrs: { role: "status" },
  });
  const capturedEl = h("div", { class: "cs-captured" });
  const movesEl = h("ol", {
    class: "cs-moves",
    attrs: { "aria-label": "Moves" },
  });
  const refEl = h("div", { class: "cs-ref" });
  const undoBtn = button("Undo", () => takeBack(), { icon: "undo-16" });
  const newBtn = button("New Game", () => askNewGame(), { icon: "new-16" });
  const side = h(
    "div",
    { class: "cs-side" },
    turnEl,
    capturedEl,
    movesEl,
    h("div", { class: "cs-actions" }, undoBtn, newBtn),
    refEl,
  );
  const statusEl = h("div", { class: "statusbar cs-statusbar" });
  const lineEl = h("div", { class: "cs-line", attrs: { role: "status" } });
  const sheetBody = h("div", { class: "cs-sheet-body" });
  const sheetTitle = h("b");
  const sheetEl = h(
    "div",
    { class: "cs-sheet hidden" },
    h(
      "div",
      { class: "cs-sheet-head" },
      sheetTitle,
      button("Close", () => showSheet(null), { class: "small" }),
    ),
    sheetBody,
  );
  const bar = bottomBar([
    { label: "New", icon: "new-16", id: "new", onClick: () => askNewGame() },
    { label: "Undo", icon: "undo-16", id: "undo", onClick: () => takeBack() },
    {
      label: "Pieces",
      icon: "sec-skills",
      id: "pieces",
      onClick: () => showSheet(sheet === "pieces" ? null : "pieces"),
    },
    {
      label: "Moves",
      icon: "sec-work",
      id: "moves",
      onClick: () => showSheet(sheet === "moves" ? null : "moves"),
    },
  ]);
  // the victory title screen: the winner's King, large, over the board
  const victoryKing = h("div", { class: "cs-victory-king" });
  const victoryTitle = h("div", { class: "cs-victory-title" });
  const victoryWhy = h("div", { class: "cs-victory-why" });
  const victoryNew = button("New Game", () => askNewGame(), { primary: true });
  const victoryEl = h(
    "div",
    {
      class: "cs-victory hidden",
      attrs: {
        role: "dialog",
        "aria-modal": "false",
        "aria-label": "Game over",
      },
    },
    h(
      "div",
      { class: "cs-victory-card" },
      victoryKing,
      victoryTitle,
      victoryWhy,
      h(
        "div",
        { class: "cs-victory-buttons" },
        victoryNew,
        button("Look at the board", () => dismissVictory()),
      ),
    ),
  );
  const root = h(
    "div",
    { class: "app cs", attrs: { tabindex: -1 } },
    h("div", { class: "cs-main" }, boardWrap, side),
    lineEl,
    statusEl,
    bar,
    sheetEl,
    victoryEl,
  );
  win.root.append(root);

  // ----- geometry: engine squares on screen -----

  const W = (): number => ruleset.board.width;
  const H = (): number => ruleset.board.height;

  /** The side drawn at the bottom. */
  function bottomSide(): Side {
    let s: Side =
      save.mode === "bot"
        ? save.human
        : compact()
          ? sideToMove(state)
          : "white";
    if (flipped) s = s === "white" ? "black" : "white";
    return s;
  }

  function toView(p: XY): { col: number; row: number } {
    return bottomSide() === "white"
      ? { col: p.x, row: H() - 1 - p.y }
      : { col: W() - 1 - p.x, row: p.y };
  }

  function fromView(col: number, row: number): XY {
    return bottomSide() === "white"
      ? { x: col, y: H() - 1 - row }
      : { x: W() - 1 - col, y: row };
  }

  /** Picks the cell size that fits, and sizes the board. */
  function layout(): void {
    const s = scale();
    if (compact()) {
      // phones: the board spans the width, cells at least 44 CSS px
      const width = boardWrap.clientWidth || win.root.clientWidth;
      const px = Math.min(52, Math.floor((width - 16) / W()));
      cell = Math.max(16, Math.floor(px / s));
      root.style.setProperty("--cs-cell", `${px}px`);
      root.style.setProperty("--cs-sprite", `${px >= 40 ? 36 : 18}px`);
    } else {
      const w = boardWrap.clientWidth / s - FRAME * 2;
      const hgt = boardWrap.clientHeight / s - FRAME * 2;
      cell =
        CELLS.find((c) => c * W() <= w && c * H() <= hgt) ??
        CELLS[CELLS.length - 1];
      root.style.setProperty("--cs-cell", `calc(var(--u) * ${cell})`);
      root.style.setProperty(
        "--cs-sprite",
        `calc(var(--u) * ${cell >= 40 ? 36 : 18})`,
      );
    }
    root.style.setProperty("--cs-cols", String(W()));
    root.style.setProperty("--cs-rows", String(H()));
    root.classList.toggle(
      "roomy",
      !compact() && win.root.clientWidth / s >= 600,
    );
    root.classList.toggle(
      "wide",
      !compact() && win.root.clientWidth / s >= 440,
    );
  }

  // ----- drawing -----

  function shownState(): GameState {
    return preview !== null ? states[preview] : state;
  }

  function buildBoard(): void {
    const cells: HTMLElement[] = [];
    for (let row = 0; row < H(); row++) {
      for (let col = 0; col < W(); col++) {
        cells.push(
          h("button", {
            class: "cs-cell",
            attrs: { type: "button", tabindex: -1 },
            data: { col: String(col), row: String(row) },
          }),
        );
      }
    }
    board.replaceChildren(...cells);
    for (const el of pieceEls.values()) el.remove();
    pieceEls.clear();
  }

  function lastAction(): { from: XY; to: XY } | null {
    const i = preview ?? states.length - 1;
    if (i === 0) return null;
    const a = save.actions[i - 1];
    const before = states[i - 1].pieces.find((p) => p.id === a.piece);
    return before ? { from: { x: before.x, y: before.y }, to: a.to } : null;
  }

  function paintBoard(): void {
    const shown = shownState();
    const last = lastAction();
    const at = (p: XY | undefined, x: number, y: number): boolean =>
      !!p && p.x === x && p.y === y;
    const sel = selected
      ? shown.pieces.find((p) => p.id === selected)
      : undefined;
    for (const el of board.children as HTMLCollectionOf<HTMLElement>) {
      const col = Number(el.dataset.col);
      const row = Number(el.dataset.row);
      const { x, y } = fromView(col, row);
      const key = `${x},${y}`;
      const t = preview === null ? targets.get(key) : undefined;
      el.dataset.cell = key;
      el.className =
        "cs-cell " +
        ((x + y) % 2 === 0 ? "dark" : "light") +
        (t ? (t.attack ? " t-attack" : " t-move") : "") +
        (at(last?.from, x, y) || at(last?.to, x, y) ? " last" : "") +
        (at(sel, x, y) ? " sel" : "");
      el.tabIndex = cursor.x === x && cursor.y === y ? 0 : -1;
      const piece = shown.pieces.find((p) => p.x === x && p.y === y);
      el.setAttribute(
        "aria-label",
        `${square({ x, y })}${piece ? `, ${sideName(piece.owner)} ${PIECE_NAMES[piece.type] ?? piece.type}` : ""}${t ? (t.attack ? ", attack" : ", move here") : ""}`,
      );
    }
    // pieces: one element each, kept across moves so a move slides
    const seen = new Set<string>();
    for (const p of shown.pieces) {
      seen.add(p.id);
      let el = pieceEls.get(p.id);
      if (!el) {
        el = h("div", { class: "cs-piece", data: { piece: p.id } });
        piecesLayer.append(el);
        pieceEls.set(p.id, el);
      }
      const { col, row } = toView(p);
      el.dataset.type = p.type;
      el.dataset.owner = p.owner;
      el.style.backgroundImage = sprites.get(`${p.owner}-${p.type}`) ?? "";
      el.style.transform = `translate(calc(var(--cs-cell) * ${col}), calc(var(--cs-cell) * ${row}))`;
    }
    for (const [id, el] of pieceEls) {
      if (!seen.has(id)) {
        el.remove();
        pieceEls.delete(id);
      }
    }
  }

  function describe(i: number): string {
    const a = save.actions[i];
    const before = states[i];
    const p = before.pieces.find((q) => q.id === a.piece);
    const hit = before.pieces.find((q) => q.x === a.to.x && q.y === a.to.y);
    const name = p ? (PIECE_NAMES[p.type] ?? p.type) : a.piece;
    return p
      ? `${name} ${square(p)}${hit ? "×" : "–"}${square(a.to)}`
      : `${name} ${square(a.to)}`;
  }

  function paintMoves(list: HTMLElement): void {
    const rows = save.actions.map((_, i) =>
      h(
        "li",
        {
          class: preview === i + 1 ? "on" : "",
          on: { click: () => setPreview(i + 1) },
        },
        h("span", {
          class: "cs-side-dot " + (i % 2 === 0 ? "white" : "black"),
        }),
        h("span", { text: `${i + 1}. ${describe(i)}` }),
      ),
    );
    list.replaceChildren(...rows);
    // 003 R11: only the list scrolls (never the view or focus)
    if (preview === null) list.scrollTop = list.scrollHeight;
  }

  function paintCaptured(): void {
    const start = states[0].pieces;
    const now = new Set(state.pieces.map((p) => p.id));
    const lost = (owner: string): HTMLElement =>
      h(
        "div",
        { class: "cs-lost" },
        ...start
          .filter((p) => p.owner === owner && !now.has(p.id))
          .map((p) =>
            h("span", {
              class: "cs-mini",
              style: {
                backgroundImage: sprites.get(`${p.owner}-${p.type}`) ?? "",
              },
              attrs: { title: `${sideName(p.owner)} ${PIECE_NAMES[p.type]}` },
            }),
          ),
      );
    capturedEl.replaceChildren(
      h("div", { class: "cs-lost-label", text: "Taken:" }),
      lost("black"),
      lost("white"),
    );
  }

  function turnText(): string {
    if (preview !== null) {
      return `Looking at move ${preview}. Click the board to go back.`;
    }
    if (state.status.state === "won") {
      const winner = state.status.winner;
      const why = WINS[state.status.by] ?? state.status.by;
      if (save.mode === "bot") {
        return winner === save.human
          ? `You win: ${why}.`
          : `The bot wins: ${why}.`;
      }
      return `${sideName(winner)} wins: ${why}.`;
    }
    if (thinking) return "The bot is thinking…";
    const mover = sideName(state.toMove);
    if (save.mode === "bot") {
      return `Your move (${mover}).`;
    }
    return `${mover} to move.`;
  }

  function statusText(): string {
    const moveNo = Math.floor(save.actions.length / 2) + 1;
    return save.mode === "bot"
      ? `Vs bot · ${levelOf(save.level).label} · ${STYLES.find((s) => s.value === save.style)?.label ?? ""} · Move ${moveNo}`
      : `Hot-seat · Move ${moveNo}`;
  }

  function render(): void {
    layout();
    if (board.childElementCount !== W() * H()) buildBoard();
    paintBoard();
    paintMoves(movesEl);
    paintCaptured();
    turnEl.textContent = turnText();
    lineEl.textContent = turnText();
    statusEl.textContent = statusText();
    undoBtn.disabled = noUndo();
    // 003 R6, 008 R2: the menu follows the game (Undo, checks)
    if (menuState() !== builtMenu) buildMenu();
    root.classList.toggle("compact", compact());
    root.dataset.turn = state.toMove;
    root.dataset.status = state.status.state;
    root.classList.toggle("thinking", thinking);
    // the piece reference shows beside the board when the window is wide
    const refKey = root.classList.contains("wide")
      ? ruleset.version + spriteKey
      : "";
    if (refKey !== shownRef) {
      shownRef = refKey;
      refEl.replaceChildren(...(refKey ? reference() : []));
    }
    if (sheet) fillSheet();
    paintVictory();
    syncMusic();
  }

  // ----- music -----

  /**
   * The theme loops while a real game is being played on screen, with Music
   * on (003 R7). Hidden (minimized, or
   * the phone's home screen) or Music off stops any song, the victory tune
   * too.
   */
  function syncMusic(): void {
    const onScreen = boardWrap.clientWidth > 0;
    if (!config.music || !onScreen) {
      music.stop();
      return;
    }
    if (state.status.state === "playing") {
      music.play(THEME, true);
    } else if (
      music.current === THEME ||
      // the victory tune ends with the won game (New Game, Undo)
      (music.current === VICTORY && state.status.state !== "won")
    ) {
      music.stop();
    }
  }

  // ----- victory title screen -----

  /** A game that has been won. */
  function victoryShown(): boolean {
    return (
      state.status.state === "won" && preview === null && !victoryDismissed
    );
  }

  function paintVictory(): void {
    const show = victoryShown();
    const was = !victoryEl.classList.contains("hidden");
    victoryEl.classList.toggle("hidden", !show);
    if (!show || state.status.state !== "won") return;
    const winner = state.status.winner === "black" ? "black" : "white";
    const why = WINS[state.status.by] ?? state.status.by;
    victoryEl.dataset.winner = winner;
    victoryKing.style.backgroundImage = sprites.get(`${winner}-king`) ?? "";
    victoryTitle.textContent = `${sideName(winner)} Wins!`;
    victoryWhy.textContent = `${why.charAt(0).toUpperCase()}${why.slice(1)}.`;
    if (!was && root.contains(document.activeElement)) victoryNew.focus();
  }

  function dismissVictory(): void {
    victoryDismissed = true;
    render();
    root.focus();
  }

  // ----- piece reference -----

  /** A small diagram per piece: where it moves (dots) and attacks (brackets). */
  function reference(): HTMLElement[] {
    const types = Object.keys(ruleset.pieceTypes);
    return types.map((type) => {
      const def = ruleset.pieceTypes[type];
      const reach = Math.max(
        1,
        ...[...def.moves, ...def.attacks].map((o) =>
          Math.max(Math.abs(o.dx), Math.abs(o.dy)),
        ),
      );
      const n = reach * 2 + 1;
      const grid = h("div", {
        class: "cs-ref-grid",
        style: { gridTemplateColumns: `repeat(${n}, var(--cs-ref))` },
      });
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const dx = c - reach;
          const dy = reach - r;
          const mv = def.moves.some((o) => o.dx === dx && o.dy === dy);
          const at = def.attacks.some((o) => o.dx === dx && o.dy === dy);
          const centre = dx === 0 && dy === 0;
          grid.append(
            h("span", {
              class:
                "cs-ref-cell" +
                (mv ? " t-move" : "") +
                (at ? " t-attack" : "") +
                (centre ? " me" : ""),
              style: centre
                ? { backgroundImage: sprites.get(`white-${type}`) ?? "" }
                : {},
            }),
          );
        }
      }
      const notes: string[] = [];
      if (def.blocksPath) notes.push("blocks lines");
      if (def.onlyAttackableBy?.length) {
        notes.push(
          `only a ${def.onlyAttackableBy.map((t) => PIECE_NAMES[t] ?? t).join(", ")} can take it`,
        );
      }
      if (def.roles?.includes("royal")) notes.push("never attacks");
      return h(
        "div",
        { class: "cs-ref-item" },
        h("b", { text: PIECE_NAMES[type] ?? type }),
        grid,
        notes.length ? h("small", { text: notes.join("; ") }) : null,
      );
    });
  }

  function fillSheet(): void {
    if (sheet === "pieces") {
      sheetTitle.textContent = "Pieces: dots move, brackets attack";
      sheetBody.replaceChildren(h("div", { class: "cs-ref" }, ...reference()));
    } else if (sheet === "moves") {
      sheetTitle.textContent = "Moves";
      const list = h("ol", { class: "cs-moves" });
      paintMoves(list);
      sheetBody.replaceChildren(list);
    }
  }

  function showSheet(which: "pieces" | "moves" | null): void {
    sheet = which;
    sheetEl.classList.toggle("hidden", which === null);
    if (which) fillSheet();
  }

  // ----- play -----

  /** Who may touch the pieces of a side right now. */
  function canMove(side: string): boolean {
    if (state.status.state !== "playing" || thinking || preview !== null) {
      return false;
    }
    if (side !== state.toMove) return false;
    return save.mode === "hotseat" || side === save.human;
  }

  function select(id: string | null): void {
    selected = id;
    targets = new Map();
    if (id) {
      for (const a of legalActionsForPiece(state, ruleset, id)) {
        const v = validateAction(state, ruleset, a);
        if (v.legal) {
          targets.set(`${a.to.x},${a.to.y}`, {
            ...a,
            attack: v.kind === "attack",
          });
        }
      }
    }
    paintBoard();
  }

  /** Plays an action for whoever is to move. */
  function act(action: Action): void {
    const r = applyAction(state, ruleset, action);
    if (!r.ok) {
      os.ui.notify(`That move is not allowed (${r.reason.toLowerCase()}).`);
      return;
    }
    save = { ...save, actions: [...save.actions, action] };
    states.push(r.state);
    state = r.state;
    selected = null;
    targets = new Map();
    // a win plays the victory tune with the title screen (Music); 003 R7:
    // no sound effects
    if (state.status.state === "won" && config.music) {
      music.play(VICTORY, false);
    }
    render();
    botTurn();
  }

  function stopBot(): void {
    botCtl?.abort();
    botCtl = null;
    thinking = false;
  }

  function botWanted(): boolean {
    if (state.status.state !== "playing") return false;
    return isBotTurn(save, state);
  }

  /** The bot's search; test builds let e2e hold it (`__csThink`). */
  const search: typeof think =
    import.meta.env.MODE === "e2e"
      ? (...a) => {
          const hold = (
            window as unknown as {
              __csThink?: (
                real: typeof think,
                ...a: Parameters<typeof think>
              ) => ReturnType<typeof think>;
            }
          ).__csThink;
          return hold ? hold(think, ...a) : think(...a);
        }
      : think;

  function botTurn(): void {
    if (!botWanted() || thinking) return;
    thinking = true;
    render();
    const ctl = new AbortController();
    botCtl = ctl;
    const started = performance.now();
    const level = levelOf(save.level);
    void search(state, ruleset, level, save.style as Style, {
      signal: ctl.signal,
      seed: save.actions.length + 1,
    })
      .then(async (action) => {
        const wait = MIN_BOT_MS - (performance.now() - started);
        // the delay ends early when the reply is cancelled (no timer left)
        if (wait > 0)
          await new Promise<void>((r) => {
            const t = setTimeout(r, wait);
            ctl.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                r();
              },
              { once: true },
            );
          });
        if (ctl.signal.aborted) return;
        thinking = false;
        botCtl = null;
        act(action);
      })
      .catch((err: unknown) => {
        if (isAbort(err) || ctl.signal.aborted) return;
        thinking = false;
        botCtl = null;
        render();
        os.ui.notify(`The bot is stuck: ${errorMessage(err)}`);
      });
  }

  /** `replayed`: the game's positions when the caller has them already. */
  function setGame(
    next: Save,
    rules: Ruleset = RULESET,
    replayed?: GameState[],
  ): void {
    stopBot();
    victoryDismissed = false;
    ruleset = rules;
    save = next;
    states = replayed ?? replay(save, ruleset);
    state = states[states.length - 1];
    selected = null;
    targets = new Map();
    preview = null;
    flipped = false;
    cursor = {
      x: Math.floor(W() / 2),
      y: bottomSide() === "white" ? 0 : H() - 1,
    };
    buildBoard();
    buildMenu();
    render();
    botTurn();
  }

  function takeBack(): void {
    if (save.actions.length === 0) return;
    const next = undo(save);
    stopBot();
    victoryDismissed = false;
    save = next;
    states = replay(save, ruleset);
    state = states[states.length - 1];
    selected = null;
    targets = new Map();
    preview = null;
    render();
    botTurn();
  }

  function setPreview(i: number | null): void {
    preview = i === null || i >= states.length - 1 ? null : i;
    selected = null;
    targets = new Map();
    render();
  }

  // ----- input -----

  function clickSquare(p: XY): void {
    cursor = p;
    if (preview !== null) return setPreview(null);
    const key = `${p.x},${p.y}`;
    const target = targets.get(key);
    // 003 review: a target moves only a piece still movable
    const owner = state.pieces.find((q) => q.id === selected)?.owner;
    if (selected && target && owner && canMove(owner)) {
      act({ piece: target.piece, to: target.to });
      return;
    }
    const piece = state.pieces.find((q) => q.x === p.x && q.y === p.y);
    if (piece && canMove(piece.owner) && piece.id !== selected) {
      select(piece.id);
    } else {
      select(null);
    }
  }

  board.addEventListener("click", (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>(".cs-cell");
    if (!el) return;
    clickSquare(fromView(Number(el.dataset.col), Number(el.dataset.row)));
  });

  root.addEventListener("keydown", (ev) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = moves[ev.key];
    if (step) {
      ev.preventDefault();
      const v = toView(cursor);
      const col = Math.min(W() - 1, Math.max(0, v.col + step[0]));
      const row = Math.min(H() - 1, Math.max(0, v.row + step[1]));
      cursor = fromView(col, row);
      paintBoard();
      board
        .querySelector<HTMLElement>(`[data-col="${col}"][data-row="${row}"]`)
        ?.focus();
    } else if (ev.key === "Escape") {
      if (victoryShown()) dismissVictory();
      else if (sheet) showSheet(null);
      else select(null);
    }
  });

  // ----- dialogs, files -----

  function askNewGame(): void {
    let mode: Mode = save.mode;
    let human: Side = save.human;
    let level = save.level;
    const dlg = os.ui.createWindow({
      title: "New Game",
      modal: true,
      resizable: false,
      width: 220,
      height: 170,
    });
    const opponent = radioGroup<Mode>(
      "cs-mode",
      [
        { value: "bot", label: "Against the bot" },
        { value: "hotseat", label: "Two players, one device" },
      ],
      mode,
      (v) => {
        mode = v;
        sideRow.classList.toggle("hidden", v !== "bot");
      },
    );
    const sides = radioGroup<Side>(
      "cs-side",
      [
        { value: "white", label: "White (moves first)" },
        { value: "black", label: "Black" },
      ],
      human,
      (v) => (human = v),
    );
    let levelMenu: { close(): void } | null = null;
    const openLevels = (): void => {
      if (levelMenu) {
        levelMenu.close();
        return;
      }
      closeMenus();
      levels.setAttribute("aria-expanded", "true");
      levelMenu = popupMenu(
        LEVELS.map((l) => ({
          label: l.label,
          checked: l.id === level,
          action: () => {
            level = l.id;
            levels.replaceChildren(
              h("span", { text: l.label }),
              h("span", { class: "glyph down" }),
            );
          },
        })),
        levels,
        {
          onClose: () => {
            levelMenu = null;
            levels.setAttribute("aria-expanded", "false");
          },
        },
      );
    };
    const levels = button(levelOf(level).label, openLevels);
    levels.append(h("span", { class: "glyph down" }));
    levels.setAttribute("aria-label", "Bot level");
    levels.setAttribute("aria-haspopup", "menu");
    levels.setAttribute("aria-expanded", "false");
    levels.dataset.menuOwner = "cs-level";
    levels.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        openLevels();
      }
    });
    dlg.onClose(() => levelMenu?.close());
    const sideRow = h(
      "div",
      { class: "cs-dlg-row" + (mode === "bot" ? "" : " hidden") },
      h("b", { text: "Play as" }),
      sides.el,
      h("label", { class: "row" }, h("span", { text: "Level" }), levels),
    );
    dlg.root.append(
      h(
        "div",
        { class: "app cs-dlg" },
        h("b", { text: "Opponent" }),
        opponent.el,
        sideRow,
        h(
          "div",
          { class: "dialog-buttons" },
          button(
            "OK",
            () => {
              dlg.close();
              setGame(newSave({ mode, human, level, style: save.style }));
            },
            { primary: true },
          ),
          button("Cancel", () => dlg.close()),
        ),
      ),
    );
  }

  async function saveGame(): Promise<void> {
    await os.fs.mkdir(GAMES, { recursive: true }).catch(() => {});
    const path = await os.ui.saveFile({
      filters: [".siege"],
      startDir: GAMES,
      defaultName: "game.siege",
    });
    if (!path) return;
    try {
      await os.fs.writeFile(path, serialize(save));
      os.ui.notify(`Saved ${baseOf(path)}.`);
    } catch (err) {
      await os.ui.alert(`Could not save:\n${errorMessage(err)}`, "CastleSiege");
    }
  }

  async function load(path: string, startup = false): Promise<void> {
    try {
      const text = await os.fs.readText(path);
      // 003 R10: the whole file is checked first and replayed once
      const read = readSave(text, true);
      setGame(read.save, RULESET, read.states);
    } catch (err) {
      // 003 R10: a bad file leaves the current game as it is
      if (!startup) {
        await os.ui.alert(
          `${baseOf(path)} could not be opened:\n${errorMessage(err)}\nThe current game stays.`,
          "CastleSiege",
        );
        return;
      }
      await os.ui.alert(
        `${baseOf(path)} could not be opened:\n${errorMessage(err)}\nA new game starts instead.`,
        "CastleSiege",
      );
      setGame(
        newSave({ mode: save.mode, human: save.human, level: save.level }),
      );
    }
  }

  async function openGame(): Promise<void> {
    const path = await os.ui.openFile({ filters: [".siege"], startDir: GAMES });
    if (path) await load(path);
  }

  // ----- menus -----

  function setOption(
    patch: Partial<Pick<Save, "mode" | "level" | "style">>,
  ): void {
    const next = setOptions(save, state, patch);
    save = next.save;
    // 003 R5, 008 R1: Hot-seat drops a pending bot reply
    if (next.cancel) stopBot();
    // 003 review: a selection made for the other opponent does not stay
    if (patch.mode) {
      selected = null;
      targets = new Map();
    }
    buildMenu();
    render();
    botTurn();
  }

  const about = (): void =>
    void os.ui.alert(
      "CastleSiege, a strategy game by Rodrigo Arguello.\nThe engine, the bot and the piece art are his, from the online game at castlesiege.fly.dev.",
      "About CastleSiege",
    );
  const noUndo = (): boolean => save.actions.length === 0;
  /** what the menu shows; a change rebuilds it (003 R6, 008 R2) */
  const menuState = (): string =>
    [noUndo(), flipped, save.mode, save.level, save.style].join();
  let builtMenu = "";

  function buildMenu(): void {
    builtMenu = menuState();
    const items: MenuItem[] = [
      {
        label: "Game",
        children: [
          { label: "New Game…", shortcut: "F2", action: askNewGame },
          {
            label: "Undo",
            shortcut: "Ctrl+Z",
            disabled: noUndo(),
            action: takeBack,
          },
          {
            label: "Flip board",
            checked: flipped,
            action: () => {
              flipped = !flipped;
              buildMenu();
              render();
            },
          },
          { label: "", separator: true },
          {
            label: "Save…",
            shortcut: "Ctrl+S",
            action: () => void saveGame(),
          },
          { label: "Open…", shortcut: "Ctrl+O", action: () => void openGame() },
          // 003 R4: no Exit on the sheet
        ],
      },
      {
        label: "Options",
        children: [
          {
            label: "Opponent",
            children: [
              {
                label: "Bot",
                checked: save.mode === "bot",
                action: () => setOption({ mode: "bot" }),
              },
              {
                label: "Hot-seat",
                checked: save.mode === "hotseat",
                action: () => setOption({ mode: "hotseat" }),
              },
            ],
          },
          {
            label: "Bot level",
            children: LEVELS.map((l) => ({
              label: l.label,
              checked: save.level === l.id,
              action: () => setOption({ level: l.id }),
            })),
          },
          {
            label: "Bot style",
            children: STYLES.map((s) => ({
              label: s.label,
              checked: save.style === s.value,
              action: () => setOption({ style: s.value }),
            })),
          },
          // 003 R4, R7: no Sound item (no sound effects)
          {
            label: "Music",
            checked: config.music,
            action: () => {
              config.music = !config.music;
              buildMenu();
              syncMusic();
            },
          },
        ],
      },
      {
        // 003 R4: no lesson, Guide or Reader; no rules (owner 2026-10-24:
        // they describe the old OS, revised later)
        label: "Help",
        children: [
          {
            label: "Play online ↗",
            action: () => os.sys.openExternal(ONLINE),
          },
          { label: "", separator: true },
          { label: "About", action: about },
        ],
      },
    ];
    win.setMenu({ items });
  }

  // ----- wiring -----

  const offs = [
    os.bus.subscribe("sys:theme", () => {
      void loadPalette(os).then((p) => {
        sprites = buildSprites(p);
        spriteKey++;
        render();
      });
    }),
  ];
  if (typeof ResizeObserver !== "undefined") {
    let last = "";
    const ro = new ResizeObserver(() => {
      const key = `${boardWrap.clientWidth}x${boardWrap.clientHeight}`;
      if (key === last) return;
      last = key;
      render();
    });
    ro.observe(boardWrap);
    offs.push(() => ro.disconnect());
  }
  const shutdown = (): void => {
    stopBot();
    music.stop();
    for (const off of offs) off();
  };
  win.onClose(() => {
    shutdown();
    return true;
  });
  os.proc.onSignal(shutdown);
  win.onFocus((focused) => {
    if (focused && !root.contains(document.activeElement)) root.focus();
  });
  // 003 R9, 008 R3: reduced motion is the live [data-motion] rule alone, so
  // a change of the preference during the game applies
  root.addEventListener("pointerdown", () => music.wake());
  root.addEventListener("keydown", () => music.wake());

  buildMenu();
  buildBoard();
  render();
  root.focus();
  if (os.argv[0]) await load(os.fs.resolve(os.argv[0]), true);
  else botTurn();
}
