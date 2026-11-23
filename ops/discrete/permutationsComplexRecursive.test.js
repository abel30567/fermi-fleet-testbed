import assert from 'node:assert/strict';
import test from 'node:test';
import { permutationsComplexRecursive } from './permutationsComplexRecursive.js';

/**
 * Serializes a single permutation of complex numbers into a canonical string key
 * so sets/multisets of permutations can be compared independent of generation order.
 *
 * @param {Array<{ re: number, im: number }>} perm
 * @returns {string}
 */
function serializePerm(perm) {
	return perm.map((z) => `(${z.re},${z.im})`).join('|');
}

/**
 * Independent iterative Heap's algorithm for full permutations (cross-check oracle).
 *
 * @param {Array<{ re: number, im: number }>} items
 * @returns {Array<Array<{ re: number, im: number }>>}
 */
function heapsPermutations(items) {
	const arr = items.map((z) => ({
		re: z.re === 0 ? 0 : z.re,
		im: z.im === 0 ? 0 : z.im,
	}));
	const n = arr.length;
	const c = new Array(n).fill(0);
	const out = [arr.map((z) => ({ re: z.re, im: z.im }))];

	let i = 0;
	while (i < n) {
		if (c[i] < i) {
			const swapIdx = i % 2 === 0 ? 0 : c[i];
			const tmp = arr[swapIdx];
			arr[swapIdx] = arr[i];
			arr[i] = tmp;
			out.push(arr.map((z) => ({ re: z.re, im: z.im })));
			c[i] += 1;
			i = 0;
		} else {
			c[i] = 0;
			i += 1;
		}
	}
	return out;
}

/**
 * Independent backtracking oracle for k-permutations.
 *
 * @param {Array<{ re: number, im: number }>} items
 * @param {number} k
 * @returns {Array<Array<{ re: number, im: number }>>}
 */
function backtrackKPermutations(items, k) {
	const used = new Array(items.length).fill(false);
	const current = [];
	const out = [];

	function step() {
		if (current.length === k) {
			out.push(
				current.map((z) => ({
					re: z.re === 0 ? 0 : z.re,
					im: z.im === 0 ? 0 : z.im,
				})),
			);
			return;
		}
		for (let i = 0; i < items.length; i += 1) {
			if (used[i]) continue;
			used[i] = true;
			current.push(items[i]);
			step();
			current.pop();
			used[i] = false;
		}
	}

	step();
	return out;
}

