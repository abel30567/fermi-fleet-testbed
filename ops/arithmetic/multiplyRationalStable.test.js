import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyRationalStable } from './multiplyRationalStable.js'

function absBigInt(x) {
	return x < 0n ? -x : x
}

function refGcd(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Independent reference implementation via direct naive multiplication
 * followed by post-hoc sign canonicalization and GCD reduction.
 */
function naiveMultiplyRational(a, b) {
	const rawNum = a.num * b.num
	const rawDen = a.den * b.den
	if (rawNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const signedNum = rawDen < 0n ? -rawNum : rawNum
	const posDen = rawDen < 0n ? -rawDen : rawDen
	const g = refGcd(signedNum, posDen)
	return { num: signedNum / g, den: posDen / g }
}

/**
 * Independent exact rational addition for distributivity cross-checks.
 */
function addRational(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const signedNum = den < 0n ? -num : num
	const posDen = den < 0n ? -den : den
	const g = refGcd(signedNum, posDen)
	return { num: signedNum / g, den: posDen / g }
}

function assertCanonicalLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(refGcd(r.num, r.den), 1n, `not in lowest terms: ${r.num}/${r.den}`)
	}
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
			multiplyRationalStable({ num: 6n, den: 8n }, { num: 10n, den: 15n }),
			{ num: 1n, den: 2n },
		)
	})

	test('canonicalizes signs across all sign combinations', () => {
		assert.deepEqual(
			multiplyRationalStable({ num: -2n, den: 3n }, { num: 3n, den: 4n }),
			{ num: -1n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 2n, den: -3n }, { num: 3n, den: 4n }),
			{ num: -1n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 2n, den: -3n }, { num: 3n, den: -4n }),
			{ num: 1n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: -2n, den: -3n }, { num: -3n, den: -4n }),
			{ num: 1n, den: 2n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: -7n, den: 9n }, { num: 12n, den: -14n }),
			{ num: 2n, den: 3n },
		)
	})

	test('handles zero, multiplicative identity, and multiplicative inverses', () => {
		assert.deepEqual(
			multiplyRationalStable({ num: 0n, den: 5n }, { num: 7n, den: 11n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 7n, den: -11n }, { num: 0n, den: -99n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: 14n, den: 21n }, { num: 1n, den: 1n }),
			{ num: 2n, den: 3n },
		)
		assert.deepEqual(
			multiplyRationalStable({ num: -17n, den: 23n }, { num: -23n, den: 17n }),
			{ num: 1n, den: 1n },
		)
	})

	test('handles huge BigInt values and worst-case Fibonacci GCD pairs without overflow', () => {
		// Consecutive large Fibonacci numbers (worst case for Euclidean GCD steps)
		let f0 = 1n
		let f1 = 1n
		for (let i = 0; i < 2000; i++) {
			const next = f0 + f1
			f0 = f1
			f1 = next
		}
		const a = { num: f0, den: f1 }
		const b = { num: f1, den: f0 }
		const prod = multiplyRationalStable(a, b)
		assert.deepEqual(prod, { num: 1n, den: 1n })
		assertCanonicalLowestTerms(prod)

		// Large coprime powers with cross-cancellable factors
		const p2 = 2n ** 1024n
		const p3 = 3n ** 600n
		const p5 = 5n ** 400n
		const p7 = 7n ** 300n
		const res = multiplyRationalStable(
			{ num: p2 * p5, den: p3 * p7 },
			{ num: p3 * p3, den: p2 * p5 * p5 },
		)
		assert.deepEqual(res, { num: p3, den: p5 * p7 })
		assertCanonicalLowestTerms(res)
	})

	test('does not mutate input objects', () => {
		const a = Object.freeze({ num: -6n, den: -8n })
		const b = Object.freeze({ num: 10n, den: -15n })
		const res = multiplyRationalStable(a, b)
		assert.deepEqual(res, { num: -1n, den: 2n })
		assert.deepEqual(a, { num: -6n, den: -8n })
		assert.deepEqual(b, { num: 10n, den: -15n })
	})

	test('validates inputs strictly and throws on invalid types or zero denominators', () => {
		// Zero denominator (including when the other operand is zero)
		assert.throws(() => multiplyRationalStable({ num: 1n, den: 0n }, { num: 1n, den: 2n }), RangeError)
		assert.throws(() => multiplyRationalStable({ num: 1n, den: 2n }, { num: 1n, den: 0n }), RangeError)
		assert.throws(() => multiplyRationalStable({ num: 0n, den: 1n }, { num: 1n, den: 0n }), RangeError)
		assert.throws(() => multiplyRationalStable({ num: 0n, den: 0n }, { num: 0n, den: 1n }), RangeError)

		// Non-object or malformed inputs
		const badInputs = [
			null,
			undefined,
			42,
			42n,
			'1/2',
			[1n, 2n],
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: 1, den: 2 },
			{ num: '1', den: '2' },
			{ num: 1n },
			{ den: 2n },
		]
		for (const bad of badInputs) {
			assert.throws(() => multiplyRationalStable(bad, { num: 1n, den: 2n }), TypeError)
			assert.throws(() => multiplyRationalStable({ num: 1n, den: 2n }, bad), TypeError)
			assert.throws(() => multiplyRationalStable({ num: 0n, den: 1n }, bad), TypeError)
		}
	})

	test('independent cross-check against naive reduction, algebraic laws, and IEEE-754 float values', () => {
		// Deterministic PRNG (LCG) for reproducible randomized property testing
		let seed = 0x5deece66dn
		const nextBig = (bits) => {
			let acc = 0n
			for (let i = 0; i < bits; i += 24) {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
				acc = (acc << 24n) | (seed >> 40n)
			}
			return acc
		}
		const randomRational = (bits) => {
			const signNum = (nextBig(4) & 1n) === 0n ? 1n : -1n
			const signDen = (nextBig(4) & 1n) === 0n ? 1n : -1n
			const num = signNum * nextBig(bits)
			const den = signDen * (nextBig(bits) + 1n)
			return { num, den }
		}

		// 1. Cross-check against naive multiplication + post-hoc GCD and cross-multiplication identity
		for (let i = 0; i < 200; i++) {
			const bits = i < 100 ? 48 : 256
			const a = randomRational(bits)
			const b = randomRational(bits)
			const actual = multiplyRationalStable(a, b)
			const expected = naiveMultiplyRational(a, b)

			assertCanonicalLowestTerms(actual)
			assert.deepEqual(actual, expected)
			// Cross-multiplication exactness identity: actual.num * a.den * b.den === actual.den * a.num * b.num
			assert.equal(actual.num * a.den * b.den, actual.den * a.num * b.num)
		}

		// 2. Algebraic laws: commutativity, associativity, distributivity
		for (let i = 0; i < 50; i++) {
			const a = randomRational(64)
			const b = randomRational(64)
			const c = randomRational(64)

			// Commutativity
			assert.deepEqual(multiplyRationalStable(a, b), multiplyRationalStable(b, a))
			// Associativity
			assert.deepEqual(
				multiplyRationalStable(multiplyRationalStable(a, b), c),
				multiplyRationalStable(a, multiplyRationalStable(b, c)),
			)
			// Distributivity: a * (b + c) === (a * b) + (a * c)
			assert.deepEqual(
				multiplyRationalStable(a, addRational(b, c)),
				addRational(multiplyRationalStable(a, b), multiplyRationalStable(a, c)),
			)
		}

		// 3. Independent floating-point magnitude cross-check for representable rationals
		for (let i = 0; i < 50; i++) {
			const a = randomRational(20)
			const b = randomRational(20)
			const res = multiplyRationalStable(a, b)
			const exactAsFloat = Number(res.num) / Number(res.den)
			const floatProduct = (Number(a.num) / Number(a.den)) * (Number(b.num) / Number(b.den))
			const tol = Math.max(1e-12, Math.abs(floatProduct) * 1e-12)
			assert.ok(
				Math.abs(exactAsFloat - floatProduct) <= tol,
				`float mismatch: ${exactAsFloat} vs ${floatProduct}`,
			)
		}
	})
})
