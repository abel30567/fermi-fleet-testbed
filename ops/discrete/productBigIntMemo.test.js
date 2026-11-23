import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productBigIntMemo } from './productBigIntMemo.js'

/**
 * Independent reference implementation using naive sequential BigInt multiplication.
 *
 * @param {Iterable<bigint>} values
 * @returns {bigint}
 */
function naiveProduct(values) {
	let acc = 1n
	for (const v of values) {
		acc *= v
	}
	return acc
}

/**
 * Deterministic 64-bit xorshift PRNG for reproducible property/cross-check tests.
 *
 * @param {bigint} seed
 */
function createPrng(seed) {
	let state = seed & ((1n << 64n) - 1n)
	return () => {
		state ^= (state << 13n) & ((1n << 64n) - 1n)
		state ^= state >> 7n
		state ^= (state << 17n) & ((1n << 64n) - 1n)
		return state
	}
}

describe('productBigIntMemo', () => {
	it('returns 1n for empty iterables (multiplicative identity)', () => {
		assert.equal(productBigIntMemo([]), 1n)
		assert.equal(productBigIntMemo(new Set()), 1n)
		assert.equal(productBigIntMemo(new BigInt64Array(0)), 1n)
		function* emptyGen() {}
		assert.equal(productBigIntMemo(emptyGen()), 1n)
	})

	it('handles single-element inputs accurately', () => {
		assert.equal(productBigIntMemo([0n]), 0n)
		assert.equal(productBigIntMemo([1n]), 1n)
		assert.equal(productBigIntMemo([-1n]), -1n)
		assert.equal(productBigIntMemo([42n]), 42n)
		assert.equal(productBigIntMemo([-999999999999999999999999n]), -999999999999999999999999n)
	})

	it('computes products of small, mixed-sign, and repeated factors', () => {
		assert.equal(productBigIntMemo([2n, 3n, 4n]), 24n)
		assert.equal(productBigIntMemo([2n, -3n, 4n]), -24n)
		assert.equal(productBigIntMemo([-2n, -3n, 4n]), 24n)
		assert.equal(productBigIntMemo([-2n, -3n, -4n]), -24n)
		assert.equal(productBigIntMemo([1n, 1n, 1n]), 1n)
		assert.equal(productBigIntMemo([-1n, -1n, -1n]), -1n)
		assert.equal(productBigIntMemo([-1n, -1n, -1n, -1n]), 1n)
	})

	it('handles zeros anywhere in the input', () => {
		assert.equal(productBigIntMemo([0n, 5n, 10n]), 0n)
		assert.equal(productBigIntMemo([5n, 0n, 10n]), 0n)
		assert.equal(productBigIntMemo([-5n, 10n, 0n]), 0n)
		assert.equal(productBigIntMemo([0n, 0n, 0n]), 0n)
	})

	it('accepts diverse iterables without mutating inputs', () => {
		const input = [7n, 3n, 5n, 2n]
		const snapshot = [...input]
		assert.equal(productBigIntMemo(input), 210n)
		assert.deepEqual(input, snapshot)

		assert.equal(productBigIntMemo(new Set([2n, 3n, 5n, 7n])), 210n)
		assert.equal(productBigIntMemo(new BigInt64Array([2n, -3n, 5n])), -30n)
		assert.equal(productBigIntMemo(new BigUint64Array([10n, 20n, 30n])), 6000n)

		function* gen() {
			yield 11n
			yield 13n
			yield 17n
		}
		assert.equal(productBigIntMemo(gen()), 2431n)
	})

	it('handles precomputed small-power table and larger memoized powers', () => {
		// Inside precomputed small power table (base <= 32, exp <= 32)
		assert.equal(productBigIntMemo(Array(10).fill(2n)), 1024n)
		assert.equal(productBigIntMemo(Array(32).fill(3n)), 3n ** 32n)

		// Beyond precomputed power table -> binary exponentiation + powCache
		assert.equal(productBigIntMemo(Array(50).fill(3n)), 3n ** 50n)
		assert.equal(productBigIntMemo(Array(15).fill(1000003n)), 1000003n ** 15n)
		assert.equal(productBigIntMemo(Array(15).fill(-1000003n)), -(1000003n ** 15n))
	})

	it('handles very large arbitrary-precision BigInt values exactly', () => {
		const a = 10n ** 30n + 7n
		const b = 10n ** 30n + 9n
		const c = -(2n ** 128n - 1n)
		assert.equal(productBigIntMemo([a, b, c]), a * b * c)
	})

	it('produces consistent results across repeated memoized calls and permutations', () => {
		const a = [2n, 3n, 5n, 7n, 11n, 13n]
		const b = [13n, 7n, 2n, 11n, 3n, 5n]
		const c = [-13n, 7n, 2n, 11n, 3n, 5n]
		const expected = 30030n

		assert.equal(productBigIntMemo(a), expected)
		assert.equal(productBigIntMemo(a), expected) // cache hit
		assert.equal(productBigIntMemo(b), expected) // permutation cache hit
		assert.equal(productBigIntMemo(c), -expected) // same magnitude cache hit, negative sign
	})

	it('validates input iterable and every element strictly', () => {
		for (const badIterable of [null, undefined, 42, 42n, true, {}, '123']) {
			assert.throws(() => productBigIntMemo(badIterable), TypeError)
		}

		for (const badList of [
			[1, 2],
			[1n, 2],
			[1n, '2'],
			[1n, null],
			[1n, undefined],
			[1n, NaN],
			[1n, 1.5],
			[1n, true],
			[1n, {}],
			[0n, 'not-a-bigint'] // must validate even after encountering 0n
		]) {
			assert.throws(() => productBigIntMemo(badList), TypeError)
		}
	})

	it('cross-check: matches factorial computed independently for n = 1..50', () => {
		let fact = 1n
		const seq = []
		for (let n = 1; n <= 50; n++) {
			const bigN = BigInt(n)
			fact *= bigN
			seq.push(bigN)
			assert.equal(productBigIntMemo(seq), fact)
		}
		assert.equal(productBigIntMemo(seq), 30414093201713378043612608166064768844377641568960512000000000000n)
	})

	it('cross-check: matches naive multiplication and algebraic identities on PRNG inputs', () => {
		const rand = createPrng(0x123456789abcdef1n)

		for (let trial = 0; trial < 100; trial++) {
			const len = Number(rand() % 25n)
			const xs = []
			for (let i = 0; i < len; i++) {
				const mode = Number(rand() % 5n)
				let v
				if (mode === 0) {
					v = (rand() % 65n) - 32n // small values hitting SMALL_MUL_TABLE / zeros
				} else if (mode === 1) {
					v = (rand() % 10n) - 5n // frequent repeats hitting SMALL_POW_TABLE
				} else if (mode === 2) {
					v = (rand() % 100000n) - 50000n
				} else {
					const sign = (rand() & 1n) === 0n ? 1n : -1n
					v = sign * ((rand() << 64n) | rand())
				}
				xs.push(v)
			}

			const actual = productBigIntMemo(xs)
			const expected = naiveProduct(xs)
			assert.equal(actual, expected)

			// Commutativity check
			assert.equal(productBigIntMemo([...xs].reverse()), expected)

			// Associativity / splitting check
			const mid = Math.floor(xs.length / 2)
			const left = productBigIntMemo(xs.slice(0, mid))
			const right = productBigIntMemo(xs.slice(mid))
			assert.equal(left * right, expected)
		}
	})
})
