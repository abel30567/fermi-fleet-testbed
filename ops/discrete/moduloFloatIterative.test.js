import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloFloatIterative } from './moduloFloatIterative.js'

/**
 * Independent reference implementation of IEEE-754 floored modulo
 * using JavaScript's built-in remainder operator (`%`).
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function referenceFlooredModulo(a, b) {
	let r = a % b
	if (r !== 0 && (r < 0) !== (b < 0)) {
		r += b
		if (r === b) {
			r = 0
		}
	}
	return r === 0 ? 0 : r
}

test('normal positive integers and fractional float64 values', () => {
	assert.equal(moduloFloatIterative(7, 3), 1)
	assert.equal(moduloFloatIterative(9, 3), 0)
	assert.equal(moduloFloatIterative(2, 5), 2)
	assert.equal(moduloFloatIterative(5, 5), 0)
	assert.equal(moduloFloatIterative(5.5, 2), 1.5)
	assert.equal(moduloFloatIterative(10.75, 2.5), 0.75)
	assert.equal(moduloFloatIterative(0.75, 0.25), 0)
	assert.equal(moduloFloatIterative(7.125, 1.5), 1.125)
})

test('negative dividend with positive modulus follows discrete floored modulo', () => {
	assert.equal(moduloFloatIterative(-1, 3), 2)
	assert.equal(moduloFloatIterative(-7, 3), 2)
	assert.equal(moduloFloatIterative(-6, 3), 0)
	assert.equal(moduloFloatIterative(-0.5, 2), 1.5)
	assert.equal(moduloFloatIterative(-7.25, 2.5), 0.25)
	assert.equal(moduloFloatIterative(-2.5, 2.5), 0)
})

test('negative modulus follows floored modulo sign convention', () => {
	assert.equal(moduloFloatIterative(7, -3), -2)
	assert.equal(moduloFloatIterative(-7, -3), -1)
	assert.equal(moduloFloatIterative(6, -3), 0)
	assert.equal(moduloFloatIterative(-6, -3), 0)
	assert.equal(moduloFloatIterative(0.5, -2), -1.5)
	assert.equal(moduloFloatIterative(-0.5, -2), -0.5)
	assert.equal(moduloFloatIterative(2, -5), -3)
	assert.equal(moduloFloatIterative(-2, -5), -2)
})

test('zero and negative zero dividends always return +0', () => {
	for (const a of [0, -0]) {
		for (const b of [1, -1, 3.5, -3.5, Number.MIN_VALUE, Number.MAX_VALUE]) {
			const res = moduloFloatIterative(a, b)
			assert.ok(Object.is(res, 0), `expected +0 for (${a}, ${b}), got ${res}`)
		}
	}
	assert.ok(Object.is(moduloFloatIterative(-6, 3), 0))
	assert.ok(Object.is(moduloFloatIterative(-6, -3), 0))
	assert.ok(Object.is(moduloFloatIterative(6, -3), 0))
})

test('extreme float64 magnitudes and subnormals without overflow or hang', () => {
	assert.equal(moduloFloatIterative(Number.MAX_VALUE, 1), 0)
	assert.equal(moduloFloatIterative(Number.MAX_VALUE, Number.MAX_VALUE), 0)
	assert.equal(moduloFloatIterative(Number.MAX_VALUE, Number.MIN_VALUE), 0)
	assert.equal(
		moduloFloatIterative(Number.MAX_VALUE, 3),
		referenceFlooredModulo(Number.MAX_VALUE, 3),
	)
	assert.equal(
		moduloFloatIterative(-Number.MAX_VALUE, 3),
		referenceFlooredModulo(-Number.MAX_VALUE, 3),
	)
	assert.equal(
		moduloFloatIterative(1e300, 1e-300),
		referenceFlooredModulo(1e300, 1e-300),
	)
	assert.equal(
		moduloFloatIterative(1e308, 0.3),
		referenceFlooredModulo(1e308, 0.3),
	)

	// Subnormal inputs
	const sub1 = Number.MIN_VALUE
	const sub3 = 3 * Number.MIN_VALUE
	const sub7 = 7 * Number.MIN_VALUE
	assert.equal(moduloFloatIterative(sub7, sub3), sub1)
	assert.equal(moduloFloatIterative(-sub1, sub3), 2 * Number.MIN_VALUE)
	assert.equal(moduloFloatIterative(sub3, sub3), 0)

	// Divisor above Number.MAX_VALUE / 2
	const bigB = Number.MAX_VALUE * 0.75
	assert.equal(
		moduloFloatIterative(Number.MAX_VALUE, bigB),
		referenceFlooredModulo(Number.MAX_VALUE, bigB),
	)
})

test('precision edge cases near 0 and modulus boundary', () => {
	// Small positive dividend smaller than ULP of b should not be wiped out
	assert.equal(moduloFloatIterative(1e-17, 1), 1e-17)
	assert.equal(moduloFloatIterative(Number.MIN_VALUE, 1), Number.MIN_VALUE)

	// Tiny negative dividend where (b - |a|) rounds to b must clamp to +0
	const resPos = moduloFloatIterative(-Number.MIN_VALUE, 1)
	assert.ok(Object.is(resPos, 0))
	assert.ok(Object.is(moduloFloatIterative(-1e-20, 1), 0))

	// Symmetric case with negative b and tiny positive dividend
	const resNeg = moduloFloatIterative(Number.MIN_VALUE, -1)
	assert.ok(Object.is(resNeg, 0))
	assert.ok(Object.is(moduloFloatIterative(1e-20, -1), 0))
})

test('invalid input validation throws TypeError or RangeError', () => {
	const nonNumbers = [undefined, null, '5', true, false, 5n, {}, [], Symbol('x')]
	for (const bad of nonNumbers) {
		assert.throws(() => moduloFloatIterative(bad, 2), TypeError)
		assert.throws(() => moduloFloatIterative(2, bad), TypeError)
	}

	const nonFinite = [NaN, Infinity, -Infinity]
	for (const bad of nonFinite) {
		assert.throws(() => moduloFloatIterative(bad, 2), RangeError)
		assert.throws(() => moduloFloatIterative(2, bad), RangeError)
	}

	assert.throws(() => moduloFloatIterative(5, 0), RangeError)
	assert.throws(() => moduloFloatIterative(5, -0), RangeError)
	assert.throws(() => moduloFloatIterative(0, 0), RangeError)
})

test('independent cross-check against JS % reference across deterministic float64 corpus', () => {
	// Deterministic xorshift32 PRNG
	let seed = 0x12345678
	function nextRand() {
		seed ^= seed << 13
		seed ^= seed >>> 17
		seed ^= seed << 5
		return (seed >>> 0) / 0x100000000
	}

	const specialValues = [
		0,
		-0,
		1,
		-1,
		0.1,
		-0.1,
		0.3,
		-0.3,
		Math.PI,
		-Math.E,
		Number.EPSILON,
		-Number.EPSILON,
		Number.MIN_VALUE,
		-Number.MIN_VALUE,
		1e-200,
		-1e-200,
		1e200,
		-1e200,
		Number.MAX_SAFE_INTEGER,
		-Number.MAX_SAFE_INTEGER,
		Number.MAX_VALUE / 2,
		Number.MAX_VALUE,
		-Number.MAX_VALUE,
	]

	for (const a of specialValues) {
		for (const b of specialValues) {
			if (b === 0) continue
			const actual = moduloFloatIterative(a, b)
			const expected = referenceFlooredModulo(a, b)
			assert.ok(
				Object.is(actual, expected),
				`mismatch for (${a}, ${b}): got ${actual}, expected ${expected}`,
			)
			if (b > 0) {
				assert.ok(actual >= 0 && actual < b, `range violation for (${a}, ${b}): ${actual}`)
			} else {
				assert.ok(actual <= 0 && actual > b, `range violation for (${a}, ${b}): ${actual}`)
			}
		}
	}

	// 300 pseudo-random pairs spanning wide exponent ranges and all sign combinations
	for (let i = 0; i < 300; i += 1) {
		const expA = Math.floor(nextRand() * 600) - 300
		const expB = Math.floor(nextRand() * 600) - 300
		const signA = nextRand() < 0.5 ? -1 : 1
		const signB = nextRand() < 0.5 ? -1 : 1
		const a = signA * (0.5 + nextRand()) * 2 ** expA
		const b = signB * (0.5 + nextRand()) * 2 ** expB
		if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) continue

		const actual = moduloFloatIterative(a, b)
		const expected = referenceFlooredModulo(a, b)
		assert.ok(
			Object.is(actual, expected),
			`random mismatch #${i} for (${a}, ${b}): got ${actual}, expected ${expected}`,
		)
	}
})

test('independent cross-check against exact BigInt floored modulo on safe integers', () => {
	function bigIntFlooredMod(a, b) {
		const r = a % b
		if (r !== 0n && (r < 0n) !== (b < 0n)) {
			return r + b
		}
		return r
	}

	const ints = [
		-9007199254740991,
		-1000000007,
		-42,
		-7,
		-1,
		0,
		1,
		7,
		42,
		1000000007,
		9007199254740991,
	]

	for (const a of ints) {
		for (const b of ints) {
			if (b === 0) continue
			const actual = moduloFloatIterative(a, b)
			const expected = Number(bigIntFlooredMod(BigInt(a), BigInt(b)))
			assert.ok(
				Object.is(actual, expected),
				`BigInt mismatch for (${a}, ${b}): got ${actual}, expected ${expected}`,
			)
		}
	}
})
