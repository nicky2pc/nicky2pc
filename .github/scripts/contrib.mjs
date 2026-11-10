// Builds assets/contrib.svg: the last year's contributions as a btop-style
// braille area chart on a log scale, in the sea colours of neofetch.svg.
// Needs GITHUB_TOKEN (read only).
import { writeFileSync } from "node:fs";

const LOGIN = process.env.PROFILE_LOGIN || "nicky2pc";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");
const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
  totalContributions weeks { contributionDays { date contributionCount } } } } } }`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "nicky2pc-profile" },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
if (!res.ok) throw new Error(`GraphQL answered ${res.status}`);
const body = await res.json();
if (body.errors) throw new Error(JSON.stringify(body.errors));
const cal = body.data.user.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) => w.contributionDays);

// The chart: COLS braille cells wide (2 dots each), ROWS cells high (4 dots each).
const COLS = 84, ROWS = 8, DX = COLS * 2, DY = ROWS * 4;
// Contributions in the 7 days up to each day, then one value per dot column.
const week = days.map((_, i) => days.slice(Math.max(0, i - 6), i + 1).reduce((s, d) => s + d.contributionCount, 0));
const at = (x) => {
  const f = (x / (DX - 1)) * (week.length - 1), i = Math.floor(f), t = f - i;
  return week[i] * (1 - t) + (week[Math.min(i + 1, week.length - 1)] ?? 0) * t;
};
const top = Math.max(1, ...week);
const scale = (v) => Math.log10(1 + v) / Math.log10(1 + top); // 0..1
const heights = Array.from({ length: DX }, (_, x) => Math.round(scale(at(x)) * DY));

// Braille: left column dots 1,2,3,7 and right column 4,5,6,8, top to bottom.
const LEFT = [0x01, 0x02, 0x04, 0x40], RIGHT = [0x08, 0x10, 0x20, 0x80];
const rows = [];
for (let r = 0; r < ROWS; r++) {
  let line = "";
  for (let c = 0; c < COLS; c++) {
    let bits = 0;
    for (let k = 0; k < 4; k++) {
      const dotFromBottom = (ROWS - 1 - r) * 4 + (3 - k); // 0 = lowest dot
      if (heights[2 * c] > dotFromBottom) bits |= LEFT[k];
      if (heights[2 * c + 1] > dotFromBottom) bits |= RIGHT[k];
    }
    line += String.fromCharCode(0x2800 + bits);
  }
  rows.push(line);
}

const W = 820, CW = 8.43, LH = 17, X0 = 64, Y0 = 46;
const CHART_W = COLS * CW;
const H = Y0 + ROWS * LH + 44;
const SEA = ["#f0f6fc", "#a5d6ff", "#79c0ff", "#58a6ff", "#388bfd", "#2f81f7", "#1f6feb", "#1f4e79"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const chart = rows
  .map((l, r) => `<text x="${X0}" y="${Y0 + (r + 1) * LH - 4}" class="g" fill="${SEA[r]}" textLength="${CHART_W.toFixed(1)}" lengthAdjust="spacingAndGlyphs">${l}</text>`)
  .join("\n");
// Log ticks: where 1, 10, 100... sit on the chart.
const ticks = [1, 10, 100, 1000].filter((v) => v <= top).map((v) => {
  const y = Y0 + ROWS * LH - scale(v) * ROWS * LH;
  return `<text x="${X0 - 10}" y="${(y + 4).toFixed(1)}" class="m" text-anchor="end">${v}</text>`;
}).join("");
// Month labels under the chart, at the first day of each month.
let months = "", last = -40;
days.forEach((d, i) => {
  if (!d.date.endsWith("-01")) return;
  const x = X0 + (i / (days.length - 1)) * CHART_W;
  if (x - last < 40) return;
  months += `<text x="${x.toFixed(1)}" y="${Y0 + ROWS * LH + 18}" class="m">${MONTHS[+d.date.slice(5, 7) - 1]}</text>`;
  last = x;
});
const cursorX = X0 + CHART_W + 3;
const title = "contributions";
const right = `${cal.totalContributions}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="contributions: ${cal.totalContributions}">
<title>contributions: ${cal.totalContributions}</title>
<style>
text { font: 13px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace; white-space: pre; }
.g { font-size: 15px }
.k { fill: #1793d1; font-weight: 700 } .v { fill: #c9d1d9 } .m { fill: #8b949e }
.cur { fill: #f0f6fc; animation: blink 1.1s steps(1, end) infinite }
@keyframes blink { 0% { opacity: 1 } 50% { opacity: 0 } 100% { opacity: 0 } }
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="#0d1117" stroke="#30363d"/>
<rect x="14.5" y="20.5" width="${W - 29}" height="${H - 35}" rx="6" fill="none" stroke="#30363d"/>
<rect x="28" y="12" width="${(title.length + 2) * CW}" height="18" fill="#0d1117"/>
<text x="${28 + CW}" y="25" class="k">${title}</text>
<rect x="${(W - 28 - (right.length + 2) * CW).toFixed(1)}" y="12" width="${((right.length + 2) * CW).toFixed(1)}" height="18" fill="#0d1117"/>
<text x="${(W - 28 - (right.length + 1) * CW).toFixed(1)}" y="25" class="v">${esc(right)}</text>
${ticks}
${chart}
<text x="${cursorX.toFixed(1)}" y="${Y0 + ROWS * LH - 4 - (heights[DX - 1] > 0 ? 0 : 0)}" class="cur">█</text>
${months}
</svg>
`;
writeFileSync("assets/contrib.svg", svg);
console.log(`assets/contrib.svg: ${cal.totalContributions} contributions, peak ${top} a week`);
console.log(rows.join("\n"));
