import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralRationalSeries } from './integralRationalSeries.js'

// --- Independent test helpers ---

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function rat(num, den = 1n) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function addRat(a, b) {
	return rat(a.num * b.den + b.num * a.den, a.den * b.den)
}

function subRat(a, b) {
	return rat(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mulRat(a, b) {
	return rat(a.num * b.num, a.den * b.den)
}

function ratToNumber(r) {
	return Number(r.num) / Number(r.den)
}

function assertCanonicalRational(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `expected zero to have den === 1n, got ${r.den}`)
	}
}

function assertCanonicalSeries(series) {
	assert.ok(Array.isArray(series))
	for (const r of series) {
		assertCanonicalRational(r)
	}
}

/**
 * Independent formal derivative of a rational series [a_0, a_1, ..., a_m]
 * returning [1*a_1, 2*a_2, ..., m*a_m] in lowest terms.
 */
function differentiateSeries(series) {
	const out = []
	for (let i = 1; i < series.length; i++) {
		out.push(rat(series[i].num * BigInt(i), series[i].den))
	}
	return out
}

/**
 * Independent exact Horner evaluation of a rational series at rational x.
 */
function evalSeriesExact(series, x) {
	let acc = rat(0n)
	for (let i = series.length - 1; i >= 0; i--) {
		acc = addRat(mulRat(acc, x), series[i])
	}
	return acc
}

/**
 * Independent floating-point polynomial evaluation for numerical quadrature.
 */
function evalSeriesFloat(coeffs, x) {
	let acc = 0
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = acc * x + ratToNumber(coeffs[i])
	}
	return acc
}

/**
 * Independent composite Simpson's rule on [a, b] with even subinterval count n.
 */
function simpson(fn, a, b, n = 200) {
	const h = (b - a) / n
	let sum = fn(a) + fn(b)
	for (let i = 1; i < n; i++) {
		const weight = i % 2 === 0 ? 2 : 4
		sum += weight * fn(a + i * h)
	}
	return (h / 3) * sum
}

// --- Test suites ---

describe('integralRationalSeries - normal cases', () => {
	test('integrates simple monomials and polynomials with default constant 0', () => {
		// p(x) = 3 + 2x + 3x^2 + 4x^3  =>  F(x) = 0 + 3x + x^2 + x^3 + x^4
		const p = [rat(3n), rat(2n), rat(3n), rat(4n)]
		const F = integralRationalSeries(p)
		assertCanonicalSeries(F)
		assert.deepEqual(F, [rat(0n), rat(3n), rat(1n), rat(1n), rat(1n)])
	})

	test('reduces fractions to lowest terms with positive denominators', () => {
		// p(x) = 1/2 - 4/3 x + 6/5 x^2 - 10/7 x^3
		// F(x) = 0 + 1/2 x - 2/3 x^2 + 2/5 x^3 - 5/14 x^4
		const p = [rat(1n, 2n), rat(-4n, 3n), rat(6n, 5n), rat(-10n, 7n)]
		const F = integralRationalSeries(p)
		assertCanonicalSeries(F)
		assert.deepEqual(F, [
			rat(0n, 1n),
			rat(1n, 2n),
			rat(-2n, 3n),
			rat(2n, 5n),
			rat(-5n, 14n),
		])
	})

	test('accepts unreduced inputs and negative denominators and normalizes output', () => {
		const p = [
			{ num: 4n, den: -8n },   // -1/2 -> /1 = -1/2
			{ num: -6n, den: -9n },  // 2/3  -> /2 = 1/3
			{ num: 0n, den: -12n },  // 0    -> /3 = 0/1
			{ num: 12n, den: -15n }, // -4/5 -> /4 = -1/5
		]
		const C = { num: -10n, den: -25n } // 2/5
		const F = integralRationalSeries(p, C)
		assertCanonicalSeries(F)
		assert.deepEqual(F, [
			{ num: 2n, den: 5n },
			{ num: -1n, den: 2n },
			{ num: 1n, den: 3n },
			{ num: 0n, den: 1n },
			{ num: -1n, den: 5n },
		])
	})

	test('does not mutate inputs or alias input objects in the returned array', () => {
		const c0 = { num: 3n, den: 4n }
		const C = { num: 5n, den: 6n }
		const coeffs = [c0]
		const F = integralRationalSeries(coeffs, C)

		c0.num = 999n
		C.num = 888n
		assert.deepEqual(F, [
			{ num: 5n, den: 6n },
			{ num: 3n, den: 4n },
		])
	})
})

