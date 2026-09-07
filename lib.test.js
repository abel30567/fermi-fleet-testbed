import { test } from 'node:test'
import assert from 'node:assert'
import { add, laplacian2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('laplacian2 of x^2+y^2 is ~4 anywhere', () => {
	const f = (x, y) => x * x + y * y
	for (const [x, y] of [[0, 0], [1, 1], [-2, 3], [5, -5]]) {
		assert.ok(Math.abs(laplacian2(f, x, y) - 4) < 1e-2)
	}
})

test('laplacian2 of harmonic x^2-y^2 is ~0', () => {
	const f = (x, y) => x * x - y * y
	for (const [x, y] of [[0, 0], [1, 1], [-2, 3], [5, -5]]) {
		assert.ok(Math.abs(laplacian2(f, x, y)) < 1e-2)
	}
})

test('laplacian2 accepts custom h', () => {
	const f = (x, y) => x * x + y * y
	assert.ok(Math.abs(laplacian2(f, 2, 2, 1e-3) - 4) < 1e-2)
})
