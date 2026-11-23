import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyBigIntIterative } from './multiplyBigIntIterative.js'

describe('multiplyBigIntIterative', () => {
	it('multiplies small positive BigInts', () => {
		assert.equal(multiplyBigIntIterative(3n, 4n), 12n)
		assert.equal(multiplyBigIntIterative(7n, 6n), 42n)
		assert.equal(multiplyBigIntIterative(123n, 456n), 56088n)
		assert.equal(multiplyBigIntIterative(9999n, 9999n), 99980001n)
	})

	it('handles all sign combinations', () => {
		assert.equal(multiplyBigIntIterative(13n, -17n), -221n)
		assert.equal(multiplyBigIntIterative(-13n, 17n), -221n)
		assert.equal(multiplyBigIntIterative(-13n, -17n), 221n)
		assert.equal(multiplyBigIntIterative(-1n, 9876543210123456789n), -9876543210123456789n)
		assert.equal(multiplyBigIntIterative(-1n, -9876543210123456789n), 9876543210123456789n)
	})

	it('handles zero and identity edge cases', () => {
		assert.equal(multiplyBigIntIterative(0n, 0n), 0n)
		assert.equal(multiplyBigIntIterative(0n, 123456789n), 0n)
		assert.equal(multiplyBigIntIterative(123456789n, 0n), 0n)
		assert.equal(multiplyBigIntIterative(0n, -123456789n), 0n)
		assert.equal(multiplyBigIntIterative(-123456789n, 0n), 0n)
		assert.equal(multiplyBigIntIterative(1n, 42n), 42n)
		assert.equal(multiplyBigIntIterative(42n, 1n), 42n)
		assert.equal(multiplyBigIntIterative(1n, 1n), 1n)
		assert.equal(multiplyBigIntIterative(-1n, -1n), 1n)
	})

	it('handles large arbitrary-precision BigInts and asymmetric magnitudes', () => {
		const bigA = (1n << 256n) - 1n
		const bigB = (1n << 128n) + 123456789012345678901234567890n
		assert.equal(multiplyBigIntIterative(bigA, bigB), bigA * bigB)
		assert.equal(multiplyBigIntIterative(bigB, bigA), bigA * bigB)
		assert.equal(multiplyBigIntIterative(bigA, 2n), bigA * 2n)
		assert.equal(multiplyBigIntIterative(2n, bigA), 2n * bigA)
		assert.equal(multiplyBigIntIterative(-bigA, bigB), -(bigA * bigB))
		assert.equal(multiplyBigIntIterative(-bigA, -bigB), bigA * bigB)
	})

	it('satisfies algebraic laws (commutativity, associativity, distributivity)', () => {
		const a = 123456789012345678901n
		const b = -987654321098765432109n
		const c = 555555555555555555555n

		// Commutativity
		assert.equal(multiplyBigIntIterative(a, b), multiplyBigIntIterative(b, a))

		// Associativity
		assert.equal(
			multiplyBigIntIterative(multiplyBigIntIterative(a, b), c),
			multiplyBigIntIterative(a, multiplyBigIntIterative(b, c)),
		)

		// Distributivity
		assert.equal(
			multiplyBigIntIterative(a, b + c),
			multiplyBigIntIterative(a, b) + multiplyBigIntIterative(a, c),
		)
	})

	it('rejects non-BigInt inputs with TypeError', () => {
		const invalidValues = [0, 1, -42, 3.14, NaN, Infinity, '10', null, undefined, true, {}, []]
		for (const bad of invalidValues) {
			assert.throws(() => multiplyBigIntIterative(bad, 2n), TypeError)
			assert.throws(() => multiplyBigIntIterative(2n, bad), TypeError)
			assert.throws(() => multiplyBigIntIterative(bad, bad), TypeError)
		}
	})

	it('cross-checks against built-in BigInt multiplication and decimal schoolbook multiplication', () => {
		// Independent decimal schoolbook multiplication using base-10 string digits
		const schoolbookMultiply = (a, b) => {
			if (a === 0n || b === 0n) return 0n
			const neg = (a < 0n) !== (b < 0n)
			const sa = (a < 0n ? -a : a).toString()
			const sb = (b < 0n ? -b : b).toString()
			const digits = new Array(sa.length + sb.length).fill(0)
			for (let i = sa.length - 1; i >= 0; i--) {
				const da = sa.charCodeAt(i) - 48
				for (let j = sb.length - 1; j >= 0; j--) {
					const db = sb.charCodeAt(j) - 48
					const sum = digits[i + j + 1] + da * db
					digits[i + j + 1] = sum % 10
					digits[i + j] += Math.floor(sum / 10)
				}
			}
			const str = digits.join('').replace(/^0+/, '') || '0'
			return neg ? -BigInt(str) : BigInt(str)
		}

		// Deterministic PRNG (LCG) generating 200 test pairs across varying bit widths
		let state = 0x123456789abcdef1n
		const mask64 = (1n << 64n) - 1n
		const nextRand64 = () => {
			state = (state * 6364136223846793005n + 1442695040888963407n) & mask64
			return state
		}
		const nextSignedBig = (chunks) => {
			let val = 0n
			for (let i = 0; i < chunks; i++) {
				val = (val << 64n) | nextRand64()
			}
			return (nextRand64() & 1n) === 1n ? -val : val
		}

		for (let i = 0; i < 100; i++) {
			const a = nextSignedBig((i % 4) + 1)
			const b = nextSignedBig(((i + 2) % 4) + 1)
			const actual = multiplyBigIntIterative(a, b)
			assert.equal(actual, a * b)
			assert.equal(actual, schoolbookMultiply(a, b))
		}
	})
})
