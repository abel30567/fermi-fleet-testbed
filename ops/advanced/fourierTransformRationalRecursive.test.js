import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformRationalRecursive } from './fourierTransformRationalRecursive.js'

// --- Test Helpers ---

const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })
const c = (re, im = r(0n)) => ({ re, im })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Convert an exact rational { num, den } to a JS Number for floating-point comparisons.
 * Scales safely even when num and den exceed Number.MAX_SAFE_INTEGER.
 */
function ratToNumber({ num, den }) {
	if (num === 0n) return 0
	const scale = 10n ** 18n
	const scaled = (num * scale) / den
	return Number(scaled) / 1e18
}

/**
 * Assert every output rational is strictly normalized:
 * BigInt num/den, den > 0n, lowest terms (gcd(|num|, den) === 1n), and 0n/1n for zero.
 */
function assertAllNormalized(output) {
	for (let i = 0; i < output.length; i++) {
		const { re, im } = output[i]
		for (const part of [re, im]) {
			assert.equal(typeof part.num, 'bigint', `index ${i}: num must be BigInt`)
			assert.equal(typeof part.den, 'bigint', `index ${i}: den must be BigInt`)
			assert.ok(part.den > 0n, `index ${i}: den must be > 0n, got ${part.den}`)
			if (part.num === 0n) {
				assert.equal(part.den, 1n, `index ${i}: zero must have den === 1n`)
			} else {
				assert.equal(
					gcd(part.num, part.den),
					1n,
					`index ${i}: ${part.num}/${part.den} is not in lowest terms`,
				)
			}
		}
	}
}

/**
 * Independent direct O(N^2) exact DFT for N in {1, 2, 4} using exact quadrantal roots of unity.
 */
function directExactDFT(input) {
	const N = input.length
	const norm = (num, den) => {
		if (num === 0n) return { num: 0n, den: 1n }
		const sign = den < 0n ? -1n : 1n
		const n = num * sign
		const d = den * sign
		const g = gcd(n, d)
		return { num: n / g, den: d / g }
	}
	const add = (a, b) => norm(a.num * b.den + b.num * a.den, a.den * b.den)
	const sub = (a, b) => norm(a.num * b.den - b.num * a.den, a.den * b.den)
	const mul = (a, b) => norm(a.num * b.num, a.den * b.den)

	const toComplex = (el) =>
		're' in el ? { re: norm(el.re.num, el.re.den), im: norm(el.im.num, el.im.den) } : { re: norm(el.num, el.den), im: r(0n) }

	const x = input.map(toComplex)
	// Exact quadrantal root W_N^(k*n) where 4*(k*n) % N === 0
	const quadRoot = (kn) => {
		const phase = ((4 * kn) / N) % 4
		const p = ((phase % 4) + 4) % 4
		if (p === 0) return { re: r(1n), im: r(0n) }
		if (p === 1) return { re: r(0n), im: r(-1n) }
		if (p === 2) return { re: r(-1n), im: r(0n) }
		return { re: r(0n), im: r(1n) }
	}

	const out = []
	for (let k = 0; k < N; k++) {
		let sumRe = r(0n)
		let sumIm = r(0n)
		for (let n = 0; n < N; n++) {
			const w = quadRoot(k * n)
			const prodRe = sub(mul(x[n].re, w.re), mul(x[n].im, w.im))
			const prodIm = add(mul(x[n].re, w.im), mul(x[n].im, w.re))
			sumRe = add(sumRe, prodRe)
			sumIm = add(sumIm, prodIm)
		}
		out.push({ re: sumRe, im: sumIm })
	}
	return out
}

/**
 * Independent direct O(N^2) floating-point DFT for numerical cross-checking.
 */
function directFloatDFT(input, inverse = false) {
	const N = input.length
	const x = input.map((el) =>
		're' in el
			? { re: ratToNumber(el.re), im: ratToNumber(el.im) }
			: { re: ratToNumber(el), im: 0 },
	)
	const sign = inverse ? 1 : -1
	const out = []
	for (let k = 0; k < N; k++) {
		let sumRe = 0
		let sumIm = 0
		for (let n = 0; n < N; n++) {
			const theta = (sign * 2 * Math.PI * k * n) / N
			const wr = Math.cos(theta)
			const wi = Math.sin(theta)
			sumRe += x[n].re * wr - x[n].im * wi
			sumIm += x[n].re * wi + x[n].im * wr
		}
		if (inverse) {
			sumRe /= N
			sumIm /= N
		}
		out.push({ re: sumRe, im: sumIm })
	}
	return out
}

