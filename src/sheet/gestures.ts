// The one-gesture owner (spec 001 R21, Approach: Gestures). The paper (pan,
// or pinch with two touches), a window drag and the minimap drag each claim
// the pointers they use, and so do a press on a demo control (005,
// demos/press.ts) and a pointer in a running app (002, main.ts). While one
// gesture owns the input, a press that would start another is ignored: a
// second finger on the paper does not pinch while a window is held.

export type Kind = "paper" | "win" | "map" | "control" | "app";

let owner: Kind | null = null;
/** whose gesture it is within its kind (002 R18: the app's window) */
let ownerKey: unknown = undefined;
/** each pointer's stop; one function shared by pointers stops once */
const stops = new Map<number, () => void>();

/**
 * Claims pointer `id` for gesture `kind`, which takes at most `max` pointers.
 * False if another gesture owns the input or `kind` is full. `key` tells two
 * gestures of one kind apart (an app: its window); a pointer joins only the
 * same key's gesture. `end` stops the gesture with no throw or glide when it
 * is cancelled.
 */
export function claim(
  kind: Kind,
  id: number,
  max: number,
  end: () => void,
  key?: unknown,
): boolean {
  if (
    owner !== null &&
    (owner !== kind || ownerKey !== key || stops.size >= max)
  )
    return false;
  owner = kind;
  ownerKey = key;
  stops.set(id, end);
  return true;
}

/** True while any gesture owns the input. */
export const active = (): boolean => owner !== null;

/** Gives pointer `id` back; the gesture ends with its last pointer. */
export function free(id: number): void {
  if (!stops.delete(id) || stops.size) return;
  owner = null;
  ownerKey = undefined;
}

/** Ends the current gesture, all its pointers, with no throw or glide
 * (R21.b, Reset). */
export function cancel(): void {
  const ends = new Set(stops.values());
  owner = null;
  ownerKey = undefined;
  stops.clear();
  for (const end of ends) end();
}

// the page losing focus ends the gesture: no pointerup may ever come (R21.b)
addEventListener("blur", cancel);
