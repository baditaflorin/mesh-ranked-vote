import { expect, test, type Page } from "@playwright/test";
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

/**
 * Load-bearing IRV-correctness assertion across two peers.
 *
 * The single ballot a browser page can cast (keyed by peerId) is not enough to
 * exercise a vote *transfer*, so each peer seeds a realistic ballot bloc into
 * the SAME shared Yjs doc both peers render from (via the test-only
 * `window.__rcvRoom` handle the app exposes). The scenario is the classic IRV
 * spoiler: candidate A leads the first-choice plurality but LOSES once the
 * last-place candidate is eliminated and its votes transfer.
 *
 *   options:  Amber (A), Blue (B), Cyan (C)
 *   ballots:  4 × [A, C]      (first choice A)
 *             3 × [B, C]      (first choice B)
 *             2 × [C, B]      (first choice C)
 *
 *   First-choice tally:  A=4, B=3, C=2  (A is the plurality leader, no majority)
 *   Round 1: Cyan eliminated (lowest, 2). Its 2 ballots transfer to Blue.
 *   Round 2: Blue=5, Amber=4  →  WINNER = Blue.
 *
 * A naive "count first choices only" implementation would crown Amber. This
 * test asserts BOTH peers independently compute: round 1 eliminates Cyan, and
 * the final winner is Blue — i.e. the transfer really happened, identically on
 * both screens.
 */
test("IRV vote transfer: first-choice leader loses, both peers agree on winner", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });

  // Seed options + a bloc of ballots into the shared Yjs doc from a page.
  const seed = async (
    page: Page,
    optionPairs: Array<[id: string, label: string]>,
    ballots: Array<{ key: string; name: string; ranking: string[] }>,
  ) =>
    page.evaluate(
      ({ optionPairs, ballots }) => {
        const w = window as unknown as {
          __rcvRoom?: { doc: { getMap: (k: string) => any; transact: (f: () => void) => void } };
        };
        const room = w.__rcvRoom;
        if (!room) throw new Error("test handle window.__rcvRoom not present");
        const options = room.doc.getMap("options");
        const ballotsMap = room.doc.getMap("ballots");
        room.doc.transact(() => {
          for (const [id, label] of optionPairs) options.set(id, { label });
          for (const ballot of ballots)
            ballotsMap.set(ballot.key, { name: ballot.name, ranking: ballot.ranking });
        });
      },
      { optionPairs, ballots },
    );

  try {
    // Wait until the Yjs room has booted on both peers (the test handle is set
    // by the Feature body, which only mounts once `room` is non-null).
    await a.waitForFunction(() => "__rcvRoom" in window);
    await b.waitForFunction(() => "__rcvRoom" in window);

    // Fixed option ids so both peers reference the same candidates.
    const A = "optA";
    const B = "optB";
    const C = "optC";
    const optionPairs: Array<[string, string]> = [
      [A, "Amber"],
      [B, "Blue"],
      [C, "Cyan"],
    ];

    // Peer A seeds the Amber bloc (4) + the Cyan bloc (2) — the spoiler.
    await seed(a, optionPairs, [
      ...Array.from({ length: 4 }, (_, i) => ({
        key: `a-amber-${i}`,
        name: `amber-${i}`,
        ranking: [A, C],
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        key: `a-cyan-${i}`,
        name: `cyan-${i}`,
        ranking: [C, B],
      })),
    ]);

    // Peer B seeds the Blue bloc (3) into the SAME shared doc.
    await seed(
      b,
      optionPairs,
      Array.from({ length: 3 }, (_, i) => ({
        key: `b-blue-${i}`,
        name: `blue-${i}`,
        ranking: [B, C],
      })),
    );

    // Both peers must converge to 9 ballots (proves cross-peer propagation).
    await expect(a.locator(".rcv-status")).toContainText("9 ballots");
    await expect(b.locator(".rcv-status")).toContainText("9 ballots");

    // The non-trivial assertions — identical on both screens:
    for (const page of [a, b]) {
      // Round 1 must eliminate Cyan (the last-place candidate), NOT Amber.
      const round1 = page.locator(".rcv-round").nth(0);
      await expect(round1.locator(".rcv-eliminated")).toContainText("Cyan");
      await expect(round1.locator(".rcv-eliminated")).not.toContainText("Amber");

      // There must be a second round (proof a transfer happened — a
      // first-choice-only count would finish in one round).
      await expect(page.locator(".rcv-round")).toHaveCount(2);

      // Final winner is Blue, NOT the first-choice plurality leader Amber.
      const banner = page.locator(".rcv-winner-banner");
      await expect(banner).toContainText("Blue");
      await expect(banner).not.toContainText("Amber");

      // Round 2 must show Blue ahead of Amber after the transfer (5 vs 4).
      const round2 = page.locator(".rcv-round").nth(1);
      const winnerRow = round2.locator("li.is-winner");
      await expect(winnerRow).toContainText("Blue");
      await expect(winnerRow.locator(".rcv-round-count")).toContainText("5");
    }
  } finally {
    await cleanup();
  }
});
