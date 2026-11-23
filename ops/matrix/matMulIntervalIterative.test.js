import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulIntervalIterative } from './matMulIntervalIterative.js';

// --- Exact BigInt binary64 rational helpers for independent verification ---

const _buf = new ArrayBuffer(8);
const _f64 = new Float64Array(_buf);
const _u64 = new BigUint64Array(_buf);

/**
 * Converts a finite IEEE-754 float to its exact dyadic rational `{ num, exp }`
 * representing `num * 2^exp`.
 */
function floatToExactDyadic(x) {
	if (!Number.isFinite(x)) {
		throw new Error(`Expected finite float, got ${x}`);
	}
	if (x === 0) return { num: 0n, exp: 0 };
	_f64[0] = x;
	const bits = _u64[0];
	const sign = bits >> 63n ? -1n : 1n;
	const biasedExp = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & 0xfffffffffffffn;
	if (biasedExp === 0) {
		return { num: sign * frac, exp: -1074 };
	}
	return { num: sign * ((1n << 52n) | frac), exp: biasedExp - 1075 };
}

function addDyadic(a, b) {
	if (a.num === 0n) return b;
	if (b.num === 0n) return a;
	if (a.exp >= b.exp) {
		return { num: (a.num << BigInt(a.exp - b.exp)) + b.num, exp: b.exp };
	}
	return { num: a.num + (b.num << BigInt(b.exp - a.exp)), exp: a.exp };
}

function mulDyadic(a, b) {
	if (a.num === 0n || b.num === 0n) return { num: 0n, exp: 0 };
	return { num: a.num * b.num, exp: a.exp + b.exp };
}

/**
 * Compares exact dyadic `d` against float `f` (supporting `±Infinity`).
 * Returns -1 if d < f, 0 if d == f, 1 if d > f.
 */
function cmpDyadicFloat(d, f) {
	if (f === Infinity) return -1;
	if (f === -Infinity) return 1;
	const df = floatToExactDyadic(f);
	if (d.num === 0n && df.num === 0n) return 0;
	const minExp = Math.min(d.exp, df.exp);
	const lhs = d.num << BigInt(d.exp - minExp);
	const rhs = df.num << BigInt(df.exp - minExp);
	return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

/** Exact real scalar matrix product in dyadic BigInt arithmetic. */
function exactScalarMatMul(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const C = Array.from({ length: m }, () => new Array(n));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = { num: 0n, exp: 0 };
			for (let t = 0; t < k; t++) {
				sum = addDyadic(
					sum,
					mulDyadic(floatToExactDyadic(A[i][t]), floatToExactDyadic(B[t][j]))
				);
			}
			C[i][j] = sum;
		}
	}
	return C;
}

/** Asserts that every entry of exact scalar product `exactC` lies inside `intervalC`. */
function assertEnclosesExact(intervalC, exactC, context = '') {
	assert.equal(intervalC.length, exactC.length);
	for (let i = 0; i < intervalC.length; i++) {
		assert.equal(intervalC[i].length, exactC[i].length);
		for (let j = 0; j < intervalC[i].length; j++) {
			const [lo, hi] = intervalC[i][j];
			assert.ok(lo <= hi, `${context}[${i}][${j}]: lo (${lo}) > hi (${hi})`);
			assert.ok(
				cmpDyadicFloat(exactC[i][j], lo) >= 0,
				`${context}[${i}][${j}]: exact value below lower bound ${lo}`
			);
			assert.ok(
				cmpDyadicFloat(exactC[i][j], hi) <= 0,
				`${context}[${i}][${j}]: exact value above upper bound ${hi}`
			);
		}
	}
}

