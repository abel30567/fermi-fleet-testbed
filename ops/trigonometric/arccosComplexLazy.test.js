import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arccosComplexLazy } from './arccosComplexLazy.js'

/**
 * Asserts two complex numbers are equal within an absolute/relative tolerance.
 */
function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const prefix = label ? `${label}: ` : ''
	const reScale = Math.max(1, Math.abs(expected.re))
	const imScale = Math.max(1, Math.abs(expected.im))
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * reScale,
		`${prefix}re mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * imScale,
		`${prefix}im mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

/**
 * Independent complex cosine: cos(u + iv) = cos(u)cosh(v) - i*sin(u)sinh(v).
 */
function independentComplexCos({ re: u, im: v }) {
	return {
		re: Math.cos(u) * Math.cosh(v),
		im: -Math.sin(u) * Math.sinh(v),
	}
}

/**
 * Independent naive formula: arccos(z) = -i * ln(z + i * sqrt(1 - z^2))
 * Valid and well-conditioned for moderate complex values away from overflow/cancellation.
 */
function independentNaiveArccos({ re: x, im: y }) {
	// w = 1 - z^2 = (1 - (x^2 - y^2)) - i*(2xy)
	const wre = 1 - (x * x - y * y)
	const wim = -2 * x * y
	// principal sqrt(w)
	const r = Math.hypot(wre, wim)
	const sre = Math.sqrt((r + wre) / 2)
	const sim = (wim < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (r - wre) / 2))
	// u = z + i * sqrt(1 - z^2) = (x - sim) + i*(y + sre)
	const ure = x - sim
	const uim = y + sre
	// ln(u) = ln|u| + i*atan2(uim, ure)
	const logRe = Math.log(Math.hypot(ure, uim))
	const logIm = Math.atan2(uim, ure)
	// -i * (logRe + i*logIm) = logIm - i*logRe
	return { re: logIm, im: -logRe }
}

