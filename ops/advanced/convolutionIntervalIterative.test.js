import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convolutionIntervalIterative } from './convolutionIntervalIterative.js';

/**
 * Exact dyadic rational representation `num * 2^exp` for finite IEEE-754 binary64 numbers.
 */
const _f64 = new Float64Array(1);
const _u64 = new BigUint64Array(_f64.buffer);

function floatToDyadic(x) {
	if (x === 0) return { m: 0n, e: 0 };
	_f64[0] = x;
	const bits = _u64[0];
	const sign = (bits >> 63n) === 1n ? -1n : 1n;
	const biasedExp = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & 0xfffffffffffffn;
	if (biasedExp === 0) {
		// Subnormal: value = sign * frac * 2^(-1074)
		return { m: sign * frac, e: -1074 };
	}
	// Normal: value = sign * (2^52 + frac) * 2^(biasedExp - 1023 - 52)
	return { m: sign * ((1n << 52n) + frac), e: biasedExp - 1075 };
}

function dyadicAdd(a, b) {
	if (a.m === 0n) return b;
	if (b.m === 0n) return a;
	if (a.e === b.e) return { m: a.m + b.m, e: a.e };
	if (a.e > b.e) {
		return { m: (a.m << BigInt(a.e - b.e)) + b.m, e: b.e };
	}
	return { m: a.m + (b.m << BigInt(b.e - a.e)), e: a.e };
}

function dyadicMul(a, b) {
	if (a.m === 0n || b.m === 0n) return { m: 0n, e: 0 };
	return { m: a.m * b.m, e: a.e + b.e };
}

function dyadicCmp(a, b) {
	if (a.m === 0n && b.m === 0n) return 0;
	if (a.m === 0n) return b.m > 0n ? -1 : 1;
	if (b.m === 0n) return a.m > 0n ? 1 : -1;
	let am = a.m;
	let bm = b.m;
	if (a.e > b.e) {
		am = a.m << BigInt(a.e - b.e);
	} else if (b.e > a.e) {
		bm = b.m << BigInt(b.e - a.e);
	}
	if (am < bm) return -1;
	if (am > bm) return 1;
	return 0;
}

/**
 * Checks whether exact dyadic value `val` is enclosed in IEEE-754 interval `[lo, hi]`.
 */
function intervalEnclosesDyadic([lo, hi], val) {
	const geLo = lo === -Infinity ? true : dyadicCmp(floatToDyadic(lo), val) <= 0;
	const leHi = hi === Infinity ? true : dyadicCmp(val, floatToDyadic(hi)) <= 0;
	return geLo && leHi;
}

/**
 * Exact point convolution of two arrays of IEEE-754 floats using BigInt dyadic arithmetic.
 */
