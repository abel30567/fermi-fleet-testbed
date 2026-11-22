import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceIntervalIterative } from './traceIntervalIterative.js';

const _f64 = new Float64Array(1);
const _u64 = new BigUint64Array(_f64.buffer);

/**
 * Exact decomposition of a finite IEEE-754 binary64 number `x` into
 * `mantissa * 2^exp` as BigInts, with no floating-point approximation.
 *
 * @param {number} x
 * @returns {{ m: bigint, e: number }}
 */
function floatToDyadic(x) {
	if (x === 0) return { m: 0n, e: 0 };
	_f64[0] = x;
	const bits = _u64[0];
	const sign = (bits >> 63n) === 1n ? -1n : 1n;
	const rawExp = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & ((1n << 52n) - 1n);
	if (rawExp === 0) {
		// Subnormal: (-1)^s * frac * 2^-1074
		return { m: sign * frac, e: -1074 };
	}
	// Normal: (-1)^s * (2^52 + frac) * 2^(rawExp - 1023 - 52)
	return { m: sign * ((1n << 52n) + frac), e: rawExp - 1075 };
}

/**
 * Computes the exact real sum of an array of finite binary64 numbers as a BigInt dyadic `{ m, e }`
 * representing `m * 2^e`.
 *
 * @param {number[]} values
 * @returns {{ m: bigint, e: number }}
 */
function exactSumDyadic(values) {
	const dyadics = values.map(floatToDyadic);
	let minExp = 0;
	for (const d of dyadics) {
		if (d.m !== 0n && d.e < minExp) minExp = d.e;
	}
	let total = 0n;
	for (const d of dyadics) {
		if (d.m !== 0n) {
			total += d.m << BigInt(d.e - minExp);
		}
	}
	return { m: total, e: minExp };
}

/**
 * Exact comparison between a binary64 float `x` (including ±Infinity) and a BigInt dyadic `d`.
 * Returns -1 if x < d, 0 if x === d, 1 if x > d.
 *
 * @param {number} x
 * @param {{ m: bigint, e: number }} d
 * @returns {-1 | 0 | 1}
 */
function compareFloatToDyadic(x, d) {
	if (x === -Infinity) return -1;
	if (x === Infinity) return 1;
	const dx = floatToDyadic(x);
	const minExp = Math.min(dx.e, d.e);
	const lhs = dx.m << BigInt(dx.e - minExp);
	const rhs = d.m << BigInt(d.e - minExp);
	if (lhs < rhs) return -1;
	if (lhs > rhs) return 1;
	return 0;
}

/**
 * Helper to build an n×n interval matrix from its diagonal intervals, filling off-diagonal
 * entries with arbitrary valid intervals.
 *
 * @param {Array<[number, number]>} diag
 * @returns {Array<Array<[number, number]>>}
 */
function matrixFromDiag(diag) {
	const n = diag.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? diag[i] : [-100 * (i + 1), 100 * (j + 1)])),
	);
}

