import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { lnComplexLazy } from './lnComplexLazy.js'

const EPS = 1e-12

function assertComplexClose(actual, expected, tol = EPS, label = '') {
	assert.equal(typeof actual, 'object', `${label} result should be an object`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${label} re: expected ${expected.re}, got ${actual.re} (diff ${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${label} im: expected ${expected.im}, got ${actual.im} (diff ${Math.abs(actual.im - expected.im)})`
	)
}

function complexExp({ re, im }) {
	const r = Math.exp(re)
	return { re: r * Math.cos(im), im: r * Math.sin(im) }
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Independent Mercator series for ln(1 + w) with |w| < 1 using only +, -, *, /.
 * Avoids Math.log, Math.log1p, and Math.atan2 completely.
 */
function lnOnePlusSeries(w, terms = 80) {
	let sumRe = 0
	let sumIm = 0
	let powRe = w.re
	let powIm = w.im

	for (let n = 1; n <= terms; n++) {
		const sign = n % 2 === 1 ? 1 : -1
		sumRe += (sign * powRe) / n
		sumIm += (sign * powIm) / n

		const nextRe = powRe * w.re - powIm * w.im
		const nextIm = powRe * w.im + powIm * w.re
		powRe = nextRe
		powIm = nextIm
	}

	return { re: sumRe, im: sumIm }
}

describe('lnComplexLazy', () => {
	it('computes exact principal values for standard complex numbers', () => {
		const inputs = [
			{ re: 1, im: 0 },
			{ re: Math.E, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 1 },
			{ re: 0, im: -1 },
			{ re: 1, im: 1 },
			{ re: -Math.E, im: 0 },
			{ re: 3, im: 4 },
		]

		const expected = [
			{ re: 0, im: 0 },
			{ re: 1, im: 0 },
			{ re: 0, im: Math.PI },
			{ re: 0, im: Math.PI / 2 },
			{ re: 0, im: -Math.PI / 2 },
			{ re: 0.5 * Math.LN2, im: Math.PI / 4 },
			{ re: 1, im: Math.PI },
			{ re: Math.log(5), im: Math.atan2(4, 3) },
		]

		const results = [...lnComplexLazy(inputs)]
		assert.equal(results.length, expected.length)
		for (let i = 0; i < expected.length; i++) {
			assertComplexClose(results[i], expected[i], EPS, `case ${i}`)
		}
		assert.ok(Object.is(results[0].re, 0), 'ln(1).re should be +0, not -0')
	})

	it('handles all four quadrants and signed-zero branch cut', () => {
		const inputs = [
			{ re: 2, im: 2 },
			{ re: -2, im: 2 },
			{ re: -2, im: -2 },
			{ re: 2, im: -2 },
			{ re: -1, im: -0 },
		]

		const expected = [
			{ re: Math.log(Math.SQRT2 * 2), im: Math.PI / 4 },
			{ re: Math.log(Math.SQRT2 * 2), im: (3 * Math.PI) / 4 },
			{ re: Math.log(Math.SQRT2 * 2), im: (-3 * Math.PI) / 4 },
			{ re: Math.log(Math.SQRT2 * 2), im: -Math.PI / 4 },
			{ re: 0, im: -Math.PI },
		]

		const results = [...lnComplexLazy(inputs)]
		for (let i = 0; i < expected.length; i++) {
			assertComplexClose(results[i], expected[i], EPS, `quadrant ${i}`)
		}
	})

	it('handles empty and diverse iterable types (Set, Generator, custom iterable)', () => {
		assert.deepEqual([...lnComplexLazy([])], [])

		const setInput = new Set([
			{ re: 1, im: 0 },
			{ re: 0, im: 1 },
		])
		const fromSet = [...lnComplexLazy(setInput)]
		assert.equal(fromSet.length, 2)
		assertComplexClose(fromSet[0], { re: 0, im: 0 })
		assertComplexClose(fromSet[1], { re: 0, im: Math.PI / 2 })

		const customIterable = {
			[Symbol.iterator]() {
				const items = [{ re: 0, im: -1 }, { re: -1, im: 0 }]
				let idx = 0
				return {
					next() {
						return idx < items.length
							? { value: items[idx++], done: false }
							: { value: undefined, done: true }
					},
				}
			},
		}
		const fromCustom = [...lnComplexLazy(customIterable)]
		assert.equal(fromCustom.length, 2)
		assertComplexClose(fromCustom[0], { re: 0, im: -Math.PI / 2 })
		assertComplexClose(fromCustom[1], { re: 0, im: Math.PI })
	})

	it('handles extreme magnitudes without overflow or underflow and preserves unit-circle precision', () => {
		const [huge, tiny, nearUnit, subnormal] = [
			...lnComplexLazy([
				{ re: 1e308, im: 1e308 },
				{ re: 1e-308, im: 1e-308 },
				{ re: 1, im: 1e-10 },
				{ re: Number.MIN_VALUE, im: 0 },
			]),
		]

		assert.ok(Number.isFinite(huge.re), 'huge re should not overflow to Infinity')
		assertComplexClose(huge, { re: Math.log(1e308) + 0.5 * Math.LN2, im: Math.PI / 4 }, 1e-11)

		assert.ok(Number.isFinite(tiny.re), 'tiny re should not underflow to -Infinity')
		assertComplexClose(tiny, { re: Math.log(1e-308) + 0.5 * Math.LN2, im: Math.PI / 4 }, 1e-11)

		// For z = 1 + 1e-10i, ln|z| = 0.5 * ln(1 + 1e-20) ≈ 5e-21
		assert.ok(
			Math.abs(nearUnit.re - 5e-21) <= 1e-34,
			`expected near-unit ln|z| ≈ 5e-21, got ${nearUnit.re}`
		)
		assert.ok(Math.abs(nearUnit.im - 1e-10) <= 1e-24)

		assertComplexClose(subnormal, { re: Math.log(Number.MIN_VALUE), im: 0 }, 1e-11)
	})

	it('consumes iterables strictly lazily and supports infinite sequences with early termination', () => {
		let pulled = 0
		let cleanedUp = false

		function* infiniteComplex() {
			try {
				for (let k = 1; ; k++) {
					pulled++
					yield { re: Math.exp(k), im: 0 }
				}
			} finally {
				cleanedUp = true
			}
		}

		const gen = lnComplexLazy(infiniteComplex())
		assert.equal(pulled, 0, 'must not pull any item before .next() is called')

		const first = gen.next()
		assert.equal(pulled, 1, 'first .next() must pull exactly 1 item')
		assert.equal(first.done, false)
		assertComplexClose(first.value, { re: 1, im: 0 })

		const second = gen.next()
		assert.equal(pulled, 2, 'second .next() must pull exactly 1 more item')
		assertComplexClose(second.value, { re: 2, im: 0 })

		const taken = []
		for (const val of gen) {
			taken.push(val)
			if (taken.length === 3) break
		}

		assert.equal(taken.length, 3)
		assert.equal(pulled, 5, 'should have pulled exactly 5 items total')
		assert.equal(cleanedUp, true, 'breaking early must close the upstream generator')
		assertComplexClose(taken[0], { re: 3, im: 0 })
		assertComplexClose(taken[2], { re: 5, im: 0 })
	})

	it('validates top-level input eagerly and elements lazily', () => {
		for (const bad of [null, undefined, 42, true, { re: 1, im: 0 }, '1+2i']) {
			assert.throws(() => lnComplexLazy(bad), TypeError)
		}

		// Deferred element validation: valid elements before a bad element still yield
		const mixed = [{ re: 1, im: 0 }, { re: 0, im: 1 }, { re: 0, im: 0 }, { re: 2, im: 0 }]
		const gen = lnComplexLazy(mixed)
		assertComplexClose(gen.next().value, { re: 0, im: 0 })
		assertComplexClose(gen.next().value, { re: 0, im: Math.PI / 2 })
		assert.throws(() => gen.next(), RangeError)

		for (const badElem of [null, undefined, 5, '1', [1, 2], { re: '1', im: 0 }, { re: 1 }]) {
			assert.throws(() => [...lnComplexLazy([badElem])], TypeError)
		}

		for (const badRange of [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 1 },
			{ re: 1, im: -Infinity },
			{ re: 0, im: 0 },
		]) {
			assert.throws(() => [...lnComplexLazy([badRange])], RangeError)
		}
	})

	it('cross-check 1: exp(ln(z)) reproduces z and ln(z1 * z2) ≡ ln(z1) + ln(z2) (mod 2πi)', () => {
		const samples = [
			{ re: 2.5, im: -1.75 },
			{ re: -0.3, im: 4.1 },
			{ re: -3.2, im: -0.9 },
			{ re: 0.01, im: 0.02 },
			{ re: 100, im: -50 },
			{ re: Math.cos(1.2), im: Math.sin(1.2) },
		]

		const logs = [...lnComplexLazy(samples)]
		for (let i = 0; i < samples.length; i++) {
			const recovered = complexExp(logs[i])
			assertComplexClose(recovered, samples[i], 1e-11, `exp(ln(z)) sample ${i}`)
		}

		// Product identity across pairs
		for (let i = 0; i < samples.length - 1; i++) {
			const prod = complexMul(samples[i], samples[i + 1])
			const [lnProd] = [...lnComplexLazy([prod])]
			const sumRe = logs[i].re + logs[i + 1].re
			let sumIm = logs[i].im + logs[i + 1].im
			// Wrap sumIm into (-π, π]
			while (sumIm > Math.PI) sumIm -= 2 * Math.PI
			while (sumIm <= -Math.PI) sumIm += 2 * Math.PI

			assertComplexClose(lnProd, { re: sumRe, im: sumIm }, 1e-11, `product pair ${i}`)
		}
	})

	it('cross-check 2: matches independent Mercator Taylor series for ln(1 + w) with |w| < 0.5', () => {
		const offsets = [
			{ re: 0.25, im: 0.25 },
			{ re: -0.3, im: 0.2 },
			{ re: -0.15, im: -0.35 },
			{ re: 0.4, im: -0.1 },
			{ re: 0, im: 0.45 },
		]

		const inputs = offsets.map((w) => ({ re: 1 + w.re, im: w.im }))
		const actuals = [...lnComplexLazy(inputs)]

		for (let i = 0; i < offsets.length; i++) {
			const seriesVal = lnOnePlusSeries(offsets[i])
			assertComplexClose(actuals[i], seriesVal, 1e-13, `Mercator series ${i}`)
		}
	})
})
