import { test } from 'node:test'
import assert from 'node:assert'
import { add, gramSchmidt } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function dot(a, b) {
	return a.reduce((sum, x, i) => sum + x * b[i], 0)
}

function assertClose(actual, expected, tol = 1e-10) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected}`
	)
}

test('gramSchmidt orthonormalizes standard 2D and 3D bases', () => {
	const q2 = gramSchmidt([
		[3, 1],
		[2, 2],
	])
	assert.equal(q2.length, 2)
	const s10 = Math.sqrt(10)
	assertClose(q2[0][0], 3 / s10)
	assertClose(q2[0][1], 1 / s10)
	assertClose(q2[1][0], -1 / s10)
	assertClose(q2[1][1], 3 / s10)

	const q3 = gramSchmidt([
		[1, 1, 0],
		[1, 0, 1],
		[0, 1, 1],
	])
	assert.equal(q3.length, 3)
	for (let i = 0; i < q3.length; i++) {
		for (let j = 0; j < q3.length; j++) {
			assertClose(dot(q3[i], q3[j]), i === j ? 1 : 0)
		}
	}
})

test('gramSchmidt preserves mathematical identities (orthonormality and span)', () => {
	const input = [
		[1, 2, 3, 4],
		[2, -1, 0, 1],
		[-1, 3, 2, -2],
	]
	const snapshot = input.map((v) => v.slice())
	const q = gramSchmidt(input)

	// Input is not mutated
	assert.deepEqual(input, snapshot)
	assert.equal(q.length, 3)

	// Orthonormality: q_i . q_j == delta_ij
	for (let i = 0; i < q.length; i++) {
		for (let j = 0; j < q.length; j++) {
			assertClose(dot(q[i], q[j]), i === j ? 1 : 0)
		}
	}

	// Span preservation & upper-triangular projection: v_i = sum_{j <= i} (v_i . q_j) q_j, with (v_i . q_i) > 0
	for (let i = 0; i < input.length; i++) {
		assert.ok(dot(input[i], q[i]) > 0)
		for (let j = i + 1; j < q.length; j++) {
			assertClose(dot(input[i], q[j]), 0)
		}
		const reconstructed = new Array(input[i].length).fill(0)
		for (let j = 0; j <= i; j++) {
			const coeff = dot(input[i], q[j])
			for (let k = 0; k < reconstructed.length; k++) {
				reconstructed[k] += coeff * q[j][k]
			}
		}
		for (let k = 0; k < reconstructed.length; k++) {
			assertClose(reconstructed[k], input[i][k])
		}
	}
})

test('gramSchmidt leaves an already orthonormal basis unchanged', () => {
	const identity = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]
	const result = gramSchmidt(identity)
	assert.deepEqual(result, identity)
})

test('gramSchmidt maintains orthogonality on ill-conditioned nearly collinear vectors', () => {
	const eps = 1e-7
	const vectors = [
		[1, eps, 0],
		[1, 0, eps],
		[1, 0, 0],
	]
	const q = gramSchmidt(vectors)
	assert.equal(q.length, 3)
	for (let i = 0; i < q.length; i++) {
		for (let j = 0; j < q.length; j++) {
			assertClose(dot(q[i], q[j]), i === j ? 1 : 0, 1e-8)
		}
	}
})

test('gramSchmidt handles empty list and single vector boundary cases', () => {
	assert.deepEqual(gramSchmidt([]), [])
	const single = gramSchmidt([[-5]])
	assert.deepEqual(single, [[-1]])
	const singleR3 = gramSchmidt([[0, 3, 4]])
	assertClose(singleR3[0][0], 0)
	assertClose(singleR3[0][1], 0.6)
	assertClose(singleR3[0][2], 0.8)
})

test('gramSchmidt rejects dependent, zero, mismatched, or invalid inputs', () => {
	assert.throws(() => gramSchmidt([[0, 0, 0]]), RangeError)
	assert.throws(
		() =>
			gramSchmidt([
				[1, 2],
				[2, 4],
			]),
		RangeError
	)
	assert.throws(
		() =>
			gramSchmidt([
				[1, 0],
				[0, 1],
				[1, 1],
			]),
		RangeError
	)
	assert.throws(
		() =>
			gramSchmidt([
				[1, 2],
				[1, 2, 3],
			]),
		RangeError
	)
	assert.throws(() => gramSchmidt('not-an-array'), TypeError)
	assert.throws(() => gramSchmidt([[1, NaN]]), TypeError)
	assert.throws(() => gramSchmidt([[]]), TypeError)
})
