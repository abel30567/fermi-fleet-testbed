import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialComplexRecursive } from './factorialComplexRecursive.js'

/**
 * Helper: assert two complex numbers match within a relative + absolute tolerance.
 */
function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-13, label = '') {
	assert.equal(typeof actual.re, 'number', `${label} re should be a number`)
	assert.equal(typeof actual.im, 'number', `${label} im should be a number`)
	assert.ok(!Object.is(actual.re, -0), `${label} re must not be -0`)
	assert.ok(!Object.is(actual.im, -0), `${label} im must not be -0`)
	const diff = Math.hypot(actual.re - expected.re, actual.im - expected.im)
	const scale = Math.hypot(expected.re, expected.im)
	const bound = Math.max(absTol, relTol * scale)
	assert.ok(
		diff <= bound,
		`${label} mismatch: got (${actual.re}, ${actual.im}), expected (${expected.re}, ${expected.im}), diff=${diff}, bound=${bound}`,
	)
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function cDiv(a, b) {
	const r = Math.hypot(b.re, b.im)
	const br = b.re / r
	const bi = b.im / r
	return { re: (a.re * br + a.im * bi) / r, im: (a.im * br - a.re * bi) / r }
}

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function cExp(z) {
	const e = Math.exp(z.re)
	return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) }
}

function cLog(z) {
	return { re: Math.log(Math.hypot(z.re, z.im)), im: Math.atan2(z.im, z.re) }
}

function cSin(z) {
	return {
		re: Math.sin(z.re) * Math.cosh(z.im),
		im: Math.cos(z.re) * Math.sinh(z.im),
	}
}

/**
 * Independent reference implementation of complex factorial z! = Gamma(z + 1)
 * using iterative upward recurrence shifting to Re(w) >= 12 followed by
 * Stirling's asymptotic series with Bernoulli numbers B_2..B_16 (and iterative
 * Euler reflection for Re(w) < 0.5). Completely independent of Lanczos & binary splitting.
 */
function stirlingBernoulliFactorial(z) {
	// Bernoulli numbers B_{2k} / (2k * (2k - 1)) for k = 1..8
	const STIRLING_COEFFS = [
		1 / 12,
		-1 / 360,
		1 / 1260,
		-1 / 1680,
		1 / 1188,
		-691 / 360360,
		1 / 156,
		-3617 / 122400,
	]

	function gammaStirlingRight(w) {
		let curr = { re: w.re, im: w.im }
		let shiftProd = { re: 1, im: 0 }
		while (curr.re < 12) {
			shiftProd = cMul(shiftProd, curr)
			curr = { re: curr.re + 1, im: curr.im }
		}

		const invW = cDiv({ re: 1, im: 0 }, curr)
		const invW2 = cMul(invW, invW)
		let series = { re: 0, im: 0 }
		let power = invW
		for (const coeff of STIRLING_COEFFS) {
			series = cAdd(series, { re: coeff * power.re, im: coeff * power.im })
			power = cMul(power, invW2)
		}

		const logW = cLog(curr)
		const logGammaShifted = cAdd(
			cSub(
				cAdd(
					{ re: 0.5 * Math.log(2 * Math.PI), im: 0 },
					cMul({ re: curr.re - 0.5, im: curr.im }, logW),
				),
				curr,
			),
			series,
		)

		return cDiv(cExp(logGammaShifted), shiftProd)
	}

	const w = { re: z.re + 1, im: z.im }
	if (w.re < 0.5) {
		const reflected = gammaStirlingRight({ re: 1 - w.re, im: -w.im })
		const sinPiW = cSin({ re: Math.PI * w.re, im: Math.PI * w.im })
		return cDiv({ re: Math.PI, im: 0 }, cMul(sinPiW, reflected))
	}
	return gammaStirlingRight(w)
}

