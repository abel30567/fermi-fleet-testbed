import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	SCALE,
	specialFunctionsBigIntIterative as sf,
} from './specialFunctionsBigIntIterative.js'

const absBig = (x) => (x < 0n ? -x : x)

function assertCloseBig(actual, expected, tolerance = 1n, label = '') {
	const diff = absBig(actual - expected)
	assert.ok(
		diff <= tolerance,
		`${label ? label + ': ' : ''}expected ${actual}n to be within ${tolerance}n of ${expected}n (diff=${diff}n)`,
	)
}

describe('specialFunctionsBigIntIterative — exact integer special functions', () => {
	test('factorial: base cases, standard values, and > MAX_SAFE_INTEGER', () => {
		assert.equal(sf('factorial', 0n), 1n)
		assert.equal(sf('factorial', 1n), 1n)
		assert.equal(sf('factorial', 5n), 120n)
		assert.equal(sf('factorial', 10n), 3628800n)
		assert.equal(sf('factorial', 20n), 2432902008176640000n)
		assert.equal(
			sf('factorial', 30n),
			265252859812191058636308480000000n,
		)
	})

	test('doubleFactorial: even, odd, and zero cases', () => {
		assert.equal(sf('doubleFactorial', 0n), 1n)
		assert.equal(sf('doubleFactorial', 1n), 1n)
		assert.equal(sf('doubleFactorial', 2n), 2n)
		assert.equal(sf('doubleFactorial', 5n), 15n)
		assert.equal(sf('doubleFactorial', 6n), 48n)
		assert.equal(sf('doubleFactorial', 9n), 945n)
		assert.equal(sf('doubleFactorial', 10n), 3840n)
	})

	test('gamma: positive integers Gamma(n) = (n - 1)!', () => {
		assert.equal(sf('gamma', 1n), 1n)
		assert.equal(sf('gamma', 2n), 1n)
		assert.equal(sf('gamma', 5n), 24n)
		assert.equal(sf('gamma', 12n), 39916800n)
		assert.equal(sf('gamma', 21n), 2432902008176640000n)
	})

	test('binomial: standard, edge, symmetry, and large BigInt cases', () => {
		assert.equal(sf('binomial', 0n, 0n), 1n)
		assert.equal(sf('binomial', 5n, 0n), 1n)
		assert.equal(sf('binomial', 5n, 5n), 1n)
		assert.equal(sf('binomial', 5n, 6n), 0n)
		assert.equal(sf('binomial', 10n, 3n), 120n)
		assert.equal(sf('binomial', 10n, 7n), 120n)
		assert.equal(
			sf('binomial', 100n, 50n),
			100891344545564193334812497256n,
		)
	})

	test('risingFactorial (Pochhammer) and fallingFactorial', () => {
		assert.equal(sf('risingFactorial', 5n, 0n), 1n)
		assert.equal(sf('risingFactorial', 3n, 4n), 3n * 4n * 5n * 6n)
		assert.equal(sf('risingFactorial', -2n, 4n), 0n) // (-2)(-1)(0)(1) = 0
		assert.equal(sf('risingFactorial', -5n, 3n), (-5n) * (-4n) * (-3n))

		assert.equal(sf('fallingFactorial', 5n, 0n), 1n)
		assert.equal(sf('fallingFactorial', 7n, 3n), 7n * 6n * 5n)
		assert.equal(sf('fallingFactorial', 3n, 5n), 0n)
		assert.equal(sf('fallingFactorial', -2n, 3n), (-2n) * (-3n) * (-4n))
	})

	test('catalan numbers', () => {
		const expected = [1n, 1n, 2n, 5n, 14n, 42n, 132n, 429n, 1430n, 4862n, 16796n]
		for (let i = 0; i < expected.length; i += 1) {
			assert.equal(sf('catalan', BigInt(i)), expected[i])
		}
		assert.equal(sf('catalan', 25n), 4861946401452n)
	})

	test('chebyshevT and hermiteH polynomials', () => {
		// T_0(x) = 1, T_1(x) = x, T_2(x) = 2x^2 - 1, T_3(x) = 4x^3 - 3x, T_4(x) = 8x^4 - 8x^2 + 1
		assert.equal(sf('chebyshevT', 0n, 7n), 1n)
		assert.equal(sf('chebyshevT', 1n, -5n), -5n)
		assert.equal(sf('chebyshevT', 2n, 3n), 17n)
		assert.equal(sf('chebyshevT', 3n, 2n), 26n)
		assert.equal(sf('chebyshevT', 4n, 2n), 97n)
		assert.equal(sf('chebyshevT', 5n, 1n), 1n)
		assert.equal(sf('chebyshevT', 5n, -1n), -1n)
		assert.equal(sf('chebyshevT', 6n, -1n), 1n)

		// H_0(x) = 1, H_1(x) = 2x, H_2(x) = 4x^2 - 2, H_3(x) = 8x^3 - 12x, H_4(x) = 16x^4 - 48x^2 + 12
		assert.equal(sf('hermiteH', 0n, 9n), 1n)
		assert.equal(sf('hermiteH', 1n, 3n), 6n)
		assert.equal(sf('hermiteH', 2n, 3n), 34n)
		assert.equal(sf('hermiteH', 3n, 2n), 40n)
		assert.equal(sf('hermiteH', 4n, 2n), 76n)
		assert.equal(sf('hermiteH', 4n, 0n), 12n)
		assert.equal(sf('hermiteH', 3n, 0n), 0n)
		assert.equal(sf('hermiteH', 3n, -2n), -40n)
	})
})

