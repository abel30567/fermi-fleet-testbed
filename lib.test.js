import { test } from 'node:test'
import assert from 'node:assert'
import { add, vecProject } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('vecProject computes orthogonal projection in 2D and 3D', () => {
	assertVecClose(vecProject([3, 4], [1, 0]), [3, 0])
	assertVecClose(vecProject([3, 4], [0, 5]), [0, 4])
	assertVecClose(vecProject([1, 2, 3], [1, 1, 1]), [2, 2, 2])
	assertVecClose(vecProject([2, -1], [1, 1]), [0.5, 0.5])
})

test('vecProject returns zero vector for orthogonal vectors', () => {
	assert.deepEqual(vecProject([1, 0], [0, 1]), [0, 0])
	assert.deepEqual(vecProject([2, -3, 1], [1, 1, 1]), [0, 0, 0])
})

test('vecProject preserves parallel and anti-parallel vectors', () => {
	assertVecClose(vecProject([6, -9, 3], [2, -3, 1]), [6, -9, 3])
	assertVecClose(vecProject([-4, -6], [2, 3]), [-4, -6])
})

test('vecProject satisfies idempotence, residual orthogonality, and scale invariance', () => {
	const u = [3.5, -2.25, 7.1, 0.4]
	const v = [-1.5, 4.0, 2.5, -3.0]
	const p = vecProject(u, v)

	assertVecClose(vecProject(p, v), p)

	const residualDotV = u.reduce((sum, ui, i) => sum + (ui - p[i]) * v[i], 0)
	assert.ok(Math.abs(residualDotV) <= 1e-12)

	assertVecClose(vecProject(u, v.map((x) => x * 3.7)), p)
	assertVecClose(vecProject(u, v.map((x) => x * -0.25)), p)
})

test('vecProject satisfies linearity in u', () => {
	const u1 = [1, -2, 3]
	const u2 = [4, 5, -6]
	const v = [2, 1, -2]
	const a = 2.5
	const b = -1.5

	const combined = u1.map((x, i) => a * x + b * u2[i])
	const lhs = vecProject(combined, v)
	const p1 = vecProject(u1, v)
	const p2 = vecProject(u2, v)
	const rhs = p1.map((x, i) => a * x + b * p2[i])

	assertVecClose(lhs, rhs)
})

test('vecProject handles boundary cases (zero u, 1D vectors)', () => {
	assert.deepEqual(vecProject([0, 0, 0], [-2, 3, -4]), [0, 0, 0])
	const res = vecProject([0, 0], [-1, 2])
	assert.ok(Object.is(res[0], 0) && Object.is(res[1], 0))
	assertVecClose(vecProject([5], [-2]), [5])
})

test('vecProject throws on zero v or invalid inputs', () => {
	assert.throws(() => vecProject([1, 2], [0, 0]), /zero/i)
	assert.throws(() => vecProject([0, 0, 0], [0, 0, 0]), /zero/i)
	assert.throws(() => vecProject([1, 2], [1, 2, 3]), RangeError)
	assert.throws(() => vecProject([], []), RangeError)
	assert.throws(() => vecProject('not-array', [1, 2]), TypeError)
	assert.throws(() => vecProject([1, NaN], [1, 2]), TypeError)
})
