import { test } from 'node:test'
import assert from 'node:assert'
import { add, rotate3DZ } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('rotate3DZ rotates basis vectors by 90 and 180 degrees', () => {
	assertVecClose(rotate3DZ([1, 0, 5], Math.PI / 2), [0, 1, 5])
	assertVecClose(rotate3DZ([0, 1, -3], Math.PI / 2), [-1, 0, -3])
	assertVecClose(rotate3DZ([1, 2, 3], Math.PI), [-1, -2, 3])
	assertVecClose(rotate3DZ([1, 0, 2], -Math.PI / 2), [0, -1, 2])
})

test('rotate3DZ preserves vector length and z coordinate', () => {
	const v = [3.5, -4.2, 7.1]
	const rotated = rotate3DZ(v, 1.2345)
	const norm = ([x, y, z]) => Math.hypot(x, y, z)
	assert.ok(Math.abs(norm(rotated) - norm(v)) < 1e-12)
	assert.equal(rotated[2], v[2])
})

test('rotate3DZ satisfies identity, inverse, and composition laws', () => {
	const v = [2, -5, 9]
	assertVecClose(rotate3DZ(v, 0), v)
	assertVecClose(rotate3DZ(v, 2 * Math.PI), v)

	const a = 0.7
	const b = -1.9
	assertVecClose(rotate3DZ(rotate3DZ(v, a), -a), v)
	assertVecClose(rotate3DZ(rotate3DZ(v, a), b), rotate3DZ(v, a + b))
})

test('rotate3DZ leaves z-axis vectors and zero vector invariant', () => {
	assertVecClose(rotate3DZ([0, 0, 0], 1.5), [0, 0, 0])
	assertVecClose(rotate3DZ([0, 0, 42], 2.34), [0, 0, 42])
	assertVecClose(rotate3DZ([0, 0, -10], -0.8), [0, 0, -10])
})

test('rotate3DZ does not mutate input vector and validates arguments', () => {
	const v = [1, 2, 3]
	const out = rotate3DZ(v, Math.PI / 4)
	assert.deepEqual(v, [1, 2, 3])
	assert.notEqual(out, v)
	assert.throws(() => rotate3DZ([1, 2], 0), TypeError)
	assert.throws(() => rotate3DZ('not-a-vec', 0), TypeError)
	assert.throws(() => rotate3DZ([1, 2, 3], Number.NaN), TypeError)
})
