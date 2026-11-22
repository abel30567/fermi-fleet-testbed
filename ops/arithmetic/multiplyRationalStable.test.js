import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyRationalStable } from './multiplyRationalStable.js'

/**
 * Independent reference implementation: directly multiplies numerators and
 * denominators first, then reduces via a separate binary GCD (Stein's algorithm).
 */
function binaryGcd(u, v) {
	let a = u < 0n ? -u : u
	let b = v < 0n ? -v : v
	if (a === 0n) return b
	if (b === 0n) return a

	let shift = 0n
	while (((a | b) & 1n) === 0n) {
		a >>= 1n
		b >>= 1n
		shift += 1n
	}
	while ((a & 1n) === 0n) {
		a >>= 1n
	}
	do {
		while ((b & 1n) === 0n) {
			b >>= 1n
		}
		if (a > b) {
			const tmp = a
			a = b
			b = tmp
		}
		b -= a
	} while (b !== 0n)

	return a << shift
}

function naiveMultiplyRational(a, b) {
	let num = a.num * b.num
	let den = a.den * b.den
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = binaryGcd(num, den)
	return { num: num / g, den: den / g }
}

describe('multiplyRationalStable', () => {
	test('multiplies basic positive fractions and reduces to lowest terms', () => {
		assert.deepEqual(
			multiplyRationalStable({ num: 2n, den: 3n }, { num: 3n, den: 4n }),
			{ num: 1n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 5n, den: 7n }, { num: 11n, den: 13n }),
			{ num: 55n, den: 91n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 6n, den: 9n }, { num: 15n, den: 10n }),
			{ num: 1n, den: 1n },
		)
	})

	test('handles signs and negative denominators canonically', () => {
		assert.deepEqual(
			multiplyRationalStable({ num: -2n, den: 3n }, { num: 3n, den: 5n }),
			{ num: -2n, den: 5n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: -2n, den: 3n }, { num: -9n, den: 4n }),
			{ num: 3n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 2n, den: -4n }, { num: -3n, den: -9n }),
			{ num: -1n, den: 6n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: -6n, den: -8n }, { num: -4n, den: -3n }),
			{ num: 1n, den: 1n },
		)
	})

	test('handles zero, multiplicative identity, and reciprocals', () => {
		assert.deepEqual(
			multiplyRationalStable({ num: 0n, den: 1n }, { num: 7n, den: 9n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 7n, den: -9n }, { num: 0n, den: -123n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 0n, den: -5n }, { num: 0n, den: 8n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 1n, den: 1n }, { num: -42n, den: 18n }),
			{ num: -7n, den: 3n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 19n, den: 23n }, { num: 23n, den: 19n }),
			{ num: 1n, den: 1n },
		)
	})

	test('handles huge BigInts and deep cross-cancellation without stack overflow', () => {
		// Huge common factor that cancels completely before multiplication.
		const scale = 10n ** 200n + 7n
		const a = { num: 17n * scale, den: 19n * (10n ** 150n + 3n) }
		const b = { num: 19n * (10n ** 150n + 3n), den: 23n * scale }
		assert.deepEqual(multiplyRationalStable(a, b), { num: 17n, den: 23n })

		// Worst-case consecutive Fibonacci numbers for Euclidean GCD (F_500, F_501).
		let fPrev = 1n
		let fCurr = 1n
		for (let i = 2; i <= 500; i += 1) {
			const next = fPrev + fCurr
			fPrev = fCurr
			fCurr = next
		}
		const fibA = { num: fCurr, den: fPrev }
		const fibB = { num: fPrev, den: fCurr }
		assert.deepEqual(multiplyRationalStable(fibA, fibB), { num: 1n, den: 1n })
	})

	test('does not mutate input objects', () => {
		const a = Object.freeze({ num: 6n, den: -8n })
		const b = Object.freeze({ num: -4n, den: 9n })
		const res = multiplyRationalStable(a, b)
		assert.deepEqual(res, { num: 1n, den: 3n })
		assert.deepEqual(a, { num: 6n, den: -8n })
		assert.deepEqual(b, { num: -4n, den: 9n })
	})

	test('rejects invalid inputs with TypeError or RangeError', () => {
		const valid = { num: 1n, den: 2n }
		const zero = { num: 0n, den: 1n }

		// Non-object operands
		for (const bad of [null, undefined, 42, 42n, '1/2', true, [1n, 2n]]) {
			assert.throws(() => multiplyRationalStable(bad, valid), TypeError)
			assert.throws(() => multiplyRationalStable(valid, bad), TypeError)
		}

		// Non-bigint fields
		for (const bad of [
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: 2n },
			{ num: 1n, den: null },
			{ num: undefined, den: 2n },
			{ num: NaN, den: 2n },
			{},
		]) {
			assert.throws(() => multiplyRationalStable(bad, valid), TypeError)
			assert.throws(() => multiplyRationalStable(valid, bad), TypeError)
		}

		// Zero denominator (including when the other operand is zero)
		assert.throws(() => multiplyRationalStable({ num: 1n, den: 0n }, valid), RangeError)
		assert.throws(() => multiplyRationalStable(valid, { num: 1n, den: 0n }), RangeError)
		assert.throws(() => multiplyRationalStable({ num: 0n, den: 0n }, valid), RangeError)
		assert.throws(() => multiplyRationalStable(zero, { num: 1n, den: 0n }), RangeError)
		assert.throws(() => multiplyRationalStable({ num: 1n, den: 0n }, zero), RangeError)
	})

	test('cross-checks against independent naive + binary GCD implementation and algebraic laws', () => {
		// Deterministic PRNG (xorshift64*) for reproducible property tests
		let state = 0x2545f4914f6cdd1dn
		function nextBigInt(bits) {
			state ^= state >> 12n
			state ^= (state << 25n) & ((1n << 64n) - 1n)
			state ^= state >> 27n
			const val = (state * 0x2545f4914f6cdd1dn) & ((1n << 64n) - 1n)
			return val >> BigInt(64 - bits)
		}

		const samples = []
		for (let i = 0; i < 60; i += 1) {
			const signN = i % 3 === 0 ? -1n : 1n
			const signD = i % 5 === 0 ? -1n : 1n
			const num = signN * (nextBigInt(48) - (1n << 20n))
			const den = signD * (nextBigInt(48) + 1n)
			samples.push({ num, den })
		}

		for (let i = 0; i < samples.length; i += 1) {
			const a = samples[i]
			const b = samples[(i + 1) % samples.length]
			const c = samples[(i + 2) % samples.length]

			const got = multiplyRationalStable(a, b)
			const expected = naiveMultiplyRational(a, b)

			// Exact equality with independent implementation
			assert.deepEqual(got, expected)

			// Canonical invariants
			assert.ok(got.den > 0n, 'denominator must be strictly positive')
			assert.equal(binaryGcd(got.num, got.den), 1n, 'result must be in lowest terms')

			// Commutativity: a * b === b * a
			assert.deepEqual(got, multiplyRationalStable(b, a))

			// Associativity: (a * b) * c === a * (b * c)
			assert.deepEqual(
				multiplyRationalStable(multiplyRationalStable(a, b), c),
				multiplyRationalStable(a, multiplyRationalStable(b, c)),
			)
		}

		// Floating-point cross-check on bounded rationals
		const floatCases = [
			[{ num: 7n, den: 8n }, { num: -4n, den: 21n }],
			[{ num: 123456n, den: 789n }, { num: 321n, den: 65432n }],
			[{ num: -999n, den: -1000n }, { num: 250n, den: 333n }],
		]
		for (const [a, b] of floatCases) {
			const prod = multiplyRationalStable(a, b)
			const approx = Number(prod.num) / Number(prod.den)
			const expectedApprox = (Number(a.num) / Number(a.den)) * (Number(b.num) / Number(b.den))
			assert.ok(
				Math.abs(approx - expectedApprox) <= 1e-12 * Math.max(1, Math.abs(expectedApprox)),
				`float mismatch: ${approx} vs ${expectedApprox}`,
			)
		}
	})
})
