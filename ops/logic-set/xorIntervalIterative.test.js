import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { xorIntervalIterative } from './xorIntervalIterative.js';

/**
 * Independent reference normalization for testing algebraic identities.
 */
function referenceNormalize(intervals) {
	if (intervals.length === 0) return [];
	const sorted = intervals
		.map(([lo, hi]) => [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
		.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
	const out = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		const prev = out[out.length - 1];
		if (sorted[i][0] <= prev[1]) {
			if (sorted[i][1] > prev[1]) prev[1] = sorted[i][1];
		} else {
			out.push(sorted[i]);
		}
	}
	return out;
}

/**
 * Independent closed-set membership check at a single real point x.
 */
function containsPoint(set, x) {
	for (let i = 0; i < set.length; i++) {
		if (set[i][0] <= x && x <= set[i][1]) {
			return true;
		}
	}
	return false;
}

/**
 * Independent unit-cell brute-force XOR for integer-endpoint intervals on [minX, maxX].
 */
function bruteForceUnitCellXor(setA, setB, minX, maxX) {
	const result = [];
	for (let k = minX; k < maxX; k++) {
		const mid = k + 0.5;
		const inA = containsPoint(setA, mid);
		const inB = containsPoint(setB, mid);
		if (inA !== inB) {
			if (result.length > 0 && result[result.length - 1][1] === k) {
				result[result.length - 1][1] = k + 1;
			} else {
				result.push([k, k + 1]);
			}
		}
	}
	return result;
}

/**
 * Simple deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function createRng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('xorIntervalIterative', () => {
	describe('normal cases', () => {
		test('partially overlapping single intervals', () => {
			assert.deepEqual(
				xorIntervalIterative([[0, 5]], [[3, 8]]),
				[[0, 3], [5, 8]],
			);
		});

		test('multiple interleaved and overlapping intervals', () => {
			assert.deepEqual(
				xorIntervalIterative(
					[[0, 4], [6, 10], [12, 16]],
					[[2, 8], [14, 20]],
				),
				[[0, 2], [4, 6], [8, 10], [12, 14], [16, 20]],
			);
		});

		test('unsorted, overlapping, and duplicate intervals in inputs are normalized and merged', () => {
			assert.deepEqual(
				xorIntervalIterative(
					[[5, 10], [1, 4], [3, 6], [1, 4]],
					[[8, 12], [2, 3]],
				),
				[[1, 2], [3, 8], [10, 12]],
			);
		});

		test('negative and fractional coordinates', () => {
			assert.deepEqual(
				xorIntervalIterative(
					[[-10.5, -2.25], [0.5, 3.5]],
					[[-5.0, 1.5]],
				),
				[[-10.5, -5.0], [-2.25, 0.5], [1.5, 3.5]],
			);
		});

		test('does not mutate input arrays or inner interval tuples', () => {
			const setA = [[5, 8], [1, 3]];
			const setB = [[2, 6]];
			const snapshotA = structuredClone(setA);
			const snapshotB = structuredClone(setB);

			const result = xorIntervalIterative(setA, setB);
			assert.deepEqual(result, [[1, 2], [3, 5], [6, 8]]);
			assert.deepEqual(setA, snapshotA);
			assert.deepEqual(setB, snapshotB);
		});
	});

	describe('edge cases', () => {
		test('identical sets produce empty array', () => {
			assert.deepEqual(xorIntervalIterative([[1, 5]], [[1, 5]]), []);
			assert.deepEqual(
				xorIntervalIterative([[0, 10]], [[0, 4], [4, 7], [7, 10]]),
				[],
			);
		});

		test('disjoint sets produce sorted merged union', () => {
			assert.deepEqual(
				xorIntervalIterative([[1, 2], [7, 9]], [[4, 5]]),
				[[1, 2], [4, 5], [7, 9]],
			);
			// Touching disjoint sets merge into one contiguous interval
			assert.deepEqual(
				xorIntervalIterative([[0, 5]], [[5, 10]]),
				[[0, 10]],
			);
			assert.deepEqual(
				xorIntervalIterative([[0, 2], [4, 6]], [[2, 4], [6, 8]]),
				[[0, 8]],
			);
		});

		test('nested intervals punch holes cleanly', () => {
			assert.deepEqual(
				xorIntervalIterative([[0, 10]], [[2, 8]]),
				[[0, 2], [8, 10]],
			);
			assert.deepEqual(
				xorIntervalIterative([[2, 8]], [[0, 10]]),
				[[0, 2], [8, 10]],
			);
			assert.deepEqual(
				xorIntervalIterative([[0, 20]], [[2, 5], [10, 15]]),
				[[0, 2], [5, 10], [15, 20]],
			);
		});

		test('shared left or right boundaries', () => {
			assert.deepEqual(xorIntervalIterative([[0, 10]], [[0, 4]]), [[4, 10]]);
			assert.deepEqual(xorIntervalIterative([[0, 10]], [[6, 10]]), [[0, 6]]);
		});

		test('empty sets', () => {
			assert.deepEqual(xorIntervalIterative([], []), []);
			assert.deepEqual(
				xorIntervalIterative([[4, 6], [1, 3], [2, 5]], []),
				[[1, 6]],
			);
			assert.deepEqual(
				xorIntervalIterative([], [[4, 6], [1, 3], [2, 5]]),
				[[1, 6]],
			);
		});

		test('degenerate point intervals [x, x]', () => {
			assert.deepEqual(xorIntervalIterative([[3, 3]], []), [[3, 3]]);
			assert.deepEqual(xorIntervalIterative([], [[3, 3]]), [[3, 3]]);
			assert.deepEqual(xorIntervalIterative([[3, 3]], [[3, 3]]), []);
			assert.deepEqual(
				xorIntervalIterative([[3, 3]], [[0, 2], [4, 6]]),
				[[0, 2], [3, 3], [4, 6]],
			);
			assert.deepEqual(
				xorIntervalIterative([[0, 10]], [[4, 4]]),
				[[0, 10]],
			);
		});

		test('canonicalizes -0 to +0', () => {
			const res = xorIntervalIterative([[-0, 1]], []);
			assert.deepEqual(res, [[0, 1]]);
			assert.equal(Object.is(res[0][0], 0), true);
			assert.deepEqual(xorIntervalIterative([[-0, 1]], [[0, 1]]), []);
		});

		test('infinite bounds (-Infinity and +Infinity)', () => {
			assert.deepEqual(
				xorIntervalIterative([[-Infinity, 0]], [[-5, 5]]),
				[[-Infinity, -5], [0, 5]],
			);
			assert.deepEqual(
				xorIntervalIterative([[-Infinity, Infinity]], [[0, 10]]),
				[[-Infinity, 0], [10, Infinity]],
			);
			assert.deepEqual(
				xorIntervalIterative([[-Infinity, Infinity]], [[-Infinity, Infinity]]),
				[],
			);
			assert.deepEqual(
				xorIntervalIterative([[-Infinity, 5]], [[5, Infinity]]),
				[[-Infinity, Infinity]],
			);
			assert.deepEqual(
				xorIntervalIterative([[0, Infinity]], [[10, Infinity]]),
				[[0, 10]],
			);
			assert.deepEqual(
				xorIntervalIterative([[-Infinity, 0], [10, Infinity]], [[-Infinity, 5]]),
				[[0, 5], [10, Infinity]],
			);
		});

		test('extreme finite floats (no midpoint overflow or ULP collapse)', () => {
			const big = Number.MAX_VALUE;
			const halfBig = Number.MAX_VALUE / 2;
			assert.deepEqual(
				xorIntervalIterative([[halfBig, big]], [[halfBig, big]]),
				[],
			);
			assert.deepEqual(
				xorIntervalIterative([[halfBig, big]], [[0, halfBig]]),
				[[0, big]],
			);

			const lo = 1;
			const next = 1 + Number.EPSILON;
			const next2 = 1 + 2 * Number.EPSILON;
			assert.deepEqual(
				xorIntervalIterative([[lo, next2]], [[next, next2]]),
				[[lo, next]],
			);
		});
	});

	describe('input validation', () => {
		test('rejects non-array setA or setB with TypeError', () => {
			for (const bad of [null, undefined, 42, '[]', {}, new Set()]) {
				assert.throws(() => xorIntervalIterative(bad, []), TypeError);
				assert.throws(() => xorIntervalIterative([], bad), TypeError);
			}
		});

		test('rejects non-array interval elements with TypeError', () => {
			for (const bad of [null, undefined, 1, '1,2', { lo: 0, hi: 1 }]) {
				assert.throws(() => xorIntervalIterative([bad], []), TypeError);
				assert.throws(() => xorIntervalIterative([], [bad]), TypeError);
			}
			// Sparse array element is undefined
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => xorIntervalIterative([, [1, 2]], []), TypeError);
		});

		test('rejects intervals whose length is not 2 with RangeError', () => {
			for (const bad of [[], [1], [1, 2, 3]]) {
				assert.throws(() => xorIntervalIterative([bad], []), RangeError);
				assert.throws(() => xorIntervalIterative([], [bad]), RangeError);
			}
		});

		test('rejects non-number endpoints with TypeError', () => {
			for (const bad of [['0', 1], [0, '1'], [null, 1], [0, undefined], [0n, 1n]]) {
				assert.throws(() => xorIntervalIterative([bad], []), TypeError);
				assert.throws(() => xorIntervalIterative([], [bad]), TypeError);
			}
		});

		test('rejects NaN endpoints with RangeError', () => {
			assert.throws(() => xorIntervalIterative([[NaN, 1]], []), RangeError);
			assert.throws(() => xorIntervalIterative([[0, NaN]], []), RangeError);
			assert.throws(() => xorIntervalIterative([], [[NaN, NaN]]), RangeError);
		});

		test('rejects inverted intervals (lo > hi) with RangeError', () => {
			assert.throws(() => xorIntervalIterative([[5, 2]], []), RangeError);
			assert.throws(() => xorIntervalIterative([], [[Infinity, -Infinity]]), RangeError);
			assert.throws(() => xorIntervalIterative([[0, -1e-9]], []), RangeError);
		});

		test('rejects degenerate infinite singletons with RangeError', () => {
			assert.throws(() => xorIntervalIterative([[Infinity, Infinity]], []), RangeError);
			assert.throws(() => xorIntervalIterative([[-Infinity, -Infinity]], []), RangeError);
			assert.throws(() => xorIntervalIterative([], [[Infinity, Infinity]]), RangeError);
			assert.throws(() => xorIntervalIterative([], [[-Infinity, -Infinity]]), RangeError);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		test('matches brute-force unit-cell indicator check on randomized integer intervals', () => {
			const rng = createRng(0x5eed1234);
			const minX = -20;
			const maxX = 20;

			function randomIntSet() {
				const count = Math.floor(rng() * 7);
				const set = [];
				for (let i = 0; i < count; i++) {
					const a = minX + Math.floor(rng() * (maxX - minX));
					const len = 1 + Math.floor(rng() * 8);
					const b = Math.min(maxX, a + len);
					set.push([a, b]);
				}
				return set;
			}

			for (let trial = 0; trial < 100; trial++) {
				const setA = randomIntSet();
				const setB = randomIntSet();
				const actual = xorIntervalIterative(setA, setB);
				const expected = bruteForceUnitCellXor(setA, setB, minX, maxX);
				assert.deepEqual(actual, expected, `mismatch on trial ${trial}`);
			}
		});

		test('dense interior-point indicator check (inA !== inB) including infinite bounds', () => {
			const cases = [
				[
					[[-Infinity, -3], [0, 5], [7, 12]],
					[[-6, 2], [4, 10], [15, Infinity]],
				],
				[
					[[-Infinity, Infinity]],
					[[-10, -5], [0, 1], [100, Infinity]],
				],
				[
					[[-4.5, -1.2], [0.1, 2.3], [2.3, 4.7], [8.0, 9.5]],
					[[-3.0, 0.5], [1.5, 6.0], [9.5, 11.2]],
				],
			];

			for (const [setA, setB] of cases) {
				const res = xorIntervalIterative(setA, setB);

				// Verify structural normalization invariants on output
				for (let i = 0; i < res.length; i++) {
					assert.ok(res[i][0] <= res[i][1], 'output interval must have lo <= hi');
					if (i > 0) {
						assert.ok(res[i - 1][1] < res[i][0], 'output intervals must be strictly disjoint and merged');
					}
				}

				// Collect all finite endpoints to sample interior points of every elementary cell
				const finitePts = [...new Set(
					[...setA, ...setB, ...res]
						.flat()
						.filter((v) => Number.isFinite(v)),
				)].sort((a, b) => a - b);

				const samplePoints = [];
				if (finitePts.length === 0) {
					samplePoints.push(0);
				} else {
					samplePoints.push(finitePts[0] - 10);
					for (let i = 0; i < finitePts.length - 1; i++) {
						const lo = finitePts[i];
						const hi = finitePts[i + 1];
						samplePoints.push(lo + 0.25 * (hi - lo));
						samplePoints.push(lo + 0.5 * (hi - lo));
						samplePoints.push(lo + 0.75 * (hi - lo));
					}
					samplePoints.push(finitePts[finitePts.length - 1] + 10);
				}

				for (const x of samplePoints) {
					const inA = containsPoint(setA, x);
					const inB = containsPoint(setB, x);
					const inRes = containsPoint(res, x);
					assert.equal(inRes, inA !== inB, `interior point x=${x} failed indicator check`);
				}
			}
		});

		test('satisfies algebraic Boolean-ring identities (commutativity, involution, associativity, identity, self-cancellation)', () => {
			const rng = createRng(0xabcdef01);

			function randomNonDegenerateSet() {
				const count = Math.floor(rng() * 6);
				const set = [];
				for (let i = 0; i < count; i++) {
					const a = Math.floor(rng() * 30) - 15;
					const b = a + 1 + Math.floor(rng() * 10);
					set.push([a, b]);
				}
				return set;
			}

			for (let trial = 0; trial < 60; trial++) {
				const A = randomNonDegenerateSet();
				const B = randomNonDegenerateSet();
				const C = randomNonDegenerateSet();
				const normA = referenceNormalize(A);

				// Identity: A Δ ∅ = normalize(A)
				assert.deepEqual(xorIntervalIterative(A, []), normA);

				// Self-cancellation: A Δ A = ∅
				assert.deepEqual(xorIntervalIterative(A, A), []);

				// Commutativity: A Δ B = B Δ A
				const ab = xorIntervalIterative(A, B);
				const ba = xorIntervalIterative(B, A);
				assert.deepEqual(ab, ba);

				// Involution: (A Δ B) Δ B = normalize(A)
				assert.deepEqual(xorIntervalIterative(ab, B), normA);

				// Associativity: (A Δ B) Δ C = A Δ (B Δ C)
				const leftAssoc = xorIntervalIterative(ab, C);
				const rightAssoc = xorIntervalIterative(A, xorIntervalIterative(B, C));
				assert.deepEqual(leftAssoc, rightAssoc);
			}
		});
	});
});
