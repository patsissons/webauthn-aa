import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { AA_URL, approvePendingByName } from "./support/aa";
import {
  ADULT_SPECIMEN_OPTS,
  ADULT_SPECIMEN_DATA_URL,
  MINOR_SPECIMEN_DATA_URL,
  fakeIdDataUrl,
  makeFakeIdSvg,
} from "./support/fake-id";

// --- Pure fixture generator (no running stack required) -------------------

test.describe("fake-id fixture generator", () => {
  test("renders an unmistakably-fake specimen card", () => {
    const svg = makeFakeIdSvg(ADULT_SPECIMEN_OPTS);
    expect(svg.startsWith("<svg")).toBeTruthy();
    // The markers that make it obviously not a real ID.
    expect(svg).toContain("SPECIMEN");
    expect(svg).toContain("NOT A VALID IDENTITY DOCUMENT");
    expect(svg).toContain("DEMO DMV");
    // The reviewer-readable fields.
    expect(svg).toContain(ADULT_SPECIMEN_OPTS.name);
    expect(svg).toContain(ADULT_SPECIMEN_OPTS.dob);
  });

  test("escapes injected field content", () => {
    const svg = makeFakeIdSvg({ name: '<script>"x"</script>', dob: "2000-01-01" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&#60;script&#62;");
  });

  test("encodes a decodable svg data URL", () => {
    const url = fakeIdDataUrl(ADULT_SPECIMEN_OPTS);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBeTruthy();
    const decoded = Buffer.from(url.split(",")[1], "base64").toString("utf8");
    expect(decoded).toBe(makeFakeIdSvg(ADULT_SPECIMEN_OPTS));
  });

  test("adult and minor specimens differ deterministically", () => {
    expect(ADULT_SPECIMEN_DATA_URL).not.toBe(MINOR_SPECIMEN_DATA_URL);
    // Same inputs → byte-identical output (safe to snapshot / commit).
    expect(fakeIdDataUrl(ADULT_SPECIMEN_OPTS)).toBe(ADULT_SPECIMEN_DATA_URL);
  });
});

// --- End-to-end: the specimen is what the reviewer actually sees ----------

function bufferFromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function submitSpecimen(
  page: Page,
  opts: { name: string; birthDate: string; dataUrl: string },
) {
  await page.goto("/");
  // Evidence is captured in the AA-origin popup, not on the RP page.
  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("start-capture").click();
  const popup = await popupPromise;
  await popup.getByTestId("claimed-name").fill(opts.name);
  await popup.getByTestId("birth-date").fill(opts.birthDate);
  await popup.getByTestId("photo").setInputFiles({
    name: "id.svg",
    mimeType: "image/svg+xml",
    buffer: bufferFromDataUrl(opts.dataUrl),
  });
  await popup.getByTestId("submit-evidence").click();
  await expect(page.getByTestId("status-waiting")).toBeVisible();
}

async function fetchEvidence(request: APIRequestContext, claimedName: string) {
  for (let i = 0; i < 30; i++) {
    const list = await (await request.get(`${AA_URL}/api/review/list?status=pending`)).json();
    const match = (list.requests ?? []).find(
      (r: { claimedName: string }) => r.claimedName === claimedName,
    );
    if (match) {
      const res = await request.get(`${AA_URL}/api/review/${match.id}/evidence`);
      expect(res.ok()).toBeTruthy();
      return res;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`pending request for ${claimedName} never appeared`);
}

test("adult specimen flows through evidence → reviewer → approved", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Ava Adultson ${Date.now()}`;
  await submitSpecimen(page, {
    name,
    birthDate: ADULT_SPECIMEN_OPTS.dob,
    dataUrl: ADULT_SPECIMEN_DATA_URL,
  });

  // The reviewer fetches the decrypted evidence — it must be the specimen card.
  const evidence = await fetchEvidence(request, name);
  expect(evidence.headers()["content-type"]).toContain("image/svg+xml");
  expect(await evidence.text()).toContain("SPECIMEN");

  await approvePendingByName(request, name);
  const authed = page.getByTestId("status-authenticated");
  await expect(authed).toBeVisible({ timeout: 30_000 });
  await expect(authed).toContainText(name);
});
