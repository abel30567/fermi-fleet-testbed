import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orKleeneIterative } from './orKleeneIterative.js'

const KLEENE_VALUES = [false, null, true]

describe('orKleeneIterative — Kleene K3 scalar & array disjunction', () => {
	test('matches full 3x3 strong Kleene K3 truth table', () => {
		const expected = new Map([
			['false,false', false],
			['false,null', null],
			['false,true', true],
			['null,false', null],
			['null,null', null],
			['null,true', true],
			['true,false', true],
			['true,null', true],
			['true,true', true],
		])

		for (const a of KLEENE_VALUES) {
			for (const b of KLEENE_VALUES) {
				const key = `${String(a)},${String(b)}`
				assert.equal(orKleeneIterative(a, b), expected.get(key), `pair (${key})`)
			}
		}
	})

	test('handles single scalar, variadic, and array operands including empty array', () => {
		assert.equal(orKleeneIterative(true), true)
		assert.equal(orKleeneIterative(false), false)
		assert.equal(orKleeneIterative(null), null)

		assert.equal(orKleeneIterative(false, false, false), false)
		assert.equal(orKleeneIterative(false, null, false), null)
		assert.equal(orKleeneIterative(null, false, true, null), true)

		assert.equal(orKleeneIterative([]), false)
		assert.equal(orKleeneIterative([false, false]), false)
		assert.equal(orKleeneIterative([false, null, false]), null)
		assert.equal(orKleeneIterative([null, null, true]), true)
	})

	test('handles large iterative arrays without stack overflow', () => {
		const size = 100_000
		const allFalse = new Array(size).fill(false)
		assert.equal(orKleeneIterative(allFalse), false)

		const withUnknownAtEnd = allFalse.slice()
		withUnknownAtEnd[size - 1] = null
		assert.equal(orKleeneIterative(withUnknownAtEnd), null)

		const withTrueAtEnd = withUnknownAtEnd.slice()
		withTrueAtEnd[size - 1] = true
		assert.equal(orKleeneIterative(withTrueAtEnd), true)
	})

	test('satisfies algebraic laws (commutativity, associativity, idempotence, identity, absorption)', () => {
		for (const a of KLEENE_VALUES) {
			assert.equal(orKleeneIterative(a, a), a, 'idempotence')
			assert.equal(orKleeneIterative(a, false), a, 'right identity')
			assert.equal(orKleeneIterative(false, a), a, 'left identity')
			assert.equal(orKleeneIterative(a, true), true, 'right absorption')
			assert.equal(orKleeneIterative(true, a), true, 'left absorption')

			for (const b of KLEENE_VALUES) {
				assert.equal(
					orKleeneIterative(a, b),
					orKleeneIterative(b, a),
					'commutativity'
				)
				for (const c of KLEENE_VALUES) {
					assert.equal(
						orKleeneIterative(orKleeneIterative(a, b), c),
						orKleeneIterative(a, orKleeneIterative(b, c)),
						'associativity'
					)
					assert.equal(
						orKleeneIterative(a, b, c),
						orKleeneIterative(orKleeneIterative(a, b), c),
						'variadic matches nested binary'
					)
				}
			}
		}
	})

	test('independent cross-check: De Morgan duality and truth-lattice max', () => {
		const kleeneNot = (v) => (v === null ? null : !v)
		const kleeneAnd = (a, b) => {
			if (a === false || b === false) return false
			if (a === null || b === null) return null
			return true
		}
		const rank = (v) => (v === false ? 0 : v === null ? 1 : 2)
		const unrank = (r) => (r === 0 ? false : r === 1 ? null : true)

		// Check all 27 triples against both independent definitions
		for (const a of KLEENE_VALUES) {
			for (const b of KLEENE_VALUES) {
				const deMorgan = kleeneNot(kleeneAnd(kleeneNot(a), kleeneNot(b)))
				const latticeMax = unrank(Math.max(rank(a), rank(b)))
				assert.equal(orKleeneIterative(a, b), deMorgan)
				assert.equal(orKleeneIterative(a, b), latticeMax)

				for (const c of KLEENE_VALUES) {
					const deMorgan3 = kleeneNot(
						kleeneAnd(kleeneAnd(kleeneNot(a), kleeneNot(b)), kleeneNot(c))
					)
					const latticeMax3 = unrank(Math.max(rank(a), rank(b), rank(c)))
					assert.equal(orKleeneIterative(a, b, c), deMorgan3)
					assert.equal(orKleeneIterative([a, b, c]), latticeMax3)
				}
			}
		}
	})
})

