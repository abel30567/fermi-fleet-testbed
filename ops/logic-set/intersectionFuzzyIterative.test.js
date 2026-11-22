import { describe, test } from 'node:test'
import assert from 'node:assert'
import { intersectionFuzzyIterative } from './intersectionFuzzyIterative.js'

const EPSILON = 1e-12

/**
 * Independent reference implementation of binary Zadeh intersection
 * via De Morgan's law: min(a, b) = 1 - max(1 - a, 1 - b).
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function deMorganIntersectionScalar(a, b) {
	return 1 - Math.max(1 - a, 1 - b)
}

/**
 * Independent reference implementation for variadic scalars via De Morgan's law.
 *
 * @param {number[]} values
 * @returns {number}
 */
function deMorganIntersectionMany(values) {
	let maxComplement = 0
	for (const v of values) {
		const complement = 1 - v
		if (complement > maxComplement) {
			maxComplement = complement
		}
	}
	return 1 - maxComplement
}

describe('intersectionFuzzyIterative', () => {
	describe('scalar fuzzy memberships', () => {
		test('computes Zadeh min for pairs of values in [0, 1]', () => {
			assert.strictEqual(intersectionFuzzyIterative(0.3, 0.7), 0.3)
			assert.strictEqual(intersectionFuzzyIterative(0.85, 0.25), 0.25)
			assert.strictEqual(intersectionFuzzyIterative(0.5, 0.5), 0.5)
		})

		test('handles boundary values 0, 1, and -0', () => {
			assert.strictEqual(intersectionFuzzyIterative(0, 1), 0)
			assert.strictEqual(intersectionFuzzyIterative(1, 0), 0)
			assert.strictEqual(intersectionFuzzyIterative(1, 1), 1)
			assert.strictEqual(intersectionFuzzyIterative(0, 0), 0)
			assert.strictEqual(intersectionFuzzyIterative(0.6, 1), 0.6)
			assert.strictEqual(intersectionFuzzyIterative(0.6, 0), 0)

			// -0 should normalize to +0
			assert.ok(Object.is(intersectionFuzzyIterative(-0, 0.5), 0))
			assert.ok(Object.is(intersectionFuzzyIterative(0.5, -0), 0))
			assert.ok(Object.is(intersectionFuzzyIterative(-0, -0), 0))
		})

		test('supports 3 or more scalar operands iteratively', () => {
			assert.strictEqual(intersectionFuzzyIterative(0.9, 0.4, 0.7, 0.2, 0.8), 0.2)
			assert.strictEqual(intersectionFuzzyIterative(1, 1, 0.99, 1), 0.99)
			assert.strictEqual(intersectionFuzzyIterative(0.5, 0.5, 0, 0.5), 0)
		})
	})

	describe('fuzzy membership arrays', () => {
		test('computes element-wise Zadeh intersection for equal-length arrays', () => {
			const a = [0.1, 0.8, 0.5, 1, 0]
			const b = [0.6, 0.3, 0.5, 0.9, 0.4]
			assert.deepStrictEqual(intersectionFuzzyIterative(a, b), [0.1, 0.3, 0.5, 0.9, 0])
		})

		test('supports 3 or more arrays without mutating inputs', () => {
			const a = [0.9, 0.4, 1.0]
			const b = [0.5, 0.8, 0.7]
			const c = [0.6, 0.2, 0.7]
			const snapshotA = [...a]
			const snapshotB = [...b]
			const snapshotC = [...c]

			const out = intersectionFuzzyIterative(a, b, c)
			assert.deepStrictEqual(out, [0.5, 0.2, 0.7])
			assert.deepStrictEqual(a, snapshotA)
			assert.deepStrictEqual(b, snapshotB)
			assert.deepStrictEqual(c, snapshotC)
		})

		test('handles empty arrays and -0 elements', () => {
			assert.deepStrictEqual(intersectionFuzzyIterative([], []), [])
			assert.deepStrictEqual(intersectionFuzzyIterative([], [], []), [])
			const res = intersectionFuzzyIterative([-0, 0.3], [0.2, -0])
			assert.deepStrictEqual(res, [0, 0])
			assert.ok(Object.is(res[0], 0))
			assert.ok(Object.is(res[1], 0))
		})

		test('handles large arrays iteratively without stack issues', () => {
			const n = 50_000
			const a = new Array(n)
			const b = new Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = i / n
				b[i] = 1 - i / n
			}
			const out = intersectionFuzzyIterative(a, b)
			assert.strictEqual(out.length, n)
			assert.strictEqual(out[0], 0)
			assert.strictEqual(out[n / 2], 0.5)
			assert.ok(Math.abs(out[n - 1] - 1 / n) <= EPSILON)
		})
	})

	describe('plain object fuzzy sets', () => {
		test('computes pointwise minimum on overlapping keys and omits disjoint keys', () => {
			const a = { cold: 0.7, warm: 0.4, hot: 0.1 }
			const b = { warm: 0.8, hot: 0.05, scorching: 0.9 }
			assert.deepStrictEqual(intersectionFuzzyIterative(a, b), {
				warm: 0.4,
				hot: 0.05,
			})
		})

		test('returns empty object for empty sets and completely disjoint keys', () => {
			assert.deepStrictEqual(intersectionFuzzyIterative({}, {}), {})
			assert.deepStrictEqual(intersectionFuzzyIterative({}, { a: 0.5 }), {})
			assert.deepStrictEqual(intersectionFuzzyIterative({ a: 0.5 }, {}), {})
			assert.deepStrictEqual(
				intersectionFuzzyIterative({ a: 0.4, b: 0.9 }, { c: 0.7, d: 0.2 }),
				{}
			)
		})

		test('preserves keys explicitly present in all sets even when membership is 0', () => {
			const a = { x: 0, y: 1, z: 0.5 }
			const b = { x: 0.8, y: 1, z: 0 }
			const out = intersectionFuzzyIterative(a, b)
			assert.deepStrictEqual(out, { x: 0, y: 1, z: 0 })
			assert.ok(Object.is(out.x, 0))
			assert.ok(Object.is(out.z, 0))
		})

		test('supports 3+ object sets, null-prototype objects, and does not mutate inputs', () => {
			const a = Object.assign(Object.create(null), { p: 0.9, q: 0.5, r: 0.7 })
			const b = { p: 0.4, q: 0.8, s: 1 }
			const c = { p: 0.6, q: 0.2, r: 0.1 }
			const out = intersectionFuzzyIterative(a, b, c)
			assert.deepStrictEqual(out, { p: 0.4, q: 0.2 })
			assert.deepStrictEqual({ ...a }, { p: 0.9, q: 0.5, r: 0.7 })
			assert.deepStrictEqual(b, { p: 0.4, q: 0.8, s: 1 })
			assert.deepStrictEqual(c, { p: 0.6, q: 0.2, r: 0.1 })
		})

		test('normalizes -0 values in plain objects', () => {
			const out = intersectionFuzzyIterative({ k: -0 }, { k: 0.4 })
			assert.deepStrictEqual(out, { k: 0 })
			assert.ok(Object.is(out.k, 0))
		})
	})

	describe('independent cross-checks (De Morgan law and Zadeh t-norm axioms)', () => {
		test('matches De Morgan law 1 - max(1 - a, 1 - b) across scalar grid', () => {
			const samples = [0, 0.01, 0.1, 0.25, 0.3333333, 0.5, 0.75, 0.99, 1]
			for (const a of samples) {
				for (const b of samples) {
					const actual = intersectionFuzzyIterative(a, b)
					const expected = deMorganIntersectionScalar(a, b)
					assert.ok(
						Math.abs(actual - expected) <= EPSILON,
						`Mismatch for (${a}, ${b}): actual=${actual}, expected=${expected}`
					)
				}
			}
		})

		test('matches De Morgan law on arrays and variadic calls', () => {
			const a = [0, 0.15, 0.42, 0.73, 0.88, 1]
			const b = [1, 0.61, 0.42, 0.19, 0.95, 0]
			const c = [0.5, 0.22, 0.91, 0.55, 0.3, 0.7]

			const actual = intersectionFuzzyIterative(a, b, c)
			for (let i = 0; i < a.length; i++) {
				const expected = deMorganIntersectionMany([a[i], b[i], c[i]])
				assert.ok(
					Math.abs(actual[i] - expected) <= EPSILON,
					`Array mismatch at ${i}: actual=${actual[i]}, expected=${expected}`
				)
			}
		})

		test('matches De Morgan law over universe of keys for plain object fuzzy sets', () => {
			const a = { alpha: 0.2, beta: 0.85, gamma: 1, delta: 0.4 }
			const b = { beta: 0.35, gamma: 0.6, epsilon: 0.9 }
			const result = intersectionFuzzyIterative(a, b)

			const universe = new Set([...Object.keys(a), ...Object.keys(b)])
			for (const key of universe) {
				const muA = Object.hasOwn(a, key) ? a[key] : 0
				const muB = Object.hasOwn(b, key) ? b[key] : 0
				const expected = deMorganIntersectionScalar(muA, muB)
				const actual = Object.hasOwn(result, key) ? result[key] : 0
				assert.ok(
					Math.abs(actual - expected) <= EPSILON,
					`Object mismatch for key "${key}": actual=${actual}, expected=${expected}`
				)
			}
		})

		test('satisfies commutativity, associativity, idempotence, and crisp Boolean reduction', () => {
			const x = { a: 0.3, b: 0.7, c: 1 }
			const y = { a: 0.8, b: 0.2, d: 0.5 }
			const z = { a: 0.5, b: 0.6, c: 0.4 }

			// Commutativity
			assert.deepStrictEqual(
				intersectionFuzzyIterative(x, y),
				intersectionFuzzyIterative(y, x)
			)

			// Associativity
			assert.deepStrictEqual(
				intersectionFuzzyIterative(intersectionFuzzyIterative(x, y), z),
				intersectionFuzzyIterative(x, intersectionFuzzyIterative(y, z))
			)
			assert.deepStrictEqual(
				intersectionFuzzyIterative(x, y, z),
				intersectionFuzzyIterative(intersectionFuzzyIterative(x, y), z)
			)

			// Idempotence
			assert.deepStrictEqual(intersectionFuzzyIterative(x, x), x)

			// Crisp Boolean AND reduction for {0, 1}
			for (const p of [0, 1]) {
				for (const q of [0, 1]) {
					assert.strictEqual(intersectionFuzzyIterative(p, q), p & q)
				}
			}
		})
	})

	describe('input validation', () => {
		test('rejects fewer than 2 operands', () => {
			assert.throws(() => intersectionFuzzyIterative(), TypeError)
			assert.throws(() => intersectionFuzzyIterative(0.5), TypeError)
			assert.throws(() => intersectionFuzzyIterative([0.5]), TypeError)
			assert.throws(() => intersectionFuzzyIterative({ a: 0.5 }), TypeError)
		})

		test('rejects out-of-range and non-finite numbers', () => {
			for (const bad of [-0.001, -1, 1.001, 2, NaN, Infinity, -Infinity]) {
				assert.throws(() => intersectionFuzzyIterative(bad, 0.5), RangeError)
				assert.throws(() => intersectionFuzzyIterative(0.5, bad), RangeError)
				assert.throws(() => intersectionFuzzyIterative([bad], [0.5]), RangeError)
				assert.throws(() => intersectionFuzzyIterative([0.5], [bad]), RangeError)
				assert.throws(() => intersectionFuzzyIterative({ a: bad }, { a: 0.5 }), RangeError)
				// Also validates disjoint keys in second object
				assert.throws(() => intersectionFuzzyIterative({ a: 0.5 }, { b: bad }), RangeError)
			}
		})

		test('rejects non-number values inside operands', () => {
			for (const bad of ['0.5', true, false, null, undefined, {}, []]) {
				assert.throws(() => intersectionFuzzyIterative([bad], [0.5]), TypeError)
				assert.throws(() => intersectionFuzzyIterative({ a: bad }, { a: 0.5 }), TypeError)
				assert.throws(() => intersectionFuzzyIterative({ a: 0.5 }, { b: bad }), TypeError)
			}
		})

		test('rejects unsupported operand types and mixed operand kinds', () => {
			assert.throws(() => intersectionFuzzyIterative('0.5', '0.3'), TypeError)
			assert.throws(() => intersectionFuzzyIterative(null, null), TypeError)
			assert.throws(() => intersectionFuzzyIterative(undefined, 0.5), TypeError)
			assert.throws(() => intersectionFuzzyIterative(true, false), TypeError)
			assert.throws(() => intersectionFuzzyIterative(new Map(), new Map()), TypeError)
			assert.throws(() => intersectionFuzzyIterative(new Set(), new Set()), TypeError)
			assert.throws(() => intersectionFuzzyIterative(new Date(), new Date()), TypeError)

			// Mixed kinds
			assert.throws(() => intersectionFuzzyIterative(0.5, [0.5]), TypeError)
			assert.throws(() => intersectionFuzzyIterative([0.5], { a: 0.5 }), TypeError)
			assert.throws(() => intersectionFuzzyIterative(0.5, { a: 0.5 }), TypeError)
		})

		test('rejects mismatched array lengths and sparse arrays', () => {
			assert.throws(() => intersectionFuzzyIterative([0.2, 0.5], [0.3]), RangeError)
			assert.throws(() => intersectionFuzzyIterative([], [0.5]), RangeError)
			assert.throws(() => intersectionFuzzyIterative([0.1], [0.2], [0.3, 0.4]), RangeError)

			const sparse = new Array(2)
			sparse[0] = 0.5
			assert.throws(() => intersectionFuzzyIterative(sparse, [0.5, 0.5]), TypeError)
			assert.throws(() => intersectionFuzzyIterative([0.5, 0.5], sparse), TypeError)
		})
	})
})
