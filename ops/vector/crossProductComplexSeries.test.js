import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductComplexSeries } from './crossProductComplexSeries.js'

const c = (re, im = 0) => ({ re, im })

function cAdd(z, w) {
	return { re: z.re + w.re, im: z.im + w.im }
}

function cSub(z, w) {
	return { re: z.re - w.re, im: z.im - w.im }
}

function cMul(z, w) {
	return {
		re: z.re * w.re - z.im * w.im,
		im: z.re * w.im + z.im * w.re,
	}
}

function cDot(a, b) {
	return cAdd(cAdd(cMul(a[0], b[0]), cMul(a[1], b[1])), cMul(a[2], b[2]))
}

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function assertVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assertComplexClose(actual[i], expected[i], eps)
	}
}

/**
 * Independent reference implementation via explicit Levi-Civita tensor sum:
 * (a x b)_i = sum_{j,k} eps_{ijk} * a_j * b_k
 */
function leviCivitaCrossReference(a, b) {
	const eps = [
		[0, 1, 2, 1],
		[1, 2, 0, 1],
		[2, 0, 1, 1],
		[0, 2, 1, -1],
		[2, 1, 0, -1],
		[1, 0, 2, -1],
	]
	const out = [c(0, 0), c(0, 0), c(0, 0)]
	for (const [i, j, k, sign] of eps) {
		const prod = cMul(a[j], b[k])
		out[i] = {
			re: out[i].re + sign * prod.re,
			im: out[i].im + sign * prod.im,
		}
	}
	return out
}

test('standard basis vectors with real and imaginary parts', () => {
	const ex = [c(1, 0), c(0, 0), c(0, 0)]
	const ey = [c(0, 0), c(1, 0), c(0, 0)]
	const ez = [c(0, 0), c(0, 0), c(1, 0)]

	assert.deepEqual(crossProductComplexSeries(ex, ey), ez)
	assert.deepEqual(crossProductComplexSeries(ey, ez), ex)
	assert.deepEqual(crossProductComplexSeries(ez, ex), ey)

	// (i*ex) x (i*ey) = (i^2) * ez = -ez
	const iex = [c(0, 1), c(0, 0), c(0, 0)]
	const iey = [c(0, 0), c(0, 1), c(0, 0)]
	assert.deepEqual(crossProductComplexSeries(iex, iey), [c(0, 0), c(0, 0), c(-1, 0)])
})

test('general complex vectors exact analytical values', () => {
	const a = [c(1, 2), c(3, -1), c(0, 4)]
	const b = [c(2, 0), c(-1, 3), c(5, -2)]

	// Component 0: a1*b2 - a2*b1 = (3-i)(5-2i) - (4i)(-1+3i) = (13-11i) - (-12-4i) = 25 - 7i
	// Component 1: a2*b0 - a0*b2 = (4i)(2) - (1+2i)(5-2i) = 8i - (9+8i) = -9 + 0i
	// Component 2: a0*b1 - a1*b0 = (1+2i)(-1+3i) - (3-i)(2) = (-7+i) - (6-2i) = -13 + 3i
	const expected = [c(25, -7), c(-9, 0), c(-13, 3)]
	assert.deepEqual(crossProductComplexSeries(a, b), expected)
})

test('edge cases: zero vectors, parallel complex vectors, self-cross, negative zero', () => {
	const zero = [c(0, 0), c(0, 0), c(0, 0)]
	const a = [c(-0, 2), c(3.5, -1.25), c(-4, 0)]

	const resZero = crossProductComplexSeries(a, zero)
	assert.deepEqual(resZero, zero)
	// Ensure no -0 leaks into output
	for (const comp of resZero) {
		assert.ok(!Object.is(comp.re, -0))
		assert.ok(!Object.is(comp.im, -0))
	}

	// Self-cross is zero
	assertVecClose(crossProductComplexSeries(a, a), zero)

	// Complex scalar multiple is parallel -> cross product is zero
	const lambda = c(2, -3)
	const scaled = a.map((z) => cMul(lambda, z))
	assertVecClose(crossProductComplexSeries(a, scaled), zero)
})

