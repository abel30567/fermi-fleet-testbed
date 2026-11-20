import { test } from 'node:test'
import assert from 'node:assert'
import { add, fixedPoint } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('fixedPoint finds Dottie number for cos(x)', () => {
	const root = fixedPoint(Math.cos, 0.5)
	assert.ok(Math.abs(Math.cos(root) - root) < 1e-9)
	assert.ok(Math.abs(root - 0.7390851332151607) < 1e-9)
})

test('fixedPoint computes sqrt(2) via Babylonian iteration', () => {
	const g = (x) => 0.5 * (x + 2 / x)
	const root = fixedPoint(g, 1)
	assert.ok(Math.abs(root - Math.SQRT2) < 1e-10)
	assert.ok(Math.abs(g(root) - root) < 1e-10)
})

test('fixedPoint computes golden ratio phi for g(x) = 1 + 1/x', () => {
	const phi = (1 + Math.sqrt(5)) / 2
	const g = (x) => 1 + 1 / x
	const root = fixedPoint(g, 1)
	assert.ok(Math.abs(root - phi) < 1e-9)
	assert.ok(Math.abs(g(root) - root) < 1e-9)
})

test('fixedPoint satisfies affine contraction identity g(x) = a*x + b => b/(1-a)', () => {
	const a = 0.4
	const b = 3.6
	const expected = b / (1 - a)
	const root = fixedPoint((x) => a * x + b, -100)
	assert.ok(Math.abs(root - expected) < 1e-9)
})

test('fixedPoint returns immediately when x0 is already a fixed point', () => {
	let calls = 0
	const root = fixedPoint((x) => {
		calls += 1
		return x
	}, 42)
	assert.equal(root, 42)
	assert.equal(calls, 1)
})

test('fixedPoint respects custom tol and maxIter parameters', () => {
	const coarse = fixedPoint(Math.cos, 0.5, 1e-3, 50)
	assert.ok(Math.abs(Math.cos(coarse) - coarse) <= 1e-3)
	assert.throws(
		() => fixedPoint(Math.cos, 0.5, 1e-12, 3),
		/did not converge/
	)
})

test('fixedPoint throws on non-convergent, divergent, or invalid inputs', () => {
	assert.throws(() => fixedPoint((x) => -x, 1, 1e-10, 20), /did not converge/)
	assert.throws(() => fixedPoint((x) => x * x, 2, 1e-10, 20), /non-finite/)
	assert.throws(() => fixedPoint('not-a-fn', 1), TypeError)
	assert.throws(() => fixedPoint(Math.cos, NaN), RangeError)
	assert.throws(() => fixedPoint(Math.cos, 0.5, 0), RangeError)
	assert.throws(() => fixedPoint(Math.cos, 0.5, 1e-10, 0), RangeError)
})
