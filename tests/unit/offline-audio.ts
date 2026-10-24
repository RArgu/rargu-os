// A small offline Web Audio renderer for Node, enough for the Tracker synth:
// gain nodes, AudioParam automation (set, linear ramp, target), oscillators
// (triangle and periodic waves), looping buffer sources. It computes real
// samples, so a test can check that a song makes sound and how long it is.
// Not a full implementation: no channels beyond mono, no other node types.

type Ev =
  | { kind: "set"; time: number; value: number }
  | { kind: "linear"; time: number; value: number }
  | { kind: "target"; time: number; value: number; tc: number; v0?: number };

class Param {
  private events: Ev[] = [];
  private idx = 0;
  /** the last event passed, and its value at its start */
  private last: Ev | null = null;
  private lastValue = 0;
  private lastTime = 0;

  constructor(public value: number) {
    this.lastValue = value;
  }

  private add(ev: Ev): this {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].time > ev.time) i--;
    this.events.splice(i, 0, ev);
    return this;
  }

  setValueAtTime(value: number, time: number): this {
    return this.add({ kind: "set", time, value });
  }

  linearRampToValueAtTime(value: number, time: number): this {
    return this.add({ kind: "linear", time, value });
  }

  setTargetAtTime(value: number, time: number, tc: number): this {
    return this.add({ kind: "target", time, value, tc });
  }

  cancelScheduledValues(time: number): this {
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }

  /** The value at `t`; calls must come in increasing time. */
  at(t: number): number {
    while (this.idx < this.events.length && this.events[this.idx].time <= t) {
      const e = this.events[this.idx++];
      const v0 = this.held(e.time);
      if (e.kind === "target") e.v0 = v0;
      this.lastValue = e.kind === "target" ? v0 : e.value;
      this.lastTime = e.time;
      this.last = e;
    }
    return this.held(t);
  }

  private held(t: number): number {
    const next = this.events[this.idx];
    if (next && next.kind === "linear" && next.time > this.lastTime) {
      const k = (t - this.lastTime) / (next.time - this.lastTime);
      return this.lastValue + (next.value - this.lastValue) * k;
    }
    const e = this.last;
    if (!e) return this.value;
    if (e.kind === "target") {
      const v0 = e.v0 ?? 0;
      return e.value + (v0 - e.value) * Math.exp(-(t - e.time) / e.tc);
    }
    return e.value;
  }
}

abstract class Node {
  inputs: Node[] = [];
  private outputs: Node[] = [];
  private cacheK = -1;
  private cacheV = 0;
  /** when this node can be non-zero, from the sources that feed it */
  span: [number, number] | null = null;

  constructor(readonly ctx: OfflineContext) {}

  connect(dest: Node): Node {
    dest.inputs.push(this);
    this.outputs.push(dest);
    return dest;
  }

  disconnect(): void {
    for (const o of this.outputs) o.inputs = o.inputs.filter((n) => n !== this);
    this.outputs = [];
  }

  computeSpan(): [number, number] {
    if (this.span) return this.span;
    let s = Infinity;
    let e = -Infinity;
    for (const i of this.inputs) {
      const [a, b] = i.computeSpan();
      s = Math.min(s, a);
      e = Math.max(e, b);
    }
    this.span = [s, e];
    return this.span;
  }

  sample(k: number, t: number): number {
    if (k !== this.cacheK) {
      this.cacheK = k;
      this.cacheV = this.compute(k, t);
    }
    return this.cacheV;
  }

  protected sumInputs(k: number, t: number): number {
    let sum = 0;
    for (const i of this.inputs) {
      const sp = i.span!;
      if (t < sp[0] || t >= sp[1]) continue;
      sum += i.sample(k, t);
    }
    return sum;
  }

  protected abstract compute(k: number, t: number): number;
}

class Gain extends Node {
  gain = new Param(1);
  protected compute(k: number, t: number): number {
    const x = this.sumInputs(k, t);
    return x === 0 ? 0 : x * this.gain.at(t);
  }
}

class Destination extends Node {
  protected compute(k: number, t: number): number {
    return this.sumInputs(k, t);
  }
}

abstract class Source extends Node {
  startTime = Infinity;
  stopTime = Infinity;
  onended: (() => void) | null = null;
  start(t = 0): void {
    this.startTime = t;
  }
  stop(t = 0): void {
    this.stopTime = t;
  }
  computeSpan(): [number, number] {
    this.span = [this.startTime, this.stopTime];
    return this.span;
  }
}

class Wave {
  readonly table: Float32Array;
  constructor(real: Float32Array, imag: Float32Array) {
    const N = 2048;
    this.table = new Float32Array(N);
    let peak = 0;
    for (let i = 0; i < N; i++) {
      const ph = (2 * Math.PI * i) / N;
      let v = 0;
      for (let n = 1; n < real.length; n++)
        v += real[n] * Math.cos(n * ph) + imag[n] * Math.sin(n * ph);
      this.table[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    // Web Audio normalizes periodic waves to a peak of 1
    if (peak > 0) for (let i = 0; i < N; i++) this.table[i] /= peak;
  }
}

class Oscillator extends Source {
  type = "sine";
  frequency = new Param(440);
  detune = new Param(0);
  private wave: Wave | null = null;
  private phase = 0;
  setPeriodicWave(w: Wave): void {
    this.wave = w;
    this.type = "custom";
  }
  protected compute(_k: number, t: number): number {
    const f = this.frequency.at(t) * 2 ** (this.detune.at(t) / 1200);
    const p = this.phase;
    this.phase = (p + f / this.ctx.sampleRate) % 1;
    if (this.wave) {
      const tb = this.wave.table;
      return tb[Math.floor(p * tb.length) % tb.length];
    }
    if (this.type === "triangle")
      return 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5);
    return Math.sin(2 * Math.PI * p);
  }
}

class Buffer {
  private data: Float32Array;
  constructor(
    length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  get length(): number {
    return this.data.length;
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class BufferSource extends Source {
  buffer: Buffer | null = null;
  loop = false;
  playbackRate = new Param(1);
  private pos = 0;
  protected compute(_k: number, t: number): number {
    const b = this.buffer;
    if (!b) return 0;
    const data = b.getChannelData();
    if (this.pos >= data.length) {
      if (!this.loop) return 0;
      this.pos %= data.length;
    }
    const v = data[Math.floor(this.pos)];
    this.pos += this.playbackRate.at(t);
    return v;
  }
}

export class OfflineContext {
  readonly destination: Destination;
  readonly currentTime = 0;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.destination = new Destination(this);
  }

  createGain(): Gain {
    return new Gain(this);
  }
  createOscillator(): Oscillator {
    return new Oscillator(this);
  }
  createBufferSource(): BufferSource {
    return new BufferSource(this);
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array): Wave {
    return new Wave(real, imag);
  }
  createBuffer(_channels: number, length: number, rate: number): Buffer {
    return new Buffer(length, rate);
  }

  startRendering(): Promise<Buffer> {
    const out = new Buffer(this.length, this.sampleRate);
    const data = out.getChannelData();
    this.destination.computeSpan();
    for (let k = 0; k < this.length; k++) {
      data[k] = this.destination.sample(k, k / this.sampleRate);
    }
    return Promise.resolve(out);
  }
}
