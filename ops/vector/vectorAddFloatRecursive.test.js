import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddFloatRecursive } from './vectorAddFloatRecursive.js'

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check tests.
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Independent iterative Float64Array reference implementation for cross-checking.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function referenceVectorAdd(a, b) {
	const fa = Float64Array.from(a)
	const fb = Float64Array.from(b)
	const out = new Float64Array(fa.length)
	for (let i = 0; i < fa.length; i += 1) {
		out[i] = fa[i] + fb[i]
	}
	return Array.from(out)
}

describe('vectorAddFloatRecursive', () => {
	test('adds standard float64 vectors of various lengths', () => {
		assert.deepEqual(vectorAddFloatRecursive([1.5, -2.25, 3.75], [0.5, 2.25, -1.25]), [2, 0, 2.5])
		assert.deepEqual(vectorAddFloatRecursive([42.5], [-2.5]), [40])
		assert.deepEqual(
			vectorAddFloatRecursive([1, 2, 3, 4, 5, 6, 7], [7, 6, 5, 4, 3, 2, 1]),
			[8, 8, 8, 8, 8, 8, 8],
		)
	})

	test('does not mutate input arrays', () => {
		const a = [1.1, 2.2, 3.3, 4.4]
		const b = [5.5, 6.6, 7.7, 8.8]
		const aSnap = [...a]
		const bSnap = [...b]

		const res = vectorAddFloatRecursive(a, b)
		assert.deepEqual(a, aSnap)
		assert.deepEqual(b, bSnap)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	test('handles empty vectors', () => {
		assert.deepEqual(vectorAddFloatRecursive([], []), [])
	})

	test('preserves IEEE-754 float64 semantics (signed zero, subnormals, Infinity, NaN)', () => {
		const zeros = vectorAddFloatRecursive([-0, -0, 0], [-0, 0, -0])
		assert.equal(Object.is(zeros[0], -0), true)
		assert.equal(Object.is(zeros[1], 0), true)
		assert.equal(Object.is(zeros[2], 0), true)

		const specials = vectorAddFloatRecursive(
			[Infinity, -Infinity, Infinity, Number.MAX_VALUE, NaN, 1],
			[1, -1, -Infinity, Number.MAX_VALUE, 1, NaN],
		)
		assert.equal(specials[0], Infinity)
		assert.equal(specials[1], -Infinity)
		assert.equal(Number.isNaN(specials[2]), true)
		assert.equal(specials[3], Infinity)
		assert.equal(Number.isNaN(specials[4]), true)
		assert.equal(Number.isNaN(specials[5]), true)

		const precise = vectorAddFloatRecursive(
			[0.1, Number.MIN_VALUE, 1],
			[0.2, Number.MIN_VALUE, Number.EPSILON],
		)
		assert.equal(precise[0], 0.1 + 0.2)
		assert.equal(precise[1], Number.MIN_VALUE + Number.MIN_VALUE)
		assert.equal(precise[2], 1 + Number.EPSILON)
	})

	test('handles large vectors without stack overflow (O(log n) recursion depth)', () => {
		const n = 50_000
		const a = new Array(n)
		const b = new Array(n)
		for (let i = 0; i < n; i += 1) {
			a[i] = i * 0.25
			b[i] = (n - i) * 0.25
		}

		const res = vectorAddFloatRecursive(a, b)
		assert.equal(res.length, n)
		for (let i = 0; i < n; i += 1) {
			assert.equal(res[i], n * 0.25)
		}
	})

	test('validates input types, lengths, and element types', () => {
		assert.throws(() => vectorAddFloatRecursive(null, []), TypeError)
		assert.throws(() => vectorAddFloatRecursive([], undefined), TypeError)
		assert.throws(() => vectorAddFloatRecursive('123', '456'), TypeError)
		assert.throws(() => vectorAddFloatRecursive({ 0: 1, length: 1 }, [1]), TypeError)

		assert.throws(() => vectorAddFloatRecursive([1, 2], [1]), RangeError)
		assert.throws(() => vectorAddFloatRecursive([], [0]), RangeError)

		assert.throws(() => vectorAddFloatRecursive([1, '2'], [1, 2]), TypeError)
		assert.throws(() => vectorAddFloatRecursive([1, 2], [1, null]), TypeError)
		assert.throws(() => vectorAddFloatRecursive([1n], [1]), TypeError)
		assert.throws(() => vectorAddFloatRecursive([true], [1]), TypeError)

		const sparse = new Array(3)
		sparse[0] = 1
		sparse[2] = 3
		assert.throws(() => vectorAddFloatRecursive(sparse, [1, 2, 3]), TypeError)
	})

	test('cross-checks against independent iterative Float64Array reference and algebraic laws', () => {
		const rng = createRng(0x20261123)
		const lengths = [1, 2, 3, 4, 5, 7, 8, 13, 16, 31, 64, 127, 256, 1009]

		for (const len of lengths) {
			const a = Array.from({ length: len }, () => (rng() - 0.5) * 1e6)
			const b = Array.from({ length: len }, () => (rng() - 0.5) * 1e6)
			const zeros = new Array(len).fill(0)
			const negA = a.map((x) => -x)

			const actual = vectorAddFloatRecursive(a, b)
			const expected = referenceVectorAdd(a, b)

			assert.equal(actual.length, expected.length)
			for (let i = 0; i < len; i += 1) {
				assert.equal(Object.is(actual[i], expected[i]), true)
			}

			// Commutativity: a + b === b + a
			assert.deepEqual(actual, vectorAddFloatRecursive(b, a))
			// Additive identity: a + 0 === a
			assert.deepEqual(vectorAddFloatRecursive(a, zeros), a)
			// Additive inverse: a + (-a) === 0
			assert.deepEqual(vectorAddFloatRecursive(a, negA), zeros)
		}
	})
})
