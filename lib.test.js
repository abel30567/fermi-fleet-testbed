import { test } from 'node:test'
import assert from 'node:assert'
import { add, laplacianN } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('laplacianN: sum of squares in 4D ~ 8', () => {
	const f = (x) => x.reduce((s, xi) => s + xi * xi, 0)
	const result = laplacianN(f, [1, 2, 3, 4])
	assert.ok(Math.abs(result - 8) < 1e-1, `expected ~8, got ${result}`)
})

test('laplacianN: sum of squares in 2D ~ 4', () => {
	const f = (x) => x[0] * x[0] + x[1] * x[1]
	const result = laplacianN(f, [0, 0])
	assert.ok(Math.abs(result - 4) < 1e-1, `expected ~4, got ${result}`)
})

test('laplacianN: constant function ~ 0', () => {
	const f = () => 42
	const result = laplacianN(f, [1, 1, 1])
	assert.ok(Math.abs(result) < 1e-1, `expected ~0, got ${result}`)
})

test('laplacianN: linear function ~ 0', () => {
	const f = (x) => x[0] + 2 * x[1] + 3 * x[2]
	const result = laplacianN(f, [5, -2, 3])
	assert.ok(Math.abs(result) < 1e-1, `expected ~0, got ${result}`)
})

test('laplacianN: sum of squares in 1D ~ 2', () => {
	const f = (x) => x[0] * x[0]
	const result = laplacianN(f, [7])
	assert.ok(Math.abs(result - 2) < 1e-1, `expected ~2, got ${result}`)
})

test('laplacianN: accepts custom h', () => {
	const f = (x) => x.reduce((s, xi) => s + xi * xi, 0)
	const result = laplacianN(f, [1, 2, 3], 1e-3)
	assert.ok(Math.abs(result - 6) < 1e-1, `expected ~6, got ${result}`)
})
