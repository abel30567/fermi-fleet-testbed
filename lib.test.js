import { test } from 'node:test'
import assert from 'node:assert'
import { add, directionalDerivativeN } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('directionalDerivativeN: sum of squares at [1,0] toward [1,0] ~ 2', () => {
	const f = (p) => p.reduce((sum, x) => sum + x * x, 0)
	const result = directionalDerivativeN(f, [1, 0], [1, 0])
	assert.ok(Math.abs(result - 2) < 1e-4)
})

test('directionalDerivativeN: sum of squares at [1,1] toward [1,1] ~ 2*sqrt(2)', () => {
	const f = (p) => p.reduce((sum, x) => sum + x * x, 0)
	const result = directionalDerivativeN(f, [1, 1], [1, 1])
	assert.ok(Math.abs(result - 2 * Math.sqrt(2)) < 1e-4)
})

test('directionalDerivativeN: normalizes non-unit direction vectors', () => {
	const f = (p) => p.reduce((sum, x) => sum + x * x, 0)
	const unit = directionalDerivativeN(f, [1, 0], [1, 0])
	const scaled = directionalDerivativeN(f, [1, 0], [5, 0])
	assert.ok(Math.abs(unit - scaled) < 1e-4)
})

test('directionalDerivativeN: works in 3 dimensions', () => {
	const f = (p) => p.reduce((sum, x) => sum + x * x, 0)
	const result = directionalDerivativeN(f, [1, 2, 3], [1, 0, 0])
	assert.ok(Math.abs(result - 2) < 1e-4)
})

test('directionalDerivativeN: zero along a level direction is ~0', () => {
	const f = (p) => p[0] * p[0] + p[1] * p[1]
	const result = directionalDerivativeN(f, [0, 0], [1, 0])
	assert.ok(Math.abs(result) < 1e-4)
})

test('directionalDerivativeN: throws RangeError on zero direction vector', () => {
	const f = (p) => p.reduce((sum, x) => sum + x * x, 0)
	assert.throws(() => directionalDerivativeN(f, [1, 0], [0, 0]), RangeError)
})