describe('integralRationalSeries - zero polynomials, empty series, and constants', () => {
	test('empty coefficient array yields [C]', () => {
		const F0 = integralRationalSeries([])
		assertCanonicalSeries(F0)
		assert.deepEqual(F0, [{ num: 0n, den: 1n }])

		const FC = integralRationalSeries([], { num: -7n, den: 3n })
		assertCanonicalSeries(FC)
		assert.deepEqual(FC, [{ num: -7n, den: 3n }])
	})

	test('zero polynomial preserves series length + 1 with canonical zeros', () => {
		const zeros = [
			{ num: 0n, den: 1n },
			{ num: 0n, den: 5n },
			{ num: 0n, den: -9n },
		]
		const F = integralRationalSeries(zeros, { num: 11n, den: 4n })
		assertCanonicalSeries(F)
		assert.deepEqual(F, [
			{ num: 11n, den: 4n },
			{ num: 0n, den: 1n },
			{ num: 0n, den: 1n },
			{ num: 0n, den: 1n },
		])
	})

	test('preserves internal and trailing zeros accurately', () => {
		const p = [rat(0n), rat(5n, 2n), rat(0n), rat(-8n, 3n), rat(0n)]
		const F = integralRationalSeries(p, rat(-1n, 2n))
		assertCanonicalSeries(F)
		assert.deepEqual(F, [
			rat(-1n, 2n),
			rat(0n, 1n),
			rat(5n, 4n),
			rat(0n, 1n),
			rat(-2n, 3n),
			rat(0n, 1n),
		])
	})

	test('explicit undefined constant defaults to 0/1 and unreduced zero constant normalizes', () => {
		const p = [rat(1n), rat(2n)]
		assert.deepEqual(integralRationalSeries(p, undefined), [
			{ num: 0n, den: 1n },
			{ num: 1n, den: 1n },
			{ num: 1n, den: 1n },
		])

		const F = integralRationalSeries(p, { num: 0n, den: -42n })
		assertCanonicalSeries(F)
		assert.deepEqual(F[0], { num: 0n, den: 1n })
	})

	test('handles very large BigInt numerators and denominators exactly', () => {
		const bigPrime1 = 1000000000000000000000000000057n
		const bigPrime2 = 1000000000000000000000000000099n
		const p = [
			{ num: bigPrime1, den: bigPrime2 },
			{ num: bigPrime1 * 2n, den: bigPrime2 },
			{ num: -bigPrime1 * 3n, den: bigPrime2 },
		]
		const F = integralRationalSeries(p, { num: bigPrime1, den: 1n })
		assertCanonicalSeries(F)
		assert.deepEqual(F, [
			{ num: bigPrime1, den: 1n },
			{ num: bigPrime1, den: bigPrime2 },
			{ num: bigPrime1, den: bigPrime2 },
			{ num: -bigPrime1, den: bigPrime2 },
		])
	})
})

