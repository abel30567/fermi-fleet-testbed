import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gradientComplexLazy } from './gradientComplexLazy.js'

function assertComplexClose(actual, expected, tol = 1e-12, msg = '') {
	assert.equal(typeof actual, 'object', `${msg}: expected object`)
	assert.ok(actual !== null, `${msg}: expected non-null`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg}: re ${actual.re} !== ${expected.re} (tol=${tol})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg}: im ${actual.im} !== ${expected.im} (tol=${tol})`,
	)
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

describe('gradientComplexLazy', () => {
	describe('normal cases', () => {
		it('computes exact gradient of a linear complex sequence with default spacing 1', () => {
			// f(t) = (2 - 3i) * t + (5 + i) => f'(t) = 2 - 3i
			const samples = [0, 1, 2, 3, 4].map((t) => ({
				re: 2 * t + 5,
				im: -3 * t + 1,
			}))
			const result = Array.from(gradientComplexLazy(samples))
			assert.equal(result.length, 5)
			for (const g of result) {
				assertComplexClose(g, { re: 2, im: -3 })
			}
		})

		it('computes gradient with uniform non-unit real spacing', () => {
			// f(t) = t^2 + i * (3t^2 - 2t), h = 0.5
			// Interior central difference is exact for quadratics: f'(t) = 2t + i*(6t - 2)
			const h = 0.5
			const ts = [0, 0.5, 1.0, 1.5, 2.0]
			const samples = ts.map((t) => ({ re: t * t, im: 3 * t * t - 2 * t }))

			const grad1 = Array.from(gradientComplexLazy(samples, h))
			assert.equal(grad1.length, 5)
			// Boundary edgeOrder 1: forward / backward difference
			assertComplexClose(grad1[0], { re: 0.5, im: -0.5 })
			assertComplexClose(grad1[4], { re: 3.5, im: 8.5 })
			// Interior points exact
			for (let i = 1; i < 4; i++) {
				assertComplexClose(grad1[i], { re: 2 * ts[i], im: 6 * ts[i] - 2 })
			}

			// With edgeOrder: 2, even boundary points are exact for quadratics
			const grad2 = Array.from(gradientComplexLazy(samples, h, { edgeOrder: 2 }))
			assert.equal(grad2.length, 5)
			for (let i = 0; i < 5; i++) {
				assertComplexClose(grad2[i], { re: 2 * ts[i], im: 6 * ts[i] - 2 })
			}
		})

		it('supports complex scalar spacing along a complex direction', () => {
			// f(z) = z^2 along z_k = z0 + k * dz, dz = { re: 0.25, im: 0.5 }
			const z0 = { re: 1, im: -2 }
			const dz = { re: 0.25, im: 0.5 }
			const zs = [0, 1, 2, 3, 4].map((k) => ({
				re: z0.re + k * dz.re,
				im: z0.im + k * dz.im,
			}))
			const samples = zs.map((z) => cMul(z, z))

			const grad = Array.from(gradientComplexLazy(samples, dz, { edgeOrder: 2 }))
			assert.equal(grad.length, 5)
			for (let i = 0; i < zs.length; i++) {
				// Exact derivative f'(z) = 2z
				assertComplexClose(grad[i], { re: 2 * zs[i].re, im: 2 * zs[i].im })
			}
		})

		it('supports non-uniform real and complex coordinate iterables', () => {
			// f(z) = (1 + 2i) z^2 + (-3 + i) z + (4 - 5i)
			// f'(z) = (2 + 4i) z + (-3 + i)
			const a = { re: 1, im: 2 }
			const b = { re: -3, im: 1 }
			const c = { re: 4, im: -5 }
			const evalF = (z) => cAdd(cAdd(cMul(a, cMul(z, z)), cMul(b, z)), c)
			const evalDF = (z) => cAdd(cMul({ re: 2 * a.re, im: 2 * a.im }, z), b)

			// Non-uniform real coordinates
			const realCoords = [0, 0.2, 0.7, 1.8, 3.1, 5.0]
			const realSamples = realCoords.map((x) => evalF({ re: x, im: 0 }))
			const gradReal1 = Array.from(gradientComplexLazy(realSamples, realCoords))
			for (let i = 1; i < realCoords.length - 1; i++) {
				assertComplexClose(gradReal1[i], evalDF({ re: realCoords[i], im: 0 }), 1e-11)
			}
			const gradReal2 = Array.from(
				gradientComplexLazy(realSamples, realCoords, { edgeOrder: 2 }),
			)
			for (let i = 0; i < realCoords.length; i++) {
				assertComplexClose(gradReal2[i], evalDF({ re: realCoords[i], im: 0 }), 1e-11)
			}

			// Non-uniform complex coordinates
			const complexCoords = [
				{ re: 0, im: 0 },
				{ re: 0.3, im: 0.1 },
				{ re: 1.0, im: -0.4 },
				{ re: 2.2, im: 1.5 },
				{ re: 3.0, im: 2.8 },
			]
			const complexSamples = complexCoords.map(evalF)
			const gradComplex2 = Array.from(
				gradientComplexLazy(complexSamples, complexCoords, { edgeOrder: 2 }),
			)
			for (let i = 0; i < complexCoords.length; i++) {
				assertComplexClose(gradComplex2[i], evalDF(complexCoords[i]), 1e-11)
			}
		})

		it('supports options object as the second argument', () => {
			const samples = [0, 1, 2, 3].map((t) => ({ re: t * t, im: -t * t }))
			const grad = Array.from(gradientComplexLazy(samples, { spacing: 1, edgeOrder: 2 }))
			assert.equal(grad.length, 4)
			for (let t = 0; t < 4; t++) {
				assertComplexClose(grad[t], { re: 2 * t, im: -2 * t })
			}

			const gradDefault = Array.from(gradientComplexLazy(samples, {}))
			assert.equal(gradDefault.length, 4)
			assertComplexClose(gradDefault[1], { re: 2, im: -2 })
		})
	})

	describe('edge cases', () => {
		it('yields nothing for an empty iterable (uniform and non-uniform)', () => {
			assert.deepEqual(Array.from(gradientComplexLazy([])), [])
			assert.deepEqual(Array.from(gradientComplexLazy([], 0.5, { edgeOrder: 2 })), [])
			assert.deepEqual(Array.from(gradientComplexLazy([], [])), [])
		})

		it('handles exact minimum lengths: 2 elements for edgeOrder 1, 3 for edgeOrder 2', () => {
			const two = [
				{ re: 1, im: 2 },
				{ re: 4, im: -4 },
			]
			const g2 = Array.from(gradientComplexLazy(two, 3))
			assert.deepEqual(g2, [
				{ re: 1, im: -2 },
				{ re: 1, im: -2 },
			])

			const three = [
				{ re: 0, im: 0 },
				{ re: 1, im: 2 },
				{ re: 4, im: 8 },
			]
			const g3 = Array.from(gradientComplexLazy(three, 1, { edgeOrder: 2 }))
			assert.equal(g3.length, 3)
			assertComplexClose(g3[0], { re: 0, im: 0 })
			assertComplexClose(g3[1], { re: 2, im: 4 })
			assertComplexClose(g3[2], { re: 4, im: 8 })
		})

		it('handles constant sequence and normalizes -0 to 0', () => {
			const constant = [
				{ re: 7, im: -3 },
				{ re: 7, im: -3 },
				{ re: 7, im: -3 },
			]
			const result = Array.from(gradientComplexLazy(constant, -1, { edgeOrder: 2 }))
			for (const g of result) {
				assert.ok(Object.is(g.re, 0))
				assert.ok(Object.is(g.im, 0))
			}
		})

		it('handles negative spacing and descending coordinates', () => {
			// f(t) = 3t - 2i*t sampled at t = 4, 3, 2, 1 (dx = -1)
			const ts = [4, 3, 2, 1]
			const samples = ts.map((t) => ({ re: 3 * t, im: -2 * t }))
			for (const g of gradientComplexLazy(samples, -1)) {
				assertComplexClose(g, { re: 3, im: -2 })
			}
			for (const g of gradientComplexLazy(samples, ts, { edgeOrder: 2 })) {
				assertComplexClose(g, { re: 3, im: -2 })
			}
		})

		it('avoids intermediate overflow in complex division for large magnitudes', () => {
			const big = 1e200
			const samples = [
				{ re: 0, im: 0 },
				{ re: big, im: big },
				{ re: 2 * big, im: 2 * big },
			]
			const step = { re: big, im: big }
			const grad = Array.from(gradientComplexLazy(samples, step, { edgeOrder: 2 }))
			for (const g of grad) {
				assertComplexClose(g, { re: 1, im: 0 })
			}
		})

		it('accepts non-array iterables such as Set and custom iterables', () => {
			const set = new Set([
				{ re: 0, im: 0 },
				{ re: 2, im: 4 },
				{ re: 4, im: 8 },
			])
			const grad = Array.from(gradientComplexLazy(set, 2))
			assert.deepEqual(grad, [
				{ re: 1, im: 2 },
				{ re: 1, im: 2 },
				{ re: 1, im: 2 },
			])
		})
	})

	describe('lazy and streaming behavior', () => {
		it('does not pull any items before iteration begins and consumes minimally on demand (edgeOrder 1)', () => {
			let pulled = 0
			let closed = false
			function* infiniteValues() {
				try {
					for (let k = 0; ; k++) {
						pulled++
						yield { re: k * k, im: 2 * k }
					}
				} finally {
					closed = true
				}
			}

			const gen = gradientComplexLazy(infiniteValues(), 1)
			assert.equal(pulled, 0, 'should not pull eagerly before .next()')

			const first = gen.next()
			assert.equal(first.done, false)
			assertComplexClose(first.value, { re: 1, im: 2 })
			assert.equal(pulled, 2, 'first output only needs 2 inputs')

			const second = gen.next()
			assertComplexClose(second.value, { re: 2, im: 2 })
			assert.equal(pulled, 3, 'second output only needs 3 inputs')

			const third = gen.next()
			assertComplexClose(third.value, { re: 4, im: 2 })
			assert.equal(pulled, 4, 'third output only needs 4 inputs')

			// Early termination closes upstream generator
			gen.return()
			assert.equal(closed, true, 'upstream iterator should be closed on early return')
		})

		it('streams lazily with minimal lookahead for edgeOrder 2', () => {
			let pulled = 0
			function* infiniteValues() {
				for (let k = 0; ; k++) {
					pulled++
					yield { re: k * k, im: -k * k }
				}
			}

			const gen = gradientComplexLazy(infiniteValues(), 1, { edgeOrder: 2 })
			assert.equal(pulled, 0)

			const g0 = gen.next().value
			assertComplexClose(g0, { re: 0, im: 0 })
			assert.equal(pulled, 3)

			const g1 = gen.next().value
			assertComplexClose(g1, { re: 2, im: -2 })
			assert.equal(pulled, 3, 'second output reuses buffered 3-point window')

			const g2 = gen.next().value
			assertComplexClose(g2, { re: 4, im: -4 })
			assert.equal(pulled, 4)

			gen.return()
		})

		it('consumes both values and coords iterables lazily in lockstep and cleans up on break', () => {
			let valsPulled = 0
			let coordsPulled = 0
			let valsClosed = false
			let coordsClosed = false

			function* infCoords() {
				try {
					let x = 0
					for (let k = 0; ; k++) {
						coordsPulled++
						yield x
						x += 1 + 0.5 * k
					}
				} finally {
					coordsClosed = true
				}
			}

			function* infValues() {
				try {
					let x = 0
					for (let k = 0; ; k++) {
						valsPulled++
						yield { re: x * x, im: 3 * x }
						x += 1 + 0.5 * k
					}
				} finally {
					valsClosed = true
				}
			}

			const collected = []
			for (const g of gradientComplexLazy(infValues(), infCoords())) {
				collected.push(g)
				if (collected.length === 4) break
			}

			assert.equal(collected.length, 4)
			assert.equal(valsPulled, 5)
			assert.equal(coordsPulled, 5)
			assert.equal(valsClosed, true)
			assert.equal(coordsClosed, true)
			// Interior points (k=1: x=1, k=2: x=2.5, k=3: x=4.5) exact for f(x)=x^2+3ix
			assertComplexClose(collected[1], { re: 2 * 1, im: 3 })
			assertComplexClose(collected[2], { re: 2 * 2.5, im: 3 })
			assertComplexClose(collected[3], { re: 2 * 4.5, im: 3 })
		})
	})

	describe('invalid input handling', () => {
		it('throws synchronously for invalid values argument', () => {
			for (const bad of [null, undefined, 42, true, 'abc', { re: 1, im: 2 }]) {
				assert.throws(() => gradientComplexLazy(bad), TypeError)
			}
		})

		it('throws synchronously for invalid spacing argument', () => {
			const ok = [
				{ re: 0, im: 0 },
				{ re: 1, im: 1 },
			]
			assert.throws(() => gradientComplexLazy(ok, 0), RangeError)
			assert.throws(() => gradientComplexLazy(ok, -0), RangeError)
			assert.throws(() => gradientComplexLazy(ok, NaN), RangeError)
			assert.throws(() => gradientComplexLazy(ok, Infinity), RangeError)
			assert.throws(() => gradientComplexLazy(ok, { re: 0, im: 0 }), RangeError)
			assert.throws(() => gradientComplexLazy(ok, { re: NaN, im: 1 }), RangeError)
			assert.throws(() => gradientComplexLazy(ok, { re: 1, im: Infinity }), RangeError)
			assert.throws(() => gradientComplexLazy(ok, { re: 1 }), TypeError)
			assert.throws(() => gradientComplexLazy(ok, '1'), TypeError)
			assert.throws(() => gradientComplexLazy(ok, null), TypeError)
			assert.throws(() => gradientComplexLazy(ok, true), TypeError)
		})

		it('throws synchronously for invalid options or edgeOrder', () => {
			const ok = [
				{ re: 0, im: 0 },
				{ re: 1, im: 1 },
				{ re: 2, im: 2 },
			]
			assert.throws(() => gradientComplexLazy(ok, 1, { edgeOrder: 0 }), RangeError)
			assert.throws(() => gradientComplexLazy(ok, 1, { edgeOrder: 3 }), RangeError)
			assert.throws(() => gradientComplexLazy(ok, 1, { edgeOrder: 1.5 }), RangeError)
			assert.throws(() => gradientComplexLazy(ok, 1, { edgeOrder: '1' }), TypeError)
			assert.throws(() => gradientComplexLazy(ok, 1, { edgeOrder: NaN }), TypeError)
			assert.throws(() => gradientComplexLazy(ok, 1, { unknown: true }), TypeError)
			assert.throws(() => gradientComplexLazy(ok, { unknown: true }), TypeError)
			assert.throws(() => gradientComplexLazy(ok, 1, null), TypeError)
			assert.throws(() => gradientComplexLazy(ok, 1, []), TypeError)
		})

		it('throws RangeError for insufficient sample counts', () => {
			assert.throws(() => Array.from(gradientComplexLazy([{ re: 1, im: 0 }])), RangeError)
			assert.throws(
				() =>
					Array.from(
						gradientComplexLazy(
							[
								{ re: 1, im: 0 },
								{ re: 2, im: 0 },
							],
							1,
							{ edgeOrder: 2 },
						),
					),
				RangeError,
			)
			assert.throws(
				() => Array.from(gradientComplexLazy([{ re: 1, im: 0 }], [0])),
				RangeError,
			)
			assert.throws(
				() =>
					Array.from(
						gradientComplexLazy(
							[
								{ re: 1, im: 0 },
								{ re: 2, im: 0 },
							],
							[0, 1],
							{ edgeOrder: 2 },
						),
					),
				RangeError,
			)
		})

		it('throws on malformed complex elements during lazy iteration', () => {
			assert.throws(
				() => Array.from(gradientComplexLazy([1, 2])),
				TypeError,
			)
			assert.throws(
				() => Array.from(gradientComplexLazy([{ re: 0, im: 0 }, null])),
				TypeError,
			)
			assert.throws(
				() => Array.from(gradientComplexLazy([{ re: 0, im: 0 }, { re: 1 }])),
				TypeError,
			)
			assert.throws(
				() =>
					Array.from(
						gradientComplexLazy([
							{ re: 0, im: 0 },
							{ re: NaN, im: 0 },
						]),
					),
				RangeError,
			)
			assert.throws(
				() =>
					Array.from(
						gradientComplexLazy([
							{ re: 0, im: 0 },
							{ re: 1, im: Infinity },
						]),
					),
				RangeError,
			)
		})

		it('throws on mismatched, duplicate, non-finite, or degenerate coordinates', () => {
			const samples = [
				{ re: 0, im: 0 },
				{ re: 1, im: 1 },
				{ re: 2, im: 2 },
			]
			// Length mismatch
			assert.throws(() => Array.from(gradientComplexLazy(samples, [0, 1])), RangeError)
			assert.throws(() => Array.from(gradientComplexLazy(samples, [0, 1, 2, 3])), RangeError)
			// Duplicate adjacent coordinates
			assert.throws(() => Array.from(gradientComplexLazy(samples, [0, 0, 1])), RangeError)
			assert.throws(() => Array.from(gradientComplexLazy(samples, [0, 1, 1])), RangeError)
			// Degenerate stencil coords[0] === coords[2]
			assert.throws(() => Array.from(gradientComplexLazy(samples, [0, 1, 0])), RangeError)
			assert.throws(
				() => Array.from(gradientComplexLazy(samples, [0, 1, 0], { edgeOrder: 2 })),
				RangeError,
			)
			// Non-finite coordinate
			assert.throws(() => Array.from(gradientComplexLazy(samples, [0, NaN, 2])), RangeError)
			assert.throws(() => Array.from(gradientComplexLazy(samples, [0, 1, Infinity])), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches analytical derivative of Euler exponential e^(i*w*t) with O(h^2) convergence', () => {
			const w = 1.7
			const maxInteriorError = (n) => {
				const h = (2 * Math.PI) / n
				const samples = Array.from({ length: n + 1 }, (_, k) => ({
					re: Math.cos(w * k * h),
					im: Math.sin(w * k * h),
				}))
				const grad = Array.from(gradientComplexLazy(samples, h, { edgeOrder: 2 }))
				let maxErr = 0
				for (let k = 1; k < n; k++) {
					const t = k * h
					const exactRe = -w * Math.sin(w * t)
					const exactIm = w * Math.cos(w * t)
					const err = Math.hypot(grad[k].re - exactRe, grad[k].im - exactIm)
					if (err > maxErr) maxErr = err
				}
				return maxErr
			}

			const err1 = maxInteriorError(100)
			const err2 = maxInteriorError(200)
			const ratio = err1 / err2
			// Second-order central difference: halving h reduces error by ~4x
			assert.ok(err2 < 1e-3, `expected small error, got ${err2}`)
			assert.ok(ratio > 3.9 && ratio < 4.1, `expected ~4x convergence ratio, got ${ratio}`)
		})

		it('satisfies Fundamental Theorem of Calculus via independent trapezoidal integration', () => {
			// f(t) = exp((-0.3 + 2i) * t) on [0, 2]
			const h = 0.002
			const steps = 1000
			const samples = Array.from({ length: steps + 1 }, (_, k) => {
				const t = k * h
				const amp = Math.exp(-0.3 * t)
				return { re: amp * Math.cos(2 * t), im: amp * Math.sin(2 * t) }
			})

			const grad = Array.from(gradientComplexLazy(samples, h, { edgeOrder: 2 }))

			// Trapezoidal integral of f'(t) over [0, 2]
			let intRe = 0
			let intIm = 0
			for (let k = 0; k < steps; k++) {
				intRe += 0.5 * (grad[k].re + grad[k + 1].re) * h
				intIm += 0.5 * (grad[k].im + grad[k + 1].im) * h
			}

			const exactDelta = {
				re: samples[steps].re - samples[0].re,
				im: samples[steps].im - samples[0].im,
			}
			assertComplexClose({ re: intRe, im: intIm }, exactDelta, 1e-5)
		})

		it('satisfies Cauchy-Riemann path independence for holomorphic f(z) = z^3', () => {
			const z0 = { re: 1.2, im: -0.7 }
			const f = (z) => cMul(cMul(z, z), z)
			const exactDeriv = cMul({ re: 3, im: 0 }, cMul(z0, z0))

			const directions = [
				{ re: 1e-4, im: 0 }, // real axis
				{ re: 0, im: 1e-4 }, // imaginary axis
				{ re: 1e-4, im: 1e-4 }, // diagonal complex path
			]

			for (const dz of directions) {
				const pts = [-1, 0, 1].map((k) => ({
					re: z0.re + k * dz.re,
					im: z0.im + k * dz.im,
				}))
				const grad = Array.from(gradientComplexLazy(pts.map(f), dz))
				assertComplexClose(grad[1], exactDeriv, 1e-7)
			}
		})

		it('satisfies complex linearity: grad(a*f + b*g) === a*grad(f) + b*grad(g)', () => {
			const alpha = { re: 2.5, im: -1.5 }
			const beta = { re: -0.75, im: 3.25 }
			const coords = [0, 0.3, 0.9, 1.4, 2.5, 4.0]
			const fVals = coords.map((t) => ({ re: Math.sin(t), im: Math.cos(t) }))
			const gVals = coords.map((t) => ({ re: t * t, im: Math.exp(-0.2 * t) }))
			const combined = coords.map((_, i) => cAdd(cMul(alpha, fVals[i]), cMul(beta, gVals[i])))

			const gradF = Array.from(gradientComplexLazy(fVals, coords, { edgeOrder: 2 }))
			const gradG = Array.from(gradientComplexLazy(gVals, coords, { edgeOrder: 2 }))
			const gradComb = Array.from(gradientComplexLazy(combined, coords, { edgeOrder: 2 }))

			for (let i = 0; i < coords.length; i++) {
				const expected = cAdd(cMul(alpha, gradF[i]), cMul(beta, gradG[i]))
				assertComplexClose(gradComb[i], expected, 1e-11)
			}
		})
	})
})