describe('specialFunctionsBigIntIterative — fixed-point (10^18) special functions', () => {
	test('beta: exact rounded values and symmetry', () => {
		assert.equal(SCALE, 10n ** 18n)
		// B(1, 1) = 1
		assert.equal(sf('beta', 1n, 1n), SCALE)
		// B(1, n) = 1/n
		assert.equal(sf('beta', 1n, 4n), 250000000000000000n)
		assert.equal(sf('beta', 4n, 1n), 250000000000000000n)
		// B(2, 3) = 1! 2! / 4! = 1/12 = 0.083333333333333333...
		assert.equal(sf('beta', 2n, 3n), 83333333333333333n)
		assert.equal(sf('beta', 3n, 2n), 83333333333333333n)
		// B(3, 4) = 2! 3! / 6! = 12 / 720 = 1/60 = 0.0166666666666666666... -> rounds to ...67
		assert.equal(sf('beta', 3n, 4n), 16666666666666667n)
	})

	test('harmonic numbers H_n scaled by 10^18', () => {
		assert.equal(sf('harmonic', 0n), 0n)
		assert.equal(sf('harmonic', 1n), SCALE)
		assert.equal(sf('harmonic', 2n), 1500000000000000000n)
		// H_3 = 11/6 = 1.833333333333333333...
		assert.equal(sf('harmonic', 3n), 1833333333333333333n)
		// H_4 = 25/12 = 2.083333333333333333...
		assert.equal(sf('harmonic', 4n), 2083333333333333333n)
		// H_10 = 7381/2520 = 2.928968253968253968...
		assert.equal(sf('harmonic', 10n), 2928968253968253968n)
	})

	test('digamma psi(n) scaled by 10^18', () => {
		// psi(1) = -gamma = -0.5772156649015328606065... -> rounds to -577215664901532861n
		assert.equal(sf('digamma', 1n), -577215664901532861n)
		// psi(2) = 1 - gamma = 0.4227843350984671393934...
		assert.equal(sf('digamma', 2n), 422784335098467139n)
		// psi(5) = 25/12 - gamma = 1.5061176684318004727268...
		assert.equal(sf('digamma', 5n), 1506117668431800473n)
	})

	test('lnGamma(n) = ln((n - 1)!) scaled by 10^18', () => {
		assert.equal(sf('lnGamma', 1n), 0n)
		assert.equal(sf('lnGamma', 2n), 0n)
		// ln(2!) = ln(2) = 0.6931471805599453094172...
		assert.equal(sf('lnGamma', 3n), 693147180559945309n)
		// ln(3!) = ln(6) = 1.7917594692280550008124...
		assert.equal(sf('lnGamma', 4n), 1791759469228055001n)
		// ln(10!) = ln(3628800) = 15.1044125730755152952257...
		assert.equal(sf('lnGamma', 11n), 15104412573075515295n)
	})

	test('zeta(s) scaled by 10^18 including saturation boundary s=60/61', () => {
		// zeta(2) = pi^2 / 6 = 1.6449340668482264364724...
		assert.equal(sf('zeta', 2n), 1644934066848226436n)
		// zeta(3) = 1.2020569031595942853997... (Apery's constant)
		assert.equal(sf('zeta', 3n), 1202056903159594285n)
		// zeta(4) = pi^4 / 90 = 1.0823232337111381915160...
		assert.equal(sf('zeta', 4n), 1082323233711138192n)
		// zeta(6) = pi^6 / 945 = 1.0173430619844491397145...
		assert.equal(sf('zeta', 6n), 1017343061984449140n)
		// Boundary: 2^(-60) ~ 8.67e-19 rounds to +1 ULP; 2^(-61) ~ 4.34e-19 rounds to 0
		assert.equal(sf('zeta', 60n), SCALE + 1n)
		assert.equal(sf('zeta', 61n), SCALE)
		assert.equal(sf('zeta', 500n), SCALE)
	})

	test('erf(x) and erfc(x) scaled by 10^18', () => {
		assert.equal(sf('erf', 0n), 0n)
		assert.equal(sf('erfc', 0n), SCALE)
		// erf(1) = 0.8427007929497148693412...
		assert.equal(sf('erf', 1n), 842700792949714869n)
		assert.equal(sf('erf', -1n), -842700792949714869n)
		// erfc(1) = 0.1572992070502851306587...
		assert.equal(sf('erfc', 1n), 157299207050285131n)
		// erf(2) = 0.9953222650189527341620...
		assert.equal(sf('erf', 2n), 995322265018952734n)
		// erf(3) = 0.9999779095030014145586...
		assert.equal(sf('erf', 3n), 999977909503001415n)
		// erfc(6) = 2.15197367124989131e-17 -> 22n at 10^18 scale
		assert.equal(sf('erfc', 6n), 22n)
		assert.equal(sf('erf', 6n), SCALE - 22n)
		// Saturation at |x| >= 7
		assert.equal(sf('erf', 7n), SCALE)
		assert.equal(sf('erf', -7n), -SCALE)
		assert.equal(sf('erf', 100n), SCALE)
		assert.equal(sf('erfc', 7n), 0n)
		assert.equal(sf('erfc', -7n), 2n * SCALE)
	})

	test('besselJ(n, x) scaled by 10^18 including sign symmetries and larger x', () => {
		assert.equal(sf('besselJ', 0n, 0n), SCALE)
		assert.equal(sf('besselJ', 1n, 0n), 0n)
		assert.equal(sf('besselJ', -3n, 0n), 0n)
		// J_0(1) = 0.7651976865579665514497...
		assert.equal(sf('besselJ', 0n, 1n), 765197686557966551n)
		// J_1(1) = 0.4400505857449335159596...
		assert.equal(sf('besselJ', 1n, 1n), 440050585744933516n)
		// J_0(2) = 0.2238907791412356680518...
		assert.equal(sf('besselJ', 0n, 2n), 223890779141235668n)
		// J_2(5) = 0.0465651162777522155323...
		assert.equal(sf('besselJ', 2n, 5n), 46565116277752216n)
		// J_0(20) = 0.1670246643405831547273...
		assert.equal(sf('besselJ', 0n, 20n), 167024664340583155n)

		// Sign symmetries: J_{-n}(x) = (-1)^n J_n(x) and J_n(-x) = (-1)^n J_n(x)
		assert.equal(sf('besselJ', -1n, 1n), -sf('besselJ', 1n, 1n))
		assert.equal(sf('besselJ', -2n, 5n), sf('besselJ', 2n, 5n))
		assert.equal(sf('besselJ', 1n, -1n), -sf('besselJ', 1n, 1n))
		assert.equal(sf('besselJ', 2n, -5n), sf('besselJ', 2n, 5n))
		assert.equal(sf('besselJ', -1n, -1n), sf('besselJ', 1n, 1n))
	})

	test('legendreP(n, x) scaled by 10^18', () => {
		// P_0(x) = 1, P_1(x) = x, P_2(x) = (3x^2 - 1)/2, P_3(x) = (5x^3 - 3x)/2,
		// P_4(x) = (35x^4 - 30x^2 + 3)/8
		assert.equal(sf('legendreP', 0n, 5n), SCALE)
		assert.equal(sf('legendreP', 1n, -3n), -3n * SCALE)
		assert.equal(sf('legendreP', 2n, 2n), 5500000000000000000n) // 11/2 = 5.5
		assert.equal(sf('legendreP', 2n, 0n), -500000000000000000n) // -1/2 = -0.5
		assert.equal(sf('legendreP', 3n, 2n), 17000000000000000000n) // (40 - 6)/2 = 17
		assert.equal(sf('legendreP', 4n, 0n), 375000000000000000n) // 3/8 = 0.375
		assert.equal(sf('legendreP', 5n, 1n), SCALE)
		assert.equal(sf('legendreP', 5n, -1n), -SCALE)
		assert.equal(sf('legendreP', 6n, -1n), SCALE)
	})
})

