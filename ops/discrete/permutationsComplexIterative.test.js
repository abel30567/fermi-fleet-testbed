import { describe, test } from 'node:test'
import assert from 'node:assert'
import { permutationsComplexIterative } from './permutationsComplexIterative.js'

function assertComplexClose(actual, expected, eps = 1e-10) {
	assert.strictEqual(typeof actual, 'object')
	assert.notStrictEqual(actual, null)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: got ${actual.re}, expected ${expected.re} (tol ${eps})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imaginary part mismatch: got ${actual.im}, expected ${expected.im} (tol ${eps})`,
	)
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function complexPowInt(z, exp) {
	let result = { re: 1, im: 0 }
	for (let i = 0; i < exp; i++) {
		result = complexMul(result, z)
	}
	return result
}

function factorial(n) {
	let res = 1
	for (let i = 2; i <= n; i++) res *= i
	return res
}

function binomial(n, k) {
	return factorial(n) / (factorial(k) * factorial(n - k))
}

/**
 * Signed Stirling numbers of the first kind s(n, m), satisfying:
 *   (z)_n = sum_{m=0..n} s(n, m) * z^m
 */
function stirlingFirstKind(n, m) {
	if (n === 0 && m === 0) return 1
	if (n === 0 || m === 0 || m > n) return 0
	return stirlingFirstKind(n - 1, m - 1) - (n - 1) * stirlingFirstKind(n - 1, m)
}

describe('permutationsComplexIterative', () => {
	test('computes standard real non-negative integer permutations', () => {
		assert.deepStrictEqual(permutationsComplexIterative({ re: 5, im: 0 }, 3), { re: 60, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 5, im: 0 }, 5), { re: 120, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 10, im: 0 }, 4), { re: 5040, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 1, im: 0 }, 1), { re: 1, im: 0 })
	})

	test('computes complex, purely imaginary, negative, and fractional bases', () => {
		// (1 + i)(i) = -1 + i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 1, im: 1 }, 2), { re: -1, im: 1 })
		// (2 + 3i)(1 + 3i)(3i) = (-7 + 9i)(3i) = -27 - 21i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 2, im: 3 }, 3), { re: -27, im: -21 })
		// Pure imaginary: i(i - 1)(i - 2) = (-1 - i)(-2 + i) = 3 + i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 1 }, 1), { re: 0, im: 1 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 1 }, 2), { re: -1, im: -1 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 1 }, 3), { re: 3, im: 1 })
		// (0.5 - 1.5i)(-0.5 - 1.5i) = -0.25 - 2.25 + 0i = -2.5 + 0i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0.5, im: -1.5 }, 2), { re: -2.5, im: 0 })
		// Negative real: (-3)(-4)(-5) = -60
		assert.deepStrictEqual(permutationsComplexIterative({ re: -3, im: 0 }, 3), { re: -60, im: 0 })
		// Fractional real: 2.5 * 1.5 * 0.5 = 1.875
		assert.deepStrictEqual(permutationsComplexIterative({ re: 2.5, im: 0 }, 3), { re: 1.875, im: 0 })
	})

	test('handles edge cases: k = 0, k = 1, k > n for integer n, -0 normalization, immutability', () => {
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 0 }, 0), { re: 1, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: -4.5, im: 7.2 }, 0), { re: 1, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 0 }, 1), { re: 0, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 0 }, 5), { re: 0, im: 0 })
		// k > n for non-negative integer n short-circuits cleanly to 0 + 0i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 5, im: 0 }, 6), { re: 0, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 3, im: 0 }, 1_000_000), { re: 0, im: 0 })
		// Negative zero normalization
		const negZeroRes = permutationsComplexIterative({ re: -1, im: 0 }, 2)
		assert.strictEqual(Object.is(negZeroRes.im, 0), true)
		assert.deepStrictEqual(negZeroRes, { re: 2, im: 0 })
		const negZeroInput = permutationsComplexIterative({ re: -0, im: -0 }, 1)
		assert.strictEqual(Object.is(negZeroInput.re, 0), true)
		assert.strictEqual(Object.is(negZeroInput.im, 0), true)
		// Does not mutate input object
		const z = { re: 3, im: -2 }
		const out = permutationsComplexIterative(z, 3)
		assert.deepStrictEqual(z, { re: 3, im: -2 })
		assert.notStrictEqual(out, z)
	})

	test('throws TypeError and RangeError on invalid inputs and overflow', () => {
		// Invalid z types
		for (const badZ of [null, undefined, 5, '1+i', true, [1, 2], {}, { re: 1 }, { im: 2 }, { re: '1', im: 0 }, { re: 0, im: null }]) {
			assert.throws(() => permutationsComplexIterative(badZ, 2), TypeError)
		}
		// Non-finite z components
		for (const badZ of [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 1 },
			{ re: 1, im: -Infinity },
		]) {
			assert.throws(() => permutationsComplexIterative(badZ, 2), RangeError)
		}
		// Invalid k types
		for (const badK of [undefined, null, '2', true, { re: 2, im: 0 }, 2n]) {
			assert.throws(() => permutationsComplexIterative({ re: 3, im: 1 }, badK), TypeError)
		}
		// Out-of-range or non-integer k
		for (const badK of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => permutationsComplexIterative({ re: 3, im: 1 }, badK), RangeError)
		}
		// Overflow detection
		assert.throws(() => permutationsComplexIterative({ re: 1e200, im: 0 }, 2), RangeError)
		assert.throws(() => permutationsComplexIterative({ re: 1000, im: 1000 }, 200), RangeError)
	})

	test('cross-check 1: matches n! / (n - k)! for real non-negative integers', () => {
		for (let n = 0; n <= 12; n++) {
			for (let k = 0; k <= n; k++) {
				const expected = factorial(n) / factorial(n - k)
				assert.deepStrictEqual(
					permutationsComplexIterative({ re: n, im: 0 }, k),
					{ re: expected, im: 0 },
				)
			}
		}
	})

	test('cross-check 2: matches Stirling-first-kind polynomial expansion over C', () => {
		const testPoints = [
			{ re: 0.5, im: 1.25 },
			{ re: -2.3, im: 0.7 },
			{ re: 3.1, im: -2.4 },
			{ re: 0, im: -3 },
		]
		for (const z of testPoints) {
			for (let k = 0; k <= 6; k++) {
				let poly = { re: 0, im: 0 }
				for (let m = 0; m <= k; m++) {
					const coeff = stirlingFirstKind(k, m)
					const term = complexPowInt(z, m)
					poly = complexAdd(poly, { re: coeff * term.re, im: coeff * term.im })
				}
				const actual = permutationsComplexIterative(z, k)
				assertComplexClose(actual, poly, 1e-8)
			}
		}
	})

	test('cross-check 3: satisfies Chu-Vandermonde / falling-factorial binomial theorem', () => {
		// P(z + w, k) = sum_{j=0..k} C(k, j) * P(z, j) * P(w, k - j)
		const pairs = [
			[{ re: 1.5, im: 2.5 }, { re: -0.75, im: 1.25 }],
			[{ re: -2, im: -3 }, { re: 4, im: 1 }],
			[{ re: 0.25, im: -1.5 }, { re: 2.75, im: 0.5 }],
		]
		for (const [z, w] of pairs) {
			const sum = complexAdd(z, w)
			for (let k = 0; k <= 6; k++) {
				let rhs = { re: 0, im: 0 }
				for (let j = 0; j <= k; j++) {
					const c = binomial(k, j)
					const prod = complexMul(
						permutationsComplexIterative(z, j),
						permutationsComplexIterative(w, k - j),
					)
					rhs = complexAdd(rhs, { re: c * prod.re, im: c * prod.im })
				}
				const lhs = permutationsComplexIterative(sum, k)
				assertComplexClose(lhs, rhs, 1e-8)
			}
		}
	})

	test('cross-check 4: satisfies recurrence, conjugate symmetry, and reflection identities', () => {
		const points = [
			{ re: 2.2, im: -1.7 },
			{ re: -1.4, im: 3.1 },
			{ re: 0.5, im: 0.5 },
		]
		for (const z of points) {
			for (let k = 0; k <= 5; k++) {
				// Recurrence: P(z, k + 1) = P(z, k) * (z - k) = z * P(z - 1, k)
				const pNext = permutationsComplexIterative(z, k + 1)
				const byRight = complexMul(permutationsComplexIterative(z, k), { re: z.re - k, im: z.im })
				const byLeft = complexMul(z, permutationsComplexIterative({ re: z.re - 1, im: z.im }, k))
				assertComplexClose(pNext, byRight, 1e-9)
				assertComplexClose(pNext, byLeft, 1e-9)

				// Conjugate symmetry: P(conj(z), k) = conj(P(z, k))
				const pConj = permutationsComplexIterative({ re: z.re, im: -z.im }, k)
				const p = permutationsComplexIterative(z, k)
				assertComplexClose(pConj, { re: p.re, im: -p.im }, 1e-9)

				// Reflection identity: P(-z, k) = (-1)^k * P(z + k - 1, k)
				const pNeg = permutationsComplexIterative({ re: -z.re, im: -z.im }, k)
				const pRefl = permutationsComplexIterative({ re: z.re + k - 1, im: z.im }, k)
				const sign = k % 2 === 0 ? 1 : -1
				assertComplexClose(pNeg, { re: sign * pRefl.re, im: sign * pRefl.im }, 1e-8)
			}
		}
	})
})
