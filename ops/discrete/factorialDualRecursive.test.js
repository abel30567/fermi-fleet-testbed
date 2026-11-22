import { describe, it } from 'node:test'
import assert from 'node:assert'
import { factorialDualRecursive } from './factorialDualRecursive.js'

const GAMMA = 0.5772156649015328606

/**
 * Independent reference 1: direct iterative factorial + harmonic sum
 * v = n!, d = n! * (H_n - γ) * tangent
 */
function directHarmonicFactorialDual(n, tangent) {
	let fact = 1
	let harmonic = 0
	for (let k = 1; k <= n; k++) {
		fact *= k
		harmonic += 1 / k
	}
	const deriv = fact * (harmonic - GAMMA) * tangent
	return { v: fact, d: deriv === 0 ? 0 : deriv }
}

/**
 * Independent reference 2: Lanczos approximation for Γ(z) (g = 7, 9 coefficients),
 * evaluated at z = x + 1 with central finite differences for the derivative.
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
	const z1 = z - 1
	let x = p[0]
	for (let i = 1; i < p.length; i++) {
		x += p[i] / (z1 + i)
	}
	const t = z1 + g + 0.5
	return Math.sqrt(2 * Math.PI) * Math.pow(t, z1 + 0.5) * Math.exp(-t) * x
}

function lanczosFactorialDual(n, tangent, h = 1e-6) {
	const f = (x) => gammaLanczos(x + 1)
	const v = f(n)
	const df = (f(n + h) - f(n - h)) / (2 * h)
	return { v, d: df * tangent }
}

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	const tol = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	)
}

describe('factorialDualRecursive', () => {
	it('computes normal cases n = 1, 2, 5, 10, 20 with unit tangent d = 1', () => {
		const expectedValues = [
			[1, 1],
			[2, 2],
			[5, 120],
			[10, 3628800],
			[20, 2432902008176640000],
		]

		for (const [n, expectedFact] of expectedValues) {
			const res = factorialDualRecursive({ v: n, d: 1 })
			const ref = directHarmonicFactorialDual(n, 1)
			assert.strictEqual(res.v, expectedFact, `n=${n} primal value`)
			assertClose(res.d, ref.d, 1e-13, 1e-13, `n=${n} derivative`)
		}
	})

	it('handles edge case n = 0 (0! = 1, derivative = -γ * d)', () => {
		const res1 = factorialDualRecursive({ v: 0, d: 1 })
		assert.strictEqual(res1.v, 1)
		assertClose(res1.d, -GAMMA, 1e-15, 1e-15, 'n=0, d=1')

		const resScaled = factorialDualRecursive({ v: 0, d: 3.5 })
		assert.strictEqual(resScaled.v, 1)
		assertClose(resScaled.d, -GAMMA * 3.5, 1e-15, 1e-15, 'n=0, d=3.5')
	})

	it('handles edge case d = 0 without producing negative zero', () => {
		for (const n of [0, 1, 5, 10]) {
			const res = factorialDualRecursive({ v: n, d: 0 })
			const ref = directHarmonicFactorialDual(n, 0)
			assert.strictEqual(res.v, ref.v)
			assert.ok(Object.is(res.d, 0), `n=${n}, d=0 should produce +0, got ${res.d}`)
		}
	})

	it('handles negative d and preserves linearity in the tangent component', () => {
		for (const n of [0, 1, 5, 10, 20]) {
			const unit = factorialDualRecursive({ v: n, d: 1 })
			for (const scale of [-1, -2.5, -0.125, 4.25]) {
				const scaled = factorialDualRecursive({ v: n, d: scale })
				assert.strictEqual(scaled.v, unit.v)
				assertClose(scaled.d, unit.d * scale, 1e-13, 1e-13, `n=${n}, d=${scale}`)
			}
		}
	})

	it('handles the upper boundary n = 170 without overflowing', () => {
		const res = factorialDualRecursive({ v: 170, d: 1 })
		const ref = directHarmonicFactorialDual(170, 1)
		assert.ok(Number.isFinite(res.v), '170! primal must be finite')
		assert.ok(Number.isFinite(res.d), '170! derivative must be finite')
		assertClose(res.v, ref.v, 1e-13, 0, 'n=170 primal')
		assertClose(res.d, ref.d, 1e-13, 0, 'n=170 derivative')
	})

	it('cross-checks against Lanczos Γ(x+1) with central finite-difference derivative', () => {
		const cases = [
			[0, 1],
			[1, 1],
			[2, -1.5],
			[5, 2.25],
			[10, 0.5],
			[15, -0.75],
			[20, 1],
		]

		for (const [n, d] of cases) {
			const res = factorialDualRecursive({ v: n, d })
			const lanczos = lanczosFactorialDual(n, d)
			assertClose(res.v, lanczos.v, 1e-12, 1e-12, `Lanczos primal n=${n}`)
			assertClose(res.d, lanczos.d, 1e-8, 1e-8, `Lanczos derivative n=${n}, d=${d}`)
		}
	})

	it('cross-checks against direct harmonic sum n! * (H_n - γ) * d across wide range', () => {
		for (const n of [0, 1, 2, 3, 5, 10, 20, 50, 100, 170]) {
			for (const d of [1, -3.2, 0.25]) {
				const res = factorialDualRecursive({ v: n, d })
				const ref = directHarmonicFactorialDual(n, d)
				assertClose(res.v, ref.v, 1e-13, 0, `harmonic primal n=${n}, d=${d}`)
				assertClose(res.d, ref.d, 1e-13, 1e-13, `harmonic derivative n=${n}, d=${d}`)
			}
		}
	})

	it('rejects non-integer, negative, and >170 primal values with RangeError', () => {
		for (const badV of [-1, -10, 0.5, 2.5, -0.1, 171, 200, 1000]) {
			assert.throws(
				() => factorialDualRecursive({ v: badV, d: 1 }),
				RangeError,
				`v=${badV} should throw RangeError`,
			)
		}
	})

	it('rejects invalid dual inputs and non-finite components', () => {
		for (const invalid of [null, undefined, 5, '5', true, {}, { v: 5 }, { d: 1 }, { v: '5', d: 1 }, { v: 5, d: '1' }]) {
			assert.throws(
				() => factorialDualRecursive(invalid),
				TypeError,
				`invalid input ${JSON.stringify(invalid)} should throw TypeError`,
			)
		}

		for (const nonFinite of [
			{ v: NaN, d: 1 },
			{ v: Infinity, d: 1 },
			{ v: -Infinity, d: 1 },
			{ v: 5, d: NaN },
			{ v: 5, d: Infinity },
			{ v: 5, d: -Infinity },
		]) {
			assert.throws(
				() => factorialDualRecursive(nonFinite),
				RangeError,
				`non-finite input ${JSON.stringify(nonFinite)} should throw RangeError`,
			)
		}
	})
})
