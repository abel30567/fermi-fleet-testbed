import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloRationalStable } from './moduloRationalStable.js'

/**
 * Independent helper: GCD for verifying canonical lowest-terms representation.
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
 * Independent rational comparison: returns -1, 0, or 1 for sign(x - y).
 */
function cmpRational(x, y) {
	const xNum = x.den < 0n ? -x.num : x.num
	const xDen = x.den < 0n ? -x.den : x.den
	const yNum = y.den < 0n ? -y.num : y.num
	const yDen = y.den < 0n ? -y.den : y.den
	const lhs = xNum * yDen
	const rhs = yNum * xDen
	if (lhs < rhs) return -1
	if (lhs > rhs) return 1
	return 0
}

/**
 * Independent cross-check of all defining invariants for r = moduloRationalStable(a, b):
 *   1. Lowest terms with den > 0n (and 0/1 when num === 0n).
 *   2. Exact integer quotient q such that a - r = q * b.
 *   3. Range invariant: 0 <= r < b (for b > 0) or b < r <= 0 (for b < 0).
 */
function assertModuloInvariants(a, b, r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, 'zero remainder must be normalized to 0n/1n')
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `result ${r.num}/${r.den} is not in lowest terms`)
	}

	// Normalize a and b independently using raw sign flip only (no shared code).
	const aNum = a.den < 0n ? -a.num : a.num
	const aDen = a.den < 0n ? -a.den : a.den
	const bNum = b.den < 0n ? -b.num : b.num
	const bDen = b.den < 0n ? -b.den : b.den

	// diff = a - r = (aNum * r.den - r.num * aDen) / (aDen * r.den)
	const diffNum = aNum * r.den - r.num * aDen
	const diffDen = aDen * r.den

	// q = diff / b = (diffNum * bDen) / (diffDen * bNum) must be an exact integer
	const qNumer = diffNum * bDen
	const qDenom = diffDen * bNum
	assert.equal(qNumer % qDenom, 0n, `a - r is not an exact integer multiple of b`)

	// Verify range invariant
	const zero = { num: 0n, den: 1n }
	if (bNum > 0n) {
		assert.ok(cmpRational(zero, r) <= 0, `expected 0 <= r for b > 0`)
		assert.ok(cmpRational(r, b) < 0, `expected r < b for b > 0`)
	} else {
		assert.ok(cmpRational(b, r) < 0, `expected b < r for b < 0`)
		assert.ok(cmpRational(r, zero) <= 0, `expected r <= 0 for b < 0`)
	}
}