describe('specialFunctionsBigIntIterative — independent mathematical cross-checks', () => {
	test('cross-check: factorial, doubleFactorial, binomial, and Pochhammer identities', () => {
		// n! = n!! * (n-1)!!
		for (let n = 1n; n <= 25n; n += 1n) {
			assert.equal(
				sf('factorial', n),
				sf('doubleFactorial', n) * sf('doubleFactorial', n - 1n),
			)
		}
		// Pascal's rule & row sum = 2^n
		for (let n = 1n; n <= 15n; n += 1n) {
			let rowSum = 0n
			for (let k = 0n; k <= n; k += 1n) {
				const c = sf('binomial', n, k)
				rowSum += c
				if (k > 0n && k < n) {
					assert.equal(c, sf('binomial', n - 1n, k - 1n) + sf('binomial', n - 1n, k))
				}
				assert.equal(
					sf('fallingFactorial', n, k),
					c * sf('factorial', k),
				)
			}
			assert.equal(rowSum, 1n << n)
			assert.equal(sf('risingFactorial', 1n, n), sf('factorial', n))
		}
	})

	test('cross-check: zeta(2), zeta(4), zeta(6) vs closed-form pi formulas & zeta(3) vs Apery series', () => {
		// Independent 30-fractional-digit pi constant (3.141592653589793238462643383280 * 10^30)
		const pi30 = 3141592653589793238462643383280n
		const p30 = 10n ** 30n
		const roundDivLocal = (num, den) => (num + den / 2n) / den

		// zeta(2) = pi^2 / 6
		const pi2 = (pi30 * pi30) / p30 // 10^30 scaled
		const expectedZ2 = roundDivLocal(pi2, 6n * 10n ** 12n)
		assert.equal(sf('zeta', 2n), expectedZ2)

		// zeta(4) = pi^4 / 90
		const pi4 = (pi2 * pi2) / p30
		const expectedZ4 = roundDivLocal(pi4, 90n * 10n ** 12n)
		assert.equal(sf('zeta', 4n), expectedZ4)

		// zeta(6) = pi^6 / 945
		const pi6 = (pi4 * pi2) / p30
		const expectedZ6 = roundDivLocal(pi6, 945n * 10n ** 12n)
		assert.equal(sf('zeta', 6n), expectedZ6)

		// Independent Apery accelerated series for zeta(3):
		// zeta(3) = (5/2) * sum_{k=1}^{inf} (-1)^(k-1) / (k^3 * C(2k, k))
		const ext = 10n ** 30n
		let aperySum = 0n
		let comb = 1n
		for (let k = 1n; k <= 50n; k += 1n) {
			// C(2k, k) = C(2k-2, k-1) * 2*(2k-1) / k
			comb = (comb * 2n * (2n * k - 1n)) / k
			const term = ext / (k * k * k * comb)
			if ((k & 1n) === 1n) aperySum += term
			else aperySum -= term
		}
		const expectedZ3 = roundDivLocal(5n * aperySum, 2n * 10n ** 12n)
		assert.equal(sf('zeta', 3n), expectedZ3)
	})

	test('cross-check: erf via independent composite Simpson quadrature & erf + erfc = 1', () => {
		const simpsonErf = (x, panels = 2000) => {
			const h = x / panels
			let sum = 1 + Math.exp(-x * x)
			for (let i = 1; i < panels; i += 1) {
				const t = i * h
				sum += (i % 2 === 0 ? 2 : 4) * Math.exp(-t * t)
			}
			return (2 / Math.sqrt(Math.PI)) * (h / 3) * sum
		}

		for (let x = -8n; x <= 8n; x += 1n) {
			const e = sf('erf', x)
			const ec = sf('erfc', x)
			assert.equal(e + ec, SCALE, `erf(${x}) + erfc(${x}) === SCALE`)
			assert.equal(sf('erf', -x), -e, `odd symmetry erf(${-x}) === -erf(${x})`)
		}

		for (let x = 1; x <= 5; x += 1) {
			const numeric = simpsonErf(x)
			const bigAsFloat = Number(sf('erf', BigInt(x))) / 1e18
			assert.ok(
				Math.abs(bigAsFloat - numeric) < 1e-12,
				`erf(${x}) Simpson mismatch: ${bigAsFloat} vs ${numeric}`,
			)
		}
	})

	test('cross-check: besselJ recurrence and Neumann sum-of-squares identity', () => {
		// Recurrence: J_{n-1}(x) + J_{n+1}(x) = (2n / x) * J_n(x)
		for (const x of [1n, 3n, 7n, 15n]) {
			for (let n = 1n; n <= 6n; n += 1n) {
				const lhs = (sf('besselJ', n - 1n, x) + sf('besselJ', n + 1n, x)) * x
				const rhs = 2n * n * sf('besselJ', n, x)
				assertCloseBig(lhs, rhs, 2n * x + 2n, `Bessel recurrence n=${n}, x=${x}`)
			}
		}

		// Neumann identity: J_0(x)^2 + 2 * sum_{n>=1} J_n(x)^2 = 1
		for (const x of [1n, 4n, 10n]) {
			const j0 = sf('besselJ', 0n, x)
			let sumSq = (j0 * j0) / SCALE
			for (let n = 1n; n <= 35n; n += 1n) {
				const jn = sf('besselJ', n, x)
				sumSq += (2n * jn * jn) / SCALE
			}
			assertCloseBig(sumSq, SCALE, 50n, `Neumann identity x=${x}`)
		}
	})

	test('cross-check: digamma recurrence, harmonic link, and lnGamma vs Math.log & beta', () => {
		// psi(n) - psi(1) = H_{n-1}
		const psi1 = sf('digamma', 1n)
		for (let n = 1n; n <= 20n; n += 1n) {
			assertCloseBig(
				sf('digamma', n) - psi1,
				sf('harmonic', n - 1n),
				1n,
				`psi(${n}) - psi(1) = H_${n - 1n}`,
			)
		}

		// lnGamma(n) vs independent Math.log sum
		let floatSum = 0
		for (let n = 1; n <= 25; n += 1) {
			if (n > 1) floatSum += Math.log(n - 1)
			const bigFloat = Number(sf('lnGamma', BigInt(n))) / 1e18
			assert.ok(
				Math.abs(bigFloat - floatSum) < 1e-12,
				`lnGamma(${n}) mismatch: ${bigFloat} vs ${floatSum}`,
			)
		}

		// exp(lnGamma(a) + lnGamma(b) - lnGamma(a+b)) == beta(a, b)
		for (const [a, b] of [[2n, 3n], [4n, 5n], [3n, 7n]]) {
			const logB = Number(sf('lnGamma', a) + sf('lnGamma', b) - sf('lnGamma', a + b)) / 1e18
			const betaFloat = Number(sf('beta', a, b)) / 1e18
			assert.ok(
				Math.abs(Math.exp(logB) - betaFloat) < 1e-13,
				`exp(lnB(${a},${b})) mismatch`,
			)
		}
	})

	test('cross-check: chebyshevT vs cosh(n * acosh(x)) and legendreP parity', () => {
		for (let n = 0; n <= 8; n += 1) {
			for (const x of [2, 3, 4]) {
				const expected = Math.round(Math.cosh(n * Math.acosh(x)))
				assert.equal(sf('chebyshevT', BigInt(n), BigInt(x)), BigInt(expected))
			}
			// Parity: P_n(-x) = (-1)^n P_n(x)
			for (const x of [0n, 1n, 2n, 3n]) {
				const sign = n % 2 === 0 ? 1n : -1n
				assert.equal(sf('legendreP', BigInt(n), -x), sign * sf('legendreP', BigInt(n), x))
			}
		}
	})
})