describe('integralRationalSeries - algebraic and power series identities', () => {
	test('exponential series: integral of sum x^k/k! with C=1 reproduces exp(x)', () => {
		const n = 12
		const expSeries = []
		let fact = 1n
		for (let k = 0; k < n; k++) {
			if (k > 0) fact *= BigInt(k)
			expSeries.push(rat(1n, fact))
		}

		const integrated = integralRationalSeries(expSeries, rat(1n))
		assertCanonicalSeries(integrated)

		const expected = [...expSeries, rat(1n, fact * BigInt(n))]
		assert.deepEqual(integrated, expected)
	})

	test('trigonometric series: integral(cos) = sin and integral(sin, -1) = -cos', () => {
		// cos(x) up to x^6: 1 - x^2/2! + x^4/4! - x^6/6!
		const cosSeries = [
			rat(1n), rat(0n), rat(-1n, 2n), rat(0n),
			rat(1n, 24n), rat(0n), rat(-1n, 720n),
		]
		// sin(x) up to x^7: x - x^3/3! + x^5/5! - x^7/7!
		const sinSeries = [
			rat(0n), rat(1n), rat(0n), rat(-1n, 6n),
			rat(0n), rat(1n, 120n), rat(0n), rat(-1n, 5040n),
		]

		const intCos = integralRationalSeries(cosSeries)
		assertCanonicalSeries(intCos)
		assert.deepEqual(intCos, sinSeries)

		const intSin = integralRationalSeries(sinSeries, rat(-1n))
		assertCanonicalSeries(intSin)
		const negCos = [
			rat(-1n), rat(0n), rat(1n, 2n), rat(0n),
			rat(-1n, 24n), rat(0n), rat(1n, 720n), rat(0n),
			rat(-1n, 40320n),
		]
		assert.deepEqual(intSin, negCos)
	})

	test('geometric series: integral(1/(1+x^2)) = arctan(x) and integral(1/(1-x)) = -ln(1-x)', () => {
		const geom = Array.from({ length: 8 }, () => rat(1n))
		const negLog = integralRationalSeries(geom)
		assertCanonicalSeries(negLog)
		assert.deepEqual(negLog, [
			rat(0n),
			rat(1n, 1n), rat(1n, 2n), rat(1n, 3n), rat(1n, 4n),
			rat(1n, 5n), rat(1n, 6n), rat(1n, 7n), rat(1n, 8n),
		])

		const oneOverOnePlusX2 = [
			rat(1n), rat(0n), rat(-1n), rat(0n),
			rat(1n), rat(0n), rat(-1n), rat(0n),
		]
		const atan = integralRationalSeries(oneOverOnePlusX2)
		assertCanonicalSeries(atan)
		assert.deepEqual(atan, [
			rat(0n), rat(1n, 1n), rat(0n), rat(-1n, 3n), rat(0n),
			rat(1n, 5n), rat(0n), rat(-1n, 7n), rat(0n),
		])
	})

	test('linearity: integral(alpha*p + beta*q) === alpha*integral(p) + beta*integral(q)', () => {
		const p = [rat(3n, 5n), rat(-2n, 7n), rat(4n, 9n), rat(11n, 3n)]
		const q = [rat(-1n, 2n), rat(5n, 3n), rat(-7n, 4n), rat(2n, 11n)]
		const alpha = rat(7n, 4n)
		const beta = rat(-5n, 6n)

		const combo = p.map((pi, i) => addRat(mulRat(alpha, pi), mulRat(beta, q[i])))
		const lhs = integralRationalSeries(combo)

		const intP = integralRationalSeries(p)
		const intQ = integralRationalSeries(q)
		const rhs = intP.map((pi, i) => addRat(mulRat(alpha, pi), mulRat(beta, intQ[i])))

		assertCanonicalSeries(lhs)
		assert.deepEqual(lhs, rhs)
	})
})

