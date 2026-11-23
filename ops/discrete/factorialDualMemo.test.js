import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialDualMemo } from './factorialDualMemo.js'

const EULER_GAMMA = 0.5772156649015329

/**
 * Independent reference 1: Lanczos approximation for Gamma(z) on real z > 0.
 * Used for central finite-difference verification of d/dx Gamma(x + 1).
 */
function gammaLanczos(z) {
	const g = 7
	const p = [
		0.99999999999980993,
		676.5203681218851,
		-1259.1392167224028,
		771.32342877765313,
		-176.61502916214059,
		12.507343278686905,
		-0.13857109526572012,
		9.9843695780195716e-6,
		1.5056327351493116e-7,
	]
	const zm1 = z - 1
	let x = p[0]
	for (let i = 1; i < p.length; i++) {
		x += p[i] / (zm1 + i)
	}
	const t = zm1 + g + 0.5
	return Math.sqrt(2 * Math.PI) * Math.pow(t, zm1 + 0.5) * Math.exp(-t) * x
}

/**
 * Independent reference 2: Direct dual-number multiplication recurrence
 *   F(0 + d*eps) = { v: 1, d: -gamma * d }
 *   F(n + d*eps) = { v: n, d } * F((n - 1) + d*eps)
 */
function factorialDualRecurrence(n, d) {
	let v = 1
	let dv = -EULER_GAMMA * d
	for (let k = 1; k <= n; k++) {
		// (k + d*eps) * (v + dv*eps) = k*v + (k*dv + d*v)*eps
		dv = k * dv + d * v
		v = k * v
	}
	return { v, d: dv }
}

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(Math.abs(actual), Math.abs(expected), 1)
	assert.ok(
		diff <= Math.max(absTol, relTol * scale),
		`expected ${actual} to be close to ${expected} (diff=${diff}, tol=${Math.max(absTol, relTol * scale)})`,
	)
}