/** Deterministic PRNG (Mulberry32) for reproducible sampling tests. */
function mulberry32(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Helper for nextUp in tests to verify ULP tightness. */
function testNextUp(x) {
	if (x === 0) return Number.MIN_VALUE;
	_f64[0] = x;
	_u64[0] = x > 0 ? _u64[0] + 1n : _u64[0] - 1n;
	return _f64[0] === 0 ? 0 : _f64[0];
}

function testNextDown(x) {
	return -testNextUp(-x) === 0 ? 0 : -testNextUp(-x);
}

describe('matMulIntervalIterative', () => {
	describe('normal cases (square and rectangular)', () => {
		it('multiplies exact 2x2 point-interval matrices with zero spurious widening', () => {
			const A = [
				[[1, 1], [2, 2]],
				[[3, 3], [4, 4]]
			];
			const B = [
				[[5, 5], [6, 6]],
				[[7, 7], [8, 8]]
			];
			assert.deepEqual(matMulIntervalIterative(A, B), [
				[[19, 19], [22, 22]],
				[[43, 43], [50, 50]]
			]);
		});

		it('multiplies non-degenerate 2x2 positive interval matrices', () => {
			const A = [
				[[1, 2], [3, 4]],
				[[5, 6], [7, 8]]
			];
			const B = [
				[[1, 1], [0, 2]],
				[[2, 3], [1, 1]]
			];
			// C[0][0] = [1,2]*[1,1] + [3,4]*[2,3] = [1,2] + [6,12] = [7,14]
			// C[0][1] = [1,2]*[0,2] + [3,4]*[1,1] = [0,4] + [3,4] = [3,8]
			// C[1][0] = [5,6]*[1,1] + [7,8]*[2,3] = [5,6] + [14,24] = [19,30]
			// C[1][1] = [5,6]*[0,2] + [7,8]*[1,1] = [0,12] + [7,8] = [7,20]
			assert.deepEqual(matMulIntervalIterative(A, B), [
				[[7, 14], [3, 8]],
				[[19, 30], [7, 20]]
			]);
		});

		it('multiplies rectangular 2x3 and 3x2 interval matrices', () => {
			const A = [
				[[1, 2], [-1, 1], [0, 3]],
				[[-2, -1], [2, 4], [1, 2]]
			];
			const B = [
				[[2, 3], [-1, 0]],
				[[0, 2], [1, 3]],
				[[-2, 1], [2, 2]]
			];
			// C[0][0] = [1,2]*[2,3] + [-1,1]*[0,2] + [0,3]*[-2,1] = [2,6] + [-2,2] + [-6,3] = [-6,11]
			// C[0][1] = [1,2]*[-1,0] + [-1,1]*[1,3] + [0,3]*[2,2] = [-2,0] + [-3,3] + [0,6] = [-5,9]
			// C[1][0] = [-2,-1]*[2,3] + [2,4]*[0,2] + [1,2]*[-2,1] = [-6,-2] + [0,8] + [-4,2] = [-10,8]
			// C[1][1] = [-2,-1]*[-1,0] + [2,4]*[1,3] + [1,2]*[2,2] = [0,2] + [2,12] + [2,4] = [4,18]
			assert.deepEqual(matMulIntervalIterative(A, B), [
				[[-6, 11], [-5, 9]],
				[[-10, 8], [4, 18]]
			]);
		});

		it('multiplies row vector (1x3) by column vector (3x1) and outer product (3x1 * 1x2)', () => {
			const row = [[[1, 2], [-3, 1], [4, 5]]];
			const col = [[[-1, 2]], [[2, 3]], [[0, 1]]];
			// [1,2]*[-1,2] + [-3,1]*[2,3] + [4,5]*[0,1] = [-2,4] + [-9,3] + [0,5] = [-11,12]
			assert.deepEqual(matMulIntervalIterative(row, col), [[[-11, 12]]]);

			const left = [[[1, 2]], [[-3, -1]], [[0, 0]]];
			const right = [[[2, 4], [-2, 3]]];
			assert.deepEqual(matMulIntervalIterative(left, right), [
				[[2, 8], [-4, 6]],
				[[-12, -2], [-9, 6]],
				[[0, 0], [0, 0]]
			]);
		});
	});

	describe('edge cases', () => {
		it('handles 1x1 interval matrices including sign-straddling and zero', () => {
			assert.deepEqual(matMulIntervalIterative([[[-2, 3]]], [[[-4, 5]]]), [[[-12, 15]]]);
			assert.deepEqual(matMulIntervalIterative([[[-5, -2]]], [[[-3, -1]]]), [[[2, 15]]]);
			assert.deepEqual(matMulIntervalIterative([[[0, 0]]], [[[-100, 100]]]), [[[0, 0]]]);
			const zeroRes = matMulIntervalIterative([[[-0, -0]]], [[[5, 5]]]);
			assert.equal(Object.is(zeroRes[0][0][0], 0), true);
			assert.equal(Object.is(zeroRes[0][0][1], 0), true);
		});

		it('preserves interval matrix when multiplied by the identity matrix (left and right)', () => {
			const I3 = [
				[[1, 1], [0, 0], [0, 0]],
				[[0, 0], [1, 1], [0, 0]],
				[[0, 0], [0, 0], [1, 1]]
			];
			const M = [
				[[-1.5, 2.25], [0, 0.5], [-4, -1]],
				[[0.125, 0.25], [-0.5, 0.5], [3, 7]],
				[[-8, 8], [1, 1], [0, 0]]
			];
			assert.deepEqual(matMulIntervalIterative(I3, M), M);
			assert.deepEqual(matMulIntervalIterative(M, I3), M);
		});

		it('produces all [0, 0] when multiplied by a zero matrix', () => {
			const A = [
				[[-10, 20], [0.1, 0.3]],
				[[-1e100, 1e100], [-0.5, 0.5]]
			];
			const Z = [
				[[0, 0], [0, 0]],
				[[0, 0], [0, 0]]
			];
			assert.deepEqual(matMulIntervalIterative(A, Z), Z);
			assert.deepEqual(matMulIntervalIterative(Z, A), Z);
		});

		it('handles sign-straddling intervals in multi-term dot products', () => {
			const A = [
				[[-3, 2], [-5, 4]],
				[[-1, 1], [-2, 2]]
			];
			const B = [
				[[-4, 6], [-2, 1]],
				[[-3, 2], [-1, 5]]
			];
			// C[0][0] = [-3,2]*[-4,6] + [-5,4]*[-3,2] = [-18,12] + [-12,15] = [-30,27]
			// C[0][1] = [-3,2]*[-2,1] + [-5,4]*[-1,5] = [-4,6] + [-25,20] = [-29,26]
			// C[1][0] = [-1,1]*[-4,6] + [-2,2]*[-3,2] = [-6,6] + [-6,6] = [-12,12]
			// C[1][1] = [-1,1]*[-2,1] + [-2,2]*[-1,5] = [-2,2] + [-10,10] = [-12,12]
			assert.deepEqual(matMulIntervalIterative(A, B), [
				[[-30, 27], [-29, 26]],
				[[-12, 12], [-12, 12]]
			]);
		});

		it('does not mutate inputs or alias output intervals to input intervals', () => {
			const A = [[[1, 2]]];
			const B = [[[1, 1]]];
			const C = matMulIntervalIterative(A, B);
			assert.deepEqual(C, [[[1, 2]]]);
			assert.notEqual(C[0][0], A[0][0]);
			C[0][0][0] = 999;
			assert.deepEqual(A, [[[1, 2]]]);
			assert.deepEqual(B, [[[1, 1]]]);
		});

		it('handles subnormal underflow and overflow with guaranteed outward enclosure', () => {
			// Positive underflow to zero: 1e-200 * 1e-200 = 1e-400 in (0, MIN_VALUE)
			const posUnder = matMulIntervalIterative([[[1e-200, 1e-200]]], [[[1e-200, 1e-200]]]);
			assert.deepEqual(posUnder, [[[0, Number.MIN_VALUE]]]);

			// Negative underflow to zero: -1e-200 * 1e-200 in (-MIN_VALUE, 0)
			const negUnder = matMulIntervalIterative([[[-1e-200, -1e-200]]], [[[1e-200, 1e-200]]]);
			assert.deepEqual(negUnder, [[[-Number.MIN_VALUE, 0]]]);

			// Subnormal exact vs inexact multiplication: MIN_VALUE * 1.5 = 1.5 * MIN_VALUE
			const subInexact = matMulIntervalIterative(
				[[[Number.MIN_VALUE, Number.MIN_VALUE]]],
				[[[1.5, 1.5]]]
			);
			assert.deepEqual(subInexact, [[[Number.MIN_VALUE, 2 * Number.MIN_VALUE]]]);

			// Positive overflow: 1e200 * 1e200 > MAX_VALUE
			const posOver = matMulIntervalIterative([[[1e200, 1e200]]], [[[1e200, 1e200]]]);
			assert.deepEqual(posOver, [[[Number.MAX_VALUE, Infinity]]]);

			// Negative overflow: -1e200 * 1e200 < -MAX_VALUE
			const negOver = matMulIntervalIterative([[[-1e200, -1e200]]], [[[1e200, 1e200]]]);
			assert.deepEqual(negOver, [[[-Infinity, -Number.MAX_VALUE]]]);

			// Multi-term sum overflow without producing NaN
			const sumOver = matMulIntervalIterative(
				[[[Number.MAX_VALUE, Number.MAX_VALUE], [Number.MAX_VALUE, Number.MAX_VALUE]]],
				[[[1, 1]], [[1, 1]]]
			);
			assert.deepEqual(sumOver, [[[Number.MAX_VALUE, Infinity]]]);

			// Opposite-sign overflow terms remain valid enclosure (no NaN)
			const oppOver = matMulIntervalIterative(
				[[[-1e200, 1e200], [1e200, 1e200]]],
				[[[1e200, 1e200]], [[-1e200, 1e200]]]
			);
			assert.deepEqual(oppOver, [[[-Infinity, Infinity]]]);
		});
	});

	describe('invalid inputs', () => {
		it('rejects incompatible dimensions', () => {
			const A = [
				[[1, 1], [2, 2], [3, 3]],
				[[4, 4], [5, 5], [6, 6]]
			];
			const B = [
				[[1, 1], [2, 2]],
				[[3, 3], [4, 4]]
			];
			assert.throws(() => matMulIntervalIterative(A, B), RangeError);
		});

		it('rejects ragged rows in A or B', () => {
			const ragged = [
				[[1, 2], [3, 4]],
				[[5, 6]]
			];
			const valid = [
				[[1, 1]],
				[[1, 1]]
			];
			assert.throws(() => matMulIntervalIterative(ragged, valid), RangeError);
			assert.throws(() => matMulIntervalIterative([[[1, 1], [2, 2]]], ragged), RangeError);
		});

		it('rejects empty matrices and empty rows', () => {
			const valid = [[[1, 1]]];
			assert.throws(() => matMulIntervalIterative([], valid), RangeError);
			assert.throws(() => matMulIntervalIterative(valid, []), RangeError);
			assert.throws(() => matMulIntervalIterative([[]], valid), RangeError);
			assert.throws(() => matMulIntervalIterative(valid, [[]]), RangeError);
		});

		it('rejects non-array matrices, rows, and intervals', () => {
			const valid = [[[1, 1]]];
			for (const bad of [null, undefined, 42, 'matrix', {}, new Float64Array(1)]) {
				assert.throws(() => matMulIntervalIterative(bad, valid), TypeError);
				assert.throws(() => matMulIntervalIterative(valid, bad), TypeError);
			}
			assert.throws(() => matMulIntervalIterative([null], valid), TypeError);
			assert.throws(() => matMulIntervalIterative([[1]], valid), TypeError);
			assert.throws(() => matMulIntervalIterative([[[1]]], valid), TypeError);
			assert.throws(() => matMulIntervalIterative([[[1, 2, 3]]], valid), TypeError);
			assert.throws(() => matMulIntervalIterative([[['1', '2']]], valid), TypeError);
			assert.throws(() => matMulIntervalIterative([[[1, null]]], valid), TypeError);
			assert.throws(() => matMulIntervalIterative([[[1n, 2n]]], valid), TypeError);
		});

		it('rejects non-finite bounds and inverted intervals (lo > hi)', () => {
			const valid = [[[1, 1]]];
			assert.throws(() => matMulIntervalIterative([[[NaN, 1]]], valid), RangeError);
			assert.throws(() => matMulIntervalIterative([[[0, NaN]]], valid), RangeError);
			assert.throws(() => matMulIntervalIterative([[[-Infinity, 1]]], valid), RangeError);
			assert.throws(() => matMulIntervalIterative([[[0, Infinity]]], valid), RangeError);
			assert.throws(() => matMulIntervalIterative([[[2, 1]]], valid), RangeError);
			assert.throws(() => matMulIntervalIterative(valid, [[[1e-15, 0]]]), RangeError);
		});
	});

	describe('outward-rounding enclosure checks', () => {
		it('encloses inexact addition 1 + 1e-20 and 1 - 1e-20 tightly to 1 ULP', () => {
			const pos = matMulIntervalIterative(
				[[[1, 1], [1e-20, 1e-20]]],
				[[[1, 1]], [[1, 1]]]
			);
			assert.equal(pos[0][0][0], 1);
			assert.equal(pos[0][0][1], testNextUp(1));
			assertEnclosesExact(pos, exactScalarMatMul([[1, 1e-20]], [[1], [1]]));

			const neg = matMulIntervalIterative(
				[[[1, 1], [-1e-20, -1e-20]]],
				[[[1, 1]], [[1, 1]]]
			);
			assert.equal(neg[0][0][0], testNextDown(1));
			assert.equal(neg[0][0][1], 1);
			assertEnclosesExact(neg, exactScalarMatMul([[1, -1e-20]], [[1], [1]]));
		});

		it('encloses classic non-dyadic binary64 operations (0.1 * 0.2, 0.1 + 0.2, 1/3 * 3)', () => {
			// 0.1 * 0.2
			const prod = matMulIntervalIterative([[[0.1, 0.1]]], [[[0.2, 0.2]]]);
			const [pLo, pHi] = prod[0][0];
			assert.equal(pHi, testNextUp(pLo), 'single inexact product should be 1 ULP wide');
			assertEnclosesExact(prod, exactScalarMatMul([[0.1]], [[0.2]]));

			// 0.1 + 0.2
			const sum = matMulIntervalIterative([[[0.1, 0.1], [0.2, 0.2]]], [[[1, 1]], [[1, 1]]]);
			const [sLo, sHi] = sum[0][0];
			assert.equal(sLo, 0.3);
			assert.equal(sHi, 0.30000000000000004);
			assertEnclosesExact(sum, exactScalarMatMul([[0.1, 0.2]], [[1], [1]]));

			// (1/3) * 3: binary64 1/3 is strictly less than mathematical 1/3,
			// but exact float(1/3) * 3 is exact in binary64? Let's verify exact enclosure!
			const third = 1 / 3;
			const r3 = matMulIntervalIterative([[[third, third]]], [[[3, 3]]]);
			assertEnclosesExact(r3, exactScalarMatMul([[third]], [[3]]));

			// High-precision cancellation: 1e16 + 1 - 1e16 + 0.1
			const cancel = matMulIntervalIterative(
				[[[1e16, 1e16], [1, 1], [-1e16, -1e16], [0.1, 0.1]]],
				[[[1, 1]], [[1, 1]], [[1, 1]], [[1, 1]]]
			);
			assertEnclosesExact(
				cancel,
				exactScalarMatMul([[1e16, 1, -1e16, 0.1]], [[1], [1], [1], [1]])
			);
		});

		it('encloses exact products near large exponent boundary (BigInt fallback path)', () => {
			const a = 2 ** 1000 + 2 ** 950;
			const b = 1 + 2 ** -50;
			const res = matMulIntervalIterative([[[a, a]]], [[[b, b]]]);
			const [lo, hi] = res[0][0];
			assert.equal(hi, testNextUp(lo));
			assertEnclosesExact(res, exactScalarMatMul([[a]], [[b]]));
		});
	});

	describe('independent cross-checks', () => {
		it('encloses 200 random scalar samples (interior and corners) for rectangular interval matrices', () => {
			const rand = mulberry32(20261123);

			const shapes = [
				[3, 4, 2],
				[4, 3, 5],
				[2, 5, 3]
			];

			for (const [m, k, n] of shapes) {
				const makeIntervalMatrix = (rows, cols) =>
					Array.from({ length: rows }, () =>
						Array.from({ length: cols }, () => {
							const center = (rand() - 0.5) * 20;
							const halfWidth = rand() * 5;
							const lo = center - halfWidth;
							const hi = center + halfWidth;
							return [Math.min(lo, hi), Math.max(lo, hi)];
						})
					);

				const A = makeIntervalMatrix(m, k);
				const B = makeIntervalMatrix(k, n);
				const C = matMulIntervalIterative(A, B);

				assert.equal(C.length, m);
				assert.equal(C[0].length, n);

				for (let sample = 0; sample < 200; sample++) {
					const useCorners = sample < 50;
					const sampleScalar = (M) =>
						M.map((row) =>
							row.map(([lo, hi]) => {
								if (useCorners) return rand() < 0.5 ? lo : hi;
								const t = rand();
								const v = lo + t * (hi - lo);
								return Math.min(hi, Math.max(lo, v));
							})
						);

					const As = sampleScalar(A);
					const Bs = sampleScalar(B);
					const exactC = exactScalarMatMul(As, Bs);
					assertEnclosesExact(C, exactC, `shape=${m}x${k}x${n} sample=${sample} `);
				}
			}
		});

		it('encloses all 2^8 = 256 corner combinations of a 2x2 * 2x2 non-dyadic interval product', () => {
			const A = [
				[[-0.3, 0.7], [-1.1, 0.2]],
				[[0.1, 0.9], [-0.7, 1.3]]
			];
			const B = [
				[[-0.6, 0.4], [0.3, 1.7]],
				[[-1.9, 0.1], [-0.8, 0.6]]
			];
			const C = matMulIntervalIterative(A, B);

			for (let mask = 0; mask < 256; mask++) {
				const pick = (iv, bit) => iv[(mask >> bit) & 1];
				const As = [
					[pick(A[0][0], 0), pick(A[0][1], 1)],
					[pick(A[1][0], 2), pick(A[1][1], 3)]
				];
				const Bs = [
					[pick(B[0][0], 4), pick(B[0][1], 5)],
					[pick(B[1][0], 6), pick(B[1][1], 7)]
				];
				assertEnclosesExact(C, exactScalarMatMul(As, Bs), `mask=${mask} `);
			}
		});
	});
});
