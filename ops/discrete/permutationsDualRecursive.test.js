import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsDualRecursive } from './permutationsDualRecursive.js'

const EULER_MASCHERONI = 0.5772156649015328606

function assertClose(actual, expected, tol = 1e-10, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
	)
}

function factorial(m) {
	let prod = 1
	for (let i = 2; i <= m; i++) prod *= i
	return prod
}

function harmonic(m) {
	let sum = 0
	for (let i = 1; i <= m; i++) sum += 1 / i
	return sum
}

describe('permutationsDualRecursive', () => {
	test('computes standard discrete permutations and exact dn derivatives', () => {
		// P(n, 3) = n(n-1)(n-2) = n^3 - 3n^2 + 2n, d/dn = 3n^2 - 6n + 2
		const p53 = permutationsDualRecursive({ v: 5, d: 1 }, { v: 3, d: 0 })
		assert.deepStrictEqual(p53, { v: 60, d: 47 })

		// Linearity in n.d
		const p53Scaled = permutationsDualRecursive({ v: 5, d: 2.5 }, { v: 3, d: 0 })
		assertClose(p53Scaled.v, 60, 1e-14)
		assertClose(p53Scaled.d, 47 * 2.5, 1e-14)

		// P(10, 4) = 5040, d/dn = 5040 * (1/10 + 1/9 + 1/8 + 1/7)
		const p104 = permutationsDualRecursive({ v: 10, d: 1 }, { v: 4, d: 0 })
		assert.equal(p104.v, 5040)
		assertClose(p104.d, 5040 * (1 / 10 + 1 / 9 + 1 / 8 + 1 / 7), 1e-13)
	})

	test('computes exact dk derivatives via digamma and combined (dn, dk) derivatives', () => {
		// P(5, 3) = 60, dP/dk = 60 * psi(5 - 3 + 1) = 60 * psi(3) = 60 * (H_2 - gamma)
		const expectedDk = 60 * (harmonic(2) - EULER_MASCHERONI)
		const resDk = permutationsDualRecursive({ v: 5, d: 0 }, { v: 3, d: 1 })
		assert.equal(resDk.v, 60)
		assertClose(resDk.d, expectedDk, 1e-13)

		// Combined total derivative: 47 * 2 + expectedDk * (-3)
		const resBoth = permutationsDualRecursive({ v: 5, d: 2 }, { v: 3, d: -3 })
		assert.equal(resBoth.v, 60)
		assertClose(resBoth.d, 47 * 2 + expectedDk * -3, 1e-13)
	})

	test('handles edge cases: k = 0, k = 1, k = n, n = 0, and k > n', () => {
		// k = 0: P(n, 0) = 1
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 0, d: 1 }, { v: 0, d: 0 }),
			{ v: 1, d: 0 },
		)
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 7, d: 3 }, { v: 0, d: 0 }),
			{ v: 1, d: 0 },
		)
		const p50Dk = permutationsDualRecursive({ v: 5, d: 0 }, { v: 0, d: 1 })
		assert.equal(p50Dk.v, 1)
		assertClose(p50Dk.d, harmonic(5) - EULER_MASCHERONI, 1e-13)

		// k = 1: P(n, 1) = n, d/dn = 1
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 8, d: 1 }, { v: 1, d: 0 }),
			{ v: 8, d: 1 },
		)
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 0, d: 1 }, { v: 1, d: 0 }),
			{ v: 0, d: 1 },
		)

		// k = n: P(n, n) = n!, d/dn = n! * H_n
		const p66 = permutationsDualRecursive({ v: 6, d: 1 }, { v: 6, d: 0 })
		assert.equal(p66.v, 720)
		assertClose(p66.d, 720 * harmonic(6), 1e-13)

		// k > n (integer n < k): P(n, k) = 0 with exact falling factorial derivatives
		// P(n, 3) = n(n-1)(n-2) at n = 2 -> v = 0, dP/dn = 2, dP/dk = -2
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 2, d: 0 }, { v: 3, d: 0 }),
			{ v: 0, d: 0 },
		)
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 2, d: 1 }, { v: 3, d: 0 }),
			{ v: 0, d: 2 },
		)
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 2, d: 0 }, { v: 3, d: 1 }),
			{ v: 0, d: -2 },
		)
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 2, d: 1 }, { v: 3, d: 1 }),
			{ v: 0, d: 0 },
		)

		// P(n, 4) at n = 2 -> dP/dn = 2 * 1 * (-1) = -2, dP/dk = +2
		assert.deepStrictEqual(
			permutationsDualRecursive({ v: 2, d: 3 }, { v: 4, d: 5 }),
			{ v: 0, d: -2 * 3 + 2 * 5 },
		)
	})

	test('avoids Gamma overflow for large n with small integer k', () => {
		// 200! overflows float64, but P(200, 3) = 200 * 199 * 198 = 7,880,400
		const res = permutationsDualRecursive({ v: 200, d: 1 }, { v: 3, d: 0 })
		assert.equal(res.v, 200 * 199 * 198)
		assert.equal(res.d, 199 * 198 + 200 * 198 + 200 * 199)
	})

	test('supports non-integer n and non-integer k via Gamma-digamma', () => {
		// Non-integer n, integer k: P(3.5, 3) = 3.5 * 2.5 * 1.5 = 13.125
		const resNonIntN = permutationsDualRecursive({ v: 3.5, d: 1 }, { v: 3, d: 0 })
		assertClose(resNonIntN.v, 3.5 * 2.5 * 1.5, 1e-14)
		assertClose(resNonIntN.d, 2.5 * 1.5 + 3.5 * 1.5 + 3.5 * 2.5, 1e-14)

		// Non-integer k: P(4, 1.5) = Gamma(5) / Gamma(3.5) = 24 / (15*sqrt(pi)/8) = 64 / (5*sqrt(pi))
		const expectedV = 64 / (5 * Math.sqrt(Math.PI))
		const resNonIntK = permutationsDualRecursive({ v: 4, d: 1 }, { v: 1.5, d: 0 })
		assertClose(resNonIntK.v, expectedV, 1e-13)

		// Non-integer n and k with n - k + 1 = 0 (pole of Gamma(n - k + 1)):
		// P(2.5, 3.5) = 0, dP/dn = Gamma(3.5) = 15*sqrt(pi)/8, dP/dk = -Gamma(3.5)
		const gamma35 = (15 * Math.sqrt(Math.PI)) / 8
		const resPole = permutationsDualRecursive({ v: 2.5, d: 2 }, { v: 3.5, d: -1 })
		assert.equal(resPole.v, 0)
		assertClose(resPole.d, gamma35 * (2 - -1), 1e-13)
	})

	test('cross-check: factorial ratio and harmonic derivative identities', () => {
		for (let n = 0; n <= 12; n++) {
			for (let k = 0; k <= n; k++) {
				const resN = permutationsDualRecursive({ v: n, d: 1 }, { v: k, d: 0 })
				const expectedV = factorial(n) / factorial(n - k)
				const expectedDn = expectedV * (harmonic(n) - harmonic(n - k))
				assert.equal(resN.v, expectedV, `P(${n}, ${k}) value`)
				assertClose(resN.d, expectedDn, 1e-12, `dP/dn(${n}, ${k})`)

				const resK = permutationsDualRecursive({ v: n, d: 0 }, { v: k, d: 1 })
				const expectedDk = expectedV * (harmonic(n - k) - EULER_MASCHERONI)
				assertClose(resK.d, expectedDk, 1e-12, `dP/dk(${n}, ${k})`)
			}
		}
	})

	test('cross-check: central finite-difference derivative checks (dn, dk, and directional)', () => {
		const h = 1e-6
		const cases = [
			{ n: 5, k: 3 },
			{ n: 7, k: 7 },
			{ n: 2, k: 3 }, // k > n integer boundary
			{ n: 2, k: 4 }, // k > n integer boundary (second root)
			{ n: 4.5, k: 2 },
			{ n: 5.5, k: 2.25 },
			{ n: 2.5, k: 4 }, // non-integer n < integer k
			{ n: 2.5, k: 3.5 }, // non-integer n, k with n - k + 1 = 0
		]

		for (const { n, k } of cases) {
			// Check dP/dn
			const exactDn = permutationsDualRecursive({ v: n, d: 1 }, { v: k, d: 0 }).d
			const fNPlus = permutationsDualRecursive({ v: n + h, d: 0 }, { v: k, d: 0 }).v
			const fNMinus = permutationsDualRecursive({ v: n - h, d: 0 }, { v: k, d: 0 }).v
			const fdDn = (fNPlus - fNMinus) / (2 * h)
			assertClose(exactDn, fdDn, 1e-7, `FD dP/dn at (${n}, ${k})`)

			// Check dP/dk
			const exactDk = permutationsDualRecursive({ v: n, d: 0 }, { v: k, d: 1 }).d
			const fKPlus = permutationsDualRecursive({ v: n, d: 0 }, { v: k + h, d: 0 }).v
			const fKMinus = permutationsDualRecursive({ v: n, d: 0 }, { v: k - h, d: 0 }).v
			const fdDk = (fKPlus - fKMinus) / (2 * h)
			assertClose(exactDk, fdDk, 1e-7, `FD dP/dk at (${n}, ${k})`)

			// Check directional derivative along (dn, dk) = (1.3, -0.7)
			const dn = 1.3
			const dk = -0.7
			const exactDir = permutationsDualRecursive({ v: n, d: dn }, { v: k, d: dk }).d
			const fDirPlus = permutationsDualRecursive(
				{ v: n + h * dn, d: 0 },
				{ v: k + h * dk, d: 0 },
			).v
			const fDirMinus = permutationsDualRecursive(
				{ v: n - h * dn, d: 0 },
				{ v: k - h * dk, d: 0 },
			).v
			const fdDir = (fDirPlus - fDirMinus) / (2 * h)
			assertClose(exactDir, fdDir, 1e-7, `FD directional at (${n}, ${k})`)
		}
	})

	test('cross-check: dual falling-factorial recurrence and splitting identities', () => {
		// Identity 1: P(n, k) = n * P(n - 1, k - 1) as dual numbers
		const n = { v: 9, d: 1.5 }
		const k = { v: 5, d: 0 }
		const lhs = permutationsDualRecursive(n, k)
		const sub = permutationsDualRecursive({ v: n.v - 1, d: n.d }, { v: k.v - 1, d: 0 })
		const rhs = { v: n.v * sub.v, d: n.v * sub.d + n.d * sub.v }
		assertClose(lhs.v, rhs.v, 1e-14)
		assertClose(lhs.d, rhs.d, 1e-14)

		// Identity 2: P(n, a + b) = P(n, a) * P(n - a, b) as dual numbers (with non-zero a.d, b.d)
		const nDual = { v: 8.2, d: 1.1 }
		const aDual = { v: 2.3, d: -0.4 }
		const bDual = { v: 3.1, d: 0.9 }
		const abDual = { v: aDual.v + bDual.v, d: aDual.d + bDual.d }
		const nMinusA = { v: nDual.v - aDual.v, d: nDual.d - aDual.d }

		const total = permutationsDualRecursive(nDual, abDual)
		const part1 = permutationsDualRecursive(nDual, aDual)
		const part2 = permutationsDualRecursive(nMinusA, bDual)
		const combined = {
			v: part1.v * part2.v,
			d: part1.v * part2.d + part1.d * part2.v,
		}
		assertClose(total.v, combined.v, 1e-12, 'splitting value')
		assertClose(total.d, combined.d, 1e-12, 'splitting derivative')
	})

	test('validates inputs and throws appropriate errors', () => {
		// Invalid types -> TypeError
		assert.throws(() => permutationsDualRecursive(null, { v: 2, d: 0 }), TypeError)
		assert.throws(() => permutationsDualRecursive({ v: 5, d: 0 }, undefined), TypeError)
		assert.throws(() => permutationsDualRecursive(5, { v: 2, d: 0 }), TypeError)
		assert.throws(() => permutationsDualRecursive({ v: 5, d: 0 }, [2, 0]), TypeError)
		assert.throws(() => permutationsDualRecursive({ v: '5', d: 0 }, { v: 2, d: 0 }), TypeError)
		assert.throws(() => permutationsDualRecursive({ v: 5 }, { v: 2, d: 0 }), TypeError)
		assert.throws(() => permutationsDualRecursive({ v: 5, d: 0 }, { d: 0 }), TypeError)

		// Non-finite values -> RangeError
		assert.throws(() => permutationsDualRecursive({ v: NaN, d: 0 }, { v: 2, d: 0 }), RangeError)
		assert.throws(() => permutationsDualRecursive({ v: 5, d: Infinity }, { v: 2, d: 0 }), RangeError)
		assert.throws(() => permutationsDualRecursive({ v: 5, d: 0 }, { v: -Infinity, d: 0 }), RangeError)
		assert.throws(() => permutationsDualRecursive({ v: 5, d: 0 }, { v: 2, d: NaN }), RangeError)

		// Negative domain -> RangeError
		assert.throws(() => permutationsDualRecursive({ v: -1, d: 0 }, { v: 2, d: 0 }), RangeError)
		assert.throws(() => permutationsDualRecursive({ v: -0.01, d: 1 }, { v: 1, d: 0 }), RangeError)
		assert.throws(() => permutationsDualRecursive({ v: 5, d: 0 }, { v: -1, d: 0 }), RangeError)
		assert.throws(() => permutationsDualRecursive({ v: 5, d: 0 }, { v: -0.5, d: 1 }), RangeError)
	})
})
