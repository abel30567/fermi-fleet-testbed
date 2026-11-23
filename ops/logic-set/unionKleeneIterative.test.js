import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionKleeneIterative } from './unionKleeneIterative.js'

const KLEENE_VALUES = [true, false, 'unknown']

describe('unionKleeneIterative', () => {
	it('satisfies the complete 3x3 strong Kleene disjunction truth table', () => {
		const expected = [
			[true, true, true],
			[true, false, true],
			[true, 'unknown', true],
			[false, true, true],
			[false, false, false],
			[false, 'unknown', 'unknown'],
			['unknown', true, true],
			['unknown', false, 'unknown'],
			['unknown', 'unknown', 'unknown'],
		]

		for (const [left, right, want] of expected) {
			assert.deepStrictEqual(
				unionKleeneIterative({ x: left }, { x: right }),
				{ x: want },
				`expected ${String(left)} ∨ ${String(right)} === ${String(want)}`
			)
		}
	})

	it('treats absent keys as unknown under partial-set semantics', () => {
		const a = { onlyTrueA: true, onlyFalseA: false, onlyUnknownA: 'unknown', sharedFalse: false }
		const b = { onlyTrueB: true, onlyFalseB: false, onlyUnknownB: 'unknown', sharedFalse: false }

		assert.deepStrictEqual(unionKleeneIterative(a, b), {
			onlyTrueA: true,
			onlyFalseA: 'unknown',
			onlyUnknownA: 'unknown',
			sharedFalse: false,
			onlyTrueB: true,
			onlyFalseB: 'unknown',
			onlyUnknownB: 'unknown',
		})
	})

	it('handles empty partial sets and does not mutate inputs', () => {
		assert.deepStrictEqual(unionKleeneIterative({}, {}), {})

		const a = { p: true, q: false, r: 'unknown' }
		const b = {}
		const snapshotA = { ...a }
		const snapshotB = { ...b }

		assert.deepStrictEqual(unionKleeneIterative(a, b), {
			p: true,
			q: 'unknown',
			r: 'unknown',
		})
		assert.deepStrictEqual(a, snapshotA)
		assert.deepStrictEqual(b, snapshotB)
	})

	it('supports n-ary iterative union of three or more partial sets', () => {
		const s1 = { a: false, b: false, c: false, d: 'unknown', e: true }
		const s2 = { a: false, b: 'unknown', c: false, d: false, e: false }
		const s3 = { a: true, b: false, c: false, d: false }

		assert.deepStrictEqual(unionKleeneIterative(s1, s2, s3), {
			a: true,
			b: 'unknown',
			c: false,
			d: 'unknown',
			e: true,
		})
	})

	it('supports Map partial sets including non-string keys', () => {
		const sym = Symbol('element')
		const objKey = { id: 1 }

		const m1 = new Map([
			[1, true],
			[2, false],
			[sym, 'unknown'],
			[objKey, false],
		])
		const m2 = new Map([
			[1, 'unknown'],
			[2, false],
			[sym, true],
			[3, false],
		])

		const out = unionKleeneIterative(m1, m2)
		assert.ok(out instanceof Map)
		assert.deepStrictEqual(
			out,
			new Map([
				[1, true],
				[2, false],
				[sym, true],
				[objKey, 'unknown'],
				[3, 'unknown'],
			])
		)
		assert.deepStrictEqual(unionKleeneIterative(new Map(), new Map()), new Map())
	})

	it('handles null-prototype objects and literal __proto__ keys safely', () => {
		const a = Object.create(null)
		a.x = true
		a.y = false

		const b = Object.create(null)
		b.y = false
		b.z = 'unknown'

		assert.deepStrictEqual(unionKleeneIterative(a, b), {
			x: true,
			y: false,
			z: 'unknown',
		})

		const p1 = Object.defineProperty({}, '__proto__', {
			value: false,
			enumerable: true,
			configurable: true,
		})
		const p2 = Object.defineProperty({}, '__proto__', {
			value: true,
			enumerable: true,
			configurable: true,
		})
		const res = unionKleeneIterative(p1, p2)
		assert.equal(Object.getPrototypeOf(res), Object.prototype)
		assert.equal(Object.hasOwn(res, '__proto__'), true)
		assert.equal(res['__proto__'], true)
	})

	it('satisfies commutativity, associativity, idempotence, and identity/absorption laws', () => {
		const a = { k1: true, k2: false, k3: 'unknown', k4: false }
		const b = { k1: 'unknown', k2: false, k3: true, k5: true }
		const c = { k1: false, k2: 'unknown', k4: false, k5: 'unknown' }

		assert.deepStrictEqual(unionKleeneIterative(a, b), unionKleeneIterative(b, a))
		assert.deepStrictEqual(
			unionKleeneIterative(unionKleeneIterative(a, b), c),
			unionKleeneIterative(a, unionKleeneIterative(b, c))
		)
		assert.deepStrictEqual(unionKleeneIterative(a, a), a)

		const allFalse = { k1: false, k2: false, k3: false, k4: false }
		const allTrue = { k1: true, k2: true, k3: true, k4: true }
		assert.deepStrictEqual(unionKleeneIterative(a, allFalse), a)
		assert.deepStrictEqual(unionKleeneIterative(a, allTrue), allTrue)
	})

	it('validates arguments and rejects invalid containers, mixed types, and non-Kleene values', () => {
		assert.throws(() => unionKleeneIterative(), TypeError)
		assert.throws(() => unionKleeneIterative({ a: true }), TypeError)

		const badContainers = [null, undefined, 42, 'str', true, [], new Set(), new Date()]
		for (const bad of badContainers) {
			assert.throws(() => unionKleeneIterative(bad, {}), TypeError)
			assert.throws(() => unionKleeneIterative({}, bad), TypeError)
		}

		// Mixed plain object and Map
		assert.throws(() => unionKleeneIterative({}, new Map()), TypeError)
		assert.throws(() => unionKleeneIterative(new Map(), {}), TypeError)

		// Invalid Kleene truth values (including when first set has true, so validation precedes short-circuit)
		const badValues = [null, undefined, 0, 1, 'true', 'false', 'UNKNOWN', {}, []]
		for (const badVal of badValues) {
			assert.throws(() => unionKleeneIterative({ x: badVal }, { x: true }), TypeError)
			assert.throws(() => unionKleeneIterative({ x: true }, { x: badVal }), TypeError)
			assert.throws(
				() => unionKleeneIterative(new Map([['x', true]]), new Map([['x', badVal]])),
				TypeError
			)
		}
	})

	it('cross-check 1: matches exhaustive classical completion (possible-worlds) semantics', () => {
		const keys = ['a', 'b', 'c']

		// Generate all partial sets over keys where each key can be true, false, 'unknown', or absent.
		const states = [true, false, 'unknown', undefined]
		const samplePartialSets = []
		for (const s0 of states) {
			for (const s1 of states) {
				for (const s2 of states) {
					const obj = {}
					if (s0 !== undefined) obj[keys[0]] = s0
					if (s1 !== undefined) obj[keys[1]] = s1
					if (s2 !== undefined) obj[keys[2]] = s2
					samplePartialSets.push(obj)
				}
			}
		}

		// Expand a partial set into all consistent classical total sets (bitmasks over `keys`).
		function completions(ps) {
			let masks = [0]
			for (let bit = 0; bit < keys.length; bit++) {
				const k = keys[bit]
				const v = Object.hasOwn(ps, k) ? ps[k] : 'unknown'
				if (v === true) {
					masks = masks.map((m) => m | (1 << bit))
				} else if (v === 'unknown') {
					const next = []
					for (const m of masks) {
						next.push(m)
						next.push(m | (1 << bit))
					}
					masks = next
				}
			}
			return masks
		}

		// Cross-check every pair among all 64 partial sets (4,096 pairs total).
		for (const p1 of samplePartialSets) {
			const c1 = completions(p1)
			for (const p2 of samplePartialSets) {
				const c2 = completions(p2)
				const actual = unionKleeneIterative(p1, p2)

				const expected = {}
				for (let bit = 0; bit < keys.length; bit++) {
					const k = keys[bit]
					if (!Object.hasOwn(p1, k) && !Object.hasOwn(p2, k)) {
						continue
					}
					let allIn = true
					let noneIn = true
					for (const m1 of c1) {
						for (const m2 of c2) {
							const inUnion = ((m1 | m2) & (1 << bit)) !== 0
							if (inUnion) {
								noneIn = false
							} else {
								allIn = false
							}
						}
					}
					expected[k] = allIn ? true : noneIn ? false : 'unknown'
				}

				assert.deepStrictEqual(actual, expected)
			}
		}
	})

	it('cross-check 2: matches bipartite (P, N) partial-set algebra and Kleene De Morgan law', () => {
		function kleeneNot(v) {
			if (v === true) return false
			if (v === false) return true
			return 'unknown'
		}

		function kleeneAnd(x, y) {
			if (x === false || y === false) return false
			if (x === 'unknown' || y === 'unknown') return 'unknown'
			return true
		}

		// Independent oracle via (P, N) = (P_a ∪ P_b, N_a ∩ N_b)
		function bipartiteUnion(a, b) {
			const keys = new Set([...Object.keys(a), ...Object.keys(b)])
			const posA = new Set([...Object.keys(a)].filter((k) => a[k] === true))
			const negA = new Set([...Object.keys(a)].filter((k) => a[k] === false))
			const posB = new Set([...Object.keys(b)].filter((k) => b[k] === true))
			const negB = new Set([...Object.keys(b)].filter((k) => b[k] === false))

			const out = {}
			for (const k of keys) {
				if (posA.has(k) || posB.has(k)) {
					out[k] = true
				} else if (negA.has(k) && negB.has(k)) {
					out[k] = false
				} else {
					out[k] = 'unknown'
				}
			}
			return out
		}

		// Independent oracle via De Morgan: A ∪ B = ¬(¬A ∩ ¬B)
		function deMorganUnion(a, b) {
			const keys = new Set([...Object.keys(a), ...Object.keys(b)])
			const out = {}
			for (const k of keys) {
				const va = Object.hasOwn(a, k) ? a[k] : 'unknown'
				const vb = Object.hasOwn(b, k) ? b[k] : 'unknown'
				out[k] = kleeneNot(kleeneAnd(kleeneNot(va), kleeneNot(vb)))
			}
			return out
		}

		// Deterministic LCG PRNG for 100 larger partial-set pairs
		let seed = 0x12345678
		function nextInt(max) {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed % max
		}

		const domain = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']
		for (let trial = 0; trial < 100; trial++) {
			const a = {}
			const b = {}
			for (const k of domain) {
				const pickA = nextInt(4)
				if (pickA < 3) a[k] = KLEENE_VALUES[pickA]
				const pickB = nextInt(4)
				if (pickB < 3) b[k] = KLEENE_VALUES[pickB]
			}
			const actual = unionKleeneIterative(a, b)
			assert.deepStrictEqual(actual, bipartiteUnion(a, b))
			assert.deepStrictEqual(actual, deMorganUnion(a, b))
		}
	})
})
