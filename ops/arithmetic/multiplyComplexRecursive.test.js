import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyComplexRecursive } from './multiplyComplexRecursive.js'

/**
 * Independent direct reference implementation of complex multiplication.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function directMultiply(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function assertComplexClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * Math.max(1, Math.abs(expected.re)),
		`re mismatch: expected ${expected.re}, got ${actual.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * Math.max(1, Math.abs(expected.im)),
		`im mismatch: expected ${expected.im}, got ${actual.im}`,
	)
}

describe('multiplyComplexRecursive', () => {
	test('multiplies standard complex numbers with nonzero real and imaginary parts', () => {
		assert.deepEqual(
			multiplyComplexRecursive({ re: 3, im: 4 }, { re: 5, im: -2 }),
			{ re: 23, im: 14 },
		)
		assert.deepEqual(
			multiplyComplexRecursive({ re: -2, im: 7 }, { re: -3, im: -5 }),
			{ re: 41, im: -11 },
		)
		assert.deepEqual(
			multiplyComplexRecursive({ re: 1.5, im: -2.25 }, { re: -4, im: 8 }),
			{ re: 12, im: 21 },
		)
	})

	test('handles irrational floating-point operands with high precision', () => {
		const a = { re: Math.PI, im: Math.E }
		const b = { re: Math.SQRT2, im: -Math.LN2 }
		const result = multiplyComplexRecursive(a, b)
		const ref = directMultiply(a, b)
		assertComplexClose(result, ref, 1e-15)
	})

	test('handles zero, pure real, pure imaginary, and identity edge cases', () => {
		const z = { re: -7.25, im: 3.5 }
		assert.deepEqual(multiplyComplexRecursive({ re: 0, im: 0 }, z), { re: 0, im: 0 })
		assert.deepEqual(multiplyComplexRecursive(z, { re: 0, im: 0 }), { re: 0, im: 0 })
		assert.deepEqual(multiplyComplexRecursive({ re: 1, im: 0 }, z), z)
		assert.deepEqual(multiplyComplexRecursive(z, { re: 1, im: 0 }), z)

		// Pure real
		assert.deepEqual(
			multiplyComplexRecursive({ re: -6, im: 0 }, { re: 7, im: 0 }),
			{ re: -42, im: 0 },
		)

		// Pure imaginary: i * i = -1, (-i) * i = 1
		assert.deepEqual(
			multiplyComplexRecursive({ re: 0, im: 1 }, { re: 0, im: 1 }),
			{ re: -1, im: 0 },
		)
		assert.deepEqual(
			multiplyComplexRecursive({ re: 0, im: -1 }, { re: 0, im: 1 }),
			{ re: 1, im: 0 },
		)
		assert.deepEqual(
			multiplyComplexRecursive({ re: 0, im: 3 }, { re: 0, im: -4 }),
			{ re: 12, im: 0 },
		)
	})

	test('normalizes -0 to +0 in both real and imaginary components', () => {
		const cases = [
			multiplyComplexRecursive({ re: -0, im: -0 }, { re: 5, im: -3 }),
			multiplyComplexRecursive({ re: -1, im: 0 }, { re: 0, im: 0 }),
			multiplyComplexRecursive({ re: 0, im: -1 }, { re: 0, im: -0 }),
			multiplyComplexRecursive({ re: -1, im: -1 }, { re: 1, im: -1 }),
		]
		for (const res of cases) {
			if (res.re === 0) assert.ok(Object.is(res.re, 0), 're should not be -0')
			if (res.im === 0) assert.ok(Object.is(res.im, 0), 'im should not be -0')
		}
	})

	test('avoids catastrophic cancellation where naive floating-point loses all precision', () => {
		// (1 + 2^-27)(1 - 2^-27) - 1*1 = -2^-54 exactly.
		// Naive JS evaluates (1 + 2^-27) * (1 - 2^-27) as 1, giving 0 instead of -2^-54.
		const eps = 2 ** -27
		const a = { re: 1 + eps, im: 1 }
		const b = { re: 1 - eps, im: 1 }
		const res = multiplyComplexRecursive(a, b)
		assert.equal(res.re, -(2 ** -54))
		assert.equal(res.im, 2)
	})

	test('handles widely separated exponents, subnormals, and canceling overflow/underflow', () => {
		// Exponent gap > 128 bits exercises the sparse/wide-exponent Karatsuba path
		const wide = multiplyComplexRecursive(
			{ re: 1e100, im: 1e-100 },
			{ re: 1e-100, im: 1e100 },
		)
		assert.equal(wide.re, 0)
		assert.equal(wide.im, 1e200)

		// Intermediate products cancel without spurious overflow
		const scaled = multiplyComplexRecursive(
			{ re: 1e200, im: 1e200 },
			{ re: 1e-200, im: -1e-200 },
		)
		assert.deepEqual(scaled, { re: 2, im: 0 })

		// True overflow in real part with exact cancellation to 0 in imaginary part (no NaN)
		const overflow = multiplyComplexRecursive(
			{ re: 1e200, im: 1e200 },
			{ re: 1e200, im: -1e200 },
		)
		assert.equal(overflow.re, Infinity)
		assert.equal(overflow.im, 0)

		// Subnormal arithmetic and ties-to-even rounding at Number.MIN_VALUE (2^-1074)
		assert.deepEqual(
			multiplyComplexRecursive({ re: Number.MIN_VALUE, im: 0 }, { re: 2, im: 0 }),
			{ re: Number.MIN_VALUE * 2, im: 0 },
		)
		// Exact tie halfway between 0 and Number.MIN_VALUE rounds to even (0)
		assert.deepEqual(
			multiplyComplexRecursive({ re: Number.MIN_VALUE, im: 0 }, { re: 0.5, im: 0 }),
			{ re: 0, im: 0 },
		)
		// Strictly above halfway rounds up to Number.MIN_VALUE
		assert.deepEqual(
			multiplyComplexRecursive({ re: Number.MIN_VALUE, im: 0 }, { re: 0.75, im: 0 }),
			{ re: Number.MIN_VALUE, im: 0 },
		)
		// Subnormal rounding up into smallest normal 2^-1022
		const largestSubnormal = (2 ** 52 - 1) * 2 ** -1074
		const roundedUp = multiplyComplexRecursive(
			{ re: largestSubnormal, im: 0 },
			{ re: 1 + 2 ** -52, im: 0 },
		)
		assert.equal(roundedUp.re, 2 ** -1022)
	})

	test('supports variadic divide-and-conquer products of three or more operands', () => {
		// (1 + i)^8 = 16 + 0i
		const onePlusI = { re: 1, im: 1 }
		assert.deepEqual(
			multiplyComplexRecursive(
				onePlusI,
				onePlusI,
				onePlusI,
				onePlusI,
				onePlusI,
				onePlusI,
				onePlusI,
				onePlusI,
			),
			{ re: 16, im: 0 },
		)

		// Exact dyadic tree avoids intermediate overflow/underflow in (2^700)(2^700)(2^-700)(2^-700)
		assert.deepEqual(
			multiplyComplexRecursive(
				{ re: 2 ** 700, im: 0 },
				{ re: 2 ** 700, im: 0 },
				{ re: 2 ** -700, im: 0 },
				{ re: 2 ** -700, im: 0 },
			),
			{ re: 1, im: 0 },
		)

		// Also handles non-power-of-two large/small floats without NaN from Inf * 0
		assertComplexClose(
			multiplyComplexRecursive(
				{ re: 1e200, im: 0 },
				{ re: 1e200, im: 0 },
				{ re: 1e-200, im: 0 },
				{ re: 1e-200, im: 0 },
			),
			{ re: 1, im: 0 },
			1e-15,
		)
	})

	test('cross-checks against independent direct formula and algebraic identities', () => {
		// Deterministic LCG for repeatable pseudo-random complex numbers
		let seed = 0x12345678
		const nextReal = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return (seed / 0xffffffff) * 200 - 100
		}

		for (let i = 0; i < 100; i += 1) {
			const z1 = { re: nextReal(), im: nextReal() }
			const z2 = { re: nextReal(), im: nextReal() }
			const z3 = { re: nextReal(), im: nextReal() }

			const prod = multiplyComplexRecursive(z1, z2)
			const direct = directMultiply(z1, z2)
			assertComplexClose(prod, direct, 1e-13)

			// Commutativity: z1 * z2 === z2 * z1 (exact bit-for-bit equality!)
			assert.deepEqual(prod, multiplyComplexRecursive(z2, z1))

			// Associativity & variadic consistency
			const leftAssoc = multiplyComplexRecursive(prod, z3)
			const rightAssoc = multiplyComplexRecursive(z1, multiplyComplexRecursive(z2, z3))
			const variadic = multiplyComplexRecursive(z1, z2, z3)
			assertComplexClose(leftAssoc, rightAssoc, 1e-13)
			assertComplexClose(variadic, leftAssoc, 1e-13)

			// Distributivity: z1 * (z2 + z3) === z1*z2 + z1*z3
			const sum23 = { re: z2.re + z3.re, im: z2.im + z3.im }
			const lhs = multiplyComplexRecursive(z1, sum23)
			const p13 = multiplyComplexRecursive(z1, z3)
			const rhs = { re: prod.re + p13.re, im: prod.im + p13.im }
			assertComplexClose(lhs, rhs, 1e-12)

			// Multiplicative inverse: z * (conj(z) / |z|^2) === 1 + 0i
			const normSq = z1.re * z1.re + z1.im * z1.im
			if (normSq > 1e-6) {
				const inv = { re: z1.re / normSq, im: -z1.im / normSq }
				assertComplexClose(multiplyComplexRecursive(z1, inv), { re: 1, im: 0 }, 1e-13)
			}

			// Modulus multiplicativity: |z1 * z2| === |z1| * |z2|
			const modProd = Math.hypot(prod.re, prod.im)
			const expectedMod = Math.hypot(z1.re, z1.im) * Math.hypot(z2.re, z2.im)
			assert.ok(Math.abs(modProd - expectedMod) <= 1e-12 * Math.max(1, expectedMod))
		}

		// Polar / angle-addition identity: e^(i*theta1) * e^(i*theta2) = e^(i*(theta1 + theta2))
		const angles = [0, 0.3, Math.PI / 6, Math.PI / 3, 1.23456789, -2.5]
		for (const t1 of angles) {
			for (const t2 of angles) {
				const u1 = { re: Math.cos(t1), im: Math.sin(t1) }
				const u2 = { re: Math.cos(t2), im: Math.sin(t2) }
				const res = multiplyComplexRecursive(u1, u2)
				assertComplexClose(res, { re: Math.cos(t1 + t2), im: Math.sin(t1 + t2) }, 1e-14)
			}
		}
	})

	test('throws TypeError and RangeError on invalid inputs', () => {
		// Missing operands
		assert.throws(() => multiplyComplexRecursive(), TypeError)
		assert.throws(() => multiplyComplexRecursive({ re: 1, im: 2 }), TypeError)

		// Invalid types
		for (const bad of [null, undefined, 42, '1+2i', true, [1, 2], {}, { re: 1 }, { im: 2 }]) {
			assert.throws(() => multiplyComplexRecursive(bad, { re: 1, im: 0 }), TypeError)
			assert.throws(() => multiplyComplexRecursive({ re: 1, im: 0 }, bad), TypeError)
			assert.throws(
				() => multiplyComplexRecursive({ re: 1, im: 0 }, { re: 1, im: 0 }, bad),
				TypeError,
			)
		}

		// Non-numeric properties
		assert.throws(
			() => multiplyComplexRecursive({ re: '1', im: 0 }, { re: 1, im: 0 }),
			TypeError,
		)
		assert.throws(
			() => multiplyComplexRecursive({ re: 1, im: 0 }, { re: 1, im: 0n }),
			TypeError,
		)

		// Non-finite numbers
		for (const badNum of [NaN, Infinity, -Infinity]) {
			assert.throws(
				() => multiplyComplexRecursive({ re: badNum, im: 0 }, { re: 1, im: 0 }),
				RangeError,
			)
			assert.throws(
				() => multiplyComplexRecursive({ re: 0, im: badNum }, { re: 1, im: 0 }),
				RangeError,
			)
			assert.throws(
				() => multiplyComplexRecursive({ re: 1, im: 0 }, { re: badNum, im: 0 }),
				RangeError,
			)
			assert.throws(
				() => multiplyComplexRecursive({ re: 1, im: 0 }, { re: 1, im: 0 }, { re: 0, im: badNum }),
				RangeError,
			)
		}
	})
})
