import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductFloatSeries } from './tensorProductFloatSeries.js'

/**
 * Independent naive recursive outer-product reference implementation
 * used as a cross-check against the closed-form stride implementation.
 */
function naiveTensorProduct(a, b) {
	if (typeof a === 'number') {
		if (typeof b === 'number') return a * b
		return b.map((el) => naiveTensorProduct(a, el))
	}
	return a.map((el) => naiveTensorProduct(el, b))
}

/**
 * Recursively collects all leaf numbers from a nested tensor.
 */
function flatten(t) {
	if (typeof t === 'number') return [t]
	return t.flatMap(flatten)
}

/**
 * Recursively applies a binary operation element-wise to two same-shape tensors.
 */
function zipMap(x, y, fn) {
	if (typeof x === 'number') return fn(x, y)
	assert.equal(x.length, y.length)
	return x.map((xi, i) => zipMap(xi, y[i], fn))
}

/**
 * Recursively scales a tensor by a scalar.
 */
function scale(alpha, t) {
	if (typeof t === 'number') return alpha * t
	return t.map((el) => scale(alpha, el))
}

/**
 * Asserts two nested tensors have identical shapes and elements within tolerance.
 */
function assertTensorApproxEqual(actual, expected, eps = 1e-12) {
	if (typeof expected === 'number') {
		assert.equal(typeof actual, 'number')
		assert.ok(
			Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(actual), Math.abs(expected)),
			`expected ${actual} ≈ ${expected} (tol=${eps})`,
		)
		return
	}
	assert.ok(Array.isArray(actual), 'expected array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertTensorApproxEqual(actual[i], expected[i], eps)
	}
}

