import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summationDecimalIterative } from "./summationDecimalIterative.js";

describe("summationDecimalIterative", () => {
	describe("normal cases", () => {
		it("avoids IEEE-754 binary floating-point rounding error for 0.1 + 0.2", () => {
			assert.equal(summationDecimalIterative(["0.1", "0.2"]), "0.3");
			assert.equal(
				summationDecimalIterative(["0.1", "0.2", "0.3", "0.4"]),
				"1",
			);
		});

		it("handles integers, mixed signs, leading '+', and alternate decimal forms", () => {
			assert.equal(summationDecimalIterative(["10", "20", "30"]), "60");
			assert.equal(summationDecimalIterative(["+12.50", "-2.25", ".75", "4."]), "15");
			assert.equal(summationDecimalIterative(["-100.5", "-200.25", "+50.75"]), "-250");
			assert.equal(summationDecimalIterative([" 1.25 ", " 2.75 "]), "4");
		});

		it("sums high-precision 35-50+ digit decimal strings with varying scales", () => {
			const values = [
				"3.14159265358979323846264338327950288419716939937510",
				"2.71828182845904523536028747135266249775724709369995",
				"1.41421356237309504880168872420969807856967187537694",
				"-0.27408804442193352262461957884186346052408836845199",
			];
			// Exact sum of these 4 50-digit decimals is 7
			assert.equal(summationDecimalIterative(values, 50), "7");

			const highPrec = [
				"123456789012345678901234567890.00000000000000000000000000000000001",
				"0.12345678901234567890123456789012345",
				"0.00000000000000000000000000000000004",
				"876543210987654321098765432109.87654321098765432109876543210987650",
			];
			assert.equal(
				summationDecimalIterative(highPrec, 40),
				"1000000000000000000000000000000",
			);
		});

		it("supports scientific notation strings cleanly", () => {
			assert.equal(
				summationDecimalIterative(["1.5e-25", "2.5e-25", "6e-25"], 30),
				"0.000000000000000000000001",
			);
			assert.equal(
				summationDecimalIterative(["1.25E+10", "-2.5e9", "5e8"]),
				"10500000000",
			);
		});

		it("applies default precision of 20 and custom precision rounding (half-away-from-zero)", () => {
			const val = ["0.123456789012345678905"];
			// 21st digit is 5 -> rounds half away from zero at 20th digit
			assert.equal(summationDecimalIterative(val), "0.12345678901234567891");
			assert.equal(summationDecimalIterative(val, 21), "0.123456789012345678905");
			assert.equal(summationDecimalIterative(["0.125"], 2), "0.13");
			assert.equal(summationDecimalIterative(["-0.125"], 2), "-0.13");
			assert.equal(summationDecimalIterative(["0.124"], 2), "0.12");
			assert.equal(summationDecimalIterative(["-0.124"], 2), "-0.12");
		});
	});

	describe("edge cases", () => {
		it("returns '0' for empty array and all-zero inputs", () => {
			assert.equal(summationDecimalIterative([]), "0");
			assert.equal(summationDecimalIterative([], 0), "0");
			assert.equal(summationDecimalIterative(["0"]), "0");
			assert.equal(summationDecimalIterative(["-0", "+0.000", "0.0e-10", "-0e+5"]), "0");
		});

		it("handles single element arrays", () => {
			assert.equal(summationDecimalIterative(["42"]), "42");
			assert.equal(summationDecimalIterative(["-0.0000000000000000000000001"], 30), "-0.0000000000000000000000001");
			assert.equal(summationDecimalIterative(["000123.45000"]), "123.45");
		});

		it("handles exact positive/negative cancellation without producing '-0'", () => {
			assert.equal(
				summationDecimalIterative([
					"999999999999999999999999999999.12345678901234567890123456789",
					"-999999999999999999999999999999.12345678901234567890123456789",
				], 30),
				"0",
			);
			// Negative value rounding to zero must be "0", never "-0"
			assert.equal(summationDecimalIterative(["-0.0001"], 2), "0");
			assert.equal(summationDecimalIterative(["-0.49"], 0), "0");
		});

		it("preserves tiny terms added to huge terms where IEEE-754 float64 loses precision", () => {
			const huge = "10000000000000000000000000000000000000000"; // 10^40
			const tiny = "0.0000000000000000000000000000000000000001"; // 10^-40
			assert.equal(
				summationDecimalIterative([huge, tiny], 40),
				"10000000000000000000000000000000000000000.0000000000000000000000000000000000000001",
			);
			assert.equal(
				summationDecimalIterative([huge, tiny, `-${huge}`], 40),
				tiny,
			);
		});

		it("handles precision = 0 and carries across decimal boundaries", () => {
			assert.equal(summationDecimalIterative(["1.4", "1.1"], 0), "3");
			assert.equal(summationDecimalIterative(["-1.4", "-1.1"], 0), "-3");
			assert.equal(summationDecimalIterative(["1.2", "1.2"], 0), "2");
			assert.equal(summationDecimalIterative(["1.999"], 2), "2");
			assert.equal(summationDecimalIterative(["-9.995"], 2), "-10");
			assert.equal(summationDecimalIterative(["999.9999"], 3), "1000");
		});

		it("validates inputs strictly and throws descriptive TypeError/RangeError", () => {
			// Invalid values container
			assert.throws(() => summationDecimalIterative(null), TypeError);
			assert.throws(() => summationDecimalIterative(undefined), TypeError);
			assert.throws(() => summationDecimalIterative("1.23"), TypeError);
			assert.throws(() => summationDecimalIterative(123), TypeError);
			assert.throws(() => summationDecimalIterative({}), TypeError);

			// Invalid array elements
			assert.throws(() => summationDecimalIterative([1, 2]), TypeError);
			assert.throws(() => summationDecimalIterative(["1", null]), TypeError);
			assert.throws(() => summationDecimalIterative(["1", undefined]), TypeError);
			assert.throws(() => summationDecimalIterative([""]), TypeError);
			assert.throws(() => summationDecimalIterative(["   "]), TypeError);
			assert.throws(() => summationDecimalIterative(["abc"]), TypeError);
			assert.throws(() => summationDecimalIterative(["NaN"]), TypeError);
			assert.throws(() => summationDecimalIterative(["Infinity"]), TypeError);
			assert.throws(() => summationDecimalIterative(["-Infinity"]), TypeError);
			assert.throws(() => summationDecimalIterative(["1.2.3"]), TypeError);
			assert.throws(() => summationDecimalIterative(["."]), TypeError);
			assert.throws(() => summationDecimalIterative(["+"]), TypeError);
			assert.throws(() => summationDecimalIterative(["-"]), TypeError);
			assert.throws(() => summationDecimalIterative(["1e"]), TypeError);
			assert.throws(() => summationDecimalIterative(["1 2"]), TypeError);
			assert.throws(() => summationDecimalIterative(["1e999999999999999999"]), RangeError);

			// Invalid precision
			assert.throws(() => summationDecimalIterative(["1"], "2"), TypeError);
			assert.throws(() => summationDecimalIterative(["1"], null), TypeError);
			assert.throws(() => summationDecimalIterative(["1"], NaN), TypeError);
			assert.throws(() => summationDecimalIterative(["1"], -1), RangeError);
			assert.throws(() => summationDecimalIterative(["1"], 1.5), RangeError);
			assert.throws(() => summationDecimalIterative(["1"], Infinity), RangeError);
		});
	});

	describe("independent mathematical cross-checks", () => {
		it("matches Gauss arithmetic series closed form sum_{k=1}^n (a + k*d) = n*a + d*n*(n+1)/2 at 30+ digits", () => {
			const n = 200n;
			// Choose exact high-precision decimals scaled by 10^30
			const scale = 30;
			const aScaled = 123456789012345678901234567890123n; // 123.456789012345678901234567890123
			const dScaled = 700000000000000000000000000003n; // 0.700000000000000000000000000003

			const formatScaled = (val) => {
				const s = val.toString().padStart(scale + 1, "0");
				const intPart = s.slice(0, s.length - scale);
				const fracPart = s.slice(s.length - scale).replace(/0+$/, "");
				return fracPart ? `${intPart}.${fracPart}` : intPart;
			};

			const terms = [];
			for (let k = 1n; k <= n; k++) {
				terms.push(formatScaled(aScaled + k * dScaled));
			}

			// Closed form: n * a + d * n * (n + 1) / 2
			const closedFormScaled = n * aScaled + (dScaled * n * (n + 1n)) / 2n;
			const expected = formatScaled(closedFormScaled);

			assert.equal(summationDecimalIterative(terms, 35), expected);
		});

		it("matches geometric series closed form sum_{k=0}^{49} 2^(-k) = 2 - 2^(-49) to 50 decimal places", () => {
			// Exact representation of 2^(-k) = 5^k * 10^(-k)
			const terms = [];
			for (let k = 0; k < 50; k++) {
				const num = 5n ** BigInt(k);
				if (k === 0) {
					terms.push("1");
				} else {
					const digits = num.toString().padStart(k, "0");
					terms.push(`0.${digits}`);
				}
			}

			// Closed form: 2 - 2^(-49) = (2 * 10^49 - 5^49) / 10^49
			const exactScaled = 2n * (10n ** 49n) - (5n ** 49n);
			const s = exactScaled.toString();
			const expected = `${s.slice(0, s.length - 49)}.${s.slice(s.length - 49)}`;

			assert.equal(summationDecimalIterative(terms, 50), expected);
		});

		it("is strictly order-independent across forward, reversed, and interleaved extreme-magnitude permutations", () => {
			const terms = [
				"1e35",
				"0.00000000000000000000000000000123456789",
				"-1e35",
				"98765432109876543210.11111111111111111111111111111",
				"-98765432109876543210.11111111111111111111111111111",
				"5.5e25",
				"0.00000000000000000000000000000876543211",
				"-5.5e25",
			];

			const forward = summationDecimalIterative(terms, 40);
			const reversed = summationDecimalIterative([...terms].reverse(), 40);
			// Interleave sorted by length/sign
			const permuted = [
				terms[0], terms[5], terms[1], terms[3], terms[6], terms[2], terms[7], terms[4],
			];
			const interleaved = summationDecimalIterative(permuted, 40);

			const expected = "0.00000000000000000000000000001";
			assert.equal(forward, expected);
			assert.equal(reversed, expected);
			assert.equal(interleaved, expected);
		});
	});
});
