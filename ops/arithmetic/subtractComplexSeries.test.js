import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractComplexSeries } from './subtractComplexSeries.js'

/**
 * Independent helper: approximates `e^(i*pi)` directly from its truncated
 * Maclaurin series `sum_{k=0..N} (i*pi)^k / k!` and computes `a + e^(i*pi) * b`.
 */
function subtractViaTruncatedEulerSeries(a, b, terms = 40) {
	// Start with k = 0 term: 1 + 0i
	let expRe = 0
	let expIm = 0
	let termRe = 1
	let termIm = 0

	for (let k = 0; k < terms; k++) {
		expRe += termRe
		expIm += termIm
		// Multiply current term by (i * pi) / (k + 1):
		// (termRe + i*termIm) * (i*pi) = (-termIm * pi) + i*(termRe * pi)
		const nextRe = (-termIm * Math.PI) / (k + 1)
		const nextIm = (termRe * Math.PI) / (k + 1)
		termRe = nextRe
		termIm = nextIm
	}

	// a + exp(i*pi) * b
	const prodRe = expRe * b.re - expIm * b.im
	const prodIm = expRe * b.im + expIm * b.re
	return { re: a.re + prodRe, im: a.im + prodIm }
}

/**
 * Independent helper: computes `a - b` in polar coordinates by rotating `b` by `pi`
 * and converting back to Cartesian coordinates.
 */
function subtractViaPolarRotation(a, b) {
	const r1 = Math.hypot(a.re, a.im)
	const theta1 = Math.atan2(a.im, a.re)
	const r2 = Math.hypot(b.re, b.im)
	const theta2 = Math.atan2(b.im, b.re) + Math.PI
	return {
		re: r1 * Math.cos(theta1) + r2 * Math.cos(theta2),
		im: r1 * Math.sin(theta1) + r2 * Math.sin(theta2),
	}
}

