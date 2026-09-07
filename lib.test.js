import { test } from 'node:test'
import assert from 'node:assert'
import { add, isCriticalPoint2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('isCriticalPoint2: origin of x*x+y*y is a critical point', () => {
	const f = (x, y) => x * x + y * y
	assert.equal(isCriticalPoint2(f, 0, 0), true)
})

test('isCriticalPoint2: (1,1) on x*x+y*y is not a critical point', () => {
	const f = (x, y) => x * x + y * y
	assert.equal(isCriticalPoint2(f, 1, 1), false)
})

test('isCriticalPoint2: saddle point of x*x-y*y at origin is critical', () => {
	const f = (x, y) => x * x - y * y
	assert.equal(isCriticalPoint2(f, 0, 0), true)
})

test('isCriticalPoint2: respects a custom tolerance', () => {
	const f = (x, y) => x * x + y * y
	// gradient at (0.0001, 0) is (0.0002, 0), within a loose tolerance but not the default
	assert.equal(isCriticalPoint2(f, 0.0001, 0, 1e-2), true)
	assert.equal(isCriticalPoint2(f, 0.0001, 0, 1e-6), false)
})

test('isCriticalPoint2: constant function is critical everywhere', () => {
	const f = () => 42
	assert.equal(isCriticalPoint2(f, 5, -3), true)
})
