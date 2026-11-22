import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtBigIntRecursive, SCALE } from './cbrtBigIntRecursive.js';

/**
 * Independent iterative binary-search reference implementation computing
 * round(cbrt(n) * scale) using exact BigInt arithmetic.
 *
 * @param {bigint} n
 * @param {bigint} scale
 * @returns {bigint}
 */
function referenceCbrtBinarySearch(n, scale) {
	if (n === 0n) return 0n;
	const negative = n < 0n;
	const absN = negative ? -n : n;
	const target = absN * scale * scale * scale;

	let lo = 0n;
	let hi = 1n;
	while (hi * hi * hi <= target) {
		hi <<= 1n;
	}

	while (lo + 1n < hi) {
		const mid = (lo + hi) >> 1n;
		if (mid * mid * mid <= target) {
			lo = mid;
		} else {
			hi = mid;
		}
	}

	// Exact nearest-integer rounding: cbrt(target) >= lo + 1/2 iff 8*target >= (2*lo + 1)^3
	const twoLoPlusOne = 2n * lo + 1n;
	const rounded = 8n * target >= twoLoPlusOne * twoLoPlusOne * twoLoPlusOne ? lo + 1n : lo;
	return negative ? -rounded : rounded;
}

/**
 * Asserts that `r` is the exact closest integer to `cbrt(n) * scale`,
 * i.e. `|r| - 1/2 < cbrt(|n| * scale^3) < |r| + 1/2` (or exact equality for cubes).
 *
 * @param {bigint} n
 * @param {bigint} r
 * @param {bigint} [scale=SCALE]
 */
function assertExactNearestCbrt(n, r, scale = SCALE) {
	if (n === 0n) {
		assert.equal(r, 0n);
		return;
	}
	assert.equal(r < 0n, n < 0n, `Sign mismatch for n=${n}`);
	const absN = n < 0n ? -n : n;
	const absR = r < 0n ? -r : r;
	const target = absN * scale * scale * scale;
	const eightTarget = 8n * target;

	if (absR > 0n) {
		const lower = 2n * absR - 1n;
		assert.ok(
			lower * lower * lower <= eightTarget,
			`Result ${r} is too large for n=${n} (scale=${scale})`
		);
	}
	const upper = 2n * absR + 1n;
	assert.ok(
		eightTarget < upper * upper * upper,
		`Result ${r} is too small for n=${n} (scale=${scale})`
	);
}

