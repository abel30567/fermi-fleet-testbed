import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addBigIntIterative } from './addBigIntIterative.js'

/**
 * Independent decimal-string addition for unsigned integer strings.
 * Used to cross-check BigInt arithmetic without relying on BigInt `+`.
 *
 * @param {string} aStr
 * @param {string} bStr
 * @returns {string}
 */
function addUnsignedDecimalStrings(aStr, bStr) {
	let i = aStr.length - 1
	let j = bStr.length - 1
	let carry = 0
	const digits = []

	while (i >= 0 || j >= 0 || carry > 0) {
		const da = i >= 0 ? aStr.charCodeAt(i--) - 48 : 0
		const db = j >= 0 ? bStr.charCodeAt(j--) - 48 : 0
		const sum = da + db + carry
		digits.push(String(sum % 10))
		carry = Math.floor(sum / 10)
	}

	digits.reverse()
	return digits.join('').replace(/^0+(?=\d)/, '')
}

/**
 * Independent decimal-string subtraction for unsigned integer strings (`aStr >= bStr`).
 *
 * @param {string} aStr
 * @param {string} bStr
 * @returns {string}
 */
function subUnsignedDecimalStrings(aStr, bStr) {
	let i = aStr.length - 1
	let j = bStr.length - 1
	let borrow = 0
	const digits = []

	while (i >= 0 || j >= 0) {
		const da = i >= 0 ? aStr.charCodeAt(i--) - 48 : 0
		const db = j >= 0 ? bStr.charCodeAt(j--) - 48 : 0
		let diff = da - db - borrow
		if (diff < 0) {
			diff += 10
			borrow = 1
		} else {
			borrow = 0
		}
		digits.push(String(diff))
	}

	digits.reverse()
	return digits.join('').replace(/^0+(?=\d)/, '')
}

/**
 * Compares two unsigned decimal strings numerically.
 *
 * @param {string} aStr
 * @param {string} bStr
 * @returns {number}
 */
function compareUnsignedDecimalStrings(aStr, bStr) {
	const a = aStr.replace(/^0+(?=\d)/, '')
	const b = bStr.replace(/^0+(?=\d)/, '')
	if (a.length !== b.length) return a.length < b.length ? -1 : 1
	if (a === b) return 0
	return a < b ? -1 : 1
}

/**
 * Independent signed decimal-string addition.
 *
 * @param {string} aStr
 * @param {string} bStr
 * @returns {string}
 */
function addSignedDecimalStrings(aStr, bStr) {
	const aNeg = aStr.startsWith('-')
	const bNeg = bStr.startsWith('-')
	const aMag = aNeg ? aStr.slice(1) : aStr
	const bMag = bNeg ? bStr.slice(1) : bStr

	if (aNeg === bNeg) {
		const mag = addUnsignedDecimalStrings(aMag, bMag)
		return mag === '0' ? '0' : aNeg ? `-${mag}` : mag
	}

	const cmp = compareUnsignedDecimalStrings(aMag, bMag)
	if (cmp === 0) return '0'
	if (cmp > 0) {
		const mag = subUnsignedDecimalStrings(aMag, bMag)
		return aNeg ? `-${mag}` : mag
	}
	const mag = subUnsignedDecimalStrings(bMag, aMag)
	return bNeg ? `-${mag}` : mag
}

