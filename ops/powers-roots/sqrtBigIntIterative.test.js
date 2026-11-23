import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCALE, sqrtBigIntIterative } from './sqrtBigIntIterative.js';

const SCALE_SQUARED = SCALE * SCALE;

/**
 * Independent reference implementation using binary search over BigInt.
 * Computes floor(sqrt(n * 10^36)) without Newton's method.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function binarySearchSqrtScaled(n) {
	if (n === 0n) {
		return 0n;
	}
	const target = n * SCALE_SQUARED;
	let lo = 1n;
	let hi = 1n;
	while (hi * hi <= target) {
		lo = hi;
		hi <<= 1n;
	}
	while (lo + 1n < hi) {
		const mid = (lo + hi) >> 1n;
		if (mid * mid <= target) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return lo;
}

describe('sqrtBigIntIterative', () => {
	it('computes exact scaled square roots for perfect squares', () => {
		const cases = [
			[0n, 0n],
			[1n, 1n * SCALE],
			[4n, 2n * SCALE],
			[9n, 3n * SCALE],
			[16n, 4n * SCALE],
			[100n, 10n * SCALE],
			[10_000n, 100n * SCALE],
			[(10n ** 12n) ** 2n, 10n ** 12n * SCALE],
			[(123456789012345678901234567890n) ** 2n, 123456789012345678901234567890n * SCALE],
		];

		for (const [input, expected] of cases) {
			assert.equal(sqrtBigIntIterative(input), expected, `sqrt(${input}n)`);
		}
	});

	it('computes accurate 10^18 fixed-point roots for non-perfect squares', () => {
		// Known high-precision truncated values of sqrt(n) * 10^18
		const cases = [
			[2n, 1_414_213_562_373_095_048n],
			[3n, 1_732_050_807_568_877_293n],
			[5n, 2_236_067_977_499_789_696n],
			[6n, 2_449_489_742_783_178_098n],
			[7n, 2_645_751_311_064_590_590n],
			[8n, 2_828_427_124_746_190_097n],
			[10n, 3_162_277_660_168_379_331n],
		];

		for (const [input, expected] of cases) {
			assert.equal(sqrtBigIntIterative(input), expected, `sqrt(${input}n)`);
		}
	});

	it('handles boundary cases adjacent to perfect squares (k^2 - 1 and k^2 + 1)', () => {
		const roots = [1n, 2n, 3n, 10n, 10n ** 9n, 10n ** 25n, 1n << 128n];

		for (const k of roots) {
			const sq = k * k;
			for (const candidate of [sq - 1n, sq, sq + 1n]) {
				const r = sqrtBigIntIterative(candidate);
				const target = candidate * SCALE_SQUARED;
				assert.ok(r * r <= target, `r^2 <= target failed for ${candidate}n`);
				assert.ok((r + 1n) * (r + 1n) > target, `(r+1)^2 > target failed for ${candidate}n`);
			}
			// For k >= 10^25, sqrt(k^2 - 1) = k - 1/(2k) - ... so floor(sqrt(k^2 - 1) * 10^18) = k * 10^18 - 1
			if (k >= 10n ** 25n) {
				assert.equal(sqrtBigIntIterative(sq - 1n), k * SCALE - 1n);
				assert.equal(sqrtBigIntIterative(sq + 1n), k * SCALE);
			}
		}
	});

	it('handles arbitrarily large BigInts beyond IEEE 754 float64 range', () => {
		const hugeSquare = (10n ** 500n) ** 2n;
		assert.equal(sqrtBigIntIterative(hugeSquare), 10n ** 500n * SCALE);

		const hugeNonSquare = 2n * 10n ** 1000n;
		const r = sqrtBigIntIterative(hugeNonSquare);
		const target = hugeNonSquare * SCALE_SQUARED;
		assert.ok(r * r <= target);
		assert.ok((r + 1n) * (r + 1n) > target);
	});

	it('throws TypeError for non-BigInt inputs', () => {
		const invalidInputs = [0, 4, -1, 2.5, NaN, Infinity, '4', null, undefined, true, false, {}, []];
		for (const bad of invalidInputs) {
			assert.throws(() => sqrtBigIntIterative(bad), TypeError);
		}
	});

	it('throws RangeError for negative BigInt inputs', () => {
		const negatives = [-1n, -2n, -4n, -100n, -(10n ** 50n)];
		for (const neg of negatives) {
			assert.throws(() => sqrtBigIntIterative(neg), RangeError);
		}
	});

	it('matches independent binary-search reference implementation across diverse inputs', () => {
		const samples = [];
		for (let i = 0n; i <= 200n; i += 1n) {
			samples.push(i);
		}
		for (let exp = 8n; exp <= 256n; exp += 8n) {
			const pow2 = 1n << exp;
			samples.push(pow2 - 1n, pow2, pow2 + 1n);
		}
		samples.push(
			999_999_999_999_999_999n,
			10n ** 36n + 7n,
			31415926535897932384626433832795028841971n,
		);

		for (const n of samples) {
			const actual = sqrtBigIntIterative(n);
			const expected = binarySearchSqrtScaled(n);
			assert.equal(actual, expected, `binary-search cross-check failed for ${n}n`);
		}
	});

	it('agrees with Math.sqrt within float64 precision and satisfies exact floor bounds', () => {
		const inputs = [2n, 3n, 7n, 17n, 42n, 999n, 123_456n, 987_654_321n, 9_007_199_254_740_991n];
		for (const n of inputs) {
			const r = sqrtBigIntIterative(n);
			const target = n * SCALE_SQUARED;
			assert.ok(r * r <= target);
			assert.ok((r + 1n) * (r + 1n) > target);

			const asFloat = Number(r) / 1e18;
			const mathSqrt = Math.sqrt(Number(n));
			const relErr = Math.abs(asFloat - mathSqrt) / mathSqrt;
			assert.ok(relErr < 1e-14, `Math.sqrt cross-check relErr=${relErr} for ${n}n`);
		}
	});

	it('works cleanly when passed directly to Array.prototype.map', () => {
		const results = [0n, 1n, 4n, 9n].map(sqrtBigIntIterative);
		assert.deepEqual(results, [0n, 1n * SCALE, 2n * SCALE, 3n * SCALE]);
	});
});
