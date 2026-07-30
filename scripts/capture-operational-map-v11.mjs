import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runtimeEnv = globalThis.process?.env ?? {};
const baseUrl = runtimeEnv.MAP_CAPTURE_BASE_URL ?? "http://localhost:3000";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "artifacts/operational-map-v11");
const executablePath =
  runtimeEnv.PLAYWRIGHT_CHROMIUM_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const manifest = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browser: "Microsoft Edge / Chromium",
  captures: [],
};

async function openFixture(viewport) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Raseiniai WEGO Test" }).click();
  await page.waitForURL("**/play");
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.renderMetrics,
  );
  return page;
}

async function capture(page, name, viewport, state) {
  const file = `${name}.png`;
  await page.screenshot({
    path: path.join(outputDir, file),
    type: "png",
    fullPage: true,
    animations: "disabled",
  });
  const metrics = JSON.parse(
    (await page.locator("canvas").getAttribute("data-render-metrics")) ?? "{}",
  );
  manifest.captures.push({ file, viewport, state, metrics });
}

for (const viewport of viewports) {
  const page = await openFixture(viewport);
  await capture(
    page,
    `${viewport.width}x${viewport.height}-medium`,
    viewport,
    viewport.width === 390 ? "mobile medium LOD" : "medium LOD",
  );
  await page.close();
}

{
  const viewport = viewports[0];
  const page = await openFixture(viewport);
  await page.getByRole("button", { name: "Показать весь театр" }).click();
  await page.waitForTimeout(120);
  await capture(page, "1920x1080-far", viewport, "full map / far LOD");

  for (let index = 0; index < 4; index++) {
    await page.getByRole("button", { name: "Приблизить карту" }).click();
  }
  await page.waitForTimeout(120);
  await capture(page, "1920x1080-close", viewport, "close LOD / coordinates");

  await page.getByRole("button", { name: "Фильтры" }).click();
  await page.getByRole("main").getByRole("button", { name: "Снабжение" }).click();
  await page.waitForTimeout(120);
  await capture(page, "1920x1080-supply", viewport, "supply preset");

  const grid = page.getByRole("checkbox", { name: "Гексагональная сетка" });
  if (await grid.isChecked()) await grid.uncheck();
  await page.waitForTimeout(120);
  await capture(page, "1920x1080-grid-off", viewport, "hex grid disabled");
  await page.close();
}

{
  const viewport = viewports[0];
  const page = await openFixture(viewport);
  const canvas = page.locator("canvas");
  await canvas.click({ position: { x: 455, y: 580 } });
  await page.waitForTimeout(120);
  await capture(
    page,
    "1920x1080-selected-german",
    viewport,
    "selected German formation / reachable projection",
  );

  await canvas.click({ position: { x: 800, y: 470 } });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  await capture(
    page,
    "1920x1080-attack-target",
    viewport,
    "enemy formation / attack target",
  );
  await page.close();
}

{
  const viewport = viewports[0];
  const page = await openFixture(viewport);
  await page.getByRole("button", { name: "НАЧАТЬ СУТКИ" }).click();
  await page.getByRole("button", { name: "К ШТАБНОЙ ФАЗЕ" }).click();
  await page.getByRole("button", { name: "КОНЕЦ ФАЗЫ" }).click();
  await page.getByRole("button", { name: /Устройство передано/i }).click();
  await page.locator("canvas").click({ position: { x: 800, y: 470 } });
  await page.waitForTimeout(120);
  await capture(
    page,
    "1920x1080-selected-soviet",
    viewport,
    "selected Soviet formation",
  );

  await page.getByLabel("Тип приказа").selectOption("prepared_attack");
  await capture(
    page,
    "1920x1080-prepared-attack",
    viewport,
    "prepared attack planning",
  );

  await page.getByLabel("Тип приказа").selectOption("prepare_demolition");
  await capture(
    page,
    "1920x1080-engineer-order",
    viewport,
    "bridge demolition engineering order",
  );
  await page.close();
}

await writeFile(
  path.join(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
await browser.close();

console.log(`Operational map captures: ${manifest.captures.length}`);
console.log(outputDir);
