import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosDualLazy } from './cosDualLazy.js'

const EPS = 1e-12

function assertDualClose(actual, expected, tol = EPS) {
	assert.equal(typeof actual, 'object')
	assert.ok(actual !== null)
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol,
		`expected v=${actual.v} to be within ${tol} of ${expected.v}`
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol,
		`expected d=${actual.d} to be within ${tol} of ${expected.d}`
	)
}

describe('cosDualLazy', () => {
	describe('normal cases', () => {
		test('computes cosine and derivative at standard angles for single dual numbers', () => {
			assertDualClose(cosDualLazy({ v: 0, d: 1 }), { v: 1, d: 0 })
			assertDualClose(cosDualLazy({ v: Math.PI / 6, d: 1 }), { v: Math.sqrt(3) / 2, d: -0.5 })
			assertDualClose(cosDualLazy({ v: Math.PI / 4, d: 1 }), {
				v: Math.SQRT1_2,
				d: -Math.SQRT1_2,
			})
			assertDualClose(cosDualLazy({ v: Math.PI / 3, d: 1 }), { v: 0.5, d: -Math.sqrt(3) / 2 })
			assertDualClose(cosDualLazy({ v: Math.PI / 2, d: 1 }), { v: 0, d: -1 })
			assertDualClose(cosDualLazy({ v: Math.PI, d: 1 }), { v: -1, d: 0 })
			assertDualClose(cosDualLazy({ v: (3 * Math.PI) / 2, d: 1 }), { v: 0, d: 1 })
			assertDualClose(cosDualLazy({ v: 2 * Math.PI, d: 1 }), { v: 1, d: 0 })
		})

		test('handles negative angles and arbitrary tangent scales (chain rule)', () => {
			assertDualClose(cosDualLazy({ v: -Math.PI / 4, d: 1 }), {
				v: Math.SQRT1_2,
				d: Math.SQRT1_2,
			})
			assertDualClose(cosDualLazy({ v: -Math.PI / 2, d: 3 }), { v: 0, d: 3 })
			assertDualClose(cosDualLazy({ v: Math.PI / 6, d: -4 }), { v: Math.sqrt(3) / 2, d: 2 })
			assertDualClose(cosDualLazy({ v: 1.23, d: 0 }), { v: Math.cos(1.23), d: 0 })
		})

		test('transforms an array of dual numbers via a generator', () => {
			const inputs = [
				{ v: 0, d: 1 },
				{ v: Math.PI / 2, d: 2 },
				{ v: Math.PI, d: -3 },
			]
			const stream = cosDualLazy(inputs)
			assert.equal(typeof stream.next, 'function')
			assert.equal(typeof stream[Symbol.iterator], 'function')

			const results = [...stream]
			assert.equal(results.length, 3)
			assertDualClose(results[0], { v: 1, d: 0 })
			assertDualClose(results[1], { v: 0, d: -2 })
			assertDualClose(results[2], { v: -1, d: 0 })
		})

		test('supports Set and custom iterable objects', () => {
			const setInput = new Set([
				{ v: 0, d: 1 },
				{ v: Math.PI / 2, d: 1 },
			])
			const fromSet = [...cosDualLazy(setInput)]
			assert.equal(fromSet.length, 2)
			assertDualClose(fromSet[0], { v: 1, d: 0 })
			assertDualClose(fromSet[1], { v: 0, d: -1 })

			const customIterable = {
				*[Symbol.iterator]() {
					yield { v: Math.PI / 3, d: 2 }
					yield { v: -Math.PI / 3, d: 2 }
				},
			}
			const fromCustom = [...cosDualLazy(customIterable)]
			assert.equal(fromCustom.length, 2)
			assertDualClose(fromCustom[0], { v: 0.5, d: -Math.sqrt(3) })
			assertDualClose(fromCustom[1], { v: 0.5, d: Math.sqrt(3) })
		})

		test('supports pipeline composition cosDualLazy(cosDualLazy(seq))', () => {
			const inputs = [
				{ v: 0.5, d: 1 },
				{ v: 1.1, d: -2 },
			]
			const composed = [...cosDualLazy(cosDualLazy(inputs))]
			for (let i = 0; i < inputs.length; i++) {
				const { v, d } = inputs[i]
				// d/dx cos(cos(x)) = -sin(cos(x)) * (-sin(x)) * d = sin(cos(x)) * sin(x) * d
				const expected = {
					v: Math.cos(Math.cos(v)),
					d: Math.sin(Math.cos(v)) * Math.sin(v) * d,
				}
				assertDualClose(composed[i], expected)
			}
		})
	})

	describe('edge cases', () => {
		test('handles empty array and empty generator', () => {
			assert.deepEqual([...cosDualLazy([])], [])

			function* emptyGen() {}
			assert.deepEqual([...cosDualLazy(emptyGen())], [])
		})

		test('normalizes -0 derivatives to +0', () => {
			const r1 = cosDualLazy({ v: 0, d: 1 })
			assert.ok(Object.is(r1.d, 0), 'derivative at v=0, d=1 should be +0, not -0')

			const r2 = cosDualLazy({ v: 1, d: 0 })
			assert.ok(Object.is(r2.d, 0), 'derivative at v=1, d=0 should be +0, not -0')

			const r3 = cosDualLazy({ v: -0, d: -0 })
			assert.ok(Object.is(r3.v, 1))
			assert.ok(Object.is(r3.d, 0))
		})

		test('handles very small, very large, and subnormal finite inputs without overflow', () => {
			const tiny = cosDualLazy({ v: 1e-12, d: 1 })
			assertDualClose(tiny, { v: 1, d: -1e-12 }, 1e-15)

			const largeAngle = cosDualLazy({ v: 1e6, d: 1 })
			assert.ok(Number.isFinite(largeAngle.v))
			assert.ok(Number.isFinite(largeAngle.d))
			assertDualClose(largeAngle, { v: Math.cos(1e6), d: -Math.sin(1e6) })

			const hugeDeriv = cosDualLazy({ v: 0.5, d: Number.MAX_VALUE })
			assert.ok(Number.isFinite(hugeDeriv.v))
			assert.ok(Number.isFinite(hugeDeriv.d))

			const subnormalDeriv = cosDualLazy({ v: Math.PI / 2, d: Number.MIN_VALUE })
			assert.equal(subnormalDeriv.d, -Number.MIN_VALUE)
		})

		test('does not mutate input dual objects and strips extra properties', () => {
			const input = Object.freeze({ v: 0.7, d: 2, extra: 'keep-out' })
			const out = cosDualLazy(input)
			assert.deepEqual(Object.keys(out).sort(), ['d', 'v'])
			assertDualClose(out, { v: Math.cos(0.7), d: -Math.sin(0.7) * 2 })
		})
	})

	describe('lazy / streaming generator consumption', () => {
		test('does not consume any elements until .next() is called and pulls strictly one at a time', () => {
			let produced = 0
			function* trackedSource() {
				const angles = [0, Math.PI / 2, Math.PI]
				for (const angle of angles) {
					produced++
					yield { v: angle, d: 1 }
				}
			}

			const stream = cosDualLazy(trackedSource())
			assert.equal(produced, 0, 'source must not be touched before first .next()')

			const step1 = stream.next()
			assert.equal(produced, 1)
			assert.equal(step1.done, false)
			assertDualClose(step1.value, { v: 1, d: 0 })

			const step2 = stream.next()
			assert.equal(produced, 2)
			assert.equal(step2.done, false)
			assertDualClose(step2.value, { v: 0, d: -1 })

			const step3 = stream.next()
			assert.equal(produced, 3)
			assert.equal(step3.done, false)
			assertDualClose(step3.value, { v: -1, d: 0 })

			const step4 = stream.next()
			assert.equal(produced, 3)
			assert.equal(step4.done, true)
		})

		test('streams from an infinite generator and cleans up on early break', () => {
			let cleanedUp = false
			let produced = 0

			function* infiniteDuals() {
				try {
					let k = 0
					while (true) {
						produced++
						yield { v: k * (Math.PI / 2), d: 1 }
						k++
					}
				} finally {
					cleanedUp = true
				}
			}

			const collected = []
			for (const item of cosDualLazy(infiniteDuals())) {
				collected.push(item)
				if (collected.length === 4) {
					break
				}
			}

			assert.equal(produced, 4)
			assert.equal(cleanedUp, true, 'early break must close underlying generator')
			assertDualClose(collected[0], { v: 1, d: 0 })
			assertDualClose(collected[1], { v: 0, d: -1 })
			assertDualClose(collected[2], { v: -1, d: 0 })
			assertDualClose(collected[3], { v: 0, d: 1 })
		})

		test('validates stream elements lazily when reached', () => {
			function* mixedStream() {
				yield { v: 0, d: 1 }
				yield { v: 'invalid', d: 1 }
				yield { v: Math.PI, d: 1 }
			}

			const stream = cosDualLazy(mixedStream())
			const first = stream.next()
			assert.equal(first.done, false)
			assertDualClose(first.value, { v: 1, d: 0 })

			assert.throws(() => stream.next(), TypeError)
		})
	})

	describe('input validation errors', () => {
		test('rejects non-object and string top-level inputs eagerly', () => {
			for (const bad of [null, undefined, 0, 42, 'abc', true, false, Symbol('x'), () => {}]) {
				assert.throws(() => cosDualLazy(bad), TypeError)
			}
		})

		test('rejects malformed single dual objects with TypeError', () => {
			const invalidDuals = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 0, d: '1' },
				{ v: null, d: 1 },
				{ v: 1, d: undefined },
				{ v: 1n, d: 0 },
			]
			for (const bad of invalidDuals) {
				assert.throws(() => cosDualLazy(bad), TypeError)
			}
		})

		test('rejects non-finite components (NaN, ±Infinity) with RangeError', () => {
			const nonFiniteDuals = [
				{ v: Number.NaN, d: 1 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 0, d: Number.POSITIVE_INFINITY },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFiniteDuals) {
				assert.throws(() => cosDualLazy(bad), RangeError)
			}
		})

		test('rejects invalid elements inside iterables when consumed', () => {
			assert.throws(() => [...cosDualLazy([null])], TypeError)
			assert.throws(() => [...cosDualLazy([42])], TypeError)
			assert.throws(() => [...cosDualLazy([[1, 2]])], TypeError)
			assert.throws(() => [...cosDualLazy([{ v: 1, d: 'x' }])], TypeError)
			assert.throws(() => [...cosDualLazy([{ v: Number.NaN, d: 1 }])], RangeError)
			assert.throws(() => [...cosDualLazy([{ v: 1, d: Number.POSITIVE_INFINITY }])], RangeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('matches central finite-difference directional derivative across [-2π, 2π]', () => {
			const h = 1e-6
			const tangents = [-2.5, -1, 0, 0.75, 3.2]

			function* gridGenerator() {
				for (let i = -20; i <= 20; i++) {
					const x = (i / 20) * 2 * Math.PI
					const d = tangents[Math.abs(i) % tangents.length]
					yield { v: x, d }
				}
			}

			const inputs = [...gridGenerator()]
			const outputs = [...cosDualLazy(gridGenerator())]
			assert.equal(outputs.length, inputs.length)

			for (let i = 0; i < inputs.length; i++) {
				const { v, d } = inputs[i]
				const fd = (Math.cos(v + h * d) - Math.cos(v - h * d)) / (2 * h)
				assert.ok(
					Math.abs(outputs[i].d - fd) < 1e-9,
					`dual derivative ${outputs[i].d} diverged from finite difference ${fd} at v=${v}, d=${d}`
				)
			}
		})

		test('satisfies Pythagorean identity cos²(v) + (d_out / d)² = 1 and even/odd symmetry', () => {
			const samples = [-2.7, -1.1, -0.3, 0.4, 1.5, 2.9]
			const d = 1.7

			const forward = [...cosDualLazy(samples.map((v) => ({ v, d })))]
			const negated = [...cosDualLazy(samples.map((v) => ({ v: -v, d })))]

			for (let i = 0; i < samples.length; i++) {
				const { v: cosV, d: dOut } = forward[i]
				const negSinV = dOut / d
				assert.ok(
					Math.abs(cosV * cosV + negSinV * negSinV - 1) < 1e-12,
					`Pythagorean identity failed at sample ${samples[i]}`
				)

				// cos(-x) = cos(x), while d/dx[cos(-x)]|_{x} with same tangent d has opposite sign
				assert.ok(Math.abs(negated[i].v - cosV) < 1e-12)
				assert.ok(Math.abs(negated[i].d + dOut) < 1e-12)
			}
		})

		test('composition cos(cos(x)) derivative matches central finite difference', () => {
			const h = 1e-6
			const xs = [-2.2, -0.8, 0, 0.6, 1.9, 3.1]
			const results = [...cosDualLazy(cosDualLazy(xs.map((v) => ({ v, d: 1 }))))]

			for (let i = 0; i < xs.length; i++) {
				const x = xs[i]
				const f = (t) => Math.cos(Math.cos(t))
				const fd = (f(x + h) - f(x - h)) / (2 * h)
				assert.ok(Math.abs(results[i].v - f(x)) < 1e-12)
				assert.ok(
					Math.abs(results[i].d - fd) < 1e-9,
					`composed derivative ${results[i].d} diverged from finite difference ${fd} at x=${x}`
				)
			}
		})
	})
})
