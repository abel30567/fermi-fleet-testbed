import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationDualRecursive } from './summationDualRecursive.js'

const approxEqual = (actual, expected, tol = 1e-10) => {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('summationDualRecursive', () => {
	describe('normal cases (array form)', () => {
		test('sums small array of dual numbers', () => {
			const terms = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 },
			]
			assert.deepEqual(summationDualRecursive(terms), { v: 9, d: 12 })
		})

		test('handles negative values, decimals, and cancellation', () => {
			const terms = [
				{ v: 10.5, d: -3.25 },
				{ v: -4.25, d: 1.75 },
				{ v: -6.25, d: 1.5 },
			]
			const res = summationDualRecursive(terms)
			approxEqual(res.v, 0)
			approxEqual(res.d, 0)
		})

		test('handles even and odd lengths across recursive splits', () => {
			for (const len of [2, 3, 4, 5, 7, 8, 15, 16, 33]) {
				const terms = Array.from({ length: len }, (_, i) => ({
					v: i + 1,
					d: 2 * (i + 1) - 1,
				}))
				const res = summationDualRecursive(terms)
				assert.equal(res.v, (len * (len + 1)) / 2)
				assert.equal(res.d, len * len)
			}
		})

		test('does not mutate input array or return input object reference', () => {
			const single = { v: 7, d: -2 }
			const input = [single]
			const res = summationDualRecursive(input)
			assert.deepEqual(res, { v: 7, d: -2 })
			assert.notEqual(res, single)
			res.v = 999
			assert.equal(single.v, 7)
		})
	})

	describe('normal cases (function + range form)', () => {
		test('sums dual terms over positive integer range', () => {
			const res = summationDualRecursive((k) => ({ v: k, d: 1 }), 1, 10)
			assert.deepEqual(res, { v: 55, d: 10 })
		})

		test('sums dual terms over negative-to-positive symmetric range', () => {
			const res = summationDualRecursive(
				(k) => ({ v: k * k, d: 2 * k }),
				-3,
				3,
			)
			assert.deepEqual(res, { v: 28, d: 0 })
		})

		test('sums dual terms over entirely negative range', () => {
			const res = summationDualRecursive(
				(k) => ({ v: k, d: -k * 2 }),
				-5,
				-2,
			)
			assert.deepEqual(res, { v: -14, d: 28 })
		})

		test('handles single-element range start === end', () => {
			const res = summationDualRecursive((k) => ({ v: k * 3, d: k + 1 }), 4, 4)
			assert.deepEqual(res, { v: 12, d: 5 })
		})

		test('matches array form on identical sequence', () => {
			const x = 1.3
			const fn = (k) => ({ v: Math.pow(x, k), d: k * Math.pow(x, k - 1) })
			const arr = Array.from({ length: 12 }, (_, k) => fn(k))
			const fromArr = summationDualRecursive(arr)
			const fromFn = summationDualRecursive(fn, 0, 11)
			approxEqual(fromFn.v, fromArr.v, 1e-12)
			approxEqual(fromFn.d, fromArr.d, 1e-12)
		})
	})

	describe('edge cases', () => {
		test('empty array returns { v: 0, d: 0 }', () => {
			assert.deepEqual(summationDualRecursive([]), { v: 0, d: 0 })
		})

		test('empty range (start > end) returns { v: 0, d: 0 } without calling termFn', () => {
			let calls = 0
			const res = summationDualRecursive(
				() => {
					calls += 1
					return { v: 1, d: 1 }
				},
				5,
				2,
			)
			assert.deepEqual(res, { v: 0, d: 0 })
			assert.equal(calls, 0)
		})

		test('handles large array (10,000 terms) without stack overflow and with high accuracy', () => {
			const n = 10000
			const terms = Array.from({ length: n }, () => ({ v: 0.1, d: 0.2 }))
			const res = summationDualRecursive(terms)
			approxEqual(res.v, n * 0.1, 1e-9)
			approxEqual(res.d, n * 0.2, 1e-9)
		})

		test('handles zero values and zero derivatives', () => {
			const terms = [
				{ v: 0, d: 0 },
				{ v: 0, d: 5 },
				{ v: 3, d: 0 },
			]
			assert.deepEqual(summationDualRecursive(terms), { v: 3, d: 5 })
		})
	})

	describe('independent cross-checks', () => {
		test('closed-form geometric series and analytical derivative', () => {
			const x = 0.7
			const n = 20
			const res = summationDualRecursive(
				(k) => ({
					v: x ** k,
					d: k === 0 ? 0 : k * x ** (k - 1),
				}),
				0,
				n - 1,
			)
			const expectedV = (1 - x ** n) / (1 - x)
			const expectedD =
				(1 - n * x ** (n - 1) + (n - 1) * x ** n) / (1 - x) ** 2
			approxEqual(res.v, expectedV, 1e-12)
			approxEqual(res.d, expectedD, 1e-11)
		})

		test('closed-form Faulhaber quadratic sum and derivative', () => {
			const x = 2.5
			const n = 50
			// sum_{k=1..n} ( (k*x)^2 + 3*k*x + 1 )
			const res = summationDualRecursive(
				(k) => ({
					v: (k * x) ** 2 + 3 * k * x + 1,
					d: 2 * k * k * x + 3 * k,
				}),
				1,
				n,
			)
			const sumK = (n * (n + 1)) / 2
			const sumK2 = (n * (n + 1) * (2 * n + 1)) / 6
			const expectedV = x * x * sumK2 + 3 * x * sumK + n
			const expectedD = 2 * x * sumK2 + 3 * sumK
			approxEqual(res.v, expectedV, 1e-8)
			approxEqual(res.d, expectedD, 1e-8)
		})

		test('central finite-difference cross-check on nonlinear parameterized sum', () => {
			const t = 0.65
			const n = 15
			const scalarTerm = (k, s) => Math.sin(k * s) * Math.exp(-0.1 * k * s)
			const dualTerm = (k, s) => {
				const exp = Math.exp(-0.1 * k * s)
				const sin = Math.sin(k * s)
				const cos = Math.cos(k * s)
				return {
					v: sin * exp,
					d: (k * cos - 0.1 * k * sin) * exp,
				}
			}

			const dualSum = summationDualRecursive((k) => dualTerm(k, t), 1, n)

			const h = 1e-6
			let sumPlus = 0
			let sumMinus = 0
			for (let k = 1; k <= n; k += 1) {
				sumPlus += scalarTerm(k, t + h)
				sumMinus += scalarTerm(k, t - h)
			}
			const fdDeriv = (sumPlus - sumMinus) / (2 * h)

			approxEqual(dualSum.d, fdDeriv, 1e-8)
		})

		test('dual linearity: sum(a * u_k + b * w_k) === a * sum(u_k) + b * sum(w_k)', () => {
			const mulDual = (p, q) => ({ v: p.v * q.v, d: p.v * q.d + p.d * q.v })
			const addDual = (p, q) => ({ v: p.v + q.v, d: p.d + q.d })

			const a = { v: 2.3, d: -0.7 }
			const b = { v: -1.4, d: 3.1 }
			const u = [
				{ v: 1.2, d: 0.5 },
				{ v: -3.4, d: 2.1 },
				{ v: 0.8, d: -1.9 },
				{ v: 4.5, d: 0.3 },
				{ v: -2.0, d: 1.1 },
			]
			const w = [
				{ v: -0.6, d: 1.4 },
				{ v: 2.2, d: -0.8 },
				{ v: 5.1, d: 0.9 },
				{ v: -1.3, d: -2.5 },
				{ v: 3.7, d: 0.4 },
			]

			const combined = u.map((uk, i) =>
				addDual(mulDual(a, uk), mulDual(b, w[i])),
			)
			const lhs = summationDualRecursive(combined)
			const rhs = addDual(
				mulDual(a, summationDualRecursive(u)),
				mulDual(b, summationDualRecursive(w)),
			)
			approxEqual(lhs.v, rhs.v, 1e-12)
			approxEqual(lhs.d, rhs.d, 1e-12)
		})
	})

	describe('input validation', () => {
		test('rejects invalid first argument', () => {
			for (const bad of [null, undefined, 42, 'sum', {}, true]) {
				assert.throws(() => summationDualRecursive(bad), TypeError)
			}
		})

		test('rejects extra start/end arguments with array form', () => {
			assert.throws(
				() => summationDualRecursive([{ v: 1, d: 2 }], 0, 1),
				TypeError,
			)
		})

		test('rejects invalid dual elements in array', () => {
			const invalidElements = [
				null,
				undefined,
				5,
				'1',
				[1, 2],
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 0, d: null },
			]
			for (const bad of invalidElements) {
				assert.throws(() => summationDualRecursive([bad]), TypeError)
			}
		})

		test('rejects sparse arrays with holes', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [{ v: 1, d: 0 }, , { v: 2, d: 0 }]
			assert.throws(() => summationDualRecursive(sparse), TypeError)
		})

		test('rejects non-finite dual components in array', () => {
			const nonFinite = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => summationDualRecursive([bad]), RangeError)
			}
		})

		test('rejects invalid start/end bounds for function form', () => {
			const ok = () => ({ v: 1, d: 0 })
			assert.throws(() => summationDualRecursive(ok, '0', 5), TypeError)
			assert.throws(() => summationDualRecursive(ok, 0, null), TypeError)
			assert.throws(() => summationDualRecursive(ok), TypeError)
			assert.throws(() => summationDualRecursive(ok, 0.5, 3), RangeError)
			assert.throws(() => summationDualRecursive(ok, 0, Number.NaN), RangeError)
			assert.throws(
				() => summationDualRecursive(ok, 0, Number.POSITIVE_INFINITY),
				RangeError,
			)
			assert.throws(
				() => summationDualRecursive(ok, 0, Number.MAX_SAFE_INTEGER + 1),
				RangeError,
			)
			assert.throws(
				() =>
					summationDualRecursive(
						ok,
						-Number.MAX_SAFE_INTEGER,
						Number.MAX_SAFE_INTEGER,
					),
				RangeError,
			)
		})

		test('rejects invalid dual objects returned by termFn', () => {
			assert.throws(() => summationDualRecursive(() => null, 0, 2), TypeError)
			assert.throws(
				() => summationDualRecursive(() => ({ v: 1, d: Number.NaN }), 0, 2),
				RangeError,
			)
		})
	})
})
