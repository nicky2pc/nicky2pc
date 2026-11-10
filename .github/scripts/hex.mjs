// Builds assets/hex.svg: the last rows of an xxd dump of the last year, one
// byte per day, the byte being that day's contributions. Busy days land in
// printable ASCII. Today's byte, still counting, breathes.
// Needs GITHUB_TOKEN (read only).
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
const bytes = body.data.user.contributionsCollection.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays.map((d) => Math.min(255, d.contributionCount)));

const ROWS = 6, lastRow = Math.floor((bytes.length - 1) / 16), firstRow = Math.max(0, lastRow - ROWS + 1);
const today = bytes.length - 1;
const cls = (b) => (b === 0 ? "z" : b < 4 ? "b1" : b < 16 ? "b2" : b < 64 ? "b3" : "b4");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const W = 820, CW = 8.43, LH = 20, PY = 26;
const X0 = Math.round((W - 67 * CW) / 2); // xxd -c 16: 67 columns wide
const H = PY * 2 + (lastRow - firstRow) * LH + 14;

const lines = [];
for (let row = firstRow; row <= lastRow; row++) {
  const chunk = bytes.slice(row * 16, row * 16 + 16);
  const now = (i) => (row * 16 + i === today ? " now" : "");
  let hex = "";
  chunk.forEach((b, i) => {
    hex += `<tspan class="${cls(b)}${now(i)}">${b.toString(16).padStart(2, "0")}</tspan>` + (i % 2 === 1 && i < 15 ? " " : "");
  });
  const width = chunk.length * 2 + Math.floor((chunk.length - 1) / 2);
  const ascii = chunk
    .map((b, i) => (b >= 32 && b < 127 ? `<tspan class="a${now(i)}">${esc(String.fromCharCode(b))}</tspan>` : `<tspan class="z${now(i)}">.</tspan>`))
    .join("");
  const y = PY + 14 + (row - firstRow) * LH;
  lines.push(`<text x="${X0}" y="${y}"><tspan class="o">${(row * 16).toString(16).padStart(8, "0")}:</tspan> ${hex}${" ".repeat(Math.max(0, 39 - width))}  ${ascii}</text>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:space="preserve" role="img" aria-label="xxd">
<title>xxd</title>
<style>
text { font: 13px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace; white-space: pre; }
.o { fill: #6e7681 } .z { fill: #30363d } .a { fill: #f0f6fc; font-weight: 700 }
.b1 { fill: #1f6feb } .b2 { fill: #388bfd } .b3 { fill: #79c0ff } .b4 { fill: #f0f6fc; font-weight: 700 }
.now { animation: breathe 2.4s ease-in-out infinite }
@keyframes breathe { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="#0d1117" stroke="#30363d"/>
${lines.join("\n")}
</svg>
`;
writeFileSync("assets/hex.svg", svg);
console.log(`assets/hex.svg: rows ${firstRow}-${lastRow}, today = ${bytes[today]}`);
