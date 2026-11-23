import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { divideDualRecursive } from './divideDualRecursive.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= Math.max(absTol, relTol * scale),
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${relTol} (rel) / ${absTol} (abs) of ${expected} (diff=${diff})`,
	)
}

function mulDual(a, b) {
	return { v: a.v * b.v, d: a.d * b.v + a.v * b.d }
}

describe('divideDualRecursive', () => {
	describe('normal cases', () => {
		it('divides dual numbers with power-of-2 denominator exactly', () => {
			// (10 + 2ε) / (2 + 1ε) = 5 + ((2*2 - 10*1) / 4)ε = 5 - 1.5ε
			const res = divideDualRecursive({ v: 10, d: 2 }, { v: 2, d: 1 })
			assert.deepStrictEqual(res, { v: 5, d: -1.5 })
		})

		it('divides dual numbers with non-power-of-2 denominator', () => {
			// (6 + 5ε) / (3 + 2ε) = 2 + ((5*3 - 6*2) / 9)ε = 2 + (1/3)ε
			const res = divideDualRecursive({ v: 6, d: 5 }, { v: 3, d: 2 })
			assertClose(res.v, 2, 1e-15, 1e-15, 'v')
			assertClose(res.d, 1 / 3, 1e-15, 1e-15, 'd')
		})

		it('handles negative numerators and negative denominators', () => {
			// (-12 + 4ε) / (-3 - 2ε) = 4 + ((4*(-3) - (-12)*(-2)) / 9)ε = 4 + (-36/9)ε = 4 - 4ε
			const res = divideDualRecursive({ v: -12, d: 4 }, { v: -3, d: -2 })
			assertClose(res.v, 4, 1e-15, 1e-15, 'v')
			assertClose(res.d, -4, 1e-15, 1e-15, 'd')

			// (7 - 5ε) / (-11 + 3ε)
			const res2 = divideDualRecursive({ v: 7, d: -5 }, { v: -11, d: 3 })
			assertClose(res2.v, -7 / 11, 1e-15, 1e-15, 'v')
			assertClose(res2.d, ((-5) * (-11) - 7 * 3) / 121, 1e-15, 1e-15, 'd')
		})

		it('handles zero derivatives (pure scalar division)', () => {
			const res = divideDualRecursive({ v: 35, d: 0 }, { v: 7, d: 0 })
			assert.deepStrictEqual(res, { v: 5, d: 0 })
		})

		it('handles zero numerator with non-zero derivative', () => {
			// (0 + 9ε) / (3 + 100ε) = 0 + 3ε
			const res = divideDualRecursive({ v: 0, d: 9 }, { v: 3, d: 100 })
			assertClose(res.v, 0, 1e-15, 1e-15, 'v')
			assertClose(res.d, 3, 1e-15, 1e-15, 'd')
		})

		it('satisfies self-division u / u = (1, 0) including tricky float denominators', () => {
			for (const val of [1, -1, 3, 7, 49, 0.3, Math.PI, -1e-7, 1e7]) {
				const u = { v: val, d: val * 0.37 - 1.25 }
				const res = divideDualRecursive(u, u)
				assertClose(res.v, 1, 1e-15, 1e-15, `u/u v for ${val}`)
				assertClose(res.d, 0, 1e-14, 1e-14, `u/u d for ${val}`)
			}
		})

		it('supports multi-operand divide-and-conquer reduction', () => {
			const u = { v: 24, d: 5 }
			const w1 = { v: 2, d: 1 }
			const w2 = { v: 3, d: -0.5 }
			const w3 = { v: 4, d: 0.25 }

			const multi = divideDualRecursive(u, w1, w2, w3)
			const chained = divideDualRecursive(
				divideDualRecursive(divideDualRecursive(u, w1), w2),
				w3,
			)
			assertClose(multi.v, chained.v, 1e-14, 1e-14, 'multi v')
			assertClose(multi.d, chained.d, 1e-14, 1e-14, 'multi d')
		})
	})

	describe('edge cases', () => {
		it('avoids intermediate w.v² overflow for very large operands', () => {
			// Naive (u.d*w.v - u.v*w.d)/(w.v*w.v) would overflow w.v*w.v to Infinity.
			const u = { v: 6e200, d: 5e200 }
			const w = { v: 3e200, d: 2e200 }
			const res = divideDualRecursive(u, w)
			assertClose(res.v, 2, 1e-14, 1e-14, 'large v')
			assertClose(res.d, 1 / 3, 1e-14, 1e-14, 'large d')
		})

		it('avoids intermediate w.v² underflow for very small and subnormal operands', () => {
			// Naive w.v*w.v would underflow to 0.
			const u = { v: 6e-200, d: 5e-200 }
			const w = { v: 3e-200, d: 2e-200 }
			const res = divideDualRecursive(u, w)
			assertClose(res.v, 2, 1e-14, 1e-14, 'small v')
			assertClose(res.d, 1 / 3, 1e-14, 1e-14, 'small d')

			// Subnormal denominator (exact binary subnormals to avoid input quantization error)
			const sub = 2 ** -1050
			const uSub = { v: 6 * sub, d: 2 * sub }
			const wSub = { v: 3 * sub, d: 1 * sub }
			const resSub = divideDualRecursive(uSub, wSub)
			assertClose(resSub.v, 2, 1e-14, 1e-14, 'subnormal v')
			assertClose(resSub.d, 0, 1e-14, 1e-14, 'subnormal d')
		})

		it('handles extreme mixed scales where w.d / w.v overflows but result is finite', () => {
			// u.v = 1e-300, u.d = 0, w.v = 1e-10, w.d = 1e305
			// v = 1e-290, d = -(1e-300 * 1e305) / 1e-20 = -1e25
			const res = divideDualRecursive({ v: 1e-300, d: 0 }, { v: 1e-10, d: 1e305 })
			assertClose(res.v, 1e-290, 1e-14, 1e-304, 'mixed scale v')
			assertClose(res.d, -1e25, 1e-14, 1e11, 'mixed scale d')
		})

		it('falls back safely in multi-operand division when divisor product underflows', () => {
			const res = divideDualRecursive(
				{ v: 2e-200, d: 0 },
				{ v: 1e-200, d: 0 },
				{ v: 1e-200, d: 0 },
			)
			assertClose(res.v, 2e200, 1e-14, 1e186, 'underflow fallback v')
			assert.strictEqual(res.d, 0)
		})

		it('normalizes -0 to +0 in output fields', () => {
			const res = divideDualRecursive({ v: 0, d: 0 }, { v: -5, d: 3 })
			assert.ok(Object.is(res.v, 0), `expected +0 for v, got ${res.v}`)
			assert.ok(Object.is(res.d, 0), `expected +0 for d, got ${res.d}`)
		})

		it('does not mutate input dual objects', () => {
			const u = Object.freeze({ v: 9, d: 4 })
			const w = Object.freeze({ v: 3, d: 1 })
			const res = divideDualRecursive(u, w)
			assertClose(res.v, 3, 1e-15, 1e-15)
			assertClose(res.d, 1 / 3, 1e-15, 1e-15)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when fewer than two arguments are provided', () => {
			assert.throws(() => divideDualRecursive(), TypeError)
			assert.throws(() => divideDualRecursive({ v: 1, d: 0 }), TypeError)
		})

		it('throws TypeError for non-object, null, array, or malformed operands', () => {
			const valid = { v: 2, d: 1 }
			for (const bad of [null, undefined, 42, '2', true, [1, 2], {}, { v: 1 }, { d: 1 }, { v: '1', d: 0 }]) {
				assert.throws(() => divideDualRecursive(bad, valid), TypeError)
				assert.throws(() => divideDualRecursive(valid, bad), TypeError)
			}
		})

		it('throws RangeError for NaN or Infinite components', () => {
			const valid = { v: 2, d: 1 }
			for (const bad of [
				{ v: NaN, d: 0 },
				{ v: 1, d: NaN },
				{ v: Infinity, d: 0 },
				{ v: -Infinity, d: 0 },
				{ v: 1, d: Infinity },
				{ v: 1, d: -Infinity },
			]) {
				assert.throws(() => divideDualRecursive(bad, valid), RangeError)
				assert.throws(() => divideDualRecursive(valid, bad), RangeError)
			}
		})

		it('throws RangeError on division by zero (including -0 and multi-operand)', () => {
			const u = { v: 5, d: 1 }
			assert.throws(() => divideDualRecursive(u, { v: 0, d: 0 }), RangeError)
			assert.throws(() => divideDualRecursive(u, { v: 0, d: 1 }), RangeError)
			assert.throws(() => divideDualRecursive(u, { v: -0, d: 2 }), RangeError)
			assert.throws(
				() => divideDualRecursive(u, { v: 2, d: 1 }, { v: 0, d: 3 }),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies the multiply-back identity (u / w) * w === u across a test grid', () => {
			const pairs = [
				[{ v: 1, d: 0 }, { v: 3, d: 1 }],
				[{ v: -7.5, d: 2.25 }, { v: 4.125, d: -1.75 }],
				[{ v: Math.PI, d: Math.E }, { v: -Math.SQRT2, d: 0.5772156649 }],
				[{ v: 0, d: -13.7 }, { v: 19.3, d: 8.1 }],
				[{ v: 123456.789, d: -98765.432 }, { v: 0.0012345, d: 0.006789 }],
			]

			for (const [u, w] of pairs) {
				const q = divideDualRecursive(u, w)
				const reconstructed = mulDual(q, w)
				assertClose(reconstructed.v, u.v, 1e-13, 1e-13, 'reconstructed v')
				assertClose(reconstructed.d, u.d, 1e-13, 1e-13, 'reconstructed d')
			}
		})

		it('matches central finite-difference and analytic derivatives for rational and transcendental quotients', () => {
			const eps = 1e-6

			// Test 1: f(x) = (x^2 + 3x - 1) / (2x + 5)
			const f1 = (x) => (x * x + 3 * x - 1) / (2 * x + 5)
			for (const x of [-4, -1.25, 0, 1.5, 7.3]) {
				const num = { v: x * x + 3 * x - 1, d: 2 * x + 3 }
				const den = { v: 2 * x + 5, d: 2 }
				const dual = divideDualRecursive(num, den)
				const fd = (f1(x + eps) - f1(x - eps)) / (2 * eps)
				const analyticD = (2 * x * x + 10 * x + 17) / ((2 * x + 5) ** 2)

				assertClose(dual.v, f1(x), 1e-14, 1e-14, `f1(${x}) value`)
				assertClose(dual.d, analyticD, 1e-14, 1e-14, `f1(${x}) analytic derivative`)
				assertClose(dual.d, fd, 1e-8, 1e-8, `f1(${x}) finite-difference derivative`)
			}

			// Test 2: f(x) = (sin(x) + 1) / (cos(x) + 2)
			const f2 = (x) => (Math.sin(x) + 1) / (Math.cos(x) + 2)
			for (const x of [-2.1, -0.5, 0, 0.9, 2.7]) {
				const num = { v: Math.sin(x) + 1, d: Math.cos(x) }
				const den = { v: Math.cos(x) + 2, d: -Math.sin(x) }
				const dual = divideDualRecursive(num, den)
				const fd = (f2(x + eps) - f2(x - eps)) / (2 * eps)

				assertClose(dual.v, f2(x), 1e-14, 1e-14, `f2(${x}) value`)
				assertClose(dual.d, fd, 1e-8, 1e-8, `f2(${x}) finite-difference derivative`)
			}
		})

		it('matches central finite-difference derivative for multi-operand division', () => {
			// f(x) = (x^2 + 1) / ((x + 2) * (2x + 3) * (x + 5) * (3x + 1))
			const f = (x) => (x * x + 1) / ((x + 2) * (2 * x + 3) * (x + 5) * (3 * x + 1))
			const eps = 1e-6

			for (const x of [0.25, 1.5, 3.0]) {
				const dual = divideDualRecursive(
					{ v: x * x + 1, d: 2 * x },
					{ v: x + 2, d: 1 },
					{ v: 2 * x + 3, d: 2 },
					{ v: x + 5, d: 1 },
					{ v: 3 * x + 1, d: 3 },
				)
				const fd = (f(x + eps) - f(x - eps)) / (2 * eps)
				assertClose(dual.v, f(x), 1e-14, 1e-14, `multi f(${x}) value`)
				assertClose(dual.d, fd, 1e-7, 1e-10, `multi f(${x}) finite-difference derivative`)
			}
		})
	})
})
