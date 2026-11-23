import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notKleeneIterative } from './notKleeneIterative.js'

describe('notKleeneIterative - scalar three-valued Kleene logic (K3)', () => {
	test('negates true, false, null, and "unknown"', () => {
		assert.strictEqual(notKleeneIterative(true), false)
		assert.strictEqual(notKleeneIterative(false), true)
		assert.strictEqual(notKleeneIterative(null), null)
		assert.strictEqual(notKleeneIterative('unknown'), 'unknown')
	})

	test('satisfies double-negation involution for all scalar values', () => {
		const values = [true, false, null, 'unknown']
		for (const v of values) {
			assert.strictEqual(notKleeneIterative(notKleeneIterative(v)), v)
		}
	})
})

describe('notKleeneIterative - characteristic arrays', () => {
	test('negates elements iteratively and preserves immutability', () => {
		const input = [true, false, null, 'unknown', true]
		const snapshot = [...input]
		const output = notKleeneIterative(input)

		assert.deepStrictEqual(output, [false, true, null, 'unknown', false])
		assert.deepStrictEqual(input, snapshot)
		assert.notStrictEqual(output, input)
	})

	test('handles empty array and large arrays without stack issues', () => {
		const empty = []
		const emptyOut = notKleeneIterative(empty)
		assert.deepStrictEqual(emptyOut, [])
		assert.notStrictEqual(emptyOut, empty)

		const n = 20000
		const large = new Array(n)
		const expected = new Array(n)
		for (let i = 0; i < n; i++) {
			const mod = i % 4
			if (mod === 0) {
				large[i] = true
				expected[i] = false
			} else if (mod === 1) {
				large[i] = false
				expected[i] = true
			} else if (mod === 2) {
				large[i] = null
				expected[i] = null
			} else {
				large[i] = 'unknown'
				expected[i] = 'unknown'
			}
		}

		assert.deepStrictEqual(notKleeneIterative(large), expected)
	})
})

describe('notKleeneIterative - characteristic Maps', () => {
	test('negates Map values while preserving key types, order, and immutability', () => {
		const objKey = { id: 1 }
		const symKey = Symbol('k')
		const input = new Map([
			['a', true],
			[2, false],
			[objKey, null],
			[symKey, 'unknown'],
			[NaN, true]
		])

		const output = notKleeneIterative(input)

		assert.ok(output instanceof Map)
		assert.notStrictEqual(output, input)
		assert.deepStrictEqual(
			[...output.entries()],
			[
				['a', false],
				[2, true],
				[objKey, null],
				[symKey, 'unknown'],
				[NaN, false]
			]
		)
		// Original unchanged
		assert.strictEqual(input.get('a'), true)
		assert.strictEqual(input.get(2), false)
	})

	test('handles empty Map', () => {
		const empty = new Map()
		const output = notKleeneIterative(empty)
		assert.ok(output instanceof Map)
		assert.strictEqual(output.size, 0)
		assert.notStrictEqual(output, empty)
	})
})

describe('notKleeneIterative - characteristic plain objects', () => {
	test('negates plain object entries and preserves immutability', () => {
		const input = { a: true, b: false, c: null, d: 'unknown' }
		const output = notKleeneIterative(input)

		assert.deepStrictEqual(output, { a: false, b: true, c: null, d: 'unknown' })
		assert.deepStrictEqual(input, { a: true, b: false, c: null, d: 'unknown' })
		assert.notStrictEqual(output, input)
	})

	test('handles empty objects, null-prototype objects, and "__proto__" keys safely', () => {
		assert.deepStrictEqual(notKleeneIterative({}), {})

		const nullProto = Object.create(null)
		nullProto.x = true
		nullProto.y = null
		const nullProtoOut = notKleeneIterative(nullProto)
		assert.strictEqual(Object.getPrototypeOf(nullProtoOut), null)
		assert.strictEqual(nullProtoOut.x, false)
		assert.strictEqual(nullProtoOut.y, null)

		const withProtoKey = {}
		Object.defineProperty(withProtoKey, '__proto__', {
			value: true,
			enumerable: true,
			configurable: true,
			writable: true
		})
		const protoOut = notKleeneIterative(withProtoKey)
		assert.strictEqual(Object.getPrototypeOf(protoOut), Object.prototype)
		assert.strictEqual(
			Object.getOwnPropertyDescriptor(protoOut, '__proto__')?.value,
			false
		)
	})

	test('ignores non-enumerable and inherited properties', () => {
		const base = { inherited: 'not-a-kleene-value' }
		const input = Object.create(base)
		// Not a plain object because prototype is `base`, should throw TypeError
		assert.throws(() => notKleeneIterative(input), TypeError)

		const plain = { a: true }
		Object.defineProperty(plain, 'hidden', {
			value: 123,
			enumerable: false
		})
		assert.deepStrictEqual(notKleeneIterative(plain), { a: false })
	})
})

