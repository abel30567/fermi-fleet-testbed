import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosRationalIterative } from './cosRationalIterative.js'

function gcdBigInt(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

function assertReducedRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(
		gcdBigInt(r.num, r.den),
		1n,
		`expected lowest terms for ${r.num}/${r.den}`
	)
}

function rationalToNumber(r) {
	// Convert safely even if |num| or den exceeds Number.MAX_VALUE
	const scale = 10n ** 18n
	const scaled = (r.num * scale) / r.den
	return Number(scaled) / 1e18
}

function rationalAbsDiff(a, b) {
	const num = a.num * b.den - b.num * a.den
	const den = a.den * b.den
	return { num: num < 0n ? -num : num, den: den < 0n ? -den : den }
}

function rationalLessThan(a, b) {
	return a.num * b.den < b.num * a.den
}

describe('cosRationalIterative', () => {
	test('returns exact 1 for 0 radians regardless of non-zero denominator', () => {
		assert.deepEqual(cosRationalIterative({ num: 0n, den: 1n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(cosRationalIterative({ num: 0n, den: 42n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(cosRationalIterative({ num: 0n, den: -9n }), {
			num: 1n,
			den: 1n,
		})
	})

	test('matches Math.cos for normal angles across all quadrants', () => {
		const cases = [
			{ num: 1n, den: 10n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 2n },
			{ num: 1n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 2n, den: 1n },
			{ num: 3n, den: 1n },
			{ num: 4n, den: 1n },
			{ num: 5n, den: 1n },
			{ num: 6n, den: 1n },
			{ num: 7n, den: 1n },
			{ num: 22n, den: 7n },
			{ num: 355n, den: 226n }, // near pi/2
			{ num: 355n, den: 113n }, // near pi
			{ num: 1065n, den: 226n }, // near 3*pi/2
			{ num: 710n, den: 113n }, // near 2*pi
		]

		for (const angle of cases) {
			const res = cosRationalIterative(angle)
			assertReducedRational(res)
			const approx = rationalToNumber(res)
			const expected = Math.cos(Number(angle.num) / Number(angle.den))
			assert.ok(
				Math.abs(approx - expected) < 1e-15,
				`cos(${angle.num}/${angle.den}): got ${approx}, expected ${expected}`
			)
		}
	})

	test('satisfies exact even symmetry cos(-x) = cos(x) and normalizes unreduced/negative-den inputs', () => {
		const angles = [
			{ num: 1n, den: 2n },
			{ num: 5n, den: 3n },
			{ num: 17n, den: 4n },
			{ num: 1000n, den: 7n },
			{ num: 10n ** 25n, den: 3n },
		]

		for (const a of angles) {
			const pos = cosRationalIterative(a)
			const negNum = cosRationalIterative({ num: -a.num, den: a.den })
			const negDen = cosRationalIterative({ num: a.num, den: -a.den })
			const bothNeg = cosRationalIterative({ num: -a.num, den: -a.den })
			const unreduced = cosRationalIterative({
				num: a.num * 13n,
				den: a.den * 13n,
			})

			assertReducedRational(pos)
			assert.deepEqual(negNum, pos)
			assert.deepEqual(negDen, pos)
			assert.deepEqual(bothNeg, pos)
			assert.deepEqual(unreduced, pos)
		}
	})

	test('handles negative angles accurately against Math.cos', () => {
		const cases = [
			{ num: -1n, den: 2n },
			{ num: -2n, den: 1n },
			{ num: -5n, den: 1n },
			{ num: -100n, den: 1n },
			{ num: 355n, den: -113n },
		]

		for (const angle of cases) {
			const res = cosRationalIterative(angle)
			assertReducedRational(res)
			const approx = rationalToNumber(res)
			const expected = Math.cos(Number(angle.num) / Number(angle.den))
			assert.ok(
				Math.abs(approx - expected) < 1e-14,
				`cos(${angle.num}/${angle.den}): got ${approx}, expected ${expected}`
			)
		}
	})

	test('handles very small angles accurately', () => {
		// For small x, cos(x) = 1 - x^2/2 + O(x^4)
		const x = { num: 1n, den: 10n ** 10n }
		const res = cosRationalIterative(x, { precisionBits: 160 })
		assertReducedRational(res)
		const expectedApprox = {
			num: 2n * 10n ** 20n - 1n,
			den: 2n * 10n ** 20n,
		}
		const diff = rationalAbsDiff(res, expectedApprox)
		assert.ok(
			rationalLessThan(diff, { num: 1n, den: 10n ** 35n }),
			`small-angle error too large: ${diff.num}/${diff.den}`
		)
	})

	test('handles large angles accurately and cross-checks double-angle identity cos(2x) = 2*cos^2(x) - 1', () => {
		// Moderate large angles where Math.cos is still accurate
		for (const angle of [
			{ num: 100n, den: 1n },
			{ num: 1000n, den: 1n },
			{ num: -12345n, den: 7n },
		]) {
			const res = cosRationalIterative(angle)
			assertReducedRational(res)
			const approx = rationalToNumber(res)
			const expected = Math.cos(Number(angle.num) / Number(angle.den))
			assert.ok(
				Math.abs(approx - expected) < 1e-12,
				`cos(${angle.num}/${angle.den}): got ${approx}, expected ${expected}`
			)
		}

		// Huge angles far beyond IEEE-754 precision: verify double-angle and triple-angle identities
		const hugeAngles = [
			{ num: 1n, den: 1n },
			{ num: 7n, den: 3n },
			{ num: 10n ** 15n, den: 1n },
			{ num: 10n ** 30n, den: 13n },
			{ num: -(10n ** 50n), den: 7n },
		]

		const tol = { num: 1n, den: 10n ** 35n }
		for (const x of hugeAngles) {
			const cx = cosRationalIterative(x)
			const c2x = cosRationalIterative({ num: 2n * x.num, den: x.den })
			const c3x = cosRationalIterative({ num: 3n * x.num, den: x.den })

			assertReducedRational(cx)
			assertReducedRational(c2x)
			assertReducedRational(c3x)

			// 2 * cos^2(x) - 1 === cos(2x)
			const rhs2 = {
				num: 2n * cx.num * cx.num - cx.den * cx.den,
				den: cx.den * cx.den,
			}
			const diff2 = rationalAbsDiff(c2x, rhs2)
			assert.ok(
				rationalLessThan(diff2, tol),
				`double-angle identity failed for ${x.num}/${x.den}`
			)

			// 4 * cos^3(x) - 3 * cos(x) === cos(3x)
			const c3Num = 4n * cx.num ** 3n - 3n * cx.num * cx.den ** 2n
			const c3Den = cx.den ** 3n
			const diff3 = rationalAbsDiff(c3x, { num: c3Num, den: c3Den })
			assert.ok(
				rationalLessThan(diff3, tol),
				`triple-angle identity failed for ${x.num}/${x.den}`
			)
		}
	})

	test('respects custom precisionBits option', () => {
		const angle = { num: 1n, den: 1n }
		const low = cosRationalIterative(angle, { precisionBits: 32 })
		const high = cosRationalIterative(angle, { precisionBits: 200 })

		assertReducedRational(low)
		assertReducedRational(high)
		assert.ok(low.den <= 1n << 32n)
		assert.ok(high.den <= 1n << 200n)

		// Verify high-precision cos(1) against known 50-digit reference:
		// cos(1) = 0.54030230586813971740093660744297660373231042061792...
		const ref50 = {
			num: 54030230586813971740093660744297660373231042061792n,
			den: 10n ** 50n,
		}
		const diffHigh = rationalAbsDiff(high, ref50)
		assert.ok(
			rationalLessThan(diffHigh, { num: 1n, den: 10n ** 49n }),
			`high precision cos(1) error too large`
		)

		const diffLow = rationalAbsDiff(low, ref50)
		assert.ok(
			rationalLessThan(diffLow, { num: 1n, den: 1n << 31n }),
			`low precision cos(1) error too large`
		)
	})

	test('validates inputs thoroughly', () => {
		// Invalid angle container
		for (const bad of [undefined, null, 0, 1n, '0', true, [], [1n, 2n]]) {
			assert.throws(() => cosRationalIterative(bad), TypeError)
		}

		// Invalid num / den types
		for (const bad of [
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: '2' },
			{ num: 1n },
			{ den: 1n },
			{ num: null, den: 1n },
			{ num: 1n, den: undefined },
		]) {
			assert.throws(() => cosRationalIterative(bad), TypeError)
		}

		// Zero denominator
		assert.throws(() => cosRationalIterative({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => cosRationalIterative({ num: 0n, den: 0n }), RangeError)

		// Invalid options object
		for (const badOpt of [null, 128, '128', true, []]) {
			assert.throws(
				() => cosRationalIterative({ num: 1n, den: 2n }, badOpt),
				TypeError
			)
		}

		// Invalid options.precisionBits types
		for (const badBits of ['128', 128n, null, true, NaN, {}]) {
			assert.throws(
				() =>
					cosRationalIterative(
						{ num: 1n, den: 2n },
						{ precisionBits: badBits }
					),
				TypeError
			)
		}

		// Invalid options.precisionBits ranges
		for (const badRange of [
			0,
			-1,
			-128,
			1.5,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			assert.throws(
				() =>
					cosRationalIterative(
						{ num: 1n, den: 2n },
						{ precisionBits: badRange }
					),
				RangeError
			)
		}
	})
})
