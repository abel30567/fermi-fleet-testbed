import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationRationalSeries } from './summationRationalSeries.js'

/**
 * Helper to compute gcd of two BigInts for lowest-terms verification.
 */
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

/**
 * Asserts that `result` is a canonical lowest-terms rational and equals `{ num, den }`.
 */
function assertRationalEqual(result, expectedNum, expectedDen) {
	assert.equal(typeof result, 'object')
	assert.notEqual(result, null)
	assert.equal(typeof result.num, 'bigint')
	assert.equal(typeof result.den, 'bigint')
	assert.ok(result.den > 0n, `expected den > 0n, got ${result.den}`)
	if (result.num === 0n) {
		assert.equal(result.den, 1n, `expected zero to have den === 1n, got ${result.den}`)
	} else {
		assert.equal(gcd(result.num, result.den), 1n, `expected lowest terms for ${result.num}/${result.den}`)
	}
	assert.deepEqual(result, { num: expectedNum, den: expectedDen })
}

/**
 * Helper to convert a rational `{ num, den }` to a JS Number for float tolerance comparisons.
 * Scales down numerator and denominator when they exceed IEEE-754 finite range.
 */
function rationalToNumber({ num, den }) {
	const MAX_BITS = 900n
	const shift = (x) => {
		const abs = x < 0n ? -x : x
		const bitLen = BigInt(abs.toString(2).length)
		return bitLen > MAX_BITS ? bitLen - MAX_BITS : 0n
	}
	const s = shift(num) > shift(den) ? shift(num) : shift(den)
	return Number(num >> s) / Number(den >> s)
}

/**
 * Helper to reduce a rational for independent closed-form computations.
 */
function reduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