describe('subtractComplexSeries', () => {
	test('subtracts basic positive complex numbers', () => {
		assert.deepEqual(
			subtractComplexSeries({ re: 5, im: 7 }, { re: 2, im: 3 }),
			{ re: 3, im: 4 }
		)
	})

	test('subtracts negative and mixed-sign complex numbers', () => {
		assert.deepEqual(
			subtractComplexSeries({ re: -4, im: 2.5 }, { re: 3, im: -6.5 }),
			{ re: -7, im: 9 }
		)
		assert.deepEqual(
			subtractComplexSeries({ re: -10, im: -20 }, { re: -3, im: -5 }),
			{ re: -7, im: -15 }
		)
	})

	test('handles purely real and purely imaginary numbers', () => {
		assert.deepEqual(
			subtractComplexSeries({ re: 12, im: 0 }, { re: 5, im: 0 }),
			{ re: 7, im: 0 }
		)
		assert.deepEqual(
			subtractComplexSeries({ re: 0, im: 8 }, { re: 0, im: 11 }),
			{ re: 0, im: -3 }
		)
		assert.deepEqual(
			subtractComplexSeries({ re: 4, im: 0 }, { re: 0, im: 9 }),
			{ re: 4, im: -9 }
		)
	})

	test('handles additive identity (zero) and self-subtraction', () => {
		const z = { re: 3.14, im: -2.71 }
		assert.deepEqual(subtractComplexSeries(z, { re: 0, im: 0 }), z)
		assert.deepEqual(subtractComplexSeries({ re: 0, im: 0 }, z), { re: -3.14, im: 2.71 })
		assert.deepEqual(subtractComplexSeries(z, z), { re: 0, im: 0 })
	})

	test('normalizes -0 to +0 in results', () => {
		const res1 = subtractComplexSeries({ re: -0, im: -0 }, { re: 0, im: 0 })
		assert.equal(Object.is(res1.re, 0), true)
		assert.equal(Object.is(res1.im, 0), true)

		const res2 = subtractComplexSeries({ re: 0, im: -0 }, { re: 0, im: -0 })
		assert.equal(Object.is(res2.re, 0), true)
		assert.equal(Object.is(res2.im, 0), true)

		const res3 = subtractComplexSeries({ re: 5, im: -3 }, { re: 5, im: -3 })
		assert.equal(Object.is(res3.re, 0), true)
		assert.equal(Object.is(res3.im, 0), true)
	})

	test('handles subnormal, very small, and large finite values without mutating inputs', () => {
		const a = Object.freeze({ re: Number.MIN_VALUE, im: -1e-300 })
		const b = Object.freeze({ re: 0, im: 1e-300 })
		const diff = subtractComplexSeries(a, b)
		assert.deepEqual(diff, { re: Number.MIN_VALUE, im: -2e-300 })

		const bigA = { re: 1e307, im: -1e307 }
		const bigB = { re: 5e306, im: -5e306 }
		assert.deepEqual(subtractComplexSeries(bigA, bigB), { re: 5e306, im: -5e306 })
	})

	test('ignores extra properties on input objects and returns a clean { re, im }', () => {
		const res = subtractComplexSeries(
			{ re: 4, im: 6, label: 'z1' },
			{ re: 1, im: 2, extra: true }
		)
		assert.deepEqual(res, { re: 3, im: 4 })
		assert.deepEqual(Object.keys(res).sort(), ['im', 're'])
	})

	test('throws TypeError on invalid object shapes or non-numeric components', () => {
		const badInputs = [
			null,
			undefined,
			42,
			'1+2i',
			true,
			[1, 2],
			{},
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 2 },
			{ re: 1, im: null },
			{ re: 1n, im: 2 },
			{ re: 1, im: undefined },
		]

		for (const bad of badInputs) {
			assert.throws(() => subtractComplexSeries(bad, { re: 0, im: 0 }), TypeError)
			assert.throws(() => subtractComplexSeries({ re: 0, im: 0 }, bad), TypeError)
		}
	})

	test('throws RangeError on non-finite input components and overflow', () => {
		const nonFinite = [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 1 },
			{ re: 1, im: -Infinity },
		]

		for (const bad of nonFinite) {
			assert.throws(() => subtractComplexSeries(bad, { re: 1, im: 1 }), RangeError)
			assert.throws(() => subtractComplexSeries({ re: 1, im: 1 }, bad), RangeError)
		}

		// Overflow: 1e308 - (-1e308) = Infinity
		assert.throws(
			() => subtractComplexSeries({ re: 1e308, im: 0 }, { re: -1e308, im: 0 }),
			RangeError
		)
		assert.throws(
			() => subtractComplexSeries({ re: 0, im: -1e308 }, { re: 0, im: 1e308 }),
			RangeError
		)
	})

	test('independent cross-check: matches truncated Euler Maclaurin series and polar rotation', () => {
		const pairs = [
			[{ re: 3, im: 4 }, { re: 1, im: 2 }],
			[{ re: -7.5, im: 2.25 }, { re: 4.125, im: -9.5 }],
			[{ re: 0.1, im: -0.3 }, { re: -0.7, im: 0.9 }],
			[{ re: 100, im: -250 }, { re: -35, im: 420 }],
		]

		for (const [a, b] of pairs) {
			const actual = subtractComplexSeries(a, b)
			const fromSeries = subtractViaTruncatedEulerSeries(a, b)
			const fromPolar = subtractViaPolarRotation(a, b)

			assert.ok(Math.abs(actual.re - fromSeries.re) < 1e-12)
			assert.ok(Math.abs(actual.im - fromSeries.im) < 1e-12)
			assert.ok(Math.abs(actual.re - fromPolar.re) < 1e-11)
			assert.ok(Math.abs(actual.im - fromPolar.im) < 1e-11)
		}
	})

	test('independent cross-check: satisfies algebraic field identities', () => {
		const a = { re: 6.25, im: -3.5 }
		const b = { re: -2.75, im: 4.5 }
		const diff = subtractComplexSeries(a, b)

		// Anticommutativity: a - b = -(b - a)
		const rev = subtractComplexSeries(b, a)
		assert.deepEqual(diff, { re: -rev.re, im: -rev.im })

		// Inverse of addition: (a - b) + b = a
		assert.equal(diff.re + b.re, a.re)
		assert.equal(diff.im + b.im, a.im)

		// Conjugation linearity: conj(a - b) = conj(a) - conj(b)
		const conjDiff = subtractComplexSeries({ re: a.re, im: -a.im }, { re: b.re, im: -b.im })
		assert.deepEqual(conjDiff, { re: diff.re, im: -diff.im })

		// Law of cosines / modulus squared: |a - b|^2 = |a|^2 + |b|^2 - 2*Re(a * conj(b))
		const lhs = diff.re ** 2 + diff.im ** 2
		const rhs =
			(a.re ** 2 + a.im ** 2) +
			(b.re ** 2 + b.im ** 2) -
			2 * (a.re * b.re + a.im * b.im)
		assert.ok(Math.abs(lhs - rhs) < 1e-12)
	})
})
