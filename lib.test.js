import { test } from 'node:test'
import assert from 'node:assert'
import { add, dft1D } from './lib.js'

const EPS = 1e-9

function assertComplexClose(actual, expected, eps = EPS) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`expected re ${actual.re} to be close to ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`expected im ${actual.im} to be close to ${expected.im}`
	)
}

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('dft1D computes impulse and shifted impulse transforms', () => {
	const impulse = dft1D([1, 0, 0, 0])
	assert.equal(impulse.length, 4)
	for (const bin of impulse) {
		assertComplexClose(bin, { re: 1, im: 0 })
	}

	const shifted = dft1D([0, 1, 0, 0])
	const expectedShifted = [
		{ re: 1, im: 0 },
		{ re: 0, im: -1 },
		{ re: -1, im: 0 },
		{ re: 0, im: 1 },
	]
	assert.equal(shifted.length, 4)
	for (let k = 0; k < 4; k++) {
		assertComplexClose(shifted[k], expectedShifted[k])
	}
})

test('dft1D transforms constant (DC) signal and pure sinusoids', () => {
	const dc = dft1D([3, 3, 3, 3])
	assertComplexClose(dc[0], { re: 12, im: 0 })
	for (let k = 1; k < dc.length; k++) {
		assertComplexClose(dc[k], { re: 0, im: 0 })
	}

	const n = 8
	const cosWave = Array.from({ length: n }, (_, t) => Math.cos((2 * Math.PI * 2 * t) / n))
	const cosDft = dft1D(cosWave)
	for (let k = 0; k < n; k++) {
		const expectedRe = k === 2 || k === 6 ? n / 2 : 0
		assertComplexClose(cosDft[k], { re: expectedRe, im: 0 })
	}

	const sinWave = Array.from({ length: n }, (_, t) => Math.sin((2 * Math.PI * 1 * t) / n))
	const sinDft = dft1D(sinWave)
	for (let k = 0; k < n; k++) {
		let expectedIm = 0
		if (k === 1) expectedIm = -n / 2
		if (k === n - 1) expectedIm = n / 2
		assertComplexClose(sinDft[k], { re: 0, im: expectedIm })
	}
})

test('dft1D satisfies linearity and conjugate symmetry for real signals', () => {
	const x = [1.5, -2, 0.25, 4, -1.75, 3, 0]
	const y = [-0.5, 2.5, 1, -3, 0.75, -1, 2]
	const a = 2.5
	const b = -1.25
	const combined = x.map((v, i) => a * v + b * y[i])

	const dx = dft1D(x)
	const dy = dft1D(y)
	const dCombined = dft1D(combined)

	for (let k = 0; k < x.length; k++) {
		assertComplexClose(dCombined[k], {
			re: a * dx[k].re + b * dy[k].re,
			im: a * dx[k].im + b * dy[k].im,
		})
	}

	// Conjugate symmetry: X[N - k] = conj(X[k])
	for (let k = 1; k < x.length; k++) {
		assertComplexClose(dx[x.length - k], { re: dx[k].re, im: -dx[k].im })
	}
})

test('dft1D satisfies Parseval theorem and exact inverse DFT reconstruction', () => {
	const signal = [2, -1, 3.5, 0, -4.25, 1.5, 2.75]
	const n = signal.length
	const spectrum = dft1D(signal)

	const timeEnergy = signal.reduce((acc, v) => acc + v * v, 0)
	const freqEnergy = spectrum.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0) / n
	assert.ok(Math.abs(timeEnergy - freqEnergy) <= EPS)

	// Reconstruct via inverse DFT
	for (let t = 0; t < n; t++) {
		let re = 0
		let im = 0
		for (let k = 0; k < n; k++) {
			const angle = (2 * Math.PI * k * t) / n
			const cos = Math.cos(angle)
			const sin = Math.sin(angle)
			re += spectrum[k].re * cos - spectrum[k].im * sin
			im += spectrum[k].re * sin + spectrum[k].im * cos
		}
		assert.ok(Math.abs(re / n - signal[t]) <= EPS)
		assert.ok(Math.abs(im / n) <= EPS)
	}
})

test('dft1D handles boundary and invalid inputs', () => {
	assert.deepEqual(dft1D([]), [])

	const single = dft1D([42.5])
	assert.equal(single.length, 1)
	assert.equal(Object.is(single[0].re, 42.5), true)
	assert.equal(Object.is(single[0].im, 0), true)

	const zero = dft1D([0, 0, 0])
	assert.equal(zero.length, 3)
	for (const bin of zero) {
		assert.equal(Object.is(bin.re, 0), true)
		assert.equal(Object.is(bin.im, 0), true)
	}

	assert.throws(() => dft1D(null), TypeError)
	assert.throws(() => dft1D('123'), TypeError)
	assert.throws(() => dft1D([1, NaN, 3]), TypeError)
	assert.throws(() => dft1D([1, Infinity]), TypeError)
	assert.throws(() => dft1D([1, '2']), TypeError)
})
