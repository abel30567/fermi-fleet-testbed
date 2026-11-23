import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtComplexLazy } from './sqrtComplexLazy.js'

/**
 * Asserts two complex numbers are within tolerance on both components.
 */
function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.equal(typeof actual, 'object', `${prefix}expected object`)
	assert.notEqual(actual, null, `${prefix}expected non-null object`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}re mismatch: got ${actual.re}, expected ${expected.re} (tol ${tol})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}im mismatch: got ${actual.im}, expected ${expected.im} (tol ${tol})`
	)
}

/**
 * Independent complex multiplication helper for squaring cross-checks.
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Independent polar-form principal square root for cross-checking normal-range inputs.
 */
function sqrtComplexPolar({ re, im }) {
	const r = Math.hypot(re, im)
	if (r === 0) {
		return { re: 0, im: 0 }
	}
	const halfTheta = Math.atan2(im, re) / 2
	const sqrtR = Math.sqrt(r)
	return {
		re: sqrtR * Math.cos(halfTheta),
		im: sqrtR * Math.sin(halfTheta),
	}
}

describe('sqrtComplexLazy', () => {
	describe('normal cases', () => {
		it('computes principal square roots for positive reals, negative reals, and purely imaginary values', () => {
			const inputs = [
				{ re: 0, im: 0 },
				{ re: 1, im: 0 },
				{ re: 4, im: 0 },
				{ re: 9, im: 0 },
				{ re: -1, im: 0 },
				{ re: -4, im: 0 },
				{ re: 0, im: 2 },
				{ re: 0, im: -2 },
				{ re: 0, im: 1 },
				{ re: 0, im: -1 },
			]
			const expected = [
				{ re: 0, im: 0 },
				{ re: 1, im: 0 },
				{ re: 2, im: 0 },
				{ re: 3, im: 0 },
				{ re: 0, im: 1 },
				{ re: 0, im: 2 },
				{ re: 1, im: 1 },
				{ re: 1, im: -1 },
				{ re: Math.SQRT1_2, im: Math.SQRT1_2 },
				{ re: Math.SQRT1_2, im: -Math.SQRT1_2 },
			]

			const results = [...sqrtComplexLazy(inputs)]
			assert.equal(results.length, expected.length)
			for (let i = 0; i < expected.length; i++) {
				assertComplexClose(results[i], expected[i], 1e-15, `index ${i}`)
			}
		})

		it('computes exact Pythagorean complex roots across all four quadrants', () => {
			const cases = [
				{ in: { re: 3, im: 4 }, out: { re: 2, im: 1 } },
				{ in: { re: 3, im: -4 }, out: { re: 2, im: -1 } },
				{ in: { re: -3, im: 4 }, out: { re: 1, im: 2 } },
				{ in: { re: -3, im: -4 }, out: { re: 1, im: -2 } },
				{ in: { re: 5, im: 12 }, out: { re: 3, im: 2 } },
				{ in: { re: -7, im: -24 }, out: { re: 3, im: -4 } },
			]

			const results = [...sqrtComplexLazy(cases.map((c) => c.in))]
			assert.equal(results.length, cases.length)
			for (let i = 0; i < cases.length; i++) {
				assertComplexClose(results[i], cases[i].out, 1e-14, `quadrant case ${i}`)
			}
		})

		it('accepts diverse iterable types (Set, generator, custom iterable)', () => {
			const setInput = new Set([
				{ re: 3, im: 4 },
				{ re: -4, im: 0 },
			])
			assert.deepEqual([...sqrtComplexLazy(setInput)], [
				{ re: 2, im: 1 },
				{ re: 0, im: 2 },
			])

			function* genInput() {
				yield { re: 0, im: 2 }
				yield { re: 0, im: -2 }
			}
			assert.deepEqual([...sqrtComplexLazy(genInput())], [
				{ re: 1, im: 1 },
				{ re: 1, im: -1 },
			])

			const customIterable = {
				[Symbol.iterator]() {
					const items = [{ re: 9, im: 0 }]
					let idx = 0
					return {
						next() {
							if (idx < items.length) {
								return { value: items[idx++], done: false }
							}
							return { value: undefined, done: true }
						},
					}
				},
			}
			assert.deepEqual([...sqrtComplexLazy(customIterable)], [{ re: 3, im: 0 }])
		})
	})

	describe('edge cases and numerical stability', () => {
		it('handles empty iterables', () => {
			const gen = sqrtComplexLazy([])
			assert.deepEqual(gen.next(), { value: undefined, done: true })
			assert.deepEqual([...sqrtComplexLazy([])], [])
		})

		it('normalizes negative zero to positive zero', () => {
			const results = [
				...sqrtComplexLazy([
					{ re: -0, im: -0 },
					{ re: 4, im: -0 },
					{ re: -4, im: -0 },
				]),
			]
			assert.ok(Object.is(results[0].re, 0))
			assert.ok(Object.is(results[0].im, 0))
			assert.ok(Object.is(results[1].re, 2))
			assert.ok(Object.is(results[1].im, 0))
			assert.ok(Object.is(results[2].re, 0))
			assert.ok(Object.is(results[2].im, 2))
		})

		it('avoids catastrophic cancellation near the negative and positive real axes', () => {
			const [negPos, negNeg, posPos] = [
				...sqrtComplexLazy([
					{ re: -1e16, im: 1e-8 },
					{ re: -1e16, im: -1e-8 },
					{ re: 1e16, im: 1e-8 },
				]),
			]

			assertComplexClose(negPos, { re: 5e-17, im: 1e8 }, 1e-30, 'near -real (+im)')
			assertComplexClose(negNeg, { re: 5e-17, im: -1e8 }, 1e-30, 'near -real (-im)')
			assertComplexClose(posPos, { re: 1e8, im: 5e-17 }, 1e-30, 'near +real (+im)')
		})

		it('handles extreme magnitudes without overflow or subnormal underflow', () => {
			const huge = { re: Number.MAX_VALUE, im: Number.MAX_VALUE }
			const hugeNeg = { re: -1e308, im: 0 }
			const tiny = { re: Number.MIN_VALUE, im: 0 }
			const tinyNeg = { re: -Number.MIN_VALUE, im: Number.MIN_VALUE }

			const [rHuge, rHugeNeg, rTiny, rTinyNeg] = [
				...sqrtComplexLazy([huge, hugeNeg, tiny, tinyNeg]),
			]

			assert.ok(Number.isFinite(rHuge.re) && Number.isFinite(rHuge.im))
			assert.ok(rHuge.re > 0 && rHuge.im > 0)
			// Compare scaled-down square against scaled-down input to avoid overflow during verification
			const sHuge = { re: rHuge.re * 1e-100, im: rHuge.im * 1e-100 }
			const sHugeSq = mulComplex(sHuge, sHuge)
			assert.ok(Math.abs(sHugeSq.re - huge.re * 1e-200) / (huge.re * 1e-200) < 1e-14)
			assert.ok(Math.abs(sHugeSq.im - huge.im * 1e-200) / (huge.im * 1e-200) < 1e-14)

			assert.equal(rHugeNeg.re, 0)
			assert.ok(Math.abs(rHugeNeg.im - 1e154) / 1e154 < 1e-14)

			assert.ok(Number.isFinite(rTiny.re) && rTiny.re > 0)
			assert.equal(rTiny.im, 0)
			assert.ok(Math.abs(rTiny.re * rTiny.re - Number.MIN_VALUE) <= Number.MIN_VALUE)

			assert.ok(Number.isFinite(rTinyNeg.re) && rTinyNeg.re > 0)
			assert.ok(Number.isFinite(rTinyNeg.im) && rTinyNeg.im > 0)
			const sTiny = { re: rTinyNeg.re * 1e100, im: rTinyNeg.im * 1e100 }
			const sTinySq = mulComplex(sTiny, sTiny)
			const tinyScaled = Number.MIN_VALUE * 1e200
			assert.ok(Math.abs(sTinySq.re + tinyScaled) / tinyScaled < 1e-14)
			assert.ok(Math.abs(sTinySq.im - tinyScaled) / tinyScaled < 1e-14)
		})

		it('validates top-level input eagerly and elements lazily', () => {
			for (const bad of [null, undefined, 42, true, '123', {}, { re: 1, im: 2 }]) {
				assert.throws(() => sqrtComplexLazy(bad), TypeError)
			}

			const typeBadElements = [
				null,
				undefined,
				4,
				'4',
				[3, 4],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: '1' },
			]
			for (const el of typeBadElements) {
				const gen = sqrtComplexLazy([el])
				assert.throws(() => gen.next(), TypeError)
			}

			const rangeBadElements = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			]
			for (const el of rangeBadElements) {
				const gen = sqrtComplexLazy([el])
				assert.throws(() => gen.next(), RangeError)
			}
		})
	})

	describe('lazy consumption verification', () => {
		it('consumes items strictly one-by-one on demand and never pre-fetches', () => {
			let pulls = 0
			function* trackedSource() {
				const items = [
					{ re: 4, im: 0 },
					{ re: 3, im: 4 },
					{ re: -9, im: 0 },
				]
				for (const item of items) {
					pulls++
					yield item
				}
			}

			const gen = sqrtComplexLazy(trackedSource())
			assert.equal(pulls, 0, 'constructing generator must not pull any elements')

			const first = gen.next()
			assert.equal(pulls, 1)
			assert.deepEqual(first, { value: { re: 2, im: 0 }, done: false })

			const second = gen.next()
			assert.equal(pulls, 2)
			assert.deepEqual(second, { value: { re: 2, im: 1 }, done: false })

			const third = gen.next()
			assert.equal(pulls, 3)
			assert.deepEqual(third, { value: { re: 0, im: 3 }, done: false })

			const end = gen.next()
			assert.equal(pulls, 3)
			assert.deepEqual(end, { value: undefined, done: true })
		})

		it('streams from an infinite generator and closes it cleanly on early exit', () => {
			let pulled = 0
			let closed = false

			function* infiniteSquares() {
				try {
					let n = 1
					while (true) {
						pulled++
						yield { re: n * n, im: 0 }
						n++
					}
				} finally {
					closed = true
				}
			}

			const taken = []
			for (const root of sqrtComplexLazy(infiniteSquares())) {
				taken.push(root)
				if (taken.length === 5) {
					break
				}
			}

			assert.equal(pulled, 5)
			assert.equal(closed, true, 'breaking out of consumer loop must close source iterator')
			assert.deepEqual(taken, [
				{ re: 1, im: 0 },
				{ re: 2, im: 0 },
				{ re: 3, im: 0 },
				{ re: 4, im: 0 },
				{ re: 5, im: 0 },
			])
		})

		it('does not evaluate or validate unconsumed invalid elements', () => {
			let pulled = 0
			function* partiallyInvalid() {
				pulled++
				yield { re: 16, im: 0 }
				pulled++
				yield { re: -1, im: 0 }
				pulled++
				yield 'not-a-complex-number'
			}

			const gen = sqrtComplexLazy(partiallyInvalid())
			assert.deepEqual(gen.next().value, { re: 4, im: 0 })
			assert.deepEqual(gen.next().value, { re: 0, im: 1 })
			assert.equal(pulled, 2)
			assert.throws(() => gen.next(), TypeError)
			assert.equal(pulled, 3)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies algebraic identity (sqrt(z))^2 === z and matches polar form across a grid', () => {
			const coords = [-10, -2.5, -1, -0.1, 0, 0.1, 1, 2.5, 10]
			const grid = []
			for (const re of coords) {
				for (const im of coords) {
					grid.push({ re, im })
				}
			}

			const roots = [...sqrtComplexLazy(grid)]
			assert.equal(roots.length, grid.length)

			for (let i = 0; i < grid.length; i++) {
				const z = grid[i]
				const w = roots[i]

				// Principal branch invariants
				assert.ok(w.re >= 0, `Re(sqrt(z)) must be >= 0 for (${z.re}, ${z.im})`)
				if (z.im > 0) {
					assert.ok(w.im > 0, `Im(sqrt(z)) must be > 0 when im > 0 for (${z.re}, ${z.im})`)
				} else if (z.im < 0) {
					assert.ok(w.im < 0, `Im(sqrt(z)) must be < 0 when im < 0 for (${z.re}, ${z.im})`)
				} else if (z.re < 0) {
					assert.equal(w.re, 0)
					assert.ok(w.im > 0)
				}

				// Cross-check 1: Algebraic squaring w^2 = z
				const squared = mulComplex(w, w)
				const mag = Math.hypot(z.re, z.im)
				const sqTol = Math.max(1e-13, mag * 1e-13)
				assertComplexClose(squared, z, sqTol, `squaring (${z.re}, ${z.im})`)

				// Cross-check 2: Independent polar formula sqrt(r) * exp(i * atan2(im, re) / 2)
				const polar = sqrtComplexPolar(z)
				const polarTol = Math.max(1e-14, Math.sqrt(mag) * 1e-14)
				assertComplexClose(w, polar, polarTol, `polar (${z.re}, ${z.im})`)
			}
		})
	})
})
