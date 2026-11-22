import { describe, test } from 'node:test'
import assert from 'node:assert'
import { vectorAddDualSeries } from './vectorAddDualSeries.js'

/**
 * Helper to assert two dual vectors are approximately equal within `tol`.
 *
 * @param {Array<{v: number, d: number}>} actual
 * @param {Array<{v: number, d: number}>} expected
 * @param {number} [tol=1e-12]
 */
function assertDualVectorClose(actual, expected, tol = 1e-12) {
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= tol,
			`Component [${i}].v mismatch: actual=${actual[i].v}, expected=${expected[i].v}`
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= tol,
			`Component [${i}].d mismatch: actual=${actual[i].d}, expected=${expected[i].d}`
		)
	}
}

describe('vectorAddDualSeries', () => {
	describe('normal cases', () => {
		test('1D dual vector addition', () => {
			const a = [{ v: 2.5, d: -1.25 }]
			const b = [{ v: 3.5, d: 4.75 }]
			assert.deepStrictEqual(vectorAddDualSeries(a, b), [{ v: 6, d: 3.5 }])
		})

		test('3D dual vector addition', () => {
			const a = [
				{ v: 1, d: 10 },
				{ v: -2, d: 20 },
				{ v: 3.5, d: -0.5 },
			]
			const b = [
				{ v: 4, d: -3 },
				{ v: 5, d: 0.25 },
				{ v: -1.5, d: 2.5 },
			]
			assert.deepStrictEqual(vectorAddDualSeries(a, b), [
				{ v: 5, d: 7 },
				{ v: 3, d: 20.25 },
				{ v: 2, d: 2 },
			])
		})

		test('nD dual vector addition (8D) without mutating inputs', () => {
			const a = Array.from({ length: 8 }, (_, i) => ({
				v: i * 1.5 - 3,
				d: (i + 1) * 0.5,
			}))
			const b = Array.from({ length: 8 }, (_, i) => ({
				v: -i * 0.5 + 2,
				d: (i - 4) * 1.25,
			}))
			const aCopy = structuredClone(a)
			const bCopy = structuredClone(b)

			const result = vectorAddDualSeries(a, b)
			const expected = a.map((ai, i) => ({
				v: ai.v + b[i].v,
				d: ai.d + b[i].d,
			}))

			assert.deepStrictEqual(result, expected)
			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
			assert.notStrictEqual(result, a)
			assert.notStrictEqual(result, b)
		})
	})

	describe('edge cases', () => {
		test('empty vectors return a new empty array', () => {
			const a = []
			const b = []
			const res = vectorAddDualSeries(a, b)
			assert.deepStrictEqual(res, [])
			assert.notStrictEqual(res, a)
			assert.notStrictEqual(res, b)
		})

		test('zero vectors act as additive identity', () => {
			const a = [
				{ v: -7.25, d: 3.125 },
				{ v: 0, d: -4.5 },
				{ v: 12, d: 0 },
			]
			const zero = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]
			assert.deepStrictEqual(vectorAddDualSeries(a, zero), a)
			assert.deepStrictEqual(vectorAddDualSeries(zero, a), a)
		})

		test('additive inverses cancel to zero vector', () => {
			const a = [
				{ v: 3.75, d: -9.5 },
				{ v: -0.125, d: 42 },
				{ v: 100, d: 0.5 },
			]
			const negA = a.map(({ v, d }) => ({ v: -v, d: -d }))
			assert.deepStrictEqual(vectorAddDualSeries(a, negA), [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			])
		})
	})

	describe('input validation', () => {
		test('rejects mismatched vector lengths with RangeError', () => {
			assert.throws(
				() => vectorAddDualSeries([{ v: 1, d: 0 }], []),
				RangeError
			)
			assert.throws(
				() =>
					vectorAddDualSeries(
						[{ v: 1, d: 1 }],
						[
							{ v: 1, d: 1 },
							{ v: 2, d: 2 },
						]
					),
				RangeError
			)
		})

		test('rejects non-array arguments with TypeError', () => {
			const valid = [{ v: 1, d: 2 }]
			for (const bad of [null, undefined, 42, 'vec', { v: 1, d: 2 }, new Float64Array(1)]) {
				assert.throws(() => vectorAddDualSeries(bad, valid), TypeError)
				assert.throws(() => vectorAddDualSeries(valid, bad), TypeError)
			}
		})

		test('rejects invalid dual elements with TypeError', () => {
			const valid = [{ v: 1, d: 2 }]
			const badElements = [
				null,
				undefined,
				5,
				'dual',
				[1, 2],
				{},
				{ v: 1 },
				{ d: 2 },
				{ v: '1', d: 2 },
				{ v: 1, d: '2' },
				{ v: true, d: 0 },
			]
			for (const bad of badElements) {
				assert.throws(() => vectorAddDualSeries([bad], valid), TypeError)
				assert.throws(() => vectorAddDualSeries(valid, [bad]), TypeError)
			}
		})

		test('rejects non-finite dual components with RangeError', () => {
			const valid = [{ v: 1, d: 2 }]
			const nonFiniteElements = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: Number.NEGATIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.POSITIVE_INFINITY },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFiniteElements) {
				assert.throws(() => vectorAddDualSeries([bad], valid), RangeError)
				assert.throws(() => vectorAddDualSeries(valid, [bad]), RangeError)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('matches central finite-difference derivative of a(t) + b(t)', () => {
			const aFn = (t) => [
				Math.sin(2 * t),
				Math.exp(0.5 * t),
				t * t * t - 3 * t + 1,
				Math.log(t + 2),
			]
			const aPrimeFn = (t) => [
				2 * Math.cos(2 * t),
				0.5 * Math.exp(0.5 * t),
				3 * t * t - 3,
				1 / (t + 2),
			]

			const bFn = (t) => [
				Math.cos(3 * t),
				1 / (t * t + 1),
				Math.sqrt(t + 4),
				-2 * t + 5,
			]
			const bPrimeFn = (t) => [
				-3 * Math.sin(3 * t),
				(-2 * t) / ((t * t + 1) ** 2),
				0.5 / Math.sqrt(t + 4),
				-2,
			]

			const t0 = 1.15
			const h = 1e-6

			const aDual = aFn(t0).map((v, i) => ({ v, d: aPrimeFn(t0)[i] }))
			const bDual = bFn(t0).map((v, i) => ({ v, d: bPrimeFn(t0)[i] }))

			const sumDual = vectorAddDualSeries(aDual, bDual)

			const sumAt = (t) => {
				const av = aFn(t)
				const bv = bFn(t)
				return av.map((val, i) => val + bv[i])
			}

			const f0 = sumAt(t0)
			const fPlus = sumAt(t0 + h)
			const fMinus = sumAt(t0 - h)

			const fdApprox = f0.map((v, i) => ({
				v,
				d: (fPlus[i] - fMinus[i]) / (2 * h),
			}))

			assertDualVectorClose(sumDual, fdApprox, 1e-8)
		})

		test('satisfies commutativity and associativity', () => {
			const a = [
				{ v: 1.2, d: -0.4 },
				{ v: -3.7, d: 2.1 },
				{ v: 0.8, d: 5.5 },
				{ v: 4.3, d: -1.9 },
			]
			const b = [
				{ v: -2.6, d: 3.3 },
				{ v: 1.4, d: -0.7 },
				{ v: 6.2, d: -4.1 },
				{ v: -0.9, d: 2.8 },
			]
			const c = [
				{ v: 0.5, d: 1.1 },
				{ v: 2.3, d: -1.5 },
				{ v: -3.4, d: 0.6 },
				{ v: 1.7, d: -0.2 },
			]

			// Commutativity: a + b === b + a
			assert.deepStrictEqual(
				vectorAddDualSeries(a, b),
				vectorAddDualSeries(b, a)
			)

			// Associativity: (a + b) + c ≈ a + (b + c)
			const left = vectorAddDualSeries(vectorAddDualSeries(a, b), c)
			const right = vectorAddDualSeries(a, vectorAddDualSeries(b, c))
			assertDualVectorClose(left, right, 1e-12)
		})
	})
})
