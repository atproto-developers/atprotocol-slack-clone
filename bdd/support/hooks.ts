import { After, AfterAll, BeforeAll, Before, Status, setDefaultTimeout, setWorldConstructor } from "@cucumber/cucumber";
import { chromium, type Browser } from "@playwright/test";
import { startAppFixture, type AppFixture } from "../../protocol-tests/support/app-fixture";
import { AppWorld } from "./world";

setWorldConstructor(AppWorld);
setDefaultTimeout(180_000);

let fixture: AppFixture | undefined;
let browser: Browser | undefined;

BeforeAll({ timeout: 180_000 }, async () => {
  fixture = await startAppFixture();
  // BDD_HEADED=1 opens a visible window; BDD_BROWSER_CHANNEL=chrome drives the installed Google Chrome instead of bundled Chromium.
  browser = await chromium.launch({ headless: process.env.BDD_HEADED !== "1", channel: process.env.BDD_BROWSER_CHANNEL || undefined });
});

AfterAll({ timeout: 60_000 }, async () => {
  try {
    await browser?.close();
  } finally {
    await fixture?.stop();
  }
});

Before(function (this: AppWorld) {
  if (!fixture || !browser) throw new Error("The app fixture did not start.");
  this.fixture = fixture;
  this.browser = browser;
});

After(async function (this: AppWorld, scenario) {
  if (scenario.result?.status === Status.FAILED) {
    for (const actor of this.actors.values()) {
      this.attach(await actor.page.screenshot({ fullPage: true }).catch(() => Buffer.from("")), "image/png");
      this.attach(`[${actor.role}] ${actor.page.url()}\n${(await actor.page.locator("body").innerText().catch(() => "")).slice(0, 4_000)}`, "text/plain");
    }
    this.attach(`App server output (tail):\n${this.fixture.serverOutput().slice(-4_000)}`, "text/plain");
  }
  await this.closeActors();
});