test('independent cross-check against Levi-Civita tensor reference and skew-symmetric matrix', () => {
	const pairs = [
		[
			[c(1.5, -2.25), c(0.5, 3.75), c(-4.2, 1.1)],
			[c(-3.3, 0.8), c(2.7, -1.9), c(0.25, 5.4)],
		],
		[
			[c(0, 1), c(1, 0), c(1, 1)],
			[c(1, -1), c(0, -2), c(3, 0)],
		],
		[
			[c(1e-6, -2e-6), c(3e-6, 4e-6), c(-5e-6, 6e-6)],
			[c(7e-6, 8e-6), c(-9e-6, 1e-6), c(2e-6, -3e-6)],
		],
	]

	for (const [a, b] of pairs) {
		const actual = crossProductComplexSeries(a, b)
		const ref = leviCivitaCrossReference(a, b)
		assertVecClose(actual, ref, 1e-12)

		// Skew-symmetric matrix [a]_x * b
		const skewMat = [
			[c(0, 0), c(-a[2].re, -a[2].im), a[1]],
			[a[2], c(0, 0), c(-a[0].re, -a[0].im)],
			[c(-a[1].re, -a[1].im), a[0], c(0, 0)],
		]
		const matMul = skewMat.map((row) => cDot(row, b))
		assertVecClose(actual, matMul, 1e-12)
	}
})

test('algebraic identities: anticommutativity, orthogonality, Jacobi, and BAC-CAB', () => {
	const a = [c(1, 2), c(-3, 0.5), c(2.5, -1)]
	const b = [c(-1, 1.5), c(4, -2), c(0.5, 3)]
	const d = [c(2, -0.5), c(1, 1), c(-3, 2)]

	const axb = crossProductComplexSeries(a, b)
	const bxa = crossProductComplexSeries(b, a)

	// Anticommutativity: a x b = -(b x a)
	assertVecClose(
		axb,
		bxa.map((z) => c(-z.re, -z.im))
	)

	// Bilinear orthogonality: a . (a x b) = 0 and b . (a x b) = 0
	assertComplexClose(cDot(a, axb), c(0, 0))
	assertComplexClose(cDot(b, axb), c(0, 0))

	// Jacobi identity: a x (b x d) + b x (d x a) + d x (a x b) = 0
	const t1 = crossProductComplexSeries(a, crossProductComplexSeries(b, d))
	const t2 = crossProductComplexSeries(b, crossProductComplexSeries(d, a))
	const t3 = crossProductComplexSeries(d, axb)
	const jacobiSum = [0, 1, 2].map((i) => cAdd(cAdd(t1[i], t2[i]), t3[i]))
	assertVecClose(jacobiSum, [c(0, 0), c(0, 0), c(0, 0)])

	// Vector triple product (BAC-CAB): a x (b x d) = b*(a.d) - d*(a.b)
	const ad = cDot(a, d)
	const ab = cDot(a, b)
	const bacCab = [0, 1, 2].map((i) => cSub(cMul(b[i], ad), cMul(d[i], ab)))
	assertVecClose(t1, bacCab)
})

test('input validation rejects malformed vectors and non-finite components', () => {
	const valid = [c(1, 0), c(0, 1), c(0, 0)]

	assert.throws(() => crossProductComplexSeries(null, valid), TypeError)
	assert.throws(() => crossProductComplexSeries(valid, 'not-array'), TypeError)
	assert.throws(() => crossProductComplexSeries([c(1, 0), c(0, 1)], valid), RangeError)
	assert.throws(
		() => crossProductComplexSeries(valid, [c(1, 0), c(0, 1), c(0, 0), c(0, 0)]),
		RangeError
	)
	assert.throws(() => crossProductComplexSeries([null, c(0, 0), c(0, 0)], valid), TypeError)
	assert.throws(() => crossProductComplexSeries([{ re: '1', im: 0 }, c(0, 0), c(0, 0)], valid), TypeError)
	assert.throws(() => crossProductComplexSeries([{ re: 1 }, c(0, 0), c(0, 0)], valid), TypeError)
	assert.throws(() => crossProductComplexSeries([c(NaN, 0), c(0, 0), c(0, 0)], valid), RangeError)
	assert.throws(() => crossProductComplexSeries(valid, [c(0, Infinity), c(0, 0), c(0, 0)]), RangeError)
	assert.throws(() => crossProductComplexSeries(valid, [c(-Infinity, 0), c(0, 0), c(0, 0)]), RangeError)
})