// --- Test Suites ---

describe('fourierTransformRationalRecursive - exact algebraic cases (N = 1, 2, 4)', () => {
	test('N = 1: single real rational and single complex rational', () => {
		const resReal = fourierTransformRationalRecursive([r(6n, 4n)])
		assertAllNormalized(resReal)
		assert.deepEqual(resReal, [c(r(3n, 2n), r(0n))])

		const resComplex = fourierTransformRationalRecursive([c(r(-4n, -8n), r(10n, -15n))])
		assertAllNormalized(resComplex)
		assert.deepEqual(resComplex, [c(r(1n, 2n), r(-2n, 3n))])
	})

	test('N = 2: exact sum and difference over rationals', () => {
		const input = [r(1n, 2n), r(3n, 4n)]
		const result = fourierTransformRationalRecursive(input)
		assertAllNormalized(result)
		assert.deepEqual(result, [c(r(5n, 4n), r(0n)), c(r(-1n, 4n), r(0n))])
		assert.deepEqual(result, directExactDFT(input))
	})

	test('N = 4: exact match against independent O(N^2) DFT on real rational signal', () => {
		const input = [r(1n, 2n), r(-1n, 3n), r(2n, 5n), r(3n, 4n)]
		const result = fourierTransformRationalRecursive(input)
		const expected = directExactDFT(input)
		assertAllNormalized(result)
		assert.deepEqual(result, expected)
	})

	test('N = 4: exact match against independent O(N^2) DFT on complex rational signal', () => {
		const input = [
			c(r(1n, 2n), r(1n, 3n)),
			c(r(-2n, 5n), r(3n, 7n)),
			c(r(0n, 1n), r(-1n, 2n)),
			c(r(4n, 3n), r(5n, 6n)),
		]
		const result = fourierTransformRationalRecursive(input)
		const expected = directExactDFT(input)
		assertAllNormalized(result)
		assert.deepEqual(result, expected)

		// Exact round-trip with inverse DFT
		const roundTrip = fourierTransformRationalRecursive(result, { inverse: true })
		assertAllNormalized(roundTrip)
		assert.deepEqual(roundTrip, input)
	})

	test('N = 4: exact Parseval theorem in rational arithmetic', () => {
		const input = [r(1n, 2n), r(2n, 3n), r(-3n, 4n), r(5n, 6n)]
		const out = fourierTransformRationalRecursive(input)

		// Exact energy sum in time domain: sum |x[n]|^2
		// Compare against (1/N) * sum |X[k]|^2
		const norm = (num, den) => {
			const g = gcd(num, den)
			return { num: num / g, den: den / g }
		}
		const add = (a, b) => norm(a.num * b.den + b.num * a.den, a.den * b.den)
		const sq = (a) => norm(a.num * a.num, a.den * a.den)

		let timeEnergy = r(0n)
		for (const x of input) timeEnergy = add(timeEnergy, sq(x))

		let freqEnergy = r(0n)
		for (const X of out) freqEnergy = add(freqEnergy, add(sq(X.re), sq(X.im)))
		const scaledFreqEnergy = norm(freqEnergy.num, freqEnergy.den * BigInt(input.length))

		assert.deepEqual(scaledFreqEnergy, timeEnergy)
	})
})

