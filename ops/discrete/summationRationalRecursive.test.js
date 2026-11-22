import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationRationalRecursive } from './summationRationalRecursive.js'

/**
 * Independent sequential left-to-right exact rational reducer for cross-checking.
 *
 * @param {Array<{ num: bigint, den: bigint }>} terms
 * @returns {{ num: bigint, den: bigint }}
 */
function sequentialRationalSum(terms) {
	const gcd = (a, b) => {
		let x = a < 0n ? -a : a
		let y = b < 0n ? -b : b
		while (y !== 0n) {
			const t = x % y
			x = y
			y = t
		}
		return x
	}

	let num = 0n
	let den = 1n
	for (const term of terms) {
		let tn = term.num
		let td = term.den
		if (td < 0n) {
			tn = -tn
			td = -td
		}
		num = num * td + tn * den
		den = den * td
		const g = gcd(num, den)
		num /= g
		den /= g
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	return { num, den }
}

describe('summationRationalRecursive', () => {
	test('empty array returns 0/1', () => {
		assert.deepEqual(summationRationalRecursive([]), { num: 0n, den: 1n })
	})

	test('single item is normalized to lowest terms with positive denominator', () => {
		assert.deepEqual(summationRationalRecursive([{ num: 6n, den: 8n }]), { num: 3n, den: 4n })
		assert.deepEqual(summationRationalRecursive([{ num: 6n, den: -8n }]), { num: -3n, den: 4n })
		assert.deepEqual(summationRationalRecursive([{ num: -6n, den: -8n }]), { num: 3n, den: 4n })
		assert.deepEqual(summationRationalRecursive([{ num: 0n, den: -7n }]), { num: 0n, den: 1n })
	})

	test('basic positive fractions and reduction to lowest terms', () => {
		const terms = [
			{ num: 1n, den: 2n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 6n },
		]
		assert.deepEqual(summationRationalRecursive(terms), { num: 1n, den: 1n })
	})

	test('negative terms and negative denominators', () => {
		const terms = [
			{ num: -1n, den: 2n },
			{ num: 3n, den: -4n },
			{ num: -5n, den: -6n },
			{ num: 1n, den: 12n },
		]
		// -1/2 - 3/4 + 5/6 + 1/12 = (-6 - 9 + 10 + 1)/12 = -4/12 = -1/3
		assert.deepEqual(summationRationalRecursive(terms), { num: -1n, den: 3n })
	})

	test('cancelling sums reduce cleanly to 0/1', () => {
		const terms = [
			{ num: 7n, den: 13n },
			{ num: 11n, den: 19n },
			{ num: -7n, den: 13n },
			{ num: 11n, den: -19n },
		]
		assert.deepEqual(summationRationalRecursive(terms), { num: 0n, den: 1n })
	})

	test('harmonic series H_10 matches exact value 7381/2520', () => {
		const terms = Array.from({ length: 10 }, (_, i) => ({
			num: 1n,
			den: BigInt(i + 1),
		}))
		assert.deepEqual(summationRationalRecursive(terms), { num: 7381n, den: 2520n })
	})

	test('does not mutate input array or element objects', () => {
		const item = { num: 4n, den: -6n }
		const terms = [item]
		const result = summationRationalRecursive(terms)
		assert.deepEqual(result, { num: -2n, den: 3n })
		assert.deepEqual(item, { num: 4n, den: -6n })
		assert.notEqual(result, item)
	})

	test('range/generator mode with safe integers and BigInts', () => {
		// H_10 via safe integer range
		const h10Num = summationRationalRecursive(1, 10, (k) => ({ num: 1n, den: BigInt(k) }))
		assert.deepEqual(h10Num, { num: 7381n, den: 2520n })

		// H_10 via BigInt range
		const h10Big = summationRationalRecursive(1n, 10n, (k) => ({ num: 1n, den: k }))
		assert.deepEqual(h10Big, { num: 7381n, den: 2520n })

		// Empty ranges (start > end) return 0/1
		assert.deepEqual(
			summationRationalRecursive(5, 3, () => {
				throw new Error('should not be called')
			}),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			summationRationalRecursive(5n, 3n, () => {
				throw new Error('should not be called')
			}),
			{ num: 0n, den: 1n },
		)
	})

	test('cross-check: telescoping series sum_{k=1..N} 1/(k*(k+1)) === N/(N+1)', () => {
		const N = 250n
		const fromRange = summationRationalRecursive(1n, N, (k) => ({
			num: 1n,
			den: k * (k + 1n),
		}))
		assert.deepEqual(fromRange, { num: N, den: N + 1n })

		const terms = Array.from({ length: Number(N) }, (_, i) => {
			const k = BigInt(i + 1)
			return { num: 1n, den: k * (k + 1n) }
		})
		assert.deepEqual(summationRationalRecursive(terms), { num: N, den: N + 1n })
	})

	test('cross-check: geometric series sum_{k=0..n} (2/3)^k === 3 * (1 - (2/3)^(n+1))', () => {
		const n = 40
		const terms = Array.from({ length: n + 1 }, (_, k) => ({
			num: 2n ** BigInt(k),
			den: 3n ** BigInt(k),
		}))
		// Closed form: (1 - (2/3)^(n+1)) / (1 - 2/3) = (3^(n+1) - 2^(n+1)) / 3^n
		const expected = {
			num: 3n ** BigInt(n + 1) - 2n ** BigInt(n + 1),
			den: 3n ** BigInt(n),
		}
		assert.deepEqual(summationRationalRecursive(terms), expected)
	})

	test('cross-check: pseudo-random mixed rationals match independent sequential reduction', () => {
		// Deterministic LCG for reproducible mixed signs, unreduced inputs, and large values
		let state = 123456789n
		const nextRand = () => {
			state = (1103515245n * state + 12345n) % (1n << 31n)
			return state
		}

		const terms = Array.from({ length: 127 }, () => {
			const num = nextRand() - (1n << 30n)
			const denRaw = (nextRand() % 997n) + 1n
			const den = nextRand() % 2n === 0n ? denRaw : -denRaw
			return { num, den }
		})

		const recursiveResult = summationRationalRecursive(terms)
		const sequentialResult = sequentialRationalSum(terms)

		assert.deepEqual(recursiveResult, sequentialResult)
		assert.ok(recursiveResult.den > 0n)
	})

	test('cross-check: large harmonic series H_100 matches independent sequential reduction', () => {
		const terms = Array.from({ length: 100 }, (_, i) => ({
			num: 1n,
			den: BigInt(i + 1),
		}))
		assert.deepEqual(summationRationalRecursive(terms), sequentialRationalSum(terms))
	})

	test('validates invalid arguments and malformed rationals', () => {
		// Wrong arity
		assert.throws(() => summationRationalRecursive(), TypeError)
		assert.throws(() => summationRationalRecursive(1, 2), TypeError)
		assert.throws(() => summationRationalRecursive(1, 2, () => ({ num: 1n, den: 1n }), 4), TypeError)

		// Non-array in 1-arg form
		assert.throws(() => summationRationalRecursive(null), TypeError)
		assert.throws(() => summationRationalRecursive(undefined), TypeError)
		assert.throws(() => summationRationalRecursive('1/2'), TypeError)
		assert.throws(() => summationRationalRecursive({ num: 1n, den: 2n }), TypeError)

		// Sparse array
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => summationRationalRecursive([{ num: 1n, den: 2n }, , { num: 1n, den: 3n }]), TypeError)

		// Non-rational elements
		assert.throws(() => summationRationalRecursive([null]), TypeError)
		assert.throws(() => summationRationalRecursive([42]), TypeError)
		assert.throws(() => summationRationalRecursive([{ num: 1, den: 2n }]), TypeError)
		assert.throws(() => summationRationalRecursive([{ num: 1n, den: 2 }]), TypeError)
		assert.throws(() => summationRationalRecursive([{ num: 1n }]), TypeError)

		// Zero denominator
		assert.throws(() => summationRationalRecursive([{ num: 1n, den: 0n }]), RangeError)
		assert.throws(() => summationRationalRecursive([{ num: 0n, den: 0n }]), RangeError)
		assert.throws(
			() =>
				summationRationalRecursive([
					{ num: 1n, den: 2n },
					{ num: 3n, den: 0n },
				]),
			RangeError,
		)

		// Range/generator validation
		assert.throws(() => summationRationalRecursive(1, 5, 'not-a-fn'), TypeError)
		assert.throws(() => summationRationalRecursive(5, 1, null), TypeError)
		assert.throws(() => summationRationalRecursive(1, 5n, () => ({ num: 1n, den: 1n })), TypeError)
		assert.throws(() => summationRationalRecursive(1.5, 5, () => ({ num: 1n, den: 1n })), RangeError)
		assert.throws(
			() => summationRationalRecursive(1, Number.MAX_SAFE_INTEGER + 1, () => ({ num: 1n, den: 1n })),
			RangeError,
		)
		assert.throws(() => summationRationalRecursive(1, 3, () => ({ num: 1n, den: 0n })), RangeError)
		assert.throws(() => summationRationalRecursive(1n, 3n, () => ({ num: 1, den: 1n })), TypeError)
	})
})
