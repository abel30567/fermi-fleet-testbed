import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralComplexLazy } from './integralComplexLazy.js'

function assertComplexClose(actual, expected, tol = 1e-12, msg = '') {
	assert.equal(typeof actual.re, 'number', `${msg} re must be number`)
	assert.equal(typeof actual.im, 'number', `${msg} im must be number`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg} re mismatch: got ${actual.re}, expected ${expected.re} (tol ${tol})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg} im mismatch: got ${actual.im}, expected ${expected.im} (tol ${tol})`
	)
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re
	}
}

function complexDiv(a, b) {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom
	}
}

function complexExp(z) {
	const mag = Math.exp(z.re)
	return { re: mag * Math.cos(z.im), im: mag * Math.sin(z.im) }
}

describe('integralComplexLazy - normal cases', () => {
	test('integrates a constant complex sequence with default step = 1', () => {
		const samples = [
			{ re: 3, im: -2 },
			{ re: 3, im: -2 },
			{ re: 3, im: -2 },
			{ re: 3, im: -2 }
		]
		const out = [...integralComplexLazy(samples)]
		assert.deepEqual(out, [
			{ re: 0, im: 0 },
			{ re: 3, im: -2 },
			{ re: 6, im: -4 },
			{ re: 9, im: -6 }
		])
	})

	test('trapezoidal rule is exact for affine complex functions on uniform grid', () => {
		// f(t) = (2 - i)*t + (1 + 3i), exact integral from 0 to t:
		// F(t) = (1 - 0.5i)*t^2 + (1 + 3i)*t
		const h = 0.25
		const samples = Array.from({ length: 9 }, (_, k) => {
			const t = k * h
			return { re: 2 * t + 1, im: -t + 3 }
		})

		const out = [...integralComplexLazy(samples, h)]
		assert.equal(out.length, samples.length)
		for (let k = 0; k < out.length; k++) {
			const t = k * h
			const expected = {
				re: t * t + t,
				im: -0.5 * t * t + 3 * t
			}
			assertComplexClose(out[k], expected, 1e-14, `at k=${k}`)
		}
	})

	test('supports complex uniform step dz as shorthand and in options', () => {
		const samples = [
			{ re: 1, im: 1 },
			{ re: 1, im: 1 },
			{ re: 1, im: 1 }
		]
		// (1 + i) * (2 + 3i) = (2 - 3) + (3 + 2)i = -1 + 5i per step
		const dz = { re: 2, im: 3 }
		const outShorthand = [...integralComplexLazy(samples, dz)]
		const outOptions = [...integralComplexLazy(samples, { step: dz })]
		const expected = [
			{ re: 0, im: 0 },
			{ re: -1, im: 5 },
			{ re: -2, im: 10 }
		]
		assert.deepEqual(outShorthand, expected)
		assert.deepEqual(outOptions, expected)
	})

	test('supports custom initial constant of integration', () => {
		const samples = [
			{ re: 2, im: 0 },
			{ re: 4, im: 2 }
		]
		const out = [
			...integralComplexLazy(samples, {
				step: 0.5,
				initial: { re: 10, im: -5 }
			})
		]
		assert.deepEqual(out, [
			{ re: 10, im: -5 },
			{ re: 11.5, im: -4.5 }
		])
	})

	test('supports negative and zero uniform steps', () => {
		const samples = [
			{ re: 2, im: 4 },
			{ re: 6, im: 8 }
		]
		assert.deepEqual([...integralComplexLazy(samples, -0.5)], [
			{ re: 0, im: 0 },
			{ re: -2, im: -3 }
		])
		assert.deepEqual([...integralComplexLazy(samples, 0)], [
			{ re: 0, im: 0 },
			{ re: 0, im: 0 }
		])
	})

	test('supports left, right, and trapezoidal quadrature methods', () => {
		const samples = [
			{ re: 1, im: 2 },
			{ re: 5, im: 6 },
			{ re: 9, im: 10 }
		]
		assert.deepEqual([...integralComplexLazy(samples, { step: 2, method: 'left' })], [
			{ re: 0, im: 0 },
			{ re: 2, im: 4 },
			{ re: 12, im: 16 }
		])
		assert.deepEqual([...integralComplexLazy(samples, { step: 2, method: 'right' })], [
			{ re: 0, im: 0 },
			{ re: 10, im: 12 },
			{ re: 28, im: 32 }
		])
		assert.deepEqual([...integralComplexLazy(samples, { step: 2, method: 'trapezoidal' })], [
			{ re: 0, im: 0 },
			{ re: 6, im: 8 },
			{ re: 20, im: 24 }
		])
	})

	test('supports non-uniform real nodes grid', () => {
		// f(t) = (3 + 4i) * t on non-uniform grid [0, 0.1, 0.4, 1.0, 2.5]
		const nodes = [0, 0.1, 0.4, 1.0, 2.5]
		const samples = nodes.map((t) => ({ re: 3 * t, im: 4 * t }))
		const out = [...integralComplexLazy(samples, { nodes })]
		for (let i = 0; i < nodes.length; i++) {
			const t = nodes[i]
			assertComplexClose(out[i], { re: 1.5 * t * t, im: 2 * t * t }, 1e-13)
		}
	})

	test('accepts Set, generator, and custom iterables, and yields distinct objects', () => {
		const set = new Set([
			{ re: 1, im: 0 },
			{ re: 0, im: 1 }
		])
		const results = [...integralComplexLazy(set)]
		assert.deepEqual(results, [
			{ re: 0, im: 0 },
			{ re: 0.5, im: 0.5 }
		])
		// Mutating yielded object must not affect subsequent yields
		const gen = integralComplexLazy([
			{ re: 2, im: 2 },
			{ re: 2, im: 2 },
			{ re: 2, im: 2 }
		])
		const first = gen.next().value
		first.re = 999
		first.im = -999
		assert.deepEqual(gen.next().value, { re: 2, im: 2 })
		assert.deepEqual(gen.next().value, { re: 4, im: 4 })
	})
})

describe('integralComplexLazy - edge cases', () => {
	test('empty iterable yields nothing (uniform and with nodes)', () => {
		assert.deepEqual([...integralComplexLazy([])], [])
		assert.deepEqual([...integralComplexLazy([], { nodes: [] })], [])
	})

	test('single-element iterable yields only initial value', () => {
		assert.deepEqual([...integralComplexLazy([{ re: 7, im: -3 }])], [{ re: 0, im: 0 }])
		assert.deepEqual(
			[
				...integralComplexLazy([{ re: 7, im: -3 }], {
					initial: { re: 1, im: 2 },
					nodes: [42]
				})
			],
			[{ re: 1, im: 2 }]
		)
	})

	test('normalizes -0 to 0 in emitted complex components', () => {
		const out = [
			...integralComplexLazy(
				[
					{ re: 0, im: 0 },
					{ re: 0, im: 0 }
				],
				{ step: -1, initial: { re: -0, im: -0 } }
			)
		]
		for (const z of out) {
			assert.ok(Object.is(z.re, 0), 're should be +0, not -0')
			assert.ok(Object.is(z.im, 0), 'im should be +0, not -0')
		}
	})

	test('avoids midpoint overflow for large finite values with small step', () => {
		const big = Number.MAX_VALUE * 0.75
		const out = [
			...integralComplexLazy(
				[
					{ re: big, im: -big },
					{ re: big, im: -big }
				],
				{ step: 1e-100 }
			)
		]
		assert.equal(out.length, 2)
		assert.ok(Number.isFinite(out[1].re))
		assert.ok(Number.isFinite(out[1].im))
		assertComplexClose(out[1], { re: big * 1e-100, im: -big * 1e-100 }, big * 1e-114)
	})

	test('maintains accuracy over long stream via Neumaier compensated summation', () => {
		const n = 10000
		const step = 1 / n
		function* constantStream() {
			for (let i = 0; i <= n; i++) {
				yield { re: 1, im: 2 }
			}
		}
		let last
		for (const val of integralComplexLazy(constantStream(), step)) {
			last = val
		}
		assertComplexClose(last, { re: 1, im: 2 }, 1e-15)
	})
})

describe('integralComplexLazy - lazy and streaming behavior', () => {
	test('consumes infinite generator lazily, pulling 0 before first next() and 1 per step', () => {
		let pulled = 0
		let closed = false

		const infinite = {
			[Symbol.iterator]() {
				let k = 0
				return {
					next() {
						pulled += 1
						const value = { re: k, im: 2 * k }
						k += 1
						return { value, done: false }
					},
					return() {
						closed = true
						return { value: undefined, done: true }
					}
				}
			}
		}

		const stream = integralComplexLazy(infinite, 1)
		assert.equal(pulled, 0, 'must not pull before first .next()')

		const r0 = stream.next()
		assert.equal(pulled, 1)
		assert.deepEqual(r0, { value: { re: 0, im: 0 }, done: false })

		const r1 = stream.next()
		assert.equal(pulled, 2)
		assert.deepEqual(r1, { value: { re: 0.5, im: 1 }, done: false })

		const r2 = stream.next()
		assert.equal(pulled, 3)
		assert.deepEqual(r2, { value: { re: 2, im: 4 }, done: false })

		assert.equal(closed, false)
		stream.return()
		assert.equal(closed, true, 'must close source iterator on early termination')
		assert.equal(pulled, 3, 'must not pull after closing')
	})

	test('for..of early break closes both values and nodes infinite iterators', () => {
		let vPulled = 0
		let nPulled = 0
		let vClosed = false
		let nClosed = false

		const infValues = {
			[Symbol.iterator]() {
				return {
					next() {
						vPulled += 1
						return { value: { re: 1, im: 1 }, done: false }
					},
					return() {
						vClosed = true
						return { value: undefined, done: true }
					}
				}
			}
		}

		const infNodes = {
			[Symbol.iterator]() {
				let t = 0
				return {
					next() {
						nPulled += 1
						const value = { re: t, im: 0 }
						t += 0.5
						return { value, done: false }
					},
					return() {
						nClosed = true
						return { value: undefined, done: true }
					}
				}
			}
		}

		const collected = []
		for (const item of integralComplexLazy(infValues, { nodes: infNodes })) {
			collected.push(item)
			if (collected.length === 4) break
		}

		assert.equal(collected.length, 4)
		assert.equal(vPulled, 4)
		assert.equal(nPulled, 4)
		assert.equal(vClosed, true)
		assert.equal(nClosed, true)
		assert.deepEqual(collected[3], { re: 1.5, im: 1.5 })
	})

	test('does not evaluate invalid elements past early consumer cutoff', () => {
		function* streamWithLatePoison() {
			yield { re: 2, im: 0 }
			yield { re: 2, im: 0 }
			yield { re: NaN, im: 0 } // never reached if only 2 items taken
		}

		const iter = integralComplexLazy(streamWithLatePoison(), 1)
		assert.deepEqual(iter.next().value, { re: 0, im: 0 })
		assert.deepEqual(iter.next().value, { re: 2, im: 0 })
		iter.return()
	})
})

describe('integralComplexLazy - invalid input handling', () => {
	test('throws TypeError eagerly for non-iterable or string values', () => {
		for (const bad of [null, undefined, 42, {}, 'abc', true]) {
			assert.throws(() => integralComplexLazy(bad), TypeError)
		}
		const badIterProtocol = { [Symbol.iterator]: () => 123 }
		assert.throws(() => integralComplexLazy(badIterProtocol), TypeError)
	})

	test('throws eagerly for invalid step or options', () => {
		assert.throws(() => integralComplexLazy([], null), TypeError)
		assert.throws(() => integralComplexLazy([], true), TypeError)
		assert.throws(() => integralComplexLazy([], []), TypeError)
		assert.throws(() => integralComplexLazy([], '1'), TypeError)
		assert.throws(() => integralComplexLazy([], NaN), RangeError)
		assert.throws(() => integralComplexLazy([], Infinity), RangeError)
		assert.throws(() => integralComplexLazy([], { re: 1 }), TypeError)
		assert.throws(() => integralComplexLazy([], { re: 1, im: NaN }), RangeError)
		assert.throws(() => integralComplexLazy([], { re: 1, im: 0, method: 'left' }), TypeError)
		assert.throws(() => integralComplexLazy([], { step: 1, nodes: [] }), TypeError)
		assert.throws(() => integralComplexLazy([], { method: 123 }), TypeError)
		assert.throws(() => integralComplexLazy([], { method: 'simpson' }), RangeError)
		assert.throws(() => integralComplexLazy([], { initial: { re: 0, im: Infinity } }), RangeError)
		assert.throws(() => integralComplexLazy([], { initial: 0 }), TypeError)
		assert.throws(() => integralComplexLazy([], { nodes: '123' }), TypeError)
		assert.throws(() => integralComplexLazy([], { nodes: 42 }), TypeError)
	})

	test('throws when encountering invalid complex samples lazily', () => {
		const badElements = [
			null,
			42,
			[1, 2],
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 0 },
			{ re: 0, im: null }
		]
		for (const bad of badElements) {
			assert.throws(() => [...integralComplexLazy([bad])], TypeError)
		}

		for (const bad of [
			{ re: NaN, im: 0 },
			{ re: 0, im: Infinity },
			{ re: -Infinity, im: 1 }
		]) {
			assert.throws(() => [...integralComplexLazy([{ re: 1, im: 1 }, bad])], RangeError)
		}
	})

	test('throws on invalid nodes or length mismatch between values and nodes', () => {
		assert.throws(
			() => [...integralComplexLazy([{ re: 1, im: 0 }], { nodes: [NaN] })],
			RangeError
		)
		assert.throws(
			() => [...integralComplexLazy([{ re: 1, im: 0 }], { nodes: ['0'] })],
			TypeError
		)
		assert.throws(
			() =>
				[
					...integralComplexLazy([{ re: 1, im: 0 }, { re: 2, im: 0 }], {
						nodes: [0]
					})
				],
			RangeError
		)
		assert.throws(
			() =>
				[
					...integralComplexLazy([{ re: 1, im: 0 }], {
						nodes: [0, 1]
					})
				],
			RangeError
		)
	})

	test('throws RangeError on arithmetic overflow', () => {
		assert.throws(
			() =>
				[
					...integralComplexLazy(
						[
							{ re: Number.MAX_VALUE, im: 0 },
							{ re: Number.MAX_VALUE, im: 0 }
						],
						{ step: 10 }
					)
				],
			RangeError
		)
	})
})

describe('integralComplexLazy - independent mathematical cross-checks', () => {
	test('Fundamental Theorem of Calculus: integral of exp(c*t) matches (exp(c*t) - 1)/c', () => {
		const c = { re: 0.5, im: 1.5 }
		const n = 2000
		const T = 2.0
		const h = T / n

		function* expSamples() {
			for (let k = 0; k <= n; k++) {
				const t = k * h
				yield complexExp({ re: c.re * t, im: c.im * t })
			}
		}

		let k = 0
		for (const integral of integralComplexLazy(expSamples(), h)) {
			if (k % 200 === 0) {
				const t = k * h
				const expCT = complexExp({ re: c.re * t, im: c.im * t })
				const exact = complexDiv({ re: expCT.re - 1, im: expCT.im }, c)
				assertComplexClose(integral, exact, 1e-5, `at t=${t}`)
			}
			k += 1
		}
		assert.equal(k, n + 1)
	})

	test("Cauchy's Integral Formula & Theorem on complex circular contour", () => {
		const N = 4000
		const R = 2.5

		function* circleNodes() {
			for (let k = 0; k <= N; k++) {
				const theta = (2 * Math.PI * k) / N
				yield { re: R * Math.cos(theta), im: R * Math.sin(theta) }
			}
		}

		// 1) Contour integral of 1/z around |z| = R equals 2*pi*i
		function* reciprocalValues() {
			for (const z of circleNodes()) {
				yield complexDiv({ re: 1, im: 0 }, z)
			}
		}
		let poleIntegral
		for (const val of integralComplexLazy(reciprocalValues(), { nodes: circleNodes() })) {
			poleIntegral = val
		}
		assertComplexClose(poleIntegral, { re: 0, im: 2 * Math.PI }, 1e-5, 'Cauchy 1/z')

		// 2) Contour integral of holomorphic z^2 around |z| = R equals 0
		function* zSquaredValues() {
			for (const z of circleNodes()) {
				yield complexMul(z, z)
			}
		}
		let holomorphicIntegral
		for (const val of integralComplexLazy(zSquaredValues(), { nodes: circleNodes() })) {
			holomorphicIntegral = val
		}
		assertComplexClose(holomorphicIntegral, { re: 0, im: 0 }, 1e-10, 'Cauchy z^2')
	})

	test('linearity: integral(alpha*f + beta*g) = alpha*integral(f) + beta*integral(g)', () => {
		const alpha = { re: 1.5, im: -2.25 }
		const beta = { re: -0.75, im: 3.0 }
		const nodes = [0, 0.2, 0.7, 1.1, 2.0, 3.3]
		const f = nodes.map((t) => ({ re: Math.cos(t), im: Math.sin(t) }))
		const g = nodes.map((t) => ({ re: t * t, im: -t + 1 }))
		const combined = nodes.map((_, i) => {
			const af = complexMul(alpha, f[i])
			const bg = complexMul(beta, g[i])
			return { re: af.re + bg.re, im: af.im + bg.im }
		})

		const intF = [...integralComplexLazy(f, { nodes })]
		const intG = [...integralComplexLazy(g, { nodes })]
		const intCombined = [...integralComplexLazy(combined, { nodes })]

		for (let i = 0; i < nodes.length; i++) {
			const aF = complexMul(alpha, intF[i])
			const bG = complexMul(beta, intG[i])
			assertComplexClose(
				intCombined[i],
				{ re: aF.re + bG.re, im: aF.im + bG.im },
				1e-12,
				`linearity at i=${i}`
			)
		}
	})

	test('independent scalar Simpson cross-check on cos(t) + i*sin(2t) over [0, pi/2]', () => {
		// Exact: integral_0^{pi/2} cos(t) dt = 1, integral_0^{pi/2} sin(2t) dt = 1
		const n = 2000 // even for Simpson
		const a = 0
		const b = Math.PI / 2
		const h = (b - a) / n
		const samples = Array.from({ length: n + 1 }, (_, k) => {
			const t = a + k * h
			return { re: Math.cos(t), im: Math.sin(2 * t) }
		})

		// Independent scalar Simpson's rule
		let simpRe = samples[0].re + samples[n].re
		let simpIm = samples[0].im + samples[n].im
		for (let k = 1; k < n; k++) {
			const weight = k % 2 === 0 ? 2 : 4
			simpRe += weight * samples[k].re
			simpIm += weight * samples[k].im
		}
		simpRe *= h / 3
		simpIm *= h / 3

		let lazyFinal
		for (const val of integralComplexLazy(samples, h)) {
			lazyFinal = val
		}

		assertComplexClose(lazyFinal, { re: simpRe, im: simpIm }, 1e-6, 'vs Simpson')
		assertComplexClose(lazyFinal, { re: 1, im: 1 }, 1e-6, 'vs analytical')
	})

	test('discrete difference inverse recovers integrand for all three methods', () => {
		const nodes = [
			{ re: 0, im: 0 },
			{ re: 1, im: 0.5 },
			{ re: 1.5, im: 2 },
			{ re: 3, im: 1.5 }
		]
		const samples = [
			{ re: 2, im: -1 },
			{ re: -3, im: 4 },
			{ re: 5, im: 2 },
			{ re: 1, im: -6 }
		]

		for (const method of ['trapezoidal', 'left', 'right']) {
			const out = [...integralComplexLazy(samples, { nodes, method })]
			for (let k = 1; k < nodes.length; k++) {
				const dI = {
					re: out[k].re - out[k - 1].re,
					im: out[k].im - out[k - 1].im
				}
				const dz = {
					re: nodes[k].re - nodes[k - 1].re,
					im: nodes[k].im - nodes[k - 1].im
				}
				const recovered = complexDiv(dI, dz)
				const expected =
					method === 'trapezoidal'
						? {
								re: 0.5 * (samples[k - 1].re + samples[k].re),
								im: 0.5 * (samples[k - 1].im + samples[k].im)
						  }
						: method === 'left'
							? samples[k - 1]
							: samples[k]
				assertComplexClose(recovered, expected, 1e-12, `${method} k=${k}`)
			}
		}
	})
})
