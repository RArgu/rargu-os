// 002 R1.a fixture: calls sys.reboot, which the sheet host does not provide.
import type { OS } from "../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  os.sys.reboot();
}
