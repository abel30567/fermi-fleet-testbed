import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceBoolSeries } from './setDifferenceBoolSeries.js'

function setsEqual(a, b) {
	if (a.size !== b.size) return false
	for (const x of a) {
		if (!b.has(x)) return false
	}
	return true
}

function setUnion(a, b) {
	const out = new Set(a)
	for (const x of b) out.add(x)
	return out
}

function setIntersection(a, b) {
	const out = new Set()
	for (const x of a) {
		if (b.has(x)) out.add(x)
	}
	return out
}

describe('setDifferenceBoolSeries', () => {
	describe('plain booleans', () => {
		it('matches the complete truth table for material nonimplication (a && !b)', () => {
			assert.equal(setDifferenceBoolSeries(false, false), false)
			assert.equal(setDifferenceBoolSeries(false, true), false)
			assert.equal(setDifferenceBoolSeries(true, false), true)
			assert.equal(setDifferenceBoolSeries(true, true), false)
		})

		it('cross-checks against independent boolean identities', () => {
			const bools = [false, true]
			for (const a of bools) {
				for (const b of bools) {
					const actual = setDifferenceBoolSeries(a, b)
					const direct = a && !b
					const deMorgan = !(!a || b)
					const xorForm = a && (a !== b)
					assert.equal(actual, direct)
					assert.equal(actual, deMorgan)
					assert.equal(actual, xorForm)
				}
			}
		})
	})

	describe('JS Set objects', () => {
		it('computes difference of overlapping, disjoint, and subset/superset sets', () => {
			const overlapping = setDifferenceBoolSeries(new Set([1, 2, 3]), new Set([2, 3, 4]))
			assert.deepEqual([...overlapping], [1])

			const disjoint = setDifferenceBoolSeries(new Set(['a', 'b']), new Set(['c', 'd']))
			assert.deepEqual([...disjoint], ['a', 'b'])

			const subset = setDifferenceBoolSeries(new Set([1, 2]), new Set([1, 2, 3]))
			assert.deepEqual([...subset], [])

			const superset = setDifferenceBoolSeries(new Set([1, 2, 3]), new Set([2]))
			assert.deepEqual([...superset], [1, 3])
		})

		it('handles empty sets and identical set references', () => {
			assert.deepEqual([...setDifferenceBoolSeries(new Set(), new Set())], [])
			assert.deepEqual([...setDifferenceBoolSeries(new Set(), new Set([1, 2]))], [])
			assert.deepEqual([...setDifferenceBoolSeries(new Set([1, 2]), new Set())], [1, 2])

			const same = new Set([10, 20, 30])
			const diffSame = setDifferenceBoolSeries(same, same)
			assert.equal(diffSame.size, 0)
			assert.notEqual(diffSame, same)
			assert.deepEqual([...same], [10, 20, 30])
		})

		it('does not mutate inputs and preserves insertion order', () => {
			const a = new Set(['z', 'a', 'm', 'b'])
			const b = new Set(['a', 'x'])
			const result = setDifferenceBoolSeries(a, b)

			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual([...result], ['z', 'm', 'b'])
			assert.deepEqual([...a], ['z', 'a', 'm', 'b'])
			assert.deepEqual([...b], ['a', 'x'])
		})

		it('follows SameValueZero semantics for NaN, -0/+0, objects, symbols, null, undefined', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym1 = Symbol('s1')
			const sym2 = Symbol('s2')

			const a = new Set([NaN, -0, null, undefined, obj1, obj2, sym1, sym2, true, false])
			const b = new Set([NaN, +0, null, obj2, sym1, false])
			const result = setDifferenceBoolSeries(a, b)

			assert.deepEqual([...result], [undefined, obj1, sym2, true])
			assert.equal(result.has(NaN), false)
			assert.equal(result.has(0), false)
		})

		it('handles large sets efficiently and accurately', () => {
			const a = new Set()
			const b = new Set()
			for (let i = 0; i < 10000; i++) {
				a.add(i)
				if (i % 2 === 0) b.add(i)
			}
			const result = setDifferenceBoolSeries(a, b)
			assert.equal(result.size, 5000)
			assert.equal(result.has(0), false)
			assert.equal(result.has(1), true)
			assert.equal(result.has(9999), true)
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		it('agrees with array-filter reference, built-in Set.prototype.difference, and set-algebra identities', () => {
			const universe = new Set([0, 1, 2, 3, 4, 5, 6, 7])
			// Deterministic subsets from bitmasks
			const masks = [0x00, 0x0f, 0xf0, 0xaa, 0x55, 0x3c, 0xc3, 0xff, 0x13, 0x69]
			const subsets = masks.map((mask) => {
				const s = new Set()
				for (let bit = 0; bit < 8; bit++) {
					if ((mask & (1 << bit)) !== 0) s.add(bit)
				}
				return s
			})

			for (const a of subsets) {
				for (const b of subsets) {
					const diff = setDifferenceBoolSeries(a, b)
					const refFilter = new Set([...a].filter((x) => !b.has(x)))
					assert.equal(setsEqual(diff, refFilter), true)

					if (typeof Set.prototype.difference === 'function') {
						assert.equal(setsEqual(diff, a.difference(b)), true)
					}

					// Cardinality law: |A \ B| = |A| - |A ∩ B|
					const inter = setIntersection(a, b)
					assert.equal(diff.size, a.size - inter.size)

					// Partition laws: (A \ B) ∩ B = ∅ and (A \ B) ∪ (A ∩ B) = A
					assert.equal(setIntersection(diff, b).size, 0)
					assert.equal(setsEqual(setUnion(diff, inter), a), true)

					// Relative De Morgan's laws over universe U
					const compUnion = setDifferenceBoolSeries(universe, setUnion(a, b))
					const interComps = setIntersection(
						setDifferenceBoolSeries(universe, a),
						setDifferenceBoolSeries(universe, b)
					)
					assert.equal(setsEqual(compUnion, interComps), true)

					const compInter = setDifferenceBoolSeries(universe, inter)
					const unionComps = setUnion(
						setDifferenceBoolSeries(universe, a),
						setDifferenceBoolSeries(universe, b)
					)
					assert.equal(setsEqual(compInter, unionComps), true)
				}

				// Double relative complement involution: U \ (U \ A) = A
				const doubleComp = setDifferenceBoolSeries(
					universe,
					setDifferenceBoolSeries(universe, a)
				)
				assert.equal(setsEqual(doubleComp, a), true)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError on mixed boolean and Set operands', () => {
			assert.throws(() => setDifferenceBoolSeries(true, new Set([true])), TypeError)
			assert.throws(() => setDifferenceBoolSeries(new Set([false]), false), TypeError)
		})

		it('throws TypeError on invalid operand types or missing arguments', () => {
			const invalidPairs = [
				[undefined, undefined],
				[true, undefined],
				[new Set(), undefined],
				[null, null],
				[1, 0],
				['true', 'false'],
				[[1, 2], [2]],
				[{ a: 1 }, { a: 1 }],
				[new Boolean(true), new Boolean(false)],
				[new Boolean(true), false],
				[new Map(), new Map()],
			]

			for (const [a, b] of invalidPairs) {
				assert.throws(() => setDifferenceBoolSeries(a, b), TypeError)
			}
		})
	})
})
