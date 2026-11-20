import { test } from 'node:test'
import assert from 'node:assert'
import { add, scalarTripleProduct } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('scalarTripleProduct: standard orthonormal basis vectors', () => {
	const i = [1, 0, 0]
	const j = [0, 1, 0]
	const k = [0, 0, 1]
	assert.strictEqual(scalarTripleProduct(i, j, k), 1)
	assert.strictEqual(scalarTripleProduct(i, k, j), -1)
})

test('scalarTripleProduct: general 3D vectors', () => {
	assert.strictEqual(scalarTripleProduct([1, 2, 3], [4, 5, 6], [7, 8, 10]), -3)
	assert.strictEqual(scalarTripleProduct([2, -1, 3], [0, 4, -2], [5, 1, 1]), -38)
	assert.strictEqual(scalarTripleProduct([3, 0, 0], [0, 4, 0], [0, 0, 5]), 60)
})

test('scalarTripleProduct: cyclic permutation invariance', () => {
	const a = [2, -3, 5]
	const b = [-1, 4, 2]
	const c = [7, 1, -6]
	const abc = scalarTripleProduct(a, b, c)
	const bca = scalarTripleProduct(b, c, a)
	const cab = scalarTripleProduct(c, a, b)
	assert.strictEqual(abc, bca)
	assert.strictEqual(bca, cab)
})

test('scalarTripleProduct: anti-symmetry under vector swap', () => {
	const a = [1, 4, -2]
	const b = [3, -5, 1]
	const c = [-2, 0, 6]
	const abc = scalarTripleProduct(a, b, c)
	assert.strictEqual(scalarTripleProduct(b, a, c), -abc)
	assert.strictEqual(scalarTripleProduct(a, c, b), -abc)
	assert.strictEqual(scalarTripleProduct(c, b, a), -abc)
})

test('scalarTripleProduct: multilinearity (scaling and additivity)', () => {
	const a1 = [1, 2, -1]
	const a2 = [3, -1, 4]
	const b = [2, 5, 1]
	const c = [-3, 1, 2]
	const k = -2.5

	const scaledA = a1.map((x) => x * k)
	assert.strictEqual(
		scalarTripleProduct(scaledA, b, c),
		k * scalarTripleProduct(a1, b, c),
	)

	const sumA = [a1[0] + a2[0], a1[1] + a2[1], a1[2] + a2[2]]
	assert.strictEqual(
		scalarTripleProduct(sumA, b, c),
		scalarTripleProduct(a1, b, c) + scalarTripleProduct(a2, b, c),
	)
})

test('scalarTripleProduct: coplanar, duplicate, and zero vectors return +0', () => {
	const coplanar = scalarTripleProduct([1, 2, 3], [4, 5, 6], [7, 8, 9])
	assert.ok(Object.is(coplanar, 0))

	const duplicate = scalarTripleProduct([3, -2, 7], [3, -2, 7], [1, 4, -5])
	assert.ok(Object.is(duplicate, 0))

	const withZero = scalarTripleProduct([0, 0, 0], [-1, 2, 3], [4, -5, 6])
	assert.ok(Object.is(withZero, 0))
})

test('scalarTripleProduct: floating-point vectors', () => {
	const result = scalarTripleProduct([0.5, 1.5, -2.5], [1.2, -0.4, 3.0], [-2.0, 0.8, 1.1])
	const expected =
		0.5 * (-0.4 * 1.1 - 3.0 * 0.8) +
		1.5 * (3.0 * -2.0 - 1.2 * 1.1) +
		-2.5 * (1.2 * 0.8 - -0.4 * -2.0)
	assert.ok(Math.abs(result - expected) < 1e-12)
})

test('scalarTripleProduct: invalid inputs throw TypeError', () => {
	assert.throws(() => scalarTripleProduct([1, 2], [1, 2, 3], [1, 2, 3]), TypeError)
	assert.throws(() => scalarTripleProduct([1, 2, 3], [1, 2, 3, 4], [1, 2, 3]), TypeError)
	assert.throws(() => scalarTripleProduct(null, [1, 2, 3], [1, 2, 3]), TypeError)
	assert.throws(() => scalarTripleProduct([1, 2, 3], [1, '2', 3], [1, 2, 3]), TypeError)
	assert.throws(() => scalarTripleProduct([1, 2, 3], [1, 2, 3], [1, NaN, 3]), TypeError)
})
