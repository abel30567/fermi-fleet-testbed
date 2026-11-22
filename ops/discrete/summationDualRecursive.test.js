import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationDualRecursive } from './summationDualRecursive.js'

/**
 * Independent naive left-to-right iterative dual summation for cross-checking.
 *
 * @param {Array<{v: number, d: number}>} terms
 * @returns {{v: number, d: number}}
 */
function iterativeDualSum(terms) {
	let v = 0
	let d = 0
	for (const term of terms) {
		v += term.v
		d += term.d
	}
	return { v, d }
}

/**
 * Asserts two numbers are within an absolute/relative tolerance.
 */
function assertApprox(actual, expected, tol = 1e-12, label = 'value') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${label}: expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
	)
}

describe('summationDualRecursive', () => {
	describe('edge cases', () => {
		test('returns { v: 0, d: 0 } for an empty array', () => {
			assert.deepEqual(summationDualRecursive([]), { v: 0, d: 0 })
		})

		test('handles a single element and returns a fresh object (no aliasing)', () => {
			const input = [{ v: 42.5, d: -3.25 }]
			const result = summationDualRecursive(input)
			assert.deepEqual(result, { v: 42.5, d: -3.25 })
			assert.notEqual(result, input[0])
			result.v = 0
			assert.equal(input[0].v, 42.5)
		})

		test('handles odd and even array lengths accurately', () => {
			for (const len of [2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33]) {
				const terms = Array.from({ length: len }, (_, i) => ({
					v: i + 1,
					d: 2 * (i + 1) - 1,
				}))
				const result = summationDualRecursive(terms)
				// Sum of 1..len = len*(len+1)/2; sum of first len odd numbers = len^2
				assert.deepEqual(result, {
					v: (len * (len + 1)) / 2,
					d: len * len,
				})
			}
		})

		test('does not mutate the input array or its elements', () => {
			const terms = [
				{ v: 1.5, d: -0.5 },
				{ v: 2.5, d: 3.0 },
				{ v: -4.0, d: 1.25 },
			]
			const snapshot = structuredClone(terms)
			const result = summationDualRecursive(terms)
			assert.deepEqual(result, { v: 0, d: 3.75 })
			assert.deepEqual(terms, snapshot)
		})

		test('handles exact and structured cancellation', () => {
			const symmetric = [
				{ v: 1e12, d: -1e9 },
				{ v: -1e12, d: 1e9 },
				{ v: 3.5, d: 2.25 },
				{ v: -3.5, d: -2.25 },
			]
			assert.deepEqual(summationDualRecursive(symmetric), { v: 0, d: 0 })

			// Pairwise grouping cancels adjacent large terms before combining with small residual
			const residual = [
				{ v: 1e16, d: 1e16 },
				{ v: -1e16, d: -1e16 },
				{ v: 1.25, d: -0.75 },
				{ v: 0.75, d: 2.75 },
			]
			assert.deepEqual(summationDualRecursive(residual), { v: 2, d: 2 })
		})

		test('handles large arrays without stack overflow and with high pairwise accuracy', () => {
			const n = 100_000
			const terms = Array.from({ length: n }, () => ({ v: 0.1, d: 0.3 }))
			const result = summationDualRecursive(terms)
			const exactV = n * 0.1 // 10000
			const exactD = n * 0.3 // 30000
			const iter = iterativeDualSum(terms)

			const recursiveErrV = Math.abs(result.v - exactV)
			const iterErrV = Math.abs(iter.v - exactV)
			const recursiveErrD = Math.abs(result.d - exactD)
			const iterErrD = Math.abs(iter.d - exactD)

			assertApprox(result.v, exactV, 1e-13, 'large array v')
			assertApprox(result.d, exactD, 1e-13, 'large array d')
			assert.ok(
				recursiveErrV < iterErrV,
				`Expected pairwise error (${recursiveErrV}) < iterative error (${iterErrV}) for v`,
			)
			assert.ok(
				recursiveErrD < iterErrD,
				`Expected pairwise error (${recursiveErrD}) < iterative error (${iterErrD}) for d`,
			)
		})
	})

	describe('normal cases and cross-checks', () => {
		test('matches independent iterative sum on mixed positive/negative floats', () => {
			const terms = Array.from({ length: 127 }, (_, i) => ({
				v: Math.cos(i * 0.37) * 10 - 2.5,
				d: Math.sin(i * 0.53) * 7 + 1.1,
			}))
			const actual = summationDualRecursive(terms)
			const expected = iterativeDualSum(terms)
			assertApprox(actual.v, expected.v, 1e-12, 'mixed v')
			assertApprox(actual.d, expected.d, 1e-12, 'mixed d')
		})

		test('cross-checks against closed-form arithmetic/polynomial series and its derivative', () => {
			// f(x) = sum_{k=1}^{N} (k * x^2 + 3 * k * x - 2)
			//      = (N*(N+1)/2) * x^2 + 3*(N*(N+1)/2) * x - 2*N
			// f'(x) = N*(N+1)*x + 3*(N*(N+1)/2)
			const N = 200
			const x = 1.75
			const terms = Array.from({ length: N }, (_, idx) => {
				const k = idx + 1
				return {
					v: k * x * x + 3 * k * x - 2,
					d: 2 * k * x + 3 * k,
				}
			})

			const triangular = (N * (N + 1)) / 2
			const closedV = triangular * x * x + 3 * triangular * x - 2 * N
			const closedD = 2 * triangular * x + 3 * triangular

			const result = summationDualRecursive(terms)
			assertApprox(result.v, closedV, 1e-12, 'polynomial series v')
			assertApprox(result.d, closedD, 1e-12, 'polynomial series d')
		})

		test('cross-checks against closed-form geometric series and finite-difference derivative', () => {
			// f(x) = sum_{k=0}^{N-1} x^k = (1 - x^N) / (1 - x)
			// f'(x) = sum_{k=1}^{N-1} k * x^(k-1) = ((N - 1)*x^N - N*x^(N-1) + 1) / (1 - x)^2
			const N = 40
			const x = 0.65

			const evalGeometric = (t) => {
				const terms = Array.from({ length: N }, (_, k) => ({
					v: t ** k,
					d: k === 0 ? 0 : k * t ** (k - 1),
				}))
				return summationDualRecursive(terms)
			}

			const result = evalGeometric(x)
			const closedV = (1 - x ** N) / (1 - x)
			const closedD = ((N - 1) * x ** N - N * x ** (N - 1) + 1) / (1 - x) ** 2

			// Central finite-difference derivative check
			const h = 1e-6
			const fd = (evalGeometric(x + h).v - evalGeometric(x - h).v) / (2 * h)

			assertApprox(result.v, closedV, 1e-12, 'geometric closed-form v')
			assertApprox(result.d, closedD, 1e-12, 'geometric closed-form d')
			assertApprox(result.d, fd, 1e-7, 'geometric finite-difference d')
		})

		test('cross-checks nonlinear trigonometric sum derivative against central finite difference', () => {
			// g(x) = sum_{k=1}^{50} sin(k * x), g'(x) = sum_{k=1}^{50} k * cos(k * x)
			const M = 50
			const x = 0.42

			const evalTrig = (t) => {
				const terms = Array.from({ length: M }, (_, idx) => {
					const k = idx + 1
					return {
						v: Math.sin(k * t),
						d: k * Math.cos(k * t),
					}
				})
				return summationDualRecursive(terms)
			}

			const result = evalTrig(x)
			const h = 1e-7
			const fd = (evalTrig(x + h).v - evalTrig(x - h).v) / (2 * h)

			assertApprox(result.d, fd, 1e-6, 'trigonometric finite-difference d')
		})
	})

	describe('input validation', () => {
		test('throws TypeError when input is not an array', () => {
			for (const bad of [null, undefined, 42, 'abc', true, { v: 1, d: 2 }]) {
				assert.throws(() => summationDualRecursive(bad), TypeError)
			}
		})

		test('throws TypeError for sparse arrays or non-object elements', () => {
			const sparse = new Array(3)
			sparse[0] = { v: 1, d: 1 }
			sparse[2] = { v: 2, d: 2 }
			assert.throws(() => summationDualRecursive(sparse), TypeError)

			for (const badEl of [null, undefined, 5, 'x', [1, 2], true]) {
				assert.throws(() => summationDualRecursive([{ v: 1, d: 0 }, badEl]), TypeError)
			}
		})

		test('throws TypeError when v or d is missing or not a number', () => {
			const invalidElements = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 2 },
				{ v: 1, d: '2' },
				{ v: 1, d: null },
				{ v: undefined, d: 0 },
			]
			for (const el of invalidElements) {
				assert.throws(() => summationDualRecursive([el]), TypeError)
			}
		})

		test('throws RangeError when v or d is non-finite (NaN or ±Infinity)', () => {
			const nonFiniteElements = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
				{ v: Number.NEGATIVE_INFINITY, d: Number.POSITIVE_INFINITY },
			]
			for (const el of nonFiniteElements) {
				assert.throws(() => summationDualRecursive([{ v: 1, d: 2 }, el]), RangeError)
			}
		})
	})
})
