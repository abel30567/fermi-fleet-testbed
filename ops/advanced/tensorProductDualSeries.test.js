import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductDualSeries } from './tensorProductDualSeries.js'

const dual = (v, d) => ({ v, d })

function shapeOf(t) {
	if (!Array.isArray(t)) return []
	if (t.length === 0) return [0]
	return [t.length, ...shapeOf(t[0])]
}

function realTensorProduct(a, b) {
	if (Array.isArray(a)) {
		return a.map((el) => realTensorProduct(el, b))
	}
	if (Array.isArray(b)) {
		return b.map((el) => realTensorProduct(a, el))
	}
	return a * b
}

function addRealTensors(a, b) {
	if (Array.isArray(a)) {
		return a.map((el, i) => addRealTensors(el, b[i]))
	}
	return a + b
}

function addDualTensors(a, b) {
	if (Array.isArray(a)) {
		return a.map((el, i) => addDualTensors(el, b[i]))
	}
	return { v: a.v + b.v, d: a.d + b.d }
}

function mapLeaves(t, fn) {
	if (Array.isArray(t)) {
		return t.map((el) => mapLeaves(el, fn))
	}
	return fn(t)
}

function assertDualTensorsClose(actual, expected, tol = 1e-12) {
	if (Array.isArray(actual)) {
		assert.ok(Array.isArray(expected), 'Expected array at matching tensor depth')
		assert.equal(actual.length, expected.length)
		for (let i = 0; i < actual.length; i++) {
			assertDualTensorsClose(actual[i], expected[i], tol)
		}
		return
	}
	assert.ok(!Array.isArray(expected), 'Expected dual scalar at matching tensor depth')
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol,
		`Value mismatch: got ${actual.v}, expected ${expected.v} (tol=${tol})`,
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol,
		`Derivative mismatch: got ${actual.d}, expected ${expected.d} (tol=${tol})`,
	)
}

