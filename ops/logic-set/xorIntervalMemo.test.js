import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorIntervalMemo } from './xorIntervalMemo.js';

/**
 * Independent reference oracle using direct midpoint sampling over all unique endpoints.
 * Checks membership against the raw input arrays without using tables or sweep state machines.
 *
 * @param {Array<[number, number]>} rawA
 * @param {Array<[number, number]>} rawB
 * @returns {Array<[number, number]>}
 */
function referenceXorByMidpoints(rawA, rawB) {
	const coordSet = new Set();
	for (const [lo, hi] of rawA) {
		if (lo < hi) {
			coordSet.add(lo === 0 ? 0 : lo);
			coordSet.add(hi === 0 ? 0 : hi);
		}
	}
	for (const [lo, hi] of rawB) {
		if (lo < hi) {
			coordSet.add(lo === 0 ? 0 : lo);
			coordSet.add(hi === 0 ? 0 : hi);
		}
	}
	const coords = [...coordSet].sort((x, y) => x - y);
	const contains = (set, x) => set.some(([lo, hi]) => lo < hi && lo <= x && x <= hi);

	const out = [];
	for (let i = 0; i + 1 < coords.length; i++) {
		const lo = coords[i];
		const hi = coords[i + 1];
		const mid = (lo + hi) / 2;
		const inA = contains(rawA, mid);
		const inB = contains(rawB, mid);
		if (inA !== inB) {
			if (out.length > 0 && out[out.length - 1][1] === lo) {
				out[out.length - 1][1] = hi;
			} else {
				out.push([lo, hi]);
			}
		}
	}
	return out;
}

/**
 * Independent discrete bitset oracle for integer intervals within [-30, 30].
 *
 * @param {Array<[number, number]>} rawA
 * @param {Array<[number, number]>} rawB
 * @returns {Array<[number, number]>}
 */
function referenceXorIntegerGrid(rawA, rawB) {
	const OFFSET = 30;
	const LEN = 60;
	const bitsA = new Uint8Array(LEN);
	const bitsB = new Uint8Array(LEN);

	for (const [lo, hi] of rawA) {
		for (let k = lo; k < hi; k++) bitsA[k + OFFSET] = 1;
	}
	for (const [lo, hi] of rawB) {
		for (let k = lo; k < hi; k++) bitsB[k + OFFSET] = 1;
	}

	const out = [];
	let start = null;
	for (let idx = 0; idx < LEN; idx++) {
		const inXor = (bitsA[idx] ^ bitsB[idx]) === 1;
		if (inXor && start === null) {
			start = idx - OFFSET;
		} else if (!inXor && start !== null) {
			out.push([start, idx - OFFSET]);
			start = null;
		}
	}
	if (start !== null) {
		out.push([start, LEN - OFFSET]);
	}
	return out;
}

function totalMeasure(intervals) {
	return intervals.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);
}

