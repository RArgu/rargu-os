// 002 R1.a fixture: calls proc.kill, which the sheet host does not provide.
import type { OS } from "../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  await os.proc.kill(1);
}
