import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { integralDecimalIterative } from "./integralDecimalIterative.js";

// --- Independent BigInt decimal helpers for test integrands and analytical cross-checks ---

function parseDec(str) {
  let s = str;
  let neg = false;
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const dot = s.indexOf(".");
  let val;
  let scale = 0;
  if (dot === -1) {
    val = BigInt(s);
  } else {
    scale = s.length - dot - 1;
    val = BigInt(s.slice(0, dot) + s.slice(dot + 1));
  }
  return { val: neg ? -val : val, scale };
}

function divRound(num, den) {
  if (num === 0n) return 0n;
  const neg = num < 0n;
  const a = neg ? -num : num;
  let q = a / den;
  const r = a % den;
  const twoR = r * 2n;
  if (twoR > den || (twoR === den && (q & 1n) === 1n)) {
    q += 1n;
  }
  return neg ? -q : q;
}

function fmtDec(val, scale) {
  if (val === 0n) return "0";
  const neg = val < 0n;
  const d = (neg ? -val : val).toString();
  const sign = neg ? "-" : "";
  if (scale === 0) return sign + d;
  const intPart = d.length <= scale ? "0" : d.slice(0, d.length - scale);
  let fracPart = d.length <= scale ? d.padStart(scale, "0") : d.slice(d.length - scale);
  fracPart = fracPart.replace(/0+$/, "");
  return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

function decAdd(aStr, bStr) {
  const a = parseDec(aStr);
  const b = parseDec(bStr);
  const scale = Math.max(a.scale, b.scale);
  const av = a.val * 10n ** BigInt(scale - a.scale);
  const bv = b.val * 10n ** BigInt(scale - b.scale);
  return fmtDec(av + bv, scale);
}

function decSub(aStr, bStr) {
  const a = parseDec(aStr);
  const b = parseDec(bStr);
  const scale = Math.max(a.scale, b.scale);
  const av = a.val * 10n ** BigInt(scale - a.scale);
  const bv = b.val * 10n ** BigInt(scale - b.scale);
  return fmtDec(av - bv, scale);
}

function decMul(aStr, bStr) {
  const a = parseDec(aStr);
  const b = parseDec(bStr);
  return fmtDec(a.val * b.val, a.scale + b.scale);
}

function decDiv(aStr, bStr, precision) {
  const a = parseDec(aStr);
  const b = parseDec(bStr);
  const shift = precision + b.scale - a.scale;
  let num = a.val;
  let den = b.val;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  if (shift >= 0) {
    num *= 10n ** BigInt(shift);
  } else {
    den *= 10n ** BigInt(-shift);
  }
  return fmtDec(divRound(num, den), precision);
}

function decPowInt(xStr, n) {
  let result = "1";
  for (let i = 0; i < n; i += 1) {
    result = decMul(result, xStr);
  }
  return result;
}

/**
 * Independent BigInt Taylor-series exp(x) to `prec` fractional digits.
 */
function decExp(xStr, prec) {
  const guard = 10;
  const work = prec + guard;
  const scaleFactor = 10n ** BigInt(work);
  const { val, scale } = parseDec(xStr);
  const xScaled =
    scale <= work
      ? val * 10n ** BigInt(work - scale)
      : divRound(val, 10n ** BigInt(scale - work));

  let sum = scaleFactor;
  let term = scaleFactor;
  for (let n = 1n; n < 500n; n += 1n) {
    term = divRound(term * xScaled, scaleFactor * n);
    if (term === 0n) break;
    sum += term;
  }
  return fmtDec(divRound(sum, 10n ** BigInt(guard)), prec);
}

/**
 * Independent helper: checks |a - b| <= tol (in ULPs of 10^-precision).
 */
function assertCloseDecimal(actual, expected, precision, maxUlpDiff = 0n) {
  const a = parseDec(actual);
  const b = parseDec(expected);
  const scale = Math.max(a.scale, b.scale, precision);
  const av = a.val * 10n ** BigInt(scale - a.scale);
  const bv = b.val * 10n ** BigInt(scale - b.scale);
  const diff = av >= bv ? av - bv : bv - av;
  const maxDiff = maxUlpDiff * 10n ** BigInt(scale - precision);
  assert.ok(
    diff <= maxDiff,
    `Expected ${actual} to match ${expected} within ${maxUlpDiff} ULP at precision ${precision} (diff=${fmtDec(diff, scale)})`
  );
}

// Known high-precision constants (50+ digits):
// pi/4 = 0.785398163397448309615660845819875721049292349843776455243736148...
const PI_OVER_4_25 = "0.7853981633974483096156608";
const PI_OVER_4_35 = "0.78539816339744830961566084581987572";

// ln(2) = 0.693147180559945309417232121458176568075500134360255254120680009...
const LN_2_30 = "0.693147180559945309417232121458";

// e - 1 = 1.718281828459045235360287471352662497757247093699959574966967627...
const E_MINUS_1_30 = "1.718281828459045235360287471353";

describe("integralDecimalIterative", () => {
  describe("normal cases and high precision", () => {
    it("integrates polynomials exactly", () => {
      // int_0^2 (3x^2 - 2x + 5) dx = [x^3 - x^2 + 5x]_0^2 = 8 - 4 + 10 = 14
      const poly = (x) => {
        const x2 = decMul(x, x);
        return decAdd(decSub(decMul("3", x2), decMul("2", x)), "5");
      };
      assert.equal(integralDecimalIterative(poly, "0", "2", 20), "14");

      // int_1^4 x^3 dx = (256 - 1)/4 = 63.75
      const cube = (x) => decPowInt(x, 3);
      assert.equal(integralDecimalIterative(cube, "1", "4", 20), "63.75");
    });

    it("computes int_0^1 1/(1+x^2) dx = pi/4 to 25 and 35 decimal places", () => {
      const f = (x, workPrecision) => {
        const denom = decAdd("1", decMul(x, x));
        return decDiv("1", denom, workPrecision + 2);
      };

      const res25 = integralDecimalIterative(f, "0", "1", 25);
      assert.equal(res25, PI_OVER_4_25);

      const res35 = integralDecimalIterative(f, "0", "1", 35);
      assert.equal(res35, PI_OVER_4_35);
    });

    it("computes int_1^2 (1/x) dx = ln(2) to 30 decimal places", () => {
      const reciprocal = (x, workPrecision) => decDiv("1", x, workPrecision + 2);
      const res30 = integralDecimalIterative(reciprocal, "1", "2", 30);
      assert.equal(res30, LN_2_30);
    });

    it("computes int_0^1 exp(x) dx = e - 1 to 30 decimal places", () => {
      const expFn = (x, workPrecision) => decExp(x, workPrecision + 2);
      const res30 = integralDecimalIterative(expFn, "0", "1", 30);
      assert.equal(res30, E_MINUS_1_30);
    });

    it("uses default precision of 20 when omitted and works when fn uses exact workPrecision", () => {
      const f = (x, workPrecision) => decDiv("1", decAdd("1", decMul(x, x)), workPrecision);
      const res = integralDecimalIterative(f, "0", "1");
      assert.equal(res, "0.78539816339744830962");
    });
  });

  describe("edge cases", () => {
    it("returns '0' when a === b (including equivalent decimal representations)", () => {
      let called = false;
      const fn = () => {
        called = true;
        return "42";
      };
      assert.equal(integralDecimalIterative(fn, "3", "3", 20), "0");
      assert.equal(integralDecimalIterative(fn, "1.5", "1.500", 20), "0");
      assert.equal(integralDecimalIterative(fn, "-0", "+0.0", 20), "0");
      assert.equal(integralDecimalIterative(fn, "1e2", "100", 20), "0");
      assert.equal(called, false);
    });

    it("handles reversed bounds (a > b) by negating the integral", () => {
      const f = (x, workPrecision) => decDiv("1", decAdd("1", decMul(x, x)), workPrecision + 2);
      assert.equal(integralDecimalIterative(f, "1", "0", 25), `-${PI_OVER_4_25}`);

      const cube = (x) => decPowInt(x, 3);
      assert.equal(integralDecimalIterative(cube, "4", "1", 20), "-63.75");
    });

    it("handles constant functions (positive, negative, and zero)", () => {
      assert.equal(integralDecimalIterative(() => "0", "-5", "10", 20), "0");
      assert.equal(integralDecimalIterative(() => "7.5", "2", "6", 20), "30");
      assert.equal(integralDecimalIterative(() => "-3.25", "1", "5", 20), "-13");
    });

    it("handles negative intervals and symmetric odd integrals without '-0'", () => {
      const cube = (x) => decPowInt(x, 3);
      // int_-3^-1 x^3 dx = (1 - 81)/4 = -20
      assert.equal(integralDecimalIterative(cube, "-3", "-1", 20), "-20");
      // int_-2^2 x^3 dx = 0 (must not be "-0")
      assert.equal(integralDecimalIterative(cube, "-2", "2", 20), "0");
      // Reversed bounds on zero integral must also not produce "-0"
      assert.equal(integralDecimalIterative(cube, "2", "-2", 20), "0");
    });

    it("handles precision = 0 with round-half-to-even", () => {
      const f = (x, workPrecision) => decDiv("1", decAdd("1", decMul(x, x)), workPrecision + 2);
      // pi/4 = 0.785... -> rounds to 1
      assert.equal(integralDecimalIterative(f, "0", "1", 0), "1");
      // int_0^1 x dx = 0.5 -> half-to-even rounds to 0
      assert.equal(integralDecimalIterative((x) => x, "0", "1", 0), "0");
      // int_0^2 (3/4) dx = 1.5 -> half-to-even rounds to 2
      assert.equal(integralDecimalIterative(() => "0.75", "0", "2", 0), "2");
    });

    it("handles scientific notation bounds and very small / large intervals", () => {
      // int_0^(1e-15) (2x) dx = (1e-15)^2 = 1e-30
      const twoX = (x) => decMul("2", x);
      assert.equal(
        integralDecimalIterative(twoX, "0", "1e-15", 32),
        "0.000000000000000000000000000001"
      );

      // int_0^(1e8) (1/(1+x^2)) vs simple linear on large interval:
      // int_0^(1e12) (2.5) dx = 2.5e12 = 2500000000000
      assert.equal(integralDecimalIterative(() => "2.5", "+0", "1e12", 5), "2500000000000");

      // Large interval with non-trivial integrand: int_0^(1e6) (1e-6 * x) dx = 0.5 * 1e6 = 500000
      const scaledX = (x) => decMul("0.000001", x);
      assert.equal(integralDecimalIterative(scaledX, "0", "1e6", 10), "500000");
    });

    it("supports scientific notation returned from fn", () => {
      assert.equal(integralDecimalIterative(() => "1.5e-2", "0", "4", 10), "0.06");
    });
  });

  describe("independent mathematical cross-checks", () => {
    it("matches analytical antiderivative F(b) - F(a) for x^3 over high-precision bounds", () => {
      const a = "1.1234567890123456789012345";
      const b = "2.9876543210987654321098765";
      const precision = 35;

      const cube = (x) => decPowInt(x, 3);
      const numeric = integralDecimalIterative(cube, a, b, precision);

      // Exact analytical antiderivative: F(x) = x^4 / 4
      const fb = decPowInt(b, 4);
      const fa = decPowInt(a, 4);
      const exact = decDiv(decSub(fb, fa), "4", precision);

      assert.equal(numeric, exact);
    });

    it("matches analytical antiderivative F(b) - F(a) for exp(x) over [-1.5, 2.25]", () => {
      const a = "-1.5";
      const b = "2.25";
      const precision = 28;

      const expFn = (x, workPrecision) => decExp(x, workPrecision + 2);
      const numeric = integralDecimalIterative(expFn, a, b, precision);

      // Independent antiderivative: e^b - e^a
      const expected = decDiv(
        decSub(decExp(b, precision + 8), decExp(a, precision + 8)),
        "1",
        precision
      );

      assertCloseDecimal(numeric, expected, precision, 0n);
    });

    it("satisfies interval additivity: int_a^c + int_c^b = int_a^b", () => {
      const f = (x, workPrecision) => decDiv("1", decAdd("1", decMul(x, x)), workPrecision + 2);
      const precision = 25;

      const a = "-0.75";
      const c = "0.4";
      const b = "1.6";

      const left = integralDecimalIterative(f, a, c, precision + 4);
      const right = integralDecimalIterative(f, c, b, precision + 4);
      const whole = integralDecimalIterative(f, a, b, precision);
      const sumRounded = decDiv(decAdd(left, right), "1", precision);

      assert.equal(sumRounded, whole);

      // Additivity also holds when c is outside [a, b] (using reversed bounds)
      const cOutside = "2.5";
      const part1 = integralDecimalIterative(f, a, cOutside, precision + 4);
      const part2 = integralDecimalIterative(f, cOutside, b, precision + 4);
      const sumOutside = decDiv(decAdd(part1, part2), "1", precision);
      assert.equal(sumOutside, whole);
    });

    it("satisfies linearity: int(2f + 3g) = 2*int(f) + 3*int(g)", () => {
      const f = (x) => decPowInt(x, 3);
      const g = (x, wp) => decDiv("1", decAdd("1", decMul(x, x)), wp + 2);
      const combo = (x, wp) => decAdd(decMul("2", f(x)), decMul("3", g(x, wp)));

      const prec = 24;
      const lhs = integralDecimalIterative(combo, "0", "1", prec);
      const intF = integralDecimalIterative(f, "0", "1", prec + 4);
      const intG = integralDecimalIterative(g, "0", "1", prec + 4);
      const rhs = decDiv(decAdd(decMul("2", intF), decMul("3", intG)), "1", prec);

      assert.equal(lhs, rhs);
    });
  });

  describe("input validation and error handling", () => {
    const id = (x) => x;

    it("throws TypeError for non-function fn", () => {
      assert.throws(() => integralDecimalIterative(null, "0", "1"), TypeError);
      assert.throws(() => integralDecimalIterative("x", "0", "1"), TypeError);
      assert.throws(() => integralDecimalIterative(123, "0", "1"), TypeError);
    });

    it("throws TypeError for non-string bounds", () => {
      assert.throws(() => integralDecimalIterative(id, 0, "1"), TypeError);
      assert.throws(() => integralDecimalIterative(id, "0", 1), TypeError);
      assert.throws(() => integralDecimalIterative(id, 0n, "1"), TypeError);
      assert.throws(() => integralDecimalIterative(id, "0", null), TypeError);
    });

    it("throws RangeError for malformed decimal string bounds", () => {
      for (const bad of ["", " ", " 1", "1 ", "abc", "NaN", "Infinity", "-Infinity", "1.2.3", ".", "1e", "1e9999999"]) {
        assert.throws(() => integralDecimalIterative(id, bad, "1"), RangeError, `expected RangeError for a="${bad}"`);
        assert.throws(() => integralDecimalIterative(id, "0", bad), RangeError, `expected RangeError for b="${bad}"`);
      }
    });

    it("validates precision type and range", () => {
      assert.throws(() => integralDecimalIterative(id, "0", "1", "20"), TypeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", null), TypeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", -1), RangeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", 1.5), RangeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", NaN), RangeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", Infinity), RangeError);
    });

    it("validates options type and range", () => {
      assert.throws(() => integralDecimalIterative(id, "0", "1", 10, null), TypeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", 10, []), TypeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", 10, "bad"), TypeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", 10, { maxIterations: "5" }), TypeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", 10, { maxIterations: 0 }), RangeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", 10, { minIterations: 0 }), RangeError);
      assert.throws(
        () => integralDecimalIterative(id, "0", "1", 10, { minIterations: 5, maxIterations: 3 }),
        RangeError
      );
      assert.throws(() => integralDecimalIterative(id, "0", "1", 10, { guardDigits: -1 }), RangeError);
      assert.throws(() => integralDecimalIterative(id, "0", "1", 10, { guardDigits: "4" }), TypeError);
    });

    it("validates return values from fn", () => {
      assert.throws(() => integralDecimalIterative(() => 123, "0", "1"), TypeError);
      assert.throws(() => integralDecimalIterative(() => undefined, "0", "1"), TypeError);
      assert.throws(() => integralDecimalIterative(() => "NaN", "0", "1"), RangeError);
      assert.throws(() => integralDecimalIterative(() => "not-a-number", "0", "1"), RangeError);
    });

    it("throws RangeError when integration fails to converge within maxIterations", () => {
      const f = (x, wp) => decDiv("1", decAdd("1", decMul(x, x)), wp + 2);
      assert.throws(
        () => integralDecimalIterative(f, "0", "1", 30, { maxIterations: 2 }),
        RangeError
      );
    });
  });
});
