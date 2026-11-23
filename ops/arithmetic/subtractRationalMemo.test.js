import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { subtractRationalMemo } from './subtractRationalMemo.js'

/**
 * Independent reference GCD (binary / Stein's algorithm) for cross-checking.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function independentBinaryGcd(a, b) {
	let u = a < 0n ? -a : a
	let v = b < 0n ? -b : b
	if (u === 0n) return v
	if (v === 0n) return u
	let shift = 0n
	while (((u | v) & 1n) === 0n) {
		u >>= 1n
		v >>= 1n
		shift++
	}
	while ((u & 1n) === 0n) u >>= 1n
	do {
		while ((v & 1n) === 0n) v >>= 1n
		if (u > v) {
			const tmp = u
			u = v
			v = tmp
		}
		v -= u
	} while (v !== 0n)
	return u << shift
}

/**
 * Independent naive rational subtraction oracle:
 * a/b - c/d = (a*d - c*b) / (b*d), reduced via independentBinaryGcd.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function naiveSubtractOracle(a, b) {
	const rawNum = a.num * b.den - b.num * a.den
	const rawDen = a.den * b.den
	if (rawNum === 0n) return { num: 0n, den: 1n }
	const sign = rawDen < 0n ? -1n : 1n
	const num = rawNum * sign
	const den = rawDen * sign
	const g = independentBinaryGcd(num, den)
	return { num: num / g, den: den / g }
}

describe('subtractRationalMemo', () => {
	it('subtracts basic positive rationals and reduces to lowest terms', () => {
		assert.deepEqual(
			subtractRationalMemo({ num: 3n, den: 4n }, { num: 1n, den: 4n }),
			{ num: 1n, den: 2n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 5n, den: 6n }, { num: 1n, den: 6n }),
			{ num: 2n, den: 3n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 2n, den: 3n }, { num: 1n, den: 5n }),
			{ num: 7n, den: 15n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 7n, den: 12n }, { num: 5n, den: 18n }),
			{ num: 11n, den: 36n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 5n, den: 2n }, { num: 1n, den: 2n }),
			{ num: 2n, den: 1n },
		)
	})

	it('handles negative operands and negative results', () => {
		assert.deepEqual(
			subtractRationalMemo({ num: 1n, den: 3n }, { num: 2n, den: 3n }),
			{ num: -1n, den: 3n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: -1n, den: 2n }, { num: 1n, den: 3n }),
			{ num: -5n, den: 6n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: -1n, den: 2n }, { num: -3n, den: 4n }),
			{ num: 1n, den: 4n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: -5n, den: 6n }, { num: -1n, den: 6n }),
			{ num: -2n, den: 3n },
		)
	})

	it('handles zero operands and exact cancellation to canonical 0/1', () => {
		assert.deepEqual(
			subtractRationalMemo({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 3n, den: 7n }, { num: 0n, den: 5n }),
			{ num: 3n, den: 7n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 0n, den: -9n }, { num: 3n, den: 7n }),
			{ num: -3n, den: 7n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 4n, den: 9n }, { num: 4n, den: 9n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 6n, den: 10n }, { num: -9n, den: -15n }),
			{ num: 0n, den: 1n },
		)
	})

	it('normalizes unreduced inputs and negative denominators', () => {
		assert.deepEqual(
			subtractRationalMemo({ num: 4n, den: 8n }, { num: 3n, den: -9n }),
			{ num: 5n, den: 6n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: -6n, den: -9n }, { num: 10n, den: 15n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 12n, den: -18n }, { num: -14n, den: 21n }),
			{ num: 0n, den: 1n },
		)
	})

	it('handles very large BigInt values far beyond Number.MAX_SAFE_INTEGER', () => {
		const bigA = (1n << 200n) + 1n
		const bigB = 1n << 200n
		const bigDen = (1n << 180n) * 3n
		assert.deepEqual(
			subtractRationalMemo({ num: bigA, den: bigDen }, { num: bigB, den: bigDen }),
			{ num: 1n, den: bigDen },
		)

		const p = 1000000000000000000000000000033n
		const q = 1000000000000000000000000000057n
		const res = subtractRationalMemo({ num: 1n, den: p }, { num: 1n, den: q })
		assert.deepEqual(res, { num: q - p, den: p * q })
	})

	it('protects memoization cache against caller mutation of returned objects', () => {
		// Precomputed table entry
		const first = subtractRationalMemo({ num: 3n, den: 4n }, { num: 1n, den: 2n })
		assert.deepEqual(first, { num: 1n, den: 4n })
		first.num = 999n
		first.den = 777n
		const second = subtractRationalMemo({ num: 3n, den: 4n }, { num: 1n, den: 2n })
		assert.deepEqual(second, { num: 1n, den: 4n })

		// Dynamically memoized entry (outside precomputed small table)
		const dyn1 = subtractRationalMemo({ num: 17n, den: 101n }, { num: 19n, den: 103n })
		const expected = naiveSubtractOracle({ num: 17n, den: 101n }, { num: 19n, den: 103n })
		assert.deepEqual(dyn1, expected)
		dyn1.num = -12345n
		const dyn2 = subtractRationalMemo({ num: 17n, den: 101n }, { num: 19n, den: 103n })
		assert.deepEqual(dyn2, expected)
	})

	it('remains exact across memoization cache evictions (> 4096 distinct pairs)', () => {
		for (let i = 1; i <= 4500; i++) {
			const a = { num: BigInt(i), den: BigInt(i + 1) }
			const b = { num: BigInt(i - 1), den: BigInt(i + 1) }
			assert.deepEqual(subtractRationalMemo(a, b), { num: 1n, den: BigInt(i + 1) })
		}
		// Re-query an evicted entry and a precomputed entry
		assert.deepEqual(
			subtractRationalMemo({ num: 1n, den: 2n }, { num: 0n, den: 2n }),
			{ num: 1n, den: 2n },
		)
		assert.deepEqual(
			subtractRationalMemo({ num: 4500n, den: 4501n }, { num: 4499n, den: 4501n }),
			{ num: 1n, den: 4501n },
		)
	})

	it('validates inputs and throws TypeError / RangeError for invalid arguments', () => {
		const badTypes = [
			[null, { num: 1n, den: 1n }],
			[undefined, { num: 1n, den: 1n }],
			[{ num: 1n, den: 1n }, null],
			[{ num: 1n, den: 1n }, undefined],
			[42, { num: 1n, den: 1n }],
			['1/2', { num: 1n, den: 1n }],
			[[1n, 2n], { num: 1n, den: 1n }],
			[{ num: 1, den: 2n }, { num: 1n, den: 2n }],
			[{ num: 1n, den: 2 }, { num: 1n, den: 2n }],
			[{ num: 1n, den: 2n }, { num: '1', den: 2n }],
			[{ num: 1n }, { num: 1n, den: 2n }],
			[{}, { num: 1n, den: 2n }],
		]
		for (const [a, b] of badTypes) {
			assert.throws(() => subtractRationalMemo(a, b), TypeError)
		}

		assert.throws(
			() => subtractRationalMemo({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
			RangeError,
		)
		assert.throws(
			() => subtractRationalMemo({ num: 1n, den: 2n }, { num: 0n, den: 0n }),
			RangeError,
		)
	})

	it('cross-checks against independent oracle, algebraic identities, and lowest-terms invariants', () => {
		// Deterministic LCG generating a wide mix of small, medium, negative, and unnormalized rationals
		let state = 0x123456789abcdef1n
		const nextBig = (bound) => {
			state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return state % bound
		}

		const samples = []
		// Include boundary small table values and unnormalized variants
		for (let n = -5; n <= 5; n++) {
			for (let d = 1; d <= 5; d++) {
				samples.push({ num: BigInt(n), den: BigInt(d) })
			}
		}
		for (let i = 0; i < 60; i++) {
			const num = nextBig(2001n) - 1000n
			const rawDen = nextBig(500n) + 1n
			const den = nextBig(2n) === 0n ? rawDen : -rawDen
			samples.push({ num, den })
		}

		for (let i = 0; i < samples.length; i++) {
			const a = samples[i]
			const b = samples[(i * 7 + 3) % samples.length]

			const got = subtractRationalMemo(a, b)
			const oracle = naiveSubtractOracle(a, b)

			// 1. Exact agreement with independent binary-GCD naive oracle
			assert.deepEqual(got, oracle)

			// 2. Canonical lowest-terms invariants
			assert.ok(got.den > 0n, 'denominator must be strictly positive')
			if (got.num === 0n) {
				assert.equal(got.den, 1n, 'zero must have denominator 1n')
			} else {
				assert.equal(
					independentBinaryGcd(got.num, got.den),
					1n,
					'result must be in lowest terms',
				)
			}

			// 3. Cross-multiplication exactness check
			assert.equal(
				got.num * a.den * b.den,
				(a.num * b.den - b.num * a.den) * got.den,
			)

			// 4. Anti-commutativity: (a - b) === -(b - a)
			const rev = subtractRationalMemo(b, a)
			assert.equal(got.num, -rev.num)
			assert.equal(got.den, rev.den)

			// 5. Self-cancellation: a - a === 0/1
			assert.deepEqual(subtractRationalMemo(a, a), { num: 0n, den: 1n })
		}
	})

	it('cross-checks exact dyadic rationals against IEEE-754 floating-point subtraction', () => {
		for (let p = -16; p <= 16; p++) {
			for (let q = -16; q <= 16; q++) {
				const a = { num: BigInt(p), den: 16n }
				const b = { num: BigInt(q), den: 8n }
				const res = subtractRationalMemo(a, b)
				const asFloat = Number(res.num) / Number(res.den)
				const expectedFloat = p / 16 - q / 8
				assert.equal(asFloat, expectedFloat)
			}
		}
	})
})
