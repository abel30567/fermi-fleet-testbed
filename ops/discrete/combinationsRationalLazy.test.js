import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsRationalLazy } from './combinationsRationalLazy.js'

/**
 * Independent BigInt GCD helper for test verification.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Independent BigInt binomial coefficient C(n, k).
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function binom(n, k) {
	if (k < 0 || k > n) return 0n
	if (k === 0 || k === n) return 1n
	const r = Math.min(k, n - k)
	let res = 1n
	for (let i = 1; i <= r; i++) {
		res = (res * BigInt(n - r + i)) / BigInt(i)
	}
	return res
}

/**
 * Independent exact rational addition for cross-checking sums.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	const sign = den < 0n ? -1n : 1n
	return { num: (sign * num) / g, den: (sign * den) / g }
}

/**
 * Serializes a combination to a canonical string key for set comparison.
 * @param {Array<{ num: bigint, den: bigint }>} combo
 * @returns {string}
 */
function comboKey(combo) {
	return combo.map((r) => `${r.num}/${r.den}`).join(',')
}

test('normal case: 2-combinations and 3-combinations of exact rationals', () => {
	const items = [
		{ num: 1n, den: 2n },
		{ num: 2n, den: 3n },
		{ num: 3n, den: 4n },
		{ num: 4n, den: 5n },
	]

	const pairs = [...combinationsRationalLazy(items, 2)]
	assert.deepStrictEqual(pairs, [
		[{ num: 1n, den: 2n }, { num: 2n, den: 3n }],
		[{ num: 1n, den: 2n }, { num: 3n, den: 4n }],
		[{ num: 2n, den: 3n }, { num: 3n, den: 4n }],
		[{ num: 1n, den: 2n }, { num: 4n, den: 5n }],
		[{ num: 2n, den: 3n }, { num: 4n, den: 5n }],
		[{ num: 3n, den: 4n }, { num: 4n, den: 5n }],
	])

	const triples = [...combinationsRationalLazy(items, 3)]
	assert.deepStrictEqual(triples, [
		[{ num: 1n, den: 2n }, { num: 2n, den: 3n }, { num: 3n, den: 4n }],
		[{ num: 1n, den: 2n }, { num: 2n, den: 3n }, { num: 4n, den: 5n }],
		[{ num: 1n, den: 2n }, { num: 3n, den: 4n }, { num: 4n, den: 5n }],
		[{ num: 2n, den: 3n }, { num: 3n, den: 4n }, { num: 4n, den: 5n }],
	])
})

test('normalizes rationals to lowest terms with positive denominator and canonical zero', () => {
	const items = [
		{ num: 6n, den: 8n },
		{ num: 2n, den: -4n },
		{ num: -6n, den: -9n },
		{ num: 0n, den: -7n },
	]

	const combos = [...combinationsRationalLazy(items, 2)]
	assert.deepStrictEqual(combos, [
		[{ num: 3n, den: 4n }, { num: -1n, den: 2n }],
		[{ num: 3n, den: 4n }, { num: 2n, den: 3n }],
		[{ num: -1n, den: 2n }, { num: 2n, den: 3n }],
		[{ num: 3n, den: 4n }, { num: 0n, den: 1n }],
		[{ num: -1n, den: 2n }, { num: 0n, den: 1n }],
		[{ num: 2n, den: 3n }, { num: 0n, den: 1n }],
	])

	for (const combo of combos) {
		for (const r of combo) {
			assert.ok(r.den > 0n)
			assert.equal(gcd(r.num, r.den), 1n)
			if (r.num === 0n) {
				assert.equal(r.den, 1n)
			}
		}
	}
})

test('supports arbitrary-precision BigInt rationals beyond MAX_SAFE_INTEGER', () => {
	const factor = 10n ** 40n + 7n
	const items = [
		{ num: 3n * factor, den: 5n * factor },
		{ num: -(7n * factor), den: -(11n * factor) },
		{ num: 13n * factor, den: -(17n * factor) },
	]

	const combos = [...combinationsRationalLazy(items, 2)]
	assert.deepStrictEqual(combos, [
		[{ num: 3n, den: 5n }, { num: 7n, den: 11n }],
		[{ num: 3n, den: 5n }, { num: -13n, den: 17n }],
		[{ num: 7n, den: 11n }, { num: -13n, den: 17n }],
	])
})

