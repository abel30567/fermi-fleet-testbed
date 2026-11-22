import { describe, test } from 'node:test'
import assert from 'node:assert'
import { projectionBigIntIterative } from './projectionBigIntIterative.js'

const SCALE = 10n ** 18n

function absBigInt(x) {
	return x < 0n ? -x : x
}

function dotBigInt(a, b) {
	let sum = 0n
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}

function projectionFloat64(u, v) {
	let dotUV = 0
	let dotVV = 0
	for (let i = 0; i < u.length; i++) {
		dotUV += u[i] * v[i]
		dotVV += v[i] * v[i]
	}
	const scalar = dotUV / dotVV
	return v.map((vi) => scalar * vi)
}

describe('projectionBigIntIterative', () => {
	describe('normal cases', () => {
		test('projects 2D vector onto x-axis', () => {
			const res = projectionBigIntIterative([3n, 4n], [1n, 0n])
			assert.deepStrictEqual(res, [3n * SCALE, 0n])
		})

		test('projects 2D vector with exact finite decimal components', () => {
			// u·v = 1*3 + 2*4 = 11, v·v = 9 + 16 = 25
			// proj = [33/25, 44/25] = [1.32, 1.76]
			const res = projectionBigIntIterative([1n, 2n], [3n, 4n])
			assert.deepStrictEqual(res, [1320000000000000000n, 1760000000000000000n])
		})

		test('projects 3D vector with non-terminating decimal (truncates toward zero)', () => {
			// u·v = 1, v·v = 3 -> [1/3, 1/3, 1/3]
			const res = projectionBigIntIterative([1n, 0n, 0n], [1n, 1n, 1n])
			const oneThird = 333333333333333333n
			assert.deepStrictEqual(res, [oneThird, oneThird, oneThird])
		})

		test('projects 1D vectors', () => {
			assert.deepStrictEqual(projectionBigIntIterative([7n], [3n]), [7n * SCALE])
			assert.deepStrictEqual(projectionBigIntIterative([7n], [-3n]), [7n * SCALE])
			assert.deepStrictEqual(projectionBigIntIterative([-7n], [3n]), [-7n * SCALE])
		})

		test('does not mutate input arrays', () => {
			const u = [2n, -3n, 5n]
			const v = [4n, 1n, -2n]
			projectionBigIntIterative(u, v)
			assert.deepStrictEqual(u, [2n, -3n, 5n])
			assert.deepStrictEqual(v, [4n, 1n, -2n])
		})
	})

	describe('edge cases', () => {
		test('orthogonal vectors project to the zero vector', () => {
			assert.deepStrictEqual(
				projectionBigIntIterative([1n, 0n], [0n, 5n]),
				[0n, 0n],
			)
			assert.deepStrictEqual(
				projectionBigIntIterative([1n, -2n, 1n], [2n, 1n, 0n]),
				[0n, 0n, 0n],
			)
		})

		test('parallel and anti-parallel vectors project to u * 10^18', () => {
			assert.deepStrictEqual(
				projectionBigIntIterative([6n, 9n, 12n], [2n, 3n, 4n]),
				[6n * SCALE, 9n * SCALE, 12n * SCALE],
			)
			assert.deepStrictEqual(
				projectionBigIntIterative([6n, -9n, 12n], [-2n, 3n, -4n]),
				[6n * SCALE, -9n * SCALE, 12n * SCALE],
			)
		})

		test('zero vector u projects to the zero vector', () => {
			assert.deepStrictEqual(
				projectionBigIntIterative([0n, 0n, 0n], [3n, -4n, 5n]),
				[0n, 0n, 0n],
			)
		})

		test('negative components truncate toward zero', () => {
			// u·v = -1, v·v = 3 -> [-1/3, -1/3, -1/3]
			const res = projectionBigIntIterative([-1n, 0n, 0n], [1n, 1n, 1n])
			const negOneThird = -333333333333333333n
			assert.deepStrictEqual(res, [negOneThird, negOneThird, negOneThird])

			// u = [-5n, -2n], v = [-1n, 2n]: dotUV = 5 - 4 = 1, dotVV = 5 -> [-0.2, 0.4]
			assert.deepStrictEqual(
				projectionBigIntIterative([-5n, -2n], [-1n, 2n]),
				[-200000000000000000n, 400000000000000000n],
			)
		})

		test('handles large BigInts beyond Number.MAX_SAFE_INTEGER exactly', () => {
			const big = 10n ** 30n
			// u = [3*big + 1, 0], v = [2*big, 0] -> parallel, must equal [ (3*big + 1) * SCALE, 0n ]
			const parallelRes = projectionBigIntIterative(
				[3n * big + 1n, 0n],
				[2n * big, 0n],
			)
			assert.deepStrictEqual(parallelRes, [(3n * big + 1n) * SCALE, 0n])

			// u = [big, big], v = [big, 0] -> exact projection [big * SCALE, 0n]
			const axisRes = projectionBigIntIterative([big, big], [big, 0n])
			assert.deepStrictEqual(axisRes, [big * SCALE, 0n])

			// Non-trivial large BigInt projection: u = [big + 1, 2*big], v = [big, big]
			// dotUV = (3*big + 1)*big, dotVV = 2*big^2
			// component = ((3*big + 1) * big^2 * SCALE) / (2*big^2) = ((3*big + 1) * SCALE) / 2
			const res = projectionBigIntIterative([big + 1n, 2n * big], [big, big])
			const expected = ((3n * big + 1n) * SCALE) / 2n
			assert.deepStrictEqual(res, [expected, expected])
		})
	})

	describe('input validation', () => {
		test('throws RangeError when target vector v is the zero vector', () => {
			assert.throws(() => projectionBigIntIterative([1n], [0n]), RangeError)
			assert.throws(
				() => projectionBigIntIterative([1n, 2n, 3n], [0n, 0n, 0n]),
				RangeError,
			)
		})

		test('throws RangeError for empty vectors', () => {
			assert.throws(() => projectionBigIntIterative([], []), RangeError)
			assert.throws(() => projectionBigIntIterative([], [1n]), RangeError)
			assert.throws(() => projectionBigIntIterative([1n], []), RangeError)
		})

		test('throws RangeError for mismatched vector lengths', () => {
			assert.throws(
				() => projectionBigIntIterative([1n, 2n], [1n]),
				RangeError,
			)
			assert.throws(
				() => projectionBigIntIterative([1n], [1n, 2n, 3n]),
				RangeError,
			)
		})

		test('throws TypeError for non-Array inputs', () => {
			assert.throws(() => projectionBigIntIterative(null, [1n]), TypeError)
			assert.throws(() => projectionBigIntIterative([1n], undefined), TypeError)
			assert.throws(() => projectionBigIntIterative('1', [1n]), TypeError)
			assert.throws(
				() => projectionBigIntIterative({ length: 1, 0: 1n }, [1n]),
				TypeError,
			)
			assert.throws(() => projectionBigIntIterative([1n], 1n), TypeError)
		})

		test('throws TypeError for non-BigInt elements', () => {
			assert.throws(
				() => projectionBigIntIterative([1, 2], [1n, 2n]),
				TypeError,
			)
			assert.throws(
				() => projectionBigIntIterative([1n, '2'], [1n, 2n]),
				TypeError,
			)
			assert.throws(
				() => projectionBigIntIterative([1n, 2n], [1n, 2]),
				TypeError,
			)
			assert.throws(
				() => projectionBigIntIterative([1n, null], [0n, 0n]),
				TypeError,
			)
		})
	})

	describe('mathematical and independent cross-checks', () => {
		const samplePairs = [
			[
				[5n, -3n, 7n],
				[2n, 4n, -1n],
			],
			[
				[-13n, 29n, -7n, 11n],
				[3n, -5n, 8n, -2n],
			],
			[
				[100n, 200n, -300n],
				[7n, 11n, 13n],
			],
			[
				[1n, 2n, 3n, 4n, 5n],
				[-5n, 4n, -3n, 2n, -1n],
			],
		]

		test('orthogonality of residual: (u * 10^18 - proj_v(u)) · v ≈ 0', () => {
			for (const [u, v] of samplePairs) {
				const proj = projectionBigIntIterative(u, v)
				const residual = u.map((ui, i) => ui * SCALE - proj[i])
				const residualDotV = dotBigInt(residual, v)
				// Each component of proj has truncation error strictly less than 1n,
				// so |residual · v| < sum(|v[i]|).
				const maxBound = v.reduce((acc, vi) => acc + absBigInt(vi), 0n)
				assert.ok(
					absBigInt(residualDotV) <= maxBound,
					`Expected |residual · v| (${absBigInt(residualDotV)}) <= ${maxBound}`,
				)
			}
		})

		test('idempotence: projecting proj_v(u) onto v matches proj_v(u) * 10^18 within rounding', () => {
			for (const [u, v] of samplePairs) {
				const proj1 = projectionBigIntIterative(u, v)
				const proj2 = projectionBigIntIterative(proj1, v)
				const dotVV = dotBigInt(v, v)
				const sumAbsV = v.reduce((acc, vi) => acc + absBigInt(vi), 0n)

				for (let i = 0; i < v.length; i++) {
					const proj2Rescaled = proj2[i] / SCALE
					const diff = absBigInt(proj2Rescaled - proj1[i])
					const maxDiff = 2n + (sumAbsV * absBigInt(v[i])) / dotVV
					assert.ok(
						diff <= maxDiff,
						`Component ${i}: |proj2/SCALE - proj1| = ${diff} exceeded ${maxDiff}`,
					)
				}
			}

			// Exact idempotence when projection has exact fixed-point representation
			const exactProj1 = projectionBigIntIterative([1n, 2n], [3n, 4n])
			const exactProj2 = projectionBigIntIterative(exactProj1, [3n, 4n])
			assert.deepStrictEqual(
				exactProj2,
				exactProj1.map((x) => x * SCALE),
			)
		})

		test('scale invariance of v: proj_{k*v}(u) === proj_v(u) identically for non-zero k', () => {
			for (const [u, v] of samplePairs) {
				const base = projectionBigIntIterative(u, v)
				for (const k of [7n, -13n, 10n ** 12n]) {
					const scaledV = v.map((vi) => vi * k)
					assert.deepStrictEqual(projectionBigIntIterative(u, scaledV), base)
				}
			}
		})

		test('cross-check against independent float64 implementation', () => {
			for (const [u, v] of samplePairs) {
				const bigRes = projectionBigIntIterative(u, v)
				const floatRes = projectionFloat64(u.map(Number), v.map(Number))

				for (let i = 0; i < u.length; i++) {
					const fromBigInt = Number(bigRes[i]) / 1e18
					const tol = Math.max(1e-12, Math.abs(floatRes[i]) * 1e-12)
					assert.ok(
						Math.abs(fromBigInt - floatRes[i]) <= tol,
						`Component ${i}: BigInt ${fromBigInt} vs float64 ${floatRes[i]}`,
					)
				}
			}
		})
	})
})
