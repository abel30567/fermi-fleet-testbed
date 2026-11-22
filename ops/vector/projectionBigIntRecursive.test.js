import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectionBigIntRecursive, SCALE } from './projectionBigIntRecursive.js'

/**
 * Independent naive iterative floating-point reference implementation.
 * @param {number[]} u
 * @param {number[]} v
 * @returns {number[]}
 */
function projectionFloatReference(u, v) {
	let dotUV = 0
	let dotVV = 0
	for (let i = 0; i < u.length; i++) {
		dotUV += u[i] * v[i]
		dotVV += v[i] * v[i]
	}
	const scalar = dotUV / dotVV
	return v.map((vi) => scalar * vi)
}

/**
 * Independent naive iterative BigInt reference implementation (ties-to-even).
 * @param {bigint[]} u
 * @param {bigint[]} v
 * @param {bigint} [scale=SCALE]
 * @returns {bigint[]}
 */
function projectionBigIntIterativeReference(u, v, scale = SCALE) {
	let dotUV = 0n
	let dotVV = 0n
	for (let i = 0; i < u.length; i++) {
		dotUV += u[i] * v[i]
		dotVV += v[i] * v[i]
	}
	const res = []
	for (let i = 0; i < v.length; i++) {
		const num = dotUV * v[i] * scale
		const q = num / dotVV
		const r = num % dotVV
		const absR = r < 0n ? -r : r
		const twiceR = absR * 2n
		if (twiceR > dotVV || (twiceR === dotVV && (q & 1n) !== 0n)) {
			res.push(num >= 0n ? q + 1n : q - 1n)
		} else {
			res.push(q)
		}
	}
	return res
}

function absBigInt(x) {
	return x < 0n ? -x : x
}

