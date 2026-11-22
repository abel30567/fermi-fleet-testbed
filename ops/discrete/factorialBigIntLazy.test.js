import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialBigIntLazy } from './factorialBigIntLazy.js'

/**
 * Independent naive iterative reference implementation of factorial for cross-checking.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function naiveFactorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i++) {
		acc *= i
	}
	return acc
}

/**
 * Computes the exact p-adic valuation v_p(n!) via Legendre's formula.
 *
 * @param {bigint} n
 * @param {bigint} p - Prime base
 * @returns {bigint}
 */
function legendreValuation(n, p) {
	let count = 0n
	let power = p
	while (power <= n) {
		count += n / power
		power *= p
	}
	return count
}

/**
 * Counts how many times prime p divides positive BigInt x.
 *
 * @param {bigint} x
 * @param {bigint} p
 * @returns {bigint}
 */
function countPrimeFactor(x, p) {
	let count = 0n
	let rem = x
	while (rem % p === 0n) {
		rem /= p
		count++
	}
	return count
}

describe('factorialBigIntLazy', () => {
	test('computes exact factorials for small non-negative BigInts', () => {
		const inputs = [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 12n]
		const expected = [
			1n,
			1n,
			2n,
			6n,
			24n,
			120n,
			720n,
			5040n,
			40320n,
			362880n,
			3628800n,
			479001600n,
		]
		assert.deepEqual(Array.from(factorialBigIntLazy(inputs)), expected)
	})

	test('handles empty iterables of various kinds', () => {
		assert.deepEqual(Array.from(factorialBigIntLazy([])), [])
		assert.deepEqual(Array.from(factorialBigIntLazy(new Set())), [])
		function* emptyGen() {}
		assert.deepEqual(Array.from(factorialBigIntLazy(emptyGen())), [])
	})

	test('handles zero, one, duplicates, and non-monotonic sequences', () => {
		const seq = [0n, 0n, 1n, 0n, 5n, 5n, 2n, 7n, 3n, 4n, 4n, 1n, 6n]
		const expected = seq.map(naiveFactorial)
		assert.deepEqual(Array.from(factorialBigIntLazy(seq)), expected)
	})

	test('accepts diverse iterable types (Set, generator, custom iterable)', () => {
		const fromSet = Array.from(factorialBigIntLazy(new Set([0n, 3n, 5n])))
		assert.deepEqual(fromSet, [1n, 6n, 120n])

		const customIterable = {
			[Symbol.iterator]() {
				const values = [4n, 6n]
				let idx = 0
				return {
					next() {
						if (idx < values.length) {
							return { value: values[idx++], done: false }
						}
						return { value: undefined, done: true }
					},
				}
			},
		}
		assert.deepEqual(Array.from(factorialBigIntLazy(customIterable)), [24n, 720n])
	})

	test('computes huge BigInt factorials accurately and efficiently', () => {
		const [f50, f100, f500, f1000] = Array.from(factorialBigIntLazy([50n, 100n, 500n, 1000n]))

		// Known exact value of 50!
		assert.equal(
			f50,
			30414093201713378043612608166064768844377641568960512000000000000n
		)
		// Known exact value of 100!
		assert.equal(
			f100,
			93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n
		)

		// 1000! has 2568 decimal digits and 249 trailing zeros
		const f1000Str = f1000.toString()
		assert.equal(f1000Str.length, 2568)
		assert.equal(f1000Str.endsWith('0'.repeat(249)), true)
		assert.notEqual(f1000Str[f1000Str.length - 250], '0')

		// Exact divisibility: 1000! is divisible by 500!
		assert.equal(f1000 % f500, 0n)
	})

	test('validates top-level inputs eagerly and throws TypeError on invalid containers', () => {
		const invalidContainers = [
			null,
			undefined,
			0,
			42,
			5n,
			true,
			false,
			'123',
			'',
			{},
			{ [Symbol.iterator]: 123 },
			Symbol('x'),
			() => {},
		]

		for (const bad of invalidContainers) {
			assert.throws(() => factorialBigIntLazy(bad), TypeError)
		}
	})

	test('validates element types lazily and throws TypeError for non-BigInt elements', () => {
		const invalidElements = [5, 0, -1, '5', null, undefined, true, NaN, {}, Object(5n)]

		for (const bad of invalidElements) {
			const gen = factorialBigIntLazy([3n, bad, 4n])
			// First valid element is yielded before encountering invalid element
			assert.deepEqual(gen.next(), { value: 6n, done: false })
			assert.throws(() => gen.next(), TypeError)
		}
	})

	test('validates non-negativity lazily and throws RangeError for negative BigInts', () => {
		for (const neg of [-1n, -2n, -100n, -(10n ** 30n)]) {
			const gen = factorialBigIntLazy([4n, neg, 5n])
			// First valid element is yielded before encountering negative element
			assert.deepEqual(gen.next(), { value: 24n, done: false })
			assert.throws(() => gen.next(), RangeError)
		}
	})

	test('consumes inputs strictly lazily without eager materialization', () => {
		let pulled = 0
		let closed = false

		function* infiniteNaturals() {
			try {
				let n = 0n
				while (true) {
					pulled++
					yield n++
				}
			} finally {
				closed = true
			}
		}

		const gen = factorialBigIntLazy(infiniteNaturals())
		// Creating the generator must not pull any elements
		assert.equal(pulled, 0)
		assert.equal(closed, false)

		const collected = []
		for (const fact of gen) {
			collected.push(fact)
			assert.equal(pulled, collected.length)
			if (collected.length === 8) {
				break
			}
		}

		assert.deepEqual(collected, [1n, 1n, 2n, 6n, 24n, 120n, 720n, 5040n])
		assert.equal(pulled, 8)
		assert.equal(closed, true)
	})

	test('never evaluates elements beyond what the consumer pulls', () => {
		function* guardedSequence() {
			yield 0n
			yield 5n
			throw new Error('Should not have been pulled')
		}

		const gen = factorialBigIntLazy(guardedSequence())
		assert.deepEqual(gen.next(), { value: 1n, done: false })
		assert.deepEqual(gen.next(), { value: 120n, done: false })
		assert.deepEqual(gen.return(), { value: undefined, done: true })
	})

	test('cross-check: matches naive iterative factorial across monotonic and shuffled inputs', () => {
		const monotonic = Array.from({ length: 65 }, (_, i) => BigInt(i))
		assert.deepEqual(
			Array.from(factorialBigIntLazy(monotonic)),
			monotonic.map(naiveFactorial)
		)

		// Deterministic pseudo-shuffled sequence with duplicates and jumps
		const mixed = [60n, 15n, 32n, 32n, 0n, 48n, 1n, 64n, 12n, 25n, 26n, 27n, 9n]
		assert.deepEqual(Array.from(factorialBigIntLazy(mixed)), mixed.map(naiveFactorial))
	})

	test('cross-check: satisfies Legendre valuation, Wilson theorem, and telescoping sum identity', () => {
		// 1. Legendre's formula for p-adic valuation of 500!
		const [f500] = Array.from(factorialBigIntLazy([500n]))
		for (const p of [2n, 3n, 5n, 7n, 11n]) {
			assert.equal(countPrimeFactor(f500, p), legendreValuation(500n, p))
		}

		// 2. Wilson's theorem: (p - 1)! ≡ p - 1 (mod p) for prime p
		const primes = [2n, 3n, 5n, 7n, 13n, 97n, 257n]
		const wilsonFacts = Array.from(factorialBigIntLazy(primes.map((p) => p - 1n)))
		primes.forEach((p, idx) => {
			assert.equal(wilsonFacts[idx] % p, p - 1n)
		})

		// 3. Telescoping identity: sum_{k=0}^{N} (k * k!) === (N + 1)! - 1
		const N = 80n
		const range = Array.from({ length: Number(N) + 2 }, (_, i) => BigInt(i))
		const facts = Array.from(factorialBigIntLazy(range))
		let sum = 0n
		for (let k = 0; k <= Number(N); k++) {
			sum += BigInt(k) * facts[k]
		}
		assert.equal(sum, facts[Number(N) + 1] - 1n)
	})
})
