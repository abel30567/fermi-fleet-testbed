import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsComplexIterative } from './permutationsComplexIterative.js'

function assertComplexClose(actual, expected, tol = 1e-9, msg = '') {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	const scale = Math.max(1, Math.hypot(expected.re, expected.im))
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * scale,
		`${msg} re mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * scale,
		`${msg} im mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexPow(z, n) {
	let res = { re: 1, im: 0 }
	for (let i = 0; i < n; i++) {
		res = complexMul(res, z)
	}
	return res
}

function factorialBigInt(n) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(n); i++) {
		acc *= i
	}
	return acc
}

function binomial(n, k) {
	if (k < 0 || k > n) return 0
	let res = 1
	for (let i = 1; i <= k; i++) {
		res = (res * (n - k + i)) / i
	}
	return res
}

// Signed Stirling numbers of the first kind s(n, m) via recurrence:
// s(0, 0) = 1; s(n, m) = s(n - 1, m - 1) - (n - 1) * s(n - 1, m)
function signedStirlingFirstRow(k) {
	let row = [1]
	for (let n = 1; n <= k; n++) {
		const next = new Array(n + 1).fill(0)
		for (let m = 1; m <= n; m++) {
			const left = row[m - 1] ?? 0
			const up = row[m] ?? 0
			next[m] = left - (n - 1) * up
		}
		row = next
	}
	return row
}

