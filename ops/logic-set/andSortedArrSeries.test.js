import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andSortedArrSeries } from './andSortedArrSeries.js'

/**
 * Independent reference implementation using JavaScript Set intersection.
 *
 * @param {...number[]} arrays
 * @returns {number[]}
 */
function setIntersectionRef(...arrays) {
	let current = new Set(arrays[0])
	for (let k = 1; k < arrays.length; k++) {
		const nextSet = new Set(arrays[k])
		const intersected = new Set()
		for (const x of current) {
			if (nextSet.has(x)) {
				intersected.add(x)
			}
		}
		current = intersected
	}
	return Array.from(current).sort((a, b) => a - b)
}

/**
 * Independent reference set union over finite numeric arrays.
 *
 * @param {...number[]} arrays
 * @returns {number[]}
 */
function setUnionRef(...arrays) {
	const u = new Set()
	for (const arr of arrays) {
		for (const x of arr) {
			u.add(x)
		}
	}
	return Array.from(u).sort((a, b) => a - b)
}

/**
 * Independent reference set complement relative to a finite universe U.
 *
 * @param {number[]} universe
 * @param {number[]} subset
 * @returns {number[]}
 */
function setComplementRef(universe, subset) {
	const s = new Set(subset)
	return universe.filter((x) => !s.has(x))
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible randomized property tests.
 *
 * @param {number} seed
 * @returns {() => number}
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

/**
 * Generates a sorted deduplicated array of finite numbers using a PRNG.
 *
 * @param {() => number} rng
 * @param {number} targetLen
 * @param {number} minVal
 * @param {number} maxVal
 * @param {boolean} [fractional=false]
 * @returns {number[]}
 */
function randomSortedSet(rng, targetLen, minVal, maxVal, fractional = false) {
	const set = new Set()
	const span = maxVal - minVal + 1
	const maxAttempts = targetLen * 6 + 20
	for (let i = 0; i < maxAttempts && set.size < targetLen; i++) {
		const raw = minVal + rng() * span
		const val = fractional ? Math.round(raw * 4) / 4 : Math.floor(raw)
		if (val >= minVal && val <= maxVal) {
			set.add(val === 0 ? 0 : val)
		}
	}
	return Array.from(set).sort((a, b) => a - b)
}

describe('andSortedArrSeries - normal cases', () => {
	it('computes intersection of two sorted deduplicated arrays', () => {
		assert.deepStrictEqual(andSortedArrSeries([1, 2, 3, 4, 5], [2, 4, 6, 8]), [2, 4])
		assert.deepStrictEqual(andSortedArrSeries([1, 3, 5], [2, 4, 6]), [])
		assert.deepStrictEqual(andSortedArrSeries([1, 2, 3], [1, 2, 3]), [1, 2, 3])
	})

	it('handles boundary-touching and disjoint intervals in closed form', () => {
		assert.deepStrictEqual(andSortedArrSeries([1, 2, 3], [3, 4, 5]), [3])
		assert.deepStrictEqual(andSortedArrSeries([3, 4, 5], [1, 2, 3]), [3])
		assert.deepStrictEqual(andSortedArrSeries([1, 2, 3], [10, 20, 30]), [])
		assert.deepStrictEqual(andSortedArrSeries([10, 20, 30], [1, 2, 3]), [])
	})

	it('handles negative, floating-point, and extreme finite numbers', () => {
		const a = [-Number.MAX_VALUE, Number.MIN_SAFE_INTEGER, -10.5, -0.25, 0, Number.MIN_VALUE, 3.14, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]
		const b = [-Number.MAX_VALUE, -10.5, 0, 2.71, Number.MAX_SAFE_INTEGER]
		assert.deepStrictEqual(andSortedArrSeries(a, b), [-Number.MAX_VALUE, -10.5, 0, Number.MAX_SAFE_INTEGER])
	})

	it('computes intersection over a series of 3 or more arrays', () => {
		assert.deepStrictEqual(
			andSortedArrSeries([1, 2, 3, 4, 5, 6], [2, 3, 5, 7], [0, 2, 5, 8], [2, 4, 5, 9]),
			[2, 5]
		)
		assert.deepStrictEqual(
			andSortedArrSeries([1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]),
			[]
		)
	})

	it('supports unary series (single array) and returns a fresh copy', () => {
		const input = [-5, 0, 5]
		const out = andSortedArrSeries(input)
		assert.deepStrictEqual(out, [-5, 0, 5])
		assert.notStrictEqual(out, input)
	})

	it('handles heavily skewed array sizes via galloping search path', () => {
		const large = Array.from({ length: 10000 }, (_, i) => i * 2) // 0, 2, 4, ..., 19998
		const small = [-10, 0, 1, 2, 500, 501, 9998, 19998, 20000]
		assert.deepStrictEqual(andSortedArrSeries(small, large), [0, 2, 500, 9998, 19998])
		assert.deepStrictEqual(andSortedArrSeries(large, small), [0, 2, 500, 9998, 19998])

		// Single element matching at start, middle, end, or absent
		assert.deepStrictEqual(andSortedArrSeries([0], large), [0])
		assert.deepStrictEqual(andSortedArrSeries([10000], large), [10000])
		assert.deepStrictEqual(andSortedArrSeries([19998], large), [19998])
		assert.deepStrictEqual(andSortedArrSeries([10001], large), [])
	})
})

describe('andSortedArrSeries - edge cases', () => {
	it('handles empty arrays cleanly', () => {
		assert.deepStrictEqual(andSortedArrSeries([]), [])
		assert.deepStrictEqual(andSortedArrSeries([], []), [])
		assert.deepStrictEqual(andSortedArrSeries([], [1, 2, 3]), [])
		assert.deepStrictEqual(andSortedArrSeries([1, 2, 3], []), [])
		assert.deepStrictEqual(andSortedArrSeries([1, 2], [1, 2], []), [])
	})

	it('normalizes -0 to +0 consistently across all code paths', () => {
		const r1 = andSortedArrSeries([-0])
		assert.deepStrictEqual(r1, [0])
		assert.strictEqual(Object.is(r1[0], 0), true)

		const r2 = andSortedArrSeries([-0], [0])
		assert.deepStrictEqual(r2, [0])
		assert.strictEqual(Object.is(r2[0], 0), true)

		const r3 = andSortedArrSeries([-2, -0, 2], [-3, 0, 3])
		assert.deepStrictEqual(r3, [0])
		assert.strictEqual(Object.is(r3[0], 0), true)

		// Galloping path with -0
		const large = Array.from({ length: 100 }, (_, i) => i - 50)
		const r4 = andSortedArrSeries([-0], large)
		assert.deepStrictEqual(r4, [0])
		assert.strictEqual(Object.is(r4[0], 0), true)

		// Boundary touch with -0
		const r5 = andSortedArrSeries([-2, -1, -0], [0, 1, 2])
		assert.deepStrictEqual(r5, [0])
		assert.strictEqual(Object.is(r5[0], 0), true)
	})

	it('does not mutate inputs or alias input array references', () => {
		const a = [1, 2, 3, 4]
		const b = [2, 3, 4, 5]
		const copyA = a.slice()
		const copyB = b.slice()

		const r1 = andSortedArrSeries(a, a, a)
		assert.deepStrictEqual(r1, [1, 2, 3, 4])
		assert.notStrictEqual(r1, a)

		const r2 = andSortedArrSeries(a, b, a)
		assert.deepStrictEqual(r2, [2, 3, 4])
		assert.notStrictEqual(r2, a)
		assert.notStrictEqual(r2, b)

		assert.deepStrictEqual(a, copyA)
		assert.deepStrictEqual(b, copyB)
	})
})

describe('andSortedArrSeries - input validation', () => {
	it('throws RangeError when called with zero arguments', () => {
		assert.throws(() => andSortedArrSeries(), RangeError)
	})

	it('throws TypeError for non-Array arguments', () => {
		for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2]), new Int32Array([1, 2])]) {
			assert.throws(() => andSortedArrSeries(bad), TypeError)
			assert.throws(() => andSortedArrSeries([1, 2], bad), TypeError)
			// Must validate even when first array is empty
			assert.throws(() => andSortedArrSeries([], bad), TypeError)
		}
	})

	it('throws TypeError for non-number elements or sparse arrays', () => {
		assert.throws(() => andSortedArrSeries(['1', '2']), TypeError)
		assert.throws(() => andSortedArrSeries([1, null]), TypeError)
		assert.throws(() => andSortedArrSeries([1, undefined]), TypeError)
		assert.throws(() => andSortedArrSeries([1, 2n]), TypeError)
		assert.throws(() => andSortedArrSeries([1, true]), TypeError)

		const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
		assert.throws(() => andSortedArrSeries(sparse, [1, 3]), TypeError)
	})

	it('throws RangeError for non-finite numbers', () => {
		assert.throws(() => andSortedArrSeries([NaN]), RangeError)
		assert.throws(() => andSortedArrSeries([1, NaN], [1]), RangeError)
		assert.throws(() => andSortedArrSeries([-Infinity, 0], [0]), RangeError)
		assert.throws(() => andSortedArrSeries([0, Infinity], [0]), RangeError)
		// Must validate even when first array is empty
		assert.throws(() => andSortedArrSeries([], [NaN]), RangeError)
	})

	it('throws RangeError for unsorted arrays or duplicate elements', () => {
		assert.throws(() => andSortedArrSeries([2, 1]), RangeError)
		assert.throws(() => andSortedArrSeries([1, 3, 2], [1, 2, 3]), RangeError)
		assert.throws(() => andSortedArrSeries([1, 1]), RangeError)
		assert.throws(() => andSortedArrSeries([1, 2, 2, 3], [2]), RangeError)
		assert.throws(() => andSortedArrSeries([-0, 0]), RangeError)
		assert.throws(() => andSortedArrSeries([0, -0]), RangeError)
		// Must validate even when first array is empty
		assert.throws(() => andSortedArrSeries([], [3, 2, 1]), RangeError)
		assert.throws(() => andSortedArrSeries([], [1, 1]), RangeError)
	})
})