describe('cbrtBigIntRecursive', () => {
	test('exports expected SCALE constant (10^18)', () => {
		assert.equal(SCALE, 10n ** 18n);
	});

	test('computes exact cube roots of perfect cubes (positive, negative, and zero)', () => {
		assert.equal(cbrtBigIntRecursive(0n), 0n);
		assert.equal(cbrtBigIntRecursive(1n), 1n * SCALE);
		assert.equal(cbrtBigIntRecursive(-1n), -1n * SCALE);
		assert.equal(cbrtBigIntRecursive(8n), 2n * SCALE);
		assert.equal(cbrtBigIntRecursive(-8n), -2n * SCALE);
		assert.equal(cbrtBigIntRecursive(27n), 3n * SCALE);
		assert.equal(cbrtBigIntRecursive(-27n), -3n * SCALE);
		assert.equal(cbrtBigIntRecursive(64n), 4n * SCALE);
		assert.equal(cbrtBigIntRecursive(125n), 5n * SCALE);
		assert.equal(cbrtBigIntRecursive(1000n), 10n * SCALE);
		assert.equal(cbrtBigIntRecursive(-1000n), -10n * SCALE);

		const bigBase = 123456789012345678901234567890n;
		assert.equal(cbrtBigIntRecursive(bigBase ** 3n), bigBase * SCALE);
		assert.equal(cbrtBigIntRecursive(-(bigBase ** 3n)), -bigBase * SCALE);
	});

	test('matches known high-precision fixed-point values for non-perfect cubes', () => {
		// cbrt(2)  = 1.2599210498948731647672106... -> rounds up to ...165
		assert.equal(cbrtBigIntRecursive(2n), 1_259_921_049_894_873_165n);
		assert.equal(cbrtBigIntRecursive(-2n), -1_259_921_049_894_873_165n);

		// cbrt(3)  = 1.4422495703074083823216383... -> rounds down to ...382
		assert.equal(cbrtBigIntRecursive(3n), 1_442_249_570_307_408_382n);
		assert.equal(cbrtBigIntRecursive(-3n), -1_442_249_570_307_408_382n);

		// cbrt(10) = 2.1544346900318837217592935... -> rounds up to ...722
		assert.equal(cbrtBigIntRecursive(10n), 2_154_434_690_031_883_722n);
		assert.equal(cbrtBigIntRecursive(-10n), -2_154_434_690_031_883_722n);

		// cbrt(100) = 4.6415888336127788924100763... -> rounds down to ...892
		assert.equal(cbrtBigIntRecursive(100n), 4_641_588_833_612_778_892n);
	});

	test('handles boundary values around bit-length and perfect-cube transitions', () => {
		const boundaries = [
			0n, 1n, 2n, 7n, 8n, 9n, 26n, 27n, 28n, 63n, 64n, 65n,
			124n, 125n, 126n, 511n, 512n, 513n, 4095n, 4096n, 4097n,
			(1n << 63n) - 1n, 1n << 63n, (1n << 63n) + 1n,
			(1n << 64n) - 1n, 1n << 64n, (1n << 64n) + 1n
		];

		for (const n of boundaries) {
			const pos = cbrtBigIntRecursive(n);
			const neg = cbrtBigIntRecursive(-n);
			assertExactNearestCbrt(n, pos);
			assertExactNearestCbrt(-n, neg);
			assert.equal(neg, -pos);
		}
	});

	test('handles very large BigInts without stack overflow and with exact rounding', () => {
		const hugeCases = [
			10n ** 150n,
			-(10n ** 150n),
			10n ** 151n + 7n,
			2n ** 1000n,
			-(2n ** 1000n) - 1n,
			(10n ** 100n + 987654321n) ** 3n - 1n,
			(10n ** 100n + 987654321n) ** 3n,
			(10n ** 100n + 987654321n) ** 3n + 1n,
			2n ** 4096n + 123456789n
		];

		for (const n of hugeCases) {
			const res = cbrtBigIntRecursive(n);
			assertExactNearestCbrt(n, res);
		}
	});

	test('supports custom positive BigInt scales', () => {
		// scale = 1n rounds to nearest integer
		assert.equal(cbrtBigIntRecursive(2n, 1n), 1n); // 1.2599... -> 1
		assert.equal(cbrtBigIntRecursive(4n, 1n), 2n); // 1.5874... -> 2
		assert.equal(cbrtBigIntRecursive(-4n, 1n), -2n);
		assert.equal(cbrtBigIntRecursive(27n, 1n), 3n);

		// scale = 10^6 and 10^30
		assert.equal(cbrtBigIntRecursive(2n, 10n ** 6n), 1_259_921n);
		const scale30 = 10n ** 30n;
		const r30 = cbrtBigIntRecursive(2n, scale30);
		assertExactNearestCbrt(2n, r30, scale30);
		assert.equal(r30, 1_259_921_049_894_873_164_767_210_607_278n);
	});

	test('preserves monotonicity over a range of negative and positive inputs', () => {
		let prev = cbrtBigIntRecursive(-50n);
		for (let i = -49n; i <= 50n; i++) {
			const curr = cbrtBigIntRecursive(i);
			assert.ok(curr >= prev, `Expected cbrt(${i}) >= cbrt(${i - 1n})`);
			prev = curr;
		}
	});

	test('cross-checks against Math.cbrt within tight floating-point tolerance', () => {
		const samples = [
			-1_000_000_000_000_000n,
			-987_654_321n,
			-1000n,
			-17n,
			-2n,
			-1n,
			0n,
			1n,
			2n,
			5n,
			17n,
			999n,
			123_456_789n,
			999_999_999_999_999n
		];

		for (const n of samples) {
			const scaled = cbrtBigIntRecursive(n);
			const approx = Number(scaled) / Number(SCALE);
			const expected = Math.cbrt(Number(n));
			const diff = Math.abs(approx - expected);
			const tolerance = Math.max(1e-14, Math.abs(expected) * 1e-14);
			assert.ok(
				diff <= tolerance,
				`Mismatch for n=${n}: got ${approx}, expected ${expected} (diff=${diff})`
			);
		}
	});

	test('cross-checks exact bit-for-bit agreement against iterative binary-search reference', () => {
		// Exhaustive small integers
		for (let n = -75n; n <= 75n; n++) {
			assert.equal(
				cbrtBigIntRecursive(n),
				referenceCbrtBinarySearch(n, SCALE),
				`Reference mismatch at n=${n}`
			);
		}

		// Larger pseudo-random-like BigInts across varying bit lengths
		const largerSamples = [
			123456789012345678901n,
			-98765432109876543210987654321n,
			(1n << 200n) + 314159265358979323846n,
			-(1n << 333n) + 271828182845904523536n,
			10n ** 95n + 42n
		];
		for (const n of largerSamples) {
			assert.equal(
				cbrtBigIntRecursive(n),
				referenceCbrtBinarySearch(n, SCALE),
				`Reference mismatch at large n=${n}`
			);
		}
	});

	test('throws TypeError and RangeError on invalid inputs', () => {
		const invalidN = [8, 0, -27, 2.5, NaN, Infinity, '8', null, undefined, {}, true, [8n]];
		for (const bad of invalidN) {
			assert.throws(() => cbrtBigIntRecursive(bad), TypeError);
		}

		const invalidScaleTypes = [1e18, 1, '1000', null, {}, true];
		for (const badScale of invalidScaleTypes) {
			assert.throws(() => cbrtBigIntRecursive(8n, badScale), TypeError);
		}

		const invalidScaleRanges = [0n, -1n, -SCALE];
		for (const badScale of invalidScaleRanges) {
			assert.throws(() => cbrtBigIntRecursive(8n, badScale), RangeError);
		}
	});
});
