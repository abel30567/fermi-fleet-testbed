import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceRationalLazy } from './divergenceRationalLazy.js'

/** Helper to construct a rational literal concisely in tests. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Exact rational helpers for independent test verification. */
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

function reduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function addQ(a, b) {
	return reduce(a.num * b.den + b.num * a.den, a.den * b.den)
}

function subQ(a, b) {
	return reduce(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mulQ(a, b) {
	return reduce(a.num * b.num, a.den * b.den)
}

describe('divergenceRationalLazy', () => {
	describe('normal cases', () => {
		test('1D quadratic polynomial is algebraically exact', () => {
			// F(x) = (3/2) x^2 - (5/7) x + 11/13  =>  F'(x) = 3x - 5/7
			const field = [
				([x]) =>
					addQ(
						subQ(mulQ(q(3, 2), mulQ(x, x)), mulQ(q(5, 7), x)),
						q(11, 13)
					)
			]
			const x = q(4, 9)
			// 3*(4/9) - 5/7 = 4/3 - 5/7 = (28 - 15)/21 = 13/21
			const div = divergenceRationalLazy(field, [x])
			assert.deepEqual(div, q(13, 21))
		})

		test('2D quadratic vector field matches analytical divergence exactly', () => {
			// F(x, y) = (x^2 + 3xy, 2y^2 - 5x)
			// ∂F_0/∂x = 2x + 3y, ∂F_1/∂y = 4y  =>  ∇·F = 2x + 7y
			const field = [
				([x, y]) => addQ(mulQ(x, x), mulQ(q(3), mulQ(x, y))),
				([x, y]) => subQ(mulQ(q(2), mulQ(y, y)), mulQ(q(5), x))
			]
			const pt = [q(-2, 3), q(5, 4)]
			// 2*(-2/3) + 7*(5/4) = -4/3 + 35/4 = (-16 + 105)/12 = 89/12
			const div = divergenceRationalLazy(field, pt, q(1, 7))
			assert.deepEqual(div, q(89, 12))
		})

		test('3D radial field F(x,y,z) = (x, y, z) has constant divergence 3', () => {
			const field = [([x]) => x, ([, y]) => y, ([, , z]) => z]
			assert.deepEqual(
				divergenceRationalLazy(field, [q(17, 5), q(-3, 11), q(0, 1)]),
				q(3, 1)
			)
		})

		test('3D solenoidal (divergence-free) fields yield canonical zero {0n, 1n}', () => {
			// F(x, y, z) = (y*z, x*z, x*y)  =>  ∂F_x/∂x = ∂F_y/∂y = ∂F_z/∂z = 0
			const field = [
				([, y, z]) => mulQ(y, z),
				([x, , z]) => mulQ(x, z),
				([x, y]) => mulQ(x, y)
			]
			const div = divergenceRationalLazy(field, [q(7, 3), q(-11, 5), q(13, 17)])
			assert.deepEqual(div, { num: 0n, den: 1n })
		})

		test('3D general quadratic field with rational coefficients', () => {
			// F = (1/2 x^2 + yz, 2/3 y^2 - xz, -5/6 z^2 + xy)
			// ∇·F = x + (4/3)y - (5/3)z
			const field = [
				([x, y, z]) => addQ(mulQ(q(1, 2), mulQ(x, x)), mulQ(y, z)),
				([x, y, z]) => subQ(mulQ(q(2, 3), mulQ(y, y)), mulQ(x, z)),
				([x, y, z]) => addQ(mulQ(q(-5, 6), mulQ(z, z)), mulQ(x, y))
			]
			const pt = [q(1, 2), q(-3, 4), q(6, 5)]
			// 1/2 + (4/3)*(-3/4) - (5/3)*(6/5) = 1/2 - 1 - 2 = -5/2
			assert.deepEqual(divergenceRationalLazy(field, pt), q(-5, 2))
		})

		test('supports vector-valued function returning array or generator', () => {
			// F(x, y, z) = (2x + y, 3y^2, -z/4)  =>  ∇·F = 2 + 6y - 1/4 = 7/4 + 6y
			const vecArrayFn = ([x, y, z]) => [
				addQ(mulQ(q(2), x), y),
				mulQ(q(3), mulQ(y, y)),
				mulQ(q(-1, 4), z)
			]
			const vecGenFn = function* ([x, y, z]) {
				yield addQ(mulQ(q(2), x), y)
				yield mulQ(q(3), mulQ(y, y))
				yield mulQ(q(-1, 4), z)
			}
			const pt = [q(10), q(1, 3), q(-8)]
			// 7/4 + 6*(1/3) = 7/4 + 2 = 15/4
			assert.deepEqual(divergenceRationalLazy(vecArrayFn, pt), q(15, 4))
			assert.deepEqual(divergenceRationalLazy(vecGenFn, pt), q(15, 4))
		})

		test('supports per-dimension step iterable (array and generator)', () => {
			// F(x, y) = (x^3, y^3)
			// Exact central difference with steps (h_x, h_y) is (3x^2 + h_x^2) + (3y^2 + h_y^2)
			const field = [
				([x]) => mulQ(x, mulQ(x, x)),
				([, y]) => mulQ(y, mulQ(y, y))
			]
			const pt = [q(2), q(3)]
			const hx = q(1, 2)
			const hy = q(1, 3)
			// 3*4 + 1/4 + 3*9 + 1/9 = 39 + 13/36 = 1417/36
			const expected = q(1417, 36)

			assert.deepEqual(divergenceRationalLazy(field, pt, [hx, hy]), expected)

			function* stepGen() {
				yield hx
				yield hy
			}
			assert.deepEqual(divergenceRationalLazy(field, pt, stepGen()), expected)
		})
	})

	describe('streaming and lazy evaluation behavior', () => {
		test('consumes field and step generators strictly one dimension at a time', () => {
			const events = []

			function* fieldGen() {
				events.push('pull-field-0')
				yield ([x]) => {
					events.push('eval-field-0')
					return mulQ(q(2), x)
				}
				events.push('pull-field-1')
				yield ([, y]) => {
					events.push('eval-field-1')
					return mulQ(q(5), y)
				}
				events.push('pull-field-2')
				yield ([, , z]) => {
					events.push('eval-field-2')
					return mulQ(q(-1), z)
				}
			}

			function* stepGen() {
				events.push('pull-step-0')
				yield q(1, 2)
				events.push('pull-step-1')
				yield q(1, 3)
				events.push('pull-step-2')
				yield q(1, 5)
			}

			function* pointGen() {
				yield q(1)
				yield q(2)
				yield q(3)
			}

			const result = divergenceRationalLazy(fieldGen(), pointGen(), stepGen())
			assert.deepEqual(result, q(6, 1))

			// Verify strict lockstep laziness: dimension i is fully evaluated before dimension i+1 is pulled
			assert.deepEqual(events, [
				'pull-field-0',
				'pull-step-0',
				'eval-field-0',
				'eval-field-0',
				'pull-field-1',
				'pull-step-1',
				'eval-field-1',
				'eval-field-1',
				'pull-field-2',
				'pull-step-2',
				'eval-field-2',
				'eval-field-2'
			])
		})

		test('closes underlying iterators cleanly on mid-stream error without pulling remaining items', () => {
			let fieldClosed = false
			let stepClosed = false
			let pulledPastError = false

			function* infiniteField() {
				try {
					yield ([x]) => x
					yield 'not-a-function'
					pulledPastError = true
					yield ([, , z]) => z
				} finally {
					fieldClosed = true
				}
			}

			function* infiniteStep() {
				try {
					while (true) {
						yield q(1, 10)
					}
				} finally {
					stepClosed = true
				}
			}

			assert.throws(
				() => divergenceRationalLazy(infiniteField(), [q(1), q(2), q(3)], infiniteStep()),
				TypeError
			)
			assert.equal(pulledPastError, false)
			assert.equal(fieldClosed, true)
			assert.equal(stepClosed, true)
		})

		test('vector-valued generator function stops consuming once dimension index i is reached', () => {
			let tailEvaluatedOnDim0 = 0
			let generatorClosedCount = 0

			const lazyVecField = function* ([x, y, z]) {
				try {
					yield mulQ(q(3), x)
					// If dim 0 stopped lazily at index 0, this line only runs for dim 1 and dim 2
					yield mulQ(q(4), y)
					yield mulQ(q(5), z)
					tailEvaluatedOnDim0 += 1
					yield q(999)
				} finally {
					generatorClosedCount += 1
				}
			}

			const div = divergenceRationalLazy(lazyVecField, [q(1), q(2), q(3)])
			assert.deepEqual(div, q(12, 1))
			// Never consumed past index 2 (4th element never reached)
			assert.equal(tailEvaluatedOnDim0, 0)
			// 3 dimensions * 2 evaluations (+h and -h) = 6 generator calls, all closed cleanly
			assert.equal(generatorClosedCount, 6)
		})
	})

	describe('edge cases and normalization', () => {
		test('normalizes unreduced and negative-denominator inputs and outputs lowest terms', () => {
			// Unreduced point: (4/-6, -10/-15) = (-2/3, 2/3)
			// Component functions return unreduced rationals with negative denominators
			const field = [
				([x]) => ({ num: -6n * x.num, den: -3n * x.den }), // = 2x
				([, y]) => ({ num: 10n * y.num, den: -20n * y.den }) // = -1/2 y
			]
			// ∇·F = 2 - 1/2 = 3/2
			const div = divergenceRationalLazy(field, [
				{ num: 4n, den: -6n },
				{ num: -10n, den: -15n }
			], { num: -4n, den: -12n }) // step = 1/3
			assert.deepEqual(div, { num: 3n, den: 2n })
		})

		test('handles arbitrarily large BigInt rationals without precision loss', () => {
			const big = 10n ** 30n
			// F(x, y) = (x^2 / big, -y^2 / big)  =>  ∇·F = 2(x - y) / big
			const field = [
				([x]) => reduce(x.num * x.num, x.den * x.den * big),
				([, y]) => reduce(-(y.num * y.num), y.den * y.den * big)
			]
			const x = { num: big + 7n, den: 3n }
			const y = { num: big - 5n, den: 3n }
			// x - y = 12/3 = 4  =>  ∇·F = 8 / 10^30 = 1 / (125 * 10^27)
			const div = divergenceRationalLazy(field, [x, y], { num: 1n, den: big })
			assert.deepEqual(div, reduce(8n, big))
			assert.equal(gcd(div.num, div.den), 1n)
			assert.ok(div.den > 0n)
		})

		test('step-size invariance for quadratic vector fields across vastly different h', () => {
			const field = [
				([x, y]) => addQ(mulQ(q(7, 11), mulQ(x, x)), mulQ(q(3, 5), y)),
				([x, y]) => subQ(mulQ(q(-2, 13), mulQ(y, y)), mulQ(q(1, 2), x))
			]
			const pt = [q(5, 7), q(-13, 19)]
			const d1 = divergenceRationalLazy(field, pt, q(1, 1))
			const d2 = divergenceRationalLazy(field, pt, q(3, 17))
			const d3 = divergenceRationalLazy(field, pt, q(1, 1000000000000n))
			assert.deepEqual(d1, d2)
			assert.deepEqual(d2, d3)
		})

		test('mutation of point array inside a component function does not corrupt subsequent dimensions', () => {
			const field = [
				(p) => {
					const x = p[0]
					p[1] = q(999999)
					return mulQ(q(2), x)
				},
				([, y]) => mulQ(y, y)
			]
			// ∇·F = 2 + 2y at (1, 5) => 12
			assert.deepEqual(divergenceRationalLazy(field, [q(1), q(5)]), q(12, 1))
		})

		test('validates invalid arguments and throws appropriate errors', () => {
			const id1 = [([x]) => x]
			const pt1 = [q(1)]

			// Invalid field
			assert.throws(() => divergenceRationalLazy(null, pt1), TypeError)
			assert.throws(() => divergenceRationalLazy('abc', pt1), TypeError)
			assert.throws(() => divergenceRationalLazy(42, pt1), TypeError)
			assert.throws(() => divergenceRationalLazy([123], pt1), TypeError)
			assert.throws(() => divergenceRationalLazy([], pt1), RangeError)
			assert.throws(() => divergenceRationalLazy([([x]) => x, ([, y]) => y], pt1), RangeError)

			// Invalid vector-valued field return
			assert.throws(() => divergenceRationalLazy(() => 'not-iterable', pt1), TypeError)
			assert.throws(() => divergenceRationalLazy(() => [q(1), q(2)], pt1), RangeError)
			assert.throws(
				() =>
					divergenceRationalLazy(
						function* () {
							yield q(1)
						},
						[q(1), q(2)]
					),
				RangeError
			)

			// Invalid component return value
			assert.throws(() => divergenceRationalLazy([() => ({ num: 1, den: 2n })], pt1), TypeError)
			assert.throws(() => divergenceRationalLazy([() => ({ num: 1n, den: 0n })], pt1), RangeError)

			// Invalid point
			assert.throws(() => divergenceRationalLazy(id1, null), TypeError)
			assert.throws(() => divergenceRationalLazy(id1, '123'), TypeError)
			assert.throws(() => divergenceRationalLazy(id1, []), RangeError)
			assert.throws(() => divergenceRationalLazy(id1, [{ num: 1, den: 1n }]), TypeError)
			assert.throws(() => divergenceRationalLazy(id1, [{ num: 1n, den: 0n }]), RangeError)

			// Invalid step
			assert.throws(() => divergenceRationalLazy(id1, pt1, q(0, 1)), RangeError)
			assert.throws(() => divergenceRationalLazy(id1, pt1, q(-1, 5)), RangeError)
			assert.throws(() => divergenceRationalLazy(id1, pt1, { num: 1n, den: 0n }), RangeError)
			assert.throws(() => divergenceRationalLazy(id1, pt1, '1/10'), TypeError)
			assert.throws(() => divergenceRationalLazy(id1, pt1, 0.001), TypeError)
			assert.throws(() => divergenceRationalLazy(id1, [q(1), q(2)], [q(1, 2)]), RangeError)
			assert.throws(
				() => divergenceRationalLazy(id1, pt1, [q(1, 2), q(1, 3)]),
				RangeError
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('vector calculus identity: div(curl(A)) === 0 identically', () => {
			// Cubic vector potential A(x, y, z) = (x*y^2 + z^3, y*z^2 - x^2*y, z*x^2 + y^3)
			// Analytical curl B = ∇ × A:
			//   B_x = ∂A_z/∂y - ∂A_y/∂z = 3y^2 - 2yz
			//   B_y = ∂A_x/∂z - ∂A_z/∂x = 3z^2 - 2xz
			//   B_z = ∂A_y/∂x - ∂A_x/∂y = -2xy - 2xy = -4xy
			const curlA = [
				([, y, z]) => subQ(mulQ(q(3), mulQ(y, y)), mulQ(q(2), mulQ(y, z))),
				([x, , z]) => subQ(mulQ(q(3), mulQ(z, z)), mulQ(q(2), mulQ(x, z))),
				([x, y]) => mulQ(q(-4), mulQ(x, y))
			]
			const testPoints = [
				[q(1, 2), q(-3, 5), q(7, 11)],
				[q(0), q(0), q(0)],
				[q(-13, 4), q(19, 7), q(-23, 6)]
			]
			for (const pt of testPoints) {
				assert.deepEqual(divergenceRationalLazy(curlA, pt, q(1, 13)), { num: 0n, den: 1n })
			}
		})

		test('linearity: div(a*F + b*G) === a*div(F) + b*div(G) for arbitrary fields', () => {
			const F = [
				([x, y]) => addQ(mulQ(x, mulQ(x, x)), mulQ(y, y)),
				([x, y]) => subQ(mulQ(x, y), mulQ(q(2), mulQ(y, mulQ(y, y))))
			]
			const G = [
				([x, y]) => mulQ(q(5, 7), addQ(mulQ(x, y), x)),
				([x, y]) => addQ(mulQ(q(-3, 4), mulQ(y, y)), x)
			]
			const alpha = q(7, 13)
			const beta = q(-11, 5)
			const combined = [
				(p) => addQ(mulQ(alpha, F[0](p)), mulQ(beta, G[0](p))),
				(p) => addQ(mulQ(alpha, F[1](p)), mulQ(beta, G[1](p)))
			]
			const pt = [q(3, 5), q(-7, 4)]
			const h = q(1, 17)

			const lhs = divergenceRationalLazy(combined, pt, h)
			const rhs = addQ(
				mulQ(alpha, divergenceRationalLazy(F, pt, h)),
				mulQ(beta, divergenceRationalLazy(G, pt, h))
			)
			assert.deepEqual(lhs, rhs)
		})

		test('product rule: div(f * F) === grad(f) · F + f * div(F)', () => {
			// Linear scalar field f(x, y, z) = 2x - 3/2 y + 5/7 z + 1/3
			// Linear vector field F(x, y, z) = (x + 4y, -2y + z, 3z - x)
			// So f * F is quadratic and central difference is algebraically exact.
			const f = ([x, y, z]) =>
				addQ(
					addQ(mulQ(q(2), x), mulQ(q(-3, 2), y)),
					addQ(mulQ(q(5, 7), z), q(1, 3))
				)
			const gradF = [q(2), q(-3, 2), q(5, 7)]
			const F = [
				([x, y]) => addQ(x, mulQ(q(4), y)),
				([, y, z]) => addQ(mulQ(q(-2), y), z),
				([x, , z]) => subQ(mulQ(q(3), z), x)
			]
			const productField = F.map((Fi) => (p) => mulQ(f(p), Fi(p)))
			const pt = [q(3, 4), q(-5, 6), q(7, 8)]

			const lhs = divergenceRationalLazy(productField, pt)
			const gradDotF = addQ(
				addQ(mulQ(gradF[0], F[0](pt)), mulQ(gradF[1], F[1](pt))),
				mulQ(gradF[2], F[2](pt))
			)
			const rhs = addQ(gradDotF, mulQ(f(pt), divergenceRationalLazy(F, pt)))
			assert.deepEqual(lhs, rhs)
		})

		test('Gauss divergence theorem on a 3D rational box matches boundary surface flux', () => {
			// F(x, y, z) = (3/2 x^2 - y, -1/3 y^2 + 2z, 5/4 z^2 + x)
			// ∇·F(x, y, z) = 3x - 2/3 y + 5/2 z is affine, so its exact volume integral
			// over [a0, b0] x [a1, b1] x [a2, b2] equals (∇·F at box midpoint) * Volume.
			// Independently, the outward flux through the 6 faces has closed-form exact sum:
			//   (F_0(b0) - F_0(a0)) * dy * dz + (F_1(b1) - F_1(a1)) * dx * dz + (F_2(b2) - F_2(a2)) * dx * dy
			// because the transverse linear terms (-y, +2z, +x) cancel between opposite faces!
			const field = [
				([x, y]) => subQ(mulQ(q(3, 2), mulQ(x, x)), y),
				([, y, z]) => addQ(mulQ(q(-1, 3), mulQ(y, y)), mulQ(q(2), z)),
				([x, , z]) => addQ(mulQ(q(5, 4), mulQ(z, z)), x)
			]

			const a = [q(-1, 2), q(1, 3), q(-2, 5)]
			const b = [q(3, 2), q(7, 3), q(8, 5)]
			const dx = subQ(b[0], a[0])
			const dy = subQ(b[1], a[1])
			const dz = subQ(b[2], a[2])
			const mid = [
				mulQ(q(1, 2), addQ(a[0], b[0])),
				mulQ(q(1, 2), addQ(a[1], b[1])),
				mulQ(q(1, 2), addQ(a[2], b[2]))
			]
			const vol = mulQ(dx, mulQ(dy, dz))

			// Volume integral via divergenceRationalLazy at box midpoint
			const volumeIntegral = mulQ(divergenceRationalLazy(field, mid), vol)

			// Independent surface flux across 6 faces evaluated at face midpoints (exact for affine face integrands)
			const fluxX = mulQ(
				subQ(field[0]([b[0], mid[1], mid[2]]), field[0]([a[0], mid[1], mid[2]])),
				mulQ(dy, dz)
			)
			const fluxY = mulQ(
				subQ(field[1]([mid[0], b[1], mid[2]]), field[1]([mid[0], a[1], mid[2]])),
				mulQ(dx, dz)
			)
			const fluxZ = mulQ(
				subQ(field[2]([mid[0], mid[1], b[2]]), field[2]([mid[0], mid[1], a[2]])),
				mulQ(dx, dy)
			)
			const surfaceFlux = addQ(addQ(fluxX, fluxY), fluxZ)

			assert.deepEqual(volumeIntegral, surfaceFlux)
		})
	})
})
