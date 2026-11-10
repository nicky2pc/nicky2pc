// Builds assets/heartbit.svg from the last year's contributions: an ECG strip
// (one heartbeat per week, the R wave as high as the week's commits on a log
// scale, a flat line for a quiet week) over an xxd dump where every byte is
// one day's count. Needs GITHUB_TOKEN (read only).
import { writeFileSync } from "node:fs";

const LOGIN = process.env.PROFILE_LOGIN || "nicky2pc";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");
const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
  weeks { contributionDays { contributionCount } } } } } }`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "nicky2pc-profile" },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
if (!res.ok) throw new Error(`GraphQL answered ${res.status}`);
const body = await res.json();
if (body.errors) throw new Error(JSON.stringify(body.errors));
const weeksRaw = body.data.user.contributionsCollection.contributionCalendar.weeks;
const days = weeksRaw.flatMap((w) => w.contributionDays.map((d) => d.contributionCount));
const weeks = weeksRaw.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));
const maxWeek = Math.max(1, ...weeks);
const log = (v) => Math.log10(1 + v) / Math.log10(1 + maxWeek);

// ---- ECG on a braille canvas: COLS x ROWS cells, 2 x 4 dots each ----
const COLS = 84, ROWS = 6, DW = COLS * 2, DH = ROWS * 4, BASE = DH - 7;
const dots = Array.from({ length: DH }, () => new Array(DW).fill(false));
const plot = (x, y) => {
  const i = Math.round(y), j = Math.round(x);
  if (i >= 0 && i < DH && j >= 0 && j < DW) dots[i][j] = true;
};
let px = 0, py = BASE;
const to = (x, y) => {
  const n = Math.max(Math.abs(x - px), Math.abs(y - py), 1) * 2;
  for (let k = 0; k <= n; k++) plot(px + ((x - px) * k) / n, py + ((y - py) * k) / n);
  px = x;
  py = y;
};
const step = DW / weeks.length;
weeks.forEach((v, i) => {
  const x = i * step, a = log(v) * (BASE - 1);
  if (v === 0) return to(x + step, BASE);
  to(x + step * 0.15, BASE); to(x + step * 0.22, BASE - a * 0.12); to(x + step * 0.3, BASE);
  to(x + step * 0.38, BASE + 2); to(x + step * 0.45, BASE - a); to(x + step * 0.52, BASE + 4);
  to(x + step * 0.6, BASE); to(x + step * 0.75, BASE - a * 0.2); to(x + step * 0.9, BASE); to(x + step, BASE);
});
const LEFT = [0x01, 0x02, 0x04, 0x40], RIGHT = [0x08, 0x10, 0x20, 0x80];
const ecg = [];
for (let r = 0; r < ROWS; r++) {
  let s = "";
  for (let c = 0; c < COLS; c++) {
    let b = 0;
    for (let k = 0; k < 4; k++) {
      if (dots[r * 4 + k][c * 2]) b |= LEFT[k];
      if (dots[r * 4 + k][c * 2 + 1]) b |= RIGHT[k];
    }
    s += String.fromCharCode(0x2800 + b);
  }
  ecg.push(s);
}

// ---- xxd: one byte per day, the last rows of the dump, offsets as xxd prints them ----
const bytes = days.map((c) => Math.min(255, c));
const lastRow = Math.floor((bytes.length - 1) / 16), firstRow = Math.max(0, lastRow - 5);
const byteClass = (b) => (b === 0 ? "z" : b < 4 ? "b1" : b < 16 ? "b2" : b < 64 ? "b3" : "b4");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const W = 820, X0 = 30, CW = 8.43;
const ECG_Y = 52, ECG_LH = 17, ECG_W = COLS * CW;
const DUMP_Y = ECG_Y + ROWS * ECG_LH + 26, DUMP_LH = 19;
const H = DUMP_Y + (lastRow - firstRow + 1) * DUMP_LH + 14;

const dump = [];
for (let row = firstRow; row <= lastRow; row++) {
  const chunk = bytes.slice(row * 16, row * 16 + 16), y = DUMP_Y + (row - firstRow) * DUMP_LH;
  let hex = "";
  chunk.forEach((b, i) => {
    hex += `<tspan class="${byteClass(b)}">${b.toString(16).padStart(2, "0")}</tspan>` + (i % 2 === 1 && i < 15 ? " " : "");
  });
  const width = chunk.length * 2 + Math.floor((chunk.length - 1) / 2);
  const ascii = chunk
    .map((b) => (b >= 32 && b < 127 ? `<tspan class="a">${esc(String.fromCharCode(b))}</tspan>` : `<tspan class="z">.</tspan>`))
    .join("");
  const offset = (row * 16).toString(16).padStart(8, "0");
  dump.push(`<text x="${X0}" y="${y}"><tspan class="o">${offset}:</tspan> ${hex}${" ".repeat(Math.max(0, 39 - width))}  ${ascii}</text>`);
}

const T = 6; // one sweep of the trace, in seconds
const rows = (cls) =>
  ecg
    .map((l, r) => `<text x="${X0}" y="${ECG_Y + (r + 1) * ECG_LH - 4}" class="g ${cls}" textLength="${ECG_W.toFixed(1)}" lengthAdjust="spacingAndGlyphs">${l}</text>`)
    .join("\n");
const end = (X0 + ECG_W).toFixed(1);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:space="preserve" role="img" aria-label="heartbit">
<title>heartbit</title>
<style>
text { font: 13px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace; white-space: pre; }
.g { font-size: 15px }
.old { fill: #1f4e79 } .new { fill: #79c0ff }
.k { fill: #1793d1; font-weight: 700 }
.heart { fill: #ff7b72; animation: beat 1.2s ease-out infinite }
@keyframes beat { 0% { opacity: 1 } 12% { opacity: .25 } 22% { opacity: 1 } 40% { opacity: .2 } 100% { opacity: .2 } }
.o { fill: #6e7681 } .z { fill: #30363d } .a { fill: #f0f6fc; font-weight: 700 }
.b1 { fill: #1f6feb } .b2 { fill: #388bfd } .b3 { fill: #79c0ff } .b4 { fill: #f0f6fc; font-weight: 700 }
</style>
<defs><clipPath id="sweep"><rect x="${X0}" y="${ECG_Y - 4}" height="${ROWS * ECG_LH + 8}" width="0"><animate attributeName="width" values="0;${ECG_W.toFixed(1)};${ECG_W.toFixed(1)}" keyTimes="0;0.85;1" dur="${T}s" repeatCount="indefinite"/></rect></clipPath></defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="#0d1117" stroke="#30363d"/>
<text x="${X0}" y="30"><tspan class="heart">♥</tspan><tspan class="k"> heartbit</tspan></text>
${rows("old")}
<g clip-path="url(#sweep)">
${rows("new")}
</g>
<rect y="${ECG_Y - 2}" width="3" height="${ROWS * ECG_LH + 4}" fill="#f0f6fc" opacity=".85"><animate attributeName="x" values="${X0};${end};${end}" keyTimes="0;0.85;1" dur="${T}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".85;.85;0" keyTimes="0;0.85;0.86" dur="${T}s" repeatCount="indefinite"/></rect>
${dump.join("\n")}
</svg>
`;
writeFileSync("assets/heartbit.svg", svg);
console.log(`assets/heartbit.svg: ${weeks.length} weeks, busiest week ${maxWeek}, ${days.length} days`);
