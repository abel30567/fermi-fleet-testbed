import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andBitsetLazy } from './andBitsetLazy.js'

/**
 * Helper: encode a Set (or array) of non-negative integer bit positions into a BigInt bitset.
 *
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function encodeBitset(indices) {
	let bits = 0n
	for (const idx of indices) {
		bits |= 1n << BigInt(idx)
	}
	return bits
}

/**
 * Helper: decode a non-negative BigInt bitset into a sorted array of set bit positions.
 *
 * @param {bigint} bits
 * @returns {number[]}
 */
function decodeBitset(bits) {
	const result = []
	let remaining = bits
	let pos = 0
	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			result.push(pos)
		}
		remaining >>= 1n
		pos++
	}
	return result
}

/**
 * Naive reference set intersection over JS Set<number>.
 *
 * @param {Set<number>[]} sets
 * @returns {Set<number>}
 */
function naiveSetIntersection(sets) {
	const [first, ...rest] = sets
	const out = new Set()
	for (const elem of first) {
		if (rest.every((s) => s.has(elem))) {
			out.add(elem)
		}
	}
	return out
}

describe('andBitsetLazy', () => {
	test('single iterable yields running cumulative bitwise AND', () => {
		const input = [0b11111n, 0b11011n, 0b01110n, 0b01010n, 0b00101n]
		const result = [...andBitsetLazy(input)]
		assert.deepEqual(result, [0b11111n, 0b11011n, 0b01010n, 0b01010n, 0b00000n])
	})

	test('two iterables yield element-wise bitwise AND', () => {
		const a = [0b1100n, 0b1010n, 0b1111n, 0b0000n]
		const b = [0b1010n, 0b0011n, 0b0101n, 0b1111n]
		assert.deepEqual([...andBitsetLazy(a, b)], [0b1000n, 0b0010n, 0b0101n, 0b0000n])
	})

	test('three or more iterables yield element-wise bitwise AND', () => {
		const a = [0b1111n, 0b1110n, 0b1011n]
		const b = [0b1101n, 0b0111n, 0b1111n]
		const c = [0b0111n, 0b1011n, 0b0011n]
		const d = [0b1111n, 0b1111n, 0b1010n]
		assert.deepEqual([...andBitsetLazy(a, b, c, d)], [0b0101n, 0b0010n, 0b0010n])
	})

	test('supports diverse iterable types (Set, BigUint64Array, generators, custom iterables)', () => {
		const setSrc = new Set([0b1110n, 0b0111n])
		const typedSrc = new BigUint64Array([0b1011n, 0b1101n])
		function* genSrc() {
			yield 0b1111n
			yield 0b0101n
		}
		const customSrc = {
			*[Symbol.iterator]() {
				yield 0b1010n
				yield 0b1111n
			},
		}

		assert.deepEqual(
			[...andBitsetLazy(setSrc, typedSrc, genSrc(), customSrc)],
			[0b1010n, 0b0101n]
		)
	})

	test('edge cases: empty iterables, single elements, unequal lengths, zero bitsets', () => {
		assert.deepEqual([...andBitsetLazy([])], [])
		assert.deepEqual([...andBitsetLazy([0n])], [0n])
		assert.deepEqual([...andBitsetLazy([0b10101n])], [0b10101n])
		assert.deepEqual([...andBitsetLazy([], [1n, 2n])], [])
		assert.deepEqual([...andBitsetLazy([1n, 2n], [])], [])
		assert.deepEqual([...andBitsetLazy([1n, 2n], [3n], [])], [])

		// Unequal lengths stop at shortest
		assert.deepEqual(
			[...andBitsetLazy([0b111n, 0b101n, 0b011n, 0b111n], [0b011n, 0b110n])],
			[0b011n, 0b100n]
		)

		// Disjoint bitsets yield 0n
		assert.deepEqual(
			[...andBitsetLazy([0b101010n, 0b1100n], [0b010101n, 0b0011n])],
			[0n, 0n]
		)
	})

	test('arbitrary-width huge BigInt bitsets (thousands of bits wide)', () => {
		const b1 = (1n << 0n) | (1n << 63n) | (1n << 64n) | (1n << 512n) | (1n << 10000n)
		const b2 = (1n << 64n) | (1n << 256n) | (1n << 512n) | (1n << 10000n) | (1n << 12345n)
		const b3 = (1n << 64n) | (1n << 10000n) | (1n << 20000n)

		const expectedSingle = [b1, (1n << 64n) | (1n << 512n) | (1n << 10000n), (1n << 64n) | (1n << 10000n)]
		assert.deepEqual([...andBitsetLazy([b1, b2, b3])], expectedSingle)

		assert.deepEqual(
			[...andBitsetLazy([b1, b2], [b2, b3])],
			[(1n << 64n) | (1n << 512n) | (1n << 10000n), (1n << 64n) | (1n << 10000n)]
		)
	})

	test('invalid top-level arguments throw TypeError synchronously', () => {
		assert.throws(() => andBitsetLazy(), TypeError)
		assert.throws(() => andBitsetLazy(null), TypeError)
		assert.throws(() => andBitsetLazy(undefined), TypeError)
		assert.throws(() => andBitsetLazy(42), TypeError)
		assert.throws(() => andBitsetLazy(0b101n), TypeError)
		assert.throws(() => andBitsetLazy(true), TypeError)
		assert.throws(() => andBitsetLazy({}), TypeError)
		assert.throws(() => andBitsetLazy('1010'), TypeError)
		assert.throws(() => andBitsetLazy([1n], '1010'), TypeError)
		assert.throws(() => andBitsetLazy([1n], null), TypeError)
		assert.throws(() => andBitsetLazy([1n], [2n], 3n), TypeError)
	})

	test('invalid iterator protocol and invalid element types/values throw lazily', () => {
		const badIterable = {
			[Symbol.iterator]() {
				return 123
			},
		}
		const badGen = andBitsetLazy(badIterable)
		assert.throws(() => badGen.next(), TypeError)

		// Non-BigInt elements throw TypeError
		for (const invalid of [1, 0, NaN, '1', null, undefined, true, {}]) {
			assert.throws(() => [...andBitsetLazy([1n, invalid])], TypeError)
			assert.throws(() => [...andBitsetLazy([1n, 2n], [1n, invalid])], TypeError)
		}

		// Negative BigInt elements throw RangeError
		for (const neg of [-1n, -42n, -(1n << 500n)]) {
			assert.throws(() => [...andBitsetLazy([neg])], RangeError)
			assert.throws(() => [...andBitsetLazy([0b111n, neg])], RangeError)
			assert.throws(() => [...andBitsetLazy([0b111n, 0b101n], [0b111n, neg])], RangeError)
		}
	})

	test('laziness: single-source infinite stream is consumed on demand and closed on break', () => {
		let opened = false
		let pulled = 0
		let closed = false

		const infiniteMaskStream = {
			[Symbol.iterator]() {
				opened = true
				let mask = (1n << 10n) - 1n
				let bit = 0n
				return {
					next() {
						pulled++
						const value = mask
						mask &= ~(1n << bit)
						bit++
						return { value, done: false }
					},
					return() {
						closed = true
						return { value: undefined, done: true }
					},
				}
			},
		}

		const gen = andBitsetLazy(infiniteMaskStream)
		assert.equal(opened, false, 'iterator must not be opened before first .next()')
		assert.equal(pulled, 0, 'no elements should be pulled before first .next()')

		const taken = []
		for (const v of gen) {
			taken.push(v)
			assert.equal(pulled, taken.length, 'must pull strictly one element per yield')
			if (taken.length === 4) {
				break
			}
		}

		assert.deepEqual(taken, [0b1111111111n, 0b1111111110n, 0b1111111100n, 0b1111111000n])
		assert.equal(pulled, 4)
		assert.equal(closed, true, 'breaking early must close the upstream iterator')
	})

	test('laziness: multi-source infinite streams consume in lockstep and clean up on early stop or exhaustion', () => {
		let pulledA = 0
		let pulledB = 0
		let closedA = false
		let closedB = false

		function* infA() {
			try {
				let i = 0n
				while (true) {
					pulledA++
					yield (1n << i) | 1n
					i++
				}
			} finally {
				closedA = true
			}
		}

		function* infB() {
			try {
				let i = 0n
				while (true) {
					pulledB++
					yield (1n << i) | (1n << (i + 1n))
					i++
				}
			} finally {
				closedB = true
			}
		}

		const gen = andBitsetLazy(infA(), infB())
		assert.equal(pulledA, 0)
		assert.equal(pulledB, 0)

		const first3 = []
		for (const v of gen) {
			first3.push(v)
			assert.equal(pulledA, first3.length)
			assert.equal(pulledB, first3.length)
			if (first3.length === 3) {
				break
			}
		}

		assert.deepEqual(first3, [1n, 2n, 4n])
		assert.equal(closedA, true)
		assert.equal(closedB, true)

		// Finite short source paired with infinite source stops cleanly without extra pull
		let pulledInf = 0
		let closedInf = false
		function* infOnes() {
			try {
				while (true) {
					pulledInf++
					yield 0b1111n
				}
			} finally {
				closedInf = true
			}
		}

		const zipped = [...andBitsetLazy([0b1010n, 0b0101n], infOnes())]
		assert.deepEqual(zipped, [0b1010n, 0b0101n])
		assert.equal(pulledInf, 2, 'must not over-pull from longer/infinite iterable')
		assert.equal(closedInf, true, 'must close remaining open iterators when shortest ends')
	})

	test('laziness: poisoned tail is never evaluated when consumer stops earlier', () => {
		function* poisoned() {
			yield 0b111n
			yield 0b101n
			yield 0b001n
			yield -1n // invalid bitset
			throw new Error('must never be reached')
		}

		const gen = andBitsetLazy(poisoned())
		assert.equal(gen.next().value, 0b111n)
		assert.equal(gen.next().value, 0b101n)
		assert.equal(gen.next().value, 0b001n)
		gen.return()
	})

	test('cross-check against naive Set<number> intersection reference implementation', () => {
		const rawSets = [
			[0, 1, 5, 17, 63, 64, 128, 513, 1024, 2000],
			[1, 5, 63, 64, 99, 513, 1024, 1500, 2000],
			[0, 5, 64, 513, 2000, 2048],
			[5, 64, 2000],
		].map((arr) => new Set(arr))

		const bitsets = rawSets.map((s) => encodeBitset(s))

		// 1. Running intersection cross-check
		const runningResults = [...andBitsetLazy(bitsets)]
		assert.equal(runningResults.length, rawSets.length)
		for (let i = 0; i < rawSets.length; i++) {
			const expectedSet = naiveSetIntersection(rawSets.slice(0, i + 1))
			const actualSet = new Set(decodeBitset(runningResults[i]))
			assert.deepEqual(actualSet, expectedSet)
		}

		// 2. Multi-stream element-wise intersection cross-check
		const streamA = [rawSets[0], rawSets[1], rawSets[2]]
		const streamB = [rawSets[1], rawSets[2], rawSets[3]]
		const streamC = [rawSets[2], rawSets[3], rawSets[0]]

		const zipResults = [
			...andBitsetLazy(
				streamA.map(encodeBitset),
				streamB.map(encodeBitset),
				streamC.map(encodeBitset)
			),
		]

		assert.equal(zipResults.length, 3)
		for (let i = 0; i < 3; i++) {
			const expectedSet = naiveSetIntersection([streamA[i], streamB[i], streamC[i]])
			const actualSet = new Set(decodeBitset(zipResults[i]))
			assert.deepEqual(actualSet, expectedSet)
		}
	})

	test('cross-check Boolean algebra identities over arbitrary-width bitsets', () => {
		const width = 300n
		const universe = (1n << width) - 1n

		const a = [
			encodeBitset([0, 2, 7, 65, 199, 299]),
			encodeBitset([1, 3, 64, 128, 250]),
			encodeBitset([10, 20, 30, 299]),
		]
		const b = [
			encodeBitset([2, 7, 100, 199, 299]),
			encodeBitset([3, 64, 200, 250]),
			encodeBitset([20, 40, 299]),
		]
		const c = [
			encodeBitset([7, 199, 250]),
			encodeBitset([64, 250, 299]),
			encodeBitset([20, 299]),
		]

		// Commutativity: A & B === B & A
		assert.deepEqual([...andBitsetLazy(a, b)], [...andBitsetLazy(b, a)])

		// Associativity: (A & B) & C === A & (B & C) === and(A, B, C)
		const leftAssoc = [...andBitsetLazy(andBitsetLazy(a, b), c)]
		const rightAssoc = [...andBitsetLazy(a, andBitsetLazy(b, c))]
		const nAry = [...andBitsetLazy(a, b, c)]
		assert.deepEqual(leftAssoc, rightAssoc)
		assert.deepEqual(leftAssoc, nAry)

		// Idempotence: A & A === A
		assert.deepEqual([...andBitsetLazy(a, a)], a)

		// Identity with universe mask: A & U === A
		const uStream = [universe, universe, universe]
		assert.deepEqual([...andBitsetLazy(a, uStream)], a)

		// Absorbing element 0n: A & 0 === 0
		const zStream = [0n, 0n, 0n]
		assert.deepEqual([...andBitsetLazy(a, zStream)], zStream)

		// De Morgan's Law: A & B === ~(~A | ~B) relative to universe
		const ab = [...andBitsetLazy(a, b)]
		const deMorgan = a.map((ai, i) => universe ^ ((universe ^ ai) | (universe ^ b[i])))
		assert.deepEqual(ab, deMorgan)

		// Monotonicity of running intersection: r[i+1] is a subset of r[i]
		const running = [...andBitsetLazy([...a, ...b, ...c])]
		for (let i = 0; i < running.length - 1; i++) {
			assert.equal(running[i + 1] <= running[i], true)
			assert.equal(running[i + 1] & running[i], running[i + 1])
		}
	})
})