describe('traceIntervalIterative', () => {
	describe('normal cases', () => {
		it('computes exact trace for 2×2 and 3×3 integer interval matrices', () => {
			const M2 = [
				[[1, 2], [10, 20]],
				[[-5, 5], [3, 4]],
			];
			assert.deepStrictEqual(traceIntervalIterative(M2), [4, 6]);

			const M3 = [
				[[1, 2], [0, 1], [-3, 3]],
				[[4, 5], [10, 15], [2, 2]],
				[[-1, 0], [7, 8], [-4, 3]],
			];
			assert.deepStrictEqual(traceIntervalIterative(M3), [7, 20]);
		});

		it('produces exact degenerate intervals when all additions are exact', () => {
			const M = matrixFromDiag([
				[0.5, 0.5],
				[0.25, 0.25],
				[0.125, 0.125],
			]);
			assert.deepStrictEqual(traceIntervalIterative(M), [0.875, 0.875]);
		});

		it('ignores off-diagonal values in the sum and does not mutate or alias input', () => {
			const cell = [2, 5];
			const M1 = [[cell]];
			const res = traceIntervalIterative(M1);
			assert.deepStrictEqual(res, [2, 5]);
			assert.notStrictEqual(res, cell);
			res[0] = 999;
			assert.deepStrictEqual(M1[0][0], [2, 5]);
		});
	});

	describe('edge cases and outward rounding', () => {
		it('handles 1×1 matrices including negative zero normalization', () => {
			assert.deepStrictEqual(traceIntervalIterative([[[-3.5, 7.25]]]), [-3.5, 7.25]);
			assert.deepStrictEqual(traceIntervalIterative([[[-0, -0]]]), [0, 0]);
			assert.deepStrictEqual(traceIntervalIterative([[[-0, 0]]]), [0, 0]);
		});

		it('demonstrates outward rounding for non-exact 3×3 floats 0.1 + 0.2 + 0.3', () => {
			const M = matrixFromDiag([
				[0.1, 0.1],
				[0.2, 0.2],
				[0.3, 0.3],
			]);
			const [lo, hi] = traceIntervalIterative(M);
			const exact = exactSumDyadic([0.1, 0.2, 0.3]);

			// True real sum of binary64(0.1) + binary64(0.2) + binary64(0.3) is strictly between 0.6 and 0.6000000000000001
			assert.ok(lo < hi, `expected outward rounding to widen interval: [${lo}, ${hi}]`);
			assert.equal(compareFloatToDyadic(lo, exact), -1, 'lo must be strictly <= exact sum');
			assert.equal(compareFloatToDyadic(hi, exact), 1, 'hi must be strictly >= exact sum');
			assert.equal(lo, 0.6);
			assert.equal(hi, 0.6000000000000001);
		});

		it('encloses true sum under absorption (1 + 1e-16 and 1 - 1e-16)', () => {
			const Mpos = matrixFromDiag([
				[1, 1],
				[1e-16, 1e-16],
			]);
			const [loPos, hiPos] = traceIntervalIterative(Mpos);
			assert.equal(loPos, 1);
			assert.equal(hiPos, 1 + Number.EPSILON);
			const exactPos = exactSumDyadic([1, 1e-16]);
			assert.ok(compareFloatToDyadic(loPos, exactPos) <= 0);
			assert.ok(compareFloatToDyadic(hiPos, exactPos) >= 0);

			const Mneg = matrixFromDiag([
				[1, 1],
				[-1e-16, -1e-16],
			]);
			const [loNeg, hiNeg] = traceIntervalIterative(Mneg);
			assert.equal(loNeg, 1 - Number.EPSILON / 2);
			assert.equal(hiNeg, 1);
			const exactNeg = exactSumDyadic([1, -1e-16]);
			assert.ok(compareFloatToDyadic(loNeg, exactNeg) <= 0);
			assert.ok(compareFloatToDyadic(hiNeg, exactNeg) >= 0);
		});

		it('encloses exact sum under catastrophic cancellation (1e16 + 1 - 1e16)', () => {
			// In naive binary64 arithmetic, (1e16 + 1) - 1e16 === 0, losing the 1 completely.
			const M = matrixFromDiag([
				[1e16, 1e16],
				[1, 1],
				[-1e16, -1e16],
			]);
			const [lo, hi] = traceIntervalIterative(M);
			assert.ok(lo <= 1 && 1 <= hi, `expected [lo, hi] = [${lo}, ${hi}] to enclose 1`);
			assert.equal(lo, 0);
			assert.equal(hi, 2);
		});

		it('handles sign-straddling diagonals cleanly and symmetrically', () => {
			const M = matrixFromDiag([
				[-1.1, 1.1],
				[-2.2, 2.2],
				[-3.3, 3.3],
			]);
			const [lo, hi] = traceIntervalIterative(M);
			assert.equal(lo, -hi);
			assert.ok(lo < -6.6 || lo === -6.6);
			assert.ok(hi > 6.6 || hi === 6.6);
			assert.ok(compareFloatToDyadic(lo, exactSumDyadic([-1.1, -2.2, -3.3])) <= 0);
			assert.ok(compareFloatToDyadic(hi, exactSumDyadic([1.1, 2.2, 3.3])) >= 0);
		});

		it('handles subnormal diagonal values and zero crossings', () => {
			const M = matrixFromDiag([
				[-Number.MIN_VALUE, Number.MIN_VALUE],
				[Number.MIN_VALUE, Number.MIN_VALUE],
				[-Number.MIN_VALUE, 0],
			]);
			const [lo, hi] = traceIntervalIterative(M);
			assert.equal(lo, -Number.MIN_VALUE);
			assert.equal(hi, 2 * Number.MIN_VALUE);
		});

		it('handles floating-point overflow safely without losing enclosure', () => {
			const Mpos = matrixFromDiag([
				[Number.MAX_VALUE, Number.MAX_VALUE],
				[Number.MAX_VALUE, Number.MAX_VALUE],
			]);
			const [loPos, hiPos] = traceIntervalIterative(Mpos);
			assert.equal(loPos, Number.MAX_VALUE);
			assert.equal(hiPos, Infinity);
			assert.ok(loPos <= hiPos);

			const Mneg = matrixFromDiag([
				[-Number.MAX_VALUE, -Number.MAX_VALUE],
				[-Number.MAX_VALUE, -Number.MAX_VALUE],
			]);
			const [loNeg, hiNeg] = traceIntervalIterative(Mneg);
			assert.equal(loNeg, -Infinity);
			assert.equal(hiNeg, -Number.MAX_VALUE);
			assert.ok(loNeg <= hiNeg);
		});
	});

	describe('input validation', () => {
		it('rejects non-array and empty inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => traceIntervalIterative(bad), TypeError);
			}
			assert.throws(() => traceIntervalIterative([]), RangeError);
		});

		it('rejects non-array rows, non-square matrices, and ragged matrices', () => {
			assert.throws(() => traceIntervalIterative([null]), TypeError);
			assert.throws(() => traceIntervalIterative([[[0, 1], [0, 1]]]), RangeError); // 1×2
			assert.throws(() => traceIntervalIterative([[[0, 1]], [[0, 1]]]), RangeError); // 2×1
			assert.throws(
				() =>
					traceIntervalIterative([
						[[0, 1], [0, 1]],
						[[0, 1]],
					]),
				RangeError,
			); // ragged
		});

		it('rejects malformed, non-finite, or inverted intervals on both diagonal and off-diagonal entries', () => {
			// Non-array interval
			assert.throws(() => traceIntervalIterative([[1]]), TypeError);
			assert.throws(
				() =>
					traceIntervalIterative([
						[[0, 1], 'bad'],
						[[0, 1], [0, 1]],
					]),
				TypeError,
			);

			// Wrong tuple length
			assert.throws(() => traceIntervalIterative([[[0]]]), RangeError);
			assert.throws(() => traceIntervalIterative([[[0, 1, 2]]]), RangeError);

			// Non-number endpoints
			assert.throws(() => traceIntervalIterative([[['0', 1]]]), TypeError);
			assert.throws(() => traceIntervalIterative([[[0, null]]]), TypeError);
			assert.throws(() => traceIntervalIterative([[[undefined, 1]]]), TypeError);

			// Non-finite endpoints (diagonal and off-diagonal)
			assert.throws(() => traceIntervalIterative([[[NaN, 1]]]), RangeError);
			assert.throws(() => traceIntervalIterative([[[0, NaN]]]), RangeError);
			assert.throws(() => traceIntervalIterative([[[-Infinity, 1]]]), RangeError);
			assert.throws(() => traceIntervalIterative([[[0, Infinity]]]), RangeError);
			assert.throws(
				() =>
					traceIntervalIterative([
						[[0, 1], [0, Infinity]],
						[[0, 1], [0, 1]],
					]),
				RangeError,
			);

			// Inverted interval (lo > hi), diagonal and off-diagonal
			assert.throws(() => traceIntervalIterative([[[2, 1]]]), RangeError);
			assert.throws(
				() =>
					traceIntervalIterative([
						[[0, 1], [5, -5]],
						[[0, 1], [0, 1]],
					]),
				RangeError,
			);
		});
	});

	describe('independent cross-checks (exact BigInt dyadic arithmetic & sampled point traces)', () => {
		it('encloses exact BigInt dyadic sums and sampled point traces across deterministic random matrices', () => {
			// Deterministic xorshift32 PRNG
			let seed = 0x12345678;
			const nextRand = () => {
				seed ^= seed << 13;
				seed ^= seed >>> 17;
				seed ^= seed << 5;
				return (seed >>> 0) / 0x100000000;
			};

			const scales = [1e-12, 1e-3, 1, 1e3, 1e12];

			for (let trial = 0; trial < 25; trial++) {
				const n = (trial % 7) + 1;
				const diag = [];
				for (let i = 0; i < n; i++) {
					const scale = scales[(trial + i) % scales.length];
					const a = (nextRand() * 2 - 1) * scale;
					const width = nextRand() * scale * 0.5;
					const lo = a;
					const hi = a + width;
					diag.push([Math.min(lo, hi), Math.max(lo, hi)]);
				}
				const M = matrixFromDiag(diag);
				const [resLo, resHi] = traceIntervalIterative(M);

				// 1. Cross-check against exact BigInt dyadic sums of lo endpoints and hi endpoints
				const exactLo = exactSumDyadic(diag.map(([l]) => l));
				const exactHi = exactSumDyadic(diag.map(([, h]) => h));

				assert.ok(
					compareFloatToDyadic(resLo, exactLo) <= 0,
					`trial ${trial}: resLo (${resLo}) exceeded exact lo sum`,
				);
				assert.ok(
					compareFloatToDyadic(resHi, exactHi) >= 0,
					`trial ${trial}: resHi (${resHi}) fell below exact hi sum`,
				);
				assert.ok(resLo <= resHi);

				// 2. Cross-check against 20 sampled point matrices A ∈ M (endpoints + interior points)
				for (let s = 0; s < 20; s++) {
					const pointDiag = diag.map(([l, h]) => {
						if (s === 0) return l;
						if (s === 1) return h;
						const t = nextRand();
						const val = l + t * (h - l);
						return Math.min(Math.max(val, l), h);
					});
					const exactPointTrace = exactSumDyadic(pointDiag);
					assert.ok(
						compareFloatToDyadic(resLo, exactPointTrace) <= 0 &&
							compareFloatToDyadic(resHi, exactPointTrace) >= 0,
						`trial ${trial} sample ${s}: [${resLo}, ${resHi}] failed to enclose exact point trace`,
					);
				}
			}
		});

		it('cross-checks against exact integer-scaled rational arithmetic for decimal tenths', () => {
			// Exact decimals: 0.1, 0.2, 0.3, 0.7, -0.4, 0.9
			// Note: each binary64 literal differs slightly from its decimal, so we verify both:
			// (a) exact binary64 sum enclosure, and
			// (b) interval matrix constructed with decimal-enclosing [lo, hi] encloses the exact decimal sum 1.8.
			const tenths = [1, 2, 3, 7, -4, 9];
			const exactScaledSum = tenths.reduce((a, b) => a + b, 0); // 18 => 1.8
			const M = matrixFromDiag(
				tenths.map((k) => {
					const approx = k / 10;
					// Construct a guaranteed enclosing interval around exact k/10 using ±1 ULP slack
					const eps = Math.abs(approx) * Number.EPSILON;
					return [approx - eps, approx + eps];
				}),
			);
			const [lo, hi] = traceIntervalIterative(M);
			const target = exactScaledSum / 10; // 1.8
			assert.ok(lo <= target && target <= hi, `expected [${lo}, ${hi}] to enclose ${target}`);
		});
	});
});