describe('specialFunctionsBigIntIterative — input validation', () => {
	test('rejects non-string operation names with TypeError', () => {
		for (const badOp of [null, undefined, 42, 42n, {}, [], true]) {
			assert.throws(() => sf(badOp, 1n), TypeError)
		}
	})

	test('rejects unknown operation names with RangeError', () => {
		assert.throws(() => sf('nonexistent', 1n), RangeError)
		assert.throws(() => sf('', 1n), RangeError)
	})

	test('rejects wrong argument counts with RangeError', () => {
		assert.throws(() => sf('factorial'), RangeError)
		assert.throws(() => sf('factorial', 1n, 2n), RangeError)
		assert.throws(() => sf('binomial', 5n), RangeError)
		assert.throws(() => sf('binomial', 5n, 2n, 1n), RangeError)
		assert.throws(() => sf('besselJ', 1n), RangeError)
	})

	test('rejects non-BigInt arguments with TypeError', () => {
		for (const badArg of [5, 0, -1, 3.14, NaN, '5', null, undefined, true, {}]) {
			assert.throws(() => sf('factorial', badArg), TypeError)
			assert.throws(() => sf('binomial', 5n, badArg), TypeError)
			assert.throws(() => sf('binomial', badArg, 2n), TypeError)
			assert.throws(() => sf('erf', badArg), TypeError)
		}
	})

	test('rejects out-of-domain BigInt arguments with RangeError', () => {
		assert.throws(() => sf('factorial', -1n), RangeError)
		assert.throws(() => sf('doubleFactorial', -1n), RangeError)
		assert.throws(() => sf('gamma', 0n), RangeError)
		assert.throws(() => sf('gamma', -3n), RangeError)
		assert.throws(() => sf('binomial', -1n, 0n), RangeError)
		assert.throws(() => sf('binomial', 5n, -1n), RangeError)
		assert.throws(() => sf('risingFactorial', 2n, -1n), RangeError)
		assert.throws(() => sf('fallingFactorial', 2n, -1n), RangeError)
		assert.throws(() => sf('catalan', -1n), RangeError)
		assert.throws(() => sf('chebyshevT', -1n, 2n), RangeError)
		assert.throws(() => sf('hermiteH', -1n, 2n), RangeError)
		assert.throws(() => sf('beta', 0n, 2n), RangeError)
		assert.throws(() => sf('beta', 2n, 0n), RangeError)
		assert.throws(() => sf('beta', -1n, 3n), RangeError)
		assert.throws(() => sf('harmonic', -1n), RangeError)
		assert.throws(() => sf('digamma', 0n), RangeError)
		assert.throws(() => sf('digamma', -2n), RangeError)
		assert.throws(() => sf('lnGamma', 0n), RangeError)
		assert.throws(() => sf('lnGamma', -4n), RangeError)
		assert.throws(() => sf('zeta', 1n), RangeError)
		assert.throws(() => sf('zeta', 0n), RangeError)
		assert.throws(() => sf('zeta', -2n), RangeError)
		assert.throws(() => sf('legendreP', -1n, 2n), RangeError)
	})
})
