import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddIntervalSeries } from './vectorAddIntervalSeries.js'

const f64 = new Float64Array(1)
const u64 = new BigUint64Array(f64.buffer)

/**
 * Decodes a finite binary64 float into an exact dyadic rational `{ m: BigInt, e: number }`
 * representing `m * 2^e`.
 */
function floatToDyadic(x) {
	if (!Number.isFinite(x)) {
		throw new Error(`Expected finite number, got ${x}`)
	}
	if (x === 0) return { m: 0n, e: 0 }
	f64[0] = x
	const bits = u64[0]
	const sign = (bits >> 63n) === 1n ? -1n : 1n
	const expBits = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & ((1n << 52n) - 1n)
	if (expBits === 0) {
		// Subnormal: (-1)^s * frac * 2^-1074
		return { m: sign * frac, e: -1074 }
	}
	// Normal: (-1)^s * (2^52 + frac) * 2^(expBits - 1023 - 52)
	return { m: sign * ((1n << 52n) + frac), e: expBits - 1075 }
}

/**
 * Exact comparison of `a + b` against a binary64 bound `c` (which may be `±Infinity`).
 * Returns negative if `a + b < c`, 0 if equal, positive if `a + b > c`.
 */
function compareSumToBound(a, b, c) {
	if (c === Infinity) return -1
	if (c === -Infinity) return 1
	const da = floatToDyadic(a)
	const db = floatToDyadic(b)
	const dc = floatToDyadic(c)
	const minExp = Math.min(da.e, db.e, dc.e)
	const sumScaled =
		(da.m << BigInt(da.e - minExp)) + (db.m << BigInt(db.e - minExp))
	const cScaled = dc.m << BigInt(dc.e - minExp)
	if (sumScaled < cScaled) return -1
	if (sumScaled > cScaled) return 1
	return 0
}

function refNextUp(x) {
	if (x === Infinity) return Infinity
	if (x === 0) return Number.MIN_VALUE
	f64[0] = x
	u64[0] = x > 0 ? u64[0] + 1n : u64[0] - 1n
	return f64[0] === 0 ? 0 : f64[0]
}

