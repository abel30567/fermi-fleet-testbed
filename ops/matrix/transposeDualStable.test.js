import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeDualStable } from './transposeDualStable.js'

const dual = (v, d) => ({ v, d })

/**
 * Independent helper: Neumaier compensated sum for numerically accurate cross-checks.
 */
function neumaierSum(values) {
	let sum = 0
	let comp = 0
	for (const x of values) {
		const t = sum + x
		if (Math.abs(sum) >= Math.abs(x)) {
			comp += (sum - t) + x
		} else {
			comp += (x - t) + sum
		}
		sum = t
	}
	return sum + comp
}

/**
 * Independent helper: dual matrix multiplication using compensated summation.
 */
function matMulDual(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => new Array(n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			const vTerms = []
			const dTerms = []
			for (let p = 0; p < k; p++) {
				const a = A[i][p]
				const b = B[p][j]
				vTerms.push(a.v * b.v)
				dTerms.push(a.v * b.d, a.d * b.v)
			}
			out[i][j] = { v: neumaierSum(vTerms), d: neumaierSum(dTerms) }
		}
	}
	return out
}

/**
 * Independent helper: scaled Frobenius norm (overflow/underflow safe) for a component ('v' or 'd').
 */
function scaledFrobeniusNorm(M, key) {
	let maxAbs = 0
	for (const row of M) {
		for (const cell of row) {
			const a = Math.abs(cell[key])
			if (a > maxAbs) maxAbs = a
		}
	}
	if (maxAbs === 0) return 0
	const sqTerms = []
	for (const row of M) {
		for (const cell of row) {
			const s = cell[key] / maxAbs
			sqTerms.push(s * s)
		}
	}
	return maxAbs * Math.sqrt(neumaierSum(sqTerms))
}

