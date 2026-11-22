import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orBoolSeries } from './orBoolSeries.js'

/**
 * Helper: compares two Sets for exact element equality.
 */
function setsEqual(a, b) {
	if (a.size !== b.size) return false
	for (const x of a) {
		if (!b.has(x)) return false
	}
	return true
}

/**
 * Helper: independent intersection of Sets for inclusion-exclusion / De Morgan cross-checks.
 */
function intersectSets(...sets) {
	const [first, ...rest] = sets
	const out = new Set()
	for (const x of first) {
		if (rest.every((s) => s.has(x))) {
			out.add(x)
		}
	}
	return out
}

/**
 * Helper: relative complement U \ A.
 */
function complementSet(universe, subset) {
	const out = new Set()
	for (const x of universe) {
		if (!subset.has(x)) {
			out.add(x)
		}
	}
	return out
}

/**
 * Helper: explicit unfactored inclusion-exclusion alternating sum over all
 * non-empty subsets of indicators, for independent analytical cross-checking.
 */
function alternatingInclusionExclusion(bools) {
	const n = bools.length
	const indicators = bools.map((b) => (b ? 1 : 0))
	let sum = 0
	const totalMasks = 1 << n
	for (let mask = 1; mask < totalMasks; mask++) {
		let bits = 0
		let prod = 1
		for (let i = 0; i < n; i++) {
			if (mask & (1 << i)) {
				bits++
				prod *= indicators[i]
			}
		}
		const sign = bits % 2 === 1 ? 1 : -1
		sum += sign * prod
	}
	return sum === 1
}

describe('orBoolSeries — boolean disjunction', () => {
	it('matches the complete 2-variable truth table', () => {
		assert.strictEqual(orBoolSeries(false, false), false)
		assert.strictEqual(orBoolSeries(false, true), true)
		assert.strictEqual(orBoolSeries(true, false), true)
		assert.strictEqual(orBoolSeries(true, true), true)
	})

	it('handles 3 or more boolean arguments', () => {
		assert.strictEqual(orBoolSeries(false, false, false), false)
		assert.strictEqual(orBoolSeries(true, false, false), true)
		assert.strictEqual(orBoolSeries(false, true, false), true)
		assert.strictEqual(orBoolSeries(false, false, true), true)
		assert.strictEqual(orBoolSeries(true, true, true), true)
		assert.strictEqual(orBoolSeries(false, false, false, false, false), false)
		assert.strictEqual(orBoolSeries(false, false, false, false, true), true)
	})

	it('handles large arities accurately without numeric degradation', () => {
		const manyFalse = Array(500).fill(false)
		assert.strictEqual(orBoolSeries(...manyFalse), false)

		const oneTrueAtEnd = [...manyFalse, true]
		assert.strictEqual(orBoolSeries(...oneTrueAtEnd), true)

		const oneTrueInMiddle = [
			...Array(250).fill(false),
			true,
			...Array(250).fill(false)
		]
		assert.strictEqual(orBoolSeries(...oneTrueInMiddle), true)
	})

	it('cross-checks all 2^n boolean inputs (n = 2, 3, 4) against JS disjunction and explicit alternating inclusion-exclusion series', () => {
		for (const n of [2, 3, 4]) {
			const total = 1 << n
			for (let mask = 0; mask < total; mask++) {
				const args = []
				for (let i = 0; i < n; i++) {
					args.push(Boolean(mask & (1 << i)))
				}
				const expectedBuiltin = args.some(Boolean)
				const expectedSeries = alternatingInclusionExclusion(args)
				const actual = orBoolSeries(...args)

				assert.strictEqual(actual, expectedBuiltin)
				assert.strictEqual(actual, expectedSeries)
			}
		}
	})

	it('satisfies commutativity, associativity, idempotence, identity, and domination', () => {
		const values = [false, true]

		for (const a of values) {
			// Idempotence: a ∨ a = a
			assert.strictEqual(orBoolSeries(a, a), a)
			assert.strictEqual(orBoolSeries(a, a, a), a)

			// Identity & domination
			assert.strictEqual(orBoolSeries(a, false), a)
			assert.strictEqual(orBoolSeries(false, a), a)
			assert.strictEqual(orBoolSeries(a, true), true)
			assert.strictEqual(orBoolSeries(true, a), true)

			for (const b of values) {
				// Commutativity: a ∨ b = b ∨ a
				assert.strictEqual(orBoolSeries(a, b), orBoolSeries(b, a))

				for (const c of values) {
					// Associativity: (a ∨ b) ∨ c = a ∨ (b ∨ c) = a ∨ b ∨ c
					const left = orBoolSeries(orBoolSeries(a, b), c)
					const right = orBoolSeries(a, orBoolSeries(b, c))
					const nary = orBoolSeries(a, b, c)
					assert.strictEqual(left, right)
					assert.strictEqual(left, nary)
				}
			}
		}
	})

	it("satisfies De Morgan's laws over booleans for n = 2, 3, 4", () => {
		for (const n of [2, 3, 4]) {
			const total = 1 << n
			for (let mask = 0; mask < total; mask++) {
				const args = []
				for (let i = 0; i < n; i++) {
					args.push(Boolean(mask & (1 << i)))
				}
				const notOr = !orBoolSeries(...args)
				const andOfNots = args.every((x) => !x)
				assert.strictEqual(notOr, andOfNots)
			}
		}
	})
})

