import { expect, type Page } from "@playwright/test";
import { PNG_BUFFER } from "./aa";

export const CAPTURE_FRAME = '[data-testid="capture-iframe"]';

/**
 * Drive the RP -> AA-iframe capture flow: pick the region on the RP page, open
 * the AA-origin capture dialog, fill + submit evidence inside the cross-origin
 * iframe (the RP page can't script into it — that's the point), then wait for the
 * RP to show "waiting".
 */
export async function submitEvidence(
  page: Page,
  opts: { name: string; birthDate: string; region: string },
): Promise<void> {
  await page.goto("/");
  await page.getByTestId("region").selectOption(opts.region);
  await page.getByTestId("start-capture").click();

  const frame = page.frameLocator(CAPTURE_FRAME);
  await frame.getByTestId("claimed-name").fill(opts.name);
  await frame.getByTestId("birth-date").fill(opts.birthDate);
  await frame.getByTestId("photo").setInputFiles({
    name: "id.png",
    mimeType: "image/png",
    buffer: PNG_BUFFER,
  });
  await frame.getByTestId("submit-evidence").click();

  await expect(page.getByTestId("status-waiting")).toBeVisible();
}