describe('andSortedArrSeries - cross-checks & Boolean algebra identities', () => {
	it('matches independent Set-based intersection across 120 randomized trials (balanced & skewed)', () => {
		const rng = makeRng(0x5eed2026)

		for (let trial = 0; trial < 120; trial++) {
			const arity = 1 + (trial % 5) // 1..5 arrays
			const fractional = trial % 3 === 0
			const arrays = []

			for (let k = 0; k < arity; k++) {
				// Mix small, medium, and large sizes to cover both linear merge and galloping search
				const len =
					trial % 4 === 0 && k === arity - 1
						? Math.floor(rng() * 600) + 100
						: Math.floor(rng() * 30)
				arrays.push(randomSortedSet(rng, len, -80, 80, fractional))
			}

			const actual = andSortedArrSeries(...arrays)
			const expected = setIntersectionRef(...arrays)
			assert.deepStrictEqual(actual, expected)

			// Verify output invariant: strictly increasing finite numbers
			for (let i = 1; i < actual.length; i++) {
				assert.ok(actual[i] > actual[i - 1], 'output must be strictly increasing')
			}
		}
	})

	it('satisfies Boolean algebra identities: idempotence, commutativity, associativity, identity, annihilator, absorption, distributivity, De Morgan, and inclusion-exclusion', () => {
		const rng = makeRng(0xb001ea4)
		const U = Array.from({ length: 60 }, (_, i) => i - 30) // Universe [-30, 29]

		for (let trial = 0; trial < 25; trial++) {
			const A = randomSortedSet(rng, Math.floor(rng() * 35), -30, 29)
			const B = randomSortedSet(rng, Math.floor(rng() * 35), -30, 29)
			const C = randomSortedSet(rng, Math.floor(rng() * 35), -30, 29)

			// 1. Idempotence: A ∩ A = A and A ∩ A ∩ A = A
			assert.deepStrictEqual(andSortedArrSeries(A, A), A)
			assert.deepStrictEqual(andSortedArrSeries(A, A, A), A)

			// 2. Commutativity: A ∩ B = B ∩ A and all 6 permutations of (A, B, C)
			const ab = andSortedArrSeries(A, B)
			assert.deepStrictEqual(ab, andSortedArrSeries(B, A))

			const abc = andSortedArrSeries(A, B, C)
			assert.deepStrictEqual(andSortedArrSeries(A, C, B), abc)
			assert.deepStrictEqual(andSortedArrSeries(B, A, C), abc)
			assert.deepStrictEqual(andSortedArrSeries(B, C, A), abc)
			assert.deepStrictEqual(andSortedArrSeries(C, A, B), abc)
			assert.deepStrictEqual(andSortedArrSeries(C, B, A), abc)

			// 3. Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C) = andSortedArrSeries(A, B, C)
			const leftAssoc = andSortedArrSeries(andSortedArrSeries(A, B), C)
			const rightAssoc = andSortedArrSeries(A, andSortedArrSeries(B, C))
			assert.deepStrictEqual(leftAssoc, rightAssoc)
			assert.deepStrictEqual(leftAssoc, abc)

			// 4. Identity & Annihilator: A ∩ U = A, A ∩ ∅ = ∅
			assert.deepStrictEqual(andSortedArrSeries(A, U), A)
			assert.deepStrictEqual(andSortedArrSeries(A, []), [])

			// 5. Absorption: A ∩ (A ∪ B) = A
			const aUnionB = setUnionRef(A, B)
			assert.deepStrictEqual(andSortedArrSeries(A, aUnionB), A)

			// 6. Distributivity: A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)
			const bUnionC = setUnionRef(B, C)
			assert.deepStrictEqual(
				andSortedArrSeries(A, bUnionC),
				setUnionRef(andSortedArrSeries(A, B), andSortedArrSeries(A, C))
			)

			// 7. De Morgan's Laws (binary & ternary):
			// (A ∩ B)^c = A^c ∪ B^c
			const compA = setComplementRef(U, A)
			const compB = setComplementRef(U, B)
			const compC = setComplementRef(U, C)
			assert.deepStrictEqual(setComplementRef(U, ab), setUnionRef(compA, compB))
			// (A ∪ B)^c = A^c ∩ B^c
			assert.deepStrictEqual(setComplementRef(U, aUnionB), andSortedArrSeries(compA, compB))
			// (A ∩ B ∩ C)^c = A^c ∪ B^c ∪ C^c
			assert.deepStrictEqual(setComplementRef(U, abc), setUnionRef(compA, compB, compC))
			// (A ∪ B ∪ C)^c = A^c ∩ B^c ∩ C^c
			const aUnionBUnionC = setUnionRef(A, B, C)
			assert.deepStrictEqual(
				setComplementRef(U, aUnionBUnionC),
				andSortedArrSeries(compA, compB, compC)
			)

			// 8. Inclusion-Exclusion Principle (2-set and 3-set)
			assert.strictEqual(aUnionB.length, A.length + B.length - ab.length)
			assert.strictEqual(
				aUnionBUnionC.length,
				A.length +
					B.length +
					C.length -
					ab.length -
					andSortedArrSeries(A, C).length -
					andSortedArrSeries(B, C).length +
					abc.length
			)
		}
	})
})
