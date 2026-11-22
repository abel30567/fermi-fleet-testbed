import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	magnitudeBigIntRecursive,
	SCALE,
} from './magnitudeBigIntRecursive.js';

/**
 * Independent naive iterative reference implementation:
 * - Iterative loop for sum of squares
 * - Iterative binary search for exact floor(sqrt(n))
 * - Exact rounding check: round(sqrt(N)) = r + (N - r^2 > r ? 1 : 0)
 *
 * @param {readonly bigint[]} vector
 * @returns {bigint}
 */
function naiveMagnitudeReference(vector) {
	let sumSq = 0n;
	for (let i = 0; i < vector.length; i++) {
		sumSq += vector[i] * vector[i];
	}
	if (sumSq === 0n) {
		return 0n;
	}

	const scaled = sumSq * SCALE * SCALE;
	let lo = 0n;
	let hi = 1n;
	while (hi * hi <= scaled) {
		hi <<= 1n;
	}
	while (lo + 1n < hi) {
		const mid = (lo + hi) >> 1n;
		if (mid * mid <= scaled) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return scaled - lo * lo > lo ? lo + 1n : lo;
}

/**
 * Asserts the exact 0.5-ULP nearest-integer certificate for a non-zero vector:
 * (2m - 1)^2 < 4 * sum(v_i^2) * SCALE^2 < (2m + 1)^2
 *
 * @param {readonly bigint[]} vector
 * @param {bigint} result
 */
function assertExactNearestScaledMagnitude(vector, result) {
	const sumSq = vector.reduce((acc, v) => acc + v * v, 0n);
	if (sumSq === 0n) {
		assert.equal(result, 0n);
		return;
	}
	const target4 = 4n * sumSq * SCALE * SCALE;
	const lower = (2n * result - 1n) ** 2n;
	const upper = (2n * result + 1n) ** 2n;
	assert.ok(
		lower < target4 && target4 < upper,
		`Expected ${result} to be exact nearest integer to sqrt(${sumSq}) * 10^18`,
	);
}

describe('magnitudeBigIntRecursive', () => {
	it('exports SCALE equal to 10n ** 18n', () => {
		assert.equal(SCALE, 10n ** 18n);
	});

	it('computes exact integer magnitudes for Pythagorean triples and quadruples', () => {
		assert.equal(magnitudeBigIntRecursive([3n, 4n]), 5n * SCALE);
		assert.equal(magnitudeBigIntRecursive([5n, 12n]), 13n * SCALE);
		assert.equal(magnitudeBigIntRecursive([8n, 15n]), 17n * SCALE);
		assert.equal(magnitudeBigIntRecursive([7n, 24n]), 25n * SCALE);
		assert.equal(magnitudeBigIntRecursive([1n, 2n, 2n]), 3n * SCALE);
		assert.equal(magnitudeBigIntRecursive([2n, 3n, 6n]), 7n * SCALE);
		assert.equal(magnitudeBigIntRecursive([1n, 4n, 8n]), 9n * SCALE);
		assert.equal(magnitudeBigIntRecursive([2n, 6n, 9n]), 11n * SCALE);
		assert.equal(magnitudeBigIntRecursive([3n, 4n, 12n]), 13n * SCALE);
	});

	it('handles negative components and preserves sign invariance', () => {
		assert.equal(magnitudeBigIntRecursive([-3n, 4n]), 5n * SCALE);
		assert.equal(magnitudeBigIntRecursive([3n, -4n]), 5n * SCALE);
		assert.equal(magnitudeBigIntRecursive([-3n, -4n]), 5n * SCALE);
		assert.equal(magnitudeBigIntRecursive([-2n, -3n, -6n]), 7n * SCALE);
		assert.equal(
			magnitudeBigIntRecursive([-1n, -2n, -3n]),
			magnitudeBigIntRecursive([1n, 2n, 3n]),
		);
	});

	it('computes accurately rounded fixed-point results for irrational magnitudes', () => {
		// sqrt(2) * 10^18 = 1414213562373095048.801688... -> rounds up
		assert.equal(magnitudeBigIntRecursive([1n, 1n]), 1414213562373095049n);
		// sqrt(3) * 10^18 = 1732050807568877293.527446... -> rounds up
		assert.equal(
			magnitudeBigIntRecursive([1n, 1n, 1n]),
			1732050807568877294n,
		);
		// sqrt(5) * 10^18 = 2236067977499789696.409173... -> rounds down
		assert.equal(magnitudeBigIntRecursive([1n, 2n]), 2236067977499789696n);
		// sqrt(6) * 10^18 = 2449489742783178098.197284... -> rounds down
		assert.equal(
			magnitudeBigIntRecursive([1n, 1n, 2n]),
			2449489742783178098n,
		);
		// sqrt(14) * 10^18 = 3741657386773941385.583748... -> rounds up
		assert.equal(
			magnitudeBigIntRecursive([1n, 2n, 3n]),
			3741657386773941386n,
		);
	});

	it('rounds accurately at extreme sub-ULP half-integer boundaries', () => {
		// sqrt((10^18)^2 + 1) * 10^18 = 10^36 + 0.5 - 1.25e-37 -> strictly below .5, must round down
		const justBelowHalf = [SCALE, 1n];
		assert.equal(magnitudeBigIntRecursive(justBelowHalf), SCALE * SCALE);
		assertExactNearestScaledMagnitude(justBelowHalf, SCALE * SCALE);

		// sqrt((10^18 - 1)^2 + 1) * 10^18 = (10^18 - 1)*10^18 + 0.5 + 5e-19 -> strictly above .5, must round up
		const justAboveHalf = [SCALE - 1n, 1n];
		const expectedAbove = (SCALE - 1n) * SCALE + 1n;
		assert.equal(magnitudeBigIntRecursive(justAboveHalf), expectedAbove);
		assertExactNearestScaledMagnitude(justAboveHalf, expectedAbove);
	});

	it('handles edge cases: zero vectors, single-element vectors, and unit vectors', () => {
		assert.equal(magnitudeBigIntRecursive([0n]), 0n);
		assert.equal(magnitudeBigIntRecursive([0n, 0n]), 0n);
		assert.equal(magnitudeBigIntRecursive([0n, 0n, 0n, 0n, 0n]), 0n);

		assert.equal(magnitudeBigIntRecursive([1n]), SCALE);
		assert.equal(magnitudeBigIntRecursive([-1n]), SCALE);
		assert.equal(magnitudeBigIntRecursive([42n]), 42n * SCALE);
		assert.equal(magnitudeBigIntRecursive([-42n]), 42n * SCALE);
		assert.equal(magnitudeBigIntRecursive([0n, 0n, 1n, 0n]), SCALE);
		assert.equal(magnitudeBigIntRecursive([0n, -1n, 0n, 0n]), SCALE);
	});

	it('handles very large BigInts far beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 50n;
		assert.equal(
			magnitudeBigIntRecursive([3n * big, 4n * big]),
			5n * big * SCALE,
		);
		assert.equal(magnitudeBigIntRecursive([-big]), big * SCALE);

		const hugeVec = [
			1234567890123456789012345678901234567890n,
			-9876543210987654321098765432109876543210n,
			5555555555555555555555555555555555555555n,
		];
		const res = magnitudeBigIntRecursive(hugeVec);
		assertExactNearestScaledMagnitude(hugeVec, res);
		assert.equal(res, naiveMagnitudeReference(hugeVec));
	});

	it('handles high-dimensional vectors without stack overflow', () => {
		const ones10k = new Array(10_000).fill(1n);
		assert.equal(magnitudeBigIntRecursive(ones10k), 100n * SCALE);

		const oddLengthVec = Array.from({ length: 4097 }, (_, i) =>
			BigInt(i % 2 === 0 ? i : -i),
		);
		const oddResult = magnitudeBigIntRecursive(oddLengthVec);
		assertExactNearestScaledMagnitude(oddLengthVec, oddResult);
		assert.equal(oddResult, naiveMagnitudeReference(oddLengthVec));
	});

	it('cross-checks against Math.hypot for JS-safe vectors within tight tolerance', () => {
		const cases = [
			[1, 1],
			[3, 4],
			[1, 2, 3, 4, 5],
			[-7, 11, -13, 17, -19],
			[100000, 200000, 300000],
			[0, 0, 999999, -123456],
			[1, 1, 1, 1, 1, 1, 1],
		];

		for (const nums of cases) {
			const bigVec = nums.map((x) => BigInt(x));
			const actual = magnitudeBigIntRecursive(bigVec);
			const expectedFloat = Math.hypot(...nums);
			const actualFloat = Number(actual) / Number(SCALE);
			const relErr =
				Math.abs(actualFloat - expectedFloat) / Math.max(1, expectedFloat);

			assert.ok(
				relErr < 1e-14,
				`Relative error ${relErr} too large for [${nums.join(', ')}]`,
			);
			assertExactNearestScaledMagnitude(bigVec, actual);
		}
	});

	it('cross-checks against independent naive iterative reference on diverse deterministic vectors', () => {
		// Deterministic LCG generator so tests are 100% reproducible
		let seed = 0x123456789abcdefn;
		const nextBig = (bits) => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
			const sign = (seed & 1n) === 0n ? 1n : -1n;
			const mag = (seed >> 1n) & ((1n << BigInt(bits)) - 1n);
			return sign * mag;
		};

		for (let trial = 0; trial < 40; trial++) {
			const len = (trial % 15) + 1;
			const bits = (trial % 4) * 20 + 4;
			const vec = Array.from({ length: len }, () => nextBig(bits));
			const actual = magnitudeBigIntRecursive(vec);
			const expected = naiveMagnitudeReference(vec);

			assert.equal(actual, expected);
			assertExactNearestScaledMagnitude(vec, actual);
		}
	});

	it('satisfies algebraic vector norm identities (permutation, homogeneity, triangle, Cauchy-Schwarz)', () => {
		const u = [3n, -7n, 11n, -13n, 5n];
		const v = [-2n, 9n, -4n, 8n, 6n];

		// Permutation invariance
		const uPermuted = [5n, 11n, 3n, -13n, -7n];
		assert.equal(
			magnitudeBigIntRecursive(u),
			magnitudeBigIntRecursive(uPermuted),
		);

		// Homogeneity: ||k * u|| ≈ |k| * ||u|| (within |k| / 2 + 1 ULP from rounding)
		const k = -17n;
		const scaledU = u.map((x) => k * x);
		const lhs = magnitudeBigIntRecursive(scaledU);
		const rhs = 17n * magnitudeBigIntRecursive(u);
		assert.ok(lhs >= rhs - 9n && lhs <= rhs + 9n);

		// Triangle inequality: ||u + v|| <= ||u|| + ||v|| (+ 1n rounding slack)
		const sumUV = u.map((x, i) => x + v[i]);
		const normSum = magnitudeBigIntRecursive(sumUV);
		const normU = magnitudeBigIntRecursive(u);
		const normV = magnitudeBigIntRecursive(v);
		assert.ok(normSum <= normU + normV + 1n);

		// Cauchy-Schwarz: |u · v| * SCALE^2 <= ||u|| * ||v|| (+ rounding slack)
		const dot = u.reduce((acc, x, i) => acc + x * v[i], 0n);
		const absDot = dot < 0n ? -dot : dot;
		assert.ok(absDot * SCALE * SCALE <= (normU + 1n) * (normV + 1n));
	});

	it('throws TypeError for non-Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			0,
			42,
			42n,
			'3,4',
			true,
			{ 0: 3n, 1: 4n, length: 2 },
			new BigInt64Array([3n, 4n]),
		];

		for (const input of invalidInputs) {
			assert.throws(() => magnitudeBigIntRecursive(input), TypeError);
		}
	});

	it('throws RangeError for an empty vector', () => {
		assert.throws(() => magnitudeBigIntRecursive([]), RangeError);
	});

	it('throws TypeError when any element is not a BigInt (including sparse arrays)', () => {
		const invalidVectors = [
			[3, 4],
			[3n, 4],
			[3n, '4'],
			[3n, null],
			[3n, undefined],
			[3n, NaN],
			[3n, true],
			[3n, {}],
			[3n, 4n, 5n, 6],
			// Sparse array with hole at index 1
			// eslint-disable-next-line no-sparse-arrays
			[1n, , 3n],
			new Array(3),
		];

		for (const vec of invalidVectors) {
			assert.throws(() => magnitudeBigIntRecursive(vec), TypeError);
		}
	});
});
