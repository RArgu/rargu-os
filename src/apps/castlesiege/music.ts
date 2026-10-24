// CastleSiege music: two Tracker songs, played by the Tracker engine (loaded
// only when a song first plays). One song at a time; starting one stops the other.
import type { OS } from "../../sdk/os";
import { errorMessage } from "../lib/open";

export const THEME = "/usr/share/music/castlesiege-theme.trk";
export const VICTORY = "/usr/share/music/castlesiege-victory.trk";

const engine = () => import("../tracker/engine");

export class Music {
  private ctl: AbortController | null = null;
  /** the song playing, or null */
  current: string | null = null;

  constructor(private os: OS) {}

  play(path: string, loop: boolean): void {
    if (this.current === path) return;
    this.stop();
    const ctl = new AbortController();
    this.ctl = ctl;
    this.current = path;
    // test builds only: every track started, for e2e (003 R7.a)
    if (import.meta.env.MODE === "e2e") {
      const w = window as unknown as { __csMusic?: unknown[] };
      (w.__csMusic ??= []).push({ path, signal: ctl.signal });
    }
    void engine()
      .then((e) => e.playFile(this.os, path, { loop, signal: ctl.signal }))
      .catch((err: unknown) =>
        this.os.log("warn", "castlesiege music:", errorMessage(err)),
      )
      .finally(() => {
        if (this.ctl === ctl) {
          this.ctl = null;
          this.current = null;
        }
      });
  }

  stop(): void {
    this.ctl?.abort();
    this.ctl = null;
    this.current = null;
  }

  /**
   * A song started without a user gesture (after a reload) waits on a
   * suspended audio context; the next press inside the game resumes it.
   */
  wake(): void {
    if (this.current) void engine().then((e) => e.audioContext());
  }
}
