import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionComplexSeries } from './convolutionComplexSeries.js'

const c = (re, im = 0) => ({ re, im })

function cAdd(x, y) {
	return { re: x.re + y.re, im: x.im + y.im }
}

function cMul(x, y) {
	return { re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re }
}

/**
 * Independent direct O(N * M) Cauchy product reference implementation.
 */
function directCauchyProduct(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const out = Array.from({ length: a.length + b.length - 1 }, () => ({ re: 0, im: 0 }))
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			const prod = cMul(a[i], b[j])
			out[i + j].re += prod.re
			out[i + j].im += prod.im
		}
	}
	return out
}

/**
 * Evaluates a complex polynomial P(z) = sum_{k=0}^{n-1} coeffs[k] * z^k via Horner's method.
 */
function evalComplexPoly(coeffs, z) {
	let acc = { re: 0, im: 0 }
	for (let k = coeffs.length - 1; k >= 0; k--) {
		acc = cAdd(cMul(acc, z), coeffs[k])
	}
	return acc
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible pseudo-random complex sequences.
 */
function makeRng(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function randomComplexSeq(len, rng, scale = 10) {
	return Array.from({ length: len }, () => ({
		re: (rng() * 2 - 1) * scale,
		im: (rng() * 2 - 1) * scale,
	}))
}

function assertComplexClose(actual, expected, tol = 1e-10, label = '') {
	assert.equal(typeof actual.re, 'number')
	assert.equal(typeof actual.im, 'number')
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	assert.ok(
		errRe <= tol && errIm <= tol,
		`${label} expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), diff=(${errRe}, ${errIm}), tol=${tol}`,
	)
}

function assertComplexSeqClose(actual, expected, tol = 1e-10, label = '') {
	assert.equal(actual.length, expected.length, `${label} length mismatch`)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `${label}[${i}]`)
	}
}

