import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosRationalIterative } from './arccosRationalIterative.js'

// First 55 decimal digits of pi for high-precision verification
const PI_55_NUM = 31415926535897932384626433832795028841971693993751058209n
const PI_55_DEN = 10n ** 55n

function bigIntGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function assertReducedRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(bigIntGcd(r.num, r.den), 1n, `expected reduced rational, got ${r.num}/${r.den}`)
}

function rationalToNumber(r) {
	// Scale to 18 decimal digits before converting to JS Number to preserve full float64 precision
	const scale = 10n ** 18n
	const scaled = (r.num * scale) / r.den
	return Number(scaled) / 1e18
}

function absDiffRational(a, b) {
	const num = a.num * b.den - b.num * a.den
	const den = a.den * b.den
	return { num: num < 0n ? -num : num, den: den < 0n ? -den : den }
}

function addRational(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = bigIntGcd(num, den)
	return { num: num / g, den: den / g }
}

function assertRationalClose(actual, expected, tolNum, tolDen, message = '') {
	const diff = absDiffRational(actual, expected)
	assert.ok(
		diff.num * tolDen <= tolNum * diff.den,
		`${message ? message + ': ' : ''}expected |actual - expected| <= ${tolNum}/${tolDen}, got ${diff.num}/${diff.den}`
	)
}

/**
 * Independent fixed-point cosine via Taylor series:
 *   cos(t) = sum_{k=0}^{inf} (-1)^k * t^(2k) / (2k)!
 */
function cosRational(theta, digits = 60) {
	const scale = 10n ** BigInt(digits)
	const t = (theta.num * scale) / theta.den
	const tSq = t * t
	const scaleSq = scale * scale

	let sum = scale
	let term = scale
	let k = 1n
	while (true) {
		term = (-term * tSq) / ((2n * k - 1n) * (2n * k) * scaleSq)
		if (term === 0n) {
			break
		}
		sum += term
		k += 1n
	}
	return { num: sum, den: scale }
}