describe('summationRationalSeries', () => {
	describe('array mode', () => {
		test('sums simple positive rationals in lowest terms', () => {
			const res = summationRationalSeries([
				{ num: 1n, den: 2n },
				{ num: 1n, den: 3n },
				{ num: 1n, den: 6n },
			])
			assertRationalEqual(res, 1n, 1n)
		})

		test('handles negative numerators, negative denominators, and unreduced inputs', () => {
			const original = { num: 6n, den: -9n }
			const res = summationRationalSeries([
				original,
				{ num: -4n, den: -8n },
				{ num: 10n, den: 15n },
			])
			// -2/3 + 1/2 + 2/3 = 1/2
			assertRationalEqual(res, 1n, 2n)
			// Input object is not mutated
			assert.deepEqual(original, { num: 6n, den: -9n })
		})

		test('normalizes single-element arrays including zero and negative denominators', () => {
			assertRationalEqual(summationRationalSeries([{ num: 12n, den: -18n }]), -2n, 3n)
			assertRationalEqual(summationRationalSeries([{ num: 0n, den: -7n }]), 0n, 1n)
			assertRationalEqual(summationRationalSeries([{ num: -15n, den: -25n }]), 3n, 5n)
		})

		test('cancels terms to exact canonical zero { num: 0n, den: 1n }', () => {
			const res = summationRationalSeries([
				{ num: 1n, den: 2n },
				{ num: 1n, den: 3n },
				{ num: -5n, den: 6n },
			])
			assertRationalEqual(res, 0n, 1n)

			const zeros = summationRationalSeries([
				{ num: 0n, den: 5n },
				{ num: 0n, den: -9n },
				{ num: 0n, den: 1n },
			])
			assertRationalEqual(zeros, 0n, 1n)
		})

		test('sums rationals with large BigInt numerators and denominators', () => {
			const p = 10n ** 30n
			const res = summationRationalSeries([
				{ num: p + 1n, den: 2n * p },
				{ num: p - 1n, den: 2n * p },
			])
			assertRationalEqual(res, 1n, 1n)
		})
	})

	describe('generator mode', () => {
		test('sums with safe Number bounds including negative, zero, and single-term ranges', () => {
			// sum_{k=-3}^{3} k / 5 = 0
			assertRationalEqual(
				summationRationalSeries((k) => ({ num: BigInt(k), den: 5n }), -3, 3),
				0n,
				1n,
			)
			// Single term at k = -0 normalizes index to +0
			let seenKey = null
			const single = summationRationalSeries(
				(k) => {
					seenKey = k
					return { num: 4n, den: 6n }
				},
				-0,
				-0,
			)
			assertRationalEqual(single, 2n, 3n)
			assert.ok(Object.is(seenKey, 0))
		})

		test('sums with BigInt bounds including indices exceeding Number.MAX_SAFE_INTEGER', () => {
			const base = 10n ** 25n
			// sum_{k=base}^{base+4} (k - base) / 10 = (0+1+2+3+4)/10 = 1
			const res = summationRationalSeries(
				(k) => ({ num: k - base, den: 10n }),
				base,
				base + 4n,
			)
			assertRationalEqual(res, 1n, 1n)

			// Negative BigInt range: sum_{k=-4n}^{-1n} 1/k = -(1 + 1/2 + 1/3 + 1/4) = -25/12
			const negRes = summationRationalSeries(
				(k) => ({ num: 1n, den: k }),
				-4n,
				-1n,
			)
			assertRationalEqual(negRes, -25n, 12n)
		})

		test('evaluates termFn in strictly ascending index order', () => {
			const visited = []
			const res = summationRationalSeries(
				(k) => {
					visited.push(k)
					return { num: BigInt(k), den: 1n }
				},
				-2,
				5,
			)
			assert.deepEqual(visited, [-2, -1, 0, 1, 2, 3, 4, 5])
			assertRationalEqual(res, 12n, 1n)
		})

		test('matches array mode identically for the same sequence', () => {
			const fn = (k) => ({ num: BigInt(2 * k - 5), den: BigInt(k * k + 1) })
			const arr = []
			for (let k = -4; k <= 12; k++) {
				arr.push(fn(k))
			}
			const fromFn = summationRationalSeries(fn, -4, 12)
			const fromArr = summationRationalSeries(arr)
			assert.deepEqual(fromFn, fromArr)
			assertRationalEqual(fromFn, fromArr.num, fromArr.den)
		})
	})

	describe('empty sum', () => {
		test('returns { num: 0n, den: 1n } for an empty array', () => {
			assertRationalEqual(summationRationalSeries([]), 0n, 1n)
		})

		test('returns { num: 0n, den: 1n } when start > end without calling termFn', () => {
			let calls = 0
			const fn = () => {
				calls++
				return { num: 1n, den: 1n }
			}
			assertRationalEqual(summationRationalSeries(fn, 5, 2), 0n, 1n)
			assertRationalEqual(summationRationalSeries(fn, 0, -1), 0n, 1n)
			assertRationalEqual(summationRationalSeries(fn, 10n, -5n), 0n, 1n)
			assert.equal(calls, 0)
		})
	})

	describe('harmonic series', () => {
		test('computes exact harmonic numbers H_n', () => {
			const expected = [
				[1, 1n, 1n],
				[2, 3n, 2n],
				[3, 11n, 6n],
				[4, 25n, 12n],
				[5, 137n, 60n],
				[6, 49n, 20n],
				[10, 7381n, 2520n],
				[20, 55835135n, 15519504n],
			]
			for (const [n, num, den] of expected) {
				const h = summationRationalSeries((k) => ({ num: 1n, den: BigInt(k) }), 1, n)
				assertRationalEqual(h, num, den)
			}
		})

		test('satisfies exact alternating harmonic identity sum_{k=1}^{2n} (-1)^{k-1}/k = sum_{k=n+1}^{2n} 1/k', () => {
			for (const n of [1, 5, 17, 40]) {
				const alt = summationRationalSeries(
					(k) => ({ num: k % 2 === 1 ? 1n : -1n, den: BigInt(k) }),
					1,
					2 * n,
				)
				const tail = summationRationalSeries(
					(k) => ({ num: 1n, den: BigInt(k) }),
					n + 1,
					2 * n,
				)
				assert.deepEqual(alt, tail)
				assertRationalEqual(alt, tail.num, tail.den)
			}
		})

		test('approximates ln(2) and Euler-Mascheroni asymptotic for large harmonic sums', () => {
			// Alternating harmonic series up to 200 approximates ln(2) within 1/200
			const alt200 = summationRationalSeries(
				(k) => ({ num: k % 2 === 1 ? 1n : -1n, den: BigInt(k) }),
				1,
				200,
			)
			assert.ok(Math.abs(rationalToNumber(alt200) - Math.LN2) < 1 / 200)

			// H_500 = ln(500) + gamma + 1/1000 + O(1/n^2)
			const h500 = summationRationalSeries((k) => ({ num: 1n, den: k }), 1n, 500n)
			assert.ok(h500.den > 0n && gcd(h500.num, h500.den) === 1n)
			const gamma = 0.5772156649015329
			const approx = Math.log(500) + gamma + 1 / 1000
			assert.ok(Math.abs(rationalToNumber(h500) - approx) < 1e-5)
		})
	})

	describe('telescoping series', () => {
		test('sums classic telescoping series sum_{k=1}^{n} 1/(k(k+1)) = n/(n+1)', () => {
			for (const n of [1, 2, 10, 100, 1000]) {
				const res = summationRationalSeries(
					(k) => ({ num: 1n, den: BigInt(k) * BigInt(k + 1) }),
					1,
					n,
				)
				assertRationalEqual(res, BigInt(n), BigInt(n + 1))
			}
		})

		test('sums triple-product telescoping series sum_{k=1}^{n} 1/(k(k+1)(k+2)) = n(n+3)/(4(n+1)(n+2))', () => {
			for (const n of [1n, 5n, 25n, 120n]) {
				const res = summationRationalSeries(
					(k) => ({ num: 1n, den: k * (k + 1n) * (k + 2n) }),
					1n,
					n,
				)
				const closed = reduce(n * (n + 3n), 4n * (n + 1n) * (n + 2n))
				assertRationalEqual(res, closed.num, closed.den)
			}
		})

		test('sums general rational difference series sum_{k=a}^{b} (f(k+1) - f(k)) = f(b+1) - f(a)', () => {
			// f(k) = (k^2 + 1) / (2k + 7)
			const fNum = (k) => k * k + 1n
			const fDen = (k) => 2n * k + 7n
			const a = -2n
			const b = 30n

			const res = summationRationalSeries(
				(k) => {
					const n1 = fNum(k + 1n)
					const d1 = fDen(k + 1n)
					const n0 = fNum(k)
					const d0 = fDen(k)
					return { num: n1 * d0 - n0 * d1, den: d1 * d0 }
				},
				a,
				b,
			)

			const expected = reduce(
				fNum(b + 1n) * fDen(a) - fNum(a) * fDen(b + 1n),
				fDen(b + 1n) * fDen(a),
			)
			assertRationalEqual(res, expected.num, expected.den)
		})
	})

	describe('cross-checks against closed-form formulas', () => {
		test('matches closed-form arithmetic series formula n/2 * (2a + (n-1)d)', () => {
			const cases = [
				{ aNum: 3n, aDen: 7n, dNum: -5n, dDen: 11n, n: 1 },
				{ aNum: 3n, aDen: 7n, dNum: -5n, dDen: 11n, n: 25 },
				{ aNum: -13n, aDen: 6n, dNum: 4n, dDen: 9n, n: 60 },
				{ aNum: 7n, aDen: 12n, dNum: 0n, dDen: 1n, n: 15 },
			]

			for (const { aNum, aDen, dNum, dDen, n } of cases) {
				const sum = summationRationalSeries(
					(k) => {
						const kb = BigInt(k)
						return {
							num: aNum * dDen + kb * dNum * aDen,
							den: aDen * dDen,
						}
					},
					0,
					n - 1,
				)
				// Closed form: n * (2 * aNum * dDen + (n - 1) * dNum * aDen) / (2 * aDen * dDen)
				const nb = BigInt(n)
				const closed = reduce(
					nb * (2n * aNum * dDen + (nb - 1n) * dNum * aDen),
					2n * aDen * dDen,
				)
				assertRationalEqual(sum, closed.num, closed.den)
			}
		})

		test('matches closed-form geometric series formula a * (1 - r^(n+1)) / (1 - r)', () => {
			const cases = [
				{ aNum: 1n, aDen: 1n, rNum: 1n, rDen: 2n, n: 20 },
				{ aNum: 3n, aDen: 5n, rNum: -2n, rDen: 3n, n: 15 },
				{ aNum: -7n, aDen: 4n, rNum: 5n, rDen: 3n, n: 12 },
				{ aNum: 5n, aDen: 8n, rNum: 1n, rDen: 1n, n: 9 },
				{ aNum: 4n, aDen: 9n, rNum: 0n, rDen: 1n, n: 10 },
			]

			for (const { aNum, aDen, rNum, rDen, n } of cases) {
				const sum = summationRationalSeries(
					(k) => {
						const kb = BigInt(k)
						return {
							num: aNum * rNum ** kb,
							den: aDen * rDen ** kb,
						}
					},
					0,
					n,
				)

				const nb = BigInt(n)
				let closed
				if (rNum === rDen) {
					// r = 1 => a * (n + 1)
					closed = reduce(aNum * (nb + 1n), aDen)
				} else {
					// a * (rDen^(n+1) - rNum^(n+1)) / (rDen^n * (rDen - rNum))
					const num = aNum * (rDen ** (nb + 1n) - rNum ** (nb + 1n))
					const den = aDen * rDen ** nb * (rDen - rNum)
					closed = reduce(num, den)
				}
				assertRationalEqual(sum, closed.num, closed.den)
			}
		})

		test('matches Faulhaber closed forms and Basel series pi^2/6 approximation', () => {
			const n = 50n
			// sum_{k=1}^{n} k^2 / 6 = n(n+1)(2n+1)/36
			const sumSq = summationRationalSeries((k) => ({ num: k * k, den: 6n }), 1n, n)
			const closedSq = reduce(n * (n + 1n) * (2n * n + 1n), 36n)
			assertRationalEqual(sumSq, closedSq.num, closedSq.den)

			// sum_{k=1}^{n} k^3 / 4 = n^2 (n+1)^2 / 16
			const sumCube = summationRationalSeries((k) => ({ num: k * k * k, den: 4n }), 1n, n)
			const closedCube = reduce(n * n * (n + 1n) * (n + 1n), 16n)
			assertRationalEqual(sumCube, closedCube.num, closedCube.den)

			// Basel series sum_{k=1}^{200} 1/k^2 approaches pi^2/6 with tail <= 1/200
			const basel = summationRationalSeries((k) => ({ num: 1n, den: k * k }), 1n, 200n)
			assert.ok(basel.den > 0n && gcd(basel.num, basel.den) === 1n)
			const piSqOver6 = (Math.PI * Math.PI) / 6
			const diff = piSqOver6 - rationalToNumber(basel)
			assert.ok(diff > 0 && diff < 1 / 200)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when termsOrFn is neither an array nor a function', () => {
			for (const bad of [null, undefined, 42, '1/2', {}, { num: 1n, den: 2n }, new Set()]) {
				assert.throws(() => summationRationalSeries(bad), TypeError)
			}
		})

		test('throws TypeError when start or end is supplied in array mode', () => {
			const terms = [{ num: 1n, den: 2n }]
			assert.throws(() => summationRationalSeries(terms, 0, 0), TypeError)
			assert.throws(() => summationRationalSeries(terms, 0), TypeError)
			assert.throws(() => summationRationalSeries(terms, undefined, 1), TypeError)
		})

		test('throws TypeError or RangeError for invalid rational elements in array mode', () => {
			assert.throws(() => summationRationalSeries([null]), TypeError)
			assert.throws(() => summationRationalSeries([undefined]), TypeError)
			assert.throws(() => summationRationalSeries([42]), TypeError)
			assert.throws(() => summationRationalSeries([{}]), TypeError)
			assert.throws(() => summationRationalSeries([{ num: 1, den: 2n }]), TypeError)
			assert.throws(() => summationRationalSeries([{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => summationRationalSeries([{ num: '1', den: 2n }]), TypeError)

			// Sparse array hole
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [{ num: 1n, den: 2n }, , { num: 1n, den: 3n }]
			assert.throws(() => summationRationalSeries(sparse), TypeError)

			// Zero denominators
			assert.throws(() => summationRationalSeries([{ num: 1n, den: 0n }]), RangeError)
			assert.throws(() => summationRationalSeries([{ num: 0n, den: 0n }]), RangeError)
		})

		test('throws TypeError or RangeError for invalid bounds in generator mode', () => {
			const fn = (k) => ({ num: BigInt(k), den: 1n })

			// Missing or wrong-type bounds
			assert.throws(() => summationRationalSeries(fn), TypeError)
			assert.throws(() => summationRationalSeries(fn, 1), TypeError)
			assert.throws(() => summationRationalSeries(fn, undefined, 5), TypeError)
			assert.throws(() => summationRationalSeries(fn, '1', '5'), TypeError)
			assert.throws(() => summationRationalSeries(fn, null, 5), TypeError)

			// Mixed Number and BigInt bounds
			assert.throws(() => summationRationalSeries(fn, 1, 5n), TypeError)
			assert.throws(() => summationRationalSeries(fn, 1n, 5), TypeError)

			// Non-integer or unsafe Number bounds
			assert.throws(() => summationRationalSeries(fn, 1.5, 5), RangeError)
			assert.throws(() => summationRationalSeries(fn, 1, 5.2), RangeError)
			assert.throws(() => summationRationalSeries(fn, Number.NaN, 5), RangeError)
			assert.throws(() => summationRationalSeries(fn, 1, Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => summationRationalSeries(fn, Number.NEGATIVE_INFINITY, 1), RangeError)
			assert.throws(() => summationRationalSeries(fn, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2), RangeError)
			assert.throws(() => summationRationalSeries(fn, Number.MIN_SAFE_INTEGER - 2, Number.MIN_SAFE_INTEGER - 1), RangeError)
		})

		test('throws TypeError or RangeError when termFn returns an invalid rational', () => {
			assert.throws(() => summationRationalSeries(() => null, 1, 3), TypeError)
			assert.throws(() => summationRationalSeries(() => ({ num: 1, den: 2 }), 1, 3), TypeError)
			assert.throws(
				() => summationRationalSeries((k) => ({ num: 1n, den: BigInt(k - 2) }), 1, 4),
				RangeError,
			)
		})
	})
})