describe('convolutionComplexSeries', () => {
	describe('basic and closed-form cases', () => {
		test('single-element complex multiplication', () => {
			const res = convolutionComplexSeries([c(3, 4)], [c(2, -5)])
			assertComplexSeqClose(res, [c(26, -7)], 1e-12)
		})

		test('(1 + i*z)(1 - i*z) = 1 + z^2', () => {
			const a = [c(1, 0), c(0, 1)]
			const b = [c(1, 0), c(0, -1)]
			const res = convolutionComplexSeries(a, b)
			assertComplexSeqClose(res, [c(1, 0), c(0, 0), c(1, 0)], 1e-12)
		})

		test('purely real sequences', () => {
			const a = [c(1, 0), c(2, 0), c(3, 0)]
			const b = [c(4, 0), c(5, 0)]
			const res = convolutionComplexSeries(a, b)
			assertComplexSeqClose(res, [c(4, 0), c(13, 0), c(22, 0), c(15, 0)], 1e-12)
		})

		test('purely imaginary sequences produce purely real output', () => {
			const a = [c(0, 2), c(0, -3)]
			const b = [c(0, 4), c(0, 5)]
			// (2i - 3iz)(4i + 5iz) = -8 + (12 - 10)z + 15z^2 = -8 + 2z + 15z^2
			const res = convolutionComplexSeries(a, b)
			assertComplexSeqClose(res, [c(-8, 0), c(2, 0), c(15, 0)], 1e-12)
		})

		test('complex polynomial product with mixed coefficients', () => {
			// (1 + i + 2z)(3 - 2i + iz) = (5 + i) + (5 - 3i)z + 2iz^2
			const a = [c(1, 1), c(2, 0)]
			const b = [c(3, -2), c(0, 1)]
			const res = convolutionComplexSeries(a, b)
			assertComplexSeqClose(res, [c(5, 1), c(5, -3), c(0, 2)], 1e-12)
		})

		test('closed-form Cauchy product of truncated geometric series', () => {
			// a_k = r^k for k = 0..n-1 => (a * a)_k = (k + 1) r^k for k < n, (2n - 1 - k) r^k for k >= n
			const n = 12
			const r = c(0.6, -0.5)
			const a = []
			let cur = c(1, 0)
			for (let k = 0; k < n; k++) {
				a.push(cur)
				cur = cMul(cur, r)
			}

			const actual = convolutionComplexSeries(a, a)
			const expected = []
			let rPow = c(1, 0)
			for (let k = 0; k < 2 * n - 1; k++) {
				const coeff = k < n ? k + 1 : 2 * n - 1 - k
				expected.push(c(coeff * rPow.re, coeff * rPow.im))
				rPow = cMul(rPow, r)
			}

			assertComplexSeqClose(actual, expected, 1e-11, 'geometric self-convolution')
		})

		test('cyclotomic / telescoping identity (1 - z) * sum_{k=0}^{n-1} z^k = 1 - z^n', () => {
			const n = 17
			const oneMinusZ = [c(1, 0), c(-1, 0)]
			const ones = Array.from({ length: n }, () => c(1, 0))
			const res = convolutionComplexSeries(oneMinusZ, ones)
			const expected = Array.from({ length: n + 1 }, (_, k) =>
				k === 0 ? c(1, 0) : k === n ? c(-1, 0) : c(0, 0),
			)
			assertComplexSeqClose(res, expected, 1e-11, 'cyclotomic')
		})
	})

	describe('edge cases', () => {
		test('empty arrays return empty array', () => {
			assert.deepEqual(convolutionComplexSeries([], []), [])
			assert.deepEqual(convolutionComplexSeries([], [c(1, 2), c(3, 4)]), [])
			assert.deepEqual(convolutionComplexSeries([c(1, 2)], []), [])
		})

		test('zero sequences produce all-zero sequence of length N + M - 1', () => {
			const zeros = [c(0, 0), c(0, 0), c(0, 0)]
			const seq = [c(2, -1), c(4, 3)]
			const res = convolutionComplexSeries(zeros, seq)
			assertComplexSeqClose(res, [c(0, 0), c(0, 0), c(0, 0), c(0, 0)], 1e-14)
		})

		test('normalizes -0 to +0 in output', () => {
			const res = convolutionComplexSeries([c(-0, -0)], [c(1, -0)])
			assert.equal(res.length, 1)
			assert.ok(!Object.is(res[0].re, -0))
			assert.ok(!Object.is(res[0].im, -0))
			assert.equal(res[0].re, 0)
			assert.equal(res[0].im, 0)
		})

		test('does not mutate inputs and returns fresh objects', () => {
			const a = [c(1, 2), c(3, 4)]
			const b = [c(5, -6), c(7, 8)]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			const res = convolutionComplexSeries(a, b)
			assert.deepEqual(a, aSnapshot)
			assert.deepEqual(b, bSnapshot)
			assert.notEqual(res, a)
			assert.notEqual(res, b)
			for (const item of res) {
				assert.ok(!a.includes(item))
				assert.ok(!b.includes(item))
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('cross-check against direct O(N*M) Cauchy product across varied lengths', () => {
			const rng = makeRng(20261122)
			const pairs = [
				[1, 1],
				[1, 7],
				[7, 1],
				[2, 2],
				[3, 5],
				[4, 4],
				[8, 8],
				[9, 8],
				[15, 17],
				[32, 33],
				[64, 97],
			]

			for (const [n, m] of pairs) {
				const a = randomComplexSeq(n, rng, 5)
				const b = randomComplexSeq(m, rng, 5)
				const actual = convolutionComplexSeries(a, b)
				const expected = directCauchyProduct(a, b)
				assertComplexSeqClose(actual, expected, 1e-9, `direct(${n}x${m})`)
			}
		})

		test('polynomial evaluation identity: P(z) * Q(z) === (P * Q)(z)', () => {
			const rng = makeRng(424242)
			const a = randomComplexSeq(19, rng, 2)
			const b = randomComplexSeq(23, rng, 2)
			const conv = convolutionComplexSeries(a, b)

			const testPoints = [
				c(0, 0),
				c(1, 0),
				c(-1, 0),
				c(0, 1),
				c(0.5, -0.3),
				c(-0.4, 0.7),
				c(Math.cos(1.1), Math.sin(1.1)),
				c(0.85, 0.45),
			]

			for (const z of testPoints) {
				const pz = evalComplexPoly(a, z)
				const qz = evalComplexPoly(b, z)
				const prod = cMul(pz, qz)
				const convZ = evalComplexPoly(conv, z)
				assertComplexClose(convZ, prod, 1e-8, `eval at (${z.re}, ${z.im})`)
			}
		})

		test('commutativity: a * b === b * a', () => {
			const rng = makeRng(777)
			const a = randomComplexSeq(29, rng, 10)
			const b = randomComplexSeq(41, rng, 10)
			const ab = convolutionComplexSeries(a, b)
			const ba = convolutionComplexSeries(b, a)
			assertComplexSeqClose(ab, ba, 1e-9, 'commutativity')
		})

		test('associativity: (a * b) * c === a * (b * c)', () => {
			const rng = makeRng(888)
			const a = randomComplexSeq(11, rng, 3)
			const b = randomComplexSeq(13, rng, 3)
			const d = randomComplexSeq(9, rng, 3)
			const lhs = convolutionComplexSeries(convolutionComplexSeries(a, b), d)
			const rhs = convolutionComplexSeries(a, convolutionComplexSeries(b, d))
			assertComplexSeqClose(lhs, rhs, 1e-8, 'associativity')
		})

		test('distributivity over addition: a * (b + d) === a * b + a * d', () => {
			const rng = makeRng(999)
			const a = randomComplexSeq(14, rng, 4)
			const b = randomComplexSeq(18, rng, 4)
			const d = randomComplexSeq(18, rng, 4)
			const bPlusD = b.map((el, i) => cAdd(el, d[i]))

			const lhs = convolutionComplexSeries(a, bPlusD)
			const ab = convolutionComplexSeries(a, b)
			const ad = convolutionComplexSeries(a, d)
			const rhs = ab.map((el, i) => cAdd(el, ad[i]))

			assertComplexSeqClose(lhs, rhs, 1e-9, 'distributivity')
		})

		test('impulse and delayed-shift identity', () => {
			const rng = makeRng(12345)
			const seq = randomComplexSeq(15, rng, 10)
			const delta0 = [c(1, 0)]

			assertComplexSeqClose(convolutionComplexSeries(seq, delta0), seq, 1e-12, 'right impulse')
			assertComplexSeqClose(convolutionComplexSeries(delta0, seq), seq, 1e-12, 'left impulse')

			// Delayed impulse delta_k shifts seq right by k positions
			const k = 5
			const deltaK = Array.from({ length: k + 1 }, (_, i) => (i === k ? c(1, 0) : c(0, 0)))
			const shifted = convolutionComplexSeries(seq, deltaK)
			const expected = [...Array.from({ length: k }, () => c(0, 0)), ...seq]
			assertComplexSeqClose(shifted, expected, 1e-11, 'delayed impulse shift')
		})
	})

	describe('input validation', () => {
		test('throws TypeError when inputs are not arrays', () => {
			for (const bad of [null, undefined, 42, 'abc', { re: 1, im: 0 }, new Float64Array(2)]) {
				assert.throws(() => convolutionComplexSeries(bad, [c(1, 0)]), TypeError)
				assert.throws(() => convolutionComplexSeries([c(1, 0)], bad), TypeError)
			}
		})

		test('throws TypeError for malformed complex elements', () => {
			const badElements = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
			]
			for (const bad of badElements) {
				assert.throws(() => convolutionComplexSeries([bad], [c(1, 0)]), TypeError)
				assert.throws(() => convolutionComplexSeries([c(1, 0)], [bad]), TypeError)
			}
		})

		test('throws RangeError for non-finite components (NaN, Infinity, -Infinity)', () => {
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
			]
			for (const bad of nonFinite) {
				assert.throws(() => convolutionComplexSeries([bad], [c(1, 0)]), RangeError)
				assert.throws(() => convolutionComplexSeries([c(1, 0)], [bad]), RangeError)
			}
		})

		test('validates non-empty argument even when the other argument is empty', () => {
			assert.throws(() => convolutionComplexSeries([], [{ re: NaN, im: 0 }]), RangeError)
			assert.throws(() => convolutionComplexSeries([{ re: 'bad', im: 0 }], []), TypeError)
		})
	})
})
