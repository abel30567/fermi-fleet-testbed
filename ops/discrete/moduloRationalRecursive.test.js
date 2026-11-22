import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { moduloRationalRecursive } from './moduloRationalRecursive.js'

/**
 * Independent reference helpers using native BigInt arithmetic for cross-checking.
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function refNormalize(r) {
	const num = r.den < 0n ? -r.num : r.num
	const den = r.den < 0n ? -r.den : r.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Independently computes `q = floor(a / b)` and `r = a - q * b` using BigInt `/` and `%`.
 */
function refFloorDivMod(a, b) {
	const na = refNormalize(a)
	const nb = refNormalize(b)
	const A = na.num * nb.den
	const B = nb.num * na.den
	const D = na.den * nb.den

	// BigInt `/` truncates toward zero; adjust for floored division when signs differ with remainder.
	let q = A / B
	let rem = A % B
	if (rem !== 0n && (rem < 0n) !== (B < 0n)) {
		q -= 1n
		rem += B
	}
	return { q, r: refNormalize({ num: rem, den: D }) }
}

/**
 * Verifies all mathematical invariants of `r = moduloRationalRecursive(a, b)`:
 * 1. `r` is in lowest terms with `r.den > 0n` (and `0/1` if zero)
 * 2. `a === q * b + r` where `q = floor(a / b)`
 * 3. `0 <= |r| < |b|`
 * 4. Floored-modulo sign invariant: `r.num === 0n` or `sign(r) === sign(b)`
 * 5. Exact equality with independent reference computation
 */
function assertModuloInvariants(a, b) {
	const actual = moduloRationalRecursive(a, b)
	const { q, r: expected } = refFloorDivMod(a, b)

	// Output normalized to lowest terms with den > 0n
	assert.ok(actual.den > 0n, `expected den > 0n, got ${actual.den}`)
	if (actual.num === 0n) {
		assert.equal(actual.den, 1n, 'zero remainder must have den === 1n')
	} else {
		assert.equal(refGcd(actual.num, actual.den), 1n, 'output must be in lowest terms')
	}

	// Exact rational identity: a === q * b + actual
	// Compare a.num / a.den === (q * b.num) / b.den + actual.num / actual.den
	const lhs = a.num * b.den * actual.den
	const rhs = (q * b.num * actual.den + actual.num * b.den) * a.den
	assert.equal(lhs, rhs, `failed identity a === q*b + r for a=${a.num}/${a.den}, b=${b.num}/${b.den}`)

	// Magnitude bound: 0 <= |actual| < |b|
	const absRNum = actual.num < 0n ? -actual.num : actual.num
	const absBNum = b.num < 0n ? -b.num : b.num
	const absBDen = b.den < 0n ? -b.den : b.den
	assert.ok(absRNum >= 0n)
	assert.ok(
		absRNum * absBDen < absBNum * actual.den,
		`expected |r| < |b|, got |${actual.num}/${actual.den}| >= |${b.num}/${b.den}|`
	)

	// Floored-modulo sign invariant
	const bPositive = (b.num > 0n) === (b.den > 0n)
	if (actual.num !== 0n) {
		assert.equal(actual.num > 0n, bPositive, 'non-zero remainder must match sign of divisor b')
	}

	// Matches independent reference
	assert.deepEqual(actual, expected)
	return actual
}

