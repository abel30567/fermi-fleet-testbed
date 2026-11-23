import test from 'node:test'
import assert from 'node:assert/strict'
import { subtractRationalStable } from './subtractRationalStable.js'

/**
 * Independent helper: Euclidean GCD for test verification.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Independent naive rational subtraction (direct cross-multiplication).
 * Used purely as an independent reference oracle in cross-check tests.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function naiveSubtract(a, b) {
	let num = a.num * b.den - b.num * a.den
	let den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

test('normal cases: positive, negative, coprime, and shared-factor denominators', () => {
	assert.deepEqual(subtractRationalStable({ num: 3n, den: 4n }, { num: 1n, den: 4n }), {
		num: 1n,
		den: 2n,
	})
	assert.deepEqual(subtractRationalStable({ num: 5n, den: 6n }, { num: 1n, den: 3n }), {
		num: 1n,
		den: 2n,
	})
	assert.deepEqual(subtractRationalStable({ num: 7n, den: 12n }, { num: 5n, den: 18n }), {
		num: 11n,
		den: 36n,
	})
	// Case where final gcd(t, g) > 1 with distinct denominators (3/10 - 2/15 = 5/30 = 1/6)
	assert.deepEqual(subtractRationalStable({ num: 3n, den: 10n }, { num: 2n, den: 15n }), {
		num: 1n,
		den: 6n,
	})
	// Coprime denominators
	assert.deepEqual(subtractRationalStable({ num: 1n, den: 7n }, { num: 1n, den: 11n }), {
		num: 4n,
		den: 77n,
	})
	// Negative result and negative operands
	assert.deepEqual(subtractRationalStable({ num: 1n, den: 4n }, { num: 3n, den: 4n }), {
		num: -1n,
		den: 2n,
	})
	assert.deepEqual(subtractRationalStable({ num: -1n, den: 2n }, { num: 1n, den: 3n }), {
		num: -5n,
		den: 6n,
	})
	assert.deepEqual(subtractRationalStable({ num: 1n, den: 2n }, { num: -1n, den: 3n }), {
		num: 5n,
		den: 6n,
	})
	assert.deepEqual(subtractRationalStable({ num: -1n, den: 2n }, { num: -1n, den: 3n }), {
		num: -1n,
		den: 6n,
	})
	// Integer rationals
	assert.deepEqual(subtractRationalStable({ num: 5n, den: 1n }, { num: 3n, den: 1n }), {
		num: 2n,
		den: 1n,
	})
})

test('edge cases: zero identities, unreduced inputs, negative denominators, and immutability', () => {
	// Zero identities
	assert.deepEqual(subtractRationalStable({ num: 0n, den: 1n }, { num: 0n, den: 1n }), {
		num: 0n,
		den: 1n,
	})
	assert.deepEqual(subtractRationalStable({ num: 0n, den: -7n }, { num: 0n, den: 99n }), {
		num: 0n,
		den: 1n,
	})
	assert.deepEqual(subtractRationalStable({ num: 6n, den: 8n }, { num: 0n, den: 5n }), {
		num: 3n,
		den: 4n,
	})
	assert.deepEqual(subtractRationalStable({ num: 0n, den: 3n }, { num: 6n, den: -8n }), {
		num: 3n,
		den: 4n,
	})
	// Equal rationals cancel to canonical 0/1
	assert.deepEqual(subtractRationalStable({ num: 2n, den: 4n }, { num: 3n, den: 6n }), {
		num: 0n,
		den: 1n,
	})
	assert.deepEqual(subtractRationalStable({ num: -5n, den: -10n }, { num: 7n, den: 14n }), {
		num: 0n,
		den: 1n,
	})
	// Negative denominators
	assert.deepEqual(subtractRationalStable({ num: 1n, den: -2n }, { num: 1n, den: -3n }), {
		num: -1n,
		den: 6n,
	})
	assert.deepEqual(subtractRationalStable({ num: -3n, den: -6n }, { num: 2n, den: -4n }), {
		num: 1n,
		den: 1n,
	})
	// Input immutability
	const a = Object.freeze({ num: 6n, den: -8n })
	const b = Object.freeze({ num: -2n, den: 4n })
	assert.deepEqual(subtractRationalStable(a, b), { num: -1n, den: 4n })
	assert.deepEqual(a, { num: 6n, den: -8n })
	assert.deepEqual(b, { num: -2n, den: 4n })
})

test('numerical robustness: catastrophic cancellation, huge shared factors, and Fibonacci denominators', () => {
	// Catastrophic cancellation far beyond IEEE 754 float64 precision (53 bits)
	const scale = 10n ** 100n
	const nearOne = { num: scale + 1n, den: scale }
	const one = { num: 1n, den: 1n }
	assert.deepEqual(subtractRationalStable(nearOne, one), { num: 1n, den: scale })

	// Near-equal huge fractions with shared 2^300 factor
	const pow2 = 1n << 300n
	const hi = { num: pow2 + 1n, den: pow2 }
	const lo = { num: pow2 - 1n, den: pow2 }
	assert.deepEqual(subtractRationalStable(hi, lo), { num: 1n, den: 1n << 299n })

	// Huge common denominator factor (10^400): scaling avoids 800-digit intermediate products
	const hugeG = 10n ** 400n
	const res = subtractRationalStable(
		{ num: 7n, den: 2n * hugeG },
		{ num: 5n, den: 3n * hugeG },
	)
	// 7/(2G) - 5/(3G) = (21 - 10)/(6G) = 11/(6G)
	assert.deepEqual(res, { num: 11n, den: 6n * hugeG })

	// Consecutive large Fibonacci denominators (worst-case for Euclidean GCD)
	let fPrev = 1n
	let fCurr = 1n
	for (let i = 0; i < 2000; i++) {
		const next = fPrev + fCurr
		fPrev = fCurr
		fCurr = next
	}
	// By Cassini's identity, consecutive Fibonacci numbers are coprime:
	// fCurr / fPrev - fPrev / fCurr = (fCurr^2 - fPrev^2) / (fPrev * fCurr)
	const fibDiff = subtractRationalStable(
		{ num: fCurr, den: fPrev },
		{ num: fPrev, den: fCurr },
	)
	assert.equal(fibDiff.num, fCurr * fCurr - fPrev * fPrev)
	assert.equal(fibDiff.den, fPrev * fCurr)
	assert.equal(refGcd(fibDiff.num, fibDiff.den), 1n)
})

test('input validation: rejects malformed operands and zero denominators', () => {
	const valid = { num: 1n, den: 2n }
	for (const bad of [null, undefined, 42, '1/2', [1n, 2n], {}, { num: 1, den: 2 }, { num: 1n, den: 2 }, { num: 1, den: 2n }]) {
		assert.throws(() => subtractRationalStable(bad, valid), TypeError)
		assert.throws(() => subtractRationalStable(valid, bad), TypeError)
	}
	assert.throws(() => subtractRationalStable({ num: 1n, den: 0n }, valid), RangeError)
	assert.throws(() => subtractRationalStable(valid, { num: 0n, den: 0n }), RangeError)
})

test('independent cross-check: naive oracle, cross-multiplication identity, anti-symmetry, and float64 agreement', () => {
	// Deterministic LCG for reproducible pseudo-random BigInt rationals
	let state = 0x123456789abcdef1n
	const nextBigInt = (bound) => {
		state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
		return state % bound
	}

	const zero = { num: 0n, den: 1n }

	for (let i = 0; i < 200; i++) {
		// Deliberately introduce shared factors, unreduced inputs, and negative denominators
		const common = nextBigInt(50n) + 1n
		const aScale = nextBigInt(7n) + 1n
		const bScale = nextBigInt(7n) + 1n
		const aSign = nextBigInt(2n) === 0n ? 1n : -1n
		const bSign = nextBigInt(2n) === 0n ? 1n : -1n

		const a = {
			num: (nextBigInt(2001n) - 1000n) * aScale,
			den: aSign * (nextBigInt(500n) + 1n) * common * aScale,
		}
		const b = {
			num: (nextBigInt(2001n) - 1000n) * bScale,
			den: bSign * (nextBigInt(500n) + 1n) * common * bScale,
		}

		const got = subtractRationalStable(a, b)
		const expected = naiveSubtract(a, b)

		// 1. Exact match with independent naive reference oracle
		assert.deepEqual(got, expected)

		// 2. Canonical lowest-terms invariants
		assert.ok(got.den > 0n)
		assert.equal(refGcd(got.num, got.den), 1n)
		if (got.num === 0n) {
			assert.equal(got.den, 1n)
		}

		// 3. Direct cross-multiplication algebraic identity without any reduction:
		//    got.num / got.den === (a.num * b.den - b.num * a.den) / (a.den * b.den)
		assert.equal(got.num * a.den * b.den, (a.num * b.den - b.num * a.den) * got.den)

		// 4. Anti-symmetry: (a - b) === -(b - a)
		const rev = subtractRationalStable(b, a)
		assert.deepEqual(got, { num: -rev.num, den: rev.den })

		// 5. Additive inverse recovery: (a - b) - (0 - b) === a
		const negB = subtractRationalStable(zero, b)
		const recovered = subtractRationalStable(got, negB)
		assert.deepEqual(recovered, naiveSubtract(a, zero))

		// 6. Floating-point agreement on representable magnitudes
		const gotFloat = Number(got.num) / Number(got.den)
		const directFloat = Number(a.num) / Number(a.den) - Number(b.num) / Number(b.den)
		assert.ok(
			Math.abs(gotFloat - directFloat) <= 1e-11 * Math.max(1, Math.abs(directFloat)),
			`float mismatch: ${gotFloat} vs ${directFloat}`,
		)
	}
})
