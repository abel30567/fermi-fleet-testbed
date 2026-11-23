import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { multiplyFloatSeries } from "./multiplyFloatSeries.js";

/**
 * Deterministic 32-bit PRNG (Mulberry32) for reproducible property testing.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Constructs a float64 directly from sign, 11-bit biased exponent, and 52-bit fraction.
 *
 * @param {number} sign
 * @param {number} biasedExp
 * @param {bigint} frac
 * @returns {number}
 */
function fromFloat64Bits(sign, biasedExp, frac) {
	const buf = new ArrayBuffer(8);
	const u64 = new BigUint64Array(buf);
	const f64 = new Float64Array(buf);
	u64[0] = (BigInt(sign) << 63n) | (BigInt(biasedExp) << 52n) | frac;
	return f64[0];
}

describe("multiplyFloatSeries", () => {
	describe("normal cases", () => {
		it("multiplies positive and negative integers accurately", () => {
			assert.strictEqual(multiplyFloatSeries(0, 0), 0);
			assert.strictEqual(multiplyFloatSeries(1, 1), 1);
			assert.strictEqual(multiplyFloatSeries(6, 7), 42);
			assert.strictEqual(multiplyFloatSeries(-6, 7), -42);
			assert.strictEqual(multiplyFloatSeries(6, -7), -42);
			assert.strictEqual(multiplyFloatSeries(-6, -7), 42);
			assert.strictEqual(
				multiplyFloatSeries(12345678, 87654321),
				12345678 * 87654321,
			);
		});

		it("multiplies fractional and irrational float64 values accurately", () => {
			const pairs = [
				[0.1, 0.2],
				[0.3, 0.7],
				[Math.PI, Math.E],
				[-Math.SQRT2, Math.LN10],
				[1.5, 1.5],
				[1 / 3, 3],
				[1 / 7, 1 / 11],
				[1e20, 1e-20],
				[1e100, 1e-100],
				[Number.MAX_SAFE_INTEGER, 0.5],
				[Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			];
			for (const [a, b] of pairs) {
				assert.ok(
					Object.is(multiplyFloatSeries(a, b), a * b),
					`Expected ${a} * ${b} = ${a * b}, got ${multiplyFloatSeries(a, b)}`,
				);
			}
		});
	});

	describe("IEEE-754 edge cases", () => {
		it("preserves signed zeros", () => {
			assert.ok(Object.is(multiplyFloatSeries(0, 0), 0));
			assert.ok(Object.is(multiplyFloatSeries(0, -0), -0));
			assert.ok(Object.is(multiplyFloatSeries(-0, 0), -0));
			assert.ok(Object.is(multiplyFloatSeries(-0, -0), 0));
			assert.ok(Object.is(multiplyFloatSeries(5, -0), -0));
			assert.ok(Object.is(multiplyFloatSeries(-5, 0), -0));
			assert.ok(Object.is(multiplyFloatSeries(-5, -0), 0));
			assert.ok(Object.is(multiplyFloatSeries(Number.MAX_VALUE, -0), -0));
		});

		it("handles Infinity, -Infinity, and NaN per IEEE-754", () => {
			assert.ok(Object.is(multiplyFloatSeries(Infinity, 2), Infinity));
			assert.ok(Object.is(multiplyFloatSeries(Infinity, -2), -Infinity));
			assert.ok(Object.is(multiplyFloatSeries(-Infinity, 2), -Infinity));
			assert.ok(Object.is(multiplyFloatSeries(-Infinity, -2), Infinity));
			assert.ok(Object.is(multiplyFloatSeries(Infinity, Infinity), Infinity));
			assert.ok(Object.is(multiplyFloatSeries(Infinity, -Infinity), -Infinity));
			assert.ok(Object.is(multiplyFloatSeries(-Infinity, -Infinity), Infinity));

			assert.ok(Number.isNaN(multiplyFloatSeries(Infinity, 0)));
			assert.ok(Number.isNaN(multiplyFloatSeries(Infinity, -0)));
			assert.ok(Number.isNaN(multiplyFloatSeries(-Infinity, 0)));
			assert.ok(Number.isNaN(multiplyFloatSeries(0, Infinity)));
			assert.ok(Number.isNaN(multiplyFloatSeries(NaN, 1)));
			assert.ok(Number.isNaN(multiplyFloatSeries(1, NaN)));
			assert.ok(Number.isNaN(multiplyFloatSeries(NaN, NaN)));
			assert.ok(Number.isNaN(multiplyFloatSeries(NaN, Infinity)));
			assert.ok(Number.isNaN(multiplyFloatSeries(NaN, 0)));
		});

		it("handles subnormals, underflow, and subnormal-to-normal transitions", () => {
			const largestSubnormal = fromFloat64Bits(0, 0, (1n << 52n) - 1n);
			const smallestNormal = fromFloat64Bits(0, 1, 0n);

			const cases = [
				[Number.MIN_VALUE, 1],
				[Number.MIN_VALUE, -1],
				[Number.MIN_VALUE, 2],
				[Number.MIN_VALUE, 0.5], // exact halfway -> rounds to +0
				[-Number.MIN_VALUE, 0.5], // exact halfway -> rounds to -0
				[Number.MIN_VALUE, 0.5 + Number.EPSILON], // strictly > halfway -> MIN_VALUE
				[Number.MIN_VALUE, 1.5], // exact halfway to even -> 2 * MIN_VALUE
				[Number.MIN_VALUE, Number.MIN_VALUE], // deep underflow -> +0
				[-Number.MIN_VALUE, Number.MIN_VALUE], // deep underflow -> -0
				[Number.MIN_VALUE, Number.MAX_VALUE], // extreme scale cancellation
				[largestSubnormal, 1],
				[largestSubnormal, 1 + Number.EPSILON], // crosses into smallestNormal
				[smallestNormal, 0.5], // crosses into subnormal
				[smallestNormal, 0.75],
				[1e-200, 1e-120], // normal * normal -> subnormal
				[1e-200, -1e-200], // normal * normal -> -0
			];

			for (const [a, b] of cases) {
				const actual = multiplyFloatSeries(a, b);
				const expected = a * b;
				assert.ok(
					Object.is(actual, expected),
					`Mismatch for (${a}, ${b}): got ${actual}, expected ${expected}`,
				);
			}
		});

		it("handles overflow and rounding carries into Infinity", () => {
			const nearSqrtMax = fromFloat64Bits(0, 1535, (1n << 52n) - 1n);
			const nearOverflowA = fromFloat64Bits(0, 2046, (1n << 52n) - 1n); // MAX_VALUE
			const slightlyOverOne = 1 + Number.EPSILON;
			// Pair whose product has biasedExp=2046 before rounding and carries to 2047 (Infinity)
			const carryA = fromFloat64Bits(0, 2045, 0x0006a09e667f3bccn);
			const carryB = fromFloat64Bits(0, 1023, 0x0006a09e667f3bcdn);

			const cases = [
				[Number.MAX_VALUE, 1],
				[Number.MAX_VALUE, -1],
				[Number.MAX_VALUE, 2],
				[-Number.MAX_VALUE, 2],
				[nearOverflowA, slightlyOverOne],
				[nearSqrtMax, nearSqrtMax],
				[1e200, 1e200],
				[-1e200, 1e200],
				[carryA, carryB],
			];

			for (const [a, b] of cases) {
				const actual = multiplyFloatSeries(a, b);
				const expected = a * b;
				assert.ok(
					Object.is(actual, expected),
					`Mismatch for (${a}, ${b}): got ${actual}, expected ${expected}`,
				);
			}
		});

		it("handles exact round-to-nearest-even tie cases", () => {
			// (1 + 2^-52) * (1 + 2^-1) = 1.5 + 2^-52 + 2^-53
			// At exponent 0, ULP is 2^-52, so +2^-53 is exact halfway; LSB is odd -> rounds up
			const oddTie = 1 + Number.EPSILON;
			const evenTie = 1 + 2 * Number.EPSILON;
			const cases = [
				[oddTie, 1.5],
				[evenTie, 1.5],
				[1 + Number.EPSILON, 1 + Number.EPSILON],
				[1 + 3 * Number.EPSILON, 1 + 5 * Number.EPSILON],
				[2 - Number.EPSILON, 2 - Number.EPSILON],
				[
					fromFloat64Bits(0, 1023, (1n << 52n) - 1n),
					fromFloat64Bits(0, 1023, (1n << 52n) - 1n),
				],
			];

			for (const [a, b] of cases) {
				assert.ok(
					Object.is(multiplyFloatSeries(a, b), a * b),
					`Tie rounding mismatch for (${a}, ${b})`,
				);
			}
		});
	});

	describe("input validation", () => {
		it("throws TypeError for non-number operands", () => {
			const invalidValues = [
				"2",
				"",
				null,
				undefined,
				true,
				false,
				2n,
				{},
				[2],
				Symbol("x"),
				() => 2,
				// biome-ignore lint/style/useNumberNamespace: intentional boxed Number check
				new Number(2),
			];

			for (const bad of invalidValues) {
				assert.throws(
					() => multiplyFloatSeries(bad, 1),
					{ name: "TypeError" },
					`Expected TypeError for first arg: ${String(bad)}`,
				);
				assert.throws(
					() => multiplyFloatSeries(1, bad),
					{ name: "TypeError" },
					`Expected TypeError for second arg: ${String(bad)}`,
				);
			}

			assert.throws(() => multiplyFloatSeries(), { name: "TypeError" });
			assert.throws(() => multiplyFloatSeries(1), { name: "TypeError" });
		});
	});

	describe("independent cross-checks", () => {
		it("matches native IEEE-754 multiplication bit-for-bit across 2,000 pseudorandom pairs", () => {
			const rand = createPrng(0xc0ffee42);

			const randomFloat = () => {
				const sign = rand() < 0.5 ? 0 : 1;
				const bucket = rand();
				let biasedExp;
				if (bucket < 0.15) {
					// Subnormal
					biasedExp = 0;
				} else if (bucket < 0.3) {
					// Near underflow or overflow
					biasedExp =
						rand() < 0.5
							? 1 + Math.floor(rand() * 30)
							: 2016 + Math.floor(rand() * 31);
				} else {
					// General normal range
					biasedExp = 1 + Math.floor(rand() * 2046);
				}
				const hi = BigInt(Math.floor(rand() * 0x100000)); // 20 bits
				const lo = BigInt(Math.floor(rand() * 0x100000000)); // 32 bits
				const frac = (hi << 32n) | lo;
				return fromFloat64Bits(sign, biasedExp, frac);
			};

			for (let i = 0; i < 2000; i++) {
				const a = randomFloat();
				const b = randomFloat();
				const actual = multiplyFloatSeries(a, b);
				const expected = a * b;
				assert.ok(
					Object.is(actual, expected),
					`Iteration ${i}: (${a}, ${b}) -> got ${actual}, expected ${expected}`,
				);
			}
		});

		it("agrees with the independent log-exp identity exp(ln|a| + ln|b|)", () => {
			const pairs = [
				[2.718281828459045, 3.141592653589793],
				[-123.456, 789.012],
				[0.00042, -987654.321],
				[1e-50, 1e60],
				[-1e100, -1e-40],
			];

			for (const [a, b] of pairs) {
				const actual = multiplyFloatSeries(a, b);
				const logExpEstimate =
					Math.sign(a) *
					Math.sign(b) *
					Math.exp(Math.log(Math.abs(a)) + Math.log(Math.abs(b)));
				const relErr =
					Math.abs(actual - logExpEstimate) / Math.abs(logExpEstimate);
				assert.ok(
					relErr < 1e-13,
					`Log-exp cross-check failed for (${a}, ${b}): relErr=${relErr}`,
				);
			}
		});

		it("satisfies commutativity, identity, negation, and power-of-two scaling", () => {
			const samples = [
				-1e100,
				-Math.PI,
				-1,
				-Number.MIN_VALUE,
				-0,
				0,
				Number.MIN_VALUE,
				0.1,
				1,
				Math.SQRT2,
				1e100,
			];

			for (const a of samples) {
				assert.ok(Object.is(multiplyFloatSeries(a, 1), a));
				assert.ok(Object.is(multiplyFloatSeries(1, a), a));
				assert.ok(Object.is(multiplyFloatSeries(a, -1), -a));
				for (const b of samples) {
					assert.ok(
						Object.is(multiplyFloatSeries(a, b), multiplyFloatSeries(b, a)),
						`Commutativity failed for (${a}, ${b})`,
					);
				}
			}
		});
	});
});
