import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionDualSeries } from './convolutionDualSeries.js'

const dual = (v, d) => ({ v, d })

function assertDualApprox(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, 'sequence lengths must match')
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= tol,
			`index ${i} value mismatch: got ${actual[i].v}, expected ${expected[i].v}`
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= tol,
			`index ${i} derivative mismatch: got ${actual[i].d}, expected ${expected[i].d}`
		)
	}
}

/**
 * Independent real discrete convolution helper for finite-difference cross-checks.
 */
function directRealConvolve(u, w) {
	const out = new Array(u.length + w.length - 1).fill(0)
	for (let k = 0; k < out.length; k++) {
		let sum = 0
		for (let i = 0; i < u.length; i++) {
			const j = k - i
			if (j >= 0 && j < w.length) {
				sum += u[i] * w[j]
			}
		}
		out[k] = sum
	}
	return out
}

/**
 * Independent dual polynomial evaluation P(x) = sum_k c_k x^k.
 */
function evalDualPoly(coeffs, x) {
	let v = 0
	let d = 0
	let xp = 1
	for (const c of coeffs) {
		v += c.v * xp
		d += c.d * xp
		xp *= x
	}
	return { v, d }
}

/**
 * Independent radix-free DFT of a real array zero-padded to length N.
 */
function dft(arr, N) {
	const re = new Array(N).fill(0)
	const im = new Array(N).fill(0)
	for (let k = 0; k < N; k++) {
		let sr = 0
		let si = 0
		for (let n = 0; n < arr.length; n++) {
			const angle = (-2 * Math.PI * k * n) / N
			sr += arr[n] * Math.cos(angle)
			si += arr[n] * Math.sin(angle)
		}
		re[k] = sr
		im[k] = si
	}
	return { re, im }
}

function idftReal(re, im) {
	const N = re.length
	const out = new Array(N).fill(0)
	for (let n = 0; n < N; n++) {
		let s = 0
		for (let k = 0; k < N; k++) {
			const angle = (2 * Math.PI * k * n) / N
			s += re[k] * Math.cos(angle) - im[k] * Math.sin(angle)
		}
		out[n] = s / N
	}
	return out
}