describe('integralRationalSeries - Fundamental Theorem of Calculus cross-checks', () => {
	test('FTC Part 1: differentiating integralRationalSeries(p, C) recovers normalized p', () => {
		const cases = [
			{ p: [], C: rat(0n) },
			{ p: [], C: rat(-9n, 4n) },
			{ p: [rat(0n), rat(0n)], C: rat(5n, 7n) },
			{ p: [rat(-3n, 4n), rat(5n, 6n), rat(-7n, 8n), rat(9n, 10n), rat(-11n, 12n)], C: rat(13n, 17n) },
			{
				p: [
					{ num: 14n, den: -21n },
					{ num: -18n, den: -24n },
					{ num: 0n, den: -3n },
					{ num: 100n, den: 35n },
				],
				C: { num: -42n, den: -18n },
			},
		]

		for (const { p, C } of cases) {
			const F = integralRationalSeries(p, C)
			assertCanonicalSeries(F)
			const recovered = differentiateSeries(F)
			const expected = p.map((c) => rat(c.num, c.den))
			assert.deepEqual(recovered, expected)
		}
	})

	test('FTC Part 2: exact definite integral F(b) - F(a) matches composite Simpson rule', () => {
		const polynomials = [
			// Cubic (Simpson is exact up to float rounding)
			[rat(2n, 3n), rat(-5n, 4n), rat(7n, 6n), rat(-3n, 5n)],
			// Degree 6 polynomial with mixed signs and fractions
			[rat(-1n, 2n), rat(3n, 7n), rat(0n), rat(-4n, 5n), rat(9n, 8n), rat(-2n, 3n), rat(1n, 4n)],
			// Degree 8 polynomial
			[rat(1n), rat(-1n), rat(1n, 2n), rat(-1n, 3n), rat(1n, 4n), rat(-1n, 5n), rat(1n, 6n), rat(-1n, 7n), rat(1n, 8n)],
		]

		const intervals = [
			[rat(0n), rat(1n)],
			[rat(-3n, 2n), rat(5n, 4n)],
			[rat(2n, 3n), rat(-1n, 3n)], // reversed bounds a > b
			[rat(7n, 5n), rat(7n, 5n)],  // zero-width interval a === b
		]

		const constants = [rat(0n), rat(17n, 13n), rat(-99n, 7n)]

		for (const p of polynomials) {
			for (const [a, b] of intervals) {
				const expectedNum = simpson((x) => evalSeriesFloat(p, x), ratToNumber(a), ratToNumber(b), 4000)
				let firstExact = null

				for (const C of constants) {
					const F = integralRationalSeries(p, C)
					assertCanonicalSeries(F)
					const exactDefinite = subRat(evalSeriesExact(F, b), evalSeriesExact(F, a))

					// Definite integral must be completely independent of C
					if (firstExact === null) {
						firstExact = exactDefinite
					} else {
						assert.deepEqual(exactDefinite, firstExact)
					}

					const diff = Math.abs(ratToNumber(exactDefinite) - expectedNum)
					assert.ok(
						diff < 1e-11,
						`F(b)-F(a) = ${ratToNumber(exactDefinite)} disagreed with Simpson = ${expectedNum} (diff=${diff})`,
					)
				}
			}
		}
	})

	test('truncated series integral matches Math.* functions at x = 1/4 within Taylor remainder', () => {
		// Integrate 1/(1 + t) = sum_{k=0}^{15} (-1)^k t^k from 0 to 1/4 => ln(1 + 1/4) = ln(5/4)
		const n = 16
		const series = Array.from({ length: n }, (_, k) => rat(k % 2 === 0 ? 1n : -1n))
		const F = integralRationalSeries(series)
		assertCanonicalSeries(F)

		const x = rat(1n, 4n)
		const approx = ratToNumber(evalSeriesExact(F, x))
		const actual = Math.log(1 + 0.25)
		// Alternating series error bound is <= x^(n+1) / (n+1) = (1/4)^17 / 17 < 4e-12
		assert.ok(Math.abs(approx - actual) < 1e-11, `got ${approx}, expected ${actual}`)
	})
})

describe('integralRationalSeries - input validation', () => {
	test('throws TypeError when coeffs is not an array', () => {
		for (const bad of [null, undefined, 0, 42, '123', {}, { num: 1n, den: 1n }, new Set()]) {
			assert.throws(() => integralRationalSeries(bad), TypeError)
		}
	})

	test('throws TypeError for sparse arrays or invalid rational entries in coeffs', () => {
		// Sparse array with hole
		const sparse = [rat(1n), , rat(2n)] // eslint-disable-line no-sparse-arrays
		assert.throws(() => integralRationalSeries(sparse), TypeError)

		const badEntries = [
			null,
			undefined,
			1,
			1n,
			'1/2',
			[],
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: 1n },
			{ den: 1n },
			{ num: '1', den: '2' },
		]
		for (const entry of badEntries) {
			assert.throws(() => integralRationalSeries([rat(1n), entry]), TypeError)
		}
	})

	test('throws RangeError when any coefficient has denominator 0n', () => {
		assert.throws(
			() => integralRationalSeries([{ num: 1n, den: 0n }]),
			RangeError,
		)
		assert.throws(
			() => integralRationalSeries([rat(1n), { num: 0n, den: 0n }]),
			RangeError,
		)
	})

	test('throws TypeError when constant is invalid', () => {
		const valid = [rat(1n)]
		for (const badConst of [null, 0, 0n, '0', [], {}, { num: 0, den: 1n }, { num: 0n, den: 1 }]) {
			assert.throws(() => integralRationalSeries(valid, badConst), TypeError)
		}
	})

	test('throws RangeError when constant has denominator 0n', () => {
		assert.throws(
			() => integralRationalSeries([rat(1n)], { num: 1n, den: 0n }),
			RangeError,
		)
		assert.throws(
			() => integralRationalSeries([], { num: 0n, den: 0n }),
			RangeError,
		)
	})
})
