import { test } from 'node:test'
import assert from 'node:assert'
import { add, bilinearInterpolate } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('bilinearInterpolate returns exact corner values', () => {
	const [x0, x1, y0, y1] = [2, 6, -3, 5]
	const [q00, q10, q01, q11] = [10, 20, 30, 40]
	assert.equal(bilinearInterpolate(x0, y0, x0, x1, y0, y1, q00, q10, q01, q11), q00)
	assert.equal(bilinearInterpolate(x1, y0, x0, x1, y0, y1, q00, q10, q01, q11), q10)
	assert.equal(bilinearInterpolate(x0, y1, x0, x1, y0, y1, q00, q10, q01, q11), q01)
	assert.equal(bilinearInterpolate(x1, y1, x0, x1, y0, y1, q00, q10, q01, q11), q11)
})

test('bilinearInterpolate computes center and edge midpoints on unit square', () => {
	const [q00, q10, q01, q11] = [1, 3, 5, 9]
	assert.equal(bilinearInterpolate(0.5, 0.5, 0, 1, 0, 1, q00, q10, q01, q11), (1 + 3 + 5 + 9) / 4)
	assert.equal(bilinearInterpolate(0.5, 0, 0, 1, 0, 1, q00, q10, q01, q11), 2)
	assert.equal(bilinearInterpolate(0.5, 1, 0, 1, 0, 1, q00, q10, q01, q11), 7)
	assert.equal(bilinearInterpolate(0, 0.5, 0, 1, 0, 1, q00, q10, q01, q11), 3)
	assert.equal(bilinearInterpolate(1, 0.5, 0, 1, 0, 1, q00, q10, q01, q11), 6)
})

test('bilinearInterpolate exactly reproduces any bilinear polynomial', () => {
	const f = (x, y) => 7 + 2 * x - 3 * y + 0.5 * x * y
	const [x0, x1, y0, y1] = [-4, 12, -2, 8]
	const q00 = f(x0, y0)
	const q10 = f(x1, y0)
	const q01 = f(x0, y1)
	const q11 = f(x1, y1)

	for (const [x, y] of [
		[0, 0],
		[3.25, 4.75],
		[-1.5, 6.2],
		[10, -1],
	]) {
		const actual = bilinearInterpolate(x, y, x0, x1, y0, y1, q00, q10, q01, q11)
		const expected = f(x, y)
		assert.ok(Math.abs(actual - expected) < 1e-12, `expected ${expected}, got ${actual}`)
	}
})

test('bilinearInterpolate preserves constant fields and linearity in values', () => {
	const [x, y, x0, x1, y0, y1] = [1.3, 2.7, 0, 4, 1, 5]
	const constant = bilinearInterpolate(x, y, x0, x1, y0, y1, 42, 42, 42, 42)
	assert.ok(Math.abs(constant - 42) < 1e-12)

	const a = 2.5
	const b = -1.25
	const p = [1, 4, -2, 7]
	const q = [3, -1, 5, 2]
	const combined = p.map((v, i) => a * v + b * q[i])
	const lhs = bilinearInterpolate(x, y, x0, x1, y0, y1, ...combined)
	const rhs =
		a * bilinearInterpolate(x, y, x0, x1, y0, y1, ...p) +
		b * bilinearInterpolate(x, y, x0, x1, y0, y1, ...q)
	assert.ok(Math.abs(lhs - rhs) < 1e-12)
})

test('bilinearInterpolate handles extrapolation and reversed coordinate bounds', () => {
	const ext = bilinearInterpolate(3, -1, 0, 1, 0, 1, 0, 1, 2, 3)
	assert.ok(Math.abs(ext - 1) < 1e-12)

	const normal = bilinearInterpolate(2.5, 3.5, 0, 10, 0, 10, 1, 2, 3, 4)
	const reversed = bilinearInterpolate(2.5, 3.5, 10, 0, 10, 0, 4, 3, 2, 1)
	assert.ok(Math.abs(normal - reversed) < 1e-12)
})

test('bilinearInterpolate throws RangeError on degenerate rectangles', () => {
	assert.throws(() => bilinearInterpolate(1, 1, 2, 2, 0, 5, 1, 2, 3, 4), RangeError)
	assert.throws(() => bilinearInterpolate(1, 1, 0, 5, 3, 3, 1, 2, 3, 4), RangeError)
})
