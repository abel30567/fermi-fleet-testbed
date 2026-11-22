import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { xorMultisetIterative } from './xorMultisetIterative.js'

/**
 * Helper: multiset difference A \ B with multiplicity max(0, m_A(x) - m_B(x)),
 * returning a canonical Map (omitting 0 counts).
 */
function multisetDiff(a, b) {
	const out = new Map()
	for (const [k, ca] of a) {
		const cb = b.get(k) ?? 0
		const d = ca - cb
		if (d > 0) {
			out.set(k, d)
		}
	}
	return out
}

/**
 * Helper: multiset max-union A ∪ B with multiplicity max(m_A(x), m_B(x)),
 * returning a canonical Map (omitting 0 counts).
 */
function multisetUnion(a, b) {
	const out = new Map()
	const keys = new Set([...a.keys(), ...b.keys()])
	for (const k of keys) {
		const m = Math.max(a.get(k) ?? 0, b.get(k) ?? 0)
		if (m > 0) {
			out.set(k, m)
		}
	}
	return out
}

/**
 * Helper: independent array-bag cancellation reference implementation.
 * Expands both multisets into flat element arrays, cancels matching items
 * one-by-one (SameValueZero), and recounts remaining elements into a Map.
 */
function arrayBagXor(a, b) {
	const bagA = []
	for (const [k, count] of a) {
		for (let i = 0; i < count; i++) {
			bagA.push(k)
		}
	}
	const bagB = []
	for (const [k, count] of b) {
		for (let i = 0; i < count; i++) {
			bagB.push(k)
		}
	}

	const sameValueZero = (x, y) => x === y || (Number.isNaN(x) && Number.isNaN(y))
	const remainingA = []
	const remainingB = [...bagB]

	for (const item of bagA) {
		const idx = remainingB.findIndex((candidate) => sameValueZero(candidate, item))
		if (idx !== -1) {
			remainingB.splice(idx, 1)
		} else {
			remainingA.push(item)
		}
	}

	const result = new Map()
	for (const item of [...remainingA, ...remainingB]) {
		result.set(item, (result.get(item) ?? 0) + 1)
	}
	return result
}

