import { test } from 'node:test'
import assert from 'node:assert'
import { add, gaussSolve } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertApproxArray(actual, expected, tol = 1e-9) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('gaussSolve: standard 2x2 and 3x3 linear systems', () => {
	const x2 = gaussSolve(
		[
			[2, 1],
			[5, 7],
		],
		[11, 13]
	)
	assertApproxArray(x2, [64 / 9, -29 / 9])

	const x3 = gaussSolve(
		[
			[2, 1, -1],
			[-3, -1, 2],
			[-2, 1, 2],
		],
		[8, -11, -3]
	)
	assertApproxArray(x3, [2, 3, -1])
})

test('gaussSolve: partial pivoting with zero diagonal and tiny pivot', () => {
	const xSwap = gaussSolve(
		[
			[0, 2, 1],
			[1, -2, -3],
			[-1, 1, 2],
		],
		[-8, 0, 3]
	)
	assertApproxArray(xSwap, [-4, -5, 2])

	const eps = 1e-10
	const xStable = gaussSolve(
		[
			[eps, 1],
			[1, 1],
		],
		[1, 2]
	)
	assertApproxArray(xStable, [1 / (1 - eps), (1 - 2 * eps) / (1 - eps)], 1e-9)
})

test('gaussSolve: mathematical identities and non-mutation of inputs', () => {
	const bId = [3.5, -2.25, 0, 7.125]
	const I = [
		[1, 0, 0, 0],
		[0, 1, 0, 0],
		[0, 0, 1, 0],
		[0, 0, 0, 1],
	]
	assertApproxArray(gaussSolve(I, bId), bId)

	const A = [
		[4, -1, 0, 3],
		[1, 15.5, 3, 8],
		[0, -1.3, -4, 1.1],
		[14, 5, -2, 30],
	]
	const b = [1, 1, 1, 1]
	const ACopy = A.map((row) => [...row])
	const bCopy = [...b]

	const x = gaussSolve(A, b)
	assert.deepEqual(A, ACopy)
	assert.deepEqual(b, bCopy)

	for (let i = 0; i < A.length; i++) {
		const lhs = A[i].reduce((acc, aij, j) => acc + aij * x[j], 0)
		assert.ok(Math.abs(lhs - b[i]) < 1e-9)
	}
})

test('gaussSolve: permutation and triangular matrices', () => {
	const P = [
		[0, 0, 1],
		[1, 0, 0],
		[0, 1, 0],
	]
	assertApproxArray(gaussSolve(P, [30, 10, 20]), [10, 20, 30])

	const U = [
		[2, 3, -1],
		[0, 4, 2],
		[0, 0, 5],
	]
	assertApproxArray(gaussSolve(U, [5, 14, 15]), [1, 2, 3])
})

test('gaussSolve: boundary cases (1x1, 0x0, zero rhs)', () => {
	assertApproxArray(gaussSolve([[4]], [10]), [2.5])
	assert.deepEqual(gaussSolve([], []), [])
	assert.deepEqual(
		gaussSolve(
			[
				[3, -1, 2],
				[1, 4, -2],
				[-2, 1, 5],
			],
			[0, 0, 0]
		),
		[0, 0, 0]
	)
})

test('gaussSolve: throws on singular matrices and invalid dimensions', () => {
	assert.throws(
		() =>
			gaussSolve(
				[
					[1, 2],
					[2, 4],
				],
				[3, 6]
			),
		/singular/i
	)

	assert.throws(
		() =>
			gaussSolve(
				[
					[1, 2, 3],
					[4, 5, 6],
					[7, 8, 9],
				],
				[1, 2, 3]
			),
		/singular/i
	)

	assert.throws(
		() =>
			gaussSolve(
				[
					[0, 1],
					[0, 2],
				],
				[1, 2]
			),
		/singular/i
	)

	assert.throws(() => gaussSolve([[1, 2]], [1]), /square/i)
	assert.throws(
		() =>
			gaussSolve(
				[
					[1, 0],
					[0, 1],
				],
				[1]
			),
		/mismatch/i
	)
})