describe('addBigIntIterative', () => {
	test('adds normal positive BigInt pairs', () => {
		assert.equal(addBigIntIterative(2n, 3n), 5n)
		assert.equal(addBigIntIterative(100n, 250n), 350n)
		assert.equal(addBigIntIterative(123456789n, 987654321n), 1111111110n)
	})

	test('supports 3 or more BigInt arguments iteratively', () => {
		assert.equal(addBigIntIterative(1n, 2n, 3n, 4n, 5n), 15n)
		assert.equal(addBigIntIterative(10n, -3n, 7n, -20n, 6n), 0n)
		assert.equal(
			addBigIntIterative(1n << 130n, -(1n << 129n), 42n, -42n),
			1n << 129n
		)
	})

	test('handles fixed-point BigInt values scaled by 10^18', () => {
		const SCALE = 10n ** 18n
		const onePointFive = 15n * 10n ** 17n
		const twoPointTwoFive = 225n * 10n ** 16n
		const expected = 375n * 10n ** 16n

		assert.equal(addBigIntIterative(onePointFive, twoPointTwoFive), expected)
		assert.equal(addBigIntIterative(SCALE, -onePointFive), -5n * 10n ** 17n)
	})

	test('handles zero edge cases', () => {
		assert.equal(addBigIntIterative(0n, 0n), 0n)
		assert.equal(addBigIntIterative(0n, 42n), 42n)
		assert.equal(addBigIntIterative(42n, 0n), 42n)
		assert.equal(addBigIntIterative(0n, -42n), -42n)
		assert.equal(addBigIntIterative(-42n, 0n), -42n)
		assert.equal(addBigIntIterative(0n, 0n, 0n), 0n)
	})

	test('handles negative values and sign cancellation', () => {
		assert.equal(addBigIntIterative(-5n, -7n), -12n)
		assert.equal(addBigIntIterative(10n, -4n), 6n)
		assert.equal(addBigIntIterative(-10n, 4n), -6n)
		assert.equal(addBigIntIterative(4n, -10n), -6n)
		assert.equal(addBigIntIterative(-4n, 10n), 6n)
		assert.equal(addBigIntIterative(999999n, -999999n), 0n)
		assert.equal(addBigIntIterative(-999999n, 999999n), 0n)
	})

	test('handles 64-bit limb boundary carries and borrows', () => {
		const max64 = (1n << 64n) - 1n
		const bit64 = 1n << 64n
		const max128 = (1n << 128n) - 1n
		const bit128 = 1n << 128n
		const max256 = (1n << 256n) - 1n
		const bit256 = 1n << 256n

		assert.equal(addBigIntIterative(max64, 1n), bit64)
		assert.equal(addBigIntIterative(bit64, -1n), max64)
		assert.equal(addBigIntIterative(-max64, -1n), -bit64)
		assert.equal(addBigIntIterative(-bit64, 1n), -max64)
		assert.equal(addBigIntIterative(max128, 1n), bit128)
		assert.equal(addBigIntIterative(bit128, -1n), max128)
		assert.equal(addBigIntIterative(max256, 1n), bit256)
		assert.equal(addBigIntIterative(bit256, -1n), max256)
		assert.equal(addBigIntIterative(max64, max64), (1n << 65n) - 2n)
	})

	test('handles very large BigInts (> 2^128 and > 2^256)', () => {
		const a = (1n << 160n) + 0x123456789abcdef0123456789abcdef0n
		const b = (1n << 160n) + 0xfedcba9876543210fedcba9876543210n
		const c = -(1n << 300n) - 9876543210987654321098765432109876543210n
		const d = (1n << 300n) + 1234567890123456789012345678901234567890n

		assert.equal(addBigIntIterative(a, b), a + b)
		assert.equal(addBigIntIterative(c, d), c + d)
		assert.equal(addBigIntIterative(a, c), a + c)
		assert.equal(addBigIntIterative(-a, -b), -a + -b)
	})

	test('throws TypeError for invalid non-BigInt inputs or missing arguments', () => {
		assert.throws(() => addBigIntIterative(), TypeError)
		assert.throws(() => addBigIntIterative(1n), TypeError)

		const invalidValues = [
			0,
			1,
			-42,
			1.5,
			NaN,
			Infinity,
			'1',
			'1n',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('s'),
			Object(1n),
		]

		for (const bad of invalidValues) {
			assert.throws(() => addBigIntIterative(bad, 1n), TypeError)
			assert.throws(() => addBigIntIterative(1n, bad), TypeError)
			assert.throws(() => addBigIntIterative(1n, 2n, bad), TypeError)
		}
	})

	test('cross-checks against independent decimal-string addition and native + operator', () => {
		const pairs = [
			['0', '0'],
			['1', '-1'],
			['340282366920938463463374607431768211456', '1'], // 2^128 + 1
			['340282366920938463463374607431768211456', '-1'], // 2^128 - 1
			[
				'99999999999999999999999999999999999999999999999999',
				'1',
			],
			[
				'-99999999999999999999999999999999999999999999999999',
				'-88888888888888888888888888888888888888888888888888',
			],
			[
				'115792089237316195423570985008687907853269984665640564039457584007913129639935',
				'-57896044618658097711785492504343953926634992332820282019728792003956564819968',
			],
			[
				'-123456789012345678901234567890123456789012345678901234567890',
				'987654321098765432109876543210987654321098765432109876543210',
			],
		]

		for (const [aStr, bStr] of pairs) {
			const a = BigInt(aStr)
			const b = BigInt(bStr)
			const actual = addBigIntIterative(a, b)
			const expectedFromDecimal = BigInt(addSignedDecimalStrings(aStr, bStr))
			const expectedFromNative = a + b

			assert.equal(actual, expectedFromDecimal)
			assert.equal(actual, expectedFromNative)
		}

		// Deterministic pseudo-random fuzz cross-check against native `+`
		let state = 0x9e3779b97f4a7c15n
		const nextBigInt = (limbs) => {
			let value = 0n
			for (let k = 0; k < limbs; k++) {
				state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
				value = (value << 64n) | state
			}
			const neg = (state & 1n) === 1n
			return neg ? -value : value
		}

		for (let i = 0; i < 60; i++) {
			const a = nextBigInt((i % 5) + 1)
			const b = nextBigInt(((i + 2) % 5) + 1)
			const c = nextBigInt(((i + 3) % 4) + 1)

			assert.equal(addBigIntIterative(a, b), a + b)
			assert.equal(addBigIntIterative(b, a), a + b)
			assert.equal(addBigIntIterative(a, b, c), a + b + c)
		}
	})
})
