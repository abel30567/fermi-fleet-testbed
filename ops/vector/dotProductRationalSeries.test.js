import { test } from 'node:test'
import assert from 'node:assert'
import { dotProductRationalSeries } from './dotProductRationalSeries.js'

const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

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

function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const s = den < 0n ? -1n : 1n
	const g = gcd(num, den)
	return { num: (s * num) / g, den: (s * den) / g }
}

function subRat(a, b) {
	return addRat(a, { num: -b.num, den: b.den })
}

function scaleRat(a, k) {
	const num = a.num * k.num
	const den = a.den * k.den
	if (num === 0n) return { num: 0n, den: 1n }
	const s = den < 0n ? -1n : 1n
	const g = gcd(num, den)
	return { num: (s * num) / g, den: (s * den) / g }
}

function assertNormalized(q) {
	assert.equal(typeof q.num, 'bigint')
	assert.equal(typeof q.den, 'bigint')
	assert.ok(q.den > 0n, `expected den > 0n, got ${q.den}`)
	if (q.num === 0n) {
		assert.equal(q.den, 1n)
	} else {
		assert.equal(gcd(q.num, q.den), 1n)
	}
}

test('basic integer and fractional vectors', () => {
	const res1 = dotProductRationalSeries([r(1), r(2), r(3)], [r(4), r(5), r(6)])
	assert.deepEqual(res1, { num: 32n, den: 1n })
	assertNormalized(res1)

	// (1/2)*(2/3) + (3/4)*(4/5) = 1/3 + 3/5 = 14/15
	const res2 = dotProductRationalSeries([r(1, 2), r(3, 4)], [r(2, 3), r(4, 5)])
	assert.deepEqual(res2, { num: 14n, den: 15n })
	assertNormalized(res2)
})

test('unreduced inputs and negative denominators normalize cleanly', () => {
	// (6/-9) * (-15/10) + (4/8) * (10/-5) = (-2/3)*(-3/2) + (1/2)*(-2) = 1 - 1 = 0
	const res = dotProductRationalSeries(
		[r(6, -9), r(4, 8)],
		[r(-15, 10), r(10, -5)],
	)
	assert.deepEqual(res, { num: 0n, den: 1n })
	assertNormalized(res)

	// (-2/-4) * (3/-6) = (1/2) * (-1/2) = -1/4
	const res2 = dotProductRationalSeries([r(-2, -4)], [r(3, -6)])
	assert.deepEqual(res2, { num: -1n, den: 4n })
	assertNormalized(res2)
})

test('edge cases: empty vectors, single element, orthogonal, all zeros', () => {
	assert.deepEqual(dotProductRationalSeries([], []), { num: 0n, den: 1n })

	const single = dotProductRationalSeries([r(-7, 11)], [r(22, 21)])
	assert.deepEqual(single, { num: -2n, den: 3n })
	assertNormalized(single)

	const ortho = dotProductRationalSeries([r(3, 5), r(-4, 7)], [r(4, 7), r(3, 5)])
	assert.deepEqual(ortho, { num: 0n, den: 1n })

	const zeros = dotProductRationalSeries([r(0, 7), r(0, -3)], [r(5, 9), r(-2, 11)])
	assert.deepEqual(zeros, { num: 0n, den: 1n })
})

test('exact BigInt precision beyond Number.MAX_SAFE_INTEGER', () => {
	const big = 10n ** 40n
	const u = [r(big + 1n, big), r(1n, big)]
	const v = [r(big - 1n, big), r(1n, big)]
	// (big^2 - 1)/big^2 + 1/big^2 = 1
	const res = dotProductRationalSeries(u, v)
	assert.deepEqual(res, { num: 1n, den: 1n })
	assertNormalized(res)
})

test('closed-form harmonic / telescoping series identity', () => {
	// Σ_{k=1}^{n} (1/k) * (1/(k+1)) = n / (n + 1)
	const n = 25
	const u = []
	const v = []
	for (let k = 1; k <= n; k++) {
		u.push(r(1, k))
		v.push(r(1, k + 1))
	}
	const res = dotProductRationalSeries(u, v)
	assert.deepEqual(res, { num: BigInt(n), den: BigInt(n + 1) })
	assertNormalized(res)
})

