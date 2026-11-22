import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { xorSortedArrSeries } from './xorSortedArrSeries.js';

/**
 * Independent reference implementation via Map parity counting:
 * element x is in XOR(A_0, ..., A_{k-1}) iff its multiplicity across arrays is odd.
 *
 * @param {...number[]} arrays
 * @returns {number[]}
 */
function referenceXorParityMap(...arrays) {
	const counts = new Map();
	for (const arr of arrays) {
		for (const val of arr) {
			const norm = val === 0 ? 0 : val;
			counts.set(norm, (counts.get(norm) ?? 0) + 1);
		}
	}
	const out = [];
	for (const [val, count] of counts.entries()) {
		if (count % 2 === 1) {
			out.push(val);
		}
	}
	out.sort((a, b) => a - b);
	return out;
}

/**
 * Independent reference implementation via Set-based binary identity
 * A Δ B = (A \ B) ∪ (B \ A) folded left across all arrays.
 *
 * @param {...number[]} arrays
 * @returns {number[]}
 */
function referenceXorSetFold(...arrays) {
	let acc = new Set();
	for (const arr of arrays) {
		const b = new Set(arr.map((v) => (v === 0 ? 0 : v)));
		const next = new Set();
		for (const x of acc) {
			if (!b.has(x)) next.add(x);
		}
		for (const x of b) {
			if (!acc.has(x)) next.add(x);
		}
		acc = next;
	}
	return [...acc].sort((a, b) => a - b);
}

/**
 * Deterministic LCG PRNG for reproducible fuzz testing.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

/**
 * Asserts that an array is strictly increasing with finite numbers and no -0.
 *
 * @param {number[]} arr
 */
function assertStrictlyIncreasingCanonical(arr) {
	for (let i = 0; i < arr.length; i++) {
		assert.equal(typeof arr[i], 'number');
		assert.ok(Number.isFinite(arr[i]));
		assert.ok(!Object.is(arr[i], -0), 'Output should not contain -0');
		if (i > 0) {
			assert.ok(
				arr[i] > arr[i - 1],
				`Expected strictly increasing output: ${arr[i - 1]} < ${arr[i]}`
			);
		}
	}
}

