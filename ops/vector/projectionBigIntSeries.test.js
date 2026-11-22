import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { projectionBigIntSeries } from './projectionBigIntSeries.js'

const SCALE = 10n ** 18n

function dotBigInt(u, v) {
	let sum = 0n
	for (let i = 0; i < u.length; i++) {
		sum += u[i] * v[i]
	}
	return sum
}

function absBigInt(x) {
	return x < 0n ? -x : x
}

function floatProjection(a, b) {
	let dotAB = 0
	let dotBB = 0
	for (let i = 0; i < a.length; i++) {
		dotAB += a[i] * b[i]
		dotBB += b[i] * b[i]
	}
	const scalar = dotAB / dotBB
	return b.map((bi) => scalar * bi)
}

describe('projectionBigIntSeries', () => {
	test('projects onto standard basis vector exactly', () => {
		const res = projectionBigIntSeries([3n, 4n, 5n], [1n, 0n, 0n])
		assert.deepEqual(res, [3n * SCALE, 0n, 0n])
	})

	test('projects general integer vectors with exact rational and rounded components', () => {
		// a = [3, 4], b = [1, 1] => dotAB = 7, dotBB = 2 => proj = [3.5, 3.5]
		const halfExact = projectionBigIntSeries([3n, 4n], [1n, 1n])
		assert.deepEqual(halfExact, [3_500_000_000_000_000_000n, 3_500_000_000_000_000_000n])

		// a = [1, 0, 0], b = [1, 1, 1] => dotAB = 1, dotBB = 3 => proj = [1/3, 1/3, 1/3]
		const thirds = projectionBigIntSeries([1n, 0n, 0n], [1n, 1n, 1n])
		const oneThird = 333_333_333_333_333_333n
		assert.deepEqual(thirds, [oneThird, oneThird, oneThird])

		// a = [2, 0, 0], b = [1, 1, 1] => 2/3 rounds up to ...667
		const twoThirds = projectionBigIntSeries([2n, 0n, 0n], [1n, 1n, 1n])
		const twoThirdsRounded = 666_666_666_666_666_667n
		assert.deepEqual(twoThirds, [twoThirdsRounded, twoThirdsRounded, twoThirdsRounded])
	})

	test('rounds exact half-ULP ties away from zero symmetrically', () => {
		// 1^2 + 1^2 + 1^2 + 3^2 + 10^2 + 724^2 = 524288 = 2^19
		// For component 0 with a = [±1n, 0n, ...]:
		// (±1 * 1 * 10^18) / 2^19 = ±(5^18 / 2) = ±1907348632812.5
		const b = [1n, 1n, 1n, 3n, 10n, 724n]
		assert.equal(dotBigInt(b, b), 2n ** 19n)
		const aPos = [1n, 0n, 0n, 0n, 0n, 0n]
		const aNeg = [-1n, 0n, 0n, 0n, 0n, 0n]
		const expectedHalfUp = (5n ** 18n + 1n) / 2n
		const posRes = projectionBigIntSeries(aPos, b)
		const negRes = projectionBigIntSeries(aNeg, b)
		assert.equal(posRes[0], expectedHalfUp)
		assert.equal(negRes[0], -expectedHalfUp)
	})

	test('edge case: orthogonal vectors project to exact zero vector', () => {
		const res2d = projectionBigIntSeries([2n, -3n], [3n, 2n])
		assert.deepEqual(res2d, [0n, 0n])

		const res3d = projectionBigIntSeries([1n, 2n, -3n], [4n, 1n, 2n])
		assert.deepEqual(res3d, [0n, 0n, 0n])
	})

	test('edge case: zero vector a projects to exact zero vector', () => {
		const res = projectionBigIntSeries([0n, 0n, 0n], [7n, -11n, 13n])
		assert.deepEqual(res, [0n, 0n, 0n])
	})

	test('edge case: parallel and anti-parallel vectors yield exact a * 10^18', () => {
		const a = [6n, -12n, 18n]
		const bParallel = [2n, -4n, 6n]
		const bAntiParallel = [-3n, 6n, -9n]

		assert.deepEqual(
			projectionBigIntSeries(a, bParallel),
			a.map((x) => x * SCALE),
		)
		assert.deepEqual(
			projectionBigIntSeries(a, bAntiParallel),
			a.map((x) => x * SCALE),
		)
	})

	test('edge case: 1D vectors always yield a[0] * 10^18 regardless of b[0]', () => {
		assert.deepEqual(projectionBigIntSeries([42n], [-99999999999999999999999n]), [
			42n * SCALE,
		])
		assert.deepEqual(projectionBigIntSeries([-7n], [10n ** 40n]), [-7n * SCALE])
	})

	test('edge case: negative vectors preserve odd/even symmetries', () => {
		const a = [-5n, 9n, -14n, 2n]
		const b = [3n, -7n, 4n, -11n]
		const negA = a.map((x) => -x)
		const negB = b.map((x) => -x)

		const projAB = projectionBigIntSeries(a, b)
		const projNegAB = projectionBigIntSeries(negA, b)
		const projANegB = projectionBigIntSeries(a, negB)

		// proj_b(-a) === -proj_b(a)
		assert.deepEqual(
			projNegAB,
			projAB.map((x) => -x),
		)
		// proj_{-b}(a) === proj_b(a)
		assert.deepEqual(projANegB, projAB)
	})

	test('edge case: huge BigInts far beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 50n
		// Parallel huge vectors: must remain exact with zero precision loss
		const aParallel = [3n * big + 7n, -5n * big + 11n]
		const bParallel = [2n * (3n * big + 7n), 2n * (-5n * big + 11n)]
		assert.deepEqual(
			projectionBigIntSeries(aParallel, bParallel),
			aParallel.map((x) => x * SCALE),
		)

		// Non-parallel huge vectors: exact closed-form check
		// a = [big, 0], b = [big, big] => proj = [0.5 * big * SCALE, 0.5 * big * SCALE]
		const aHalf = [big, 0n]
		const bHalf = [big, big]
		const expectedHalf = (big * SCALE) / 2n
		assert.deepEqual(projectionBigIntSeries(aHalf, bHalf), [
			expectedHalf,
			expectedHalf,
		])
	})

	test('cross-check: residual orthogonality (a*10^18 - proj_b(a)) · b ≈ 0', () => {
		const cases = [
			[
				[17n, -23n, 41n, 5n],
				[3n, 11n, -7n, 19n],
			],
			[
				[10n ** 30n + 12345n, -(10n ** 30n) + 67890n, 42n * 10n ** 28n],
				[7n * 10n ** 29n + 1n, 13n * 10n ** 29n - 3n, -(5n * 10n ** 29n) + 9n],
			],
			[
				[-1000n, 2001n, -3002n, 4003n, -5004n],
				[11n, 13n, 17n, 19n, 23n],
			],
		]

		for (const [a, b] of cases) {
			const proj = projectionBigIntSeries(a, b)
			const residual = a.map((ai, i) => ai * SCALE - proj[i])
			const residualDotB = dotBigInt(residual, b)

			// Because each component of proj has rounding error |eps_i| <= 0.5,
			// |residual · b| = |sum(eps_i * b_i)| <= 0.5 * sum(|b_i|).
			const l1NormB = b.reduce((acc, bi) => acc + absBigInt(bi), 0n)
			assert.ok(
				absBigInt(residualDotB) * 2n <= l1NormB,
				`Expected |residual · b| <= 0.5 * ||b||_1, got ${residualDotB} vs ${l1NormB}`,
			)
		}
	})

	test('cross-check: matches independent floating-point projection within double precision', () => {
		const cases = [
			[
				[3, 4, -5],
				[2, -1, 7],
			],
			[
				[-12, 7, 19, -4],
				[5, 8, -3, 11],
			],
			[
				[101, -202, 303],
				[-17, 29, -43],
			],
		]

		for (const [aNum, bNum] of cases) {
			const aBig = aNum.map(BigInt)
			const bBig = bNum.map(BigInt)
			const bigProj = projectionBigIntSeries(aBig, bBig)
			const fltProj = floatProjection(aNum, bNum)

			for (let i = 0; i < aNum.length; i++) {
				const bigAsFloat = Number(bigProj[i]) / 1e18
				const diff = Math.abs(bigAsFloat - fltProj[i])
				assert.ok(
					diff < 1e-12,
					`Component ${i} mismatch: BigInt=${bigAsFloat}, float=${fltProj[i]}`,
				)
			}
		}
	})

	test('cross-check: idempotence proj_b(proj_b(a)) preserves projection up to rounding', () => {
		const a = [13n, -29n, 47n]
		const b = [5n, 7n, -11n]
		const p1 = projectionBigIntSeries(a, b)
		// Project the scaled integer vector p1 onto b again; expected result is p1 * SCALE
		const p2 = projectionBigIntSeries(p1, b)
		for (let i = 0; i < a.length; i++) {
			const expected = p1[i] * SCALE
			const err = absBigInt(p2[i] - expected)
			// p1 already lies within 0.5 of the line spanned by b, so projecting again changes it by <= 1 * SCALE
			assert.ok(err <= SCALE, `Idempotence error too large at ${i}: ${err}`)
		}
	})

	test('invalid inputs: throws on zero target vector b', () => {
		assert.throws(() => projectionBigIntSeries([1n], [0n]), RangeError)
		assert.throws(() => projectionBigIntSeries([1n, 2n, 3n], [0n, 0n, 0n]), RangeError)
	})

	test('invalid inputs: throws on mismatched lengths or empty vectors', () => {
		assert.throws(() => projectionBigIntSeries([1n, 2n], [1n]), RangeError)
		assert.throws(() => projectionBigIntSeries([1n], [1n, 2n, 3n]), RangeError)
		assert.throws(() => projectionBigIntSeries([], []), RangeError)
		assert.throws(() => projectionBigIntSeries([], [1n]), RangeError)
		assert.throws(() => projectionBigIntSeries([1n], []), RangeError)
	})

	test('invalid inputs: throws on non-arrays or non-BigInt elements', () => {
		assert.throws(() => projectionBigIntSeries(null, [1n]), TypeError)
		assert.throws(() => projectionBigIntSeries([1n], undefined), TypeError)
		assert.throws(() => projectionBigIntSeries('123', [1n]), TypeError)
		assert.throws(() => projectionBigIntSeries([1, 2], [1n, 2n]), TypeError)
		assert.throws(() => projectionBigIntSeries([1n, 2n], [1n, 2]), TypeError)
		assert.throws(() => projectionBigIntSeries([1n, '2'], [1n, 2n]), TypeError)
		assert.throws(() => projectionBigIntSeries([1n, null], [1n, 2n]), TypeError)
		// Sparse array element (undefined)
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [1n, , 3n]
		assert.throws(() => projectionBigIntSeries(sparse, [1n, 2n, 3n]), TypeError)
	})
})
