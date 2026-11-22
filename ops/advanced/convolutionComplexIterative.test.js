import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionComplexIterative } from './convolutionComplexIterative.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexArrayClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length, `length mismatch: got ${actual.length}, expected ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i].re - expected[i].re) <= tol,
			`index ${i} re: got ${actual[i].re}, expected ${expected[i].re}`,
		)
		assert.ok(
			Math.abs(actual[i].im - expected[i].im) <= tol,
			`index ${i} im: got ${actual[i].im}, expected ${expected[i].im}`,
		)
	}
}

// Independent reference helpers for cross-checks
function complexMul(x, y) {
	return {
		re: x.re * y.re - x.im * y.im,
		im: x.re * y.im + x.im * y.re,
	}
}

function complexAdd(x, y) {
	return { re: x.re + y.re, im: x.im + y.im }
}

function dft(seq) {
	const N = seq.length
	const out = new Array(N)
	for (let k = 0; k < N; k++) {
		let sumRe = 0
		let sumIm = 0
		for (let n = 0; n < N; n++) {
			const angle = (-2 * Math.PI * k * n) / N
			const cos = Math.cos(angle)
			const sin = Math.sin(angle)
			sumRe += seq[n].re * cos - seq[n].im * sin
			sumIm += seq[n].re * sin + seq[n].im * cos
		}
		out[k] = { re: sumRe, im: sumIm }
	}
	return out
}

function idft(seq) {
	const N = seq.length
	const out = new Array(N)
	for (let n = 0; n < N; n++) {
		let sumRe = 0
		let sumIm = 0
		for (let k = 0; k < N; k++) {
			const angle = (2 * Math.PI * k * n) / N
			const cos = Math.cos(angle)
			const sin = Math.sin(angle)
			sumRe += seq[k].re * cos - seq[k].im * sin
			sumIm += seq[k].re * sin + seq[k].im * cos
		}
		out[n] = { re: sumRe / N, im: sumIm / N }
	}
	return out
}

function evalPoly(coeffs, z) {
	let acc = c(0, 0)
	let zPow = c(1, 0)
	for (let i = 0; i < coeffs.length; i++) {
		acc = complexAdd(acc, complexMul(coeffs[i], zPow))
		zPow = complexMul(zPow, z)
	}
	return acc
}

test('full linear convolution of hand-calculated complex sequences', () => {
	// a = [1 + 2i, 3 - i]
	// b = [2 + i, -1 + 4i, 0 + 2i]
	// (a*b)[0] = (1+2i)(2+i) = (2 - 2) + (1 + 4)i = 0 + 5i
	// (a*b)[1] = (1+2i)(-1+4i) + (3-i)(2+i) = (-9 + 2i) + (7 + i) = -2 + 3i
	// (a*b)[2] = (1+2i)(2i) + (3-i)(-1+4i) = (-4 + 2i) + (1 + 13i) = -3 + 15i
	// (a*b)[3] = (3-i)(2i) = 2 + 6i
	const a = [c(1, 2), c(3, -1)]
	const b = [c(2, 1), c(-1, 4), c(0, 2)]
	const expected = [c(0, 5), c(-2, 3), c(-3, 15), c(2, 6)]

	assert.deepStrictEqual(convolutionComplexIterative(a, b), expected)
	assert.deepStrictEqual(convolutionComplexIterative(a, b, 'full'), expected)
})

test('real-only and purely imaginary sequences', () => {
	const realA = [c(1, 0), c(2, 0), c(3, 0)]
	const realB = [c(4, 0), c(5, 0)]
	assert.deepStrictEqual(convolutionComplexIterative(realA, realB), [
		c(4, 0),
		c(13, 0),
		c(22, 0),
		c(15, 0),
	])

	// [i, 2i] * [3i, 4i] = [-3, -4 - 6, -8] = [-3, -10, -8]
	const imagA = [c(0, 1), c(0, 2)]
	const imagB = [c(0, 3), c(0, 4)]
	assert.deepStrictEqual(convolutionComplexIterative(imagA, imagB), [
		c(-3, 0),
		c(-10, 0),
		c(-8, 0),
	])
})

