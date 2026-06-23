import { describe, expect, it } from "vitest";
import { makeFakeIdSvg, fakeIdDataUrl, ADULT_SPECIMEN_OPTS } from "./fake-id";

describe("fake specimen ID generator", () => {
  it("renders the claimed name, DOB, and unmistakable fake markers", () => {
    const svg = makeFakeIdSvg({ name: "AVA ADULTSON", dob: "1995-03-14" });
    expect(svg).toContain("AVA ADULTSON");
    expect(svg).toContain("1995-03-14");
    expect(svg).toContain("SPECIMEN");
    expect(svg).toContain("NOT A VALID IDENTITY DOCUMENT");
  });

  it("escapes markup-significant characters in the name", () => {
    const svg = makeFakeIdSvg({ name: "<script>", dob: "2000-01-01" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&#60;script&#62;");
  });

  it("produces a base64 SVG data URL that decodes back to the SVG", () => {
    const url = fakeIdDataUrl(ADULT_SPECIMEN_OPTS);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const b64 = url.split(",")[1];
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    expect(decoded).toContain("AVA ADULTSON");
    expect(decoded).toContain("SPECIMEN");
  });
});