/**
 * Helper: simple deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function mulberry32(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('xorMultisetIterative', () => {
	describe('normal cases', () => {
		it('computes |countA - countB| for overlapping, disjoint, and equal-count keys', () => {
			const a = new Map([
				['apple', 5],
				['banana', 2],
				['cherry', 3],
				['date', 4],
			])
			const b = new Map([
				['apple', 2],
				['banana', 5],
				['cherry', 3],
				['elderberry', 1],
			])

			const res = xorMultisetIterative(a, b)
			assert.ok(res instanceof Map)
			assert.deepStrictEqual(
				res,
				new Map([
					['apple', 3],
					['banana', 3],
					['date', 4],
					['elderberry', 1],
				]),
			)
			assert.equal(res.has('cherry'), false)
		})

		it('returns the union of entries for disjoint multisets', () => {
			const a = new Map([
				['x', 2],
				['y', 1],
			])
			const b = new Map([
				['z', 4],
				['w', 3],
			])

			const res = xorMultisetIterative(a, b)
			assert.deepStrictEqual(
				res,
				new Map([
					['x', 2],
					['y', 1],
					['z', 4],
					['w', 3],
				]),
			)
		})

		it('returns an empty Map when inputs have identical counts', () => {
			const a = new Map([
				['a', 1],
				['b', 7],
			])
			const b = new Map([
				['b', 7],
				['a', 1],
			])

			assert.deepStrictEqual(xorMultisetIterative(a, b), new Map())
			assert.deepStrictEqual(xorMultisetIterative(a, a), new Map())
		})

		it('does not mutate input maps', () => {
			const a = new Map([
				['k1', 3],
				['k2', 0],
			])
			const b = new Map([
				['k1', 1],
				['k3', 2],
			])
			const snapshotA = [...a.entries()]
			const snapshotB = [...b.entries()]

			const res = xorMultisetIterative(a, b)
			assert.notEqual(res, a)
			assert.notEqual(res, b)
			assert.deepStrictEqual([...a.entries()], snapshotA)
			assert.deepStrictEqual([...b.entries()], snapshotB)
		})
	})

	describe('edge cases', () => {
		it('handles empty maps and canonicalizes explicit zero and -0 counts', () => {
			assert.deepStrictEqual(xorMultisetIterative(new Map(), new Map()), new Map())

			const a = new Map([
				['zeroOnly', 0],
				['negZero', -0],
				['pos', 3],
			])
			const b = new Map([
				['zeroOnlyB', 0],
				['negZero', 0],
				['onlyB', 2],
			])

			const res = xorMultisetIterative(a, b)
			assert.deepStrictEqual(
				res,
				new Map([
					['pos', 3],
					['onlyB', 2],
				]),
			)
			for (const [, count] of res) {
				assert.ok(count > 0)
				assert.equal(Object.is(count, -0), false)
			}
		})

		it('handles keys with count 0 in a and positive count in b (and vice versa)', () => {
			const a = new Map([
				['x', 0],
				['y', 4],
			])
			const b = new Map([
				['x', 5],
				['y', 0],
			])

			assert.deepStrictEqual(
				xorMultisetIterative(a, b),
				new Map([
					['x', 5],
					['y', 4],
				]),
			)
		})

		it('supports diverse Map key types with SameValueZero semantics', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym = Symbol('tag')
			const nullProto = Object.create(null)

			const a = new Map([
				[NaN, 3],
				[-0, 4],
				[null, 2],
				[undefined, 1],
				[sym, 5],
				[10n, 2],
				[obj1, 3],
				[nullProto, 2],
			])
			const b = new Map([
				[NaN, 1],
				[+0, 4],
				[null, 5],
				[sym, 2],
				[10n, 2],
				[obj2, 1],
				[nullProto, 1],
			])

			const res = xorMultisetIterative(a, b)
			assert.deepStrictEqual(
				res,
				new Map([
					[NaN, 2],
					[null, 3],
					[undefined, 1],
					[sym, 3],
					[obj1, 3],
					[obj2, 1],
					[nullProto, 1],
				]),
			)
			assert.equal(res.has(0), false)
			assert.equal(res.has(10n), false)
		})

		it('handles Number.MAX_SAFE_INTEGER counts accurately without overflow', () => {
			const max = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['same', max],
				['oneApart', max],
				['onlyA', max],
			])
			const b = new Map([
				['same', max],
				['oneApart', max - 1],
				['onlyB', max],
			])

			assert.deepStrictEqual(
				xorMultisetIterative(a, b),
				new Map([
					['oneApart', 1],
					['onlyA', max],
					['onlyB', max],
				]),
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not a Map', () => {
			const valid = new Map([['a', 1]])
			const invalidMaps = [null, undefined, {}, [], new Set(), 'abc', 123, true]

			for (const bad of invalidMaps) {
				assert.throws(() => xorMultisetIterative(bad, valid), TypeError)
				assert.throws(() => xorMultisetIterative(valid, bad), TypeError)
			}
		})

		it('throws TypeError when any multiplicity is not a number', () => {
			const valid = new Map([['a', 1]])
			const badCounts = ['1', 1n, null, undefined, true, {}, []]

			for (const count of badCounts) {
				assert.throws(() => xorMultisetIterative(new Map([['x', count]]), valid), TypeError)
				assert.throws(() => xorMultisetIterative(valid, new Map([['x', count]])), TypeError)
			}
		})

		it('throws RangeError for negative, non-integer, non-finite, or unsafe integer counts', () => {
			const valid = new Map([['a', 1]])
			const badCounts = [
				-1,
				-100,
				0.5,
				2.7,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				-Number.MAX_SAFE_INTEGER - 1,
			]

			for (const count of badCounts) {
				assert.throws(() => xorMultisetIterative(new Map([['x', count]]), valid), RangeError)
				assert.throws(() => xorMultisetIterative(valid, new Map([['x', count]])), RangeError)
			}
		})

		it('still throws cleanly when an unprintable key has an invalid count', () => {
			const unprintable = Object.create(null)
			assert.throws(
				() => xorMultisetIterative(new Map([[unprintable, -1]]), new Map()),
				RangeError,
			)
			assert.throws(
				() => xorMultisetIterative(new Map(), new Map([[unprintable, 'bad']])),
				TypeError,
			)
		})
	})

	describe('cross-checks and algebraic laws', () => {
		it('matches (A \\ B) union (B \\ A) and independent array-bag cancellation on randomized multisets', () => {
			const rand = mulberry32(20261122)
			const universe = ['a', 'b', 'c', 'd', 'e', 'f', 0, NaN, null]

			for (let trial = 0; trial < 100; trial++) {
				const a = new Map()
				const b = new Map()

				for (const key of universe) {
					if (rand() < 0.7) {
						a.set(key, Math.floor(rand() * 8)) // includes occasional 0 counts
					}
					if (rand() < 0.7) {
						b.set(key, Math.floor(rand() * 8))
					}
				}

				const actual = xorMultisetIterative(a, b)
				const viaDiffUnion = multisetUnion(multisetDiff(a, b), multisetDiff(b, a))
				const viaArrayBag = arrayBagXor(a, b)

				// Cross-check 1: (A \ B) ∪ (B \ A)
				assert.deepStrictEqual(actual, viaDiffUnion)

				// Cross-check 2: independent array-bag cancellation
				assert.deepStrictEqual(actual, viaArrayBag)

				// Commutativity: A ⊕ B = B ⊕ A
				assert.deepStrictEqual(actual, xorMultisetIterative(b, a))

				// Cardinality bounds and parity: |A ⊕ B| ≡ |A| + |B| (mod 2)
				const sizeOf = (m) => {
					let s = 0
					for (const c of m.values()) s += c
					return s
				}
				const sizeA = sizeOf(a)
				const sizeB = sizeOf(b)
				const sizeRes = sizeOf(actual)
				assert.ok(sizeRes >= Math.abs(sizeA - sizeB))
				assert.ok(sizeRes <= sizeA + sizeB)
				assert.equal(sizeRes % 2, (sizeA + sizeB) % 2)
			}
		})

		it('agrees with classical set symmetric difference when restricted to 0/1 indicator multisets', () => {
			const setA = new Set([1, 2, 3, 4])
			const setB = new Set([3, 4, 5, 6])

			const msA = new Map([...setA].map((x) => [x, 1]))
			const msB = new Map([...setB].map((x) => [x, 1]))

			const res = xorMultisetIterative(msA, msB)
			assert.deepStrictEqual(
				new Set(res.keys()),
				new Set([1, 2, 5, 6]),
			)
			for (const count of res.values()) {
				assert.equal(count, 1)
			}
		})
	})
})
