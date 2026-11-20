import { test } from 'node:test'
import assert from 'node:assert'
import { add, rotate3DX } from './lib.js'

const assertVecClose = (actual, expected, eps = 1e-12) => {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`component ${i}: expected ${expected[i]}, got ${actual[i]}`,
		)
	}
}

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('rotate3DX rotates basis vectors by 90 degrees around X axis', () => {
	assertVecClose(rotate3DX([0, 1, 0], Math.PI / 2), [0, 0, 1])
	assertVecClose(rotate3DX([0, 0, 1], Math.PI / 2), [0, -1, 0])
	assertVecClose(rotate3DX([1, 0, 0], Math.PI / 2), [1, 0, 0])
})

test('rotate3DX handles 0, PI, and 2*PI rotations', () => {
	const v = [2, -3, 4]
	assertVecClose(rotate3DX(v, 0), [2, -3, 4])
	assertVecClose(rotate3DX(v, Math.PI), [2, 3, -4])
	assertVecClose(rotate3DX(v, 2 * Math.PI), [2, -3, 4])
})

test('rotate3DX rotates general 3D vector by arbitrary and negative angles', () => {
	const v = [3, 4, 5]
	const angle = Math.PI / 3
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	assertVecClose(rotate3DX(v, angle), [3, 4 * cos - 5 * sin, 4 * sin + 5 * cos])
	assertVecClose(rotate3DX([0, 1, 0], -Math.PI / 2), [0, 0, -1])
})

test('rotate3DX satisfies norm preservation, composition, and inverse identities', () => {
	const v = [1.5, -2.5, 3.25]
	const a = 0.7
	const b = -1.3

	const rotated = rotate3DX(v, a)
	const normSq = ([x, y, z]) => x * x + y * y + z * z
	assert.ok(Math.abs(normSq(rotated) - normSq(v)) < 1e-12)
	assert.equal(rotated[0], v[0])

	const composed = rotate3DX(rotate3DX(v, a), b)
	assertVecClose(composed, rotate3DX(v, a + b))

	const undone = rotate3DX(rotated, -a)
	assertVecClose(undone, v)
})

test('rotate3DX handles boundary vectors and does not mutate input', () => {
	assertVecClose(rotate3DX([0, 0, 0], 1.234), [0, 0, 0])
	assertVecClose(rotate3DX([-7, 0, 0], 2.5), [-7, 0, 0])

	const input = [1, 2, 3]
	const result = rotate3DX(input, Math.PI / 4)
	assert.deepStrictEqual(input, [1, 2, 3])
	assert.notStrictEqual(result, input)
})

test('rotate3DX rejects invalid inputs', () => {
	assert.throws(() => rotate3DX([1, 2], Math.PI), TypeError)
	assert.throws(() => rotate3DX([1, 2, 3, 4], Math.PI), TypeError)
	assert.throws(() => rotate3DX('not-a-vec', Math.PI), TypeError)
	assert.throws(() => rotate3DX([1, NaN, 3], 0), TypeError)
	assert.throws(() => rotate3DX([1, Infinity, 3], 0), TypeError)
	assert.throws(() => rotate3DX([1, 2, 3], NaN), TypeError)
	assert.throws(() => rotate3DX([1, 2, 3], Infinity), TypeError)
	assert.throws(() => rotate3DX([1, 2, 3], '0'), TypeError)
})
