import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootComplexIterative } from './nthRootComplexIterative.js'

/**
 * Naive iterative complex power w^n (for independent cross-checking).
 */
function naiveComplexPow(w, n) {
	let re = 1
	let im = 0
	for (let i = 0; i < n; i++) {
		const nextRe = re * w.re - im * w.im
		const nextIm = re * w.im + im * w.re
		re = nextRe
		im = nextIm
	}
	return { re, im }
}

/**
 * Independent De Moivre polar reference for the principal n-th root.
 */
function deMoivrePrincipalRoot(z, n) {
	const re = z.re === 0 ? 0 : z.re
	const im = z.im === 0 ? 0 : z.im
	if (re === 0 && im === 0) return { re: 0, im: 0 }
	const r = Math.hypot(re, im)
	const theta = Math.atan2(im, re)
	const rn = Math.exp(Math.log(r) / n)
	return {
		re: rn * Math.cos(theta / n),
		im: rn * Math.sin(theta / n),
	}
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.hypot(actual.re - expected.re, actual.im - expected.im)
	const scale = Math.max(1, Math.hypot(expected.re, expected.im))
	assert.ok(
		diff <= tol * scale,
		`${label} expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), diff=${diff}, allowed=${tol * scale}`
	)
}

describe('nthRootComplexIterative', () => {
	describe('normal cases', () => {
		test('positive real numbers', () => {
			assertComplexClose(nthRootComplexIterative({ re: 9, im: 0 }, 2), { re: 3, im: 0 }, 1e-15)
			assertComplexClose(nthRootComplexIterative({ re: 27, im: 0 }, 3), { re: 3, im: 0 }, 1e-15)
			assertComplexClose(nthRootComplexIterative({ re: 16, im: 0 }, 4), { re: 2, im: 0 }, 1e-15)
			assertComplexClose(nthRootComplexIterative({ re: 32, im: 0 }, 5), { re: 2, im: 0 }, 1e-15)
		})

		test('pure imaginary numbers', () => {
			const s2 = Math.SQRT1_2
			assertComplexClose(nthRootComplexIterative({ re: 0, im: 1 }, 2), { re: s2, im: s2 }, 1e-15)
			assertComplexClose(nthRootComplexIterative({ re: 0, im: -1 }, 2), { re: s2, im: -s2 }, 1e-15)
			// (sqrt(3)/2 + i/2)^3 = i
			assertComplexClose(
				nthRootComplexIterative({ re: 0, im: 1 }, 3),
				{ re: Math.sqrt(3) / 2, im: 0.5 },
				1e-15
			)
		})

		test('exact algebraic complex roots in the principal sector', () => {
			// (2 + i)^2 = 3 + 4i, Arg(2 + i) < pi/2
			assertComplexClose(nthRootComplexIterative({ re: 3, im: 4 }, 2), { re: 2, im: 1 }, 1e-15)
			// (2 - i)^2 = 3 - 4i, Arg(2 - i) in (-pi/2, 0)
			assertComplexClose(nthRootComplexIterative({ re: 3, im: -4 }, 2), { re: 2, im: -1 }, 1e-15)
			// (1 + 2i)^2 = -3 + 4i, Arg(1 + 2i) in (0, pi/2)
			assertComplexClose(nthRootComplexIterative({ re: -3, im: 4 }, 2), { re: 1, im: 2 }, 1e-15)
			// (1 - 2i)^2 = -3 - 4i, Arg(1 - 2i) in (-pi/2, 0)
			assertComplexClose(nthRootComplexIterative({ re: -3, im: -4 }, 2), { re: 1, im: -2 }, 1e-15)
			// (2 + i)^3 = 2 + 11i, Arg(2 + i) ≈ 0.4636 < pi/3
			assertComplexClose(nthRootComplexIterative({ re: 2, im: 11 }, 3), { re: 2, im: 1 }, 1e-15)
			// (3 + i)^4 = 28 + 96i, Arg(3 + i) ≈ 0.3218 < pi/4
			assertComplexClose(nthRootComplexIterative({ re: 28, im: 96 }, 4), { re: 3, im: 1 }, 1e-14)
		})

		test('supports optional maxIterations and tolerance', () => {
			const res = nthRootComplexIterative({ re: 3, im: 4 }, 2, {
				maxIterations: 20,
				tolerance: 1e-14,
			})
			assertComplexClose(res, { re: 2, im: 1 }, 1e-14)
		})

		test('does not mutate input object', () => {
			const z = { re: -3, im: 4 }
			const copy = { ...z }
			nthRootComplexIterative(z, 3)
			assert.deepStrictEqual(z, copy)
		})
	})

	describe('edge cases', () => {
		test('n = 1 returns a new equal complex number with -0 normalized', () => {
			const z = { re: -5.25, im: 7.5 }
			const res = nthRootComplexIterative(z, 1)
			assert.deepStrictEqual(res, { re: -5.25, im: 7.5 })
			assert.notStrictEqual(res, z)

			const negZero = nthRootComplexIterative({ re: -0, im: -0 }, 1)
			assert.ok(Object.is(negZero.re, 0))
			assert.ok(Object.is(negZero.im, 0))
		})

		test('z = 0 (including -0 components) returns { re: 0, im: 0 }', () => {
			for (const n of [1, 2, 3, 7, 100]) {
				const res = nthRootComplexIterative({ re: 0, im: 0 }, n)
				assert.deepStrictEqual(res, { re: 0, im: 0 })
				assert.ok(Object.is(res.re, 0))
				assert.ok(Object.is(res.im, 0))
			}
			const negZeroRes = nthRootComplexIterative({ re: -0, im: -0 }, 4)
			assert.ok(Object.is(negZeroRes.re, 0))
			assert.ok(Object.is(negZeroRes.im, 0))
		})

		test('negative real numbers follow the principal branch Arg(-x) = +pi', () => {
			// sqrt(-1) = i (Newton refinement cleans cos(pi/2) to exact 0)
			const sqrtNeg1 = nthRootComplexIterative({ re: -1, im: 0 }, 2)
			assertComplexClose(sqrtNeg1, { re: 0, im: 1 }, 1e-15)
			assert.equal(sqrtNeg1.re, 0)
			assert.equal(sqrtNeg1.im, 1)

			// {-1, -0} must still take the principal branch +pi, giving +i
			const sqrtNeg1NegZero = nthRootComplexIterative({ re: -1, im: -0 }, 2)
			assertComplexClose(sqrtNeg1NegZero, { re: 0, im: 1 }, 1e-15)

			// Principal cube root of -8 is 2*e^(i*pi/3) = 1 + i*sqrt(3)
			assertComplexClose(
				nthRootComplexIterative({ re: -8, im: 0 }, 3),
				{ re: 1, im: Math.sqrt(3) },
				1e-15
			)

			// Principal 4th root of -16 is 2*e^(i*pi/4) = sqrt(2) + i*sqrt(2)
			assertComplexClose(
				nthRootComplexIterative({ re: -16, im: 0 }, 4),
				{ re: Math.SQRT2, im: Math.SQRT2 },
				1e-15
			)
		})

		test('roots of unity and generating all n roots', () => {
			// Principal n-th root of 1 is always 1
			for (const n of [1, 2, 3, 5, 8, 12]) {
				assertComplexClose(nthRootComplexIterative({ re: 1, im: 0 }, n), { re: 1, im: 0 }, 1e-15)
			}

			// Principal n-th root of -1 is e^(i*pi/n)
			for (const n of [2, 3, 4, 5, 6, 7]) {
				const w = nthRootComplexIterative({ re: -1, im: 0 }, n)
				assertComplexClose(w, { re: Math.cos(Math.PI / n), im: Math.sin(Math.PI / n) }, 1e-14)
				// Rotating by all n-th roots of unity yields n roots each satisfying r^n = -1
				for (let k = 0; k < n; k++) {
					const angle = (2 * Math.PI * k) / n
					const c = Math.cos(angle)
					const s = Math.sin(angle)
					const rootK = {
						re: w.re * c - w.im * s,
						im: w.re * s + w.im * c,
					}
					assertComplexClose(naiveComplexPow(rootK, n), { re: -1, im: 0 }, 1e-12)
				}
			}
		})

		test('extreme magnitudes and higher degrees', () => {
			const large = nthRootComplexIterative({ re: 1e200, im: 0 }, 4)
			assertComplexClose(large, { re: 1e50, im: 0 }, 1e-14)

			const small = nthRootComplexIterative({ re: 0, im: 1e-200 }, 2)
			const s2 = Math.SQRT1_2 * 1e-100
			assertComplexClose(small, { re: s2, im: s2 }, 1e-14)

			// Magnitude where hypot(re, im) overflows MAX_VALUE (1.5e308 * sqrt(2) > 1.797e308)
			const nearOverflow = nthRootComplexIterative({ re: 1.5e308, im: 1.5e308 }, 2)
			assert.ok(Number.isFinite(nearOverflow.re) && Number.isFinite(nearOverflow.im))
			assert.ok(nearOverflow.re > 0 && nearOverflow.im > 0)

			// Higher degree n = 1000
			const z = { re: -2.5, im: 3.7 }
			const w1000 = nthRootComplexIterative(z, 1000)
			assertComplexClose(w1000, deMoivrePrincipalRoot(z, 1000), 1e-12)
		})
	})

	describe('invalid input validation', () => {
		test('rejects invalid z objects and non-numeric components with TypeError', () => {
			for (const badZ of [null, undefined, 42, '1+i', [1, 2], true]) {
				assert.throws(() => nthRootComplexIterative(badZ, 2), TypeError)
			}
			for (const badZ of [
				{ re: '1', im: 0 },
				{ re: 1, im: '0' },
				{ re: 1 },
				{ im: 1 },
				{ re: null, im: 0 },
				{ re: 1n, im: 0 },
			]) {
				assert.throws(() => nthRootComplexIterative(badZ, 2), TypeError)
			}
		})

		test('rejects non-finite z.re or z.im with RangeError', () => {
			for (const badZ of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
				{ re: -Infinity, im: Infinity },
			]) {
				assert.throws(() => nthRootComplexIterative(badZ, 2), RangeError)
			}
		})

		test('rejects invalid n types and out-of-range / non-integer values', () => {
			for (const badN of [null, undefined, '2', {}, [], 2n]) {
				assert.throws(() => nthRootComplexIterative({ re: 1, im: 0 }, badN), TypeError)
			}
			for (const badN of [
				0,
				-1,
				-10,
				0.5,
				1.5,
				-2.5,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(() => nthRootComplexIterative({ re: 1, im: 0 }, badN), RangeError)
			}
		})

		test('rejects invalid options', () => {
			for (const badOpt of [null, 5, 'opts', []]) {
				assert.throws(() => nthRootComplexIterative({ re: 1, im: 0 }, 2, badOpt), TypeError)
			}
			assert.throws(
				() => nthRootComplexIterative({ re: 1, im: 0 }, 2, { maxIterations: '10' }),
				TypeError
			)
			assert.throws(
				() => nthRootComplexIterative({ re: 1, im: 0 }, 2, { maxIterations: 0 }),
				RangeError
			)
			assert.throws(
				() => nthRootComplexIterative({ re: 1, im: 0 }, 2, { maxIterations: 1.5 }),
				RangeError
			)
			assert.throws(
				() => nthRootComplexIterative({ re: 1, im: 0 }, 2, { tolerance: '1e-12' }),
				TypeError
			)
			assert.throws(
				() => nthRootComplexIterative({ re: 1, im: 0 }, 2, { tolerance: 0 }),
				RangeError
			)
			assert.throws(
				() => nthRootComplexIterative({ re: 1, im: 0 }, 2, { tolerance: -1e-10 }),
				RangeError
			)
			assert.throws(
				() => nthRootComplexIterative({ re: 1, im: 0 }, 2, { tolerance: NaN }),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		const sampleComplexNumbers = [
			{ re: 1, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 1 },
			{ re: 0, im: -1 },
			{ re: 3, im: 4 },
			{ re: -5, im: 12 },
			{ re: -7, im: -24 },
			{ re: 8, im: -15 },
			{ re: 0.123, im: -0.456 },
			{ re: -123.45, im: 67.89 },
		]

		test('w^n === z via naive complex multiplication and matches De Moivre polar formula', () => {
			for (const z of sampleComplexNumbers) {
				for (let n = 1; n <= 12; n++) {
					const w = nthRootComplexIterative(z, n)

					// Cross-check 1: w^n reproduces z
					const reconstructed = naiveComplexPow(w, n)
					assertComplexClose(reconstructed, z, 1e-11, `w^${n} for (${z.re}, ${z.im})`)

					// Cross-check 2: matches independent De Moivre polar formula
					const expectedPolar = deMoivrePrincipalRoot(z, n)
					assertComplexClose(w, expectedPolar, 1e-13, `De Moivre n=${n} for (${z.re}, ${z.im})`)

					// Cross-check 3: principal argument is in (-pi/n, pi/n]
					const argW = Math.atan2(w.im, w.re)
					const limit = Math.PI / n + 1e-14
					assert.ok(argW >= -limit && argW <= limit, `Arg(w)=${argW} outside (-pi/${n}, pi/${n}]`)
				}
			}
		})

		test('nested principal root identity: nthRoot(nthRoot(z, m), k) === nthRoot(z, m * k)', () => {
			const pairs = [
				[2, 3],
				[3, 2],
				[2, 4],
				[3, 5],
			]
			for (const z of sampleComplexNumbers) {
				for (const [m, k] of pairs) {
					const nested = nthRootComplexIterative(nthRootComplexIterative(z, m), k)
					const direct = nthRootComplexIterative(z, m * k)
					assertComplexClose(nested, direct, 1e-13, `nested (${m},${k}) for (${z.re}, ${z.im})`)
				}
			}
		})
	})
})