describe('fourierTransformRationalRecursive - canonical signal edge cases', () => {
	test('impulse signal [1, 0, 0, ...] transforms to flat spectrum [1, 1, 1, ...]', () => {
		for (const N of [1, 2, 4, 8, 16]) {
			const input = Array.from({ length: N }, (_, i) => (i === 0 ? r(1n) : r(0n)))
			const result = fourierTransformRationalRecursive(input)
			assertAllNormalized(result)
			for (let k = 0; k < N; k++) {
				assert.deepEqual(result[k], c(r(1n), r(0n)), `N=${N}, k=${k} should be exactly 1 + 0i`)
			}
		}
	})

	test('constant DC signal [c, c, ..., c] transforms to [N*c, 0, ..., 0]', () => {
		const dc = r(3n, 7n)
		for (const N of [2, 4, 8]) {
			const input = Array.from({ length: N }, () => dc)
			const result = fourierTransformRationalRecursive(input)
			assertAllNormalized(result)
			// k = 0 is exact N * dc
			const g = gcd(BigInt(N) * dc.num, dc.den)
			assert.deepEqual(result[0], c(r((BigInt(N) * dc.num) / g, dc.den / g), r(0n)))
			// k > 0 should be zero (exact for N=2,4; < 1e-14 for N=8)
			for (let k = 1; k < N; k++) {
				assert.ok(Math.abs(ratToNumber(result[k].re)) < 1e-14)
				assert.ok(Math.abs(ratToNumber(result[k].im)) < 1e-14)
			}
		}
	})

	test('alternating Nyquist signal [1, -1, 1, -1, ...] concentrates all energy at k = N/2', () => {
		for (const N of [2, 4, 8]) {
			const input = Array.from({ length: N }, (_, i) => (i % 2 === 0 ? r(1n) : r(-1n)))
			const result = fourierTransformRationalRecursive(input)
			assertAllNormalized(result)
			assert.deepEqual(result[N / 2], c(r(BigInt(N)), r(0n)))
			for (let k = 0; k < N; k++) {
				if (k === N / 2) continue
				assert.ok(Math.abs(ratToNumber(result[k].re)) < 1e-14)
				assert.ok(Math.abs(ratToNumber(result[k].im)) < 1e-14)
			}
		}
	})

	test('all-zero signal returns exact zeros without mutating input', () => {
		const input = [r(0n, 5n), r(0n, -3n), r(0n, 1n), r(0n, 7n)]
		const snapshot = input.map((el) => ({ ...el }))
		const result = fourierTransformRationalRecursive(input)
		assertAllNormalized(result)
		assert.deepEqual(input, snapshot)
		for (const el of result) {
			assert.deepEqual(el, c(r(0n), r(0n)))
		}
	})

	test('mixed real and complex rationals with unnormalized inputs', () => {
		const input = [r(2n, 4n), c(r(-6n, -9n), r(4n, -8n)), r(0n, -5n), c(r(3n, 6n), r(2n, 2n))]
		const result = fourierTransformRationalRecursive(input)
		const expected = directExactDFT(input)
		assertAllNormalized(result)
		assert.deepEqual(result, expected)
	})
})

describe('fourierTransformRationalRecursive - high-precision N = 8 and N = 16 cross-checks', () => {
	test('N = 8: matches independent O(N^2) floating-point DFT to < 1e-14 and satisfies Parseval', () => {
		const input = [
			r(1n, 2n),
			r(-3n, 4n),
			r(5n, 6n),
			r(0n, 1n),
			r(7n, 8n),
			r(-2n, 3n),
			r(1n, 5n),
			r(-4n, 7n),
		]
		const result = fourierTransformRationalRecursive(input)
		const expected = directFloatDFT(input)

		assertAllNormalized(result)
		assert.equal(result.length, 8)

		for (let k = 0; k < 8; k++) {
			const reErr = Math.abs(ratToNumber(result[k].re) - expected[k].re)
			const imErr = Math.abs(ratToNumber(result[k].im) - expected[k].im)
			assert.ok(reErr < 1e-14, `k=${k} re error too large: ${reErr}`)
			assert.ok(imErr < 1e-14, `k=${k} im error too large: ${imErr}`)
		}

		// Parseval's theorem check
		const timeEnergy = input.reduce((acc, el) => acc + ratToNumber(el) ** 2, 0)
		const freqEnergy =
			result.reduce(
				(acc, el) => acc + ratToNumber(el.re) ** 2 + ratToNumber(el.im) ** 2,
				0,
			) / input.length
		assert.ok(
			Math.abs(timeEnergy - freqEnergy) < 1e-14,
			`Parseval mismatch: time=${timeEnergy}, freq=${freqEnergy}`,
		)

		// Inverse round-trip check
		const recovered = fourierTransformRationalRecursive(result, { inverse: true })
		assertAllNormalized(recovered)
		for (let n = 0; n < 8; n++) {
			assert.ok(Math.abs(ratToNumber(recovered[n].re) - ratToNumber(input[n])) < 1e-14)
			assert.ok(Math.abs(ratToNumber(recovered[n].im)) < 1e-14)
		}
	})

	test('N = 16: complex rational input matches O(N^2) floating-point DFT to < 1e-13', () => {
		const input = Array.from({ length: 16 }, (_, i) =>
			c(r(BigInt((i % 5) - 2), BigInt((i % 3) + 1)), r(BigInt((i % 4) - 1), BigInt((i % 2) + 2))),
		)
		const result = fourierTransformRationalRecursive(input)
		const expected = directFloatDFT(input)

		assertAllNormalized(result)
		assert.equal(result.length, 16)

		for (let k = 0; k < 16; k++) {
			const reErr = Math.abs(ratToNumber(result[k].re) - expected[k].re)
			const imErr = Math.abs(ratToNumber(result[k].im) - expected[k].im)
			assert.ok(reErr < 1e-13, `N=16 k=${k} re error too large: ${reErr}`)
			assert.ok(imErr < 1e-13, `N=16 k=${k} im error too large: ${imErr}`)
		}
	})

	test('configurable precision option controls twiddle accuracy', () => {
		const input = [r(0n), r(1n), r(0n), r(0n), r(0n), r(0n), r(0n), r(0n)]
		// X[1] = exp(-i*pi/4) = sqrt(2)/2 - i*sqrt(2)/2
		const lowPrec = fourierTransformRationalRecursive(input, { precision: 6 })
		const highPrec = fourierTransformRationalRecursive(input, { precision: 24 })
		assertAllNormalized(lowPrec)
		assertAllNormalized(highPrec)

		const exactSqrt2Half = Math.SQRT1_2
		const lowErr = Math.abs(ratToNumber(lowPrec[1].re) - exactSqrt2Half)
		assert.ok(lowErr < 1e-6, `precision=6 error should be < 1e-6, got ${lowErr}`)

		// For precision=24, verify directly in BigInt that 2 * re^2 is within 10^-22 of 1
		const { num, den } = highPrec[1].re
		const diff = 2n * num * num - den * den
		const absDiff = diff < 0n ? -diff : diff
		// absDiff / den^2 < 10^-22  <=>  absDiff * 10^22 < den^2
		assert.ok(absDiff * 10n ** 22n < den * den, 'precision=24 twiddle should satisfy 2*re^2 == 1 to >22 digits')
	})
})