describe('moduloRationalRecursive', () => {
	it('computes basic positive rational modulos in lowest terms', () => {
		assert.deepEqual(
			moduloRationalRecursive({ num: 7n, den: 2n }, { num: 3n, den: 2n }),
			{ num: 1n, den: 2n }
		)
		assert.deepEqual(
			moduloRationalRecursive({ num: 5n, den: 6n }, { num: 1n, den: 4n }),
			{ num: 1n, den: 12n }
		)
		assert.deepEqual(
			moduloRationalRecursive({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 3n }
		)
		assert.deepEqual(
			moduloRationalRecursive({ num: 17n, den: 5n }, { num: 2n, den: 3n }),
			{ num: 1n, den: 15n }
		)
	})

	it('returns 0/1 for zero dividends and exact multiples', () => {
		assert.deepEqual(
			moduloRationalRecursive({ num: 0n, den: 1n }, { num: 3n, den: 5n }),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			moduloRationalRecursive({ num: 0n, den: -7n }, { num: -3n, den: 5n }),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			moduloRationalRecursive({ num: 6n, den: 4n }, { num: 3n, den: 2n }),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			moduloRationalRecursive({ num: -9n, den: 4n }, { num: 3n, den: 4n }),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			moduloRationalRecursive({ num: 9n, den: 4n }, { num: -3n, den: 4n }),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			moduloRationalRecursive({ num: -9n, den: 4n }, { num: -3n, den: 4n }),
			{ num: 0n, den: 1n }
		)
	})

	it('handles all sign combinations according to floored modulo semantics', () => {
		// -7/2 = (-3)*(3/2) + 1
		assert.deepEqual(
			moduloRationalRecursive({ num: -7n, den: 2n }, { num: 3n, den: 2n }),
			{ num: 1n, den: 1n }
		)
		// -1/3 = (-1)*(1/2) + 1/6
		assert.deepEqual(
			moduloRationalRecursive({ num: -1n, den: 3n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 6n }
		)
		// 7/2 = (-3)*(-3/2) + (-1)
		assert.deepEqual(
			moduloRationalRecursive({ num: 7n, den: 2n }, { num: -3n, den: 2n }),
			{ num: -1n, den: 1n }
		)
		// 1/3 = (-1)*(-1/2) + (-1/6)
		assert.deepEqual(
			moduloRationalRecursive({ num: 1n, den: 3n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 6n }
		)
		// -7/2 = 2*(-3/2) + (-1/2)
		assert.deepEqual(
			moduloRationalRecursive({ num: -7n, den: 2n }, { num: -3n, den: 2n }),
			{ num: -1n, den: 2n }
		)
		// -1/3 = 0*(-1/2) + (-1/3)
		assert.deepEqual(
			moduloRationalRecursive({ num: -1n, den: 3n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 3n }
		)
	})

	it('normalizes unreduced inputs and negative denominators without mutating inputs', () => {
		const a = { num: -28n, den: -8n } // +7/2
		const b = { num: 18n, den: 12n } // +3/2
		const result = moduloRationalRecursive(a, b)
		assert.deepEqual(result, { num: 1n, den: 2n })
		assert.deepEqual(a, { num: -28n, den: -8n })
		assert.deepEqual(b, { num: 18n, den: 12n })

		// 7/(-2) = -7/2, (-3)/(-2) = +3/2 => 1/1
		assert.deepEqual(
			moduloRationalRecursive({ num: 7n, den: -2n }, { num: -3n, den: -2n }),
			{ num: 1n, den: 1n }
		)
		// 7/2 mod 3/(-2) = -1/1
		assert.deepEqual(
			moduloRationalRecursive({ num: 7n, den: 2n }, { num: 3n, den: -2n }),
			{ num: -1n, den: 1n }
		)
		// Large common factors in unreduced inputs
		const factor = 10n ** 40n
		assert.deepEqual(
			moduloRationalRecursive(
				{ num: 17n * factor, den: 5n * factor },
				{ num: 2n * factor, den: 3n * factor }
			),
			{ num: 1n, den: 15n }
		)
	})

	it('handles very large BigInts and huge quotients without stack overflow', () => {
		const bigA = { num: 10n ** 200n + 17n, den: 3n }
		const bigB = { num: 7n, den: 11n }
		assertModuloInvariants(bigA, bigB)

		const hugeDividend = { num: -(2n ** 1024n) - 123456789n, den: 97n }
		const tinyDivisor = { num: 5n, den: 2n ** 64n + 1n }
		assertModuloInvariants(hugeDividend, tinyDivisor)

		// Large coprime denominators and negative divisor
		const primeA = { num: 10n ** 80n + 13n, den: 10n ** 40n + 7n }
		const primeB = { num: -(10n ** 30n + 9n), den: 10n ** 35n + 3n }
		assertModuloInvariants(primeA, primeB)
	})

	it('cross-checks a === q * b + r and 0 <= |r| < |b| across diverse cases', () => {
		const cases = [
			[{ num: 0n, den: 1n }, { num: 1n, den: 1n }],
			[{ num: 1n, den: 1n }, { num: 1n, den: 1n }],
			[{ num: 100n, den: 7n }, { num: 3n, den: 11n }],
			[{ num: -100n, den: 7n }, { num: 3n, den: 11n }],
			[{ num: 100n, den: 7n }, { num: -3n, den: 11n }],
			[{ num: -100n, den: 7n }, { num: -3n, den: 11n }],
			[{ num: 100n, den: -7n }, { num: -3n, den: -11n }],
			[{ num: 2n, den: 999n }, { num: 5n, den: 1000n }],
			[{ num: -2n, den: 999n }, { num: 5n, den: 1000n }],
			[{ num: 2n, den: 999n }, { num: -5n, den: 1000n }],
			[{ num: -2n, den: 999n }, { num: -5n, den: 1000n }],
			[{ num: 12345678901234567890123456789n, den: 9876543210987654321n }, { num: 1111111111111111n, den: 777777777777777n }],
			[{ num: -12345678901234567890123456789n, den: 9876543210987654321n }, { num: 1111111111111111n, den: -777777777777777n }],
		]

		for (const [a, b] of cases) {
			assertModuloInvariants(a, b)
		}

		// Deterministic pseudo-random fuzz cross-check
		let seed = 0x5eed123456789abcn
		const nextBigInt = (bits) => {
			let out = 0n
			for (let i = 0; i < bits; i += 32) {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
				out = (out << 32n) | (seed >> 32n)
			}
			return out
		}

		for (let i = 0; i < 60; i++) {
			const signA = (nextBigInt(32) & 1n) === 0n ? 1n : -1n
			const signADen = (nextBigInt(32) & 1n) === 0n ? 1n : -1n
			const signB = (nextBigInt(32) & 1n) === 0n ? 1n : -1n
			const signBDen = (nextBigInt(32) & 1n) === 0n ? 1n : -1n

			const a = {
				num: signA * nextBigInt(96),
				den: signADen * (nextBigInt(64) + 1n),
			}
			const b = {
				num: signB * (nextBigInt(64) + 1n),
				den: signBDen * (nextBigInt(64) + 1n),
			}
			assertModuloInvariants(a, b)
		}
	})

	it('rejects invalid inputs with appropriate errors', () => {
		const valid = { num: 1n, den: 2n }

		// Non-object / null / array inputs
		for (const bad of [null, undefined, 42, 42n, '1/2', true, [1n, 2n]]) {
			assert.throws(() => moduloRationalRecursive(bad, valid), TypeError)
			assert.throws(() => moduloRationalRecursive(valid, bad), TypeError)
		}

		// Non-BigInt fields
		for (const bad of [
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: '2' },
			{ num: 1n },
			{ den: 2n },
			{},
			{ num: NaN, den: 1n },
		]) {
			assert.throws(() => moduloRationalRecursive(bad, valid), TypeError)
			assert.throws(() => moduloRationalRecursive(valid, bad), TypeError)
		}

		// Zero denominators
		assert.throws(
			() => moduloRationalRecursive({ num: 1n, den: 0n }, valid),
			RangeError
		)
		assert.throws(
			() => moduloRationalRecursive(valid, { num: 1n, den: 0n }),
			RangeError
		)
		assert.throws(
			() => moduloRationalRecursive({ num: 0n, den: 0n }, valid),
			RangeError
		)

		// Zero divisor
		assert.throws(
			() => moduloRationalRecursive(valid, { num: 0n, den: 1n }),
			RangeError
		)
		assert.throws(
			() => moduloRationalRecursive(valid, { num: 0n, den: -5n }),
			RangeError
		)
		assert.throws(
			() => moduloRationalRecursive({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
			RangeError
		)
	})
})
