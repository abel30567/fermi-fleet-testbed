import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformComplexIterative } from './fourierTransformComplexIterative.js'

const EPS = 1e-10

function assertComplexClose(actual, expected, eps = EPS, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${prefix}re mismatch: expected ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${prefix}im mismatch: expected ${expected.im}, got ${actual.im}`
	)
}

function assertComplexArrayClose(actual, expected, eps = EPS) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} vs ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps, `index ${i}`)
	}
}

/**
 * Independent recursive Cooley-Tukey radix-2 FFT reference implementation
 * for power-of-2 lengths, used to cross-check the iterative DFT.
 */
function referenceCooleyTukeyFFT(signal, inverse = false) {
	const n = signal.length
	if (n <= 1) {
		return signal.map(({ re, im }) => ({ re, im }))
	}

	const even = []
	const odd = []
	for (let i = 0; i < n; i++) {
		if (i % 2 === 0) {
			even.push(signal[i])
		} else {
			odd.push(signal[i])
		}
	}

	const fftEven = referenceCooleyTukeyFFT(even, inverse)
	const fftOdd = referenceCooleyTukeyFFT(odd, inverse)

	const sign = inverse ? 1 : -1
	const out = new Array(n)
	for (let k = 0; k < n / 2; k++) {
		const angle = (sign * 2 * Math.PI * k) / n
		const wRe = Math.cos(angle)
		const wIm = Math.sin(angle)

		const oRe = fftOdd[k].re
		const oIm = fftOdd[k].im
		const tRe = wRe * oRe - wIm * oIm
		const tIm = wRe * oIm + wIm * oRe

		out[k] = {
			re: fftEven[k].re + tRe,
			im: fftEven[k].im + tIm,
		}
		out[k + n / 2] = {
			re: fftEven[k].re - tRe,
			im: fftEven[k].im - tIm,
		}
	}

	return out
}

function referenceFFT(signal, inverse = false) {
	const raw = referenceCooleyTukeyFFT(signal, inverse)
	if (!inverse || signal.length === 0) {
		return raw
	}
	const scale = 1 / signal.length
	return raw.map(({ re, im }) => ({ re: re * scale, im: im * scale }))
}

test('normal cases: known 4-point real and complex DFT values', () => {
	const realSignal = [
		{ re: 1, im: 0 },
		{ re: 2, im: 0 },
		{ re: 3, im: 0 },
		{ re: 4, im: 0 },
	]
	const expectedReal = [
		{ re: 10, im: 0 },
		{ re: -2, im: 2 },
		{ re: -2, im: 0 },
		{ re: -2, im: -2 },
	]
	assertComplexArrayClose(fourierTransformComplexIterative(realSignal), expectedReal)

	const complexSignal = [
		{ re: 1, im: -1 },
		{ re: 0, im: 2 },
		{ re: -3, im: 1 },
		{ re: 2, im: 0 },
	]
	// Hand-computed:
	// k=0: (1-i) + 2i + (-3+i) + 2 = 0 + 2i
	// k=1: (1-i) + (2i)(-i) + (-3+i)(-1) + 2(i) = (1-i) + 2 + (3-i) + 2i = 6 + 0i
	// k=2: (1-i) + (2i)(-1) + (-3+i)(1) + 2(-1) = (1-i) - 2i - 3 + i - 2 = -4 - 2i
	// k=3: (1-i) + (2i)(i) + (-3+i)(-1) + 2(-i) = (1-i) - 2 + (3-i) - 2i = 2 - 4i
	const expectedComplex = [
		{ re: 0, im: 2 },
		{ re: 6, im: 0 },
		{ re: -4, im: -2 },
		{ re: 2, im: -4 },
	]
	assertComplexArrayClose(fourierTransformComplexIterative(complexSignal), expectedComplex)
})

test('normal cases: arbitrary non-power-of-2 lengths (3, 5, 6, 7) and non-mutation', () => {
	const input = [
		{ re: 1, im: 0.5 },
		{ re: -2, im: 1.5 },
		{ re: 0.25, im: -0.75 },
	]
	const snapshot = structuredClone(input)
	const output = fourierTransformComplexIterative(input)

	assert.deepEqual(input, snapshot)
	assert.equal(output.length, 3)

	// Verify X[0] equals sum of input elements for lengths 3, 5, 6, 7
	for (const len of [3, 5, 6, 7]) {
		const seq = Array.from({ length: len }, (_, i) => ({
			re: Math.sin(i + 1),
			im: Math.cos(2 * i - 0.5),
		}))
		const dft = fourierTransformComplexIterative(seq)
		const sumRe = seq.reduce((acc, c) => acc + c.re, 0)
		const sumIm = seq.reduce((acc, c) => acc + c.im, 0)
		assertComplexClose(dft[0], { re: sumRe, im: sumIm })
	}
})

test('edge cases: empty input, single element, zeros, -0 normalization, and extreme magnitudes', () => {
	assert.deepEqual(fourierTransformComplexIterative([]), [])
	assert.deepEqual(fourierTransformComplexIterative([], { inverse: true }), [])

	const single = [{ re: 3.5, im: -2.25 }]
	const singleOut = fourierTransformComplexIterative(single)
	assert.deepEqual(singleOut, [{ re: 3.5, im: -2.25 }])
	assert.notEqual(singleOut[0], single[0])
	assert.deepEqual(fourierTransformComplexIterative(single, { inverse: true }), [{ re: 3.5, im: -2.25 }])

	const zeros = [
		{ re: -0, im: -0 },
		{ re: 0, im: -0 },
		{ re: -0, im: 0 },
	]
	const zeroOut = fourierTransformComplexIterative(zeros)
	for (const z of zeroOut) {
		assert.ok(Object.is(z.re, 0), 'expected +0 for re')
		assert.ok(Object.is(z.im, 0), 'expected +0 for im')
	}

	// Small and large finite values remain accurate on round-trip
	const tiny = [
		{ re: 1e-12, im: -2e-12 },
		{ re: 3e-12, im: 4e-12 },
	]
	assertComplexArrayClose(
		fourierTransformComplexIterative(fourierTransformComplexIterative(tiny), { inverse: true }),
		tiny,
		1e-22
	)

	const large = [
		{ re: 1e8, im: -2e8 },
		{ re: 3e8, im: 4e8 },
	]
	assertComplexArrayClose(
		fourierTransformComplexIterative(fourierTransformComplexIterative(large), { inverse: true }),
		large,
		1e-4
	)
})

test('edge cases: input validation throws TypeError and RangeError on invalid inputs', () => {
	// Invalid signal types
	for (const badSignal of [null, undefined, 42, 'abc', {}, true]) {
		assert.throws(() => fourierTransformComplexIterative(badSignal), TypeError)
	}

	// Sparse array
	const sparse = new Array(3)
	assert.throws(() => fourierTransformComplexIterative(sparse), TypeError)

	// Invalid complex elements
	for (const badElem of [
		null,
		undefined,
		123,
		'1+2i',
		[1, 2],
		{ re: 1 },
		{ im: 2 },
		{ re: '1', im: 0 },
		{ re: 0, im: null },
	]) {
		assert.throws(() => fourierTransformComplexIterative([badElem]), TypeError)
	}

	// Non-finite complex components
	for (const badNum of [NaN, Infinity, -Infinity]) {
		assert.throws(() => fourierTransformComplexIterative([{ re: badNum, im: 0 }]), RangeError)
		assert.throws(() => fourierTransformComplexIterative([{ re: 0, im: badNum }]), RangeError)
	}

	// Invalid options
	const valid = [{ re: 1, im: 0 }]
	for (const badOpts of [null, 123, 'inverse', true, []]) {
		assert.throws(() => fourierTransformComplexIterative(valid, badOpts), TypeError)
	}
	for (const badInverse of [1, 0, 'true', null, {}]) {
		assert.throws(() => fourierTransformComplexIterative(valid, { inverse: badInverse }), TypeError)
	}
})

test('cross-check: analytical closed-form formulas (impulse, DC, complex exponential, cosine)', () => {
	const n = 8

	// 1. Shifted unit impulse delta[t - t0] => X[k] = exp(-i * 2pi * k * t0 / N)
	const t0 = 3
	const impulse = Array.from({ length: n }, (_, t) => ({ re: t === t0 ? 1 : 0, im: 0 }))
	const expectedImpulse = Array.from({ length: n }, (_, k) => {
		const angle = (-2 * Math.PI * k * t0) / n
		return { re: Math.cos(angle), im: Math.sin(angle) }
	})
	assertComplexArrayClose(fourierTransformComplexIterative(impulse), expectedImpulse)

	// 2. Constant DC signal c => X[0] = N * c, X[k > 0] = 0
	const c = { re: 2.5, im: -1.25 }
	const dc = Array.from({ length: n }, () => ({ ...c }))
	const expectedDc = Array.from({ length: n }, (_, k) =>
		k === 0 ? { re: n * c.re, im: n * c.im } : { re: 0, im: 0 }
	)
	assertComplexArrayClose(fourierTransformComplexIterative(dc), expectedDc)

	// 3. Pure complex exponential exp(i * 2pi * m * t / N) => N * delta[k - m]
	const m = 5
	const expSignal = Array.from({ length: n }, (_, t) => {
		const angle = (2 * Math.PI * m * t) / n
		return { re: Math.cos(angle), im: Math.sin(angle) }
	})
	const expectedExp = Array.from({ length: n }, (_, k) => ({ re: k === m ? n : 0, im: 0 }))
	assertComplexArrayClose(fourierTransformComplexIterative(expSignal), expectedExp)

	// 4. Pure cosine cos(2pi * f * t / N) => N/2 at bins f and N - f
	const f = 2
	const cosSignal = Array.from({ length: n }, (_, t) => ({
		re: Math.cos((2 * Math.PI * f * t) / n),
		im: 0,
	}))
	const expectedCos = Array.from({ length: n }, (_, k) => ({
		re: k === f || k === n - f ? n / 2 : 0,
		im: 0,
	}))
	assertComplexArrayClose(fourierTransformComplexIterative(cosSignal), expectedCos)
})

test('cross-check: inverse round-trip, Parseval theorem, linearity, shift theorem, and conjugate symmetry', () => {
	// Inverse round-trip across diverse lengths
	for (const len of [1, 2, 3, 5, 7, 8, 12, 16]) {
		const x = Array.from({ length: len }, (_, i) => ({
			re: Math.cos(i * 1.3) * (i + 1),
			im: Math.sin(i * 0.7) * (len - i),
		}))
		const X = fourierTransformComplexIterative(x)
		const recovered = fourierTransformComplexIterative(X, { inverse: true })
		assertComplexArrayClose(recovered, x)

		const roundTripBack = fourierTransformComplexIterative(
			fourierTransformComplexIterative(X, { inverse: true })
		)
		assertComplexArrayClose(roundTripBack, X)

		// Parseval's theorem: sum |X[k]|^2 === N * sum |x[n]|^2
		const energyTime = x.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0)
		const energyFreq = X.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0)
		assert.ok(
			Math.abs(energyFreq - len * energyTime) <= 1e-8 * Math.max(1, energyFreq),
			`Parseval failed for N=${len}: ${energyFreq} vs ${len * energyTime}`
		)
	}

	// Linearity: DFT(a*x + b*y) === a*DFT(x) + b*DFT(y)
	const n = 7
	const a = { re: 2.5, im: -1.5 }
	const b = { re: -0.75, im: 3.25 }
	const mul = (u, v) => ({ re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re })
	const add = (u, v) => ({ re: u.re + v.re, im: u.im + v.im })

	const x = Array.from({ length: n }, (_, i) => ({ re: i - 3, im: 0.5 * i }))
	const y = Array.from({ length: n }, (_, i) => ({ re: Math.sin(i), im: Math.cos(i) }))
	const combined = x.map((xi, i) => add(mul(a, xi), mul(b, y[i])))

	const dftCombined = fourierTransformComplexIterative(combined)
	const dftX = fourierTransformComplexIterative(x)
	const dftY = fourierTransformComplexIterative(y)
	const expectedLinear = dftX.map((Xi, i) => add(mul(a, Xi), mul(b, dftY[i])))
	assertComplexArrayClose(dftCombined, expectedLinear)

	// Circular shift theorem: y[t] = x[(t - s) mod N] => Y[k] = X[k] * exp(-i * 2pi * k * s / N)
	const shift = 2
	const shifted = Array.from({ length: n }, (_, t) => x[(t - shift + n) % n])
	const dftShifted = fourierTransformComplexIterative(shifted)
	const expectedShifted = dftX.map((Xk, k) => {
		const angle = (-2 * Math.PI * k * shift) / n
		return mul(Xk, { re: Math.cos(angle), im: Math.sin(angle) })
	})
	assertComplexArrayClose(dftShifted, expectedShifted)

	// Conjugate symmetry for real-valued signals: X[N - k] = conj(X[k])
	const realInput = Array.from({ length: 9 }, (_, i) => ({ re: Math.sin(i * 1.7) + i * 0.2, im: 0 }))
	const realDft = fourierTransformComplexIterative(realInput)
	for (let k = 1; k < realInput.length; k++) {
		assertComplexClose(realDft[realInput.length - k], { re: realDft[k].re, im: -realDft[k].im })
	}
})

test('cross-check: matches independent recursive Cooley-Tukey radix-2 FFT for power-of-2 sizes', () => {
	for (const n of [1, 2, 4, 8, 16, 32]) {
		const signal = Array.from({ length: n }, (_, i) => ({
			re: Math.sin(i * 2.17 + 0.3) * 5,
			im: Math.cos(i * 1.41 - 0.8) * 3,
		}))

		const iterativeForward = fourierTransformComplexIterative(signal)
		const fftForward = referenceFFT(signal, false)
		assertComplexArrayClose(iterativeForward, fftForward, 1e-9)

		const iterativeInverse = fourierTransformComplexIterative(iterativeForward, { inverse: true })
		const fftInverse = referenceFFT(fftForward, true)
		assertComplexArrayClose(iterativeInverse, fftInverse, 1e-9)
	}
})
