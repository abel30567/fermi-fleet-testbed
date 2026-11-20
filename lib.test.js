import { test } from 'node:test'
import assert from 'node:assert'
import { add, rodriguesRotate } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`,
		)
	}
}

test('rodriguesRotate rotates basis vectors around principal axes', () => {
	assertVecClose(rodriguesRotate([1, 0, 0], [0, 0, 1], Math.PI / 2), [0, 1, 0])
	assertVecClose(rodriguesRotate([0, 1, 0], [1, 0, 0], Math.PI / 2), [0, 0, 1])
	assertVecClose(rodriguesRotate([0, 0, 1], [0, 1, 0], Math.PI / 2), [1, 0, 0])
	assertVecClose(rodriguesRotate([1, 0, 0], [0, 0, 1], Math.PI), [-1, 0, 0])
})

test('rodriguesRotate normalizes arbitrary non-unit axes', () => {
	assertVecClose(rodriguesRotate([1, 0, 0], [1, 1, 1], (2 * Math.PI) / 3), [0, 1, 0])
	assertVecClose(rodriguesRotate([0, 1, 0], [3, 3, 3], (2 * Math.PI) / 3), [0, 0, 1])
	assertVecClose(rodriguesRotate([1, 0, 0], [0, 0, 5], Math.PI / 2), [0, 1, 0])
})

test('rodriguesRotate preserves vector norm and projection onto axis', () => {
	const v = [3.5, -2.25, 4.75]
	const axis = [2, -1, 3]
	const angle = 1.2345
	const rotated = rodriguesRotate(v, axis, angle)

	const normBefore = Math.hypot(...v)
	const normAfter = Math.hypot(...rotated)
	assert.ok(Math.abs(normAfter - normBefore) < 1e-12)

	const dotBefore = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]
	const dotAfter = rotated[0] * axis[0] + rotated[1] * axis[1] + rotated[2] * axis[2]
	assert.ok(Math.abs(dotAfter - dotBefore) < 1e-12)
})

test('rodriguesRotate satisfies composition and inverse identities', () => {
	const v = [1.2, -3.4, 5.6]
	const axis = [-4, 2, 1]
	const a = 0.7
	const b = 1.1

	const seq = rodriguesRotate(rodriguesRotate(v, axis, a), axis, b)
	const combined = rodriguesRotate(v, axis, a + b)
	assertVecClose(seq, combined)

	const inverted = rodriguesRotate(rodriguesRotate(v, axis, a), axis, -a)
	assertVecClose(inverted, v)

	const fullTurn = rodriguesRotate(v, axis, 2 * Math.PI)
	assertVecClose(fullTurn, v)
})

test('rodriguesRotate handles boundary cases (parallel vector, zero vector, zero angle)', () => {
	assertVecClose(rodriguesRotate([2, -4, 6], [1, -2, 3], 1.5), [2, -4, 6])
	assertVecClose(rodriguesRotate([0, 0, 0], [1, 2, 3], 0.9), [0, 0, 0])
	assertVecClose(rodriguesRotate([7, -8, 9], [1, 1, 1], 0), [7, -8, 9])
})

test('rodriguesRotate throws on zero axis or invalid arguments', () => {
	assert.throws(() => rodriguesRotate([1, 0, 0], [0, 0, 0], Math.PI / 2), RangeError)
	assert.throws(() => rodriguesRotate([1, 0], [0, 0, 1], Math.PI / 2), TypeError)
	assert.throws(() => rodriguesRotate([1, 0, 0], [0, 0, NaN], Math.PI / 2), TypeError)
	assert.throws(() => rodriguesRotate([1, 0, 0], [0, 0, 1], Infinity), TypeError)
})
