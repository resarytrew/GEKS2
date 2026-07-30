import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = 3100;
const BASE_URL = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const nextCli = path.join(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

const server = spawn(
  process.execPath,
  [nextCli, "start", "--hostname", HOST, "--port", String(PORT)],
  {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(pathname) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${pathname} returned HTTP ${response.status}`);
  }
  return response;
}

async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `Production server exited before readiness with code ${server.exitCode}.`,
      );
    }
    try {
      await request("/api/health");
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(
    `Production server was not ready after ${READY_TIMEOUT_MS} ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function stopServer() {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  const exited = new Promise((resolve) => server.once("exit", resolve));
  const timeout = delay(5_000).then(() => "timeout");
  if ((await Promise.race([exited, timeout])) === "timeout") {
    server.kill("SIGKILL");
    await new Promise((resolve) => server.once("exit", resolve));
  }
}

let failure;
try {
  await waitUntilReady();
  for (const pathname of ["/", "/play"]) {
    const response = await request(pathname);
    console.log(`PASS ${pathname} HTTP ${response.status}`);
  }
  const healthResponse = await request("/api/health");
  const health = await healthResponse.json();
  if (
    health.engine !== "ready" ||
    !["local_only", "postgresql"].includes(health.persistence)
  ) {
    throw new Error(
      `/api/health returned unexpected payload: ${JSON.stringify(health)}`,
    );
  }
  console.log(
    `PASS /api/health HTTP ${healthResponse.status} engine=${health.engine} persistence=${health.persistence}`,
  );
} catch (error) {
  failure = error;
} finally {
  await stopServer();
}

if (failure) {
  console.error(
    `Production smoke failed: ${
      failure instanceof Error ? failure.message : String(failure)
    }`,
  );
  process.exitCode = 1;
} else {
  console.log("Production smoke completed; server stopped cleanly.");
}
