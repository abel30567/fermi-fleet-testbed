import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sqrtFloatIterative } from './sqrtFloatIterative.js';

/**
 * Computes the ULP distance between two finite float64 numbers using IEEE-754
 * bit representation.
 */
function ulpDistance(a, b) {
	if (a === b) return 0n;
	const buf = new ArrayBuffer(16);
	const f64 = new Float64Array(buf);
	const u64 = new BigUint64Array(buf);
	f64[0] = a;
	f64[1] = b;
	const toOrdered = (bits) =>
		bits >> 63n ? ~bits & 0xffffffffffffffffn : bits | 0x8000000000000000n;
	const oa = toOrdered(u64[0]);
	const ob = toOrdered(u64[1]);
	return oa > ob ? oa - ob : ob - oa;
}

describe('sqrtFloatIterative', () => {
	describe('input validation', () => {
		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'4',
				'0',
				'',
				true,
				false,
				4n,
				0n,
				{},
				[4],
				Symbol('sqrt'),
				() => 4,
			];

			for (const value of invalidInputs) {
				assert.throws(
					() => sqrtFloatIterative(value),
					{ name: 'TypeError' },
					`Expected TypeError for input ${String(value)}`,
				);
			}
		});
	});

	describe('normal cases', () => {
		it('computes exact square roots for perfect integer squares', () => {
			const cases = [
				[1, 1],
				[4, 2],
				[9, 3],
				[16, 4],
				[25, 5],
				[36, 6],
				[49, 7],
				[64, 8],
				[81, 9],
				[100, 10],
				[144, 12],
				[10000, 100],
				[67108864, 8192],
				[(2 ** 26 - 1) ** 2, 2 ** 26 - 1],
			];

			for (const [input, expected] of cases) {
				assert.equal(sqrtFloatIterative(input), expected);
			}
		});

		it('computes exact square roots for exact fractional squares', () => {
			const cases = [
				[0.25, 0.5],
				[0.0625, 0.25],
				[2.25, 1.5],
				[6.25, 2.5],
				[1 / 1024, 1 / 32],
				[2 ** -52, 2 ** -26],
			];

			for (const [input, expected] of cases) {
				assert.equal(sqrtFloatIterative(input), expected);
			}
		});

		it('computes accurate square roots for irrational values', () => {
			const inputs = [2, 3, 5, 7, 10, 0.5, 0.1, Math.PI, Math.E, 123456.789];
			for (const x of inputs) {
				const actual = sqrtFloatIterative(x);
				const expected = Math.sqrt(x);
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`Expected <= 1 ULP for sqrt(${x}): got ${actual}, expected ${expected}`,
				);
			}
		});
	});

	describe('edge cases and IEEE-754 special values', () => {
		it('preserves signed zeros (+0 and -0)', () => {
			assert.ok(Object.is(sqrtFloatIterative(0), 0));
			assert.ok(Object.is(sqrtFloatIterative(-0), -0));
		});

		it('handles NaN and infinities per IEEE-754', () => {
			assert.ok(Number.isNaN(sqrtFloatIterative(NaN)));
			assert.equal(sqrtFloatIterative(Infinity), Infinity);
			assert.ok(Number.isNaN(sqrtFloatIterative(-Infinity)));
		});

		it('returns NaN for negative finite numbers', () => {
			const negatives = [
				-1,
				-0.25,
				-Number.MIN_VALUE,
				-Number.EPSILON,
				-Number.MAX_VALUE,
			];
			for (const x of negatives) {
				assert.ok(
					Number.isNaN(sqrtFloatIterative(x)),
					`Expected NaN for ${x}`,
				);
			}
		});

		it('handles extreme magnitudes including MAX_VALUE and subnormals', () => {
			const smallestNormal = 2 ** -1022;
			const largestSubnormal = smallestNormal - Number.MIN_VALUE;
			const extremes = [
				Number.MAX_VALUE,
				Number.MAX_VALUE / 2,
				2 ** 1023,
				2 ** 1022,
				2 ** 512,
				2 ** 511,
				2 ** -512,
				2 ** -511,
				smallestNormal,
				largestSubnormal,
				Number.MIN_VALUE * 16,
				Number.MIN_VALUE * 2,
				Number.MIN_VALUE,
			];

			for (const x of extremes) {
				const actual = sqrtFloatIterative(x);
				const expected = Math.sqrt(x);
				assert.ok(Number.isFinite(actual) && actual > 0);
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`Expected <= 1 ULP for extreme input ${x}: got ${actual}, expected ${expected}`,
				);
			}
		});

		it('handles boundary values around range-reduction thresholds', () => {
			const boundaries = [
				1 - Number.EPSILON / 2,
				1,
				1 + Number.EPSILON,
				4 - 2 ** -50,
				4,
				4 + 2 ** -50,
				0.25 - 2 ** -54,
				0.25,
				0.25 + 2 ** -54,
			];

			for (const x of boundaries) {
				const actual = sqrtFloatIterative(x);
				const expected = Math.sqrt(x);
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`Expected <= 1 ULP for boundary ${x}: got ${actual}, expected ${expected}`,
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches Math.sqrt within 1 ULP across a deterministic sweep of magnitudes', () => {
			// Deterministic PRNG (Mulberry32) covering mantissas across full exponent range.
			let state = 0x12345678;
			const nextFloat = () => {
				state = (state + 0x6d2b79f5) | 0;
				let t = Math.imul(state ^ (state >>> 15), 1 | state);
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};

			const exponents = [-1074, -1050, -1022, -512, -100, -1, 0, 1, 53, 512, 1022];
			for (const exp of exponents) {
				for (let i = 0; i < 50; i++) {
					const mantissa = 1 + nextFloat();
					const x = mantissa * 2 ** exp;
					if (x === 0 || !Number.isFinite(x)) continue;
					const actual = sqrtFloatIterative(x);
					const expected = Math.sqrt(x);
					assert.ok(
						ulpDistance(actual, expected) <= 1n,
						`Mismatch at x=${x}: actual=${actual}, expected=${expected}, ulp=${ulpDistance(actual, expected)}`,
					);
				}
			}
		});

		it('satisfies the inverse squaring identity sqrt(x)^2 ≈ x (independent of Math.sqrt)', () => {
			const samples = [
				1e-100, 1e-10, 0.001, 0.3, 0.7, 1.5, 2, 3, 7, 42, 1e12, 1e100,
			];
			for (const x of samples) {
				const r = sqrtFloatIterative(x);
				const reconstructed = r * r;
				const relError = Math.abs(reconstructed - x) / x;
				assert.ok(
					relError <= 4 * Number.EPSILON,
					`Inverse identity failed for ${x}: relError=${relError}`,
				);
			}
		});

		it('satisfies multiplicative identity sqrt(a * b) ≈ sqrt(a) * sqrt(b) and monotonicity', () => {
			const pairs = [
				[2, 3],
				[5, 7],
				[0.125, 128],
				[1e-40, 1e60],
				[13.37, 98.76],
			];
			for (const [a, b] of pairs) {
				const lhs = sqrtFloatIterative(a * b);
				const rhs = sqrtFloatIterative(a) * sqrtFloatIterative(b);
				const relError = Math.abs(lhs - rhs) / lhs;
				assert.ok(
					relError <= 4 * Number.EPSILON,
					`Multiplicative identity failed for (${a}, ${b}): relError=${relError}`,
				);
			}

			const ordered = [
				0,
				Number.MIN_VALUE,
				2 ** -1022,
				1e-100,
				0.25,
				0.5,
				1,
				2,
				3.9999999999999996,
				4,
				100,
				1e100,
				Number.MAX_VALUE,
				Infinity,
			];
			for (let i = 1; i < ordered.length; i++) {
				const prev = sqrtFloatIterative(ordered[i - 1]);
				const curr = sqrtFloatIterative(ordered[i]);
				assert.ok(
					prev <= curr,
					`Monotonicity violated: sqrt(${ordered[i - 1]})=${prev} > sqrt(${ordered[i]})=${curr}`,
				);
			}
		});
	});
});
