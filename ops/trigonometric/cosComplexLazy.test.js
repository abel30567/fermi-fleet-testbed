import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosComplexLazy } from './cosComplexLazy.js'

/**
 * Asserts two complex numbers are equal within a tolerance.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-12]
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: got ${actual.re}, expected ${expected.re} (tol ${eps})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag part mismatch: got ${actual.im}, expected ${expected.im} (tol ${eps})`,
	)
}

/**
 * Independent reference implementation via Taylor series:
 *   cos(z) = sum_{n=0..N} (-1)^n * z^(2n) / (2n)!
 * Uses only basic arithmetic (no Math.cos/sin/cosh/sinh/exp).
 *
 * @param {{ re: number, im: number }} z
 * @param {number} [terms=30]
 * @returns {{ re: number, im: number }}
 */
function cosComplexTaylor(z, terms = 30) {
	// z^2 = (a + bi)^2 = (a^2 - b^2) + (2ab)i
	const z2Re = z.re * z.re - z.im * z.im
	const z2Im = 2 * z.re * z.im

	let sumRe = 1
	let sumIm = 0
	let termRe = 1
	let termIm = 0

	for (let n = 1; n <= terms; n++) {
		const denom = (2 * n - 1) * (2 * n)
		// term = -term * z^2 / ((2n-1)*(2n))
		const nextRe = -(termRe * z2Re - termIm * z2Im) / denom
		const nextIm = -(termRe * z2Im + termIm * z2Re) / denom
		termRe = nextRe
		termIm = nextIm
		sumRe += termRe
		sumIm += termIm
	}

	return { re: sumRe, im: sumIm }
}

