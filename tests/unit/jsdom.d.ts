// jsdom ships no types and @types/jsdom is not a dependency: the part that
// tests/unit/page-404.test.ts uses.
declare module "jsdom" {
  export class JSDOM {
    constructor(
      html: string,
      options?: {
        runScripts?: "dangerously";
        url?: string;
        beforeParse?(window: Window & typeof globalThis): void;
      },
    );
    readonly window: Window & typeof globalThis;
  }
}
