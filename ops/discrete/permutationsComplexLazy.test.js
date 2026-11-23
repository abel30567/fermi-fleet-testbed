import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsComplexLazy } from './permutationsComplexLazy.js';

/**
 * Helper to create a complex number `{ re, im }`.
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
const c = (re, im) => ({ re, im });

/**
 * Computes exact falling factorial P(n, k) = n! / (n - k)!.
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function fallingFactorial(n, k) {
	if (k > n) return 0;
	let res = 1;
	for (let i = 0; i < k; i++) {
		res *= n - i;
	}
	return res;
}

/**
 * Independent recursive backtracking reference implementation for k-permutations.
 * @template T
 * @param {T[]} items
 * @param {number} k
 * @returns {T[][]}
 */
function referencePermutations(items, k) {
	const results = [];
	const used = new Array(items.length).fill(false);
	const current = [];

	function backtrack() {
		if (current.length === k) {
			results.push(current.slice());
			return;
		}
		for (let i = 0; i < items.length; i++) {
			if (used[i]) continue;
			used[i] = true;
			current.push(items[i]);
			backtrack();
			current.pop();
			used[i] = false;
		}
	}

	backtrack();
	return results;
}

/**
 * Canonical string key for a permutation of complex numbers.
 * @param {{ re: number, im: number }[]} perm
 * @returns {string}
 */
const permKey = (perm) => perm.map((z) => `(${z.re},${z.im})`).join('|');

