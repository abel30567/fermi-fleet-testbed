import test from "node:test";
import assert from "node:assert/strict";
import { productDecimalSeries } from "./productDecimalSeries.js";

test("productDecimalSeries: normal cases", async (t) => {
	await t.test("integer and basic decimal products", () => {
		assert.equal(productDecimalSeries(["2", "3", "4"]), "24");
		assert.equal(productDecimalSeries(["0.1", "0.2"]), "0.02");
		assert.equal(productDecimalSeries(["1.25", "2.4", "0.5"]), "1.5");
		assert.equal(productDecimalSeries(["+1.5", "+2.0"]), "3");
		assert.equal(productDecimalSeries([".5", "5."]), "2.5");
	});

	await t.test("sign handling for odd and even negative counts", () => {
		assert.equal(productDecimalSeries(["-2", "3", "4"]), "-24");
		assert.equal(productDecimalSeries(["-2", "-3", "4"]), "24");
		assert.equal(productDecimalSeries(["-2", "-3", "-4"]), "-24");
		assert.equal(productDecimalSeries(["-.5", "+2.5", "-4"]), "5");
	});

	await t.test("scientific notation inputs", () => {
		assert.equal(productDecimalSeries(["1.5e-3", "2E+4"]), "30");
		assert.equal(productDecimalSeries(["-2.5e2", "4e-5"]), "-0.01");
		assert.equal(productDecimalSeries([".5e1", "5.e-1"]), "2.5");
		assert.equal(productDecimalSeries(["1e-10", "1e-10"], 20), "0.00000000000000000001");
	});

	await t.test("arbitrary precision beyond IEEE-754 double precision", () => {
		// Exact 40-digit * 40-digit decimal product
		const a = "12345678901234567890.12345678901234567891";
		const b = "0.00000000000000000002";
		assert.equal(
			productDecimalSeries([a, b], 50),
			"0.2469135780246913578024691357802469135782",
		);

		// 30 copies of 0.1 -> 10^-30
		const tenths = Array.from({ length: 30 }, () => "0.1");
		assert.equal(productDecimalSeries(tenths, 30), "0." + "0".repeat(29) + "1");

		// Exact reciprocal cancellation with 40 digits
		assert.equal(
			productDecimalSeries(["0.0000000000000000000000000000000000000001", "1e40"]),
			"1",
		);
	});

	await t.test("configurable precision and round-half-to-even behavior", () => {
		// Standard round up / down
		assert.equal(productDecimalSeries(["1.23456", "1"], 3), "1.235");
		assert.equal(productDecimalSeries(["1.23444", "1"], 3), "1.234");

		// Exact half-to-even ties
		assert.equal(productDecimalSeries(["0.005", "1"], 2), "0"); // 0.00 (even)
		assert.equal(productDecimalSeries(["0.015", "1"], 2), "0.02"); // 0.02 (even)
		assert.equal(productDecimalSeries(["0.025", "1"], 2), "0.02"); // 0.02 (even)
		assert.equal(productDecimalSeries(["0.035", "1"], 2), "0.04"); // 0.04 (even)
		assert.equal(productDecimalSeries(["-0.015", "1"], 2), "-0.02");
		assert.equal(productDecimalSeries(["-0.025", "1"], 2), "-0.02");

		// Slightly above exact tie always rounds away from zero
		assert.equal(productDecimalSeries(["0.025000000000000000001", "1"], 2), "0.03");
		assert.equal(productDecimalSeries(["-0.025000000000000000001", "1"], 2), "-0.03");

		// Precision 0 (integer rounding)
		assert.equal(productDecimalSeries(["0.5", "1"], 0), "0");
		assert.equal(productDecimalSeries(["1.5", "1"], 0), "2");
		assert.equal(productDecimalSeries(["2.5", "1"], 0), "2");
		assert.equal(productDecimalSeries(["3.5", "1"], 0), "4");

		// Carry propagation across decimal point
		assert.equal(productDecimalSeries(["0.9995", "1"], 2), "1");
		assert.equal(productDecimalSeries(["-9.9999", "1"], 2), "-10");
	});
});

test("productDecimalSeries: edge cases", async (t) => {
	await t.test("empty product identity returns 1", () => {
		assert.equal(productDecimalSeries([]), "1");
		assert.equal(productDecimalSeries([], 0), "1");
		assert.equal(productDecimalSeries([], 50), "1");
	});

	await t.test("single element normalization", () => {
		assert.equal(productDecimalSeries(["00042.5000"]), "42.5");
		assert.equal(productDecimalSeries(["-0.000"]), "0");
		assert.equal(productDecimalSeries(["+0"]), "0");
	});

	await t.test("zero annihilation never produces -0", () => {
		assert.equal(productDecimalSeries(["0", "-5", "10"]), "0");
		assert.equal(productDecimalSeries(["-5", "0.0", "10"]), "0");
		assert.equal(productDecimalSeries(["-5", "10", "-0e5"]), "0");
		assert.equal(productDecimalSeries(["-0.0001", "0.0001"], 4), "0");
	});

	await t.test("extreme exponents: cancellation and underflow", () => {
		// Extreme opposite exponents cancel cleanly
		assert.equal(productDecimalSeries(["2.5e500000", "4e-500000"]), "10");

		// Huge negative exponent underflows directly to 0 without allocating huge strings
		assert.equal(productDecimalSeries(["1e-1000000000", "1e-1000000000"], 20), "0");
	});

	await t.test("large number of terms exercises deep binary-splitting tree", () => {
		// 1000 alternating 2 and 0.5 terms -> product is 1
		const terms = Array.from({ length: 1000 }, (_, i) => (i % 2 === 0 ? "2" : "0.5"));
		assert.equal(productDecimalSeries(terms, 10), "1");
	});
});

