import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationDualIterative } from './summationDualIterative.js'

/**
 * Helper to assert two numbers are within an absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

/**
 * Dual multiplication helper for independent algebraic checks.
 * (a.v + a.d*ε)(b.v + b.d*ε) = (a.v*b.v) + (a.v*b.d + a.d*b.v)*ε
 */
function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

/**
 * Dual integer power x^k for integer k >= 0.
 */
function dualPow(x, k) {
	if (k === 0) return { v: 1, d: 0 }
	return {
		v: x.v ** k,
		d: k * (x.v ** (k - 1)) * x.d
	}
}

describe('summationDualIterative', () => {
	describe('iterable mode', () => {
		test('sums an array of dual numbers component-wise', () => {
			const terms = [
				{ v: 1.5, d: 2 },
				{ v: -0.5, d: 3.5 },
				{ v: 4, d: -1.5 }
			]
			const result = summationDualIterative(terms)
			assert.deepEqual(result, { v: 5, d: 4 })
		})

		test('handles a single-element array and returns a fresh object without mutating input', () => {
			const term = { v: 3.25, d: -7.5 }
			const terms = [term]
			const result = summationDualIterative(terms)
			assert.deepEqual(result, { v: 3.25, d: -7.5 })
			assert.notEqual(result, term)
			assert.deepEqual(term, { v: 3.25, d: -7.5 })
		})

		test('sums values from a generator and a Set', () => {
			function* dualGen() {
				yield { v: 2, d: 1 }
				yield { v: 3, d: 4 }
				yield { v: 5, d: 9 }
			}
			assert.deepEqual(summationDualIterative(dualGen()), { v: 10, d: 14 })

			const set = new Set([
				{ v: -1, d: 2 },
				{ v: 6, d: -2 }
			])
			assert.deepEqual(summationDualIterative(set), { v: 5, d: 0 })
		})

		test('returns additive identity { v: 0, d: 0 } for empty iterables', () => {
			assert.deepEqual(summationDualIterative([]), { v: 0, d: 0 })
			function* emptyGen() {}
			assert.deepEqual(summationDualIterative(emptyGen()), { v: 0, d: 0 })
		})
	})

	describe('function and range mode', () => {
		test('sums a term function over [start, end] without dual parameter', () => {
			const n = 10
			// Σ_{k=1}^{n} (k^2 + 2k*ε)
			const result = summationDualIterative((k) => ({ v: k * k, d: 2 * k }), 1, n)
			const expectedV = (n * (n + 1) * (2 * n + 1)) / 6
			const expectedD = n * (n + 1)
			assert.deepEqual(result, { v: expectedV, d: expectedD })
		})

		test('supports negative bounds and odd symmetry cancellation', () => {
			const x = { v: 2.5, d: 1 }
			// Σ_{k=-4}^{4} k * x^2 = 0 (both value and derivative cancel)
			const result = summationDualIterative(
				(k, param) => ({ v: k * param.v * param.v, d: k * 2 * param.v * param.d }),
				-4,
				4,
				x
			)
			assert.deepEqual(result, { v: 0, d: 0 })
		})

		test('handles single-index ranges including Number.MAX_SAFE_INTEGER boundary', () => {
			assert.deepEqual(
				summationDualIterative((k) => ({ v: k, d: 1 }), -7, -7),
				{ v: -7, d: 1 }
			)
			const max = Number.MAX_SAFE_INTEGER
			assert.deepEqual(
				summationDualIterative((k) => ({ v: k === max ? 1 : 0, d: 2 }), max, max),
				{ v: 1, d: 2 }
			)
		})

		test('returns { v: 0, d: 0 } and does not invoke termFn when start > end', () => {
			let calls = 0
			const result = summationDualIterative(
				() => {
					calls += 1
					return { v: 1, d: 1 }
				},
				5,
				2,
				{ v: 1, d: 1 }
			)
			assert.deepEqual(result, { v: 0, d: 0 })
			assert.equal(calls, 0)
		})

		test('handles large iteration counts accurately', () => {
			const n = 10000
			const result = summationDualIterative((k) => ({ v: k, d: 1 }), 1, n)
			assert.deepEqual(result, { v: (n * (n + 1)) / 2, d: n })
		})
	})

	describe('mathematical cross-checks', () => {
		test('geometric series matches analytic closed-form value and derivative plus central finite difference', () => {
			const x0 = 0.65
			const n = 15
			const result = summationDualIterative((k, x) => dualPow(x, k), 0, n, { v: x0, d: 1 })

			// Analytic closed-form:
			// S(x)  = (1 - x^(n+1)) / (1 - x)
			// S'(x) = (1 - (n+1)x^n + n*x^(n+1)) / (1 - x)^2
			const denom = 1 - x0
			const analyticV = (1 - x0 ** (n + 1)) / denom
			const analyticD = (1 - (n + 1) * (x0 ** n) + n * (x0 ** (n + 1))) / (denom * denom)

			assertClose(result.v, analyticV, 1e-12)
			assertClose(result.d, analyticD, 1e-12)

			// Independent central finite-difference check on S(x):
			const h = 1e-6
			const evalScalar = (x) => {
				let sum = 0
				for (let k = 0; k <= n; k += 1) sum += x ** k
				return sum
			}
			const fdDeriv = (evalScalar(x0 + h) - evalScalar(x0 - h)) / (2 * h)
			assertClose(result.d, fdDeriv, 1e-7)
		})

		test('nonlinear trigonometric series matches central finite-difference and directional derivative scaling', () => {
			const x0 = 1.2
			const seed = 3.5
			const n = 25

			// F(x) = Σ_{k=1}^{n} sin(k*x) / k^2
			// F'(x) = Σ_{k=1}^{n} cos(k*x) / k
			const termFn = (k, x) => ({
				v: Math.sin(k * x.v) / (k * k),
				d: (Math.cos(k * x.v) * x.d) / k
			})

			const unitResult = summationDualIterative(termFn, 1, n, { v: x0, d: 1 })
			const scaledResult = summationDualIterative(termFn, 1, n, { v: x0, d: seed })

			const evalScalar = (x) => {
				let s = 0
				for (let k = 1; k <= n; k += 1) s += Math.sin(k * x) / (k * k)
				return s
			}
			const h = 1e-6
			const fdDeriv = (evalScalar(x0 + h) - evalScalar(x0 - h)) / (2 * h)

			assertClose(unitResult.v, evalScalar(x0), 1e-13)
			assertClose(unitResult.d, fdDeriv, 1e-7)
			assertClose(scaledResult.v, unitResult.v, 1e-13)
			assertClose(scaledResult.d, unitResult.d * seed, 1e-12)
		})

		test('satisfies dual-number linearity: Σ(c * a_k + b_k) = c * Σa_k + Σb_k', () => {
			const c = { v: 2.5, d: -0.75 }
			const a = [
				{ v: 1, d: 0.5 },
				{ v: -2, d: 1.25 },
				{ v: 3.5, d: -0.5 }
			]
			const b = [
				{ v: 0.5, d: -1 },
				{ v: 4, d: 2 },
				{ v: -1.5, d: 0.25 }
			]

			const combined = a.map((ak, i) => {
				const ca = dualMul(c, ak)
				return { v: ca.v + b[i].v, d: ca.d + b[i].d }
			})

			const lhs = summationDualIterative(combined)
			const sumA = summationDualIterative(a)
			const sumB = summationDualIterative(b)
			const cSumA = dualMul(c, sumA)
			const rhs = { v: cSumA.v + sumB.v, d: cSumA.d + sumB.d }

			assertClose(lhs.v, rhs.v, 1e-13)
			assertClose(lhs.d, rhs.d, 1e-13)
		})
	})

	describe('input validation', () => {
		test('rejects invalid source types', () => {
			for (const bad of [undefined, null, 42, 'abc', true, {}, { v: 1, d: 2 }]) {
				assert.throws(() => summationDualIterative(bad), TypeError)
			}
		})

		test('rejects unexpected extra arguments in iterable mode', () => {
			assert.throws(() => summationDualIterative([{ v: 1, d: 2 }], 0), TypeError)
			assert.throws(() => summationDualIterative([], 0, 1), TypeError)
		})

		test('rejects malformed or non-finite dual elements in iterable mode', () => {
			assert.throws(() => summationDualIterative([null]), TypeError)
			assert.throws(() => summationDualIterative([42]), TypeError)
			assert.throws(() => summationDualIterative([[1, 2]]), TypeError)
			assert.throws(() => summationDualIterative([{ v: 1 }]), TypeError)
			assert.throws(() => summationDualIterative([{ v: '1', d: 0 }]), TypeError)
			assert.throws(() => summationDualIterative([{ v: NaN, d: 0 }]), RangeError)
			assert.throws(() => summationDualIterative([{ v: 0, d: Infinity }]), RangeError)
			assert.throws(() => summationDualIterative([{ v: -Infinity, d: 0 }]), RangeError)
		})

		test('rejects invalid start and end bounds in function mode', () => {
			const fn = (k) => ({ v: k, d: 1 })
			assert.throws(() => summationDualIterative(fn), TypeError)
			assert.throws(() => summationDualIterative(fn, '0', 5), TypeError)
			assert.throws(() => summationDualIterative(fn, 0, '5'), TypeError)
			assert.throws(() => summationDualIterative(fn, 0, null), TypeError)
			assert.throws(() => summationDualIterative(fn, 0.5, 5), RangeError)
			assert.throws(() => summationDualIterative(fn, 0, 5.5), RangeError)
			assert.throws(() => summationDualIterative(fn, NaN, 5), RangeError)
			assert.throws(() => summationDualIterative(fn, 0, Infinity), RangeError)
			assert.throws(
				() => summationDualIterative(fn, 0, Number.MAX_SAFE_INTEGER + 1),
				RangeError
			)
		})

		test('rejects invalid dual param even when start > end', () => {
			const fn = (k, x) => ({ v: k * x.v, d: k * x.d })
			assert.throws(() => summationDualIterative(fn, 5, 1, null), TypeError)
			assert.throws(() => summationDualIterative(fn, 5, 1, { v: 1 }), TypeError)
			assert.throws(() => summationDualIterative(fn, 5, 1, { v: NaN, d: 1 }), RangeError)
			assert.throws(() => summationDualIterative(fn, 5, 1, { v: 1, d: Infinity }), RangeError)
		})

		test('rejects malformed or non-finite return values from termFn', () => {
			assert.throws(() => summationDualIterative(() => null, 0, 0), TypeError)
			assert.throws(() => summationDualIterative(() => ({ v: 1 }), 0, 0), TypeError)
			assert.throws(() => summationDualIterative(() => ({ v: NaN, d: 0 }), 0, 0), RangeError)
			assert.throws(() => summationDualIterative(() => ({ v: 0, d: -Infinity }), 0, 0), RangeError)
		})
	})
})
