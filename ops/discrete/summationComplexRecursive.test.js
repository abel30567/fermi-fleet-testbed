import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationComplexRecursive } from './summationComplexRecursive.js'

/**
 * Independent iterative reference complex summation for cross-checking.
 *
 * @param {Array<{ re: number, im: number }>} terms
 * @returns {{ re: number, im: number }}
 */
function iterativeComplexSum(terms) {
	let re = 0
	let im = 0
	for (let i = 0; i < terms.length; i++) {
		re += terms[i].re
		im += terms[i].im
	}
	return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
}

/**
 * Helper to multiply two complex numbers for analytical identities.
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Helper to divide two complex numbers for analytical identities.
 */
function divComplex(a, b) {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}

/**
 * Helper to raise a complex number to a non-negative integer power.
 */
function powComplex(z, n) {
	let result = { re: 1, im: 0 }
	for (let i = 0; i < n; i++) {
		result = mulComplex(result, z)
	}
	return result
}

/**
 * Asserts two complex numbers are equal within an absolute tolerance.
 */
function assertComplexClose(actual, expected, tol = 1e-11) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`real part mismatch: got ${actual.re}, expected ${expected.re} (tol=${tol})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`imag part mismatch: got ${actual.im}, expected ${expected.im} (tol=${tol})`,
	)
}

describe('summationComplexRecursive', () => {
	describe('normal cases', () => {
		test('sums an array of complex numbers (even and odd lengths)', () => {
			const even = [
				{ re: 1, im: 2 },
				{ re: 3, im: -4 },
				{ re: -2, im: 5 },
				{ re: 4, im: 1 },
			]
			assert.deepEqual(summationComplexRecursive(even), { re: 6, im: 4 })

			const odd = [
				{ re: 10, im: -1 },
				{ re: -3, im: 7 },
				{ re: 2.5, im: 0.5 },
			]
			assert.deepEqual(summationComplexRecursive(odd), { re: 9.5, im: 6.5 })
		})

		test('sums a term function over positive, zero-crossing, and negative integer ranges', () => {
			assert.deepEqual(
				summationComplexRecursive((k) => ({ re: k, im: 2 * k }), 1, 5),
				{ re: 15, im: 30 },
			)

			// Symmetric around zero cancels to { re: 0, im: 0 }
			const sym = summationComplexRecursive((k) => ({ re: k, im: -3 * k }), -10, 10)
			assert.deepEqual(sym, { re: 0, im: 0 })
			assert.ok(Object.is(sym.re, 0))
			assert.ok(Object.is(sym.im, 0))

			// Purely negative range
			assert.deepEqual(
				summationComplexRecursive((k) => ({ re: k, im: k * k }), -4, -1),
				{ re: -10, im: 30 },
			)
		})

		test('does not mutate input array or return aliased element objects', () => {
			const original = [
				{ re: 2, im: 3 },
				{ re: -1, im: 4 },
			]
			const snapshot = structuredClone(original)
			const sum = summationComplexRecursive(original)
			assert.deepEqual(original, snapshot)
			assert.deepEqual(sum, { re: 1, im: 7 })

			const single = [{ re: 5, im: -6 }]
			const singleSum = summationComplexRecursive(single)
			assert.deepEqual(singleSum, { re: 5, im: -6 })
			assert.notEqual(singleSum, single[0])
		})
	})

	describe('edge cases', () => {
		test('empty array returns { re: 0, im: 0 }', () => {
			const res = summationComplexRecursive([])
			assert.deepEqual(res, { re: 0, im: 0 })
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		})

		test('empty range (start > end) returns { re: 0, im: 0 } without calling termFn', () => {
			let calls = 0
			const res = summationComplexRecursive(
				() => {
					calls += 1
					return { re: 99, im: 99 }
				},
				5,
				4,
			)
			assert.equal(calls, 0)
			assert.deepEqual(res, { re: 0, im: 0 })
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		})

		test('single-element array and single-point interval [k, k]', () => {
			assert.deepEqual(summationComplexRecursive([{ re: -7.5, im: 3.25 }]), {
				re: -7.5,
				im: 3.25,
			})
			assert.deepEqual(
				summationComplexRecursive((k) => ({ re: k * 2, im: k - 1 }), -3, -3),
				{ re: -6, im: -4 },
			)
			assert.deepEqual(
				summationComplexRecursive((k) => ({ re: k, im: 1 }), 0, 0),
				{ re: 0, im: 1 },
			)
		})

		test('normalizes -0 to +0 in both modes', () => {
			const r1 = summationComplexRecursive([{ re: -0, im: -0 }])
			assert.ok(Object.is(r1.re, 0))
			assert.ok(Object.is(r1.im, 0))

			const r2 = summationComplexRecursive([
				{ re: -0, im: -0 },
				{ re: -0, im: -0 },
			])
			assert.ok(Object.is(r2.re, 0))
			assert.ok(Object.is(r2.im, 0))

			const r3 = summationComplexRecursive(() => ({ re: -0, im: -0 }), 0, 3)
			assert.ok(Object.is(r3.re, 0))
			assert.ok(Object.is(r3.im, 0))
		})

		test('handles large safe integer bounds without midpoint overflow', () => {
			const base = Number.MAX_SAFE_INTEGER - 4
			const res = summationComplexRecursive(
				(k) => ({ re: k - base, im: 1 }),
				base,
				Number.MAX_SAFE_INTEGER,
			)
			// k - base takes values 0, 1, 2, 3, 4 -> sum = 10; imag = 5
			assert.deepEqual(res, { re: 10, im: 5 })
		})
	})

	describe('input validation and error handling', () => {
		test('throws TypeError for invalid first argument', () => {
			for (const bad of [null, undefined, 42, '123', true, { re: 1, im: 2 }]) {
				assert.throws(() => summationComplexRecursive(bad), TypeError)
			}
		})

		test('throws TypeError if extra bounds are supplied in array mode', () => {
			assert.throws(
				() => summationComplexRecursive([{ re: 1, im: 2 }], 0, 0),
				TypeError,
			)
			assert.throws(
				() => summationComplexRecursive([], 0, undefined),
				TypeError,
			)
			assert.throws(
				() => summationComplexRecursive([], undefined, 1),
				TypeError,
			)
		})

		test('throws TypeError for invalid complex elements in array mode', () => {
			const badElements = [
				null,
				undefined,
				5,
				'complex',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
			]
			for (const bad of badElements) {
				assert.throws(
					() => summationComplexRecursive([{ re: 1, im: 1 }, bad]),
					TypeError,
				)
			}

			// Sparse array with hole
			const sparse = new Array(3)
			sparse[0] = { re: 1, im: 0 }
			sparse[2] = { re: 2, im: 0 }
			assert.throws(() => summationComplexRecursive(sparse), TypeError)
		})

		test('throws RangeError for non-finite complex components', () => {
			for (const badVal of [NaN, Infinity, -Infinity]) {
				assert.throws(
					() => summationComplexRecursive([{ re: badVal, im: 0 }]),
					RangeError,
				)
				assert.throws(
					() => summationComplexRecursive([{ re: 0, im: badVal }]),
					RangeError,
				)
				assert.throws(
					() => summationComplexRecursive(() => ({ re: badVal, im: 1 }), 0, 2),
					RangeError,
				)
			}
		})

		test('throws TypeError or RangeError for invalid start/end bounds in function mode', () => {
			const fn = (k) => ({ re: k, im: 0 })

			// Missing or non-number bounds -> TypeError
			assert.throws(() => summationComplexRecursive(fn), TypeError)
			assert.throws(() => summationComplexRecursive(fn, 0), TypeError)
			assert.throws(() => summationComplexRecursive(fn, '0', 5), TypeError)
			assert.throws(() => summationComplexRecursive(fn, 0, null), TypeError)

			// Non-integer or unsafe integer bounds -> RangeError
			assert.throws(() => summationComplexRecursive(fn, 0.5, 5), RangeError)
			assert.throws(() => summationComplexRecursive(fn, 0, 5.2), RangeError)
			assert.throws(() => summationComplexRecursive(fn, NaN, 5), RangeError)
			assert.throws(() => summationComplexRecursive(fn, 0, Infinity), RangeError)
			assert.throws(
				() => summationComplexRecursive(fn, 0, Number.MAX_SAFE_INTEGER + 1),
				RangeError,
			)

			// Span (end - start) exceeds safe integer range -> RangeError
			assert.throws(
				() =>
					summationComplexRecursive(
						fn,
						-Number.MAX_SAFE_INTEGER,
						Number.MAX_SAFE_INTEGER,
					),
				RangeError,
			)
		})

		test('throws TypeError when termFn returns invalid object', () => {
			assert.throws(
				() => summationComplexRecursive(() => null, 0, 2),
				TypeError,
			)
			assert.throws(
				() => summationComplexRecursive((k) => (k === 1 ? { re: 1 } : { re: 1, im: 0 }), 0, 2),
				TypeError,
			)
		})

		test('throws RangeError when summation overflows finite IEEE-754 range', () => {
			assert.throws(
				() =>
					summationComplexRecursive([
						{ re: Number.MAX_VALUE, im: 0 },
						{ re: Number.MAX_VALUE, im: 0 },
					]),
				RangeError,
			)
			assert.throws(
				() =>
					summationComplexRecursive([
						{ re: 0, im: -Number.MAX_VALUE },
						{ re: 0, im: -Number.MAX_VALUE },
					]),
				RangeError,
			)
		})
	})

	describe('independent mathematical and iterative cross-checks', () => {
		test('matches exact closed-form Gauss and square power sums', () => {
			const N = 1000
			const result = summationComplexRecursive(
				(k) => ({ re: k, im: k * k }),
				1,
				N,
			)
			const expectedRe = (N * (N + 1)) / 2
			const expectedIm = (N * (N + 1) * (2 * N + 1)) / 6
			assert.deepEqual(result, { re: expectedRe, im: expectedIm })
		})

		test('matches analytical complex geometric series formula sum_{k=0}^{n-1} z^k = (1 - z^n)/(1 - z)', () => {
			const cases = [
				{ z: { re: 0.5, im: 0.5 }, n: 20 },
				{ z: { re: 0.8 * Math.cos(Math.PI / 5), im: 0.8 * Math.sin(Math.PI / 5) }, n: 35 },
				{ z: { re: -0.6, im: 0.3 }, n: 15 },
			]

			for (const { z, n } of cases) {
				const zn = powComplex(z, n)
				const analytical = divComplex(
					{ re: 1 - zn.re, im: -zn.im },
					{ re: 1 - z.re, im: -z.im },
				)

				const fnSum = summationComplexRecursive((k) => powComplex(z, k), 0, n - 1)
				const terms = Array.from({ length: n }, (_, k) => powComplex(z, k))
				const arrSum = summationComplexRecursive(terms)

				assertComplexClose(fnSum, analytical, 1e-12)
				assertComplexClose(arrSum, analytical, 1e-12)
			}
		})

		test('satisfies roots of unity identity sum_{k=0}^{N-1} exp(2*pi*i*k/N) = 0', () => {
			for (const N of [2, 3, 7, 16, 100]) {
				const sum = summationComplexRecursive(
					(k) => ({
						re: Math.cos((2 * Math.PI * k) / N),
						im: Math.sin((2 * Math.PI * k) / N),
					}),
					0,
					N - 1,
				)
				assertComplexClose(sum, { re: 0, im: 0 }, 1e-12)
			}
		})

		test('satisfies complex linearity sum(a*z_k + b*w_k) = a*sum(z_k) + b*sum(w_k)', () => {
			const a = { re: 2.5, im: -1.5 }
			const b = { re: -0.75, im: 3.25 }
			const z = Array.from({ length: 25 }, (_, k) => ({
				re: Math.sin(k + 1),
				im: Math.cos(2 * k),
			}))
			const w = Array.from({ length: 25 }, (_, k) => ({
				re: (k - 12) * 0.3,
				im: Math.sin(3 * k),
			}))

			const combined = z.map((zk, k) => {
				const az = mulComplex(a, zk)
				const bw = mulComplex(b, w[k])
				return { re: az.re + bw.re, im: az.im + bw.im }
			})

			const lhs = summationComplexRecursive(combined)
			const sumZ = summationComplexRecursive(z)
			const sumW = summationComplexRecursive(w)
			const aSumZ = mulComplex(a, sumZ)
			const bSumW = mulComplex(b, sumW)
			const rhs = { re: aSumZ.re + bSumW.re, im: aSumZ.im + bSumW.im }

			assertComplexClose(lhs, rhs, 1e-12)
		})

		test('cross-checks against independent iterative reference across sizes', () => {
			// Deterministic LCG for reproducible complex test vectors
			let seed = 123456789
			const nextRand = () => {
				seed = (1664525 * seed + 1013904223) >>> 0
				return (seed / 0xffffffff) * 20 - 10
			}

			for (const n of [0, 1, 2, 3, 7, 16, 31, 100, 1024]) {
				const terms = Array.from({ length: n }, () => ({
					re: nextRand(),
					im: nextRand(),
				}))
				const ref = iterativeComplexSum(terms)
				const fromArray = summationComplexRecursive(terms)
				const fromFn = summationComplexRecursive((k) => terms[k], 0, n - 1)

				assertComplexClose(fromArray, ref, 1e-10)
				assertComplexClose(fromFn, ref, 1e-10)
				// Array mode and function mode use identical binary partitioning -> exact match
				assert.deepEqual(fromArray, fromFn)
			}
		})

		test('pairwise divide-and-conquer maintains high accuracy on large homogeneous sums', () => {
			const count = 65536
			const res = summationComplexRecursive(
				() => ({ re: 0.1, im: -0.3 }),
				0,
				count - 1,
			)
			const expected = { re: count * 0.1, im: count * -0.3 }
			// Pairwise summation of power-of-2 identical terms has near-machine-epsilon error
			assertComplexClose(res, expected, 1e-11)
		})
	})
})
