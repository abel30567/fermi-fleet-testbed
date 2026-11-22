import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralRationalRecursive } from './integralRationalRecursive.js'

/**
 * Helper to construct a Rational object.
 * @param {bigint} num
 * @param {bigint} den
 */
const r = (num, den = 1n) => ({ num, den })

/**
 * Asserts that a rational is strictly canonical: BigInt fields, den > 0n,
 * gcd(|num|, den) === 1n, and zero represented as { num: 0n, den: 1n }.
 * @param {{ num: bigint, den: bigint }} value
 */
function assertCanonicalRational(value) {
	assert.equal(typeof value.num, 'bigint')
	assert.equal(typeof value.den, 'bigint')
	assert.ok(value.den > 0n, `expected den > 0n, got ${value.den}`)
	if (value.num === 0n) {
		assert.equal(value.den, 1n)
	} else {
		let a = value.num < 0n ? -value.num : value.num
		let b = value.den
		while (b !== 0n) {
			const t = a % b
			a = b
			b = t
		}
		assert.equal(a, 1n, `expected lowest terms, got ${value.num}/${value.den}`)
	}
}

/**
 * Independent polynomial evaluator in floating-point (Horner's method).
 * @param {{ num: bigint, den: bigint }[]} coeffs
 * @param {number} x
 * @returns {number}
 */
function evalPolyFloat(coeffs, x) {
	let acc = 0
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = acc * x + Number(coeffs[i].num) / Number(coeffs[i].den)
	}
	return acc
}

/**
 * Independent composite Simpson's rule numerical integrator.
 * @param {(x: number) => number} fn
 * @param {number} a
 * @param {number} b
 * @param {number} intervals Even number of subintervals
 * @returns {number}
 */
function simpsonFloat(fn, a, b, intervals = 200) {
	const h = (b - a) / intervals
	let sum = fn(a) + fn(b)
	for (let i = 1; i < intervals; i++) {
		sum += (i % 2 === 0 ? 2 : 4) * fn(a + i * h)
	}
	return (sum * h) / 3
}

/**
 * Independent exact Horner evaluation of a rational polynomial at a rational point.
 * @param {{ num: bigint, den: bigint }[]} coeffs
 * @param {{ num: bigint, den: bigint }} x
 * @returns {{ num: bigint, den: bigint }}
 */
function evalPolyExactHorner(coeffs, x) {
	let num = 0n
	let den = 1n
	for (let i = coeffs.length - 1; i >= 0; i--) {
		// acc = acc * x + coeffs[i]
		const prodNum = num * x.num
		const prodDen = den * x.den
		num = prodNum * coeffs[i].den + coeffs[i].num * prodDen
		den = prodDen * coeffs[i].den
	}
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	let a = num < 0n ? -num : num
	let b = den
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return { num: num / a, den: den / a }
}

