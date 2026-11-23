import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceIntervalRecursive } from './traceIntervalRecursive.js'

/**
 * Converts a finite IEEE-754 binary64 number into an exact dyadic rational
 * `{ num: bigint, shift: number }` representing `num * 2^shift`, where `shift <= 0`
 * (or exact rational `{ num: bigint, den: bigint }` with `den > 0n`).
 */
const _f64 = new Float64Array(1)
const _u64 = new BigUint64Array(_f64.buffer)

function floatToExactRational(x) {
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected finite float, got ${x}`)
	}
	if (x === 0) {
		return { num: 0n, den: 1n }
	}
	_f64[0] = x
	const bits = _u64[0]
	const sign = (bits >> 63n) === 1n ? -1n : 1n
	const expBits = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & ((1n << 52n) - 1n)

	let mantissa
	let exp
	if (expBits === 0) {
		// Subnormal: (-1)^sign * frac * 2^(-1074)
		mantissa = frac
		exp = -1074
	} else {
		// Normal: (-1)^sign * (2^52 + frac) * 2^(expBits - 1023 - 52)
		mantissa = (1n << 52n) | frac
		exp = expBits - 1075
	}

	if (exp >= 0) {
		return { num: sign * (mantissa << BigInt(exp)), den: 1n }
	}
	return { num: sign * mantissa, den: 1n << BigInt(-exp) }
}

function addRational(a, b) {
	return {
		num: a.num * b.den + b.num * a.den,
		den: a.den * b.den
	}
}

function cmpRational(a, b) {
	const diff = a.num * b.den - b.num * a.den
	return diff < 0n ? -1 : diff > 0n ? 1 : 0
}

/**
 * Compares a possibly-infinite float bound against an exact rational.
 */
function floatLeRational(f, r) {
	if (f === -Infinity) return true
	if (f === Infinity) return false
	return cmpRational(floatToExactRational(f), r) <= 0
}

function floatGeRational(f, r) {
	if (f === Infinity) return true
	if (f === -Infinity) return false
	return cmpRational(floatToExactRational(f), r) >= 0
}

/**
 * Builds an n x n interval matrix from a given diagonal and zero/filler off-diagonals.
 */
function diagMatrix(diag, offDiag = [0, 0]) {
	const n = diag.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? diag[i] : [...offDiag]))
	)
}

/**
 * Deterministic LCG PRNG for reproducible tests.
 */
function makeRng(seed) {
	let state = BigInt(seed) & ((1n << 64n) - 1n)
	return () => {
		state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
		return Number(state >> 11n) / 9007199254740992 // [0, 1)
	}
}

describe('traceIntervalRecursive', () => {
	describe('normal cases', () => {
		test('1x1 degenerate and wide interval matrices', () => {
			const cell = [3.5, 7.25]
			const res = traceIntervalRecursive([[cell]])
			assert.deepStrictEqual(res, [3.5, 7.25])
			assert.notStrictEqual(res, cell, 'should return a fresh interval array')

			assert.deepStrictEqual(traceIntervalRecursive([[[42, 42]]]), [42, 42])
		})

		test('exact integer interval matrices have zero overestimation', () => {
			const m2 = [
				[[1, 2], [100, 200]],
				[[-50, 50], [3, 4]]
			]
			assert.deepStrictEqual(traceIntervalRecursive(m2), [4, 6])

			const m3 = [
				[[-10, -5], [1, 9], [0, 0]],
				[[4, 8], [2, 7], [-3, 3]],
				[[9, 9], [-1, 1], [8, 13]]
			]
			assert.deepStrictEqual(traceIntervalRecursive(m3), [0, 15])
		})

		test('off-diagonal intervals do not affect the trace', () => {
			const m = [
				[[1, 2], [-1e100, 1e100], [500, 600]],
				[[-999, 999], [3, 5], [0.1, 0.2]],
				[[1e-300, 1e300], [-42, 42], [-4, -1]]
			]
			assert.deepStrictEqual(traceIntervalRecursive(m), [0, 6])
		})

		test('binary-inexact decimal values outward-round to enclose exact sum', () => {
			// Exact mathematical sum of binary64(0.1) + binary64(0.2) + binary64(0.3)
			const m = diagMatrix([
				[0.1, 0.1],
				[0.2, 0.2],
				[0.3, 0.3]
			])
			const [lo, hi] = traceIntervalRecursive(m)
			const exact = [0.1, 0.2, 0.3]
				.map(floatToExactRational)
				.reduce(addRational)

			assert.ok(lo <= hi)
			assert.ok(floatLeRational(lo, exact), 'lower bound must be <= exact sum')
			assert.ok(floatGeRational(hi, exact), 'upper bound must be >= exact sum')
			// For 0.1 + 0.2 + 0.3 in binary64, the sum is not exact, so hi > lo
			assert.ok(hi > lo, 'inexact sum must strictly bracket the true sum')
		})

		test('non-power-of-two matrix sizes exercise uneven divide-and-conquer splits', () => {
			for (const n of [3, 5, 7, 9, 17]) {
				const diag = Array.from({ length: n }, (_, i) => [i, i + 1])
				const res = traceIntervalRecursive(diagMatrix(diag))
				const expectedLo = (n * (n - 1)) / 2
				const expectedHi = (n * (n + 1)) / 2
				assert.deepStrictEqual(res, [expectedLo, expectedHi])
			}
		})
	})

	describe('edge cases', () => {
		test('empty 0x0 matrix returns [0, 0]', () => {
			const res = traceIntervalRecursive([])
			assert.deepStrictEqual(res, [0, 0])
			assert.ok(Object.is(res[0], 0))
			assert.ok(Object.is(res[1], 0))
		})

		test('negative zero bounds are normalized to +0', () => {
			const r1 = traceIntervalRecursive([[[-0, -0]]])
			assert.ok(Object.is(r1[0], 0))
			assert.ok(Object.is(r1[1], 0))

			const r2 = traceIntervalRecursive(diagMatrix([[-0, -0], [-0, -0]]))
			assert.ok(Object.is(r2[0], 0))
			assert.ok(Object.is(r2[1], 0))
		})

		test('tiny perturbation absorbed in round-to-nearest is still enclosed', () => {
			// 1 + Number.MIN_VALUE rounds to 1 in RN, so addUp MUST push to 1 + EPSILON
			const mPos = diagMatrix([
				[1, 1],
				[Number.MIN_VALUE, Number.MIN_VALUE]
			])
			const [loPos, hiPos] = traceIntervalRecursive(mPos)
			assert.strictEqual(loPos, 1)
			assert.strictEqual(hiPos, 1 + Number.EPSILON)

			// 1 - Number.MIN_VALUE rounds to 1 in RN, so addDown MUST push to 1 - EPSILON/2
			const mNeg = diagMatrix([
				[1, 1],
				[-Number.MIN_VALUE, -Number.MIN_VALUE]
			])
			const [loNeg, hiNeg] = traceIntervalRecursive(mNeg)
			assert.strictEqual(loNeg, 1 - Number.EPSILON / 2)
			assert.strictEqual(hiNeg, 1)
		})

		test('subnormal diagonal entries sum accurately without underflow loss', () => {
			const m = diagMatrix([
				[Number.MIN_VALUE, 2 * Number.MIN_VALUE],
				[3 * Number.MIN_VALUE, 5 * Number.MIN_VALUE],
				[-Number.MIN_VALUE, Number.MIN_VALUE]
			])
			assert.deepStrictEqual(traceIntervalRecursive(m), [
				3 * Number.MIN_VALUE,
				8 * Number.MIN_VALUE
			])
		})

		test('overflow near MAX_VALUE preserves outward enclosure without NaN', () => {
			const mPos = diagMatrix([
				[Number.MAX_VALUE, Number.MAX_VALUE],
				[Number.MAX_VALUE, Number.MAX_VALUE]
			])
			const [loPos, hiPos] = traceIntervalRecursive(mPos)
			assert.strictEqual(loPos, Number.MAX_VALUE)
			assert.strictEqual(hiPos, Infinity)

			const mNeg = diagMatrix([
				[-Number.MAX_VALUE, -Number.MAX_VALUE],
				[-Number.MAX_VALUE, -Number.MAX_VALUE]
			])
			const [loNeg, hiNeg] = traceIntervalRecursive(mNeg)
			assert.strictEqual(loNeg, -Infinity)
			assert.strictEqual(hiNeg, -Number.MAX_VALUE)

			// 4x4 overflow where both recursive halves overflow
			const m4 = diagMatrix([
				[Number.MAX_VALUE, Number.MAX_VALUE],
				[Number.MAX_VALUE, Number.MAX_VALUE],
				[Number.MAX_VALUE, Number.MAX_VALUE],
				[Number.MAX_VALUE, Number.MAX_VALUE]
			])
			const [lo4, hi4] = traceIntervalRecursive(m4)
			assert.strictEqual(lo4, Number.MAX_VALUE)
			assert.strictEqual(hi4, Infinity)
			assert.ok(!Number.isNaN(lo4) && !Number.isNaN(hi4))

			// Exact cancellation at MAX_VALUE
			const mCancel = diagMatrix([
				[Number.MAX_VALUE, Number.MAX_VALUE],
				[-Number.MAX_VALUE, -Number.MAX_VALUE]
			])
			assert.deepStrictEqual(traceIntervalRecursive(mCancel), [0, 0])
		})

		test('fastTwoSum edge case near MAX_VALUE with tiny negative offset', () => {
			// -2^969 is less than half an ULP of MAX_VALUE (ULP(MAX_VALUE) = 2^971)
			const tinyNeg = -(2 ** 969)
			const m = diagMatrix([
				[Number.MAX_VALUE, Number.MAX_VALUE],
				[tinyNeg, tinyNeg]
			])
			const [lo, hi] = traceIntervalRecursive(m)
			const exact = addRational(
				floatToExactRational(Number.MAX_VALUE),
				floatToExactRational(tinyNeg)
			)
			assert.ok(floatLeRational(lo, exact))
			assert.ok(floatGeRational(hi, exact))
			assert.strictEqual(hi, Number.MAX_VALUE)
			assert.ok(lo < Number.MAX_VALUE)
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-array matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => traceIntervalRecursive(bad), TypeError)
			}
		})

		test('rejects non-array rows and non-square / jagged matrices', () => {
			assert.throws(() => traceIntervalRecursive([123]), TypeError)
			assert.throws(() => traceIntervalRecursive([[[0, 0], [0, 0]], null]), TypeError)
			assert.throws(
				() => traceIntervalRecursive([[[0, 0], [1, 1]]]),
				RangeError
			)
			assert.throws(
				() => traceIntervalRecursive([[[0, 0]], [[1, 1]]]),
				RangeError
			)
			assert.throws(
				() =>
					traceIntervalRecursive([
						[[0, 0], [1, 1]],
						[[2, 2]]
					]),
				RangeError
			)
		})

		test('rejects malformed, non-finite, inverted, or sparse interval cells', () => {
			// Malformed cell type / length (diagonal and off-diagonal)
			assert.throws(() => traceIntervalRecursive([[1]]), TypeError)
			assert.throws(() => traceIntervalRecursive([[[1]]]), RangeError)
			assert.throws(() => traceIntervalRecursive([[[1, 2, 3]]]), RangeError)
			assert.throws(
				() =>
					traceIntervalRecursive([
						[[0, 0], 'bad'],
						[[0, 0], [0, 0]]
					]),
				TypeError
			)

			// Non-number bounds
			assert.throws(() => traceIntervalRecursive([[['1', 2]]]), TypeError)
			assert.throws(() => traceIntervalRecursive([[[1, null]]]), TypeError)
			assert.throws(() => traceIntervalRecursive([[[1n, 2n]]]), TypeError)

			// Non-finite bounds
			assert.throws(() => traceIntervalRecursive([[[NaN, 1]]]), RangeError)
			assert.throws(() => traceIntervalRecursive([[[1, NaN]]]), RangeError)
			assert.throws(() => traceIntervalRecursive([[[-Infinity, 1]]]), RangeError)
			assert.throws(() => traceIntervalRecursive([[[1, Infinity]]]), RangeError)

			// Inverted bounds (lo > hi), including off-diagonal
			assert.throws(() => traceIntervalRecursive([[[2, 1]]]), RangeError)
			assert.throws(
				() =>
					traceIntervalRecursive([
						[[0, 0], [5, 4]],
						[[0, 0], [0, 0]]
					]),
				RangeError
			)

			// Sparse matrix hole
			const sparseRow = new Array(2)
			sparseRow[0] = [0, 0]
			assert.throws(
				() => traceIntervalRecursive([sparseRow, [[0, 0], [0, 0]]]),
				TypeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('exact BigInt dyadic rational cross-check across diverse scales and sizes', () => {
			const rand = makeRng(0xdecafbad12345678n)
			const sizes = [1, 2, 3, 4, 7, 16, 33, 64]

			for (const n of sizes) {
				const diag = []
				for (let i = 0; i < n; i++) {
					// Mix scales from 2^-40 to 2^40 to stress rounding & cancellation
					const exp = Math.floor(rand() * 81) - 40
					const base = (rand() * 2 - 1) * 2 ** exp
					const width = rand() * 2 ** (exp - 4)
					const lo = base
					const hi = base + width
					diag.push(lo <= hi ? [lo, hi] : [hi, lo])
				}

				const matrix = diagMatrix(diag, [-1.5, 2.5])
				const [resLo, resHi] = traceIntervalRecursive(matrix)

				let exactLo = { num: 0n, den: 1n }
				let exactHi = { num: 0n, den: 1n }
				for (const [lo, hi] of diag) {
					exactLo = addRational(exactLo, floatToExactRational(lo))
					exactHi = addRational(exactHi, floatToExactRational(hi))
				}

				assert.ok(resLo <= resHi, `size ${n}: resLo <= resHi`)
				assert.ok(
					floatLeRational(resLo, exactLo),
					`size ${n}: resLo (${resLo}) must be <= exact lower sum`
				)
				assert.ok(
					floatGeRational(resHi, exactHi),
					`size ${n}: resHi (${resHi}) must be >= exact upper sum`
				)
			}
		})

		test('catastrophic cancellation stress test against exact rational sum', () => {
			// Large terms cancel, leaving small fractional terms that naive float sums lose
			const diag = [
				[1e16, 1e16],
				[0.1, 0.2],
				[0.3, 0.4],
				[-1e16, -1e16],
				[1e-16, 2e-16],
				[1e16, 1e16],
				[-1e16, -1e16]
			]
			const [resLo, resHi] = traceIntervalRecursive(diagMatrix(diag))

			const exactLo = diag
				.map(([lo]) => floatToExactRational(lo))
				.reduce(addRational)
			const exactHi = diag
				.map(([, hi]) => floatToExactRational(hi))
				.reduce(addRational)

			assert.ok(floatLeRational(resLo, exactLo))
			assert.ok(floatGeRational(resHi, exactHi))
		})

		test('sampled point-matrix traces are always enclosed by interval trace', () => {
			const rand = makeRng(0x123456789abcdef0n)
			const n = 12
			const matrix = Array.from({ length: n }, () =>
				Array.from({ length: n }, () => {
					const a = (rand() - 0.5) * 100
					const b = a + rand() * 10
					return [a, b]
				})
			)

			const [resLo, resHi] = traceIntervalRecursive(matrix)

			// Test extreme corners (all lo, all hi) and 200 random interior point matrices
			const samples = [
				matrix.map((row) => row.map(([lo]) => lo)),
				matrix.map((row) => row.map(([, hi]) => hi))
			]
			for (let s = 0; s < 200; s++) {
				samples.push(
					matrix.map((row) =>
						row.map(([lo, hi]) => {
							const t = rand()
							const val = lo + t * (hi - lo)
							return Math.min(hi, Math.max(lo, val))
						})
					)
				)
			}

			for (const pointMatrix of samples) {
				let exactTrace = { num: 0n, den: 1n }
				for (let i = 0; i < n; i++) {
					exactTrace = addRational(
						exactTrace,
						floatToExactRational(pointMatrix[i][i])
					)
				}
				assert.ok(
					floatLeRational(resLo, exactTrace) &&
						floatGeRational(resHi, exactTrace),
					`interval [${resLo}, ${resHi}] must enclose sampled exact trace`
				)
			}
		})

		test('inclusion isotonicity: sub-interval matrix exact trace lies inside super-interval trace', () => {
			const rand = makeRng(0xfeedfacecafebeefn)
			const n = 10
			const innerDiag = []
			const outerDiag = []
			for (let i = 0; i < n; i++) {
				const center = (rand() - 0.5) * 50
				const rInner = rand() * 2
				const rOuter = rInner + rand() * 3
				innerDiag.push([center - rInner, center + rInner])
				outerDiag.push([center - rOuter, center + rOuter])
			}

			const [outerLo, outerHi] = traceIntervalRecursive(diagMatrix(outerDiag))
			const exactInnerLo = innerDiag
				.map(([lo]) => floatToExactRational(lo))
				.reduce(addRational)
			const exactInnerHi = innerDiag
				.map(([, hi]) => floatToExactRational(hi))
				.reduce(addRational)

			assert.ok(floatLeRational(outerLo, exactInnerLo))
			assert.ok(floatGeRational(outerHi, exactInnerHi))
		})
	})
})