/**
 * Complex multiplication helper for algebraic invariant cross-checks.
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re
});

describe('permutationsComplexLazy', () => {
	describe('normal cases', () => {
		it('generates full permutations for 1, 2, and 3 complex numbers', () => {
			const z1 = c(1, 2);
			const z2 = c(-3, 0.5);
			const z3 = c(0, -4);

			assert.deepStrictEqual([...permutationsComplexLazy([z1])], [[z1]]);

			assert.deepStrictEqual([...permutationsComplexLazy([z1, z2])], [
				[z1, z2],
				[z2, z1]
			]);

			assert.deepStrictEqual([...permutationsComplexLazy([z1, z2, z3])], [
				[z1, z2, z3],
				[z1, z3, z2],
				[z2, z1, z3],
				[z2, z3, z1],
				[z3, z1, z2],
				[z3, z2, z1]
			]);
		});

		it('generates k-permutations for k < n and k === n', () => {
			const items = [c(1, 0), c(0, 1), c(-1, 0)];

			const p1 = [...permutationsComplexLazy(items, 1)];
			assert.deepStrictEqual(p1, [[c(1, 0)], [c(0, 1)], [c(-1, 0)]]);

			const p2 = [...permutationsComplexLazy(items, 2)];
			assert.equal(p2.length, 6);
			const expected2 = new Set(referencePermutations(items, 2).map(permKey));
			assert.deepStrictEqual(new Set(p2.map(permKey)), expected2);

			const p3 = [...permutationsComplexLazy(items, 3)];
			assert.deepStrictEqual(p3, referencePermutations(items, 3));
		});

		it('accepts diverse iterables: Set, generator, and custom iterable', () => {
			const a = c(2, -1);
			const b = c(0, 3);
			const expected = [
				[a, b],
				[b, a]
			];

			assert.deepStrictEqual([...permutationsComplexLazy(new Set([a, b]))], expected);

			function* gen() {
				yield a;
				yield b;
			}
			assert.deepStrictEqual([...permutationsComplexLazy(gen())], expected);

			const customIterable = {
				[Symbol.iterator]() {
					const arr = [a, b];
					let idx = 0;
					return {
						next() {
							return idx < arr.length
								? { value: arr[idx++], done: false }
								: { value: undefined, done: true };
						}
					};
				}
			};
			assert.deepStrictEqual([...permutationsComplexLazy(customIterable)], expected);
		});

		it('treats duplicate complex values as distinct by position', () => {
			const dup = [c(1, 1), c(1, 1), c(2, 0)];
			const full = [...permutationsComplexLazy(dup)];
			assert.equal(full.length, 6);

			const pairs = [...permutationsComplexLazy(dup, 2)];
			assert.equal(pairs.length, 6);
		});
	});

	describe('edge cases', () => {
		it('handles empty iterable for full, k = 0, and k > 0', () => {
			assert.deepStrictEqual([...permutationsComplexLazy([])], [[]]);
			assert.deepStrictEqual([...permutationsComplexLazy([], 0)], [[]]);
			assert.deepStrictEqual([...permutationsComplexLazy([], 1)], []);
			assert.deepStrictEqual([...permutationsComplexLazy([], 5)], []);
		});

		it('handles k = 0 and k > n for non-empty iterables', () => {
			const items = [c(1, 2), c(3, 4)];
			assert.deepStrictEqual([...permutationsComplexLazy(items, 0)], [[]]);
			assert.deepStrictEqual([...permutationsComplexLazy(items, 3)], []);
			assert.deepStrictEqual([...permutationsComplexLazy(items, 100)], []);
		});

		it('defensively clones yielded arrays and complex objects and strips extra properties', () => {
			const src = [
				{ re: 1, im: 2, tag: 'a' },
				{ re: 3, im: 4, tag: 'b' }
			];
			const gen = permutationsComplexLazy(src);

			const first = gen.next().value;
			assert.deepStrictEqual(first, [c(1, 2), c(3, 4)]);
			assert.equal('tag' in first[0], false);

			// Mutate yielded array, yielded elements, and original input objects
			first[0].re = 999;
			first.push(c(7, 7));
			src[0].im = -999;

			const second = gen.next().value;
			assert.deepStrictEqual(second, [c(3, 4), c(1, 2)]);
		});
	});

	describe('lazy and streaming behavior', () => {
		it('returns a standard iterable generator without eagerly consuming input', () => {
			let pulled = 0;
			function* source() {
				pulled++;
				yield c(1, 0);
				pulled++;
				yield c(2, 0);
			}

			const gen = permutationsComplexLazy(source(), 2);
			assert.equal(typeof gen.next, 'function');
			assert.equal(gen[Symbol.iterator](), gen);
			assert.equal(pulled, 0);
		});

		it('streams k-permutations lazily without over-consuming the input iterable', () => {
			let pulled = 0;
			function* countingStream(limit) {
				for (let i = 0; i < limit; i++) {
					pulled++;
					yield c(i, -i);
				}
			}

			const gen = permutationsComplexLazy(countingStream(1000), 2);

			// First 2! = 2 permutations should only pull 2 elements from the stream
			const first = gen.next();
			assert.equal(first.done, false);
			assert.equal(pulled, 2);

			const second = gen.next();
			assert.equal(second.done, false);
			assert.equal(pulled, 2);

			// The 3rd permutation requires pulling the 3rd element (4 new permutations: 2 * P(2,1) = 4)
			const third = gen.next();
			assert.equal(third.done, false);
			assert.equal(pulled, 3);

			for (let i = 0; i < 3; i++) {
				assert.equal(gen.next().done, false);
			}
			assert.equal(pulled, 3);

			// The 7th permutation pulls the 4th element
			const seventh = gen.next();
			assert.equal(seventh.done, false);
			assert.equal(pulled, 4);
		});

		it('streams k-permutations from an infinite complex generator without hanging', () => {
			function* infiniteComplex() {
				let n = 0;
				while (true) {
					yield c(n, n * 0.5);
					n++;
				}
			}

			for (const k of [1, 2, 3]) {
				const gen = permutationsComplexLazy(infiniteComplex(), k);
				const seen = new Set();
				const takeCount = 30;
				for (let i = 0; i < takeCount; i++) {
					const step = gen.next();
					assert.equal(step.done, false);
					assert.equal(step.value.length, k);
					// All elements within a permutation must be distinct
					const innerKeys = new Set(step.value.map((z) => `${z.re},${z.im}`));
					assert.equal(innerKeys.size, k);
					const key = permKey(step.value);
					assert.equal(seen.has(key), false, `Duplicate permutation yielded: ${key}`);
					seen.add(key);
				}
				assert.equal(seen.size, takeCount);
			}
		});

		it('does not pull any elements when k = 0', () => {
			let pulled = 0;
			function* explodingStream() {
				pulled++;
				throw new Error('should not be pulled');
			}

			assert.deepStrictEqual([...permutationsComplexLazy(explodingStream(), 0)], [[]]);
			assert.equal(pulled, 0);
		});

		it('lazily generates prefix of full permutations on large n without materializing n!', () => {
			// 12! = 479,001,600; taking first 5 should be instantaneous
			const twelve = Array.from({ length: 12 }, (_, i) => c(i, -i));
			const gen = permutationsComplexLazy(twelve);
			const taken = [];
			for (let i = 0; i < 5; i++) {
				taken.push(gen.next().value);
			}
			assert.equal(taken.length, 5);
			assert.equal(new Set(taken.map(permKey)).size, 5);
			// Verify lexicographic progression of last 3 elements
			assert.deepStrictEqual(taken[0][11], c(11, -11));
			assert.deepStrictEqual(taken[1][10], c(11, -11));
			assert.deepStrictEqual(taken[1][11], c(10, -10));
		});

		it('closes the underlying source iterator on early termination', () => {
			let closed = false;
			function* trackedStream() {
				try {
					let i = 0;
					while (true) {
						yield c(i, i);
						i++;
					}
				} finally {
					closed = true;
				}
			}

			let count = 0;
			for (const perm of permutationsComplexLazy(trackedStream(), 2)) {
				assert.equal(perm.length, 2);
				if (++count === 3) break;
			}
			assert.equal(closed, true);
		});
	});

	describe('invalid input handling', () => {
		it('rejects non-iterable and string inputs synchronously', () => {
			for (const bad of [null, undefined, 42, true, {}, 'abc']) {
				assert.throws(() => permutationsComplexLazy(bad), TypeError);
				assert.throws(() => permutationsComplexLazy(bad, 0), TypeError);
			}
		});

		it('rejects invalid k values synchronously', () => {
			const valid = [c(1, 0), c(2, 0)];
			for (const badType of ['2', null, {}, [], true, 2n]) {
				assert.throws(() => permutationsComplexLazy(valid, badType), TypeError);
			}
			for (const badRange of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => permutationsComplexLazy(valid, badRange), RangeError);
			}
		});

		it('rejects malformed complex elements lazily upon consumption', () => {
			const typeBadElements = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null }
			];
			for (const bad of typeBadElements) {
				assert.throws(() => [...permutationsComplexLazy([bad])], TypeError);
			}

			const rangeBadElements = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity }
			];
			for (const bad of rangeBadElements) {
				assert.throws(() => [...permutationsComplexLazy([bad])], RangeError);
			}

			// Verify lazy validation: bad element at index 2 is not hit when only consuming first 2! = 2 permutations
			const gen = permutationsComplexLazy([c(1, 0), c(2, 0), { re: NaN, im: 0 }], 2);
			assert.equal(gen.next().done, false);
			assert.equal(gen.next().done, false);
			assert.throws(() => gen.next(), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent backtracking reference implementation for all 0 <= n <= 5 and 0 <= k <= n + 1', () => {
			const master = [c(1, 2), c(-3, 4), c(0, -5), c(2.5, 0), c(-1.5, -2.5)];

			for (let n = 0; n <= 5; n++) {
				const slice = master.slice(0, n);

				// Full permutations (k omitted) match exact order and content
				const fullActual = [...permutationsComplexLazy(slice)];
				const fullRef = referencePermutations(slice, n);
				assert.equal(fullActual.length, fallingFactorial(n, n));
				assert.deepStrictEqual(fullActual, fullRef);

				// k-permutations match exact set and cardinality P(n, k)
				for (let k = 0; k <= n + 1; k++) {
					const actual = [...permutationsComplexLazy(slice, k)];
					const ref = referencePermutations(slice, k);
					const expectedCount = fallingFactorial(n, k);

					assert.equal(actual.length, expectedCount);
					assert.equal(ref.length, expectedCount);

					const actualSet = new Set(actual.map(permKey));
					const refSet = new Set(ref.map(permKey));
					assert.equal(actualSet.size, expectedCount);
					assert.deepStrictEqual(actualSet, refSet);
				}
			}
		});

		it('satisfies complex algebraic symmetry invariants over permutations', () => {
			const nums = [c(1, 2), c(3, -1), c(-2, 4), c(0, -3), c(2, 1)];
			const n = nums.length;

			// Expected sum and product of all elements
			const totalSum = nums.reduce(
				(acc, z) => ({ re: acc.re + z.re, im: acc.im + z.im }),
				c(0, 0)
			);
			const totalProd = nums.reduce(cMul, c(1, 0));

			// Full permutations preserve sum and complex product in every single permutation
			for (const perm of permutationsComplexLazy(nums)) {
				const s = perm.reduce((acc, z) => ({ re: acc.re + z.re, im: acc.im + z.im }), c(0, 0));
				const p = perm.reduce(cMul, c(1, 0));
				assert.deepStrictEqual(s, totalSum);
				assert.deepStrictEqual(p, totalProd);
			}

			// In k-permutations, each element appears P(n - 1, k - 1) times in every position pos
			for (let k = 1; k <= n; k++) {
				const posSums = Array.from({ length: k }, () => c(0, 0));
				let count = 0;
				for (const perm of permutationsComplexLazy(nums, k)) {
					count++;
					for (let pos = 0; pos < k; pos++) {
						posSums[pos].re += perm[pos].re;
						posSums[pos].im += perm[pos].im;
					}
				}
				assert.equal(count, fallingFactorial(n, k));
				const factor = fallingFactorial(n - 1, k - 1);
				const expectedPosSum = c(totalSum.re * factor, totalSum.im * factor);
				for (let pos = 0; pos < k; pos++) {
					assert.deepStrictEqual(posSums[pos], expectedPosSum);
				}
			}
		});
	});
});
