import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectionBigIntIterative } from './projectionBigIntIterative.js';

const SCALE = 10n ** 18n;

/**
 * Independent reference implementation using reduced exact rational arithmetic
 * (Euclidean GCD) and integer division/remainder rounding.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function referenceProjectionRational(u, v) {
	const dotUV = u.reduce((acc, ui, i) => acc + ui * v[i], 0n);
	const dotVV = v.reduce((acc, vi) => acc + vi * vi, 0n);
	const g = gcd(dotUV, dotVV);
	const redNum = dotUV / g;
	const redDen = dotVV / g;

	return v.map((vi) => {
		const num = redNum * vi * SCALE;
		const sign = num < 0n ? -1n : 1n;
		const absNum = num < 0n ? -num : num;
		const q = absNum / redDen;
		const r = absNum % redDen;
		return sign * (r * 2n >= redDen ? q + 1n : q);
	});
}

function absBigInt(x) {
	return x < 0n ? -x : x;
}

describe('projectionBigIntIterative', () => {
	describe('normal cases', () => {
		it('projects onto standard basis vectors with exact integer results', () => {
			assert.deepEqual(
				projectionBigIntIterative([3n, 4n], [1n, 0n]),
				[3n * SCALE, 0n],
			);
			assert.deepEqual(
				projectionBigIntIterative([3n, 4n], [0n, 5n]),
				[0n, 4n * SCALE],
			);
			assert.deepEqual(
				projectionBigIntIterative([-7n, 11n, 2n], [0n, 0n, -9n]),
				[0n, 0n, 2n * SCALE],
			);
		});

		it('projects with exact terminating fractional results', () => {
			assert.deepEqual(
				projectionBigIntIterative([1n, 2n], [1n, 1n]),
				[1500000000000000000n, 1500000000000000000n],
			);
			assert.deepEqual(
				projectionBigIntIterative([2n, 3n, 4n], [1n, 0n, 1n]),
				[3n * SCALE, 0n, 3n * SCALE],
			);
			assert.deepEqual(
				projectionBigIntIterative([1n, 0n], [2n, 2n]),
				[500000000000000000n, 500000000000000000n],
			);
		});

		it('rounds non-terminating fractions accurately (half away from zero)', () => {
			// 1/3 -> 0.333333333333333333
			assert.deepEqual(
				projectionBigIntIterative([1n, 0n, 0n], [1n, 1n, 1n]),
				[333333333333333333n, 333333333333333333n, 333333333333333333n],
			);
			// 2/3 -> 0.666666666666666667
			assert.deepEqual(
				projectionBigIntIterative([2n, 0n, 0n], [1n, 1n, 1n]),
				[666666666666666667n, 666666666666666667n, 666666666666666667n],
			);
			// -2/3 -> -0.666666666666666667
			assert.deepEqual(
				projectionBigIntIterative([-2n, 0n, 0n], [1n, 1n, 1n]),
				[-666666666666666667n, -666666666666666667n, -666666666666666667n],
			);
		});

		it('handles exact 0.5 ULP tie-breaking symmetrically (half away from zero)', () => {
			// 724^2 + 10^2 + 3^2 + 1^2 + 1^2 + 1^2 = 524288 = 2^19
			// 10^18 / 2^19 = 5^18 / 2 = 1907348632812.5 -> rounds to 1907348632813n
			const v = [724n, 10n, 3n, 1n, 1n, 1n];
			const uPos = [0n, 0n, 0n, 1n, 0n, 0n];
			const uNeg = [0n, 0n, 0n, -1n, 0n, 0n];

			const resPos = projectionBigIntIterative(uPos, v);
			const resNeg = projectionBigIntIterative(uNeg, v);

			assert.equal(resPos[3], 1907348632813n);
			assert.equal(resNeg[3], -1907348632813n);
		});

		it('handles negative and mixed-sign vectors', () => {
			// u·v = (-2)(3) + (5)(-4) = -26, v·v = 25
			// proj = (-26/25) * [3, -4] = [-3.12, 4.16]
			assert.deepEqual(
				projectionBigIntIterative([-2n, 5n], [3n, -4n]),
				[-3120000000000000000n, 4160000000000000000n],
			);
		});
	});

	describe('edge cases', () => {
		it('handles 1D vectors', () => {
			assert.deepEqual(projectionBigIntIterative([7n], [3n]), [7n * SCALE]);
			assert.deepEqual(projectionBigIntIterative([-7n], [-3n]), [-7n * SCALE]);
			assert.deepEqual(projectionBigIntIterative([0n], [-99n]), [0n]);
		});

		it('returns zero vector when u is zero or orthogonal to v', () => {
			assert.deepEqual(
				projectionBigIntIterative([0n, 0n, 0n], [5n, -2n, 9n]),
				[0n, 0n, 0n],
			);
			assert.deepEqual(
				projectionBigIntIterative([3n, -4n], [4n, 3n]),
				[0n, 0n],
			);
			assert.deepEqual(
				projectionBigIntIterative([1n, 2n, -3n], [1n, 1n, 1n]),
				[0n, 0n, 0n],
			);
		});

		it('returns u scaled by 10^18 when u is parallel or antiparallel to v', () => {
			const v = [2n, -5n, 7n];
			const uParallel = v.map((x) => x * 13n);
			const uAnti = v.map((x) => x * -4n);

			assert.deepEqual(
				projectionBigIntIterative(uParallel, v),
				uParallel.map((x) => x * SCALE),
			);
			assert.deepEqual(
				projectionBigIntIterative(uAnti, v),
				uAnti.map((x) => x * SCALE),
			);
		});

		it('preserves exact precision for very large BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const big = 10n ** 40n;
			const u = [big + 1n, big + 2n];
			const v = [big, 0n];
			assert.deepEqual(
				projectionBigIntIterative(u, v),
				[(big + 1n) * SCALE, 0n],
			);

			const u2 = [10n ** 50n, 3n * 10n ** 50n];
			const v2 = [10n ** 50n, 10n ** 50n];
			assert.deepEqual(
				projectionBigIntIterative(u2, v2),
				[2n * 10n ** 50n * SCALE, 2n * 10n ** 50n * SCALE],
			);
		});

		it('handles high-dimensional vectors without recursion or overflow', () => {
			const dim = 200;
			const u = Array.from({ length: dim }, (_, i) => BigInt(i + 1));
			const v = Array.from({ length: dim }, () => 1n);
			// Average of 1..200 is 100.5
			const expected = Array.from({ length: dim }, () => 100500000000000000000n);
			assert.deepEqual(projectionBigIntIterative(u, v), expected);
		});

		it('does not mutate input arrays', () => {
			const u = [3n, -7n, 2n];
			const v = [1n, 4n, -5n];
			const uCopy = [...u];
			const vCopy = [...v];

			const res = projectionBigIntIterative(u, v);
			assert.deepEqual(u, uCopy);
			assert.deepEqual(v, vCopy);
			assert.notEqual(res, u);
			assert.notEqual(res, v);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when u or v is not an array', () => {
			assert.throws(() => projectionBigIntIterative(null, [1n]), TypeError);
			assert.throws(() => projectionBigIntIterative([1n], undefined), TypeError);
			assert.throws(() => projectionBigIntIterative('123', [1n]), TypeError);
			assert.throws(() => projectionBigIntIterative([1n], { 0: 1n, length: 1 }), TypeError);
		});

		it('throws RangeError for empty vectors or mismatched lengths', () => {
			assert.throws(() => projectionBigIntIterative([], []), RangeError);
			assert.throws(() => projectionBigIntIterative([], [1n]), RangeError);
			assert.throws(() => projectionBigIntIterative([1n], []), RangeError);
			assert.throws(() => projectionBigIntIterative([1n, 2n], [1n]), RangeError);
		});

		it('throws TypeError when any element is not a BigInt', () => {
			assert.throws(() => projectionBigIntIterative([1, 2n], [1n, 2n]), TypeError);
			assert.throws(() => projectionBigIntIterative([1n, 2n], [1n, '2']), TypeError);
			assert.throws(() => projectionBigIntIterative([1n, null], [1n, 2n]), TypeError);
			// Sparse array
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => projectionBigIntIterative([1n, , 3n], [1n, 2n, 3n]), TypeError);
		});

		it('throws RangeError when projecting onto the zero vector', () => {
			assert.throws(() => projectionBigIntIterative([1n], [0n]), RangeError);
			assert.throws(() => projectionBigIntIterative([1n, 2n, 3n], [0n, 0n, 0n]), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent floating-point projection within float64 tolerance', () => {
			const cases = [
				{ u: [3n, 4n, 5n], v: [1n, -2n, 3n] },
				{ u: [-17n, 23n, -31n, 41n], v: [7n, 11n, -13n, 5n] },
				{ u: [100n, -200n, 300n], v: [13n, 29n, -7n] },
			];

			for (const { u, v } of cases) {
				const actual = projectionBigIntIterative(u, v);
				const uNum = u.map(Number);
				const vNum = v.map(Number);
				const dotUV = uNum.reduce((s, x, i) => s + x * vNum[i], 0);
				const dotVV = vNum.reduce((s, x) => s + x * x, 0);
				const factor = dotUV / dotVV;

				for (let i = 0; i < u.length; i++) {
					const expectedFloat = factor * vNum[i];
					const actualFloat = Number(actual[i]) / 1e18;
					assert.ok(
						Math.abs(actualFloat - expectedFloat) < 1e-12,
						`Mismatch at index ${i}: actual=${actualFloat}, expected=${expectedFloat}`,
					);
				}
			}
		});

		it('matches independent GCD-reduced rational reference and satisfies geometric invariants', () => {
			// Deterministic LCG for reproducible pseudo-random BigInt vectors
			let seed = 0x123456789abcdef1n;
			const nextBigInt = (bits) => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				const signed = seed - (1n << 63n);
				return signed >> BigInt(64 - bits);
			};

			for (let trial = 0; trial < 25; trial++) {
				const dim = (trial % 7) + 2;
				const bits = trial < 15 ? 16 : 60;
				const u = Array.from({ length: dim }, () => nextBigInt(bits));
				const v = Array.from({ length: dim }, () => nextBigInt(bits));
				if (v.every((x) => x === 0n)) {
					v[0] = 1n;
				}

				const actual = projectionBigIntIterative(u, v);
				const expected = referenceProjectionRational(u, v);

				// 1. Exact bit-for-bit equality with GCD-reduced rational reference
				assert.deepEqual(actual, expected);

				// 2. Orthogonality of residual: |(u * SCALE - proj) · v| <= sum(|v_i|) / 2
				let residualDotV = 0n;
				let sumAbsV = 0n;
				for (let i = 0; i < dim; i++) {
					residualDotV += (u[i] * SCALE - actual[i]) * v[i];
					sumAbsV += absBigInt(v[i]);
				}
				assert.ok(
					absBigInt(residualDotV) * 2n <= sumAbsV,
					`Residual not orthogonal: |res·v|=${absBigInt(residualDotV)}, bound=${sumAbsV / 2n}`,
				);

				// 3. Scale invariance in v: proj(u, k * v) === proj(u, v) for k != 0
				const k = trial % 2 === 0 ? 17n : -23n;
				const scaledV = v.map((x) => x * k);
				assert.deepEqual(projectionBigIntIterative(u, scaledV), actual);

				// 4. Antisymmetry in u: proj(-u, v) === -proj(u, v)
				const negU = u.map((x) => -x);
				assert.deepEqual(
					projectionBigIntIterative(negU, v),
					actual.map((x) => -x),
				);
			}
		});
	});
});
