import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addRationalSeries } from './addRationalSeries.js'

/**
 * Independent reference implementation via naive cross-multiplication
 * followed by full BigInt GCD reduction.
 */
function naiveGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function naiveAddRational(a, b) {
	const rawNum = a.num * b.den + b.num * a.den
	const rawDen = a.den * b.den
	if (rawNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = rawDen < 0n ? -1n : 1n
	const num = rawNum * sign
	const den = rawDen * sign
	const g = naiveGcd(num, den)
	return { num: num / g, den: den / g }
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(naiveGcd(r.num, r.den), 1n)
	}
}

describe('addRationalSeries', () => {
	test('adds fractions with equal denominators (with and without reduction)', () => {
		assert.deepEqual(addRationalSeries({ num: 1n, den: 5n }, { num: 2n, den: 5n }), {
			num: 3n,
			den: 5n,
		})
		assert.deepEqual(addRationalSeries({ num: 1n, den: 6n }, { num: 1n, den: 6n }), {
			num: 1n,
			den: 3n,
		})
		assert.deepEqual(addRationalSeries({ num: 3n, den: 8n }, { num: 5n, den: 8n }), {
			num: 1n,
			den: 1n,
		})
	})

	test('adds fractions with coprime denominators', () => {
		assert.deepEqual(addRationalSeries({ num: 1n, den: 2n }, { num: 1n, den: 3n }), {
			num: 5n,
			den: 6n,
		})
		assert.deepEqual(addRationalSeries({ num: 2n, den: 7n }, { num: 3n, den: 5n }), {
			num: 31n,
			den: 35n,
		})
	})

	test('adds fractions with shared denominator factors requiring post-sum reduction', () => {
		// g = gcd(6, 10) = 2; t = 5 + 3 = 8; h = gcd(8, 2) = 2 => 4/15
		assert.deepEqual(addRationalSeries({ num: 1n, den: 6n }, { num: 1n, den: 10n }), {
			num: 4n,
			den: 15n,
		})
		// g = gcd(6, 10) = 2; t = 25 + 21 = 46; h = 2 => 23/15
		assert.deepEqual(addRationalSeries({ num: 5n, den: 6n }, { num: 7n, den: 10n }), {
			num: 23n,
			den: 15n,
		})
		// g = gcd(12, 18) = 6; t = 15 + 14 = 29; h = 1 => 29/36
		assert.deepEqual(addRationalSeries({ num: 5n, den: 12n }, { num: 7n, den: 18n }), {
			num: 29n,
			den: 36n,
		})
		// g = gcd(12, 18) = 6; t = 15 + 3 = 18; h = 6 => 1/2
		assert.deepEqual(addRationalSeries({ num: 5n, den: 12n }, { num: 1n, den: 12n }), {
			num: 1n,
			den: 2n,
		})
	})

	test('normalizes unreduced inputs and negative denominators', () => {
		assert.deepEqual(addRationalSeries({ num: 2n, den: 4n }, { num: 3n, den: 6n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(addRationalSeries({ num: 1n, den: -2n }, { num: 1n, den: 3n }), {
			num: -1n,
			den: 6n,
		})
		assert.deepEqual(addRationalSeries({ num: -2n, den: -4n }, { num: -3n, den: -6n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(addRationalSeries({ num: 6n, den: -9n }, { num: -10n, den: 15n }), {
			num: -4n,
			den: 3n,
		})
	})

	test('handles signed combinations and additive inverses', () => {
		assert.deepEqual(addRationalSeries({ num: -1n, den: 3n }, { num: 1n, den: 6n }), {
			num: -1n,
			den: 6n,
		})
		assert.deepEqual(addRationalSeries({ num: -1n, den: 2n }, { num: -1n, den: 3n }), {
			num: -5n,
			den: 6n,
		})
		assert.deepEqual(addRationalSeries({ num: 3n, den: 7n }, { num: -3n, den: 7n }), {
			num: 0n,
			den: 1n,
		})
		assert.deepEqual(addRationalSeries({ num: 2n, den: 4n }, { num: 5n, den: -10n }), {
			num: 0n,
			den: 1n,
		})
	})

	test('handles zero (additive identity) and does not mutate or alias inputs', () => {
		const a = { num: 0n, den: 7n }
		const b = { num: 6n, den: 8n }
		const r1 = addRationalSeries(a, b)
		assert.deepEqual(r1, { num: 3n, den: 4n })
		assert.notEqual(r1, b)
		assert.deepEqual(a, { num: 0n, den: 7n })
		assert.deepEqual(b, { num: 6n, den: 8n })

		const r2 = addRationalSeries(b, a)
		assert.deepEqual(r2, { num: 3n, den: 4n })
		assert.notEqual(r2, b)

		assert.deepEqual(addRationalSeries({ num: 0n, den: 1n }, { num: 0n, den: -9n }), {
			num: 0n,
			den: 1n,
		})
	})

	test('handles arbitrarily large BigInt numerators and denominators', () => {
		const bigA = { num: (1n << 200n) + 1n, den: 1n << 199n }
		const bigB = { num: (1n << 200n) - 1n, den: 1n << 199n }
		assert.deepEqual(addRationalSeries(bigA, bigB), { num: 4n, den: 1n })

		const p = 10n ** 60n + 7n
		const q = 10n ** 60n + 9n
		const res = addRationalSeries({ num: 1n, den: p }, { num: 1n, den: q })
		assertLowestTerms(res)
		assert.deepEqual(res, naiveAddRational({ num: 1n, den: p }, { num: 1n, den: q }))
	})

	test('rejects invalid input types and zero denominators', () => {
		const invalidValues = [
			undefined,
			null,
			42,
			'1/2',
			true,
			1n,
			[1n, 2n],
			{},
			{ num: 1n },
			{ den: 2n },
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: 2n },
			{ num: 1n, den: null },
			{ num: NaN, den: 1n },
			{ num: 1n, den: Infinity },
		]

		for (const bad of invalidValues) {
			assert.throws(() => addRationalSeries(bad, { num: 1n, den: 2n }), TypeError)
			assert.throws(() => addRationalSeries({ num: 1n, den: 2n }, bad), TypeError)
		}

		assert.throws(
			() => addRationalSeries({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
			RangeError,
		)
		assert.throws(
			() => addRationalSeries({ num: 1n, den: 2n }, { num: 0n, den: 0n }),
			RangeError,
		)
	})

	test('cross-check: matches naive cross-multiplication and satisfies algebraic laws over grid', () => {
		const samples = [
			{ num: 0n, den: 1n },
			{ num: 1n, den: 2n },
			{ num: -1n, den: 2n },
			{ num: 2n, den: 6n },
			{ num: 5n, den: -12n },
			{ num: 7n, den: 18n },
			{ num: -11n, den: -15n },
			{ num: 13n, den: 24n },
			{ num: 17n, den: 30n },
		]

		for (const a of samples) {
			for (const b of samples) {
				const actual = addRationalSeries(a, b)
				const expected = naiveAddRational(a, b)
				assertLowestTerms(actual)
				assert.deepEqual(actual, expected)
				// Commutativity: a + b == b + a
				assert.deepEqual(actual, addRationalSeries(b, a))
				// Floating-point cross-check
				const approxExpected = Number(a.num) / Number(a.den) + Number(b.num) / Number(b.den)
				const approxActual = Number(actual.num) / Number(actual.den)
				assert.ok(Math.abs(approxActual - approxExpected) < 1e-12)
			}
		}

		// Associativity: (a + b) + c == a + (b + c)
		for (let i = 0; i < 5; i++) {
			const a = samples[i]
			const b = samples[i + 1]
			const c = samples[i + 2]
			assert.deepEqual(
				addRationalSeries(addRationalSeries(a, b), c),
				addRationalSeries(a, addRationalSeries(b, c)),
			)
		}
	})

	test('cross-check: exact closed-form telescoping and geometric series sums', () => {
		// Telescoping series: sum_{k=1}^{N} 1/(k*(k+1)) === N/(N+1)
		let telescoping = { num: 0n, den: 1n }
		const N = 100n
		for (let k = 1n; k <= N; k++) {
			telescoping = addRationalSeries(telescoping, { num: 1n, den: k * (k + 1n) })
		}
		assert.deepEqual(telescoping, { num: N, den: N + 1n })

		// Geometric series: sum_{k=0}^{64} 1/2^k === (2^65 - 1) / 2^64
		let geometric = { num: 0n, den: 1n }
		for (let k = 0n; k <= 64n; k++) {
			geometric = addRationalSeries(geometric, { num: 1n, den: 1n << k })
		}
		assert.deepEqual(geometric, { num: (1n << 65n) - 1n, den: 1n << 64n })
	})
})
