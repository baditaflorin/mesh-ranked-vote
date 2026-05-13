import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("ballots from two peers run through RCV; winner shows", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // A adds 3 options.
    for (const label of ["pizza", "tacos", "sushi"]) {
      await a.getByPlaceholder("add an option").fill(label);
      await a.getByRole("button", { name: "+ add", exact: true }).click();
    }

    // B should see options
    await expect(b.locator(".rcv-options-mgr .rcv-tags")).toContainText(["pizza"]);

    // A: rank pizza > tacos > sushi
    await a.getByPlaceholder("your name").fill("alice");
    await a.locator(".rcv-unranked button", { hasText: "pizza" }).click();
    await a.locator(".rcv-unranked button", { hasText: "tacos" }).click();
    await a.locator(".rcv-unranked button", { hasText: "sushi" }).click();

    // B: rank tacos > pizza > sushi
    await b.getByPlaceholder("your name").fill("bob");
    await b.locator(".rcv-unranked button", { hasText: "tacos" }).click();
    await b.locator(".rcv-unranked button", { hasText: "pizza" }).click();

    // Tally should appear on both with at least round 1
    await expect(a.locator(".rcv-round").first()).toBeVisible();
    const aRounds = await a.locator(".rcv-round").count();
    const bRounds = await b.locator(".rcv-round").count();
    expect(aRounds).toBeGreaterThanOrEqual(1);
    expect(bRounds).toEqual(aRounds);
    await expect(b.locator(".rcv-winner-banner")).toBeVisible();

    // 2 ballots present on both
    await expect(b.locator(".rcv-status")).toContainText("2 ballots");
  } finally {
    await cleanup();
  }
});