describe('integralRationalRecursive - definite integrals', () => {
	test('integrates constant, linear, and quadratic polynomials', () => {
		// ∫_1^5 3 dx = 12
		assert.deepEqual(integralRationalRecursive([r(3n)], r(1n), r(5n)), r(12n, 1n))

		// ∫_0^4 (2 + 3x) dx = [2x + 3/2 x^2]_0^4 = 8 + 24 = 32
		assert.deepEqual(integralRationalRecursive([r(2n), r(3n)], r(0n), r(4n)), r(32n, 1n))

		// ∫_0^1 x^2 dx = 1/3
		assert.deepEqual(integralRationalRecursive([r(0n), r(0n), r(1n)], r(0n), r(1n)), r(1n, 3n))
	})

	test('integrates polynomial with fractional coefficients and fractional bounds', () => {
		// P(x) = 1/2 + (2/3)x + (3/4)x^2 over [1/3, 5/6]
		// F(x) = (1/2)x + (1/3)x^2 + (1/4)x^3
		// F(5/6) = 5/12 + 25/108 + 125/864 = (360 + 200 + 125)/864 = 685/864
		// F(1/3) = 1/6 + 1/27 + 1/108 = (18 + 4 + 1)/108 = 23/108 = 184/864
		// diff = 501/864 = 167/288
		const result = integralRationalRecursive(
			[r(1n, 2n), r(2n, 3n), r(3n, 4n)],
			r(1n, 3n),
			r(5n, 6n),
		)
		assertCanonicalRational(result)
		assert.deepEqual(result, r(167n, 288n))
	})

	test('handles arbitrary-precision BigInt coefficients and bounds', () => {
		const big = 10n ** 24n
		// ∫_0^big (3x^2) dx = big^3 = 10^72
		const result = integralRationalRecursive([r(0n), r(0n), r(3n)], r(0n), r(big))
		assertCanonicalRational(result)
		assert.deepEqual(result, r(big ** 3n, 1n))
	})

	test('handles high-degree polynomial across multiple divide-and-conquer levels', () => {
		// P(x) = sum_{k=0}^{9} (k + 1) x^k  => F(x) = sum_{k=1}^{10} x^k
		// ∫_0^2 P(x) dx = 2 + 4 + 8 + ... + 1024 = 2046
		const coeffs = Array.from({ length: 10 }, (_, k) => r(BigInt(k + 1), 1n))
		const result = integralRationalRecursive(coeffs, r(0n), r(2n))
		assertCanonicalRational(result)
		assert.deepEqual(result, r(2046n, 1n))
	})
})

describe('integralRationalRecursive - indefinite integrals', () => {
	test('computes exact antiderivative with zero integration constant', () => {
		// P(x) = 5 - 4x + 9x^2 - (2/5)x^3
		// F(x) = 0 + 5x - 2x^2 + 3x^3 - (1/10)x^4
		const anti = integralRationalRecursive([r(5n), r(-4n), r(9n), r(-2n, 5n)])
		assert.deepEqual(anti, [r(0n, 1n), r(5n, 1n), r(-2n, 1n), r(3n, 1n), r(-1n, 10n)])
		for (const c of anti) {
			assertCanonicalRational(c)
		}
	})

	test('returns zero constant for empty polynomial', () => {
		const anti = integralRationalRecursive([])
		assert.deepEqual(anti, [r(0n, 1n)])
		assertCanonicalRational(anti[0])
	})
})

