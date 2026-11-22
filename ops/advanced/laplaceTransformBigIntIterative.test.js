import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	laplaceTransformBigIntIterative,
	SCALE,
} from './laplaceTransformBigIntIterative.js'

/**
 * Helper to assert two fixed-point BigInt values are within a given tolerance.
 */
function assertCloseBigInt(actual, expected, tolerance, label = '') {
	const diff = actual >= expected ? actual - expected : expected - actual
	assert.ok(
		diff <= tolerance,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tolerance} of ${expected} (diff = ${diff})`
	)
}

/**
 * Converts a JS number to fixed-point BigInt scaled by SCALE (10^18).
 */
function toFixed(x) {
	return BigInt(Math.round(x * 1e15)) * 1000n
}

/**
 * Fixed-point BigInt multiplication (a * b) / SCALE with rounding.
 */
function mulFixed(a, b) {
	const prod = a * b
	if (prod >= 0n) return (2n * prod + SCALE) / (2n * SCALE)
	return -((2n * -prod + SCALE) / (2n * SCALE))
}

/**
 * Independent floating-point composite Simpson integrator for cross-checking.
 */
function floatLaplaceSimpson(fnNum, sNum, upperBoundNum, steps = 20000) {
	const h = upperBoundNum / steps
	let sum = fnNum(0) + fnNum(upperBoundNum) * Math.exp(-sNum * upperBoundNum)
	for (let k = 1; k < steps; k += 1) {
		const t = k * h
		const w = k % 2 === 0 ? 2 : 4
		sum += w * fnNum(t) * Math.exp(-sNum * t)
	}
	return (sum * h) / 3
}

describe('laplaceTransformBigIntIterative', () => {
	describe('closed-form analytical cross-checks (normal cases)', () => {
		test('constant function: L{c}(s) = c / s', () => {
			// f(t) = 1, s = 2 => 1/2 = 0.5
			const res1 = laplaceTransformBigIntIterative(() => SCALE, 2n * SCALE)
			assertCloseBigInt(res1, 5n * 10n ** 17n, 10n ** 5n, 'L{1}(2)')

			// f(t) = 7, s = 4 => 7/4 = 1.75
			const res2 = laplaceTransformBigIntIterative(() => 7n * SCALE, 4n * SCALE)
			assertCloseBigInt(res2, 175n * 10n ** 16n, 10n ** 6n, 'L{7}(4)')

			// Non-integer s = 1.5, f(t) = 3 => 3 / 1.5 = 2
			const res3 = laplaceTransformBigIntIterative(
				() => 3n * SCALE,
				15n * 10n ** 17n
			)
			assertCloseBigInt(res3, 2n * SCALE, 10n ** 6n, 'L{3}(1.5)')
		})

		test('polynomial functions: L{t^n}(s) = n! / s^(n+1)', () => {
			// L{t}(2) = 1 / 4 = 0.25
			const l1 = laplaceTransformBigIntIterative((t) => t, 2n * SCALE)
			assertCloseBigInt(l1, 25n * 10n ** 16n, 10n ** 6n, 'L{t}(2)')

			// L{t^2}(2) = 2 / 8 = 0.25
			const l2 = laplaceTransformBigIntIterative(
				(t) => mulFixed(t, t),
				2n * SCALE
			)
			assertCloseBigInt(l2, 25n * 10n ** 16n, 10n ** 6n, 'L{t^2}(2)')

			// L{t^3}(3) = 6 / 81 = 2 / 27
			const l3 = laplaceTransformBigIntIterative(
				(t) => mulFixed(mulFixed(t, t), t),
				3n * SCALE
			)
			const expected3 = (2n * SCALE + 13n) / 27n
			assertCloseBigInt(l3, expected3, 10n ** 6n, 'L{t^3}(3)')
		})

		test('exponential functions: L{e^(-at)}(s) = 1/(s+a) and L{e^(at)}(s) = 1/(s-a)', () => {
			// f(t) = exp(-3t), s = 2 => 1 / 5 = 0.2
			const decay = laplaceTransformBigIntIterative(
				(t) => toFixed(Math.exp(-3 * (Number(t) / 1e18))),
				2n * SCALE
			)
			assertCloseBigInt(decay, 2n * 10n ** 17n, 10n ** 8n, 'L{e^-3t}(2)')

			// f(t) = exp(t), s = 3 => 1 / (3 - 1) = 0.5
			// Use explicit upperBound = 25 (e^-(3-1)*25 = e^-50)
			const growth = laplaceTransformBigIntIterative(
				(t) => toFixed(Math.exp(Number(t) / 1e18)),
				3n * SCALE,
				{ upperBound: 25n * SCALE, steps: 4000n }
			)
			assertCloseBigInt(growth, 5n * 10n ** 17n, 10n ** 8n, 'L{e^t}(3)')
		})

		test('trigonometric functions: L{sin(wt)}(s) and L{cos(wt)}(s)', () => {
			// L{sin(2t)}(3) = 2 / (9 + 4) = 2 / 13
			const sinRes = laplaceTransformBigIntIterative(
				(t) => toFixed(Math.sin(2 * (Number(t) / 1e18))),
				3n * SCALE
			)
			const expectedSin = (2n * SCALE) / 13n
			assertCloseBigInt(sinRes, expectedSin, 10n ** 7n, 'L{sin(2t)}(3)')

			// L{cos(2t)}(3) = 3 / (9 + 4) = 3 / 13
			const cosRes = laplaceTransformBigIntIterative(
				(t) => toFixed(Math.cos(2 * (Number(t) / 1e18))),
				3n * SCALE
			)
			const expectedCos = (3n * SCALE) / 13n
			assertCloseBigInt(cosRes, expectedCos, 10n ** 7n, 'L{cos(2t)}(3)')
		})

		test('linearity: L{3f(t) - 2g(t)}(s) = 3L{f}(s) - 2L{g}(s)', () => {
			const s = 2n * SCALE
			const f = (t) => t
			const g = (t) => mulFixed(t, t)
			const combined = laplaceTransformBigIntIterative(
				(t) => 3n * f(t) - 2n * g(t),
				s
			)
			const lf = laplaceTransformBigIntIterative(f, s)
			const lg = laplaceTransformBigIntIterative(g, s)
			assertCloseBigInt(combined, 3n * lf - 2n * lg, 10n ** 4n, 'linearity')
		})
	})

	describe('independent floating-point numerical integration cross-check', () => {
		test('non-elementary integrand f(t) = cos(2t) / (1 + t^2) at s = 1.25', () => {
			const fnNum = (t) => Math.cos(2 * t) / (1 + t * t)
			const fnBig = (t) => {
				const tn = Number(t) / 1e18
				return toFixed(fnNum(tn))
			}

			const sNum = 1.25
			const sBig = 125n * 10n ** 16n
			const upperNum = 40
			const upperBig = 40n * SCALE

			const bigIntResult = laplaceTransformBigIntIterative(fnBig, sBig, {
				upperBound: upperBig,
				steps: 4000n,
			})
			const floatResult = floatLaplaceSimpson(fnNum, sNum, upperNum, 20000)
			const floatAsBigInt = toFixed(floatResult)

			assertCloseBigInt(
				bigIntResult,
				floatAsBigInt,
				10n ** 9n,
				'BigInt vs float Simpson cross-check'
			)
		})

		test('Gaussian-modulated integrand f(t) = exp(-t^2 / 2) at s = 0.5', () => {
			const fnNum = (t) => Math.exp((-t * t) / 2)
			const fnBig = (t) => {
				const tn = Number(t) / 1e18
				return toFixed(fnNum(tn))
			}

			const bigIntResult = laplaceTransformBigIntIterative(
				fnBig,
				5n * 10n ** 17n,
				{ upperBound: 12n * SCALE, steps: 2000n }
			)
			const floatResult = floatLaplaceSimpson(fnNum, 0.5, 12, 20000)

			assertCloseBigInt(
				bigIntResult,
				toFixed(floatResult),
				10n ** 9n,
				'Gaussian Laplace cross-check'
			)
		})
	})

	describe('edge cases and quadrature methods', () => {
		test('zero function returns exact 0n', () => {
			const res = laplaceTransformBigIntIterative(() => 0n, SCALE)
			assert.equal(res, 0n)
		})

		test('negative-valued function produces negative result', () => {
			const res = laplaceTransformBigIntIterative(() => -5n * SCALE, 2n * SCALE)
			assertCloseBigInt(res, -25n * 10n ** 17n, 10n ** 6n, 'L{-5}(2)')
		})

		test('upperBound === 0n returns exact 0n', () => {
			const res = laplaceTransformBigIntIterative(() => 123n * SCALE, SCALE, {
				upperBound: 0n,
			})
			assert.equal(res, 0n)
		})

		test('finite upperBound with s === 0n computes definite integral', () => {
			// integral_0^3 t^2 dt = 9
			const res = laplaceTransformBigIntIterative(
				(t) => mulFixed(t, t),
				0n,
				{ upperBound: 3n * SCALE, steps: 400n }
			)
			assertCloseBigInt(res, 9n * SCALE, 10n ** 4n, 'integral_0^3 t^2 dt')
		})

		test('finite upperBound with s > 0n matches truncated analytical formula', () => {
			// integral_0^2 1 * exp(-1 * t) dt = 1 - exp(-2)
			const res = laplaceTransformBigIntIterative(() => SCALE, SCALE, {
				upperBound: 2n * SCALE,
				steps: 400n,
			})
			const expected = toFixed(1 - Math.exp(-2))
			assertCloseBigInt(res, expected, 10n ** 6n, 'truncated integral')
		})

		test('large s scales upperBound automatically', () => {
			// L{1}(1000) = 0.001
			const res = laplaceTransformBigIntIterative(() => SCALE, 1000n * SCALE)
			assertCloseBigInt(res, 10n ** 15n, 10n ** 4n, 'L{1}(1000)')

			// Extremely large s = 10^20 (10^38 scaled): L{1}(10^20) = 10^-20 -> rounds to 0n
			const tiny = laplaceTransformBigIntIterative(() => SCALE, 10n ** 38n)
			assert.equal(tiny, 0n)
		})

		test('Heaviside step function u(t - 1): L{u(t-1)}(2) = e^-2 / 2', () => {
			const res = laplaceTransformBigIntIterative(
				(t) => (t >= SCALE ? SCALE : 0n),
				2n * SCALE,
				{ upperBound: 25n * SCALE, steps: 4000n }
			)
			const expected = toFixed(Math.exp(-2) / 2)
			// Jump discontinuity has O(h) local quadrature error (~6e-3 / 2)
			assertCloseBigInt(res, expected, 10n ** 15n, 'Heaviside step')
		})

		test('explicit methods: boole, simpson, trapezoidal, and auto selection', () => {
			const fn = (t) => t
			const s = 2n * SCALE
			const expected = 25n * 10n ** 16n // 0.25

			const boole = laplaceTransformBigIntIterative(fn, s, {
				method: 'boole',
				steps: 1000n,
			})
			const simpson = laplaceTransformBigIntIterative(fn, s, {
				method: 'simpson',
				steps: 1002n,
			})
			const trap = laplaceTransformBigIntIterative(fn, s, {
				method: 'trapezoidal',
				steps: 1001n,
			})
			const autoSimpson = laplaceTransformBigIntIterative(fn, s, {
				method: 'auto',
				steps: 1002n,
			})
			const autoTrap = laplaceTransformBigIntIterative(fn, s, {
				method: 'auto',
				steps: 1001n,
			})

			assertCloseBigInt(boole, expected, 10n ** 8n, 'boole')
			assertCloseBigInt(simpson, expected, 10n ** 11n, 'simpson')
			assertCloseBigInt(trap, expected, 10n ** 14n, 'trapezoidal')
			assert.equal(autoSimpson, simpson)
			assert.equal(autoTrap, trap)

			// Verify convergence order: Boole O(h^6) < Simpson O(h^4) < Trapezoidal O(h^2)
			const absDiff = (a, b) => (a >= b ? a - b : b - a)
			assert.ok(absDiff(boole, expected) < absDiff(simpson, expected))
			assert.ok(absDiff(simpson, expected) < absDiff(trap, expected))
		})

		test('minimal step counts: steps = 1n, 2n, 4n', () => {
			// Constant function with s = 0 on [0, 4] is exact for any step count >= 1
			assert.equal(
				laplaceTransformBigIntIterative(() => SCALE, 0n, {
					upperBound: 4n * SCALE,
					steps: 1n,
				}),
				4n * SCALE
			)
			assert.equal(
				laplaceTransformBigIntIterative(() => SCALE, 0n, {
					upperBound: 4n * SCALE,
					steps: 2n,
				}),
				4n * SCALE
			)
			assert.equal(
				laplaceTransformBigIntIterative(() => SCALE, 0n, {
					upperBound: 4n * SCALE,
					steps: 4n,
				}),
				4n * SCALE
			)
		})
	})

	describe('input validation', () => {
		test('rejects invalid fn', () => {
			for (const bad of [null, undefined, 42, 'fn', {}, []]) {
				assert.throws(
					() => laplaceTransformBigIntIterative(bad, SCALE),
					TypeError
				)
			}
		})

		test('rejects fn returning non-BigInt', () => {
			for (const badRet of [1, 0, null, undefined, '1', {}]) {
				assert.throws(
					() =>
						laplaceTransformBigIntIterative(() => badRet, SCALE, {
							steps: 4n,
						}),
					TypeError
				)
			}
		})

		test('rejects invalid s type or range', () => {
			for (const badS of [1, 0, '1', null, undefined, NaN, {}]) {
				assert.throws(
					() => laplaceTransformBigIntIterative(() => SCALE, badS),
					TypeError
				)
			}
			assert.throws(
				() => laplaceTransformBigIntIterative(() => SCALE, -1n),
				RangeError
			)
			assert.throws(
				() => laplaceTransformBigIntIterative(() => SCALE, 0n),
				RangeError
			)
		})

		test('rejects invalid options container', () => {
			for (const badOpts of [null, [], 123, 'opts', true]) {
				assert.throws(
					() => laplaceTransformBigIntIterative(() => SCALE, SCALE, badOpts),
					TypeError
				)
			}
		})

		test('rejects invalid options.upperBound', () => {
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, {
						upperBound: 10,
					}),
				TypeError
			)
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, {
						upperBound: -1n,
					}),
				RangeError
			)
		})

		test('rejects invalid options.steps', () => {
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, { steps: 100 }),
				TypeError
			)
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, { steps: 0n }),
				RangeError
			)
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, { steps: -4n }),
				RangeError
			)
		})

		test('rejects invalid options.method and step mismatches', () => {
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, { method: 123 }),
				TypeError
			)
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, {
						method: 'gauss',
					}),
				RangeError
			)
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, {
						method: 'simpson',
						steps: 3n,
					}),
				RangeError
			)
			assert.throws(
				() =>
					laplaceTransformBigIntIterative(() => SCALE, SCALE, {
						method: 'boole',
						steps: 6n,
					}),
				RangeError
			)
		})
	})
})
