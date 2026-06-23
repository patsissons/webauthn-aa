// Browser-safe "specimen ID" generator for the demo. Mirrors the SVG produced
// by the e2e fixture in e2e/support/fake-id.ts, but encodes the data URL with
// WebCrypto-era browser APIs (TextEncoder + btoa) instead of Node's Buffer.
//
// These are deliberately, unmistakably fake: a SPECIMEN watermark, a fictional
// issuer, a silhouette (no real face), and a "NOT A VALID IDENTITY DOCUMENT"
// footer. They exist only as demo evidence — never to represent a real person.

export interface FakeIdOptions {
  /** Fictional name printed on the card. */
  name: string;
  /** Date of birth as YYYY-MM-DD — drives the age the reviewer reads. */
  dob: string;
  /** Fictional document number (defaults to an obviously bogus value). */
  docNumber?: string;
  /** Issuer line (defaults to the fictional "DEMO DMV"). */
  issuer?: string;
}

function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Render an obviously-fake specimen ID card as an SVG string. */
export function makeFakeIdSvg(opts: FakeIdOptions): string {
  const issuer = opts.issuer ?? "DEMO DMV — STATE OF TESTLANDIA";
  const docNumber = opts.docNumber ?? "SPEC-0000-0000";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" role="img" aria-label="Specimen identification card — not a valid ID">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8eef6"/>
      <stop offset="1" stop-color="#cdd9ea"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="632" height="392" rx="20" fill="url(#bg)" stroke="#7c8aa0" stroke-width="3"/>
  <rect x="24" y="24" width="592" height="48" rx="8" fill="#274060"/>
  <text x="40" y="56" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${esc(issuer)}</text>
  <!-- silhouette portrait, deliberately not a real face -->
  <rect x="40" y="96" width="160" height="200" rx="10" fill="#ffffff" stroke="#7c8aa0" stroke-width="2"/>
  <circle cx="120" cy="170" r="42" fill="#b7c2d4"/>
  <path d="M64 286 q56 -86 112 0 z" fill="#b7c2d4"/>
  <g font-family="Arial, sans-serif" fill="#1b2838">
    <text x="224" y="120" font-size="14" fill="#5b6b82">NAME</text>
    <text x="224" y="146" font-size="26" font-weight="700">${esc(opts.name)}</text>
    <text x="224" y="190" font-size="14" fill="#5b6b82">DATE OF BIRTH</text>
    <text x="224" y="216" font-size="24" font-weight="700">${esc(opts.dob)}</text>
    <text x="224" y="260" font-size="14" fill="#5b6b82">DOCUMENT NO.</text>
    <text x="224" y="286" font-size="22" font-weight="700">${esc(docNumber)}</text>
  </g>
  <!-- unmistakable fake markers -->
  <text x="320" y="230" font-family="Arial, sans-serif" font-size="84" font-weight="800" fill="#d32f2f" fill-opacity="0.28" text-anchor="middle" transform="rotate(-22 320 200)">SPECIMEN</text>
  <text x="320" y="372" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#d32f2f" text-anchor="middle">NOT A VALID IDENTITY DOCUMENT — TEST FIXTURE ONLY</text>
</svg>`;
}

/** Encode a fake ID card as a base64 SVG data URL (UTF-8 safe in the browser). */
export function fakeIdDataUrl(opts: FakeIdOptions): string {
  const svg = makeFakeIdSvg(opts);
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

// Ready-made specimens, both far from the 18-year boundary so the reviewer's
// pass / fail decision is never ambiguous.
export const ADULT_SPECIMEN_OPTS: FakeIdOptions = {
  name: "AVA ADULTSON",
  dob: "1995-03-14",
  docNumber: "SPEC-1995-0314",
};

export const MINOR_SPECIMEN_OPTS: FakeIdOptions = {
  name: "MILO MINORSON",
  dob: "2012-08-09",
  docNumber: "SPEC-2012-0809",
};