describe('permutationsComplexIterative', () => {
	test('computes standard real integer permutations P(n, k)', () => {
		assert.deepStrictEqual(permutationsComplexIterative({ re: 5, im: 0 }, 0), { re: 1, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 5, im: 0 }, 1), { re: 5, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 5, im: 0 }, 3), { re: 60, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 5, im: 0 }, 5), { re: 120, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 10, im: 0 }, 4), { re: 5040, im: 0 })
	})

	test('computes complex permutations P(z, k) for hand-verified values', () => {
		// P(i, 1) = i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 1 }, 1), { re: 0, im: 1 })
		// P(i, 2) = i(i - 1) = -1 - i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 1 }, 2), { re: -1, im: -1 })
		// P(i, 3) = (-1 - i)(-2 + i) = 3 + i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 1 }, 3), { re: 3, im: 1 })
		// P(2 + 3i, 2) = (2 + 3i)(1 + 3i) = -7 + 9i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 2, im: 3 }, 2), { re: -7, im: 9 })
		// P(2 + 3i, 3) = (-7 + 9i)(3i) = -27 - 21i
		assert.deepStrictEqual(permutationsComplexIterative({ re: 2, im: 3 }, 3), { re: -27, im: -21 })
		// P(0.5, 3) = 0.5 * (-0.5) * (-1.5) = 0.375
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0.5, im: 0 }, 3), { re: 0.375, im: 0 })
	})

	test('handles edge cases: k = 0, negative real z, k > n for integer n, large k with exact zero, -0 normalization, immutability', () => {
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 0 }, 0), { re: 1, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: -3.5, im: 7.25 }, 0), { re: 1, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 0, im: 0 }, 1), { re: 0, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 5, im: 0 }, 6), { re: 0, im: 0 })
		// Exact zero shortcut avoids overflow / long loop when 0 <= n < k
		assert.deepStrictEqual(permutationsComplexIterative({ re: 200, im: 0 }, 205), { re: 0, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: 3, im: 0 }, 1_000_000_000), { re: 0, im: 0 })
		// Negative real z: P(-1, 3) = (-1)(-2)(-3) = -6; P(-1, 4) = 24
		assert.deepStrictEqual(permutationsComplexIterative({ re: -1, im: 0 }, 3), { re: -6, im: 0 })
		assert.deepStrictEqual(permutationsComplexIterative({ re: -1, im: 0 }, 4), { re: 24, im: 0 })
		// Negative zero normalized to +0
		const resNegZero = permutationsComplexIterative({ re: -1, im: -0 }, 1)
		assert.ok(Object.is(resNegZero.im, 0))
		// Input object is not mutated
		// P(3 - 2i, 3) = (3 - 2i)(2 - 2i)(1 - 2i) = (2 - 10i)(1 - 2i) = -18 - 14i
		const z = Object.freeze({ re: 3, im: -2 })
		const out = permutationsComplexIterative(z, 3)
		assert.deepStrictEqual(z, { re: 3, im: -2 })
		assert.deepStrictEqual(out, { re: -18, im: -14 })
	})

	test('validates inputs and throws TypeError / RangeError appropriately', () => {
		// Invalid z types
		for (const badZ of [null, undefined, 5, '1+2i', true, [1, 2], () => {}]) {
			assert.throws(() => permutationsComplexIterative(badZ, 2), TypeError)
		}
		assert.throws(() => permutationsComplexIterative({ re: '1', im: 0 }, 2), TypeError)
		assert.throws(() => permutationsComplexIterative({ re: 1, im: null }, 2), TypeError)
		assert.throws(() => permutationsComplexIterative({ re: 1 }, 2), TypeError)

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
		for (const badK of [null, undefined, '2', true, {}, [], 2n]) {
			assert.throws(() => permutationsComplexIterative({ re: 2, im: 1 }, badK), TypeError)
		}

		// Out-of-range / non-integer k
		for (const badK of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => permutationsComplexIterative({ re: 2, im: 1 }, badK), RangeError)
		}

		// Floating-point overflow throws RangeError
		assert.throws(() => permutationsComplexIterative({ re: 1000, im: 1 }, 200), RangeError)
	})

	test('cross-check 1: agrees with independent signed Stirling polynomial expansion P(z, k) = sum s(k, j) z^j', () => {
		const testPoints = [
			{ re: 0, im: 1 },
			{ re: 2.5, im: -1.5 },
			{ re: -1.25, im: 3.75 },
			{ re: 4, im: 2 },
			{ re: -0.5, im: -0.5 },
		]

		for (const z of testPoints) {
			for (let k = 0; k <= 8; k++) {
				const stirling = signedStirlingFirstRow(k)
				let poly = { re: 0, im: 0 }
				for (let j = 0; j <= k; j++) {
					const zPow = complexPow(z, j)
					poly = complexAdd(poly, {
						re: stirling[j] * zPow.re,
						im: stirling[j] * zPow.im,
					})
				}
				const actual = permutationsComplexIterative(z, k)
				assertComplexClose(actual, poly, 1e-11, `Stirling check z=(${z.re},${z.im}), k=${k}`)
			}
		}
	})

	test('cross-check 2: satisfies falling-factorial Chu-Vandermonde identity P(z + w, k) = sum C(k, j) P(z, j) P(w, k - j)', () => {
		const pairs = [
			[{ re: 1.5, im: 2.0 }, { re: -0.5, im: 1.25 }],
			[{ re: 3, im: -4 }, { re: 2, im: 5 }],
			[{ re: -2.2, im: -0.7 }, { re: 4.1, im: 0.3 }],
		]

		for (const [z, w] of pairs) {
			const sumZW = complexAdd(z, w)
			for (let k = 0; k <= 7; k++) {
				const lhs = permutationsComplexIterative(sumZW, k)
				let rhs = { re: 0, im: 0 }
				for (let j = 0; j <= k; j++) {
					const c = binomial(k, j)
					const term = complexMul(
						permutationsComplexIterative(z, j),
						permutationsComplexIterative(w, k - j)
					)
					rhs = complexAdd(rhs, { re: c * term.re, im: c * term.im })
				}
				assertComplexClose(lhs, rhs, 1e-11, `Vandermonde k=${k}`)
			}
		}
	})

	test('cross-check 3: satisfies split identity, reflection identity, conjugate symmetry, and BigInt factorial ratio', () => {
		// Split identity: P(z, a + b) = P(z, a) * P(z - a, b)
		const z = { re: 3.25, im: -2.75 }
		for (let a = 0; a <= 5; a++) {
			for (let b = 0; b <= 5; b++) {
				const lhs = permutationsComplexIterative(z, a + b)
				const rhs = complexMul(
					permutationsComplexIterative(z, a),
					permutationsComplexIterative({ re: z.re - a, im: z.im }, b)
				)
				assertComplexClose(lhs, rhs, 1e-12, `split a=${a}, b=${b}`)
			}
		}

		// Reflection identity: P(-z, k) = (-1)^k * P(z + k - 1, k)
		for (let k = 0; k <= 7; k++) {
			const lhs = permutationsComplexIterative({ re: -z.re, im: -z.im }, k)
			const base = permutationsComplexIterative({ re: z.re + k - 1, im: z.im }, k)
			const sign = k % 2 === 0 ? 1 : -1
			const rhs = { re: sign * base.re, im: sign * base.im }
			assertComplexClose(lhs, rhs, 1e-12, `reflection k=${k}`)
		}

		// Conjugate symmetry: P(conj(z), k) = conj(P(z, k))
		for (let k = 0; k <= 7; k++) {
			const pZ = permutationsComplexIterative(z, k)
			const pConj = permutationsComplexIterative({ re: z.re, im: -z.im }, k)
			assertComplexClose(pConj, { re: pZ.re, im: -pZ.im }, 1e-12, `conjugate k=${k}`)
		}

		// Real integer cross-check against BigInt n! / (n - k)!
		for (let n = 0; n <= 15; n++) {
			for (let k = 0; k <= n; k++) {
				const expected = Number(factorialBigInt(n) / factorialBigInt(n - k))
				assert.deepStrictEqual(
					permutationsComplexIterative({ re: n, im: 0 }, k),
					{ re: expected, im: 0 }
				)
			}
		}
	})
})
