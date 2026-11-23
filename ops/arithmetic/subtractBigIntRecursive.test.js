import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { subtractBigIntRecursive } from './subtractBigIntRecursive.js'

const SCALE_1E18 = 10n ** 18n

/**
 * Independent decimal-string subtraction of two non-negative integer strings
 * where `aStr >= bStr` numerically, without using BigInt subtraction.
 */
function decimalSubNonNeg(aStr, bStr) {
	let i = aStr.length - 1
	let j = bStr.length - 1
	let borrow = 0
	const digits = []

	while (i >= 0) {
		let d = aStr.charCodeAt(i) - 48 - borrow - (j >= 0 ? bStr.charCodeAt(j) - 48 : 0)
		if (d < 0) {
			d += 10
			borrow = 1
		} else {
			borrow = 0
		}
		digits.push(String.fromCharCode(48 + d))
		i -= 1
		j -= 1
	}

	while (digits.length > 1 && digits[digits.length - 1] === '0') {
		digits.pop()
	}
	return digits.reverse().join('')
}

/**
 * Independent decimal-string addition of two non-negative integer strings.
 */
function decimalAddNonNeg(aStr, bStr) {
	let i = aStr.length - 1
	let j = bStr.length - 1
	let carry = 0
	const digits = []

	while (i >= 0 || j >= 0 || carry > 0) {
		const da = i >= 0 ? aStr.charCodeAt(i) - 48 : 0
		const db = j >= 0 ? bStr.charCodeAt(j) - 48 : 0
		const sum = da + db + carry
		digits.push(String.fromCharCode(48 + (sum % 10)))
		carry = Math.floor(sum / 10)
		i -= 1
		j -= 1
	}

	return digits.reverse().join('')
}

/**
 * Independent signed decimal-string subtraction used as an external oracle.
 */
function decimalSubtractOracle(a, b) {
	const aNeg = a < 0n
	const bNeg = b < 0n
	const absA = (aNeg ? -a : a).toString(10)
	const absB = (bNeg ? -b : b).toString(10)

	const cmpAbs = (x, y) => {
		if (x.length !== y.length) return x.length > y.length ? 1 : -1
		if (x === y) return 0
		return x > y ? 1 : -1
	}

	if (!aNeg && !bNeg) {
		const c = cmpAbs(absA, absB)
		if (c === 0) return '0'
		return c > 0 ? decimalSubNonNeg(absA, absB) : `-${decimalSubNonNeg(absB, absA)}`
	}
	if (aNeg && bNeg) {
		const c = cmpAbs(absB, absA)
		if (c === 0) return '0'
		return c > 0 ? decimalSubNonNeg(absB, absA) : `-${decimalSubNonNeg(absA, absB)}`
	}
	if (!aNeg && bNeg) {
		const res = decimalAddNonNeg(absA, absB)
		return res === '0' ? '0' : res
	}
	const res = decimalAddNonNeg(absA, absB)
	return res === '0' ? '0' : `-${res}`
}

/**
 * Deterministic PRNG (xorshift64*) producing reproducible BigInt test inputs.
 */
function createRng(seed) {
	let state = seed
	const mask64 = (1n << 64n) - 1n
	return {
		next64() {
			state ^= state >> 12n
			state ^= (state << 25n) & mask64
			state ^= state >> 27n
			return (state * 2685821657736338717n) & mask64
		},
		nextBigInt(bits) {
			let acc = 0n
			let remaining = bits
			while (remaining > 0) {
				const take = Math.min(remaining, 64)
				const chunk = this.next64() & ((1n << BigInt(take)) - 1n)
				acc = (acc << BigInt(take)) | chunk
				remaining -= take
			}
			return acc
		},
	}
}

