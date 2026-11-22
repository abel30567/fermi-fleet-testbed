import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vectorAddDecimalIterative } from "./vectorAddDecimalIterative.js";

/**
 * Independent reference implementation using exact rational arithmetic
 * (BigInt numerator/denominator reduced by Euclidean GCD) to cross-check
 * decimal vector addition without sharing any code with the implementation.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function parseToRational(str) {
	let s = str;
	let sign = 1n;
	if (s.startsWith("-")) {
		sign = -1n;
		s = s.slice(1);
	} else if (s.startsWith("+")) {
		s = s.slice(1);
	}

	const [mantissa, expStr] = s.split(/[eE]/);
	const exp = expStr ? Number(expStr) : 0;
	const dotIdx = mantissa.indexOf(".");
	let digits;
	let fracLen;
	if (dotIdx === -1) {
		digits = mantissa;
		fracLen = 0;
	} else {
		digits = mantissa.slice(0, dotIdx) + mantissa.slice(dotIdx + 1);
		fracLen = mantissa.length - dotIdx - 1;
	}

	const shift = exp - fracLen;
	let num = sign * BigInt(digits);
	let den = 1n;
	if (shift >= 0) {
		num *= 10n ** BigInt(shift);
	} else {
		den = 10n ** BigInt(-shift);
	}
	const g = gcdBigInt(num, den);
	return { num: num / g, den: den / g };
}

function addRationals(r1, r2) {
	const num = r1.num * r2.den + r2.num * r1.den;
	const den = r1.den * r2.den;
	const g = gcdBigInt(num, den);
	return { num: num / g, den: den / g };
}

describe("vectorAddDecimalIterative", () => {
	describe("normal cases", () => {
		it("adds classic IEEE-754 decimal traps exactly", () => {
			const res = vectorAddDecimalIterative(
				["0.1", "0.2", "0.7", "1.005"],
				["0.2", "0.4", "0.1", "0.005"],
			);
			assert.deepEqual(res, ["0.3", "0.6", "0.8", "1.01"]);
		});

		it("preserves 40+ digits of arbitrary precision beyond float64", () => {
			const a = [
				"123456789012345678901234567890.0000000000000000000000000000000000000001",
				"0.1111111111111111111111111111111111111111",
				"99999999999999999999999999999999999999999",
			];
			const b = [
				"0.9999999999999999999999999999999999999999",
				"0.2222222222222222222222222222222222222222",
				"1",
			];
			const res = vectorAddDecimalIterative(a, b, 45);
			assert.deepEqual(res, [
				"123456789012345678901234567891",
				"0.3333333333333333333333333333333333333333",
				"100000000000000000000000000000000000000000",
			]);
		});

		it("defaults precision to 20 decimal places and rounds half-away-from-zero", () => {
			const a = ["0.000000000000000000005", "-0.000000000000000000005", "0.000000000000000000004"];
			const b = ["0", "0", "0"];
			assert.deepEqual(vectorAddDecimalIterative(a, b), [
				"0.00000000000000000001",
				"-0.00000000000000000001",
				"0",
			]);
		});

		it("rounds properly at custom precisions including carry across integer boundary", () => {
			const res = vectorAddDecimalIterative(
				["1.234", "1.235", "-1.235", "9.995", "-9.995"],
				["0", "0", "0", "0", "0"],
				2,
			);
			assert.deepEqual(res, ["1.23", "1.24", "-1.24", "10", "-10"]);
		});

		it("handles leading signs, leading/trailing zeros, partial forms, and scientific notation", () => {
			const a = ["+0001.2500", ".5", "5.", "1.5e-25", "2.5E+30"];
			const b = ["+0.75", "+.5", "0.5", "2.5e-25", "5e+29"];
			const res = vectorAddDecimalIterative(a, b, 30);
			assert.deepEqual(res, [
				"2",
				"1",
				"5.5",
				"0.0000000000000000000000004",
				"3000000000000000000000000000000",
			]);
		});

		it("does not mutate input vectors", () => {
			const a = ["1.5", "2.5"];
			const b = ["3.5", "4.5"];
			const aCopy = [...a];
			const bCopy = [...b];
			const res = vectorAddDecimalIterative(a, b, 10);
			assert.deepEqual(res, ["5", "7"]);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});
	});

	describe("edge cases", () => {
		it("handles empty vectors", () => {
			assert.deepEqual(vectorAddDecimalIterative([], []), []);
			assert.deepEqual(vectorAddDecimalIterative([], [], 0), []);
		});

		it("normalizes zeros and prevents negative zero", () => {
			const res = vectorAddDecimalIterative(
				["0", "-0", "-0.0000", "-0.0001", "0e10"],
				["-0", "-0.0", "0.0000", "0", "-0e-5"],
				2,
			);
			assert.deepEqual(res, ["0", "0", "0", "0", "0"]);
		});

		it("cancels additive inverses to exact \"0\"", () => {
			const a = [
				"42.123456789012345678901234567890",
				"-98765432109876543210.987654321",
				"1e-35",
			];
			const b = [
				"-42.123456789012345678901234567890",
				"98765432109876543210.987654321",
				"-0.00000000000000000000000000000000001",
			];
			assert.deepEqual(vectorAddDecimalIterative(a, b, 40), ["0", "0", "0"]);
		});

		it("handles mixed signs across positive, negative, and sub-unit values", () => {
			const a = ["-100.75", "100.75", "-0.0000000000000000000001", "5.5"];
			const b = ["50.25", "-200.5", "0.0000000000000000000003", "-5.500000000000000000001"];
			assert.deepEqual(vectorAddDecimalIterative(a, b, 25), [
				"-50.5",
				"-99.75",
				"0.0000000000000000000002",
				"-0.000000000000000000001",
			]);
		});

		it("supports precision = 0 (rounds to nearest integer, half-away-from-zero)", () => {
			const a = ["0.4", "0.5", "-0.4", "-0.5", "2.5", "-2.5", "10.99"];
			const b = ["0", "0", "0", "0", "0", "0", "0.01"];
			assert.deepEqual(vectorAddDecimalIterative(a, b, 0), [
				"0",
				"1",
				"0",
				"-1",
				"3",
				"-3",
				"11",
			]);
		});

		it("throws TypeError on non-array vectors or non-string elements", () => {
			assert.throws(() => vectorAddDecimalIterative(null, []), TypeError);
			assert.throws(() => vectorAddDecimalIterative([], undefined), TypeError);
			assert.throws(() => vectorAddDecimalIterative("1", ["1"]), TypeError);
			assert.throws(() => vectorAddDecimalIterative({ length: 0 }, []), TypeError);
			assert.throws(() => vectorAddDecimalIterative([1], ["1"]), TypeError);
			assert.throws(() => vectorAddDecimalIterative(["1"], [1n]), TypeError);
			assert.throws(() => vectorAddDecimalIterative(["1"], [null]), TypeError);
			// Sparse array hole
			const sparse = new Array(1);
			assert.throws(() => vectorAddDecimalIterative(sparse, ["1"]), TypeError);
		});

		it("throws RangeError on mismatched lengths", () => {
			assert.throws(() => vectorAddDecimalIterative(["1"], ["1", "2"]), RangeError);
			assert.throws(() => vectorAddDecimalIterative(["1", "2"], []), RangeError);
		});

		it("throws RangeError on malformed decimal strings or out-of-range exponents", () => {
			const invalid = [
				"",
				"   ",
				" 1.0",
				"1.0 ",
				"abc",
				"NaN",
				"Infinity",
				"-Infinity",
				".",
				"+",
				"-",
				"1.2.3",
				"--1",
				"1e",
				"1e+",
				"1_000",
				"1e200000",
				"1e-200000",
			];
			for (const bad of invalid) {
				assert.throws(
					() => vectorAddDecimalIterative([bad], ["0"]),
					RangeError,
					`Expected RangeError for invalid input ${JSON.stringify(bad)}`,
				);
			}
		});

		it("validates precision parameter strictly", () => {
			assert.throws(() => vectorAddDecimalIterative(["1"], ["1"], "2"), TypeError);
			assert.throws(() => vectorAddDecimalIterative(["1"], ["1"], null), TypeError);
			assert.throws(() => vectorAddDecimalIterative(["1"], ["1"], -1), RangeError);
			assert.throws(() => vectorAddDecimalIterative(["1"], ["1"], 1.5), RangeError);
			assert.throws(() => vectorAddDecimalIterative(["1"], ["1"], Number.NaN), RangeError);
			assert.throws(() => vectorAddDecimalIterative(["1"], ["1"], Number.POSITIVE_INFINITY), RangeError);
			assert.throws(
				() => vectorAddDecimalIterative(["1"], ["1"], Number.MAX_SAFE_INTEGER + 1),
				RangeError,
			);
		});
	});

	describe("independent cross-checks", () => {
		it("satisfies commutativity (a + b = b + a) and associativity ((a + b) + c = a + (b + c))", () => {
			const a = [
				"12345678901234567890.12345678901234567890123456789",
				"-0.00000000000000000000000000987654321",
				"3.14159265358979323846264338327950288",
			];
			const b = [
				"-9876543210987654321.98765432109876543210987654321",
				"0.00000000000000000000000001234567891",
				"2.71828182845904523536028747135266249",
			];
			const c = [
				"5555555555555555555.55555555555555555555555555555",
				"-0.00000000000000000000000000246913570",
				"-5.85987448204883847382293085463216537",
			];

			// Commutativity
			assert.deepEqual(
				vectorAddDecimalIterative(a, b, 40),
				vectorAddDecimalIterative(b, a, 40),
			);

			// Associativity
			const leftAssoc = vectorAddDecimalIterative(
				vectorAddDecimalIterative(a, b, 40),
				c,
				40,
			);
			const rightAssoc = vectorAddDecimalIterative(
				a,
				vectorAddDecimalIterative(b, c, 40),
				40,
			);
			assert.deepEqual(leftAssoc, rightAssoc);
		});

		it("matches exact rational (BigInt numerator/denominator) addition componentwise", () => {
			const a = [
				"0.1",
				"-12345678901234567890123456.789012345678901234567890123456",
				"1.25e-18",
				"999999999999999999.999999999999999999",
				"-0.000000000000000000000000000000000005",
				"42",
			];
			const b = [
				"0.2",
				"12345678901234567890123456.789012345678901234567890123457",
				"-7.5e-19",
				"0.000000000000000001",
				"0.000000000000000000000000000000000005",
				"-42.0000000000000000000000000000000001",
			];

			const actual = vectorAddDecimalIterative(a, b, 40);

			for (let i = 0; i < a.length; i += 1) {
				const expectedRational = addRationals(
					parseToRational(a[i]),
					parseToRational(b[i]),
				);
				const actualRational = parseToRational(actual[i]);
				assert.deepEqual(
					actualRational,
					expectedRational,
					`Rational mismatch at index ${i}: actual=${actual[i]}`,
				);
			}
		});
	});
});
