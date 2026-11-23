import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralRationalSeries } from './integralRationalSeries.js'

const R = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function assertNormalized(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	}
}

function norm(num, den = 1n) {
	const s = den < 0n ? -1n : 1n
	const n = num * s
	const d = den * s
	if (n === 0n) return { num: 0n, den: 1n }
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function addR(a, b) {
	return norm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function subR(a, b) {
	return norm(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mulR(a, b) {
	return norm(a.num * b.num, a.den * b.den)
}

function divR(a, b) {
	return norm(a.num * b.den, a.den * b.num)
}

/** Independent polynomial evaluation via direct powers (for cross-checks). */
function evalPolyDirect(coeffs, x) {
	let total = R(0n, 1n)
	let xPow = R(1n, 1n)
	for (let k = 0; k < coeffs.length; k++) {
		total = addR(total, mulR(norm(coeffs[k].num, coeffs[k].den), xPow))
		xPow = mulR(xPow, x)
	}
	return total
}

/** Independent derivative of a rational series: d/dx (sum c_k x^k) = sum (k+1) c_{k+1} x^k. */
function diffRationalSeries(coeffs) {
	const out = []
	for (let k = 1; k < coeffs.length; k++) {
		out.push(mulR(coeffs[k], R(BigInt(k), 1n)))
	}
	return out
}

/** Independent Simpson's rule (exact for all polynomials of degree <= 3). */
function simpsonExact(coeffs, a, b) {
	const mid = divR(addR(a, b), R(2n, 1n))
	const fa = evalPolyDirect(coeffs, a)
	const fm = evalPolyDirect(coeffs, mid)
	const fb = evalPolyDirect(coeffs, b)
	const weightedSum = addR(addR(fa, mulR(R(4n, 1n), fm)), fb)
	return mulR(divR(subR(b, a), R(6n, 1n)), weightedSum)
}

describe('integralRationalSeries - indefinite integration', () => {
	test('integrates standard polynomial term-by-term with default constant 0', () => {
		// P(x) = 3 + 4x + 9x^2 - 8x^3 => F(x) = 0 + 3x + 2x^2 + 3x^3 - 2x^4
		const p = [R(3n), R(4n), R(9n), R(-8n)]
		const res = integralRationalSeries(p)
		assert.deepEqual(res, [R(0n), R(3n), R(2n), R(3n), R(-2n)])
		res.forEach(assertNormalized)
	})

	test('integrates fractional and unnormalized input coefficients into lowest terms', () => {
		// P(x) = (2/4) + (-6/9)x + (5/-10)x^2 = 1/2 - (2/3)x - (1/2)x^2
		// F(x) = c + (1/2)x - (1/3)x^2 - (1/6)x^3
		const p = [R(2n, 4n), R(-6n, 9n), R(5n, -10n)]
		const res = integralRationalSeries(p, { constant: R(-6n, -8n) })
		assert.deepEqual(res, [R(3n, 4n), R(1n, 2n), R(-1n, 3n), R(-1n, 6n)])
		res.forEach(assertNormalized)
	})

	test('supports constant via { c }, { constant }, and direct rational shorthand', () => {
		const p = [R(1n, 3n), R(2n, 5n)]
		const expected = [R(-7n, 11n), R(1n, 3n), R(1n, 5n)]

		assert.deepEqual(integralRationalSeries(p, { constant: R(7n, -11n) }), expected)
		assert.deepEqual(integralRationalSeries(p, { c: R(-14n, 22n) }), expected)
		assert.deepEqual(integralRationalSeries(p, R(-7n, 11n)), expected)
		assert.deepEqual(integralRationalSeries(p, {}), [R(0n), R(1n, 3n), R(1n, 5n)])
	})

	test('does not mutate input coefficients or options', () => {
		const p = [R(2n, 4n), R(6n, -9n)]
		const opts = { constant: R(4n, 6n) }
		integralRationalSeries(p, opts)
		assert.deepEqual(p, [R(2n, 4n), R(6n, -9n)])
		assert.deepEqual(opts, { constant: R(4n, 6n) })
	})
})

describe('integralRationalSeries - definite integration', () => {
	test('computes exact definite integral via { bounds: [a, b] } and [a, b] shorthand', () => {
		// ∫_0^1 (1 + x + x^2) dx = 1 + 1/2 + 1/3 = 11/6
		const p = [R(1n), R(1n), R(1n)]
		const r1 = integralRationalSeries(p, { bounds: [R(0n), R(1n)] })
		const r2 = integralRationalSeries(p, [R(0n), R(1n)])
		assert.deepEqual(r1, R(11n, 6n))
		assert.deepEqual(r2, R(11n, 6n))
		assertNormalized(r1)
	})

	test('computes definite integral over negative and fractional bounds', () => {
		// P(x) = 1/2 - 2x + 3x^2, F(x) = (1/2)x - x^2 + x^3
		// F(3/2) = 3/4 - 9/4 + 27/8 = 15/8
		// F(-1/2) = -1/4 - 1/4 - 1/8 = -5/8
		// F(3/2) - F(-1/2) = 20/8 = 5/2
		const p = [R(1n, 2n), R(-2n, 1n), R(3n, 1n)]
		const res = integralRationalSeries(p, { bounds: [R(-1n, 2n), R(3n, 2n)] })
		assert.deepEqual(res, R(5n, 2n))
		assertNormalized(res)
	})

	test('handles equal bounds and reversed bounds properly', () => {
		const p = [R(2n, 3n), R(-5n, 7n), R(11n, 13n), R(17n, 19n)]
		const equal = integralRationalSeries(p, { bounds: [R(4n, 6n), R(2n, 3n)] })
		assert.deepEqual(equal, R(0n, 1n))
		assertNormalized(equal)

		const forward = integralRationalSeries(p, { bounds: [R(-3n, 5n), R(7n, 4n)] })
		const reversed = integralRationalSeries(p, { bounds: [R(7n, 4n), R(-3n, 5n)] })
		assert.deepEqual(reversed, { num: -forward.num, den: forward.den })
		assertNormalized(forward)
		assertNormalized(reversed)
	})

	test('satisfies interval additivity: ∫_a^b + ∫_b^c = ∫_a^c', () => {
		const p = [R(1n, 7n), R(-3n, 4n), R(5n, 6n), R(-2n, 9n), R(7n, 5n)]
		const a = R(-4n, 3n)
		const b = R(1n, 5n)
		const c = R(9n, 4n)
		const ab = integralRationalSeries(p, [a, b])
		const bc = integralRationalSeries(p, [b, c])
		const ac = integralRationalSeries(p, [a, c])
		assert.deepEqual(addR(ab, bc), ac)
	})
})

describe('integralRationalSeries - edge cases and large BigInts', () => {
	test('handles empty series and all-zero series', () => {
		assert.deepEqual(integralRationalSeries([]), [R(0n, 1n)])
		assert.deepEqual(integralRationalSeries([], { constant: R(5n, 7n) }), [R(5n, 7n)])
		assert.deepEqual(integralRationalSeries([], { bounds: [R(-2n), R(9n)] }), R(0n, 1n))

		const zeros = [R(0n, 5n), R(0n, -3n), R(0n, 1n)]
		const indef = integralRationalSeries(zeros)
		assert.deepEqual(indef, [R(0n, 1n), R(0n, 1n), R(0n, 1n), R(0n, 1n)])
		indef.forEach(assertNormalized)
		assert.deepEqual(integralRationalSeries(zeros, [R(-10n, 3n), R(10n, 3n)]), R(0n, 1n))
	})

	test('handles very large BigInt numerators and denominators accurately', () => {
		const bigA = 10n ** 30n + 7n
		const bigB = 10n ** 25n + 3n
		const p = [R(bigA, bigB), R(2n * bigA, bigB)]
		const res = integralRationalSeries(p)
		assert.deepEqual(res, [R(0n, 1n), norm(bigA, bigB), norm(bigA, bigB)])
		res.forEach(assertNormalized)

		// ∫_0^1 (bigA/bigB + 2*(bigA/bigB)*x) dx = 2 * bigA / bigB
		const def = integralRationalSeries(p, [R(0n), R(1n)])
		assert.deepEqual(def, norm(2n * bigA, bigB))
		assertNormalized(def)
	})
})

describe('integralRationalSeries - independent mathematical cross-checks', () => {
	test('Fundamental Theorem of Calculus: d/dx (∫ P(x) dx) === P(x)', () => {
		const seriesList = [
			[],
			[R(0n, -9n)],
			[R(7n, 12n)],
			[R(1n, 2n), R(-3n, 4n), R(5n, 6n), R(-7n, 8n), R(9n, 10n), R(-11n, 12n)],
			[R(100n, -25n), R(0n, 7n), R(-49n, -14n), R(121n, 33n)],
		]
		const constants = [R(0n), R(5n, 3n), R(-13n, 17n)]

		for (const p of seriesList) {
			const normalizedP = p.map(r => norm(r.num, r.den))
			for (const c of constants) {
				const F = integralRationalSeries(p, { constant: c })
				F.forEach(assertNormalized)
				assert.deepEqual(diffRationalSeries(F), normalizedP)
			}
		}
	})

	test('Simpson rule exact cross-check for polynomials of degree <= 3', () => {
		const testCases = [
			{ p: [R(5n, 3n)], bounds: [R(-2n, 3n), R(7n, 5n)] },
			{ p: [R(-1n, 4n), R(3n, 2n)], bounds: [R(1n, 7n), R(9n, 4n)] },
			{ p: [R(2n, 5n), R(-7n, 3n), R(11n, 6n)], bounds: [R(-3n, 2n), R(5n, 3n)] },
			{ p: [R(-4n, 9n), R(5n, 7n), R(-2n, 3n), R(8n, 5n)], bounds: [R(-7n, 4n), R(11n, 6n)] },
			// Reversed bounds with cubic polynomial
			{ p: [R(1n, 2n), R(-3n, 5n), R(7n, 8n), R(-11n, 13n)], bounds: [R(5n, 2n), R(-3n, 4n)] },
		]

		for (const { p, bounds } of testCases) {
			const exact = integralRationalSeries(p, { bounds })
			const simpson = simpsonExact(p, bounds[0], bounds[1])
			assertNormalized(exact)
			assert.deepEqual(exact, simpson)
		}
	})

	test('Power series identities: exp(x) and ln(1 + x)', () => {
		// Integrating Taylor series of e^x up to degree 7 with c = 1 gives Taylor series of e^x up to degree 8
		const expCoeffs = []
		let fact = 1n
		for (let k = 0; k <= 7; k++) {
			if (k > 0) fact *= BigInt(k)
			expCoeffs.push(R(1n, fact))
		}
		const expIntegrated = integralRationalSeries(expCoeffs, { constant: R(1n, 1n) })
		const expectedExp = [...expCoeffs, R(1n, fact * 8n)]
		assert.deepEqual(expIntegrated, expectedExp)

		// Integrating 1 - x + x^2 - x^3 + x^4 - x^5 gives ln(1 + x) = x - x^2/2 + x^3/3 - x^4/4 + x^5/5 - x^6/6
		const geom = [R(1n), R(-1n), R(1n), R(-1n), R(1n), R(-1n)]
		const lnSeries = integralRationalSeries(geom)
		assert.deepEqual(lnSeries, [
			R(0n),
			R(1n, 1n),
			R(-1n, 2n),
			R(1n, 3n),
			R(-1n, 4n),
			R(1n, 5n),
			R(-1n, 6n),
		])
		// Definite integral from 0 to 1 is alternating harmonic partial sum: 1 - 1/2 + 1/3 - 1/4 + 1/5 - 1/6 = 37/60
		assert.deepEqual(integralRationalSeries(geom, [R(0n), R(1n)]), R(37n, 60n))
	})
})

describe('integralRationalSeries - input validation', () => {
	test('rejects non-array coeffs', () => {
		for (const bad of [null, undefined, 42, '123', {}, R(1n)]) {
			assert.throws(() => integralRationalSeries(bad), TypeError)
		}
	})

	test('rejects malformed rational elements', () => {
		for (const badElem of [null, undefined, 1, 1n, '1/2', [], {}, { num: 1, den: 2n }, { num: 1n, den: 2 }, { num: 1n }]) {
			assert.throws(() => integralRationalSeries([badElem]), TypeError)
		}
	})

	test('rejects zero denominators in coefficients, constant, and bounds', () => {
		assert.throws(() => integralRationalSeries([R(1n, 0n)]), RangeError)
		assert.throws(() => integralRationalSeries([R(0n, 0n)]), RangeError)
		assert.throws(() => integralRationalSeries([R(1n)], { constant: R(1n, 0n) }), RangeError)
		assert.throws(() => integralRationalSeries([R(1n)], { bounds: [R(0n, 0n), R(1n)] }), RangeError)
		assert.throws(() => integralRationalSeries([R(1n)], [R(0n), R(2n, 0n)]), RangeError)
	})

	test('rejects invalid options shapes and conflicting options', () => {
		assert.throws(() => integralRationalSeries([R(1n)], null), TypeError)
		assert.throws(() => integralRationalSeries([R(1n)], 123), TypeError)
		assert.throws(() => integralRationalSeries([R(1n)], 'bounds'), TypeError)
		assert.throws(() => integralRationalSeries([R(1n)], [R(0n)]), RangeError)
		assert.throws(() => integralRationalSeries([R(1n)], [R(0n), R(1n), R(2n)]), RangeError)
		assert.throws(() => integralRationalSeries([R(1n)], { bounds: 'not-array' }), TypeError)
		assert.throws(() => integralRationalSeries([R(1n)], { bounds: [R(0n)] }), RangeError)
		assert.throws(
			() => integralRationalSeries([R(1n)], { bounds: [R(0n), R(1n)], constant: R(1n) }),
			TypeError,
		)
		assert.throws(
			() => integralRationalSeries([R(1n)], { constant: R(1n), c: R(2n) }),
			TypeError,
		)
		assert.throws(
			() => integralRationalSeries([R(1n)], { num: 1n, den: 2n, bounds: [R(0n), R(1n)] }),
			TypeError,
		)
		assert.throws(() => integralRationalSeries([R(1n)], { unknown: 1 }), TypeError)
	})
})
