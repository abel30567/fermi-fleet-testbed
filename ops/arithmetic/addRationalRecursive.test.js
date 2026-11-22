import { describe, test } from 'node:test'
import assert from 'node:assert'
import { addRationalRecursive } from './addRationalRecursive.js'

/**
 * Independent reference implementation using naive common-denominator accumulation
 * and iterative Euclidean GCD for cross-checking.
 */
function addRationalCommonDenominator(rationals) {
	if (rationals.length === 0) {
		return { num: 0n, den: 1n }
	}

	let commonDen = 1n
	for (const r of rationals) {
		commonDen *= r.den
	}

	let totalNum = 0n
	for (const r of rationals) {
		totalNum += r.num * (commonDen / r.den)
	}

	if (totalNum === 0n) {
		return { num: 0n, den: 1n }
	}

	if (commonDen < 0n) {
		totalNum = -totalNum
		commonDen = -commonDen
	}

	let a = totalNum < 0n ? -totalNum : totalNum
	let b = commonDen
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}

	return { num: totalNum / a, den: commonDen / a }
}

describe('addRationalRecursive', () => {
	test('adds two simple rationals and reduces to lowest terms', () => {
		assert.deepStrictEqual(
			addRationalRecursive({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
			{ num: 5n, den: 6n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: 1n, den: 6n }, { num: 1n, den: 3n }),
			{ num: 1n, den: 2n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: 2n, den: 4n }, { num: 6n, den: 9n }),
			{ num: 7n, den: 6n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: 3n, den: 4n }, { num: 5n, den: 4n }),
			{ num: 2n, den: 1n },
		)
	})

	test('handles zero operands and exact cancellation to 0n/1n', () => {
		assert.deepStrictEqual(
			addRationalRecursive({ num: 0n, den: 7n }, { num: 0n, den: 13n }),
			{ num: 0n, den: 1n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: 0n, den: 5n }, { num: 4n, den: 6n }),
			{ num: 2n, den: 3n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: 4n, den: 6n }, { num: 0n, den: -9n }),
			{ num: 2n, den: 3n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: 3n, den: 7n }, { num: -3n, den: 7n }),
			{ num: 0n, den: 1n },
		)
		assert.deepStrictEqual(
			addRationalRecursive(
				{ num: 1n, den: 2n },
				{ num: 1n, den: 3n },
				{ num: -5n, den: 6n },
			),
			{ num: 0n, den: 1n },
		)
		assert.deepStrictEqual(
			addRationalRecursive([
				{ num: 5n, den: 12n },
				{ num: 7n, den: 12n },
				{ num: -1n, den: 1n },
			]),
			{ num: 0n, den: 1n },
		)
	})

	test('normalizes negative denominators to positive denominators', () => {
		assert.deepStrictEqual(
			addRationalRecursive({ num: 1n, den: -2n }, { num: 1n, den: -3n }),
			{ num: -5n, den: 6n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: -3n, den: -6n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 1n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: 0n, den: -100n }),
			{ num: 0n, den: 1n },
		)
		assert.deepStrictEqual(
			addRationalRecursive({ num: 10n, den: -15n }),
			{ num: -2n, den: 3n },
		)
	})

	test('supports variadic arguments, single rational, and arrays including empty array', () => {
		assert.deepStrictEqual(addRationalRecursive([]), { num: 0n, den: 1n })
		assert.deepStrictEqual(
			addRationalRecursive([{ num: 6n, den: 8n }]),
			{ num: 3n, den: 4n },
		)
		assert.deepStrictEqual(
			addRationalRecursive(
				{ num: 1n, den: 2n },
				{ num: 1n, den: 4n },
				{ num: 1n, den: 8n },
				{ num: 1n, den: 16n },
				{ num: 1n, den: 32n },
			),
			{ num: 31n, den: 32n },
		)
		assert.deepStrictEqual(
			addRationalRecursive([
				{ num: 1n, den: 2n },
				{ num: 1n, den: 4n },
				{ num: 1n, den: 8n },
				{ num: 1n, den: 16n },
				{ num: 1n, den: 32n },
			]),
			{ num: 31n, den: 32n },
		)
	})

	test('handles huge BigInt numerators and denominators accurately', () => {
		const bigA = 10n ** 60n + 7n
		const bigB = 10n ** 60n + 9n
		const r1 = { num: 1n, den: bigA }
		const r2 = { num: 1n, den: bigB }

		// bigA and bigB differ by 2 and both are odd, so gcd(bigA, bigB) = 1.
		assert.deepStrictEqual(addRationalRecursive(r1, r2), {
			num: bigA + bigB,
			den: bigA * bigB,
		})

		// Shared huge factor cancels completely.
		const scale = (1n << 200n) - 1n
		assert.deepStrictEqual(
			addRationalRecursive(
				{ num: 3n * scale, den: 8n * scale },
				{ num: 5n * scale, den: 8n * scale },
			),
			{ num: 1n, den: 1n },
		)

		// Consecutive Fibonacci numbers (worst-case inputs for Euclidean GCD).
		let f0 = 1n
		let f1 = 1n
		for (let i = 0; i < 150; i++) {
			;[f0, f1] = [f1, f0 + f1]
		}
		assert.deepStrictEqual(
			addRationalRecursive({ num: f0, den: f1 }, { num: f1 - f0, den: f1 }),
			{ num: 1n, den: 1n },
		)
	})

	test('does not mutate input objects or arrays', () => {
		const a = Object.freeze({ num: 2n, den: -4n })
		const b = Object.freeze({ num: 3n, den: 6n })
		const list = Object.freeze([a, b])
		assert.deepStrictEqual(addRationalRecursive(list), { num: 0n, den: 1n })
		assert.deepStrictEqual(addRationalRecursive(a, b), { num: 0n, den: 1n })
	})

	test('throws RangeError for zero denominators', () => {
		assert.throws(
			() => addRationalRecursive({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
			RangeError,
		)
		assert.throws(
			() => addRationalRecursive({ num: 1n, den: 2n }, { num: 1n, den: 0n }),
			RangeError,
		)
		assert.throws(
			() => addRationalRecursive({ num: 0n, den: 0n }),
			RangeError,
		)
		assert.throws(
			() => addRationalRecursive([
				{ num: 1n, den: 3n },
				{ num: 2n, den: 5n },
				{ num: -4n, den: 0n },
			]),
			RangeError,
		)
	})

	test('throws TypeError for invalid objects, types, or call signatures', () => {
		assert.throws(() => addRationalRecursive(), TypeError)
		assert.throws(() => addRationalRecursive(null, { num: 1n, den: 2n }), TypeError)
		assert.throws(() => addRationalRecursive(undefined, { num: 1n, den: 2n }), TypeError)
		assert.throws(() => addRationalRecursive(1, 2), TypeError)
		assert.throws(() => addRationalRecursive(1n, 2n), TypeError)
		assert.throws(() => addRationalRecursive('1/2', '1/3'), TypeError)
		assert.throws(() => addRationalRecursive({ num: 1, den: 2n }, { num: 1n, den: 2n }), TypeError)
		assert.throws(() => addRationalRecursive({ num: 1n, den: 2 }, { num: 1n, den: 2n }), TypeError)
		assert.throws(() => addRationalRecursive({ num: 1n }, { num: 1n, den: 2n }), TypeError)
		assert.throws(() => addRationalRecursive({ den: 2n }, { num: 1n, den: 2n }), TypeError)
		assert.throws(() => addRationalRecursive({}, { num: 1n, den: 2n }), TypeError)
		assert.throws(
			() => addRationalRecursive([{ num: 1n, den: 2n }], { num: 1n, den: 2n }),
			TypeError,
		)
		assert.throws(
			() => addRationalRecursive([[{ num: 1n, den: 2n }]]),
			TypeError,
		)
		// Sparse array hole
		const sparse = new Array(2)
		sparse[1] = { num: 1n, den: 2n }
		assert.throws(() => addRationalRecursive(sparse), TypeError)
	})

	test('cross-check against common-denominator computation', () => {
		const samples = [
			{ num: 7n, den: 12n },
			{ num: -5n, den: 18n },
			{ num: 11n, den: -24n },
			{ num: 13n, den: 30n },
			{ num: -17n, den: -42n },
			{ num: 0n, den: 99n },
			{ num: 23n, den: 36n },
			{ num: -29n, den: 60n },
			{ num: 31n, den: 84n },
			{ num: -37n, den: 90n },
			{ num: 41n, den: 105n },
			{ num: -43n, den: 120n },
			{ num: 47n, den: 140n },
		]

		const expected = addRationalCommonDenominator(samples)
		assert.deepStrictEqual(addRationalRecursive(samples), expected)
		assert.deepStrictEqual(addRationalRecursive(...samples), expected)
		// Reversed order verifies commutativity & associativity across different divide-and-conquer splits.
		assert.deepStrictEqual(addRationalRecursive([...samples].reverse()), expected)
	})

	test('cross-check against telescoping harmonic series sum', () => {
		// Sum_{k=1..N} 1 / (k * (k + 1)) = Sum_{k=1..N} (1/k - 1/(k+1)) = N / (N + 1)
		const n = 200n
		const terms = []
		const differenceTerms = []
		for (let k = 1n; k <= n; k++) {
			terms.push({ num: 1n, den: k * (k + 1n) })
			differenceTerms.push({ num: 1n, den: k }, { num: -1n, den: k + 1n })
		}

		const expected = { num: n, den: n + 1n }
		assert.deepStrictEqual(addRationalRecursive(terms), expected)
		assert.deepStrictEqual(addRationalRecursive(differenceTerms), expected)
	})
})
