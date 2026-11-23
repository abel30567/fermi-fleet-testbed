import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productRationalSeries } from './productRationalSeries.js'

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function assertNormalized(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
}

describe('productRationalSeries', () => {
	describe('normal cases (iterable form)', () => {
		it('multiplies simple rationals with cancellation', () => {
			const result = productRationalSeries([
				{ num: 2n, den: 3n },
				{ num: 3n, den: 4n },
				{ num: 4n, den: 5n },
			])
			assertNormalized(result)
			assert.deepEqual(result, { num: 2n, den: 5n })
		})

		it('handles negative numerators, negative denominators, and unreduced inputs', () => {
			const result = productRationalSeries([
				{ num: -6n, den: 9n }, // -2/3
				{ num: 15n, den: -10n }, // -3/2
				{ num: -8n, den: -12n }, // 2/3
			])
			assertNormalized(result)
			assert.deepEqual(result, { num: 2n, den: 3n })
		})

		it('preserves negative sign with positive denominator for odd number of negative factors', () => {
			const result = productRationalSeries([
				{ num: -5n, den: 6n },
				{ num: 9n, den: 10n },
				{ num: 4n, den: 3n },
			])
			assertNormalized(result)
			assert.deepEqual(result, { num: -1n, den: 1n })
		})

		it('accepts arbitrary iterables such as generators', () => {
			function* gen() {
				for (let k = 1n; k <= 5n; k += 1n) {
					yield { num: k, den: k + 2n }
				}
			}
			// prod_{k=1}^5 k/(k+2) = (1*2) / (6*7) = 2/42 = 1/21
			const result = productRationalSeries(gen())
			assertNormalized(result)
			assert.deepEqual(result, { num: 1n, den: 21n })
		})
	})

	describe('edge cases', () => {
		it('returns 1/1 for an empty array', () => {
			const result = productRationalSeries([])
			assertNormalized(result)
			assert.deepEqual(result, { num: 1n, den: 1n })
		})

		it('returns 1/1 for an empty indexed range (start > end)', () => {
			const rNum = productRationalSeries((k) => ({ num: BigInt(k), den: 1n }), 5, 3)
			assert.deepEqual(rNum, { num: 1n, den: 1n })

			const rBig = productRationalSeries((k) => ({ num: k, den: 1n }), 10n, 2n)
			assert.deepEqual(rBig, { num: 1n, den: 1n })
		})

		it('returns normalized single item', () => {
			const result = productRationalSeries([{ num: 14n, den: -21n }])
			assertNormalized(result)
			assert.deepEqual(result, { num: -2n, den: 3n })
		})

		it('returns 0/1 when any factor is zero', () => {
			const result = productRationalSeries([
				{ num: 7n, den: 11n },
				{ num: 0n, den: -5n },
				{ num: 13n, den: 17n },
			])
			assertNormalized(result)
			assert.deepEqual(result, { num: 0n, den: 1n })
		})

		it('handles single-term indexed range (start === end)', () => {
			const result = productRationalSeries((k) => ({ num: k * 2n, den: k * 4n }), 7n, 7n)
			assertNormalized(result)
			assert.deepEqual(result, { num: 1n, den: 2n })
		})

		it('handles negative index bounds in indexed form', () => {
			// prod_{k=-3}^{-1} k/(k-1) = (-3/-4)*(-2/-3)*(-1/-2) = 1/4
			const result = productRationalSeries((k) => ({ num: BigInt(k), den: BigInt(k - 1) }), -3, -1)
			assertNormalized(result)
			assert.deepEqual(result, { num: 1n, den: 4n })
		})
	})

	describe('independent mathematical identity cross-checks', () => {
		it('matches closed form for prod_{k=2}^n (1 - 1/k^2) === (n+1)/(2n)', () => {
			for (const n of [2, 5, 17, 100, 500]) {
				const result = productRationalSeries(
					(k) => {
						const bk = BigInt(k)
						return { num: bk * bk - 1n, den: bk * bk }
					},
					2,
					n,
				)
				const bn = BigInt(n)
				const expectedNum = bn + 1n
				const expectedDen = 2n * bn
				const g = gcd(expectedNum, expectedDen)
				assertNormalized(result)
				assert.deepEqual(result, { num: expectedNum / g, den: expectedDen / g })
			}
		})

		it('matches closed form for prod_{k=1}^n (k+1)/k === (n+1)/1 with BigInt bounds', () => {
			for (const n of [1n, 10n, 250n, 1000n]) {
				const result = productRationalSeries((k) => ({ num: k + 1n, den: k }), 1n, n)
				assertNormalized(result)
				assert.deepEqual(result, { num: n + 1n, den: 1n })
			}
		})

		it('matches closed form for prod_{k=2}^n (k^3 - 1)/(k^3 + 1) === (2/3) * (n^2 + n + 1) / (n * (n + 1))', () => {
			for (const n of [2n, 7n, 50n, 200n]) {
				const result = productRationalSeries(
					(k) => ({ num: k ** 3n - 1n, den: k ** 3n + 1n }),
					2n,
					n,
				)
				const rawNum = 2n * (n * n + n + 1n)
				const rawDen = 3n * n * (n + 1n)
				const g = gcd(rawNum, rawDen)
				assertNormalized(result)
				assert.deepEqual(result, { num: rawNum / g, den: rawDen / g })
			}
		})

		it('matches Wallis partial product identity using exact BigInt arithmetic', () => {
			// W_n = prod_{k=1}^n (4k^2)/(4k^2 - 1) = (2^n * n!)^4 / ((2n)!^2 * (2n + 1))
			const n = 25n
			const result = productRationalSeries(
				(k) => ({ num: 4n * k * k, den: 4n * k * k - 1n }),
				1n,
				n,
			)
			const factorial = (m) => {
				let acc = 1n
				for (let i = 2n; i <= m; i += 1n) acc *= i
				return acc
			}
			const rawNum = ((1n << n) * factorial(n)) ** 4n
			const rawDen = factorial(2n * n) ** 2n * (2n * n + 1n)
			const g = gcd(rawNum, rawDen)
			assertNormalized(result)
			assert.deepEqual(result, { num: rawNum / g, den: rawDen / g })
		})
	})

	describe('input validation', () => {
		it('rejects non-iterable or invalid first arguments', () => {
			assert.throws(() => productRationalSeries(null), TypeError)
			assert.throws(() => productRationalSeries(undefined), TypeError)
			assert.throws(() => productRationalSeries(42), TypeError)
			assert.throws(() => productRationalSeries('1/2'), TypeError)
			assert.throws(() => productRationalSeries({ num: 1n, den: 2n }), TypeError)
		})

		it('rejects start/end bounds when first argument is an iterable', () => {
			assert.throws(() => productRationalSeries([{ num: 1n, den: 2n }], 0, 1), TypeError)
		})

		it('rejects invalid bounds for indexed form', () => {
			const fn = (k) => ({ num: BigInt(k), den: 1n })
			assert.throws(() => productRationalSeries(fn), TypeError)
			assert.throws(() => productRationalSeries(fn, 1, 5n), TypeError)
			assert.throws(() => productRationalSeries(fn, 1n, 5), TypeError)
			assert.throws(() => productRationalSeries(fn, '1', '5'), TypeError)
			assert.throws(() => productRationalSeries(fn, 1.5, 3), RangeError)
			assert.throws(() => productRationalSeries(fn, 1, NaN), RangeError)
			assert.throws(() => productRationalSeries(fn, 1, Infinity), RangeError)
			assert.throws(() => productRationalSeries(fn, 1, Number.MAX_SAFE_INTEGER + 1), RangeError)
		})

		it('rejects malformed rational terms', () => {
			assert.throws(() => productRationalSeries([null]), TypeError)
			assert.throws(() => productRationalSeries([{ num: 1, den: 2n }]), TypeError)
			assert.throws(() => productRationalSeries([{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => productRationalSeries([{}]), TypeError)
			assert.throws(() => productRationalSeries(() => ({ num: 1, den: 2 }), 1, 1), TypeError)
		})

		it('rejects zero denominators, including after a zero factor', () => {
			assert.throws(() => productRationalSeries([{ num: 1n, den: 0n }]), RangeError)
			assert.throws(
				() =>
					productRationalSeries([
						{ num: 0n, den: 1n },
						{ num: 1n, den: 0n },
					]),
				RangeError,
			)
			assert.throws(
				() => productRationalSeries((k) => ({ num: 1n, den: k - 3n }), 1n, 5n),
				RangeError,
			)
		})
	})
})