test('same, valid, and circular convolution modes', () => {
	const a = [c(1, 1), c(2, 0), c(0, -1), c(3, 2)]
	const b = [c(1, 0), c(0, 1)]
	const full = convolutionComplexIterative(a, b, 'full')
	assert.equal(full.length, 5)

	// same: max(4, 2) = 4, offset = floor((2 - 1) / 2) = 0 -> full[0..3]
	assert.deepStrictEqual(convolutionComplexIterative(a, b, 'same'), full.slice(0, 4))
	// valid: 4 - 2 + 1 = 3, offset = 2 - 1 = 1 -> full[1..3]
	assert.deepStrictEqual(convolutionComplexIterative(a, b, 'valid'), full.slice(1, 4))

	// Odd shorter kernel: lengths 5 and 3 -> full length 7, same offset = 1 (len 5), valid offset = 2 (len 3)
	const x = [c(1, 0), c(2, 1), c(-1, 2), c(0, -3), c(4, 1)]
	const h = [c(0, 1), c(1, -1), c(2, 0)]
	const fullXH = convolutionComplexIterative(x, h, 'full')
	assert.deepStrictEqual(convolutionComplexIterative(x, h, 'same'), fullXH.slice(1, 6))
	assert.deepStrictEqual(convolutionComplexIterative(x, h, 'valid'), fullXH.slice(2, 5))
	// Reversed argument order preserves same/valid symmetry
	assert.deepStrictEqual(convolutionComplexIterative(h, x, 'same'), fullXH.slice(1, 6))
	assert.deepStrictEqual(convolutionComplexIterative(h, x, 'valid'), fullXH.slice(2, 5))

	// Circular convolution hand calculation (length 3):
	// u = [1, i, -1], v = [2, 0, 1+i]
	// c[0] = u[0]v[0] + u[1]v[2] + u[2]v[1] = 2 + i(1+i) + 0 = 1 + i
	// c[1] = u[0]v[1] + u[1]v[0] + u[2]v[2] = 0 + 2i - (1+i) = -1 + i
	// c[2] = u[0]v[2] + u[1]v[1] + u[2]v[0] = (1+i) + 0 - 2 = -1 + i
	const u = [c(1, 0), c(0, 1), c(-1, 0)]
	const v = [c(2, 0), c(0, 0), c(1, 1)]
	assert.deepStrictEqual(convolutionComplexIterative(u, v, 'circular'), [
		c(1, 1),
		c(-1, 1),
		c(-1, 1),
	])
})

test('edge cases: empty inputs, unit impulse, delayed shift, negative zero, immutability', () => {
	// Empty sequences
	assert.deepStrictEqual(convolutionComplexIterative([], []), [])
	assert.deepStrictEqual(convolutionComplexIterative([], [c(1, 2)]), [])
	assert.deepStrictEqual(convolutionComplexIterative([c(1, 2)], []), [])
	assert.deepStrictEqual(convolutionComplexIterative([], [c(1, 2)], 'same'), [])
	assert.deepStrictEqual(convolutionComplexIterative([c(1, 2)], [], 'valid'), [])
	assert.deepStrictEqual(convolutionComplexIterative([], [], 'circular'), [])

	// Single element (complex scalar multiplication)
	assert.deepStrictEqual(convolutionComplexIterative([c(3, 4)], [c(2, -5)]), [c(26, -7)])

	// Unit impulse identity & delayed impulse shift
	const sig = [c(1, -2), c(3, 4), c(-5, 0.5)]
	assert.deepStrictEqual(convolutionComplexIterative(sig, [c(1, 0)]), sig)
	assert.deepStrictEqual(convolutionComplexIterative(sig, [c(0, 0), c(0, 0), c(1, 0)]), [
		c(0, 0),
		c(0, 0),
		...sig,
	])

	// Negative zero normalization
	const negZeroRes = convolutionComplexIterative([c(-0, 0)], [c(1, -0)])
	assert.ok(Object.is(negZeroRes[0].re, 0))
	assert.ok(Object.is(negZeroRes[0].im, 0))

	// Does not mutate inputs and returns fresh objects
	const snapshot = sig.map((z) => ({ ...z }))
	const out = convolutionComplexIterative(sig, [c(1, 0)])
	assert.deepStrictEqual(sig, snapshot)
	assert.notEqual(out[0], sig[0])
})

