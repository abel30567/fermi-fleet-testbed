import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tanComplexLazy } from './tanComplexLazy.js'

const EPS = 1e-12

function assertComplexClose(actual, expected, tol = EPS, msg = '') {
	assert.equal(typeof actual, 'object', `${msg}: expected object`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg}: re mismatch: got ${actual.re}, expected ${expected.re} (diff ${Math.abs(actual.re - expected.re)})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg}: im mismatch: got ${actual.im}, expected ${expected.im} (diff ${Math.abs(actual.im - expected.im)})`,
	)
}

/** Independent complex multiplication */
function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

/** Independent complex division */
function cDiv(a, b) {
	const d = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / d,
		im: (a.im * b.re - a.re * b.im) / d,
	}
}

/** Independent complex tan via sin(z) / cos(z) */
function tanViaSinCos({ re: a, im: b }) {
	const sinZ = {
		re: Math.sin(a) * Math.cosh(b),
		im: Math.cos(a) * Math.sinh(b),
	}
	const cosZ = {
		re: Math.cos(a) * Math.cosh(b),
		im: -Math.sin(a) * Math.sinh(b),
	}
	return cDiv(sinZ, cosZ)
}

/** Independent complex tan via complex exponential: -i * (e^(iz) - e^(-iz)) / (e^(iz) + e^(-iz)) */
function tanViaExp({ re: a, im: b }) {
	// e^(iz) = e^(-b + ia) = e^(-b) * (cos(a) + i*sin(a))
	const emB = Math.exp(-b)
	const epB = Math.exp(b)
	const eiz = { re: emB * Math.cos(a), im: emB * Math.sin(a) }
	const emiz = { re: epB * Math.cos(a), im: -epB * Math.sin(a) }
	const num = { re: eiz.re - emiz.re, im: eiz.im - emiz.im }
	const den = { re: eiz.re + emiz.re, im: eiz.im + emiz.im }
	const q = cDiv(num, den)
	// multiply by -i: -i*(x + iy) = y - ix
	return { re: q.im, im: -q.re }
}

describe('tanComplexLazy', () => {
	describe('normal cases', () => {
		it('computes tangent for purely real numbers', () => {
			const inputs = [
				{ re: 0, im: 0 },
				{ re: Math.PI / 4, im: 0 },
				{ re: -Math.PI / 4, im: 0 },
				{ re: Math.PI / 6, im: 0 },
				{ re: Math.PI, im: 0 },
			]
			const results = [...tanComplexLazy(inputs)]
			assert.equal(results.length, inputs.length)
			for (let i = 0; i < inputs.length; i++) {
				assertComplexClose(
					results[i],
					{ re: Math.tan(inputs[i].re), im: 0 },
					EPS,
					`real input ${inputs[i].re}`,
				)
				assert.equal(Object.is(results[i].im, 0), true)
			}
		})

		it('computes tangent for purely imaginary numbers: tan(bi) = i*tanh(b)', () => {
			const ims = [-5, -1, -0.5, 0, 0.5, 1, 5]
			const results = [...tanComplexLazy(ims.map((im) => ({ re: 0, im })))]
			for (let i = 0; i < ims.length; i++) {
				assertComplexClose(
					results[i],
					{ re: 0, im: Math.tanh(ims[i]) },
					EPS,
					`imaginary input ${ims[i]}i`,
				)
			}
		})

		it('computes tangent for general complex numbers', () => {
			const inputs = [
				{ re: 1, im: 1 },
				{ re: -1, im: 2 },
				{ re: 0.5, im: -0.75 },
				{ re: 2.3, im: 1.4 },
				{ re: Math.PI / 2, im: 1 },
			]
			const results = [...tanComplexLazy(inputs)]
			// tan(1 + i) ≈ 0.2717525853195117 + 1.0839233273386946i
			assertComplexClose(results[0], {
				re: 0.2717525853195117,
				im: 1.0839233273386946,
			})
			// tan(pi/2 + i) = i * coth(1)
			assertComplexClose(results[4], {
				re: 0,
				im: Math.cosh(1) / Math.sinh(1),
			})
			// Cross-check all against sin/cos
			for (let i = 0; i < inputs.length; i++) {
				assertComplexClose(results[i], tanViaSinCos(inputs[i]))
			}
		})

		it('accepts diverse iterable types (Set, generator, custom iterable)', () => {
			const set = new Set([
				{ re: 0, im: 0 },
				{ re: 1, im: 1 },
			])
			const fromSet = [...tanComplexLazy(set)]
			assert.equal(fromSet.length, 2)
			assertComplexClose(fromSet[0], { re: 0, im: 0 })

			const customIterable = {
				*[Symbol.iterator]() {
					yield { re: 0.25, im: -0.5 }
					yield { re: -0.75, im: 0.5 }
				},
			}
			const fromCustom = [...tanComplexLazy(customIterable)]
			assert.equal(fromCustom.length, 2)
			assertComplexClose(fromCustom[0], tanViaSinCos({ re: 0.25, im: -0.5 }))
			assertComplexClose(fromCustom[1], tanViaSinCos({ re: -0.75, im: 0.5 }))
		})
	})

	describe('edge cases and numerical stability', () => {
		it('handles empty iterable', () => {
			assert.deepStrictEqual([...tanComplexLazy([])], [])
		})

		it('avoids overflow for large imaginary parts where sinh/cosh overflow', () => {
			const inputs = [
				{ re: 0.7, im: 25 },
				{ re: 0.7, im: -25 },
				{ re: 1.2, im: 400 },
				{ re: -2.5, im: -1000 },
				{ re: 1e308, im: 500 },
			]
			const results = [...tanComplexLazy(inputs)]
			assertComplexClose(results[0], { re: 0, im: 1 }, 1e-15)
			assertComplexClose(results[1], { re: 0, im: -1 }, 1e-15)
			assert.deepStrictEqual(results[2], { re: 0, im: 1 })
			assert.deepStrictEqual(results[3], { re: 0, im: -1 })
			assert.deepStrictEqual(results[4], { re: 0, im: 1 })
		})

		it('is continuous across the |im| = 20 regime boundary', () => {
			const below = [...tanComplexLazy([{ re: 0.6, im: 20 }])][0]
			const above = [...tanComplexLazy([{ re: 0.6, im: 20.0000001 }])][0]
			assertComplexClose(below, above, 1e-14)
		})

		it('avoids catastrophic cancellation near real poles with tiny imaginary part', () => {
			// Near z = pi/2 + 1e-8*i, tan(z) ≈ i * coth(1e-8) ≈ 1e8 * i
			const z = { re: Math.PI / 2, im: 1e-8 }
			const [res] = [...tanComplexLazy([z])]
			assert.ok(Number.isFinite(res.re) && Number.isFinite(res.im))
			assert.ok(
				Math.abs(res.im - 1e8) / 1e8 < 1e-10,
				`expected im ≈ 1e8, got ${res.im}`,
			)
		})

		it('normalizes -0 to +0 in outputs', () => {
			const [res] = [...tanComplexLazy([{ re: -0, im: -0 }])]
			assert.equal(Object.is(res.re, 0), true)
			assert.equal(Object.is(res.im, 0), true)
		})
	})

	describe('lazy consumption verification', () => {
		it('does not consume any items before .next() and pulls strictly one per step', () => {
			let pulled = 0
			function* source() {
				for (let k = 0; k < 10; k++) {
					pulled += 1
					yield { re: k * 0.1, im: k * 0.2 }
				}
			}

			const gen = tanComplexLazy(source())
			assert.equal(pulled, 0, 'should not pull before first .next()')

			const first = gen.next()
			assert.equal(first.done, false)
			assert.equal(pulled, 1, 'should pull exactly 1 item on first .next()')
			assertComplexClose(first.value, { re: 0, im: 0 })

			const second = gen.next()
			assert.equal(second.done, false)
			assert.equal(pulled, 2, 'should pull exactly 2 items after second .next()')
			assertComplexClose(second.value, tanViaSinCos({ re: 0.1, im: 0.2 }))
		})

		it('supports infinite generators and runs source cleanup on early break', () => {
			let pulled = 0
			let cleanedUp = false
			function* infiniteSource() {
				try {
					let i = 0
					while (true) {
						pulled += 1
						yield { re: 0, im: i * 0.5 }
						i += 1
					}
				} finally {
					cleanedUp = true
				}
			}

			const collected = []
			for (const val of tanComplexLazy(infiniteSource())) {
				collected.push(val)
				if (collected.length === 4) break
			}

			assert.equal(collected.length, 4)
			assert.equal(pulled, 4, 'must pull only as many items as consumed')
			assert.equal(cleanedUp, true, 'must close underlying generator on break')
			for (let i = 0; i < 4; i++) {
				assertComplexClose(collected[i], { re: 0, im: Math.tanh(i * 0.5) })
			}
		})

		it('validates elements lazily so valid prefix yields before a bad element throws', () => {
			const stream = tanComplexLazy([
				{ re: 0, im: 0 },
				{ re: 0, im: 1 },
				{ re: NaN, im: 0 },
			])

			assertComplexClose(stream.next().value, { re: 0, im: 0 })
			assertComplexClose(stream.next().value, { re: 0, im: Math.tanh(1) })
			assert.throws(() => stream.next(), RangeError)
		})
	})

	describe('input validation', () => {
		it('throws TypeError synchronously for non-iterable or string inputs', () => {
			for (const bad of [null, undefined, 42, true, 'abc', { re: 1, im: 2 }]) {
				assert.throws(
					() => tanComplexLazy(bad),
					TypeError,
					`should reject ${String(bad)}`,
				)
			}
		})

		it('throws TypeError for malformed complex elements', () => {
			const badElements = [
				null,
				undefined,
				5,
				'1+2i',
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
			]
			for (const el of badElements) {
				assert.throws(() => [...tanComplexLazy([el])], TypeError)
			}
		})

		it('throws RangeError for non-finite complex components', () => {
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: -Infinity, im: 1 },
				{ re: 0, im: Infinity },
				{ re: 1, im: -Infinity },
			]
			for (const el of nonFinite) {
				assert.throws(() => [...tanComplexLazy([el])], RangeError)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches both sin(z)/cos(z) and complex exponential definition across a grid', () => {
			const grid = []
			for (const re of [-3.1, -1.2, -0.3, 0, 0.4, 1.1, 2.7]) {
				for (const im of [-8, -2.5, -0.4, 0, 0.4, 2.5, 8]) {
					grid.push({ re, im })
				}
			}

			const results = [...tanComplexLazy(grid)]
			for (let i = 0; i < grid.length; i++) {
				const z = grid[i]
				assertComplexClose(results[i], tanViaSinCos(z), 1e-11, `sin/cos (${z.re}, ${z.im})`)
				assertComplexClose(results[i], tanViaExp(z), 1e-11, `exp (${z.re}, ${z.im})`)
			}
		})

		it('satisfies oddness, conjugate symmetry, periodicity, and tangent addition formula', () => {
			const z1 = { re: 0.4, im: 0.7 }
			const z2 = { re: -0.9, im: 0.3 }
			const [t1, t2, tNeg1, tConj1, tShift1, tSum] = [
				...tanComplexLazy([
					z1,
					z2,
					{ re: -z1.re, im: -z1.im },
					{ re: z1.re, im: -z1.im },
					{ re: z1.re + Math.PI, im: z1.im },
					{ re: z1.re + z2.re, im: z1.im + z2.im },
				]),
			]

			// tan(-z) = -tan(z)
			assertComplexClose(tNeg1, { re: -t1.re, im: -t1.im }, EPS, 'oddness')
			// tan(conj(z)) = conj(tan(z))
			assertComplexClose(tConj1, { re: t1.re, im: -t1.im }, EPS, 'conjugate')
			// tan(z + pi) = tan(z)
			assertComplexClose(tShift1, t1, EPS, 'periodicity')
			// tan(z1 + z2) = (tan(z1) + tan(z2)) / (1 - tan(z1)*tan(z2))
			const prod = cMul(t1, t2)
			const expectedSum = cDiv(
				{ re: t1.re + t2.re, im: t1.im + t2.im },
				{ re: 1 - prod.re, im: -prod.im },
			)
			assertComplexClose(tSum, expectedSum, 1e-11, 'addition formula')
		})
	})
})
