import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinRationalIterative } from './arcsinRationalIterative.js'

function absBigInt(n) {
	return n < 0n ? -n : n
}

function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function assertReducedRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	assert.equal(gcdBigInt(r.num, r.den), 1n, `expected reduced rational, got ${r.num}/${r.den}`)
}

function rationalToNumber(r) {
	// Scale to 18 digits before converting to JS number to avoid BigInt overflow in Number()
	const scale = 10n ** 18n
	const scaled = (r.num * scale) / r.den
	return Number(scaled) / 1e18
}

function assertRationalClose(actual, expected, tolerance) {
	// Checks |actual - expected| <= tolerance using exact rational arithmetic
	// |a.num/a.den - e.num/e.den| <= t.num/t.den
	const diffNum = absBigInt(actual.num * expected.den - expected.num * actual.den)
	const diffDen = actual.den * expected.den
	assert.ok(
		diffNum * tolerance.den <= tolerance.num * diffDen,
		`expected ${actual.num}/${actual.den} to be within ${tolerance.num}/${tolerance.den} of ${expected.num}/${expected.den}`,
	)
}

function addRational(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Independent BigInt Taylor series for sin(y) for cross-checking sin(arcsin(x)) ≈ x.
 */
function sinRationalScaled(y, scale) {
	const yScaled = (y.num * scale) / y.den
	let term = yScaled
	let sum = term
	let k = 1n
	const yNum2 = y.num * y.num
	const yDen2 = y.den * y.den
	while (term !== 0n) {
		term = (-term * yNum2) / (yDen2 * (2n * k) * (2n * k + 1n))
		sum += term
		k += 1n
	}
	return sum
}

describe('arcsinRationalIterative', () => {
	test('exact zero for 0, unreduced zero, and negative-denominator zero', () => {
		assert.deepEqual(arcsinRationalIterative({ num: 0n, den: 1n }), { num: 0n, den: 1n })
		assert.deepEqual(arcsinRationalIterative({ num: 0n, den: 42n }), { num: 0n, den: 1n })
		assert.deepEqual(arcsinRationalIterative({ num: 0n, den: -7n }), { num: 0n, den: 1n })
	})

	test('endpoints x = 1 and x = -1 match pi/2 to 30+ decimal digits', () => {
		// pi/2 = 1.57079632679489661923132169163975144209858469968755...
		const piHalf30 = {
			num: 1570796326794896619231321691640n,
			den: 10n ** 30n,
		}
		const tol = { num: 1n, den: 10n ** 29n }

		const posOne = arcsinRationalIterative({ num: 1n, den: 1n })
		const negOne = arcsinRationalIterative({ num: -1n, den: 1n })
		assertReducedRational(posOne)
		assertReducedRational(negOne)
		assertRationalClose(posOne, piHalf30, tol)
		assert.deepEqual(negOne, { num: -posOne.num, den: posOne.den })

		// Unreduced and negative-denominator representations of +/-1
		assert.deepEqual(arcsinRationalIterative({ num: 17n, den: 17n }), posOne)
		assert.deepEqual(arcsinRationalIterative({ num: -17n, den: -17n }), posOne)
		assert.deepEqual(arcsinRationalIterative({ num: 9n, den: -9n }), negOne)
	})

	test('known exact angle x = 1/2 matches pi/6 to high precision', () => {
		// pi/6 = 0.52359877559829887307710723054658381403286156656251...
		const piSixth35 = {
			num: 52359877559829887307710723054658381n,
			den: 10n ** 35n,
		}
		const res = arcsinRationalIterative({ num: 1n, den: 2n }, { precision: 35 })
		assertReducedRational(res)
		assertRationalClose(res, piSixth35, { num: 1n, den: 10n ** 34n })
	})

	test('normal cases cross-checked against Math.asin', () => {
		const inputs = [
			{ num: -9n, den: 10n },
			{ num: -3n, den: 4n },
			{ num: -1n, den: 2n },
			{ num: -1n, den: 3n },
			{ num: -1n, den: 100n },
			{ num: 1n, den: 100n },
			{ num: 1n, den: 4n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 2n },
			{ num: 501n, den: 1000n },
			{ num: 3n, den: 5n },
			{ num: 4n, den: 5n },
			{ num: 9n, den: 10n },
			{ num: 99n, den: 100n },
		]

		for (const x of inputs) {
			const res = arcsinRationalIterative(x)
			assertReducedRational(res)
			const approx = rationalToNumber(res)
			const expected = Math.asin(Number(x.num) / Number(x.den))
			assert.ok(
				Math.abs(approx - expected) < 1e-15,
				`mismatch for ${x.num}/${x.den}: got ${approx}, expected ${expected}`,
			)
		}
	})

	test('near +/-1 accuracy without catastrophic cancellation', () => {
		const nearOneInputs = [
			{ num: 999999n, den: 1000000n },
			{ num: 10n ** 12n - 1n, den: 10n ** 12n },
			{ num: 10n ** 20n - 1n, den: 10n ** 20n },
			{ num: -(10n ** 20n - 1n), den: 10n ** 20n },
		]

		const checkScale = 10n ** 40n
		for (const x of nearOneInputs) {
			const res = arcsinRationalIterative(x, { precision: 35 })
			assertReducedRational(res)

			// Independent check: sin(arcsin(x)) ≈ x to > 30 digits
			const sinVal = sinRationalScaled(res, checkScale)
			const xScaled = (x.num * checkScale) / x.den
			const err = absBigInt(sinVal - xScaled)
			assert.ok(
				err < 10n ** 8n,
				`sin(arcsin(${x.num}/${x.den})) error too large: ${err} / ${checkScale}`,
			)
		}

		// For x = 1 - 10^-20, arcsin(x) ≈ pi/2 - sqrt(2) * 10^-10
		const xTinyGap = { num: 10n ** 20n - 1n, den: 10n ** 20n }
		const r = arcsinRationalIterative(xTinyGap, { precision: 35 })
		const piHalf = arcsinRationalIterative({ num: 1n, den: 1n }, { precision: 35 })
		const gap = addRational(piHalf, { num: -r.num, den: r.den })
		// sqrt(2) * 1e-10 ≈ 1.414213562373095e-10
		const gapNum = rationalToNumber(gap)
		assert.ok(Math.abs(gapNum - Math.SQRT2 * 1e-10) < 1e-18)
	})

	test('independent cross-checks: sin(arcsin(x)) ≈ x, odd symmetry, and Pythagorean identities', () => {
		const testPoints = [
			{ num: 1n, den: 7n },
			{ num: 5n, den: 13n },
			{ num: 1n, den: 2n },
			{ num: 3n, den: 5n },
			{ num: 12n, den: 13n },
			{ num: 24n, den: 25n },
			{ num: 999n, den: 1000n },
		]

		const checkScale = 10n ** 36n
		for (const x of testPoints) {
			const pos = arcsinRationalIterative(x, { precision: 30 })
			const neg = arcsinRationalIterative({ num: -x.num, den: x.den }, { precision: 30 })
			assertReducedRational(pos)
			assertReducedRational(neg)

			// Exact odd symmetry: arcsin(-x) === -arcsin(x)
			assert.deepEqual(neg, { num: -pos.num, den: pos.den })

			// Independent sin(arcsin(x)) ≈ x to at least 28 digits
			const sinVal = sinRationalScaled(pos, checkScale)
			const xScaled = (x.num * checkScale) / x.den
			assert.ok(
				absBigInt(sinVal - xScaled) < 10n ** 8n,
				`sin(arcsin(${x.num}/${x.den})) deviated too much`,
			)
		}

		// Pythagorean complementary identities:
		// arcsin(3/5) + arcsin(4/5) = pi/2
		// arcsin(5/13) + arcsin(12/13) = pi/2 (crosses the 1/2 range-reduction boundary!)
		const piHalf = arcsinRationalIterative({ num: 1n, den: 1n }, 30)
		const tol = { num: 1n, den: 10n ** 28n }

		const sum345 = addRational(
			arcsinRationalIterative({ num: 3n, den: 5n }, 30),
			arcsinRationalIterative({ num: 4n, den: 5n }, 30),
		)
		assertRationalClose(sum345, piHalf, tol)

		const sum51213 = addRational(
			arcsinRationalIterative({ num: 5n, den: 13n }, 30),
			arcsinRationalIterative({ num: 12n, den: 13n }, 30),
		)
		assertRationalClose(sum51213, piHalf, tol)

		// Double-angle identity: 2 * arcsin(3/5) = arcsin(24/25)
		const a35 = arcsinRationalIterative({ num: 3n, den: 5n }, 30)
		const twiceA35 = addRational(a35, a35)
		const a2425 = arcsinRationalIterative({ num: 24n, den: 25n }, 30)
		assertRationalClose(twiceA35, a2425, tol)
	})

	test('supports custom precision via number or options object', () => {
		const r10 = arcsinRationalIterative({ num: 1n, den: 2n }, 10)
		const r10Obj = arcsinRationalIterative({ num: 1n, den: 2n }, { precision: 10 })
		assert.deepEqual(r10, r10Obj)
		assertReducedRational(r10)
		assert.ok(r10.den <= 10n ** 10n)

		const r50 = arcsinRationalIterative({ num: 1n, den: 2n }, { precision: 50 })
		assertReducedRational(r50)
		// pi/6 to 50 digits
		const piSixth50 = {
			num: 52359877559829887307710723054658381403286156656252n,
			den: 10n ** 50n,
		}
		assertRationalClose(r50, piSixth50, { num: 1n, den: 10n ** 49n })
	})

	test('input validation and out-of-domain errors', () => {
		// Out of domain |x| > 1
		assert.throws(() => arcsinRationalIterative({ num: 2n, den: 1n }), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: -2n, den: 1n }), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 1000001n, den: 1000000n }), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: -1000001n, den: 1000000n }), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 3n, den: -2n }), RangeError)

		// Zero denominator
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 0n }), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 1n, den: 0n }), RangeError)

		// Malformed rational inputs
		assert.throws(() => arcsinRationalIterative(null), TypeError)
		assert.throws(() => arcsinRationalIterative(undefined), TypeError)
		assert.throws(() => arcsinRationalIterative(0.5), TypeError)
		assert.throws(() => arcsinRationalIterative('0.5'), TypeError)
		assert.throws(() => arcsinRationalIterative([1n, 2n]), TypeError)
		assert.throws(() => arcsinRationalIterative({ num: 1, den: 2n }), TypeError)
		assert.throws(() => arcsinRationalIterative({ num: 1n, den: 2 }), TypeError)
		assert.throws(() => arcsinRationalIterative({ num: 1n }), TypeError)

		// Invalid precision / options
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, 0), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, -5), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, 1.5), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, Number.NaN), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, Infinity), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, { precision: 0 }), RangeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, { precision: '10' }), TypeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, '10'), TypeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, null), TypeError)
		assert.throws(() => arcsinRationalIterative({ num: 0n, den: 1n }, []), TypeError)
	})
})