describe('tensorProductFloatSeries', () => {
	it('computes rank-0 scalar tensor products', () => {
		assert.equal(tensorProductFloatSeries(3, 4), 12)
		assert.equal(tensorProductFloatSeries(-2.5, 4.2), -10.5)
		assert.equal(tensorProductFloatSeries(0, 7.5), 0)
	})

	it('computes scalar-by-tensor and tensor-by-scalar products', () => {
		assert.deepEqual(tensorProductFloatSeries(2.5, [1, -2, 4]), [2.5, -5, 10])
		assert.deepEqual(tensorProductFloatSeries([1, -2, 4], 2.5), [2.5, -5, 10])
		assert.deepEqual(
			tensorProductFloatSeries(-0.5, [
				[2, 4],
				[6, 8],
			]),
			[
				[-1, -2],
				[-3, -4],
			],
		)
	})

	it('computes 1D vector outer product (rank 1 ⊗ rank 1 -> rank 2)', () => {
		const a = [1, 2, 3]
		const b = [4, 5]
		assert.deepEqual(tensorProductFloatSeries(a, b), [
			[4, 5],
			[8, 10],
			[12, 15],
		])

		const c = [0.5, -1.25]
		const d = [2, 0.25, -4]
		assert.deepEqual(tensorProductFloatSeries(c, d), [
			[1, 0.125, -2],
			[-2.5, -0.3125, 5],
		])
	})

	it('computes 2D matrix tensor product (rank 2 ⊗ rank 2 -> rank 4)', () => {
		const A = [
			[1, 2],
			[3, 4],
		]
		const B = [
			[0.5, -1, 2],
			[1.5, 0, -0.5],
		]
		const C = tensorProductFloatSeries(A, B)

		assert.equal(C.length, 2)
		assert.equal(C[0].length, 2)
		assert.equal(C[0][0].length, 2)
		assert.equal(C[0][0][0].length, 3)

		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < 2; j++) {
				for (let k = 0; k < 2; k++) {
					for (let l = 0; l < 3; l++) {
						assert.equal(C[i][j][k][l], A[i][j] * B[k][l])
					}
				}
			}
		}
	})

	it('computes mixed-rank tensor products (rank 1 ⊗ rank 2 and rank 2 ⊗ rank 1)', () => {
		const v = [2, -3]
		const M = [
			[1, 4],
			[5, 6],
		]
		assert.deepEqual(tensorProductFloatSeries(v, M), [
			[
				[2, 8],
				[10, 12],
			],
			[
				[-3, -12],
				[-15, -18],
			],
		])
		assert.deepEqual(tensorProductFloatSeries(M, v), [
			[
				[2, -3],
				[8, -12],
			],
			[
				[10, -15],
				[12, -18],
			],
		])
	})

	it('handles empty tensors and zero-sized dimensions cleanly', () => {
		assert.deepEqual(tensorProductFloatSeries([], [1, 2]), [])
		assert.deepEqual(tensorProductFloatSeries([1, 2], []), [[], []])
		assert.deepEqual(tensorProductFloatSeries([], []), [])
		assert.deepEqual(tensorProductFloatSeries(3, []), [])
		assert.deepEqual(tensorProductFloatSeries([], 3), [])
		assert.deepEqual(tensorProductFloatSeries([[], []], [1, 2]), [[], []])
	})

	it('handles IEEE-754 edge values (signed zero, subnormals, overflow, underflow)', () => {
		assert.ok(Object.is(tensorProductFloatSeries(-0, 5), -0))
		assert.deepEqual(tensorProductFloatSeries([Number.MIN_VALUE], [2]), [[2 * Number.MIN_VALUE]])
		assert.deepEqual(tensorProductFloatSeries([2 ** 500], [2 ** 500]), [[2 ** 1000]])
		assert.deepEqual(tensorProductFloatSeries([1e150], [1e150]), [[1e150 * 1e150]])
		assert.deepEqual(tensorProductFloatSeries([1e200], [1e200]), [[Infinity]])
		assert.deepEqual(tensorProductFloatSeries([1e-200], [1e-200]), [[0]])
	})

	it('does not alias or mutate input tensors', () => {
		const a = [1, 2]
		const b = [3, 4]
		const out = tensorProductFloatSeries(a, b)
		a[0] = 99
		b[1] = 88
		assert.deepEqual(out, [
			[3, 4],
			[6, 8],
		])
	})

	it('cross-check: matches independent naive recursive outer product across ranks 0..3', () => {
		const samples = [
			-3.75,
			[1.1, -2.2, 3.3],
			[
				[0.5, -1.5],
				[2.25, 4.75],
			],
			[
				[
					[1, -2],
					[3, 0.25],
				],
				[
					[-0.5, 4],
					[1.5, -3.5],
				],
			],
		]

		for (const a of samples) {
			for (const b of samples) {
				assert.deepEqual(tensorProductFloatSeries(a, b), naiveTensorProduct(a, b))
			}
		}
	})

	it('cross-check: satisfies multilinear algebra identities (bilinearity, associativity, norm, sum, trace, polarization)', () => {
		const A1 = [
			[1.25, -0.5],
			[2.0, 3.5],
		]
		const A2 = [
			[-0.75, 1.5],
			[0.25, -2.0],
		]
		const B1 = [
			[2.5, -1.25],
			[0.5, 1.75],
		]
		const B2 = [
			[-1.0, 0.75],
			[3.0, -0.25],
		]
		const C = [1.5, -2.5, 0.5]
		const alpha = 1.75
		const beta = -0.625

		// 1. Bilinearity in left argument: (αA1 + βA2) ⊗ B1 = α(A1 ⊗ B1) + β(A2 ⊗ B1)
		const lhsLeft = tensorProductFloatSeries(
			zipMap(scale(alpha, A1), scale(beta, A2), (x, y) => x + y),
			B1,
		)
		const rhsLeft = zipMap(
			scale(alpha, tensorProductFloatSeries(A1, B1)),
			scale(beta, tensorProductFloatSeries(A2, B1)),
			(x, y) => x + y,
		)
		assertTensorApproxEqual(lhsLeft, rhsLeft)

		// 2. Bilinearity in right argument: A1 ⊗ (αB1 + βB2) = α(A1 ⊗ B1) + β(A1 ⊗ B2)
		const lhsRight = tensorProductFloatSeries(
			A1,
			zipMap(scale(alpha, B1), scale(beta, B2), (x, y) => x + y),
		)
		const rhsRight = zipMap(
			scale(alpha, tensorProductFloatSeries(A1, B1)),
			scale(beta, tensorProductFloatSeries(A1, B2)),
			(x, y) => x + y,
		)
		assertTensorApproxEqual(lhsRight, rhsRight)

		// 3. Associativity: (A1 ⊗ B1) ⊗ C = A1 ⊗ (B1 ⊗ C)
		const assocLhs = tensorProductFloatSeries(tensorProductFloatSeries(A1, B1), C)
		const assocRhs = tensorProductFloatSeries(A1, tensorProductFloatSeries(B1, C))
		assertTensorApproxEqual(assocLhs, assocRhs)

		// 4. Frobenius norm multiplicativity: ||A1 ⊗ B1||_F = ||A1||_F * ||B1||_F
		const prod = tensorProductFloatSeries(A1, B1)
		const frob = (t) => Math.hypot(...flatten(t))
		assertTensorApproxEqual(frob(prod), frob(A1) * frob(B1))

		// 5. Sum factorization: Σ(A1 ⊗ B1) = (Σ A1) * (Σ B1)
		const sum = (t) => flatten(t).reduce((acc, x) => acc + x, 0)
		assertTensorApproxEqual(sum(prod), sum(A1) * sum(B1))

		// 6. Trace multiplicativity: Σ_{i,k} (A1 ⊗ B1)[i][i][k][k] = tr(A1) * tr(B1)
		const traceA = A1[0][0] + A1[1][1]
		const traceB = B1[0][0] + B1[1][1]
		let traceProd = 0
		for (let i = 0; i < 2; i++) {
			for (let k = 0; k < 2; k++) {
				traceProd += prod[i][i][k][k]
			}
		}
		assertTensorApproxEqual(traceProd, traceA * traceB)

		// 7. Polarization identity check: a*b = ((a+b)^2 - (a-b)^2) / 4
		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < 2; j++) {
				for (let k = 0; k < 2; k++) {
					for (let l = 0; l < 2; l++) {
						const x = A1[i][j]
						const y = B1[k][l]
						const polarized = ((x + y) ** 2 - (x - y) ** 2) / 4
						assertTensorApproxEqual(prod[i][j][k][l], polarized)
					}
				}
			}
		}
	})

	it('throws TypeError on invalid non-number/non-array inputs', () => {
		assert.throws(() => tensorProductFloatSeries(null, [1]), TypeError)
		assert.throws(() => tensorProductFloatSeries([1], undefined), TypeError)
		assert.throws(() => tensorProductFloatSeries('1', [2]), TypeError)
		assert.throws(() => tensorProductFloatSeries([1, '2'], [3]), TypeError)
		assert.throws(() => tensorProductFloatSeries([1n], [2]), TypeError)
		assert.throws(() => tensorProductFloatSeries({ a: 1 }, [2]), TypeError)
		assert.throws(() => tensorProductFloatSeries([true], [2]), TypeError)
	})

	it('throws RangeError on non-finite numbers or ragged tensor shapes', () => {
		assert.throws(() => tensorProductFloatSeries(NaN, [1]), RangeError)
		assert.throws(() => tensorProductFloatSeries([1], Infinity), RangeError)
		assert.throws(() => tensorProductFloatSeries([1, -Infinity], [2]), RangeError)
		assert.throws(() => tensorProductFloatSeries([[1, 2], [3]], [1]), RangeError)
		assert.throws(() => tensorProductFloatSeries([1, [2]], [3]), RangeError)
		assert.throws(() => tensorProductFloatSeries([1], [[], [1]]), RangeError)
	})
})
