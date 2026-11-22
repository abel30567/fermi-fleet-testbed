import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductFloatSeries } from './crossProductFloatSeries.js'

/**
 * Helper: dot product of two 3D vectors.
 * @param {number[]} u
 * @param {number[]} v
 * @returns {number}
 */
function dot3(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}

/**
 * Helper: squared Euclidean norm of a 3D vector.
 * @param {number[]} u
 * @returns {number}
 */
function normSq3(u) {
	return dot3(u, u)
}

/**
 * Helper: vector addition u + v.
 * @param {number[]} u
 * @param {number[]} v
 * @returns {number[]}
 */
function add3(u, v) {
	return [u[0] + v[0], u[1] + v[1], u[2] + v[2]]
}

/**
 * Helper: scalar-vector multiplication s * u.
 * @param {number} s
 * @param {number[]} u
 * @returns {number[]}
 */
function scale3(s, u) {
	return [s * u[0], s * u[1], s * u[2]]
}

/**
 * Helper: brute-force Levi-Civita tensor cross product using explicit
 * 3D permutation parity sum_{j,k} eps_{ijk} a_j b_k.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function bruteForceLeviCivitaCross(a, b) {
	const eps = (i, j, k) => {
		if (i === j || j === k || i === k) return 0
		if ((i === 0 && j === 1 && k === 2) || (i === 1 && j === 2 && k === 0) || (i === 2 && j === 0 && k === 1)) {
			return 1
		}
		return -1
	}
	const out = [0, 0, 0]
	for (let i = 0; i < 3; i++) {
		let acc = 0
		for (let j = 0; j < 3; j++) {
			for (let k = 0; k < 3; k++) {
				const e = eps(i, j, k)
				if (e !== 0) {
					acc += e * a[j] * b[k]
				}
			}
		}
		out[i] = acc === 0 ? 0 : acc
	}
	return out
}

/**
 * Helper: assert two 3D vectors are component-wise close within tolerance.
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {number} tol
 */
function assertVecClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		const scale = Math.max(1, Math.abs(actual[i]), Math.abs(expected[i]))
		assert.ok(
			diff <= tol * scale,
			`Component ${i} mismatch: got ${actual[i]}, expected ${expected[i]} (diff=${diff}, tol=${tol * scale})`
		)
	}
}

