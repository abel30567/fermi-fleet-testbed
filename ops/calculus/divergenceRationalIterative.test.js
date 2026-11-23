import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceRationalIterative } from './divergenceRationalIterative.js'

const Q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function norm(r) {
	if (r.num === 0n) return { num: 0n, den: 1n }
	const sign = r.den < 0n ? -1n : 1n
	const n = r.num * sign
	const d = r.den * sign
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

const addQ = (a, b) => norm({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
const subQ = (a, b) => norm({ num: a.num * b.den - b.num * a.den, den: a.den * b.den })
const mulQ = (a, b) => norm({ num: a.num * b.num, den: a.den * b.den })
const divQ = (a, b) => norm({ num: a.num * b.den, den: a.den * b.num })

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	}
}

test('1D quadratic field matches analytical derivative exactly', () => {
	// F(x) = [3x^2 - (5/2)x + 7], div F = 6x - 5/2
	const field = ([x]) => [
		addQ(subQ(mulQ(Q(3), mulQ(x, x)), mulQ(Q(5, 2), x)), Q(7)),
	]
	const point = [Q(4, 3)]
	// 6*(4/3) - 5/2 = 8 - 5/2 = 11/2
	const res = divergenceRationalIterative(field, point, Q(1, 7))
	assertLowestTerms(res)
	assert.deepEqual(res, Q(11, 2))
})

test('2D linear and quadratic fields match exact analytical divergence', () => {
	// F(x, y) = [2x + 3y, -4x + 5y], div F = 7
	const linearField = ([x, y]) => [
		addQ(mulQ(Q(2), x), mulQ(Q(3), y)),
		addQ(mulQ(Q(-4), x), mulQ(Q(5), y)),
	]
	const resLinear = divergenceRationalIterative(linearField, [Q(-3, 5), Q(7, 2)], Q(1, 10))
	assertLowestTerms(resLinear)
	assert.deepEqual(resLinear, Q(7, 1))

	// F(x, y) = [x^2 + y, x*y^2], div F = 2x + 2xy
	const quadField = ([x, y]) => [
		addQ(mulQ(x, x), y),
		mulQ(x, mulQ(y, y)),
	]
	const p = [Q(3, 4), Q(-2, 5)]
	// 2*(3/4) + 2*(3/4)*(-2/5) = 3/2 - 3/5 = 9/10
	const resQuad = divergenceRationalIterative(quadField, p, Q(1, 13))
	assertLowestTerms(resQuad)
	assert.deepEqual(resQuad, Q(9, 10))
})

test('3D vector field with rational coefficients and default step size h', () => {
	// F(x, y, z) = [(1/2)x^2 + yz, -(3/4)y^2 + xz, (5/6)z^2 - xy]
	// div F = x - (3/2)y + (5/3)z
	const field = ([x, y, z]) => [
		addQ(mulQ(Q(1, 2), mulQ(x, x)), mulQ(y, z)),
		addQ(mulQ(Q(-3, 4), mulQ(y, y)), mulQ(x, z)),
		subQ(mulQ(Q(5, 6), mulQ(z, z)), mulQ(x, y)),
	]
	const p = [Q(2, 3), Q(-4, 5), Q(9, 10)]
	// 2/3 - (3/2)(-4/5) + (5/3)(9/10) = 2/3 + 6/5 + 3/2 = (20 + 36 + 45)/30 = 101/30
	const res = divergenceRationalIterative(field, p)
	assertLowestTerms(res)
	assert.deepEqual(res, Q(101, 30))
})

test('solenoidal (divergence-free) and constant fields yield exact zero { num: 0n, den: 1n }', () => {
	// 2D rotation field F(x, y) = [-y, x]
	const rot2D = ([x, y]) => [mulQ(Q(-1), y), x]
	assert.deepEqual(divergenceRationalIterative(rot2D, [Q(5, 7), Q(-11, 3)], Q(1, 4)), Q(0, 1))

	// 3D nonlinear solenoidal field F(x, y, z) = [yz - x^2, xz + 2xy, xy + y^2]
	// dF_x/dx = -2x, dF_y/dy = 2x, dF_z/dz = 0 -> div F = 0
	const solenoidal3D = ([x, y, z]) => [
		subQ(mulQ(y, z), mulQ(x, x)),
		addQ(mulQ(x, z), mulQ(Q(2), mulQ(x, y))),
		addQ(mulQ(x, y), mulQ(y, y)),
	]
	const res3D = divergenceRationalIterative(solenoidal3D, [Q(7, 2), Q(-3, 8), Q(5, 6)], Q(2, 9))
	assertLowestTerms(res3D)
	assert.deepEqual(res3D, Q(0, 1))

	// Constant field
	const constField = () => [Q(13, 17), Q(-19, 23), Q(29, 31)]
	assert.deepEqual(divergenceRationalIterative(constField, [Q(1), Q(2), Q(3)], Q(1, 2)), Q(0, 1))
})

test('handles unreduced rational inputs, negative denominators, and does not mutate point', () => {
	const field = ([x, y]) => [
		mulQ(Q(6, 4), x), // (3/2)x -> d/dx = 3/2
		mulQ(Q(-10, -4), y), // (5/2)y -> d/dy = 5/2
	]
	const point = [
		{ num: -6n, den: -4n }, // 3/2
		{ num: 10n, den: -15n }, // -2/3
	]
	const snapshot = point.map((c) => ({ ...c }))
	const h = { num: -4n, den: -12n } // +1/3

	const res = divergenceRationalIterative(field, point, h)
	assertLowestTerms(res)
	assert.deepEqual(res, Q(4, 1)) // 3/2 + 5/2 = 4
	assert.deepEqual(point, snapshot)
})

test('arbitrary-precision BigInt rationals beyond Number.MAX_SAFE_INTEGER', () => {
	const big = 10n ** 30n + 7n
	const field = ([x, y]) => [mulQ(Q(big, 3n), x), mulQ(Q(5n, 6n), y)]
	const res = divergenceRationalIterative(field, [Q(big, 11n), Q(-big, 13n)], Q(1n, 10n ** 20n))
	assertLowestTerms(res)
	// big/3 + 5/6 = (2*big + 5)/6
	const expected = norm({ num: 2n * big + 5n, den: 6n })
	assert.deepEqual(res, expected)
})

test('non-polynomial rational field matches exact central-difference rational value and converges', () => {
	// F(x, y) = [1/x, 1/y]
	// Central difference of 1/x at x with step h is (1/(x+h) - 1/(x-h)) / (2h) = -1 / (x^2 - h^2)
	const field = ([x, y]) => [divQ(Q(1), x), divQ(Q(1), y)]
	const x = Q(3, 1)
	const y = Q(2, 1)
	const h = Q(1, 10)
	const expected = addQ(
		divQ(Q(-1), subQ(mulQ(x, x), mulQ(h, h))),
		divQ(Q(-1), subQ(mulQ(y, y), mulQ(h, h))),
	)
	const res = divergenceRationalIterative(field, [x, y], h)
	assertLowestTerms(res)
	assert.deepEqual(res, expected)
})

test('cross-check: equals trace of independently computed Jacobian matrix', () => {
	// 4D nonlinear vector field
	const field = ([x0, x1, x2, x3]) => [
		addQ(mulQ(Q(2), mulQ(x0, x0)), mulQ(x1, x2)),
		subQ(mulQ(Q(-3, 2), mulQ(x1, x1)), mulQ(x0, x3)),
		addQ(mulQ(Q(5, 7), x2), mulQ(x2, mulQ(x2, x2))),
		addQ(mulQ(Q(-1, 3), x3), mulQ(x0, x1)),
	]
	const point = [Q(1, 2), Q(-3, 4), Q(2, 5), Q(-7, 3)]
	const h = Q(1, 16)
	const twoH = mulQ(Q(2), h)

	// Independent full Jacobian construction J[row][col] = (F_row(p + h e_col) - F_row(p - h e_col)) / (2h)
	const n = point.length
	const jacobian = Array.from({ length: n }, () => new Array(n))
	for (let col = 0; col < n; col++) {
		const pPlus = point.map((v, idx) => (idx === col ? addQ(v, h) : v))
		const pMinus = point.map((v, idx) => (idx === col ? subQ(v, h) : v))
		const fPlus = field(pPlus)
		const fMinus = field(pMinus)
		for (let row = 0; row < n; row++) {
			jacobian[row][col] = divQ(subQ(fPlus[row], fMinus[row]), twoH)
		}
	}

	let trace = Q(0, 1)
	for (let i = 0; i < n; i++) {
		trace = addQ(trace, jacobian[i][i])
	}

	const div = divergenceRationalIterative(field, point, h)
	assertLowestTerms(div)
	assert.deepEqual(div, trace)
})

test('cross-check: linear field divergence equals matrix trace independent of step size h', () => {
	// F(x) = A x + b for 3x3 rational matrix A
	const A = [
		[Q(3, 5), Q(-1, 2), Q(4, 7)],
		[Q(2, 9), Q(-7, 4), Q(5, 3)],
		[Q(-6, 11), Q(8, 13), Q(9, 10)],
	]
	const b = [Q(1, 3), Q(-2, 5), Q(7, 8)]
	const field = (p) =>
		A.map((row, r) =>
			row.reduce((acc, entry, c) => addQ(acc, mulQ(entry, p[c])), b[r]),
		)

	const expectedTrace = addQ(addQ(A[0][0], A[1][1]), A[2][2]) // 3/5 - 7/4 + 9/10 = -1/4
	assert.deepEqual(expectedTrace, Q(-1, 4))

	const point = [Q(11, 6), Q(-5, 8), Q(3, 14)]
	for (const h of [Q(1, 1), Q(1, 100), Q(3, 17), Q(7, 100000)]) {
		const div = divergenceRationalIterative(field, point, h)
		assertLowestTerms(div)
		assert.deepEqual(div, expectedTrace)
	}
})

test('cross-check: linearity div(aF + bG) === a*div(F) + b*div(G)', () => {
	// Include cubic terms too: the discrete central-difference divergence operator is strictly linear
	const F = ([x, y, z]) => [
		addQ(mulQ(x, mulQ(x, x)), mulQ(Q(2, 3), y)),
		subQ(mulQ(Q(-5, 4), mulQ(y, y)), z),
		addQ(mulQ(Q(7, 6), z), mulQ(x, y)),
	]
	const G = ([x, y, z]) => [
		subQ(mulQ(Q(3, 5), x), mulQ(z, z)),
		addQ(mulQ(y, mulQ(y, y)), mulQ(Q(1, 2), x)),
		mulQ(Q(-4, 9), mulQ(z, z)),
	]

	const a = Q(5, 7)
	const b = Q(-11, 3)
	const combined = (p) => {
		const fp = F(p)
		const gp = G(p)
		return fp.map((v, i) => addQ(mulQ(a, v), mulQ(b, gp[i])))
	}

	const point = [Q(-2, 3), Q(5, 6), Q(7, 4)]
	const h = Q(1, 12)

	const lhs = divergenceRationalIterative(combined, point, h)
	const rhs = addQ(
		mulQ(a, divergenceRationalIterative(F, point, h)),
		mulQ(b, divergenceRationalIterative(G, point, h)),
	)

	assertLowestTerms(lhs)
	assert.deepEqual(lhs, rhs)
})

test('invalid inputs throw descriptive TypeError or RangeError', () => {
	const id = (p) => p

	// Invalid field
	assert.throws(() => divergenceRationalIterative(null, [Q(1)]), TypeError)
	assert.throws(() => divergenceRationalIterative(42, [Q(1)]), TypeError)

	// Invalid point
	assert.throws(() => divergenceRationalIterative(id, null), TypeError)
	assert.throws(() => divergenceRationalIterative(id, []), RangeError)
	assert.throws(() => divergenceRationalIterative(id, [null]), TypeError)
	assert.throws(() => divergenceRationalIterative(id, [{ num: 1, den: 2 }]), TypeError)
	assert.throws(() => divergenceRationalIterative(id, [{ num: 1n, den: 0n }]), RangeError)

	// Invalid step size h
	assert.throws(() => divergenceRationalIterative(id, [Q(1)], null), TypeError)
	assert.throws(() => divergenceRationalIterative(id, [Q(1)], { num: 1, den: 10 }), TypeError)
	assert.throws(() => divergenceRationalIterative(id, [Q(1)], { num: 1n, den: 0n }), RangeError)
	assert.throws(() => divergenceRationalIterative(id, [Q(1)], { num: 0n, den: 1n }), RangeError)
	assert.throws(() => divergenceRationalIterative(id, [Q(1)], { num: -1n, den: 10n }), RangeError)
	assert.throws(() => divergenceRationalIterative(id, [Q(1)], { num: 1n, den: -10n }), RangeError)

	// Invalid vector field return values
	assert.throws(() => divergenceRationalIterative(() => 'not-an-array', [Q(1)]), TypeError)
	assert.throws(() => divergenceRationalIterative(() => [Q(1), Q(2)], [Q(1)]), RangeError)
	assert.throws(
		() => divergenceRationalIterative(() => [{ num: 1n, den: 0n }], [Q(1)]),
		RangeError,
	)
	assert.throws(
		() => divergenceRationalIterative(() => [{ num: 1, den: 1 }], [Q(1)]),
		TypeError,
	)
})