function refNextDown(x) {
	if (x === -Infinity) return -Infinity
	if (x === 0) return -Number.MIN_VALUE
	f64[0] = x
	u64[0] = x > 0 ? u64[0] - 1n : u64[0] + 1n
	return f64[0] === 0 ? 0 : f64[0]
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible sampling tests.
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('vectorAddIntervalSeries', () => {
	test('adds exact integer and dyadic interval vectors without spurious widening', () => {
		const a = [
			[1, 2],
			[-3.5, 4.25],
			[0, 0]
		]
		const b = [
			[5, 6],
			[-1.5, 2.75],
			[-0.5, 0.5]
		]
		const res = vectorAddIntervalSeries(a, b)
		assert.deepStrictEqual(res, [
			[6, 8],
			[-5, 7],
			[-0.5, 0.5]
		])
	})

	test('handles empty vectors', () => {
		assert.deepStrictEqual(vectorAddIntervalSeries([], []), [])
	})

	test('normalizes negative zero to positive zero', () => {
		const res = vectorAddIntervalSeries(
			[
				[-0, -0],
				[-1, 1]
			],
			[
				[-0, 0],
				[1, -1 + 2]
			]
		)
		assert.ok(Object.is(res[0][0], 0))
		assert.ok(Object.is(res[0][1], 0))
		assert.ok(Object.is(res[1][0], 0))
		assert.equal(res[1][1], 2)
	})

	test('encloses classic non-exact decimal sums (0.1 + 0.2)', () => {
		const res = vectorAddIntervalSeries([[0.1, 0.1]], [[0.2, 0.2]])
		const [lo, hi] = res[0]
		// Binary64 0.1 + 0.2 has exact dyadic sum > 0.30000000000000004
		assert.ok(compareSumToBound(0.1, 0.2, lo) >= 0)
		assert.ok(compareSumToBound(0.1, 0.2, hi) <= 0)
		assert.ok(lo < hi)
		assert.equal(hi, refNextUp(lo))
	})

	test('applies tight 1-ULP outward rounding for absorbed tiny perturbations', () => {
		const quarterEps = Number.EPSILON / 4
		const res = vectorAddIntervalSeries(
			[
				[1, 1],
				[1, 1],
				[1, 1],
				[1e16, 1e16],
				[1e16, 1e16]
			],
			[
				[quarterEps, quarterEps],
				[-quarterEps, -quarterEps],
				[-Number.MIN_VALUE, Number.MIN_VALUE],
				[1, 1],
				[-1, -1]
			]
		)

		// 1 + eps/4 lies strictly in (1, 1 + eps)
		assert.deepStrictEqual(res[0], [1, 1 + Number.EPSILON])
		// 1 - eps/4 lies strictly in (1 - eps/2, 1)
		assert.deepStrictEqual(res[1], [1 - Number.EPSILON / 2, 1])
		// [1 - MIN_VALUE, 1 + MIN_VALUE] widens one ULP outward on both ends
		assert.deepStrictEqual(res[2], [1 - Number.EPSILON / 2, 1 + Number.EPSILON])
		// 1e16 + 1 rounds to 1e16 with residual +1; ulp(1e16) = 2
		assert.deepStrictEqual(res[3], [1e16, 1e16 + 2])
		// 1e16 - 1 rounds to 1e16 (ties to even) with residual -1
		assert.deepStrictEqual(res[4], [1e16 - 2, 1e16])
	})

	test('handles subnormal intervals accurately', () => {
		const m = Number.MIN_VALUE
		const res = vectorAddIntervalSeries(
			[
				[m, 2 * m],
				[-m, m]
			],
			[
				[m, 3 * m],
				[-2 * m, m]
			]
		)
		assert.deepStrictEqual(res, [
			[2 * m, 5 * m],
			[-3 * m, 2 * m]
		])
	})

	test('encloses overflow boundaries without losing soundness', () => {
		const max = Number.MAX_VALUE
		const res = vectorAddIntervalSeries(
			[
				[max, max],
				[-max, -max],
				[max, max],
				[-max, -max],
				[-max, max]
			],
			[
				[max, max],
				[-max, -max],
				[1, 1],
				[-1, -1],
				[-max, max]
			]
		)
		assert.deepStrictEqual(res, [
			[max, Infinity],
			[-Infinity, -max],
			[max, Infinity],
			[-Infinity, -max],
			[-Infinity, Infinity]
		])
	})

	test('does not mutate input vectors or intervals', () => {
		const a = [
			[1.1, 2.2],
			[-3.3, 4.4]
		]
		const b = [
			[0.3, 0.7],
			[5.5, 6.6]
		]
		const aSnap = structuredClone(a)
		const bSnap = structuredClone(b)
		const res = vectorAddIntervalSeries(a, b)
		assert.deepStrictEqual(a, aSnap)
		assert.deepStrictEqual(b, bSnap)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	test('satisfies commutativity, zero identity, and inclusion monotonicity', () => {
		const a = [
			[-1.3, 2.7],
			[1e12, 1e12 + 3],
			[-1e-300, 1e-300]
		]
		const b = [
			[0.1, 0.9],
			[-0.5, 0.5],
			[1e-310, 2e-310]
		]
		const zeros = a.map(() => [0, 0])

		// Commutativity
		assert.deepStrictEqual(
			vectorAddIntervalSeries(a, b),
			vectorAddIntervalSeries(b, a)
		)

		// Additive identity
		assert.deepStrictEqual(vectorAddIntervalSeries(a, zeros), a)

		// Inclusion monotonicity: a in aWide and b in bWide => (a + b) in (aWide + bWide)
		const aWide = a.map(([lo, hi]) => [lo - 1, hi + 1])
		const bWide = b.map(([lo, hi]) => [lo - 0.5, hi + 0.5])
		const narrow = vectorAddIntervalSeries(a, b)
		const wide = vectorAddIntervalSeries(aWide, bWide)
		for (let i = 0; i < narrow.length; i++) {
			assert.ok(wide[i][0] <= narrow[i][0])
			assert.ok(wide[i][1] >= narrow[i][1])
		}
	})

	test('independent cross-check: exact BigInt dyadic enclosure and tightness plus corner/interior sampling', () => {
		const rng = createRng(0x5eed1234)
		const scales = [1e-315, 1e-100, 1e-16, 1, 1e16, 1e100, 1e307]

		for (let trial = 0; trial < 40; trial++) {
			const dim = 1 + (trial % 8)
			const a = []
			const b = []
			for (let i = 0; i < dim; i++) {
				const s1 = scales[Math.floor(rng() * scales.length)]
				const s2 = scales[Math.floor(rng() * scales.length)]
				const x1 = (rng() * 2 - 1) * s1
				const x2 = (rng() * 2 - 1) * s1
				const y1 = (rng() * 2 - 1) * s2
				const y2 = (rng() * 2 - 1) * s2
				a.push([Math.min(x1, x2), Math.max(x1, x2)])
				b.push([Math.min(y1, y2), Math.max(y1, y2)])
			}

			const res = vectorAddIntervalSeries(a, b)
			assert.equal(res.length, dim)

			for (let i = 0; i < dim; i++) {
				const [aLo, aHi] = a[i]
				const [bLo, bHi] = b[i]
				const [rLo, rHi] = res[i]

				// Soundness at lower and upper interval endpoints via exact BigInt dyadic arithmetic
				assert.ok(rLo <= rHi, `inverted result [${rLo}, ${rHi}]`)
				assert.ok(
					compareSumToBound(aLo, bLo, rLo) >= 0,
					`lower bound ${rLo} exceeds exact ${aLo} + ${bLo}`
				)
				assert.ok(
					compareSumToBound(aHi, bHi, rHi) <= 0,
					`upper bound ${rHi} below exact ${aHi} + ${bHi}`
				)

				// Tightness: moving either bound inward by 1 ULP must violate enclosure
				assert.ok(
					compareSumToBound(aLo, bLo, refNextUp(rLo)) < 0,
					`lower bound ${rLo} is not tight for ${aLo} + ${bLo}`
				)
				assert.ok(
					compareSumToBound(aHi, bHi, refNextDown(rHi)) > 0,
					`upper bound ${rHi} is not tight for ${aHi} + ${bHi}`
				)

				// Corner and interior point sampling verifying enclosure for all sampled (x, y)
				const aSamples = [
					aLo,
					aHi,
					aLo + (aHi - aLo) * 0.25,
					aLo + (aHi - aLo) * 0.5,
					aLo + (aHi - aLo) * 0.75
				].filter((v) => v >= aLo && v <= aHi)
				const bSamples = [
					bLo,
					bHi,
					bLo + (bHi - bLo) * 0.25,
					bLo + (bHi - bLo) * 0.5,
					bLo + (bHi - bLo) * 0.75
				].filter((v) => v >= bLo && v <= bHi)

				for (const x of aSamples) {
					for (const y of bSamples) {
						assert.ok(compareSumToBound(x, y, rLo) >= 0)
						assert.ok(compareSumToBound(x, y, rHi) <= 0)
					}
				}
			}
		}
	})

	test('validates inputs and throws descriptive TypeError / RangeError', () => {
		// Non-array vector arguments
		assert.throws(() => vectorAddIntervalSeries(null, []), TypeError)
		assert.throws(() => vectorAddIntervalSeries([], undefined), TypeError)
		assert.throws(() => vectorAddIntervalSeries('abc', []), TypeError)
		assert.throws(() => vectorAddIntervalSeries({}, {}), TypeError)

		// Length mismatch
		assert.throws(
			() => vectorAddIntervalSeries([[0, 1]], [[0, 1], [2, 3]]),
			RangeError
		)

		// Malformed interval elements
		assert.throws(() => vectorAddIntervalSeries([1], [[0, 1]]), TypeError)
		assert.throws(() => vectorAddIntervalSeries([[0, 1]], [[0]]), TypeError)
		assert.throws(
			() => vectorAddIntervalSeries([[0, 1, 2]], [[0, 1]]),
			TypeError
		)
		assert.throws(
			() => vectorAddIntervalSeries([['0', 1]], [[0, 1]]),
			TypeError
		)
		assert.throws(
			() => vectorAddIntervalSeries([[0, 1]], [[0, null]]),
			TypeError
		)

		// Sparse array hole
		const sparse = new Array(1)
		assert.throws(() => vectorAddIntervalSeries(sparse, [[0, 1]]), TypeError)

		// Non-finite bounds
		assert.throws(() => vectorAddIntervalSeries([[NaN, 1]], [[0, 1]]), RangeError)
		assert.throws(() => vectorAddIntervalSeries([[0, 1]], [[0, NaN]]), RangeError)
		assert.throws(
			() => vectorAddIntervalSeries([[-Infinity, 1]], [[0, 1]]),
			RangeError
		)
		assert.throws(
			() => vectorAddIntervalSeries([[0, 1]], [[0, Infinity]]),
			RangeError
		)

		// Inverted intervals (lo > hi)
		assert.throws(() => vectorAddIntervalSeries([[2, 1]], [[0, 1]]), RangeError)
		assert.throws(() => vectorAddIntervalSeries([[0, 1]], [[3, -1]]), RangeError)
	})
})
