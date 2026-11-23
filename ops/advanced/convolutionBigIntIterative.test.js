import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionBigIntIterative } from './convolutionBigIntIterative.js'

/**
 * Evaluates a polynomial with BigInt coefficients at x using Horner's method.
 * @param {bigint[]} coeffs
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
 * Independent direct definition of discrete convolution computing each output
 * index k via c[k] = sum_{i=max(0, k-n+1)}^{min(k, m-1)} a[i] * b[k - i].
 * @param {bigint[]} a
 * @param {bigint[]} b
 * @returns {bigint[]}
 */
function directDefinitionConvolution(a, b) {
	const m = a.length
	const n = b.length
	if (m === 0 || n === 0) return []
	const out = new Array(m + n - 1)
	for (let k = 0; k < out.length; k++) {
		let sum = 0n
		const iStart = Math.max(0, k - n + 1)
		const iEnd = Math.min(k, m - 1)
		for (let i = iStart; i <= iEnd; i++) {
			sum += a[i] * b[k - i]
		}
		out[k] = sum
	}
	return out
}

describe('convolutionBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes full convolution of small positive BigInt sequences', () => {
			assert.deepEqual(
				convolutionBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]),
				[4n, 13n, 28n, 27n, 18n]
			)
		})

		it('handles sequences of unequal lengths', () => {
			assert.deepEqual(
				convolutionBigIntIterative([1n, 2n, 3n, 4n], [2n, -1n]),
				[2n, 3n, 4n, 5n, -4n]
			)
			assert.deepEqual(
				convolutionBigIntIterative([2n, -1n], [1n, 2n, 3n, 4n]),
				[2n, 3n, 4n, 5n, -4n]
			)
		})

		it('handles negative values and zeros accurately', () => {
			assert.deepEqual(
				convolutionBigIntIterative([-3n, 0n, 5n, -2n], [4n, -1n, 0n, 7n]),
				[-12n, 3n, 20n, -34n, 2n, 35n, -14n]
			)
		})

		it('preserves exact precision beyond IEEE-754 safe integer limits', () => {
			const bigA = 10n ** 30n + 7n
			const bigB = 10n ** 30n + 13n
			const result = convolutionBigIntIterative([bigA, -bigB], [bigB, bigA])
			assert.deepEqual(result, [
				bigA * bigB,
				bigA * bigA - bigB * bigB,
				-(bigB * bigA)
			])
		})

		it('supports "same" and "valid" output modes', () => {
			const a = [1n, 2n, 3n, 4n, 5n]
			const b = [1n, 0n, -1n]
			// full: [1, 2, 2, 2, 2, -4, -5]
			assert.deepEqual(
				convolutionBigIntIterative(a, b, 'full'),
				[1n, 2n, 2n, 2n, 2n, -4n, -5n]
			)
			assert.deepEqual(
				convolutionBigIntIterative(a, b, 'same'),
				[2n, 2n, 2n, 2n, -4n]
			)
			assert.deepEqual(
				convolutionBigIntIterative(a, b, 'valid'),
				[2n, 2n, 2n]
			)
		})
	})

	describe('edge cases', () => {
		it('returns empty array when either or both inputs are empty', () => {
			assert.deepEqual(convolutionBigIntIterative([], [1n, 2n, 3n]), [])
			assert.deepEqual(convolutionBigIntIterative([1n, 2n, 3n], []), [])
			assert.deepEqual(convolutionBigIntIterative([], []), [])
			assert.deepEqual(convolutionBigIntIterative([], [1n], 'same'), [])
			assert.deepEqual(convolutionBigIntIterative([1n], [], 'valid'), [])
		})

		it('handles single-element sequences and impulse identity [1n]', () => {
			assert.deepEqual(convolutionBigIntIterative([7n], [9n]), [63n])
			assert.deepEqual(convolutionBigIntIterative([1n], [5n, -2n, 8n]), [5n, -2n, 8n])
			assert.deepEqual(convolutionBigIntIterative([5n, -2n, 8n], [1n]), [5n, -2n, 8n])
		})

		it('handles all-zero sequences', () => {
			assert.deepEqual(
				convolutionBigIntIterative([0n, 0n, 0n], [1n, 2n]),
				[0n, 0n, 0n, 0n]
			)
			assert.deepEqual(
				convolutionBigIntIterative([0n], [0n]),
				[0n]
			)
		})

		it('does not mutate input arrays', () => {
			const a = [1n, 2n, 3n]
			const b = [4n, 5n]
			const aSnap = [...a]
			const bSnap = [...b]
			convolutionBigIntIterative(a, b)
			assert.deepEqual(a, aSnap)
			assert.deepEqual(b, bSnap)
		})
	})

	describe('algebraic properties and independent cross-checks', () => {
		it('matches polynomial multiplication via Horner evaluation at multiple BigInt points', () => {
			const a = [3n, -17n, 0n, 42n, 10n ** 18n + 1n, -999999999999999999n]
			const b = [-5n, 11n, 10n ** 18n - 3n, 0n, 23n]
			const c = convolutionBigIntIterative(a, b)

			const testPoints = [0n, 1n, -1n, 2n, -7n, 1000003n, 10n ** 18n + 9n]
			for (const x of testPoints) {
				assert.equal(
					evalPolynomial(c, x),
					evalPolynomial(a, x) * evalPolynomial(b, x),
					`Polynomial identity failed at x = ${x}`
				)
			}
		})

		it('matches independent direct index-sum definition on varied inputs', () => {
			const pairs = [
				[[1n], [1n, 2n, 3n, 4n]],
				[[-5n, 0n, 12n, -8n, 3n], [7n, -4n, 0n, 9n, -1n, 6n]],
				[[10n ** 25n, -(10n ** 24n), 123456789012345678901n], [987654321098765432109n, 0n, -(10n ** 20n)]]
			]
			for (const [a, b] of pairs) {
				assert.deepEqual(
					convolutionBigIntIterative(a, b),
					directDefinitionConvolution(a, b)
				)
			}
		})

		it('satisfies commutativity, associativity, and distributivity', () => {
			const a = [2n, -3n, 5n]
			const b = [-1n, 4n, 0n, 7n]
			const c = [6n, 1n, -2n, 3n]

			// Commutativity: a * b == b * a
			assert.deepEqual(
				convolutionBigIntIterative(a, b),
				convolutionBigIntIterative(b, a)
			)

			// Associativity: (a * b) * c == a * (b * c)
			assert.deepEqual(
				convolutionBigIntIterative(convolutionBigIntIterative(a, b), c),
				convolutionBigIntIterative(a, convolutionBigIntIterative(b, c))
			)

			// Distributivity: a * (b + c) == (a * b) + (a * c)
			const bPlusC = b.map((v, i) => v + c[i])
			const lhs = convolutionBigIntIterative(a, bPlusC)
			const ab = convolutionBigIntIterative(a, b)
			const ac = convolutionBigIntIterative(a, c)
			const rhs = ab.map((v, i) => v + ac[i])
			assert.deepEqual(lhs, rhs)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when inputs are not arrays', () => {
			assert.throws(() => convolutionBigIntIterative(null, [1n]), TypeError)
			assert.throws(() => convolutionBigIntIterative([1n], undefined), TypeError)
			assert.throws(() => convolutionBigIntIterative('123', [1n]), TypeError)
			assert.throws(() => convolutionBigIntIterative([1n], { 0: 1n, length: 1 }), TypeError)
			assert.throws(() => convolutionBigIntIterative(new BigInt64Array([1n]), [1n]), TypeError)
		})

		it('throws TypeError when elements are not BigInt or arrays are sparse', () => {
			assert.throws(() => convolutionBigIntIterative([1, 2], [1n]), TypeError)
			assert.throws(() => convolutionBigIntIterative([1n], [2n, '3']), TypeError)
			assert.throws(() => convolutionBigIntIterative([1n, null], [2n]), TypeError)
			assert.throws(() => convolutionBigIntIterative([1n, NaN], [2n]), TypeError)

			const sparse = new Array(3)
			sparse[0] = 1n
			sparse[2] = 3n
			assert.throws(() => convolutionBigIntIterative(sparse, [1n]), TypeError)
		})

		it('throws TypeError or RangeError for invalid mode argument', () => {
			assert.throws(() => convolutionBigIntIterative([1n], [1n], 123), TypeError)
			assert.throws(() => convolutionBigIntIterative([1n], [1n], null), TypeError)
			assert.throws(() => convolutionBigIntIterative([1n], [1n], 'circular'), RangeError)
			assert.throws(() => convolutionBigIntIterative([1n], [1n], ''), RangeError)
		})
	})
})
