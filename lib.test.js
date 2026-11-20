import { test } from 'node:test'
import assert from 'node:assert'
import { add, cubicHermite } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('cubicHermite evaluates exact endpoints at t = 0 and t = 1', () => {
	assert.equal(cubicHermite(0, 4, 10, -3, -7), 4)
	assert.equal(cubicHermite(1, 4, 10, -3, -7), -3)
	assert.equal(cubicHermite(0, 0, 0, 0, 0), 0)
	assert.equal(cubicHermite(1, -12.5, 3.25, 8.75, -1.5), 8.75)
})

test('cubicHermite matches Hermite basis polynomials and smoothstep', () => {
	for (const t of [0, 0.25, 0.5, 0.75, 1]) {
		const t2 = t * t
		const t3 = t2 * t
		assert.ok(Math.abs(cubicHermite(t, 1, 0, 0, 0) - (2 * t3 - 3 * t2 + 1)) < 1e-12)
		assert.ok(Math.abs(cubicHermite(t, 0, 1, 0, 0) - (t3 - 2 * t2 + t)) < 1e-12)
		assert.ok(Math.abs(cubicHermite(t, 0, 0, 1, 0) - (3 * t2 - 2 * t3)) < 1e-12)
		assert.ok(Math.abs(cubicHermite(t, 0, 0, 0, 1) - (t3 - t2)) < 1e-12)
	}
	assert.equal(cubicHermite(0.5, 0, 0, 1, 0), 0.5)
})

test('cubicHermite preserves constants and linear interpolation', () => {
	for (const t of [0, 0.1, 0.37, 0.5, 0.85, 1]) {
		assert.ok(Math.abs(cubicHermite(t, 7.5, 0, 7.5, 0) - 7.5) < 1e-12)
		const p0 = -2
		const p1 = 10
		const slope = p1 - p0
		const expected = p0 + t * slope
		assert.ok(Math.abs(cubicHermite(t, p0, slope, p1, slope) - expected) < 1e-12)
	}
})

test('cubicHermite reproduces arbitrary cubic polynomials and endpoint derivatives', () => {
	// f(t) = 2t^3 - 5t^2 + 3t - 7, f'(t) = 6t^2 - 10t + 3
	const f = (t) => 2 * t ** 3 - 5 * t ** 2 + 3 * t - 7
	const p0 = f(0)
	const m0 = 3
	const p1 = f(1)
	const m1 = 6 - 10 + 3

	for (const t of [0, 0.15, 0.4, 0.5, 0.72, 0.95, 1]) {
		assert.ok(Math.abs(cubicHermite(t, p0, m0, p1, m1) - f(t)) < 1e-12)
	}

	const h = 1e-7
	const approxM0 = (cubicHermite(h, p0, m0, p1, m1) - cubicHermite(0, p0, m0, p1, m1)) / h
	const approxM1 = (cubicHermite(1, p0, m0, p1, m1) - cubicHermite(1 - h, p0, m0, p1, m1)) / h
	assert.ok(Math.abs(approxM0 - m0) < 1e-5)
	assert.ok(Math.abs(approxM1 - m1) < 1e-5)
})

test('cubicHermite satisfies reversal symmetry', () => {
	const p0 = -3.5
	const m0 = 4.2
	const p1 = 6.1
	const m1 = -2.8
	for (const t of [0, 0.2, 0.33, 0.5, 0.8, 1]) {
		const forward = cubicHermite(t, p0, m0, p1, m1)
		const reversed = cubicHermite(1 - t, p1, -m1, p0, -m0)
		assert.ok(Math.abs(forward - reversed) < 1e-12)
	}
})

test('cubicHermite validates parameter bounds and finite numeric inputs', () => {
	assert.throws(() => cubicHermite(-0.001, 0, 0, 1, 0), RangeError)
	assert.throws(() => cubicHermite(1.001, 0, 0, 1, 0), RangeError)
	assert.throws(() => cubicHermite(NaN, 0, 0, 1, 0), TypeError)
	assert.throws(() => cubicHermite(0.5, Infinity, 0, 1, 0), TypeError)
	assert.throws(() => cubicHermite(0.5, 0, -Infinity, 1, 0), TypeError)
	assert.throws(() => cubicHermite(0.5, 0, 0, '1', 0), TypeError)
	assert.throws(() => cubicHermite(0.5, 0, 0, 1, undefined), TypeError)
})