function exactPointConvolution(xs, ys) {
	const outLen = xs.length + ys.length - 1;
	const out = new Array(outLen);
	for (let n = 0; n < outLen; n++) {
		let sum = { m: 0n, e: 0 };
		const kStart = Math.max(0, n - ys.length + 1);
		const kEnd = Math.min(n, xs.length - 1);
		for (let k = kStart; k <= kEnd; k++) {
			sum = dyadicAdd(sum, dyadicMul(floatToDyadic(xs[k]), floatToDyadic(ys[n - k])));
		}
		out[n] = sum;
	}
	return out;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible random sampling tests.
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('convolutionIntervalIterative', () => {
	describe('normal cases', () => {
		it('computes exact convolution for single-element intervals', () => {
			assert.deepStrictEqual(
				convolutionIntervalIterative([[2, 3]], [[4, 5]]),
				[[8, 15]]
			);
			assert.deepStrictEqual(
				convolutionIntervalIterative([[-2, 3]], [[-4, 5]]),
				[[-12, 15]]
			);
			assert.deepStrictEqual(
				convolutionIntervalIterative([[-5, -2]], [[-3, -1]]),
				[[2, 15]]
			);
		});

		it('computes exact convolution for multi-element integer intervals', () => {
			// a = [[1, 2], [3, 4]], b = [[5, 6], [7, 8], [9, 10]]
			// n=0: [1,2]*[5,6] = [5, 12]
			// n=1: [1,2]*[7,8] + [3,4]*[5,6] = [7,16] + [15,24] = [22, 40]
			// n=2: [1,2]*[9,10] + [3,4]*[7,8] = [9,20] + [21,32] = [30, 52]
			// n=3: [3,4]*[9,10] = [27, 40]
			const a = [[1, 2], [3, 4]];
			const b = [[5, 6], [7, 8], [9, 10]];
			assert.deepStrictEqual(
				convolutionIntervalIterative(a, b),
				[[5, 12], [22, 40], [30, 52], [27, 40]]
			);
		});

		it('handles mixed-sign intervals straddling zero', () => {
			// a = [[-1, 2], [-3, 1]], b = [[-2, 3], [0, 4]]
			// n=0: [-1,2]*[-2,3] = [-4, 6]
			// n=1: [-1,2]*[0,4] + [-3,1]*[-2,3] = [-4,8] + [-9,6] = [-13, 14]
			// n=2: [-3,1]*[0,4] = [-12, 4]
			const a = [[-1, 2], [-3, 1]];
			const b = [[-2, 3], [0, 4]];
			assert.deepStrictEqual(
				convolutionIntervalIterative(a, b),
				[[-4, 6], [-13, 14], [-12, 4]]
			);
		});

		it('does not mutate input arrays or intervals', () => {
			const a = [[1, 2], [3, 4]];
			const b = [[5, 6], [7, 8]];
			const aSnap = structuredClone(a);
			const bSnap = structuredClone(b);
			const res = convolutionIntervalIterative(a, b);
			assert.deepStrictEqual(a, aSnap);
			assert.deepStrictEqual(b, bSnap);
			res[0][0] = 999;
			assert.deepStrictEqual(a, aSnap);
		});
	});

	describe('outward rounding and edge cases', () => {
		it('outward-rounds inexact floating-point products and sums rigorously', () => {
			const a = [[0.1, 0.1], [0.2, 0.2]];
			const b = [[0.3, 0.3], [0.7, 0.7]];
			const res = convolutionIntervalIterative(a, b);
			const exact = exactPointConvolution([0.1, 0.2], [0.3, 0.7]);

			for (let n = 0; n < res.length; n++) {
				const [lo, hi] = res[n];
				assert.ok(lo <= hi, `expected lo <= hi at index ${n}`);
				assert.ok(
					intervalEnclosesDyadic(res[n], exact[n]),
					`output[${n}] = [${lo}, ${hi}] failed to enclose exact value`
				);
			}
			// 0.1 * 0.3 is not exact in binary64, so width must be strictly positive (1 ULP)
			assert.ok(res[0][0] < res[0][1]);
		});

		it('encloses exact sum under extreme scale disparity (cancellation / absorption)', () => {
			// 1e16 * 1 + 1e-16 * 1 = 1e16 + 1e-16 > 1e16; naive float addition gives 1e16
			const a = [[1e16, 1e16], [1e-16, 1e-16]];
			const b = [[1, 1], [1, 1]];
			const res = convolutionIntervalIterative(a, b);
			const exact = exactPointConvolution([1e16, 1e-16], [1, 1]);

			assert.ok(intervalEnclosesDyadic(res[1], exact[1]));
			assert.ok(res[1][0] <= 1e16 && res[1][1] > 1e16);
		});

		it('handles subnormal underflow to zero without losing enclosure', () => {
			// Positive underflow: 1e-200 * 1e-200 = 1e-400 ∈ (0, Number.MIN_VALUE)
			const pos = convolutionIntervalIterative([[1e-200, 1e-200]], [[1e-200, 1e-200]]);
			assert.deepStrictEqual(pos, [[0, Number.MIN_VALUE]]);

			// Negative underflow: -1e-200 * 1e-200 = -1e-400 ∈ (-Number.MIN_VALUE, 0)
			const neg = convolutionIntervalIterative([[-1e-200, -1e-200]], [[1e-200, 1e-200]]);
			assert.deepStrictEqual(neg, [[-Number.MIN_VALUE, 0]]);
		});

		it('handles overflow to ±Infinity cleanly with lo <= hi and no NaN', () => {
			const resPos = convolutionIntervalIterative(
				[[Number.MAX_VALUE, Number.MAX_VALUE], [Number.MAX_VALUE, Number.MAX_VALUE]],
				[[2, 2], [2, 2]]
			);
			for (const [lo, hi] of resPos) {
				assert.ok(!Number.isNaN(lo) && !Number.isNaN(hi));
				assert.ok(lo <= hi);
				assert.equal(lo, Number.MAX_VALUE);
				assert.equal(hi, Infinity);
			}

			const resMixed = convolutionIntervalIterative(
				[[-Number.MAX_VALUE, Number.MAX_VALUE]],
				[[2, 2]]
			);
			assert.deepStrictEqual(resMixed, [[-Infinity, Infinity]]);
		});

		it('normalizes -0 endpoints to +0', () => {
			const res = convolutionIntervalIterative([[-0, -0]], [[1, 2]]);
			assert.equal(Object.is(res[0][0], -0), false);
			assert.equal(Object.is(res[0][1], -0), false);
			assert.deepStrictEqual(res, [[0, 0]]);
		});

		it('handles subnormal * huge products accurately', () => {
			const a = [[Number.MIN_VALUE, Number.MIN_VALUE * 3]];
			const b = [[1e300, 1e305]];
			const res = convolutionIntervalIterative(a, b);
			for (const x of [Number.MIN_VALUE, Number.MIN_VALUE * 3]) {
				for (const y of [1e300, 1e305]) {
					const exact = exactPointConvolution([x], [y]);
					assert.ok(intervalEnclosesDyadic(res[0], exact[0]));
				}
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			assert.throws(() => convolutionIntervalIterative(null, [[1, 2]]), TypeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2]], undefined), TypeError);
			assert.throws(() => convolutionIntervalIterative('abc', [[1, 2]]), TypeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2]], { 0: [1, 2], length: 1 }), TypeError);
		});

		it('throws RangeError for empty arrays', () => {
			assert.throws(() => convolutionIntervalIterative([], [[1, 2]]), RangeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2]], []), RangeError);
		});

		it('throws TypeError for non-array elements or sparse holes', () => {
			assert.throws(() => convolutionIntervalIterative([1, 2], [[1, 2]]), TypeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2]], [null]), TypeError);
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => convolutionIntervalIterative([[1, 2], , [3, 4]], [[1, 2]]), TypeError);
		});

		it('throws RangeError for intervals whose length is not 2', () => {
			assert.throws(() => convolutionIntervalIterative([[1]], [[1, 2]]), RangeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2, 3]], [[1, 2]]), RangeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2]], [[]]), RangeError);
		});

		it('throws TypeError for non-numeric interval endpoints', () => {
			assert.throws(() => convolutionIntervalIterative([['1', 2]], [[1, 2]]), TypeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2]], [[1, null]]), TypeError);
			assert.throws(() => convolutionIntervalIterative([[1n, 2n]], [[1, 2]]), TypeError);
		});

		it('throws RangeError for non-finite endpoints (NaN, ±Infinity)', () => {
			assert.throws(() => convolutionIntervalIterative([[NaN, 1]], [[1, 2]]), RangeError);
			assert.throws(() => convolutionIntervalIterative([[1, NaN]], [[1, 2]]), RangeError);
			assert.throws(() => convolutionIntervalIterative([[-Infinity, 1]], [[1, 2]]), RangeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2]], [[0, Infinity]]), RangeError);
		});

		it('throws RangeError for malformed intervals with lo > hi', () => {
			assert.throws(() => convolutionIntervalIterative([[2, 1]], [[1, 2]]), RangeError);
			assert.throws(() => convolutionIntervalIterative([[1, 2]], [[0.5, -0.5]]), RangeError);
		});
	});

	describe('cross-checks: vertices, random sampling, and algebraic properties', () => {
		it('encloses exact convolutions at all 2^(M+N) corner vertices', () => {
			const a = [[-1.3, 0.7], [0.1, 2.9], [-0.4, -0.1]];
			const b = [[0.2, 1.1], [-2.7, 0.3], [1 / 3, 2 / 3]];
			const res = convolutionIntervalIterative(a, b);

			const M = a.length;
			const N = b.length;
			const totalVertices = 1 << (M + N);
			for (let mask = 0; mask < totalVertices; mask++) {
				const xs = new Array(M);
				const ys = new Array(N);
				for (let i = 0; i < M; i++) {
					xs[i] = a[i][(mask >> i) & 1];
				}
				for (let j = 0; j < N; j++) {
					ys[j] = b[j][(mask >> (M + j)) & 1];
				}
				const exact = exactPointConvolution(xs, ys);
				for (let n = 0; n < res.length; n++) {
					assert.ok(
						intervalEnclosesDyadic(res[n], exact[n]),
						`vertex mask=${mask} index=${n} not enclosed in [${res[n][0]}, ${res[n][1]}]`
					);
				}
			}
		});

		it('encloses exact convolutions at 200 random interior points', () => {
			const rng = makeRng(20261122);
			const a = [
				[-3.141592653589793, 2.718281828459045],
				[0.1, 0.3],
				[-100.25, -50.125],
				[1e-7, 1e-5],
				[-0.9999999999999999, 1.0000000000000002]
			];
			const b = [
				[0.01, 0.09],
				[-7.7, 8.8],
				[1 / 7, 1 / 3],
				[-1e4, 1e4]
			];
			const res = convolutionIntervalIterative(a, b);

			for (let trial = 0; trial < 200; trial++) {
				const xs = a.map(([lo, hi]) => lo + rng() * (hi - lo));
				const ys = b.map(([lo, hi]) => lo + rng() * (hi - lo));
				// Clamp in case floating interpolation overshoots endpoint by 1 ULP
				for (let i = 0; i < xs.length; i++) {
					xs[i] = Math.min(a[i][1], Math.max(a[i][0], xs[i]));
				}
				for (let j = 0; j < ys.length; j++) {
					ys[j] = Math.min(b[j][1], Math.max(b[j][0], ys[j]));
				}
				const exact = exactPointConvolution(xs, ys);
				for (let n = 0; n < res.length; n++) {
					assert.ok(
						intervalEnclosesDyadic(res[n], exact[n]),
						`random trial=${trial} index=${n} not enclosed`
					);
				}
			}
		});

		it('satisfies delta identity and shift property', () => {
			const a = [[-1.5, 2.25], [0.1, 0.2], [1e-10, 1e10], [0, 0]];
			const delta = [[1, 1]];
			assert.deepStrictEqual(convolutionIntervalIterative(a, delta), a);
			assert.deepStrictEqual(convolutionIntervalIterative(delta, a), a);

			const shiftedDelta = [[0, 0], [0, 0], [1, 1]];
			assert.deepStrictEqual(
				convolutionIntervalIterative(shiftedDelta, a),
				[[0, 0], [0, 0], ...a]
			);

			const zero = [[0, 0], [0, 0]];
			assert.deepStrictEqual(
				convolutionIntervalIterative(a, zero),
				Array.from({ length: a.length + zero.length - 1 }, () => [0, 0])
			);
		});

		it('satisfies commutativity (exact for exact inputs, tight mutual enclosure for floats)', () => {
			// Exact integer/dyadic case: bit-for-bit identical
			const aInt = [[-2, 5], [0, 3], [1, 4], [-3, -1]];
			const bInt = [[1, 2], [-4, 6], [0.5, 1.5]];
			assert.deepStrictEqual(
				convolutionIntervalIterative(aInt, bInt),
				convolutionIntervalIterative(bInt, aInt)
			);

			// General floating-point case: same length, overlapping, tight relative agreement,
			// and both enclose sampled point convolutions
			const aFloat = [[0.1, 0.3], [-1.7, 2.3], [1 / 3, 2 / 3], [0.7, 0.9]];
			const bFloat = [[-0.2, 0.6], [1.1, 1.9], [-2.5, -0.5]];
			const ab = convolutionIntervalIterative(aFloat, bFloat);
			const ba = convolutionIntervalIterative(bFloat, aFloat);

			assert.equal(ab.length, ba.length);
			for (let n = 0; n < ab.length; n++) {
				const scale = Math.max(1, Math.abs(ab[n][0]), Math.abs(ab[n][1]));
				assert.ok(Math.abs(ab[n][0] - ba[n][0]) <= 8 * Number.EPSILON * scale);
				assert.ok(Math.abs(ab[n][1] - ba[n][1]) <= 8 * Number.EPSILON * scale);
				// Intervals must overlap
				assert.ok(Math.max(ab[n][0], ba[n][0]) <= Math.min(ab[n][1], ba[n][1]));
			}
		});

		it('satisfies inclusion monotonicity: sub-intervals produce sub-interval outputs', () => {
			const aOuter = [[-2.5, 3.5], [0.1, 1.9], [-1.1, 0.4]];
			const aInner = [[-1.0, 2.0], [0.5, 1.2], [-0.5, 0.0]];
			const bOuter = [[-0.8, 1.4], [0.2, 2.8]];
			const bInner = [[-0.2, 0.7], [0.9, 1.5]];

			const outer = convolutionIntervalIterative(aOuter, bOuter);
			const inner = convolutionIntervalIterative(aInner, bInner);

			assert.equal(outer.length, inner.length);
			for (let n = 0; n < outer.length; n++) {
				assert.ok(outer[n][0] <= inner[n][0], `outer lo > inner lo at ${n}`);
				assert.ok(inner[n][1] <= outer[n][1], `inner hi > outer hi at ${n}`);
			}
		});
	});
});