test('edge cases: k = 0, k = 1, k = n, k > n, empty iterable, duplicates', () => {
	const items = [
		{ num: 1n, den: 2n },
		{ num: 2n, den: 4n },
		{ num: 3n, den: 5n },
	]

	// k = 0 yields one empty combination without consuming the iterable
	let pulled = 0
	function* spyGen() {
		pulled++
		yield { num: 1n, den: 1n }
	}
	assert.deepStrictEqual([...combinationsRationalLazy(spyGen(), 0)], [[]])
	assert.equal(pulled, 0)
	assert.deepStrictEqual([...combinationsRationalLazy([], 0)], [[]])

	// k = 1
	assert.deepStrictEqual([...combinationsRationalLazy(items, 1)], [
		[{ num: 1n, den: 2n }],
		[{ num: 1n, den: 2n }],
		[{ num: 3n, den: 5n }],
	])

	// k = n
	assert.deepStrictEqual([...combinationsRationalLazy(items, 3)], [
		[{ num: 1n, den: 2n }, { num: 1n, den: 2n }, { num: 3n, den: 5n }],
	])

	// k > n
	assert.deepStrictEqual([...combinationsRationalLazy(items, 4)], [])

	// empty iterable with k > 0
	assert.deepStrictEqual([...combinationsRationalLazy([], 1)], [])
	assert.deepStrictEqual([...combinationsRationalLazy([], 3)], [])

	// Set iterable and positional duplicates
	const setInput = new Set(items)
	assert.equal([...combinationsRationalLazy(setInput, 2)].length, 3)
})

test('lazy streaming: infinite generator consumption is minimal and closes iterator on early break', () => {
	let pulled = 0
	let closed = false

	const infiniteHarmonics = {
		[Symbol.iterator]() {
			let d = 1n
			return {
				next() {
					pulled++
					const value = { num: 2n, den: 2n * d }
					d++
					return { value, done: false }
				},
				return() {
					closed = true
					return { value: undefined, done: true }
				},
			}
		},
	}

	// Taking 6 pairs (C(4, 2) = 6) must pull exactly 4 elements and close cleanly
	const collected = []
	for (const combo of combinationsRationalLazy(infiniteHarmonics, 2)) {
		collected.push(combo)
		if (collected.length === 6) break
	}

	assert.equal(collected.length, 6)
	assert.equal(pulled, 4)
	assert.equal(closed, true)
	assert.deepStrictEqual(collected[5], [
		{ num: 1n, den: 3n },
		{ num: 1n, den: 4n },
	])

	// Taking 4 triples (C(4, 3) = 4) must pull exactly 4 elements
	pulled = 0
	closed = false
	const triples = []
	for (const combo of combinationsRationalLazy(infiniteHarmonics, 3)) {
		triples.push(combo)
		if (triples.length === 4) break
	}
	assert.equal(triples.length, 4)
	assert.equal(pulled, 4)
	assert.equal(closed, true)
})

test('mutation isolation: mutating yielded arrays or rational objects does not corrupt later yields', () => {
	const items = [
		{ num: 1n, den: 2n },
		{ num: 1n, den: 3n },
		{ num: 1n, den: 4n },
	]
	const gen = combinationsRationalLazy(items, 2)

	const first = gen.next().value
	assert.deepStrictEqual(first, [{ num: 1n, den: 2n }, { num: 1n, den: 3n }])
	first[0].num = 999n
	first[0].den = 999n
	first.push({ num: 5n, den: 1n })

	const second = gen.next().value
	assert.deepStrictEqual(second, [{ num: 1n, den: 2n }, { num: 1n, den: 4n }])

	const third = gen.next().value
	assert.deepStrictEqual(third, [{ num: 1n, den: 3n }, { num: 1n, den: 4n }])
	assert.equal(gen.next().done, true)
})

