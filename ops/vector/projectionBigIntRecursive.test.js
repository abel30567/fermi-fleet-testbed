import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { projectionBigIntRecursive } from './projectionBigIntRecursive.js';

const SCALE = 10n ** 18n;

/**
 * Independent iterative BigInt reference implementation for cross-checking.
 */
function projectionBigIntIterativeRef(u, v) {
	let dotUV = 0n;
	let dotVV = 0n;
	for (let i = 0; i < u.length; i++) {
		dotUV += u[i] * v[i];
		dotVV += v[i] * v[i];
	}
	const result = [];
	for (let i = 0; i < v.length; i++) {
		const num = dotUV * v[i] * SCALE;
		if (num === 0n) {
			result.push(0n);
		} else if (num > 0n) {
			result.push(((num * 2n) + dotVV) / (dotVV * 2n));
		} else {
			result.push(-(((-num * 2n) + dotVV) / (dotVV * 2n)));
		}
	}
	return result;
}

/**
 * Independent IEEE-754 floating-point reference implementation.
 */
function projectionFloatRef(u, v) {
	let dotUV = 0;
	let dotVV = 0;
	for (let i = 0; i < u.length; i++) {
		dotUV += u[i] * v[i];
		dotVV += v[i] * v[i];
	}
	const scalar = dotUV / dotVV;
	return v.map((vi) => scalar * vi);
}

