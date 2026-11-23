import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { matMulIntervalSeries } from './matMulIntervalSeries.js';

/**
 * Exact IEEE 754 binary64 -> dyadic rational { num: BigInt, exp: number } decoder
 * representing `num * 2^exp` with zero rounding error.
 * Used as an independent exact oracle to verify mathematical enclosure.
 */
const f64Buf = new Float64Array(1);
const u64Buf = new BigUint64Array(f64Buf.buffer);

function floatToDyadic(x) {
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected finite float, got ${x}`);
	}
	if (x === 0) return { num: 0n, exp: 0 };
	f64Buf[0] = x;
	const bits = u64Buf[0];
	const sign = (bits >> 63n) === 1n ? -1n : 1n;
	const rawExp = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & ((1n << 52n) - 1n);
	if (rawExp === 0) {
		// Subnormal: (-1)^sign * frac * 2^(-1074)
		return { num: sign * frac, exp: -1074 };
	}
	// Normal: (-1)^sign * (2^52 + frac) * 2^(rawExp - 1023 - 52)
	return { num: sign * ((1n << 52n) + frac), exp: rawExp - 1075 };
}

function dyadicAdd(a, b) {
	if (a.num === 0n) return b;
	if (b.num === 0n) return a;
	if (a.exp === b.exp) return { num: a.num + b.num, exp: a.exp };
	if (a.exp > b.exp) {
		return { num: (a.num << BigInt(a.exp - b.exp)) + b.num, exp: b.exp };
	}
	return { num: a.num + (b.num << BigInt(b.exp - a.exp)), exp: a.exp };
}

function dyadicMul(a, b) {
	if (a.num === 0n || b.num === 0n) return { num: 0n, exp: 0 };
	return { num: a.num * b.num, exp: a.exp + b.exp };
}

function dyadicCompare(a, b) {
	const diff = dyadicAdd(a, { num: -b.num, exp: b.exp });
	if (diff.num < 0n) return -1;
	if (diff.num > 0n) return 1;
	return 0;
}

/**
 * Checks exact mathematical inclusion `lo <= exactVal <= hi`, supporting infinite bounds.
 */
function assertEnclosesExact(interval, exactVal, context = '') {
	const [lo, hi] = interval;
	assert.ok(lo <= hi, `${context}: inverted result [${lo}, ${hi}]`);
	if (lo !== -Infinity) {
		const cmpLo = dyadicCompare(floatToDyadic(lo), exactVal);
		assert.ok(
			cmpLo <= 0,
			`${context}: lower bound ${lo} exceeds exact value`
		);
	}
	if (hi !== Infinity) {
		const cmpHi = dyadicCompare(exactVal, floatToDyadic(hi));
		assert.ok(
			cmpHi <= 0,
			`${context}: upper bound ${hi} is below exact value`
		);
	}
}

/**
 * Exact real matrix multiplication of two scalar float matrices using BigInt dyadics.
 */
function exactScalarMatMul(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const C = [];
	for (let i = 0; i < m; i++) {
		const row = [];
		for (let j = 0; j < n; j++) {
			let acc = { num: 0n, exp: 0 };
			for (let p = 0; p < k; p++) {
				acc = dyadicAdd(
					acc,
					dyadicMul(floatToDyadic(A[i][p]), floatToDyadic(B[p][j]))
				);
			}
			row.push(acc);
		}
		C.push(row);
	}
	return C;
}

/** Deterministic xorshift32 PRNG for reproducible sampling tests. */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

describe('matMulIntervalSeries', () => {
	test('exact point integer matrices produce exact zero-width intervals', () => {
		const A = [
			[[1, 1], [2, 2], [3, 3]],
			[[4, 4], [5, 5], [6, 6]],
		];
		const B = [
			[[7, 7], [8, 8]],
			[[9, 9], [10, 10]],
			[[11, 11], [12, 12]],
		];
		const C = matMulIntervalSeries(A, B);
		assert.deepStrictEqual(C, [
			[[58, 58], [64, 64]],
			[[139, 139], [154, 154]],
		]);
	});

	test('identity and zero matrix identities', () => {
		const M = [
			[[-2, 3], [0, 5]],
			[[-7, -1], [4, 4]],
		];
		const I = [
			[[1, 1], [0, 0]],
			[[0, 0], [1, 1]],
		];
		const Z = [
			[[0, 0], [0, 0]],
			[[0, 0], [0, 0]],
		];

		assert.deepStrictEqual(matMulIntervalSeries(I, M), M);
		assert.deepStrictEqual(matMulIntervalSeries(M, I), M);
		const MZ = matMulIntervalSeries(M, Z);
		assert.deepStrictEqual(MZ, [
			[[0, 0], [0, 0]],
			[[0, 0], [0, 0]],
		]);
		// Ensure no -0 endpoints
		for (const row of MZ) {
			for (const [lo, hi] of row) {
				assert.ok(!Object.is(lo, -0));
				assert.ok(!Object.is(hi, -0));
			}
		}
	});

	test('all 9 sign cases of 1x1 interval multiplication match exact closed form', () => {
		const intervals = [
			[2, 5],     // positive: lo >= 0
			[-6, -3],   // negative: hi <= 0
			[-4, 7],    // straddling zero: lo < 0 < hi
		];
		for (const a of intervals) {
			for (const b of intervals) {
				const [[res]] = matMulIntervalSeries([[a]], [[b]]);
				const corners = [
					a[0] * b[0],
					a[0] * b[1],
					a[1] * b[0],
					a[1] * b[1],
				];
				assert.deepStrictEqual(res, [Math.min(...corners), Math.max(...corners)]);
			}
		}
	});

	test('rectangular shapes: 1x4 * 4x1 (dot product) and 3x1 * 1x3 (outer product)', () => {
		const rowVec = [[[1, 2], [-3, -1], [0, 4], [-2, 2]]];
		const colVec = [[[2, 3]], [[-1, 2]], [[1, 1]], [[-3, 1]]];
		// Termwise products:
		// [1,2]*[2,3] = [2, 6]
		// [-3,-1]*[-1,2] = [-6, 3]
		// [0,4]*[1,1] = [0, 4]
		// [-2,2]*[-3,1] = [-6, 6]
		// Sum = [-10, 19]
		assert.deepStrictEqual(matMulIntervalSeries(rowVec, colVec), [[[-10, 19]]]);

		const u = [[[-1, 2]], [[3, 3]], [[0, 0]]];
		const v = [[[2, 4], [-5, -1], [0, 1]]];
		assert.deepStrictEqual(matMulIntervalSeries(u, v), [
			[[-4, 8], [-10, 5], [-1, 2]],
			[[6, 12], [-15, -3], [0, 3]],
			[[0, 0], [0, 0], [0, 0]],
		]);
	});

	test('outward rounding strictly encloses non-exact binary64 products and sums', () => {
		// 0.1 * 0.2 is inexact in IEEE 754 binary64
		const [[prod]] = matMulIntervalSeries([[[0.1, 0.1]]], [[[0.2, 0.2]]]);
		const exactProd = dyadicMul(floatToDyadic(0.1), floatToDyadic(0.2));
		assertEnclosesExact(prod, exactProd, '0.1 * 0.2');
		assert.ok(prod[0] < prod[1], 'inexact product should have nonzero width');

		// 1 + 2^-54 is strictly between 1 and 1 + EPSILON
		const tiny = Number.EPSILON / 4;
		const [[sumRes]] = matMulIntervalSeries(
			[[[1, 1], [tiny, tiny]]],
			[[[1, 1]], [[1, 1]]]
		);
		const exactSum = dyadicAdd(floatToDyadic(1), floatToDyadic(tiny));
		assertEnclosesExact(sumRes, exactSum, '1 + 2^-54');
		assert.equal(sumRes[0], 1);
		assert.equal(sumRes[1], 1 + Number.EPSILON);
	});

	test('TwoSum-compensated series accumulation preserves sharpness under catastrophic cancellation', () => {
		const A = [[[1e16, 1e16], [1, 1], [-1e16, -1e16]]];
		const B = [[[1, 1]], [[1, 1]], [[1, 1]]];
		const [[res]] = matMulIntervalSeries(A, B);
		assert.deepStrictEqual(res, [1, 1]);
	});

	test('handles subnormal underflow and overflow boundaries with guaranteed enclosure', () => {
		// Positive underflow: 1e-200 * 1e-200 = 1e-400 in (0, Number.MIN_VALUE)
		const [[posUnder]] = matMulIntervalSeries([[[1e-200, 1e-200]]], [[[1e-200, 1e-200]]]);
		assert.deepStrictEqual(posUnder, [0, Number.MIN_VALUE]);

		// Negative underflow: -1e-200 * 1e-200 = -1e-400 in (-Number.MIN_VALUE, 0)
		const [[negUnder]] = matMulIntervalSeries([[[-1e-200, -1e-200]]], [[[1e-200, 1e-200]]]);
		assert.deepStrictEqual(negUnder, [-Number.MIN_VALUE, 0]);

		// Positive overflow: 1e200 * 1e200 = 1e400 > Number.MAX_VALUE
		const [[posOver]] = matMulIntervalSeries([[[1e200, 1e200]]], [[[1e200, 1e200]]]);
		assert.deepStrictEqual(posOver, [Number.MAX_VALUE, Infinity]);

		// Negative overflow: -1e200 * 1e200 = -1e400 < -Number.MAX_VALUE
		const [[negOver]] = matMulIntervalSeries([[[-1e200, -1e200]]], [[[1e200, 1e200]]]);
		assert.deepStrictEqual(negOver, [-Infinity, -Number.MAX_VALUE]);

		// Large operands outside Dekker TwoProd threshold whose product is finite (1e300 * 1e-300 = 1)
		const [[extremeCancel]] = matMulIntervalSeries([[[1e300, 1e300]]], [[[1e-300, 1e-300]]]);
		const exactExtreme = dyadicMul(floatToDyadic(1e300), floatToDyadic(1e-300));
		assertEnclosesExact(extremeCancel, exactExtreme, '1e300 * 1e-300');
	});

	test('does not mutate inputs and satisfies inclusion monotonicity', () => {
		const A1 = [
			[[0.2, 0.3], [-0.4, -0.1]],
			[[1.1, 1.2], [-0.2, 0.2]],
		];
		const B1 = [
			[[-0.5, 0.5], [0.7, 0.8]],
			[[0.1, 0.4], [-1.3, -1.1]],
		];
		const A1Copy = structuredClone(A1);
		const B1Copy = structuredClone(B1);

		// Wider intervals A2 supset A1, B2 supset B1
		const A2 = A1.map((row) => row.map(([lo, hi]) => [lo - 0.1, hi + 0.1]));
		const B2 = B1.map((row) => row.map(([lo, hi]) => [lo - 0.1, hi + 0.1]));

		const C1 = matMulIntervalSeries(A1, B1);
		const C2 = matMulIntervalSeries(A2, B2);

		assert.deepStrictEqual(A1, A1Copy);
		assert.deepStrictEqual(B1, B1Copy);

		for (let i = 0; i < C1.length; i++) {
			for (let j = 0; j < C1[0].length; j++) {
				assert.ok(C2[i][j][0] <= C1[i][j][0], `C2 lo <= C1 lo at (${i},${j})`);
				assert.ok(C1[i][j][1] <= C2[i][j][1], `C1 hi <= C2 hi at (${i},${j})`);
			}
		}
	});

	test('independent cross-check: exact BigInt dyadic sampling verifies enclosure across 250 samples', () => {
		const rng = makeRng(0x5eed1234);

		const shapes = [
			[2, 3, 2],
			[3, 4, 3],
			[4, 5, 2],
		];

		for (const [m, k, n] of shapes) {
			const A = Array.from({ length: m }, () =>
				Array.from({ length: k }, () => {
					const x = (rng() - 0.5) * 20;
					const w = rng() * 5;
					return [x, x + w];
				})
			);
			const B = Array.from({ length: k }, () =>
				Array.from({ length: n }, () => {
					const x = (rng() - 0.5) * 20;
					const w = rng() * 5;
					return [x, x + w];
				})
			);

			const C = matMulIntervalSeries(A, B);
			assert.equal(C.length, m);
			assert.equal(C[0].length, n);

			// Sample corners (t=0, t=1) and random interior points
			for (let s = 0; s < 85; s++) {
				const sampleA = A.map((row) =>
					row.map(([lo, hi]) => {
						if (s === 0) return lo;
						if (s === 1) return hi;
						const t = rng();
						const val = lo + t * (hi - lo);
						return Math.min(hi, Math.max(lo, val));
					})
				);
				const sampleB = B.map((row) =>
					row.map(([lo, hi]) => {
						if (s === 0) return lo;
						if (s === 1) return hi;
						const t = rng();
						const val = lo + t * (hi - lo);
						return Math.min(hi, Math.max(lo, val));
					})
				);

				const exactC = exactScalarMatMul(sampleA, sampleB);
				for (let i = 0; i < m; i++) {
					for (let j = 0; j < n; j++) {
						assertEnclosesExact(
							C[i][j],
							exactC[i][j],
							`shape ${m}x${k}x${n} sample ${s} cell (${i},${j})`
						);
					}
				}
			}
		}
	});

	test('independent cross-check: sharper than Rump midpoint-radius enclosure on [0, 1] * [0, 1]', () => {
		const A = [[[0, 1]]];
		const B = [[[0, 1]]];
		const [[res]] = matMulIntervalSeries(A, B);
		// Exact closed-form product is [0, 1]; midpoint-radius identity gives [-0.5, 1.0]
		assert.deepStrictEqual(res, [0, 1]);
	});

	test('input validation rejects malformed matrices, bad dimensions, non-finite and inverted intervals', () => {
		const valid1x1 = [[[0, 1]]];

		// Non-array matrices
		assert.throws(() => matMulIntervalSeries(null, valid1x1), TypeError);
		assert.throws(() => matMulIntervalSeries(valid1x1, undefined), TypeError);
		assert.throws(() => matMulIntervalSeries('bad', valid1x1), TypeError);
		assert.throws(() => matMulIntervalSeries({}, valid1x1), TypeError);

		// Empty matrices and empty rows
		assert.throws(() => matMulIntervalSeries([], valid1x1), RangeError);
		assert.throws(() => matMulIntervalSeries(valid1x1, []), RangeError);
		assert.throws(() => matMulIntervalSeries([[]], valid1x1), RangeError);
		assert.throws(() => matMulIntervalSeries(valid1x1, [[]]), RangeError);

		// Non-array rows and ragged rows
		assert.throws(() => matMulIntervalSeries([123], valid1x1), TypeError);
		assert.throws(
			() => matMulIntervalSeries([[[0, 1]], [[0, 1], [1, 2]]], valid1x1),
			RangeError
		);
		assert.throws(
			() => matMulIntervalSeries(valid1x1, [[[0, 1], [1, 2]], [[0, 1]]]),
			RangeError
		);

		// Dimension mismatch (1x2 * 1x1)
		assert.throws(
			() => matMulIntervalSeries([[[0, 1], [2, 3]]], valid1x1),
			RangeError
		);

		// Invalid cell structures
		assert.throws(() => matMulIntervalSeries([[1]], valid1x1), TypeError);
		assert.throws(() => matMulIntervalSeries([[[1]]], valid1x1), TypeError);
		assert.throws(() => matMulIntervalSeries([[[1, 2, 3]]], valid1x1), TypeError);
		assert.throws(() => matMulIntervalSeries([[['0', 1]]], valid1x1), TypeError);
		assert.throws(() => matMulIntervalSeries([[[0, null]]], valid1x1), TypeError);

		// Non-finite endpoints
		assert.throws(() => matMulIntervalSeries([[[NaN, 1]]], valid1x1), RangeError);
		assert.throws(() => matMulIntervalSeries([[[0, NaN]]], valid1x1), RangeError);
		assert.throws(() => matMulIntervalSeries([[[-Infinity, 1]]], valid1x1), RangeError);
		assert.throws(() => matMulIntervalSeries([[[0, Infinity]]], valid1x1), RangeError);

		// Inverted intervals
		assert.throws(() => matMulIntervalSeries([[[2, 1]]], valid1x1), RangeError);
		assert.throws(() => matMulIntervalSeries(valid1x1, [[[-1, -2]]]), RangeError);
	});
});
