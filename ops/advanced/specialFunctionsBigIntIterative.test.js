import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	SCALE,
	specialFunctionsBigIntIterative as sf,
} from './specialFunctionsBigIntIterative.js'

const abs = (x) => (x < 0n ? -x : x)

function assertCloseBigInt(actual, expected, tolerance = 5n, label = '') {
	const diff = abs(actual - expected)
	assert.ok(
		diff <= tolerance,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`
	)
}

describe('specialFunctionsBigIntIterative - exact integer operations', () => {
	test('factorial covers base, normal, and large exact BigInt cases', () => {
		assert.equal(sf('factorial', 0n), 1n)
		assert.equal(sf('factorial', 1n), 1n)
		assert.equal(sf('factorial', 5n), 120n)
		assert.equal(sf('factorial', 20n), 2432902008176640000n)
		assert.equal(
			sf('factorial', 30n),
			265252859812191058636308480000000n
		)
	})

	test('risingFactorial (Pochhammer) covers normal, zero, and negative inputs', () => {
		assert.equal(sf('risingFactorial', 5n, 0n), 1n)
		assert.equal(sf('risingFactorial', 1n, 5n), 120n)
		assert.equal(sf('risingFactorial', 3n, 4n), 3n * 4n * 5n * 6n)
		assert.equal(sf('risingFactorial', -2n, 3n), (-2n) * (-1n) * 0n)
		assert.equal(sf('risingFactorial', -5n, 3n), (-5n) * (-4n) * (-3n))
	})

	test('fallingFactorial covers normal, zero, and negative inputs', () => {
		assert.equal(sf('fallingFactorial', 5n, 0n), 1n)
		assert.equal(sf('fallingFactorial', 5n, 3n), 60n)
		assert.equal(sf('fallingFactorial', 5n, 5n), 120n)
		assert.equal(sf('fallingFactorial', 3n, 5n), 0n)
		assert.equal(sf('fallingFactorial', -2n, 3n), (-2n) * (-3n) * (-4n))
	})

	test('binomial covers symmetry, edges, and large values', () => {
		assert.equal(sf('binomial', 0n, 0n), 1n)
		assert.equal(sf('binomial', 5n, 0n), 1n)
		assert.equal(sf('binomial', 5n, 5n), 1n)
		assert.equal(sf('binomial', 5n, 6n), 0n)
		assert.equal(sf('binomial', 10n, 3n), 120n)
		assert.equal(sf('binomial', 100n, 50n), 100891344545564193334812497256n)
	})

	test('harmonic covers base and normal values', () => {
		assert.equal(sf('harmonic', 0n), 0n)
		assert.equal(sf('harmonic', 1n), SCALE)
		assert.equal(sf('harmonic', 2n), 1500000000000000000n) // 3/2
		// H_4 = 1 + 1/2 + 1/3 + 1/4 = 25/12 = 2.083333333333333333...
		assertCloseBigInt(sf('harmonic', 4n), 2083333333333333333n, 1n)
		// H_10 = 7381/2520 = 2.928968253968253968...
		assertCloseBigInt(sf('harmonic', 10n), 2928968253968253968n, 2n)
	})
})

describe('specialFunctionsBigIntIterative - gamma, lgamma, beta', () => {
	test('gamma at positive integers matches exact (n - 1)! * SCALE', () => {
		for (let n = 1n; n <= 12n; n += 1n) {
			const expected = sf('factorial', n - 1n) * SCALE
			assert.equal(sf('gamma', n * SCALE), expected)
		}
	})

	test('gamma at half-integers matches known exact values', () => {
		// Gamma(1/2) = sqrt(pi) = 1.772453850905516027...
		const sqrtPi = 1772453850905516027n
		assertCloseBigInt(sf('gamma', SCALE / 2n), sqrtPi, 2n, 'Gamma(1/2)')
		// Gamma(3/2) = (1/2) * sqrt(pi) = 0.886226925452758014...
		assertCloseBigInt(sf('gamma', (3n * SCALE) / 2n), 886226925452758014n, 2n, 'Gamma(3/2)')
		// Gamma(5/2) = (3/4) * sqrt(pi) = 1.329340388179137020...
		assertCloseBigInt(sf('gamma', (5n * SCALE) / 2n), 1329340388179137020n, 2n, 'Gamma(5/2)')
		// Gamma(-1/2) = -2 * sqrt(pi) = -3.544907701811032055...
		assertCloseBigInt(sf('gamma', -(SCALE / 2n)), -3544907701811032055n, 2n, 'Gamma(-1/2)')
		// Gamma(-3/2) = (4/3) * sqrt(pi) = 2.363271801207354703...
		assertCloseBigInt(sf('gamma', -((3n * SCALE) / 2n)), 2363271801207354703n, 2n, 'Gamma(-3/2)')
	})

	test('lgamma matches known values and ln|Gamma(x)|', () => {
		assert.equal(sf('lgamma', SCALE), 0n)
		assert.equal(sf('lgamma', 2n * SCALE), 0n)
		// lgamma(1/2) = ln(sqrt(pi)) = 0.572364942924700087...
		assertCloseBigInt(sf('lgamma', SCALE / 2n), 572364942924700087n, 2n, 'lgamma(1/2)')
		// lgamma(5) = ln(24) = 3.178053830347945620...
		assertCloseBigInt(sf('lgamma', 5n * SCALE), 3178053830347945620n, 2n, 'lgamma(5)')
		// lgamma(-1/2) = ln(2 * sqrt(pi)) = 1.265512123484645396...
		assertCloseBigInt(sf('lgamma', -(SCALE / 2n)), 1265512123484645396n, 2n, 'lgamma(-1/2)')
	})

	test('beta matches known exact and half-integer values', () => {
		// B(1, 1) = 1
		assert.equal(sf('beta', SCALE, SCALE), SCALE)
		// B(2, 3) = 1! * 2! / 4! = 1/12 = 0.083333333333333333...
		assert.equal(sf('beta', 2n * SCALE, 3n * SCALE), 83333333333333333n)
		// B(1/2, 1/2) = pi = 3.141592653589793238...
		assertCloseBigInt(sf('beta', SCALE / 2n, SCALE / 2n), 3141592653589793238n, 2n, 'B(1/2,1/2)')
		// Symmetry: B(a, b) = B(b, a)
		const a = 1250000000000000000n // 1.25
		const b = 3750000000000000000n // 3.75
		assertCloseBigInt(sf('beta', a, b), sf('beta', b, a), 1n, 'Beta symmetry')
		// Removable zero when a + b is a non-positive integer while a, b are non-poles
		assert.equal(sf('beta', -(SCALE / 2n), -(SCALE / 2n)), 0n)
	})
})

describe('specialFunctionsBigIntIterative - erf & erfc', () => {
	test('erf and erfc match high-precision reference values across regimes', () => {
		assert.equal(sf('erf', 0n), 0n)
		assert.equal(sf('erfc', 0n), SCALE)

		// erf(1) = 0.842700792949714869...
		assertCloseBigInt(sf('erf', SCALE), 842700792949714869n, 2n, 'erf(1)')
		// erf(0.5) = 0.520499877813046538...
		assertCloseBigInt(sf('erf', SCALE / 2n), 520499877813046538n, 2n, 'erf(0.5)')
		// erf(2) = 0.995322265018952734...
		assertCloseBigInt(sf('erf', 2n * SCALE), 995322265018952734n, 2n, 'erf(2)')
		// erf(4.5) in continued-fraction regime: erfc(4.5) = 1.96616044154288626e-10
		assertCloseBigInt(sf('erfc', (9n * SCALE) / 2n), 196616044n, 2n, 'erfc(4.5)')
		assertCloseBigInt(sf('erf', (9n * SCALE) / 2n), SCALE - 196616044n, 2n, 'erf(4.5)')
		// Saturation for large |x|
		assert.equal(sf('erf', 10n * SCALE), SCALE)
		assert.equal(sf('erf', -10n * SCALE), -SCALE)
		assert.equal(sf('erfc', 10n * SCALE), 0n)
		assert.equal(sf('erfc', -10n * SCALE), 2n * SCALE)
	})

	test('erf odd symmetry and erf(x) + erfc(x) = 1 identity', () => {
		const xs = [
			250000000000000000n, // 0.25
			1500000000000000000n, // 1.5
			3750000000000000000n, // 3.75
			4500000000000000000n, // 4.5 (CF branch)
			5500000000000000000n, // 5.5 (CF branch)
		]
		for (const x of xs) {
			assert.equal(sf('erf', -x), -sf('erf', x), `erf odd symmetry at ${x}`)
			assertCloseBigInt(sf('erf', x) + sf('erfc', x), SCALE, 1n, `erf+erfc at ${x}`)
			assertCloseBigInt(sf('erf', -x) + sf('erfc', -x), SCALE, 1n, `erf+erfc at -${x}`)
		}
	})
})

describe('specialFunctionsBigIntIterative - Bessel J0, J1, Jn', () => {
	test('besselJ0 and besselJ1 match reference values and parity', () => {
		assert.equal(sf('besselJ0', 0n), SCALE)
		assert.equal(sf('besselJ1', 0n), 0n)

		// J_0(1) = 0.765197686557966551...
		assertCloseBigInt(sf('besselJ0', SCALE), 765197686557966551n, 2n, 'J0(1)')
		// J_0(2.5) = -0.048383776468197996...
		assertCloseBigInt(sf('besselJ0', (5n * SCALE) / 2n), -48383776468197996n, 2n, 'J0(2.5)')
		// J_0(10) = -0.245935764451348335...
		assertCloseBigInt(sf('besselJ0', 10n * SCALE), -245935764451348335n, 2n, 'J0(10)')
		// J_1(1) = 0.440050585744933516...
		assertCloseBigInt(sf('besselJ1', SCALE), 440050585744933516n, 2n, 'J1(1)')
		// J_1(10) = 0.043472746168861437...
		assertCloseBigInt(sf('besselJ1', 10n * SCALE), 43472746168861437n, 2n, 'J1(10)')

		// Even/odd parity and negative order symmetry
		assert.equal(sf('besselJ0', -3n * SCALE), sf('besselJ0', 3n * SCALE))
		assert.equal(sf('besselJ1', -3n * SCALE), -sf('besselJ1', 3n * SCALE))
		assert.equal(sf('besselJn', -1n, 3n * SCALE), -sf('besselJn', 1n, 3n * SCALE))
		assert.equal(sf('besselJn', -2n, 3n * SCALE), sf('besselJn', 2n, 3n * SCALE))
	})

	test('besselJ0 works accurately at larger x (x = 40) without cancellation loss', () => {
		// J_0(40) = 0.007366890584237290...
		const j0_40 = sf('besselJ0', 40n * SCALE)
		assertCloseBigInt(j0_40, 7366890584237290n, 2n, 'J0(40)')

		// Independent cross-check via spectral trapezoidal quadrature:
		// J_0(x) = (1 / pi) * integral_0^pi cos(x * sin(theta)) dtheta
		const N = 512
		let sum = 0
		for (let i = 0; i < N; i += 1) {
			sum += Math.cos(40 * Math.sin((Math.PI * i) / N))
		}
		const integralVal = sum / N
		const bigIntAsFloat = Number(j0_40) / Number(SCALE)
		assert.ok(
			Math.abs(bigIntAsFloat - integralVal) < 1e-14,
			`Integral cross-check failed: ${bigIntAsFloat} vs ${integralVal}`
		)
	})
})

describe('specialFunctionsBigIntIterative - independent mathematical cross-checks', () => {
	test('cross-check: Beta(a, b) == Gamma(a) * Gamma(b) / Gamma(a + b)', () => {
		const pairs = [
			[2500000000000000000n, 3500000000000000000n], // (2.5, 3.5)
			[700000000000000000n, 1300000000000000000n], // (0.7, 1.3)
			[4000000000000000000n, 5000000000000000000n], // (4, 5)
			[-1500000000000000000n, 2250000000000000000n], // (-1.5, 2.25)
		]
		for (const [a, b] of pairs) {
			const betaDirect = sf('beta', a, b)
			const ga = sf('gamma', a)
			const gb = sf('gamma', b)
			const gab = sf('gamma', a + b)
			// Independent ratio: (ga * gb) / gab (both ga and gb carry SCALE, gab carries SCALE -> result carries SCALE)
			const betaFromGamma = (ga * gb) / gab
			assertCloseBigInt(betaDirect, betaFromGamma, 10n, `Beta(${a}, ${b})`)
		}
	})

	test('cross-check: Gamma functional equation Gamma(x + 1) == x * Gamma(x) and reflection formula', () => {
		const xs = [
			300000000000000000n, // 0.3
			1700000000000000000n, // 1.7
			-2300000000000000000n, // -2.3
		]
		for (const x of xs) {
			const lhs = sf('gamma', x + SCALE)
			const rhs = (x * sf('gamma', x)) / SCALE
			assertCloseBigInt(lhs, rhs, 10n, `Gamma(x+1)=x*Gamma(x) at ${x}`)
		}

		// Euler reflection at x = 1/4: Gamma(1/4) * Gamma(3/4) = pi / sin(pi/4) = pi * sqrt(2)
		// pi * sqrt(2) = 4.442882938158366247...
		const gQuarter = sf('gamma', SCALE / 4n)
		const gThreeQuarter = sf('gamma', (3n * SCALE) / 4n)
		const prod = (gQuarter * gThreeQuarter) / SCALE
		assertCloseBigInt(prod, 4442882938158366247n, 10n, 'Reflection at x=1/4')
	})

	test('cross-check: erf(x) vs independent Maclaurin series (2/sqrt(pi)) * sum (-1)^n x^(2n+1) / (n!(2n+1))', () => {
		const sqrtPi = sf('gamma', SCALE / 2n)
		const x = 1250000000000000000n // 1.25
		const G = 10n ** 12n
		const S = SCALE * G
		const xS = x * G
		const x2S = (xS * xS) / S
		let pow = xS
		let fact = 1n
		let sum = pow
		for (let n = 1n; n <= 40n; n += 1n) {
			pow = (pow * x2S) / S
			fact *= n
			const term = pow / (fact * (2n * n + 1n))
			sum += n % 2n === 0n ? term : -term
		}
		const independent = (2n * sum * SCALE) / (sqrtPi * G)
		assertCloseBigInt(sf('erf', x), independent, 10n, 'erf Maclaurin cross-check')
	})

	test('cross-check: Bessel recurrence J_{n-1}(x) + J_{n+1}(x) == (2n / x) * J_n(x)', () => {
		const x = 3500000000000000000n // 3.5
		for (let n = 1n; n <= 5n; n += 1n) {
			const lhs = sf('besselJn', n - 1n, x) + sf('besselJn', n + 1n, x)
			const rhs = (2n * n * SCALE * sf('besselJn', n, x)) / x
			assertCloseBigInt(lhs, rhs, 10n, `Bessel recurrence n=${n}`)
		}
	})

	test('cross-check: risingFactorial vs fallingFactorial and factorial identity', () => {
		// (x)_n == (-1)^n * (-x)^{\underline{n}} and (1)_n == n! == (n)^{\underline{n}}
		for (let n = 0n; n <= 10n; n += 1n) {
			const fact = sf('factorial', n)
			assert.equal(sf('risingFactorial', 1n, n), fact)
			assert.equal(sf('fallingFactorial', n, n), fact)
			const sign = n % 2n === 0n ? 1n : -1n
			assert.equal(
				sf('risingFactorial', 7n, n),
				sign * sf('fallingFactorial', -7n, n)
			)
		}
	})
})

describe('specialFunctionsBigIntIterative - input validation', () => {
	test('rejects invalid op types and unknown operations', () => {
		assert.throws(() => sf(123, 1n), TypeError)
		assert.throws(() => sf(null, 1n), TypeError)
		assert.throws(() => sf('unknownOp', 1n), RangeError)
	})

	test('rejects wrong arity and non-BigInt arguments', () => {
		assert.throws(() => sf('factorial'), TypeError)
		assert.throws(() => sf('factorial', 1n, 2n), TypeError)
		assert.throws(() => sf('factorial', 5), TypeError)
		assert.throws(() => sf('gamma', 1.5), TypeError)
		assert.throws(() => sf('beta', SCALE), TypeError)
		assert.throws(() => sf('beta', SCALE, '1'), TypeError)
		assert.throws(() => sf('besselJn', 1, SCALE), TypeError)
	})

	test('rejects out-of-domain inputs and poles with RangeError', () => {
		assert.throws(() => sf('factorial', -1n), RangeError)
		assert.throws(() => sf('factorial', 10001n), RangeError)
		assert.throws(() => sf('risingFactorial', 5n, -1n), RangeError)
		assert.throws(() => sf('fallingFactorial', 5n, -1n), RangeError)
		assert.throws(() => sf('binomial', -1n, 0n), RangeError)
		assert.throws(() => sf('binomial', 5n, -1n), RangeError)
		assert.throws(() => sf('harmonic', -1n), RangeError)

		// Poles of Gamma / lgamma / Beta
		assert.throws(() => sf('gamma', 0n), RangeError)
		assert.throws(() => sf('gamma', -SCALE), RangeError)
		assert.throws(() => sf('gamma', -5n * SCALE), RangeError)
		assert.throws(() => sf('lgamma', 0n), RangeError)
		assert.throws(() => sf('lgamma', -2n * SCALE), RangeError)
		assert.throws(() => sf('beta', 0n, SCALE), RangeError)
		assert.throws(() => sf('beta', SCALE, -SCALE), RangeError)

		// Range caps
		assert.throws(() => sf('gamma', 1001n * SCALE), RangeError)
		assert.throws(() => sf('besselJ0', 201n * SCALE), RangeError)
		assert.throws(() => sf('besselJn', 201n, SCALE), RangeError)
	})
})
