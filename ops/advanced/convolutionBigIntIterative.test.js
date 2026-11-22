import { describe, it } from 'node:test'
import assert from 'node:assert'
import { convolutionBigIntIterative } from './convolutionBigIntIterative.js'

/**
 * Independent Horner's method polynomial evaluator: P(x) = sum_k coeffs[k] * x^k.
 *
 * @param {readonly bigint[]} coeffs
 * @param {bigint} x
 * @returns {bigint}
 */
function evalPolynomial(coeffs, x) {
	let acc = 0n
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = acc * x + coeffs[i]
	}
	return acc
}

/**
 * Independent definition-based convolution iterating directly over output index k.
 *
 * @param {readonly bigint[]} a
 * @param {readonly bigint[]} b
 * @returns {bigint[]}
 */
function referenceConvolutionByOutputIndex(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const outLen = a.length + b.length - 1
	const out = new Array(outLen)
	for (let k = 0; k < outLen; k++) {
		let sum = 0n
		const iStart = Math.max(0, k - (b.length - 1))
		const iEnd = Math.min(a.length - 1, k)
		for (let i = iStart; i <= iEnd; i++) {
			sum += a[i] * b[k - i]
		}
		out[k] = sum
	}
	return out
}

describe('convolutionBigIntIterative', () => {
	describe('normal cases', () => {
		it('convolves small positive BigInt sequences', () => {
			assert.deepStrictEqual(
				convolutionBigIntIterative([1n, 2n, 3n], [4n, 5n]),
				[4n, 13n, 22n, 15n]
			)
			assert.deepStrictEqual(
				convolutionBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]),
				[4n, 13n, 28n, 27n, 18n]
			)
		})

		it('handles negative numbers and mixed signs accurately', () => {
			assert.deepStrictEqual(
				convolutionBigIntIterative([-2n, 3n, -1n], [4n, -5n]),
				[-8n, 22n, -19n, 5n]
			)
			assert.deepStrictEqual(
				convolutionBigIntIterative([-1n, -1n], [-1n, -1n]),
				[1n, 2n, 1n]
			)
		})

		it('handles interior, leading, trailing, and all-zero elements', () => {
			assert.deepStrictEqual(
				convolutionBigIntIterative([0n, 2n, 0n], [0n, 3n, 0n]),
				[0n, 0n, 6n, 0n, 0n]
			)
			assert.deepStrictEqual(
				convolutionBigIntIterative([0n, 0n], [5n, 6n]),
				[0n, 0n, 0n]
			)
		})

		it('preserves exact precision for values far beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 30n + 7n
			const big2 = -(10n ** 40n) + 13n
			const big3 = 10n ** 25n + 99n
			const big4 = 10n ** 35n - 17n

			const result = convolutionBigIntIterative([big1, big2], [big3, big4])
			assert.deepStrictEqual(result, [
				big1 * big3,
				big1 * big4 + big2 * big3,
				big2 * big4,
			])
		})
	})

	describe('edge cases', () => {
		it('returns an empty array if either or both inputs are empty', () => {
			assert.deepStrictEqual(convolutionBigIntIterative([], []), [])
			assert.deepStrictEqual(convolutionBigIntIterative([], [1n, 2n, 3n]), [])
			assert.deepStrictEqual(convolutionBigIntIterative([1n, 2n, 3n], []), [])
		})

		it('handles single-element sequences', () => {
			assert.deepStrictEqual(convolutionBigIntIterative([7n], [6n]), [42n])
			assert.deepStrictEqual(convolutionBigIntIterative([0n], [99n]), [0n])
		})

		it('acts as identity for unit impulse [1n] and shifts for delayed impulse', () => {
			const seq = [3n, -5n, 8n, 0n, 11n]
			const identityResult = convolutionBigIntIterative(seq, [1n])
			assert.deepStrictEqual(identityResult, seq)
			assert.notStrictEqual(identityResult, seq)

			assert.deepStrictEqual(
				convolutionBigIntIterative(seq, [0n, 0n, 1n]),
				[0n, 0n, 3n, -5n, 8n, 0n, 11n]
			)
		})

		it('does not mutate input arrays and supports self-convolution', () => {
			const a = [1n, 2n, 3n]
			const b = [4n, 5n]
			convolutionBigIntIterative(a, b)
			assert.deepStrictEqual(a, [1n, 2n, 3n])
			assert.deepStrictEqual(b, [4n, 5n])

			assert.deepStrictEqual(
				convolutionBigIntIterative(a, a),
				[1n, 4n, 10n, 12n, 9n]
			)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('satisfies polynomial multiplication evaluation identity P_{a*b}(x) === P_a(x) * P_b(x)', () => {
			const a = [17n, -42n, 0n, 1000000000000000003n, -9n, 256n]
			const b = [-3n, 88n, 10n ** 18n, -777n, 12n]
			const conv = convolutionBigIntIterative(a, b)

			const evalPoints = [-1000003n, -10n, -1n, 0n, 1n, 2n, 10n, 10n ** 18n]
			for (const x of evalPoints) {
				assert.strictEqual(
					evalPolynomial(conv, x),
					evalPolynomial(a, x) * evalPolynomial(b, x),
					`Polynomial identity failed at x = ${x}`
				)
			}
		})

		it('satisfies sum-of-elements identity sum(a * b) === sum(a) * sum(b)', () => {
			const a = [123456789012345678901n, -98765432109876543210n, 42n, -17n]
			const b = [-55555555555555555555n, 11111111111111111111n, 999999999999999999999n]
			const conv = convolutionBigIntIterative(a, b)

			const sum = (arr) => arr.reduce((acc, v) => acc + v, 0n)
			assert.strictEqual(sum(conv), sum(a) * sum(b))
		})

		it('matches native BigInt multiplication via base-10^18 digit convolution', () => {
			const base = 10n ** 18n
			const x = 98765432109876543210987654321098765432109876543210123456789n
			const y = 12345678901234567890123456789012345678901234567890987654321n

			const toDigits = (n) => {
				const digits = []
				let rem = n
				while (rem > 0n) {
					digits.push(rem % base)
					rem /= base
				}
				return digits
			}

			const convDigits = convolutionBigIntIterative(toDigits(x), toDigits(y))
			const reconstructed = evalPolynomial(convDigits, base)
			assert.strictEqual(reconstructed, x * y)
		})

		it('satisfies commutativity, associativity, and distributivity', () => {
			const a = [3n, -7n, 11n, 0n, 5n]
			const b = [-2n, 9n, -4n]
			const c = [6n, 1n, -8n]

			// Commutativity: a * b === b * a
			assert.deepStrictEqual(
				convolutionBigIntIterative(a, b),
				convolutionBigIntIterative(b, a)
			)

			// Associativity: (a * b) * c === a * (b * c)
			assert.deepStrictEqual(
				convolutionBigIntIterative(convolutionBigIntIterative(a, b), c),
				convolutionBigIntIterative(a, convolutionBigIntIterative(b, c))
			)

			// Distributivity: a * (b + c) === (a * b) + (a * c)
			const bPlusC = b.map((val, idx) => val + c[idx])
			const ab = convolutionBigIntIterative(a, b)
			const ac = convolutionBigIntIterative(a, c)
			const abPlusAc = ab.map((val, idx) => val + ac[idx])
			assert.deepStrictEqual(convolutionBigIntIterative(a, bPlusC), abPlusAc)
		})

		it('matches independent output-index reference implementation across varied lengths', () => {
			let state = 123456789n
			const nextVal = () => {
				state = (state * 6364136223846793005n + 1442695040888963407n) % (2n ** 64n)
				return state - 2n ** 63n
			}

			const pairs = [
				[1, 15],
				[15, 1],
				[7, 13],
				[20, 20],
			]
			for (const [lenA, lenB] of pairs) {
				const a = Array.from({ length: lenA }, nextVal)
				const b = Array.from({ length: lenB }, nextVal)
				assert.deepStrictEqual(
					convolutionBigIntIterative(a, b),
					referenceConvolutionByOutputIndex(a, b)
				)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError when first argument is not an Array', () => {
			const invalidInputs = [null, undefined, 42, 42n, '123', {}, new BigInt64Array([1n])]
			for (const bad of invalidInputs) {
				assert.throws(() => convolutionBigIntIterative(bad, [1n]), TypeError)
			}
		})

		it('throws TypeError when second argument is not an Array', () => {
			const invalidInputs = [null, undefined, 42, 42n, '123', {}, new BigInt64Array([1n])]
			for (const bad of invalidInputs) {
				assert.throws(() => convolutionBigIntIterative([1n], bad), TypeError)
			}
		})

		it('throws TypeError when any element in a or b is not a BigInt', () => {
			const invalidElements = [0, 1, -5, 1.5, NaN, Infinity, '1', null, undefined, true, {}]
			for (const bad of invalidElements) {
				assert.throws(() => convolutionBigIntIterative([1n, bad], [2n]), TypeError)
				assert.throws(() => convolutionBigIntIterative([1n], [2n, bad]), TypeError)
			}
		})

		it('throws TypeError on sparse arrays with holes', () => {
			const sparse = new Array(3)
			sparse[0] = 1n
			sparse[2] = 3n
			assert.throws(() => convolutionBigIntIterative(sparse, [1n]), TypeError)
			assert.throws(() => convolutionBigIntIterative([1n], sparse), TypeError)
		})

		it('still validates elements of the non-empty array when the other array is empty', () => {
			assert.throws(() => convolutionBigIntIterative([], [1]), TypeError)
			assert.throws(() => convolutionBigIntIterative(['1'], []), TypeError)
		})
	})
})
