import { describe, test } from 'node:test'
import assert from 'node:assert'
import { setDifferenceKleeneIterative } from './setDifferenceKleeneIterative.js'

const KLEENE_VALUES = [true, false, 'unknown']

describe('setDifferenceKleeneIterative', () => {
	test('exhaustive 3x3 strong Kleene K3 truth table (plain objects)', () => {
		const a = {}
		const b = {}
		const expected = {
			'true|true': false,
			'true|false': true,
			'true|unknown': 'unknown',
			'false|true': false,
			'false|false': false,
			'false|unknown': false,
			'unknown|true': false,
			'unknown|false': 'unknown',
			'unknown|unknown': 'unknown',
		}

		for (const va of KLEENE_VALUES) {
			for (const vb of KLEENE_VALUES) {
				const key = `${va}|${vb}`
				a[key] = va
				b[key] = vb
			}
		}

		const actual = setDifferenceKleeneIterative(a, b)
		assert.deepStrictEqual(actual, expected)
	})

	test('works with Map partial sets including non-string keys', () => {
		const objKey = { id: 1 }
		const symKey = Symbol('elem')

		const a = new Map([
			[1, true],
			[2, true],
			[3, 'unknown'],
			[NaN, true],
			[objKey, 'unknown'],
			[symKey, false],
			[null, true],
		])
		const b = new Map([
			[1, false],
			[2, true],
			[3, false],
			[NaN, 'unknown'],
			[objKey, true],
			[symKey, 'unknown'],
			[undefined, true],
		])

		const result = setDifferenceKleeneIterative(a, b)
		assert.ok(result instanceof Map)
		assert.strictEqual(result.get(1), true)
		assert.strictEqual(result.get(2), false)
		assert.strictEqual(result.get(3), 'unknown')
		assert.strictEqual(result.get(NaN), 'unknown')
		assert.strictEqual(result.get(objKey), false)
		assert.strictEqual(result.get(symKey), false)
		assert.strictEqual(result.get(null), true)
		assert.strictEqual(result.get(undefined), false)
		assert.strictEqual(result.size, 8)
	})

	test('handles asymmetric keys under default closed-world semantics (missing = false)', () => {
		const a = { onlyATrue: true, onlyAUnknown: 'unknown', onlyAFalse: false }
		const b = { onlyBTrue: true, onlyBUnknown: 'unknown', onlyBFalse: false }

		assert.deepStrictEqual(setDifferenceKleeneIterative(a, b), {
			onlyATrue: true,
			onlyAUnknown: 'unknown',
			onlyAFalse: false,
			onlyBTrue: false,
			onlyBUnknown: false,
			onlyBFalse: false,
		})
	})

	test('supports open-world semantics via { missing: "unknown" }', () => {
		const a = { aTrue: true, aFalse: false, aUnknown: 'unknown' }
		const b = { bTrue: true, bFalse: false, bUnknown: 'unknown' }

		const openWorld = setDifferenceKleeneIterative(a, b, { missing: 'unknown' })
		assert.deepStrictEqual(openWorld, {
			aTrue: 'unknown',
			aFalse: false,
			aUnknown: 'unknown',
			bTrue: false,
			bFalse: 'unknown',
			bUnknown: 'unknown',
		})

		// Cross-check: open-world missing='unknown' equals explicitly padding missing keys with 'unknown'
		const paddedA = { ...a, bTrue: 'unknown', bFalse: 'unknown', bUnknown: 'unknown' }
		const paddedB = { ...b, aTrue: 'unknown', aFalse: 'unknown', aUnknown: 'unknown' }
		assert.deepStrictEqual(openWorld, setDifferenceKleeneIterative(paddedA, paddedB))
	})

	test('edge cases: empty sets, self-difference, null-prototype, __proto__ key, immutability', () => {
		assert.deepStrictEqual(setDifferenceKleeneIterative({}, {}), {})
		assert.deepStrictEqual(setDifferenceKleeneIterative(new Map(), new Map()), new Map())

		// Self-difference in K3: true \ true = false, false \ false = false, unknown \ unknown = unknown
		const selfSet = { x: true, y: false, z: 'unknown' }
		const selfSnapshot = { ...selfSet }
		assert.deepStrictEqual(setDifferenceKleeneIterative(selfSet, selfSet), {
			x: false,
			y: false,
			z: 'unknown',
		})
		// Inputs are not mutated
		assert.deepStrictEqual(selfSet, selfSnapshot)

		// Null-prototype objects
		const nullProtoA = Object.assign(Object.create(null), { p: true, q: 'unknown' })
		const nullProtoB = Object.assign(Object.create(null), { p: false, q: true })
		assert.deepStrictEqual(setDifferenceKleeneIterative(nullProtoA, nullProtoB), {
			p: true,
			q: false,
		})

		// Literal "__proto__" own key handled safely without prototype pollution
		const protoA = JSON.parse('{"__proto__": true, "safe": "unknown"}')
		const protoB = JSON.parse('{"__proto__": false, "safe": true}')
		const protoRes = setDifferenceKleeneIterative(protoA, protoB)
		assert.strictEqual(Object.getPrototypeOf(protoRes), Object.prototype)
		assert.strictEqual(Object.hasOwn(protoRes, '__proto__'), true)
		assert.strictEqual(protoRes['__proto__'], true)
		assert.strictEqual(protoRes.safe, false)
	})

	test('input validation rejects malformed sets, mismatched kinds, and invalid Kleene values', () => {
		// Invalid container types
		for (const bad of [null, undefined, 42, 'abc', true, [], new Set(), new Date(), /re/]) {
			assert.throws(() => setDifferenceKleeneIterative(bad, {}), TypeError)
			assert.throws(() => setDifferenceKleeneIterative({}, bad), TypeError)
		}

		// Mixed Map and plain object
		assert.throws(() => setDifferenceKleeneIterative(new Map(), {}), TypeError)
		assert.throws(() => setDifferenceKleeneIterative({}, new Map()), TypeError)

		// Invalid Kleene values in a or b (even when other side is false or key is disjoint)
		for (const badVal of [null, undefined, 0, 1, 'true', 'false', 'UNKNOWN', {}, [], NaN]) {
			assert.throws(() => setDifferenceKleeneIterative({ x: badVal }, { x: true }), TypeError)
			assert.throws(() => setDifferenceKleeneIterative({ x: false }, { x: badVal }), TypeError)
			assert.throws(() => setDifferenceKleeneIterative({ x: true }, { y: badVal }), TypeError)
			assert.throws(
				() => setDifferenceKleeneIterative(new Map([['x', badVal]]), new Map()),
				TypeError
			)
			assert.throws(
				() => setDifferenceKleeneIterative(new Map([['x', false]]), new Map([['x', badVal]])),
				TypeError
			)
			assert.throws(
				() => setDifferenceKleeneIterative(new Map(), new Map([['y', badVal]])),
				TypeError
			)
		}

		// Invalid options
		assert.throws(() => setDifferenceKleeneIterative({}, {}, null), TypeError)
		assert.throws(() => setDifferenceKleeneIterative({}, {}, 'invalid'), TypeError)
		assert.throws(() => setDifferenceKleeneIterative({}, {}, { missing: null }), TypeError)
		assert.throws(() => setDifferenceKleeneIterative({}, {}, { missing: 0 }), TypeError)
	})

	test('independent cross-check 1: numeric De Morgan / Kleene lattice encoding min(a, -b)', () => {
		const toNum = (v) => (v === true ? 1 : v === false ? -1 : 0)
		const fromNum = (n) => (n === 1 ? true : n === -1 ? false : 'unknown')

		const a = new Map()
		const b = new Map()
		let idx = 0
		for (const va of KLEENE_VALUES) {
			for (const vb of KLEENE_VALUES) {
				a.set(idx, va)
				b.set(idx, vb)
				idx++
			}
		}

		const result = setDifferenceKleeneIterative(a, b)
		for (let i = 0; i < idx; i++) {
			const expected = fromNum(Math.min(toNum(a.get(i)), -toNum(b.get(i))))
			assert.strictEqual(result.get(i), expected)
		}
	})

	test('independent cross-check 2: possible-worlds classical completion semantics', () => {
		// Given a partial set over domain keys, generate all classical total Sets
		// obtained by resolving every 'unknown' entry to either true or false.
		function classicalCompletions(partialSet, domain) {
			let worlds = [new Set()]
			for (const key of domain) {
				const val = Object.hasOwn(partialSet, key) ? partialSet[key] : false
				if (val === true) {
					for (const w of worlds) w.add(key)
				} else if (val === 'unknown') {
					const next = []
					for (const w of worlds) {
						next.push(new Set(w))
						const withKey = new Set(w)
						withKey.add(key)
						next.push(withKey)
					}
					worlds = next
				}
			}
			return worlds
		}

		const domain = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5']
		const a = { e0: true, e1: true, e2: 'unknown', e3: false, e4: 'unknown', e5: true }
		const b = { e0: false, e1: 'unknown', e2: false, e3: 'unknown', e4: true, e5: true }

		const completionsA = classicalCompletions(a, domain)
		const completionsB = classicalCompletions(b, domain)

		// Compute classical set difference across all independent pairs of completions
		const allDiffs = []
		for (const wa of completionsA) {
			for (const wb of completionsB) {
				const diff = new Set()
				for (const item of wa) {
					if (!wb.has(item)) diff.add(item)
				}
				allDiffs.push(diff)
			}
		}

		const actual = setDifferenceKleeneIterative(a, b)
		for (const key of domain) {
			const alwaysIn = allDiffs.every((d) => d.has(key))
			const neverIn = allDiffs.every((d) => !d.has(key))
			const semanticExpected = alwaysIn ? true : neverIn ? false : 'unknown'
			assert.strictEqual(actual[key], semanticExpected)
		}
	})

	test('independent cross-check 3: knowledge-order monotonicity (Kleene regularity)', () => {
		// Information order: 'unknown' <=_k true, 'unknown' <=_k false, x <=_k x
		const leqK = (x, y) => x === 'unknown' || x === y

		for (const a1 of KLEENE_VALUES) {
			for (const a2 of KLEENE_VALUES) {
				if (!leqK(a1, a2)) continue
				for (const b1 of KLEENE_VALUES) {
					for (const b2 of KLEENE_VALUES) {
						if (!leqK(b1, b2)) continue
						const r1 = setDifferenceKleeneIterative({ k: a1 }, { k: b1 }).k
						const r2 = setDifferenceKleeneIterative({ k: a2 }, { k: b2 }).k
						assert.ok(
							leqK(r1, r2),
							`Monotonicity violated: (${a1}\\${b1})=${r1} not <=_k (${a2}\\${b2})=${r2}`
						)
					}
				}
			}
		}
	})

	test('handles large partial sets iteratively in linear time', () => {
		const n = 20000
		const a = new Map()
		const b = new Map()
		for (let i = 0; i < n; i++) {
			a.set(i, KLEENE_VALUES[i % 3])
			b.set(i, KLEENE_VALUES[Math.floor(i / 3) % 3])
		}

		const result = setDifferenceKleeneIterative(a, b)
		assert.strictEqual(result.size, n)
		// Spot-check periodic pattern
		assert.strictEqual(result.get(0), false) // true \ true
		assert.strictEqual(result.get(3), true) // true \ false
		assert.strictEqual(result.get(6), 'unknown') // true \ unknown
		assert.strictEqual(result.get(5), 'unknown') // unknown \ false
	})
})
