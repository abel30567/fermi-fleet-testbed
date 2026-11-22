import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { productDecimalIterative } from "./productDecimalIterative.js";

/**
 * Independent BigInt rational-to-decimal divider (truncates/rounds to `places` decimal digits)
 * used solely as a test oracle for telescoping-product and reciprocal cross-checks.
 *
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @param {number} places
 * @returns {string}
 */
function divideBigIntToDecimal(numerator, denominator, places) {
	const scaled = numerator * 10n ** BigInt(places);
	let quotient = scaled / denominator;
	const remainder = scaled % denominator;
	if (remainder * 2n >= denominator) {
		quotient += 1n;
	}
	const digits = quotient.toString().padStart(places + 1, "0");
	const split = digits.length - places;
	return `${digits.slice(0, split)}.${digits.slice(split)}`;
}

describe("productDecimalIterative", () => {
	describe("normal cases", () => {
		it("computes exact small decimal products without IEEE-754 rounding drift", () => {
			assert.equal(productDecimalIterative(["0.1", "0.2", "0.3"]), "0.006");
			assert.equal(productDecimalIterative(["2", "3.5", "4"]), "28");
			assert.equal(productDecimalIterative(["1.25", "0.8"]), "1");
			assert.equal(productDecimalIterative(["2.500", "4.00"]), "10");
		});

		it("supports leading +, .5, trailing dot, and scientific notation forms", () => {
			assert.equal(productDecimalIterative(["+2.5", ".4", "10."]), "10");
			assert.equal(productDecimalIterative(["1.5e-10", "2E10"]), "3");
			assert.equal(productDecimalIterative(["2.5e3", "4e-2"]), "100");
			assert.equal(productDecimalIterative(["-1.2e-2", "5e-1"]), "-0.006");
		});

		it("handles high-precision 30+ digit factors beyond IEEE-754 float64 precision", () => {
			// (1 + 10^-30)^2 = 1 + 2*10^-30 + 10^-60
			const factor = "1.000000000000000000000000000001";
			const expectedExact =
				"1.000000000000000000000000000002000000000000000000000000000001";
			assert.equal(productDecimalIterative([factor, factor], 60), expectedExact);
			assert.equal(productDecimalIterative([factor, factor], 65), expectedExact);

			// 35-digit exact product verified independently via BigInt
			const a = "123456789012345678901234567890.12345";
			const b = "987654321098765432109876543210.54321";
			const exactScaled =
				12345678901234567890123456789012345n * 98765432109876543210987654321054321n;
			const digits = exactScaled.toString();
			const expected = `${digits.slice(0, -10)}.${digits.slice(-10).replace(/0+$/, "")}`;
			assert.equal(productDecimalIterative([a, b], 20), expected);
		});

		it("rounds half-away-from-zero and propagates carries cleanly", () => {
			assert.equal(productDecimalIterative(["1.2345", "1"], 3), "1.235");
			assert.equal(productDecimalIterative(["-1.2345", "1"], 3), "-1.235");
			assert.equal(productDecimalIterative(["1.2344999", "1"], 3), "1.234");
			assert.equal(productDecimalIterative(["9.9999", "1"], 2), "10");
			assert.equal(productDecimalIterative(["-9.9999", "1"], 2), "-10");
		});
	});

	describe("edge cases", () => {
		it("returns '1' for an empty array by mathematical convention", () => {
			assert.equal(productDecimalIterative([]), "1");
			assert.equal(productDecimalIterative([], 0), "1");
			assert.equal(productDecimalIterative([], 50), "1");
		});

		it("handles single-element arrays", () => {
			assert.equal(productDecimalIterative(["42.125"]), "42.125");
			assert.equal(productDecimalIterative(["-0.000"]), "0");
			assert.equal(productDecimalIterative(["3.1415926535897932384626433"], 5), "3.14159");
		});

		it("returns '0' whenever any factor is zero (never '-0')", () => {
			assert.equal(productDecimalIterative(["0", "123.456", "-789"]), "0");
			assert.equal(productDecimalIterative(["-12.5", "0.000", "99.9"]), "0");
			assert.equal(productDecimalIterative(["-1", "-2", "-0"]), "0");
			assert.equal(productDecimalIterative(["1e50", "0e-50"]), "0");
		});

		it("handles odd and even numbers of negative factors", () => {
			assert.equal(productDecimalIterative(["-2"]), "-2");
			assert.equal(productDecimalIterative(["-2", "-3"]), "6");
			assert.equal(productDecimalIterative(["-2", "-3", "-4"]), "-24");
			assert.equal(productDecimalIterative(["-2", "-3", "-4", "-0.5"]), "12");
		});

		it("handles precision = 0 and negative values rounding to zero without '-0'", () => {
			assert.equal(productDecimalIterative(["1.5", "1"], 0), "2");
			assert.equal(productDecimalIterative(["-1.5", "1"], 0), "-2");
			assert.equal(productDecimalIterative(["2.499999", "1"], 0), "2");
			assert.equal(productDecimalIterative(["-0.499999", "1"], 0), "0");
			assert.equal(productDecimalIterative(["-0.0004", "1"], 3), "0");
			assert.equal(productDecimalIterative(["-0.0005", "1"], 3), "-0.001");
			assert.equal(productDecimalIterative(["1e-50000", "-2e-50000"], 20), "0");
		});

		it("validates inputs strictly and throws descriptive TypeError/RangeError", () => {
			// Invalid values container
			for (const badValues of [null, undefined, "1.2", 123, {}, new Set(["1"])]) {
				assert.throws(() => productDecimalIterative(badValues), TypeError);
			}

			// Invalid element types
			for (const badElem of [1, null, undefined, 1n, {}, [], true]) {
				assert.throws(() => productDecimalIterative([badElem]), TypeError);
			}

			// Invalid decimal string syntax
			for (const badStr of [
				"",
				" ",
				" 1.5 ",
				".",
				"+",
				"-",
				"+.",
				"-.",
				"1.2.3",
				"NaN",
				"Infinity",
				"-Infinity",
				"abc",
				"1e",
				"1e+",
				"1e2.5",
				"1_000",
				"0x10",
			]) {
				assert.throws(() => productDecimalIterative([badStr]), RangeError);
			}

			// Must still validate elements after a zero factor
			assert.throws(() => productDecimalIterative(["0", "not-a-number"]), RangeError);
			assert.throws(() => productDecimalIterative(["0", 42]), TypeError);

			// Invalid precision
			for (const badPrecType of ["20", null, 20n, {}, []]) {
				assert.throws(() => productDecimalIterative(["1"], badPrecType), TypeError);
			}
			for (const badPrecRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, 1e20]) {
				assert.throws(() => productDecimalIterative(["1"], badPrecRange), RangeError);
			}
		});
	});

	describe("independent cross-checks", () => {
		it("matches 25! computed via an independent BigInt factorial loop", () => {
			const factors = [];
			let expectedFact = 1n;
			for (let k = 1; k <= 25; k += 1) {
				factors.push(String(k));
				expectedFact *= BigInt(k);
			}

			assert.equal(expectedFact.toString(), "15511210043330985984000000");
			assert.equal(productDecimalIterative(factors), expectedFact.toString());
		});

		it("satisfies the telescoping product identity prod_{k=1..n} (k+1)/k = n+1", () => {
			const n = 20;
			const factors = [];
			for (let k = 1; k <= n; k += 1) {
				// Independent 50-digit decimal approximation of (k + 1) / k
				factors.push(divideBigIntToDecimal(BigInt(k + 1), BigInt(k), 50));
			}

			// Error across 20 terms of 50-digit precision is << 10^-45, so at precision 40 it equals "21"
			assert.equal(productDecimalIterative(factors, 40), String(n + 1));
		});

		it("satisfies commutativity across original, reversed, and rotated factor orders", () => {
			const original = [
				"3.14159265358979323846264338327950288",
				"-2.71828182845904523536028747135266250",
				"1.41421356237309504880168872420969808",
				"0.57721566490153286060651209008240243",
				"-1.61803398874989484820458683436563812",
			];
			const reversed = [...original].reverse();
			const rotated = [...original.slice(2), ...original.slice(0, 2)];

			const pOriginal = productDecimalIterative(original, 50);
			const pReversed = productDecimalIterative(reversed, 50);
			const pRotated = productDecimalIterative(rotated, 50);

			assert.equal(pOriginal, pReversed);
			assert.equal(pOriginal, pRotated);
		});

		it("recovers 1 when multiplying a 50-digit reciprocal of 7 by 7", () => {
			const oneSeventh50 = divideBigIntToDecimal(1n, 7n, 50);
			assert.equal(productDecimalIterative([oneSeventh50, "7"], 45), "1");
		});
	});
});
