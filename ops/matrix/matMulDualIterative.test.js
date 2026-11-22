import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matMulDualIterative } from './matMulDualIterative.js'

/**
 * Helper to construct a dual number `{ v, d }`.
 * @param {number} v
 * @param {number} [d=0]
 */
const dual = (v, d = 0) => ({ v, d })

/**
 * Asserts that two dual matrices have identical dimensions and match within tolerance.
 */
function assertDualMatricesClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, 'Row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.equal(
			actual[i].length,
			expected[i].length,
			`Column count mismatch at row ${i}`
		)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].v - expected[i][j].v) <= tol,
				`Primal mismatch at [${i}][${j}]: got ${actual[i][j].v}, expected ${expected[i][j].v}`
			)
			assert.ok(
				Math.abs(actual[i][j].d - expected[i][j].d) <= tol,
				`Derivative mismatch at [${i}][${j}]: got ${actual[i][j].d}, expected ${expected[i][j].d}`
			)
		}
	}
}

/**
 * Plain numeric matrix multiplication helper for independent cross-checks.
 */
function matMulNumeric(a, b) {
	const m = a.length
	const k = a[0].length
	const n = b[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let p = 0; p < k; p++) {
				sum += a[i][p] * b[p][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

describe('matMulDualIterative', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 square dual matrices accurately', () => {
			const a = [
				[dual(1, 2), dual(3, -1)],
				[dual(4, 0.5), dual(-2, 3)],
			]
			const b = [
				[dual(5, -2), dual(0, 1)],
				[dual(-1, 4), dual(2, -3)],
			]

			// C[0][0] = (1+2e)(5-2e) + (3-e)(-1+4e) = (5+8e) + (-3+13e) = 2 + 21e
			// C[0][1] = (1+2e)(0+e) + (3-e)(2-3e) = (0+e) + (6-11e) = 6 - 10e
			// C[1][0] = (4+0.5e)(5-2e) + (-2+3e)(-1+4e) = (20-5.5e) + (2-11e) = 22 - 16.5e
			// C[1][1] = (4+0.5e)(0+e) + (-2+3e)(2-3e) = (0+4e) + (-4+12e) = -4 + 16e
			const expected = [
				[dual(2, 21), dual(6, -10)],
				[dual(22, -16.5), dual(-4, 16)],
			]

			const result = matMulDualIterative(a, b)
			assert.deepEqual(result, expected)
		})

		it('multiplies rectangular matrices (2x3 by 3x2)', () => {
			const a = [
				[dual(1, 1), dual(2, 0), dual(-1, 3)],
				[dual(0, -2), dual(3, 1), dual(4, -1)],
			]
			const b = [
				[dual(2, -1), dual(1, 2)],
				[dual(-3, 4), dual(0, -1)],
				[dual(5, 0), dual(2, 1)],
			]

			// Row 0, Col 0: (1+e)(2-e) + (2)(-3+4e) + (-1+3e)(5) = (2+e) + (-6+8e) + (-5+15e) = -9 + 24e
			// Row 0, Col 1: (1+e)(1+2e) + (2)(-e) + (-1+3e)(2+e) = (1+3e) + (-2e) + (-2+5e) = -1 + 6e
			// Row 1, Col 0: (-2e)(2-e) + (3+e)(-3+4e) + (4-e)(5) = (-4e) + (-9+9e) + (20-5e) = 11 + 0e
			// Row 1, Col 1: (-2e)(1+2e) + (3+e)(-e) + (4-e)(2+e) = (-2e) + (-3e) + (8+2e) = 8 - 3e
			const expected = [
				[dual(-9, 24), dual(-1, 6)],
				[dual(11, 0), dual(8, -3)],
			]

			assert.deepEqual(matMulDualIterative(a, b), expected)
		})

		it('multiplies a 1xn row vector by an nx1 column vector (dot product)', () => {
			const row = [[dual(2, 1), dual(-3, 2), dual(4, -0.5)]]
			const col = [[dual(5, -1)], [dual(1, 3)], [dual(-2, 4)]]

			// (2+e)(5-e) + (-3+2e)(1+3e) + (4-0.5e)(-2+4e)
			// = (10+3e) + (-3-7e) + (-8+17e) = -1 + 13e
			const result = matMulDualIterative(row, col)
			assert.deepEqual(result, [[dual(-1, 13)]])
		})

		it('multiplies an mx1 column vector by a 1xn row vector (outer product)', () => {
			const col = [[dual(2, 1)], [dual(-1, 3)]]
			const row = [[dual(3, -2), dual(4, 0), dual(0, 5)]]

			const expected = [
				[dual(6, -1), dual(8, 4), dual(0, 10)],
				[dual(-3, 11), dual(-4, 12), dual(0, -5)],
			]

			assert.deepEqual(matMulDualIterative(col, row), expected)
		})

		it('does not mutate input matrices', () => {
			const a = [[dual(1, 2), dual(3, 4)]]
			const b = [[dual(5, 6)], [dual(7, 8)]]
			const aCopy = structuredClone(a)
			const bCopy = structuredClone(b)

			matMulDualIterative(a, b)

			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('edge cases', () => {
		it('handles 1x1 matrices', () => {
			const a = [[dual(3, 4)]]
			const b = [[dual(-2, 5)]]
			assert.deepEqual(matMulDualIterative(a, b), [[dual(-6, 7)]])
		})

		it('preserves a dual matrix under left and right identity multiplication', () => {
			const identity = [
				[dual(1, 0), dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(1, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 0), dual(1, 0)],
			]
			const m = [
				[dual(2, -1), dual(0, 3), dual(-4, 0.5)],
				[dual(7, 2), dual(-1, -1), dual(5, 0)],
				[dual(0, 0), dual(3, 4), dual(8, -2)],
			]

			assert.deepEqual(matMulDualIterative(identity, m), m)
			assert.deepEqual(matMulDualIterative(m, identity), m)
		})

		it('produces zero derivatives when both inputs have zero derivatives', () => {
			const a = [
				[dual(2, 0), dual(-3, 0)],
				[dual(4, 0), dual(5, 0)],
			]
			const b = [
				[dual(-1, 0), dual(6, 0)],
				[dual(2, 0), dual(-4, 0)],
			]

			const result = matMulDualIterative(a, b)
			assert.deepEqual(result, [
				[dual(-8, 0), dual(24, 0)],
				[dual(6, 0), dual(4, 0)],
			])
		})

		it('satisfies nilpotency (eps^2 = 0) when primal parts are all zero', () => {
			const a = [
				[dual(0, 3), dual(0, -5)],
				[dual(0, 2), dual(0, 7)],
			]
			const b = [
				[dual(0, -4), dual(0, 6)],
				[dual(0, 1), dual(0, -8)],
			]

			const result = matMulDualIterative(a, b)
			assert.deepEqual(result, [
				[dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 0)],
			])
		})

		it('normalizes zero results to positive zero (+0)', () => {
			const a = [[dual(-1, 0)]]
			const b = [[dual(0, -0)]]
			const result = matMulDualIterative(a, b)
			assert.ok(Object.is(result[0][0].v, 0))
			assert.ok(Object.is(result[0][0].d, 0))
		})
	})

	describe('input validation', () => {
		const valid1x1 = [[dual(1, 0)]]

		it('throws TypeError when a or b is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', { v: 1, d: 0 }]) {
				assert.throws(() => matMulDualIterative(bad, valid1x1), TypeError)
				assert.throws(() => matMulDualIterative(valid1x1, bad), TypeError)
			}
		})

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => matMulDualIterative([dual(1, 0)], valid1x1), TypeError)
			assert.throws(
				() => matMulDualIterative([[dual(1, 0)], null], valid1x1),
				TypeError
			)
			assert.throws(() => matMulDualIterative(valid1x1, [123]), TypeError)
		})

		it('throws TypeError for invalid dual entries', () => {
			const badEntries = [
				null,
				undefined,
				5,
				'1',
				[1, 0],
				{ v: 1 },
				{ d: 0 },
				{ v: '1', d: 0 },
				{ v: 1, d: null },
			]
			for (const entry of badEntries) {
				assert.throws(() => matMulDualIterative([[entry]], valid1x1), TypeError)
				assert.throws(() => matMulDualIterative(valid1x1, [[entry]]), TypeError)
			}
		})

		it('throws TypeError for sparse arrays', () => {
			const sparseOuter = new Array(1)
			const sparseInner = [new Array(1)]
			assert.throws(() => matMulDualIterative(sparseOuter, valid1x1), TypeError)
			assert.throws(() => matMulDualIterative(sparseInner, valid1x1), TypeError)
		})

		it('throws RangeError for non-finite v or d values', () => {
			const nonFiniteEntries = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			]
			for (const entry of nonFiniteEntries) {
				assert.throws(
					() => matMulDualIterative([[entry]], valid1x1),
					RangeError
				)
				assert.throws(
					() => matMulDualIterative(valid1x1, [[entry]]),
					RangeError
				)
			}
		})

		it('throws RangeError for empty matrices or empty rows', () => {
			assert.throws(() => matMulDualIterative([], valid1x1), RangeError)
			assert.throws(() => matMulDualIterative(valid1x1, []), RangeError)
			assert.throws(() => matMulDualIterative([[]], valid1x1), RangeError)
			assert.throws(() => matMulDualIterative(valid1x1, [[]]), RangeError)
		})

		it('throws RangeError for ragged rows', () => {
			const ragged = [[dual(1, 0), dual(2, 0)], [dual(3, 0)]]
			const valid2x1 = [[dual(1, 0)], [dual(2, 0)]]
			assert.throws(() => matMulDualIterative(ragged, valid2x1), RangeError)
			assert.throws(() => matMulDualIterative(valid1x1, ragged), RangeError)
		})

		it('throws RangeError for incompatible inner dimensions', () => {
			const a2x3 = [
				[dual(1, 0), dual(2, 0), dual(3, 0)],
				[dual(4, 0), dual(5, 0), dual(6, 0)],
			]
			const b2x2 = [
				[dual(1, 0), dual(2, 0)],
				[dual(3, 0), dual(4, 0)],
			]
			assert.throws(() => matMulDualIterative(a2x3, b2x2), RangeError)
		})
	})

	describe('cross-checks', () => {
		it('satisfies associativity: (A * B) * C === A * (B * C)', () => {
			const a = [
				[dual(1.5, -0.5), dual(-2, 1.25), dual(0.75, 2)],
				[dual(3, 0.25), dual(0.5, -1.5), dual(-1.25, 0.5)],
			]
			const b = [
				[dual(-0.5, 2), dual(1, -1), dual(2.5, 0.5), dual(0, 1)],
				[dual(1.25, 0.5), dual(-3, 2), dual(0.5, -0.75), dual(2, -1)],
				[dual(0.75, -1.25), dual(2, 0.25), dual(-1, 1.5), dual(-0.5, 0.75)],
			]
			const c = [
				[dual(2, 1), dual(-1, 0.5)],
				[dual(0.5, -2), dual(3, 1.5)],
				[dual(-1.5, 0.25), dual(0.75, -1)],
				[dual(1, 0.75), dual(-2, 0.25)],
			]

			const left = matMulDualIterative(matMulDualIterative(a, b), c)
			const right = matMulDualIterative(a, matMulDualIterative(b, c))

			assertDualMatricesClose(left, right, 1e-12)
		})

		it('matches the matrix product rule (AB)\' = A\'B + AB\'', () => {
			const a = [
				[dual(2.1, -0.7), dual(-1.3, 2.4), dual(0.8, 1.1)],
				[dual(-0.4, 1.9), dual(3.2, -1.5), dual(1.7, -0.6)],
			]
			const b = [
				[dual(-1.2, 0.3), dual(2.5, -1.8)],
				[dual(0.9, 1.4), dual(-0.7, 2.2)],
				[dual(3.1, -0.9), dual(1.6, 0.5)],
			]

			const aV = a.map((r) => r.map((c) => c.v))
			const aD = a.map((r) => r.map((c) => c.d))
			const bV = b.map((r) => r.map((c) => c.v))
			const bD = b.map((r) => r.map((c) => c.d))

			const expectedV = matMulNumeric(aV, bV)
			const term1 = matMulNumeric(aD, bV)
			const term2 = matMulNumeric(aV, bD)
			const expected = expectedV.map((row, i) =>
				row.map((v, j) => dual(v, term1[i][j] + term2[i][j]))
			)

			const actual = matMulDualIterative(a, b)
			assertDualMatricesClose(actual, expected, 1e-12)
		})

		it('matches central finite-difference numerical derivative of A(t) * B(t)', () => {
			// Define smooth nonlinear matrix functions A(t) (2x3) and B(t) (3x2)
			const evalA = (t) => [
				[Math.sin(t), t * t + 1, Math.exp(0.5 * t)],
				[Math.cos(2 * t), Math.log(t + 2), t * t * t - t],
			]
			const evalADeriv = (t) => [
				[Math.cos(t), 2 * t, 0.5 * Math.exp(0.5 * t)],
				[-2 * Math.sin(2 * t), 1 / (t + 2), 3 * t * t - 1],
			]
			const evalB = (t) => [
				[Math.exp(-t), Math.sin(3 * t)],
				[t + 0.5, Math.cos(t)],
				[1 / (t + 3), t * t - 2 * t],
			]
			const evalBDeriv = (t) => [
				[-Math.exp(-t), 3 * Math.cos(3 * t)],
				[1, -Math.sin(t)],
				[-1 / ((t + 3) * (t + 3)), 2 * t - 2],
			]

			const t0 = 0.85
			const h = 1e-6

			const aV = evalA(t0)
			const aD = evalADeriv(t0)
			const bV = evalB(t0)
			const bD = evalBDeriv(t0)

			const aDual = aV.map((row, i) =>
				row.map((v, j) => dual(v, aD[i][j]))
			)
			const bDual = bV.map((row, i) =>
				row.map((v, j) => dual(v, bD[i][j]))
			)

			const actual = matMulDualIterative(aDual, bDual)

			const prodAtT0 = matMulNumeric(evalA(t0), evalB(t0))
			const prodPlus = matMulNumeric(evalA(t0 + h), evalB(t0 + h))
			const prodMinus = matMulNumeric(evalA(t0 - h), evalB(t0 - h))

			const expectedFromFD = prodAtT0.map((row, i) =>
				row.map((v, j) =>
					dual(v, (prodPlus[i][j] - prodMinus[i][j]) / (2 * h))
				)
			)

			assertDualMatricesClose(actual, expectedFromFD, 1e-8)
		})
	})
})
