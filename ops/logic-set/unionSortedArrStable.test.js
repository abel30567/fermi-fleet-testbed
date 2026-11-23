import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { unionSortedArrStable } from './unionSortedArrStable.js'

/**
 * Independent reference implementation for exact union using Set + overflow-safe sort.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function referenceExactUnion(a, b) {
	const set = new Set()
	for (const x of a) set.add(x === 0 ? 0 : x)
	for (const x of b) set.add(x === 0 ? 0 : x)
	return Array.from(set).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
}

/**
 * Deterministic LCG PRNG for reproducible fuzz/cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('unionSortedArrStable', () => {
	test('merges disjoint, overlapping, identical, and subset arrays', () => {
		assert.deepEqual(unionSortedArrStable([1, 3, 5], [2, 4, 6]), [1, 2, 3, 4, 5, 6])
		assert.deepEqual(unionSortedArrStable([1, 2, 3], [2, 3, 4]), [1, 2, 3, 4])
		assert.deepEqual(unionSortedArrStable([1, 2, 3], [1, 2, 3]), [1, 2, 3])
		assert.deepEqual(unionSortedArrStable([1, 2, 3, 4], [2, 3]), [1, 2, 3, 4])
		assert.deepEqual(unionSortedArrStable([-10, -2, 0, 5], [-5, -2, 3, 10]), [-10, -5, -2, 0, 3, 5, 10])
	})

	test('handles empty and single-element arrays without mutating inputs', () => {
		assert.deepEqual(unionSortedArrStable([], []), [])
		const a = [1, 2, 3]
		const b = [4, 5]
		const resA = unionSortedArrStable(a, [])
		const resB = unionSortedArrStable([], b)
		assert.deepEqual(resA, [1, 2, 3])
		assert.deepEqual(resB, [4, 5])
		assert.notEqual(resA, a)
		assert.notEqual(resB, b)
		assert.deepEqual(unionSortedArrStable([7], [7]), [7])
		assert.deepEqual(unionSortedArrStable([7], [3]), [3, 7])
	})

	test('de-duplicates repeated elements within sorted inputs', () => {
		assert.deepEqual(unionSortedArrStable([1, 1, 2, 2, 5], [2, 3, 3, 5, 5]), [1, 2, 3, 5])
		assert.deepEqual(unionSortedArrStable([4, 4, 4], []), [4])
		assert.deepEqual(unionSortedArrStable([], [9, 9, 9]), [9])
	})

	test('normalizes -0 to +0 and deduplicates signed zeros', () => {
		const res1 = unionSortedArrStable([-0], [0])
		assert.equal(res1.length, 1)
		assert.ok(Object.is(res1[0], 0))

		const res2 = unionSortedArrStable([-1, -0, 1], [-0, 2])
		assert.deepEqual(res2, [-1, 0, 1, 2])
		assert.ok(Object.is(res2[1], 0))
	})

	test('handles ±Infinity and extreme finite magnitudes without overflow', () => {
		assert.deepEqual(
			unionSortedArrStable([-Infinity, -Number.MAX_VALUE, 0, Infinity], [-Infinity, Number.MAX_VALUE, Infinity]),
			[-Infinity, -Number.MAX_VALUE, 0, Number.MAX_VALUE, Infinity]
		)

		// Scaled relative tolerance check on extreme magnitudes where x - y would overflow
		const big = 1e308
		const nearBig = big * (1 - 1e-13)
		assert.deepEqual(
			unionSortedArrStable([-big, nearBig], [-big, big], { relTol: 1e-12 }),
			[-big, nearBig]
		)
		assert.deepEqual(
			unionSortedArrStable([-big], [big], { relTol: 1e-12 }),
			[-big, big]
		)
	})

	test('handles subnormal numbers accurately under absolute and relative bounds', () => {
		const sub1 = Number.MIN_VALUE
		const sub2 = 2 * Number.MIN_VALUE
		const sub10 = 10 * Number.MIN_VALUE

		assert.deepEqual(unionSortedArrStable([sub1], [sub2]), [sub1, sub2])
		assert.deepEqual(unionSortedArrStable([sub1], [sub2], { absTol: 2 * Number.MIN_VALUE }), [sub1])
		assert.deepEqual(unionSortedArrStable([sub1, sub10], [sub2], { absTol: 2 * Number.MIN_VALUE }), [sub1, sub10])
	})

	test('supports error-bounded merging with left-stability and anti-drift anchoring', () => {
		// Classic IEEE-754 rounding: 0.1 + 0.2 !== 0.3
		assert.equal(unionSortedArrStable([0.1 + 0.2], [0.3]).length, 2)
		assert.deepEqual(unionSortedArrStable([0.1 + 0.2], [0.3], { relTol: 1e-15 }), [0.1 + 0.2])

		// Left-stability: prefers representative from `a` even when b[j] < a[i]
		assert.deepEqual(unionSortedArrStable([1.0 + 1e-13], [1.0], { relTol: 1e-12 }), [1.0 + 1e-13])

		// Convexity preservation when b has multiple values just below a's matched representative
		assert.deepEqual(unionSortedArrStable([1.0, 1.05], [0.95, 0.96], { absTol: 0.1 }), [1.0])

		// Anchor-based anti-drift: consecutive 0.15 steps with absTol=0.2 should not collapse to [0]
		assert.deepEqual(
			unionSortedArrStable([0.0, 0.15, 0.30, 0.45, 0.60], [], { absTol: 0.2 }),
			[0.0, 0.30, 0.60]
		)
	})

	test('validates inputs and options', () => {
		assert.throws(() => unionSortedArrStable(null, []), TypeError)
		assert.throws(() => unionSortedArrStable([], 'not-an-array'), TypeError)
		assert.throws(() => unionSortedArrStable([1, NaN], [2]), TypeError)
		assert.throws(() => unionSortedArrStable([1], [2, '3']), TypeError)
		assert.throws(() => unionSortedArrStable([3, 1], [2]), RangeError)
		assert.throws(() => unionSortedArrStable([1, 2], [5, 4]), RangeError)

		assert.throws(() => unionSortedArrStable([], [], null), TypeError)
		assert.throws(() => unionSortedArrStable([], [], []), TypeError)
		assert.throws(() => unionSortedArrStable([], [], { absTol: NaN }), TypeError)
		assert.throws(() => unionSortedArrStable([], [], { absTol: -1e-9 }), RangeError)
		assert.throws(() => unionSortedArrStable([], [], { absTol: Infinity }), RangeError)
		assert.throws(() => unionSortedArrStable([], [], { relTol: NaN }), TypeError)
		assert.throws(() => unionSortedArrStable([], [], { relTol: -0.1 }), RangeError)
		assert.throws(() => unionSortedArrStable([], [], { relTol: 1 }), RangeError)
		assert.throws(() => unionSortedArrStable([], [], { relTol: Infinity }), RangeError)
	})

	test('independent cross-check against Set+sort and set-algebra laws on randomized inputs', () => {
		const rng = makeRng(0x5eed1234)
		const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)

		for (let trial = 0; trial < 100; trial++) {
			const lenA = Math.floor(rng() * 40)
			const lenB = Math.floor(rng() * 40)
			const lenC = Math.floor(rng() * 20)

			const genArr = (len) => {
				const arr = []
				for (let k = 0; k < len; k++) {
					const pick = rng()
					if (pick < 0.05) arr.push(-0)
					else if (pick < 0.08) arr.push(-Infinity)
					else if (pick < 0.11) arr.push(Infinity)
					else if (pick < 0.15) arr.push((rng() < 0.5 ? -1 : 1) * Number.MAX_VALUE)
					else arr.push(Math.floor((rng() - 0.5) * 40) / 2)
				}
				return arr.sort(cmp)
			}

			const a = genArr(lenA)
			const b = genArr(lenB)
			const c = genArr(lenC)

			const got = unionSortedArrStable(a, b)
			const expected = referenceExactUnion(a, b)
			assert.deepEqual(got, expected)

			// Commutativity, idempotence, and associativity in exact mode
			assert.deepEqual(got, unionSortedArrStable(b, a))
			assert.deepEqual(unionSortedArrStable(a, a), referenceExactUnion(a, []))
			assert.deepEqual(
				unionSortedArrStable(unionSortedArrStable(a, b), c),
				unionSortedArrStable(a, unionSortedArrStable(b, c))
			)
		}
	})

	test('independent invariant check for error-bounded mode on randomized floats', () => {
		const rng = makeRng(0xabadcafe)
		const absTol = 1e-6
		const relTol = 1e-5
		const within = (x, y) => Math.abs(x - y) <= absTol + relTol * Math.max(Math.abs(x), Math.abs(y))

		for (let trial = 0; trial < 50; trial++) {
			const makeFloatArr = (len) =>
				Array.from({ length: len }, () => (rng() - 0.5) * 1000).sort((x, y) => x - y)

			const a = makeFloatArr(Math.floor(rng() * 35))
			const b = makeFloatArr(Math.floor(rng() * 35))
			const out = unionSortedArrStable(a, b, { absTol, relTol })

			// Strictly ascending and consecutive outputs separated beyond the error bound
			for (let k = 1; k < out.length; k++) {
				assert.ok(out[k - 1] < out[k], `expected strict ordering at index ${k}`)
				assert.ok(!within(out[k - 1], out[k]), `adjacent outputs at ${k} should exceed error bound`)
			}

			// Coverage: every input value must be within error bound of some output element
			for (const x of [...a, ...b]) {
				const covered = out.some((y) => within(x, y))
				assert.ok(covered, `input value ${x} not covered by any output element`)
			}
		}
	})
})
