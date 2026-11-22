import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloRationalIterative } from './moduloRationalIterative.js'

/**
 * Helper: exact GCD for test assertions and independent reference oracle.
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		;[x, y] = [y, x % y]
	}
	return x
}

/**
 * Helper: normalize rational to canonical lowest terms with den > 0n.
 */
function refNormalize(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	const sign = den < 0n ? -1n : 1n
	const n = num * sign
	const d = den * sign
	const g = refGcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Independent reference oracle using direct BigInt truncated division `/`
 * adjusted to mathematical floor:
 *   q = floor((a.num * b.den) / (a.den * b.num))
 *   r = a - b * q
 */
function refFloorMod(a, b) {
	let p = a.num * b.den
	let qDen = a.den * b.num
	if (qDen < 0n) {
		p = -p
		qDen = -qDen
	}
	// BigInt `/` truncates toward zero; adjust down by 1 when negative with non-zero remainder.
	let quot = p / qDen
	const rem = p % qDen
	if (rem < 0n) {
		quot -= 1n
	}
	// a - b * quot = (a.num * b.den - quot * b.num * a.den) / (a.den * b.den)
	const num = a.num * b.den - quot * b.num * a.den
	const den = a.den * b.den
	return { quot, rem: refNormalize(num, den) }
}

/**
 * Assert canonical lowest-terms representation with den > 0n.
 */
function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(refGcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	}
}

/**
 * Compare two rationals: returns -1, 0, or 1.
 */
function cmpRat(x, y) {
	const nx = refNormalize(x.num, x.den)
	const ny = refNormalize(y.num, y.den)
	const lhs = nx.num * ny.den
	const rhs = ny.num * nx.den
	return lhs < rhs ? -1 : lhs > rhs ? 1 : 0
}

