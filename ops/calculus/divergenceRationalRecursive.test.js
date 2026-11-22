import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceRationalRecursive } from './divergenceRationalRecursive.js'

/**
 * Helper to construct exact rationals concisely in tests.
 * @param {bigint} num
 * @param {bigint} [den=1n]
 */
function q(num, den = 1n) {
	return { num, den }
}

/**
 * Independent BigInt rational helpers for test field construction and cross-checking.
 */
function gcdIter(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function normIter(r) {
	if (r.num === 0n) return { num: 0n, den: 1n }
	let n = r.num
	let d = r.den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdIter(n, d)
	return { num: n / g, den: d / g }
}

function addQ(a, b) {
	return normIter({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
}

function subQ(a, b) {
	return normIter({ num: a.num * b.den - b.num * a.den, den: a.den * b.den })
}

function mulQ(a, b) {
	return normIter({ num: a.num * b.num, den: a.den * b.den })
}

function divQ(a, b) {
	return normIter({ num: a.num * b.den, den: a.den * b.num })
}

/**
 * Independent iterative implementation of exact rational divergence used to
 * cross-check the recursive divide-and-conquer implementation.
 */
function divergenceIterativeReference(field, point, step = q(1n, 1000n)) {
	const h = normIter(step)
	const twoH = normIter({ num: h.num * 2n, den: h.den })
	let total = q(0n, 1n)

	for (let i = 0; i < field.length; i++) {
		const plus = point.map((coord, idx) => (idx === i ? addQ(coord, h) : normIter(coord)))
		const minus = point.map((coord, idx) => (idx === i ? subQ(coord, h) : normIter(coord)))
		const diff = subQ(normIter(field[i](plus)), normIter(field[i](minus)))
		const partial = divQ(diff, twoH)
		total = addQ(total, partial)
	}

	return normIter(total)
}

describe('divergenceRationalRecursive', () => {
	describe('normal cases', () => {
		it('computes exact divergence for a 1D linear and quadratic field', () => {
			// F(x) = (3/2)x^2 - (5/3)x + 7 => F'(x) = 3x - 5/3
			const field = [
				([x]) =>
					addQ(
						subQ(mulQ(q(3n, 2n), mulQ(x, x)), mulQ(q(5n, 3n), x)),
						q(7n, 1n)
					),
			]
			// At x = 4/9: 3*(4/9) - 5/3 = 4/3 - 5/3 = -1/3
			const result = divergenceRationalRecursive(field, [q(4n, 9n)], q(1n, 7n))
			assert.deepEqual(result, q(-1n, 3n))
		})

		it('computes exact divergence for a 2D linear vector field (trace of matrix)', () => {
			// F(x, y) = ( (2/3)x + 5y, -7x + (5/6)y ) => div F = 2/3 + 5/6 = 3/2
			const field = [
				([x, y]) => addQ(mulQ(q(2n, 3n), x), mulQ(q(5n, 1n), y)),
				([x, y]) => addQ(mulQ(q(-7n, 1n), x), mulQ(q(5n, 6n), y)),
			]
			const result = divergenceRationalRecursive(field, [q(11n, 4n), q(-3n, 5n)], q(1n, 2n))
			assert.deepEqual(result, q(3n, 2n))
		})

		it('computes exact divergence for a 3D quadratic vector field', () => {
			// F(x, y, z) = (x^2 + yz, 3xy - y^2, (1/2)z^2 + xz)
			// dFx/dx = 2x, dFy/dy = 3x - 2y, dFz/dz = z + x
			// div F = 6x - 2y + z
			const field = [
				([x, y, z]) => addQ(mulQ(x, x), mulQ(y, z)),
				([x, y]) => subQ(mulQ(q(3n), mulQ(x, y)), mulQ(y, y)),
				([x, _y, z]) => addQ(mulQ(q(1n, 2n), mulQ(z, z)), mulQ(x, z)),
			]
			// At (1/2, -3/4, 5/6): 6*(1/2) - 2*(-3/4) + 5/6 = 3 + 3/2 + 5/6 = 16/3
			const result = divergenceRationalRecursive(field, [q(1n, 2n), q(-3n, 4n), q(5n, 6n)])
			assert.deepEqual(result, q(16n, 3n))
		})

		it('matches exact closed-form central difference for cubic and rational fields', () => {
			// F(x, y) = (x^3, 1/y)
			// Central difference with step h:
			//   d(x^3)/dx -> 3x^2 + h^2
			//   d(1/y)/dy -> -1 / (y^2 - h^2)
			const field = [
				([x]) => mulQ(x, mulQ(x, x)),
				([_x, y]) => divQ(q(1n), y),
			]
			const x = q(2n, 3n)
			const y = q(3n, 2n)
			const h = q(1n, 10n)

			const expected = addQ(
				addQ(mulQ(q(3n), mulQ(x, x)), mulQ(h, h)),
				divQ(q(-1n), subQ(mulQ(y, y), mulQ(h, h)))
			)
			const result = divergenceRationalRecursive(field, [x, y], h)
			assert.deepEqual(result, expected)
		})

		it('preserves exactness for large BigInt coordinates beyond MAX_SAFE_INTEGER', () => {
			const big = 10n ** 30n + 7n
			// F(x, y) = (x^2, -x*y) => div F = 2x - x = x
			const field = [
				([x]) => mulQ(x, x),
				([x, y]) => mulQ(q(-1n), mulQ(x, y)),
			]
			const result = divergenceRationalRecursive(field, [q(big, 3n), q(big, 5n)], q(1n, 10n ** 12n))
			assert.deepEqual(result, q(big, 3n))
		})

		it('does not mutate the caller point array or rational objects', () => {
			const point = [q(2n, 3n), q(-4n, 5n)]
			const snapshot = point.map((c) => ({ num: c.num, den: c.den }))
			const field = [
				(pt) => {
					const val = pt[0]
					// Deliberately mutate argument received by component function
					pt[0] = q(999n, 1n)
					return val
				},
				(pt) => pt[1],
			]
			const result = divergenceRationalRecursive(field, point, q(1n, 4n))
			assert.deepEqual(result, q(2n, 1n))
			assert.deepEqual(point, snapshot)
		})
	})

	describe('edge cases', () => {
		it('returns canonical 0/1 for constant vector fields', () => {
			const field = [() => q(42n, 17n), () => q(-9n, 4n), () => q(0n, 5n)]
			const result = divergenceRationalRecursive(field, [q(1n), q(2n), q(3n)])
			assert.deepEqual(result, q(0n, 1n))
		})

		it('returns canonical 0/1 for solenoidal (divergence-free) 2D rotational field', () => {
			// F(x, y) = (-y, x) => div F = 0
			const field = [
				([_x, y]) => q(-y.num, y.den),
				([x]) => q(x.num, x.den),
			]
			const result = divergenceRationalRecursive(field, [q(7n, 11n), q(-13n, 19n)], q(1n, 3n))
			assert.deepEqual(result, q(0n, 1n))
		})

		it('returns canonical 0/1 for solenoidal 3D quadratic vector field', () => {
			// F(x, y, z) = (2xy - xz, -y^2, (1/2)z^2)
			// dFx/dx = 2y - z, dFy/dy = -2y, dFz/dz = z => sum = 0
			const field = [
				([x, y, z]) => subQ(mulQ(q(2n), mulQ(x, y)), mulQ(x, z)),
				([_x, y]) => mulQ(q(-1n), mulQ(y, y)),
				([_x, _y, z]) => mulQ(q(1n, 2n), mulQ(z, z)),
			]
			const result = divergenceRationalRecursive(field, [q(5n, 7n), q(-3n, 11n), q(13n, 17n)], q(3n, 8n))
			assert.deepEqual(result, q(0n, 1n))
		})

		it('handles unreduced rationals and negative denominators in point, step, and field outputs', () => {
			// F(x, y) = ((4/6)x, (-6/-9)y) => div F = 2/3 + 2/3 = 4/3
			// Return deliberately unreduced fractions with negative denominators
			const field = [
				([x]) => ({ num: x.num * -4n, den: x.den * -6n }),
				([_x, y]) => ({ num: y.num * 6n, den: y.den * 9n }),
			]
			const unreducedPoint = [
				{ num: 10n, den: -20n },
				{ num: 0n, den: -7n },
			]
			const unreducedStep = { num: -6n, den: -18n } // equals +1/3

			const result = divergenceRationalRecursive(field, unreducedPoint, unreducedStep)
			assert.deepEqual(result, { num: 4n, den: 3n })
			assert.ok(result.den > 0n)
			assert.equal(gcdIter(result.num, result.den), 1n)
		})

		it('normalizes negative divergence output with positive denominator in lowest terms', () => {
			// F(x, y) = (-10/4 x, -15/6 y) => div F = -5/2 - 5/2 = -5/1
			const field = [
				([x]) => ({ num: x.num * 10n, den: x.den * -4n }),
				([_x, y]) => ({ num: y.num * -15n, den: y.den * 6n }),
			]
			const result = divergenceRationalRecursive(field, [q(2n, 4n), q(-6n, 9n)], q(4n, 8n))
			assert.deepEqual(result, { num: -5n, den: 1n })
		})
	})

	describe('input validation', () => {
		const validField = [([x]) => x]
		const validPoint = [q(1n, 2n)]

		it('throws TypeError when field is not an array or contains non-functions', () => {
			assert.throws(() => divergenceRationalRecursive(null, validPoint), TypeError)
			assert.throws(() => divergenceRationalRecursive('not-array', validPoint), TypeError)
			assert.throws(() => divergenceRationalRecursive([123], validPoint), TypeError)
		})

		it('throws RangeError when field is empty', () => {
			assert.throws(() => divergenceRationalRecursive([], []), RangeError)
		})

		it('throws TypeError or RangeError on invalid point or dimension mismatch', () => {
			assert.throws(() => divergenceRationalRecursive(validField, null), TypeError)
			assert.throws(
				() => divergenceRationalRecursive(validField, [q(1n), q(2n)]),
				RangeError
			)
			assert.throws(
				() => divergenceRationalRecursive(validField, [{ num: 1, den: 2n }]),
				TypeError
			)
			assert.throws(
				() => divergenceRationalRecursive(validField, [{ num: 1n, den: 0n }]),
				RangeError
			)
		})

		it('throws TypeError or RangeError on invalid step', () => {
			assert.throws(() => divergenceRationalRecursive(validField, validPoint, null), TypeError)
			assert.throws(
				() => divergenceRationalRecursive(validField, validPoint, { num: 1, den: 10n }),
				TypeError
			)
			assert.throws(
				() => divergenceRationalRecursive(validField, validPoint, { num: 1n, den: 0n }),
				RangeError
			)
			assert.throws(
				() => divergenceRationalRecursive(validField, validPoint, { num: 0n, den: 5n }),
				RangeError
			)
			assert.throws(
				() => divergenceRationalRecursive(validField, validPoint, { num: -1n, den: 10n }),
				RangeError
			)
			assert.throws(
				() => divergenceRationalRecursive(validField, validPoint, { num: 1n, den: -10n }),
				RangeError
			)
		})

		it('throws when a component function returns an invalid rational', () => {
			assert.throws(
				() => divergenceRationalRecursive([() => null], validPoint),
				TypeError
			)
			assert.throws(
				() => divergenceRationalRecursive([() => ({ num: 1, den: 2 })], validPoint),
				TypeError
			)
			assert.throws(
				() => divergenceRationalRecursive([() => ({ num: 5n, den: 0n })], validPoint),
				RangeError
			)
		})
	})

	describe('cross-check against independent iterative implementation and analytical trace', () => {
		it('matches independent iterative implementation across odd and even high dimensions (1D..11D)', () => {
			for (let dim = 1; dim <= 11; dim++) {
				// F_i(x) = ((i+1)/(i+2)) * x_i^2 + ((i+3)/(i+5)) * x_{(i+1)%dim} - ((2i+1)/7) * x_i
				const field = Array.from({ length: dim }, (_, i) => {
					const a = q(BigInt(i + 1), BigInt(i + 2))
					const b = q(BigInt(i + 3), BigInt(i + 5))
					const c = q(BigInt(2 * i + 1), 7n)
					const nextIdx = (i + 1) % dim
					return (pt) =>
						subQ(
							addQ(mulQ(a, mulQ(pt[i], pt[i])), mulQ(b, pt[nextIdx])),
							mulQ(c, pt[i])
						)
				})

				const point = Array.from({ length: dim }, (_, i) =>
					q(BigInt((i % 2 === 0 ? 1 : -1) * (2 * i + 3)), BigInt(i + 4))
				)
				const step = q(3n, 17n)

				const recursiveResult = divergenceRationalRecursive(field, point, step)
				const iterativeResult = divergenceIterativeReference(field, point, step)

				// Analytical exact divergence for this quadratic field:
				// sum_i (2 * a_i * x_i - c_i) + (dim === 1 ? b_0 : 0)
				let analytical = q(0n, 1n)
				for (let i = 0; i < dim; i++) {
					const a = q(BigInt(i + 1), BigInt(i + 2))
					const c = q(BigInt(2 * i + 1), 7n)
					let term = subQ(mulQ(q(2n), mulQ(a, point[i])), c)
					if (dim === 1) {
						const b = q(BigInt(i + 3), BigInt(i + 5))
						term = addQ(term, b)
					}
					analytical = addQ(analytical, term)
				}

				assert.deepEqual(recursiveResult, iterativeResult)
				assert.deepEqual(recursiveResult, analytical)
				assert.ok(recursiveResult.den > 0n)
				assert.equal(gcdIter(recursiveResult.num, recursiveResult.den), 1n)
			}
		})

		it('matches independent iterative implementation on a coupled rational non-polynomial field', () => {
			// F(x, y, z, w) = ( (x^2 + y)/(z + 5), (y^3 - x)/(w + 7), (z^2 + w^2)/(x + 11), (w*x)/(y + 13) )
			const field = [
				([x, y, z]) => divQ(addQ(mulQ(x, x), y), addQ(z, q(5n))),
				([x, y, _z, w]) => divQ(subQ(mulQ(y, mulQ(y, y)), x), addQ(w, q(7n))),
				([x, _y, z, w]) => divQ(addQ(mulQ(z, z), mulQ(w, w)), addQ(x, q(11n))),
				([x, y, _z, w]) => divQ(mulQ(w, x), addQ(y, q(13n))),
			]
			const point = [q(3n, 5n), q(-7n, 4n), q(11n, 6n), q(-5n, 9n)]
			const step = q(1n, 20n)

			const recursiveResult = divergenceRationalRecursive(field, point, step)
			const iterativeResult = divergenceIterativeReference(field, point, step)
			assert.deepEqual(recursiveResult, iterativeResult)
			assert.ok(recursiveResult.den > 0n)
			assert.equal(gcdIter(recursiveResult.num, recursiveResult.den), 1n)
		})
	})
})
