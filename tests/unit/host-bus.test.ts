// 002 T7: R9.a (the host bus: every subscriber hears a message with the
// sender's pid; a throwing subscriber does not stop the others; unsubscribe
// works) and the bus part of R10 (an ended app's subscriptions go).
import { describe, expect, it, vi } from "vitest";
import type { OS, Window as OSWindow } from "../../src/sdk/os";
import { createBus, createOS, type HostDeps } from "../../src/sheet/host/os.ts";

type Bus = ReturnType<typeof createBus>;

/** An OS for fixture app `id` with pid `pid` on the shared `bus`. */
function osFor(bus: Bus, id: string, pid: number): OS {
  const none = () => Promise.reject(new Error("not in this test"));
  const deps: HostDeps = {
    pid,
    app: { id, name: id, version: "1" },
    fs: {
      readText: none,
      readFile: none,
      writeFile: none,
      readdir: none,
      stat: none,
      exists: none,
      mkdir: none,
      resolve: (p) => p,
    },
    proc: { spawn: none, list: () => [], onSignal: () => {} },
    ui: {
      createWindow: () => ({}) as OSWindow,
      alert: none,
      confirm: none,
      choose: none,
      prompt: none,
      notify: () => {},
      openFile: none,
      saveFile: none,
    },
    bus: bus.forPid(pid),
    theme: { get: () => "default" },
  };
  return createOS(deps);
}

/** Fixture app B: logs what it hears on topic t. */
function fixtureB(os: OS) {
  const heard: [unknown, number][] = [];
  const off = os.bus.subscribe("t", (data, from) => heard.push([data, from]));
  return { heard, off };
}

describe("R9.a host bus", () => {
  it("delivers A's message to B with A's pid", () => {
    const bus = createBus();
    const a = osFor(bus, "fx-a", 4);
    const b = fixtureB(osFor(bus, "fx-b", 5));
    a.bus.publish("t", { n: 1 });
    expect(b.heard).toEqual([[{ n: 1 }, 4]]);
  });

  it("reaches every subscriber, the sender's own included; other topics stay quiet", () => {
    const bus = createBus();
    const a = osFor(bus, "fx-a", 4);
    const self: number[] = [];
    a.bus.subscribe("t", (_d, from) => self.push(from));
    const b1 = fixtureB(osFor(bus, "fx-b", 5));
    const b2 = fixtureB(osFor(bus, "fx-c", 6));
    a.bus.publish("t", "x");
    a.bus.publish("other", "y");
    expect(self).toEqual([4]);
    expect(b1.heard).toEqual([["x", 4]]);
    expect(b2.heard).toEqual([["x", 4]]);
  });

  it("a throwing subscriber does not stop B", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bus = createBus();
    const a = osFor(bus, "fx-a", 4);
    // subscribed first, so it runs before B
    osFor(bus, "fx-bad", 7).bus.subscribe("t", () => {
      throw new Error("boom");
    });
    const b = fixtureB(osFor(bus, "fx-b", 5));
    expect(() => a.bus.publish("t", 1)).not.toThrow();
    expect(b.heard).toEqual([[1, 4]]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("after unsubscribe, B receives nothing", () => {
    const bus = createBus();
    const a = osFor(bus, "fx-a", 4);
    const b = fixtureB(osFor(bus, "fx-b", 5));
    b.off();
    a.bus.publish("t", 1);
    expect(b.heard).toEqual([]);
    // a second call does nothing
    b.off();
  });

  it("R10: drop(pid) removes every subscription of that app and no other", () => {
    const bus = createBus();
    const a = osFor(bus, "fx-a", 4);
    const b = fixtureB(osFor(bus, "fx-b", 5));
    const c = fixtureB(osFor(bus, "fx-c", 6));
    bus.drop(5);
    a.bus.publish("t", 1);
    expect(b.heard).toEqual([]);
    expect(c.heard).toEqual([[1, 4]]);
  });

  it("the host (pid 0) can publish to apps", () => {
    const bus = createBus();
    const b = fixtureB(osFor(bus, "fx-b", 5));
    bus.forPid(0).publish("t", "sys");
    expect(b.heard).toEqual([["sys", 0]]);
  });
});

describe("R10 retired pids", () => {
  it("a subscription made after drop(pid) hears nothing", () => {
    const bus = createBus();
    const a = osFor(bus, "fx-a", 4);
    bus.drop(5);
    const late = fixtureB(osFor(bus, "fx-b", 5));
    a.bus.publish("t", 1);
    expect(late.heard).toEqual([]);
    late.off();
  });
});
