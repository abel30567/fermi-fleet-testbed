import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosDecimalIterative } from './arccosDecimalIterative.js'

// High-precision reference constants (verified independently)
const PI_55 = '3.1415926535897932384626433832795028841971693993751058209'
const PI_50 = '3.14159265358979323846264338327950288419716939937511'
const PI_OVER_2_50 = '1.57079632679489661923132169163975144209858469968755'
const PI_OVER_3_50 = '1.04719755119659774615421446109316762806572313312504'
const TWO_PI_OVER_3_50 = '2.09439510239319549230842892218633525613144626625007'
const PI_OVER_4_40 = '0.7853981633974483096156608458198757210493'
const THREE_PI_OVER_4_40 = '2.3561944901923449288469825374596271631479'
const PI_OVER_6_40 = '0.5235987755982988730771072305465838140329'
const SQRT_2_OVER_2_50 = '0.70710678118654752440084436210484903928483593768847'
const SQRT_3_OVER_2_50 = '0.86602540378443864676372317075293618347140262690519'

/**
 * Independent fixed-point BigInt decimal parser for test cross-checks.
 * Converts a decimal string to a BigInt scaled by 10^scale.
 */
function toScaledBigInt(decStr, scale) {
	const neg = decStr.startsWith('-')
	const clean = neg || decStr.startsWith('+') ? decStr.slice(1) : decStr
	const [intPart, fracPart = ''] = clean.split('.')
	const paddedFrac = fracPart.length >= scale
		? fracPart.slice(0, scale)
		: fracPart.padEnd(scale, '0')
	const val = BigInt(intPart + paddedFrac)
	return neg ? -val : val
}

/**
 * Independent Taylor series implementation of cos(theta) using BigInt fixed-point
 * arithmetic for inverse cross-checking: cos(arccos(x)) == x.
 * cos(theta) = sum_{k=0}^\infty (-1)^k * theta^(2k) / (2k)!
 */
function independentCosScaled(thetaStr, scale) {
	const S = 10n ** BigInt(scale)
	const theta = toScaledBigInt(thetaStr, scale)
	const theta2 = (theta * theta) / S
	let term = S
	let sum = S
	let k = 1n
	while (true) {
		term = (-term * theta2) / ((2n * k - 1n) * (2n * k) * S)
		if (term === 0n) break
		sum += term
		k += 1n
	}
	return sum
}

