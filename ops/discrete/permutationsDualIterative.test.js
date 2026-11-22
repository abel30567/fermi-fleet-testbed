import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsDualIterative } from './permutationsDualIterative.js'

/**
 * Independent scalar falling factorial P(x, k) = prod_{i=0}^{k-1} (x - i).
 */
function scalarFallingFactorial(x, k) {
	let prod = 1
	for (let i = 0; i < k; i++) {
		prod *= x - i
	}
	return prod
}

/**
 * Independent O(k^2) product-rule derivative of P(x, k):
 * P'(x, k) = sum_{j=0}^{k-1} prod_{i=0, i!=j}^{k-1} (x - i).
 */
function independentDerivative(x, k) {
	let sum = 0
	for (let j = 0; j < k; j++) {
		let term = 1
		for (let i = 0; i < k; i++) {
			if (i !== j) {
				term *= x - i
			}
		}
		sum += term
	}
	return sum
}

/**
 * Independent integer factorial m! for small non-negative integers.
 */
function factorial(m) {
	let res = 1
	for (let i = 2; i <= m; i++) {
		res *= i
	}
	return res
}

/**
 * Dual multiplication helper for algebraic identity cross-checks.
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.d * b.v + a.v * b.d,
	}
}

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12, message) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(actual), Math.abs(expected))
	assert.ok(
		diff <= Math.max(absTol, relTol * scale),
		`${message ?? 'values differ'}: actual=${actual}, expected=${expected}, diff=${diff}`,
	)
}

describe('permutationsDualIterative', () => {
	describe('normal cases', () => {
		it('computes standard integer k-permutations and derivatives with d = 1', () => {
			// P(5, 3) = 5 * 4 * 3 = 60
			// P'(n, 3) = 3n^2 - 6n + 2 => at n=5: 75 - 30 + 2 = 47
			assert.deepStrictEqual(permutationsDualIterative({ v: 5, d: 1 }, 3), { v: 60, d: 47 })

			// P(4, 4) = 4! = 24
			// P'(4, 4) = 24 * (1/4 + 1/3 + 1/2 + 1) = 6 + 8 + 12 + 24 = 50
			assert.deepStrictEqual(permutationsDualIterative({ v: 4, d: 1 }, 4), { v: 24, d: 50 })

			// P(6, 2) = 30, P'(6, 2) = 2*6 - 1 = 11
			assert.deepStrictEqual(permutationsDualIterative({ v: 6, d: 1 }, 2), { v: 30, d: 11 })
		})

		it('propagates arbitrary forward-mode tangents n.d via the chain rule', () => {
			// P(5, 3) = 60, P'(5, 3) = 47
			assert.deepStrictEqual(permutationsDualIterative({ v: 5, d: 2.5 }, 3), {
				v: 60,
				d: 47 * 2.5,
			})
			assert.deepStrictEqual(permutationsDualIterative({ v: 5, d: -3 }, 3), {
				v: 60,
				d: -141,
			})
			assert.deepStrictEqual(permutationsDualIterative({ v: 5, d: 0 }, 3), {
				v: 60,
				d: 0,
			})
		})

		it('supports dual k = { v, d } with integer v >= 0 and d === 0', () => {
			assert.deepStrictEqual(permutationsDualIterative({ v: 5, d: 1 }, { v: 3, d: 0 }), {
				v: 60,
				d: 47,
			})
			assert.deepStrictEqual(permutationsDualIterative({ v: 5, d: 2 }, { v: 0, d: 0 }), {
				v: 1,
				d: 0,
			})
			assert.deepStrictEqual(permutationsDualIterative({ v: 3.5, d: -1 }, { v: 1, d: -0 }), {
				v: 3.5,
				d: -1,
			})
		})

		it('does not mutate inputs and returns a fresh dual object', () => {
			const n = Object.freeze({ v: 5, d: 2 })
			const k = Object.freeze({ v: 3, d: 0 })
			const out = permutationsDualIterative(n, k)
			assert.notStrictEqual(out, n)
			assert.deepStrictEqual(out, { v: 60, d: 94 })
		})
	})

	describe('edge cases', () => {
		it('handles k = 0 as the constant empty product { v: 1, d: 0 }', () => {
			for (const n of [
				{ v: 0, d: 0 },
				{ v: 0, d: 1 },
				{ v: 5, d: 3 },
				{ v: -4.5, d: -2 },
				{ v: 0.25, d: 7 },
			]) {
				assert.deepStrictEqual(permutationsDualIterative(n, 0), { v: 1, d: 0 })
			}
		})

		it('handles k = 1 as the identity { v: n.v, d: n.d }', () => {
			assert.deepStrictEqual(permutationsDualIterative({ v: 7, d: 3 }, 1), { v: 7, d: 3 })
			assert.deepStrictEqual(permutationsDualIterative({ v: 0, d: 1 }, 1), { v: 0, d: 1 })
			assert.deepStrictEqual(permutationsDualIterative({ v: -2.25, d: 0.5 }, 1), {
				v: -2.25,
				d: 0.5,
			})
		})

		it('handles n.v = 0 with exact root derivatives and no negative zero', () => {
			// For n = 0 and k >= 1: P(0, k) = 0, P'(0, k) = (-1)^(k-1) * (k-1)!
			for (let k = 1; k <= 7; k++) {
				const res = permutationsDualIterative({ v: 0, d: 1 }, k)
				const expectedD = (k % 2 === 1 ? 1 : -1) * factorial(k - 1)
				assert.strictEqual(Object.is(res.v, 0), true, `expected +0 for k=${k}, got ${res.v}`)
				assert.strictEqual(res.d, expectedD)
			}

			// Scaled derivative at n.v = 0
			assert.deepStrictEqual(permutationsDualIterative({ v: 0, d: 3 }, 4), {
				v: 0,
				d: -18, // (-1)^3 * 3! * 3 = -18
			})
		})

		it('handles integer roots 0 <= n.v < k cleanly without division by zero', () => {
			// For integer m with 0 <= m < k:
			// P(m, k) = 0, P'(m, k) = (-1)^(k - 1 - m) * m! * (k - 1 - m)!
			for (let k = 1; k <= 8; k++) {
				for (let m = 0; m < k; m++) {
					const dSeed = 2
					const res = permutationsDualIterative({ v: m, d: dSeed }, k)
					const sign = (k - 1 - m) % 2 === 0 ? 1 : -1
					const expectedD = sign * factorial(m) * factorial(k - 1 - m) * dSeed
					assert.strictEqual(Object.is(res.v, 0), true)
					assert.strictEqual(res.d, expectedD)
				}
			}
		})

		it('handles non-integer (fractional) and negative n.v falling factorials', () => {
			// n = 2.5, k = 3:
			// P(2.5, 3) = 2.5 * 1.5 * 0.5 = 1.875
			// P'(2.5, 3) = 3*(2.5)^2 - 6*(2.5) + 2 = 18.75 - 15 + 2 = 5.75
			assert.deepStrictEqual(permutationsDualIterative({ v: 2.5, d: 1 }, 3), {
				v: 1.875,
				d: 5.75,
			})

			// n = -2, k = 3:
			// P(-2, 3) = (-2)*(-3)*(-4) = -24
			// P'(-2, 3) = 3*(-2)^2 - 6*(-2) + 2 = 12 + 12 + 2 = 26
			assert.deepStrictEqual(permutationsDualIterative({ v: -2, d: 1 }, 3), {
				v: -24,
				d: 26,
			})

			// n = -0.5, k = 2:
			// P(-0.5, 2) = (-0.5)*(-1.5) = 0.75
			// P'(-0.5, 2) = 2*(-0.5) - 1 = -2
			assert.deepStrictEqual(permutationsDualIterative({ v: -0.5, d: 1 }, 2), {
				v: 0.75,
				d: -2,
			})
		})

		it('normalizes -0 components to +0', () => {
			const r1 = permutationsDualIterative({ v: -0, d: -0 }, 1)
			assert.strictEqual(Object.is(r1.v, 0), true)
			assert.strictEqual(Object.is(r1.d, 0), true)

			const r2 = permutationsDualIterative({ v: 0, d: 0 }, 3)
			assert.strictEqual(Object.is(r2.v, 0), true)
			assert.strictEqual(Object.is(r2.d, 0), true)
		})
	})

	describe('independent cross-checks', () => {
		it('matches explicit analytic polynomials and derivatives for k = 0..5', () => {
			// Explicit expansions P(x, k) = sum s(k, j) x^j and their derivatives P'(x, k):
			const analytic = [
				{
					v: () => 1,
					d: () => 0,
				},
				{
					v: (x) => x,
					d: () => 1,
				},
				{
					v: (x) => x * x - x,
					d: (x) => 2 * x - 1,
				},
				{
					v: (x) => x ** 3 - 3 * x ** 2 + 2 * x,
					d: (x) => 3 * x ** 2 - 6 * x + 2,
				},
				{
					v: (x) => x ** 4 - 6 * x ** 3 + 11 * x ** 2 - 6 * x,
					d: (x) => 4 * x ** 3 - 18 * x ** 2 + 22 * x - 6,
				},
				{
					v: (x) => x ** 5 - 10 * x ** 4 + 35 * x ** 3 - 50 * x ** 2 + 24 * x,
					d: (x) => 5 * x ** 4 - 40 * x ** 3 + 105 * x ** 2 - 100 * x + 24,
				},
			]

			const testInputs = [
				{ v: -3.25, d: 1.5 },
				{ v: -1, d: -2 },
				{ v: 0, d: 1 },
				{ v: 0.75, d: 0.4 },
				{ v: 2, d: 3 },
				{ v: Math.PI, d: -0.7 },
				{ v: 7.5, d: 1 },
			]

			for (let k = 0; k < analytic.length; k++) {
				for (const n of testInputs) {
					const actual = permutationsDualIterative(n, k)
					const expectedV = analytic[k].v(n.v)
					const expectedD = analytic[k].d(n.v) * n.d
					assertClose(actual.v, expectedV, 1e-12, 1e-12, `value mismatch for n=${n.v}, k=${k}`)
					assertClose(actual.d, expectedD, 1e-12, 1e-12, `deriv mismatch for n=${n.v}, k=${k}`)
				}
			}
		})

		it('matches independent O(k^2) product-rule derivative and central finite differences', () => {
			const h = 1e-6
			const cases = [
				{ n: { v: 5.3, d: 1 }, k: 4 },
				{ n: { v: 2.5, d: -1.7 }, k: 6 },
				{ n: { v: -1.4, d: 2.2 }, k: 5 },
				{ n: { v: 0, d: 1 }, k: 5 },
				{ n: { v: 2, d: 0.5 }, k: 6 },
				{ n: { v: 10, d: 1 }, k: 7 },
			]

			for (const { n, k } of cases) {
				const actual = permutationsDualIterative(n, k)
				const expectedV = scalarFallingFactorial(n.v, k)
				const expectedD = independentDerivative(n.v, k) * n.d

				assertClose(actual.v, expectedV, 1e-12, 1e-12, `scalar v check n=${n.v}, k=${k}`)
				assertClose(actual.d, expectedD, 1e-12, 1e-12, `O(k^2) d check n=${n.v}, k=${k}`)

				// Central finite difference: (P(x + h, k) - P(x - h, k)) / (2h) * n.d
				const fd =
					((scalarFallingFactorial(n.v + h, k) - scalarFallingFactorial(n.v - h, k)) / (2 * h)) *
					n.d
				assertClose(actual.d, fd, 1e-6, 1e-6, `finite-diff d check n=${n.v}, k=${k}`)
			}
		})

		it('satisfies falling factorial recurrence and shift identities in dual arithmetic', () => {
			const ns = [
				{ v: 6.2, d: 1.3 },
				{ v: 2, d: -0.8 },
				{ v: -3.5, d: 2.1 },
			]

			for (const n of ns) {
				for (let k = 1; k <= 6; k++) {
					// P(n, k) === P(n, k - 1) * (n - (k - 1))
					const lhs = permutationsDualIterative(n, k)
					const prev = permutationsDualIterative(n, k - 1)
					const rhsRec = dualMul(prev, { v: n.v - (k - 1), d: n.d })
					assertClose(lhs.v, rhsRec.v, 1e-12, 1e-12)
					assertClose(lhs.d, rhsRec.d, 1e-12, 1e-12)

					// P(n, k) === n * P(n - 1, k - 1)
					const shifted = permutationsDualIterative({ v: n.v - 1, d: n.d }, k - 1)
					const rhsShift = dualMul(n, shifted)
					assertClose(lhs.v, rhsShift.v, 1e-12, 1e-12)
					assertClose(lhs.d, rhsShift.d, 1e-12, 1e-12)
				}
			}
		})
	})

	describe('validation errors', () => {
		it('throws TypeError for invalid n shape or non-numeric fields', () => {
			const badNs = [
				null,
				undefined,
				5,
				'5',
				[5, 1],
				{},
				{ v: 5 },
				{ d: 1 },
				{ v: '5', d: 1 },
				{ v: 5, d: '1' },
				{ v: 5, d: null },
			]
			for (const badN of badNs) {
				assert.throws(() => permutationsDualIterative(badN, 2), TypeError)
			}
		})

		it('throws RangeError for non-finite n components', () => {
			const nonFiniteNs = [
				{ v: NaN, d: 1 },
				{ v: 5, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 5, d: Infinity },
				{ v: 5, d: -Infinity },
			]
			for (const badN of nonFiniteNs) {
				assert.throws(() => permutationsDualIterative(badN, 2), RangeError)
			}
		})

		it('throws TypeError for invalid k types', () => {
			const validN = { v: 5, d: 1 }
			const badKs = [
				null,
				undefined,
				'3',
				true,
				[3, 0],
				{},
				{ v: 3 },
				{ d: 0 },
				{ v: '3', d: 0 },
				{ v: 3, d: '0' },
			]
			for (const badK of badKs) {
				assert.throws(() => permutationsDualIterative(validN, badK), TypeError)
			}
		})

		it('throws RangeError for invalid k domain values or non-zero dual k.d', () => {
			const validN = { v: 5, d: 1 }
			const badKs = [
				-1,
				-10,
				1.5,
				0.1,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				{ v: 3, d: 1 },
				{ v: 3, d: -1e-12 },
				{ v: 3, d: NaN },
				{ v: 3, d: Infinity },
				{ v: -1, d: 0 },
				{ v: 2.5, d: 0 },
				{ v: NaN, d: 0 },
				{ v: Infinity, d: 0 },
				{ v: Number.MAX_SAFE_INTEGER + 1, d: 0 },
			]
			for (const badK of badKs) {
				assert.throws(() => permutationsDualIterative(validN, badK), RangeError)
			}
		})
	})
})