describe('integralRationalRecursive - edge cases', () => {
	test('zero polynomial and empty polynomial integrate to 0/1', () => {
		assert.deepEqual(integralRationalRecursive([], r(-5n, 2n), r(7n, 3n)), r(0n, 1n))
		assert.deepEqual(
			integralRationalRecursive([r(0n, 1n), r(0n, 9n), r(0n, -4n)], r(-2n), r(5n)),
			r(0n, 1n),
		)
	})

	test('equal bounds produce 0/1', () => {
		const poly = [r(3n, 5n), r(-7n, 2n), r(11n, 4n)]
		assert.deepEqual(integralRationalRecursive(poly, r(2n, 3n), r(2n, 3n)), r(0n, 1n))
		// Equivalent unreduced equal bounds: 2/3 === -4/-6
		assert.deepEqual(integralRationalRecursive(poly, r(2n, 3n), r(-4n, -6n)), r(0n, 1n))
	})

	test('negative bounds and symmetric odd/even parity', () => {
		// Odd polynomial P(x) = 3x - 5x^3 + 7x^5 over [-3/2, 3/2] => 0/1
		const oddPoly = [r(0n), r(3n), r(0n), r(-5n), r(0n), r(7n)]
		assert.deepEqual(integralRationalRecursive(oddPoly, r(-3n, 2n), r(3n, 2n)), r(0n, 1n))

		// Even polynomial P(x) = 1 + 3x^2 - 5x^4 over [-2, 2] equals 2 * ∫_0^2 P(x) dx
		const evenPoly = [r(1n), r(0n), r(3n), r(0n), r(-5n)]
		const full = integralRationalRecursive(evenPoly, r(-2n), r(2n))
		const half = integralRationalRecursive(evenPoly, r(0n), r(2n))
		assert.deepEqual(full, r(half.num * 2n, half.den))

		// Strictly negative interval [-3, -1] for P(x) = x^2: [x^3/3]_-3^-1 = -1/3 - (-9) = 26/3
		assert.deepEqual(integralRationalRecursive([r(0n), r(0n), r(1n)], r(-3n), r(-1n)), r(26n, 3n))
	})

	test('swapped bounds negate the definite integral', () => {
		const poly = [r(1n, 3n), r(-2n, 5n), r(7n, 11n), r(4n, 9n)]
		const forward = integralRationalRecursive(poly, r(-1n, 2n), r(5n, 4n))
		const backward = integralRationalRecursive(poly, r(5n, 4n), r(-1n, 2n))
		assertCanonicalRational(forward)
		assertCanonicalRational(backward)
		assert.deepEqual(backward, { num: -forward.num, den: forward.den })
	})

	test('normalizes unreduced inputs and negative denominators', () => {
		// Coefficients: 6/-9 (= -2/3), -10/-15 (= 2/3), 0/-7 (= 0/1)
		// Bounds: -4/-8 (= 1/2) to 12/8 (= 3/2)
		// P(x) = -2/3 + (2/3)x
		// F(x) = -(2/3)x + (1/3)x^2
		// F(3/2) = -1 + 3/4 = -1/4
		// F(1/2) = -1/3 + 1/12 = -1/4
		// diff = 0/1
		const zeroResult = integralRationalRecursive(
			[r(6n, -9n), r(-10n, -15n), r(0n, -7n)],
			r(-4n, -8n),
			r(12n, 8n),
		)
		assertCanonicalRational(zeroResult)
		assert.deepEqual(zeroResult, r(0n, 1n))

		// Non-zero case with unreduced inputs: ∫_{-2/-4}^{6/4} (4/-6) dx = (-2/3) * (3/2 - 1/2) = -2/3
		const nonZeroResult = integralRationalRecursive([r(4n, -6n)], r(-2n, -4n), r(6n, 4n))
		assertCanonicalRational(nonZeroResult)
		assert.deepEqual(nonZeroResult, r(-2n, 3n))
	})
})

