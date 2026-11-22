import { test, describe } from 'node:test'
import assert from 'node:assert'
import { subtractBigIntStable } from './subtractBigIntStable.js'

/**
 * Independent schoolbook base-10 subtraction for non-negative decimal strings (a >= b),
 * used to cross-check exact BigInt subtraction without relying on BigInt `-`.
 */
function schoolbookSubtractNonNegStrings(aStr, bStr) {
	const digits = []
	let i = aStr.length - 1
	let j = bStr.length - 1
	let borrow = 0

	while (i >= 0 || j >= 0) {
		const da = i >= 0 ? aStr.charCodeAt(i) - 48 : 0
		const db = j >= 0 ? bStr.charCodeAt(j) - 48 : 0
		let diff = da - db - borrow
		if (diff < 0) {
			diff += 10
			borrow = 1
		} else {
			borrow = 0
		}
		digits.push(String.fromCharCode(48 + diff))
		i--
		j--
	}

	assert.strictEqual(borrow, 0)
	let result = digits.reverse().join('').replace(/^0+/, '')
	return result === '' ? '0' : result
}

describe('subtractBigIntStable', () => {
	test('normal cases', () => {
		assert.strictEqual(subtractBigIntStable(10n, 3n), 7n)
		assert.strictEqual(subtractBigIntStable(3n, 10n), -7n)
		assert.strictEqual(subtractBigIntStable(-10n, 3n), -13n)
		assert.strictEqual(subtractBigIntStable(10n, -3n), 13n)
		assert.strictEqual(subtractBigIntStable(-10n, -3n), -7n)
		assert.strictEqual(subtractBigIntStable(-3n, -10n), 7n)
	})

	test('zero and identity edge cases', () => {
		assert.strictEqual(subtractBigIntStable(0n, 0n), 0n)
		assert.strictEqual(subtractBigIntStable(-0n, 0n), 0n)
		assert.strictEqual(subtractBigIntStable(42n, 0n), 42n)
		assert.strictEqual(subtractBigIntStable(-42n, 0n), -42n)
		assert.strictEqual(subtractBigIntStable(0n, 42n), -42n)
		assert.strictEqual(subtractBigIntStable(0n, -42n), 42n)
	})

	test('huge BigInts and exact cancellation without precision loss', () => {
		const huge = 10n ** 100n
		const massive = 2n ** 1024n

		// Exact cancellation of huge identical magnitudes
		assert.strictEqual(subtractBigIntStable(huge, huge), 0n)
		assert.strictEqual(subtractBigIntStable(-huge, -huge), 0n)
		assert.strictEqual(subtractBigIntStable(massive, massive), 0n)

		// Near-equal huge operands where IEEE-754 floats suffer catastrophic cancellation
		assert.strictEqual(subtractBigIntStable(huge + 1n, huge), 1n)
		assert.strictEqual(subtractBigIntStable(huge, huge + 1n), -1n)
		assert.strictEqual(subtractBigIntStable(massive + 123456789n, massive), 123456789n)
		assert.strictEqual(subtractBigIntStable(-massive, -(massive + 1n)), 1n)

		// Fixed-point 10^18 scaled values with 1-wei/1-ULP difference at huge scale
		const scale = 10n ** 18n
		const baseScaled = 10n ** 30n * scale
		assert.strictEqual(subtractBigIntStable(baseScaled + 1n, baseScaled), 1n)
		assert.strictEqual(subtractBigIntStable(baseScaled + scale, baseScaled), scale)

		// Opposite-sign huge magnitudes (doubles magnitude without overflow)
		assert.strictEqual(subtractBigIntStable(massive, -massive), 2n * massive)
		assert.strictEqual(subtractBigIntStable(-massive, massive), -2n * massive)
	})

	test('input validation rejects non-bigint values', () => {
		const invalidValues = [
			0,
			1,
			-1,
			1.5,
			NaN,
			Infinity,
			-Infinity,
			'10',
			'10n',
			'',
			true,
			false,
			null,
			undefined,
			{},
			[],
			[1n],
			Object(1n),
			Symbol('1'),
			() => 1n,
		]

		for (const bad of invalidValues) {
			assert.throws(
				() => subtractBigIntStable(bad, 1n),
				{ name: 'TypeError' },
				`Expected TypeError for invalid "a": ${String(bad)}`
			)
			assert.throws(
				() => subtractBigIntStable(1n, bad),
				{ name: 'TypeError' },
				`Expected TypeError for invalid "b": ${String(bad)}`
			)
		}

		// Missing arguments
		assert.throws(() => subtractBigIntStable(), { name: 'TypeError' })
		assert.throws(() => subtractBigIntStable(1n), { name: 'TypeError' })
	})

	test('cross-check: algebraic inverse, anti-symmetry, and modular arithmetic', () => {
		// Deterministic LCG generator producing large signed BigInts
		let state = 0x123456789abcdef0123456789abcdef1n
		const mod = 1n << 256n
		const nextBigInt = () => {
			state = (state * 6364136223846793005n + 1442695040888963407n) % mod
			const sign = (state & 1n) === 0n ? 1n : -1n
			return sign * (state >> 1n)
		}

		const primes = [97n, 1000000007n, (1n << 61n) - 1n]
		const normMod = (x, p) => ((x % p) + p) % p

		const pairs = [
			[0n, 0n],
			[10n ** 100n + 7n, 10n ** 100n],
			[-(10n ** 80n), 10n ** 80n - 1n],
			[(1n << 512n) - 1n, -(1n << 512n)],
		]
		for (let i = 0; i < 50; i++) {
			pairs.push([nextBigInt(), nextBigInt()])
		}

		for (const [a, b] of pairs) {
			const diff = subtractBigIntStable(a, b)

			// Inverse identity: (a - b) + b === a
			assert.strictEqual(diff + b, a)
			// Double subtraction identity: a - (a - b) === b
			assert.strictEqual(subtractBigIntStable(a, diff), b)
			// Anti-symmetry: a - b === -(b - a)
			assert.strictEqual(diff, -subtractBigIntStable(b, a))

			// Modular arithmetic cross-check across multiple coprime primes
			for (const p of primes) {
				const lhs = normMod(diff, p)
				const rhs = normMod(normMod(a, p) - normMod(b, p), p)
				assert.strictEqual(lhs, rhs)
			}
		}
	})

	test('cross-check: independent schoolbook decimal subtraction', () => {
		const cases = [
			[10n ** 50n, 1n],
			[999999999999999999999999999999999999n, 123456789012345678901234567890123456n],
			[10n ** 100n + 42n, 10n ** 100n + 17n],
			[10n ** 40n * 10n ** 18n + 999999999999999999n, 10n ** 40n * 10n ** 18n],
			[123456789012345678901234567890n, 123456789012345678901234567890n],
		]

		for (const [a, b] of cases) {
			const expectedStr = schoolbookSubtractNonNegStrings(a.toString(), b.toString())
			assert.strictEqual(subtractBigIntStable(a, b).toString(), expectedStr)
		}
	})
})
