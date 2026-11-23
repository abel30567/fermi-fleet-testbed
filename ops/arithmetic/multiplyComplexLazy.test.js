import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyComplexLazy } from './multiplyComplexLazy.js'

/**
 * Helper to assert two complex numbers are approximately equal within epsilon.
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`re mismatch: expected ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`im mismatch: expected ${expected.im}, got ${actual.im}`
	)
}

/**
 * Independent reference implementation via 2x2 real matrix representation:
 * a + bi <-> [[a, -b], [b, a]]
 */
function multiplyViaMatrix(a, b) {
	const mA = [
		[a.re, -a.im],
		[a.im, a.re],
	]
	const mB = [
		[b.re, -b.im],
		[b.im, b.re],
	]
	const mC = [
		[
			mA[0][0] * mB[0][0] + mA[0][1] * mB[1][0],
			mA[0][0] * mB[0][1] + mA[0][1] * mB[1][1],
		],
		[
			mA[1][0] * mB[0][0] + mA[1][1] * mB[1][0],
			mA[1][0] * mB[0][1] + mA[1][1] * mB[1][1],
		],
	]
	return { re: mC[0][0], im: mC[1][0] }
}

/**
 * Independent reference implementation via polar coordinates:
 * (r1 * e^(i*t1)) * (r2 * e^(i*t2)) = (r1*r2) * e^(i*(t1 + t2))
 */
function multiplyViaPolar(a, b) {
	const r1 = Math.hypot(a.re, a.im)
	const r2 = Math.hypot(b.re, b.im)
	const t1 = Math.atan2(a.im, a.re)
	const t2 = Math.atan2(b.im, b.re)
	const r = r1 * r2
	const t = t1 + t2
	return { re: r * Math.cos(t), im: r * Math.sin(t) }
}