describe('integralRationalRecursive - independent cross-checks', () => {
	test('matches composite Simpson rule numerical integration to high precision', () => {
		// Degree-6 polynomial with mixed signs and fractional coefficients
		const coeffs = [
			r(3n, 7n),
			r(-5n, 4n),
			r(2n, 3n),
			r(-1n, 6n),
			r(7n, 8n),
			r(-3n, 10n),
			r(1n, 5n),
		]
		const lower = r(-3n, 4n)
		const upper = r(7n, 5n)

		const exact = integralRationalRecursive(coeffs, lower, upper)
		assertCanonicalRational(exact)

		const exactFloat = Number(exact.num) / Number(exact.den)
		const approx = simpsonFloat(
			(x) => evalPolyFloat(coeffs, x),
			Number(lower.num) / Number(lower.den),
			Number(upper.num) / Number(upper.den),
			2000,
		)
		assert.ok(
			Math.abs(exactFloat - approx) < 1e-11,
			`expected exact ${exactFloat} to match Simpson ${approx}`,
		)
	})

	test('satisfies Fundamental Theorem of Calculus against independent Horner evaluation', () => {
		const coeffs = [r(2n, 5n), r(-3n, 7n), r(11n, 13n), r(-17n, 19n), r(5n, 3n)]
		const a = r(-2n, 3n)
		const b = r(5n, 4n)

		const definite = integralRationalRecursive(coeffs, a, b)
		const antiderivative = integralRationalRecursive(coeffs)

		const fb = evalPolyExactHorner(antiderivative, b)
		const fa = evalPolyExactHorner(antiderivative, a)
		// Compute fb - fa independently
		let num = fb.num * fa.den - fa.num * fb.den
		let den = fb.den * fa.den
		let x = num < 0n ? -num : num
		let y = den
		while (y !== 0n) {
			const t = x % y
			x = y
			y = t
		}
		const ftc = { num: num / x, den: den / x }

		assert.deepEqual(definite, ftc)
	})

	test('matches analytical identity ∫_0^1 (1 - x)^6 dx = 1/7 via binomial expansion', () => {
		// (1 - x)^6 = 1 - 6x + 15x^2 - 20x^3 + 15x^4 - 6x^5 + x^6
		const coeffs = [r(1n), r(-6n), r(15n), r(-20n), r(15n), r(-6n), r(1n)]
		const result = integralRationalRecursive(coeffs, r(0n), r(1n))
		assertCanonicalRational(result)
		assert.deepEqual(result, r(1n, 7n))
	})

	test('satisfies interval additivity ∫_a^c = ∫_a^b + ∫_b^c', () => {
		const coeffs = [r(-1n, 2n), r(4n, 3n), r(-3n, 5n), r(2n, 7n), r(9n, 11n)]
		const a = r(-5n, 3n)
		const b = r(1n, 4n)
		const c = r(7n, 2n)

		const ac = integralRationalRecursive(coeffs, a, c)
		const ab = integralRationalRecursive(coeffs, a, b)
		const bc = integralRationalRecursive(coeffs, b, c)

		// Compare ab + bc === ac via exact cross-multiplication
		assert.equal((ab.num * bc.den + bc.num * ab.den) * ac.den, ac.num * ab.den * bc.den)
	})
})

describe('integralRationalRecursive - input validation', () => {
	test('throws TypeError for non-array coefficients', () => {
		for (const bad of [null, undefined, 42, 'abc', { num: 1n, den: 1n }]) {
			assert.throws(() => integralRationalRecursive(/** @type {any} */ (bad)), TypeError)
		}
	})

	test('throws TypeError for sparse coefficient arrays or invalid elements', () => {
		const sparse = new Array(2)
		sparse[0] = r(1n)
		assert.throws(() => integralRationalRecursive(sparse), TypeError)

		for (const badElem of [null, undefined, 1, '1/2', { num: 1, den: 2n }, { num: 1n, den: 2 }, {}]) {
			assert.throws(
				() => integralRationalRecursive([/** @type {any} */ (badElem)], r(0n), r(1n)),
				TypeError,
			)
		}
	})

	test('throws RangeError for zero denominators in coefficients or bounds', () => {
		assert.throws(() => integralRationalRecursive([r(1n, 0n)]), RangeError)
		assert.throws(() => integralRationalRecursive([r(1n, 0n)], r(0n), r(1n)), RangeError)
		assert.throws(() => integralRationalRecursive([r(1n)], r(1n, 0n), r(2n)), RangeError)
		assert.throws(() => integralRationalRecursive([r(1n)], r(1n), r(2n, 0n)), RangeError)
	})

	test('throws TypeError when only one bound is provided or bounds are invalid', () => {
		assert.throws(() => integralRationalRecursive([r(1n)], r(0n)), TypeError)
		assert.throws(() => integralRationalRecursive([r(1n)], undefined, r(1n)), TypeError)
		assert.throws(() => integralRationalRecursive([r(1n)], /** @type {any} */ (0), r(1n)), TypeError)
		assert.throws(() => integralRationalRecursive([r(1n)], r(0n), /** @type {any} */ ({ num: 1, den: 1 })), TypeError)
	})

	test('still validates coefficients when lower and upper bounds are equal', () => {
		assert.throws(() => integralRationalRecursive([r(1n, 0n)], r(2n), r(2n)), RangeError)
		assert.throws(
			() => integralRationalRecursive([/** @type {any} */ (null)], r(2n), r(2n)),
			TypeError,
		)
	})
})
