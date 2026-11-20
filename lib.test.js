import { test } from 'node:test'
import assert from 'node:assert'
import { add, polarToCartesian } from './lib.js'

const EPS = 1e-12
function assertClose(actual, expected, eps = EPS) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`expected ${actual} to be within ${eps} of ${expected}`
	)
}

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('polarToCartesian converts cardinal axis angles', () => {
	assert.deepStrictEqual(polarToCartesian(5, 0), [5, 0])

	const [x90, y90] = polarToCartesian(3, Math.PI / 2)
	assertClose(x90, 0)
	assertClose(y90, 3)

	const [x180, y180] = polarToCartesian(4, Math.PI)
	assertClose(x180, -4)
	assertClose(y180, 0)

	const [x270, y270] = polarToCartesian(2, (3 * Math.PI) / 2)
	assertClose(x270, 0)
	assertClose(y270, -2)
})

test('polarToCartesian converts standard angles across quadrants', () => {
	const [x1, y1] = polarToCartesian(2, Math.PI / 4)
	assertClose(x1, Math.SQRT2)
	assertClose(y1, Math.SQRT2)

	const [x2, y2] = polarToCartesian(6, (2 * Math.PI) / 3)
	assertClose(x2, -3)
	assertClose(y2, 3 * Math.sqrt(3))

	const [x3, y3] = polarToCartesian(4, -Math.PI / 3)
	assertClose(x3, 2)
	assertClose(y3, -2 * Math.sqrt(3))
})

test('polarToCartesian preserves norm and angle identities', () => {
	const samples = [
		[1, 0.5],
		[7.25, 2.1],
		[12.5, -1.75],
		[0.25, -2.9]
	]
	for (const [r, theta] of samples) {
		const [x, y] = polarToCartesian(r, theta)
		assertClose(Math.hypot(x, y), Math.abs(r))
		assertClose(Math.atan2(y, x), theta)
	}
})

test('polarToCartesian obeys 2*pi periodicity and negative radius reflection', () => {
	const [x, y] = polarToCartesian(5, 0.7)
	const [xp, yp] = polarToCartesian(5, 0.7 + 2 * Math.PI)
	assertClose(xp, x)
	assertClose(yp, y)

	const [xn, yn] = polarToCartesian(-5, 0.7)
	const [xr, yr] = polarToCartesian(5, 0.7 + Math.PI)
	assertClose(xn, -x)
	assertClose(yn, -y)
	assertClose(xn, xr)
	assertClose(yn, yr)
})

test('polarToCartesian handles zero radius and avoids negative zero', () => {
	assert.deepStrictEqual(polarToCartesian(0, 0), [0, 0])
	assert.deepStrictEqual(polarToCartesian(0, Math.PI), [0, 0])
	assert.deepStrictEqual(polarToCartesian(0, -Math.PI / 2), [0, 0])
	assert.deepStrictEqual(polarToCartesian(-0, Math.PI / 3), [0, 0])
})
