import { test } from 'node:test'
import assert from 'node:assert'
import { add, levelCurveSlope } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('levelCurveSlope: f=x^2+y^2 at (1,1) ~ -1', () => {
	const f = (x, y) => x * x + y * y
	const slope = levelCurveSlope(f, 1, 1)
	assert.ok(Math.abs(slope - -1) < 1e-4)
})

test('levelCurveSlope: f=x^2+y^2 at (2,1) ~ -2', () => {
	const f = (x, y) => x * x + y * y
	const slope = levelCurveSlope(f, 2, 1)
	assert.ok(Math.abs(slope - -2) < 1e-4)
})

test('levelCurveSlope: f=x*y at (2,3) ~ -y/x = -1.5', () => {
	const f = (x, y) => x * y
	const slope = levelCurveSlope(f, 2, 3)
	assert.ok(Math.abs(slope - -1.5) < 1e-4)
})

test('levelCurveSlope: throws RangeError when fy ~ 0', () => {
	// f = x^2 + y (constant slope in y) -> fy = 1, not zero; use f = x^2 (fy = 0 everywhere)
	const f = (x, _y) => x * x
	assert.throws(() => levelCurveSlope(f, 1, 1), RangeError)
})

test('levelCurveSlope: respects custom h', () => {
	const f = (x, y) => x * x + y * y
	const slope = levelCurveSlope(f, 1, 1, 1e-3)
	assert.ok(Math.abs(slope - -1) < 1e-2)
})