describe('notKleeneIterative - disjoint partial-set pair { included, excluded }', () => {
	test('swaps included and excluded sets and creates fresh copies', () => {
		const input = {
			included: new Set(['a', 'b']),
			excluded: new Set(['c'])
		}
		const output = notKleeneIterative(input)

		assert.ok(output.included instanceof Set)
		assert.ok(output.excluded instanceof Set)
		assert.notStrictEqual(output.included, input.excluded)
		assert.notStrictEqual(output.excluded, input.included)
		assert.deepStrictEqual([...output.included], ['c'])
		assert.deepStrictEqual([...output.excluded], ['a', 'b'])

		// Mutating output does not affect input
		output.included.add('z')
		assert.strictEqual(input.excluded.has('z'), false)
	})

	test('handles empty included/excluded sets (completely unknown partial set)', () => {
		const input = { included: new Set(), excluded: new Set() }
		const output = notKleeneIterative(input)
		assert.strictEqual(output.included.size, 0)
		assert.strictEqual(output.excluded.size, 0)
		assert.notStrictEqual(output.included, input.included)
		assert.notStrictEqual(output.excluded, input.excluded)
	})

	test('treats plain object with boolean "included" and "excluded" keys as characteristic record', () => {
		const record = { included: true, excluded: false }
		assert.deepStrictEqual(notKleeneIterative(record), {
			included: false,
			excluded: true
		})
	})

	test('rejects inconsistent (overlapping) included and excluded sets', () => {
		assert.throws(
			() =>
				notKleeneIterative({
					included: new Set([1, 2]),
					excluded: new Set([2, 3])
				}),
			RangeError
		)

		assert.throws(
			() =>
				notKleeneIterative({
					included: new Set([NaN]),
					excluded: new Set([NaN])
				}),
			RangeError
		)
	})
})

describe('notKleeneIterative - input validation and edge cases', () => {
	test('throws TypeError on unsupported primitive and object inputs', () => {
		const invalidInputs = [
			undefined,
			0,
			1,
			NaN,
			'',
			'true',
			'false',
			'UNKNOWN',
			Symbol('x'),
			1n,
			() => true,
			new Set([1, 2]),
			new Date(),
			/abc/
		]

		for (const bad of invalidInputs) {
			assert.throws(() => notKleeneIterative(bad), TypeError)
		}
	})

	test('throws TypeError on invalid values inside containers and sparse arrays', () => {
		// Sparse array
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [true, , false]
		assert.throws(() => notKleeneIterative(sparse), TypeError)

		assert.throws(() => notKleeneIterative([true, undefined]), TypeError)
		assert.throws(() => notKleeneIterative([1]), TypeError)
		assert.throws(() => notKleeneIterative(new Map([['a', 0]])), TypeError)
		assert.throws(() => notKleeneIterative({ a: true, b: 'yes' }), TypeError)
		assert.throws(
			() =>
				notKleeneIterative({
					included: new Set([1]),
					excluded: [2]
				}),
			TypeError
		)
		assert.throws(
			() =>
				notKleeneIterative({
					included: new Set([1]),
					excluded: new Set([2]),
					extra: true
				}),
			TypeError
		)
	})
})

