import { test } from 'node:test'
import assert from 'node:assert'
import { add, rotate3DY } from './lib.js'

const assertVecClose = (actual, expected, eps = 1e-12) => {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('rotate3DY: cardinal rotations around Y axis', () => {
	assertVecClose(rotate3DY([1, 0, 0], Math.PI / 2), [0, 0, -1])
	assertVecClose(rotate3DY([0, 0, 1], Math.PI / 2), [1, 0, 0])
	assertVecClose(rotate3DY([1, 2, 3], Math.PI), [-1, 2, -3])
	assertVecClose(rotate3DY([1, 0, 0], -Math.PI / 2), [0, 0, 1])
})

test('rotate3DY: identity and full-turn rotations without mutating input', () => {
	const v = [3.5, -2.25, 4.75]
	const r0 = rotate3DY(v, 0)
	assert.notStrictEqual(r0, v)
	assert.deepEqual(r0, v)
	assertVecClose(rotate3DY(v, 2 * Math.PI), v)
	assertVecClose(rotate3DY(v, -2 * Math.PI), v)
})

test('rotate3DY: Y-axis vectors are fixed and Y component is invariant', () => {
	assertVecClose(rotate3DY([0, 5, 0], 1.2345), [0, 5, 0])
	assertVecClose(rotate3DY([0, -9.5, 0], -2.7), [0, -9.5, 0])
	const rotated = rotate3DY([3, -7, 4], Math.PI / 3)
	assert.equal(rotated[1], -7)
})

test('rotate3DY: preserves Euclidean norm', () => {
	const v = [2.5, -6.1, 8.3]
	const norm = (u) => Math.hypot(u[0], u[1], u[2])
	for (const angle of [0.3, Math.PI / 6, Math.PI / 4, 2.1, -1.75]) {
		const rotated = rotate3DY(v, angle)
		assert.ok(Math.abs(norm(rotated) - norm(v)) <= 1e-12)
	}
})

test('rotate3DY: satisfies composition and inverse identities', () => {
	const v = [4, -1.5, 2.5]
	const a = 0.7
	const b = 1.15
	assertVecClose(rotate3DY(rotate3DY(v, a), b), rotate3DY(v, a + b))
	assertVecClose(rotate3DY(rotate3DY(v, a), -a), v)
})

test('rotate3DY: zero vector and invalid input edge cases', () => {
	assertVecClose(rotate3DY([0, 0, 0], 1.23), [0, 0, 0])
	assert.throws(() => rotate3DY([1, 2], 0.5), TypeError)
	assert.throws(() => rotate3DY([1, 2, 3, 4], 0.5), TypeError)
	assert.throws(() => rotate3DY('123', 0.5), TypeError)
	assert.throws(() => rotate3DY([1, '2', 3], 0.5), TypeError)
	assert.throws(() => rotate3DY([1, 2, 3], '0.5'), TypeError)
})
