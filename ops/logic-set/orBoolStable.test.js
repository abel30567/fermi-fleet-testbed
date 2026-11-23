import { describe, it } from 'node:test'
import assert from 'node:assert'
import { orBoolStable } from './orBoolStable.js'

/**
 * Deterministic LCG PRNG for reproducible randomized cross-checks.
 * @param {number} seed
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('orBoolStable - plain booleans', () => {
	it('computes the full binary truth table', () => {
		assert.strictEqual(orBoolStable(false, false), false)
		assert.strictEqual(orBoolStable(false, true), true)
		assert.strictEqual(orBoolStable(true, false), true)
		assert.strictEqual(orBoolStable(true, true), true)
	})

	it('handles variadic boolean operands (3+ arguments)', () => {
		assert.strictEqual(orBoolStable(false, false, false), false)
		assert.strictEqual(orBoolStable(true, false, false), true)
		assert.strictEqual(orBoolStable(false, true, false), true)
		assert.strictEqual(orBoolStable(false, false, true), true)
		assert.strictEqual(orBoolStable(true, true, true, true), true)
		assert.strictEqual(orBoolStable(false, false, false, false, false), false)
	})

	it('satisfies algebraic laws (commutativity, associativity, idempotence, identity, annihilator)', () => {
		const bools = [false, true]
		for (const a of bools) {
			assert.strictEqual(orBoolStable(a, a), a)
			assert.strictEqual(orBoolStable(a, false), a)
			assert.strictEqual(orBoolStable(false, a), a)
			assert.strictEqual(orBoolStable(a, true), true)
			assert.strictEqual(orBoolStable(true, a), true)
			for (const b of bools) {
				assert.strictEqual(orBoolStable(a, b), orBoolStable(b, a))
				for (const c of bools) {
					assert.strictEqual(
						orBoolStable(orBoolStable(a, b), c),
						orBoolStable(a, orBoolStable(b, c))
					)
				}
			}
		}
	})

	it('handles large arity without stack overflow', () => {
		const allFalse = new Array(10000).fill(false)
		assert.strictEqual(orBoolStable(...allFalse), false)

		const lastTrue = new Array(10000).fill(false)
		lastTrue[lastTrue.length - 1] = true
		assert.strictEqual(orBoolStable(...lastTrue), true)
	})
})

describe('orBoolStable - JS Set objects', () => {
	it('computes union of disjoint, overlapping, and subset sets', () => {
		assert.deepStrictEqual(
			orBoolStable(new Set([1, 2]), new Set([3, 4])),
			new Set([1, 2, 3, 4])
		)
		assert.deepStrictEqual(
			orBoolStable(new Set([1, 2, 3]), new Set([2, 3, 4])),
			new Set([1, 2, 3, 4])
		)
		assert.deepStrictEqual(
			orBoolStable(new Set([1, 2]), new Set([1, 2, 3])),
			new Set([1, 2, 3])
		)
	})

	it('computes variadic union across 3+ sets', () => {
		const res = orBoolStable(
			new Set(['a', 'b']),
			new Set(['b', 'c']),
			new Set(['c', 'd', 'e']),
			new Set()
		)
		assert.deepStrictEqual(res, new Set(['a', 'b', 'c', 'd', 'e']))
	})

	it('preserves deterministic left-to-right first-seen insertion order', () => {
		const a = new Set(['z', 'a', 'm'])
		const b = new Set(['m', 'b', 'a', 'k'])
		const c = new Set(['k', 'x'])
		const res = orBoolStable(a, b, c)
		assert.deepStrictEqual([...res], ['z', 'a', 'm', 'b', 'k', 'x'])
	})

	it('handles empty sets and preserves immutability / distinct output instance', () => {
		const empty1 = new Set()
		const empty2 = new Set()
		const emptyUnion = orBoolStable(empty1, empty2)
		assert.strictEqual(emptyUnion.size, 0)
		assert.notStrictEqual(emptyUnion, empty1)
		assert.notStrictEqual(emptyUnion, empty2)

		const a = new Set([10, 20])
		const u1 = orBoolStable(a, empty1)
		const u2 = orBoolStable(empty1, a)
		const uSelf = orBoolStable(a, a)
		assert.deepStrictEqual(u1, new Set([10, 20]))
		assert.deepStrictEqual(u2, new Set([10, 20]))
		assert.deepStrictEqual(uSelf, new Set([10, 20]))
		assert.notStrictEqual(u1, a)
		assert.notStrictEqual(u2, a)
		assert.notStrictEqual(uSelf, a)

		u1.add(999)
		assert.strictEqual(a.has(999), false)
		assert.strictEqual(empty1.size, 0)
	})

	it('handles special JS values (NaN, -0/+0, null, undefined, Symbol, BigInt, objects)', () => {
		const sym = Symbol('s')
		const obj1 = { id: 1 }
		const obj2 = { id: 2 }
		const a = new Set([NaN, -0, null, undefined, sym, 42n, obj1])
		const b = new Set([NaN, +0, obj1, obj2, 42n])

		const res = orBoolStable(a, b)
		assert.strictEqual(res.size, 8)
		assert.strictEqual(res.has(NaN), true)
		assert.strictEqual(res.has(0), true)
		assert.strictEqual(res.has(null), true)
		assert.strictEqual(res.has(undefined), true)
		assert.strictEqual(res.has(sym), true)
		assert.strictEqual(res.has(42n), true)
		assert.strictEqual(res.has(obj1), true)
		assert.strictEqual(res.has(obj2), true)

		const zeroEntry = [...res].find((v) => v === 0)
		assert.strictEqual(Object.is(zeroEntry, 0), true)
	})

	it('resists overridden Symbol.iterator on a Set instance', () => {
		const a = new Set([1, 2])
		const b = new Set([2, 3])
		Object.defineProperty(a, Symbol.iterator, {
			value() {
				throw new Error('custom iterator should not be invoked')
			}
		})
		const res = orBoolStable(a, b)
		assert.deepStrictEqual([...res], [1, 2, 3])
	})

	it('handles large sets efficiently without stack overflow', () => {
		const a = new Set()
		const b = new Set()
		for (let i = 0; i < 30000; i += 1) {
			a.add(i)
		}
		for (let i = 15000; i < 45000; i += 1) {
			b.add(i)
		}
		const res = orBoolStable(a, b)
		assert.strictEqual(res.size, 45000)
		assert.strictEqual(res.has(0), true)
		assert.strictEqual(res.has(29999), true)
		assert.strictEqual(res.has(44999), true)
	})
})

describe('orBoolStable - input validation', () => {
	it('throws TypeError when given fewer than 2 operands', () => {
		assert.throws(() => orBoolStable(), TypeError)
		assert.throws(() => orBoolStable(true), TypeError)
		assert.throws(() => orBoolStable(false), TypeError)
		assert.throws(() => orBoolStable(new Set([1])), TypeError)
	})

	it('rejects non-boolean / non-Set values including truthy/falsy and boxed Booleans', () => {
		const invalidValues = [
			0,
			1,
			NaN,
			'',
			'true',
			null,
			undefined,
			{},
			[],
			[true],
			new Map(),
			new Boolean(true),
			new Boolean(false),
			() => true,
			Symbol('x'),
			1n
		]

		for (const bad of invalidValues) {
			assert.throws(() => orBoolStable(bad, true), TypeError)
			assert.throws(() => orBoolStable(true, bad), TypeError)
			assert.throws(() => orBoolStable(false, bad), TypeError)
			assert.throws(() => orBoolStable(new Set(), bad), TypeError)
			assert.throws(() => orBoolStable(bad, new Set()), TypeError)
		}
	})

	it('does not short-circuit validation when earlier boolean operand is true', () => {
		assert.throws(() => orBoolStable(true, 'not-a-bool'), TypeError)
		assert.throws(() => orBoolStable(true, false, 1), TypeError)
		assert.throws(() => orBoolStable(true, undefined), TypeError)
	})

	it('rejects mixing boolean and Set operands', () => {
		assert.throws(() => orBoolStable(true, new Set()), TypeError)
		assert.throws(() => orBoolStable(false, new Set([false])), TypeError)
		assert.throws(() => orBoolStable(new Set(), true), TypeError)
		assert.throws(() => orBoolStable(new Set([1]), new Set([2]), false), TypeError)
		assert.throws(() => orBoolStable(false, true, new Set()), TypeError)
	})

	it('rejects Set-like duck-typed objects and forged Set.prototype objects', () => {
		const duckSet = {
			size: 1,
			has: () => true,
			values: () => [1].values(),
			[Symbol.iterator]: () => [1].values()
		}
		const forgedProto = Object.create(Set.prototype)

		assert.throws(() => orBoolStable(duckSet, new Set()), TypeError)
		assert.throws(() => orBoolStable(new Set(), duckSet), TypeError)
		assert.throws(() => orBoolStable(forgedProto, new Set()), TypeError)
		assert.throws(() => orBoolStable(new Set(), forgedProto), TypeError)
	})
})

describe('orBoolStable - independent cross-checks', () => {
	it('matches De Morgan law and native || across all 16 4-boolean combinations', () => {
		for (let mask = 0; mask < 16; mask += 1) {
			const a = Boolean(mask & 1)
			const b = Boolean(mask & 2)
			const c = Boolean(mask & 4)
			const d = Boolean(mask & 8)

			const actual = orBoolStable(a, b, c, d)
			const deMorgan = !(!a && !b && !c && !d)
			const nativeOr = a || b || c || d

			assert.strictEqual(actual, deMorgan)
			assert.strictEqual(actual, nativeOr)
		}
	})

	it('matches inclusion-exclusion, boolean-set indicator duality, and Set.prototype.union on random sets', () => {
		const rand = makeRng(0x5eed1234)
		const universeSize = 40

		const sampleSet = (p) => {
			const s = new Set()
			for (let x = 0; x < universeSize; x += 1) {
				if (rand() < p) s.add(x)
			}
			return s
		}

		const intersectSize = (...sets) => {
			let count = 0
			for (const x of sets[0]) {
				if (sets.every((s) => s.has(x))) count += 1
			}
			return count
		}

		for (let trial = 0; trial < 30; trial += 1) {
			const a = sampleSet(0.45)
			const b = sampleSet(0.45)
			const c = sampleSet(0.45)

			// Binary union cross-check
			const ab = orBoolStable(a, b)
			const expectedABSize = a.size + b.size - intersectSize(a, b)
			assert.strictEqual(ab.size, expectedABSize)

			// Independent check against ES2025 Set.prototype.union (Node 22+)
			if (typeof Set.prototype.union === 'function') {
				const nativeUnion = a.union(b)
				assert.deepStrictEqual([...ab], [...nativeUnion])
			}

			// Ternary union cross-check via 3-way inclusion-exclusion
			const abc = orBoolStable(a, b, c)
			const expectedABCSize =
				a.size +
				b.size +
				c.size -
				intersectSize(a, b) -
				intersectSize(a, c) -
				intersectSize(b, c) +
				intersectSize(a, b, c)
			assert.strictEqual(abc.size, expectedABCSize)

			// Pointwise boolean-set indicator duality: x in (A u B u C) <=> or(x in A, x in B, x in C)
			for (let x = 0; x < universeSize; x += 1) {
				assert.strictEqual(
					abc.has(x),
					orBoolStable(a.has(x), b.has(x), c.has(x))
				)
			}
		}
	})
})
