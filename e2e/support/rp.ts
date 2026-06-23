import { expect, type Page } from "@playwright/test";
import { PNG_BUFFER } from "./aa";

/** Fill and submit the RP evidence form for the given region. */
export async function submitEvidence(
  page: Page,
  opts: { name: string; birthDate: string; region: string },
): Promise<void> {
  await page.goto("/");
  await page.getByTestId("region").selectOption(opts.region);
  await page.getByTestId("claimed-name").fill(opts.name);
  await page.getByTestId("birth-date").fill(opts.birthDate);
  await page.getByTestId("photo").setInputFiles({
    name: "id.png",
    mimeType: "image/png",
    buffer: PNG_BUFFER,
  });
  await page.getByTestId("submit-evidence").click();
  await expect(page.getByTestId("status-waiting")).toBeVisible();
}
