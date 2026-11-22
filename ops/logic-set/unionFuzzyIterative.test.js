import { describe, test } from 'node:test'
import assert from 'node:assert'
import { unionFuzzyIterative } from './unionFuzzyIterative.js'

/**
 * Independent Zadeh fuzzy union computed via De Morgan's law:
 * union(a, b) = 1 - min(1 - a, 1 - b)
 */
function deMorganUnionScalar(a, b) {
	return 1 - Math.min(1 - a, 1 - b)
}

function deMorganUnionArray(a, b) {
	return a.map((v, i) => deMorganUnionScalar(v, b[i]))
}

function deMorganUnionObject(a, b) {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)])
	const out = {}
	for (const key of keys) {
		const va = Object.hasOwn(a, key) ? a[key] : 0
		const vb = Object.hasOwn(b, key) ? b[key] : 0
		out[key] = deMorganUnionScalar(va, vb)
	}
	return out
}

describe('unionFuzzyIterative', () => {
	describe('scalar fuzzy membership values', () => {
		test('computes Zadeh max over two and multiple values', () => {
			assert.strictEqual(unionFuzzyIterative(0.2, 0.7), 0.7)
			assert.strictEqual(unionFuzzyIterative(0.85, 0.3), 0.85)
			assert.strictEqual(unionFuzzyIterative(0.5, 0.5), 0.5)
			assert.strictEqual(unionFuzzyIterative(0.1, 0.4, 0.9, 0.3, 0.6), 0.9)
		})

		test('handles single argument and boundary values 0, -0, 1', () => {
			assert.strictEqual(unionFuzzyIterative(0.42), 0.42)
			assert.strictEqual(unionFuzzyIterative(0, 0), 0)
			assert.strictEqual(unionFuzzyIterative(0, 1), 1)
			assert.strictEqual(unionFuzzyIterative(1, 0), 1)
			assert.strictEqual(unionFuzzyIterative(1, 1), 1)
			assert.ok(Object.is(unionFuzzyIterative(-0, 0), 0))
			assert.ok(Object.is(unionFuzzyIterative(-0), 0))
		})
	})

	describe('array fuzzy membership vectors', () => {
		test('computes element-wise Zadeh union across two and multiple arrays', () => {
			assert.deepStrictEqual(
				unionFuzzyIterative([0.1, 0.8, 0.5], [0.4, 0.2, 0.5]),
				[0.4, 0.8, 0.5],
			)
			assert.deepStrictEqual(
				unionFuzzyIterative([0.0, 0.3, 0.7], [0.2, 0.9, 0.4], [0.5, 0.1, 1.0]),
				[0.5, 0.9, 1.0],
			)
		})

		test('handles empty arrays, single array, and preserves immutability', () => {
			assert.deepStrictEqual(unionFuzzyIterative([], []), [])
			assert.deepStrictEqual(unionFuzzyIterative([]), [])

			const a = [0.2, 0.6]
			const b = [0.5, 0.1]
			const result = unionFuzzyIterative(a, b)
			assert.deepStrictEqual(result, [0.5, 0.6])
			assert.deepStrictEqual(a, [0.2, 0.6])
			assert.deepStrictEqual(b, [0.5, 0.1])

			const copy = unionFuzzyIterative(a)
			assert.notStrictEqual(copy, a)
			assert.deepStrictEqual(copy, [0.2, 0.6])
		})

		test('normalizes -0 elements to +0', () => {
			const res = unionFuzzyIterative([-0, 0.5], [-0, 0])
			assert.ok(Object.is(res[0], 0))
			assert.strictEqual(res[1], 0.5)
		})

		test('handles large arrays iteratively without recursion limits', () => {
			const n = 20000
			const a = Array.from({ length: n }, (_, i) => (i % 100) / 100)
			const b = Array.from({ length: n }, (_, i) => ((i * 7) % 100) / 100)
			const res = unionFuzzyIterative(a, b)
			assert.strictEqual(res.length, n)
			for (let i = 0; i < n; i++) {
				assert.strictEqual(res[i], Math.max(a[i], b[i]))
			}
		})
	})

	describe('plain object fuzzy sets', () => {
		test('computes union with overlapping and disjoint keys', () => {
			assert.deepStrictEqual(
				unionFuzzyIterative({ a: 0.2, b: 0.8 }, { b: 0.5, c: 0.9 }),
				{ a: 0.2, b: 0.8, c: 0.9 },
			)
			assert.deepStrictEqual(
				unionFuzzyIterative({ cold: 0.3, warm: 0.7 }, { hot: 1.0, boiling: 0.0 }),
				{ cold: 0.3, warm: 0.7, hot: 1.0, boiling: 0.0 },
			)
			assert.deepStrictEqual(
				unionFuzzyIterative({ x: 0.1 }, { x: 0.6, y: 0.2 }, { y: 0.9, z: 0.4 }),
				{ x: 0.6, y: 0.9, z: 0.4 },
			)
		})

		test('handles empty objects, null-prototype objects, and preserves immutability', () => {
			assert.deepStrictEqual(unionFuzzyIterative({}, {}), {})
			assert.deepStrictEqual(unionFuzzyIterative({}, { a: 0.5 }), { a: 0.5 })
			assert.deepStrictEqual(unionFuzzyIterative({ a: 0.5 }, {}), { a: 0.5 })

			const nullProto = Object.assign(Object.create(null), { k: 0.75 })
			assert.deepStrictEqual(unionFuzzyIterative(nullProto, { k: 0.25, m: 0.4 }), {
				k: 0.75,
				m: 0.4,
			})

			const s1 = { a: 0.3 }
			const s2 = { a: 0.8, b: 0.2 }
			const out = unionFuzzyIterative(s1, s2)
			assert.deepStrictEqual(out, { a: 0.8, b: 0.2 })
			assert.deepStrictEqual(s1, { a: 0.3 })
			assert.deepStrictEqual(s2, { a: 0.8, b: 0.2 })
		})
	})

	describe('independent cross-checks (De Morgan law & algebraic laws)', () => {
		test('matches De Morgan dual 1 - min(1 - a, 1 - b) for scalars', () => {
			const samples = [0, 0.001, 0.1, 0.25, 0.5, 0.73, 0.999, 1]
			for (const a of samples) {
				for (const b of samples) {
					const actual = unionFuzzyIterative(a, b)
					const expected = deMorganUnionScalar(a, b)
					assert.ok(
						Math.abs(actual - expected) <= 1e-12,
						`Mismatch for (${a}, ${b}): got ${actual}, expected ${expected}`,
					)
				}
			}
		})

		test('matches De Morgan dual for arrays and plain object fuzzy sets', () => {
			const arrA = [0, 0.15, 0.5, 0.82, 1]
			const arrB = [0.4, 0.15, 0.95, 0.2, 0]
			const arrActual = unionFuzzyIterative(arrA, arrB)
			const arrExpected = deMorganUnionArray(arrA, arrB)
			for (let i = 0; i < arrA.length; i++) {
				assert.ok(Math.abs(arrActual[i] - arrExpected[i]) <= 1e-12)
			}

			const objA = { low: 0.2, med: 0.7, onlyA: 0.45 }
			const objB = { med: 0.9, high: 0.6, zero: 0 }
			const objActual = unionFuzzyIterative(objA, objB)
			const objExpected = deMorganUnionObject(objA, objB)
			assert.deepStrictEqual(Object.keys(objActual).sort(), Object.keys(objExpected).sort())
			for (const key of Object.keys(objExpected)) {
				assert.ok(Math.abs(objActual[key] - objExpected[key]) <= 1e-12)
			}
		})

		test('satisfies commutativity, associativity, idempotence, identity, and domination', () => {
			const a = { p: 0.2, q: 0.8 }
			const b = { q: 0.5, r: 0.7 }
			const c = { p: 0.9, r: 0.1 }

			assert.deepStrictEqual(unionFuzzyIterative(a, b), unionFuzzyIterative(b, a))
			assert.deepStrictEqual(
				unionFuzzyIterative(unionFuzzyIterative(a, b), c),
				unionFuzzyIterative(a, unionFuzzyIterative(b, c)),
			)
			assert.deepStrictEqual(unionFuzzyIterative(a, a), a)
			assert.strictEqual(unionFuzzyIterative(0.37, 0), 0.37)
			assert.strictEqual(unionFuzzyIterative(0.37, 1), 1)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for missing, unsupported, or mismatched argument types', () => {
			assert.throws(() => unionFuzzyIterative(), TypeError)
			assert.throws(() => unionFuzzyIterative(null), TypeError)
			assert.throws(() => unionFuzzyIterative(undefined), TypeError)
			assert.throws(() => unionFuzzyIterative('0.5', 0.5), TypeError)
			assert.throws(() => unionFuzzyIterative(true, false), TypeError)
			assert.throws(() => unionFuzzyIterative(0.5, [0.5]), TypeError)
			assert.throws(() => unionFuzzyIterative([0.5], { a: 0.5 }), TypeError)
			assert.throws(() => unionFuzzyIterative({ a: 0.5 }, 0.5), TypeError)
			assert.throws(() => unionFuzzyIterative(new Map(), new Map()), TypeError)
			assert.throws(() => unionFuzzyIterative(new Set(), new Set()), TypeError)
			assert.throws(() => unionFuzzyIterative(new Date(), new Date()), TypeError)
			assert.throws(() => unionFuzzyIterative([0.1, '0.2'], [0.3, 0.4]), TypeError)
			assert.throws(() => unionFuzzyIterative({ a: '0.5' }, { a: 0.5 }), TypeError)

			const sparse = new Array(2)
			sparse[0] = 0.5
			assert.throws(() => unionFuzzyIterative(sparse, [0.2, 0.3]), TypeError)
		})

		test('throws RangeError for out-of-range, non-finite values, and mismatched array lengths', () => {
			assert.throws(() => unionFuzzyIterative(-0.01, 0.5), RangeError)
			assert.throws(() => unionFuzzyIterative(0.5, 1.01), RangeError)
			assert.throws(() => unionFuzzyIterative(Number.NaN, 0.5), RangeError)
			assert.throws(() => unionFuzzyIterative(Number.POSITIVE_INFINITY, 0.5), RangeError)
			assert.throws(() => unionFuzzyIterative(Number.NEGATIVE_INFINITY, 0.5), RangeError)
			assert.throws(() => unionFuzzyIterative([0.1, 0.2], [0.3]), RangeError)
			assert.throws(() => unionFuzzyIterative([0.1, 1.5], [0.2, 0.3]), RangeError)
			assert.throws(() => unionFuzzyIterative([0.1, -0.2], [0.2, 0.3]), RangeError)
			assert.throws(() => unionFuzzyIterative({ a: 0.5 }, { a: Number.NaN }), RangeError)
			assert.throws(() => unionFuzzyIterative({ a: -0.1 }, { b: 0.5 }), RangeError)
			assert.throws(() => unionFuzzyIterative({ a: 1.1 }, { b: 0.5 }), RangeError)
		})
	})
})
