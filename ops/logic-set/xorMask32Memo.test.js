import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorMask32Memo } from './xorMask32Memo.js';

/**
 * Independent bit-set reference implementation: converts each Uint32Array mask
 * into a Set of active bit indices, computes the set symmetric difference
 * `(A \ B) U (B \ A)`, and packs the resulting bit indices back into a Uint32Array.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function referenceSetSymmetricDiff(a, b) {
	const setA = new Set();
	const setB = new Set();

	for (let w = 0; w < a.length; w++) {
		const wordA = a[w];
		const wordB = b[w];
		for (let bit = 0; bit < 32; bit++) {
			const mask = (1 << bit) >>> 0;
			if ((wordA & mask) !== 0) setA.add(w * 32 + bit);
			if ((wordB & mask) !== 0) setB.add(w * 32 + bit);
		}
	}

	const diff = new Set();
	for (const idx of setA) {
		if (!setB.has(idx)) diff.add(idx);
	}
	for (const idx of setB) {
		if (!setA.has(idx)) diff.add(idx);
	}

	const out = new Uint32Array(a.length);
	for (const idx of diff) {
		const w = Math.floor(idx / 32);
		const bit = idx % 32;
		out[w] = (out[w] | ((1 << bit) >>> 0)) >>> 0;
	}
	return out;
}

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz/cross-check vectors.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makePrng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= (state << 13) >>> 0;
		state ^= state >>> 17;
		state ^= (state << 5) >>> 0;
		return state >>> 0;
	};
}

describe('xorMask32Memo', () => {
	describe('normal cases', () => {
		it('computes word-wise bitwise XOR over multi-word Uint32Array masks', () => {
			const a = new Uint32Array([0x00000000, 0xffffffff, 0x55555555, 0xdeadbeef, 0x80000001]);
			const b = new Uint32Array([0x00000000, 0xffffffff, 0xaaaaaaaa, 0x0f0f0f0f, 0x7fffffff]);
			const res = xorMask32Memo(a, b);

			assert.ok(res instanceof Uint32Array);
			assert.deepEqual(res, new Uint32Array([0x00000000, 0x00000000, 0xffffffff, 0xd1a2b1e0, 0xfffffffe]));
		});

		it('does not mutate inputs when out is omitted', () => {
			const a = new Uint32Array([0x12345678, 0x9abcdef0]);
			const b = new Uint32Array([0xfedcba98, 0x76543210]);
			const aCopy = new Uint32Array(a);
			const bCopy = new Uint32Array(b);

			const res = xorMask32Memo(a, b);

			assert.notEqual(res, a);
			assert.notEqual(res, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});

		it('satisfies algebraic laws of bitwise XOR / symmetric difference', () => {
			const a = new Uint32Array([0x13579bdf, 0x80000000, 0x00ff00ff, 0xabcdef01]);
			const b = new Uint32Array([0x2468ace0, 0x7fffffff, 0xff00ff00, 0x10fedcba]);
			const c = new Uint32Array([0x01234567, 0x89abcdef, 0x5a5a5a5a, 0xa5a5a5a5]);
			const zero = new Uint32Array(4);
			const ones = new Uint32Array(4).fill(0xffffffff);

			// Identity: a ^ 0 = a
			assert.deepEqual(xorMask32Memo(a, zero), a);
			// Self-inverse: a ^ a = 0
			assert.deepEqual(xorMask32Memo(a, a), zero);
			// Involution: (a ^ b) ^ b = a
			assert.deepEqual(xorMask32Memo(xorMask32Memo(a, b), b), a);
			// Commutativity: a ^ b = b ^ a
			assert.deepEqual(xorMask32Memo(a, b), xorMask32Memo(b, a));
			// Associativity: (a ^ b) ^ c = a ^ (b ^ c)
			assert.deepEqual(
				xorMask32Memo(xorMask32Memo(a, b), c),
				xorMask32Memo(a, xorMask32Memo(b, c)),
			);
			// Complement: a ^ ~0 = ~a
			const complement = new Uint32Array(a.length);
			for (let i = 0; i < a.length; i++) complement[i] = (~a[i]) >>> 0;
			assert.deepEqual(xorMask32Memo(a, ones), complement);
		});
	});

	describe('edge cases', () => {
		it('handles empty Uint32Array masks', () => {
			const emptyA = new Uint32Array(0);
			const emptyB = new Uint32Array(0);
			const res = xorMask32Memo(emptyA, emptyB);

			assert.ok(res instanceof Uint32Array);
			assert.equal(res.length, 0);

			const out = new Uint32Array(0);
			assert.equal(xorMask32Memo(emptyA, emptyB, out), out);
		});

		it('handles single-word MSB and boundary values without sign-bit corruption', () => {
			const cases = [
				[0x00000000, 0x80000000, 0x80000000],
				[0x80000000, 0x80000000, 0x00000000],
				[0xffffffff, 0x00000000, 0xffffffff],
				[0xffffffff, 0x80000000, 0x7fffffff],
				[0x7fffffff, 0x80000000, 0xffffffff],
				[0x00000001, 0x80000000, 0x80000001],
			];
			for (const [wa, wb, expected] of cases) {
				const res = xorMask32Memo(new Uint32Array([wa]), new Uint32Array([wb]));
				assert.equal(res[0], expected);
			}
		});

		it('handles subarray views with non-zero byteOffset', () => {
			const backingA = new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444]);
			const backingB = new Uint32Array([0xaaaaaaaa, 0xbbbbbbbb, 0xcccccccc, 0xdddddddd]);
			const viewA = backingA.subarray(1, 3);
			const viewB = backingB.subarray(2, 4);

			const res = xorMask32Memo(viewA, viewB);
			assert.deepEqual(
				res,
				new Uint32Array([(0x22222222 ^ 0xcccccccc) >>> 0, (0x33333333 ^ 0xdddddddd) >>> 0]),
			);
		});

		it('supports optional out buffer including in-place aliasing and partial overlaps', () => {
			const a0 = new Uint32Array([0x01020304, 0x8090a0b0, 0xfedcba98, 0x13579bdf]);
			const b0 = new Uint32Array([0xf0e0d0c0, 0x0f1e2d3c, 0x12345678, 0x80000001]);
			const expected = xorMask32Memo(a0, b0);

			// Separate out buffer
			const out = new Uint32Array(4);
			const ret = xorMask32Memo(a0, b0, out);
			assert.equal(ret, out);
			assert.deepEqual(out, expected);

			// In-place out === a
			const aInPlace = new Uint32Array(a0);
			assert.equal(xorMask32Memo(aInPlace, b0, aInPlace), aInPlace);
			assert.deepEqual(aInPlace, expected);

			// In-place out === b
			const bInPlace = new Uint32Array(b0);
			assert.equal(xorMask32Memo(a0, bInPlace, bInPlace), bInPlace);
			assert.deepEqual(bInPlace, expected);

			// In-place a === b === out
			const same = new Uint32Array(a0);
			assert.equal(xorMask32Memo(same, same, same), same);
			assert.deepEqual(same, new Uint32Array(4));

			// Partially overlapping subarray views (forward shift: out starts after a)
			const shared1 = new Uint32Array([0x11223344, 0x55667788, 0x99aabbcc, 0xddeeff00, 0x00000000]);
			const expectedOverlap1 = xorMask32Memo(
				new Uint32Array(shared1.subarray(0, 4)),
				new Uint32Array(shared1.subarray(1, 5)),
			);
			const outView1 = shared1.subarray(1, 5);
			assert.equal(xorMask32Memo(shared1.subarray(0, 4), shared1.subarray(1, 5), outView1), outView1);
			assert.deepEqual(outView1, expectedOverlap1);

			// Partially overlapping subarray views (reverse shift: out starts before a)
			const shared2 = new Uint32Array([0x00000000, 0x11223344, 0x55667788, 0x99aabbcc, 0xddeeff00]);
			const expectedOverlap2 = xorMask32Memo(
				new Uint32Array(shared2.subarray(1, 5)),
				new Uint32Array(shared2.subarray(0, 4)),
			);
			const outView2 = shared2.subarray(0, 4);
			assert.equal(xorMask32Memo(shared2.subarray(1, 5), shared2.subarray(0, 4), outView2), outView2);
			assert.deepEqual(outView2, expectedOverlap2);
		});

		it('remains consistent across repeated memoized lookups, symmetric pairs, and cache evictions', () => {
			const rand = makePrng(0xc0ffee42);
			const size = 2048; // Exceeds 1024-slot memo cache to exercise evictions
			const a = new Uint32Array(size);
			const b = new Uint32Array(size);

			for (let i = 0; i < size; i++) {
				// Mix repeated hot pairs and unique random words
				if (i % 7 === 0) {
					a[i] = 0xdeadbeef;
					b[i] = 0xcafebabe;
				} else if (i % 7 === 1) {
					a[i] = 0xcafebabe;
					b[i] = 0xdeadbeef;
				} else {
					a[i] = rand();
					b[i] = rand();
				}
			}

			const first = xorMask32Memo(a, b);
			const second = xorMask32Memo(a, b);
			const swapped = xorMask32Memo(b, a);

			assert.deepEqual(first, second);
			assert.deepEqual(first, swapped);
			for (let i = 0; i < size; i++) {
				assert.equal(first[i], (a[i] ^ b[i]) >>> 0);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Uint32Array inputs', () => {
			const valid = new Uint32Array([1, 2]);
			const invalidValues = [
				null,
				undefined,
				[1, 2],
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				new Uint16Array([1, 2]),
				new Float32Array([1, 2]),
				new ArrayBuffer(8),
				'1234',
				42,
				{},
			];

			for (const bad of invalidValues) {
				assert.throws(() => xorMask32Memo(bad, valid), TypeError);
				assert.throws(() => xorMask32Memo(valid, bad), TypeError);
				if (bad !== undefined) {
					assert.throws(() => xorMask32Memo(valid, valid, bad), TypeError);
				}
			}
		});

		it('throws RangeError for mismatched mask lengths', () => {
			const a = new Uint32Array([1, 2, 3]);
			const b = new Uint32Array([1, 2]);
			const outShort = new Uint32Array(2);
			const outLong = new Uint32Array(4);

			assert.throws(() => xorMask32Memo(a, b), RangeError);
			assert.throws(() => xorMask32Memo(b, a), RangeError);
			assert.throws(() => xorMask32Memo(a, new Uint32Array(3), outShort), RangeError);
			assert.throws(() => xorMask32Memo(a, new Uint32Array(3), outLong), RangeError);
		});

		it('throws TypeError if an ArrayBuffer has been detached (when transfer is supported)', () => {
			if (typeof ArrayBuffer.prototype.transfer !== 'function') {
				return;
			}
			const a = new Uint32Array(2);
			const b = new Uint32Array(2);
			a.buffer.transfer();

			assert.throws(() => xorMask32Memo(a, b), TypeError);
			assert.throws(() => xorMask32Memo(b, a), TypeError);
		});
	});

	describe('independent cross-check', () => {
		it('matches set-based symmetric difference across all 256 byte values in every byte lane', () => {
			// Verify every byte lane (0, 1, 2, 3) across all 256 values
			for (let lane = 0; lane < 4; lane++) {
				const shift = lane * 8;
				const a = new Uint32Array(256);
				const b = new Uint32Array(256);
				for (let v = 0; v < 256; v++) {
					a[v] = (v << shift) >>> 0;
					b[v] = (((255 - v) ^ 0x5a) << shift) >>> 0;
				}
				const actual = xorMask32Memo(a, b);
				const expected = referenceSetSymmetricDiff(a, b);
				assert.deepEqual(actual, expected);
			}
		});

		it('matches set-based symmetric difference on deterministic pseudo-random multi-word masks', () => {
			const rand = makePrng(0x12345678);
			for (const wordCount of [1, 2, 5, 16, 64]) {
				const a = new Uint32Array(wordCount);
				const b = new Uint32Array(wordCount);
				for (let i = 0; i < wordCount; i++) {
					a[i] = rand();
					b[i] = rand();
				}
				const actual = xorMask32Memo(a, b);
				const expected = referenceSetSymmetricDiff(a, b);
				assert.deepEqual(actual, expected);
			}
		});
	});
});
