import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { summationRationalIterative } from './summationRationalIterative.js'

/**
 * Independent helper for reducing a rational in tests.
 */
function reduceRational(num, den) {
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	if (n === 0n) {
		return { num: 0n, den: 1n }
	}
	let x = n < 0n ? -n : n
	let y = d
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return { num: n / x, den: d / x }
}

describe('summationRationalIterative', () => {
	it('returns 0/1 for an empty array', () => {
		assert.deepEqual(summationRationalIterative([]), { num: 0n, den: 1n })
	})

	it('handles single elements including unreduced, negative denominators, and zero', () => {
		const single = { num: 3n, den: 7n }
		const result = summationRationalIterative([single])
		assert.deepEqual(result, { num: 3n, den: 7n })
		assert.notEqual(result, single)

		assert.deepEqual(summationRationalIterative([{ num: -5n, den: 8n }]), {
			num: -5n,
			den: 8n,
		})
		assert.deepEqual(summationRationalIterative([{ num: 6n, den: -9n }]), {
			num: -2n,
			den: 3n,
		})
		assert.deepEqual(summationRationalIterative([{ num: -12n, den: -18n }]), {
			num: 2n,
			den: 3n,
		})
		assert.deepEqual(summationRationalIterative([{ num: 0n, den: 11n }]), {
			num: 0n,
			den: 1n,
		})
		assert.deepEqual(summationRationalIterative([{ num: 0n, den: -5n }]), {
			num: 0n,
			den: 1n,
		})
	})

	it('sums positive, negative, and canceling rationals accurately', () => {
		// 1/2 + 1/3 - 5/6 = 0
		assert.deepEqual(
			summationRationalIterative([
				{ num: 1n, den: 2n },
				{ num: 1n, den: 3n },
				{ num: -5n, den: 6n },
			]),
			{ num: 0n, den: 1n }
		)

		// Intermediate cancellation followed by additional terms
		assert.deepEqual(
			summationRationalIterative([
				{ num: 7n, den: 12n },
				{ num: -7n, den: 12n },
				{ num: 0n, den: -99n },
				{ num: -5n, den: 15n },
				{ num: 2n, den: 3n },
			]),
			{ num: 1n, den: 3n }
		)

		// Unreduced inputs with negative denominators: 1/2 + 1/3 - 1/6 = 2/3
		const inputs = [
			{ num: 100n, den: 200n },
			{ num: -30n, den: -90n },
			{ num: 14n, den: -84n },
		]
		assert.deepEqual(summationRationalIterative(inputs), {
			num: 2n,
			den: 3n,
		})
		// Ensure inputs were not mutated
		assert.deepEqual(inputs, [
			{ num: 100n, den: 200n },
			{ num: -30n, den: -90n },
			{ num: 14n, den: -84n },
		])
	})

	it('computes exact harmonic numbers H_n and matches independent calculation', () => {
		const expectedHarmonics = [
			[1, { num: 1n, den: 1n }],
			[2, { num: 3n, den: 2n }],
			[3, { num: 11n, den: 6n }],
			[4, { num: 25n, den: 12n }],
			[5, { num: 137n, den: 60n }],
			[6, { num: 49n, den: 20n }],
			[10, { num: 7381n, den: 2520n }],
			[20, { num: 55835135n, den: 15519504n }],
		]

		for (const [n, expected] of expectedHarmonics) {
			const terms = []
			for (let k = 1n; k <= BigInt(n); k++) {
				terms.push({ num: 1n, den: k })
			}
			const actual = summationRationalIterative(terms)
			assert.deepEqual(actual, expected)
		}

		// Independent naive common-denominator cross-check for H_15 using 15!
		const n = 15n
		let fact = 1n
		for (let k = 2n; k <= n; k++) {
			fact *= k
		}
		let naiveNum = 0n
		const terms = []
		let fpSum = 0
		for (let k = 1n; k <= n; k++) {
			naiveNum += fact / k
			terms.push({ num: 1n, den: k })
			fpSum += 1 / Number(k)
		}
		const actual = summationRationalIterative(terms)
		const expected = reduceRational(naiveNum, fact)
		assert.deepEqual(actual, expected)
		assert.ok(Math.abs(Number(actual.num) / Number(actual.den) - fpSum) < 1e-12)
	})

	it('cross-checks against Gauss sum closed form', () => {
		// sum_{k=1}^{n} (k / m) = (n * (n + 1)) / (2 * m)
		const cases = [
			[100n, 1n],
			[1000n, 1n],
			[100n, 7n],
			[75n, 12n],
		]

		for (const [n, m] of cases) {
			const terms = []
			for (let k = 1n; k <= n; k++) {
				terms.push({ num: k, den: m })
			}
			const actual = summationRationalIterative(terms)
			const expected = reduceRational(n * (n + 1n), 2n * m)
			assert.deepEqual(actual, expected)
		}
	})

	it('cross-checks against telescoping sum closed forms', () => {
		// sum_{k=1}^{n} 1 / (k * (k + 1)) = n / (n + 1)
		for (const n of [1n, 5n, 25n, 100n]) {
			const terms = []
			for (let k = 1n; k <= n; k++) {
				terms.push({ num: 1n, den: k * (k + 1n) })
			}
			assert.deepEqual(summationRationalIterative(terms), {
				num: n,
				den: n + 1n,
			})
		}

		// sum_{k=1}^{n} 1 / ((2k - 1)(2k + 1)) = n / (2n + 1)
		for (const n of [1n, 10n, 40n]) {
			const terms = []
			for (let k = 1n; k <= n; k++) {
				terms.push({ num: 1n, den: (2n * k - 1n) * (2n * k + 1n) })
			}
			assert.deepEqual(summationRationalIterative(terms), {
				num: n,
				den: 2n * n + 1n,
			})
		}
	})

	it('cross-checks against geometric series closed form (1 - r^n) / (1 - r)', () => {
		const cases = [
			{ p: 1n, q: 2n, n: 20n }, // r = 1/2
			{ p: 2n, q: 3n, n: 15n }, // r = 2/3
			{ p: 3n, q: 2n, n: 12n }, // r = 3/2
			{ p: -1n, q: 3n, n: 17n }, // r = -1/3 (odd n)
			{ p: -2n, q: 5n, n: 16n }, // r = -2/5 (even n)
		]

		for (const { p, q, n } of cases) {
			const terms = []
			let pPow = 1n
			let qPow = 1n
			for (let k = 0n; k < n; k++) {
				terms.push({ num: pPow, den: qPow })
				pPow *= p
				qPow *= q
			}

			// Closed form: (1 - (p/q)^n) / (1 - p/q) = (q^n - p^n) / (q^(n-1) * (q - p))
			const closedNum = qPow - pPow
			const closedDen = (qPow / q) * (q - p)
			const expected = reduceRational(closedNum, closedDen)

			assert.deepEqual(summationRationalIterative(terms), expected)
		}
	})

	it('handles very large BigInts without precision loss', () => {
		const bigA = 10n ** 40n
		const bigB = 10n ** 40n + 1n
		const bigC = 2n ** 128n

		// (1 / bigA) + (1 / bigB) + (-1 / bigA) = 1 / bigB
		assert.deepEqual(
			summationRationalIterative([
				{ num: 1n, den: bigA },
				{ num: 1n, den: bigB },
				{ num: -1n, den: bigA },
			]),
			{ num: 1n, den: bigB }
		)

		// Large common factors simplify cleanly:
		// (3 * bigC) / (6 * bigC) + (5 * bigC) / (15 * bigC) = 1/2 + 1/3 = 5/6
		assert.deepEqual(
			summationRationalIterative([
				{ num: 3n * bigC, den: 6n * bigC },
				{ num: 5n * bigC, den: 15n * bigC },
			]),
			{ num: 5n, den: 6n }
		)

		// Large sum where standard JS float would completely lose the small fraction
		assert.deepEqual(
			summationRationalIterative([
				{ num: bigC, den: 1n },
				{ num: 1n, den: bigC },
				{ num: -bigC, den: 1n },
			]),
			{ num: 1n, den: bigC }
		)
	})

	it('throws TypeError for non-array values or malformed rational elements', () => {
		const nonArrays = [
			null,
			undefined,
			42,
			'1/2',
			true,
			{ num: 1n, den: 2n },
			new Set([{ num: 1n, den: 2n }]),
			new Int32Array([1, 2]),
		]
		for (const invalid of nonArrays) {
			assert.throws(() => summationRationalIterative(invalid), TypeError)
		}

		const badElements = [
			null,
			undefined,
			0,
			'1/2',
			[1n, 2n],
			{},
			{ num: 1n },
			{ den: 2n },
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: '2' },
			{ num: NaN, den: 1n },
		]
		for (const bad of badElements) {
			assert.throws(() => summationRationalIterative([bad]), TypeError)
			assert.throws(
				() => summationRationalIterative([{ num: 1n, den: 2n }, bad]),
				TypeError
			)
		}

		// Sparse array
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [{ num: 1n, den: 2n }, , { num: 1n, den: 3n }]
		assert.throws(() => summationRationalIterative(sparse), TypeError)
		assert.throws(() => summationRationalIterative(new Array(2)), TypeError)
	})

	it('throws RangeError when any element has a zero denominator', () => {
		assert.throws(
			() => summationRationalIterative([{ num: 1n, den: 0n }]),
			RangeError
		)
		assert.throws(
			() => summationRationalIterative([{ num: 0n, den: 0n }]),
			RangeError
		)
		assert.throws(
			() => summationRationalIterative([{ num: -5n, den: 0n }]),
			RangeError
		)
		assert.throws(
			() =>
				summationRationalIterative([
					{ num: 1n, den: 2n },
					{ num: 3n, den: 4n },
					{ num: 1n, den: 0n },
				]),
			RangeError
		)
	})
})
