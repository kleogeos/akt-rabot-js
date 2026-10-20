#!/usr/bin/env node
"use strict";

const fs = require("fs");

const DISCLAIMER =
  "Единой законодательно закреплённой формы акта выполненных работ не " +
  "существует — это общий шаблон для фиксации факта оказания услуг между " +
  "исполнителем и заказчиком. Для крупных или спорных сделок проверьте " +
  "формулировки с юристом или бухгалтером.";

// Matches Python's html.escape(str(s), quote=True): & first, then <, >, ", '.
function esc(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Correctly-rounded cents (ties-to-even) from the exact binary value of a
// double -- same fix as freelance-tax-js's round2(), needed because a naive
// *100 + Math.round can itself manufacture a spurious tie that Python's
// f"{v:,.2f}" (which rounds from the true binary value) would not see.
function moneyCents(n) {
  if (n === 0) return 0n;
  const neg = n < 0;
  const ax = Math.abs(n);
  const s = ax.toFixed(20);
  const [intPart, fracPart] = s.split(".");
  const keep = fracPart.slice(0, 2);
  const rest = fracPart.slice(2);
  let roundUp;
  if (rest[0] > "5") roundUp = true;
  else if (rest[0] < "5") roundUp = false;
  else {
    const restAfter = rest.slice(1).replace(/0+$/, "");
    if (restAfter.length > 0) roundUp = true;
    else roundUp = parseInt(keep[1] || "0", 10) % 2 === 1;
  }
  let keepNum = BigInt(intPart + keep.padEnd(2, "0"));
  if (roundUp) keepNum += 1n;
  return neg ? -keepNum : keepNum;
}

// Mirrors Python's f"{v:,.2f}".replace(",", " ").replace(".", ",")
function fmtMoney(n) {
  let cents = moneyCents(n);
  const neg = cents < 0n;
  if (neg) cents = -cents;
  const whole = cents / 100n;
  const frac = cents % 100n;
  const wholeStr = whole.toString();
  let grouped = "";
  for (let i = 0; i < wholeStr.length; i++) {
    if (i > 0 && (wholeStr.length - i) % 3 === 0) grouped += " ";
    grouped += wholeStr[i];
  }
  return (neg ? "-" : "") + grouped + "," + frac.toString().padStart(2, "0");
}

function render(data) {
  const executor = data.executor;
  const client = data.client;
  const actNum = data.act_num !== undefined ? data.act_num : "1";
  const date = data.date;
  const city = data.city !== undefined ? data.city : "";
  const contract = data.contract !== undefined ? data.contract : "";
  const items = data.items;

  const rowsHtml = [];
  let total = 0.0;
  items.forEach((item, idx) => {
    const i = idx + 1;
    const qty = item.qty !== undefined ? item.qty : 1;
    const price = item.price;
    const amount = qty * price;
    total += amount;
    rowsHtml.push(
      `<tr><td>${i}</td><td>${esc(item.name)}</td><td>${esc(qty)}</td>` +
        `<td>${fmtMoney(price)}</td><td>${fmtMoney(amount)}</td></tr>`
    );
  });
  const rows = rowsHtml.join("\n");

  const contractLine = contract ? `<p>К договору ${esc(contract)}</p>` : "";
  const cityDate = `${esc(city)}` + (city ? ", " : "") + `${esc(date)}`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Акт выполненных работ № ${esc(actNum)}</title>
<style>
body{font-family:-apple-system,Arial,sans-serif;max-width:760px;margin:40px auto;color:#1a1a1a;line-height:1.5}
h1{font-size:20px;text-align:center}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border:1px solid #999;padding:6px 8px;font-size:14px;text-align:left}
th{background:#f4f4f4}
.total{text-align:right;font-weight:bold;margin-top:10px}
.meta{display:flex;justify-content:space-between;color:#333;margin-top:8px}
.disclaimer{background:#fff8e6;border:1px solid #f0d58c;border-radius:6px;padding:12px 16px;font-size:13px;color:#664d03;margin-top:28px}
.sig{margin-top:40px;display:flex;gap:40px}
.sig div{flex:1;border-top:1px solid #999;padding-top:6px;font-size:13px;color:#666}
@media print{body{margin:0} .disclaimer{background:none}}
</style></head><body>
<h1>Акт № ${esc(actNum)} выполненных работ (оказанных услуг)</h1>
<p class="meta"><span>${cityDate}</span></p>
${contractLine}
<p><b>Исполнитель:</b> ${esc(executor)}</p>
<p><b>Заказчик:</b> ${esc(client)}</p>

<table>
<thead><tr><th>№</th><th>Наименование работ (услуг)</th><th>Кол-во</th><th>Цена, ₽</th><th>Сумма, ₽</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p class="total">Итого: ${fmtMoney(total)} ₽</p>

<p>Исполнитель выполнил работы (оказал услуги) в полном объёме, в срок и с надлежащим
качеством. Заказчик принял результат работ (услуг) и не имеет претензий по объёму,
качеству и срокам выполнения работ (оказания услуг).</p>

<div class="sig">
<div>Исполнитель: ____________<br>${esc(executor)}</div>
<div>Заказчик: ____________<br>${esc(client)}</div>
</div>

<p class="disclaimer">${esc(DISCLAIMER)}</p>
</body></html>`;
}

function printHelp() {
  console.log(`akt-rabot-js - generate a Russian "Акт выполненных работ" (HTML) from a JSON file

Usage:
  akt-rabot <input.json> [-o output.html]

Run without installing:
  npx github:kleogeos/akt-rabot-js example.json -o akt.html
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    process.exit(argv.length ? 0 : 1);
  }

  let input = null;
  let output = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--output") output = argv[++i];
    else if (!input) input = a;
  }

  if (!input) {
    printHelp();
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(input, "utf8"));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }

  for (const required of ["executor", "client", "date", "items"]) {
    if (!(required in data)) {
      console.error(`error: missing required field '${required}'`);
      process.exit(1);
    }
  }
  if (!data.items || !data.items.length) {
    console.error("error: 'items' must have at least one entry");
    process.exit(1);
  }

  const out = render(data);
  if (output) {
    fs.writeFileSync(output, out);
    console.error(`wrote ${output}`);
  } else {
    console.log(out);
  }
}

module.exports = { render, esc, fmtMoney };

if (require.main === module) {
  main();
}