describe('arccosComplexLazy', () => {
	describe('normal cases', () => {
		it('matches real Math.acos on [-1, 1] with zero imaginary part', () => {
			const inputs = [-1, -0.75, -0.5, 0, 0.25, 0.5, 1].map((re) => ({ re, im: 0 }))
			const outputs = [...arccosComplexLazy(inputs)]

			assert.equal(outputs.length, inputs.length)
			for (let i = 0; i < inputs.length; i++) {
				assertComplexClose(outputs[i], { re: Math.acos(inputs[i].re), im: 0 }, 1e-15, `x=${inputs[i].re}`)
				assert.ok(!Object.is(outputs[i].im, -0), 'imaginary zero should be normalized to +0')
			}
		})

		it('computes exact values on the pure imaginary axis: pi/2 - i*asinh(y)', () => {
			const ys = [-10, -2, -0.5, 0.5, 1, 3.5, 100]
			const outputs = [...arccosComplexLazy(ys.map((im) => ({ re: 0, im })))]

			for (let i = 0; i < ys.length; i++) {
				assertComplexClose(
					outputs[i],
					{ re: Math.PI / 2, im: -Math.asinh(ys[i]) },
					1e-13,
					`y=${ys[i]}`
				)
			}
		})

		it('computes values across all four quadrants and accepts different iterable types', () => {
			const set = new Set([
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
				{ re: 1, im: -1 },
			])
			const results = [...arccosComplexLazy(set)]
			assert.equal(results.length, 4)

			// Verify signs of imaginary parts and real range [0, pi]
			assert.ok(results[0].re > 0 && results[0].re < Math.PI / 2 && results[0].im < 0)
			assert.ok(results[1].re > Math.PI / 2 && results[1].re < Math.PI && results[1].im < 0)
			assert.ok(results[2].re > Math.PI / 2 && results[2].re < Math.PI && results[2].im > 0)
			assert.ok(results[3].re > 0 && results[3].re < Math.PI / 2 && results[3].im > 0)

			for (const [idx, z] of [...set].entries()) {
				assertComplexClose(independentComplexCos(results[idx]), z, 1e-13, `quadrant ${idx + 1}`)
			}
		})
	})

	describe('edge cases', () => {
		it('handles an empty iterable', () => {
			assert.deepEqual([...arccosComplexLazy([])], [])
		})

		it('handles branch cuts on the real axis for |x| > 1 with +0 and -0', () => {
			const cases = [
				{ input: { re: 2, im: 0 }, expected: { re: 0, im: -Math.acosh(2) } },
				{ input: { re: 2, im: -0 }, expected: { re: 0, im: Math.acosh(2) } },
				{ input: { re: -2, im: 0 }, expected: { re: Math.PI, im: -Math.acosh(2) } },
				{ input: { re: -2, im: -0 }, expected: { re: Math.PI, im: Math.acosh(2) } },
				{ input: { re: 10, im: 0 }, expected: { re: 0, im: -Math.acosh(10) } },
				{ input: { re: -10, im: -0 }, expected: { re: Math.PI, im: Math.acosh(10) } },
			]

			const results = [...arccosComplexLazy(cases.map((c) => c.input))]
			for (let i = 0; i < cases.length; i++) {
				assertComplexClose(results[i], cases[i].expected, 1e-13, `branch cut case ${i}`)
			}
		})

		it('preserves accuracy near branch points z = +/- 1 and tiny imaginary parts', () => {
			const cases = [
				{ re: 1, im: 1e-10 },
				{ re: 1, im: -1e-10 },
				{ re: -1, im: 1e-10 },
				{ re: -1, im: -1e-10 },
				{ re: 2, im: 1e-12 },
				{ re: -2, im: -1e-12 },
			]
			const results = [...arccosComplexLazy(cases)]
			for (let i = 0; i < cases.length; i++) {
				assertComplexClose(independentComplexCos(results[i]), cases[i], 1e-12, `near branch ${i}`)
			}
		})

		it('handles very large magnitudes without overflow', () => {
			const cases = [
				{ re: 1e200, im: 0, expRe: 0, expIm: -(Math.LN2 + Math.log(1e200)) },
				{ re: -1e200, im: 0, expRe: Math.PI, expIm: -(Math.LN2 + Math.log(1e200)) },
				{ re: 0, im: 1e200, expRe: Math.PI / 2, expIm: -(Math.LN2 + Math.log(1e200)) },
				{ re: 0, im: -1e200, expRe: Math.PI / 2, expIm: Math.LN2 + Math.log(1e200) },
				{
					re: 1e305,
					im: 1e305,
					expRe: Math.PI / 4,
					expIm: -(Math.LN2 + Math.log(1e305) + Math.log(Math.SQRT2)),
				},
			]

			const results = [...arccosComplexLazy(cases.map(({ re, im }) => ({ re, im })))]
			for (let i = 0; i < cases.length; i++) {
				assert.ok(Number.isFinite(results[i].re) && Number.isFinite(results[i].im))
				assertComplexClose(
					results[i],
					{ re: cases[i].expRe, im: cases[i].expIm },
					1e-12,
					`large magnitude ${i}`
				)
			}
		})

		it('validates top-level iterable eagerly and element structure/finiteness lazily', () => {
			for (const bad of [null, undefined, 42, true, '123', { re: 0.5, im: 0 }]) {
				assert.throws(() => arccosComplexLazy(bad), TypeError)
			}

			// Invalid element types throw TypeError when pulled
			for (const badItem of [null, undefined, 1, 'x', [1, 2], { re: '1', im: 0 }, { re: 1 }]) {
				const gen = arccosComplexLazy([badItem])
				assert.throws(() => gen.next(), TypeError)
			}

			// Non-finite numbers throw RangeError when pulled
			for (const badItem of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
			]) {
				const gen = arccosComplexLazy([badItem])
				assert.throws(() => gen.next(), RangeError)
			}
		})
	})

	describe('lazy consumption verification', () => {
		it('pulls elements one-by-one on demand and supports infinite streams', () => {
			let produced = 0
			let closed = false

			function* infiniteStream() {
				try {
					while (true) {
						produced++
						yield { re: produced * 0.1, im: produced * 0.2 }
					}
				} finally {
					closed = true
				}
			}

			const gen = arccosComplexLazy(infiniteStream())
			assert.equal(produced, 0, 'must not pull before first next()')

			const first = gen.next()
			assert.equal(produced, 1, 'must pull exactly 1 element on first next()')
			assert.equal(first.done, false)
			assertComplexClose(independentComplexCos(first.value), { re: 0.1, im: 0.2 }, 1e-13)

			const second = gen.next()
			assert.equal(produced, 2, 'must pull exactly 1 additional element on second next()')
			assert.equal(second.done, false)
			assertComplexClose(independentComplexCos(second.value), { re: 0.2, im: 0.4 }, 1e-13)

			// Closing early stops pulling and runs upstream finally block
			gen.return()
			assert.equal(produced, 2, 'must not pull after return()')
			assert.equal(closed, true, 'must close upstream iterator on early termination')
		})

		it('defers element validation until the invalid element is actually reached', () => {
			let pulled = 0
			function* streamWithLateError() {
				pulled++
				yield { re: 0, im: 0 }
				pulled++
				yield { re: 1, im: 0 }
				pulled++
				yield { re: NaN, im: 0 }
			}

			const gen = arccosComplexLazy(streamWithLateError())
			assert.equal(pulled, 0)

			assertComplexClose(gen.next().value, { re: Math.PI / 2, im: 0 }, 1e-15)
			assert.equal(pulled, 1)

			assertComplexClose(gen.next().value, { re: 0, im: 0 }, 1e-15)
			assert.equal(pulled, 2)

			assert.throws(() => gen.next(), RangeError)
			assert.equal(pulled, 3)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies cos(arccos(z)) === z, reflection, conjugate symmetry, and naive log formula', () => {
			const samples = [
				{ re: 0.3, im: 0.4 },
				{ re: -0.6, im: 0.8 },
				{ re: -1.5, im: -2.25 },
				{ re: 2.5, im: -0.75 },
				{ re: 0.01, im: -0.02 },
				{ re: 3.1, im: 4.2 },
				{ re: -4.5, im: 1.2 },
				{ re: 0.99, im: 0.05 },
			]

			const results = [...arccosComplexLazy(samples)]
			const negResults = [...arccosComplexLazy(samples.map(({ re, im }) => ({ re: -re, im: -im })))]
			const conjResults = [...arccosComplexLazy(samples.map(({ re, im }) => ({ re, im: -im })))]

			for (let i = 0; i < samples.length; i++) {
				const z = samples[i]
				const w = results[i]

				// 1. Principal range: Re(arccos(z)) in [0, pi]
				assert.ok(w.re >= 0 && w.re <= Math.PI, `Re out of [0, pi] for sample ${i}`)

				// 2. Inverse identity: cos(arccos(z)) = z
				assertComplexClose(independentComplexCos(w), z, 1e-12, `cos(arccos(z)) sample ${i}`)

				// 3. Reflection identity: arccos(z) + arccos(-z) = pi
				assertComplexClose(
					{ re: w.re + negResults[i].re, im: w.im + negResults[i].im },
					{ re: Math.PI, im: 0 },
					1e-12,
					`reflection sample ${i}`
				)

				// 4. Schwarz conjugate symmetry: arccos(conj(z)) = conj(arccos(z))
				assertComplexClose(
					conjResults[i],
					{ re: w.re, im: -w.im },
					1e-12,
					`conjugate symmetry sample ${i}`
				)

				// 5. Agreement with independent naive logarithmic formula
				assertComplexClose(w, independentNaiveArccos(z), 1e-12, `naive log formula sample ${i}`)
			}
		})
	})
})