describe('orBoolSeries — Set union', () => {
	it('computes union of two sets across disjoint, overlapping, subset, and empty cases', () => {
		const a = new Set([1, 2, 3])
		const b = new Set([3, 4, 5])
		const u1 = orBoolSeries(a, b)
		assert.ok(u1 instanceof Set)
		assert.ok(setsEqual(u1, new Set([1, 2, 3, 4, 5])))

		const disjoint = orBoolSeries(new Set(['a', 'b']), new Set(['c', 'd']))
		assert.ok(setsEqual(disjoint, new Set(['a', 'b', 'c', 'd'])))

		const withEmpty = orBoolSeries(new Set([10, 20]), new Set())
		assert.ok(setsEqual(withEmpty, new Set([10, 20])))

		const bothEmpty = orBoolSeries(new Set(), new Set())
		assert.strictEqual(bothEmpty.size, 0)
	})

	it('computes union of 3 or more sets', () => {
		const s1 = new Set([1, 2])
		const s2 = new Set([2, 3])
		const s3 = new Set([3, 4, 5])
		const s4 = new Set()
		const result = orBoolSeries(s1, s2, s3, s4)
		assert.ok(setsEqual(result, new Set([1, 2, 3, 4, 5])))
	})

	it('does not mutate input sets and always returns a fresh Set instance', () => {
		const a = new Set([1, 2])
		const b = new Set([2, 3])
		const u = orBoolSeries(a, b)

		assert.notStrictEqual(u, a)
		assert.notStrictEqual(u, b)
		assert.deepStrictEqual([...a], [1, 2])
		assert.deepStrictEqual([...b], [2, 3])

		// Mutating returned set must not affect inputs
		u.add(999)
		assert.strictEqual(a.has(999), false)
		assert.strictEqual(b.has(999), false)

		// Same Set reference passed twice still yields a distinct Set
		const selfUnion = orBoolSeries(a, a)
		assert.notStrictEqual(selfUnion, a)
		assert.ok(setsEqual(selfUnion, a))
	})

	it('preserves JS Set SameValueZero semantics for NaN, -0/+0, primitives, objects, and symbols', () => {
		const obj1 = { id: 1 }
		const obj2 = { id: 2 }
		const sym = Symbol('k')

		const a = new Set([NaN, -0, null, undefined, false, '', obj1])
		const b = new Set([NaN, +0, obj1, obj2, sym])
		const u = orBoolSeries(a, b)

		assert.strictEqual(u.size, 9)
		assert.strictEqual(u.has(NaN), true)
		assert.strictEqual(u.has(0), true)
		assert.strictEqual(u.has(null), true)
		assert.strictEqual(u.has(undefined), true)
		assert.strictEqual(u.has(false), true)
		assert.strictEqual(u.has(''), true)
		assert.strictEqual(u.has(obj1), true)
		assert.strictEqual(u.has(obj2), true)
		assert.strictEqual(u.has(sym), true)
	})

	it('satisfies commutativity, associativity, idempotence, and identity on Sets', () => {
		const A = new Set([1, 2, 3])
		const B = new Set([3, 4, 5])
		const C = new Set([5, 6, 1])
		const empty = new Set()

		// Commutativity: A ∪ B = B ∪ A
		assert.ok(setsEqual(orBoolSeries(A, B), orBoolSeries(B, A)))

		// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C) = A ∪ B ∪ C
		const left = orBoolSeries(orBoolSeries(A, B), C)
		const right = orBoolSeries(A, orBoolSeries(B, C))
		const nary = orBoolSeries(A, B, C)
		assert.ok(setsEqual(left, right))
		assert.ok(setsEqual(left, nary))

		// Idempotence: A ∪ A = A
		assert.ok(setsEqual(orBoolSeries(A, A), A))
		assert.ok(setsEqual(orBoolSeries(A, A, A), A))

		// Identity: A ∪ ∅ = A
		assert.ok(setsEqual(orBoolSeries(A, empty), A))
		assert.ok(setsEqual(orBoolSeries(empty, A), A))
	})

	it('satisfies inclusion-exclusion cardinality for 2 and 3 sets', () => {
		const pairs = [
			[new Set([1, 2, 3]), new Set([4, 5, 6])],
			[new Set([1, 2, 3, 4]), new Set([3, 4, 5, 6])],
			[new Set([1, 2]), new Set([1, 2, 3, 4])],
			[new Set(), new Set([1, 2, 3])],
			[new Set(), new Set()]
		]

		for (const [A, B] of pairs) {
			const union = orBoolSeries(A, B)
			const inter = intersectSets(A, B)
			assert.strictEqual(union.size, A.size + B.size - inter.size)
		}

		// 3-set inclusion-exclusion:
		// |A ∪ B ∪ C| = |A| + |B| + |C| - |A∩B| - |A∩C| - |B∩C| + |A∩B∩C|
		const A = new Set([1, 2, 3, 4, 5])
		const B = new Set([3, 4, 5, 6, 7])
		const C = new Set([1, 4, 7, 8, 9])
		const union3 = orBoolSeries(A, B, C)
		const expectedSize =
			A.size +
			B.size +
			C.size -
			intersectSets(A, B).size -
			intersectSets(A, C).size -
			intersectSets(B, C).size +
			intersectSets(A, B, C).size
		assert.strictEqual(union3.size, expectedSize)
	})

	it("satisfies De Morgan's laws for sets relative to a finite universe U", () => {
		const U = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
		const A = new Set([1, 2, 4, 7])
		const B = new Set([2, 3, 5, 7])
		const C = new Set([5, 6, 8])

		// U \ (A ∪ B) = (U \ A) ∩ (U \ B)
		const lhs2 = complementSet(U, orBoolSeries(A, B))
		const rhs2 = intersectSets(complementSet(U, A), complementSet(U, B))
		assert.ok(setsEqual(lhs2, rhs2))

		// U \ (A ∪ B ∪ C) = (U \ A) ∩ (U \ B) ∩ (U \ C)
		const lhs3 = complementSet(U, orBoolSeries(A, B, C))
		const rhs3 = intersectSets(
			complementSet(U, A),
			complementSet(U, B),
			complementSet(U, C)
		)
		assert.ok(setsEqual(lhs3, rhs3))
	})
})