test('basic positive rationals', () => {
	assert.deepEqual(
		moduloRationalStable({ num: 7n, den: 3n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 3n }
	)
	assert.deepEqual(
		moduloRationalStable({ num: 5n, den: 4n }, { num: 2n, den: 3n }),
		{ num: 7n, den: 12n }
	)
	assert.deepEqual(
		moduloRationalStable({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 3n }
	)
	assert.deepEqual(
		moduloRationalStable({ num: 17n, den: 1n }, { num: 5n, den: 1n }),
		{ num: 2n, den: 1n }
	)
})

test('exact multiples and zero dividend return 0n/1n', () => {
	assert.deepEqual(
		moduloRationalStable({ num: 3n, den: 2n }, { num: 1n, den: 2n }),
		{ num: 0n, den: 1n }
	)
	assert.deepEqual(
		moduloRationalStable({ num: -3n, den: 2n }, { num: 1n, den: 2n }),
		{ num: 0n, den: 1n }
	)
	assert.deepEqual(
		moduloRationalStable({ num: 3n, den: 2n }, { num: -1n, den: 2n }),
		{ num: 0n, den: 1n }
	)
	assert.deepEqual(
		moduloRationalStable({ num: -3n, den: 2n }, { num: -1n, den: 2n }),
		{ num: 0n, den: 1n }
	)
	assert.deepEqual(
		moduloRationalStable({ num: 0n, den: 7n }, { num: 3n, den: 5n }),
		{ num: 0n, den: 1n }
	)
	assert.deepEqual(
		moduloRationalStable({ num: 0n, den: -9n }, { num: -3n, den: 5n }),
		{ num: 0n, den: 1n }
	)
})

test('negative dividend with positive divisor (floored modulo)', () => {
	// -7/3 = -5*(1/2) + 1/6
	assert.deepEqual(
		moduloRationalStable({ num: -7n, den: 3n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 6n }
	)
	// -1/3 mod 1/2 = 1/6
	assert.deepEqual(
		moduloRationalStable({ num: -1n, den: 3n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 6n }
	)
	// -6/5 mod 4/15 = 2/15
	assert.deepEqual(
		moduloRationalStable({ num: -6n, den: 5n }, { num: 4n, den: 15n }),
		{ num: 2n, den: 15n }
	)
})

test('negative divisor with positive and negative dividends (floored modulo)', () => {
	// 7/3 = (-5)*(-1/2) + (-1/6)
	assert.deepEqual(
		moduloRationalStable({ num: 7n, den: 3n }, { num: -1n, den: 2n }),
		{ num: -1n, den: 6n }
	)
	// -7/3 = 4*(-1/2) + (-1/3)
	assert.deepEqual(
		moduloRationalStable({ num: -7n, den: 3n }, { num: -1n, den: 2n }),
		{ num: -1n, den: 3n }
	)
	// 6/5 mod (-4/15) = -2/15
	assert.deepEqual(
		moduloRationalStable({ num: 6n, den: 5n }, { num: -4n, den: 15n }),
		{ num: -2n, den: 15n }
	)
	// -6/5 mod (-4/15) = -2/15
	assert.deepEqual(
		moduloRationalStable({ num: -6n, den: 5n }, { num: -4n, den: 15n }),
		{ num: -2n, den: 15n }
	)
})

test('unreduced inputs and negative denominators are normalized properly', () => {
	// (14/6) mod (10/20) = (7/3) mod (1/2) = 1/3
	assert.deepEqual(
		moduloRationalStable({ num: 14n, den: 6n }, { num: 10n, den: 20n }),
		{ num: 1n, den: 3n }
	)
	// (7/-3) mod (-1/-2) = (-7/3) mod (1/2) = 1/6
	assert.deepEqual(
		moduloRationalStable({ num: 7n, den: -3n }, { num: -1n, den: -2n }),
		{ num: 1n, den: 6n }
	)
	// (-14/-6) mod (5/-10) = (7/3) mod (-1/2) = -1/6
	assert.deepEqual(
		moduloRationalStable({ num: -14n, den: -6n }, { num: 5n, den: -10n }),
		{ num: -1n, den: 6n }
	)
	// Input objects are not mutated
	const a = { num: 14n, den: -6n }
	const b = { num: -10n, den: -20n }
	moduloRationalStable(a, b)
	assert.deepEqual(a, { num: 14n, den: -6n })
	assert.deepEqual(b, { num: -10n, den: -20n })
})

test('huge BigInt fractions beyond IEEE-754 precision and MAX_VALUE', () => {
	// Near-integer fraction where float64 rounds to 1.0 and gives wrong 0
	const p = 10n ** 300n
	const nearOne = { num: p - 1n, den: p }
	assert.deepEqual(
		moduloRationalStable(nearOne, { num: 1n, den: 1n }),
		{ num: p - 1n, den: p }
	)

	// Dividend > Number.MAX_VALUE (~1.8e308) with tiny remainder
	const big = 10n ** 400n
	const a = { num: big * 7n + 5n, den: 13n }
	const b = { num: 7n, den: 13n }
	const r = moduloRationalStable(a, b)
	assert.deepEqual(r, { num: 5n, den: 13n })
	assertModuloInvariants(a, b, r)

	// Huge common factors in numerators and denominators
	const hugeFactor = 2n ** 512n + 17n
	const a2 = { num: hugeFactor * 11n, den: hugeFactor * 3n }
	const b2 = { num: hugeFactor * 2n, den: hugeFactor * 5n }
	// 11/3 mod 2/5 = 55/15 mod 6/15 = 1/15
	const r2 = moduloRationalStable(a2, b2)
	assert.deepEqual(r2, { num: 1n, den: 15n })
	assertModuloInvariants(a2, b2, r2)

	// Huge coprime primes where 2^53 precision fails completely
	const q1 = (1n << 200n) + 1n
	const q2 = (1n << 100n) + 3n
	const a3 = { num: q1 * q2 + 1n, den: q2 }
	const b3 = { num: 1n, den: 1n }
	const r3 = moduloRationalStable(a3, b3)
	assert.deepEqual(r3, { num: 1n, den: q2 })
	assertModuloInvariants(a3, b3, r3)
})

test('input validation rejects zero modulus, zero denominators, and invalid types', () => {
	// Zero modulus
	assert.throws(
		() => moduloRationalStable({ num: 1n, den: 2n }, { num: 0n, den: 1n }),
		RangeError
	)
	assert.throws(
		() => moduloRationalStable({ num: 0n, den: 1n }, { num: 0n, den: -5n }),
		RangeError
	)

	// Zero denominators
	assert.throws(
		() => moduloRationalStable({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
		RangeError
	)
	assert.throws(
		() => moduloRationalStable({ num: 1n, den: 2n }, { num: 1n, den: 0n }),
		RangeError
	)
	assert.throws(
		() => moduloRationalStable({ num: 0n, den: 0n }, { num: 1n, den: 2n }),
		RangeError
	)

	// Invalid input types (Numbers, null, undefined, arrays, missing fields)
	for (const bad of [
		null,
		undefined,
		42,
		42n,
		'1/2',
		[1n, 2n],
		{},
		{ num: 1, den: 2 },
		{ num: 1n, den: 2 },
		{ num: 1, den: 2n },
		{ num: 1n },
		{ den: 2n },
	]) {
		assert.throws(() => moduloRationalStable(bad, { num: 1n, den: 2n }), TypeError)
		assert.throws(() => moduloRationalStable({ num: 1n, den: 2n }, bad), TypeError)
	}
})

test('independent cross-check of division identity, range invariant, periodicity, and idempotence', () => {
	const samples = [
		{ num: 0n, den: 1n },
		{ num: 1n, den: 1n },
		{ num: -1n, den: 1n },
		{ num: 7n, den: 3n },
		{ num: -7n, den: 3n },
		{ num: 7n, den: -3n },
		{ num: -18n, den: 12n },
		{ num: 35n, den: 14n },
		{ num: 101n, den: 97n },
		{ num: -101n, den: 97n },
		{ num: 10n ** 60n + 7n, den: 3n * 10n ** 20n },
		{ num: -(10n ** 60n + 11n), den: 7n * 10n ** 20n },
	]

	for (const a of samples) {
		for (const b of samples) {
			if (b.num === 0n) continue
			const r = moduloRationalStable(a, b)
			assertModuloInvariants(a, b, r)

			// Idempotence: (a mod b) mod b === a mod b
			assert.deepEqual(moduloRationalStable(r, b), r)

			// Periodicity: (a + k * b) mod b === a mod b for integer k
			for (const k of [-3n, 1n, 5n]) {
				const shiftedA = {
					num: a.num * b.den + k * b.num * a.den,
					den: a.den * b.den,
				}
				assert.deepEqual(moduloRationalStable(shiftedA, b), r)
			}
		}
	}
})