/**
 * Computes falling factorial P(n, k) = n! / (n - k)!.
 *
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function fallingFactorial(n, k) {
	let prod = 1;
	for (let i = 0; i < k; i += 1) {
		prod *= n - i;
	}
	return prod;
}

test('full permutations of 2 and 3 complex numbers', () => {
	const a = { re: 1, im: 2 };
	const b = { re: -3, im: 0.5 };
	const c = { re: 0, im: -4 };

	const perms2 = permutationsComplexRecursive([a, b]);
	assert.equal(perms2.length, 2);
	assert.deepEqual(
		perms2.map(serializePerm).sort(),
		[serializePerm([a, b]), serializePerm([b, a])].sort(),
	);

	const perms3 = permutationsComplexRecursive([a, b, c]);
	assert.equal(perms3.length, 6);
	const expected3 = [
		[a, b, c],
		[a, c, b],
		[b, a, c],
		[b, c, a],
		[c, a, b],
		[c, b, a],
	];
	assert.deepEqual(
		perms3.map(serializePerm).sort(),
		expected3.map(serializePerm).sort(),
	);
});

test('partial k-permutations for k = 0, 1, 2, 3, 4 on 4 complex numbers', () => {
	const items = [
		{ re: 1, im: 0 },
		{ re: 0, im: 1 },
		{ re: -1, im: 0 },
		{ re: 0, im: -1 },
	];

	for (let k = 0; k <= items.length; k += 1) {
		const actual = permutationsComplexRecursive(items, k);
		const expected = backtrackKPermutations(items, k);

		assert.equal(actual.length, fallingFactorial(items.length, k));
		for (const perm of actual) {
			assert.equal(perm.length, k);
		}
		assert.deepEqual(
			actual.map(serializePerm).sort(),
			expected.map(serializePerm).sort(),
		);
	}
});

test('edge cases: empty array, single element, -0 normalization, duplicates', () => {
	assert.deepEqual(permutationsComplexRecursive([]), [[]]);
	assert.deepEqual(permutationsComplexRecursive([], 0), [[]]);

	assert.deepEqual(permutationsComplexRecursive([{ re: 3, im: -4 }]), [
		[{ re: 3, im: -4 }],
	]);
	assert.deepEqual(permutationsComplexRecursive([{ re: 3, im: -4 }], 0), [[]]);

	// -0 is normalized to +0
	const zeroPerms = permutationsComplexRecursive([{ re: -0, im: -0 }]);
	assert.equal(zeroPerms.length, 1);
	assert.equal(Object.is(zeroPerms[0][0].re, 0), true);
	assert.equal(Object.is(zeroPerms[0][0].im, 0), true);

	// Duplicates are treated positionally (3! = 6 permutations)
	const dupInput = [
		{ re: 1, im: 1 },
		{ re: 1, im: 1 },
		{ re: 2, im: -2 },
	];
	const dupPerms = permutationsComplexRecursive(dupInput);
	assert.equal(dupPerms.length, 6);
	assert.deepEqual(
		dupPerms.map(serializePerm).sort(),
		heapsPermutations(dupInput).map(serializePerm).sort(),
	);
});

test('immutability and cloning: inputs and outputs share no mutable references', () => {
	const z1 = { re: 2, im: 3, extra: 'ignored' };
	const z2 = { re: -1, im: 5 };
	const input = [z1, z2];
	const snapshot = structuredClone(input);

	const result = permutationsComplexRecursive(input);

	// Input is not mutated
	assert.deepEqual(input, snapshot);

	// Returned objects contain only { re, im }
	for (const perm of result) {
		for (const elem of perm) {
			assert.deepEqual(Object.keys(elem).sort(), ['im', 're']);
		}
	}

	// Mutating one output element does not affect inputs or other permutations
	result[0][0].re = 999;
	assert.equal(z1.re, 2);
	assert.equal(z2.re, -1);
	assert.notEqual(result[1][0].re, 999);
	assert.notEqual(result[1][1].re, 999);
});

test('invalid inputs throw descriptive TypeError or RangeError', () => {
	// Non-array items
	for (const bad of [null, undefined, 42, 'abc', { re: 1, im: 2 }]) {
		assert.throws(() => permutationsComplexRecursive(bad), TypeError);
	}

	// Sparse array
	const sparse = new Array(2);
	sparse[0] = { re: 1, im: 0 };
	assert.throws(() => permutationsComplexRecursive(sparse), TypeError);

	// Invalid elements
	for (const badElem of [
		null,
		undefined,
		5,
		'1+2i',
		[1, 2],
		{ re: 1 },
		{ im: 2 },
		{ re: '1', im: 0 },
		{ re: 1, im: null },
	]) {
		assert.throws(() => permutationsComplexRecursive([badElem]), TypeError);
	}

	// Non-finite complex components
	for (const badFinite of [
		{ re: Number.NaN, im: 0 },
		{ re: 0, im: Number.NaN },
		{ re: Number.POSITIVE_INFINITY, im: 1 },
		{ re: 1, im: Number.NEGATIVE_INFINITY },
	]) {
		assert.throws(() => permutationsComplexRecursive([badFinite]), RangeError);
	}

	// Invalid k values
	const sample = [
		{ re: 1, im: 0 },
		{ re: 0, im: 1 },
	];
	for (const badKType of ['1', null, {}, true]) {
		assert.throws(() => permutationsComplexRecursive(sample, badKType), TypeError);
	}
	for (const badKRange of [-1, 1.5, 3, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => permutationsComplexRecursive(sample, badKRange), RangeError);
	}
	assert.throws(() => permutationsComplexRecursive([], 1), RangeError);

	// Combinatorial safety guard (11! > 362,880)
	const eleven = Array.from({ length: 11 }, (_, idx) => ({ re: idx, im: -idx }));
	assert.throws(() => permutationsComplexRecursive(eleven), RangeError);
});

test('independent cross-check against Heap algorithm and complex sum invariant', () => {
	const roots = [
		{ re: 1, im: 0 },
		{ re: 0.5, im: 0.8660254037844386 },
		{ re: -0.5, im: 0.8660254037844386 },
		{ re: -1, im: 0 },
		{ re: -0.5, im: -0.8660254037844386 },
		{ re: 0.5, im: -0.8660254037844386 },
	];

	// Cross-check n = 1..6 against iterative Heap's algorithm
	for (let n = 1; n <= roots.length; n += 1) {
		const slice = roots.slice(0, n);
		const actual = permutationsComplexRecursive(slice);
		const oracle = heapsPermutations(slice);

		assert.equal(actual.length, oracle.length);
		assert.deepEqual(
			actual.map(serializePerm).sort(),
			oracle.map(serializePerm).sort(),
		);
	}

	// Cross-check algebraic invariant on k-permutations:
	// Every element appears in each of the k positions exactly P(n - 1, k - 1) times,
	// so summing all entries across all P(n, k) permutations gives:
	//   k * P(n - 1, k - 1) * sum(items)
	const items = [
		{ re: 1.5, im: -2.25 },
		{ re: -3, im: 4.5 },
		{ re: 2.25, im: 0.75 },
		{ re: 0.5, im: -1.5 },
		{ re: -1.25, im: 3.25 },
	];
	const sumRe = items.reduce((acc, z) => acc + z.re, 0);
	const sumIm = items.reduce((acc, z) => acc + z.im, 0);

	for (let k = 1; k <= items.length; k += 1) {
		const perms = permutationsComplexRecursive(items, k);
		assert.equal(perms.length, fallingFactorial(items.length, k));

		let totalRe = 0;
		let totalIm = 0;
		for (const perm of perms) {
			for (const z of perm) {
				totalRe += z.re;
				totalIm += z.im;
			}
		}

		const weight = k * fallingFactorial(items.length - 1, k - 1);
		assert.ok(Math.abs(totalRe - weight * sumRe) < 1e-9);
		assert.ok(Math.abs(totalIm - weight * sumIm) < 1e-9);
	}
});