describe('factorialDualMemo', () => {
	test('computes exact known values and derivatives for small integers', () => {
		const cases = [
			{ n: 0, v: 1, d: -EULER_GAMMA },
			{ n: 1, v: 1, d: 1 - EULER_GAMMA },
			{ n: 2, v: 2, d: 3 - 2 * EULER_GAMMA },
			{ n: 3, v: 6, d: 11 - 6 * EULER_GAMMA },
			{ n: 4, v: 24, d: 50 - 24 * EULER_GAMMA },
			{ n: 5, v: 120, d: 274 - 120 * EULER_GAMMA },
		]
		for (const { n, v, d } of cases) {
			const res = factorialDualMemo({ v: n, d: 1 })
			assert.equal(res.v, v)
			assertClose(res.d, d, 1e-14, 1e-15)
		}
	})

	test('scales derivative linearly with input tangent d (chain rule)', () => {
		const base = factorialDualMemo({ v: 7, d: 1 })
		for (const scale of [-3.5, -1, 0.25, 2, 10]) {
			const scaled = factorialDualMemo({ v: 7, d: scale })
			assert.equal(scaled.v, base.v)
			assertClose(scaled.d, base.d * scale, 1e-14)
		}
	})

	test('handles zero derivative and -0 inputs cleanly', () => {
		const z0 = factorialDualMemo({ v: 0, d: 0 })
		assert.equal(z0.v, 1)
		assert.equal(Object.is(z0.d, 0), true)

		const negZeroV = factorialDualMemo({ v: -0, d: 1 })
		assert.equal(negZeroV.v, 1)
		assertClose(negZeroV.d, -EULER_GAMMA, 1e-15)

		const negZeroD = factorialDualMemo({ v: 10, d: -0 })
		assert.equal(negZeroD.v, 3628800)
		assert.equal(Object.is(negZeroD.d, 0), true)
	})

	test('cross-checks against Lanczos Gamma(x + 1) central finite differences', () => {
		const h = 1e-6
		for (const n of [0, 1, 2, 3, 5, 10, 15, 25, 40, 80, 120]) {
			const d = 1.7
			const res = factorialDualMemo({ v: n, d })
			const expectedV = gammaLanczos(n + 1)
			const expectedD = ((gammaLanczos(n + 1 + h) - gammaLanczos(n + 1 - h)) / (2 * h)) * d
			assertClose(res.v, expectedV, 1e-12)
			assertClose(res.d, expectedD, 1e-8)
		}
	})

	test('cross-checks against independent dual-number multiplication recurrence', () => {
		for (const n of [0, 1, 4, 12, 20, 21, 35, 60, 100, 150]) {
			const d = -0.37
			const res = factorialDualMemo({ v: n, d })
			const ref = factorialDualRecurrence(n, d)
			assertClose(res.v, ref.v, 1e-14)
			assertClose(res.d, ref.d, 1e-12)
		}
	})

	test('matches exact BigInt factorial for all exact IEEE-754 integers (0..20)', () => {
		let bigFact = 1n
		for (let n = 0; n <= 20; n++) {
			if (n > 0) bigFact *= BigInt(n)
			const res = factorialDualMemo({ v: n, d: 1 })
			assert.equal(res.v, Number(bigFact))
		}
	})

	test('memoization returns consistent fresh objects across repeated and out-of-order calls', () => {
		const a = factorialDualMemo({ v: 50, d: 2 })
		const b = factorialDualMemo({ v: 30, d: 2 })
		const a2 = factorialDualMemo({ v: 50, d: 2 })
		const b2 = factorialDualMemo({ v: 30, d: 2 })

		assert.deepEqual(a, a2)
		assert.deepEqual(b, b2)
		assert.notEqual(a, a2)

		// Mutating returned object does not corrupt memoized table
		a.v = -999
		a.d = -999
		const a3 = factorialDualMemo({ v: 50, d: 2 })
		assert.deepEqual(a3, a2)

		// Input object is not mutated
		const input = { v: 12, d: 3 }
		factorialDualMemo(input)
		assert.deepEqual(input, { v: 12, d: 3 })
	})

	test('handles boundary n = 170 and overflow for n > 170', () => {
		const at170UnitD = factorialDualMemo({ v: 170, d: 1 })
		assert.equal(Number.isFinite(at170UnitD.v), true)
		assert.equal(Number.isFinite(at170UnitD.d), true)
		assert.ok(at170UnitD.v > 7e306)
		assert.ok(at170UnitD.d > 3.7e307)

		const at170LargeD = factorialDualMemo({ v: 170, d: 10 })
		assert.equal(Number.isFinite(at170LargeD.v), true)
		assert.equal(at170LargeD.d, Infinity)

		const at170ZeroD = factorialDualMemo({ v: 170, d: 0 })
		assert.equal(Number.isFinite(at170ZeroD.v), true)
		assert.equal(at170ZeroD.d, 0)

		const at171Pos = factorialDualMemo({ v: 171, d: 2 })
		assert.deepEqual(at171Pos, { v: Infinity, d: Infinity })

		const at171Neg = factorialDualMemo({ v: 171, d: -2 })
		assert.deepEqual(at171Neg, { v: Infinity, d: -Infinity })

		const at171Zero = factorialDualMemo({ v: 171, d: 0 })
		assert.deepEqual(at171Zero, { v: Infinity, d: 0 })

		const huge = factorialDualMemo({ v: 1e9, d: 1 })
		assert.deepEqual(huge, { v: Infinity, d: Infinity })
	})

	test('validates input types and domain ranges', () => {
		for (const bad of [null, undefined, 5, '5', true]) {
			assert.throws(() => factorialDualMemo(bad), TypeError)
		}
		assert.throws(() => factorialDualMemo({ v: '3', d: 1 }), TypeError)
		assert.throws(() => factorialDualMemo({ v: 3, d: '1' }), TypeError)
		assert.throws(() => factorialDualMemo({ v: 3 }), TypeError)
		assert.throws(() => factorialDualMemo({ d: 1 }), TypeError)

		for (const badV of [-1, -100, 1.5, 0.1, NaN, Infinity, -Infinity]) {
			assert.throws(() => factorialDualMemo({ v: badV, d: 1 }), RangeError)
		}
		for (const badD of [NaN, Infinity, -Infinity]) {
			assert.throws(() => factorialDualMemo({ v: 3, d: badD }), RangeError)
		}
	})
})
