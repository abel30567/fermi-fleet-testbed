import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddRationalStable } from './vectorAddRationalStable.js'

/**
 * Independent reference gcd for test verification.
 */
function refGcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		;[a, b] = [b, a % b]
	}
	return a
}

/**
 * Independent naive cross-multiplication rational addition reference.
 */
function naiveRationalAdd(a, b) {
	let num = a.num * b.den + b.num * a.den
	let den = a.den * b.den
	if (den < 0n) {
		num = -num
		den = -den
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Asserts every rational in a vector is in canonical lowest terms.
 */
function assertCanonicalVector(vec) {
	for (const r of vec) {
		assert.equal(typeof r.num, 'bigint')
		assert.equal(typeof r.den, 'bigint')
		assert.ok(r.den > 0n, `denominator must be > 0n, got ${r.den}`)
		if (r.num === 0n) {
			assert.equal(r.den, 1n, 'zero must be represented as 0n/1n')
		} else {
			assert.equal(refGcd(r.num, r.den), 1n, `${r.num}/${r.den} is not in lowest terms`)
		}
	}
}

test('adds basic rational vectors with coprime and shared denominators', () => {
	const a = [
		{ num: 1n, den: 2n },
		{ num: 1n, den: 6n },
		{ num: 3n, den: 4n },
		{ num: -5n, den: 12n },
	]
	const b = [
		{ num: 1n, den: 3n },
		{ num: 1n, den: 3n },
		{ num: 5n, den: 4n },
		{ num: 7n, den: 18n },
	]

	const res = vectorAddRationalStable(a, b)
	assertCanonicalVector(res)
	assert.deepEqual(res, [
		{ num: 5n, den: 6n },
		{ num: 1n, den: 2n },
		{ num: 2n, den: 1n },
		{ num: -1n, den: 36n },
	])
})

test('handles empty vectors and returns a new array without mutating inputs', () => {
	assert.deepEqual(vectorAddRationalStable([], []), [])

	const a = [{ num: 2n, den: 4n }]
	const b = [{ num: 0n, den: 5n }]
	const aSnapshot = structuredClone(a)
	const bSnapshot = structuredClone(b)

	const res = vectorAddRationalStable(a, b)
	assert.deepEqual(res, [{ num: 1n, den: 2n }])
	assert.deepEqual(a, aSnapshot)
	assert.deepEqual(b, bSnapshot)
	assert.notEqual(res[0], a[0])
	assert.notEqual(res[0], b[0])
})

test('canonicalizes negative denominators, unreduced inputs, and exact zero cancellation', () => {
	const a = [
		{ num: 2n, den: -4n },
		{ num: -6n, den: -9n },
		{ num: 7n, den: 13n },
		{ num: 0n, den: -99n },
		{ num: 10n ** 40n, den: 2n * 10n ** 40n },
	]
	const b = [
		{ num: 3n, den: 6n },
		{ num: 4n, den: -12n },
		{ num: -14n, den: 26n },
		{ num: 0n, den: 42n },
		{ num: -3n * 10n ** 40n, den: 6n * 10n ** 40n },
	]

	const res = vectorAddRationalStable(a, b)
	assertCanonicalVector(res)
	assert.deepEqual(res, [
		{ num: 0n, den: 1n },
		{ num: 1n, den: 3n },
		{ num: 0n, den: 1n },
		{ num: 0n, den: 1n },
		{ num: 0n, den: 1n },
	])
})

test('resists catastrophic cancellation and huge BigInt magnitudes where IEEE-754 fails', () => {
	const huge = 10n ** 100n
	const a = [
		{ num: huge * 7n + 1n, den: 7n },
		{ num: -(huge * 13n) + 5n, den: 13n },
		{ num: 1n, den: huge },
	]
	const b = [
		{ num: -huge, den: 1n },
		{ num: huge, den: 1n },
		{ num: -1n, den: huge + 1n },
	]

	const res = vectorAddRationalStable(a, b)
	assertCanonicalVector(res)
	assert.deepEqual(res, [
		{ num: 1n, den: 7n },
		{ num: 5n, den: 13n },
		{ num: 1n, den: huge * (huge + 1n) },
	])
})

test('validates input types, vector lengths, element shapes, and zero denominators', () => {
	assert.throws(() => vectorAddRationalStable(null, []), TypeError)
	assert.throws(() => vectorAddRationalStable([], undefined), TypeError)
	assert.throws(() => vectorAddRationalStable('abc', []), TypeError)
	assert.throws(() => vectorAddRationalStable({}, []), TypeError)

	assert.throws(
		() => vectorAddRationalStable([{ num: 1n, den: 2n }], []),
		RangeError
	)

	assert.throws(() => vectorAddRationalStable([null], [{ num: 1n, den: 1n }]), TypeError)
	assert.throws(
		() => vectorAddRationalStable([{ num: 1, den: 2n }], [{ num: 1n, den: 2n }]),
		TypeError
	)
	assert.throws(
		() => vectorAddRationalStable([{ num: 1n, den: 2n }], [{ num: 1n, den: 2 }]),
		TypeError
	)
	assert.throws(
		() => vectorAddRationalStable(new Array(1), [{ num: 1n, den: 1n }]),
		TypeError
	)

	assert.throws(
		() => vectorAddRationalStable([{ num: 1n, den: 0n }], [{ num: 1n, den: 2n }]),
		RangeError
	)
	assert.throws(
		() => vectorAddRationalStable([{ num: 1n, den: 2n }], [{ num: 0n, den: 0n }]),
		RangeError
	)
})

test('cross-check: matches independent naive cross-multiplication over deterministic pseudo-random vectors', () => {
	let seed = 0x5eed123456789abcn
	const nextBigInt = (bound) => {
		seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
		return seed % bound
	}

	const len = 100
	const a = []
	const b = []
	for (let i = 0; i < len; i++) {
		const commonFactor = 1n + nextBigInt(60n)
		const numA = (nextBigInt(20001n) - 10000n) * commonFactor
		const denA = (nextBigInt(500n) + 1n) * commonFactor * (i % 5 === 0 ? -1n : 1n)
		const numB = (nextBigInt(20001n) - 10000n) * commonFactor
		const denB = (nextBigInt(500n) + 1n) * commonFactor * (i % 7 === 0 ? -1n : 1n)
		a.push({ num: numA, den: denA })
		b.push({ num: numB, den: denB })
	}

	const actual = vectorAddRationalStable(a, b)
	assertCanonicalVector(actual)

	const expected = a.map((ra, idx) => naiveRationalAdd(ra, b[idx]))
	assert.deepEqual(actual, expected)
})

test('cross-check: satisfies vector-space laws (commutativity, associativity, identity, inverse) and float agreement', () => {
	const a = [
		{ num: 3n, den: 7n },
		{ num: -11n, den: 15n },
		{ num: 22n, den: 35n },
		{ num: 0n, den: 3n },
	]
	const b = [
		{ num: -5n, den: 14n },
		{ num: 4n, den: 9n },
		{ num: 13n, den: 21n },
		{ num: 7n, den: -8n },
	]
	const c = [
		{ num: 1n, den: 6n },
		{ num: 7n, den: 45n },
		{ num: -19n, den: 105n },
		{ num: 3n, den: 4n },
	]
	const zero = a.map(() => ({ num: 0n, den: 1n }))
	const negA = a.map(({ num, den }) => ({ num: -num, den }))

	// Commutativity: a + b === b + a
	assert.deepEqual(vectorAddRationalStable(a, b), vectorAddRationalStable(b, a))

	// Associativity: (a + b) + c === a + (b + c)
	assert.deepEqual(
		vectorAddRationalStable(vectorAddRationalStable(a, b), c),
		vectorAddRationalStable(a, vectorAddRationalStable(b, c))
	)

	// Additive identity: a + 0 === normalize(a)
	assert.deepEqual(
		vectorAddRationalStable(a, zero),
		vectorAddRationalStable(zero, a)
	)

	// Additive inverse: a + (-a) === 0
	assert.deepEqual(vectorAddRationalStable(a, negA), zero)

	// Independent IEEE-754 floating-point agreement on moderate values
	const sumAB = vectorAddRationalStable(a, b)
	for (let i = 0; i < a.length; i++) {
		const approx = Number(sumAB[i].num) / Number(sumAB[i].den)
		const floatSum = Number(a[i].num) / Number(a[i].den) + Number(b[i].num) / Number(b[i].den)
		assert.ok(
			Math.abs(approx - floatSum) < 1e-12,
			`index ${i}: exact ${approx} differed from float ${floatSum}`
		)
	}
})