describe('orBoolSeries — input validation', () => {
	it('throws TypeError when fewer than 2 arguments are passed', () => {
		assert.throws(() => orBoolSeries(), TypeError)
		assert.throws(() => orBoolSeries(true), TypeError)
		assert.throws(() => orBoolSeries(false), TypeError)
		assert.throws(() => orBoolSeries(new Set([1])), TypeError)
	})

	it('throws TypeError for mixed boolean and Set arguments', () => {
		assert.throws(() => orBoolSeries(true, new Set([1])), TypeError)
		assert.throws(() => orBoolSeries(new Set([1]), false), TypeError)
		assert.throws(() => orBoolSeries(true, false, new Set()), TypeError)
		assert.throws(() => orBoolSeries(new Set([1]), new Set([2]), true), TypeError)
	})

	it('throws TypeError for non-boolean, non-Set arguments', () => {
		assert.throws(() => orBoolSeries(1, 0), TypeError)
		assert.throws(() => orBoolSeries('true', 'false'), TypeError)
		assert.throws(() => orBoolSeries(null, true), TypeError)
		assert.throws(() => orBoolSeries(true, undefined), TypeError)
		assert.throws(() => orBoolSeries(NaN, false), TypeError)
		assert.throws(() => orBoolSeries([1], [2]), TypeError)
		assert.throws(() => orBoolSeries({}, {}), TypeError)
		assert.throws(() => orBoolSeries(new Map(), new Map()), TypeError)
		assert.throws(() => orBoolSeries(new Boolean(true), false), TypeError)
		assert.throws(() => orBoolSeries(false, new Boolean(false)), TypeError)
		assert.throws(() => orBoolSeries(true, false, 1), TypeError)
		assert.throws(() => orBoolSeries(new Set([1]), new Set([2]), [3]), TypeError)
	})
})