describe('subtractBigIntRecursive', () => {
	it('subtracts positive integers (a > b and a < b)', () => {
		assert.equal(subtractBigIntRecursive(10n, 3n), 7n)
		assert.equal(subtractBigIntRecursive(3n, 10n), -7n)
		assert.equal(subtractBigIntRecursive(1n, 2n), -1n)
		assert.equal(subtractBigIntRecursive(2n, 1n), 1n)
		assert.equal(
			subtractBigIntRecursive(123456789012345678901234567890n, 98765432109876543210987654321n),
			24691356902469135690246913569n
		)
	})

	it('subtracts negative integers and mixed-sign operands', () => {
		assert.equal(subtractBigIntRecursive(-10n, -3n), -7n)
		assert.equal(subtractBigIntRecursive(-3n, -10n), 7n)
		assert.equal(subtractBigIntRecursive(10n, -3n), 13n)
		assert.equal(subtractBigIntRecursive(-10n, 3n), -13n)
		assert.equal(subtractBigIntRecursive(-1n, 1n), -2n)
		assert.equal(subtractBigIntRecursive(1n, -1n), 2n)
	})

	it('handles zeros and equal operands', () => {
		assert.equal(subtractBigIntRecursive(0n, 0n), 0n)
		assert.equal(subtractBigIntRecursive(42n, 0n), 42n)
		assert.equal(subtractBigIntRecursive(-42n, 0n), -42n)
		assert.equal(subtractBigIntRecursive(0n, 42n), -42n)
		assert.equal(subtractBigIntRecursive(0n, -42n), 42n)
		assert.equal(subtractBigIntRecursive(999999999999999999999n, 999999999999999999999n), 0n)
		assert.equal(subtractBigIntRecursive(-999999999999999999999n, -999999999999999999999n), 0n)
	})

	it('preserves exactness for fixed-point BigInt values scaled by 10^18', () => {
		const threePointFive = 3n * SCALE_1E18 + 5n * 10n ** 17n
		const onePointTwoFive = 1n * SCALE_1E18 + 25n * 10n ** 16n
		const twoPointTwoFive = 2n * SCALE_1E18 + 25n * 10n ** 16n

		assert.equal(subtractBigIntRecursive(threePointFive, onePointTwoFive), twoPointTwoFive)
		assert.equal(subtractBigIntRecursive(onePointTwoFive, threePointFive), -twoPointTwoFive)
		assert.equal(subtractBigIntRecursive(SCALE_1E18, 1n), 999999999999999999n)
		assert.equal(subtractBigIntRecursive(-threePointFive, onePointTwoFive), -(4n * SCALE_1E18 + 75n * 10n ** 16n))
	})

	it('handles long borrow and carry propagation chains across power-of-two boundaries', () => {
		for (const bits of [1n, 2n, 3n, 7n, 8n, 15n, 16n, 31n, 32n, 63n, 64n, 127n, 128n, 256n, 512n, 1024n]) {
			const pow2 = 1n << bits
			assert.equal(subtractBigIntRecursive(pow2, 1n), pow2 - 1n)
			assert.equal(subtractBigIntRecursive(1n, pow2), 1n - pow2)
			assert.equal(subtractBigIntRecursive(pow2 - 1n, -1n), pow2)
			assert.equal(subtractBigIntRecursive(-(pow2 - 1n), 1n), -pow2)
			assert.equal(subtractBigIntRecursive(pow2, pow2 - 1n), 1n)
			assert.equal(subtractBigIntRecursive(pow2 - 1n, pow2), -1n)
		}
	})

	it('handles very large arbitrary-precision BigInts (2048+ bits)', () => {
		const a = (1n << 2048n) + (1n << 1024n) + 123456789n
		const b = (1n << 2047n) + (1n << 512n) + 987654321n
		assert.equal(subtractBigIntRecursive(a, b), a - b)
		assert.equal(subtractBigIntRecursive(b, a), b - a)
		assert.equal(subtractBigIntRecursive(a, -b), a + b)
		assert.equal(subtractBigIntRecursive(-a, b), -(a + b))
	})

	it('throws TypeError on invalid non-BigInt inputs', () => {
		const invalidValues = [
			0,
			42,
			-1.5,
			NaN,
			Infinity,
			-Infinity,
			'10',
			'10n',
			null,
			undefined,
			true,
			false,
			{},
			[1n],
			Symbol('x'),
		]

		for (const bad of invalidValues) {
			assert.throws(() => subtractBigIntRecursive(bad, 1n), TypeError)
			assert.throws(() => subtractBigIntRecursive(1n, bad), TypeError)
		}
		assert.throws(() => subtractBigIntRecursive(), TypeError)
		assert.throws(() => subtractBigIntRecursive(1n), TypeError)
	})

	it('matches independent decimal-string oracle and native BigInt subtraction across deterministic cases', () => {
		const rng = createRng(0x9e3779b97f4a7c15n)
		const bitSizes = [1, 2, 3, 5, 8, 13, 21, 32, 53, 64, 97, 128, 255, 384]

		for (const bitsA of bitSizes) {
			for (const bitsB of [bitsA, Math.max(1, bitsA - 1), Math.max(1, bitsA >> 1)]) {
				const rawA = rng.nextBigInt(bitsA)
				const rawB = rng.nextBigInt(bitsB)
				const signA = (rng.next64() & 1n) === 0n ? 1n : -1n
				const signB = (rng.next64() & 1n) === 0n ? 1n : -1n
				const a = rawA * signA
				const b = rawB * signB

				const actual = subtractBigIntRecursive(a, b)
				assert.equal(actual, a - b, `native mismatch for (${a}, ${b})`)
				assert.equal(actual.toString(10), decimalSubtractOracle(a, b), `oracle mismatch for (${a}, ${b})`)
			}
		}
	})

	it('satisfies algebraic subtraction identities', () => {
		const samples = [
			0n,
			1n,
			-1n,
			7n,
			-19n,
			(1n << 65n) - 3n,
			-((1n << 99n) + 17n),
			123456789n * SCALE_1E18 + 987654321012345678n,
		]

		for (const a of samples) {
			assert.equal(subtractBigIntRecursive(a, a), 0n)
			for (const b of samples) {
				const diff = subtractBigIntRecursive(a, b)
				// Anti-commutativity: a - b === -(b - a)
				assert.equal(diff, -subtractBigIntRecursive(b, a))
				// Inverse with addition: (a - b) + b === a
				assert.equal(diff + b, a)
			}
		}

		// Telescoping property: (a - b) + (b - c) === a - c
		const a = samples[5]
		const b = samples[6]
		const c = samples[7]
		assert.equal(
			subtractBigIntRecursive(a, b) + subtractBigIntRecursive(b, c),
			subtractBigIntRecursive(a, c)
		)
	})
})
