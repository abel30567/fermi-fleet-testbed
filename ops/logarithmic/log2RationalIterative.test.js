import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { log2RationalIterative } from './log2RationalIterative.js'

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

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint', 'num must be BigInt')
	assert.equal(typeof r.den, 'bigint', 'den must be BigInt')
	assert.ok(r.den > 0n, `den must be > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `result ${r.num}/${r.den} is not in lowest terms`)
}

function rationalToNumber({ num, den }) {
	// Scale carefully to preserve full IEEE-754 precision even for large BigInts
	const sign = num < 0n ? -1 : 1
	const absNum = num < 0n ? -num : num
	if (absNum === 0n) return 0
	const shift = 60n
	const scaled = (absNum << shift) / den
	return sign * (Number(scaled) / Number(1n << shift))
}

function rationalAdd(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const d = gcd(num, den)
	return { num: num / d, den: den / d }
}

function rationalSub(a, b) {
	return rationalAdd(a, { num: -b.num, den: b.den })
}

function rationalAbsDiffLessThan(a, b, maxNum, maxDen) {
	const diff = rationalSub(a, b)
	const absNum = diff.num < 0n ? -diff.num : diff.num
	return absNum * maxDen < maxNum * diff.den
}

/**
 * Independent computation of ln(num / den) via scaled atanh Taylor series:
 * ln(x) = 2 * sum_{j=0..N} t^(2j+1) / (2j+1), where t = (x - 1) / (x + 1).
 * Used to cross-check log2(x) = ln(x) / ln(2) beyond IEEE-754 double precision.
 */
function independentLog2Fixed(num, den, fracBits) {
	const workBits = BigInt(fracBits + 48)
	const scale = 1n << workBits

	function lnScaled(p, q) {
		// Range-reduce p/q into [1, 2) by counting powers of 2 if needed; caller passes in (1, 2]
		// t = (p - q) / (p + q) in (0, 1/3]
		const tNum = p - q
		const tDen = p + q
		let term = (tNum * scale) / tDen
		let sum = term
		const tNumSq = tNum * tNum
		const tDenSq = tDen * tDen
		for (let k = 3n; term > 0n; k += 2n) {
			term = (term * tNumSq) / tDenSq
			const contrib = term / k
			if (contrib === 0n) break
			sum += contrib
		}
		return sum * 2n
	}

	const ln2 = lnScaled(2n, 1n)
	const lnX = lnScaled(num, den)
	return (lnX << BigInt(fracBits)) / ln2
}

describe('log2RationalIterative', () => {
	test('exact integer powers of 2 (positive, zero, and negative exponents)', () => {
		const cases = [
			[{ num: 1n, den: 1n }, 0n],
			[{ num: 2n, den: 1n }, 1n],
			[{ num: 4n, den: 1n }, 2n],
			[{ num: 8n, den: 1n }, 3n],
			[{ num: 1024n, den: 1n }, 10n],
			[{ num: 1n, den: 2n }, -1n],
			[{ num: 1n, den: 4n }, -2n],
			[{ num: 1n, den: 16n }, -4n],
			[{ num: 1n, den: 1024n }, -10n],
			[{ num: 1n << 256n, den: 1n }, 256n],
			[{ num: 1n, den: 1n << 256n }, -256n],
		]

		for (const [input, expectedInt] of cases) {
			const res = log2RationalIterative(input)
			assertLowestTerms(res)
			assert.deepEqual(res, { num: expectedInt, den: 1n })
		}
	})

	test('unreduced and double-negative positive rational inputs', () => {
		assert.deepEqual(log2RationalIterative({ num: 24n, den: 3n }), { num: 3n, den: 1n })
		assert.deepEqual(log2RationalIterative({ num: 3n, den: 12n }), { num: -2n, den: 1n })
		assert.deepEqual(log2RationalIterative({ num: -8n, den: -2n }), { num: 2n, den: 1n })
		assert.deepEqual(log2RationalIterative({ num: -5n, den: -5n }), { num: 0n, den: 1n })

		const a = log2RationalIterative({ num: 3n, den: 5n })
		const b = log2RationalIterative({ num: 21n, den: 35n })
		const c = log2RationalIterative({ num: -9n, den: -15n })
		assert.deepEqual(a, b)
		assert.deepEqual(a, c)
	})

	test('normal cases and fractions < 1 cross-checked against Math.log2', () => {
		const rationals = [
			{ num: 3n, den: 1n },
			{ num: 5n, den: 1n },
			{ num: 10n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 5n, den: 4n },
			{ num: 7n, den: 4n },
			{ num: 2n, den: 3n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 10n },
			{ num: 7n, den: 13n },
			{ num: 100n, den: 3n },
			{ num: 3n, den: 1000n },
			{ num: 999999n, den: 1000000n },
			{ num: 1000001n, den: 1000000n },
		]

		for (const q of rationals) {
			const res = log2RationalIterative(q)
			assertLowestTerms(res)
			const approx = rationalToNumber(res)
			const expected = Math.log2(Number(q.num) / Number(q.den))
			assert.ok(
				Math.abs(approx - expected) < 1e-15,
				`log2(${q.num}/${q.den}): got ${approx}, expected ${expected}`
			)
		}
	})

	test('algebraic identities: product, quotient, reciprocal, power, and monotonicity', () => {
		const tolNum = 1n
		const tolDen = 1n << 60n

		// Product identity: log2(a * b) = log2(a) + log2(b)
		const pairs = [
			[{ num: 3n, den: 2n }, { num: 5n, den: 7n }],
			[{ num: 11n, den: 3n }, { num: 13n, den: 17n }],
			[{ num: 1n, den: 9n }, { num: 27n, den: 5n }],
		]
		for (const [a, b] of pairs) {
			const prod = { num: a.num * b.num, den: a.den * b.den }
			const lhs = log2RationalIterative(prod)
			const rhs = rationalAdd(log2RationalIterative(a), log2RationalIterative(b))
			assert.ok(
				rationalAbsDiffLessThan(lhs, rhs, tolNum, tolDen),
				`log2(a*b) !== log2(a) + log2(b)`
			)

			// Quotient identity: log2(a / b) = log2(a) - log2(b)
			const quot = { num: a.num * b.den, den: a.den * b.num }
			const lhsQ = log2RationalIterative(quot)
			const rhsQ = rationalSub(log2RationalIterative(a), log2RationalIterative(b))
			assert.ok(
				rationalAbsDiffLessThan(lhsQ, rhsQ, tolNum, tolDen),
				`log2(a/b) !== log2(a) - log2(b)`
			)
		}

		// Reciprocal identity: log2(1/a) = -log2(a)
		const a = { num: 17n, den: 23n }
		const invA = { num: 23n, den: 17n }
		const sumInv = rationalAdd(log2RationalIterative(a), log2RationalIterative(invA))
		assert.ok(rationalAbsDiffLessThan(sumInv, { num: 0n, den: 1n }, tolNum, tolDen))

		// Power identity: log2(a^5) = 5 * log2(a)
		const base = { num: 7n, den: 3n }
		const pow5 = { num: 7n ** 5n, den: 3n ** 5n }
		const logPow = log2RationalIterative(pow5)
		const logBase = log2RationalIterative(base)
		const scaledBase = { num: logBase.num * 5n, den: logBase.den }
		assert.ok(rationalAbsDiffLessThan(logPow, scaledBase, 1n, 1n << 58n))

		// Monotonicity
		const ordered = [
			{ num: 1n, den: 100n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 2n },
			{ num: 2n, den: 3n },
			{ num: 1n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 2n, den: 1n },
			{ num: 10n, den: 3n },
		]
		for (let i = 0; i < ordered.length - 1; i++) {
			const r1 = log2RationalIterative(ordered[i])
			const r2 = log2RationalIterative(ordered[i + 1])
			assert.ok(r1.num * r2.den < r2.num * r1.den, 'log2 must be strictly increasing')
		}
	})

	test('high-precision cross-check against independent atanh ln(x)/ln(2) computation (128 bits)', () => {
		const precision = 128
		const targets = [
			{ num: 3n, den: 2n },
			{ num: 5n, den: 3n },
			{ num: 7n, den: 4n },
			{ num: 11n, den: 10n },
		]

		for (const q of targets) {
			const res = log2RationalIterative(q, precision)
			assertLowestTerms(res)
			const independentScaled = independentLog2Fixed(q.num, q.den, precision)
			const independentRat = { num: independentScaled, den: 1n << BigInt(precision) }
			assert.ok(
				rationalAbsDiffLessThan(res, independentRat, 2n, 1n << BigInt(precision)),
				`128-bit mismatch for ${q.num}/${q.den}`
			)
		}
	})

	test('handles very large rational numerators and denominators accurately', () => {
		const big = { num: 3n ** 100n, den: 5n ** 100n }
		const res = log2RationalIterative(big, 80)
		assertLowestTerms(res)
		const expected = 100 * (Math.log2(3) - Math.log2(5))
		assert.ok(Math.abs(rationalToNumber(res) - expected) < 1e-13)
	})

	test('input validation: throws RangeError on non-positive rationals and zero denominator', () => {
		const invalidValues = [
			{ num: 0n, den: 1n },
			{ num: 0n, den: -5n },
			{ num: -1n, den: 1n },
			{ num: 1n, den: -1n },
			{ num: -3n, den: 4n },
			{ num: 3n, den: -4n },
			{ num: 1n, den: 0n },
			{ num: 0n, den: 0n },
			{ num: -1n, den: 0n },
		]
		for (const bad of invalidValues) {
			assert.throws(() => log2RationalIterative(bad), RangeError)
		}
	})

	test('input validation: throws TypeError on malformed rational inputs', () => {
		const badTypes = [
			null,
			undefined,
			2,
			'2',
			true,
			{},
			{ num: 2, den: 1 },
			{ num: 2n, den: 1 },
			{ num: 2, den: 1n },
			{ num: 2n },
			{ den: 1n },
		]
		for (const bad of badTypes) {
			assert.throws(() => log2RationalIterative(bad), TypeError)
		}
	})

	test('input validation: precisionBits parameter validation', () => {
		const valid = { num: 3n, den: 2n }
		for (const badType of ['64', 64n, null, {}, true]) {
			assert.throws(() => log2RationalIterative(valid, badType), TypeError)
		}
		for (const badRange of [0, -1, -64, 1.5, NaN, Infinity, -Infinity]) {
			assert.throws(() => log2RationalIterative(valid, badRange), RangeError)
		}
	})
})
