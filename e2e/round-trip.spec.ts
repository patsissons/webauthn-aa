import { test, expect, type APIRequestContext } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { AA_URL, TINY_PNG_DATA_URL } from "./support/aa";

const PNG_B64 = TINY_PNG_DATA_URL.split(",")[1];

async function approvePending(request: APIRequestContext, claimedName: string) {
  // Reviewer step, driven programmatically (doc B.5: reviewer driven by test).
  for (let i = 0; i < 30; i++) {
    const list = await (await request.get(`${AA_URL}/api/review/list?status=pending`)).json();
    const match = (list.requests ?? []).find(
      (r: { claimedName: string }) => r.claimedName === claimedName,
    );
    if (match) {
      const res = await request.post(`${AA_URL}/api/review/${match.id}`, {
        data: { action: "approve" },
      });
      expect(res.ok()).toBeTruthy();
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`pending request for ${claimedName} never appeared`);
}

test("full round trip: unauthenticated → evidence → approved → authenticated", async ({
  page,
  request,
}) => {
  await addVirtualAuthenticator(page);
  const name = `Grace Hopper ${Date.now()}`;

  await page.goto("/");
  await page.getByTestId("claimed-name").fill(name);
  await page.getByTestId("birth-date").fill("1990-01-01"); // 30s+, satisfies 18+ and 21+
  await page.getByTestId("photo").setInputFiles({
    name: "id.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_B64, "base64"),
  });
  // Region 1 is the default selection.
  await page.getByTestId("submit-evidence").click();

  await expect(page.getByTestId("status-waiting")).toBeVisible();

  // Reviewer approves out of band.
  await approvePending(request, name);

  const authed = page.getByTestId("status-authenticated");
  await expect(authed).toBeVisible({ timeout: 30_000 });
  await expect(authed).toContainText(name);
  // age ~36 satisfies both thresholds.
  await expect(page.getByTestId("constraint-age_gte_18")).toBeVisible();
  await expect(page.getByTestId("constraint-age_gte_21")).toBeVisible();

  // Cheap repeat: re-authenticate with the passkey only (no photo, no AA call).
  await page.reload();
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-authenticated")).toBeVisible();
  await expect(page.getByTestId("status-authenticated")).toContainText(name);
});
