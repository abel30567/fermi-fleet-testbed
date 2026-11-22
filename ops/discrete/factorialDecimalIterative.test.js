import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialDecimalIterative } from './factorialDecimalIterative.js'

const KNOWN_50_FACTORIAL =
	'30414093201713378043612608166064768844377641568960512000000000000'

const KNOWN_100_FACTORIAL =
	'93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000'

/**
 * Independent reference: Legendre's formula for the p-adic valuation v_p(n!).
 *
 * @param {number} n
 * @param {number} p
 * @returns {number}
 */
function legendreValuation(n, p) {
	let count = 0
	let power = p
	while (power <= n) {
		count += Math.floor(n / power)
		power *= p
	}
	return count
}

/**
 * Computes natural log of a large positive decimal string accurately (~14 digits)
 * without overflowing float64.
 *
 * @param {string} decimalStr
 * @returns {number}
 */
function logOfDecimalString(decimalStr) {
	const leadLen = Math.min(15, decimalStr.length)
	const leadVal = Number(decimalStr.slice(0, leadLen))
	const remainingDigits = decimalStr.length - leadLen
	return Math.log(leadVal) + remainingDigits * Math.LN10
}

describe('factorialDecimalIterative', () => {
	describe('normal cases', () => {
		it('computes exact factorials for small and medium integers', () => {
			assert.equal(factorialDecimalIterative('0'), '1')
			assert.equal(factorialDecimalIterative('1'), '1')
			assert.equal(factorialDecimalIterative('2'), '2')
			assert.equal(factorialDecimalIterative('5'), '120')
			assert.equal(factorialDecimalIterative('10'), '3628800')
		})

		it('computes exact factorials beyond IEEE-754 float64 safe integer and range limits', () => {
			// 20! exceeds Number.MAX_SAFE_INTEGER (16 digits)
			assert.equal(factorialDecimalIterative('20'), '2432902008176640000')
			// 50! has 65 digits
			assert.equal(factorialDecimalIterative('50'), KNOWN_50_FACTORIAL)
			// 100! has 158 digits
			assert.equal(factorialDecimalIterative('100'), KNOWN_100_FACTORIAL)
			// 171! overflows IEEE-754 float64 (171! > 1.79769e308)
			const fact171 = factorialDecimalIterative('171')
			assert.equal(fact171.length, 310)
			assert.ok(fact171.startsWith('12410180702176678234248405241031039926166055775016'))
			assert.ok(fact171.endsWith('0'.repeat(41)))
		})

		it('accepts equivalent decimal integer representations', () => {
			assert.equal(factorialDecimalIterative('5.00'), '120')
			assert.equal(factorialDecimalIterative('5.'), '120')
			assert.equal(factorialDecimalIterative('+5'), '120')
			assert.equal(factorialDecimalIterative('0005.000000000000000000000000000000'), '120')
			assert.equal(factorialDecimalIterative('  5.0  '), '120')
			assert.equal(factorialDecimalIterative('0.5e1'), '120')
			assert.equal(factorialDecimalIterative('500e-2'), '120')
			assert.equal(factorialDecimalIterative('1.2e1'), '479001600')
		})

		it('handles configurable precision cleanly with normalized output', () => {
			assert.equal(factorialDecimalIterative('5', 0), '120')
			assert.equal(factorialDecimalIterative('5', 10), '120')
			assert.equal(factorialDecimalIterative('5', 20), '120')
			assert.equal(factorialDecimalIterative('50', 50), KNOWN_50_FACTORIAL)
		})
	})

	describe('edge cases', () => {
		it('handles all zero representations without returning -0', () => {
			const zeroForms = ['0', '+0', '-0', '0.0', '-0.000', '.0', '0.', '0e0', '-0e-50', '0.0e+99999999999999999999']
			for (const z of zeroForms) {
				const res = factorialDecimalIterative(z)
				assert.equal(res, '1', `Expected "${z}"! to equal "1"`)
				assert.ok(!res.startsWith('-'))
			}
		})

		it('computes large factorials well beyond 171! accurately', () => {
			const fact200 = factorialDecimalIterative('200')
			assert.equal(fact200.length, 375)
			assert.ok(fact200.startsWith('78865786736479050355236321393218506229513597768717'))
			assert.ok(fact200.endsWith('0'.repeat(49)))
		})

		it('rejects negative and non-integer decimal strings with RangeError', () => {
			const rangeErrors = [
				'-1',
				'-5',
				'-5.0',
				'-0.000000000000000000000000000001',
				'0.5',
				'5.1',
				'5.0000000000000000000000000000000000000001', // non-zero beyond float64 epsilon
				'1e-1',
				'1.5e0',
				'123.45e1',
			]
			for (const bad of rangeErrors) {
				assert.throws(
					() => factorialDecimalIterative(bad),
					RangeError,
					`Expected RangeError for "${bad}"`,
				)
			}
		})

		it('rejects non-string and syntactically invalid n inputs with TypeError', () => {
			const typeErrors = [
				5,
				5n,
				null,
				undefined,
				{},
				[],
				true,
				'',
				'   ',
				'abc',
				'NaN',
				'Infinity',
				'-Infinity',
				'.',
				'+',
				'-',
				'1.2.3',
				'1e',
				'1e+',
				'1_000',
				'0x10',
			]
			for (const bad of typeErrors) {
				assert.throws(
					() => factorialDecimalIterative(bad),
					TypeError,
					`Expected TypeError for ${String(bad)}`,
				)
			}
		})

		it('validates precision strictly', () => {
			for (const badType of ['0', '20', null, {}, [], 0n, true]) {
				assert.throws(
					() => factorialDecimalIterative('5', badType),
					TypeError,
					`Expected TypeError for precision=${String(badType)}`,
				)
			}
			for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(
					() => factorialDecimalIterative('5', badRange),
					RangeError,
					`Expected RangeError for precision=${String(badRange)}`,
				)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('satisfies recurrence n! / (n - 1)! === n across small and large n', () => {
			for (const n of [1, 2, 10, 25, 50, 100, 171, 200]) {
				const fn = BigInt(factorialDecimalIterative(String(n)))
				const fnMinus1 = BigInt(factorialDecimalIterative(String(n - 1)))
				assert.equal(fn % fnMinus1, 0n, `${n}! must be divisible by ${n - 1}!`)
				assert.equal(fn / fnMinus1, BigInt(n), `${n}! / ${n - 1}! must equal ${n}`)
			}
		})

		it("satisfies Wilson's theorem: (p - 1)! === -1 (mod p) for primes and 0 (mod m) for composites m > 4", () => {
			const primes = [2, 3, 5, 7, 13, 31, 97, 173, 199, 257]
			for (const p of primes) {
				const pMinus1Fact = BigInt(factorialDecimalIterative(String(p - 1)))
				assert.equal(
					(pMinus1Fact + 1n) % BigInt(p),
					0n,
					`Wilson's theorem failed for prime p=${p}`,
				)
			}

			const composites = [6, 8, 9, 10, 50, 180]
			for (const m of composites) {
				const mMinus1Fact = BigInt(factorialDecimalIterative(String(m - 1)))
				assert.equal(
					mMinus1Fact % BigInt(m),
					0n,
					`Composite congruence failed for m=${m}`,
				)
			}
		})

		it("matches Legendre's formula for trailing zeros (v_5(n!))", () => {
			for (const n of [0, 5, 25, 50, 100, 171, 200, 350]) {
				const result = factorialDecimalIterative(String(n))
				const match = result.match(/0+$/)
				const actualTrailingZeros = match ? match[0].length : 0
				const expectedTrailingZeros = legendreValuation(n, 5)
				assert.equal(
					actualTrailingZeros,
					expectedTrailingZeros,
					`Trailing zero mismatch for ${n}!`,
				)
			}
		})

		it("satisfies Stirling's approximation and Robbins' two-sided bounds on log scale", () => {
			for (const n of [10, 50, 100, 171, 200, 300]) {
				const result = factorialDecimalIterative(String(n))
				const logActual = logOfDecimalString(result)

				// Stirling: ln(n!) ~ 0.5 * ln(2*pi*n) + n * ln(n) - n
				const logStirling = 0.5 * Math.log(2 * Math.PI * n) + n * Math.log(n) - n
				const logLower = logStirling + 1 / (12 * n + 1)
				const logUpper = logStirling + 1 / (12 * n)

				// Account for ~1e-13 rounding in logOfDecimalString's 15-digit mantissa
				const eps = 1e-11
				assert.ok(
					logActual >= logLower - eps && logActual <= logUpper + eps,
					`Robbins bound failed for n=${n}: actual=${logActual}, bounds=[${logLower}, ${logUpper}]`,
				)
			}
		})

		it('satisfies binomial sum identity sum_{k=0..n} n! / (k!(n-k)!) === 2^n', () => {
			const n = 30
			const nFact = BigInt(factorialDecimalIterative(String(n)))
			let sum = 0n
			for (let k = 0; k <= n; k += 1) {
				const kFact = BigInt(factorialDecimalIterative(String(k)))
				const nkFact = BigInt(factorialDecimalIterative(String(n - k)))
				sum += nFact / (kFact * nkFact)
			}
			assert.equal(sum, 2n ** BigInt(n))
		})
	})
})