test("productDecimalSeries: invalid inputs", async (t) => {
	await t.test("rejects non-array values", () => {
		for (const bad of [null, undefined, 42, "123", {}, new Set(["1"])]) {
			assert.throws(() => productDecimalSeries(bad), TypeError);
		}
	});

	await t.test("rejects non-string array elements", () => {
		for (const bad of [1, null, undefined, 2n, {}, []]) {
			assert.throws(() => productDecimalSeries(["1", bad]), TypeError);
		}
	});

	await t.test("rejects malformed decimal strings", () => {
		const invalidStrings = [
			"",
			"   ",
			"abc",
			"NaN",
			"Infinity",
			"-Infinity",
			".",
			"+.",
			"-.",
			"1.2.3",
			"1e",
			"1e+",
			"1e-",
			"e5",
			" 1.5",
			"1.5 ",
			"1_000",
			"--1",
			"++1",
		];
		for (const bad of invalidStrings) {
			assert.throws(() => productDecimalSeries([bad]), RangeError, `Expected RangeError for ${JSON.stringify(bad)}`);
		}
	});

	await t.test("validates all elements even after encountering zero", () => {
		assert.throws(() => productDecimalSeries(["0", "not-a-number"]), RangeError);
		assert.throws(() => productDecimalSeries(["0", 123]), TypeError);
	});

	await t.test("rejects invalid precision argument", () => {
		for (const bad of [null, "10", true, {}, []]) {
			assert.throws(() => productDecimalSeries(["1"], bad), TypeError);
		}
		for (const bad of [-1, 1.5, NaN, Infinity, -Infinity, 100_001]) {
			assert.throws(() => productDecimalSeries(["1"], bad), RangeError);
		}
	});

	await t.test("rejects fixed-point output exceeding maximum length", () => {
		assert.throws(() => productDecimalSeries(["1e150000", "1e150000"]), RangeError);
	});
});

test("productDecimalSeries: independent mathematical cross-checks", async (t) => {
	await t.test("Euler binary product identity: ∏_{k=0}^{m-1} (1 + 10^(-2^k)) = (1 - 10^(-2^m)) / 0.9", () => {
		// For m = 6 (2^6 = 64), exact decimal expansion is 1 followed by "." and 63 ones.
		const m = 6;
		const terms = [];
		for (let k = 0; k < m; k++) {
			const power = 2 ** k;
			terms.push(`1.${"0".repeat(power - 1)}1`);
		}
		const expected = `1.${"1".repeat(2 ** m - 1)}`;
		assert.equal(productDecimalSeries(terms, 80), expected);
	});

	await t.test("Euler binary product identity with base 0.5: ∏_{k=0}^{4} (1 + 0.5^(2^k)) = 2 - 2^(-31)", () => {
		// 0.5^(2^k) = 5^(2^k) * 10^(-2^k)
		const m = 5;
		const terms = [];
		for (let k = 0; k < m; k++) {
			const p = 2 ** k;
			const frac = (5n ** BigInt(p)).toString().padStart(p, "0");
			terms.push(`1.${frac}`);
		}
		// Closed form: 2 - 2^(1 - 2^m) = 2 - 2^(-31) = 1 + (1 - 5^31 * 10^-31)
		const exp = 2 ** m - 1; // 31
		const sub = 10n ** BigInt(exp) - 5n ** BigInt(exp);
		const expected = `1.${sub.toString().padStart(exp, "0")}`;
		assert.equal(productDecimalSeries(terms, 40), expected);
	});

	await t.test("geometric progression closed-form identity: ∏_{k=0}^{n-1} (a * r^k) = a^n * r^(n(n-1)/2)", () => {
		// a = 1.5 = 15 * 10^-1, r = 0.25 = 25 * 10^-2, n = 10
		const n = 10;
		const terms = [];
		for (let k = 0; k < n; k++) {
			// a * r^k = 15 * 25^k * 10^(-(1 + 2k))
			const num = 15n * 25n ** BigInt(k);
			const scale = 1 + 2 * k;
			const s = num.toString().padStart(scale + 1, "0");
			const split = s.length - scale;
			terms.push(`${s.slice(0, split)}.${s.slice(split)}`);
		}

		// Independent closed-form computation: 15^n * 25^(n(n-1)/2) * 10^(-(n + n(n-1)))
		const rExp = (n * (n - 1)) / 2;
		const closedNum = 15n ** BigInt(n) * 25n ** BigInt(rExp);
		const closedScale = n + 2 * rExp;
		const raw = closedNum.toString().padStart(closedScale + 1, "0");
		const split = raw.length - closedScale;
		const expected = `${raw.slice(0, split)}.${raw.slice(split)}`.replace(/\.?0+$/, "");

		assert.equal(productDecimalSeries(terms, closedScale + 5), expected);
	});

	await t.test("log-sum-exp cross-check: ∏ x_k = (∏ sgn(x_k)) * exp(∑ ln|x_k|)", () => {
		const samples = [
			["1.1", "2.2", "3.3", "0.45", "1.75"],
			["-0.75", "1.3333", "-2.5", "0.8", "-1.125"],
			["12.345", "0.0678", "9.1011", "0.5"],
		];

		for (const xs of samples) {
			const actual = Number(productDecimalSeries(xs, 15));
			let sign = 1;
			let logSum = 0;
			for (const s of xs) {
				const v = Number(s);
				if (v < 0) sign = -sign;
				logSum += Math.log(Math.abs(v));
			}
			const reference = sign * Math.exp(logSum);
			const relError = Math.abs(actual - reference) / Math.abs(reference);
			assert.ok(relError < 1e-13, `Expected relative error < 1e-13, got ${relError}`);
		}
	});
});
