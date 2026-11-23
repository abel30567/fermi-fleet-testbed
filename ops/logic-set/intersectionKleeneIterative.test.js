import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionKleeneIterative } from './intersectionKleeneIterative.js'

describe('intersectionKleeneIterative', () => {
	test('computes the complete 3x3 strong Kleene (K3) conjunction truth table', () => {
		const values = [true, false, 'unknown']
		const expectedTable = new Map([
			['true,true', true],
			['true,false', false],
			['true,unknown', 'unknown'],
			['false,true', false],
			['false,false', false],
			['false,unknown', false],
			['unknown,true', 'unknown'],
			['unknown,false', false],
			['unknown,unknown', 'unknown'],
		])

		const left = {}
		const right = {}
		const expected = {}

		for (const a of values) {
			for (const b of values) {
				const key = `${String(a)},${String(b)}`
				left[key] = a
				right[key] = b
				expected[key] = expectedTable.get(key)
			}
		}

		assert.deepEqual(intersectionKleeneIterative(left, right), expected)
	})

	test('handles partial sets with missing keys under default open-world semantics', () => {
		const left = { a: true, b: false, c: 'unknown' }
		const right = { a: true, d: true, e: false, f: 'unknown' }

		const result = intersectionKleeneIterative(left, right)
		assert.deepEqual(result, {
			a: true,
			b: false, // false AND unknown = false
			c: 'unknown', // unknown AND unknown = unknown
			d: 'unknown', // unknown AND true = unknown
			e: false, // unknown AND false = false
			f: 'unknown', // unknown AND unknown = unknown
		})
	})

	test('supports Map inputs including non-string keys and mixed Map/object inputs', () => {
		const objKey = { id: 1 }
		const symKey = Symbol('k')
		const left = new Map([
			[1, true],
			[2, false],
			[objKey, 'unknown'],
			[symKey, true],
			[NaN, true],
		])
		const right = new Map([
			[1, true],
			[2, 'unknown'],
			[objKey, true],
			[symKey, false],
			[NaN, 'unknown'],
			[99, false],
		])

		const result = intersectionKleeneIterative(left, right)
		assert.ok(result instanceof Map)
		assert.equal(result.get(1), true)
		assert.equal(result.get(2), false)
		assert.equal(result.get(objKey), 'unknown')
		assert.equal(result.get(symKey), false)
		assert.equal(result.get(NaN), 'unknown')
		assert.equal(result.get(99), false)
		assert.equal(result.size, 6)

		// Mixed Map and plain object returns a Map
		const mixed = intersectionKleeneIterative(
			new Map([['x', true], ['y', false]]),
			{ x: 'unknown', z: true }
		)
		assert.ok(mixed instanceof Map)
		assert.deepEqual([...mixed.entries()], [
			['x', 'unknown'],
			['y', false],
			['z', 'unknown'],
		])
	})

	test('normalizes null truth values to "unknown" in inputs and options.missing', () => {
		const left = { a: null, b: false, c: true }
		const right = { a: true, b: null, d: null }

		assert.deepEqual(intersectionKleeneIterative(left, right, { missing: null }), {
			a: 'unknown',
			b: false,
			c: 'unknown',
			d: 'unknown',
		})
	})

	test('supports closed-world semantics via options.missing = false and explicit options.universe', () => {
		const left = { a: true, b: 'unknown', c: true }
		const right = { a: true, d: true }

		assert.deepEqual(intersectionKleeneIterative(left, right, { missing: false }), {
			a: true,
			b: false,
			c: false,
			d: false,
		})

		const withUniverse = intersectionKleeneIterative(left, right, {
			universe: ['a', 'b', 'e', 'a'], // includes unseen element and duplicate
		})
		assert.deepEqual(withUniverse, {
			a: true,
			b: 'unknown',
			e: 'unknown',
		})
	})

	test('handles empty sets, null-prototype objects, and special keys safely without mutating inputs', () => {
		assert.deepEqual(intersectionKleeneIterative({}, {}), {})
		const emptyMapRes = intersectionKleeneIterative(new Map(), new Map())
		assert.ok(emptyMapRes instanceof Map)
		assert.equal(emptyMapRes.size, 0)

		const left = Object.create(null)
		left.a = true
		left['__proto__'] = false
		left.toString = 'unknown'

		const right = Object.create(null)
		right.a = 'unknown'
		right['__proto__'] = true
		right.toString = true

		const snapshotLeft = { ...left }
		const snapshotRight = { ...right }

		const res = intersectionKleeneIterative(left, right)
		assert.equal(Object.getPrototypeOf(res), Object.prototype)
		assert.equal(Object.prototype.hasOwnProperty.call(res, '__proto__'), true)
		assert.equal(res['__proto__'], false)
		assert.equal(res.a, 'unknown')
		assert.equal(res.toString, 'unknown')
		assert.deepEqual({ ...left }, snapshotLeft)
		assert.deepEqual({ ...right }, snapshotRight)
	})

	test('validates inputs strictly and throws TypeError on invalid arguments', () => {
		assert.throws(() => intersectionKleeneIterative(null, {}), TypeError)
		assert.throws(() => intersectionKleeneIterative({}, undefined), TypeError)
		assert.throws(() => intersectionKleeneIterative([], {}), TypeError)
		assert.throws(() => intersectionKleeneIterative(new Set(), {}), TypeError)
		assert.throws(() => intersectionKleeneIterative({ a: 1 }, {}), TypeError)
		assert.throws(() => intersectionKleeneIterative({}, { b: 'maybe' }), TypeError)
		assert.throws(() => intersectionKleeneIterative({ a: undefined }, {}), TypeError)
		assert.throws(
			() => intersectionKleeneIterative(new Map([['a', 'true']]), new Map()),
			TypeError
		)
		assert.throws(() => intersectionKleeneIterative({}, {}, null), TypeError)
		assert.throws(() => intersectionKleeneIterative({}, {}, { missing: 'no' }), TypeError)
		assert.throws(() => intersectionKleeneIterative({}, {}, { universe: 'abc' }), TypeError)
		assert.throws(() => intersectionKleeneIterative({}, {}, { universe: 123 }), TypeError)
		assert.throws(
			() => intersectionKleeneIterative({ a: true }, { a: true }, { universe: [1] }),
			TypeError
		)
		// Even with a narrow universe, invalid values elsewhere in the partial sets are rejected
		assert.throws(
			() => intersectionKleeneIterative({ a: true, bad: 42 }, { a: true }, { universe: ['a'] }),
			TypeError
		)
	})

	test('independent cross-check 1: numeric lattice rank isomorphism and lower/upper rough-set bounds', () => {
		// Deterministic PRNG (Mulberry32) for reproducible randomized partial sets
		let seed = 0x51a7c0de
		const nextRand = () => {
			seed = (seed + 0x6d2b79f5) | 0
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296
		}

		const palette = [true, false, 'unknown', undefined] // undefined => omit key from partial set
		const rank = (v) => (v === false ? 0 : v === true ? 2 : 1)
		const unrank = (r) => (r === 0 ? false : r === 2 ? true : 'unknown')

		const universe = Array.from({ length: 20 }, (_, i) => `e${i}`)

		for (let trial = 0; trial < 100; trial++) {
			const a = {}
			const b = {}
			const aLower = new Set()
			const aUpper = new Set()
			const bLower = new Set()
			const bUpper = new Set()

			for (const el of universe) {
				const va = palette[Math.floor(nextRand() * palette.length)]
				const vb = palette[Math.floor(nextRand() * palette.length)]
				if (va !== undefined) a[el] = va
				if (vb !== undefined) b[el] = vb

				const effA = va === undefined ? 'unknown' : va
				const effB = vb === undefined ? 'unknown' : vb
				if (effA === true) aLower.add(el)
				if (effA !== false) aUpper.add(el)
				if (effB === true) bLower.add(el)
				if (effB !== false) bUpper.add(el)
			}

			const actual = intersectionKleeneIterative(a, b, { universe })

			for (const el of universe) {
				// Cross-check A: Kleene conjunction == min in truth lattice (false < unknown < true)
				const effA = Object.prototype.hasOwnProperty.call(a, el) ? a[el] : 'unknown'
				const effB = Object.prototype.hasOwnProperty.call(b, el) ? b[el] : 'unknown'
				const expectedLattice = unrank(Math.min(rank(effA), rank(effB)))
				assert.equal(actual[el], expectedLattice)

				// Cross-check B: Componentwise intersection of rough-set bounds (L_A ∩ L_B, U_A ∩ U_B)
				const inLower = aLower.has(el) && bLower.has(el)
				const inUpper = aUpper.has(el) && bUpper.has(el)
				const expectedBounds = inLower ? true : !inUpper ? false : 'unknown'
				assert.equal(actual[el], expectedBounds)
			}
		}
	})

	test('independent cross-check 2: exhaustive classical completions (supervaluation) & algebraic laws', () => {
		const universe = ['x', 'y', 'z']
		const a = { x: true, y: 'unknown', z: false }
		const b = { x: 'unknown', y: 'unknown', z: 'unknown' }
		const c = { x: true, y: false, z: true }

		// Enumerate all classical completions (bitmasks) consistent with a partial set
		const completions = (ps) => {
			const results = []
			const n = universe.length
			for (let mask = 0; mask < 1 << n; mask++) {
				let consistent = true
				for (let i = 0; i < n; i++) {
					const val = Object.prototype.hasOwnProperty.call(ps, universe[i])
						? ps[universe[i]]
						: 'unknown'
					const bit = Boolean(mask & (1 << i))
					if (val === true && !bit) consistent = false
					if (val === false && bit) consistent = false
				}
				if (consistent) results.push(mask)
			}
			return results
		}

		const compA = completions(a)
		const compB = completions(b)
		const actual = intersectionKleeneIterative(a, b, { universe })

		for (let i = 0; i < universe.length; i++) {
			let seenTrue = false
			let seenFalse = false
			for (const ma of compA) {
				for (const mb of compB) {
					if ((ma & mb) & (1 << i)) {
						seenTrue = true
					} else {
						seenFalse = true
					}
				}
			}
			const expected =
				seenTrue && !seenFalse ? true : !seenTrue && seenFalse ? false : 'unknown'
			assert.equal(actual[universe[i]], expected)
		}

		// Algebraic laws: commutativity, associativity, idempotence, identity, annihilator
		const allTrue = { x: true, y: true, z: true }
		const allFalse = { x: false, y: false, z: false }

		assert.deepEqual(
			intersectionKleeneIterative(a, b, { universe }),
			intersectionKleeneIterative(b, a, { universe })
		)
		assert.deepEqual(
			intersectionKleeneIterative(
				intersectionKleeneIterative(a, b, { universe }),
				c,
				{ universe }
			),
			intersectionKleeneIterative(
				a,
				intersectionKleeneIterative(b, c, { universe }),
				{ universe }
			)
		)
		assert.deepEqual(intersectionKleeneIterative(a, a, { universe }), a)
		assert.deepEqual(intersectionKleeneIterative(a, allTrue, { universe }), a)
		assert.deepEqual(intersectionKleeneIterative(a, allFalse, { universe }), allFalse)
	})

	test('handles large partial sets iteratively without stack issues', () => {
		const size = 50000
		const left = new Map()
		const right = new Map()
		for (let i = 0; i < size; i++) {
			left.set(i, i % 3 === 0 ? true : i % 3 === 1 ? false : 'unknown')
			right.set(i, i % 2 === 0 ? true : 'unknown')
		}

		const res = intersectionKleeneIterative(left, right)
		assert.equal(res.size, size)
		assert.equal(res.get(0), true) // true & true
		assert.equal(res.get(1), false) // false & unknown
		assert.equal(res.get(2), 'unknown') // unknown & true
		assert.equal(res.get(3), 'unknown') // true & unknown
		assert.equal(res.get(4), false) // false & true
		assert.equal(res.get(5), 'unknown') // unknown & unknown
	})
})
