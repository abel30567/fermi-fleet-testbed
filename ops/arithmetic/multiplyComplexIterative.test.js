import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyComplexIterative } from './multiplyComplexIterative.js'

const EPSILON = 1e-11

function assertComplexClose(actual, expected, eps = EPSILON) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Expected re ≈ ${expected.re}, got ${actual.re} (diff=${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Expected im ≈ ${expected.im}, got ${actual.im} (diff=${Math.abs(actual.im - expected.im)})`
	)
}

function modulus(z) {
	return Math.hypot(z.re, z.im)
}

function addComplex(z1, z2) {
	return { re: z1.re + z2.re, im: z1.im + z2.im }
}

describe('multiplyComplexIterative', () => {
	describe('normal cases', () => {
		test('multiplies two general complex numbers', () => {
			// (3 + 2i)(1 + 4i) = (3 - 8) + (12 + 2)i = -5 + 14i
			assert.deepStrictEqual(
				multiplyComplexIterative({ re: 3, im: 2 }, { re: 1, im: 4 }),
				{ re: -5, im: 14 }
			)

			// (-2 + 5i)(4 - 3i) = (-8 + 15) + (6 + 20)i = 7 + 26i
			assert.deepStrictEqual(
				multiplyComplexIterative({ re: -2, im: 5 }, { re: 4, im: -3 }),
				{ re: 7, im: 26 }
			)
		})

		test('multiplies purely real and purely imaginary numbers', () => {
			assert.deepStrictEqual(
				multiplyComplexIterative({ re: 5, im: 0 }, { re: -3, im: 0 }),
				{ re: -15, im: 0 }
			)

			// i * i = -1
			assert.deepStrictEqual(
				multiplyComplexIterative({ re: 0, im: 1 }, { re: 0, im: 1 }),
				{ re: -1, im: 0 }
			)

			// (3i)(-2i) = 6
			assert.deepStrictEqual(
				multiplyComplexIterative({ re: 0, im: 3 }, { re: 0, im: -2 }),
				{ re: 6, im: 0 }
			)
		})

		test('multiplies complex conjugates to yield real squared modulus', () => {
			// (4 + 7i)(4 - 7i) = 16 + 49 = 65
			assert.deepStrictEqual(
				multiplyComplexIterative({ re: 4, im: 7 }, { re: 4, im: -7 }),
				{ re: 65, im: 0 }
			)
		})

		test('multiplies floating-point complex numbers accurately', () => {
			const res = multiplyComplexIterative({ re: 1.5, im: -2.25 }, { re: -0.5, im: 4.5 })
			// re = 1.5 * (-0.5) - (-2.25) * 4.5 = -0.75 + 10.125 = 9.375
			// im = 1.5 * 4.5 + (-2.25) * (-0.5) = 6.75 + 1.125 = 7.875
			assertComplexClose(res, { re: 9.375, im: 7.875 })
		})

		test('iteratively multiplies three or more complex numbers', () => {
			const i = { re: 0, im: 1 }
			// i^4 = 1
			assert.deepStrictEqual(multiplyComplexIterative(i, i, i, i), { re: 1, im: 0 })

			// (1 + i)^4 = ((1 + i)^2)^2 = (2i)^2 = -4
			const z = { re: 1, im: 1 }
			assert.deepStrictEqual(multiplyComplexIterative(z, z, z, z), { re: -4, im: 0 })
		})
	})

	describe('edge cases', () => {
		test('handles multiplicative identity (1 + 0i)', () => {
			const z = { re: -7.5, im: 3.25 }
			const one = { re: 1, im: 0 }
			assert.deepStrictEqual(multiplyComplexIterative(z, one), z)
			assert.deepStrictEqual(multiplyComplexIterative(one, z), z)
		})

		test('handles multiplicative zero (0 + 0i) without producing -0', () => {
			const zero = { re: 0, im: 0 }
			const z = { re: -5, im: -3 }

			const res1 = multiplyComplexIterative(z, zero)
			assert.deepStrictEqual(res1, { re: 0, im: 0 })
			assert.equal(Object.is(res1.re, 0), true)
			assert.equal(Object.is(res1.im, 0), true)

			// (0 + i)(-1 + 0i) = 0 - i; raw formula yields re = -0
			const res2 = multiplyComplexIterative({ re: 0, im: 1 }, { re: -1, im: 0 })
			assert.deepStrictEqual(res2, { re: 0, im: -1 })
			assert.equal(Object.is(res2.re, 0), true)

			// Negative zero inputs normalize cleanly
			const res3 = multiplyComplexIterative({ re: -0, im: -0 }, { re: -0, im: -0 })
			assert.equal(Object.is(res3.re, 0), true)
			assert.equal(Object.is(res3.im, 0), true)
		})

		test('does not mutate inputs and returns a fresh object', () => {
			const a = Object.freeze({ re: 2, im: 3 })
			const b = Object.freeze({ re: 1, im: 0 })
			const res = multiplyComplexIterative(a, b)
			assert.deepStrictEqual(res, { re: 2, im: 3 })
			assert.notEqual(res, a)
			assert.notEqual(res, b)
		})

		test('throws RangeError when multiplication overflows to Infinity', () => {
			assert.throws(
				() => multiplyComplexIterative({ re: 1e200, im: 0 }, { re: 1e200, im: 0 }),
				RangeError
			)
			assert.throws(
				() => multiplyComplexIterative({ re: 1e200, im: 1e200 }, { re: 1e200, im: 0 }),
				RangeError
			)
		})
	})

	describe('invalid input validation', () => {
		test('throws TypeError for missing operands', () => {
			assert.throws(() => multiplyComplexIterative(), TypeError)
			assert.throws(() => multiplyComplexIterative({ re: 1, im: 2 }), TypeError)
		})

		test('throws TypeError for non-object or array operands', () => {
			const valid = { re: 1, im: 2 }
			const badValues = [null, undefined, 42, '1+2i', true, [1, 2], () => {}]
			for (const bad of badValues) {
				assert.throws(() => multiplyComplexIterative(bad, valid), TypeError)
				assert.throws(() => multiplyComplexIterative(valid, bad), TypeError)
				assert.throws(() => multiplyComplexIterative(valid, valid, bad), TypeError)
			}
		})

		test('throws TypeError for missing or non-numeric re/im properties', () => {
			const valid = { re: 1, im: 2 }
			const badObjects = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: '2' },
				{ re: null, im: 2 },
				{ re: 1, im: undefined },
				{ re: 1n, im: 0 },
				{ re: true, im: false },
			]
			for (const bad of badObjects) {
				assert.throws(() => multiplyComplexIterative(bad, valid), TypeError)
				assert.throws(() => multiplyComplexIterative(valid, bad), TypeError)
			}
		})

		test('throws RangeError for non-finite components (NaN, Infinity, -Infinity)', () => {
			const valid = { re: 1, im: 2 }
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => multiplyComplexIterative(bad, valid), RangeError)
				assert.throws(() => multiplyComplexIterative(valid, bad), RangeError)
				assert.throws(() => multiplyComplexIterative(valid, valid, bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		const samples = [
			{ re: 3, im: 4 },
			{ re: -2.5, im: 1.75 },
			{ re: -6, im: -8 },
			{ re: 0.75, im: -5.25 },
			{ re: 0, im: 2.5 },
			{ re: -4.2, im: 0 },
		]

		test('matches polar form r1 * r2 * e^{i(theta1 + theta2)} across all quadrants', () => {
			for (const z1 of samples) {
				for (const z2 of samples) {
					const actual = multiplyComplexIterative(z1, z2)

					const r1 = Math.hypot(z1.re, z1.im)
					const theta1 = Math.atan2(z1.im, z1.re)
					const r2 = Math.hypot(z2.re, z2.im)
					const theta2 = Math.atan2(z2.im, z2.re)

					const expectedPolar = {
						re: r1 * r2 * Math.cos(theta1 + theta2),
						im: r1 * r2 * Math.sin(theta1 + theta2),
					}

					assertComplexClose(actual, expectedPolar, 1e-10)
				}
			}
		})

		test('satisfies modulus multiplicativity |z1 * z2| === |z1| * |z2|', () => {
			for (const z1 of samples) {
				for (const z2 of samples) {
					const product = multiplyComplexIterative(z1, z2)
					const lhs = modulus(product)
					const rhs = modulus(z1) * modulus(z2)
					assert.ok(
						Math.abs(lhs - rhs) <= 1e-10,
						`Expected |z1*z2| (${lhs}) ≈ |z1|*|z2| (${rhs})`
					)
				}
			}

			// Multi-factor modulus multiplicativity: |z1 * z2 * z3| === |z1| * |z2| * |z3|
			const [a, b, c] = samples
			const triple = multiplyComplexIterative(a, b, c)
			assert.ok(
				Math.abs(modulus(triple) - modulus(a) * modulus(b) * modulus(c)) <= 1e-10
			)
		})

		test('matches 2x2 real matrix representation isomorphism M(z1) * M(z2) === M(z1 * z2)', () => {
			// Complex a + bi maps to [[a, -b], [b, a]]
			function toMatrix(z) {
				return [
					[z.re, -z.im],
					[z.im, z.re],
				]
			}
			function matMul2x2(A, B) {
				return [
					[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
					[A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
				]
			}

			for (const z1 of samples) {
				for (const z2 of samples) {
					const prod = multiplyComplexIterative(z1, z2)
					const matProd = matMul2x2(toMatrix(z1), toMatrix(z2))
					const expectedFromMat = { re: matProd[0][0], im: matProd[1][0] }
					assertComplexClose(prod, expectedFromMat)
					assertComplexClose({ re: matProd[1][1], im: -matProd[0][1] }, prod)
				}
			}
		})

		test('satisfies commutativity, associativity, distributivity, and multiplicative inverse', () => {
			const z1 = { re: 3.5, im: -2.25 }
			const z2 = { re: -1.75, im: 4.5 }
			const z3 = { re: 2.1, im: 0.9 }

			// Commutativity: z1 * z2 === z2 * z1
			assertComplexClose(
				multiplyComplexIterative(z1, z2),
				multiplyComplexIterative(z2, z1)
			)

			// Associativity: (z1 * z2) * z3 === z1 * (z2 * z3) === multiplyComplexIterative(z1, z2, z3)
			const leftAssoc = multiplyComplexIterative(multiplyComplexIterative(z1, z2), z3)
			const rightAssoc = multiplyComplexIterative(z1, multiplyComplexIterative(z2, z3))
			const variadic = multiplyComplexIterative(z1, z2, z3)
			assertComplexClose(leftAssoc, rightAssoc)
			assertComplexClose(leftAssoc, variadic)

			// Distributivity: z1 * (z2 + z3) === (z1 * z2) + (z1 * z3)
			const lhs = multiplyComplexIterative(z1, addComplex(z2, z3))
			const rhs = addComplex(
				multiplyComplexIterative(z1, z2),
				multiplyComplexIterative(z1, z3)
			)
			assertComplexClose(lhs, rhs)

			// Multiplicative inverse: z * (conj(z) / |z|^2) === 1 + 0i
			for (const z of samples) {
				const normSq = z.re * z.re + z.im * z.im
				const inv = { re: z.re / normSq, im: -z.im / normSq }
				assertComplexClose(multiplyComplexIterative(z, inv), { re: 1, im: 0 })
			}
		})
	})
})