describe('orKleeneIterative — partial sets (Map, plain object, structured pair)', () => {
	test('computes union of Map partial sets without mutating inputs', () => {
		const objKey = { id: 1 }
		const m1 = new Map([
			['a', true],
			['b', null],
			['c', false],
			[objKey, null],
			[Number.NaN, false],
		])
		const m2 = new Map([
			['a', null],
			['b', false],
			['c', false],
			['d', true],
			[objKey, true],
			[Number.NaN, null],
		])

		const out = orKleeneIterative(m1, m2)
		assert.ok(out instanceof Map)
		assert.notEqual(out, m1)
		assert.notEqual(out, m2)
		assert.deepEqual(
			out,
			new Map([
				['a', true],
				['b', null],
				['c', false],
				['d', true],
				[objKey, true],
				[Number.NaN, null],
			])
		)
		// Original maps untouched
		assert.equal(m1.get(objKey), null)
		assert.equal(m2.has('c'), true)
		assert.equal(m1.has('d'), false)
	})

	test('computes union of plain characteristic objects including special keys', () => {
		const p1 = { a: false, b: null, c: true }
		const p2 = { b: true, c: null, d: null }
		const p3 = { a: false, d: false, e: false }

		const out = orKleeneIterative(p1, p2, p3)
		assert.deepEqual(out, { a: false, b: true, c: true, d: null, e: false })
		assert.deepEqual(p1, { a: false, b: null, c: true })

		// Characteristic object whose element names happen to be "definite" and "unknown"
		const namedLikeFields = orKleeneIterative(
			{ definite: false, unknown: null },
			{ definite: null, unknown: true }
		)
		assert.deepEqual(namedLikeFields, { definite: null, unknown: true })

		// Safely handles __proto__ as an own property without prototype pollution
		const protoObj = Object.create(null)
		protoObj.__proto__ = null
		const protoResult = orKleeneIterative(protoObj, { a: true })
		assert.equal(Object.getPrototypeOf(protoResult), Object.prototype)
		assert.equal(Object.prototype.hasOwnProperty.call(protoResult, '__proto__'), true)
		assert.equal(protoResult['__proto__'], null)
		assert.equal(protoResult.a, true)

		// Empty plain objects
		assert.deepEqual(orKleeneIterative({}, {}), {})
	})

	test('computes union of structured partial sets { definite, unknown }', () => {
		const s1 = { definite: new Set(['a', 'b']), unknown: new Set(['c', 'd']) }
		const s2 = { definite: ['c', 'e'], unknown: ['a', 'f'] }
		const s3 = { unknown: new Set(['g', 'b']) }

		const out = orKleeneIterative(s1, s2, s3)
		assert.ok(out.definite instanceof Set)
		assert.ok(out.unknown instanceof Set)
		assert.deepEqual(out.definite, new Set(['a', 'b', 'c', 'e']))
		assert.deepEqual(out.unknown, new Set(['d', 'f', 'g']))

		// Inputs were not mutated
		assert.deepEqual(s1.definite, new Set(['a', 'b']))
		assert.deepEqual(s1.unknown, new Set(['c', 'd']))

		// Handles definite-only input and empty sets
		const defOnly = orKleeneIterative({ definite: new Set([1, 2]) })
		assert.deepEqual(defOnly.definite, new Set([1, 2]))
		assert.deepEqual(defOnly.unknown, new Set())

		const empty = orKleeneIterative({ definite: [], unknown: [] })
		assert.deepEqual(empty.definite, new Set())
		assert.deepEqual(empty.unknown, new Set())
	})

	test('independent cross-check: possible-worlds (classical completions) semantics and representation isomorphism', () => {
		// Universe of 3 elements: 3^3 = 27 possible partial sets
		const universe = ['x', 'y', 'z']

		// Enumerate all classical subsets S such that definite ⊆ S ⊆ definite ∪ unknown
		function completions(definite, unknown) {
			const unkList = Array.from(unknown)
			const worlds = []
			const count = 1 << unkList.length
			for (let mask = 0; mask < count; mask++) {
				const world = new Set(definite)
				for (let bit = 0; bit < unkList.length; bit++) {
					if ((mask & (1 << bit)) !== 0) {
						world.add(unkList[bit])
					}
				}
				worlds.push(world)
			}
			return worlds
		}

		// Independent semantic union via all pairs of classical completions
		function possibleWorldsUnion(pA, pB) {
			const worldsA = completions(pA.definite, pA.unknown)
			const worldsB = completions(pB.definite, pB.unknown)
			const definite = new Set()
			const unknown = new Set()

			for (const elem of universe) {
				let seenIn = false
				let seenOut = false
				for (const wA of worldsA) {
					for (const wB of worldsB) {
						if (wA.has(elem) || wB.has(elem)) {
							seenIn = true
						} else {
							seenOut = true
						}
					}
				}
				if (seenIn && !seenOut) {
					definite.add(elem)
				} else if (seenIn && seenOut) {
					unknown.add(elem)
				}
			}
			return { definite, unknown }
		}

		// Generate all 27 partial sets over `universe`
		const allPartialSets = []
		for (const vx of KLEENE_VALUES) {
			for (const vy of KLEENE_VALUES) {
				for (const vz of KLEENE_VALUES) {
					const vals = { x: vx, y: vy, z: vz }
					const definite = new Set()
					const unknown = new Set()
					const map = new Map()
					for (const k of universe) {
						map.set(k, vals[k])
						if (vals[k] === true) definite.add(k)
						else if (vals[k] === null) unknown.add(k)
					}
					allPartialSets.push({
						record: vals,
						map,
						structured: { definite, unknown },
					})
				}
			}
		}

		// Exhaustively verify all 27 x 27 = 729 pairs
		for (const A of allPartialSets) {
			for (const B of allPartialSets) {
				const expected = possibleWorldsUnion(A.structured, B.structured)
				const actualStructured = orKleeneIterative(A.structured, B.structured)
				const actualMap = orKleeneIterative(A.map, B.map)
				const actualRecord = orKleeneIterative(A.record, B.record)

				assert.deepEqual(actualStructured, expected)

				for (const elem of universe) {
					const expectedTruth = expected.definite.has(elem)
						? true
						: expected.unknown.has(elem)
							? null
							: false
					assert.equal(actualMap.get(elem), expectedTruth)
					assert.equal(actualRecord[elem], expectedTruth)
				}
			}
		}
	})
})

