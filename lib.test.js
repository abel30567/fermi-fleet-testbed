import { test } from 'node:test'
import assert from 'node:assert'
import { add, cartesianToPolar } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

const EPS = 1e-12

test('cartesianToPolar converts cardinal axes and origin', () => {
	assert.deepEqual(cartesianToPolar(0, 0), { r: 0, theta: 0 })
	assert.deepEqual(cartesianToPolar(1, 0), { r: 1, theta: 0 })
	assert.deepEqual(cartesianToPolar(0, 1), { r: 1, theta: Math.PI / 2 })
	assert.deepEqual(cartesianToPolar(-1, 0), { r: 1, theta: Math.PI })
	assert.deepEqual(cartesianToPolar(0, -1), { r: 1, theta: -Math.PI / 2 })
})

test('cartesianToPolar handles all four quadrants accurately', () => {
	const cases = [
		{ x: 1, y: 1, r: Math.SQRT2, theta: Math.PI / 4 },
		{ x: -1, y: 1, r: Math.SQRT2, theta: (3 * Math.PI) / 4 },
		{ x: -1, y: -1, r: Math.SQRT2, theta: (-3 * Math.PI) / 4 },
		{ x: 1, y: -1, r: Math.SQRT2, theta: -Math.PI / 4 },
		{ x: 3, y: 4, r: 5, theta: Math.atan2(4, 3) },
	]
	for (const c of cases) {
		const res = cartesianToPolar(c.x, c.y)
		assert.ok(Math.abs(res.r - c.r) < EPS)
		assert.ok(Math.abs(res.theta - c.theta) < EPS)
		assert.ok(res.theta > -Math.PI && res.theta <= Math.PI)
	}
})

test('cartesianToPolar preserves polar-to-cartesian round-trip and scaling identities', () => {
	const points = [
		[3, 4],
		[-5, 12],
		[-7, -24],
		[8, -15],
		[0.123, -4.567],
	]
	for (const [x, y] of points) {
		const { r, theta } = cartesianToPolar(x, y)
		assert.ok(Math.abs(r * Math.cos(theta) - x) < 1e-11)
		assert.ok(Math.abs(r * Math.sin(theta) - y) < 1e-11)
		assert.ok(theta > -Math.PI && theta <= Math.PI)

		const scaled = cartesianToPolar(3.5 * x, 3.5 * y)
		assert.ok(Math.abs(scaled.r - 3.5 * r) < 1e-11)
		assert.ok(Math.abs(scaled.theta - theta) < EPS)
	}
})

test('cartesianToPolar normalizes negative zero so theta stays in (-pi, pi]', () => {
	const negAxis = cartesianToPolar(-2, -0)
	assert.equal(negAxis.r, 2)
	assert.equal(negAxis.theta, Math.PI)
	assert.ok(negAxis.theta > -Math.PI && negAxis.theta <= Math.PI)

	const posAxis = cartesianToPolar(2, -0)
	assert.equal(posAxis.r, 2)
	assert.ok(Object.is(posAxis.theta, 0))

	const negOrigin = cartesianToPolar(-0, -0)
	assert.ok(Object.is(negOrigin.r, 0))
	assert.ok(Object.is(negOrigin.theta, 0))
})

test('cartesianToPolar avoids overflow/underflow for extreme magnitudes', () => {
	const huge = cartesianToPolar(3e200, 4e200)
	assert.ok(Math.abs(huge.r - 5e200) / 5e200 < 1e-12)
	assert.ok(Math.abs(huge.theta - Math.atan2(4, 3)) < EPS)

	const tiny = cartesianToPolar(3e-200, 4e-200)
	assert.ok(Math.abs(tiny.r - 5e-200) / 5e-200 < 1e-12)
	assert.ok(Math.abs(tiny.theta - Math.atan2(4, 3)) < EPS)
})

test('cartesianToPolar rejects invalid or non-finite inputs', () => {
	assert.throws(() => cartesianToPolar(NaN, 1), TypeError)
	assert.throws(() => cartesianToPolar(1, NaN), TypeError)
	assert.throws(() => cartesianToPolar('1', 2), TypeError)
	assert.throws(() => cartesianToPolar(Infinity, 0), RangeError)
	assert.throws(() => cartesianToPolar(0, -Infinity), RangeError)
})