test('input validation throws TypeError and RangeError on invalid inputs', () => {
	// Non-array inputs
	assert.throws(() => convolutionComplexIterative(null, []), TypeError)
	assert.throws(() => convolutionComplexIterative([], undefined), TypeError)
	assert.throws(() => convolutionComplexIterative('abc', []), TypeError)
	assert.throws(() => convolutionComplexIterative({}, []), TypeError)
	assert.throws(() => convolutionComplexIterative([c(1, 0)], 42), TypeError)

	// Invalid elements
	assert.throws(() => convolutionComplexIterative([null], [c(1, 0)]), TypeError)
	assert.throws(() => convolutionComplexIterative([1], [c(1, 0)]), TypeError)
	assert.throws(() => convolutionComplexIterative([[1, 2]], [c(1, 0)]), TypeError)
	assert.throws(() => convolutionComplexIterative([{ re: 1 }], [c(1, 0)]), TypeError)
	assert.throws(() => convolutionComplexIterative([{ re: '1', im: 0 }], [c(1, 0)]), TypeError)
	// Still validates non-empty sequence even when the other sequence is empty
	assert.throws(() => convolutionComplexIterative([], [{ re: 1, im: 'bad' }]), TypeError)

	// Non-finite numbers
	assert.throws(() => convolutionComplexIterative([c(NaN, 0)], [c(1, 0)]), RangeError)
	assert.throws(() => convolutionComplexIterative([c(1, 0)], [c(0, Infinity)]), RangeError)
	assert.throws(() => convolutionComplexIterative([c(-Infinity, 0)], [c(1, 0)]), RangeError)

	// Invalid mode
	assert.throws(() => convolutionComplexIterative([c(1, 0)], [c(1, 0)], 123), TypeError)
	assert.throws(() => convolutionComplexIterative([c(1, 0)], [c(1, 0)], 'linear'), RangeError)

	// Circular mode length mismatch
	assert.throws(
		() => convolutionComplexIterative([c(1, 0), c(2, 0)], [c(1, 0)], 'circular'),
		RangeError,
	)
})

test('cross-check: DFT/IDFT Convolution Theorem for linear and circular convolution', () => {
	const a = [c(1.5, -0.5), c(-2, 3), c(0.25, 1.75), c(4, -1), c(-0.5, 0.5)]
	const b = [c(-1, 2), c(0.5, -1.5), c(3, 0.25), c(-2.5, -0.75)]

	// Full linear convolution via zero-padded DFT -> pointwise product -> IDFT
	const L = a.length + b.length - 1
	const aPad = [...a, ...Array.from({ length: L - a.length }, () => c(0, 0))]
	const bPad = [...b, ...Array.from({ length: L - b.length }, () => c(0, 0))]
	const A = dft(aPad)
	const B = dft(bPad)
	const expectedLinear = idft(A.map((ak, k) => complexMul(ak, B[k])))

	const actualLinear = convolutionComplexIterative(a, b, 'full')
	assertComplexArrayClose(actualLinear, expectedLinear, 1e-10)

	// Circular convolution via DFT -> pointwise product -> IDFT
	const p = [c(2, -1), c(-3, 0.5), c(1.2, 4.1), c(0, -2.5), c(-1.5, 1.5), c(3.3, -0.7)]
	const q = [c(-0.5, 1.5), c(2.2, -3.1), c(0.8, 0.4), c(-4, 2), c(1, 1), c(-0.2, -1.8)]
	const P = dft(p)
	const Q = dft(q)
	const expectedCircular = idft(P.map((pk, k) => complexMul(pk, Q[k])))

	const actualCircular = convolutionComplexIterative(p, q, 'circular')
	assertComplexArrayClose(actualCircular, expectedCircular, 1e-10)
})