describe('multiplyComplexLazy', () => {
	describe('normal cases', () => {
		test('multiplies two scalar complex numbers', () => {
			// (3 + 2i) * (1 + 4i) = (3 - 8) + (12 + 2)i = -5 + 14i
			const result = [...multiplyComplexLazy({ re: 3, im: 2 }, { re: 1, im: 4 })]
			assert.deepEqual(result, [{ re: -5, im: 14 }])
		})

		test('multiplies two arrays of complex numbers element-by-element', () => {
			const a = [
				{ re: 1, im: 2 },
				{ re: -3, im: 4 },
				{ re: 0, im: 1 },
			]
			const b = [
				{ re: 3, im: -1 },
				{ re: 2, im: 5 },
				{ re: 0, im: 1 },
			]
			const result = [...multiplyComplexLazy(a, b)]
			assert.deepEqual(result, [
				{ re: 5, im: 5 },
				{ re: -26, im: -7 },
				{ re: -1, im: 0 },
			])
		})

		test('broadcasts a scalar complex number across an iterable (iterable first)', () => {
			const stream = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 2, im: -3 },
			]
			const scalar = { re: 0, im: 2 }
			const result = [...multiplyComplexLazy(stream, scalar)]
			assert.deepEqual(result, [
				{ re: 0, im: 2 },
				{ re: -2, im: 0 },
				{ re: 6, im: 4 },
			])
		})

		test('broadcasts a scalar complex number across an iterable (scalar first)', () => {
			const scalar = { re: 2, im: -1 }
			const stream = new Set([
				{ re: 3, im: 4 },
				{ re: -1, im: 2 },
			])
			const result = [...multiplyComplexLazy(scalar, stream)]
			assert.deepEqual(result, [
				{ re: 10, im: 5 },
				{ re: 0, im: 5 },
			])
		})

		test('does not mutate input objects', () => {
			const a = { re: 4, im: -5 }
			const b = { re: -2, im: 3 }
			const [prod] = multiplyComplexLazy(a, b)
			assert.deepEqual(a, { re: 4, im: -5 })
			assert.deepEqual(b, { re: -2, im: 3 })
			assert.notEqual(prod, a)
			assert.notEqual(prod, b)
		})
	})

	describe('edge cases', () => {
		test('handles zero, multiplicative identity, and negative zero normalization', () => {
			const zero = { re: 0, im: 0 }
			const one = { re: 1, im: 0 }
			const z = { re: -7.5, im: 4.25 }

			const [prodZero] = multiplyComplexLazy(zero, z)
			assert.ok(Object.is(prodZero.re, 0))
			assert.ok(Object.is(prodZero.im, 0))

			const [prodOne] = multiplyComplexLazy(z, one)
			assert.deepEqual(prodOne, z)

			// (-0) * (-1) and similar zero cancellations should normalize to +0
			const [negZeroCase] = multiplyComplexLazy({ re: -0, im: 0 }, { re: -1, im: 0 })
			assert.ok(Object.is(negZeroCase.re, 0))
			assert.ok(Object.is(negZeroCase.im, 0))
		})

		test('handles powers of imaginary unit i', () => {
			const i = { re: 0, im: 1 }
			const [i2] = multiplyComplexLazy(i, i)
			const [i3] = multiplyComplexLazy(i2, i)
			const [i4] = multiplyComplexLazy(i3, i)
			assert.deepEqual(i2, { re: -1, im: 0 })
			assert.deepEqual(i3, { re: 0, im: -1 })
			assert.deepEqual(i4, { re: 1, im: 0 })
		})

		test('handles empty iterables in all combinations', () => {
			const nonEmpty = [{ re: 1, im: 2 }]
			const scalar = { re: 3, im: 4 }
			assert.deepEqual([...multiplyComplexLazy([], [])], [])
			assert.deepEqual([...multiplyComplexLazy([], nonEmpty)], [])
			assert.deepEqual([...multiplyComplexLazy(nonEmpty, [])], [])
			assert.deepEqual([...multiplyComplexLazy([], scalar)], [])
			assert.deepEqual([...multiplyComplexLazy(scalar, [])], [])
		})

		test('stops at the shorter iterable when lengths differ', () => {
			const shorter = [
				{ re: 1, im: 1 },
				{ re: 2, im: 0 },
			]
			const longer = [
				{ re: 0, im: 1 },
				{ re: 3, im: 4 },
				{ re: 9, im: 9 },
				{ re: 8, im: 8 },
			]
			assert.deepEqual([...multiplyComplexLazy(shorter, longer)], [
				{ re: -1, im: 1 },
				{ re: 6, im: 8 },
			])
			assert.deepEqual([...multiplyComplexLazy(longer, shorter)], [
				{ re: -1, im: 1 },
				{ re: 6, im: 8 },
			])
		})

		test('validates top-level invalid inputs eagerly', () => {
			const valid = { re: 1, im: 2 }
			assert.throws(() => multiplyComplexLazy(null, valid), TypeError)
			assert.throws(() => multiplyComplexLazy(valid, undefined), TypeError)
			assert.throws(() => multiplyComplexLazy('1+2i', valid), TypeError)
			assert.throws(() => multiplyComplexLazy(valid, '3+4i'), TypeError)
			assert.throws(() => multiplyComplexLazy(42, valid), TypeError)
			assert.throws(() => multiplyComplexLazy({ re: '1', im: 2 }, valid), TypeError)
			assert.throws(() => multiplyComplexLazy({ re: 1 }, valid), TypeError)
			assert.throws(() => multiplyComplexLazy({ re: NaN, im: 0 }, valid), RangeError)
			assert.throws(() => multiplyComplexLazy(valid, { re: 0, im: Infinity }), RangeError)
			assert.throws(() => multiplyComplexLazy([], { re: -Infinity, im: 1 }), RangeError)
		})

		test('validates invalid elements lazily mid-stream and closes open iterators', () => {
			let closedA = false
			let closedB = false
			let pullsA = 0

			function* genA() {
				try {
					pullsA += 1
					yield { re: 1, im: 1 }
					pullsA += 1
					yield { re: 2, im: 2 }
					pullsA += 1
					yield { re: 3, im: 3 }
				} finally {
					closedA = true
				}
			}

			function* genB() {
				try {
					yield { re: 1, im: 0 }
					yield { re: NaN, im: 1 } // invalid second element
					yield { re: 5, im: 5 }
				} finally {
					closedB = true
				}
			}

			const gen = multiplyComplexLazy(genA(), genB())
			assert.deepEqual(gen.next(), { value: { re: 1, im: 1 }, done: false })
			assert.equal(pullsA, 1)
			assert.throws(() => gen.next(), RangeError)
			assert.equal(pullsA, 2)
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})
	})

	describe('lazy consumption verification', () => {
		test('does not pull from source iterables until iterated and consumes strictly on demand', () => {
			let pullsA = 0
			let pullsB = 0
			let closedA = false
			let closedB = false

			function* infiniteA() {
				try {
					let n = 1
					while (true) {
						pullsA += 1
						yield { re: n, im: -n }
						n += 1
					}
				} finally {
					closedA = true
				}
			}

			function* infiniteB() {
				try {
					let n = 1
					while (true) {
						pullsB += 1
						yield { re: 2, im: n }
						n += 1
					}
				} finally {
					closedB = true
				}
			}

			const stream = multiplyComplexLazy(infiniteA(), infiniteB())
			assert.equal(pullsA, 0)
			assert.equal(pullsB, 0)

			const taken = []
			for (const val of stream) {
				taken.push(val)
				assert.equal(pullsA, taken.length)
				assert.equal(pullsB, taken.length)
				if (taken.length === 3) {
					break
				}
			}

			assert.deepEqual(taken, [
				{ re: 3, im: -1 }, // (1 - i)*(2 + i) = 3 - i
				{ re: 8, im: 0 }, // (2 - 2i)*(2 + 2i) = 8 + 0i
				{ re: 15, im: 3 }, // (3 - 3i)*(2 + 3i) = 15 + 3i
			])
			assert.equal(pullsA, 3)
			assert.equal(pullsB, 3)
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})

		test('does not pull from second iterable when first iterable is exhausted', () => {
			let pullsEmpty = 0
			let returnCalledEmpty = false
			const customB = {
				[Symbol.iterator]() {
					return {
						next() {
							pullsEmpty += 1
							return { value: { re: 1, im: 1 }, done: false }
						},
						return() {
							returnCalledEmpty = true
							return { value: undefined, done: true }
						},
					}
				},
			}

			assert.deepEqual([...multiplyComplexLazy([], customB)], [])
			assert.equal(pullsEmpty, 0)
			assert.equal(returnCalledEmpty, true)

			let pullsB = 0
			let closedB = false

			function* infiniteB() {
				try {
					while (true) {
						pullsB += 1
						yield { re: 2, im: 3 }
					}
				} finally {
					closedB = true
				}
			}

			const results = [...multiplyComplexLazy([{ re: 1, im: 0 }], infiniteB())]
			assert.deepEqual(results, [{ re: 2, im: 3 }])
			assert.equal(pullsB, 1)
			assert.equal(closedB, true)
		})

		test('lazily consumes an infinite iterable in scalar broadcast mode', () => {
			let pulls = 0
			let closed = false

			function* infinite() {
				try {
					let k = 0
					while (true) {
						pulls += 1
						yield { re: k, im: 1 }
						k += 1
					}
				} finally {
					closed = true
				}
			}

			const gen = multiplyComplexLazy({ re: 0, im: 1 }, infinite())
			assert.equal(pulls, 0)
			assert.deepEqual(gen.next().value, { re: -1, im: 0 })
			assert.equal(pulls, 1)
			assert.deepEqual(gen.next().value, { re: -1, im: 1 })
			assert.equal(pulls, 2)
			gen.return()
			assert.equal(pulls, 2)
			assert.equal(closed, true)
		})
	})

	describe('independent cross-checks', () => {
		test('matches 2x2 real matrix representation and polar multiplication', () => {
			const left = [
				{ re: 3.5, im: -2.25 },
				{ re: -1.7, im: -4.1 },
				{ re: 0.25, im: 8.5 },
				{ re: -6.0, im: 0.75 },
				{ re: 1.23456, im: 7.89012 },
			]
			const right = [
				{ re: -0.5, im: 4.75 },
				{ re: 2.3, im: -1.9 },
				{ re: -3.1, im: -2.4 },
				{ re: 5.5, im: 1.25 },
				{ re: -4.56789, im: 3.21098 },
			]

			const products = [...multiplyComplexLazy(left, right)]
			assert.equal(products.length, left.length)

			for (let k = 0; k < products.length; k += 1) {
				const expectedMatrix = multiplyViaMatrix(left[k], right[k])
				const expectedPolar = multiplyViaPolar(left[k], right[k])
				assertComplexClose(products[k], expectedMatrix, 1e-12)
				assertComplexClose(products[k], expectedPolar, 1e-11)

				// Magnitude multiplicativity: |z1 * z2| = |z1| * |z2|
				const actualMag = Math.hypot(products[k].re, products[k].im)
				const expectedMag =
					Math.hypot(left[k].re, left[k].im) * Math.hypot(right[k].re, right[k].im)
				assert.ok(Math.abs(actualMag - expectedMag) <= 1e-11)
			}
		})

		test('satisfies commutativity, associativity, distributivity, and conjugate norm', () => {
			const a = { re: 2.5, im: -1.5 }
			const b = { re: -3.25, im: 4.0 }
			const c = { re: 1.75, im: 2.25 }

			// Commutativity: a * b === b * a
			const [ab] = multiplyComplexLazy(a, b)
			const [ba] = multiplyComplexLazy(b, a)
			assertComplexClose(ab, ba, 1e-12)

			// Associativity: (a * b) * c === a * (b * c)
			const [ab_c] = multiplyComplexLazy(ab, c)
			const [bc] = multiplyComplexLazy(b, c)
			const [a_bc] = multiplyComplexLazy(a, bc)
			assertComplexClose(ab_c, a_bc, 1e-11)

			// Distributivity: a * (b + c) === a * b + a * c
			const bPlusC = { re: b.re + c.re, im: b.im + c.im }
			const [lhs] = multiplyComplexLazy(a, bPlusC)
			const [ac] = multiplyComplexLazy(a, c)
			const rhs = { re: ab.re + ac.re, im: ab.im + ac.im }
			assertComplexClose(lhs, rhs, 1e-11)

			// Conjugate norm: z * conj(z) = |z|^2 + 0i
			const conjA = { re: a.re, im: -a.im }
			const [normSq] = multiplyComplexLazy(a, conjA)
			assertComplexClose(normSq, { re: a.re * a.re + a.im * a.im, im: 0 }, 1e-12)
		})
	})
})