describe('moduloRationalIterative', () => {
	test('positive dividend and positive divisor', () => {
		// 7/3 mod 1/2 = 7/3 - 4*(1/2) = 1/3
		assert.deepEqual(
			moduloRationalIterative({ num: 7n, den: 3n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 3n }
		)
		// 10/1 mod 3/1 = 1/1
		assert.deepEqual(
			moduloRationalIterative({ num: 10n, den: 1n }, { num: 3n, den: 1n }),
			{ num: 1n, den: 1n }
		)
		// 11/4 mod 2/3 = 11/4 - 4*(2/3) = (33 - 32)/12 = 1/12
		assert.deepEqual(
			moduloRationalIterative({ num: 11n, den: 4n }, { num: 2n, den: 3n }),
			{ num: 1n, den: 12n }
		)
		// Result reduces to lowest terms: 5/6 mod 1/3 = 5/6 - 2*(1/3) = 1/6
		assert.deepEqual(
			moduloRationalIterative({ num: 5n, den: 6n }, { num: 1n, den: 3n }),
			{ num: 1n, den: 6n }
		)
		// Result reduces: 7/6 mod 2/6 = 1/6; 5/4 mod 1/2 = 1/4
		assert.deepEqual(
			moduloRationalIterative({ num: 5n, den: 4n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 4n }
		)
	})

	test('negative dividend and positive divisor (floored mod: 0 <= r < b)', () => {
		// -7/3 mod 1/2 = -7/3 - (-5)*(1/2) = 1/6
		assert.deepEqual(
			moduloRationalIterative({ num: -7n, den: 3n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 6n }
		)
		// -10 mod 3 = 2
		assert.deepEqual(
			moduloRationalIterative({ num: -10n, den: 1n }, { num: 3n, den: 1n }),
			{ num: 2n, den: 1n }
		)
		// -1/4 mod 3/4 = 1/2
		assert.deepEqual(
			moduloRationalIterative({ num: -1n, den: 4n }, { num: 3n, den: 4n }),
			{ num: 1n, den: 2n }
		)
	})

	test('positive dividend and negative divisor (floored mod: b < r <= 0)', () => {
		// 7/3 mod -1/2 = 7/3 - (-5)*(-1/2) = -1/6
		assert.deepEqual(
			moduloRationalIterative({ num: 7n, den: 3n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 6n }
		)
		// 10 mod -3 = -2
		assert.deepEqual(
			moduloRationalIterative({ num: 10n, den: 1n }, { num: -3n, den: 1n }),
			{ num: -2n, den: 1n }
		)
		// 1/4 mod -3/4 = -1/2
		assert.deepEqual(
			moduloRationalIterative({ num: 1n, den: 4n }, { num: -3n, den: 4n }),
			{ num: -1n, den: 2n }
		)
	})

	test('negative dividend and negative divisor (floored mod: b < r <= 0)', () => {
		// -7/3 mod -1/2 = -7/3 - 4*(-1/2) = -1/3
		assert.deepEqual(
			moduloRationalIterative({ num: -7n, den: 3n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 3n }
		)
		// -10 mod -3 = -1
		assert.deepEqual(
			moduloRationalIterative({ num: -10n, den: 1n }, { num: -3n, den: 1n }),
			{ num: -1n, den: 1n }
		)
	})

	test('exact multiples and zero dividend return canonical 0/1', () => {
		const cases = [
			[{ num: 0n, den: 1n }, { num: 3n, den: 7n }],
			[{ num: 0n, den: 5n }, { num: -3n, den: 7n }],
			[{ num: 3n, den: 2n }, { num: 1n, den: 2n }],
			[{ num: -3n, den: 2n }, { num: 1n, den: 2n }],
			[{ num: 3n, den: 2n }, { num: -1n, den: 2n }],
			[{ num: -3n, den: 2n }, { num: -1n, den: 2n }],
			[{ num: 5n, den: 7n }, { num: 5n, den: 7n }],
			[{ num: -5n, den: 7n }, { num: 5n, den: 7n }],
			[{ num: 9n, den: 4n }, { num: 3n, den: 4n }],
		]
		for (const [a, b] of cases) {
			const res = moduloRationalIterative(a, b)
			assert.deepEqual(res, { num: 0n, den: 1n })
			assertCanonical(res)
		}
	})

	test('|a| < |b| across all four sign combinations', () => {
		// + / + : 1/3 mod 1/2 = 1/3
		assert.deepEqual(
			moduloRationalIterative({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 3n }
		)
		// - / + : -1/3 mod 1/2 = 1/6
		assert.deepEqual(
			moduloRationalIterative({ num: -1n, den: 3n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 6n }
		)
		// + / - : 1/3 mod -1/2 = -1/6
		assert.deepEqual(
			moduloRationalIterative({ num: 1n, den: 3n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 6n }
		)
		// - / - : -1/3 mod -1/2 = -1/3
		assert.deepEqual(
			moduloRationalIterative({ num: -1n, den: 3n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 3n }
		)
	})

	test('unreduced inputs and negative denominators without mutating inputs', () => {
		const a = { num: 14n, den: 6n } // 7/3
		const b = { num: -3n, den: -6n } // 1/2
		const res = moduloRationalIterative(a, b)
		assert.deepEqual(res, { num: 1n, den: 3n })
		assert.deepEqual(a, { num: 14n, den: 6n })
		assert.deepEqual(b, { num: -3n, den: -6n })

		// 7/(-3) mod (-3)/6 = -7/3 mod -1/2 = -1/3
		assert.deepEqual(
			moduloRationalIterative({ num: 7n, den: -3n }, { num: -3n, den: 6n }),
			{ num: -1n, den: 3n }
		)

		// 14/6 mod 3/(-6) = 7/3 mod -1/2 = -1/6
		assert.deepEqual(
			moduloRationalIterative({ num: 14n, den: 6n }, { num: 3n, den: -6n }),
			{ num: -1n, den: 6n }
		)

		// 0/(-9) mod (-4)/(-8) = 0/1
		assert.deepEqual(
			moduloRationalIterative({ num: 0n, den: -9n }, { num: -4n, den: -8n }),
			{ num: 0n, den: 1n }
		)
	})

	test('large BigInt quotients complete quickly and exactly', () => {
		// Quotient ~ 5 * 10^100
		const big = 10n ** 100n
		const a1 = { num: big * 7n + 5n, den: 7n } // 10^100 + 5/7
		const b1 = { num: 1n, den: 5n }
		// 10^100 is an exact multiple of 1/5, so remainder is (5/7) mod (1/5) = 5/7 - 3*(1/5) = 4/35
		const r1 = moduloRationalIterative(a1, b1)
		assert.deepEqual(r1, { num: 4n, den: 35n })
		assertCanonical(r1)

		// Huge binary power quotient ~ 2^500, negative dividend
		const hugeQ = 2n ** 500n + 123456789n
		const divisor = { num: 13n, den: 17n }
		const expectedRem = { num: 5n, den: 51n } // 0 <= 5/51 < 13/17
		// Construct a = (-hugeQ) * divisor + expectedRem
		const a2 = {
			num: -hugeQ * divisor.num * expectedRem.den + expectedRem.num * divisor.den,
			den: divisor.den * expectedRem.den,
		}
		const r2 = moduloRationalIterative(a2, divisor)
		assert.deepEqual(r2, expectedRem)
		assertCanonical(r2)

		// Negative divisor with huge quotient
		const negDivisor = { num: -13n, den: 17n }
		const expectedNegRem = { num: -5n, den: 51n } // -13/17 < -5/51 <= 0
		const a3 = {
			num: hugeQ * negDivisor.num * expectedNegRem.den + expectedNegRem.num * negDivisor.den,
			den: negDivisor.den * expectedNegRem.den,
		}
		const r3 = moduloRationalIterative(a3, negDivisor)
		assert.deepEqual(r3, expectedNegRem)
		assertCanonical(r3)
	})

	test('invalid inputs throw TypeError or RangeError', () => {
		const valid = { num: 1n, den: 2n }

		// Non-object / array inputs -> TypeError
		for (const bad of [null, undefined, 0, 1n, '1/2', true, [1n, 2n]]) {
			assert.throws(() => moduloRationalIterative(bad, valid), TypeError)
			assert.throws(() => moduloRationalIterative(valid, bad), TypeError)
		}

		// Non-BigInt or missing fields -> TypeError
		const badFields = [
			{},
			{ num: 1n },
			{ den: 2n },
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: '2' },
			{ num: null, den: 2n },
			{ num: 1n, den: undefined },
		]
		for (const bad of badFields) {
			assert.throws(() => moduloRationalIterative(bad, valid), TypeError)
			assert.throws(() => moduloRationalIterative(valid, bad), TypeError)
		}

		// Zero denominators -> RangeError
		assert.throws(() => moduloRationalIterative({ num: 1n, den: 0n }, valid), RangeError)
		assert.throws(() => moduloRationalIterative({ num: 0n, den: 0n }, valid), RangeError)
		assert.throws(() => moduloRationalIterative(valid, { num: 1n, den: 0n }), RangeError)
		assert.throws(() => moduloRationalIterative(valid, { num: 0n, den: 0n }), RangeError)

		// Modulo by zero -> RangeError (including when dividend is 0)
		assert.throws(() => moduloRationalIterative(valid, { num: 0n, den: 1n }), RangeError)
		assert.throws(() => moduloRationalIterative(valid, { num: 0n, den: -5n }), RangeError)
		assert.throws(
			() => moduloRationalIterative({ num: 0n, den: 1n }, { num: 0n, den: 3n }),
			RangeError
		)
	})

	test('cross-check against independent BigInt floor-division oracle and identity a === b*q + r', () => {
		const nums = [-37n, -12n, -7n, -2n, -1n, 0n, 1n, 2n, 7n, 12n, 37n]
		const dens = [-6n, -3n, 1n, 2n, 4n, 5n, 9n]

		const rationals = []
		for (const n of nums) {
			for (const d of dens) {
				rationals.push({ num: n, den: d })
			}
		}

		const zero = { num: 0n, den: 1n }
		for (const a of rationals) {
			for (const b of rationals) {
				if (b.num === 0n) continue

				const r = moduloRationalIterative(a, b)
				assertCanonical(r)

				// Cross-check exact result against independent BigInt division oracle
				const { quot, rem } = refFloorMod(a, b)
				assert.deepEqual(
					r,
					rem,
					`mismatch for (${a.num}/${a.den}) mod (${b.num}/${b.den})`
				)

				// Verify division identity: a === b * q + r
				const bqPlusR = refNormalize(
					b.num * quot * r.den + r.num * b.den,
					b.den * r.den
				)
				const normA = refNormalize(a.num, a.den)
				assert.deepEqual(bqPlusR, normA)

				// Verify range invariant: 0 <= r < b if b > 0, else b < r <= 0
				const normB = refNormalize(b.num, b.den)
				if (normB.num > 0n) {
					assert.ok(cmpRat(zero, r) <= 0, 'expected 0 <= r for b > 0')
					assert.ok(cmpRat(r, normB) < 0, 'expected r < b for b > 0')
				} else {
					assert.ok(cmpRat(normB, r) < 0, 'expected b < r for b < 0')
					assert.ok(cmpRat(r, zero) <= 0, 'expected r <= 0 for b < 0')
				}
			}
		}
	})

	test('cross-check floating-point sanity on representative non-boundary fractions', () => {
		const pairs = [
			[{ num: 23n, den: 5n }, { num: 3n, den: 4n }],
			[{ num: -23n, den: 5n }, { num: 3n, den: 4n }],
			[{ num: 23n, den: 5n }, { num: -3n, den: 4n }],
			[{ num: -23n, den: 5n }, { num: -3n, den: 4n }],
			[{ num: 101n, den: 8n }, { num: 7n, den: 3n }],
			[{ num: -101n, den: 8n }, { num: -7n, den: 3n }],
		]
		for (const [a, b] of pairs) {
			const r = moduloRationalIterative(a, b)
			const fa = Number(a.num) / Number(a.den)
			const fb = Number(b.num) / Number(b.den)
			const expectedFloat = fa - fb * Math.floor(fa / fb)
			const actualFloat = Number(r.num) / Number(r.den)
			assert.ok(
				Math.abs(actualFloat - expectedFloat) < 1e-12,
				`float sanity mismatch: ${actualFloat} vs ${expectedFloat}`
			)
		}
	})
})
