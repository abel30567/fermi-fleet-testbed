import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { crossProductTypedMemo } from './crossProductTypedMemo.js'

function dot3(a, b, offset = 0) {
	return (
		a[offset] * b[offset] +
		a[offset + 1] * b[offset + 1] +
		a[offset + 2] * b[offset + 2]
	)
}

function normSq3(v, offset = 0) {
	return dot3(v, v, offset)
}

function assertClose(actual, expected, eps = 1e-10) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`Expected ${actual} to be within ${eps} of ${expected}`
	)
}

describe('crossProductTypedMemo', () => {
	beforeEach(() => {
		crossProductTypedMemo.clearCache()
	})

	it('computes right-handed basis vector cross products', () => {
		const i = new Float64Array([1, 0, 0])
		const j = new Float64Array([0, 1, 0])
		const k = new Float64Array([0, 0, 1])

		assert.deepStrictEqual(crossProductTypedMemo(i, j), new Float64Array([0, 0, 1]))
		assert.deepStrictEqual(crossProductTypedMemo(j, k), new Float64Array([1, 0, 0]))
		assert.deepStrictEqual(crossProductTypedMemo(k, i), new Float64Array([0, 1, 0]))
		assert.deepStrictEqual(crossProductTypedMemo(j, i), new Float64Array([0, 0, -1]))
		assert.deepStrictEqual(crossProductTypedMemo(k, j), new Float64Array([-1, 0, 0]))
		assert.deepStrictEqual(crossProductTypedMemo(i, k), new Float64Array([0, -1, 0]))
	})

	it('computes general 3D vector cross products accurately', () => {
		const a = new Float64Array([2, 3, 4])
		const b = new Float64Array([5, 6, 7])
		const out = crossProductTypedMemo(a, b)

		assert.ok(out instanceof Float64Array)
		assert.deepStrictEqual(out, new Float64Array([-3, 6, -3]))

		const c = new Float64Array([-1.5, 2.25, -4])
		const d = new Float64Array([3, -0.5, 2])
		assert.deepStrictEqual(
			crossProductTypedMemo(c, d),
			new Float64Array([2.5, -9, -6])
		)
	})

	it('supports packed batches of multiple 3D vectors', () => {
		const a = new Float64Array([1, 0, 0, 2, 3, 4, 0, 1, 0])
		const b = new Float64Array([0, 1, 0, 5, 6, 7, 0, 0, 1])
		const out = crossProductTypedMemo(a, b)

		assert.ok(out instanceof Float64Array)
		assert.strictEqual(out.length, 9)
		assert.deepStrictEqual(
			out,
			new Float64Array([0, 0, 1, -3, 6, -3, 1, 0, 0])
		)
	})

	it('returns zero vector for parallel, anti-parallel, and zero vectors without -0', () => {
		const a = new Float64Array([3, -6, 9])
		const parallel = new Float64Array([1, -2, 3])
		const antiParallel = new Float64Array([-6, 12, -18])
		const zero = new Float64Array([0, 0, 0])
		const negZero = new Float64Array([-0, -0, -0])

		for (const res of [
			crossProductTypedMemo(a, a),
			crossProductTypedMemo(a, parallel),
			crossProductTypedMemo(a, antiParallel),
			crossProductTypedMemo(a, zero),
			crossProductTypedMemo(zero, a),
			crossProductTypedMemo(negZero, a),
		]) {
			assert.deepStrictEqual(res, new Float64Array([0, 0, 0]))
			for (let idx = 0; idx < 3; idx++) {
				assert.ok(Object.is(res[idx], 0), 'Output component should be +0, not -0')
			}
		}
	})

	it('does not mutate input arrays', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([4, 5, 6])
		crossProductTypedMemo(a, b)
		assert.deepStrictEqual(a, new Float64Array([1, 2, 3]))
		assert.deepStrictEqual(b, new Float64Array([4, 5, 6]))
	})

	it('throws TypeError for invalid input types', () => {
		const valid = new Float64Array([1, 2, 3])
		const invalidInputs = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			null,
			undefined,
			'123',
			42,
			{ 0: 1, 1: 2, 2: 3, length: 3 },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => crossProductTypedMemo(bad, valid), TypeError)
			assert.throws(() => crossProductTypedMemo(valid, bad), TypeError)
		}
	})

	it('throws RangeError for empty, non-multiple-of-3, mismatched, or non-finite inputs', () => {
		assert.throws(
			() => crossProductTypedMemo(new Float64Array(0), new Float64Array(0)),
			RangeError
		)
		for (const len of [1, 2, 4, 5, 7]) {
			assert.throws(
				() => crossProductTypedMemo(new Float64Array(len), new Float64Array(len)),
				RangeError
			)
		}
		assert.throws(
			() => crossProductTypedMemo(new Float64Array(3), new Float64Array(6)),
			RangeError
		)
		for (const badVal of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			assert.throws(
				() =>
					crossProductTypedMemo(
						new Float64Array([1, badVal, 3]),
						new Float64Array([4, 5, 6])
					),
				RangeError
			)
			assert.throws(
				() =>
					crossProductTypedMemo(
						new Float64Array([1, 2, 3]),
						new Float64Array([4, 5, badVal])
					),
				RangeError
			)
		}
	})

	it('memoizes repeated vector pairs and isolates cached entries from caller mutation', () => {
		const a1 = new Float64Array([1, 4, -2])
		const b1 = new Float64Array([3, -1, 5])

		const first = crossProductTypedMemo(a1, b1)
		assert.deepStrictEqual(crossProductTypedMemo.getCacheStats(), {
			size: 1,
			maxSize: 1024,
			hits: 0,
			misses: 1,
		})

		// Mutate returned array to verify cache isolation
		first[0] = 999
		first[1] = 999
		first[2] = 999

		// Distinct Float64Array instances with same values should hit cache and return uncorrupted values
		const second = crossProductTypedMemo(
			new Float64Array([1, 4, -2]),
			new Float64Array([3, -1, 5])
		)
		assert.deepStrictEqual(second, new Float64Array([18, -11, -13]))
		assert.deepStrictEqual(crossProductTypedMemo.getCacheStats(), {
			size: 1,
			maxSize: 1024,
			hits: 1,
			misses: 1,
		})

		// Repeated triples inside a single packed batch also trigger memo hits
		const batchA = new Float64Array([1, 4, -2, 1, 4, -2])
		const batchB = new Float64Array([3, -1, 5, 3, -1, 5])
		const batchOut = crossProductTypedMemo(batchA, batchB)
		assert.deepStrictEqual(
			batchOut,
			new Float64Array([18, -11, -13, 18, -11, -13])
		)
		assert.strictEqual(crossProductTypedMemo.getCacheStats().hits, 3)
	})

	it('bounds memoization cache size via LRU eviction', () => {
		const { maxSize } = crossProductTypedMemo.getCacheStats()
		const b = new Float64Array([0, 1, 0])

		for (let i = 0; i < maxSize + 25; i++) {
			crossProductTypedMemo(new Float64Array([i, 0, 0]), b)
		}

		const stats = crossProductTypedMemo.getCacheStats()
		assert.strictEqual(stats.size, maxSize)
		assert.strictEqual(stats.misses, maxSize + 25)
	})

	it('satisfies algebraic cross-checks: orthogonality, anti-commutativity, Lagrange, and Jacobi identities', () => {
		const vectors = [
			new Float64Array([1.2, -3.4, 5.6]),
			new Float64Array([-7.8, 2.1, -0.9]),
			new Float64Array([4.5, 6.7, -8.9]),
			new Float64Array([-0.25, -1.75, 3.125]),
		]

		for (let p = 0; p < vectors.length; p++) {
			for (let q = 0; q < vectors.length; q++) {
				const a = vectors[p]
				const b = vectors[q]
				const ab = crossProductTypedMemo(a, b)
				const ba = crossProductTypedMemo(b, a)

				// Orthogonality: (a × b) · a === 0 and (a × b) · b === 0
				assertClose(dot3(ab, a), 0, 1e-11)
				assertClose(dot3(ab, b), 0, 1e-11)

				// Anti-commutativity: a × b === -(b × a)
				for (let idx = 0; idx < 3; idx++) {
					assertClose(ab[idx], -ba[idx], 1e-12)
				}

				// Lagrange's identity: |a × b|^2 === |a|^2 |b|^2 - (a · b)^2
				const lhs = normSq3(ab)
				const abDot = dot3(a, b)
				const rhs = normSq3(a) * normSq3(b) - abDot * abDot
				assertClose(lhs, rhs, 1e-9)
			}
		}

		// Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) === 0
		const [a, b, c] = vectors
		const t1 = crossProductTypedMemo(a, crossProductTypedMemo(b, c))
		const t2 = crossProductTypedMemo(b, crossProductTypedMemo(c, a))
		const t3 = crossProductTypedMemo(c, crossProductTypedMemo(a, b))
		for (let idx = 0; idx < 3; idx++) {
			assertClose(t1[idx] + t2[idx] + t3[idx], 0, 1e-10)
		}
	})
})
