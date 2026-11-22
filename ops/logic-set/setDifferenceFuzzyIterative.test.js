import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceFuzzyIterative } from './setDifferenceFuzzyIterative.js'

const EPSILON = 1e-12

function assertClose(actual, expected, message) {
	assert.ok(
		Math.abs(actual - expected) <= EPSILON,
		`${message ?? 'Expected values to be close'}: actual=${actual}, expected=${expected}`
	)
}

/**
 * Independent reference computation via De Morgan's law:
 * A \ B = A ∩ ¬B = ¬(¬A ∪ B) = 1 - max(1 - a, b)
 */
function deMorganDifference(a, b) {
	const value = 1 - Math.max(1 - a, b)
	return value === 0 ? 0 : value
}

describe('setDifferenceFuzzyIterative', () => {
	describe('scalar membership values', () => {
		test('computes Zadeh difference min(a, 1 - b) for normal values', () => {
			assertClose(setDifferenceFuzzyIterative(0.8, 0.3), 0.7)
			assertClose(setDifferenceFuzzyIterative(0.2, 0.3), 0.2)
			assert.equal(setDifferenceFuzzyIterative(0.5, 0.5), 0.5)
			assert.equal(setDifferenceFuzzyIterative(0.75, 0.25), 0.75)
			assert.equal(setDifferenceFuzzyIterative(0.25, 0.75), 0.25)
			assertClose(setDifferenceFuzzyIterative(0.9, 0.6), 0.4)
		})

		test('handles boundary values 0 and 1', () => {
			assert.equal(setDifferenceFuzzyIterative(0, 0), 0)
			assert.equal(setDifferenceFuzzyIterative(0, 1), 0)
			assert.equal(setDifferenceFuzzyIterative(1, 0), 1)
			assert.equal(setDifferenceFuzzyIterative(1, 1), 0)
			assert.equal(setDifferenceFuzzyIterative(0.6, 0), 0.6)
			assert.equal(setDifferenceFuzzyIterative(0.6, 1), 0)
			assert.equal(setDifferenceFuzzyIterative(0, 0.6), 0)
			assert.equal(setDifferenceFuzzyIterative(1, 0.25), 0.75)
		})

		test('normalizes -0 to +0', () => {
			assert.ok(Object.is(setDifferenceFuzzyIterative(-0, 0), 0))
			assert.ok(Object.is(setDifferenceFuzzyIterative(0, -0), 0))
			assert.ok(Object.is(setDifferenceFuzzyIterative(0.5, 1), 0))
		})
	})

	describe('array fuzzy sets', () => {
		test('computes element-wise Zadeh difference iteratively', () => {
			const a = [0, 0.25, 0.5, 0.75, 1]
			const b = [1, 0.25, 0.5, 0.75, 0]
			const result = setDifferenceFuzzyIterative(a, b)
			assert.deepEqual(result, [0, 0.25, 0.5, 0.25, 1])
		})

		test('handles empty arrays and single-element arrays', () => {
			assert.deepEqual(setDifferenceFuzzyIterative([], []), [])
			assert.deepEqual(setDifferenceFuzzyIterative([0.75], [0.5]), [0.5])
		})

		test('does not mutate input arrays', () => {
			const a = [0.25, 0.75]
			const b = [0.5, 0.25]
			const snapshotA = [...a]
			const snapshotB = [...b]
			const result = setDifferenceFuzzyIterative(a, b)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual(a, snapshotA)
			assert.deepEqual(b, snapshotB)
		})

		test('handles large arrays iteratively without stack overflow', () => {
			const size = 20000
			const a = new Array(size)
			const b = new Array(size)
			for (let i = 0; i < size; i++) {
				a[i] = (i % 5) / 4
				b[i] = ((i * 3) % 5) / 4
			}
			const result = setDifferenceFuzzyIterative(a, b)
			assert.equal(result.length, size)
			for (let i = 0; i < size; i++) {
				assert.equal(result[i], Math.min(a[i], 1 - b[i]))
			}
		})
	})

	describe('plain object fuzzy sets', () => {
		test('computes difference over overlapping keys', () => {
			const a = { x: 0.75, y: 0.5, z: 0.25 }
			const b = { x: 0.5, y: 0.5, z: 0.75 }
			assert.deepEqual(setDifferenceFuzzyIterative(a, b), {
				x: 0.5,
				y: 0.5,
				z: 0.25,
			})
		})

		test('handles disjoint keys by treating missing memberships as 0', () => {
			const a = { alpha: 0.75, beta: 0.25 }
			const b = { gamma: 0.5, delta: 1 }
			assert.deepEqual(setDifferenceFuzzyIterative(a, b), {
				alpha: 0.75,
				beta: 0.25,
				gamma: 0,
				delta: 0,
			})
		})

		test('handles partially overlapping and empty objects', () => {
			assert.deepEqual(setDifferenceFuzzyIterative({}, {}), {})
			assert.deepEqual(setDifferenceFuzzyIterative({ x: 0.5 }, {}), { x: 0.5 })
			assert.deepEqual(setDifferenceFuzzyIterative({}, { y: 0.5 }), { y: 0 })
			assert.deepEqual(
				setDifferenceFuzzyIterative({ shared: 1, onlyA: 0.5 }, { shared: 0.25, onlyB: 0.75 }),
				{ shared: 0.75, onlyA: 0.5, onlyB: 0 }
			)
		})

		test('supports null-prototype plain objects and does not mutate inputs', () => {
			const a = Object.assign(Object.create(null), { k1: 0.75, k2: 0.5 })
			const b = Object.assign(Object.create(null), { k2: 0.75, k3: 0.25 })
			const result = setDifferenceFuzzyIterative(a, b)
			assert.deepEqual(result, { k1: 0.75, k2: 0.25, k3: 0 })
			assert.equal(a.k1, 0.75)
			assert.equal(b.k3, 0.25)
			assert.equal(Object.hasOwn(a, 'k3'), false)
		})
	})

	describe('input validation', () => {
		test('rejects missing, null, primitive, and non-plain-object inputs', () => {
			assert.throws(() => setDifferenceFuzzyIterative(), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative(0.5), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative(null, null), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative('0.5', '0.5'), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative(true, false), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative(new Map(), new Map()), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative(new Set(), new Set()), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative(new Date(), new Date()), TypeError)
		})

		test('rejects mismatched input representations', () => {
			assert.throws(() => setDifferenceFuzzyIterative(0.5, [0.5]), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative([0.5], { a: 0.5 }), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative({ a: 0.5 }, 0.5), TypeError)
		})

		test('rejects out-of-range or non-finite scalar memberships', () => {
			assert.throws(() => setDifferenceFuzzyIterative(-0.001, 0.5), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative(0.5, 1.001), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative(Number.NaN, 0.5), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative(0.5, Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative(Number.NEGATIVE_INFINITY, 0.5), RangeError)
		})

		test('rejects invalid array inputs', () => {
			assert.throws(() => setDifferenceFuzzyIterative([0.5], [0.5, 0.2]), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative([0.5, -0.1], [0.5, 0.2]), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative([0.5, 0.2], [0.5, 1.1]), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative([0.5, Number.NaN], [0.5, 0.2]), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative([0.5, '0.2'], [0.5, 0.2]), TypeError)

			const sparse = [0.5, , 0.2] // eslint-disable-line no-sparse-arrays
			assert.throws(() => setDifferenceFuzzyIterative(sparse, [0.5, 0.5, 0.2]), TypeError)
		})

		test('rejects invalid plain object entries in either operand', () => {
			assert.throws(() => setDifferenceFuzzyIterative({ a: -0.1 }, { a: 0.5 }), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative({ a: 0.5 }, { a: 1.5 }), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative({ a: 0.5 }, { b: -0.2 }), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative({ a: 0.5 }, { b: Number.NaN }), RangeError)
			assert.throws(() => setDifferenceFuzzyIterative({ a: '0.5' }, { a: 0.5 }), TypeError)
			assert.throws(() => setDifferenceFuzzyIterative({ a: 0.5 }, { b: null }), TypeError)
		})
	})

	describe('cross-checks against independent computations', () => {
		test('matches De Morgan formulation 1 - max(1 - a, b) across [0, 1] x [0, 1]', () => {
			const grid = [0, 0.1, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1]
			const arrA = []
			const arrB = []
			const objA = {}
			const objB = {}

			for (let i = 0; i < grid.length; i++) {
				for (let j = 0; j < grid.length; j++) {
					const a = grid[i]
					const b = grid[j]
					const expected = deMorganDifference(a, b)
					const actual = setDifferenceFuzzyIterative(a, b)
					assertClose(actual, expected, `scalar (${a}, ${b})`)

					arrA.push(a)
					arrB.push(b)
					objA[`p_${i}_${j}`] = a
					objB[`p_${i}_${j}`] = b
				}
			}

			const actualArr = setDifferenceFuzzyIterative(arrA, arrB)
			for (let k = 0; k < actualArr.length; k++) {
				assertClose(actualArr[k], deMorganDifference(arrA[k], arrB[k]), `array index ${k}`)
			}

			const actualObj = setDifferenceFuzzyIterative(objA, objB)
			for (const key of Object.keys(actualObj)) {
				assertClose(actualObj[key], deMorganDifference(objA[key], objB[key]), `object key ${key}`)
			}
		})

		test('agrees with crisp Set difference for {0, 1} indicator sets', () => {
			const universe = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5']
			const crispA = new Set(['e0', 'e1', 'e3', 'e4'])
			const crispB = new Set(['e1', 'e2', 'e4'])

			const expectedCrispDiff = new Set([...crispA].filter((el) => !crispB.has(el)))

			const arrA = universe.map((el) => (crispA.has(el) ? 1 : 0))
			const arrB = universe.map((el) => (crispB.has(el) ? 1 : 0))
			const fuzzyArrDiff = setDifferenceFuzzyIterative(arrA, arrB)

			const objA = Object.fromEntries([...crispA].map((el) => [el, 1]))
			const objB = Object.fromEntries([...crispB].map((el) => [el, 1]))
			const fuzzyObjDiff = setDifferenceFuzzyIterative(objA, objB)

			for (let i = 0; i < universe.length; i++) {
				const el = universe[i]
				const expectedIndicator = expectedCrispDiff.has(el) ? 1 : 0
				assert.equal(fuzzyArrDiff[i], expectedIndicator)
				assert.equal(fuzzyObjDiff[el] ?? 0, expectedIndicator)
			}
		})

		test('satisfies Zadeh fuzzy difference bounds and monotonicity', () => {
			const samples = [0, 0.15, 0.4, 0.5, 0.85, 1]
			for (const a of samples) {
				// Self-difference min(a, 1 - a) is always <= 0.5 and equals 0 for crisp 0 or 1
				const selfDiff = setDifferenceFuzzyIterative(a, a)
				assert.ok(selfDiff <= 0.5 + EPSILON)
				if (a === 0 || a === 1) {
					assert.equal(selfDiff, 0)
				}

				for (const b of samples) {
					const d = setDifferenceFuzzyIterative(a, b)
					assert.ok(d >= 0 && d <= a + EPSILON && d <= 1 - b + EPSILON)
				}
			}

			// Monotonicity: increasing a never decreases a \ b; increasing b never increases a \ b
			for (let i = 0; i < samples.length - 1; i++) {
				for (const fixed of samples) {
					assert.ok(
						setDifferenceFuzzyIterative(samples[i], fixed) <=
							setDifferenceFuzzyIterative(samples[i + 1], fixed) + EPSILON
					)
					assert.ok(
						setDifferenceFuzzyIterative(fixed, samples[i]) >=
							setDifferenceFuzzyIterative(fixed, samples[i + 1]) - EPSILON
					)
				}
			}
		})
	})
})