describe('fourierTransformRationalRecursive - input validation', () => {
	test('rejects non-array inputs', () => {
		assert.throws(() => fourierTransformRationalRecursive(null), TypeError)
		assert.throws(() => fourierTransformRationalRecursive(undefined), TypeError)
		assert.throws(() => fourierTransformRationalRecursive('1234'), TypeError)
		assert.throws(() => fourierTransformRationalRecursive({ num: 1n, den: 1n }), TypeError)
	})

	test('rejects empty and non-power-of-two array lengths', () => {
		assert.throws(() => fourierTransformRationalRecursive([]), RangeError)
		assert.throws(() => fourierTransformRationalRecursive([r(1n), r(2n), r(3n)]), RangeError)
		assert.throws(
			() => fourierTransformRationalRecursive([r(1n), r(2n), r(3n), r(4n), r(5n), r(6n)]),
			RangeError,
		)
	})

	test('rejects invalid elements, non-BigInt fields, zero denominators, and mixed shapes', () => {
		assert.throws(() => fourierTransformRationalRecursive([1, 2]), TypeError)
		assert.throws(() => fourierTransformRationalRecursive([null]), TypeError)
		assert.throws(() => fourierTransformRationalRecursive([{ num: 1, den: 2n }]), TypeError)
		assert.throws(() => fourierTransformRationalRecursive([{ num: 1n, den: 2 }]), TypeError)
		assert.throws(() => fourierTransformRationalRecursive([{ num: 1n, den: 0n }]), RangeError)
		assert.throws(() => fourierTransformRationalRecursive([{ re: r(1n), im: null }]), TypeError)
		assert.throws(
			() => fourierTransformRationalRecursive([{ re: r(1n), im: { num: 1n, den: 0n } }]),
			RangeError,
		)
		assert.throws(
			() => fourierTransformRationalRecursive([{ num: 1n, den: 1n, re: r(1n), im: r(0n) }]),
			TypeError,
		)
		assert.throws(() => fourierTransformRationalRecursive([{}]), TypeError)
	})

	test('rejects invalid options', () => {
		assert.throws(() => fourierTransformRationalRecursive([r(1n)], null), TypeError)
		assert.throws(() => fourierTransformRationalRecursive([r(1n)], []), TypeError)
		assert.throws(() => fourierTransformRationalRecursive([r(1n)], { inverse: 'yes' }), TypeError)
		assert.throws(() => fourierTransformRationalRecursive([r(1n)], { precision: '16' }), TypeError)
		assert.throws(() => fourierTransformRationalRecursive([r(1n)], { precision: 0 }), RangeError)
		assert.throws(() => fourierTransformRationalRecursive([r(1n)], { precision: -4 }), RangeError)
		assert.throws(() => fourierTransformRationalRecursive([r(1n)], { precision: 1.5 }), RangeError)
		assert.throws(() => fourierTransformRationalRecursive([r(1n)], { precision: 500 }), RangeError)
	})
})