/**
 * Independent reference implementation via Euler's formula:
 *   cos(z) = (exp(i*z) + exp(-i*z)) / 2
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function cosComplexEuler(z) {
	const expNegIm = Math.exp(-z.im)
	const expPosIm = Math.exp(z.im)
	return {
		re: 0.5 * (expNegIm + expPosIm) * Math.cos(z.re),
		im: 0.5 * (expNegIm - expPosIm) * Math.sin(z.re),
	}
}

describe('cosComplexLazy', () => {
	test('computes standard complex values from an array', () => {
		const inputs = [
			{ re: 0, im: 0 },
			{ re: Math.PI, im: 0 },
			{ re: Math.PI / 2, im: 0 },
			{ re: 0, im: 1 },
			{ re: 1, im: 1 },
			{ re: -2.3, im: 0.7 },
		]

		const results = [...cosComplexLazy(inputs)]
		assert.equal(results.length, inputs.length)

		assert.deepStrictEqual(results[0], { re: 1, im: 0 })
		assertComplexClose(results[1], { re: -1, im: 0 })
		assertComplexClose(results[2], { re: 0, im: 0 })
		assertComplexClose(results[3], { re: Math.cosh(1), im: 0 })
		assertComplexClose(results[4], {
			re: Math.cos(1) * Math.cosh(1),
			im: -Math.sin(1) * Math.sinh(1),
		})
		assertComplexClose(results[5], {
			re: Math.cos(-2.3) * Math.cosh(0.7),
			im: -Math.sin(-2.3) * Math.sinh(0.7),
		})
	})

	test('accepts a single complex number object as well as non-array iterables', () => {
		const single = [...cosComplexLazy({ re: 0, im: 0 })]
		assert.deepStrictEqual(single, [{ re: 1, im: 0 }])

		const setInput = new Set([
			{ re: 0, im: 2 },
			{ re: 1, im: -1 },
		])
		const setResults = [...cosComplexLazy(setInput)]
		assert.equal(setResults.length, 2)
		assertComplexClose(setResults[0], { re: Math.cosh(2), im: 0 })
		assertComplexClose(setResults[1], {
			re: Math.cos(1) * Math.cosh(-1),
			im: -Math.sin(1) * Math.sinh(-1),
		})

		const customIterable = {
			*[Symbol.iterator]() {
				yield { re: 0.5, im: -0.25 }
			},
		}
		const customResults = [...cosComplexLazy(customIterable)]
		assert.equal(customResults.length, 1)
		assertComplexClose(customResults[0], cosComplexTaylor({ re: 0.5, im: -0.25 }))
	})

	test('handles edge cases: empty iterable, signed zeros, and large imaginary overflow', () => {
		assert.deepStrictEqual([...cosComplexLazy([])], [])

		function* emptyGen() {}
		assert.deepStrictEqual([...cosComplexLazy(emptyGen())], [])

		// No -0 in output components
		const zeroRes = cosComplexLazy([{ re: -0, im: -0 }]).next().value
		assert.ok(Object.is(zeroRes.re, 1))
		assert.ok(Object.is(zeroRes.im, 0))

		const piRes = cosComplexLazy([{ re: Math.PI / 2, im: 0 }]).next().value
		assert.ok(Object.is(piRes.im, 0))

		// Large imaginary part with re = 0 must not produce NaN in imaginary part
		const largeIm = cosComplexLazy([{ re: 0, im: 1000 }]).next().value
		assert.equal(largeIm.re, Infinity)
		assert.ok(Object.is(largeIm.im, 0))
	})

	test('consumes iterables lazily one element at a time', () => {
		let produced = 0
		function* trackedSource() {
			const values = [
				{ re: 0, im: 0 },
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 1, im: 1 },
			]
			for (const v of values) {
				produced += 1
				yield v
			}
		}

		const stream = cosComplexLazy(trackedSource())
		assert.equal(produced, 0, 'must not consume any element before first .next()')

		const first = stream.next()
		assert.equal(produced, 1)
		assert.equal(first.done, false)
		assert.deepStrictEqual(first.value, { re: 1, im: 0 })

		const second = stream.next()
		assert.equal(produced, 2)
		assert.equal(second.done, false)
		assertComplexClose(second.value, { re: Math.cos(1), im: 0 })
	})

	test('supports infinite generators and closes upstream iterator on early break', () => {
		let pulled = 0
		let closed = false

		function* infiniteComplex() {
			try {
				let k = 0
				while (true) {
					pulled += 1
					yield { re: k * 0.25, im: k * 0.1 }
					k += 1
				}
			} finally {
				closed = true
			}
		}

		const taken = []
		for (const value of cosComplexLazy(infiniteComplex())) {
			taken.push(value)
			if (taken.length === 5) break
		}

		assert.equal(taken.length, 5)
		assert.equal(pulled, 5, 'must pull only as many elements as consumed')
		assert.equal(closed, true, 'must close upstream generator on early termination')
		for (let k = 0; k < 5; k++) {
			assertComplexClose(taken[k], cosComplexTaylor({ re: k * 0.25, im: k * 0.1 }))
		}
	})

	test('cross-checks against independent Taylor series and Euler formula', () => {
		const samples = [
			{ re: 0.3, im: 0.4 },
			{ re: -1.2, im: 0.8 },
			{ re: 2.1, im: -1.5 },
			{ re: -0.75, im: -0.9 },
			{ re: 3.14, im: 2.0 },
		]

		const actual = [...cosComplexLazy(samples)]
		for (let i = 0; i < samples.length; i++) {
			assertComplexClose(actual[i], cosComplexTaylor(samples[i]), 1e-12)
			assertComplexClose(actual[i], cosComplexEuler(samples[i]), 1e-12)
		}
	})

	test('satisfies complex algebraic identities: parity, conjugate, periodicity, double-angle', () => {
		const z = { re: 0.85, im: -1.15 }
		const [cosZ, cosNegZ, cosConjZ, cosShiftZ, cos2Z] = [
			...cosComplexLazy([
				z,
				{ re: -z.re, im: -z.im },
				{ re: z.re, im: -z.im },
				{ re: z.re + 2 * Math.PI, im: z.im },
				{ re: 2 * z.re, im: 2 * z.im },
			]),
		]

		// Evenness: cos(-z) = cos(z)
		assertComplexClose(cosNegZ, cosZ)

		// Conjugate symmetry: cos(conj(z)) = conj(cos(z))
		assertComplexClose(cosConjZ, { re: cosZ.re, im: -cosZ.im })

		// 2*pi periodicity: cos(z + 2*pi) = cos(z)
		assertComplexClose(cosShiftZ, cosZ, 1e-11)

		// Double-angle identity: cos(2z) = 2*cos(z)^2 - 1
		const cosZSqRe = cosZ.re * cosZ.re - cosZ.im * cosZ.im
		const cosZSqIm = 2 * cosZ.re * cosZ.im
		assertComplexClose(cos2Z, { re: 2 * cosZSqRe - 1, im: 2 * cosZSqIm }, 1e-11)
	})

	test('validates top-level input eagerly and stream elements lazily', () => {
		// Eager top-level validation
		for (const bad of [null, undefined, 42, '1+2i', true, {}, { re: 1 }, { re: '1', im: 0 }]) {
			assert.throws(() => cosComplexLazy(bad), TypeError)
		}
		assert.throws(() => cosComplexLazy({ re: NaN, im: 0 }), RangeError)
		assert.throws(() => cosComplexLazy({ re: 0, im: Infinity }), RangeError)
		assert.throws(() => cosComplexLazy({ re: -Infinity, im: 0 }), RangeError)

		// Lazy per-element validation in streams
		function* streamWithBadThird() {
			yield { re: 0, im: 0 }
			yield { re: 1, im: 0 }
			yield { re: NaN, im: 1 }
		}

		const gen = cosComplexLazy(streamWithBadThird())
		assert.deepStrictEqual(gen.next().value, { re: 1, im: 0 })
		assertComplexClose(gen.next().value, { re: Math.cos(1), im: 0 })
		assert.throws(() => gen.next(), RangeError)

		const badTypeGen = cosComplexLazy([{ re: 0, im: 0 }, [1, 2]])
		assert.deepStrictEqual(badTypeGen.next().value, { re: 1, im: 0 })
		assert.throws(() => badTypeGen.next(), TypeError)
	})
})
