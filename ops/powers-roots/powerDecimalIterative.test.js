import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { powerDecimalIterative } from './powerDecimalIterative.js'

/**
 * Helper to assert two decimal strings agree within `10^-tolDigits`.
 */
function assertDecimalClose(actual, expected, tolDigits) {
	const scale = 10n ** BigInt(tolDigits + 4)
	const toScaled = (s) => {
		const neg = s.startsWith('-')
		const body = neg ? s.slice(1) : s
		const [intP, fracP = ''] = body.split('.')
		const paddedFrac = (fracP + '0'.repeat(tolDigits + 4)).slice(0, tolDigits + 4)
		const val = BigInt(intP) * scale + BigInt(paddedFrac)
		return neg ? -val : val
	}
	const diff = toScaled(actual) - toScaled(expected)
	const absDiff = diff < 0n ? -diff : diff
	const maxDiff = 10n ** 4n // 10^-tolDigits in scaled units
	assert.ok(
		absDiff <= maxDiff,
		`Expected ${actual} to be within 1e-${tolDigits} of ${expected} (diff=${absDiff}, max=${maxDiff})`
	)
}

describe('powerDecimalIterative', () => {
	describe('integer exponents', () => {
		it('computes positive integer powers of integers exactly', () => {
			assert.equal(powerDecimalIterative('2', '10'), '1024')
			assert.equal(powerDecimalIterative('3', '5'), '243')
			assert.equal(powerDecimalIterative('10', '12'), '1000000000000')
			assert.equal(powerDecimalIterative('123456789', '3'), '1881676371789154860897069')
		})

		it('computes positive integer powers of fractional decimals', () => {
			assert.equal(powerDecimalIterative('1.5', '4'), '5.0625')
			assert.equal(powerDecimalIterative('0.1', '5'), '0.00001')
			assert.equal(powerDecimalIterative('1.5', '4', 2), '5.06')
			assert.equal(powerDecimalIterative('1.5', '4', 3), '5.063')
			assert.equal(powerDecimalIterative('1.5', '4', 0), '5')
		})

		it('computes negative integer powers', () => {
			assert.equal(powerDecimalIterative('2', '-1'), '0.5')
			assert.equal(powerDecimalIterative('2', '-4'), '0.0625')
			assert.equal(powerDecimalIterative('0.5', '-10'), '1024')
			assert.equal(powerDecimalIterative('3', '-1', 20), '0.33333333333333333333')
			assert.equal(powerDecimalIterative('3', '-2', 20), '0.11111111111111111111')
			assert.equal(powerDecimalIterative('0.3', '-3', 20), '37.03703703703703703704')
		})

		it('handles negative bases with integer exponents', () => {
			assert.equal(powerDecimalIterative('-2', '3'), '-8')
			assert.equal(powerDecimalIterative('-2', '4'), '16')
			assert.equal(powerDecimalIterative('-2', '-3'), '-0.125')
			assert.equal(powerDecimalIterative('-2', '-2'), '0.25')
			assert.equal(powerDecimalIterative('-2', '2.0'), '4')
			assert.equal(powerDecimalIterative('-1', '999999999999999999999'), '-1')
			assert.equal(powerDecimalIterative('-1', '1000000000000000000000'), '1')
		})

		it('handles large integer exponents on fractional bases without precision loss', () => {
			// Cross-check (1.001)^1000 against exact BigInt 1001^1000
			const exactDigits = (1001n ** 1000n).toString()
			const expected25 = `${exactDigits[0]}.${exactDigits.slice(1, 26)}`
			assert.equal(powerDecimalIterative('1.001', '1000', 25), expected25)
		})
	})

	describe('fractional exponents and high precision (30+ digits)', () => {
		it('computes sqrt(2) = 2^0.5 to 40 decimal places', () => {
			const expected40 = '1.4142135623730950488016887242096980785697'
			assert.equal(powerDecimalIterative('2', '0.5', 40), expected40)
		})

		it('computes 2^(-0.5) = sqrt(2)/2 to 35 decimal places', () => {
			const expected35 = '0.70710678118654752440084436210484904'
			assert.equal(powerDecimalIterative('2', '-0.5', 35), expected35)
		})

		it('computes exact rational roots cleanly', () => {
			assert.equal(powerDecimalIterative('4', '0.5', 30), '2')
			assert.equal(powerDecimalIterative('100', '0.5', 30), '10')
			assert.equal(powerDecimalIterative('0.25', '0.5', 30), '0.5')
			assert.equal(powerDecimalIterative('16', '0.25', 30), '2')
			assert.equal(powerDecimalIterative('16', '-0.25', 30), '0.5')
		})

		it('computes non-trivial fractional powers to 35 decimal places', () => {
			// 3^1.5 = 3 * sqrt(3) = 5.19615242270663188058233902451761710...
			assert.equal(
				powerDecimalIterative('3', '1.5', 35),
				'5.1961524227066318805823390245176171'
			)
			// 10^0.5 = sqrt(10) = 3.16227766016837933199889354443271853...
			assert.equal(
				powerDecimalIterative('10', '0.5', 35),
				'3.16227766016837933199889354443271853'
			)
			// 0.0001^0.25 = 0.1
			assert.equal(powerDecimalIterative('0.0001', '0.25', 30), '0.1')
		})

		it('handles bases very close to 1 without catastrophic cancellation', () => {
			// (1 + 1e-12)^(1e12) = e * (1 - 0.5e-12 + ...) = 2.718281828457686094446...
			assert.equal(
				powerDecimalIterative('1.000000000001', '1000000000000', 20),
				'2.71828182845768609445'
			)

			// Same via fractional exponent path (1 + 1e-12)^(1e12 + 0.5)
			assertDecimalClose(
				powerDecimalIterative('1.000000000001', '1000000000000.5', 20),
				'2.71828182845904523536',
				11
			)

			// (0.999999999999)^0.5 ≈ 1 - 0.5e-12 - 0.125e-24
			const res2 = powerDecimalIterative('0.999999999999', '0.5', 30)
			assert.equal(res2, '0.999999999999499999999999875')
		})

		it('accepts scientific notation and leading/trailing whitespace', () => {
			assert.equal(powerDecimalIterative(' 1e2 ', '0.5', 20), '10')
			assert.equal(powerDecimalIterative('+2.5e-1', '-2', 20), '16')
			assert.equal(powerDecimalIterative('.5', '2', 20), '0.25')
			assert.equal(powerDecimalIterative('5.', '2', 20), '25')
		})
	})

	describe('edge cases and input validation', () => {
		it('handles 0^0, 0^pos, 1^any, and underflow to 0', () => {
			assert.equal(powerDecimalIterative('0', '0'), '1')
			assert.equal(powerDecimalIterative('-0.0', '0'), '1')
			assert.equal(powerDecimalIterative('0', '5'), '0')
			assert.equal(powerDecimalIterative('0', '0.5'), '0')
			assert.equal(powerDecimalIterative('0', '1e100'), '0')
			assert.equal(powerDecimalIterative('1', '-999999999999999'), '1')
			assert.equal(powerDecimalIterative('1', '0.123456789'), '1')
			assert.equal(powerDecimalIterative('2', '-100000', 20), '0')
			assert.equal(powerDecimalIterative('0.5', '100000.5', 20), '0')
		})

		it('throws RangeError for 0 raised to a negative power', () => {
			assert.throws(() => powerDecimalIterative('0', '-1'), RangeError)
			assert.throws(() => powerDecimalIterative('0.0', '-0.5'), RangeError)
			assert.throws(() => powerDecimalIterative('-0', '-2'), RangeError)
		})

		it('throws RangeError for negative base with non-integer exponent', () => {
			assert.throws(() => powerDecimalIterative('-2', '0.5'), RangeError)
			assert.throws(() => powerDecimalIterative('-1', '0.25'), RangeError)
			assert.throws(() => powerDecimalIterative('-4', '-1.5'), RangeError)
		})

		it('throws TypeError or RangeError on invalid inputs', () => {
			assert.throws(() => powerDecimalIterative(2, '3'), TypeError)
			assert.throws(() => powerDecimalIterative('2', 3), TypeError)
			assert.throws(() => powerDecimalIterative(null, '3'), TypeError)
			assert.throws(() => powerDecimalIterative('2', undefined), TypeError)
			assert.throws(() => powerDecimalIterative('2', '3', '20'), TypeError)

			assert.throws(() => powerDecimalIterative('', '2'), RangeError)
			assert.throws(() => powerDecimalIterative('   ', '2'), RangeError)
			assert.throws(() => powerDecimalIterative('abc', '2'), RangeError)
			assert.throws(() => powerDecimalIterative('NaN', '2'), RangeError)
			assert.throws(() => powerDecimalIterative('Infinity', '2'), RangeError)
			assert.throws(() => powerDecimalIterative('1.2.3', '2'), RangeError)
			assert.throws(() => powerDecimalIterative('.', '2'), RangeError)
			assert.throws(() => powerDecimalIterative('2', '1e'), RangeError)
			assert.throws(() => powerDecimalIterative('2', '3', -1), RangeError)
			assert.throws(() => powerDecimalIterative('2', '3', 1.5), RangeError)
			assert.throws(() => powerDecimalIterative('2', '3', Number.NaN), RangeError)
			assert.throws(() => powerDecimalIterative('2', '3', 100_000), RangeError)
			assert.throws(() => powerDecimalIterative('10', '1000000'), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches native BigInt exact exponentiation for large integer powers', () => {
			const pairs = [
				[2n, 100n],
				[7n, 77n],
				[-13n, 41n],
				[-13n, 42n],
				[9876543210123456789n, 9n]
			]
			for (const [b, e] of pairs) {
				assert.equal(powerDecimalIterative(b.toString(), e.toString(), 20), (b ** e).toString())
			}
		})

		it('satisfies power-of-a-power identity (x^a)^b ≈ x^(a*b) at high precision', () => {
			const x = '7.25'
			const a = '1.3'
			const b = '0.7'
			// a * b = 0.91
			const xa = powerDecimalIterative(x, a, 45)
			const lhs = powerDecimalIterative(xa, b, 35)
			const rhs = powerDecimalIterative(x, '0.91', 35)
			assertDecimalClose(lhs, rhs, 32)

			// Reciprocal identity: (x^p) * (x^(-p)) ≈ 1 via ((x^p)^(-1)) ≈ x^(-p)
			const xp = powerDecimalIterative('5.5', '2.75', 45)
			const inv = powerDecimalIterative(xp, '-1', 35)
			const directNeg = powerDecimalIterative('5.5', '-2.75', 35)
			assertDecimalClose(inv, directNeg, 32)
		})

		it('agrees with Math.pow across a matrix of bases and exponents', () => {
			const cases = [
				['2.5', '3.7'],
				['0.35', '2.4'],
				['12.34', '-1.25'],
				['0.075', '-0.6'],
				['99.9', '0.333'],
				['1.05', '25.5'],
				['42', '0.125']
			]
			for (const [b, e] of cases) {
				const got = Number(powerDecimalIterative(b, e, 20))
				const ref = Math.pow(Number(b), Number(e))
				const relErr = Math.abs(got - ref) / Math.abs(ref)
				assert.ok(relErr < 1e-13, `${b}^${e}: got=${got}, ref=${ref}, relErr=${relErr}`)
			}
		})
	})
})
