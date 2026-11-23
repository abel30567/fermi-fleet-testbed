import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sqrtBigIntSeries, SCALE } from './sqrtBigIntSeries.js';

const SCALE_SQUARED = SCALE * SCALE;

/**
 * Independent reference oracle using integer Babylonian/Newton isqrt
 * to compute exact round(sqrt(x * 10^36)).
 * @param {bigint} x
 * @returns {bigint}
 */
function referenceRoundedSqrt(x) {
	if (x === 0n) return 0n;
	const X = x * SCALE_SQUARED;
	let r = 1n << BigInt((X.toString(2).length + 1) >> 1);
	while (true) {
		const next = (r + X / r) >> 1n;
		if (next >= r) break;
		r = next;
	}
	// r = floor(sqrt(X)). Round to nearest: r + 1 iff (2r + 1)^2 < 4X.
	return (2n * r + 1n) * (2n * r + 1n) < 4n * X ? r + 1n : r;
}

/**
 * Verifies the exact nearest-integer bracketing invariant:
 *   r - 1/2 < sqrt(x * 10^36) < r + 1/2
 *   <=> (2r - 1)^2 < 4 * x * 10^36 < (2r + 1)^2  (for x > 0)
 * @param {bigint} x
 * @param {bigint} r
 */
function assertExactNearestSqrt(x, r) {
	if (x === 0n) {
		assert.equal(r, 0n);
		return;
	}
	const fourX = 4n * x * SCALE_SQUARED;
	const lo = (2n * r - 1n) * (2n * r - 1n);
	const hi = (2n * r + 1n) * (2n * r + 1n);
	assert.ok(
		lo < fourX && fourX < hi,
		`Result ${r} is not the exact nearest integer to sqrt(${x}) * 10^18`,
	);
}

describe('sqrtBigIntSeries', () => {
	it('returns 0n for 0n', () => {
		assert.equal(sqrtBigIntSeries(0n), 0n);
	});

	it('computes exact scaled integers for small and large perfect squares', () => {
		const roots = [
			1n,
			2n,
			3n,
			4n,
			5n,
			10n,
			12n,
			100n,
			999n,
			10n ** 9n,
			10n ** 18n,
			10n ** 30n,
			12345678901234567890123456789n,
			(1n << 128n) - 1n,
		];
		for (const s of roots) {
			assert.equal(sqrtBigIntSeries(s * s), s * SCALE);
		}
	});

	it('matches known irrational square roots to all 18 decimal digits', () => {
		const known = [
			[2n, 1_414_213_562_373_095_049n],
			[3n, 1_732_050_807_568_877_294n],
			[5n, 2_236_067_977_499_789_696n],
			[7n, 2_645_751_311_064_590_591n],
			[10n, 3_162_277_660_168_379_332n],
			[1000n, 31_622_776_601_683_793_320n],
		];
		for (const [x, expected] of known) {
			assert.equal(sqrtBigIntSeries(x), expected);
		}
	});

	it('satisfies exact squaring-bracket invariant and matches Newton oracle for 0..200', () => {
		for (let i = 0n; i <= 200n; i += 1n) {
			const actual = sqrtBigIntSeries(i);
			assertExactNearestSqrt(i, actual);
			assert.equal(actual, referenceRoundedSqrt(i));
		}
	});

	it('handles edge values near powers of 2, powers of 10, and large squares', () => {
		const cases = [
			(1n << 31n) - 1n,
			1n << 31n,
			(1n << 31n) + 1n,
			(1n << 53n) - 1n,
			1n << 53n,
			(1n << 53n) + 1n,
			(1n << 64n) - 1n,
			1n << 64n,
			(1n << 64n) + 1n,
			(1n << 128n) - 1n,
			1n << 128n,
			(1n << 128n) + 1n,
			(1n << 256n) - 1n,
			1n << 256n,
			(1n << 256n) + 1n,
			1n << 512n,
			10n ** 18n - 1n,
			10n ** 18n + 1n,
			10n ** 36n - 1n,
			10n ** 36n + 1n,
			10n ** 50n,
			10n ** 100n - 1n,
			10n ** 100n + 1n,
			(10n ** 30n) ** 2n - 1n,
			(10n ** 30n) ** 2n + 1n,
		];
		for (const x of cases) {
			const actual = sqrtBigIntSeries(x);
			assertExactNearestSqrt(x, actual);
			assert.equal(actual, referenceRoundedSqrt(x));
		}
	});

	it('cross-checks against Math.sqrt for safe integer inputs', () => {
		const samples = [2, 3, 17, 42, 123456, 987654321, 9007199254740991];
		for (const n of samples) {
			const actual = Number(sqrtBigIntSeries(BigInt(n))) / 1e18;
			const expected = Math.sqrt(n);
			const relErr = Math.abs(actual - expected) / expected;
			assert.ok(relErr < 1e-15, `Relative error too large for ${n}: ${relErr}`);
		}
	});

	it('satisfies algebraic scaling and monotonicity identities', () => {
		const base = 13n;
		const rBase = sqrtBigIntSeries(base);
		for (const k of [2n, 7n, 100n, 12345n]) {
			const rScaled = sqrtBigIntSeries(k * k * base);
			const diff = rScaled > k * rBase ? rScaled - k * rBase : k * rBase - rScaled;
			assert.ok(diff <= k, `Scaling error ${diff} exceeded ${k}`);
		}
		assert.ok(sqrtBigIntSeries(99n) < sqrtBigIntSeries(100n));
		assert.ok(sqrtBigIntSeries(100n) < sqrtBigIntSeries(101n));
	});

	it('throws RangeError for negative BigInt inputs', () => {
		for (const bad of [-1n, -4n, -99999999999999999999n]) {
			assert.throws(() => sqrtBigIntSeries(bad), RangeError);
		}
	});

	it('throws TypeError for non-BigInt inputs', () => {
		const invalid = [
			0,
			4,
			2.5,
			NaN,
			Infinity,
			-Infinity,
			'4',
			null,
			undefined,
			true,
			{},
			[],
		];
		for (const bad of invalid) {
			assert.throws(() => sqrtBigIntSeries(bad), TypeError);
		}
	});
});
