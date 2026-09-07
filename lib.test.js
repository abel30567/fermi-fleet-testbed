import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradientAscent2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gradientAscent2 finds local max of a downward paraboloid', () => {
	const f = (x, y) => -((x - 2) ** 2) - (y - 1) ** 2
	const [x, y] = gradientAscent2(f, 0, 0)
	assert.ok(Math.abs(x - 2) < 1e-2, `x=${x} not within 1e-2 of 2`)
	assert.ok(Math.abs(y - 1) < 1e-2, `y=${y} not within 1e-2 of 1`)
})

test('gradientAscent2 converges from a different starting point', () => {
	const f = (x, y) => -((x - 2) ** 2) - (y - 1) ** 2
	const [x, y] = gradientAscent2(f, 5, -3)
	assert.ok(Math.abs(x - 2) < 1e-2, `x=${x} not within 1e-2 of 2`)
	assert.ok(Math.abs(y - 1) < 1e-2, `y=${y} not within 1e-2 of 1`)
})

test('gradientAscent2 stays at a maximum when starting there', () => {
	const f = (x, y) => -((x - 2) ** 2) - (y - 1) ** 2
	const [x, y] = gradientAscent2(f, 2, 1)
	assert.ok(Math.abs(x - 2) < 1e-2, `x=${x} not within 1e-2 of 2`)
	assert.ok(Math.abs(y - 1) < 1e-2, `y=${y} not within 1e-2 of 1`)
})

test('gradientAscent2 respects custom lr and steps', () => {
	const f = (x, y) => -((x + 1) ** 2) - (y - 4) ** 2
	const [x, y] = gradientAscent2(f, 0, 0, 0.2, 100)
	assert.ok(Math.abs(x - -1) < 1e-2, `x=${x} not within 1e-2 of -1`)
	assert.ok(Math.abs(y - 4) < 1e-2, `y=${y} not within 1e-2 of 4`)
})