describe('transposeDualStable', () => {
	describe('normal cases', () => {
		test('transposes a rectangular 2x3 dual matrix', () => {
			const A = [
				[dual(1, 0.1), dual(2, 0.2), dual(3, 0.3)],
				[dual(4, -0.4), dual(5, 0.5), dual(6, -0.6)],
			]
			const AT = transposeDualStable(A)
			assert.deepEqual(AT, [
				[dual(1, 0.1), dual(4, -0.4)],
				[dual(2, 0.2), dual(5, 0.5)],
				[dual(3, 0.3), dual(6, -0.6)],
			])
		})

		test('transposes a square 3x3 dual matrix', () => {
			const A = [
				[dual(1, 10), dual(2, 20), dual(3, 30)],
				[dual(4, 40), dual(5, 50), dual(6, 60)],
				[dual(7, 70), dual(8, 80), dual(9, 90)],
			]
			const AT = transposeDualStable(A)
			assert.deepEqual(AT, [
				[dual(1, 10), dual(4, 40), dual(7, 70)],
				[dual(2, 20), dual(5, 50), dual(8, 80)],
				[dual(3, 30), dual(6, 60), dual(9, 90)],
			])
		})

		test('does not mutate input and returns alias-free dual objects', () => {
			const A = [
				[dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(7, 8)],
			]
			const snapshot = structuredClone(A)
			const AT = transposeDualStable(A)

			AT[0][1].v = 999
			AT[0][1].d = -999
			assert.deepEqual(A, snapshot)
		})

		test('accepts class instances with v and d numeric properties', () => {
			class Dual {
				constructor(v, d) {
					this.v = v
					this.d = d
				}
			}
			const A = [[new Dual(2, 5), new Dual(-3, 7)]]
			const AT = transposeDualStable(A)
			assert.deepEqual(AT, [[dual(2, 5)], [dual(-3, 7)]])
		})
	})

	describe('edge cases and numerical robustness', () => {
		test('handles empty matrices (0x0 and m x 0)', () => {
			assert.deepEqual(transposeDualStable([]), [])
			assert.deepEqual(transposeDualStable([[]]), [])
			assert.deepEqual(transposeDualStable([[], []]), [])
		})

		test('handles 1x1, row vector (1xN), and column vector (Nx1)', () => {
			assert.deepEqual(transposeDualStable([[dual(42, -1)]]), [[dual(42, -1)]])

			const rowVec = [[dual(1, 1), dual(2, 2), dual(3, 3), dual(4, 4)]]
			const colVec = transposeDualStable(rowVec)
			assert.deepEqual(colVec, [
				[dual(1, 1)],
				[dual(2, 2)],
				[dual(3, 3)],
				[dual(4, 4)],
			])
			assert.deepEqual(transposeDualStable(colVec), rowVec)
		})

		test('preserves extreme IEEE-754 magnitudes, subnormals, and signed zeros losslessly', () => {
			const A = [
				[dual(Number.MAX_VALUE, -Number.MAX_VALUE), dual(Number.MIN_VALUE, -Number.MIN_VALUE)],
				[dual(-0, 0), dual(Number.EPSILON, -1e-308)],
			]
			const AT = transposeDualStable(A)

			assert.ok(Object.is(AT[0][0].v, Number.MAX_VALUE))
			assert.ok(Object.is(AT[0][0].d, -Number.MAX_VALUE))
			assert.ok(Object.is(AT[1][0].v, Number.MIN_VALUE))
			assert.ok(Object.is(AT[1][0].d, -Number.MIN_VALUE))
			assert.ok(Object.is(AT[0][1].v, -0))
			assert.ok(Object.is(AT[0][1].d, 0))
			assert.ok(Object.is(AT[1][1].v, Number.EPSILON))
			assert.ok(Object.is(AT[1][1].d, -1e-308))
		})

		test('correctly transposes large matrices spanning multiple cache tiles (70x45)', () => {
			const rows = 70
			const cols = 45
			const A = Array.from({ length: rows }, (_, i) =>
				Array.from({ length: cols }, (_, j) => dual(i * 100 + j, (i - j) * 1e-6))
			)
			const AT = transposeDualStable(A)

			assert.equal(AT.length, cols)
			assert.equal(AT[0].length, rows)
			for (let i = 0; i < rows; i++) {
				for (let j = 0; j < cols; j++) {
					assert.ok(Object.is(AT[j][i].v, A[i][j].v))
					assert.ok(Object.is(AT[j][i].d, A[i][j].d))
				}
			}
		})
	})

	describe('input validation', () => {
		test('rejects non-array matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', { v: 1, d: 0 }]) {
				assert.throws(() => transposeDualStable(bad), TypeError)
			}
		})

		test('rejects non-array rows', () => {
			assert.throws(() => transposeDualStable([null]), TypeError)
			assert.throws(() => transposeDualStable([[dual(1, 0)], 'bad']), TypeError)
		})

		test('rejects ragged matrices', () => {
			assert.throws(
				() => transposeDualStable([[dual(1, 0), dual(2, 0)], [dual(3, 0)]]),
				RangeError
			)
			assert.throws(() => transposeDualStable([[], [dual(1, 0)]]), RangeError)
		})

		test('rejects malformed or sparse dual entries', () => {
			assert.throws(() => transposeDualStable([[null]]), TypeError)
			assert.throws(() => transposeDualStable([[undefined]]), TypeError)
			assert.throws(() => transposeDualStable([[[1, 2]]]), TypeError)
			assert.throws(() => transposeDualStable([[{ v: 1 }]]), TypeError)
			assert.throws(() => transposeDualStable([[{ d: 1 }]]), TypeError)
			assert.throws(() => transposeDualStable([[{ v: '1', d: 0 }]]), TypeError)
			assert.throws(() => transposeDualStable([[{ v: 1, d: '0' }]]), TypeError)

			const sparseRow = new Array(2)
			sparseRow[0] = dual(1, 0)
			assert.throws(() => transposeDualStable([sparseRow]), TypeError)
		})

		test('rejects non-finite values (NaN, Infinity, -Infinity)', () => {
			assert.throws(() => transposeDualStable([[dual(NaN, 0)]]), RangeError)
			assert.throws(() => transposeDualStable([[dual(0, NaN)]]), RangeError)
			assert.throws(() => transposeDualStable([[dual(Infinity, 0)]]), RangeError)
			assert.throws(() => transposeDualStable([[dual(0, -Infinity)]]), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('involution: (A^T)^T === A bit-for-bit', () => {
			const A = [
				[dual(1e200, -1e-200), dual(-0, 3.141592653589793), dual(Number.MIN_VALUE, 1)],
				[dual(-2.718281828459045, 0), dual(1e-150, 1e150), dual(42, -0)],
			]
			const ATT = transposeDualStable(transposeDualStable(A))
			assert.equal(ATT.length, A.length)
			for (let i = 0; i < A.length; i++) {
				assert.equal(ATT[i].length, A[i].length)
				for (let j = 0; j < A[i].length; j++) {
					assert.ok(Object.is(ATT[i][j].v, A[i][j].v))
					assert.ok(Object.is(ATT[i][j].d, A[i][j].d))
				}
			}
		})

		test('forward-mode derivative matches central finite differences for nonlinear A(t)^T', () => {
			// A(t) is a smooth 2x3 matrix-valued function of t
			const evalPrimal = (t) => [
				[Math.sin(t), Math.exp(0.5 * t), t * t + 1],
				[Math.cos(2 * t), Math.log(t + 2), Math.atan(t)],
			]
			const evalDual = (t) => [
				[
					dual(Math.sin(t), Math.cos(t)),
					dual(Math.exp(0.5 * t), 0.5 * Math.exp(0.5 * t)),
					dual(t * t + 1, 2 * t),
				],
				[
					dual(Math.cos(2 * t), -2 * Math.sin(2 * t)),
					dual(Math.log(t + 2), 1 / (t + 2)),
					dual(Math.atan(t), 1 / (1 + t * t)),
				],
			]

			const t = 0.73
			const h = 1e-6
			const AT = transposeDualStable(evalDual(t))
			const plus = evalPrimal(t + h)
			const minus = evalPrimal(t - h)

			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 3; j++) {
					const fd = (plus[i][j] - minus[i][j]) / (2 * h)
					assert.ok(
						Math.abs(AT[j][i].d - fd) < 1e-9,
						`Mismatch at (${j},${i}): dual d=${AT[j][i].d}, finite-diff=${fd}`
					)
				}
			}
		})

		test('reverse-order product identity: (A * B)^T === B^T * A^T over dual numbers', () => {
			const A = [
				[dual(1.5, 0.25), dual(-2.0, 1.0), dual(0.5, -0.75)],
				[dual(3.0, -1.5), dual(4.25, 0.5), dual(-1.25, 2.0)],
			]
			const B = [
				[dual(2.0, -0.5), dual(-1.0, 0.25)],
				[dual(0.75, 1.25), dual(3.5, -1.0)],
				[dual(-4.0, 0.5), dual(1.25, 0.75)],
			]

			const lhs = transposeDualStable(matMulDual(A, B))
			const rhs = matMulDual(transposeDualStable(B), transposeDualStable(A))

			assert.equal(lhs.length, rhs.length)
			for (let i = 0; i < lhs.length; i++) {
				assert.equal(lhs[i].length, rhs[i].length)
				for (let j = 0; j < lhs[i].length; j++) {
					assert.ok(Math.abs(lhs[i][j].v - rhs[i][j].v) < 1e-12)
					assert.ok(Math.abs(lhs[i][j].d - rhs[i][j].d) < 1e-12)
				}
			}
		})

		test('scaled Frobenius norm invariance across extreme scales', () => {
			const A = [
				[dual(1e200, 1e-200), dual(-3e200, 4e-200)],
				[dual(4e200, -3e-200), dual(2e200, 2e-200)],
			]
			const AT = transposeDualStable(A)

			const vNormA = scaledFrobeniusNorm(A, 'v')
			const vNormAT = scaledFrobeniusNorm(AT, 'v')
			const dNormA = scaledFrobeniusNorm(A, 'd')
			const dNormAT = scaledFrobeniusNorm(AT, 'd')

			assert.ok(Number.isFinite(vNormA) && vNormA > 0)
			assert.ok(Number.isFinite(dNormA) && dNormA > 0)
			assert.ok(Math.abs(vNormA - vNormAT) / vNormA < 1e-15)
			assert.ok(Math.abs(dNormA - dNormAT) / dNormA < 1e-15)
		})
	})
})
