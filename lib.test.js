import { test } from 'node:test'
import assert from 'node:assert'
import { add, directionalDerivative } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('directionalDerivative: f=x^2+y^2 at (1,0) in direction (1,0) ~ 2', () => {
	const f = (x, y) => x * x + y * y
	const result = directionalDerivative(f, 1, 0, 1, 0)
	assert.ok(Math.abs(result - 2) < 1e-4)
})

test('directionalDerivative: f=x^2+y^2 at (1,0) in direction (0,1) ~ 0', () => {
	const f = (x, y) => x * x + y * y
	const result = directionalDerivative(f, 1, 0, 0, 1)
	assert.ok(Math.abs(result - 0) < 1e-4)
})

test('directionalDerivative: f=x^2+y^2 at (1,1) in direction (1,1) ~ 2*sqrt(2)', () => {
	const f = (x, y) => x * x + y * y
	const result = directionalDerivative(f, 1, 1, 1, 1)
	assert.ok(Math.abs(result - 2 * Math.sqrt(2)) < 1e-4)
})

test('directionalDerivative: normalizes non-unit direction vectors', () => {
	const f = (x, y) => x * x + y * y
	const unit = directionalDerivative(f, 1, 0, 1, 0)
	const nonUnit = directionalDerivative(f, 1, 0, 5, 0)
	assert.ok(Math.abs(unit - nonUnit) < 1e-4)
})

test('directionalDerivative: throws RangeError on zero direction', () => {
	const f = (x, y) => x * x + y * y
	assert.throws(() => directionalDerivative(f, 1, 0, 0, 0), RangeError)
})
