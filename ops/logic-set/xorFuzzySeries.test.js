import { describe, test } from 'node:test'
import assert from 'node:assert'
import { xorFuzzySeries } from './xorFuzzySeries.js'

const EPSILON = 1e-12

function assertNear(actual, expected, message) {
	assert.ok(
		Math.abs(actual - expected) <= EPSILON,
		`${message ?? 'Expected near equality'}: actual=${actual}, expected=${expected}`
	)
}

/**
 * Independent reference 1: canonical Zadeh DNF XOR
 *   (a AND NOT b) OR (NOT a AND b)
 */
function referenceZadehXorDNF(a, b) {
	return Math.max(Math.min(a, 1 - b), Math.min(1 - a, b))
}

/**
 * Independent reference 2: Zadeh CNF XOR
 *   (a OR b) AND NOT (a AND b)
 */
function referenceZadehXorCNF(a, b) {
	return Math.min(Math.max(a, b), 1 - Math.min(a, b))
}

/**
 * Independent reference 3: signed-centered identity
 *   s(x) = 1 - 2x,  s(a XOR b) = sign(s(a) * s(b)) * min(|s(a)|, |s(b)|)
 */
function referenceSignedCenter(a, b) {
	const sa = 1 - 2 * a
	const sb = 1 - 2 * b
	const sOut = Math.sign(sa * sb) * Math.min(Math.abs(sa), Math.abs(sb))
	return (1 - sOut) / 2
}

