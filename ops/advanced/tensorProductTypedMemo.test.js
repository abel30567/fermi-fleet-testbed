import test from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductTypedMemo } from './tensorProductTypedMemo.js';

/**
 * Independent naive reference implementation of the tensor product (outer product)
 * for cross-checking against `tensorProductTypedMemo`.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function referenceTensorProduct(a, b) {
	const result = new Float64Array(a.length * b.length);
	let idx = 0;
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			result[idx++] = a[i] * b[j];
		}
	}
	return result;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makePrng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

test('basic 1D Float64Array tensor product', () => {
	const a = new Float64Array([1, 2]);
	const b = new Float64Array([3, 4, 5]);
	const result = tensorProductTypedMemo(a, b);

	assert.ok(result instanceof Float64Array);
	assert.deepEqual(result, new Float64Array([3, 4, 5, 6, 8, 10]));
});

test('handles negative, fractional, and zero values', () => {
	const a = new Float64Array([-1.5, 0, 2.25]);
	const b = new Float64Array([4, -0.5]);
	const result = tensorProductTypedMemo(a, b);

	assert.deepEqual(result, new Float64Array([-6, 0.75, 0, -0, 9, -1.125]));
	assert.ok(Object.is(result[2], 0));
	assert.ok(Object.is(result[3], -0));
});

test('multi-way associative tensor product (3+ operands)', () => {
	const a = new Float64Array([1, 2]);
	const b = new Float64Array([3, 4]);
	const c = new Float64Array([5, 6]);

	const direct = tensorProductTypedMemo(a, b, c);
	const leftAssoc = tensorProductTypedMemo(tensorProductTypedMemo(a, b), c);
	const rightAssoc = tensorProductTypedMemo(a, tensorProductTypedMemo(b, c));

	assert.deepEqual(direct, new Float64Array([15, 18, 20, 24, 30, 36, 40, 48]));
	assert.deepEqual(direct, leftAssoc);
	assert.deepEqual(direct, rightAssoc);
});

test('edge cases: empty and single-element Float64Arrays', () => {
	const empty = new Float64Array(0);
	const single = new Float64Array([7]);
	const pair = new Float64Array([2, -3]);

	assert.deepEqual(tensorProductTypedMemo(empty, pair), new Float64Array(0));
	assert.deepEqual(tensorProductTypedMemo(pair, empty), new Float64Array(0));
	assert.deepEqual(tensorProductTypedMemo(empty, empty), new Float64Array(0));
	assert.deepEqual(tensorProductTypedMemo(pair, single, empty), new Float64Array(0));
	assert.deepEqual(tensorProductTypedMemo(single, single), new Float64Array([49]));
	assert.deepEqual(tensorProductTypedMemo(single, pair), new Float64Array([14, -21]));
});

test('edge cases: signed zero, Infinity, and NaN preserve IEEE-754 semantics across cache hits', () => {
	const posZero = new Float64Array([0, 1]);
	const negZero = new Float64Array([-0, 1]);
	const vec = new Float64Array([2, 3]);

	const rPos1 = tensorProductTypedMemo(posZero, vec);
	const rNeg1 = tensorProductTypedMemo(negZero, vec);
	const rPos2 = tensorProductTypedMemo(posZero, vec);
	const rNeg2 = tensorProductTypedMemo(negZero, vec);

	assert.ok(Object.is(rPos1[0], 0));
	assert.ok(Object.is(rPos2[0], 0));
	assert.ok(Object.is(rNeg1[0], -0));
	assert.ok(Object.is(rNeg2[0], -0));

	const specialA = new Float64Array([Infinity, -Infinity, NaN]);
	const specialB = new Float64Array([2, 0]);
	const rSpec1 = tensorProductTypedMemo(specialA, specialB);
	const rSpec2 = tensorProductTypedMemo(specialA, specialB);

	for (const rSpec of [rSpec1, rSpec2]) {
		assert.equal(rSpec[0], Infinity);
		assert.ok(Number.isNaN(rSpec[1]));
		assert.equal(rSpec[2], -Infinity);
		assert.ok(Number.isNaN(rSpec[3]));
		assert.ok(Number.isNaN(rSpec[4]));
		assert.ok(Number.isNaN(rSpec[5]));
	}
});

test('handles Float64Array subarray views with non-zero byteOffset', () => {
	const backing = new Float64Array([100, 2, 3, 4, 200, 5, 6, 300]);
	const viewA = backing.subarray(1, 4); // [2, 3, 4]
	const viewB = backing.subarray(5, 7); // [5, 6]

	const result = tensorProductTypedMemo(viewA, viewB);
	assert.deepEqual(result, new Float64Array([10, 12, 15, 18, 20, 24]));
});

test('memoization safety: output mutation and input mutation do not corrupt cache', () => {
	const a = new Float64Array([1.25, 2.5]);
	const b = new Float64Array([4, 8]);

	const first = tensorProductTypedMemo(a, b);
	assert.deepEqual(first, new Float64Array([5, 10, 10, 20]));

	// Mutating the returned array must not corrupt cached entries.
	first[0] = 99999;
	const second = tensorProductTypedMemo(a, b);
	assert.notEqual(first, second);
	assert.deepEqual(second, new Float64Array([5, 10, 10, 20]));

	// Mutating an input array must invalidate/miss the previous cache entry.
	a[0] = 10;
	const third = tensorProductTypedMemo(a, b);
	assert.deepEqual(third, new Float64Array([40, 80, 10, 20]));
});

test('cache eviction and large inputs exceeding table/memo thresholds', () => {
	// Exercise LRU cache eviction (> 256 distinct entries)
	for (let k = 0; k < 300; k++) {
		const a = new Float64Array([k, k + 1]);
		const b = new Float64Array([2, -3]);
		const res = tensorProductTypedMemo(a, b);
		assert.deepEqual(res, new Float64Array([2 * k, -3 * k, 2 * (k + 1), -3 * (k + 1)]));
	}

	// Medium shape: above precomputed table threshold (> 4096) but within memo limit (<= 65536)
	const medA = new Float64Array(80);
	const medB = new Float64Array(70);
	for (let i = 0; i < medA.length; i++) medA[i] = i - 40;
	for (let j = 0; j < medB.length; j++) medB[j] = (j + 1) * 0.5;
	const medRes1 = tensorProductTypedMemo(medA, medB);
	const medRes2 = tensorProductTypedMemo(medA, medB);
	assert.deepEqual(medRes1, referenceTensorProduct(medA, medB));
	assert.deepEqual(medRes2, medRes1);

	// Large shape: above memoization limit (> 65536)
	const bigA = new Float64Array(300);
	const bigB = new Float64Array(300);
	for (let i = 0; i < 300; i++) {
		bigA[i] = (i % 13) - 6;
		bigB[i] = (i % 7) * 0.25;
	}
	const bigRes = tensorProductTypedMemo(bigA, bigB);
	assert.equal(bigRes.length, 90000);
	assert.deepEqual(bigRes, referenceTensorProduct(bigA, bigB));
});

test('input validation throws TypeError on invalid arguments', () => {
	const valid = new Float64Array([1, 2]);

	assert.throws(() => tensorProductTypedMemo(), TypeError);
	assert.throws(() => tensorProductTypedMemo(valid), TypeError);
	assert.throws(() => tensorProductTypedMemo([1, 2], valid), TypeError);
	assert.throws(() => tensorProductTypedMemo(valid, [1, 2]), TypeError);
	assert.throws(() => tensorProductTypedMemo(new Float32Array([1, 2]), valid), TypeError);
	assert.throws(() => tensorProductTypedMemo(valid, new Int32Array([1, 2])), TypeError);
	assert.throws(() => tensorProductTypedMemo(null, valid), TypeError);
	assert.throws(() => tensorProductTypedMemo(valid, undefined), TypeError);
	assert.throws(() => tensorProductTypedMemo(valid, valid, 'bad'), TypeError);
	assert.throws(() => tensorProductTypedMemo(42, valid), TypeError);
});

test('independent cross-check against naive reference and algebraic identities', () => {
	const rand = makePrng(20261123);
	const randomVec = (len) => {
		const arr = new Float64Array(len);
		for (let i = 0; i < len; i++) {
			arr[i] = (rand() - 0.5) * 20;
		}
		return arr;
	};
	const dot = (u, v) => {
		let s = 0;
		for (let i = 0; i < u.length; i++) s += u[i] * v[i];
		return s;
	};
	const sum = (u) => {
		let s = 0;
		for (let i = 0; i < u.length; i++) s += u[i];
		return s;
	};

	const shapes = [
		[1, 5],
		[3, 4],
		[7, 11],
		[16, 16],
		[25, 40],
	];

	for (const [m, n] of shapes) {
		const a = randomVec(m);
		const b = randomVec(n);
		const actual = tensorProductTypedMemo(a, b);
		const expected = referenceTensorProduct(a, b);
		assert.deepEqual(actual, expected);

		// Sum identity: sum(a ⊗ b) == sum(a) * sum(b)
		const lhsSum = sum(actual);
		const rhsSum = sum(a) * sum(b);
		assert.ok(
			Math.abs(lhsSum - rhsSum) <= 1e-9 * Math.max(1, Math.abs(rhsSum)),
			`sum identity failed: ${lhsSum} vs ${rhsSum}`
		);

		// Mixed-product / inner-product identity: <a ⊗ b, c ⊗ d> == <a, c> * <b, d>
		const c = randomVec(m);
		const d = randomVec(n);
		const ab = tensorProductTypedMemo(a, b);
		const cd = tensorProductTypedMemo(c, d);
		const lhsInner = dot(ab, cd);
		const rhsInner = dot(a, c) * dot(b, d);
		assert.ok(
			Math.abs(lhsInner - rhsInner) <= 1e-9 * Math.max(1, Math.abs(rhsInner)),
			`inner-product identity failed: ${lhsInner} vs ${rhsInner}`
		);

		// Bilinearity: (alpha * a + beta * c) ⊗ b == alpha * (a ⊗ b) + beta * (c ⊗ b)
		const alpha = 1.7;
		const beta = -0.6;
		const linComb = new Float64Array(m);
		for (let i = 0; i < m; i++) linComb[i] = alpha * a[i] + beta * c[i];
		const lhsBilin = tensorProductTypedMemo(linComb, b);
		const cb = tensorProductTypedMemo(c, b);
		for (let k = 0; k < lhsBilin.length; k++) {
			const rhsVal = alpha * ab[k] + beta * cb[k];
			assert.ok(
				Math.abs(lhsBilin[k] - rhsVal) <= 1e-10 * Math.max(1, Math.abs(rhsVal)),
				`bilinearity failed at index ${k}: ${lhsBilin[k]} vs ${rhsVal}`
			);
		}
	}
});