describe('convolutionDualSeries', () => {
	test('computes exact full convolution for small dual sequences', () => {
		// A = [1 + 2e, 3 + 4e], B = [5 + 6e, 7 + 8e]
		// c0 = (1 + 2e)(5 + 6e) = 5 + 16e
		// c1 = (1 + 2e)(7 + 8e) + (3 + 4e)(5 + 6e) = (7 + 22e) + (15 + 38e) = 22 + 60e
		// c2 = (3 + 4e)(7 + 8e) = 21 + 52e
		const a = [dual(1, 2), dual(3, 4)]
		const b = [dual(5, 6), dual(7, 8)]
		const res = convolutionDualSeries(a, b)

		assert.deepStrictEqual(res, [dual(5, 16), dual(22, 60), dual(21, 52)])
	})

	test('handles asymmetric lengths in full, same, and valid modes', () => {
		const a = [dual(1, 0.5), dual(2, -1), dual(3, 2), dual(-1, 0.25)]
		const b = [dual(2, 1), dual(-1, 3)]

		const full = convolutionDualSeries(a, b, 'full')
		assert.equal(full.length, 5)
		// c0 = (1 + 0.5e)(2 + e) = 2 + 2e
		// c1 = (1 + 0.5e)(-1 + 3e) + (2 - e)(2 + e) = (-1 + 2.5e) + (4 + 0e) = 3 + 2.5e
		// c2 = (2 - e)(-1 + 3e) + (3 + 2e)(2 + e) = (-2 + 7e) + (6 + 7e) = 4 + 14e
		// c3 = (3 + 2e)(-1 + 3e) + (-1 + 0.25e)(2 + e) = (-3 + 7e) + (-2 - 0.5e) = -5 + 6.5e
		// c4 = (-1 + 0.25e)(-1 + 3e) = 1 - 3.25e
		assert.deepStrictEqual(full, [
			dual(2, 2),
			dual(3, 2.5),
			dual(4, 14),
			dual(-5, 6.5),
			dual(1, -3.25),
		])

		// 'same' mode: start = floor((2 - 1) / 2) = 0, length = 4
		const same = convolutionDualSeries(a, b, 'same')
		assert.deepStrictEqual(same, full.slice(0, 4))

		// 'valid' mode: start = min(4, 2) - 1 = 1, length = 4 - 2 + 1 = 3
		const valid = convolutionDualSeries(a, b, 'valid')
		assert.deepStrictEqual(valid, full.slice(1, 4))

		// 'same' mode with odd kernel length (n = 3 -> start = 1)
		const kernel3 = [dual(1, 0), dual(0, 1), dual(-1, 2)]
		const full3 = convolutionDualSeries(a, kernel3, 'full')
		const same3 = convolutionDualSeries(a, kernel3, 'same')
		assert.deepStrictEqual(same3, full3.slice(1, 1 + a.length))

		// 'valid' mode when a is shorter than b is symmetric
		const validShortLong = convolutionDualSeries(b, a, 'valid')
		assert.deepStrictEqual(validShortLong, valid)
	})

	test('edge cases: single-element sequences, impulses, shifts, and zeros', () => {
		// Scalar dual multiplication (1x1)
		assert.deepStrictEqual(
			convolutionDualSeries([dual(3, -2)], [dual(-4, 5)]),
			[dual(-12, 23)]
		)

		// Unit impulse (multiplicative identity)
		const seq = [dual(1.5, -0.5), dual(0, 2), dual(-3, 0)]
		assert.deepStrictEqual(convolutionDualSeries(seq, [dual(1, 0)]), seq)

		// Pure tangent impulse shifts primal values into derivatives
		assert.deepStrictEqual(convolutionDualSeries(seq, [dual(0, 1)]), [
			dual(0, 1.5),
			dual(0, 0),
			dual(0, -3),
		])

		// Delay impulse [0, 1] shifts sequence by 1
		assert.deepStrictEqual(convolutionDualSeries(seq, [dual(0, 0), dual(1, 0)]), [
			dual(0, 0),
			...seq,
		])

		// Zero sequence produces +0 (never -0)
		const zeros = convolutionDualSeries([dual(-1, -2), dual(3, -4)], [dual(0, 0), dual(0, 0)])
		for (const item of zeros) {
			assert.ok(Object.is(item.v, 0), 'expected +0 for v')
			assert.ok(Object.is(item.d, 0), 'expected +0 for d')
		}
	})

	test('satisfies algebraic laws: commutativity, associativity, distributivity', () => {
		const a = [dual(1.2, -0.3), dual(-2.5, 1.1), dual(0.7, 0.4)]
		const b = [dual(-0.8, 2.0), dual(3.1, -1.5)]
		const c = [dual(0.5, 0.5), dual(-1.0, 0.2), dual(2.2, -0.9)]

		// Commutativity: a * b == b * a
		assertDualApprox(convolutionDualSeries(a, b), convolutionDualSeries(b, a))

		// Associativity: (a * b) * c == a * (b * c)
		const left = convolutionDualSeries(convolutionDualSeries(a, b), c)
		const right = convolutionDualSeries(a, convolutionDualSeries(b, c))
		assertDualApprox(left, right, 1e-11)

		// Distributivity: a * (b_padded + c) == a * b_padded + a * c
		const bPadded = [...b, dual(0, 0)]
		const bPlusC = bPadded.map((x, i) => dual(x.v + c[i].v, x.d + c[i].d))
		const lhs = convolutionDualSeries(a, bPlusC)
		const ab = convolutionDualSeries(a, bPadded)
		const ac = convolutionDualSeries(a, c)
		const rhs = ab.map((x, i) => dual(x.v + ac[i].v, x.d + ac[i].d))
		assertDualApprox(lhs, rhs, 1e-11)
	})

	test('independent cross-check 1: central finite-difference derivative along nonlinear curve', () => {
		// Parameterize a_i(t) = sin((i + 1) * t + 0.3 * i) and b_j(t) = exp((0.2 * j - 0.1) * t)
		const t0 = 0.7
		const m = 5
		const n = 4

		const evalA = (t) =>
			Array.from({ length: m }, (_, i) => Math.sin((i + 1) * t + 0.3 * i))
		const evalADeriv = (t) =>
			Array.from({ length: m }, (_, i) => (i + 1) * Math.cos((i + 1) * t + 0.3 * i))

		const evalB = (t) =>
			Array.from({ length: n }, (_, j) => Math.exp((0.2 * j - 0.1) * t))
		const evalBDeriv = (t) =>
			Array.from({ length: n }, (_, j) => (0.2 * j - 0.1) * Math.exp((0.2 * j - 0.1) * t))

		const aDual = evalA(t0).map((v, i) => dual(v, evalADeriv(t0)[i]))
		const bDual = evalB(t0).map((v, j) => dual(v, evalBDeriv(t0)[j]))
		const result = convolutionDualSeries(aDual, bDual)

		const h = 1e-6
		const f0 = directRealConvolve(evalA(t0), evalB(t0))
		const fPlus = directRealConvolve(evalA(t0 + h), evalB(t0 + h))
		const fMinus = directRealConvolve(evalA(t0 - h), evalB(t0 - h))
		const expected = f0.map((v, k) => dual(v, (fPlus[k] - fMinus[k]) / (2 * h)))

		assertDualApprox(result, expected, 1e-8)
	})

	test('independent cross-check 2: polynomial generating-function identity P_C(x) = P_A(x) * P_B(x)', () => {
		const a = [dual(1.5, -0.7), dual(-2.3, 1.4), dual(0.8, 0.2), dual(3.1, -1.9)]
		const b = [dual(-0.4, 1.1), dual(2.6, -0.5), dual(-1.2, 0.9)]
		const c = convolutionDualSeries(a, b)

		for (const x of [-2, -0.5, 0, 1, 1.75]) {
			const pa = evalDualPoly(a, x)
			const pb = evalDualPoly(b, x)
			const pc = evalDualPoly(c, x)
			const expectedV = pa.v * pb.v
			const expectedD = pa.v * pb.d + pa.d * pb.v

			assert.ok(Math.abs(pc.v - expectedV) <= 1e-11, `value mismatch at x=${x}`)
			assert.ok(Math.abs(pc.d - expectedD) <= 1e-11, `deriv mismatch at x=${x}`)
		}
	})

	test('independent cross-check 3: DFT convolution theorem over dual numbers', () => {
		const a = [dual(2, -1), dual(-3, 0.5), dual(1.25, 2.5), dual(0.75, -0.25)]
		const b = [dual(-1.5, 0.8), dual(0.4, -1.2), dual(2.1, 0.6)]
		const actual = convolutionDualSeries(a, b)

		const N = a.length + b.length - 1
		const Av = dft(a.map((x) => x.v), N)
		const Ad = dft(a.map((x) => x.d), N)
		const Bv = dft(b.map((x) => x.v), N)
		const Bd = dft(b.map((x) => x.d), N)

		const CvRe = new Array(N)
		const CvIm = new Array(N)
		const CdRe = new Array(N)
		const CdIm = new Array(N)

		for (let k = 0; k < N; k++) {
			// Complex product: Av * Bv
			CvRe[k] = Av.re[k] * Bv.re[k] - Av.im[k] * Bv.im[k]
			CvIm[k] = Av.re[k] * Bv.im[k] + Av.im[k] * Bv.re[k]
			// Complex product rule: Av * Bd + Ad * Bv
			CdRe[k] =
				(Av.re[k] * Bd.re[k] - Av.im[k] * Bd.im[k]) +
				(Ad.re[k] * Bv.re[k] - Ad.im[k] * Bv.im[k])
			CdIm[k] =
				(Av.re[k] * Bd.im[k] + Av.im[k] * Bd.re[k]) +
				(Ad.re[k] * Bv.im[k] + Ad.im[k] * Bv.re[k])
		}

		const cv = idftReal(CvRe, CvIm)
		const cd = idftReal(CdRe, CdIm)
		const expected = cv.map((v, k) => dual(v, cd[k]))

		assertDualApprox(actual, expected, 1e-11)
	})

	test('validates invalid inputs and throws descriptive errors', () => {
		const validSeq = [dual(1, 0)]

		// Non-array inputs
		assert.throws(() => convolutionDualSeries(null, validSeq), TypeError)
		assert.throws(() => convolutionDualSeries(validSeq, undefined), TypeError)
		assert.throws(() => convolutionDualSeries(123, validSeq), TypeError)
		assert.throws(() => convolutionDualSeries(validSeq, { v: 1, d: 0 }), TypeError)

		// Empty sequences
		assert.throws(() => convolutionDualSeries([], validSeq), RangeError)
		assert.throws(() => convolutionDualSeries(validSeq, []), RangeError)

		// Invalid dual elements
		assert.throws(() => convolutionDualSeries([null], validSeq), TypeError)
		assert.throws(() => convolutionDualSeries([[1, 2]], validSeq), TypeError)
		assert.throws(() => convolutionDualSeries([42], validSeq), TypeError)
		assert.throws(() => convolutionDualSeries([{ v: 1 }], validSeq), TypeError)
		assert.throws(() => convolutionDualSeries([{ d: 1 }], validSeq), TypeError)
		assert.throws(() => convolutionDualSeries([{ v: '1', d: 0 }], validSeq), TypeError)
		assert.throws(() => convolutionDualSeries(validSeq, [{ v: 1, d: '0' }]), TypeError)

		// Non-finite numbers
		assert.throws(() => convolutionDualSeries([dual(NaN, 0)], validSeq), RangeError)
		assert.throws(() => convolutionDualSeries([dual(0, Infinity)], validSeq), RangeError)
		assert.throws(() => convolutionDualSeries(validSeq, [dual(-Infinity, 0)]), RangeError)

		// Invalid mode
		assert.throws(() => convolutionDualSeries(validSeq, validSeq, 123), TypeError)
		assert.throws(() => convolutionDualSeries(validSeq, validSeq, null), TypeError)
		assert.throws(() => convolutionDualSeries(validSeq, validSeq, 'circular'), RangeError)
	})
})
