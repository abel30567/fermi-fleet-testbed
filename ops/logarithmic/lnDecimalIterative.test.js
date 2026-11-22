import test from "node:test";
import assert from "node:assert/strict";
import { lnDecimalIterative } from "./lnDecimalIterative.js";

// Reference constants verified to 50+ decimal places
const LN_2_50 = "0.69314718055994530941723212145817656807550013436026";
const LN_2_40 = "0.6931471805599453094172321214581765680755";
const LN_2_20 = "0.69314718055994530942";

const LN_10_50 = "2.30258509299404568401799145468436420760110148862877";
const LN_10_40 = "2.3025850929940456840179914546843642076011";
const LN_10_20 = "2.30258509299404568402";

const E_50 = "2.71828182845904523536028747135266249775724709369995";

/**
 * Parses a fixed-point decimal string with `precision` fractional digits into a
 * scaled BigInt for exact high-precision comparisons in cross-check tests.
 */
function parseFixedToBigInt(str, precision) {
  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const parts = unsigned.split(".");
  const intPart = parts[0];
  const fracPart = (parts[1] ?? "").padEnd(precision, "0");
  assert.equal(fracPart.length, precision);
  const raw = BigInt(intPart + fracPart);
  return negative ? -raw : raw;
}

test("lnDecimalIterative: normal cases and default precision", () => {
  assert.equal(lnDecimalIterative("1"), "0.00000000000000000000");
  assert.equal(lnDecimalIterative("1.00000"), "0.00000000000000000000");
  assert.equal(lnDecimalIterative("100e-2"), "0.00000000000000000000");
  assert.equal(lnDecimalIterative("2"), LN_2_20);
  assert.equal(lnDecimalIterative("10"), LN_10_20);
  assert.equal(lnDecimalIterative("0.001"), "-6.90775527898213705205");
  assert.equal(lnDecimalIterative("0.5"), `-${LN_2_20}`);
  assert.equal(lnDecimalIterative("  +2.0  "), LN_2_20);
  assert.equal(lnDecimalIterative(".5"), `-${LN_2_20}`);
  assert.equal(lnDecimalIterative("2."), LN_2_20);
});

test("lnDecimalIterative: high precision (40 and 50+ digits) against known references", () => {
  assert.equal(lnDecimalIterative("2", 40), LN_2_40);
  assert.equal(lnDecimalIterative("2", 50), LN_2_50);
  assert.equal(lnDecimalIterative("10", 40), LN_10_40);
  assert.equal(lnDecimalIterative("10", 50), LN_10_50);
  assert.equal(
    lnDecimalIterative(E_50, 45),
    `1.${"0".repeat(45)}`
  );
  assert.equal(
    lnDecimalIterative("0.001", 40),
    "-6.9077552789821370520539743640530926228033"
  );
});

test("lnDecimalIterative: precision = 0 and small precisions", () => {
  assert.equal(lnDecimalIterative("1", 0), "0");
  assert.equal(lnDecimalIterative("2", 0), "1");
  assert.equal(lnDecimalIterative("0.5", 0), "-1");
  assert.equal(lnDecimalIterative("10", 0), "2");
  assert.equal(lnDecimalIterative("2", 5), "0.69315");
  assert.equal(lnDecimalIterative("10", 6), "2.302585");
});

test("lnDecimalIterative: values very close to 1 and scientific notation extremes", () => {
  // Very close to 1 below: should round to positive zero, never "-0.000..."
  assert.equal(
    lnDecimalIterative("0.9999999999999999999999999", 20),
    "0.00000000000000000000"
  );
  // ln(1 + 1e-10) = 1e-10 - 0.5e-20 + (1/3)e-30 - ...
  assert.equal(
    lnDecimalIterative("1.0000000001", 30),
    "0.000000000099999999995000000000"
  );
  // Large and tiny scientific notation
  assert.equal(
    lnDecimalIterative("1e+100", 30),
    "230.258509299404568401799145468436"
  );
  assert.equal(
    lnDecimalIterative("1e-100", 30),
    "-230.258509299404568401799145468436"
  );
});

test("lnDecimalIterative: cross-check against Math.log across diverse magnitudes", () => {
  const samples = [
    "1e-12",
    "0.001",
    "0.1",
    "0.5",
    "0.75",
    "0.9999",
    "1",
    "1.0001",
    "1.5",
    "2",
    "3.141592653589793",
    "7.5",
    "10",
    "42.125",
    "1000",
    "1e12",
  ];

  for (const s of samples) {
    const actual = Number(lnDecimalIterative(s, 20));
    const expected = Math.log(Number(s));
    const diff = Math.abs(actual - expected);
    const tol = Math.max(1e-14, Math.abs(expected) * 1e-14);
    assert.ok(
      diff <= tol,
      `Mismatch for ${s}: actual=${actual}, expected=${expected}, diff=${diff}`
    );
  }
});

