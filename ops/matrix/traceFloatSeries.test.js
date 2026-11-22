import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceFloatSeries } from './traceFloatSeries.js'

/**
 * Helper: multiply two matrices A (m x k) and B (k x n).
 */
function matMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const C = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let p = 0; p < k; p++) {
				sum += A[i][p] * B[p][j]
			}
			C[i][j] = sum
		}
	}
	return C
}

/**
 * Helper: transpose a matrix A.
 */
function transpose(A) {
	const m = A.length
	const n = A[0].length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: m }, (_, j) => A[j][i])
	)
}

/**
 * Helper: linear combination a * A + b * B.
 */
function linearCombination(a, A, b, B) {
	return A.map((row, i) => row.map((val, j) => a * val + b * B[i][j]))
}

/**
 * Helper: build a diagonal matrix from a list of diagonal values.
 */
function diagMatrix(values) {
	const n = values.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? values[i] : 0))
	)
}

describe('traceFloatSeries', () => {
	describe('basic and structural cases', () => {
		it('computes trace of 1x1 matrices', () => {
			assert.equal(traceFloatSeries([[42]]), 42)
			assert.equal(traceFloatSeries([[-3.5]]), -3.5)
			assert.equal(traceFloatSeries([[0]]), 0)
			assert.ok(Object.is(traceFloatSeries([[-0]]), 0))
		})

		it('computes trace of 2x2, 3x3, and 4x4 matrices', () => {
			assert.equal(
				traceFloatSeries([
					[1, 2],
					[3, 4],
				]),
				5
			)
			assert.equal(
				traceFloatSeries([
					[2.5, -1, 7],
					[4, -3.25, 0],
					[9, 8, 6.75],
				]),
				6
			)
			assert.equal(
				traceFloatSeries([
					[1, 99, -50, 12],
					[8, -2, 33, 4],
					[-7, 6, 3, -11],
					[5, -4, 2, -2],
				]),
				0
			)
		})

		it('returns n for the n x n identity matrix and 0 for zero and skew-symmetric matrices', () => {
			for (const n of [1, 2, 5, 10]) {
				const I = diagMatrix(new Array(n).fill(1))
				const Z = diagMatrix(new Array(n).fill(0))
				assert.equal(traceFloatSeries(I), n)
				assert.equal(traceFloatSeries(Z), 0)
			}

			const skew = [
				[0, 5, -3],
				[-5, 0, 7],
				[3, -7, 0],
			]
			assert.equal(traceFloatSeries(skew), 0)
		})

		it('ignores off-diagonal finite entries in the trace value', () => {
			const A = [
				[1.5, 1e100, -1e100],
				[-1e200, 2.5, 1e50],
				[1e-200, -1e150, 3.5],
			]
			assert.equal(traceFloatSeries(A), 7.5)
		})
	})

	describe('compensated (Neumaier) summation and numerical edge cases', () => {
		it('recovers exact sum in the classic Neumaier cancellation case [1, 1e100, 1, -1e100]', () => {
			// Naive summation yields 0, and standard Kahan summation also fails (yields 0).
			// Neumaier compensated summation recovers the exact value 2.
			const M = diagMatrix([1, 1e100, 1, -1e100])
			assert.equal(traceFloatSeries(M), 2)
		})

		it('preserves small increments added to a large cancelling base', () => {
			const n = 100
			const diag = [1e16, ...new Array(n).fill(0.25), -1e16]
			const M = diagMatrix(diag)
			assert.equal(traceFloatSeries(M), n * 0.25)
		})

		it('accumulates repeated fractional diagonal values with high accuracy', () => {
			const n = 100
			const M = diagMatrix(new Array(n).fill(0.1))
			const tr = traceFloatSeries(M)
			assert.ok(Math.abs(tr - 10) <= 1e-14, `Expected ~10, got ${tr}`)
		})

		it('handles subnormal diagonal values without underflowing to zero', () => {
			const M = diagMatrix([Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE])
			assert.equal(traceFloatSeries(M), 3 * Number.MIN_VALUE)
		})

		it('avoids spurious intermediate overflow via power-of-two scaling', () => {
			const M = diagMatrix([1e308, 1e308, -1e308])
			assert.equal(traceFloatSeries(M), 1e308)
		})

		it('returns signed Infinity rather than NaN when the true trace overflows float64', () => {
			assert.equal(traceFloatSeries(diagMatrix([1e308, 1e308])), Infinity)
			assert.equal(traceFloatSeries(diagMatrix([-1e308, -1e308])), -Infinity)
		})
	})

	describe('algebraic identity cross-checks', () => {
		const A = [
			[1.25, -2.5, 3.75],
			[4.5, -5.25, 6.125],
			[-7.5, 8.25, -9.5],
		]
		const B = [
			[-3.5, 2.25, -1.125],
			[0.75, 4.5, -6.25],
			[5.125, -8.5, 2.75],
		]
		const C = [
			[2.0, -1.5, 0.5],
			[3.25, 1.75, -2.5],
			[-4.0, 2.25, 3.5],
		]

		it('satisfies transpose invariance: tr(A^T) === tr(A)', () => {
			assert.equal(traceFloatSeries(transpose(A)), traceFloatSeries(A))
			assert.equal(traceFloatSeries(transpose(B)), traceFloatSeries(B))
		})

		it('satisfies linearity: tr(aA + bB) = a*tr(A) + b*tr(B)', () => {
			const scalarPairs = [
				[1, 1],
				[2.5, -3.75],
				[0, 5.5],
				[-1, 0],
				[-0.125, 0.625],
			]
			for (const [a, b] of scalarPairs) {
				const lhs = traceFloatSeries(linearCombination(a, A, b, B))
				const rhs = a * traceFloatSeries(A) + b * traceFloatSeries(B)
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-12,
					`Linearity failed for (a=${a}, b=${b}): lhs=${lhs}, rhs=${rhs}`
				)
			}
		})

		it('satisfies cyclic invariance for square products: tr(AB) = tr(BA) and tr(ABC) = tr(BCA) = tr(CAB)', () => {
			const trAB = traceFloatSeries(matMul(A, B))
			const trBA = traceFloatSeries(matMul(B, A))
			assert.ok(
				Math.abs(trAB - trBA) <= 1e-12,
				`Cyclic invariance failed: tr(AB)=${trAB}, tr(BA)=${trBA}`
			)

			const trABC = traceFloatSeries(matMul(matMul(A, B), C))
			const trBCA = traceFloatSeries(matMul(matMul(B, C), A))
			const trCAB = traceFloatSeries(matMul(matMul(C, A), B))
			assert.ok(
				Math.abs(trABC - trBCA) <= 1e-11 && Math.abs(trABC - trCAB) <= 1e-11,
				`3-matrix cyclic invariance failed: ${trABC}, ${trBCA}, ${trCAB}`
			)
		})

		it('satisfies cyclic invariance for rectangular products: tr(XY) = tr(YX)', () => {
			// X is 2x4, Y is 4x2 => XY is 2x2 and YX is 4x4
			const X = [
				[1.5, -2.0, 3.25, -4.5],
				[0.5, 5.25, -1.75, 2.0],
			]
			const Y = [
				[2.0, -1.0],
				[-3.5, 4.25],
				[1.25, 0.75],
				[-2.5, 3.5],
			]
			const trXY = traceFloatSeries(matMul(X, Y))
			const trYX = traceFloatSeries(matMul(Y, X))
			assert.ok(
				Math.abs(trXY - trYX) <= 1e-12,
				`Rectangular cyclic invariance failed: tr(XY)=${trXY}, tr(YX)=${trYX}`
			)
		})

		it('satisfies similarity invariance: tr(P^-1 A P) = tr(A) and equals sum of eigenvalues', () => {
			// Orthogonal rotation matrix R (R^-1 = R^T)
			const theta = 0.73
			const c = Math.cos(theta)
			const s = Math.sin(theta)
			const R = [
				[c, -s, 0],
				[s, c, 0],
				[0, 0, 1],
			]
			const RT = transpose(R)
			const similar = matMul(matMul(RT, A), R)
			assert.ok(
				Math.abs(traceFloatSeries(similar) - traceFloatSeries(A)) <= 1e-12
			)

			// Diagonalizable matrix M = R * D * R^T has eigenvalues equal to D's diagonal
			const eigenvalues = [3.5, -7.25, 11.125]
			const M = matMul(matMul(R, diagMatrix(eigenvalues)), RT)
			const expectedSum = eigenvalues.reduce((acc, v) => acc + v, 0)
			assert.ok(Math.abs(traceFloatSeries(M) - expectedSum) <= 1e-12)
		})

		it('matches exact scaled integer arithmetic on dyadic rational diagonals', () => {
			// Every entry is an integer multiple of 1/16, so scaled BigInt sum is exact
			const numerators = [17, -43, 128, -91, 5, 64, -19, 31]
			const M = diagMatrix(numerators.map((k) => k / 16))
			const exactNumerator = numerators.reduce((acc, k) => acc + BigInt(k), 0n)
			const expected = Number(exactNumerator) / 16
			assert.equal(traceFloatSeries(M), expected)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array matrix inputs', () => {
			for (const invalid of [null, undefined, 42, '[[1]]', {}, true, new Float64Array([1])]) {
				assert.throws(() => traceFloatSeries(invalid), TypeError)
			}
		})

		it('throws RangeError for empty matrices', () => {
			assert.throws(() => traceFloatSeries([]), RangeError)
			assert.throws(() => traceFloatSeries([[]]), RangeError)
		})

		it('throws TypeError for non-array rows or sparse outer arrays', () => {
			assert.throws(() => traceFloatSeries([1, 2]), TypeError)
			assert.throws(() => traceFloatSeries([[1, 2], null]), TypeError)
			assert.throws(() => traceFloatSeries([[1, 2], '34']), TypeError)
			assert.throws(() => traceFloatSeries(new Array(2)), TypeError)
		})

		it('throws RangeError for non-square or jagged matrices', () => {
			assert.throws(
				() =>
					traceFloatSeries([
						[1, 2, 3],
						[4, 5, 6],
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceFloatSeries([
						[1, 2],
						[3, 4],
						[5, 6],
					]),
				RangeError
			)
			assert.throws(() => traceFloatSeries([[1, 2], [3]]), RangeError)
			assert.throws(() => traceFloatSeries([[1, 2], [3, 4, 5]]), RangeError)
		})

		it('throws TypeError for non-number entries on or off the diagonal', () => {
			assert.throws(() => traceFloatSeries([['1']]), TypeError)
			assert.throws(() => traceFloatSeries([[1, '2'], [3, 4]]), TypeError)
			assert.throws(() => traceFloatSeries([[null]]), TypeError)
			assert.throws(() => traceFloatSeries([[undefined]]), TypeError)
			assert.throws(() => traceFloatSeries([[true]]), TypeError)
			assert.throws(() => traceFloatSeries([[1n]]), TypeError)
			assert.throws(() => traceFloatSeries([new Array(1)]), TypeError)
		})

		it('throws RangeError for non-finite entries (NaN, Infinity, -Infinity) on or off the diagonal', () => {
			assert.throws(() => traceFloatSeries([[NaN]]), RangeError)
			assert.throws(() => traceFloatSeries([[Infinity]]), RangeError)
			assert.throws(() => traceFloatSeries([[-Infinity]]), RangeError)
			assert.throws(() => traceFloatSeries([[1, NaN], [3, 4]]), RangeError)
			assert.throws(() => traceFloatSeries([[1, Infinity], [3, 4]]), RangeError)
			assert.throws(() => traceFloatSeries([[1, -Infinity], [3, 4]]), RangeError)
		})
	})
})