describe('projectionBigIntRecursive', () => {
	it('exports SCALE as 10n ** 18n', () => {
		assert.equal(SCALE, 10n ** 18n)
	})

	describe('normal cases', () => {
		it('computes exact integer-valued projections onto axis vectors', () => {
			assert.deepEqual(
				projectionBigIntRecursive([3n, 4n], [1n, 0n]),
				[3n * SCALE, 0n]
			)
			assert.deepEqual(
				projectionBigIntRecursive([3n, 4n], [0n, 5n]),
				[0n, 4n * SCALE]
			)
			assert.deepEqual(
				projectionBigIntRecursive([7n, -2n, 9n], [0n, 0n, -3n]),
				[0n, 0n, 9n * SCALE]
			)
		})

		it('computes non-integer rational projections accurately to 10^18 scale', () => {
			// u = [1, 2], v = [3, 4] -> dotUV = 11, dotVV = 25 -> (11/25) * [3, 4] = [1.32, 1.76]
			assert.deepEqual(
				projectionBigIntRecursive([1n, 2n], [3n, 4n]),
				[1320000000000000000n, 1760000000000000000n]
			)

			// u = [1, 0], v = [1, 1] -> (1/2) * [1, 1] = [0.5, 0.5]
			assert.deepEqual(
				projectionBigIntRecursive([1n, 0n], [1n, 1n]),
				[5n * 10n ** 17n, 5n * 10n ** 17n]
			)

			// u = [1, 0, 0], v = [1, 1, 1] -> (1/3) * [1, 1, 1]
			const oneThird = 333333333333333333n
			assert.deepEqual(
				projectionBigIntRecursive([1n, 0n, 0n], [1n, 1n, 1n]),
				[oneThird, oneThird, oneThird]
			)

			// u = [2, 0, 0], v = [1, 1, 1] -> (2/3) * [1, 1, 1] -> rounds up to ...667
			const twoThirds = 666666666666666667n
			assert.deepEqual(
				projectionBigIntRecursive([2n, 0n, 0n], [1n, 1n, 1n]),
				[twoThirds, twoThirds, twoThirds]
			)
		})

		it('handles negative coordinates and obtuse angles', () => {
			// u = [-5, 2], v = [3, -4] -> dotUV = -15 - 8 = -23, dotVV = 25
			// (-23/25) * [3, -4] = [-2.76, 3.68]
			assert.deepEqual(
				projectionBigIntRecursive([-5n, 2n], [3n, -4n]),
				[-2760000000000000000n, 3680000000000000000n]
			)

			// Antiparallel: u = [-6, 9], v = [2, -3] -> proj_v(u) = u
			assert.deepEqual(
				projectionBigIntRecursive([-6n, 9n], [2n, -3n]),
				[-6n * SCALE, 9n * SCALE]
			)
		})

		it('handles very large BigInt coordinates without overflow or precision loss', () => {
			const big = 10n ** 40n
			const u = [3n * big, 4n * big, -5n * big]
			const v = [1n * big, 2n * big, 2n * big]
			// dotUV = (3 + 8 - 10) * big^2 = 1 * big^2
			// dotVV = (1 + 4 + 4) * big^2 = 9 * big^2
			// proj_v(u) = (1/9) * [1, 2, 2] * big (remainders 1/9 and 2/9 round down)
			const expected = [
				(1n * big * SCALE) / 9n,
				(2n * big * SCALE) / 9n,
				(2n * big * SCALE) / 9n,
			]
			assert.deepEqual(projectionBigIntRecursive(u, v), expected)

			// Also verify round-up case on huge BigInts: (5/9) * [1, 2, 2] * big
			// 5/9 -> remainder 5 (rounds up +1); 10/9 -> 1 + 1/9 (rounds down)
			const u2 = [5n * big, 0n, 0n]
			const expected2 = [
				(5n * big * SCALE) / 9n + 1n,
				(10n * big * SCALE) / 9n,
				(10n * big * SCALE) / 9n,
			]
			assert.deepEqual(projectionBigIntRecursive(u2, v), expected2)
		})

		it('supports custom positive BigInt scale', () => {
			// u = [1, 2], v = [3, 4] -> [1.32, 1.76]
			assert.deepEqual(
				projectionBigIntRecursive([1n, 2n], [3n, 4n], 100n),
				[132n, 176n]
			)
			assert.deepEqual(
				projectionBigIntRecursive([1n, 2n], [3n, 4n], 10n),
				[13n, 18n]
			)
		})

		it('handles high-dimensional vectors without stack overflow', () => {
			const n = 5000
			const u = Array.from({ length: n }, (_, i) => BigInt((i % 7) - 3))
			const v = Array.from({ length: n }, (_, i) => BigInt((i % 5) + 1))
			const result = projectionBigIntRecursive(u, v)
			const expected = projectionBigIntIterativeReference(u, v)
			assert.equal(result.length, n)
			assert.deepEqual(result, expected)
		})
	})

	describe('edge cases', () => {
		it('handles 1D vectors (projection onto any non-zero 1D vector is u itself)', () => {
			assert.deepEqual(projectionBigIntRecursive([42n], [7n]), [42n * SCALE])
			assert.deepEqual(projectionBigIntRecursive([-13n], [-99n]), [-13n * SCALE])
			assert.deepEqual(projectionBigIntRecursive([0n], [1n]), [0n])
		})

		it('returns the zero vector when u is zero or orthogonal to v', () => {
			assert.deepEqual(
				projectionBigIntRecursive([0n, 0n, 0n], [4n, -5n, 6n]),
				[0n, 0n, 0n]
			)
			// [1, 2, -1] · [2, -1, 0] = 0
			assert.deepEqual(
				projectionBigIntRecursive([1n, 2n, -1n], [2n, -1n, 0n]),
				[0n, 0n, 0n]
			)
		})

		it('is exact when u is parallel to v', () => {
			const v = [3n, -7n, 11n, -13n]
			const u = v.map((x) => x * 17n)
			assert.deepEqual(
				projectionBigIntRecursive(u, v),
				u.map((x) => x * SCALE)
			)
		})

		it('applies exact ties-to-even (banker’s) rounding at exact half midpoints', () => {
			// u = [k, 0], v = [1, 1] -> proj_v(u) = [k/2, k/2]
			// With scale = 1n, exact half midpoints occur for odd k.
			assert.deepEqual(projectionBigIntRecursive([1n, 0n], [1n, 1n], 1n), [0n, 0n]) // 0.5 -> 0
			assert.deepEqual(projectionBigIntRecursive([3n, 0n], [1n, 1n], 1n), [2n, 2n]) // 1.5 -> 2
			assert.deepEqual(projectionBigIntRecursive([5n, 0n], [1n, 1n], 1n), [2n, 2n]) // 2.5 -> 2
			assert.deepEqual(projectionBigIntRecursive([7n, 0n], [1n, 1n], 1n), [4n, 4n]) // 3.5 -> 4
			assert.deepEqual(projectionBigIntRecursive([-1n, 0n], [1n, 1n], 1n), [0n, 0n]) // -0.5 -> 0
			assert.deepEqual(projectionBigIntRecursive([-3n, 0n], [1n, 1n], 1n), [-2n, -2n]) // -1.5 -> -2
			assert.deepEqual(projectionBigIntRecursive([-5n, 0n], [1n, 1n], 1n), [-2n, -2n]) // -2.5 -> -2
			assert.deepEqual(projectionBigIntRecursive([-7n, 0n], [1n, 1n], 1n), [-4n, -4n]) // -3.5 -> -4
		})

		it('does not mutate input arrays', () => {
			const u = [1n, 2n, 3n]
			const v = [4n, 5n, 6n]
			const uCopy = [...u]
			const vCopy = [...v]
			projectionBigIntRecursive(u, v)
			assert.deepEqual(u, uCopy)
			assert.deepEqual(v, vCopy)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when u or v is not an array', () => {
			assert.throws(() => projectionBigIntRecursive(null, [1n]), TypeError)
			assert.throws(() => projectionBigIntRecursive([1n], undefined), TypeError)
			assert.throws(() => projectionBigIntRecursive('123', [1n]), TypeError)
			assert.throws(() => projectionBigIntRecursive([1n], { 0: 1n, length: 1 }), TypeError)
			assert.throws(() => projectionBigIntRecursive(new BigInt64Array([1n]), [1n]), TypeError)
		})

		it('throws TypeError when any coordinate is not a bigint (including sparse arrays)', () => {
			assert.throws(() => projectionBigIntRecursive([1, 2n], [1n, 2n]), TypeError)
			assert.throws(() => projectionBigIntRecursive([1n, 2n], [1n, '2']), TypeError)
			assert.throws(() => projectionBigIntRecursive([1n, null], [1n, 2n]), TypeError)
			assert.throws(() => projectionBigIntRecursive([1n, NaN], [1n, 2n]), TypeError)
			// Sparse array hole
			const sparse = new Array(2)
			sparse[0] = 1n
			assert.throws(() => projectionBigIntRecursive(sparse, [1n, 2n]), TypeError)
			assert.throws(() => projectionBigIntRecursive([1n, 2n], sparse), TypeError)
		})

		it('throws TypeError or RangeError for invalid scale', () => {
			assert.throws(() => projectionBigIntRecursive([1n], [1n], 1000), TypeError)
			assert.throws(() => projectionBigIntRecursive([1n], [1n], '1000'), TypeError)
			assert.throws(() => projectionBigIntRecursive([1n], [1n], 0n), RangeError)
			assert.throws(() => projectionBigIntRecursive([1n], [1n], -10n), RangeError)
		})

		it('throws RangeError for empty vectors, mismatched lengths, or zero target vector', () => {
			assert.throws(() => projectionBigIntRecursive([], []), RangeError)
			assert.throws(() => projectionBigIntRecursive([1n], []), RangeError)
			assert.throws(() => projectionBigIntRecursive([1n, 2n], [1n, 2n, 3n]), RangeError)
			assert.throws(() => projectionBigIntRecursive([1n], [0n]), RangeError)
			assert.throws(() => projectionBigIntRecursive([1n, 2n, 3n], [0n, 0n, 0n]), RangeError)
		})
	})

	describe('independent cross-checks & algebraic identities', () => {
		it('matches floating-point reference within 1e-12 across diverse dimensions', () => {
			const cases = [
				[[3, -7], [5, 2]],
				[[12, -5, 8], [-3, 11, 7]],
				[[1, 2, 3, 4], [4, -1, 2, -3]],
				[[-19, 0, 23, -7, 13], [5, -17, 2, 9, -4]],
				[[101, -202, 303, -404, 505, -606, 707], [7, 11, -13, 17, -19, 23, -29]],
			]

			for (const [uNum, vNum] of cases) {
				const u = uNum.map(BigInt)
				const v = vNum.map(BigInt)
				const actual = projectionBigIntRecursive(u, v)
				const expectedFloat = projectionFloatReference(uNum, vNum)

				assert.equal(actual.length, expectedFloat.length)
				for (let i = 0; i < actual.length; i++) {
					const actualFloat = Number(actual[i]) / Number(SCALE)
					const diff = Math.abs(actualFloat - expectedFloat[i])
					assert.ok(
						diff < 1e-12,
						`Component ${i} mismatch: got ${actualFloat}, expected ${expectedFloat[i]} (diff=${diff})`
					)
				}
			}
		})

		it('matches independent naive iterative BigInt implementation bit-for-bit', () => {
			const pairs = [
				[[7n], [-13n]],
				[[11n, -29n], [37n, 41n]],
				[[10n ** 25n + 3n, -(10n ** 24n) + 7n, 999999999999999999n], [3n, -17n, 53n]],
				[
					[1n, -2n, 3n, -4n, 5n, -6n, 7n, -8n, 9n],
					[9n, 8n, -7n, 6n, -5n, 4n, -3n, 2n, -1n],
				],
			]
			for (const [u, v] of pairs) {
				assert.deepEqual(
					projectionBigIntRecursive(u, v),
					projectionBigIntIterativeReference(u, v)
				)
			}
		})

		it('satisfies residual orthogonality, Pythagorean theorem, invariance, symmetry, and linearity', () => {
			const u1 = [17n, -23n, 31n, -41n, 53n]
			const u2 = [-11n, 29n, -7n, 13n, -19n]
			const v = [3n, -5n, 7n, 11n, -13n]

			const p1 = projectionBigIntRecursive(u1, v)
			const p2 = projectionBigIntRecursive(u2, v)

			// 1. Residual orthogonality: (u1 * SCALE - p1) · v ≈ 0
			// Since each component of p1 has rounding error <= 0.5, |(u1*SCALE - p1) · v| <= 0.5 * sum(|v_i|).
			let residualDotV = 0n
			let vL1 = 0n
			for (let i = 0; i < v.length; i++) {
				residualDotV += (u1[i] * SCALE - p1[i]) * v[i]
				vL1 += absBigInt(v[i])
			}
			assert.ok(
				absBigInt(residualDotV) * 2n <= vL1,
				`Residual not orthogonal within rounding bound: |dot|=${absBigInt(residualDotV)}, bound=${vL1 / 2n}`
			)

			// 2. Pythagorean theorem: ||u1 * SCALE||^2 ≈ ||p1||^2 + ||u1 * SCALE - p1||^2
			let normUSq = 0n
			let normPSq = 0n
			let normRSq = 0n
			for (let i = 0; i < u1.length; i++) {
				const us = u1[i] * SCALE
				const r = us - p1[i]
				normUSq += us * us
				normPSq += p1[i] * p1[i]
				normRSq += r * r
			}
			// Relative error should be tiny (< 10^-15)
			const pythDiff = absBigInt(normUSq - (normPSq + normRSq))
			assert.ok(
				pythDiff * 10n ** 15n < normUSq,
				`Pythagorean identity failed: diff=${pythDiff}, normUSq=${normUSq}`
			)

			// 3. Exact scale invariance in v: proj_{k*v}(u) === proj_v(u) for k != 0
			for (const k of [-9999999999999999999n, -7n, -1n, 1n, 13n, 10n ** 30n]) {
				const kv = v.map((x) => x * k)
				assert.deepEqual(projectionBigIntRecursive(u1, kv), p1)
			}

			// 4. Exact odd symmetry in u: proj_v(-u) === -proj_v(u)
			const negU1 = u1.map((x) => -x)
			assert.deepEqual(
				projectionBigIntRecursive(negU1, v),
				p1.map((x) => -x)
			)

			// 5. Linearity in u: proj_v(u1 + u2) ≈ proj_v(u1) + proj_v(u2) within <= 1 ULP per component
			const uSum = u1.map((x, i) => x + u2[i])
			const pSum = projectionBigIntRecursive(uSum, v)
			for (let i = 0; i < v.length; i++) {
				assert.ok(
					absBigInt(pSum[i] - (p1[i] + p2[i])) <= 1n,
					`Linearity mismatch at ${i}: ${pSum[i]} vs ${p1[i] + p2[i]}`
				)
			}

			// 6. Idempotence: proj_v(proj_v(u)) ≈ proj_v(u) * SCALE
			const pp1 = projectionBigIntRecursive(p1, v)
			for (let i = 0; i < v.length; i++) {
				// Each component of p1 had <= 0.5 rounding error, so |pp1[i] - p1[i] * SCALE| <= sqrt(n) * SCALE
				assert.ok(
					absBigInt(pp1[i] - p1[i] * SCALE) <= 2n * SCALE,
					`Idempotence mismatch at ${i}: ${pp1[i]} vs ${p1[i] * SCALE}`
				)
			}
		})
	})
})