describe('projectionBigIntRecursive', () => {
	test('projects onto standard basis vectors with exact scaled results', () => {
		assert.deepEqual(
			projectionBigIntRecursive([3n, 4n], [1n, 0n]),
			[3n * SCALE, 0n]
		);
		assert.deepEqual(
			projectionBigIntRecursive([3n, 4n], [0n, 1n]),
			[0n, 4n * SCALE]
		);
		assert.deepEqual(
			projectionBigIntRecursive([5n, -7n, 11n], [0n, 0n, 2n]),
			[0n, 0n, 11n * SCALE]
		);
	});

	test('computes exact rational fixed-point results scaled by 10^18', () => {
		// u = [1, 0], v = [1, 1] -> ((1)/(2)) * [1, 1] = [0.5, 0.5]
		assert.deepEqual(
			projectionBigIntRecursive([1n, 0n], [1n, 1n]),
			[500_000_000_000_000_000n, 500_000_000_000_000_000n]
		);

		// u = [1, 2, 3], v = [1, 1, 1] -> (6/3) * [1, 1, 1] = [2, 2, 2]
		assert.deepEqual(
			projectionBigIntRecursive([1n, 2n, 3n], [1n, 1n, 1n]),
			[2n * SCALE, 2n * SCALE, 2n * SCALE]
		);

		// Non-terminating decimal: u = [1, 0, 0], v = [1, 1, 1] -> (1/3) * [1, 1, 1]
		assert.deepEqual(
			projectionBigIntRecursive([1n, 0n, 0n], [1n, 1n, 1n]),
			[333_333_333_333_333_333n, 333_333_333_333_333_333n, 333_333_333_333_333_333n]
		);

		// Rounds half away from zero: u = [2, 0, 0], v = [1, 1, 1] -> (2/3) * [1, 1, 1]
		assert.deepEqual(
			projectionBigIntRecursive([2n, 0n, 0n], [1n, 1n, 1n]),
			[666_666_666_666_666_667n, 666_666_666_666_666_667n, 666_666_666_666_666_667n]
		);

		// Negative non-terminating decimal: u = [-2, 0, 0], v = [1, 1, 1] -> (-2/3) * [1, 1, 1]
		assert.deepEqual(
			projectionBigIntRecursive([-2n, 0n, 0n], [1n, 1n, 1n]),
			[-666_666_666_666_666_667n, -666_666_666_666_666_667n, -666_666_666_666_666_667n]
		);
	});

	test('handles exact half-ulp ties symmetrically (round half away from zero)', () => {
		// Need (dotUV * v[i] * 10^18) / dotVV to end in exact .5
		// Choose v = [2^19, 0] -> dotVV = 2^38, wait: easier:
		// v = [1, 1, 1, 1, 1, 1, 1, 1] has dotVV = 8. 10^18 is divisible by 2^18.
		// Choose dotVV = 2^19 = 524288: e.g., v = [512, 512] -> dotVV = 524288.
		// u = [1, 0] -> dotUV = 512.
		// dotUV * v[0] * 10^18 / dotVV = (512 * 512 * 10^18) / 524288 = 10^18 / 2 (exact integer).
		// To get exact .5: need denominator factor 2^19 after cancellation.
		// v = [2^19, 0] cancels; instead use 2D: v = [1, 2^19 - 1]? No, simple:
		// Let v = [1n, 0n, ...], pad with 1s so dotVV = 2^19? Too big.
		// Instead: 2^19 = 524288 = 262144 * 2? No, sum of two squares:
		// 524288 = 512^2 + 512^2 (factors cancel with 512).
		// 2^19 = 524288; what about v = [3n, 255n, 255n, ...]?
		// Easier: 2^19 * 1 = 524288. Use 4-square decomposition of 524288 with an odd component!
		// 524288 = 1^2 + 3^2 + 409^2 + 597^2? Check: 1 + 9 + 167281 + 356409 = 523700 (close).
		// 524288 - 1 - 9 - 25 = 524253.
		// Better: 10^18 = 2^18 * 5^18. If dotVV = 2^19 and v[0] = 1, dotUV = 1 -> num/den = 5^18 / 2 = exact .5!
		// Find a, b, c with a^2 + b^2 + c^2 = 524287:
		// 724^2 = 524176, remainder = 111 = 10^2 + 3^2 + 1^2 + 1^2 -> 5 components:
		// v = [1n, 1n, 1n, 3n, 10n, 724n] -> 1 + 1 + 1 + 9 + 100 + 524176 = 524288 = 2^19!
		const v = [1n, 1n, 1n, 3n, 10n, 724n];
		const uPos = [1n, 0n, 0n, 0n, 0n, 0n];
		const uNeg = [-1n, 0n, 0n, 0n, 0n, 0n];
		// Exact value for index 0: 10^18 / 2^19 = 5^18 / 2 = 3814697265625 / 2 = 1907348632812.5
		const expectedPos0 = 1_907_348_632_813n;
		const resPos = projectionBigIntRecursive(uPos, v);
		const resNeg = projectionBigIntRecursive(uNeg, v);
		assert.equal(resPos[0], expectedPos0);
		assert.equal(resNeg[0], -expectedPos0);
	});

	test('handles parallel, anti-parallel, orthogonal, zero u, and 1D vectors', () => {
		// Parallel: proj_v(k * v) === k * v * SCALE (exact, no rounding drift)
		assert.deepEqual(
			projectionBigIntRecursive([6n, -9n, 15n], [2n, -3n, 5n]),
			[6n * SCALE, -9n * SCALE, 15n * SCALE]
		);

		// Anti-parallel: proj_{-v}(u) === proj_v(u)
		assert.deepEqual(
			projectionBigIntRecursive([3n, 4n, -5n], [-1n, -2n, -3n]),
			projectionBigIntRecursive([3n, 4n, -5n], [1n, 2n, 3n])
		);

		// Orthogonal vectors -> zero vector
		assert.deepEqual(
			projectionBigIntRecursive([1n, -1n, 0n], [1n, 1n, 5n]),
			[0n, 0n, 0n]
		);

		// Zero u vector -> zero vector
		assert.deepEqual(
			projectionBigIntRecursive([0n, 0n, 0n], [7n, -2n, 9n]),
			[0n, 0n, 0n]
		);

		// 1D vectors: proj_{[v0]}([u0]) === [u0 * SCALE]
		assert.deepEqual(projectionBigIntRecursive([7n], [3n]), [7n * SCALE]);
		assert.deepEqual(projectionBigIntRecursive([-7n], [-3n]), [-7n * SCALE]);
		assert.deepEqual(projectionBigIntRecursive([-7n], [13n]), [-7n * SCALE]);
	});

	test('preserves exact precision for huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 30n;
		const u = [big + 3n, -(big + 5n), 2n * big + 7n];
		const v = [big + 3n, -(big + 5n), 2n * big + 7n];
		// Projecting a huge vector onto itself must return exact v * SCALE
		assert.deepEqual(
			projectionBigIntRecursive(u, v),
			v.map((x) => x * SCALE)
		);

		// Huge non-trivial projection: u = [big, 0n], v = [big, big] -> [big/2 * SCALE, big/2 * SCALE]
		const halfBig = big / 2n;
		assert.deepEqual(
			projectionBigIntRecursive([big, 0n], [big, big]),
			[halfBig * SCALE, halfBig * SCALE]
		);
	});

	test('handles large vector lengths without stack overflow (O(log n) depth)', () => {
		const n = 20_000;
		const u = new Array(n);
		const v = new Array(n);
		for (let i = 0; i < n; i++) {
			u[i] = BigInt((i % 7) - 3);
			v[i] = 1n;
		}
		const res = projectionBigIntRecursive(u, v);
		const expected = projectionBigIntIterativeRef(u, v);
		assert.equal(res.length, n);
		assert.deepEqual(res, expected);
	});

	test('does not mutate input vectors', () => {
		const u = [4n, -5n, 6n];
		const v = [1n, 2n, -3n];
		const uCopy = [...u];
		const vCopy = [...v];
		projectionBigIntRecursive(u, v);
		assert.deepEqual(u, uCopy);
		assert.deepEqual(v, vCopy);
	});

	test('validates inputs thoroughly and throws descriptive errors', () => {
		// Non-array inputs
		for (const bad of [null, undefined, 42, 42n, '123', {}, new BigInt64Array([1n, 2n])]) {
			assert.throws(() => projectionBigIntRecursive(bad, [1n]), TypeError);
			assert.throws(() => projectionBigIntRecursive([1n], bad), TypeError);
		}

		// Empty vectors
		assert.throws(() => projectionBigIntRecursive([], []), RangeError);
		assert.throws(() => projectionBigIntRecursive([], [1n]), RangeError);
		assert.throws(() => projectionBigIntRecursive([1n], []), RangeError);

		// Dimension mismatch
		assert.throws(() => projectionBigIntRecursive([1n, 2n], [1n]), RangeError);
		assert.throws(() => projectionBigIntRecursive([1n], [1n, 2n, 3n]), RangeError);

		// Non-BigInt elements
		assert.throws(() => projectionBigIntRecursive([1, 2n], [1n, 2n]), TypeError);
		assert.throws(() => projectionBigIntRecursive([1n, 2n], [1n, 2]), TypeError);
		assert.throws(() => projectionBigIntRecursive([1n, '2'], [1n, 2n]), TypeError);
		assert.throws(() => projectionBigIntRecursive([1n, null], [1n, 2n]), TypeError);
		assert.throws(() => projectionBigIntRecursive([1n, NaN], [1n, 2n]), TypeError);

		// Sparse arrays (holes)
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [1n, , 3n];
		assert.throws(() => projectionBigIntRecursive(sparse, [1n, 2n, 3n]), TypeError);
		assert.throws(() => projectionBigIntRecursive([1n, 2n, 3n], sparse), TypeError);

		// Zero target vector
		assert.throws(() => projectionBigIntRecursive([1n], [0n]), RangeError);
		assert.throws(() => projectionBigIntRecursive([1n, 2n, 3n], [0n, 0n, 0n]), RangeError);

		// Invalid element type takes precedence even if v is zero
		assert.throws(() => projectionBigIntRecursive([1, 2n], [0n, 0n]), TypeError);
	});

	test('cross-check against independent iterative BigInt reference across varied dimensions', () => {
		// Deterministic PRNG (xorshift32)
		let seed = 0x12345678;
		const nextInt = (bound) => {
			seed ^= seed << 13;
			seed ^= seed >>> 17;
			seed ^= seed << 5;
			return (seed % bound);
		};

		for (let dim = 1; dim <= 37; dim++) {
			const u = [];
			const v = [];
			for (let i = 0; i < dim; i++) {
				u.push(BigInt(nextInt(1000)) * (10n ** BigInt(i % 5)));
				v.push(BigInt(nextInt(1000)) * (10n ** BigInt(i % 4)));
			}
			if (v.every((x) => x === 0n)) {
				v[0] = 1n;
			}
			const actual = projectionBigIntRecursive(u, v);
			const expected = projectionBigIntIterativeRef(u, v);
			assert.deepEqual(actual, expected, `mismatch at dim=${dim}`);
		}
	});

	test('cross-check against floating-point reference and geometric invariants', () => {
		const cases = [
			[[3, -4, 5], [1, 2, -2]],
			[[-7, 13, -19, 23, -29], [2, -3, 5, -7, 11]],
			[[100, 200, -300, 400], [17, -23, 31, -41]],
			[[1, 2, 3, 4, 5, 6, 7], [7, 6, 5, 4, 3, 2, 1]]
		];

		for (const [uNum, vNum] of cases) {
			const u = uNum.map(BigInt);
			const v = vNum.map(BigInt);
			const proj = projectionBigIntRecursive(u, v);
			const floatExpected = projectionFloatRef(uNum, vNum);

			// 1. Float cross-check within 1e-12
			for (let i = 0; i < proj.length; i++) {
				const asFloat = Number(proj[i]) / 1e18;
				assert.ok(
					Math.abs(asFloat - floatExpected[i]) < 1e-12,
					`component ${i}: ${asFloat} vs ${floatExpected[i]}`
				);
			}

			// 2. Scale invariance in v: proj_{k*v}(u) === proj_v(u) exactly
			for (const k of [-7n, -1n, 3n, 1000n]) {
				const kv = v.map((x) => x * k);
				assert.deepEqual(projectionBigIntRecursive(u, kv), proj);
			}

			// 3. Orthogonality of residual: (u * SCALE - proj) · v ≈ 0
			// Each component has rounding error <= 0.5 ulp, so |(u*SCALE - proj)·v| <= sum(|v[i]|) / 2
			let residualDotV = 0n;
			let l1V = 0n;
			for (let i = 0; i < u.length; i++) {
				residualDotV += (u[i] * SCALE - proj[i]) * v[i];
				l1V += v[i] < 0n ? -v[i] : v[i];
			}
			const absResidualDotV = residualDotV < 0n ? -residualDotV : residualDotV;
			assert.ok(
				absResidualDotV * 2n <= l1V,
				`residual not orthogonal: |dot|=${absResidualDotV}, bound=${l1V / 2n}`
			);

			// 4. Linearity: proj_v(a*u1 + b*u2) ≈ a*proj_v(u1) + b*proj_v(u2)
			const u2 = u.map((x, idx) => x * 2n - BigInt(idx + 1));
			const a = 3n;
			const b = -5n;
			const combined = u.map((x, idx) => a * x + b * u2[idx]);
			const projCombined = projectionBigIntRecursive(combined, v);
			const projU2 = projectionBigIntRecursive(u2, v);
			const maxDiff = (a < 0n ? -a : a) + (b < 0n ? -b : b) + 1n;
			for (let i = 0; i < proj.length; i++) {
				const rhs = a * proj[i] + b * projU2[i];
				const diff = projCombined[i] >= rhs ? projCombined[i] - rhs : rhs - projCombined[i];
				assert.ok(diff <= maxDiff, `linearity diff ${diff} > ${maxDiff}`);
			}
		}
	});
});
