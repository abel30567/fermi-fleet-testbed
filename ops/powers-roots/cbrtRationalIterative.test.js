import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtRationalIterative } from './cbrtRationalIterative.js'

function gcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const r = a % b
		a = b
		b = r
	}
	return a
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `Expected positive denominator, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `Expected lowest terms, got ${r.num}/${r.den}`)
}

/**
 * Checks that |r^3 - x| / |x| <= maxRelErrorNum / maxRelErrorDen using exact BigInt arithmetic.
 */
function assertCubeRelErrorWithin(result, input, maxRelErrorShift) {
	const num = input.den < 0n ? -input.num : input.num
	const den = input.den < 0n ? -input.den : input.den

	// r^3 - input = (r.num^3 * den - num * r.den^3) / (r.den^3 * den)
	// |r^3 - input| / |input| = |r.num^3 * den - num * r.den^3| / (|num| * r.den^3)
	const rNum3 = result.num * result.num * result.num
	const rDen3 = result.den * result.den * result.den
	const diff = rNum3 * den - num * rDen3
	const absDiff = diff < 0n ? -diff : diff
	const absNum = num < 0n ? -num : num

	// Assert absDiff / (absNum * rDen3) <= 3 / 2^maxRelErrorShift
	assert.ok(
		(absDiff << BigInt(maxRelErrorShift)) <= 3n * absNum * rDen3,
		`Relative error of cube exceeded bound 3 * 2^-${maxRelErrorShift}`,
	)
}

/**
 * Converts a rational to JS Number accurately even when num and den exceed Number.MAX_VALUE.
 */
function rationalToNumber(r) {
	if (r.num === 0n) return 0
	const sign = r.num < 0n ? -1 : 1
	const a = r.num < 0n ? -r.num : r.num
	const b = r.den
	const aBits = a.toString(2).length
	const bBits = b.toString(2).length
	const shift = 64 - (aBits - bBits)
	if (shift >= 0) {
		const scaled = (a << BigInt(shift)) / b
		return sign * Number(scaled) * Math.pow(2, -shift)
	}
	const scaled = a / (b << BigInt(-shift))
	return sign * Number(scaled) * Math.pow(2, -shift)
}

describe('cbrtRationalIterative', () => {
	test('handles zero with positive and negative denominators', () => {
		assert.deepEqual(cbrtRationalIterative({ num: 0n, den: 1n }), { num: 0n, den: 1n })
		assert.deepEqual(cbrtRationalIterative({ num: 0n, den: 42n }), { num: 0n, den: 1n })
		assert.deepEqual(cbrtRationalIterative({ num: 0n, den: -99n }), { num: 0n, den: 1n })
	})

	test('returns exact cube roots for positive and negative perfect cubes', () => {
		const cases = [
			[{ num: 1n, den: 1n }, { num: 1n, den: 1n }],
			[{ num: -1n, den: 1n }, { num: -1n, den: 1n }],
			[{ num: 8n, den: 1n }, { num: 2n, den: 1n }],
			[{ num: -8n, den: 1n }, { num: -2n, den: 1n }],
			[{ num: 27n, den: 64n }, { num: 3n, den: 4n }],
			[{ num: -27n, den: 64n }, { num: -3n, den: 4n }],
			[{ num: 125n, den: 343n }, { num: 5n, den: 7n }],
			[{ num: -1000n, den: 729n }, { num: -10n, den: 9n }],
		]

		for (const [input, expected] of cases) {
			const result = cbrtRationalIterative(input)
			assertLowestTerms(result)
			assert.deepEqual(result, expected)
		}
	})

	test('reduces unreduced inputs and normalizes negative denominators', () => {
		assert.deepEqual(cbrtRationalIterative({ num: 16n, den: 2n }), { num: 2n, den: 1n })
		assert.deepEqual(cbrtRationalIterative({ num: -54n, den: 128n }), { num: -3n, den: 4n })
		assert.deepEqual(cbrtRationalIterative({ num: 8n, den: -27n }), { num: -2n, den: 3n })
		assert.deepEqual(cbrtRationalIterative({ num: -27n, den: -64n }), { num: 3n, den: 4n })
		assert.deepEqual(cbrtRationalIterative({ num: 250n, den: -16n }), { num: -5n, den: 2n })
	})

	test('approximates irrational cube roots to high precision with cubing cross-check', () => {
		const inputs = [
			{ num: 2n, den: 1n },
			{ num: -2n, den: 1n },
			{ num: 3n, den: 5n },
			{ num: -7n, den: 11n },
			{ num: 1n, den: 2n },
			{ num: 26n, den: 27n },
			{ num: 28n, den: 27n },
			{ num: 100n, den: 3n },
			{ num: -1n, den: 1000000n + 1n },
			{ num: 5n, den: -13n },
		]

		for (const input of inputs) {
			const result = cbrtRationalIterative(input)
			assertLowestTerms(result)
			assertCubeRelErrorWithin(result, input, 128)
		}
	})

	test('preserves odd-function symmetry: cbrt(-x) === -cbrt(x)', () => {
		const samples = [
			{ num: 2n, den: 1n },
			{ num: 3n, den: 7n },
			{ num: 12345n, den: 67891n },
			{ num: 1n, den: 10n ** 30n + 3n },
		]

		for (const q of samples) {
			const pos = cbrtRationalIterative(q)
			const neg = cbrtRationalIterative({ num: -q.num, den: q.den })
			assertLowestTerms(pos)
			assertLowestTerms(neg)
			assert.equal(neg.num, -pos.num)
			assert.equal(neg.den, pos.den)
		}
	})

	test('cross-checks against Math.cbrt across positive, negative, and fractional inputs', () => {
		const inputs = [
			{ num: 2n, den: 1n },
			{ num: -2n, den: 1n },
			{ num: 3n, den: 1n },
			{ num: 10n, den: 1n },
			{ num: 1n, den: 3n },
			{ num: -5n, den: 9n },
			{ num: 355n, den: 113n },
			{ num: -1000000n, den: 17n },
			{ num: 1n, den: 1000000007n },
		]

		for (const q of inputs) {
			const result = cbrtRationalIterative(q)
			assertLowestTerms(result)

			const actual = rationalToNumber(result)
			const expected = Math.cbrt(Number(q.num) / Number(q.den))
			const relError = Math.abs(actual - expected) / Math.abs(expected)
			assert.ok(
				relError < 1e-14,
				`Mismatch vs Math.cbrt for ${q.num}/${q.den}: got ${actual}, expected ${expected} (relErr=${relError})`,
			)
		}
	})

	test('supports custom precisionBits option', () => {
		const input = { num: 2n, den: 1n }
		const low = cbrtRationalIterative(input, { precisionBits: 16 })
		const high = cbrtRationalIterative(input, { precisionBits: 256 })

		assertLowestTerms(low)
		assertLowestTerms(high)
		assertCubeRelErrorWithin(low, input, 16)
		assertCubeRelErrorWithin(high, input, 256)

		// Higher precision produces strictly smaller error for irrational inputs
		const errLow = low.num ** 3n - 2n * low.den ** 3n
		const errHigh = high.num ** 3n - 2n * high.den ** 3n
		const absLow = errLow < 0n ? -errLow : errLow
		const absHigh = errHigh < 0n ? -errHigh : errHigh
		assert.ok(absHigh * low.den ** 3n < absLow * high.den ** 3n)
	})

	test('handles very large BigInts (exact cubes and irrational approximations)', () => {
		// Exact large positive and negative cubes
		const bigA = 10n ** 50n + 7n
		const bigB = 10n ** 40n + 3n
		const exactPos = cbrtRationalIterative({ num: bigA ** 3n, den: bigB ** 3n })
		assertLowestTerms(exactPos)
		assert.deepEqual(exactPos, { num: bigA, den: bigB })

		const exactNeg = cbrtRationalIterative({ num: -(bigA ** 3n) * 19n, den: bigB ** 3n * 19n })
		assertLowestTerms(exactNeg)
		assert.deepEqual(exactNeg, { num: -bigA, den: bigB })

		// Large irrational > 1
		const hugeGt1 = { num: 10n ** 200n + 12345n, den: 7n }
		const resHugeGt1 = cbrtRationalIterative(hugeGt1)
		assertLowestTerms(resHugeGt1)
		assertCubeRelErrorWithin(resHugeGt1, hugeGt1, 128)

		// Very small irrational (tiny fraction)
		const tiny = { num: 1n, den: 10n ** 150n + 7n }
		const resTiny = cbrtRationalIterative(tiny)
		assertLowestTerms(resTiny)
		assertCubeRelErrorWithin(resTiny, tiny, 128)

		// Large numerator and denominator near 1
		const nearOne = { num: 10n ** 80n + 3n, den: 10n ** 80n + 1n }
		const resNearOne = cbrtRationalIterative(nearOne)
		assertLowestTerms(resNearOne)
		assertCubeRelErrorWithin(resNearOne, nearOne, 128)
	})

	test('validates inputs and options thoroughly', () => {
		for (const bad of [null, undefined, 8, '8/27', true, 8n, [8n, 27n]]) {
			assert.throws(() => cbrtRationalIterative(bad), TypeError)
		}

		for (const badObj of [
			{},
			{ num: 8, den: 27n },
			{ num: 8n, den: 27 },
			{ num: '8', den: '27' },
			{ num: NaN, den: 1n },
			{ num: 8n },
			{ den: 27n },
		]) {
			assert.throws(() => cbrtRationalIterative(badObj), TypeError)
		}

		assert.throws(() => cbrtRationalIterative({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => cbrtRationalIterative({ num: 0n, den: 0n }), RangeError)

		for (const badOpts of [null, 64, '64', [], { precisionBits: '128' }, { precisionBits: 128n }]) {
			assert.throws(() => cbrtRationalIterative({ num: 2n, den: 1n }, badOpts), TypeError)
		}

		for (const badPrecision of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(
				() => cbrtRationalIterative({ num: 2n, den: 1n }, { precisionBits: badPrecision }),
				RangeError,
			)
		}
	})
})