describe('orKleeneIterative — input validation', () => {
	test('throws TypeError on missing or invalid scalar/array inputs', () => {
		assert.throws(() => orKleeneIterative(), TypeError)
		assert.throws(() => orKleeneIterative(undefined), TypeError)
		assert.throws(() => orKleeneIterative(1), TypeError)
		assert.throws(() => orKleeneIterative(0), TypeError)
		assert.throws(() => orKleeneIterative('true'), TypeError)
		assert.throws(() => orKleeneIterative('unknown'), TypeError)
		// Must validate all operands even after encountering true
		assert.throws(() => orKleeneIterative(true, 1), TypeError)
		assert.throws(() => orKleeneIterative([true, 'bad']), TypeError)
		assert.throws(() => orKleeneIterative([true], [false]), TypeError)
	})

	test('throws TypeError on mixed operand representations or unsupported objects', () => {
		assert.throws(() => orKleeneIterative(true, new Map()), TypeError)
		assert.throws(() => orKleeneIterative(new Map(), {}), TypeError)
		assert.throws(() => orKleeneIterative({}, new Map()), TypeError)
		assert.throws(
			() => orKleeneIterative({ a: true }, { definite: new Set(['a']) }),
			TypeError
		)
		assert.throws(
			() => orKleeneIterative({ definite: new Set(['a']) }, { a: true }),
			TypeError
		)
		assert.throws(() => orKleeneIterative(new Set([true])), TypeError)
		assert.throws(() => orKleeneIterative(new Date()), TypeError)
	})

	test('throws TypeError on invalid values inside partial sets', () => {
		assert.throws(
			() => orKleeneIterative(new Map([['a', true], ['b', 1]])),
			TypeError
		)
		assert.throws(() => orKleeneIterative({ a: true, b: undefined }), TypeError)
		assert.throws(
			() => orKleeneIterative({ definite: 'not-a-set' }),
			TypeError
		)
		assert.throws(
			() => orKleeneIterative({ definite: new Set(['a']), unknown: 123 }),
			TypeError
		)
		assert.throws(
			() => orKleeneIterative({ definite: new Set(['a']), extra: [] }),
			TypeError
		)
		assert.throws(
			() => orKleeneIterative({ definite: new Set(['a']) }, {}),
			TypeError
		)
	})

	test('throws RangeError on contradictory structured partial sets', () => {
		assert.throws(
			() =>
				orKleeneIterative({
					definite: new Set(['a']),
					unknown: new Set(['a']),
				}),
			RangeError
		)
		assert.throws(
			() =>
				orKleeneIterative(
					{ definite: ['x'], unknown: [] },
					{ definite: ['y'], unknown: ['y'] }
				),
			RangeError
		)
	})
})