test('independent cross-check: polarization identity and symmetry', () => {
	const u = [r(5, 6), r(-7, 12), r(11, 15), r(-13, 20), r(2, 3)]
	const v = [r(-3, 7), r(9, 14), r(-5, 8), r(17, 21), r(-4, 9)]

	const uv = dotProductRationalSeries(u, v)
	const vu = dotProductRationalSeries(v, u)
	assert.deepEqual(uv, vu)
	assertNormalized(uv)

	// Polarization identity: u·v = ((u+v)·(u+v) - u·u - v·v) / 2
	const uPlusV = u.map((ui, i) => addRat(ui, v[i]))
	const normSum = dotProductRationalSeries(uPlusV, uPlusV)
	const normU = dotProductRationalSeries(u, u)
	const normV = dotProductRationalSeries(v, v)
	const polarized = scaleRat(subRat(subRat(normSum, normU), normV), r(1, 2))
	assert.deepEqual(uv, polarized)

	// Cauchy-Schwarz: (u·v)^2 <= (u·u)*(v·v)
	const lhs = scaleRat(uv, uv)
	const rhs = scaleRat(normU, normV)
	assert.ok(lhs.num * rhs.den <= rhs.num * lhs.den)

	// Floating-point cross-check
	const approx = u.reduce(
		(acc, ui, i) => acc + (Number(ui.num) / Number(ui.den)) * (Number(v[i].num) / Number(v[i].den)),
		0,
	)
	const exactAsFloat = Number(uv.num) / Number(uv.den)
	assert.ok(Math.abs(exactAsFloat - approx) < 1e-12)
})

test('independent cross-check: bilinearity', () => {
	const u = [r(1, 3), r(-2, 5), r(7, 9)]
	const v = [r(-4, 7), r(3, 11), r(5, 6)]
	const w = [r(2, 13), r(8, 15), r(-1, 4)]
	const alpha = r(5, 7)
	const beta = r(-3, 4)

	// (alpha*u + beta*v) · w === alpha*(u·w) + beta*(v·w)
	const comb = u.map((ui, i) => addRat(scaleRat(ui, alpha), scaleRat(v[i], beta)))
	const lhs = dotProductRationalSeries(comb, w)
	const rhs = addRat(
		scaleRat(dotProductRationalSeries(u, w), alpha),
		scaleRat(dotProductRationalSeries(v, w), beta),
	)
	assert.deepEqual(lhs, rhs)
	assertNormalized(lhs)
})

test('invalid inputs throw appropriate errors', () => {
	assert.throws(() => dotProductRationalSeries(null, []), TypeError)
	assert.throws(() => dotProductRationalSeries([], 'not-array'), TypeError)
	assert.throws(() => dotProductRationalSeries([r(1)], [r(1), r(2)]), RangeError)

	// Zero denominator (even when paired with zero numerator in the other vector)
	assert.throws(() => dotProductRationalSeries([r(1, 0)], [r(1, 1)]), RangeError)
	assert.throws(() => dotProductRationalSeries([r(0, 1)], [r(1, 0)]), RangeError)

	// Non-BigInt or malformed elements
	assert.throws(() => dotProductRationalSeries([{ num: 1, den: 2n }], [r(1)]), TypeError)
	assert.throws(() => dotProductRationalSeries([{ num: 1n, den: 2 }], [r(1)]), TypeError)
	assert.throws(() => dotProductRationalSeries([null], [r(1)]), TypeError)
	assert.throws(() => dotProductRationalSeries([[1n, 2n]], [r(1)]), TypeError)
	assert.throws(() => dotProductRationalSeries([undefined], [r(1)]), TypeError)

	// Sparse array hole
	const sparse = new Array(1)
	assert.throws(() => dotProductRationalSeries(sparse, [r(1)]), TypeError)
})
