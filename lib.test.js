import { test } from 'node:test'
import assert from 'node:assert'
import { add, vectorTripleProduct } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('vectorTripleProduct computes standard basis and general 3D vectors', () => {
	assert.deepStrictEqual(vectorTripleProduct([1, 0, 0], [0, 1, 0], [1, 0, 0]), [0, 1, 0])
	assert.deepStrictEqual(vectorTripleProduct([1, 0, 0], [1, 0, 0], [0, 1, 0]), [0, -1, 0])
	assert.deepStrictEqual(vectorTripleProduct([1, 2, 3], [4, 5, 6], [7, 8, 9]), [-24, -6, 12])
})

test('vectorTripleProduct satisfies Lagrange BAC-CAB identity', () => {
	const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
	const cases = [
		[
			[2, -3, 1],
			[-1, 4, 5],
			[3, 2, -2],
		],
		[
			[0.5, -1.25, 3.5],
			[2.5, 0.75, -1.5],
			[-0.25, 4.0, 1.25],
		],
	]

	for (const [a, b, c] of cases) {
		const res = vectorTripleProduct(a, b, c)
		const ac = dot(a, c)
		const ab = dot(a, b)
		const expected = [b[0] * ac - c[0] * ab, b[1] * ac - c[1] * ab, b[2] * ac - c[2] * ab]
		for (let i = 0; i < 3; i++) {
			assert.ok(Math.abs(res[i] - expected[i]) < 1e-12)
		}
	}
})

test('vectorTripleProduct satisfies Jacobi identity', () => {
	const a = [3, -2, 5]
	const b = [-4, 1, 2]
	const c = [2, 6, -3]

	const t1 = vectorTripleProduct(a, b, c)
	const t2 = vectorTripleProduct(b, c, a)
	const t3 = vectorTripleProduct(c, a, b)

	assert.deepStrictEqual([t1[0] + t2[0] + t3[0], t1[1] + t2[1] + t3[1], t1[2] + t2[2] + t3[2]], [0, 0, 0])
})

test('vectorTripleProduct result is orthogonal to a and antisymmetric in b and c', () => {
	const a = [2, 5, -1]
	const b = [-3, 1, 4]
	const c = [1, -2, 3]

	const res = vectorTripleProduct(a, b, c)
	const dotA = a[0] * res[0] + a[1] * res[1] + a[2] * res[2]
	assert.equal(dotA, 0)

	const swapped = vectorTripleProduct(a, c, b)
	assert.deepStrictEqual(swapped, [-res[0], -res[1], -res[2]])
})

test('vectorTripleProduct handles zero and collinear boundary cases without -0', () => {
	assert.deepStrictEqual(vectorTripleProduct([0, 0, 0], [1, 2, 3], [4, 5, 6]), [0, 0, 0])
	assert.deepStrictEqual(vectorTripleProduct([1, 2, 3], [0, 0, 0], [4, 5, 6]), [0, 0, 0])
	assert.deepStrictEqual(vectorTripleProduct([1, 2, 3], [4, 5, 6], [0, 0, 0]), [0, 0, 0])
	assert.deepStrictEqual(vectorTripleProduct([1, 2, 3], [2, -4, 6], [-1, 2, -3]), [0, 0, 0])
	const zero = vectorTripleProduct([-1, 0, 0], [0, -1, 0], [0, 1, 0])
	for (const comp of zero) {
		assert.ok(Object.is(comp, 0))
	}
})

test('vectorTripleProduct rejects invalid 3D vector inputs', () => {
	assert.throws(() => vectorTripleProduct([1, 2], [1, 2, 3], [1, 2, 3]), TypeError)
	assert.throws(() => vectorTripleProduct([1, 2, 3], [1, 2, 3, 4], [1, 2, 3]), TypeError)
	assert.throws(() => vectorTripleProduct([1, 2, 3], [1, 2, 3], 'invalid'), TypeError)
	assert.throws(() => vectorTripleProduct([NaN, 0, 0], [1, 2, 3], [4, 5, 6]), TypeError)
	assert.throws(() => vectorTripleProduct([1, 2, 3], [Infinity, 0, 0], [4, 5, 6]), TypeError)
})