describe('notKleeneIterative - independent algebraic & representation cross-checks', () => {
	// Independent numeric K3 reference encoding: false = -1, unknown = 0, true = +1
	const encode = (v) => (v === true ? 1 : v === false ? -1 : 0)
	const decode = (n) => (n === 1 ? true : n === -1 ? false : null)
	const refNot = (v) => decode(-encode(v))
	const refAnd = (a, b) => decode(Math.min(encode(a), encode(b)))
	const refOr = (a, b) => decode(Math.max(encode(a), encode(b)))

	test('matches numeric K3 reference, De Morgan laws, and order properties exhaustively', () => {
		const domain = [false, null, true]

		for (const a of domain) {
			// Direct match against numeric -x model
			assert.strictEqual(notKleeneIterative(a), refNot(a))

			for (const b of domain) {
				// De Morgan's Laws in K3
				assert.strictEqual(
					notKleeneIterative(refAnd(a, b)),
					refOr(notKleeneIterative(a), notKleeneIterative(b))
				)
				assert.strictEqual(
					notKleeneIterative(refOr(a, b)),
					refAnd(notKleeneIterative(a), notKleeneIterative(b))
				)

				// Truth-ordering antitonicity: a <=_t b => not(b) <=_t not(a)
				if (encode(a) <= encode(b)) {
					assert.ok(
						encode(notKleeneIterative(b)) <= encode(notKleeneIterative(a))
					)
				}

				// Information-ordering monotonicity: a <=_k b => not(a) <=_k not(b)
				// where a <=_k b iff a === null || a === b
				if (a === null || a === b) {
					const na = notKleeneIterative(a)
					const nb = notKleeneIterative(b)
					assert.ok(na === null || na === nb)
				}
			}
		}
	})

	test('isomorphic across characteristic Map, plain object, array, and { included, excluded } pair for all 3^5 partial sets', () => {
		const universe = ['u0', 'u1', 'u2', 'u3', 'u4']
		const vals = [false, null, true]

		const mapToPair = (m) => {
			const included = new Set()
			const excluded = new Set()
			for (const [k, v] of m.entries()) {
				if (v === true) included.add(k)
				else if (v === false) excluded.add(k)
			}
			return { included, excluded }
		}

		const pairToMap = (pair) => {
			const m = new Map()
			for (const u of universe) {
				if (pair.included.has(u)) m.set(u, true)
				else if (pair.excluded.has(u)) m.set(u, false)
				else m.set(u, null)
			}
			return m
		}

		// Enumerate all 3^5 = 243 partial sets iteratively via base-3 counter
		const total = 3 ** universe.length
		for (let code = 0; code < total; code++) {
			let n = code
			const arr = []
			const map = new Map()
			const obj = {}

			for (let i = 0; i < universe.length; i++) {
				const v = vals[n % 3]
				n = Math.floor(n / 3)
				arr.push(v)
				map.set(universe[i], v)
				obj[universe[i]] = v
			}

			const pair = mapToPair(map)

			const negArr = notKleeneIterative(arr)
			const negMap = notKleeneIterative(map)
			const negObj = notKleeneIterative(obj)
			const negPair = notKleeneIterative(pair)

			// Cross-check all four representations agree pointwise
			const fromNegPair = pairToMap(negPair)
			for (let i = 0; i < universe.length; i++) {
				const key = universe[i]
				const expected = refNot(arr[i])
				assert.strictEqual(negArr[i], expected)
				assert.strictEqual(negMap.get(key), expected)
				assert.strictEqual(negObj[key], expected)
				assert.strictEqual(fromNegPair.get(key), expected)
			}

			// Cross-check double negation returns exact original across all forms
			assert.deepStrictEqual(notKleeneIterative(negArr), arr)
			assert.deepStrictEqual(notKleeneIterative(negMap), map)
			assert.deepStrictEqual(notKleeneIterative(negObj), obj)
			assert.deepStrictEqual(notKleeneIterative(negPair), pair)
		}
	})
})
