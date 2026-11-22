import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtRationalIterative } from './sqrtRationalIterative.js'

/**
 * Independent Euclidean GCD helper for verifying lowest-terms invariants.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		;[x, y] = [y, x % y]
	}
	return x
}

/**
 * Asserts that a rational is in canonical lowest terms with `den > 0n` and
 * `num >= 0n`.
 *
 * @param {{ num: bigint, den: bigint }} r
 */
function assertCanonicalNonNegative(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.ok(r.num >= 0n, `expected num >= 0n, got ${r.num}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms, got ${r.num}/${r.den}`)
	}
}

/**
 * Computes `|x^2 - r|` as an unreduced non-negative rational `{ num, den }`.
 *
 * @param {{ num: bigint, den: bigint }} x
 * @param {{ num: bigint, den: bigint }} r
 * @returns {{ num: bigint, den: bigint }}
 */
function squaredResidual(x, r) {
	const left = x.num * x.num * r.den
	const right = r.num * x.den * x.den
	const diff = left >= right ? left - right : right - left
	const den = x.den * x.den * (r.den < 0n ? -r.den : r.den)
	return { num: diff, den }
}

/**
 * Converts a positive rational to a JS Number via scaled BigInt division so it
 * remains accurate even when `num` and `den` exceed `Number.MAX_VALUE`.
 *
 * @param {{ num: bigint, den: bigint }} r
 * @returns {number}
 */
function rationalToNumber(r) {
	const scale = 10n ** 18n
	return Number((r.num * scale) / r.den) / 1e18
}