describe('arccosRationalIterative', () => {
	describe('exact and special edge cases', () => {
		test('returns exact 0/1 for x = 1 (including unreduced and negative-denominator forms)', () => {
			assert.deepEqual(arccosRationalIterative({ num: 1n, den: 1n }), { num: 0n, den: 1n })
			assert.deepEqual(arccosRationalIterative({ num: 42n, den: 42n }), { num: 0n, den: 1n })
			assert.deepEqual(arccosRationalIterative({ num: -7n, den: -7n }), { num: 0n, den: 1n })
		})

		test('computes arccos(0) = pi/2 to 50 decimal digits', () => {
			const res = arccosRationalIterative({ num: 0n, den: 1n })
			assertReducedRational(res)
			const expected = { num: PI_55_NUM, den: 2n * PI_55_DEN }
			assertRationalClose(res, expected, 1n, 10n ** 50n, 'arccos(0) vs pi/2')
		})

		test('computes arccos(-1) = pi to 50 decimal digits', () => {
			const res = arccosRationalIterative({ num: -1n, den: 1n })
			assertReducedRational(res)
			const expected = { num: PI_55_NUM, den: PI_55_DEN }
			assertRationalClose(res, expected, 1n, 10n ** 50n, 'arccos(-1) vs pi')
		})

		test('computes arccos(1/2) = pi/3 and arccos(-1/2) = 2*pi/3 to 50 decimal digits', () => {
			const pos = arccosRationalIterative({ num: 1n, den: 2n })
			const neg = arccosRationalIterative({ num: -1n, den: 2n })
			assertReducedRational(pos)
			assertReducedRational(neg)
			assertRationalClose(pos, { num: PI_55_NUM, den: 3n * PI_55_DEN }, 1n, 10n ** 50n, 'arccos(1/2)')
			assertRationalClose(neg, { num: 2n * PI_55_NUM, den: 3n * PI_55_DEN }, 1n, 10n ** 50n, 'arccos(-1/2)')
		})

		test('handles unreduced rationals and negative denominators identically', () => {
			const a = arccosRationalIterative({ num: 1n, den: 2n })
			const b = arccosRationalIterative({ num: 500n, den: 1000n })
			const c = arccosRationalIterative({ num: -3n, den: -6n })
			assert.deepEqual(a, b)
			assert.deepEqual(a, c)

			const negA = arccosRationalIterative({ num: -3n, den: 5n })
			const negB = arccosRationalIterative({ num: 3n, den: -5n })
			assert.deepEqual(negA, negB)
		})

		test('maintains high accuracy very close to +1 and -1', () => {
			// x = 1 - 10^-20 => arccos(x) = sqrt(2e-20) + O(10^-30)
			const nearPos = arccosRationalIterative({ num: 10n ** 20n - 1n, den: 10n ** 20n })
			assertReducedRational(nearPos)
			const cosNearPos = cosRational(nearPos, 60)
			assertRationalClose(
				cosNearPos,
				{ num: 10n ** 20n - 1n, den: 10n ** 20n },
				1n,
				10n ** 48n,
				'cos(arccos(1 - 1e-20))'
			)

			// x = -1 + 10^-20
			const nearNeg = arccosRationalIterative({ num: -(10n ** 20n - 1n), den: 10n ** 20n })
			assertReducedRational(nearNeg)
			const cosNearNeg = cosRational(nearNeg, 60)
			assertRationalClose(
				cosNearNeg,
				{ num: -(10n ** 20n - 1n), den: 10n ** 20n },
				1n,
				10n ** 48n,
				'cos(arccos(-1 + 1e-20))'
			)

			// Also verify arccos(1 - 1e-20) + arccos(-1 + 1e-20) = pi
			const sum = addRational(nearPos, nearNeg)
			assertRationalClose(sum, { num: PI_55_NUM, den: PI_55_DEN }, 2n, 10n ** 50n, 'near +/-1 symmetry')
		})

		test('supports custom precision option', () => {
			const low = arccosRationalIterative({ num: 0n, den: 1n }, { precision: 10 })
			const high = arccosRationalIterative({ num: 0n, den: 1n }, { precision: 80 })
			assertReducedRational(low)
			assertReducedRational(high)
			assert.ok(low.den <= 10n ** 10n)
			assert.ok(high.den <= 10n ** 80n)
			assertRationalClose(low, { num: PI_55_NUM, den: 2n * PI_55_DEN }, 1n, 10n ** 10n, 'precision=10')
			assertRationalClose(high, { num: PI_55_NUM, den: 2n * PI_55_DEN }, 1n, 10n ** 54n, 'precision=80')
		})
	})

	describe('independent cross-checks', () => {
		const samples = [
			{ num: -999n, den: 1000n },
			{ num: -7n, den: 8n },
			{ num: -3n, den: 4n },
			{ num: -3n, den: 5n },
			{ num: -1n, den: 3n },
			{ num: -1n, den: 1000n },
			{ num: 0n, den: 1n },
			{ num: 1n, den: 1000n },
			{ num: 1n, den: 3n },
			{ num: 3n, den: 5n },
			{ num: 4n, den: 5n },
			{ num: 3n, den: 4n },
			{ num: 7n, den: 8n },
			{ num: 999n, den: 1000n },
		]

		test('matches Math.acos across [-1, 1]', () => {
			for (const x of samples) {
				const res = arccosRationalIterative(x)
				assertReducedRational(res)
				const expected = Math.acos(Number(x.num) / Number(x.den))
				const actual = rationalToNumber(res)
				assert.ok(
					Math.abs(actual - expected) < 1e-15,
					`Math.acos mismatch for ${x.num}/${x.den}: got ${actual}, expected ${expected}`
				)
			}
		})

		test('satisfies symmetry identity arccos(x) + arccos(-x) = pi', () => {
			const pi = { num: PI_55_NUM, den: PI_55_DEN }
			for (const x of samples) {
				const a = arccosRationalIterative(x)
				const b = arccosRationalIterative({ num: -x.num, den: x.den })
				const sum = addRational(a, b)
				assertRationalClose(sum, pi, 2n, 10n ** 50n, `symmetry for ${x.num}/${x.den}`)
			}
		})

		test('satisfies inverse identity cos(arccos(x)) = x via independent Taylor cosine', () => {
			for (const x of samples) {
				const theta = arccosRationalIterative(x)
				const cosTheta = cosRational(theta, 60)
				assertRationalClose(cosTheta, x, 1n, 10n ** 48n, `cos(arccos(${x.num}/${x.den}))`)
			}
		})

		test('satisfies Pythagorean complementary angles arccos(a/c) + arccos(b/c) = pi/2', () => {
			const halfPi = { num: PI_55_NUM, den: 2n * PI_55_DEN }
			const triples = [
				[3n, 4n, 5n],
				[5n, 12n, 13n],
				[8n, 15n, 17n],
			]
			for (const [a, b, c] of triples) {
				const r1 = arccosRationalIterative({ num: a, den: c })
				const r2 = arccosRationalIterative({ num: b, den: c })
				assertRationalClose(
					addRational(r1, r2),
					halfPi,
					2n,
					10n ** 50n,
					`Pythagorean triple (${a}, ${b}, ${c})`
				)
			}
		})

		test('is strictly decreasing across [-1, 1]', () => {
			const ordered = [
				{ num: -1n, den: 1n },
				{ num: -3n, den: 4n },
				{ num: -1n, den: 2n },
				{ num: 0n, den: 1n },
				{ num: 1n, den: 2n },
				{ num: 3n, den: 4n },
				{ num: 1n, den: 1n },
			]
			const values = ordered.map((x) => arccosRationalIterative(x))
			for (let i = 1; i < values.length; i++) {
				const prev = values[i - 1]
				const curr = values[i]
				assert.ok(
					prev.num * curr.den > curr.num * prev.den,
					`expected strictly decreasing at index ${i}`
				)
			}
		})
	})

	describe('input validation', () => {
		test('rejects out-of-domain rationals |x| > 1', () => {
			assert.throws(() => arccosRationalIterative({ num: 2n, den: 1n }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: -2n, den: 1n }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: 1000001n, den: 1000000n }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: -1000001n, den: 1000000n }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: 5n, den: -4n }), RangeError)
		})

		test('rejects zero denominator', () => {
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 0n }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: 1n, den: 0n }), RangeError)
		})

		test('rejects non-object or malformed rational inputs', () => {
			assert.throws(() => arccosRationalIterative(null), TypeError)
			assert.throws(() => arccosRationalIterative(undefined), TypeError)
			assert.throws(() => arccosRationalIterative(0.5), TypeError)
			assert.throws(() => arccosRationalIterative('1/2'), TypeError)
			assert.throws(() => arccosRationalIterative([1n, 2n]), TypeError)
			assert.throws(() => arccosRationalIterative({ num: 1, den: 2n }), TypeError)
			assert.throws(() => arccosRationalIterative({ num: 1n, den: 2 }), TypeError)
			assert.throws(() => arccosRationalIterative({ num: 1n }), TypeError)
			assert.throws(() => arccosRationalIterative({ den: 2n }), TypeError)
		})

		test('rejects invalid options', () => {
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, null), TypeError)
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, []), TypeError)
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, 50), TypeError)
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, { precision: '50' }), TypeError)
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, { precision: 0 }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, { precision: -5 }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, { precision: 1.5 }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, { precision: NaN }), RangeError)
			assert.throws(() => arccosRationalIterative({ num: 0n, den: 1n }, { precision: Infinity }), RangeError)
		})
	})
})
