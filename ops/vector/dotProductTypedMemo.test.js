import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductTypedMemo } from './dotProductTypedMemo.js';

/**
 * Independent reference dot product using a naive reduce over plain arrays.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {number}
 */
function naiveDot(a, b) {
	return Array.from(a).reduce((acc, val, idx) => acc + val * b[idx], 0);
}

describe('dotProductTypedMemo', () => {
	beforeEach(() => {
		dotProductTypedMemo.clearCache();
	});

	it('computes dot product for standard integer and floating-point vectors', () => {
		const a = new Float64Array([1, 2, 3]);
		const b = new Float64Array([4, 5, 6]);
		assert.equal(dotProductTypedMemo(a, b), 32);

		const c = new Float64Array([1.5, -2.25, 0.5, 4.0]);
		const d = new Float64Array([2.0, 4.0, -6.0, 0.25]);
		assert.equal(dotProductTypedMemo(c, d), 1.5 * 2 - 2.25 * 4 + 0.5 * -6 + 4 * 0.25);
	});

	it('handles empty Float64Array inputs (precomputed entry)', () => {
		const emptyA = new Float64Array(0);
		const emptyB = new Float64Array(0);
		assert.equal(dotProductTypedMemo(emptyA, emptyB), 0);
		assert.equal(dotProductTypedMemo.getCacheStats().hits, 1);
		assert.equal(dotProductTypedMemo.getCacheStats().misses, 0);
	});

	it('returns 0 for orthogonal vectors', () => {
		const x = new Float64Array([1, 0, 0]);
		const y = new Float64Array([0, 1, 0]);
		assert.equal(dotProductTypedMemo(x, y), 0);

		const u = new Float64Array([3, -4, 0, 5]);
		const v = new Float64Array([4, 3, 99, 0]);
		assert.equal(dotProductTypedMemo(u, v), 0);
	});

	it('handles table-boundary values, out-of-table integers, and special IEEE-754 values', () => {
		const boundaryA = new Float64Array([-32, 32, -33, 33, 0, -0]);
		const boundaryB = new Float64Array([32, -32, 33, -33, 17, 17]);
		assert.equal(dotProductTypedMemo(boundaryA, boundaryB), naiveDot(boundaryA, boundaryB));

		const withInf = new Float64Array([Infinity, 1]);
		const finite = new Float64Array([2, 3]);
		assert.equal(dotProductTypedMemo(withInf, finite), Infinity);

		const withNaN = new Float64Array([NaN, 1]);
		assert.ok(Number.isNaN(dotProductTypedMemo(withNaN, finite)));
	});

	it('respects Float64Array subarray views with non-zero byteOffset', () => {
		const backing = new Float64Array([100, 1, 2, 3, 200, 4, 5, 6, 300]);
		const viewA = backing.subarray(1, 4); // [1, 2, 3]
		const viewB = backing.subarray(5, 8); // [4, 5, 6]
		assert.equal(dotProductTypedMemo(viewA, viewB), 32);
	});

	it('throws TypeError for invalid input types', () => {
		const valid = new Float64Array([1, 2, 3]);
		const invalidInputs = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			null,
			undefined,
			'123',
			42,
			{},
		];

		for (const bad of invalidInputs) {
			assert.throws(
				() => dotProductTypedMemo(bad, valid),
				{ name: 'TypeError' },
			);
			assert.throws(
				() => dotProductTypedMemo(valid, bad),
				{ name: 'TypeError' },
			);
		}
	});

	it('throws RangeError for mismatched vector lengths', () => {
		const a = new Float64Array([1, 2, 3]);
		const b = new Float64Array([1, 2]);
		assert.throws(
			() => dotProductTypedMemo(a, b),
			{ name: 'RangeError' },
		);
		assert.throws(
			() => dotProductTypedMemo(new Float64Array(0), b),
			{ name: 'RangeError' },
		);
	});

	it('memoizes repeated and commutative calls and stays safe across in-place mutations', () => {
		const a = new Float64Array([2, -3, 5, 7]);
		const b = new Float64Array([11, 13, -17, 19]);

		const first = dotProductTypedMemo(a, b);
		assert.equal(first, 2 * 11 - 3 * 13 - 5 * 17 + 7 * 19);
		assert.deepEqual(
			{ hits: dotProductTypedMemo.getCacheStats().hits, misses: dotProductTypedMemo.getCacheStats().misses },
			{ hits: 0, misses: 1 },
		);

		// Same instances -> cache hit
		assert.equal(dotProductTypedMemo(a, b), first);
		// Equal values in distinct Float64Array instances -> cache hit
		assert.equal(
			dotProductTypedMemo(new Float64Array([2, -3, 5, 7]), new Float64Array([11, 13, -17, 19])),
			first,
		);
		// Commutative call (b, a) -> cache hit
		assert.equal(dotProductTypedMemo(b, a), first);
		assert.deepEqual(
			{ hits: dotProductTypedMemo.getCacheStats().hits, misses: dotProductTypedMemo.getCacheStats().misses },
			{ hits: 3, misses: 1 },
		);

		// Mutating input in-place must NOT return stale cached value
		a[0] = 100;
		const mutated = dotProductTypedMemo(a, b);
		assert.equal(mutated, naiveDot(a, b));
		assert.notEqual(mutated, first);
		assert.equal(dotProductTypedMemo.getCacheStats().misses, 2);
	});

	it('evicts oldest entries when cache exceeds capacity', () => {
		const { maxEntries } = dotProductTypedMemo.getCacheStats();
		for (let i = 1; i <= maxEntries + 25; i++) {
			const v = new Float64Array([i, 1]);
			const w = new Float64Array([1, i]);
			assert.equal(dotProductTypedMemo(v, w), 2 * i);
		}
		assert.equal(dotProductTypedMemo.getCacheStats().size, maxEntries);
	});

	it('satisfies commutativity, Cauchy-Schwarz inequality, and matches naive reduce cross-check', () => {
		// Deterministic pseudo-random generator (LCG) for reproducible testing
		let seed = 0x12345678;
		const nextFloat = () => {
			seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
			return (seed / 0x100000000) * 100 - 50;
		};

		for (const len of [1, 5, 32, 128]) {
			const a = new Float64Array(len);
			const b = new Float64Array(len);
			for (let i = 0; i < len; i++) {
				a[i] = i % 3 === 0 ? Math.trunc(nextFloat()) : nextFloat();
				b[i] = i % 3 === 0 ? Math.trunc(nextFloat()) : nextFloat();
			}

			const ab = dotProductTypedMemo(a, b);
			const ba = dotProductTypedMemo(b, a);
			const ref = naiveDot(a, b);

			// Exact match against naive reduce and commutativity
			assert.equal(ab, ref);
			assert.equal(ab, ba);

			// Cauchy-Schwarz: (a · b)^2 <= (a · a) * (b · b) (allowing tiny fp rounding epsilon)
			const aa = dotProductTypedMemo(a, a);
			const bb = dotProductTypedMemo(b, b);
			assert.ok(aa >= 0 && bb >= 0);
			assert.ok(ab * ab <= aa * bb * (1 + 1e-12) + 1e-12);
		}
	});
});
