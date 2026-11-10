// Builds assets/contrib.svg: the last year's contribution calendar drawn as a
// sea in the terminal style of neofetch.svg. Needs GITHUB_TOKEN (read only).
import { writeFileSync } from "node:fs";

const LOGIN = process.env.PROFILE_LOGIN || "nicky2pc";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");
const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
  totalContributions weeks { contributionDays { date contributionCount weekday } } } } } }`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "nicky2pc-profile" },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
if (!res.ok) throw new Error(`GraphQL answered ${res.status}`);
const body = await res.json();
if (body.errors) throw new Error(JSON.stringify(body.errors));
const cal = body.data.user.contributionsCollection.contributionCalendar;

// Four levels on a log scale up to the busiest day: a few busy days do not
// flatten the rest, and a day with one contribution still shows.
const max = Math.max(1, ...cal.weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)));
const level = (c) => (c === 0 ? 0 : Math.min(4, 1 + Math.floor((4 * Math.log(c)) / Math.log(max + 1))));
const GLYPH = ["·", "-", "~", "≈", "#"];

const W = 820, PX = 42, PITCH_X = 14, PITCH_Y = 15, TOP = 66, T = 6;
const H = TOP + 6 * PITCH_Y + 50;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let months = "", lastLabel = -9;
const cols = cal.weeks.map((w, c) => {
  const x = PX + c * PITCH_X;
  const first = w.contributionDays.find((d) => d.date.endsWith("-01")) ?? (c === 0 ? w.contributionDays[0] : undefined);
  if (first && c - lastLabel >= 3) {
    months += `<text x="${x}" y="${TOP - 18}" class="m">${MONTHS[+first.date.slice(5, 7) - 1]}</text>`;
    lastLabel = c;
  }
  const cells = w.contributionDays
    .map((d) => `<text x="${x}" y="${TOP + d.weekday * PITCH_Y}" class="c${level(d.contributionCount)}">${GLYPH[level(d.contributionCount)]}</text>`)
    .join("");
  return `<g class="w" style="animation-delay:${(-T + (c / cal.weeks.length) * T).toFixed(3)}s">${cells}</g>`;
}).join("\n");

const legendX = W - 39 - 11 * 8.43;
const legend = `<text x="${(legendX - 5 * 8.43).toFixed(1)}" y="${H - 22}" class="m">less </text>` +
  GLYPH.map((g, i) => `<text x="${(legendX + i * 14).toFixed(1)}" y="${H - 22}" class="c${i}">${esc(g)}</text>`).join("") +
  `<text x="${(legendX + 5 * 14 + 4).toFixed(1)}" y="${H - 22}" class="m">more</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${cal.totalContributions} contributions in the last year">
<title>${cal.totalContributions} contributions in the last year</title>
<style>
text { font: 13px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace; white-space: pre; }
.k { fill: #1793d1; font-weight: 700 } .v { fill: #c9d1d9 } .m { fill: #8b949e }
.c0 { fill: #23313e } .c1 { fill: #1f4e79 } .c2 { fill: #2f81f7 } .c3 { fill: #79c0ff } .c4 { fill: #f0f6fc; font-weight: 700 }
.w { animation: swell ${T}s ease-in-out infinite; }
@keyframes swell { 0%, 100% { opacity: .55 } 50% { opacity: 1 } }
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="#0d1117" stroke="#30363d"/>
<text x="22" y="26"><tspan class="k">Contributions:</tspan><tspan class="v"> ${cal.totalContributions} in the last year</tspan></text>
${months}
${cols}
${legend}
</svg>
`;
writeFileSync("assets/contrib.svg", svg);
console.log(`assets/contrib.svg: ${cal.totalContributions} contributions, ${cal.weeks.length} weeks, busiest day ${max}`);
