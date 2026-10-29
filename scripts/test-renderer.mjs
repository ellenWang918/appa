import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import electron from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "appa-renderer-test-"));
try {
  const environment = { ...process.env, APPA_RENDERER_TEST_ROOT: temporary };
  delete environment.ELECTRON_RUN_AS_NODE;
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      electron,
      [path.join(root, "tests", "renderer-smoke.cjs")],
      {
        cwd: root,
        env: environment,
        stdio: "inherit",
        windowsHide: true,
        timeout: 60_000,
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  // Chromium releases its profile locks only after the test process has exited.
  await rm(temporary, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
