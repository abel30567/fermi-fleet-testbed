import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddDualRecursive } from './vectorAddDualRecursive.js'

/**
 * Helper to assert two numbers are within an absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [eps=1e-12]
 */
function assertClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`Expected ${actual} to be within ${eps} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('vectorAddDualRecursive', () => {
	describe('normal cases', () => {
		it('adds small vectors of dual numbers component-wise', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: -4 },
				{ v: 0.5, d: 1.5 },
			]
			const b = [
				{ v: 10, d: -1 },
				{ v: -3, d: 4 },
				{ v: 2.25, d: 0.25 },
			]
			const res = vectorAddDualRecursive(a, b)
			assert.deepStrictEqual(res, [
				{ v: 11, d: 1 },
				{ v: 0, d: 0 },
				{ v: 2.75, d: 1.75 },
			])
		})

		it('handles even, odd, and power-of-two vector lengths', () => {
			for (const len of [2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 33]) {
				const a = Array.from({ length: len }, (_, i) => ({ v: i * 1.5, d: -i * 0.5 }))
				const b = Array.from({ length: len }, (_, i) => ({ v: len - i, d: i + 1 }))
				const res = vectorAddDualRecursive(a, b)
				assert.equal(res.length, len)
				for (let i = 0; i < len; i++) {
					assert.equal(res[i].v, a[i].v + b[i].v)
					assert.equal(res[i].d, a[i].d + b[i].d)
				}
			}
		})

		it('handles large vectors without stack overflow (O(log n) recursion depth)', () => {
			const n = 20000
			const a = Array.from({ length: n }, (_, i) => ({ v: i, d: 1 }))
			const b = Array.from({ length: n }, (_, i) => ({ v: -i, d: 2 }))
			const res = vectorAddDualRecursive(a, b)
			assert.equal(res.length, n)
			assert.deepStrictEqual(res[0], { v: 0, d: 3 })
			assert.deepStrictEqual(res[n - 1], { v: 0, d: 3 })
		})
	})

	describe('edge cases', () => {
		it('returns an empty array for empty input vectors', () => {
			assert.deepStrictEqual(vectorAddDualRecursive([], []), [])
		})

		it('handles single-element vectors (recursion base case)', () => {
			const res = vectorAddDualRecursive([{ v: -7.5, d: 3.25 }], [{ v: 2.5, d: -1.25 }])
			assert.deepStrictEqual(res, [{ v: -5, d: 2 }])
		})

		it('does not mutate input vectors or their dual elements', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
			]
			const b = [
				{ v: 5, d: 6 },
				{ v: 7, d: 8 },
			]
			const aSnap = structuredClone(a)
			const bSnap = structuredClone(b)

			const res = vectorAddDualRecursive(a, b)
			res[0].v = 999
			res[0].d = 999

			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
			assert.notEqual(res[0], a[0])
			assert.notEqual(res[0], b[0])
		})

		it('satisfies algebraic laws: commutativity, identity, and inverse', () => {
			const a = [
				{ v: 4.2, d: -1.3 },
				{ v: -8.5, d: 0.75 },
				{ v: 0, d: 5 },
			]
			const b = [
				{ v: -1.1, d: 2.4 },
				{ v: 3.5, d: -0.25 },
				{ v: 9.0, d: -5 },
			]
			const zero = a.map(() => ({ v: 0, d: 0 }))
			const negA = a.map(({ v, d }) => ({ v: -v, d: -d }))

			assert.deepStrictEqual(vectorAddDualRecursive(a, b), vectorAddDualRecursive(b, a))
			assert.deepStrictEqual(vectorAddDualRecursive(a, zero), a)
			assert.deepStrictEqual(vectorAddDualRecursive(a, negA), zero)
		})

		it('handles very small and very large finite numbers', () => {
			const res = vectorAddDualRecursive(
				[
					{ v: 1e-300, d: 1e300 },
					{ v: -1e-15, d: 1e15 },
				],
				[
					{ v: 2e-300, d: 2e300 },
					{ v: 1e-15, d: -1e15 },
				]
			)
			assertClose(res[0].v, 3e-300, 1e-312)
			assertClose(res[0].d, 3e300, 1e288)
			assert.equal(res[1].v, 0)
			assert.equal(res[1].d, 0)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not an Array', () => {
			const valid = [{ v: 1, d: 0 }]
			for (const bad of [null, undefined, 42, 'abc', { v: 1, d: 0 }, new Float64Array(1)]) {
				assert.throws(() => vectorAddDualRecursive(bad, valid), TypeError)
				assert.throws(() => vectorAddDualRecursive(valid, bad), TypeError)
			}
		})

		it('throws RangeError when vector lengths do not match', () => {
			assert.throws(
				() => vectorAddDualRecursive([{ v: 1, d: 1 }], []),
				RangeError
			)
			assert.throws(
				() =>
					vectorAddDualRecursive(
						[{ v: 1, d: 1 }],
						[
							{ v: 1, d: 1 },
							{ v: 2, d: 2 },
						]
					),
				RangeError
			)
		})

		it('throws TypeError when any element is not a { v, d } object with numeric properties', () => {
			const valid = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
			]
			const invalidElements = [
				null,
				undefined,
				5,
				'dual',
				[1, 2],
				{ v: 1 },
				{ d: 2 },
				{ v: '1', d: 2 },
				{ v: 1, d: '2' },
				{},
			]
			for (const badElem of invalidElements) {
				assert.throws(
					() => vectorAddDualRecursive([{ v: 1, d: 2 }, badElem], valid),
					TypeError
				)
				assert.throws(
					() => vectorAddDualRecursive(valid, [badElem, { v: 3, d: 4 }]),
					TypeError
				)
			}
		})

		it('throws TypeError on sparse arrays with holes', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [{ v: 1, d: 0 }, , { v: 2, d: 0 }]
			const dense = [
				{ v: 1, d: 0 },
				{ v: 2, d: 0 },
				{ v: 3, d: 0 },
			]
			assert.throws(() => vectorAddDualRecursive(sparse, dense), TypeError)
			assert.throws(() => vectorAddDualRecursive(dense, sparse), TypeError)
		})

		it('throws RangeError when any v or d is NaN, Infinity, or -Infinity', () => {
			const valid = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
			]
			for (const nonFinite of [NaN, Infinity, -Infinity]) {
				assert.throws(
					() => vectorAddDualRecursive([{ v: nonFinite, d: 0 }, { v: 1, d: 1 }], valid),
					RangeError
				)
				assert.throws(
					() => vectorAddDualRecursive([{ v: 0, d: nonFinite }, { v: 1, d: 1 }], valid),
					RangeError
				)
				assert.throws(
					() => vectorAddDualRecursive(valid, [{ v: 1, d: 1 }, { v: nonFinite, d: 0 }]),
					RangeError
				)
				assert.throws(
					() => vectorAddDualRecursive(valid, [{ v: 1, d: 1 }, { v: 0, d: nonFinite }]),
					RangeError
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives for smooth parametric vectors f(t) + g(t)', () => {
			/**
			 * Smooth vector functions f(t) and g(t) with known analytic derivatives.
			 */
			const fVal = (t) => [Math.sin(t), t ** 3 - 2 * t, Math.exp(0.5 * t), Math.cos(2 * t)]
			const fDer = (t) => [
				Math.cos(t),
				3 * t ** 2 - 2,
				0.5 * Math.exp(0.5 * t),
				-2 * Math.sin(2 * t),
			]
			const gVal = (t) => [Math.cos(t), 2 * t ** 2 + 1, Math.log(t + 5), 1 / (t + 4)]
			const gDer = (t) => [-Math.sin(t), 4 * t, 1 / (t + 5), -1 / (t + 4) ** 2]

			const h = 1e-6
			for (const t of [-1.25, 0, 0.7, 2.3]) {
				const fv = fVal(t)
				const fd = fDer(t)
				const gv = gVal(t)
				const gd = gDer(t)

				const dualA = fv.map((v, i) => ({ v, d: fd[i] }))
				const dualB = gv.map((v, i) => ({ v, d: gd[i] }))
				const dualSum = vectorAddDualRecursive(dualA, dualB)

				const sumPlus = fVal(t + h).map((v, i) => v + gVal(t + h)[i])
				const sumMinus = fVal(t - h).map((v, i) => v + gVal(t - h)[i])

				for (let i = 0; i < dualSum.length; i++) {
					assertClose(dualSum[i].v, fv[i] + gv[i], 1e-12)
					const fdApprox = (sumPlus[i] - sumMinus[i]) / (2 * h)
					assertClose(dualSum[i].d, fdApprox, 1e-7)
				}
			}
		})

		it('matches an independent iterative reference across deterministic pseudo-random vectors', () => {
			let seed = 0x12345678
			const nextFloat = () => {
				seed = (1664525 * seed + 1013904223) >>> 0
				return (seed / 0xffffffff) * 20 - 10
			}

			for (const len of [0, 1, 2, 3, 6, 11, 25, 64, 127]) {
				const a = Array.from({ length: len }, () => ({ v: nextFloat(), d: nextFloat() }))
				const b = Array.from({ length: len }, () => ({ v: nextFloat(), d: nextFloat() }))

				const expected = []
				for (let i = 0; i < len; i++) {
					expected.push({ v: a[i].v + b[i].v, d: a[i].d + b[i].d })
				}

				const actual = vectorAddDualRecursive(a, b)
				assert.deepStrictEqual(actual, expected)
			}
		})
	})
})
