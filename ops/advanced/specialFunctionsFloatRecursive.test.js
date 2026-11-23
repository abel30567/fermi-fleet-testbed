import { test } from 'node:test'
import assert from 'node:assert'
import { specialFunctionsFloatRecursive as sf } from './specialFunctionsFloatRecursive.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-14, message = '') {
	assert.ok(Number.isFinite(actual), `Expected finite result, got ${actual} ${message}`)
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= limit,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`,
	)
}

/**
 * Independent composite Simpson's rule integrator for cross-checking special functions
 * against their defining integral representations.
 */
function simpsonIntegral(f, a, b, intervals = 2000) {
	const h = (b - a) / intervals
	let sum = f(a) + f(b)
	for (let i = 1; i < intervals; i++) {
		sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h)
	}
	return (sum * h) / 3
}

test('gamma: positive integers, half-integers, and negative non-integers', () => {
	assertClose(sf('gamma', 1), 1, 1e-14)
	assertClose(sf('gamma', 2), 1, 1e-14)
	assertClose(sf('gamma', 5), 24, 1e-14)
	assertClose(sf('gamma', 10), 362880, 1e-13)
	assertClose(sf('gamma', 0.5), Math.sqrt(Math.PI), 1e-14)
	assertClose(sf('gamma', 1.5), 0.5 * Math.sqrt(Math.PI), 1e-14)
	assertClose(sf('gamma', 2.5), 0.75 * Math.sqrt(Math.PI), 1e-14)
	assertClose(sf('gamma', -0.5), -2 * Math.sqrt(Math.PI), 1e-13)
	assertClose(sf('gamma', -1.5), (4 / 3) * Math.sqrt(Math.PI), 1e-13)
	assertClose(sf('gamma', -2.5), -(8 / 15) * Math.sqrt(Math.PI), 1e-13)
})

test('gamma & lgamma: recurrence, reflection, and large-argument overflow edge cases', () => {
	// Γ(x + 1) = x Γ(x)
	for (const x of [0.25, 0.7, 3.3, 12.8, -3.7]) {
		assertClose(sf('gamma', x + 1), x * sf('gamma', x), 1e-12, 1e-14, `recurrence at x=${x}`)
	}
	// Overflow boundary for float64 Γ(x)
	assert.equal(sf('gamma', 172), Infinity)
	assert.ok(Number.isFinite(sf('gamma', 171)))
	assertClose(Math.log(sf('gamma', 171)), sf('lgamma', 171), 1e-13)

	// lgamma remains finite far past gamma overflow
	const lg1000 = sf('lgamma', 1000)
	// Independent Stirling cross-check for ln(999!) = lgamma(1000)
	const n = 999
	const stirling = n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n) + 1 / (12 * n)
	assertClose(lg1000, stirling, 1e-11, 1e-12, 'lgamma(1000) vs Stirling')

	// Negative non-integer lgamma agrees with ln|gamma(x)|
	assertClose(sf('lgamma', -4.25), Math.log(Math.abs(sf('gamma', -4.25))), 1e-13)
})

test('beta: symmetry, known exact values, and independent integral cross-check', () => {
	assertClose(sf('beta', 1, 1), 1, 1e-14)
	assertClose(sf('beta', 2, 3), 1 / 12, 1e-14)
	assertClose(sf('beta', 0.5, 0.5), Math.PI, 1e-14)
	assertClose(sf('beta', 3.5, 2.2), sf('beta', 2.2, 3.5), 1e-14, 1e-14, 'symmetry')

	// Large arguments where direct Γ(a)Γ(b)/Γ(a+b) would overflow intermediate terms
	const bLarge = sf('beta', 200, 200)
	assert.ok(bLarge > 0 && Number.isFinite(bLarge))

	// Independent cross-check: B(a, b) = ∫_0^1 t^(a-1) (1-t)^(b-1) dt
	const integralVal = simpsonIntegral((t) => Math.pow(t, 2.5) * Math.pow(1 - t, 3.5), 0, 1, 4000)
	assertClose(sf('beta', 3.5, 4.5), integralVal, 1e-10, 1e-12, 'Beta(3.5, 4.5) vs integral')
})

test('erf & erfc: normal values, symmetries, tails, and independent integral cross-check', () => {
	assert.equal(sf('erf', 0), 0)
	assert.equal(sf('erfc', 0), 1)
	// NIST / Abramowitz & Stegun reference values
	assertClose(sf('erf', 0.5), 0.5204998778130465, 1e-14)
	assertClose(sf('erf', 1.0), 0.8427007929497149, 1e-14)
	assertClose(sf('erf', 2.0), 0.9953222650189527, 1e-14)
	assertClose(sf('erfc', 1.0), 0.15729920705028513, 1e-13)
	assertClose(sf('erfc', 2.0), 0.004677734981047266, 1e-13)
	assertClose(sf('erfc', 3.0), 2.209049699858544e-5, 1e-13)
	assertClose(sf('erfc', 5.0), 1.537459794428035e-12, 1e-12)

	// Odd symmetry erf(-x) = -erf(x) and erfc(x) + erfc(-x) = 2
	for (const x of [0.3, 1.0, 1.5, 2.7, 4.2]) {
		assertClose(sf('erf', -x), -sf('erf', x), 1e-14)
		assertClose(sf('erfc', x) + sf('erfc', -x), 2, 1e-14)
		assertClose(sf('erf', x) + sf('erfc', x), 1, 1e-13)
	}

	// Extreme tail edge cases
	assert.equal(sf('erf', 10), 1)
	assert.equal(sf('erf', -10), -1)
	assert.equal(sf('erfc', 30), 0)
	assert.equal(sf('erfc', -30), 2)

	// Independent cross-check: erf(x) = (2/sqrt(pi)) ∫_0^x exp(-t^2) dt
	for (const x of [0.75, 1.25, 2.25]) {
		const quad = (2 / Math.sqrt(Math.PI)) * simpsonIntegral((t) => Math.exp(-t * t), 0, x, 2000)
		assertClose(sf('erf', x), quad, 1e-11, 1e-13, `erf(${x}) vs Simpson integral`)
	}
})

test('besselJ: reference values, symmetries, recurrence, and independent integral cross-check', () => {
	assert.equal(sf('besselJ', 0, 0), 1)
	assert.equal(sf('besselJ', 1, 0), 0)
	assert.equal(sf('besselJ', -3, 0), 0)

	// NIST / Abramowitz & Stegun reference values
	assertClose(sf('besselJ', 0, 1), 0.7651976865579666, 1e-13)
	assertClose(sf('besselJ', 1, 1), 0.4400505857449335, 1e-13)
	assertClose(sf('besselJ', 2, 1), 0.11490348493190048, 1e-13)
	assertClose(sf('besselJ', 0, 5), -0.1775967713143383, 1e-13)
	assertClose(sf('besselJ', 3, 5), 0.364831230613667, 1e-13)
	assertClose(sf('besselJ', 0, 10), -0.2459357644513483, 1e-13)

	// First positive zero of J_0(x) ≈ 2.4048255576957728
	assertClose(sf('besselJ', 0, 2.4048255576957728), 0, 1e-12, 1e-13, 'first zero of J_0')

	// Reflection symmetries: J_{-n}(x) = (-1)^n J_n(x), J_n(-x) = (-1)^n J_n(x)
	assertClose(sf('besselJ', -3, 4.2), -sf('besselJ', 3, 4.2), 1e-14)
	assertClose(sf('besselJ', -4, 4.2), sf('besselJ', 4, 4.2), 1e-14)
	assertClose(sf('besselJ', 3, -4.2), -sf('besselJ', 3, 4.2), 1e-14)
	assertClose(sf('besselJ', 4, -4.2), sf('besselJ', 4, 4.2), 1e-14)

	// Three-term recurrence: J_{n-1}(x) + J_{n+1}(x) = (2n/x) J_n(x)
	for (const [n, x] of [
		[2, 3.7],
		[5, 8.5],
		[1, 150],
	]) {
		const lhs = sf('besselJ', n - 1, x) + sf('besselJ', n + 1, x)
		const rhs = ((2 * n) / x) * sf('besselJ', n, x)
		assertClose(lhs, rhs, 1e-11, 1e-13, `Bessel recurrence n=${n}, x=${x}`)
	}

	// Independent cross-check via Bessel's integral: J_n(x) = (1/pi) ∫_0^pi cos(n*t - x*sin(t)) dt
	for (const [n, x] of [
		[0, 2.5],
		[2, 3.5],
		[4, 6.0],
		[0, 120.0],
	]) {
		const integralVal =
			simpsonIntegral((t) => Math.cos(n * t - x * Math.sin(t)), 0, Math.PI, 4000) / Math.PI
		assertClose(sf('besselJ', n, x), integralVal, 1e-10, 1e-11, `J_${n}(${x}) vs Bessel integral`)
	}

	// Extreme order underflow edge case
	assert.equal(sf('besselJ', 500, 1), 0)
})

test('legendreP: explicit formulas, boundary values, and orthogonality cross-check', () => {
	assert.equal(sf('legendreP', 0, 0.37), 1)
	assert.equal(sf('legendreP', 1, 0.37), 0.37)

	// Explicit closed forms for P_2, P_3, P_4, P_5
	for (const x of [-0.9, -0.25, 0, 0.4, 1, 1.5]) {
		const p2 = 0.5 * (3 * x * x - 1)
		const p3 = 0.5 * (5 * x ** 3 - 3 * x)
		const p4 = 0.125 * (35 * x ** 4 - 30 * x * x + 3)
		const p5 = 0.125 * (63 * x ** 5 - 70 * x ** 3 + 15 * x)
		assertClose(sf('legendreP', 2, x), p2, 1e-13)
		assertClose(sf('legendreP', 3, x), p3, 1e-13)
		assertClose(sf('legendreP', 4, x), p4, 1e-13)
		assertClose(sf('legendreP', 5, x), p5, 1e-13)
	}

	// Boundary values P_n(1) = 1, P_n(-1) = (-1)^n for large n (tests O(log n) divide-and-conquer)
	assertClose(sf('legendreP', 50, 1), 1, 1e-12)
	assertClose(sf('legendreP', 51, -1), -1, 1e-12)
	assertClose(sf('legendreP', 200, 1), 1, 1e-11)

	// Independent cross-check: orthogonality ∫_{-1}^1 P_m(x) P_n(x) dx = 2/(2n+1) δ_{mn}
	const diag = simpsonIntegral((x) => sf('legendreP', 4, x) ** 2, -1, 1, 4000)
	assertClose(diag, 2 / 9, 1e-10, 1e-12, 'P_4 L2 norm')
	const offDiag = simpsonIntegral(
		(x) => sf('legendreP', 4, x) * sf('legendreP', 6, x),
		-1,
		1,
		4000,
	)
	assertClose(offDiag, 0, 1e-12, 1e-11, 'P_4 and P_6 orthogonality')
})

test('chebyshevT: recursive doubling vs independent trigonometric/hyperbolic cross-checks', () => {
	assert.equal(sf('chebyshevT', 0, 0.42), 1)
	assert.equal(sf('chebyshevT', 1, 0.42), 0.42)

	// Independent trigonometric cross-check: T_n(x) = cos(n * acos(x)) for |x| <= 1
	for (const n of [0, 1, 2, 5, 13, 37, 128]) {
		for (const x of [-0.85, -0.3, 0, 0.5, 0.92]) {
			const expected = Math.cos(n * Math.acos(x))
			assertClose(sf('chebyshevT', n, x), expected, 1e-11, 1e-12, `T_${n}(${x})`)
		}
	}

	// Independent hyperbolic cross-check: T_n(x) = cosh(n * acosh(x)) for x > 1
	for (const n of [2, 7, 12]) {
		const x = 1.25
		const expected = Math.cosh(n * Math.acosh(x))
		assertClose(sf('chebyshevT', n, x), expected, 1e-12, 1e-12, `T_${n}(${x}) hyperbolic`)
	}
})

test('harmonic & pochhammer: exact values, large-n asymptotics, and Gamma cross-check', () => {
	assert.equal(sf('harmonic', 0), 0)
	assert.equal(sf('harmonic', 1), 1)
	assertClose(sf('harmonic', 4), 1 + 1 / 2 + 1 / 3 + 1 / 4, 1e-15)
	assertClose(sf('harmonic', 100), 5.187377517639621, 1e-14)

	// Asymptotic regime (n > 1e6) cross-checked against Euler-Maclaurin identity H_{2n} - H_n ≈ ln(2)
	const h1 = sf('harmonic', 2_000_000)
	const h2 = sf('harmonic', 4_000_000)
	assertClose(h2 - h1, Math.LN2, 1e-6, 1e-6, 'H_{2n} - H_n -> ln(2)')

	// Pochhammer rising factorial (x)_n
	assert.equal(sf('pochhammer', 3.5, 0), 1)
	assert.equal(sf('pochhammer', 1, 5), 120)
	assert.equal(sf('pochhammer', 3, 4), 3 * 4 * 5 * 6)
	assert.equal(sf('pochhammer', -2, 3), 0)

	// Independent cross-check: (x)_n = Γ(x + n) / Γ(x)
	for (const [x, n] of [
		[0.5, 6],
		[2.3, 9],
		[7.1, 15],
	]) {
		const expected = sf('gamma', x + n) / sf('gamma', x)
		assertClose(sf('pochhammer', x, n), expected, 1e-12, 1e-13, `pochhammer(${x}, ${n})`)
	}
})

test('input validation: rejects invalid function names, types, arity, non-finite values, and domain errors', () => {
	// Invalid function names
	assert.throws(() => sf(123, 1), TypeError)
	assert.throws(() => sf(null, 1), TypeError)
	assert.throws(() => sf('unknownFn', 1), RangeError)

	// Arity mismatches
	assert.throws(() => sf('gamma'), TypeError)
	assert.throws(() => sf('gamma', 1, 2), TypeError)
	assert.throws(() => sf('beta', 1), TypeError)
	assert.throws(() => sf('besselJ', 1), TypeError)

	// Non-number argument types
	assert.throws(() => sf('gamma', '5'), TypeError)
	assert.throws(() => sf('erf', undefined), TypeError)
	assert.throws(() => sf('beta', 1, '2'), TypeError)
	assert.throws(() => sf('harmonic', '10'), TypeError)

	// NaN and Infinity
	assert.throws(() => sf('gamma', NaN), RangeError)
	assert.throws(() => sf('gamma', Infinity), RangeError)
	assert.throws(() => sf('erf', -Infinity), RangeError)
	assert.throws(() => sf('beta', NaN, 1), RangeError)
	assert.throws(() => sf('legendreP', 2, Infinity), RangeError)

	// Poles & domain violations
	assert.throws(() => sf('gamma', 0), RangeError)
	assert.throws(() => sf('gamma', -1), RangeError)
	assert.throws(() => sf('gamma', -10), RangeError)
	assert.throws(() => sf('lgamma', 0), RangeError)
	assert.throws(() => sf('lgamma', -3), RangeError)
	assert.throws(() => sf('beta', 0, 1), RangeError)
	assert.throws(() => sf('beta', -1, 2), RangeError)
	assert.throws(() => sf('beta', 2, -0.5), RangeError)

	// Integer constraints
	assert.throws(() => sf('besselJ', 1.5, 2), RangeError)
	assert.throws(() => sf('legendreP', -1, 0.5), RangeError)
	assert.throws(() => sf('legendreP', 2.5, 0.5), RangeError)
	assert.throws(() => sf('chebyshevT', -2, 0.5), RangeError)
	assert.throws(() => sf('chebyshevT', 1.1, 0.5), RangeError)
	assert.throws(() => sf('harmonic', -1), RangeError)
	assert.throws(() => sf('harmonic', 3.5), RangeError)
	assert.throws(() => sf('pochhammer', 1.5, -1), RangeError)
	assert.throws(() => sf('pochhammer', 1.5, 2.2), RangeError)
})
