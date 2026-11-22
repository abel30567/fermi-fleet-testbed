import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtBigIntSeries } from './cbrtBigIntSeries.js';

const SCALE = 10n ** 18n;
const SCALE_CUBED = 10n ** 54n;

/**
 * Independent reference computation: exact nearest integer to ∛(n * 10^54)
 * computed via pure binary search over BigInt intervals (completely independent
 * of Halley's identity and the generalized binomial series).
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function referenceCbrtBinarySearch(n) {
	if (n === 0n) return 0n;
	const neg = n < 0n;
	const absN = neg ? -n : n;
	const target = absN * SCALE_CUBED;

	let lo = 0n;
	let hi = 1n;
	while (hi * hi * hi <= target) {
		lo = hi;
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

	// lo = floor(cbrt(target)); compare against half-integer midpoint (2*lo + 1)/2.
	const rounded = (2n * lo + 1n) ** 3n <= (target << 3n) ? lo + 1n : lo;
	return neg ? -rounded : rounded;
}

/**
 * Asserts exact nearest-integer cube root accuracy at 10^18 scale:
 * (2|r| - 1)^3 < 8 * |n| * 10^54 < (2|r| + 1)^3, and checks result^3 ≈ n * 10^54.
 */
function assertExactRoundedCbrt(n, result) {
	if (n === 0n) {
		assert.equal(result, 0n);
		return;
	}
	assert.equal(result < 0n, n < 0n, 'sign must match input');
	const absN = n < 0n ? -n : n;
	const absR = result < 0n ? -result : result;
	const target8 = (absN * SCALE_CUBED) << 3n;

	assert.ok((2n * absR - 1n) ** 3n < target8, `lower midpoint bound failed for n=${n}`);
	assert.ok(target8 < (2n * absR + 1n) ** 3n, `upper midpoint bound failed for n=${n}`);
}

describe('cbrtBigIntSeries', () => {
	it('computes exact values for zero and positive/negative perfect cubes', () => {
		assert.equal(cbrtBigIntSeries(0n), 0n);

		const roots = [1n, 2n, 3n, 4n, 5n, 10n, 12n, 99n, 1000n, 123456n, 10n ** 12n];
		for (const k of roots) {
			const cube = k * k * k;
			assert.equal(cbrtBigIntSeries(cube), k * SCALE);
			assert.equal(cbrtBigIntSeries(-cube), -k * SCALE);
		}
	});

	it('matches known 18-decimal-digit rounded constants for ∛2, ∛3, ∛10 and their negatives', () => {
		// ∛2  = 1.2599210498948731647672... -> 1.259921049894873165
		assert.equal(cbrtBigIntSeries(2n), 1259921049894873165n);
		assert.equal(cbrtBigIntSeries(-2n), -1259921049894873165n);

		// ∛3  = 1.4422495703074083823216... -> 1.442249570307408382
		assert.equal(cbrtBigIntSeries(3n), 1442249570307408382n);
		assert.equal(cbrtBigIntSeries(-3n), -1442249570307408382n);

		// ∛10 = 2.1544346900318837217592... -> 2.154434690031883722
		assert.equal(cbrtBigIntSeries(10n), 2154434690031883722n);
		assert.equal(cbrtBigIntSeries(-10n), -2154434690031883722n);
	});

	it('satisfies odd symmetry cbrt(-n) === -cbrt(n) and cube identity result^3 ≈ n * 10^54', () => {
		const samples = [
			1n, 2n, 3n, 4n, 5n, 6n, 7n, 9n, 10n, 15n, 26n, 28n,
			63n, 65n, 100n, 999n, 1001n, 2n ** 53n - 1n, 2n ** 53n + 1n,
			2n ** 64n, 2n ** 128n + 7n,
		];

		for (const n of samples) {
			const pos = cbrtBigIntSeries(n);
			const neg = cbrtBigIntSeries(-n);
			assert.equal(neg, -pos);
			assertExactRoundedCbrt(n, pos);
			assertExactRoundedCbrt(-n, neg);
		}
	});

	it('handles values immediately adjacent to perfect cubes and power-of-two boundaries', () => {
		const bases = [2n, 3n, 10n, 1024n, 10n ** 15n];
		for (const b of bases) {
			const cube = b ** 3n;
			for (const delta of [-1n, 0n, 1n]) {
				const n = cube + delta;
				const res = cbrtBigIntSeries(n);
				assertExactRoundedCbrt(n, res);
				assert.equal(res, referenceCbrtBinarySearch(n));
			}
		}

		// Exercise all bit-length modulo-3 residue classes (rem = 0, 1, 2).
		for (let exp = 0n; exp <= 30n; exp += 1n) {
			const n = 1n << exp;
			const res = cbrtBigIntSeries(n);
			assertExactRoundedCbrt(n, res);
			assert.equal(res, referenceCbrtBinarySearch(n));
		}
	});

	it('handles very large positive and negative BigInts accurately', () => {
		const largeCubeRoot = 123456789012345678901234567890n;
		const largePerfectCube = largeCubeRoot ** 3n;
		assert.equal(cbrtBigIntSeries(largePerfectCube), largeCubeRoot * SCALE);
		assert.equal(cbrtBigIntSeries(-largePerfectCube), -largeCubeRoot * SCALE);

		const largeNonCubes = [
			10n ** 100n + 17n,
			-(10n ** 100n + 17n),
			(10n ** 150n) * 7n + 3n,
			-(2n ** 512n) + 12345n,
			10n ** 300n + 99999999999999999999n,
		];

		for (const n of largeNonCubes) {
			const res = cbrtBigIntSeries(n);
			assertExactRoundedCbrt(n, res);
			assert.equal(res, referenceCbrtBinarySearch(n));
		}
	});

	it('cross-checks against multiplicative identity cbrt(a * b) ≈ cbrt(a) * cbrt(b) / 10^18', () => {
		const pairs = [
			[2n, 3n],
			[5n, 7n],
			[11n, 13n],
			[123456n, 789012n],
			[-17n, 29n],
			[-100n, -250n],
		];

		for (const [a, b] of pairs) {
			const lhs = cbrtBigIntSeries(a * b);
			const ca = cbrtBigIntSeries(a);
			const cb = cbrtBigIntSeries(b);
			const rhs = (ca * cb) / SCALE;
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs;
			// Rounding of two factors + quotient can differ by at most a small handful of ulps.
			const bound = (ca < 0n ? -ca : ca) / SCALE + (cb < 0n ? -cb : cb) / SCALE + 4n;
			assert.ok(
				diff <= bound,
				`multiplicative identity mismatch for (${a}, ${b}): lhs=${lhs}, rhs=${rhs}, diff=${diff}`,
			);
		}
	});

	it('cross-checks against independent binary-search reference over a sweep of inputs', () => {
		for (let i = -50n; i <= 50n; i += 1n) {
			assert.equal(cbrtBigIntSeries(i), referenceCbrtBinarySearch(i));
		}
	});

	it('throws TypeError on invalid non-BigInt inputs', () => {
		const invalidInputs = [
			0,
			1,
			-8,
			2.5,
			NaN,
			Infinity,
			-Infinity,
			'8',
			'10n',
			null,
			undefined,
			true,
			false,
			{},
			[8n],
			Symbol('8'),
		];

		for (const invalid of invalidInputs) {
			assert.throws(
				() => cbrtBigIntSeries(invalid),
				{ name: 'TypeError' },
				`expected TypeError for input ${String(invalid)}`,
			);
		}
	});
});
