import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gradientRationalRecursive } from './gradientRationalRecursive.js'

// --- Independent exact rational helpers for tests ---
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

function rat(num, den = 1n) {
	const n = BigInt(num)
	const d = BigInt(den)
	if (d === 0n) throw new RangeError('Zero denominator')
	if (n === 0n) return { num: 0n, den: 1n }
	const sn = d < 0n ? -n : n
	const sd = d < 0n ? -d : d
	const g = gcd(sn, sd)
	return { num: sn / g, den: sd / g }
}

function rAdd(a, b) {
	return rat(a.num * b.den + b.num * a.den, a.den * b.den)
}

function rSub(a, b) {
	return rat(a.num * b.den - b.num * a.den, a.den * b.den)
}

function rMul(a, b) {
	return rat(a.num * b.num, a.den * b.den)
}

function rDiv(a, b) {
	return rat(a.num * b.den, a.den * b.num)
}

function rPow(a, exp) {
	let result = rat(1n, 1n)
	for (let i = 0; i < exp; i++) {
		result = rMul(result, a)
	}
	return result
}

function assertNormalizedRational(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms, got ${r.num}/${r.den}`)
	}
}

// --- Independent dual-number forward-mode AD over exact rationals ---
function dualAdd(a, b) {
	return { val: rAdd(a.val, b.val), der: rAdd(a.der, b.der) }
}
function dualSub(a, b) {
	return { val: rSub(a.val, b.val), der: rSub(a.der, b.der) }
}
function dualMul(a, b) {
	return {
		val: rMul(a.val, b.val),
		der: rAdd(rMul(a.der, b.val), rMul(a.val, b.der)),
	}
}
function dualConst(q) {
	return { val: q, der: rat(0n, 1n) }
}
function dualGradient(dualFn, point) {
	const grad = []
	for (let i = 0; i < point.length; i++) {
		const dualPoint = point.map((q, j) => ({
			val: q,
			der: j === i ? rat(1n, 1n) : rat(0n, 1n),
		}))
		grad.push(dualFn(dualPoint).der)
	}
	return grad
}

describe('gradientRationalRecursive', () => {
	describe('normal cases', () => {
		it('computes exact gradient of a linear multivariable function', () => {
			// f(x, y, z) = (3/2)x - (4/5)y + (7/3)z + 11/6
			const f = ([x, y, z]) =>
				rAdd(
					rAdd(
						rSub(rMul(rat(3n, 2n), x), rMul(rat(4n, 5n), y)),
						rMul(rat(7n, 3n), z),
					),
					rat(11n, 6n),
				)

			const point = [rat(5n, 7n), rat(-2n, 3n), rat(9n, 4n)]
			const grad = gradientRationalRecursive(f, point)

			assert.deepEqual(grad, [
				{ num: 3n, den: 2n },
				{ num: -4n, den: 5n },
				{ num: 7n, den: 3n },
			])
			for (const g of grad) assertNormalizedRational(g)
		})

		it('computes exact gradient of a quadratic polynomial with cross terms', () => {
			// f(x, y) = 3x^2 + 2xy - 5y^2 + (1/2)x - (3/4)y + 7
			// df/dx = 6x + 2y + 1/2
			// df/dy = 2x - 10y - 3/4
			const f = ([x, y]) => {
				const t1 = rMul(rat(3n), rMul(x, x))
				const t2 = rMul(rat(2n), rMul(x, y))
				const t3 = rMul(rat(-5n), rMul(y, y))
				const t4 = rMul(rat(1n, 2n), x)
				const t5 = rMul(rat(-3n, 4n), y)
				return rAdd(rAdd(rAdd(rAdd(rAdd(t1, t2), t3), t4), t5), rat(7n))
			}

			const point = [rat(2n, 3n), rat(-1n, 5n)]
			// df/dx = 4 - 2/5 + 1/2 = 41/10
			// df/dy = 4/3 + 2 - 3/4 = 31/12
			const grad = gradientRationalRecursive(f, point, { num: 1n, den: 7n })

			assert.deepEqual(grad, [
				{ num: 41n, den: 10n },
				{ num: 31n, den: 12n },
			])
			for (const g of grad) assertNormalizedRational(g)
		})

		it('computes exact gradient of a 1D function', () => {
			// f(x) = (5/6)x^2 - (1/3)x + 2 => f'(x) = (5/3)x - 1/3
			const f = ([x]) =>
				rAdd(rSub(rMul(rat(5n, 6n), rMul(x, x)), rMul(rat(1n, 3n), x)), rat(2n))

			const grad = gradientRationalRecursive(f, [rat(3n, 5n)])
			// (5/3)*(3/5) - 1/3 = 1 - 1/3 = 2/3
			assert.deepEqual(grad, [{ num: 2n, den: 3n }])
		})

		it('computes exact gradient for higher-degree polynomials via Richardson extrapolation', () => {
			// f(x, y) = x^3 * y^2 - (1/3) * x * y^4
			// df/dx = 3x^2 y^2 - (1/3) y^4
			// df/dy = 2x^3 y - (4/3) x y^3
			const f = ([x, y]) =>
				rSub(
					rMul(rPow(x, 3), rPow(y, 2)),
					rMul(rat(1n, 3n), rMul(x, rPow(y, 4))),
				)

			const x = rat(2n, 3n)
			const y = rat(-3n, 2n)
			const expectedDx = rSub(
				rMul(rat(3n), rMul(rPow(x, 2), rPow(y, 2))),
				rMul(rat(1n, 3n), rPow(y, 4)),
			)
			const expectedDy = rSub(
				rMul(rat(2n), rMul(rPow(x, 3), y)),
				rMul(rat(4n, 3n), rMul(x, rPow(y, 3))),
			)

			const grad = gradientRationalRecursive(f, [x, y], { num: 1n, den: 2n }, 1)
			assert.deepEqual(grad, [expectedDx, expectedDy])
			for (const g of grad) assertNormalizedRational(g)
		})

		it('handles high-dimensional vectors cleanly via divide-and-conquer', () => {
			// f(x_0, ..., x_15) = sum_{i=0}^{15} (i+1)/2 * x_i^2
			// partial_i = (i+1) * x_i
			const n = 16
			const f = (xs) => {
				let sum = rat(0n)
				for (let i = 0; i < xs.length; i++) {
					const coeff = rat(BigInt(i + 1), 2n)
					sum = rAdd(sum, rMul(coeff, rMul(xs[i], xs[i])))
				}
				return sum
			}
			const point = Array.from({ length: n }, (_, i) => rat(BigInt(i - 7), BigInt(i + 2)))
			const expected = point.map((x, i) => rMul(rat(BigInt(i + 1)), x))

			const grad = gradientRationalRecursive(f, point, { num: 1n, den: 3n })
			assert.deepEqual(grad, expected)
			for (const g of grad) assertNormalizedRational(g)
		})
	})

	describe('edge cases', () => {
		it('returns empty array for 0-dimensional point without invoking fn', () => {
			let called = false
			const f = () => {
				called = true
				return rat(0n)
			}
			assert.deepEqual(gradientRationalRecursive(f, []), [])
			assert.equal(called, false)
		})

		it('returns normalized zero rationals for a constant function', () => {
			const f = () => ({ num: -10n, den: -4n })
			const grad = gradientRationalRecursive(f, [rat(1n), rat(2n), rat(3n)])
			assert.deepEqual(grad, [
				{ num: 0n, den: 1n },
				{ num: 0n, den: 1n },
				{ num: 0n, den: 1n },
			])
		})

		it('normalizes unreduced inputs, negative denominators, and unreduced fn outputs', () => {
			// f(x, y) = x - y returned with negative/unreduced denominator
			const f = ([x, y]) => {
				const diff = rSub(x, y)
				return { num: -6n * diff.num, den: -6n * diff.den }
			}
			const point = [
				{ num: -6n, den: -4n }, // 3/2
				{ num: 10n, den: -15n }, // -2/3
			]
			const step = { num: -2n, den: -8n } // +1/4
			const grad = gradientRationalRecursive(f, point, step)

			assert.deepEqual(grad, [
				{ num: 1n, den: 1n },
				{ num: -1n, den: 1n },
			])
			for (const g of grad) assertNormalizedRational(g)
		})

		it('does not mutate caller point array or coordinate objects', () => {
			const c0 = { num: 2n, den: 4n }
			const c1 = { num: -3n, den: 9n }
			const point = [c0, c1]
			const f = (xs) => {
				const out = rAdd(xs[0], xs[1])
				xs[0].num = 999n
				xs.push(rat(42n))
				return out
			}

			const grad = gradientRationalRecursive(f, point)
			assert.deepEqual(grad, [
				{ num: 1n, den: 1n },
				{ num: 1n, den: 1n },
			])
			assert.equal(point.length, 2)
			assert.deepEqual(c0, { num: 2n, den: 4n })
			assert.deepEqual(c1, { num: -3n, den: 9n })
		})

		it('maintains exact precision with very large BigInt numerators and denominators', () => {
			const bigA = 10n ** 30n + 7n
			const bigB = 10n ** 29n + 3n
			// f(x, y) = (bigA / bigB) * x^2 + (1 / bigA) * y
			const coeffX = rat(bigA, bigB)
			const coeffY = rat(1n, bigA)
			const f = ([x, y]) => rAdd(rMul(coeffX, rMul(x, x)), rMul(coeffY, y))

			const x0 = rat(bigB, 2n)
			const y0 = rat(bigA, 5n)
			const grad = gradientRationalRecursive(f, [x0, y0], { num: 1n, den: 10n ** 20n })

			// df/dx = 2 * (bigA / bigB) * (bigB / 2) = bigA / 1
			// df/dy = 1 / bigA
			assert.deepEqual(grad, [
				{ num: bigA, den: 1n },
				{ num: 1n, den: bigA },
			])
			for (const g of grad) assertNormalizedRational(g)
		})
	})

	describe('invalid inputs', () => {
		const validFn = ([x]) => x
		const validPoint = [rat(1n)]

		it('rejects non-function fn', () => {
			assert.throws(() => gradientRationalRecursive(null, validPoint), TypeError)
			assert.throws(() => gradientRationalRecursive(123, validPoint), TypeError)
		})

		it('rejects non-array point', () => {
			assert.throws(() => gradientRationalRecursive(validFn, null), TypeError)
			assert.throws(() => gradientRationalRecursive(validFn, { num: 1n, den: 1n }), TypeError)
		})

		it('rejects malformed point elements and zero denominators', () => {
			assert.throws(() => gradientRationalRecursive(validFn, [null]), TypeError)
			assert.throws(() => gradientRationalRecursive(validFn, [{ num: 1, den: 1n }]), TypeError)
			assert.throws(() => gradientRationalRecursive(validFn, [{ num: 1n, den: 1 }]), TypeError)
			assert.throws(() => gradientRationalRecursive(validFn, [{ num: 1n, den: 0n }]), RangeError)
		})

		it('rejects invalid or non-positive step sizes', () => {
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, null), TypeError)
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, { num: 1, den: 2n }), TypeError)
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, { num: 1n, den: 0n }), RangeError)
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, { num: 0n, den: 1n }), RangeError)
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, { num: -1n, den: 10n }), RangeError)
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, { num: 1n, den: -10n }), RangeError)
		})

		it('rejects invalid richardsonDepth values', () => {
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, rat(1n, 10n), -1), RangeError)
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, rat(1n, 10n), 1.5), TypeError)
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, rat(1n, 10n), NaN), TypeError)
			assert.throws(() => gradientRationalRecursive(validFn, validPoint, rat(1n, 10n), '1'), TypeError)
		})

		it('rejects invalid return values from fn', () => {
			assert.throws(() => gradientRationalRecursive(() => 42, validPoint), TypeError)
			assert.throws(() => gradientRationalRecursive(() => ({ num: 1n, den: 0n }), validPoint), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent forward-mode dual-number automatic differentiation on a degree-5 polynomial', () => {
			// f(x, y, z) = (2/3)x^5 - (5/4)x^2 y^3 + (7/6)y z^4 - (1/2)x y z + 3/5
			const polyRational = ([x, y, z]) => {
				const t1 = rMul(rat(2n, 3n), rPow(x, 5))
				const t2 = rMul(rat(-5n, 4n), rMul(rPow(x, 2), rPow(y, 3)))
				const t3 = rMul(rat(7n, 6n), rMul(y, rPow(z, 4)))
				const t4 = rMul(rat(-1n, 2n), rMul(rMul(x, y), z))
				return rAdd(rAdd(rAdd(rAdd(t1, t2), t3), t4), rat(3n, 5n))
			}

			const dualPow = (d, exp) => {
				let acc = dualConst(rat(1n))
				for (let i = 0; i < exp; i++) acc = dualMul(acc, d)
				return acc
			}
			const polyDual = ([x, y, z]) => {
				const t1 = dualMul(dualConst(rat(2n, 3n)), dualPow(x, 5))
				const t2 = dualMul(
					dualConst(rat(-5n, 4n)),
					dualMul(dualPow(x, 2), dualPow(y, 3)),
				)
				const t3 = dualMul(dualConst(rat(7n, 6n)), dualMul(y, dualPow(z, 4)))
				const t4 = dualMul(dualConst(rat(-1n, 2n)), dualMul(dualMul(x, y), z))
				return dualAdd(
					dualAdd(dualAdd(dualAdd(t1, t2), t3), t4),
					dualConst(rat(3n, 5n)),
				)
			}

			const point = [rat(-3n, 4n), rat(5n, 6n), rat(-2n, 5n)]
			// Degree 5 => richardsonDepth = 2 eliminates h^2 and h^4 terms => exact match!
			const got = gradientRationalRecursive(polyRational, point, rat(1n, 3n), 2)
			const expected = dualGradient(polyDual, point)

			assert.deepEqual(got, expected)
			for (const g of got) assertNormalizedRational(g)
		})

		it('matches independent iterative central difference on a non-polynomial rational function', () => {
			// f(x, y, z) = (x + 2y) / (1 + z^2 + x*y)
			const f = ([x, y, z]) => {
				const num = rAdd(x, rMul(rat(2n), y))
				const den = rAdd(rAdd(rat(1n), rMul(z, z)), rMul(x, y))
				return rDiv(num, den)
			}

			const point = [rat(1n, 2n), rat(3n, 4n), rat(-2n, 3n)]
			const h = rat(1n, 1000n)

			// Independent iterative central difference
			const iterativeGrad = []
			for (let i = 0; i < point.length; i++) {
				const pPlus = point.slice()
				const pMinus = point.slice()
				pPlus[i] = rAdd(point[i], h)
				pMinus[i] = rSub(point[i], h)
				iterativeGrad.push(rDiv(rSub(f(pPlus), f(pMinus)), rMul(rat(2n), h)))
			}

			const recursiveGrad = gradientRationalRecursive(f, point, h)
			assert.deepEqual(recursiveGrad, iterativeGrad)
			for (const g of recursiveGrad) assertNormalizedRational(g)
		})

		it('satisfies exact directional derivative identity grad(f)(x) . v = D_v f(x) for quadratic forms', () => {
			// f(x, y, z) = x^2 + 3y^2 - 2z^2 + 4xy - 6yz + 5xz
			const f = ([x, y, z]) =>
				rAdd(
					rAdd(
						rSub(rAdd(rMul(x, x), rMul(rat(3n), rMul(y, y))), rMul(rat(2n), rMul(z, z))),
						rSub(rMul(rat(4n), rMul(x, y)), rMul(rat(6n), rMul(y, z))),
					),
					rMul(rat(5n), rMul(x, z)),
				)

			const x = [rat(3n, 5n), rat(-7n, 4n), rat(2n, 3n)]
			const v = [rat(-1n, 2n), rat(4n, 7n), rat(5n, 3n)]
			const h = rat(1n, 11n)

			const grad = gradientRationalRecursive(f, x, h)
			const dotProduct = grad.reduce((acc, g, i) => rAdd(acc, rMul(g, v[i])), rat(0n))

			const xPlusHv = x.map((xi, i) => rAdd(xi, rMul(h, v[i])))
			const xMinusHv = x.map((xi, i) => rSub(xi, rMul(h, v[i])))
			const directionalDeriv = rDiv(rSub(f(xPlusHv), f(xMinusHv)), rMul(rat(2n), h))

			assert.deepEqual(dotProduct, directionalDeriv)
		})
	})
})