describe('factorialComplexRecursive', () => {
	describe('non-negative integer factorials (divide-and-conquer binary splitting)', () => {
		it('computes small exact integer factorials', () => {
			assert.deepEqual(factorialComplexRecursive({ re: 0, im: 0 }), { re: 1, im: 0 })
			assert.deepEqual(factorialComplexRecursive({ re: 1, im: 0 }), { re: 1, im: 0 })
			assert.deepEqual(factorialComplexRecursive({ re: 2, im: 0 }), { re: 2, im: 0 })
			assert.deepEqual(factorialComplexRecursive({ re: 3, im: 0 }), { re: 6, im: 0 })
			assert.deepEqual(factorialComplexRecursive({ re: 5, im: 0 }), { re: 120, im: 0 })
			assert.deepEqual(factorialComplexRecursive({ re: 10, im: 0 }), { re: 3628800, im: 0 })
			assert.deepEqual(factorialComplexRecursive({ re: 15, im: 0 }), {
				re: 1307674368000,
				im: 0,
			})
			assert.deepEqual(factorialComplexRecursive({ re: 20, im: 0 }), {
				re: 2432902008176640000,
				im: 0,
			})
		})

		it('cross-checks binary splitting against iterative integer factorial for n = 0..170', () => {
			let iterFact = 1
			for (let n = 0; n <= 170; n++) {
				if (n >= 2) iterFact *= n
				const res = factorialComplexRecursive({ re: n, im: 0 })
				assert.equal(res.im, 0)
				assertComplexClose(res, { re: iterFact, im: 0 }, 1e-14, 0, `${n}!`)
			}
		})
	})

	describe('real non-integer factorials (exact analytical values)', () => {
		it('computes half-integer factorials accurately with exact im = 0', () => {
			const sqrtPi = Math.sqrt(Math.PI)
			const cases = [
				{ re: -0.5, expected: sqrtPi },
				{ re: 0.5, expected: 0.5 * sqrtPi },
				{ re: 1.5, expected: 0.75 * sqrtPi },
				{ re: 2.5, expected: (15 / 8) * sqrtPi },
				{ re: -1.5, expected: -2 * sqrtPi },
				{ re: -2.5, expected: (4 / 3) * sqrtPi },
				{ re: -3.5, expected: -(8 / 15) * sqrtPi },
			]

			for (const { re, expected } of cases) {
				const res = factorialComplexRecursive({ re, im: 0 })
				assert.equal(res.im, 0, `(${re})! should have exact zero imaginary part`)
				assertComplexClose(res, { re: expected, im: 0 }, 1e-14, 1e-14, `(${re})!`)
			}
		})
	})

	describe('known complex values and vertical-line identities', () => {
		it('matches known reference values for i! and (1 + i)!', () => {
			// Gamma(1 + i) = i! = 0.49801566811835604 - 0.15494982830181068i
			const iFactExpected = { re: 0.49801566811835604, im: -0.15494982830181068 }
			assertComplexClose(
				factorialComplexRecursive({ re: 0, im: 1 }),
				iFactExpected,
				1e-14,
				1e-14,
				'i!',
			)

			// (1 + i)! = (1 + i) * i!
			const onePlusIFact = cMul({ re: 1, im: 1 }, iFactExpected)
			assertComplexClose(
				factorialComplexRecursive({ re: 1, im: 1 }),
				onePlusIFact,
				1e-14,
				1e-14,
				'(1 + i)!',
			)
		})

		it('satisfies exact modulus identities |(iy)!|^2 = pi*y / sinh(pi*y) and |(-1/2 + iy)!|^2 = pi / cosh(pi*y)', () => {
			for (const y of [0.25, 0.5, 1, 2, 5, 10, -1, -3.5]) {
				const fIy = factorialComplexRecursive({ re: 0, im: y })
				const modSq1 = fIy.re * fIy.re + fIy.im * fIy.im
				const expected1 = (Math.PI * y) / Math.sinh(Math.PI * y)
				assert.ok(
					Math.abs(modSq1 - expected1) <= 1e-12 * expected1,
					`|(i*${y})!|^2 mismatch: got ${modSq1}, expected ${expected1}`,
				)

				const fHalfIy = factorialComplexRecursive({ re: -0.5, im: y })
				const modSq2 = fHalfIy.re * fHalfIy.re + fHalfIy.im * fHalfIy.im
				const expected2 = Math.PI / Math.cosh(Math.PI * y)
				assert.ok(
					Math.abs(modSq2 - expected2) <= 1e-12 * expected2,
					`|(-1/2 + i*${y})!|^2 mismatch: got ${modSq2}, expected ${expected2}`,
				)
			}
		})
	})

	describe('mathematical identities and independent Stirling-Bernoulli cross-check', () => {
		const complexGrid = [
			{ re: 0.3, im: 0.7 },
			{ re: 2.5, im: -1.4 },
			{ re: -0.3, im: 0.9 },
			{ re: -0.7, im: -1.2 },
			{ re: -2.4, im: 3.1 },
			{ re: -5.25, im: -0.5 },
			{ re: 6.1, im: 4.8 },
			{ re: -10.5, im: 0 },
			{ re: 0, im: -4.2 },
			{ re: -1.5, im: 2.5 },
		]

		it('cross-checks against independent Stirling-Bernoulli + upward recurrence implementation', () => {
			for (const z of complexGrid) {
				const actual = factorialComplexRecursive(z)
				const ref = stirlingBernoulliFactorial(z)
				assertComplexClose(actual, ref, 1e-12, 1e-13, `Stirling cross-check (${z.re}, ${z.im})`)
			}
		})

		it('satisfies functional equation z! = z * (z - 1)!', () => {
			for (const z of complexGrid) {
				const lhs = factorialComplexRecursive(z)
				const rhs = cMul(z, factorialComplexRecursive({ re: z.re - 1, im: z.im }))
				assertComplexClose(lhs, rhs, 1e-12, 1e-13, `functional eq (${z.re}, ${z.im})`)
			}
		})

		it('satisfies Euler reflection identity z! * (-z)! = pi * z / sin(pi * z)', () => {
			for (const z of complexGrid) {
				const lhs = cMul(
					factorialComplexRecursive(z),
					factorialComplexRecursive({ re: -z.re, im: -z.im }),
				)
				const rhs = cDiv(
					{ re: Math.PI * z.re, im: Math.PI * z.im },
					cSin({ re: Math.PI * z.re, im: Math.PI * z.im }),
				)
				assertComplexClose(lhs, rhs, 1e-12, 1e-13, `reflection (${z.re}, ${z.im})`)
			}
		})

		it('satisfies Legendre duplication formula (2z)! = (2^(2z) / sqrt(pi)) * z! * (z - 1/2)!', () => {
			const dupPoints = [
				{ re: 0.4, im: 0.6 },
				{ re: -0.8, im: 1.1 },
				{ re: 2.2, im: -1.5 },
				{ re: -2.3, im: -0.9 },
			]
			const invSqrtPi = 1 / Math.sqrt(Math.PI)
			for (const z of dupPoints) {
				const lhs = factorialComplexRecursive({ re: 2 * z.re, im: 2 * z.im })
				const twoPow2z = cExp({ re: 2 * z.re * Math.LN2, im: 2 * z.im * Math.LN2 })
				const fz = factorialComplexRecursive(z)
				const fzHalf = factorialComplexRecursive({ re: z.re - 0.5, im: z.im })
				const prod = cMul(cMul(twoPow2z, fz), fzHalf)
				const rhs = { re: prod.re * invSqrtPi, im: prod.im * invSqrtPi }
				assertComplexClose(lhs, rhs, 1e-12, 1e-13, `duplication (${z.re}, ${z.im})`)
			}
		})

		it('satisfies Schwarz conjugate symmetry conj(z)! = conj(z!)', () => {
			for (const z of complexGrid) {
				const fz = factorialComplexRecursive(z)
				const fConjZ = factorialComplexRecursive({ re: z.re, im: -z.im })
				assertComplexClose(
					fConjZ,
					{ re: fz.re, im: -fz.im },
					1e-14,
					1e-15,
					`conjugate (${z.re}, ${z.im})`,
				)
			}
		})
	})

	describe('edge cases, continuity, underflow, and overflow', () => {
		it('normalizes -0 inputs and never returns -0', () => {
			for (const z of [
				{ re: -0, im: -0 },
				{ re: 0, im: -0 },
				{ re: -0.5, im: -0 },
				{ re: -1.5, im: -0 },
				{ re: 5, im: -0 },
			]) {
				const res = factorialComplexRecursive(z)
				assert.ok(!Object.is(res.re, -0))
				assert.ok(!Object.is(res.im, -0))
			}
		})

		it('is continuous across the reflection boundary Re(z) = -0.5 (Re(w) = 0.5)', () => {
			const eps = 1e-8
			for (const im of [0, 2.5, -1.7]) {
				const left = factorialComplexRecursive({ re: -0.5 - eps, im })
				const mid = factorialComplexRecursive({ re: -0.5, im })
				const right = factorialComplexRecursive({ re: -0.5 + eps, im })
				assertComplexClose(left, mid, 1e-6, 1e-7, `left continuity im=${im}`)
				assertComplexClose(right, mid, 1e-6, 1e-7, `right continuity im=${im}`)
			}
		})

		it('handles complex values near poles without spurious error', () => {
			// Near z = -1: (-1 + eps*i)! = Gamma(eps*i) ~ 1 / (eps*i) = -i / eps
			const eps = 1e-6
			const res = factorialComplexRecursive({ re: -1, im: eps })
			assertComplexClose(res, { re: -0.5772156649, im: -1 / eps }, 1e-5, 1e-5, 'near pole -1')
		})

		it('handles large imaginary parts (|pi * y| > 20) in reflection branch accurately', () => {
			const z = { re: -2.3, im: 12 }
			const fz = factorialComplexRecursive(z)
			const fzm1 = factorialComplexRecursive({ re: z.re - 1, im: z.im })
			assertComplexClose(fz, cMul(z, fzm1), 1e-12, 1e-15, 'large im reflection')

			const zNeg = { re: -2.3, im: -12 }
			const fzNeg = factorialComplexRecursive(zNeg)
			assertComplexClose(fzNeg, { re: fz.re, im: -fz.im }, 1e-13, 1e-15, 'large -im reflection')
		})

		it('underflows cleanly to { re: 0, im: 0 } for very large |Im(z)| or large negative non-integer Re(z)', () => {
			assert.deepEqual(factorialComplexRecursive({ re: 0, im: 1000 }), { re: 0, im: 0 })
			assert.deepEqual(factorialComplexRecursive({ re: -500.5, im: 0 }), { re: 0, im: 0 })
			assert.deepEqual(factorialComplexRecursive({ re: -10, im: -1000 }), { re: 0, im: 0 })
		})

		it('does not mutate the input object', () => {
			const input = Object.freeze({ re: 2.5, im: -1.5 })
			const res = factorialComplexRecursive(input)
			assert.equal(input.re, 2.5)
			assert.equal(input.im, -1.5)
			assert.ok(Number.isFinite(res.re) && Number.isFinite(res.im))
		})

		it('throws RangeError on overflow', () => {
			assert.throws(() => factorialComplexRecursive({ re: 171, im: 0 }), RangeError)
			assert.throws(() => factorialComplexRecursive({ re: 171.5, im: 0 }), RangeError)
			assert.throws(() => factorialComplexRecursive({ re: 500, im: 1 }), RangeError)
		})
	})

	describe('input validation and pole errors', () => {
		it('throws RangeError at negative integer poles', () => {
			for (const negInt of [-1, -2, -3, -10, -100, -1e9]) {
				assert.throws(
					() => factorialComplexRecursive({ re: negInt, im: 0 }),
					RangeError,
					`expected RangeError at pole z = ${negInt}`,
				)
				assert.throws(
					() => factorialComplexRecursive({ re: negInt, im: -0 }),
					RangeError,
					`expected RangeError at pole z = ${negInt} - 0i`,
				)
			}
		})

		it('throws TypeError for non-object or malformed complex inputs', () => {
			for (const bad of [
				null,
				undefined,
				5,
				'5',
				true,
				[],
				[1, 2],
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 1, im: null },
				{ re: 1n, im: 0n },
			]) {
				assert.throws(
					() => factorialComplexRecursive(/** @type {any} */ (bad)),
					TypeError,
					`expected TypeError for ${String(bad)}`,
				)
			}
		})

		it('throws RangeError for non-finite re or im', () => {
			for (const bad of [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: Number.NEGATIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.POSITIVE_INFINITY },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(
					() => factorialComplexRecursive(bad),
					RangeError,
					`expected RangeError for (${bad.re}, ${bad.im})`,
				)
			}
		})
	})
})
