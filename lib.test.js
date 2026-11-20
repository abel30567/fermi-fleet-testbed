import { test } from 'node:test'
import assert from 'node:assert'
import { add, bezierEval } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertPointClose(actual, expected, eps = 1e-10) {
	assert.equal(actual.length, 2)
	assert.ok(
		Math.abs(actual[0] - expected[0]) <= eps,
		`x mismatch: expected ${expected[0]}, got ${actual[0]}`,
	)
	assert.ok(
		Math.abs(actual[1] - expected[1]) <= eps,
		`y mismatch: expected ${expected[1]}, got ${actual[1]}`,
	)
}

function binomial(n, k) {
	let res = 1
	for (let i = 1; i <= k; i++) {
		res = (res * (n - i + 1)) / i
	}
	return res
}

function bernsteinEval(points, t) {
	const n = points.length - 1
	let x = 0
	let y = 0
	for (let i = 0; i <= n; i++) {
		const b = binomial(n, i) * (1 - t) ** (n - i) * t ** i
		x += b * points[i][0]
		y += b * points[i][1]
	}
	return [x, y]
}

test('bezierEval: degree 0 and degree 1 (linear) curves', () => {
	const single = [[3.5, -2.25]]
	assert.deepEqual(bezierEval(single, 0), [3.5, -2.25])
	assert.deepEqual(bezierEval(single, 0.5), [3.5, -2.25])
	assert.deepEqual(bezierEval(single, 1), [3.5, -2.25])
	assert.notEqual(bezierEval(single, 0.5), single[0])

	const line = [
		[0, 0],
		[10, 20],
	]
	assert.deepEqual(bezierEval(line, 0), [0, 0])
	assert.deepEqual(bezierEval(line, 1), [10, 20])
	assertPointClose(bezierEval(line, 0.25), [2.5, 5])
	assertPointClose(bezierEval(line, 0.5), [5, 10])
})

test('bezierEval: quadratic and cubic curves match Bernstein form', () => {
	const quad = [
		[0, 0],
		[1, 2],
		[2, 0],
	]
	for (const t of [0, 0.25, 0.5, 0.75, 1]) {
		assertPointClose(bezierEval(quad, t), bernsteinEval(quad, t))
	}
	assertPointClose(bezierEval(quad, 0.5), [1, 1])

	const cubic = [
		[0, 0],
		[0, 4],
		[4, 4],
		[4, 0],
	]
	for (const t of [0, 0.1, 0.3, 0.5, 0.8, 1]) {
		assertPointClose(bezierEval(cubic, t), bernsteinEval(cubic, t))
	}
	assertPointClose(bezierEval(cubic, 0.5), [2, 3])
})

test('bezierEval: higher-degree (n=4 and n=5) curves', () => {
	const quartic = [
		[-2, 1],
		[0, 5],
		[3, -1],
		[6, 4],
		[8, 0],
	]
	for (const t of [0, 0.2, 0.5, 0.7, 1]) {
		assertPointClose(bezierEval(quartic, t), bernsteinEval(quartic, t))
	}

	const quintic = [
		[0, 0],
		[1, 3],
		[2, -2],
		[4, 5],
		[5, 1],
		[7, 2],
	]
	for (const t of [0, 0.15, 0.4, 0.65, 0.9, 1]) {
		assertPointClose(bezierEval(quintic, t), bernsteinEval(quintic, t))
	}
})

test('bezierEval: mathematical identities (reversal, affine invariance, convex hull, constant)', () => {
	const pts = [
		[-3, 2],
		[1, 7],
		[5, -4],
		[9, 3],
	]
	const reversed = [...pts].reverse()

	for (const t of [0, 0.2, 0.37, 0.5, 0.83, 1]) {
		// Reversal symmetry: B(P, t) == B(reverse(P), 1 - t)
		assertPointClose(bezierEval(pts, t), bezierEval(reversed, 1 - t))

		// Affine invariance: T(B(P, t)) == B(T(P), t)
		const transform = ([x, y]) => [2 * x - 0.5 * y + 4, 0.25 * x + 3 * y - 1]
		const transformedPts = pts.map(transform)
		assertPointClose(
			bezierEval(transformedPts, t),
			transform(bezierEval(pts, t)),
		)

		// Convex hull (bounding box) property for t in [0, 1]
		const [x, y] = bezierEval(pts, t)
		assert.ok(x >= -3 - 1e-12 && x <= 9 + 1e-12)
		assert.ok(y >= -4 - 1e-12 && y <= 7 + 1e-12)
	}

	// Partition of unity: identical control points yield the same point
	const constantPts = [
		[4.2, -1.7],
		[4.2, -1.7],
		[4.2, -1.7],
		[4.2, -1.7],
	]
	assertPointClose(bezierEval(constantPts, 0.42), [4.2, -1.7])
})

test('bezierEval: endpoint exactness, extrapolation, and input immutability', () => {
	const pts = [
		[1.25, -3.5],
		[4, 2],
		[7.5, 6.25],
	]
	const snapshot = structuredClone(pts)

	assert.deepEqual(bezierEval(pts, 0), [1.25, -3.5])
	assert.deepEqual(bezierEval(pts, 1), [7.5, 6.25])

	// Extrapolation outside [0, 1] still matches polynomial form
	assertPointClose(bezierEval(pts, -0.5), bernsteinEval(pts, -0.5))
	assertPointClose(bezierEval(pts, 1.5), bernsteinEval(pts, 1.5))

	// Input array and nested point arrays remain unmutated
	assert.deepEqual(pts, snapshot)
})

test('bezierEval: invalid inputs throw errors', () => {
	assert.throws(() => bezierEval([], 0.5), RangeError)
	assert.throws(() => bezierEval(null, 0.5), RangeError)
	assert.throws(() => bezierEval([[0, 0]], Number.NaN), TypeError)
	assert.throws(() => bezierEval([[0, 0]], Number.POSITIVE_INFINITY), TypeError)
	assert.throws(() => bezierEval([[0, 0], [1]], 0.5), TypeError)
	assert.throws(() => bezierEval([[0, 0], [1, Number.NaN]], 0.5), TypeError)
})