describe('xorSortedArrSeries', () => {
	describe('normal cases', () => {
		test('computes binary symmetric difference with overlap', () => {
			assert.deepStrictEqual(
				xorSortedArrSeries([1, 2, 3, 5], [2, 3, 4, 6]),
				[1, 4, 5, 6]
			);
		});

		test('computes union when arrays are disjoint', () => {
			assert.deepStrictEqual(
				xorSortedArrSeries([-10, -2, 0], [1, 5, 9]),
				[-10, -2, 0, 1, 5, 9]
			);
			assert.deepStrictEqual(
				xorSortedArrSeries([1, 3, 5], [2, 4, 6]),
				[1, 2, 3, 4, 5, 6]
			);
		});

		test('computes set difference when one array is a subset of another', () => {
			assert.deepStrictEqual(
				xorSortedArrSeries([1, 2, 3, 4, 5], [2, 4]),
				[1, 3, 5]
			);
			assert.deepStrictEqual(
				xorSortedArrSeries([2, 4], [1, 2, 3, 4, 5]),
				[1, 3, 5]
			);
		});

		test('handles negative, floating-point, and extreme finite numbers', () => {
			const a = [-Number.MAX_VALUE, -3.5, -Number.MIN_VALUE, 0, 0.25, Number.MAX_SAFE_INTEGER];
			const b = [-Number.MAX_VALUE, -1.25, 0, Number.MIN_VALUE, 0.25, Number.MAX_VALUE];
			assert.deepStrictEqual(xorSortedArrSeries(a, b), [
				-3.5,
				-1.25,
				-Number.MIN_VALUE,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE,
			]);
		});

		test('computes multi-array series XOR (odd multiplicities kept, even eliminated)', () => {
			const a = [1, 2, 3, 4];
			const b = [2, 3, 5];
			const c = [3, 4, 6];
			const d = [4, 5, 6, 7];
			// Multiplicities:
			// 1: 1 (odd), 2: 2 (even), 3: 3 (odd), 4: 3 (odd),
			// 5: 2 (even), 6: 2 (even), 7: 1 (odd)
			assert.deepStrictEqual(xorSortedArrSeries(a, b, c, d), [1, 3, 4, 7]);
		});

		test('handles odd count of arrays in balanced merge tree (3, 5, 7 arrays)', () => {
			const arrays5 = [
				[1, 2, 10],
				[2, 3, 10],
				[3, 4, 10],
				[4, 5, 10],
				[5, 6, 10],
			];
			// 1:1, 2:2, 3:2, 4:2, 5:2, 6:1, 10:5 -> [1, 6, 10]
			assert.deepStrictEqual(xorSortedArrSeries(...arrays5), [1, 6, 10]);

			const arrays7 = [
				[0, 1],
				[1, 2],
				[2, 3],
				[3, 4],
				[4, 5],
				[5, 6],
				[6, 7],
			];
			// Telescoping series: only endpoints 0 and 7 remain
			assert.deepStrictEqual(xorSortedArrSeries(...arrays7), [0, 7]);
		});
	});

	describe('edge cases', () => {
		test('returns [] for zero arguments (identity element)', () => {
			assert.deepStrictEqual(xorSortedArrSeries(), []);
		});

		test('returns a shallow copy for a single array without aliasing', () => {
			const input = [-5, 0, 42];
			const result = xorSortedArrSeries(input);
			assert.deepStrictEqual(result, [-5, 0, 42]);
			assert.notEqual(result, input);
		});

		test('handles empty arrays in any position', () => {
			assert.deepStrictEqual(xorSortedArrSeries([]), []);
			assert.deepStrictEqual(xorSortedArrSeries([], []), []);
			assert.deepStrictEqual(xorSortedArrSeries([], [1, 2, 3], []), [1, 2, 3]);
			assert.deepStrictEqual(xorSortedArrSeries([], [], [], []), []);
		});

		test('normalizes -0 to +0 and treats -0 === +0 as equal', () => {
			const single = xorSortedArrSeries([-0]);
			assert.deepStrictEqual(single, [0]);
			assert.ok(Object.is(single[0], 0));

			assert.deepStrictEqual(xorSortedArrSeries([-0], [0]), []);

			const mixed = xorSortedArrSeries([-2, -0, 3], [-0, 1, 3]);
			assert.deepStrictEqual(mixed, [-2, 1]);

			const kept = xorSortedArrSeries([-2, -0], [1, 2]);
			assert.deepStrictEqual(kept, [-2, 0, 1, 2]);
			assert.ok(Object.is(kept[1], 0));
		});

		test('does not mutate input arrays', () => {
			const a = [1, 3, 5, 7];
			const b = [2, 3, 6, 7];
			const c = [3, 4, 5, 8];
			const aSnap = [...a];
			const bSnap = [...b];
			const cSnap = [...c];

			xorSortedArrSeries(a, b, c);
			assert.deepStrictEqual(a, aSnap);
			assert.deepStrictEqual(b, bSnap);
			assert.deepStrictEqual(c, cSnap);
		});

		test('handles large arrays efficiently', () => {
			const n = 5000;
			const evens = Array.from({ length: n }, (_, i) => i * 2);
			const mult3 = Array.from({ length: n }, (_, i) => i * 3);
			const result = xorSortedArrSeries(evens, mult3);
			assertStrictlyIncreasingCanonical(result);
			assert.deepStrictEqual(result, referenceXorParityMap(evens, mult3));
		});
	});

	describe('algebraic identities', () => {
		const A = [-4, -1, 0, 2, 5, 9];
		const B = [-3, -1, 2, 4, 8, 9];
		const C = [-4, 0, 3, 4, 5, 10];
		const D = [-1, 1, 3, 5, 8];

		test('identity law: A XOR [] = A and [] XOR A = A', () => {
			assert.deepStrictEqual(xorSortedArrSeries(A, []), A);
			assert.deepStrictEqual(xorSortedArrSeries([], A), A);
		});

		test('self-cancellation / nilpotency: A XOR A = []', () => {
			assert.deepStrictEqual(xorSortedArrSeries(A, A), []);
			assert.deepStrictEqual(xorSortedArrSeries(B, B), []);
		});

		test('involution / reversibility: (A XOR B) XOR B = A', () => {
			const ab = xorSortedArrSeries(A, B);
			assert.deepStrictEqual(xorSortedArrSeries(ab, B), A);
			assert.deepStrictEqual(xorSortedArrSeries(A, ab), B);
		});

		test('commutativity and permutation invariance', () => {
			assert.deepStrictEqual(xorSortedArrSeries(A, B), xorSortedArrSeries(B, A));

			const expected = xorSortedArrSeries(A, B, C, D);
			assert.deepStrictEqual(xorSortedArrSeries(D, C, B, A), expected);
			assert.deepStrictEqual(xorSortedArrSeries(B, D, A, C), expected);
			assert.deepStrictEqual(xorSortedArrSeries(C, A, D, B), expected);
		});

		test('associativity: (A XOR B) XOR C = A XOR (B XOR C) = XOR(A, B, C)', () => {
			const left = xorSortedArrSeries(xorSortedArrSeries(A, B), C);
			const right = xorSortedArrSeries(A, xorSortedArrSeries(B, C));
			const series = xorSortedArrSeries(A, B, C);
			assert.deepStrictEqual(left, right);
			assert.deepStrictEqual(left, series);
		});

		test('repeated identical arrays obey parity: k copies => [] if even, A if odd', () => {
			for (let k = 0; k <= 6; k++) {
				const copies = Array.from({ length: k }, () => A);
				assert.deepStrictEqual(xorSortedArrSeries(...copies), k % 2 === 0 ? [] : A);
			}
		});

		test('matches closed-form set identities (A \\ B) ∪ (B \\ A) and (A ∪ B) \\ (A ∩ B)', () => {
			const setA = new Set(A);
			const setB = new Set(B);
			const unionMinusIntersection = [...new Set([...A, ...B])]
				.filter((x) => !(setA.has(x) && setB.has(x)))
				.sort((x, y) => x - y);
			const diffUnion = [
				...A.filter((x) => !setB.has(x)),
				...B.filter((x) => !setA.has(x)),
			].sort((x, y) => x - y);

			const actual = xorSortedArrSeries(A, B);
			assert.deepStrictEqual(actual, unionMinusIntersection);
			assert.deepStrictEqual(actual, diffUnion);
		});
	});

	describe('independent reference cross-checks (seeded randomized trials)', () => {
		test('matches Map parity counter and Set fold across 60 random multi-array suites', () => {
			const rng = createRng(0x5eed1234);

			for (let trial = 0; trial < 60; trial++) {
				const numArrays = Math.floor(rng() * 10); // 0..9 arrays
				const arrays = [];
				for (let a = 0; a < numArrays; a++) {
					const len = Math.floor(rng() * 25);
					const set = new Set();
					for (let j = 0; j < len; j++) {
						// Mix of negative/positive integers and half-integers
						const raw = Math.floor(rng() * 41) - 20;
						const val = rng() < 0.3 ? raw + 0.5 : raw;
						set.add(val === 0 ? 0 : val);
					}
					const sorted = [...set].sort((x, y) => x - y);
					arrays.push(sorted);
				}

				const actual = xorSortedArrSeries(...arrays);
				const expectedMap = referenceXorParityMap(...arrays);
				const expectedSet = referenceXorSetFold(...arrays);

				assertStrictlyIncreasingCanonical(actual);
				assert.deepStrictEqual(actual, expectedMap);
				assert.deepStrictEqual(actual, expectedSet);
			}
		});
	});

	describe('input validation errors', () => {
		test('throws TypeError for non-Array arguments', () => {
			const invalidArgs = [null, undefined, 42, '1,2', {}, new Set([1, 2]), new Int32Array([1, 2])];
			for (const bad of invalidArgs) {
				assert.throws(() => xorSortedArrSeries(bad), TypeError);
				assert.throws(() => xorSortedArrSeries([1, 2], bad), TypeError);
				assert.throws(() => xorSortedArrSeries([], [1], bad), TypeError);
			}
		});

		test('throws TypeError for non-number elements or sparse arrays', () => {
			assert.throws(() => xorSortedArrSeries(['1', '2']), TypeError);
			assert.throws(() => xorSortedArrSeries([1, null, 3]), TypeError);
			assert.throws(() => xorSortedArrSeries([1, undefined, 3]), TypeError);
			assert.throws(() => xorSortedArrSeries([1, true]), TypeError);
			assert.throws(() => xorSortedArrSeries([1n, 2n]), TypeError);
			assert.throws(() => xorSortedArrSeries([{}]), TypeError);

			// Sparse arrays
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => xorSortedArrSeries([1, , 3]), TypeError);
			assert.throws(() => xorSortedArrSeries(new Array(3)), TypeError);
		});

		test('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
			assert.throws(() => xorSortedArrSeries([NaN]), RangeError);
			assert.throws(() => xorSortedArrSeries([1, NaN, 3]), RangeError);
			assert.throws(() => xorSortedArrSeries([1, Infinity]), RangeError);
			assert.throws(() => xorSortedArrSeries([-Infinity, 0, 1]), RangeError);
			assert.throws(() => xorSortedArrSeries([1, 2], [0, Infinity]), RangeError);
		});

		test('throws RangeError for unsorted arrays', () => {
			assert.throws(() => xorSortedArrSeries([2, 1]), RangeError);
			assert.throws(() => xorSortedArrSeries([1, 3, 2, 4]), RangeError);
			assert.throws(() => xorSortedArrSeries([0, -1]), RangeError);
			assert.throws(() => xorSortedArrSeries([1, 2], [5, 4]), RangeError);
		});

		test('throws RangeError for duplicate elements (including -0 and +0)', () => {
			assert.throws(() => xorSortedArrSeries([1, 1]), RangeError);
			assert.throws(() => xorSortedArrSeries([1, 2, 2, 3]), RangeError);
			assert.throws(() => xorSortedArrSeries([-0, 0]), RangeError);
			assert.throws(() => xorSortedArrSeries([0, -0]), RangeError);
			assert.throws(() => xorSortedArrSeries([], [1, 2, 2]), RangeError);
		});
	});
});