describe('xorFuzzySeries', () => {
	describe('crisp Boolean boundary cases', () => {
		test('matches classical Boolean XOR truth table on {0, 1}', () => {
			assert.strictEqual(xorFuzzySeries(0, 0), 0)
			assert.strictEqual(xorFuzzySeries(0, 1), 1)
			assert.strictEqual(xorFuzzySeries(1, 0), 1)
			assert.strictEqual(xorFuzzySeries(1, 1), 0)
		})
	})

	describe('normal scalar fuzzy cases', () => {
		test('computes Zadeh XOR across typical membership values', () => {
			assertNear(xorFuzzySeries(0.3, 0.4), 0.4)
			assertNear(xorFuzzySeries(0.6, 0.7), 0.4)
			assertNear(xorFuzzySeries(0.2, 0.7), 0.7)
			assertNear(xorFuzzySeries(0.2, 0.8), 0.8)
			assertNear(xorFuzzySeries(0.85, 0.15), 0.85)
			assertNear(xorFuzzySeries(0.75, 0.9), 0.25)
		})

		test('satisfies Zadeh XOR algebraic laws', () => {
			const samples = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]
			for (const a of samples) {
				// Identity with 0: a XOR 0 = a
				assertNear(xorFuzzySeries(a, 0), a, `identity(${a})`)
				assertNear(xorFuzzySeries(0, a), a, `left-identity(${a})`)

				// Complement with 1: a XOR 1 = 1 - a
				assertNear(xorFuzzySeries(a, 1), 1 - a, `negation(${a})`)
				assertNear(xorFuzzySeries(1, a), 1 - a, `left-negation(${a})`)

				// Absorption at 0.5: a XOR 0.5 = 0.5
				assertNear(xorFuzzySeries(a, 0.5), 0.5, `absorbing(${a})`)

				// Self-XOR: a XOR a = min(a, 1 - a)
				assertNear(xorFuzzySeries(a, a), Math.min(a, 1 - a), `self(${a})`)

				for (const b of samples) {
					// Commutativity: a XOR b = b XOR a
					assertNear(xorFuzzySeries(a, b), xorFuzzySeries(b, a), `commutativity(${a}, ${b})`)

					// Complement invariance: (1 - a) XOR (1 - b) = a XOR b
					assertNear(
						xorFuzzySeries(1 - a, 1 - b),
						xorFuzzySeries(a, b),
						`complement-invariance(${a}, ${b})`
					)

					// Associativity: (a XOR b) XOR c = a XOR (b XOR c)
					for (const c of [0, 0.2, 0.5, 0.7, 1]) {
						const lhs = xorFuzzySeries(xorFuzzySeries(a, b), c)
						const rhs = xorFuzzySeries(a, xorFuzzySeries(b, c))
						assertNear(lhs, rhs, `associativity(${a}, ${b}, ${c})`)
					}
				}
			}
		})
	})

	describe('edge cases', () => {
		test('handles negative zero and preserves +0', () => {
			assert.ok(Object.is(xorFuzzySeries(-0, -0), 0))
			assert.ok(Object.is(xorFuzzySeries(-0, 0), 0))
			assert.ok(Object.is(xorFuzzySeries(1, 1), 0))
		})

		test('preserves precision near 0 and 1 without catastrophic cancellation', () => {
			assert.strictEqual(xorFuzzySeries(0, 1e-17), 1e-17)
			assert.strictEqual(xorFuzzySeries(1e-17, 0), 1e-17)
			assertNear(xorFuzzySeries(1, 1 - 1e-12), 1e-12)
			assertNear(xorFuzzySeries(0.5, 0.5), 0.5)
		})

		test('handles a + b === 1 boundary accurately', () => {
			for (const a of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
				const b = 1 - a
				const expected = Math.max(a, b)
				assertNear(xorFuzzySeries(a, b), expected, `boundary(${a}, ${b})`)
			}
		})

		test('handles empty arrays and empty fuzzy set objects', () => {
			assert.deepStrictEqual(xorFuzzySeries([], []), [])
			assert.deepStrictEqual(xorFuzzySeries({}, {}), {})
		})

		test('handles null-prototype fuzzy set objects', () => {
			const a = Object.assign(Object.create(null), { x: 0.2, y: 0.9 })
			const b = Object.assign(Object.create(null), { y: 0.4, z: 0.7 })
			const res = xorFuzzySeries(a, b)
			assertNear(res.x, 0.2)
			assertNear(res.y, 0.6)
			assertNear(res.z, 0.7)
		})
	})

	describe('fuzzy arrays and fuzzy set objects', () => {
		test('computes elementwise Zadeh XOR on membership arrays', () => {
			const res = xorFuzzySeries([0, 0.2, 0.5, 0.8, 1], [0, 0.7, 0.3, 0.9, 1])
			assert.strictEqual(res.length, 5)
			assertNear(res[0], 0)
			assertNear(res[1], 0.7)
			assertNear(res[2], 0.5)
			assertNear(res[3], 0.2)
			assertNear(res[4], 0)
		})

		test('computes symmetric difference on plain fuzzy set objects with missing keys as 0', () => {
			const setA = { alpha: 0.3, beta: 0.8, gamma: 1.0 }
			const setB = { beta: 0.6, gamma: 1.0, delta: 0.45 }
			const res = xorFuzzySeries(setA, setB)
			assert.deepStrictEqual(Object.keys(res).sort(), ['alpha', 'beta', 'delta', 'gamma'])
			assertNear(res.alpha, 0.3)
			assertNear(res.beta, 0.4)
			assertNear(res.gamma, 0)
			assertNear(res.delta, 0.45)
		})

		test('does not mutate input arrays or objects', () => {
			const arrA = [0.2, 0.8]
			const arrB = [0.6, 0.3]
			xorFuzzySeries(arrA, arrB)
			assert.deepStrictEqual(arrA, [0.2, 0.8])
			assert.deepStrictEqual(arrB, [0.6, 0.3])

			const objA = { a: 0.2 }
			const objB = { b: 0.7 }
			xorFuzzySeries(objA, objB)
			assert.deepStrictEqual(objA, { a: 0.2 })
			assert.deepStrictEqual(objB, { b: 0.7 })
		})
	})

	describe('cross-check against independent computations', () => {
		test('agrees with Zadeh DNF, Zadeh CNF, and signed-centered formula over dense grid', () => {
			const steps = 40
			for (let i = 0; i <= steps; i++) {
				const a = i / steps
				for (let j = 0; j <= steps; j++) {
					const b = j / steps
					const actual = xorFuzzySeries(a, b)
					const dnf = referenceZadehXorDNF(a, b)
					const cnf = referenceZadehXorCNF(a, b)
					const signed = referenceSignedCenter(a, b)

					assert.ok(actual >= 0 && actual <= 1, `out of [0, 1] for (${a}, ${b}): ${actual}`)
					assertNear(actual, dnf, `DNF mismatch at (${a}, ${b})`)
					assertNear(actual, cnf, `CNF mismatch at (${a}, ${b})`)
					assertNear(actual, signed, `signed-center mismatch at (${a}, ${b})`)
				}
			}
		})

		test('agrees with independent Zadeh DNF on fuzzy set objects', () => {
			const setA = { u1: 0.13, u2: 0.47, u3: 0.88, u4: 0.5 }
			const setB = { u2: 0.61, u3: 0.72, u4: 0.19, u5: 0.94 }
			const actual = xorFuzzySeries(setA, setB)
			const keys = new Set([...Object.keys(setA), ...Object.keys(setB)])
			for (const k of keys) {
				const expected = referenceZadehXorDNF(setA[k] ?? 0, setB[k] ?? 0)
				assertNear(actual[k], expected, `fuzzy set key ${k}`)
			}
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError on wrong argument count', () => {
			assert.throws(() => xorFuzzySeries(), TypeError)
			assert.throws(() => xorFuzzySeries(0.5), TypeError)
			assert.throws(() => xorFuzzySeries(0.5, 0.5, 0.5), TypeError)
		})

		test('throws RangeError on non-finite or out-of-range scalar memberships', () => {
			assert.throws(() => xorFuzzySeries(-0.001, 0.5), RangeError)
			assert.throws(() => xorFuzzySeries(0.5, 1.001), RangeError)
			assert.throws(() => xorFuzzySeries(NaN, 0.5), RangeError)
			assert.throws(() => xorFuzzySeries(0.5, Infinity), RangeError)
			assert.throws(() => xorFuzzySeries(-Infinity, 0.5), RangeError)
		})

		test('throws TypeError on unsupported or mismatched operand types', () => {
			assert.throws(() => xorFuzzySeries('0.5', 0.5), TypeError)
			assert.throws(() => xorFuzzySeries(true, false), TypeError)
			assert.throws(() => xorFuzzySeries(null, null), TypeError)
			assert.throws(() => xorFuzzySeries(undefined, 0.5), TypeError)
			assert.throws(() => xorFuzzySeries(0.5, [0.5]), TypeError)
			assert.throws(() => xorFuzzySeries([0.5], { a: 0.5 }), TypeError)
			assert.throws(() => xorFuzzySeries(new Map(), new Map()), TypeError)
			assert.throws(() => xorFuzzySeries(new Set(), new Set()), TypeError)
			assert.throws(() => xorFuzzySeries(new Date(), new Date()), TypeError)
		})

		test('validates array lengths, sparse slots, and element values', () => {
			assert.throws(() => xorFuzzySeries([0.2], [0.2, 0.3]), RangeError)
			assert.throws(() => xorFuzzySeries([0.2, -0.1], [0.2, 0.3]), RangeError)
			assert.throws(() => xorFuzzySeries([0.2, 0.5], [0.2, NaN]), RangeError)
			assert.throws(() => xorFuzzySeries([0.2, '0.5'], [0.2, 0.5]), TypeError)
			const sparse = new Array(2)
			sparse[0] = 0.5
			assert.throws(() => xorFuzzySeries(sparse, [0.5, 0.5]), TypeError)
		})

		test('validates fuzzy set object values', () => {
			assert.throws(() => xorFuzzySeries({ a: 1.5 }, { a: 0.2 }), RangeError)
			assert.throws(() => xorFuzzySeries({ a: 0.5 }, { b: -0.2 }), RangeError)
			assert.throws(() => xorFuzzySeries({ a: 0.5 }, { a: NaN }), RangeError)
			assert.throws(() => xorFuzzySeries({ a: '0.5' }, { a: 0.2 }), TypeError)
		})
	})
})
