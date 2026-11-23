import { describe, test } from 'node:test'
import assert from 'node:assert'
import { dotProductFloatMemo } from './dotProductFloatMemo.js'

/**
 * Independent naive reference dot product for cross-checking.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
function referenceDotProduct(a, b) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum === 0 ? 0 : sum
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible randomized cross-checks.
 * @param {number} seed
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

describe('dotProductFloatMemo', () => {
	test('computes standard integer dot products using precomputed table', () => {
		assert.strictEqual(dotProductFloatMemo([1, 2, 3], [4, 5, 6]), 32)
		assert.strictEqual(dotProductFloatMemo([-3, 4, -5], [6, -7, 8]), -18 - 28 - 40)
		assert.strictEqual(dotProductFloatMemo([7], [-9]), -63)
	})

	test('computes float64 dot products accurately', () => {
		const res = dotProductFloatMemo([0.5, -1.25, 3.5], [2.0, 4.0, -0.5])
		assert.strictEqual(res, 1 - 5 - 1.75)

		const piDot = dotProductFloatMemo([Math.PI, Math.E], [2, -1])
		assert.ok(Math.abs(piDot - (2 * Math.PI - Math.E)) < 1e-15)
	})

	test('supports Float64Array and mixed Array/Float64Array inputs', () => {
		const a = new Float64Array([1.5, -2.5, 4.0])
		const b = new Float64Array([2.0, 3.0, -0.5])
		assert.strictEqual(dotProductFloatMemo(a, b), -6.5)
		assert.strictEqual(dotProductFloatMemo(a, [2.0, 3.0, -0.5]), -6.5)
		assert.strictEqual(dotProductFloatMemo([1.5, -2.5, 4.0], b), -6.5)
	})

	test('handles empty, zero, orthogonal, and negative-zero edge cases', () => {
		assert.strictEqual(dotProductFloatMemo([], []), 0)
		assert.strictEqual(dotProductFloatMemo(new Float64Array(0), new Float64Array(0)), 0)
		assert.strictEqual(dotProductFloatMemo([0, 0, 0], [5, -10, 3.14]), 0)
		assert.strictEqual(dotProductFloatMemo([1, 0, 0], [0, 1, 0]), 0)
		assert.strictEqual(dotProductFloatMemo([2, -3], [3, 2]), 0)

		const negZeroResult = dotProductFloatMemo([-0, 0], [1, -1])
		assert.ok(Object.is(negZeroResult, 0))
	})

	test('handles precomputed table boundaries and values just outside table range', () => {
		assert.strictEqual(dotProductFloatMemo([-32, 32], [-32, 32]), 2048)
		assert.strictEqual(dotProductFloatMemo([-32, 32], [32, -32]), -2048)
		assert.strictEqual(dotProductFloatMemo([-33, 33], [33, -33]), -2178)
		assert.strictEqual(dotProductFloatMemo([-32, 33], [32, 33]), -1024 + 1089)
	})

	test('handles subnormals, compensated cancellation, and overflow safely', () => {
		assert.strictEqual(dotProductFloatMemo([Number.MIN_VALUE], [1]), Number.MIN_VALUE)
		assert.strictEqual(dotProductFloatMemo([1e16, 1, -1e16], [1, 1, 1]), 1)
		assert.strictEqual(dotProductFloatMemo([1e308, 1e308], [1, 1]), Infinity)
		assert.strictEqual(dotProductFloatMemo([-1e308, -1e308], [1, 1]), -Infinity)
	})

	test('handles vectors larger than the memoization length threshold', () => {
		const n = 2048
		const a = new Float64Array(n)
		const b = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			a[i] = 1.5
			b[i] = 2.0
		}
		assert.strictEqual(dotProductFloatMemo(a, b), n * 3.0)
	})

	test('memoization is value-based, commutative, mutation-safe, and collision-free', () => {
		const a = [1.25, -3.5, 7.75]
		const b = [-2.0, 4.5, 0.5]
		const expected = referenceDotProduct(a, b)

		// First call populates cache; second call with fresh arrays hits cache.
		assert.strictEqual(dotProductFloatMemo(a, b), expected)
		assert.strictEqual(dotProductFloatMemo([...a], [...b]), expected)

		// Commutative lookup hits the same canonical entry.
		assert.strictEqual(dotProductFloatMemo(b, a), expected)

		// Mutating original array must not return stale cached value.
		a[0] = 100.25
		assert.strictEqual(dotProductFloatMemo(a, b), referenceDotProduct(a, b))

		// Float64 values differing by 1 ULP must not collide in the cache.
		const r1 = dotProductFloatMemo([1, 0], [1, 0])
		const r2 = dotProductFloatMemo([1 + Number.EPSILON, 0], [1, 0])
		assert.strictEqual(r1, 1)
		assert.strictEqual(r2, 1 + Number.EPSILON)
		assert.notStrictEqual(r1, r2)
	})

	test('remains accurate under LRU cache eviction (>1024 distinct entries)', () => {
		for (let i = 1; i <= 1250; i++) {
			const res = dotProductFloatMemo([i, 0.5], [2, 4])
			assert.strictEqual(res, i * 2 + 2)
		}
		// Re-query evicted early entries and recent entries.
		assert.strictEqual(dotProductFloatMemo([1, 0.5], [2, 4]), 4)
		assert.strictEqual(dotProductFloatMemo([1250, 0.5], [2, 4]), 2502)
	})

	test('validates input types, lengths, and finite float64 elements', () => {
		assert.throws(() => dotProductFloatMemo(null, [1]), TypeError)
		assert.throws(() => dotProductFloatMemo([1], undefined), TypeError)
		assert.throws(() => dotProductFloatMemo('123', [1, 2, 3]), TypeError)
		assert.throws(() => dotProductFloatMemo({ length: 1, 0: 1 }, [1]), TypeError)
		assert.throws(() => dotProductFloatMemo(new Int32Array([1, 2]), [1, 2]), TypeError)

		assert.throws(() => dotProductFloatMemo([1, 2], [1, 2, 3]), RangeError)
		assert.throws(() => dotProductFloatMemo([1], []), RangeError)

		assert.throws(() => dotProductFloatMemo([1, '2'], [1, 2]), TypeError)
		assert.throws(() => dotProductFloatMemo([1, 2], [1, null]), TypeError)
		assert.throws(() => dotProductFloatMemo([1n], [1]), TypeError)

		assert.throws(() => dotProductFloatMemo([NaN], [1]), RangeError)
		assert.throws(() => dotProductFloatMemo([1], [Infinity]), RangeError)
		assert.throws(() => dotProductFloatMemo([-Infinity], [1]), RangeError)
	})

	test('independent cross-check: matches naive reference over deterministic random vectors', () => {
		const rand = makeRng(0x5eed1234)
		for (let trial = 0; trial < 100; trial++) {
			const dim = 1 + (trial % 40)
			const a = new Array(dim)
			const b = new Array(dim)
			for (let i = 0; i < dim; i++) {
				// Mix small integers (table path) and arbitrary float64s.
				a[i] = i % 3 === 0 ? Math.floor(rand() * 65) - 32 : (rand() - 0.5) * 200
				b[i] = i % 3 === 0 ? Math.floor(rand() * 65) - 32 : (rand() - 0.5) * 200
			}
			const got = dotProductFloatMemo(a, b)
			const ref = referenceDotProduct(a, b)
			const tol = Math.max(1e-11, Math.abs(ref) * 1e-12)
			assert.ok(
				Math.abs(got - ref) <= tol,
				`trial ${trial} (dim=${dim}): got ${got}, expected ${ref}`
			)
		}
	})

	test('independent cross-check: satisfies bilinearity, norm squared, Cauchy-Schwarz, and 2D angle identity', () => {
		const a = [1.5, -2.25, 3.75, -0.5]
		const b = [-4.0, 1.25, 0.5, 2.5]
		const c = [0.75, 3.0, -1.5, 4.25]
		const alpha = 2.5
		const beta = -1.75

		// Symmetry: a · b === b · a
		assert.strictEqual(dotProductFloatMemo(a, b), dotProductFloatMemo(b, a))

		// Bilinearity: (alpha * a + beta * b) · c === alpha * (a · c) + beta * (b · c)
		const combo = a.map((ai, i) => alpha * ai + beta * b[i])
		const lhs = dotProductFloatMemo(combo, c)
		const rhs = alpha * dotProductFloatMemo(a, c) + beta * dotProductFloatMemo(b, c)
		assert.ok(Math.abs(lhs - rhs) < 1e-12)

		// Norm squared: a · a === ||a||^2
		const normSq = dotProductFloatMemo(a, a)
		const hypotSq = Math.hypot(...a) ** 2
		assert.ok(Math.abs(normSq - hypotSq) < 1e-12)

		// Cauchy-Schwarz: |a · b| <= ||a|| * ||b||
		const ab = Math.abs(dotProductFloatMemo(a, b))
		const bound = Math.sqrt(dotProductFloatMemo(a, a)) * Math.sqrt(dotProductFloatMemo(b, b))
		assert.ok(ab <= bound + 1e-12)

		// 2D geometric angle formula: u · v === ||u|| ||v|| cos(theta)
		const theta = Math.PI / 5
		const r1 = 3.5
		const r2 = 2.25
		const u = [r1, 0]
		const v = [r2 * Math.cos(theta), r2 * Math.sin(theta)]
		assert.ok(Math.abs(dotProductFloatMemo(u, v) - r1 * r2 * Math.cos(theta)) < 1e-12)
	})
})
