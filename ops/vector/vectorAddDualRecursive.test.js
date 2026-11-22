import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddDualRecursive } from './vectorAddDualRecursive.js'

/**
 * Independent iterative reference implementation of elementwise dual vector addition.
 *
 * @param {Array<{v: number, d: number}>} a
 * @param {Array<{v: number, d: number}>} b
 * @returns {Array<{v: number, d: number}>}
 */
function iterativeDualVectorAdd(a, b) {
	const out = new Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = { v: a[i].v + b[i].v, d: a[i].d + b[i].d }
	}
	return out
}

describe('vectorAddDualRecursive', () => {
	test('adds normal dual-number vectors (even length)', () => {
		const a = [
			{ v: 1, d: 2 },
			{ v: 3.5, d: -0.5 },
			{ v: 0, d: 4 },
			{ v: 10, d: 1 }
		]
		const b = [
			{ v: 5, d: 3 },
			{ v: 1.5, d: 2.5 },
			{ v: -2, d: 0 },
			{ v: 20, d: -1 }
		]

		const result = vectorAddDualRecursive(a, b)
		assert.deepStrictEqual(result, [
			{ v: 6, d: 5 },
			{ v: 5, d: 2 },
			{ v: -2, d: 4 },
			{ v: 30, d: 0 }
		])
	})

	test('handles empty vectors', () => {
		assert.deepStrictEqual(vectorAddDualRecursive([], []), [])
	})

	test('handles single-element vectors', () => {
		assert.deepStrictEqual(
			vectorAddDualRecursive([{ v: 7, d: -3 }], [{ v: -2, d: 8 }]),
			[{ v: 5, d: 5 }]
		)
	})

	test('handles odd-length vectors across multiple recursion depths', () => {
		const a3 = [
			{ v: 1, d: 10 },
			{ v: 2, d: 20 },
			{ v: 3, d: 30 }
		]
		const b3 = [
			{ v: 4, d: 1 },
			{ v: 5, d: 2 },
			{ v: 6, d: 3 }
		]
		assert.deepStrictEqual(vectorAddDualRecursive(a3, b3), [
			{ v: 5, d: 11 },
			{ v: 7, d: 22 },
			{ v: 9, d: 33 }
		])

		const a7 = Array.from({ length: 7 }, (_, i) => ({ v: i, d: i * 2 }))
		const b7 = Array.from({ length: 7 }, (_, i) => ({ v: 10 - i, d: -i }))
		assert.deepStrictEqual(
			vectorAddDualRecursive(a7, b7),
			Array.from({ length: 7 }, (_, i) => ({ v: 10, d: i }))
		)
	})

	test('handles negative values, negative derivatives, and additive cancellation', () => {
		const a = [
			{ v: -4.25, d: -1.5 },
			{ v: 9, d: -7 },
			{ v: -100, d: -0.25 }
		]
		const b = [
			{ v: -3.75, d: -2.5 },
			{ v: -9, d: 7 },
			{ v: 50, d: 0.25 }
		]

		assert.deepStrictEqual(vectorAddDualRecursive(a, b), [
			{ v: -8, d: -4 },
			{ v: 0, d: 0 },
			{ v: -50, d: 0 }
		])
	})

	test('does not mutate input arrays or dual number elements', () => {
		const a = [
			{ v: 1, d: 2 },
			{ v: 3, d: 4 }
		]
		const b = [
			{ v: 5, d: 6 },
			{ v: 7, d: 8 }
		]
		const aSnapshot = structuredClone(a)
		const bSnapshot = structuredClone(b)

		const result = vectorAddDualRecursive(a, b)
		result[0].v = 999

		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(b, bSnapshot)
	})

	test('throws RangeError for mismatched vector lengths', () => {
		assert.throws(
			() => vectorAddDualRecursive([{ v: 1, d: 0 }], []),
			RangeError
		)
		assert.throws(
			() =>
				vectorAddDualRecursive(
					[{ v: 1, d: 1 }],
					[
						{ v: 2, d: 2 },
						{ v: 3, d: 3 }
					]
				),
			RangeError
		)
	})

	test('throws TypeError for non-array inputs', () => {
		assert.throws(() => vectorAddDualRecursive(null, []), TypeError)
		assert.throws(() => vectorAddDualRecursive([], undefined), TypeError)
		assert.throws(() => vectorAddDualRecursive({ v: 1, d: 1 }, []), TypeError)
		assert.throws(() => vectorAddDualRecursive([], 'not-an-array'), TypeError)
	})

	test('throws TypeError for malformed dual number elements or non-finite components', () => {
		const valid = { v: 1, d: 2 }

		assert.throws(() => vectorAddDualRecursive([null], [valid]), TypeError)
		assert.throws(() => vectorAddDualRecursive([valid], [undefined]), TypeError)
		assert.throws(() => vectorAddDualRecursive([42], [valid]), TypeError)
		assert.throws(() => vectorAddDualRecursive([[1, 2]], [valid]), TypeError)
		assert.throws(() => vectorAddDualRecursive([{ v: 1 }], [valid]), TypeError)
		assert.throws(() => vectorAddDualRecursive([valid], [{ d: 2 }]), TypeError)
		assert.throws(
			() => vectorAddDualRecursive([{ v: '1', d: 2 }], [valid]),
			TypeError
		)
		assert.throws(
			() => vectorAddDualRecursive([valid], [{ v: 1, d: '2' }]),
			TypeError
		)
		assert.throws(
			() => vectorAddDualRecursive([{ v: Number.NaN, d: 0 }], [valid]),
			TypeError
		)
		assert.throws(
			() => vectorAddDualRecursive([valid], [{ v: 0, d: Number.NaN }]),
			TypeError
		)
		assert.throws(
			() => vectorAddDualRecursive([{ v: Infinity, d: 1 }], [valid]),
			TypeError
		)
		assert.throws(
			() => vectorAddDualRecursive([valid], [{ v: 1, d: -Infinity }]),
			TypeError
		)

		// Sparse array hole in second half of recursion
		const sparse = new Array(4)
		sparse[0] = valid
		sparse[1] = valid
		sparse[3] = valid
		const full = [valid, valid, valid, valid]
		assert.throws(() => vectorAddDualRecursive(sparse, full), TypeError)
	})

	test('cross-check: matches iterative dual vector addition across odd and even sizes', () => {
		const sizes = [0, 1, 2, 3, 4, 5, 8, 13, 31, 64, 127]
		for (const n of sizes) {
			const a = Array.from({ length: n }, (_, i) => ({
				v: Math.sin(i + 0.5),
				d: Math.cos(i + 0.5)
			}))
			const b = Array.from({ length: n }, (_, i) => ({
				v: (i - n / 2) * 0.75,
				d: ((i % 5) - 2) * 1.25
			}))

			assert.deepStrictEqual(
				vectorAddDualRecursive(a, b),
				iterativeDualVectorAdd(a, b)
			)
		}
	})

	test('cross-check: forward-mode derivatives match central finite differences', () => {
		// Vector-valued functions f(t) and g(t) with known analytical derivatives
		const fFuncs = [
			{ val: (t) => t * t * t, der: (t) => 3 * t * t },
			{ val: (t) => Math.sin(2 * t), der: (t) => 2 * Math.cos(2 * t) },
			{ val: (t) => Math.exp(0.5 * t), der: (t) => 0.5 * Math.exp(0.5 * t) },
			{ val: (t) => 1 / (t + 3), der: (t) => -1 / ((t + 3) * (t + 3)) },
			{ val: (t) => Math.log(t + 2), der: (t) => 1 / (t + 2) }
		]
		const gFuncs = [
			{ val: (t) => -2 * t + 5, der: () => -2 },
			{ val: (t) => Math.cos(t), der: (t) => -Math.sin(t) },
			{ val: (t) => t * t, der: (t) => 2 * t },
			{ val: (t) => Math.sqrt(t + 4), der: (t) => 0.5 / Math.sqrt(t + 4) },
			{ val: (t) => -Math.sin(t), der: (t) => -Math.cos(t) }
		]

		const t = 1.25
		const h = 1e-6

		const fDual = fFuncs.map(({ val, der }) => ({ v: val(t), d: der(t) }))
		const gDual = gFuncs.map(({ val, der }) => ({ v: val(t), d: der(t) }))
		const sumDual = vectorAddDualRecursive(fDual, gDual)

		for (let i = 0; i < fFuncs.length; i++) {
			const expectedVal = fFuncs[i].val(t) + gFuncs[i].val(t)
			const sumPlus = fFuncs[i].val(t + h) + gFuncs[i].val(t + h)
			const sumMinus = fFuncs[i].val(t - h) + gFuncs[i].val(t - h)
			const finiteDiffDer = (sumPlus - sumMinus) / (2 * h)

			assert.ok(
				Math.abs(sumDual[i].v - expectedVal) < 1e-12,
				`Component ${i} primal mismatch: ${sumDual[i].v} vs ${expectedVal}`
			)
			assert.ok(
				Math.abs(sumDual[i].d - finiteDiffDer) < 1e-7,
				`Component ${i} derivative mismatch: ${sumDual[i].d} vs ${finiteDiffDer}`
			)
		}
	})
})