test('cross-check: analytical closed-form convolution of complex geometric sequences', () => {
	// If a[k] = r^k for 0 <= k < N, then:
	// (a * a)[n] = (n + 1) * r^n             for 0 <= n < N
	// (a * a)[n] = (2*N - 1 - n) * r^n       for N <= n <= 2*N - 2
	const N = 8
	const r = c(0.5, 0.5)
	const a = []
	let rPow = c(1, 0)
	for (let k = 0; k < N; k++) {
		a.push(rPow)
		rPow = complexMul(rPow, r)
	}

	const expected = []
	let power = c(1, 0)
	for (let n = 0; n < 2 * N - 1; n++) {
		const coeff = n < N ? n + 1 : 2 * N - 1 - n
		expected.push({ re: coeff * power.re, im: coeff * power.im })
		power = complexMul(power, r)
	}

	const actual = convolutionComplexIterative(a, a, 'full')
	assertComplexArrayClose(actual, expected, 1e-12)
})

test('cross-check: polynomial multiplication identity and algebraic laws', () => {
	const a = [c(1, -1), c(2, 3), c(-0.5, 1.5), c(0, -2)]
	const b = [c(-2, 0.5), c(1, 1), c(3, -1)]
	const d = [c(0.5, 2), c(-1, -0.5), c(2, 1)]

	// Polynomial evaluation identity: P(z) * Q(z) === (P * Q)(z)
	const convAB = convolutionComplexIterative(a, b, 'full')
	const evalPoints = [c(1, 0), c(0, 1), c(-1, 2), c(0.3, -0.7)]
	for (const z of evalPoints) {
		const lhs = complexMul(evalPoly(a, z), evalPoly(b, z))
		const rhs = evalPoly(convAB, z)
		assertComplexArrayClose([rhs], [lhs], 1e-10)
	}

	// Commutativity across all modes
	assertComplexArrayClose(
		convolutionComplexIterative(a, b, 'full'),
		convolutionComplexIterative(b, a, 'full'),
		1e-12,
	)
	assertComplexArrayClose(
		convolutionComplexIterative(a, b, 'same'),
		convolutionComplexIterative(b, a, 'same'),
		1e-12,
	)
	assertComplexArrayClose(
		convolutionComplexIterative(a, b, 'valid'),
		convolutionComplexIterative(b, a, 'valid'),
		1e-12,
	)
	assertComplexArrayClose(
		convolutionComplexIterative(b, d, 'circular'),
		convolutionComplexIterative(d, b, 'circular'),
		1e-12,
	)

	// Associativity: (a * b) * d === a * (b * d)
	const leftAssoc = convolutionComplexIterative(convolutionComplexIterative(a, b), d)
	const rightAssoc = convolutionComplexIterative(a, convolutionComplexIterative(b, d))
	assertComplexArrayClose(leftAssoc, rightAssoc, 1e-10)

	// Distributivity: a * (b + d) === (a * b) + (a * d)
	const bPlusD = b.map((bk, i) => complexAdd(bk, d[i]))
	const lhsDist = convolutionComplexIterative(a, bPlusD)
	const ab = convolutionComplexIterative(a, b)
	const ad = convolutionComplexIterative(a, d)
	const rhsDist = ab.map((v, i) => complexAdd(v, ad[i]))
	assertComplexArrayClose(lhsDist, rhsDist, 1e-10)
})