describe('crossProductFloatSeries', () => {
	describe('standard basis and known analytical cases', () => {
		it('satisfies right-handed cyclic products of standard basis vectors', () => {
			const e0 = [1, 0, 0]
			const e1 = [0, 1, 0]
			const e2 = [0, 0, 1]

			assert.deepStrictEqual(crossProductFloatSeries(e0, e1), [0, 0, 1])
			assert.deepStrictEqual(crossProductFloatSeries(e1, e2), [1, 0, 0])
			assert.deepStrictEqual(crossProductFloatSeries(e2, e0), [0, 1, 0])

			assert.deepStrictEqual(crossProductFloatSeries(e1, e0), [0, 0, -1])
			assert.deepStrictEqual(crossProductFloatSeries(e2, e1), [-1, 0, 0])
			assert.deepStrictEqual(crossProductFloatSeries(e0, e2), [0, -1, 0])
		})

		it('computes exact integer cross products', () => {
			assert.deepStrictEqual(crossProductFloatSeries([2, 3, 4], [5, 6, 7]), [-3, 6, -3])
			assert.deepStrictEqual(crossProductFloatSeries([1, -2, 3], [-4, 5, -6]), [-3, -6, -3])
			assert.deepStrictEqual(crossProductFloatSeries([3, -3, 1], [4, 9, 2]), [-15, -2, 39])
		})

		it('computes general floating-point cross products accurately', () => {
			const a = [1.5, -2.25, 3.75]
			const b = [-0.5, 4.125, -1.25]
			// Exact binary fractions:
			// c0 = (-2.25)(-1.25) - (3.75)(4.125) = 2.8125 - 15.46875 = -12.65625
			// c1 = (3.75)(-0.5) - (1.5)(-1.25) = -1.875 - (-1.875) = 0
			// c2 = (1.5)(4.125) - (-2.25)(-0.5) = 6.1875 - 1.125 = 5.0625
			assert.deepStrictEqual(crossProductFloatSeries(a, b), [-12.65625, 0, 5.0625])
		})

		it('does not mutate input arrays', () => {
			const a = [1, 2, 3]
			const b = [4, 5, 6]
			const res = crossProductFloatSeries(a, b)
			assert.deepStrictEqual(a, [1, 2, 3])
			assert.deepStrictEqual(b, [4, 5, 6])
			assert.notEqual(res, a)
			assert.notEqual(res, b)
		})
	})

	describe('edge cases and numerical stability', () => {
		it('handles zero vectors and normalizes -0 to +0', () => {
			const zero = [0, 0, 0]
			const negZero = [-0, -0, -0]
			const v = [-1.5, 2.5, -3.5]

			for (const res of [
				crossProductFloatSeries(zero, v),
				crossProductFloatSeries(v, zero),
				crossProductFloatSeries(negZero, v),
				crossProductFloatSeries(v, negZero),
				crossProductFloatSeries(zero, zero)
			]) {
				assert.deepStrictEqual(res, [0, 0, 0])
				for (const c of res) {
					assert.ok(Object.is(c, 0), `Expected +0, got ${Object.is(c, -0) ? '-0' : c}`)
				}
			}
		})

		it('returns zero vector for parallel and anti-parallel vectors', () => {
			const v = [1.23456789, -9.87654321, 3.14159265]
			assert.deepStrictEqual(crossProductFloatSeries(v, v), [0, 0, 0])
			assert.deepStrictEqual(crossProductFloatSeries(v, scale3(-1, v)), [0, 0, 0])
			assert.deepStrictEqual(crossProductFloatSeries(v, scale3(4, v)), [0, 0, 0])
			assert.deepStrictEqual(crossProductFloatSeries(v, scale3(-0.25, v)), [0, 0, 0])
		})

		it('eliminates catastrophic cancellation for nearly collinear vectors via compensated minors', () => {
			// u = 1 + 2^-27, v = 1 - 2^-27 => exact u*v = 1 - 2^-54, while fl(u*v) === 1.
			// Naive float64 determinant (u*v - 1*1) gives 0 (100% relative error);
			// Dekker-Veltkamp compensated determinant recovers the exact -2^-54.
			const delta = 2 ** -27
			const u = 1 + delta
			const v = 1 - delta
			const exactMinor = -(2 ** -54)

			// a = [u, 1, 0], b = [1, v, 0] => c = [0, 0, u*v - 1*1] = [0, 0, -2^-54]
			const res = crossProductFloatSeries([u, 1, 0], [1, v, 0])
			assert.deepStrictEqual(res, [0, 0, exactMinor])

			// Verify same precision in all three components
			assert.deepStrictEqual(crossProductFloatSeries([0, u, 1], [0, 1, v]), [exactMinor, 0, 0])
			assert.deepStrictEqual(crossProductFloatSeries([1, 0, u], [v, 0, 1]), [0, exactMinor, 0])
		})

		it('handles very small and very large finite magnitudes without spurious NaN', () => {
			// Very small (subnormal product range)
			const tinyA = [1e-160, 0, 0]
			const tinyB = [0, 1e-160, 0]
			const tinyC = crossProductFloatSeries(tinyA, tinyB)
			assert.equal(tinyC[0], 0)
			assert.equal(tinyC[1], 0)
			assert.ok(Number.isFinite(tinyC[2]) && tinyC[2] >= 0)

			// Very large inputs whose products stay finite (1e305 * 1e-305 = 1)
			const mixedA = [1e305, 0, 0]
			const mixedB = [0, 1e-305, 0]
			const mixedC = crossProductFloatSeries(mixedA, mixedB)
			assertVecClose(mixedC, [0, 0, 1], 1e-15)

			// Overflowing product yields standard IEEE-754 Infinity rather than NaN
			const hugeA = [1e200, 0, 0]
			const hugeB = [0, 1e200, 0]
			assert.deepStrictEqual(crossProductFloatSeries(hugeA, hugeB), [0, 0, Infinity])
		})
	})

	describe('algebraic and geometric identity cross-checks', () => {
		const vectorTriples = [
			[
				[1.2, -3.4, 5.6],
				[-7.8, 9.1, -2.3],
				[4.5, 6.7, -8.9]
			],
			[
				[Math.PI, -Math.E, Math.SQRT2],
				[Math.LN10, Math.SQRT1_2, -Math.LN2],
				[-1 / 3, 1 / 7, 1 / 11]
			],
			[
				[1e6, -2.5e5, 3.75e6],
				[-4.25e5, 8.125e6, -1.5e6],
				[9.5e5, -3.25e6, 2.75e5]
			],
			[
				[1e-6, 2.3e-6, -4.1e-6],
				[-3.7e-6, 1.9e-6, 5.2e-6],
				[2.8e-6, -6.4e-6, 1.1e-6]
			]
		]

		it('satisfies orthogonality: (a × b) · a = 0 and (a × b) · b = 0', () => {
			for (const [a, b] of vectorTriples) {
				const c = crossProductFloatSeries(a, b)
				const scaleA = Math.sqrt(normSq3(c) * normSq3(a))
				const scaleB = Math.sqrt(normSq3(c) * normSq3(b))
				assert.ok(Math.abs(dot3(c, a)) <= 1e-14 * scaleA)
				assert.ok(Math.abs(dot3(c, b)) <= 1e-14 * scaleB)
			}
		})

		it('satisfies exact bit-for-bit anti-commutativity: a × b = -(b × a)', () => {
			for (const [a, b] of vectorTriples) {
				const ab = crossProductFloatSeries(a, b)
				const ba = crossProductFloatSeries(b, a)
				const negBa = ba.map((x) => (x === 0 ? 0 : -x))
				assert.deepStrictEqual(ab, negBa)
			}
		})

		it('satisfies Lagrange identity: ||a × b||^2 + (a · b)^2 = ||a||^2 ||b||^2', () => {
			for (const [a, b] of vectorTriples) {
				const c = crossProductFloatSeries(a, b)
				const lhs = normSq3(c) + dot3(a, b) ** 2
				const rhs = normSq3(a) * normSq3(b)
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-13 * rhs,
					`Lagrange identity mismatch: lhs=${lhs}, rhs=${rhs}`
				)
			}
		})

		it('satisfies Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0', () => {
			for (const [a, b, c] of vectorTriples) {
				const t1 = crossProductFloatSeries(a, crossProductFloatSeries(b, c))
				const t2 = crossProductFloatSeries(b, crossProductFloatSeries(c, a))
				const t3 = crossProductFloatSeries(c, crossProductFloatSeries(a, b))
				const sum = add3(add3(t1, t2), t3)
				const scale = Math.sqrt(normSq3(a) * normSq3(b) * normSq3(c))
				for (let i = 0; i < 3; i++) {
					assert.ok(
						Math.abs(sum[i]) <= 1e-13 * scale,
						`Jacobi identity component ${i} mismatch: got ${sum[i]}, scale=${scale}`
					)
				}
			}
		})

		it('satisfies BAC-CAB vector triple product identity: a × (b × c) = b(a · c) - c(a · b)', () => {
			for (const [a, b, c] of vectorTriples) {
				const lhs = crossProductFloatSeries(a, crossProductFloatSeries(b, c))
				const rhs = add3(scale3(dot3(a, c), b), scale3(-dot3(a, b), c))
				assertVecClose(lhs, rhs, 1e-13)
			}
		})

		it('satisfies bilinearity in both arguments', () => {
			const s = 2.75
			const t = -1.35
			for (const [a, b, c] of vectorTriples) {
				const lhs1 = crossProductFloatSeries(add3(scale3(s, a), scale3(t, b)), c)
				const rhs1 = add3(
					scale3(s, crossProductFloatSeries(a, c)),
					scale3(t, crossProductFloatSeries(b, c))
				)
				assertVecClose(lhs1, rhs1, 1e-13)

				const lhs2 = crossProductFloatSeries(a, add3(scale3(s, b), scale3(t, c)))
				const rhs2 = add3(
					scale3(s, crossProductFloatSeries(a, b)),
					scale3(t, crossProductFloatSeries(a, c))
				)
				assertVecClose(lhs2, rhs2, 1e-13)
			}
		})

		it('matches independent brute-force Levi-Civita tensor summation and scalar triple product invariance', () => {
			for (const [a, b, c] of vectorTriples) {
				const actual = crossProductFloatSeries(a, b)
				const brute = bruteForceLeviCivitaCross(a, b)
				assertVecClose(actual, brute, 1e-14)

				const stp1 = dot3(a, crossProductFloatSeries(b, c))
				const stp2 = dot3(b, crossProductFloatSeries(c, a))
				const stp3 = dot3(c, crossProductFloatSeries(a, b))
				const scale = Math.max(1, Math.abs(stp1), Math.abs(stp2), Math.abs(stp3))
				assert.ok(Math.abs(stp1 - stp2) <= 1e-13 * scale)
				assert.ok(Math.abs(stp2 - stp3) <= 1e-13 * scale)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				'123',
				true,
				{ 0: 1, 1: 2, 2: 3, length: 3 },
				new Float64Array([1, 2, 3])
			]
			for (const bad of invalidInputs) {
				assert.throws(() => crossProductFloatSeries(bad, [1, 2, 3]), TypeError)
				assert.throws(() => crossProductFloatSeries([1, 2, 3], bad), TypeError)
			}
		})

		it('throws RangeError for arrays whose length is not 3', () => {
			const wrongLengths = [[], [1], [1, 2], [1, 2, 3, 4]]
			for (const bad of wrongLengths) {
				assert.throws(() => crossProductFloatSeries(bad, [1, 2, 3]), RangeError)
				assert.throws(() => crossProductFloatSeries([1, 2, 3], bad), RangeError)
			}
		})

		it('throws TypeError for non-number elements or sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const badVectors = [
				['1', 2, 3],
				[1, null, 3],
				[1, 2, undefined],
				[true, 2, 3],
				[1, 2n, 3],
				[1, {}, 3],
				new Array(3),
				[1, , 3]
			]
			for (const bad of badVectors) {
				assert.throws(() => crossProductFloatSeries(bad, [1, 2, 3]), TypeError)
				assert.throws(() => crossProductFloatSeries([1, 2, 3], bad), TypeError)
			}
		})

		it('throws RangeError for NaN, Infinity, and -Infinity elements', () => {
			const nonFiniteValues = [NaN, Infinity, -Infinity]
			for (const val of nonFiniteValues) {
				for (let idx = 0; idx < 3; idx++) {
					const bad = [1, 2, 3]
					bad[idx] = val
					assert.throws(() => crossProductFloatSeries(bad, [1, 2, 3]), RangeError)
					assert.throws(() => crossProductFloatSeries([1, 2, 3], bad), RangeError)
				}
			}
		})
	})
})