describe('arccosDecimalIterative', () => {
	describe('normal cases and high precision (> 20 digits)', () => {
		test('computes arccos("0") = pi/2 to 50 decimal places', () => {
			assert.equal(arccosDecimalIterative('0', 50), PI_OVER_2_50)
		})

		test('computes arccos("0.5") = pi/3 and arccos("-0.5") = 2*pi/3 to 50 decimal places', () => {
			assert.equal(arccosDecimalIterative('0.5', 50), PI_OVER_3_50)
			assert.equal(arccosDecimalIterative('-0.5', 50), TWO_PI_OVER_3_50)
		})

		test('computes arccos(±sqrt(2)/2) = pi/4 and 3*pi/4 to 40 decimal places', () => {
			assert.equal(arccosDecimalIterative(SQRT_2_OVER_2_50, 40), PI_OVER_4_40)
			assert.equal(arccosDecimalIterative('-' + SQRT_2_OVER_2_50, 40), THREE_PI_OVER_4_40)
		})

		test('computes arccos(sqrt(3)/2) = pi/6 to 40 decimal places', () => {
			assert.equal(arccosDecimalIterative(SQRT_3_OVER_2_50, 40), PI_OVER_6_40)
		})

		test('uses default precision of 20 decimal places when omitted', () => {
			assert.equal(arccosDecimalIterative('0.5'), '1.04719755119659774615')
			assert.equal(arccosDecimalIterative('0'), '1.57079632679489661923')
		})

		test('accepts leading plus, leading/trailing zeros, shorthand decimals, and scientific notation', () => {
			const expected = arccosDecimalIterative('0.5', 30)
			assert.equal(arccosDecimalIterative('+0.5', 30), expected)
			assert.equal(arccosDecimalIterative('000.50000', 30), expected)
			assert.equal(arccosDecimalIterative('.5', 30), expected)
			assert.equal(arccosDecimalIterative('5e-1', 30), expected)
			assert.equal(arccosDecimalIterative('50E-2', 30), expected)
			assert.equal(arccosDecimalIterative('  +0.5  ', 30), expected)
			assert.equal(arccosDecimalIterative('1.', 20), '0')
			assert.equal(arccosDecimalIterative('100e-2', 20), '0')
		})
	})

	describe('edge cases', () => {
		test('exact endpoints x = 1 and x = -1', () => {
			assert.equal(arccosDecimalIterative('1', 30), '0')
			assert.equal(arccosDecimalIterative('+1.00000', 30), '0')
			assert.equal(arccosDecimalIterative('1e0', 30), '0')
			assert.equal(arccosDecimalIterative('-1', 50), PI_50)
			assert.equal(arccosDecimalIterative('-1.000', 30), '3.14159265358979323846264338328')
		})

		test('negative zero produces normalized positive pi/2 and never "-0"', () => {
			assert.equal(arccosDecimalIterative('-0', 25), arccosDecimalIterative('0', 25))
			assert.equal(arccosDecimalIterative('-0.000', 25), arccosDecimalIterative('0', 25))
			assert.equal(arccosDecimalIterative('1', 0), '0')
			assert.notEqual(arccosDecimalIterative('1', 20), '-0')
		})

		test('converges rapidly and accurately very close to +1 and -1', () => {
			// x = 1 - 10^-30 => arccos(x) = sqrt(2)*10^-15 + O(10^-45)
			// sqrt(2) = 1.414213562373095048801688724209698...
			const nearOne = '0.' + '9'.repeat(30)
			const resNearOne = arccosDecimalIterative(nearOne, 40)
			assert.equal(resNearOne, '0.0000000000000014142135623730950488016887')

			// x = -(1 - 10^-30) => arccos(x) = pi - sqrt(2)*10^-15
			const nearNegOne = '-' + nearOne
			const resNearNegOne = arccosDecimalIterative(nearNegOne, 40)
			const sumScaled =
				toScaledBigInt(resNearOne, 40) + toScaledBigInt(resNearNegOne, 40)
			const piScaled = toScaledBigInt(PI_55, 40)
			assert.ok(
				sumScaled >= piScaled - 1n && sumScaled <= piScaled + 1n,
				`Expected arccos(nearOne) + arccos(nearNegOne) ≈ pi, got diff ${sumScaled - piScaled}`
			)
		})

		test('smooth continuity and monotonicity across the |x| = 0.5 range-reduction boundary', () => {
			const below = toScaledBigInt(arccosDecimalIterative('0.49999999999999999999', 30), 30)
			const at = toScaledBigInt(arccosDecimalIterative('0.5', 30), 30)
			const above = toScaledBigInt(arccosDecimalIterative('0.50000000000000000001', 30), 30)

			// arccos is strictly decreasing: arccos(0.5 - eps) > arccos(0.5) > arccos(0.5 + eps)
			assert.ok(below > at)
			assert.ok(at > above)

			// Derivative at x = 0.5 is -1 / sqrt(0.75) = -2 / sqrt(3) ≈ -1.154700538379...
			// For eps = 1e-20, diff ≈ 1.1547005384e-20 (scaled by 10^30 -> ~11547005384n)
			const diffBelow = below - at
			const diffAbove = at - above
			assert.ok(diffBelow > 11547005380n && diffBelow < 11547005390n)
			assert.ok(diffAbove > 11547005380n && diffAbove < 11547005390n)
		})

		test('handles extreme tiny scientific notation without memory/time blowup', () => {
			assert.equal(arccosDecimalIterative('1e-1000000', 25), arccosDecimalIterative('0', 25))
			assert.equal(arccosDecimalIterative('-1e-1000000', 25), arccosDecimalIterative('0', 25))
		})

		test('supports precision = 0', () => {
			assert.equal(arccosDecimalIterative('1', 0), '0')
			assert.equal(arccosDecimalIterative('0.5', 0), '1')
			assert.equal(arccosDecimalIterative('0', 0), '2')
			assert.equal(arccosDecimalIterative('-0.5', 0), '2')
			assert.equal(arccosDecimalIterative('-1', 0), '3')
		})

		test('strips trailing fractional zeros from normalized output', () => {
			// pi at 32 decimal places ends in ...7950; normalized should end in ...795
			const pi32 = arccosDecimalIterative('-1', 32)
			assert.equal(pi32, '3.1415926535897932384626433832795')
			assert.ok(!pi32.endsWith('0'))
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-string x', () => {
			for (const bad of [0, 0.5, 1, NaN, null, undefined, {}, [], 1n]) {
				assert.throws(() => arccosDecimalIterative(bad), TypeError)
			}
		})

		test('throws RangeError for malformed decimal strings', () => {
			for (const bad of ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '.', '+.', '1.2.3', '--0.5', '1e', '1e+', '0. 5', '0x1']) {
				assert.throws(() => arccosDecimalIterative(bad), RangeError)
			}
		})

		test('throws RangeError when |x| > 1 (including barely outside [-1, 1])', () => {
			for (const outOfDomain of [
				'1.1',
				'-1.1',
				'2',
				'-100',
				'1e1',
				'1.0000000000000000000000000000000001',
				'-1.0000000000000000000000000000000001',
				'1e1000000',
			]) {
				assert.throws(() => arccosDecimalIterative(outOfDomain, 10), RangeError)
			}
		})

		test('throws TypeError / RangeError for invalid precision', () => {
			for (const badType of ['20', null, {}, [], 20n]) {
				assert.throws(() => arccosDecimalIterative('0.5', badType), TypeError)
			}
			for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity]) {
				assert.throws(() => arccosDecimalIterative('0.5', badRange), RangeError)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('cos(arccos(x)) ≈ x via independent Taylor series for cos across [-1, 1]', () => {
			const testPoints = [
				'-0.99999999',
				'-0.9999',
				'-0.812345678901234567890123456789',
				'-0.5',
				'-0.12345678901234567890123456789',
				'0',
				'0.25',
				'0.5',
				'0.734567890123456789012345678901',
				'0.9999',
				'0.99999999',
			]
			const precision = 40
			const cosScale = 45
			// Tolerance: 10^-37 (i.e. 10^8 at scale 45)
			const maxDiff = 10n ** 8n

			for (const xStr of testPoints) {
				const theta = arccosDecimalIterative(xStr, precision)
				const cosTheta = independentCosScaled(theta, cosScale)
				const expectedX = toScaledBigInt(xStr, cosScale)
				const diff = cosTheta > expectedX ? cosTheta - expectedX : expectedX - cosTheta
				assert.ok(
					diff <= maxDiff,
					`cos(arccos(${xStr})) deviated by ${diff} (scaled 10^${cosScale})`
				)
			}
		})

		test('reflection identity arccos(x) + arccos(-x) = pi to 40 decimal places', () => {
			const points = [
				'0.0000001234567890123456789',
				'0.25',
				'0.499999999',
				'0.5',
				'0.500000001',
				'0.8765432109876543210987654321',
				'0.999999999999999',
			]
			const precision = 40
			const piScaled = toScaledBigInt(PI_55, precision)

			for (const x of points) {
				const aPos = toScaledBigInt(arccosDecimalIterative(x, precision), precision)
				const aNeg = toScaledBigInt(arccosDecimalIterative('-' + x, precision), precision)
				const diff = aPos + aNeg > piScaled ? aPos + aNeg - piScaled : piScaled - (aPos + aNeg)
				assert.ok(
					diff <= 1n,
					`arccos(${x}) + arccos(-${x}) differed from pi by ${diff} ULPs at precision ${precision}`
				)
			}
		})

		test('double-angle identity arccos(2*x^2 - 1) = 2 * arccos(x) for x in [0, 1]', () => {
			// x = 0.8 => 2*x^2 - 1 = 2*0.64 - 1 = 0.28
			const precision = 40
			const lhs = toScaledBigInt(arccosDecimalIterative('0.28', precision), precision)
			const rhs = 2n * toScaledBigInt(arccosDecimalIterative('0.8', precision), precision)
			const diff = lhs > rhs ? lhs - rhs : rhs - lhs
			assert.ok(diff <= 2n, `Double-angle identity mismatch: diff = ${diff}`)

			// x = 0.9 => 2*x^2 - 1 = 2*0.81 - 1 = 0.62
			const lhs2 = toScaledBigInt(arccosDecimalIterative('0.62', precision), precision)
			const rhs2 = 2n * toScaledBigInt(arccosDecimalIterative('0.9', precision), precision)
			const diff2 = lhs2 > rhs2 ? lhs2 - rhs2 : rhs2 - lhs2
			assert.ok(diff2 <= 2n, `Double-angle identity mismatch: diff = ${diff2}`)
		})
	})
})