describe('tensorProductDualSeries', () => {
	describe('normal cases', () => {
		it('computes rank-0 scalar dual product', () => {
			const res = tensorProductDualSeries(dual(3, 2), dual(5, -4))
			assert.deepStrictEqual(res, { v: 15, d: -2 })
		})

		it('computes rank-1 vector outer tensor product', () => {
			const a = [dual(2, 1), dual(-3, 4)]
			const b = [dual(5, -1), dual(0, 2), dual(7, 3)]
			const res = tensorProductDualSeries(a, b)

			assert.deepStrictEqual(shapeOf(res), [2, 3])
			assert.deepStrictEqual(res, [
				[dual(10, 3), dual(0, 4), dual(14, 13)],
				[dual(-15, 23), dual(0, -6), dual(-21, 19)],
			])
		})

		it('computes rank-2 matrix tensor product (rank-4 result)', () => {
			const A = [
				[dual(1, 2), dual(3, 0)],
				[dual(0, -1), dual(4, 1)],
			]
			const B = [
				[dual(2, 1), dual(-1, 3)],
			]
			const res = tensorProductDualSeries(A, B)

			assert.deepStrictEqual(shapeOf(res), [2, 2, 1, 2])
			// A[0][0] * B[0][1] = (1 + 2ε)(-1 + 3ε) = -1 + (3 - 2)ε = -1 + 1ε
			assert.deepStrictEqual(res[0][0][0][1], dual(-1, 1))
			// A[1][0] * B[0][0] = (0 - 1ε)(2 + 1ε) = 0 - 2ε
			assert.deepStrictEqual(res[1][0][0][0], dual(0, -2))
			// A[1][1] * B[0][1] = (4 + 1ε)(-1 + 3ε) = -4 + (12 - 1)ε = -4 + 11ε
			assert.deepStrictEqual(res[1][1][0][1], dual(-4, 11))
		})

		it('handles mixed ranks (scalar × vector, vector × scalar, vector × matrix)', () => {
			const s = dual(2, 3)
			const v = [dual(4, 1), dual(-5, 2)]
			const M = [
				[dual(1, 0), dual(2, -1)],
				[dual(3, 1), dual(0, 4)],
			]

			const sv = tensorProductDualSeries(s, v)
			const vs = tensorProductDualSeries(v, s)
			assert.deepStrictEqual(sv, [dual(8, 14), dual(-10, -11)])
			assert.deepStrictEqual(vs, sv)

			const vM = tensorProductDualSeries(v, M)
			assert.deepStrictEqual(shapeOf(vM), [2, 2, 2])
			// v[1] * M[0][1] = (-5 + 2ε)(2 - 1ε) = -10 + (5 + 4)ε = -10 + 9ε
			assert.deepStrictEqual(vM[1][0][1], dual(-10, 9))
			// v[0] * M[1][1] = (4 + 1ε)(0 + 4ε) = 0 + 16ε
			assert.deepStrictEqual(vM[0][1][1], dual(0, 16))
		})

		it('does not mutate inputs and allocates distinct output leaf objects', () => {
			const leaf = dual(2, 3)
			const a = [leaf, leaf]
			const b = [dual(4, 5)]
			const res = tensorProductDualSeries(a, b)

			assert.deepStrictEqual(a, [dual(2, 3), dual(2, 3)])
			assert.deepStrictEqual(b, [dual(4, 5)])
			assert.notEqual(res[0][0], res[1][0])
			assert.notEqual(res[0][0], leaf)
		})
	})

	describe('edge cases', () => {
		it('normalizes negative zero in both v and d', () => {
			const res = tensorProductDualSeries(dual(-0, 0), dual(5, -3))
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))

			const res2 = tensorProductDualSeries(dual(0, -0), dual(-4, 2))
			assert.ok(Object.is(res2.v, 0))
			assert.ok(Object.is(res2.d, 0))
		})

		it('handles empty tensors consistently', () => {
			assert.deepStrictEqual(tensorProductDualSeries([], [dual(1, 2)]), [])
			assert.deepStrictEqual(tensorProductDualSeries([dual(1, 2), dual(3, 4)], []), [[], []])
			assert.deepStrictEqual(tensorProductDualSeries([], []), [])
			assert.deepStrictEqual(tensorProductDualSeries([[], []], [dual(1, 0)]), [[], []])
		})

		it('handles self tensor product a ⊗ a correctly', () => {
			const a = [dual(2, 3), dual(-1, 5)]
			const res = tensorProductDualSeries(a, a)
			assert.deepStrictEqual(res, [
				[dual(4, 12), dual(-2, 7)],
				[dual(-2, 7), dual(1, -10)],
			])
		})

		it('supports very small and very large finite magnitudes without precision loss', () => {
			const res = tensorProductDualSeries(dual(1e-100, 2e-100), dual(3e100, -4e100))
			assertDualTensorsClose(res, dual(3, 2), 1e-12)
		})

		it('accepts null-prototype dual objects', () => {
			const a = Object.assign(Object.create(null), { v: 3, d: 1 })
			const b = Object.assign(Object.create(null), { v: 2, d: 5 })
			assert.deepStrictEqual(tensorProductDualSeries(a, b), dual(6, 17))
		})
	})

	describe('invalid inputs', () => {
		it('rejects null, undefined, primitives, and functions', () => {
			const valid = dual(1, 0)
			for (const bad of [null, undefined, 42, '1', true, () => {}]) {
				assert.throws(() => tensorProductDualSeries(bad, valid), TypeError)
				assert.throws(() => tensorProductDualSeries(valid, bad), TypeError)
			}
		})

		it('rejects dual objects missing v or d or with non-numeric fields', () => {
			const valid = [dual(1, 2)]
			for (const bad of [{}, { v: 1 }, { d: 2 }, { v: '1', d: 2 }, { v: 1, d: null }]) {
				assert.throws(() => tensorProductDualSeries([bad], valid), TypeError)
				assert.throws(() => tensorProductDualSeries(valid, [bad]), TypeError)
			}
		})

		it('rejects non-finite components (NaN, Infinity, -Infinity)', () => {
			const valid = dual(1, 1)
			for (const bad of [
				dual(NaN, 0),
				dual(0, NaN),
				dual(Infinity, 1),
				dual(1, -Infinity),
			]) {
				assert.throws(() => tensorProductDualSeries(bad, valid), RangeError)
				assert.throws(() => tensorProductDualSeries(valid, bad), RangeError)
			}
		})

		it('rejects ragged and mixed-depth arrays', () => {
			const valid = [dual(1, 0)]
			const ragged = [[dual(1, 0)], [dual(1, 0), dual(2, 0)]]
			const mixedDepth = [dual(1, 0), [dual(2, 0)]]
			const mixedEmpty = [[[]], []]

			assert.throws(() => tensorProductDualSeries(ragged, valid), RangeError)
			assert.throws(() => tensorProductDualSeries(valid, ragged), RangeError)
			assert.throws(() => tensorProductDualSeries(mixedDepth, valid), RangeError)
			assert.throws(() => tensorProductDualSeries(mixedEmpty, valid), RangeError)
		})

		it('rejects sparse arrays', () => {
			const sparse = new Array(2)
			sparse[1] = dual(1, 0)
			assert.throws(() => tensorProductDualSeries(sparse, [dual(1, 0)]), TypeError)

			const sparseTail = new Array(2)
			sparseTail[0] = dual(1, 0)
			assert.throws(() => tensorProductDualSeries([dual(1, 0)], sparseTail), TypeError)
		})

		it('throws RangeError on floating-point overflow to Infinity', () => {
			assert.throws(
				() => tensorProductDualSeries(dual(1e308, 1), dual(1e308, 1)),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivative of smooth parameterized tensors', () => {
			const makeA = (t) => [
				dual(Math.sin(t), Math.cos(t)),
				dual(Math.exp(0.5 * t), 0.5 * Math.exp(0.5 * t)),
				dual(t * t + 1, 2 * t),
			]
			const makeB = (t) => [
				[dual(Math.cos(2 * t), -2 * Math.sin(2 * t)), dual(t ** 3, 3 * t * t)],
				[dual(Math.log(t + 2), 1 / (t + 2)), dual(Math.sqrt(t + 3), 0.5 / Math.sqrt(t + 3))],
			]

			const t0 = 0.7
			const h = 1e-6

			const actual = tensorProductDualSeries(makeA(t0), makeB(t0))

			const primalAt = (t) =>
				realTensorProduct(
					mapLeaves(makeA(t), (x) => x.v),
					mapLeaves(makeB(t), (x) => x.v),
				)

			const f0 = primalAt(t0)
			const fPlus = primalAt(t0 + h)
			const fMinus = primalAt(t0 - h)

			assert.deepStrictEqual(shapeOf(actual), [3, 2, 2])
			for (let i = 0; i < 3; i++) {
				for (let j = 0; j < 2; j++) {
					for (let k = 0; k < 2; k++) {
						const numDeriv = (fPlus[i][j][k] - fMinus[i][j][k]) / (2 * h)
						assert.ok(
							Math.abs(actual[i][j][k].v - f0[i][j][k]) < 1e-14,
							`Primal mismatch at [${i}][${j}][${k}]`,
						)
						assert.ok(
							Math.abs(actual[i][j][k].d - numDeriv) < 1e-8,
							`Derivative mismatch at [${i}][${j}][${k}]: dual=${actual[i][j][k].d}, fd=${numDeriv}`,
						)
					}
				}
			}
		})

		it('satisfies Leibniz decomposition, bilinearity, and associativity identities', () => {
			const A = [
				[dual(1.5, -0.5), dual(2.0, 1.25)],
				[dual(-3.0, 0.75), dual(0.5, -2.0)],
			]
			const A2 = [
				[dual(-0.5, 1.0), dual(1.0, -0.25)],
				[dual(2.0, 0.5), dual(-1.5, 1.0)],
			]
			const B = [dual(2.5, -1.0), dual(-1.5, 0.5)]
			const C = [dual(0.75, 2.0), dual(-2.0, -0.5), dual(1.25, 0.25)]

			// 1. Leibniz decomposition: (A ⊗ B)_v = A_v ⊗ B_v, (A ⊗ B)_d = A_d ⊗ B_v + A_v ⊗ B_d
			const AB = tensorProductDualSeries(A, B)
			const Av = mapLeaves(A, (x) => x.v)
			const Ad = mapLeaves(A, (x) => x.d)
			const Bv = mapLeaves(B, (x) => x.v)
			const Bd = mapLeaves(B, (x) => x.d)

			const expectedV = realTensorProduct(Av, Bv)
			const expectedD = addRealTensors(realTensorProduct(Ad, Bv), realTensorProduct(Av, Bd))

			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					for (let k = 0; k < 2; k++) {
						assert.ok(Math.abs(AB[i][j][k].v - expectedV[i][j][k]) < 1e-14)
						assert.ok(Math.abs(AB[i][j][k].d - expectedD[i][j][k]) < 1e-14)
					}
				}
			}

			// 2. Bilinearity: (A + A2) ⊗ B = (A ⊗ B) + (A2 ⊗ B)
			const lhsBilin = tensorProductDualSeries(addDualTensors(A, A2), B)
			const rhsBilin = addDualTensors(
				tensorProductDualSeries(A, B),
				tensorProductDualSeries(A2, B),
			)
			assertDualTensorsClose(lhsBilin, rhsBilin, 1e-14)

			// 3. Associativity: (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)
			const leftAssoc = tensorProductDualSeries(tensorProductDualSeries(A, B), C)
			const rightAssoc = tensorProductDualSeries(A, tensorProductDualSeries(B, C))
			assert.deepStrictEqual(shapeOf(leftAssoc), [2, 2, 2, 3])
			assert.deepStrictEqual(shapeOf(rightAssoc), [2, 2, 2, 3])
			assertDualTensorsClose(leftAssoc, rightAssoc, 1e-13)
		})
	})
})