test('input validation: eager errors for invalid iterable/k and lazy errors for invalid elements', () => {
	// Invalid iterables
	assert.throws(() => combinationsRationalLazy(null, 2), TypeError)
	assert.throws(() => combinationsRationalLazy(undefined, 2), TypeError)
	assert.throws(() => combinationsRationalLazy(123, 2), TypeError)
	assert.throws(() => combinationsRationalLazy({}, 2), TypeError)

	// Invalid k types
	assert.throws(() => combinationsRationalLazy([], '2'), TypeError)
	assert.throws(() => combinationsRationalLazy([], 2n), TypeError)
	assert.throws(() => combinationsRationalLazy([], null), TypeError)
	assert.throws(() => combinationsRationalLazy([], undefined), TypeError)

	// Out-of-range / non-integer k
	assert.throws(() => combinationsRationalLazy([], -1), RangeError)
	assert.throws(() => combinationsRationalLazy([], 1.5), RangeError)
	assert.throws(() => combinationsRationalLazy([], Number.NaN), RangeError)
	assert.throws(() => combinationsRationalLazy([], Number.POSITIVE_INFINITY), RangeError)
	assert.throws(() => combinationsRationalLazy([], Number.MAX_SAFE_INTEGER + 1), RangeError)

	// Invalid rational elements (validated lazily)
	function* withZeroDenomAfterGoodOnes() {
		yield { num: 1n, den: 2n }
		yield { num: 3n, den: 4n }
		yield { num: 5n, den: 0n }
	}

	// Stopping after the first pair succeeds without reaching the invalid 3rd element
	const gen = combinationsRationalLazy(withZeroDenomAfterGoodOnes(), 2)
	assert.deepStrictEqual(gen.next().value, [
		{ num: 1n, den: 2n },
		{ num: 3n, den: 4n },
	])
	// Advancing to the 3rd element throws RangeError
	assert.throws(() => gen.next(), RangeError)

	// Non-object and non-BigInt rational fields throw TypeError
	assert.throws(() => [...combinationsRationalLazy([null], 1)], TypeError)
	assert.throws(() => [...combinationsRationalLazy([{ num: 1, den: 2n }], 1)], TypeError)
	assert.throws(() => [...combinationsRationalLazy([{ num: 1n, den: 2 }], 1)], TypeError)
	assert.throws(() => [...combinationsRationalLazy([{ num: 0n, den: 0n }], 1)], RangeError)
})

test('independent cross-check: bitmask enumeration, binomial count, and element-sum identity', () => {
	const raw = [
		{ num: -6n, den: 4n },   // -3/2
		{ num: 0n, den: -9n },   // 0/1
		{ num: 4n, den: 12n },   // 1/3
		{ num: 10n, den: -15n }, // -2/3
		{ num: -14n, den: -21n },// 2/3
		{ num: 25n, den: 10n },  // 5/2
	]

	const expectedNorm = [
		{ num: -3n, den: 2n },
		{ num: 0n, den: 1n },
		{ num: 1n, den: 3n },
		{ num: -2n, den: 3n },
		{ num: 2n, den: 3n },
		{ num: 5n, den: 2n },
	]

	const n = raw.length
	const totalInputSum = expectedNorm.reduce(addRat, { num: 0n, den: 1n })

	for (let k = 0; k <= n + 1; k++) {
		const actual = [...combinationsRationalLazy(raw, k)]

		// Cross-check 1: exact binomial count C(n, k)
		assert.equal(BigInt(actual.length), binom(n, k))

		// Cross-check 2: exact 1-to-1 match against independent bitmask subset enumeration
		const expectedSet = new Set()
		for (let mask = 0; mask < (1 << n); mask++) {
			const subset = []
			for (let bit = 0; bit < n; bit++) {
				if ((mask & (1 << bit)) !== 0) {
					subset.push(expectedNorm[bit])
				}
			}
			if (subset.length === k) {
				expectedSet.add(comboKey(subset))
			}
		}

		const actualSet = new Set(actual.map(comboKey))
		assert.equal(actualSet.size, actual.length, 'all combinations must be unique')
		assert.deepStrictEqual(actualSet, expectedSet)

		// Cross-check 3: sum of all elements across all k-combinations = C(n-1, k-1) * sum(items)
		if (k >= 1 && k <= n) {
			let comboElementSum = { num: 0n, den: 1n }
			for (const combo of actual) {
				for (const r of combo) {
					comboElementSum = addRat(comboElementSum, r)
				}
			}
			const mult = binom(n - 1, k - 1)
			const expectedSum = addRat(
				{ num: totalInputSum.num * mult, den: totalInputSum.den },
				{ num: 0n, den: 1n },
			)
			assert.deepStrictEqual(comboElementSum, expectedSum)
		}
	}
})
