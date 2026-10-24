// 002 R12: a failed start in a hosted window: the error and "Try again". Used
// by the host (app failures) and by the sheet (the host itself failed to
// load), so it is small and imports nothing.

/** Shows `err` and a Try again button in `area`; `retry` runs on a press. */
export function showFailure(
  area: HTMLElement,
  err: unknown,
  retry: () => void,
): void {
  area.dataset.host = "failed";
  for (const a of ["role", "tabindex", "aria-label"]) area.removeAttribute(a);
  const again = document.createElement("button");
  again.type = "button";
  again.className = "btn";
  again.textContent = "Try again";
  again.addEventListener("click", () => {
    // an error the window no longer shows is over (the app started otherwise)
    if (!box.isConnected) return;
    area.replaceChildren();
    retry();
  });
  const p = document.createElement("p");
  p.textContent = `Could not start: ${err instanceof Error ? err.message : String(err)}`;
  const box = document.createElement("div");
  box.className = "host-error";
  box.setAttribute("role", "alert");
  box.append(p, again);
  area.replaceChildren(box);
}