describe('xorIntervalMemo', () => {
	describe('normal cases', () => {
		it('computes XOR of disjoint intervals', () => {
			assert.deepStrictEqual(
				xorIntervalMemo([[1, 3]], [[5, 7]]),
				[[1, 3], [5, 7]],
			);
		});

		it('computes XOR of partially overlapping intervals', () => {
			assert.deepStrictEqual(
				xorIntervalMemo([[1, 5]], [[3, 8]]),
				[[1, 3], [5, 8]],
			);
		});

		it('punches holes when one interval contains another', () => {
			assert.deepStrictEqual(
				xorIntervalMemo([[0, 10]], [[2, 4], [6, 8]]),
				[[0, 2], [4, 6], [8, 10]],
			);
		});

		it('computes XOR of interleaved multi-interval sets', () => {
			assert.deepStrictEqual(
				xorIntervalMemo([[1, 3], [5, 7]], [[2, 6]]),
				[[1, 2], [3, 5], [6, 7]],
			);
		});

		it('normalizes unsorted, overlapping, and duplicate input intervals', () => {
			const a = [[5, 7], [1, 3], [2, 4], [1, 3], [4, 5]];
			const b = [[6, 9], [0, 2]];
			assert.deepStrictEqual(
				xorIntervalMemo(a, b),
				[[0, 1], [2, 6], [7, 9]],
			);
		});

		it('supports negative and floating-point real intervals', () => {
			assert.deepStrictEqual(
				xorIntervalMemo([[-5.5, -1.25], [0.5, 2.5]], [[-3.5, 1.5]]),
				[[-5.5, -3.5], [-1.25, 0.5], [1.5, 2.5]],
			);
		});
	});

	describe('edge cases', () => {
		it('handles empty inputs', () => {
			assert.deepStrictEqual(xorIntervalMemo([], []), []);
			assert.deepStrictEqual(xorIntervalMemo([[1, 4]], []), [[1, 4]]);
			assert.deepStrictEqual(xorIntervalMemo([], [[1, 4]]), [[1, 4]]);
		});

		it('returns empty set for identical interval sets', () => {
			assert.deepStrictEqual(xorIntervalMemo([[1, 4]], [[1, 4]]), []);
			assert.deepStrictEqual(
				xorIntervalMemo([[1, 3], [3, 5]], [[1, 5]]),
				[],
			);
		});

		it('merges touching intervals across A and B', () => {
			assert.deepStrictEqual(
				xorIntervalMemo([[1, 3]], [[3, 5]]),
				[[1, 5]],
			);
			assert.deepStrictEqual(
				xorIntervalMemo([[0, 1], [2, 3]], [[1, 2], [3, 4]]),
				[[0, 4]],
			);
		});

		it('drops zero-length degenerate intervals [x, x]', () => {
			assert.deepStrictEqual(xorIntervalMemo([[2, 2]], []), []);
			assert.deepStrictEqual(xorIntervalMemo([[2, 2]], [[2, 2]]), []);
			assert.deepStrictEqual(
				xorIntervalMemo([[1, 5], [3, 3]], [[3, 3]]),
				[[1, 5]],
			);
		});

		it('normalizes -0 to +0 without Object.is mismatches', () => {
			const res = xorIntervalMemo([[-0, 2]], [[1, 3]]);
			assert.deepStrictEqual(res, [[0, 1], [2, 3]]);
			assert.equal(Object.is(res[0][0], 0), true);
		});

		it('does not mutate inputs and isolates memoized results from caller mutation', () => {
			const a = [[3, 6], [1, 2]];
			const b = [[2, 4]];
			const aCopy = structuredClone(a);
			const bCopy = structuredClone(b);

			const first = xorIntervalMemo(a, b);
			assert.deepStrictEqual(a, aCopy);
			assert.deepStrictEqual(b, bCopy);
			assert.deepStrictEqual(first, [[1, 3], [4, 6]]);

			// Mutate returned result aggressively.
			first[0][0] = -999;
			first.push([100, 200]);

			// Subsequent direct and commutative cache hits must be unaffected.
			assert.deepStrictEqual(xorIntervalMemo(a, b), [[1, 3], [4, 6]]);
			assert.deepStrictEqual(xorIntervalMemo(b, a), [[1, 3], [4, 6]]);
		});

		it('handles cache eviction beyond bounded capacity cleanly', () => {
			for (let i = 0; i < 1100; i++) {
				const res = xorIntervalMemo([[i, i + 2]], [[i + 1, i + 3]]);
				assert.deepStrictEqual(res, [[i, i + 1], [i + 2, i + 3]]);
			}
			// Re-query evicted and recent entries.
			assert.deepStrictEqual(xorIntervalMemo([[0, 2]], [[1, 3]]), [[0, 1], [2, 3]]);
			assert.deepStrictEqual(xorIntervalMemo([[1099, 1101]], [[1100, 1102]]), [[1099, 1100], [1101, 1102]]);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			assert.throws(() => xorIntervalMemo(null, []), TypeError);
			assert.throws(() => xorIntervalMemo([], undefined), TypeError);
			assert.throws(() => xorIntervalMemo('[[1,2]]', []), TypeError);
			assert.throws(() => xorIntervalMemo([], {}), TypeError);
		});

		it('throws TypeError for malformed interval tuples or non-number endpoints', () => {
			assert.throws(() => xorIntervalMemo([1], []), TypeError);
			assert.throws(() => xorIntervalMemo([[1]], []), TypeError);
			assert.throws(() => xorIntervalMemo([[1, 2, 3]], []), TypeError);
			assert.throws(() => xorIntervalMemo([['1', 2]], []), TypeError);
			assert.throws(() => xorIntervalMemo([], [[1, null]]), TypeError);
		});

		it('throws RangeError for non-finite endpoints or reversed intervals', () => {
			assert.throws(() => xorIntervalMemo([[NaN, 1]], []), RangeError);
			assert.throws(() => xorIntervalMemo([[0, Infinity]], []), RangeError);
			assert.throws(() => xorIntervalMemo([[-Infinity, 0]], []), RangeError);
			assert.throws(() => xorIntervalMemo([[5, 2]], []), RangeError);
			assert.throws(() => xorIntervalMemo([], [[1.5, 1.4]]), RangeError);
		});
	});

	describe('independent cross-checks and algebraic laws', () => {
		// Deterministic LCG PRNG for reproducible fuzz testing.
		function createRng(seed) {
			let s = seed >>> 0;
			return () => {
				s = (Math.imul(1664525, s) + 1013904223) >>> 0;
				return s / 0x100000000;
			};
		}

		it('matches midpoint-sampling and integer-grid oracles across 150 random cases', () => {
			const rand = createRng(0x5eed1234);

			const genIntSet = () => {
				const count = Math.floor(rand() * 8);
				const arr = [];
				for (let i = 0; i < count; i++) {
					const x = Math.floor(rand() * 50) - 25;
					const y = Math.floor(rand() * 50) - 25;
					arr.push(x <= y ? [x, y] : [y, x]);
				}
				return arr;
			};

			for (let t = 0; t < 150; t++) {
				const a = genIntSet();
				const b = genIntSet();

				const actual = xorIntervalMemo(a, b);
				const expectedMid = referenceXorByMidpoints(a, b);
				const expectedGrid = referenceXorIntegerGrid(a, b);

				assert.deepStrictEqual(actual, expectedMid);
				assert.deepStrictEqual(actual, expectedGrid);

				// Verify output invariants: strictly sorted, non-degenerate, non-touching.
				for (let i = 0; i < actual.length; i++) {
					assert.ok(actual[i][0] < actual[i][1]);
					if (i > 0) {
						assert.ok(actual[i - 1][1] < actual[i][0]);
					}
				}
			}
		});

		it('satisfies Boolean ring laws (commutativity, associativity, involution, measure)', () => {
			const rand = createRng(0xcafebabe);

			const genRealSet = () => {
				const count = Math.floor(rand() * 6);
				const arr = [];
				for (let i = 0; i < count; i++) {
					// Multiples of 0.25 avoid floating-point rounding drift in assertions.
					const x = (Math.floor(rand() * 40) - 20) * 0.25;
					const y = (Math.floor(rand() * 40) - 20) * 0.25;
					arr.push(x <= y ? [x, y] : [y, x]);
				}
				return arr;
			};

			for (let t = 0; t < 60; t++) {
				const a = genRealSet();
				const b = genRealSet();
				const c = genRealSet();

				const ab = xorIntervalMemo(a, b);
				const ba = xorIntervalMemo(b, a);
				assert.deepStrictEqual(ab, ba, 'commutativity');

				assert.deepStrictEqual(
					xorIntervalMemo(ab, c),
					xorIntervalMemo(a, xorIntervalMemo(b, c)),
					'associativity',
				);

				assert.deepStrictEqual(xorIntervalMemo(a, a), [], 'self-inverse');
				assert.deepStrictEqual(
					xorIntervalMemo(ab, b),
					xorIntervalMemo(a, []),
					'cancellation / involution',
				);

				// Measure of XOR is strictly <= measure(normA) + measure(normB)
				// and matches the midpoint oracle exactly.
				const normA = xorIntervalMemo(a, []);
				const normB = xorIntervalMemo(b, []);
				const expected = referenceXorByMidpoints(a, b);
				assert.deepStrictEqual(ab, expected);
				assert.ok(totalMeasure(ab) <= totalMeasure(normA) + totalMeasure(normB) + 1e-12);
			}
		});
	});
});
