const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { render, esc, fmtMoney } = require("./index.js");

// Values cross-checked byte-for-byte against the Python implementation
// (kleogeos/akt-rabot-cli, akt.py fmt_money) including round-half-to-even
// tie cases on the exact binary value (same class of bug found and fixed
// in freelance-tax-js's round2()).
assert.strictEqual(fmtMoney(45000), "45 000,00");
assert.strictEqual(fmtMoney(1000), "1 000,00");
assert.strictEqual(fmtMoney(0), "0,00");
assert.strictEqual(fmtMoney(4238.865), "4 238,86"); // true binary value < .5, rounds down
assert.strictEqual(fmtMoney(2.675), "2,67"); // true binary value < .5, rounds down
assert.strictEqual(fmtMoney(1234567.5), "1 234 567,50");

assert.strictEqual(esc("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
assert.strictEqual(esc("O'Brien & \"Co\""), "O&#x27;Brien &amp; &quot;Co&quot;");

const html = render({
  executor: "Иванов Иван Иванович",
  client: "ООО «Ромашка»",
  date: "15.10.2026",
  items: [{ name: "Консультация", qty: 1, price: 1000 }],
});
assert.ok(html.includes("Иванов Иван Иванович"));
assert.ok(html.includes("1 000,00"));

const html2 = render({
  executor: "A",
  client: "B",
  date: "15.10.2026",
  items: [
    { name: "Работа 1", qty: 2, price: 500 },
    { name: "Работа 2", qty: 1, price: 1000 },
  ],
});
assert.ok(html2.includes("2 000,00")); // итого

// output-file round trip via the CLI entrypoint
const tmpIn = path.join(os.tmpdir(), `akt-test-${process.pid}.json`);
const tmpOut = path.join(os.tmpdir(), `akt-test-${process.pid}.html`);
fs.writeFileSync(
  tmpIn,
  JSON.stringify({ executor: "A", client: "B", date: "15.10.2026", items: [{ name: "x", price: 1 }] })
);
try {
  const { execFileSync } = require("child_process");
  execFileSync(process.execPath, [path.join(__dirname, "index.js"), tmpIn, "-o", tmpOut]);
  const written = fs.readFileSync(tmpOut, "utf8");
  assert.ok(written.includes("Акт"));
} finally {
  fs.unlinkSync(tmpIn);
  if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
}

console.log("All tests passed.");
