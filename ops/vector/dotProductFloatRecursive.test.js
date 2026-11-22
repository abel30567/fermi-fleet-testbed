import { describe, test } from 'node:test'
import assert from 'node:assert'
import { dotProductFloatRecursive } from './dotProductFloatRecursive.js'

/**
 * Independent iterative reference dot product for cross-checking.
 */
function referenceDotIterative(a, b) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible test vectors.
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function assertApproxEqual(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(Math.abs(actual), Math.abs(expected), 1)
	assert.ok(
		diff <= Math.max(absTol, relTol * scale),
		`Expected ${actual} to be within tol of ${expected} (diff=${diff})`,
	)
}

describe('dotProductFloatRecursive', () => {
	test('computes dot product for normal vectors', () => {
		assert.strictEqual(dotProductFloatRecursive([1, 2, 3], [4, 5, 6]), 32)
		assert.strictEqual(
			dotProductFloatRecursive([-1, 2, -3, 4], [5, -6, 7, -8]),
			-70,
		)
		assertApproxEqual(
			dotProductFloatRecursive([0.5, -1.25, 3.75], [2.0, 4.0, -0.5]),
			0.5 * 2.0 + -1.25 * 4.0 + 3.75 * -0.5,
		)
	})

	test('handles empty vectors', () => {
		assert.strictEqual(dotProductFloatRecursive([], []), 0)
	})

	test('handles single-element vectors', () => {
		assert.strictEqual(dotProductFloatRecursive([3.5], [-2]), -7)
		assert.strictEqual(dotProductFloatRecursive([0], [42.125]), 0)
	})

	test('handles orthogonal and zero vectors', () => {
		assert.strictEqual(dotProductFloatRecursive([1, 0, 0], [0, 1, 0]), 0)
		assert.strictEqual(dotProductFloatRecursive([3, -4, 5], [4, 3, 0]), 0)
		assert.strictEqual(
			dotProductFloatRecursive([0, 0, 0, 0], [9.5, -3.2, 1e10, -1e-10]),
			0,
		)
	})

	test('handles odd, even, prime, and power-of-two lengths', () => {
		const rng = makeRng(42)
		for (const len of [2, 3, 4, 5, 7, 8, 13, 16, 31, 64, 100]) {
			const a = Array.from({ length: len }, () => (rng() - 0.5) * 20)
			const b = Array.from({ length: len }, () => (rng() - 0.5) * 20)
			const actual = dotProductFloatRecursive(a, b)
			const expected = referenceDotIterative(a, b)
			assertApproxEqual(actual, expected, 1e-13, 1e-13)
		}
	})

	test('handles large vectors without stack overflow and preserves pairwise accuracy', () => {
		const n = 100_000
		const a = new Array(n).fill(0.1)
		const b = new Array(n).fill(1.0)
		const result = dotProductFloatRecursive(a, b)
		const iterative = referenceDotIterative(a, b)
		const exact = 10_000

		const recursiveErr = Math.abs(result - exact)
		const iterativeErr = Math.abs(iterative - exact)
		assert.ok(
			recursiveErr < 1e-9,
			`Expected small error on large vector, got ${recursiveErr}`,
		)
		assert.ok(
			recursiveErr <= iterativeErr,
			`Expected pairwise error (${recursiveErr}) <= iterative error (${iterativeErr})`,
		)
	})

	test('satisfies algebraic identities (commutativity, distributivity, scaling, Cauchy-Schwarz)', () => {
		const rng = makeRng(2026)
		const n = 257
		const a = Array.from({ length: n }, () => (rng() - 0.5) * 10)
		const b = Array.from({ length: n }, () => (rng() - 0.5) * 10)
		const c = Array.from({ length: n }, () => (rng() - 0.5) * 10)
		const bPlusC = b.map((v, i) => v + c[i])
		const alpha = -3.75
		const scaledA = a.map((v) => alpha * v)

		// Commutativity: a · b === b · a
		const ab = dotProductFloatRecursive(a, b)
		const ba = dotProductFloatRecursive(b, a)
		assert.strictEqual(ab, ba)

		// Distributivity: a · (b + c) == a · b + a · c
		const lhsDist = dotProductFloatRecursive(a, bPlusC)
		const rhsDist = ab + dotProductFloatRecursive(a, c)
		assertApproxEqual(lhsDist, rhsDist, 1e-12, 1e-12)

		// Scalar homogeneity: (alpha * a) · b == alpha * (a · b)
		const lhsScale = dotProductFloatRecursive(scaledA, b)
		const rhsScale = alpha * ab
		assertApproxEqual(lhsScale, rhsScale, 1e-12, 1e-12)

		// Positive-definiteness and Cauchy-Schwarz: |a · b| <= ||a|| * ||b||
		const aa = dotProductFloatRecursive(a, a)
		const bb = dotProductFloatRecursive(b, b)
		assert.ok(aa > 0)
		assert.ok(bb > 0)
		assert.ok(Math.abs(ab) <= Math.sqrt(aa) * Math.sqrt(bb) + 1e-12)
	})

	test('throws TypeError for non-array inputs', () => {
		for (const bad of [null, undefined, 42, '123', {}, new Float64Array([1])]) {
			assert.throws(() => dotProductFloatRecursive(bad, [1]), TypeError)
			assert.throws(() => dotProductFloatRecursive([1], bad), TypeError)
		}
	})

	test('throws RangeError for mismatched vector lengths', () => {
		assert.throws(() => dotProductFloatRecursive([1, 2], [1, 2, 3]), RangeError)
		assert.throws(() => dotProductFloatRecursive([], [1]), RangeError)
		assert.throws(() => dotProductFloatRecursive([1], []), RangeError)
	})

	test('throws TypeError for non-number elements and sparse arrays', () => {
		assert.throws(() => dotProductFloatRecursive([1, '2'], [3, 4]), TypeError)
		assert.throws(() => dotProductFloatRecursive([1, 2], [3, null]), TypeError)
		assert.throws(
			() => dotProductFloatRecursive([undefined], [1]),
			TypeError,
		)
		assert.throws(() => dotProductFloatRecursive([true], [1]), TypeError)
		assert.throws(() => dotProductFloatRecursive([1n], [1]), TypeError)

		const sparse = new Array(3)
		sparse[0] = 1
		sparse[2] = 3
		assert.throws(() => dotProductFloatRecursive(sparse, [1, 2, 3]), TypeError)
	})

	test('throws RangeError for NaN and infinite elements', () => {
		assert.throws(() => dotProductFloatRecursive([1, NaN], [2, 3]), RangeError)
		assert.throws(() => dotProductFloatRecursive([1, 2], [NaN, 3]), RangeError)
		assert.throws(
			() => dotProductFloatRecursive([Infinity, 1], [1, 1]),
			RangeError,
		)
		assert.throws(
			() => dotProductFloatRecursive([1, 1], [1, -Infinity]),
			RangeError,
		)
	})
})