describe('sqrtRationalIterative', () => {
	test('zero inputs return canonical 0n/1n', () => {
		assert.deepEqual(sqrtRationalIterative({ num: 0n, den: 1n }), { num: 0n, den: 1n })
		assert.deepEqual(sqrtRationalIterative({ num: 0n, den: 42n }), { num: 0n, den: 1n })
		assert.deepEqual(sqrtRationalIterative({ num: 0n, den: -7n }), { num: 0n, den: 1n })
	})

	test('exact rational squares return exact lowest-terms roots', () => {
		const cases = [
			[{ num: 1n, den: 1n }, { num: 1n, den: 1n }],
			[{ num: 4n, den: 9n }, { num: 2n, den: 3n }],
			[{ num: 8n, den: 18n }, { num: 2n, den: 3n }], // unreduced 4/9
			[{ num: -25n, den: -16n }, { num: 5n, den: 4n }], // double negative => positive
			[{ num: 144n, den: 1n }, { num: 12n, den: 1n }],
			[{ num: 1n, den: 10000n }, { num: 1n, den: 100n }],
			[{ num: 121n * 3n, den: 169n * 3n }, { num: 11n, den: 13n }]
		]

		for (const [input, expected] of cases) {
			const res = sqrtRationalIterative(input)
			assertCanonicalNonNegative(res)
			assert.deepEqual(res, expected)
			// Cross-check by squaring: res^2 === input
			assert.equal(res.num * res.num * input.den, input.num * res.den * res.den)
		}
	})

	test('irrational square roots match exact Heron iterates for configurable iterations', () => {
		const two = { num: 2n, den: 1n }
		assert.deepEqual(sqrtRationalIterative(two, { iterations: 1 }), { num: 3n, den: 2n })
		assert.deepEqual(sqrtRationalIterative(two, { iterations: 2 }), { num: 17n, den: 12n })
		assert.deepEqual(sqrtRationalIterative(two, { iterations: 3 }), { num: 577n, den: 408n })
		assert.deepEqual(sqrtRationalIterative(two, { iterations: 4 }), {
			num: 665857n,
			den: 470832n
		})

		// Verify strict monotonic decrease of |x^2 - 2| across iterations
		let prev = squaredResidual(sqrtRationalIterative(two, { iterations: 1 }), two)
		for (let k = 2; k <= 6; k++) {
			const currRes = sqrtRationalIterative(two, { iterations: k })
			assertCanonicalNonNegative(currRes)
			const curr = squaredResidual(currRes, two)
			assert.ok(curr.num * prev.den < prev.num * curr.den, `iteration ${k} should improve error`)
			prev = curr
		}
	})

	test('configurable tolerance stops when |x - sqrt(r)| <= tolerance', () => {
		const two = { num: 2n, den: 1n }
		const tol1 = { num: 1n, den: 100n }
		const approx1 = sqrtRationalIterative(two, { tolerance: tol1 })
		assertCanonicalNonNegative(approx1)
		assert.deepEqual(approx1, { num: 17n, den: 12n })

		const input = { num: 3n, den: 5n }
		const tol2 = { num: 1n, den: 10n ** 30n }
		const approx2 = sqrtRationalIterative(input, { tolerance: tol2 })
		assertCanonicalNonNegative(approx2)

		// Independent exact verification: (approx2 - tol2)^2 <= input <= (approx2 + tol2)^2
		const lowerNum = approx2.num * tol2.den - tol2.num * approx2.den
		const upperNum = approx2.num * tol2.den + tol2.num * approx2.den
		const commonDen = approx2.den * tol2.den
		assert.ok(lowerNum > 0n)
		assert.ok(lowerNum * lowerNum * input.den <= input.num * commonDen * commonDen)
		assert.ok(input.num * commonDen * commonDen <= upperNum * upperNum * input.den)

		// Initial guess already within tolerance returns immediately
		const huge = { num: 10n ** 100n + 1n, den: 1n }
		const coarse = sqrtRationalIterative(huge, { tolerance: { num: 1n, den: 1n } })
		assert.deepEqual(coarse, { num: 10n ** 50n, den: 1n })

		// Iteration cap is respected alongside tolerance
		const capped = sqrtRationalIterative(two, {
			iterations: 2,
			tolerance: { num: 1n, den: 10n ** 50n }
		})
		assert.deepEqual(capped, { num: 17n, den: 12n })
	})

	test('large BigInt inputs (exact and irrational)', () => {
		// Exact huge square: gcd(10^80 + 7, 10^60 + 3) === 1
		const a = 10n ** 80n + 7n
		const b = 10n ** 60n + 3n
		assert.equal(gcd(a, b), 1n)
		const exactHuge = sqrtRationalIterative({ num: a * a, den: b * b })
		assertCanonicalNonNegative(exactHuge)
		assert.deepEqual(exactHuge, { num: a, den: b })

		// Unreduced huge exact square
		const factor = 10n ** 30n + 9n
		const exactScaled = sqrtRationalIterative({
			num: a * a * factor,
			den: b * b * factor
		})
		assert.deepEqual(exactScaled, { num: a, den: b })

		// Large irrational rational: verify relative squared error < 10^-50
		const largeIrrational = { num: 10n ** 50n + 3n, den: 10n ** 40n + 7n }
		const approx = sqrtRationalIterative(largeIrrational, { iterations: 4 })
		assertCanonicalNonNegative(approx)
		const res = squaredResidual(approx, largeIrrational)
		// Check |approx^2 - r| / r < 10^-50
		assert.ok(
			res.num * largeIrrational.den * 10n ** 50n < largeIrrational.num * res.den,
			'large irrational relative squared error should be < 10^-50'
		)
	})

	test('cross-check against Math.sqrt and exact squaring', () => {
		const samples = [
			{ num: 2n, den: 1n },
			{ num: 3n, den: 1n },
			{ num: 5n, den: 1n },
			{ num: 1n, den: 2n },
			{ num: 7n, den: 11n },
			{ num: 1000n, den: 3n },
			{ num: 1n, den: 137n },
			{ num: 99n, den: 70n },
			{ num: -10n, den: -3n }
		]

		for (const input of samples) {
			const result = sqrtRationalIterative(input)
			assertCanonicalNonNegative(result)

			// Cross-check 1: compare rational result against Math.sqrt
			const expectedFloat = Math.sqrt(Number(input.num) / Number(input.den))
			const actualFloat = rationalToNumber(result)
			const relErr = Math.abs(actualFloat - expectedFloat) / expectedFloat
			assert.ok(
				relErr < 1e-14,
				`Math.sqrt mismatch for ${input.num}/${input.den}: got ${actualFloat}, expected ${expectedFloat}`
			)

			// Cross-check 2: squaring result matches input to better than 10^-28 relative error
			const posInput =
				input.den < 0n ? { num: -input.num, den: -input.den } : input
			const residual = squaredResidual(result, posInput)
			assert.ok(
				residual.num * posInput.den * 10n ** 28n < posInput.num * residual.den,
				`squared residual too large for ${input.num}/${input.den}`
			)
		}
	})

	test('input validation rejects invalid rationals and options', () => {
		// Invalid rational shapes and types
		assert.throws(() => sqrtRationalIterative(null), TypeError)
		assert.throws(() => sqrtRationalIterative(undefined), TypeError)
		assert.throws(() => sqrtRationalIterative(4), TypeError)
		assert.throws(() => sqrtRationalIterative([4n, 9n]), TypeError)
		assert.throws(() => sqrtRationalIterative({ num: 4, den: 9n }), TypeError)
		assert.throws(() => sqrtRationalIterative({ num: 4n, den: 9 }), TypeError)
		assert.throws(() => sqrtRationalIterative({ num: '4', den: '9' }), TypeError)

		// Zero denominator
		assert.throws(() => sqrtRationalIterative({ num: 0n, den: 0n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: 4n, den: 0n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: -4n, den: 0n }), RangeError)

		// Negative rationals
		assert.throws(() => sqrtRationalIterative({ num: -1n, den: 1n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: -4n, den: 9n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: 4n, den: -9n }), RangeError)

		// Invalid options object
		assert.throws(() => sqrtRationalIterative({ num: 4n, den: 1n }, null), TypeError)
		assert.throws(() => sqrtRationalIterative({ num: 4n, den: 1n }, 5), TypeError)
		assert.throws(() => sqrtRationalIterative({ num: 4n, den: 1n }, []), TypeError)

		// Invalid iterations (also verified on exact squares and zero)
		assert.throws(
			() => sqrtRationalIterative({ num: 0n, den: 1n }, { iterations: 0 }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 4n, den: 1n }, { iterations: -3 }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { iterations: 1.5 }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { iterations: Number.NaN }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { iterations: Infinity }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { iterations: 5n }),
			TypeError
		)

		// Invalid tolerance
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: null }),
			TypeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: { num: 0n, den: 1n } }),
			RangeError
		)
		assert.throws(
			() =>
				sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: { num: -1n, den: 10n } }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: { num: 1n, den: 0n } }),
			RangeError
		)
	})
})
