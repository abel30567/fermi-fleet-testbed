import { test } from 'node:test'
import assert from 'node:assert'
import { add, eigen2x2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('eigen2x2 - diagonal and triangular matrices sorted descending', () => {
	assert.deepEqual(eigen2x2([[2, 0], [0, 5]]), [5, 2])
	assert.deepEqual(eigen2x2([[1, 7], [0, -3]]), [1, -3])
	assert.deepEqual(eigen2x2([[-4, 0], [9, -1]]), [-1, -4])
})

test('eigen2x2 - symmetric matrices with distinct real eigenvalues', () => {
	const [l1, l2] = eigen2x2([[4, 1], [1, 4]])
	assert.ok(Math.abs(l1 - 5) < 1e-12)
	assert.ok(Math.abs(l2 - 3) < 1e-12)

	const [m1, m2] = eigen2x2([[2, 1], [1, 2]])
	assert.ok(Math.abs(m1 - 3) < 1e-12)
	assert.ok(Math.abs(m2 - 1) < 1e-12)
})

test('eigen2x2 - repeated eigenvalues and zero matrix (discriminant = 0)', () => {
	assert.deepEqual(eigen2x2([[1, 0], [0, 1]]), [1, 1])
	assert.deepEqual(eigen2x2([[3, 1], [0, 3]]), [3, 3])
	assert.deepEqual(eigen2x2([[0, 0], [0, 0]]), [0, 0])
	const zeros = eigen2x2([[-0, 0], [0, -0]])
	assert.ok(Object.is(zeros[0], 0))
	assert.ok(Object.is(zeros[1], 0))
})

test('eigen2x2 - complex eigenvalues return null', () => {
	assert.equal(eigen2x2([[0, -1], [1, 0]]), null)
	assert.equal(eigen2x2([[1, -2], [2, 1]]), null)
	assert.equal(eigen2x2([[2, 5], [-5, 2]]), null)
})

test('eigen2x2 - mathematical identities (trace, determinant, transpose, characteristic eq)', () => {
	const A = [[6, -2], [1, 3]]
	const result = eigen2x2(A)
	assert.ok(result !== null)
	const [l1, l2] = result
	assert.ok(l1 >= l2)

	const trace = A[0][0] + A[1][1]
	const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
	assert.ok(Math.abs(l1 + l2 - trace) < 1e-12)
	assert.ok(Math.abs(l1 * l2 - det) < 1e-12)

	for (const lam of [l1, l2]) {
		const charVal = (A[0][0] - lam) * (A[1][1] - lam) - A[0][1] * A[1][0]
		assert.ok(Math.abs(charVal) < 1e-12)
	}

	const AT = [[A[0][0], A[1][0]], [A[0][1], A[1][1]]]
	const [t1, t2] = eigen2x2(AT)
	assert.ok(Math.abs(t1 - l1) < 1e-12)
	assert.ok(Math.abs(t2 - l2) < 1e-12)
})

test('eigen2x2 - singular matrix, irrational eigenvalues, and invalid inputs', () => {
	const [s1, s2] = eigen2x2([[2, 4], [1, 2]])
	assert.ok(Math.abs(s1 - 4) < 1e-12)
	assert.ok(Math.abs(s2 - 0) < 1e-12)

	const phi = (1 + Math.sqrt(5)) / 2
	const [f1, f2] = eigen2x2([[1, 1], [1, 0]])
	assert.ok(Math.abs(f1 - phi) < 1e-12)
	assert.ok(Math.abs(f2 - (1 - phi)) < 1e-12)

	assert.throws(() => eigen2x2(null), TypeError)
	assert.throws(() => eigen2x2([[1, 2]]), TypeError)
	assert.throws(() => eigen2x2([[1, 2, 3], [4, 5, 6]]), TypeError)
	assert.throws(() => eigen2x2([[NaN, 0], [0, 1]]), TypeError)
	assert.throws(() => eigen2x2([[Infinity, 0], [0, 1]]), TypeError)
})
