import { expect, type Page } from "@playwright/test";
import { PNG_BUFFER } from "./aa";

/**
 * Drive the RP -> AA-popup capture flow: pick the region on the RP page, open the
 * AA-origin capture popup, fill + submit evidence inside it (the RP page can't
 * script into it — that's the whole point), and wait for the RP to show "waiting".
 */
export async function submitEvidence(
  page: Page,
  opts: { name: string; birthDate: string; region: string },
): Promise<void> {
  await page.goto("/");
  await page.getByTestId("region").selectOption(opts.region);

  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("start-capture").click();
  const popup = await popupPromise;

  await popup.getByTestId("claimed-name").fill(opts.name);
  await popup.getByTestId("birth-date").fill(opts.birthDate);
  await popup.getByTestId("photo").setInputFiles({
    name: "id.png",
    mimeType: "image/png",
    buffer: PNG_BUFFER,
  });
  await popup.getByTestId("submit-evidence").click();

  await expect(page.getByTestId("status-waiting")).toBeVisible();
}
