import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceFuzzySeries } from './setDifferenceFuzzySeries.js'

const EPSILON = 1e-12

function assertClose(actual, expected, tol = EPSILON, message) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `Expected ${actual} to be within ${tol} of ${expected}`
	)
}

/**
 * Independent binomial / Catalan series evaluation of `|d| = sqrt(1 - (1 - d^2))`:
 *   sqrt(1 - t) = 1 - sum_{k=1}^{N} c_k * t^k,
 * where c_1 = 1/2 and c_{k+1} = c_k * (2k - 1) / (2k + 2).
 */
function absViaBinomialSeries(d, terms = 120) {
	const t = 1 - d * d
	let sum = 0
	let coeff = 0.5
	let tPow = t
	for (let k = 1; k <= terms; k++) {
		sum += coeff * tPow
		coeff *= (2 * k - 1) / (2 * k + 2)
		tPow *= t
	}
	return 1 - sum
}

describe('setDifferenceFuzzySeries', () => {
	describe('normal cases', () => {
		test('scalar fuzzy memberships', () => {
			assertClose(setDifferenceFuzzySeries(0.8, 0.3), 0.7)
			assertClose(setDifferenceFuzzySeries(0.4, 0.2), 0.4)
			assertClose(setDifferenceFuzzySeries(0.9, 0.75), 0.25)
			assertClose(setDifferenceFuzzySeries(0.5, 0.5), 0.5)
		})

		test('array fuzzy membership vectors', () => {
			const a = [0.8, 0.4, 1.0, 0.0, 0.6]
			const b = [0.3, 0.2, 0.7, 0.9, 0.4]
			const expected = [0.7, 0.4, 0.3, 0.0, 0.6]
			const actual = setDifferenceFuzzySeries(a, b)

			assert.equal(actual.length, expected.length)
			for (let i = 0; i < expected.length; i++) {
				assertClose(actual[i], expected[i])
			}
		})

		test('plain object fuzzy sets with overlapping and disjoint keys', () => {
			const a = { cold: 0.9, warm: 0.4, hot: 0.1 }
			const b = { warm: 0.7, hot: 0.2, scorching: 0.8 }
			const actual = setDifferenceFuzzySeries(a, b)

			assert.deepEqual(Object.keys(actual).sort(), ['cold', 'hot', 'scorching', 'warm'])
			assertClose(actual.cold, 0.9)
			assertClose(actual.warm, 0.3)
			assertClose(actual.hot, 0.1)
			assertClose(actual.scorching, 0)
		})

		test('Map fuzzy sets with overlapping, disjoint, and non-string keys', () => {
			const objKey = { id: 1 }
			const a = new Map([
				['alpha', 0.85],
				['beta', 0.3],
				[objKey, 0.6],
			])
			const b = new Map([
				['alpha', 0.5],
				['gamma', 0.9],
				[objKey, 0.8],
			])
			const actual = setDifferenceFuzzySeries(a, b)

			assert.ok(actual instanceof Map)
			assert.equal(actual.size, 4)
			assertClose(actual.get('alpha'), 0.5)
			assertClose(actual.get('beta'), 0.3)
			assertClose(actual.get('gamma'), 0)
			assertClose(actual.get(objKey), 0.2)
		})

		test('does not mutate input containers', () => {
			const arrA = [0.7, 0.2]
			const arrB = [0.5, 0.9]
			setDifferenceFuzzySeries(arrA, arrB)
			assert.deepEqual(arrA, [0.7, 0.2])
			assert.deepEqual(arrB, [0.5, 0.9])

			const objA = { x: 0.7 }
			const objB = { y: 0.4 }
			setDifferenceFuzzySeries(objA, objB)
			assert.deepEqual(objA, { x: 0.7 })
			assert.deepEqual(objB, { y: 0.4 })

			const mapA = new Map([['x', 0.7]])
			const mapB = new Map([['y', 0.4]])
			setDifferenceFuzzySeries(mapA, mapB)
			assert.deepEqual([...mapA], [['x', 0.7]])
			assert.deepEqual([...mapB], [['y', 0.4]])
		})
	})

	describe('edge cases and fuzzy set laws', () => {
		test('crisp (Boolean) boundary corners match a && !b', () => {
			assert.equal(setDifferenceFuzzySeries(0, 0), 0)
			assert.equal(setDifferenceFuzzySeries(0, 1), 0)
			assert.equal(setDifferenceFuzzySeries(1, 0), 1)
			assert.equal(setDifferenceFuzzySeries(1, 1), 0)
		})

		test('empty containers return empty containers of the same kind', () => {
			assert.deepEqual(setDifferenceFuzzySeries([], []), [])
			assert.deepEqual(setDifferenceFuzzySeries({}, {}), {})
			const emptyMap = setDifferenceFuzzySeries(new Map(), new Map())
			assert.ok(emptyMap instanceof Map)
			assert.equal(emptyMap.size, 0)
		})

		test('normalizes -0 to +0', () => {
			assert.ok(Object.is(setDifferenceFuzzySeries(-0, 0), 0))
			assert.ok(Object.is(setDifferenceFuzzySeries(-0, 1), 0))
			assert.ok(Object.is(setDifferenceFuzzySeries(0, -0), 0))
			assert.ok(Object.is(setDifferenceFuzzySeries(1, 1), 0))
		})

		test('fuzzy self-difference A \\ A preserves min(mu, 1 - mu)', () => {
			// In Zadeh fuzzy logic, A \ A is non-empty when 0 < mu_A(x) < 1
			assertClose(setDifferenceFuzzySeries(0.5, 0.5), 0.5)
			assertClose(setDifferenceFuzzySeries(0.3, 0.3), 0.3)
			assertClose(setDifferenceFuzzySeries(0.8, 0.8), 0.2)
		})

		test('identity, annihilation, monotonicity, and boundedness laws', () => {
			const A = { a: 0, b: 0.25, c: 0.5, d: 0.75, e: 1 }
			const empty = { a: 0, b: 0, c: 0, d: 0, e: 0 }
			const universe = { a: 1, b: 1, c: 1, d: 1, e: 1 }
			const B1 = { a: 0.1, b: 0.2, c: 0.3, d: 0.4, e: 0.5 }
			const B2 = { a: 0.2, b: 0.5, c: 0.6, d: 0.8, e: 0.9 }

			// A \ empty = A
			const diffEmpty = setDifferenceFuzzySeries(A, empty)
			for (const k of Object.keys(A)) {
				assertClose(diffEmpty[k], A[k])
			}

			// A \ U = empty and empty \ B = empty
			const diffU = setDifferenceFuzzySeries(A, universe)
			const emptyDiffB = setDifferenceFuzzySeries(empty, B2)
			for (const k of Object.keys(A)) {
				assert.equal(diffU[k], 0)
				assert.equal(emptyDiffB[k], 0)
			}

			// Antitonicity in B: B1 <= B2 => (A \ B2) <= (A \ B1), and boundedness in [0, A]
			const diffB1 = setDifferenceFuzzySeries(A, B1)
			const diffB2 = setDifferenceFuzzySeries(A, B2)
			for (const k of Object.keys(A)) {
				assert.ok(diffB2[k] <= diffB1[k] + EPSILON)
				assert.ok(diffB1[k] >= 0 && diffB1[k] <= A[k] + EPSILON)
				assert.ok(diffB2[k] >= 0 && diffB2[k] <= A[k] + EPSILON)
			}
		})

		test('supports null-prototype objects and literal __proto__ key safely', () => {
			const a = Object.create(null)
			a.x = 0.8
			a['__proto__'] = 0.6

			const b = Object.create(null)
			b.x = 0.3
			b['__proto__'] = 0.2

			const result = setDifferenceFuzzySeries(a, b)
			assert.equal(Object.getPrototypeOf(result), Object.prototype)
			assert.ok(Object.hasOwn(result, '__proto__'))
			assertClose(result.x, 0.7)
			assertClose(result['__proto__'], 0.6)
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError on non-number membership values', () => {
			assert.throws(() => setDifferenceFuzzySeries('0.5', 0.5), TypeError)
			assert.throws(() => setDifferenceFuzzySeries(0.5, '0.5'), TypeError)
			assert.throws(() => setDifferenceFuzzySeries(true, 0.5), TypeError)
			assert.throws(() => setDifferenceFuzzySeries(null, undefined), TypeError)
			assert.throws(() => setDifferenceFuzzySeries(['0.5'], [0.5]), TypeError)
			assert.throws(() => setDifferenceFuzzySeries([0.5], [null]), TypeError)
			assert.throws(() => setDifferenceFuzzySeries({ x: '0.5' }, { x: 0.5 }), TypeError)
			assert.throws(() => setDifferenceFuzzySeries({ x: 0.5 }, { y: undefined }), TypeError)
			assert.throws(
				() => setDifferenceFuzzySeries(new Map([['x', 0.5]]), new Map([['y', 'bad']])),
				TypeError
			)
		})

		test('throws RangeError on non-finite or out-of-[0, 1] membership values', () => {
			for (const bad of [-0.0001, -1, 1.0001, 2, Number.NaN, Infinity, -Infinity]) {
				assert.throws(() => setDifferenceFuzzySeries(bad, 0.5), RangeError)
				assert.throws(() => setDifferenceFuzzySeries(0.5, bad), RangeError)
				assert.throws(() => setDifferenceFuzzySeries([bad], [0.5]), RangeError)
				assert.throws(() => setDifferenceFuzzySeries([0.5], [bad]), RangeError)
				assert.throws(() => setDifferenceFuzzySeries({ a: bad }, { a: 0.5 }), RangeError)
				assert.throws(() => setDifferenceFuzzySeries({ a: 0.5 }, { b: bad }), RangeError)
				assert.throws(
					() => setDifferenceFuzzySeries(new Map([['a', 0.5]]), new Map([['b', bad]])),
					RangeError
				)
			}
		})

		test('throws TypeError on mismatched or unsupported container types', () => {
			assert.throws(() => setDifferenceFuzzySeries(0.5, [0.5]), TypeError)
			assert.throws(() => setDifferenceFuzzySeries([0.5], { 0: 0.5 }), TypeError)
			assert.throws(() => setDifferenceFuzzySeries({ x: 0.5 }, new Map([['x', 0.5]])), TypeError)
			assert.throws(() => setDifferenceFuzzySeries(new Set([0.5]), new Set([0.5])), TypeError)
			assert.throws(() => setDifferenceFuzzySeries(new Date(), new Date()), TypeError)
			assert.throws(() => setDifferenceFuzzySeries(/a/, /b/), TypeError)
		})

		test('throws RangeError on mismatched array lengths and TypeError on sparse arrays', () => {
			assert.throws(() => setDifferenceFuzzySeries([0.5], [0.5, 0.2]), RangeError)
			assert.throws(() => setDifferenceFuzzySeries([], [0.1]), RangeError)

			const sparseA = new Array(2)
			sparseA[0] = 0.5
			assert.throws(() => setDifferenceFuzzySeries(sparseA, [0.5, 0.5]), TypeError)

			const sparseB = new Array(2)
			sparseB[1] = 0.5
			assert.throws(() => setDifferenceFuzzySeries([0.5, 0.5], sparseB), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		test('cross-check against direct Zadeh min(a, 1 - b) and piecewise definition over 21x21 grid', () => {
			const steps = 20
			for (let i = 0; i <= steps; i++) {
				for (let j = 0; j <= steps; j++) {
					const a = i / steps
					const b = j / steps
					const actual = setDifferenceFuzzySeries(a, b)
					const viaMin = Math.min(a, 1 - b)
					const viaPiecewise = a + b <= 1 ? a : 1 - b

					assertClose(actual, viaMin, 1e-15, `min mismatch at (${a}, ${b})`)
					assertClose(actual, viaPiecewise, 1e-15, `piecewise mismatch at (${a}, ${b})`)
				}
			}
		})

		test('cross-check against independent binomial/Catalan series expansion for |a + b - 1|', () => {
			const pairs = [
				[0.05, 0.1],
				[0.2, 0.3],
				[0.9, 0.85],
				[0.75, 0.6],
				[0.15, 0.4],
				[1.0, 0.7],
				[0.3, 0.0],
				[0.82, 0.58],
			]

			for (const [a, b] of pairs) {
				const d = a + b - 1
				const absSeries = absViaBinomialSeries(d, 150)
				const viaSeries = 0.5 * (1 + a - b - absSeries)
				const actual = setDifferenceFuzzySeries(a, b)

				assertClose(actual, viaSeries, 1e-9, `series mismatch at (${a}, ${b})`)
			}
		})

		test('cross-check array and object outputs against independent elementwise Zadeh intersection with complement', () => {
			const keys = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']
			const arrA = [0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.875, 1.0]
			const arrB = [0.9, 0.75, 0.6, 0.5, 0.4, 0.25, 0.1, 0.0]

			const objA = Object.fromEntries(keys.map((k, idx) => [k, arrA[idx]]))
			const objB = Object.fromEntries(keys.map((k, idx) => [k, arrB[idx]]))

			const arrRes = setDifferenceFuzzySeries(arrA, arrB)
			const objRes = setDifferenceFuzzySeries(objA, objB)

			for (let i = 0; i < keys.length; i++) {
				const complementB = 1 - arrB[i]
				const independent = Math.min(arrA[i], complementB)
				assertClose(arrRes[i], independent, 1e-15)
				assertClose(objRes[keys[i]], independent, 1e-15)
			}
		})
	})
})