test("lnDecimalIterative: independent identity cross-checks at 45-digit precision", () => {
  const p = 45;

  // Product identity: ln(a * b) == ln(a) + ln(b)
  const productPairs = [
    ["2", "3", "6"],
    ["7", "13", "91"],
    ["1.25", "0.8", "1"],
    ["0.003", "1234.5", "3.7035"],
    ["0.000125", "8000000", "1000"],
  ];

  for (const [a, b, prod] of productPairs) {
    const lnA = parseFixedToBigInt(lnDecimalIterative(a, p), p);
    const lnB = parseFixedToBigInt(lnDecimalIterative(b, p), p);
    const lnProd = parseFixedToBigInt(lnDecimalIterative(prod, p), p);
    const delta = lnProd >= lnA + lnB ? lnProd - (lnA + lnB) : lnA + lnB - lnProd;
    // Each independently rounded value has <= 0.5 ulp error, so sum vs product <= 2 ulp
    assert.ok(
      delta <= 2n,
      `ln(${a}) + ln(${b}) != ln(${prod}): delta=${delta} ulp`
    );
  }

  // Reciprocal identity: ln(1/x) == -ln(x)
  const reciprocalPairs = [
    ["2", "0.5"],
    ["4", "0.25"],
    ["8", "0.125"],
    ["10", "0.1"],
    ["125", "0.008"],
    ["1000", "0.001"],
  ];

  for (const [x, invX] of reciprocalPairs) {
    const lnX = lnDecimalIterative(x, p);
    const lnInvX = lnDecimalIterative(invX, p);
    assert.equal(lnInvX, `-${lnX}`, `Expected ln(${invX}) == -ln(${x})`);
  }

  // Power identity: ln(x^k) == k * ln(x)
  const ln2 = parseFixedToBigInt(lnDecimalIterative("2", p), p);
  const ln1024 = parseFixedToBigInt(lnDecimalIterative("1024", p), p);
  const deltaPow2 = ln1024 >= 10n * ln2 ? ln1024 - 10n * ln2 : 10n * ln2 - ln1024;
  assert.ok(deltaPow2 <= 6n, `ln(1024) != 10 * ln(2): delta=${deltaPow2} ulp`);

  const ln3 = parseFixedToBigInt(lnDecimalIterative("3", p), p);
  const ln81 = parseFixedToBigInt(lnDecimalIterative("81", p), p);
  const deltaPow3 = ln81 >= 4n * ln3 ? ln81 - 4n * ln3 : 4n * ln3 - ln81;
  assert.ok(deltaPow3 <= 3n, `ln(81) != 4 * ln(3): delta=${deltaPow3} ulp`);
});

test("lnDecimalIterative: input validation and domain errors", () => {
  // Zero and negative values -> RangeError
  for (const badDomain of ["0", "0.0", "-0", "+0.000", "0e10", "-1", "-0.0001", "-2.5e-3"]) {
    assert.throws(
      () => lnDecimalIterative(badDomain),
      RangeError,
      `Expected RangeError for "${badDomain}"`
    );
  }

  // Malformed decimal strings -> SyntaxError
  for (const badSyntax of ["", "   ", ".", "+.", "-.", "abc", "NaN", "Infinity", "1.2.3", "1e", "1e+", "--1", "1_000"]) {
    assert.throws(
      () => lnDecimalIterative(badSyntax),
      SyntaxError,
      `Expected SyntaxError for "${badSyntax}"`
    );
  }

  // Non-string value -> TypeError
  for (const badType of [2, 0, null, undefined, {}, [], 2n, true]) {
    assert.throws(
      () => lnDecimalIterative(badType),
      TypeError,
      `Expected TypeError for value=${String(badType)}`
    );
  }

  // Invalid precision
  assert.throws(() => lnDecimalIterative("2", -1), RangeError);
  assert.throws(() => lnDecimalIterative("2", -100), RangeError);
  for (const badPrec of [1.5, NaN, Infinity, -Infinity, "20", null, {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => lnDecimalIterative("2", badPrec),
      TypeError,
      `Expected TypeError for precision=${String(badPrec)}`
    );
  }
});
