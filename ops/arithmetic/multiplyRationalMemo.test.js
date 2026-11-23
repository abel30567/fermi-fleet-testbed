import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyRationalMemo } from './multiplyRationalMemo.js'

/**
 * Independent reference implementation of exact rational multiplication
 * using straightforward BigInt multiplication followed by Euclidean GCD.
 */
function referenceGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function referenceMultiply(a, b) {
	const rawNum = a.num * b.num
	const rawDen = a.den * b.den
	if (rawNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = rawDen < 0n ? -1n : 1n
	const num = rawNum * sign
	const den = rawDen * sign
	const g = referenceGcd(num, den)
	return { num: num / g, den: den / g }
}

function referenceAdd(a, b) {
	const rawNum = a.num * b.den + b.num * a.den
	const rawDen = a.den * b.den
	if (rawNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = rawDen < 0n ? -1n : 1n
	const num = rawNum * sign
	const den = rawDen * sign
	const g = referenceGcd(num, den)
	return { num: num / g, den: den / g }
}

describe('multiplyRationalMemo', () => {
	test('multiplies basic positive fractions and reduces to lowest terms', () => {
		assert.deepEqual(
			multiplyRationalMemo({ num: 2n, den: 3n }, { num: 3n, den: 4n }),
			{ num: 1n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: 5n, den: 7n }, { num: 11n, den: 13n }),
			{ num: 55n, den: 91n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: 6n, den: 35n }, { num: 14n, den: 9n }),
			{ num: 4n, den: 15n },
		)
	})

	test('handles signs, negative denominators, and unreduced inputs', () => {
		assert.deepEqual(
			multiplyRationalMemo({ num: -2n, den: 3n }, { num: 9n, den: 4n }),
			{ num: -3n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: -2n, den: 3n }, { num: -9n, den: 4n }),
			{ num: 3n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: 4n, den: -6n }, { num: -15n, den: -10n }),
			{ num: -1n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: 12n, den: 18n }, { num: 25n, den: -30n }),
			{ num: -5n, den: 9n },
		)
	})

	test('handles zero, identity, and multiplicative inverses', () => {
		assert.deepEqual(
			multiplyRationalMemo({ num: 0n, den: 1n }, { num: 7n, den: 9n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: 7n, den: 9n }, { num: 0n, den: -13n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: 0n, den: -5n }, { num: 0n, den: -7n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: 1n, den: 1n }, { num: -17n, den: 23n }),
			{ num: -17n, den: 23n },
		)
		assert.deepEqual(
			multiplyRationalMemo({ num: -17n, den: 23n }, { num: 23n, den: -17n }),
			{ num: 1n, den: 1n },
		)
	})

	test('handles very large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const bigA = {
			num: 2n ** 120n * 3n ** 40n,
			den: 5n ** 50n * 7n ** 30n,
		}
		const bigB = {
			num: 5n ** 55n * 7n ** 20n,
			den: -(2n ** 115n * 3n ** 42n),
		}
		const expected = {
			num: -(2n ** 5n * 5n ** 5n),
			den: 3n ** 2n * 7n ** 10n,
		}
		const actual = multiplyRationalMemo(bigA, bigB)
		assert.deepEqual(actual, expected)
		assert.equal(referenceGcd(actual.num, actual.den), 1n)
		assert.ok(actual.den > 0n)
	})

	test('memoization returns consistent fresh objects and survives cache eviction', () => {
		const a = { num: 101n, den: 103n }
		const b = { num: 107n, den: 109n }

		const first = multiplyRationalMemo(a, b)
		assert.deepEqual(first, { num: 10807n, den: 11227n })

		// Mutate returned object to ensure cache isolation
		first.num = 999999n
		first.den = 1n

		const second = multiplyRationalMemo(a, b)
		const commuted = multiplyRationalMemo(b, a)
		assert.deepEqual(second, { num: 10807n, den: 11227n })
		assert.deepEqual(commuted, { num: 10807n, den: 11227n })
		assert.notEqual(second, commuted)

		// Exceed cache capacity (> 4096 distinct pairs) and verify correctness
		for (let i = 1n; i <= 4200n; i += 1n) {
			const res = multiplyRationalMemo({ num: i, den: i + 1n }, { num: i + 1n, den: i + 2n })
			const expected = referenceMultiply({ num: i, den: i + 1n }, { num: i + 1n, den: i + 2n })
			assert.deepEqual(res, expected)
		}

		// Re-query original pair after eviction
		assert.deepEqual(multiplyRationalMemo(a, b), { num: 10807n, den: 11227n })
	})

	test('validates inputs and rejects invalid types or zero denominators', () => {
		const valid = { num: 1n, den: 2n }

		assert.throws(() => multiplyRationalMemo(null, valid), TypeError)
		assert.throws(() => multiplyRationalMemo(valid, undefined), TypeError)
		assert.throws(() => multiplyRationalMemo(42, valid), TypeError)
		assert.throws(() => multiplyRationalMemo([1n, 2n], valid), TypeError)
		assert.throws(() => multiplyRationalMemo({ num: 1, den: 2n }, valid), TypeError)
		assert.throws(() => multiplyRationalMemo(valid, { num: 1n, den: 2 }), TypeError)
		assert.throws(() => multiplyRationalMemo({ num: 1n }, valid), TypeError)
		assert.throws(() => multiplyRationalMemo(valid, { den: 2n }), TypeError)

		assert.throws(() => multiplyRationalMemo({ num: 1n, den: 0n }, valid), RangeError)
		assert.throws(() => multiplyRationalMemo(valid, { num: 0n, den: 0n }), RangeError)
	})

	test('independent cross-check over small rational grid and deterministic large rationals', () => {
		// Exhaustive grid covering both precomputed table hits and misses
		for (let n1 = -8n; n1 <= 8n; n1 += 1n) {
			for (let d1 = -6n; d1 <= 6n; d1 += 1n) {
				if (d1 === 0n) continue
				for (let n2 = -5n; n2 <= 5n; n2 += 1n) {
					for (let d2 = -4n; d2 <= 4n; d2 += 1n) {
						if (d2 === 0n) continue
						const a = { num: n1, den: d1 }
						const b = { num: n2, den: d2 }
						const actual = multiplyRationalMemo(a, b)
						const expected = referenceMultiply(a, b)
						assert.deepEqual(actual, expected)
						assert.ok(actual.den > 0n)
						assert.equal(referenceGcd(actual.num, actual.den), 1n)
					}
				}
			}
		}

		// Deterministic LCG generator for large BigInt cross-checks
		let state = 0x123456789abcdef1n
		const nextBig = () => {
			state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 128n) - 1n)
			return state - (1n << 127n)
		}

		for (let i = 0; i < 200; i += 1) {
			const a = { num: nextBig(), den: nextBig() || 1n }
			const b = { num: nextBig(), den: nextBig() || 1n }
			const actual = multiplyRationalMemo(a, b)
			const expected = referenceMultiply(a, b)
			assert.deepEqual(actual, expected)
			assert.ok(actual.den > 0n)
			assert.equal(referenceGcd(actual.num, actual.den), 1n)
		}
	})

	test('independent algebraic cross-check: commutativity, associativity, distributivity', () => {
		const samples = [
			{ num: 0n, den: 5n },
			{ num: 3n, den: 4n },
			{ num: -5n, den: 6n },
			{ num: 14n, den: -21n },
			{ num: 97n, den: 101n },
			{ num: 10n ** 25n + 7n, den: 10n ** 24n + 3n },
		]

		for (const a of samples) {
			for (const b of samples) {
				// Commutativity: a * b === b * a
				assert.deepEqual(multiplyRationalMemo(a, b), multiplyRationalMemo(b, a))

				for (const c of samples) {
					// Associativity: (a * b) * c === a * (b * c)
					const leftAssoc = multiplyRationalMemo(multiplyRationalMemo(a, b), c)
					const rightAssoc = multiplyRationalMemo(a, multiplyRationalMemo(b, c))
					assert.deepEqual(leftAssoc, rightAssoc)

					// Distributivity: a * (b + c) === (a * b) + (a * c)
					const lhs = multiplyRationalMemo(a, referenceAdd(b, c))
					const rhs = referenceAdd(multiplyRationalMemo(a, b), multiplyRationalMemo(a, c))
					assert.deepEqual(lhs, rhs)
				}
			}
		}
	})
})
