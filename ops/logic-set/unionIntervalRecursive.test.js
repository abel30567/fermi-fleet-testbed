import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionIntervalRecursive } from './unionIntervalRecursive.js';

/**
 * Independent iterative sort-and-sweep reference implementation for cross-checking.
 *
 * @param {...Array<[number, number]>} sets
 * @returns {Array<[number, number]>}
 */
function referenceUnionIterative(...sets) {
	const flat = [];
	for (const set of sets) {
		for (const [lo, hi] of set) {
			flat.push([lo === 0 ? 0 : lo, hi === 0 ? 0 : hi]);
		}
	}
	if (flat.length === 0) {
		return [];
	}
	flat.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
	const merged = [[flat[0][0], flat[0][1]]];
	for (let i = 1; i < flat.length; i++) {
		const [lo, hi] = flat[i];
		const last = merged[merged.length - 1];
		if (lo <= last[1]) {
			if (hi > last[1]) {
				last[1] = hi;
			}
		} else {
			merged.push([lo, hi]);
		}
	}
	return merged;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property / fuzz tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Verify that an interval array is strictly normalized:
 * each interval satisfies lo <= hi, and consecutive intervals satisfy prev.hi < next.lo.
 *
 * @param {Array<[number, number]>} intervals
 */
function assertNormalized(intervals) {
	for (let i = 0; i < intervals.length; i++) {
		const [lo, hi] = intervals[i];
		assert.ok(lo <= hi, `Expected lo <= hi at index ${i}, got [${lo}, ${hi}]`);
		if (lo === 0) {
			assert.ok(Object.is(lo, 0), `Expected +0, got -0 at index ${i} lo`);
		}
		if (hi === 0) {
			assert.ok(Object.is(hi, 0), `Expected +0, got -0 at index ${i} hi`);
		}
		if (i > 0) {
			const prevHi = intervals[i - 1][1];
			assert.ok(
				prevHi < lo,
				`Expected strictly disjoint/non-touching intervals, got [${intervals[i - 1]}] and [${intervals[i]}]`,
			);
		}
	}
}

describe('unionIntervalRecursive', () => {
	describe('normal cases', () => {
		it('unions two disjoint interval sets in sorted order', () => {
			assert.deepStrictEqual(
				unionIntervalRecursive(
					[
						[10, 12],
						[1, 2],
					],
					[
						[5, 7],
						[-3, -1],
					],
				),
				[
					[-3, -1],
					[1, 2],
					[5, 7],
					[10, 12],
				],
			);
		});

		it('merges overlapping intervals across two sets', () => {
			assert.deepStrictEqual(
				unionIntervalRecursive(
					[
						[1, 5],
						[10, 15],
					],
					[
						[3, 8],
						[12, 20],
					],
				),
				[
					[1, 8],
					[10, 20],
				],
			);
		});

		it('merges touching closed intervals', () => {
			assert.deepStrictEqual(
				unionIntervalRecursive([[1, 3]], [[3, 5]]),
				[[1, 5]],
			);
			assert.deepStrictEqual(
				unionIntervalRecursive(
					[
						[0, 1],
						[2, 3],
					],
					[[1, 2]],
				),
				[[0, 3]],
			);
		});

		it('handles nested and duplicate intervals', () => {
			assert.deepStrictEqual(
				unionIntervalRecursive(
					[
						[0, 10],
						[2, 4],
						[0, 10],
					],
					[
						[3, 7],
						[5, 5],
						[1, 9],
					],
				),
				[[0, 10]],
			);
		});

		it('unions three or more sets', () => {
			assert.deepStrictEqual(
				unionIntervalRecursive(
					[[1, 2]],
					[[4, 6]],
					[[2, 4]],
					[[8, 9], [7, 8]],
				),
				[
					[1, 6],
					[7, 9],
				],
			);
		});

		it('normalizes and merges a single interval set', () => {
			assert.deepStrictEqual(
				unionIntervalRecursive([
					[8, 10],
					[1, 3],
					[2, 6],
					[15, 18],
					[10, 12],
				]),
				[
					[1, 6],
					[8, 12],
					[15, 18],
				],
			);
		});

		it('handles floating-point real intervals accurately', () => {
			assert.deepStrictEqual(
				unionIntervalRecursive(
					[
						[-1.5, -0.25],
						[0.1, 0.5],
					],
					[
						[-0.5, 0.05],
						[0.5, 1.25],
					],
				),
				[
					[-1.5, 0.05],
					[0.1, 1.25],
				],
			);
		});
	});

	describe('edge cases', () => {
		it('handles zero arguments and empty sets', () => {
			assert.deepStrictEqual(unionIntervalRecursive(), []);
			assert.deepStrictEqual(unionIntervalRecursive([]), []);
			assert.deepStrictEqual(unionIntervalRecursive([], []), []);
			assert.deepStrictEqual(unionIntervalRecursive([], [], []), []);
			assert.deepStrictEqual(unionIntervalRecursive([], [[1, 2]]), [[1, 2]]);
			assert.deepStrictEqual(unionIntervalRecursive([[1, 2]], []), [[1, 2]]);
		});

		it('handles degenerate point intervals [x, x]', () => {
			assert.deepStrictEqual(unionIntervalRecursive([[3, 3]]), [[3, 3]]);
			assert.deepStrictEqual(
				unionIntervalRecursive([[3, 3]], [[3, 3]]),
				[[3, 3]],
			);
			assert.deepStrictEqual(
				unionIntervalRecursive([[1, 2], [4, 5]], [[2, 2], [3, 3]]),
				[
					[1, 2],
					[3, 3],
					[4, 5],
				],
			);
		});

		it('normalizes -0 endpoints to +0', () => {
			const res = unionIntervalRecursive([[-0, -0]], [[-0, 1]]);
			assert.deepStrictEqual(res, [[0, 1]]);
			assert.ok(Object.is(res[0][0], 0));

			const res2 = unionIntervalRecursive([[-2, -0]]);
			assert.deepStrictEqual(res2, [[-2, 0]]);
			assert.ok(Object.is(res2[0][1], 0));
		});

		it('supports unbounded real intervals with -Infinity and +Infinity', () => {
			assert.deepStrictEqual(
				unionIntervalRecursive([[-Infinity, 0]], [[0, Infinity]]),
				[[-Infinity, Infinity]],
			);
			assert.deepStrictEqual(
				unionIntervalRecursive([[-Infinity, -5], [5, Infinity]], [[-10, 10]]),
				[[-Infinity, Infinity]],
			);
			assert.deepStrictEqual(
				unionIntervalRecursive([[-Infinity, 1]], [[2, Infinity]]),
				[
					[-Infinity, 1],
					[2, Infinity],
				],
			);
			assert.deepStrictEqual(
				unionIntervalRecursive([[-Infinity, Infinity]], [[-5, 5], [100, 200]]),
				[[-Infinity, Infinity]],
			);
		});

		it('does not mutate inputs or alias input tuples in output', () => {
			const a = [
				[5, 6],
				[1, 2],
			];
			const b = [[10, 12]];
			const aSnapshot = structuredClone(a);
			const bSnapshot = structuredClone(b);

			const out = unionIntervalRecursive(a, b);
			assert.deepStrictEqual(a, aSnapshot);
			assert.deepStrictEqual(b, bSnapshot);

			out[0][0] = -999;
			assert.deepStrictEqual(a, aSnapshot);
			assert.deepStrictEqual(b, bSnapshot);
		});

		it('handles large inputs without stack overflow', () => {
			const n = 20000;
			const setA = [];
			const setB = [];
			for (let i = n - 1; i >= 0; i--) {
				setA.push([i * 3, i * 3 + 1]);
				setB.push([i * 3 + 1, i * 3 + 2]);
			}
			const result = unionIntervalRecursive(setA, setB);
			assert.strictEqual(result.length, n);
			assert.deepStrictEqual(result[0], [0, 2]);
			assert.deepStrictEqual(result[n - 1], [(n - 1) * 3, (n - 1) * 3 + 2]);
			assertNormalized(result);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError for non-array set arguments', () => {
			assert.throws(() => unionIntervalRecursive(null), TypeError);
			assert.throws(() => unionIntervalRecursive(undefined), TypeError);
			assert.throws(() => unionIntervalRecursive(42), TypeError);
			assert.throws(() => unionIntervalRecursive('[]'), TypeError);
			assert.throws(() => unionIntervalRecursive({}), TypeError);
			assert.throws(() => unionIntervalRecursive(new Set()), TypeError);
			assert.throws(() => unionIntervalRecursive([[1, 2]], null), TypeError);
			assert.throws(() => unionIntervalRecursive([[-Infinity, Infinity]], 'bad'), TypeError);
		});

		it('throws TypeError for malformed interval elements', () => {
			assert.throws(() => unionIntervalRecursive([null]), TypeError);
			assert.throws(() => unionIntervalRecursive([undefined]), TypeError);
			assert.throws(() => unionIntervalRecursive([123]), TypeError);
			assert.throws(() => unionIntervalRecursive([{ lo: 1, hi: 2 }]), TypeError);
			assert.throws(() => unionIntervalRecursive([[]]), TypeError);
			assert.throws(() => unionIntervalRecursive([[1]]), TypeError);
			assert.throws(() => unionIntervalRecursive([[1, 2, 3]]), TypeError);
			// Sparse array hole
			const sparseSet = new Array(1);
			assert.throws(() => unionIntervalRecursive(sparseSet), TypeError);
			const sparseInterval = new Array(2);
			assert.throws(() => unionIntervalRecursive([sparseInterval]), TypeError);
		});

		it('throws TypeError for non-number interval endpoints', () => {
			assert.throws(() => unionIntervalRecursive([['1', 2]]), TypeError);
			assert.throws(() => unionIntervalRecursive([[1, '2']]), TypeError);
			assert.throws(() => unionIntervalRecursive([[null, 2]]), TypeError);
			assert.throws(() => unionIntervalRecursive([[1, undefined]]), TypeError);
			assert.throws(() => unionIntervalRecursive([[1n, 2n]]), TypeError);
			assert.throws(() => unionIntervalRecursive([[true, 2]]), TypeError);
		});

		it('throws RangeError for NaN endpoints, reversed intervals, and degenerate infinities', () => {
			assert.throws(() => unionIntervalRecursive([[NaN, 1]]), RangeError);
			assert.throws(() => unionIntervalRecursive([[1, NaN]]), RangeError);
			assert.throws(() => unionIntervalRecursive([[NaN, NaN]]), RangeError);
			assert.throws(() => unionIntervalRecursive([[5, 2]]), RangeError);
			assert.throws(() => unionIntervalRecursive([[0, -1]]), RangeError);
			assert.throws(() => unionIntervalRecursive([[Infinity, -Infinity]]), RangeError);
			assert.throws(() => unionIntervalRecursive([[Infinity, Infinity]]), RangeError);
			assert.throws(() => unionIntervalRecursive([[-Infinity, -Infinity]]), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent iterative sort-and-sweep reference across randomized inputs', () => {
			const rand = mulberry32(0x20261123);

			for (let trial = 0; trial < 200; trial++) {
				const numSets = Math.floor(rand() * 6); // 0..5 sets
				const sets = [];
				for (let s = 0; s < numSets; s++) {
					const len = Math.floor(rand() * 25);
					const set = [];
					for (let k = 0; k < len; k++) {
						const a = Math.floor(rand() * 41) - 20;
						const width = Math.floor(rand() * 8);
						// Mix integers and half-integers to exercise touching and floating points
						const offset = rand() < 0.3 ? 0.5 : 0;
						set.push([a + offset, a + offset + width]);
					}
					sets.push(set);
				}

				const actual = unionIntervalRecursive(...sets);
				const expected = referenceUnionIterative(...sets);
				assert.deepStrictEqual(actual, expected, `Mismatch on trial ${trial}`);
				assertNormalized(actual);
			}
		});

		it('agrees with brute-force point-membership oracle on dense sample grid', () => {
			const rand = mulberry32(0xdeadbeef);

			const contains = (intervals, x) =>
				intervals.some(([lo, hi]) => lo <= x && x <= hi);

			for (let trial = 0; trial < 80; trial++) {
				const makeSet = () => {
					const count = Math.floor(rand() * 10);
					const arr = [];
					for (let i = 0; i < count; i++) {
						const lo = Math.floor(rand() * 31) - 15;
						const hi = lo + Math.floor(rand() * 7);
						arr.push([lo, hi]);
					}
					return arr;
				};

				const a = makeSet();
				const b = makeSet();
				const c = makeSet();
				const merged = unionIntervalRecursive(a, b, c);
				assertNormalized(merged);

				// Check every quarter-unit point in [-16, 24]
				for (let q = -64; q <= 96; q++) {
					const x = q / 4;
					const inMerged = contains(merged, x);
					const inAnyInput = contains(a, x) || contains(b, x) || contains(c, x);
					assert.strictEqual(
						inMerged,
						inAnyInput,
						`Point-membership mismatch at x=${x} on trial ${trial}`,
					);
				}
			}
		});

		it('satisfies set-algebraic laws (commutativity, associativity, idempotence, identity, absorption)', () => {
			const a = [
				[5, 8],
				[-2, 1],
				[0, 3],
			];
			const b = [
				[2, 4],
				[7, 10],
				[-5, -4],
			];
			const c = [
				[-4, -2],
				[10, 12],
				[15, 15],
			];

			// Commutativity: A U B = B U A
			assert.deepStrictEqual(
				unionIntervalRecursive(a, b),
				unionIntervalRecursive(b, a),
			);

			// Associativity: (A U B) U C = A U (B U C) = union(A, B, C)
			const leftAssoc = unionIntervalRecursive(unionIntervalRecursive(a, b), c);
			const rightAssoc = unionIntervalRecursive(a, unionIntervalRecursive(b, c));
			const direct = unionIntervalRecursive(a, b, c);
			assert.deepStrictEqual(leftAssoc, rightAssoc);
			assert.deepStrictEqual(leftAssoc, direct);

			// Idempotence: A U A = normalize(A)
			assert.deepStrictEqual(
				unionIntervalRecursive(a, a),
				unionIntervalRecursive(a),
			);

			// Identity: A U {} = normalize(A)
			assert.deepStrictEqual(
				unionIntervalRecursive(a, []),
				unionIntervalRecursive(a),
			);

			// Absorption: A U {[-Infinity, Infinity]} = {[-Infinity, Infinity]}
			assert.deepStrictEqual(
				unionIntervalRecursive(a, [[-Infinity, Infinity]]),
				[[-Infinity, Infinity]],
			);
		});
	});
});
