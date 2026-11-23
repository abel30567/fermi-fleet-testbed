import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionMask32Memo } from './unionMask32Memo.js';

/**
 * Independent reference implementation using JavaScript Set over bit indices.
 * Decodes each Uint32Array into a Set of integer element indices, takes the
 * mathematical set union, and re-encodes back into a Uint32Array.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function referenceSetUnion(a, b) {
	const bits = new Set();
	for (let w = 0; w < a.length; w++) {
		const word = a[w];
		for (let bit = 0; bit < 32; bit++) {
			if (((word >>> bit) & 1) === 1) {
				bits.add(w * 32 + bit);
			}
		}
	}
	for (let w = 0; w < b.length; w++) {
		const word = b[w];
		for (let bit = 0; bit < 32; bit++) {
			if (((word >>> bit) & 1) === 1) {
				bits.add(w * 32 + bit);
			}
		}
	}

	const len = Math.max(a.length, b.length);
	const result = new Uint32Array(len);
	for (const idx of bits) {
		const w = Math.floor(idx / 32);
		const bit = idx % 32;
		result[w] = (result[w] | (1 << bit)) >>> 0;
	}
	return result;
}

/**
 * Simple deterministic PRNG (Mulberry32) for reproducible randomized tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0);
	};
}

describe('unionMask32Memo', () => {
	describe('normal cases', () => {
		it('computes union of disjoint single-word masks', () => {
			const a = new Uint32Array([0x0f0f0f0f]);
			const b = new Uint32Array([0xf0f0f0f0]);
			const res = unionMask32Memo(a, b);
			assert.ok(res instanceof Uint32Array);
			assert.deepEqual(res, new Uint32Array([0xffffffff]));
		});

		it('computes union of overlapping multi-word masks', () => {
			const a = new Uint32Array([0x00ff00ff, 0x12345678, 0x80000001]);
			const b = new Uint32Array([0x0f0f0f0f, 0x87654321, 0x40000002]);
			const res = unionMask32Memo(a, b);
			assert.deepEqual(
				res,
				new Uint32Array([0x0fff0fff, 0x97755779, 0xc0000003])
			);
		});

		it('preserves unsigned 32-bit high bit (0x80000000) without sign corruption', () => {
			const a = new Uint32Array([0x80000000, 0x80000000, 0x00000000]);
			const b = new Uint32Array([0x00000000, 0x7fffffff, 0x80000001]);
			const res = unionMask32Memo(a, b);
			assert.deepEqual(res, new Uint32Array([0x80000000, 0xffffffff, 0x80000001]));
		});

		it('does not mutate input arrays', () => {
			const a = new Uint32Array([0x11223344, 0x55667788]);
			const b = new Uint32Array([0x88776655, 0x44332211]);
			const aCopy = a.slice();
			const bCopy = b.slice();
			const res = unionMask32Memo(a, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
			assert.notEqual(res, a);
			assert.notEqual(res, b);
		});

		it('satisfies algebraic laws: identity, absorbing element, idempotence, commutativity, associativity', () => {
			const zero = new Uint32Array([0, 0, 0]);
			const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]);
			const a = new Uint32Array([0xdeadbeef, 0x00112233, 0xa5a5a5a5]);
			const b = new Uint32Array([0xcafebabe, 0x44556677, 0x5a5a5a5a]);
			const c = new Uint32Array([0x01234567, 0x89abcdef, 0x00ff00ff]);

			// Identity
			assert.deepEqual(unionMask32Memo(a, zero), a);
			assert.deepEqual(unionMask32Memo(zero, a), a);

			// Absorbing element
			assert.deepEqual(unionMask32Memo(a, ones), ones);
			assert.deepEqual(unionMask32Memo(ones, a), ones);

			// Idempotence
			assert.deepEqual(unionMask32Memo(a, a), a);

			// Commutativity
			assert.deepEqual(unionMask32Memo(a, b), unionMask32Memo(b, a));

			// Associativity
			assert.deepEqual(
				unionMask32Memo(unionMask32Memo(a, b), c),
				unionMask32Memo(a, unionMask32Memo(b, c))
			);
		});
	});

	describe('edge cases', () => {
		it('handles empty Uint32Array inputs', () => {
			const emptyA = new Uint32Array(0);
			const emptyB = new Uint32Array(0);
			const res = unionMask32Memo(emptyA, emptyB);
			assert.ok(res instanceof Uint32Array);
			assert.equal(res.length, 0);
		});

		it('handles one empty and one non-empty mask', () => {
			const empty = new Uint32Array(0);
			const nonEmpty = new Uint32Array([0x1, 0x80000000]);
			assert.deepEqual(unionMask32Memo(empty, nonEmpty), nonEmpty);
			assert.deepEqual(unionMask32Memo(nonEmpty, empty), nonEmpty);
		});

		it('zero-extends shorter masks when lengths differ', () => {
			const shortMask = new Uint32Array([0x0000ffff]);
			const longMask = new Uint32Array([0x00ff0000, 0x12345678, 0x80000001]);
			const expected = new Uint32Array([0x00ffffff, 0x12345678, 0x80000001]);

			assert.deepEqual(unionMask32Memo(shortMask, longMask), expected);
			assert.deepEqual(unionMask32Memo(longMask, shortMask), expected);
		});

		it('handles subarray views with non-zero byteOffset', () => {
			const buf = new Uint32Array([0xffffffff, 0x0f0f0f0f, 0x00ff00ff, 0xffffffff]);
			const a = buf.subarray(1, 3);
			const b = new Uint32Array([0x0000f0f0, 0xff000000]);
			assert.deepEqual(unionMask32Memo(a, b), new Uint32Array([0x0f0fffff, 0xffff00ff]));
		});

		it('writes into a preallocated output buffer and leaves trailing words untouched', () => {
			const a = new Uint32Array([0x0000000f, 0x0000f000]);
			const b = new Uint32Array([0x000000f0, 0x000f0000]);
			const out = new Uint32Array([0x11111111, 0x22222222, 0xdeadbeef]);
			const returned = unionMask32Memo(a, b, out);

			assert.equal(returned, out);
			assert.deepEqual(out, new Uint32Array([0x000000ff, 0x000ff000, 0xdeadbeef]));
		});

		it('supports in-place aliasing when out === a or out === b', () => {
			const a = new Uint32Array([0x0000aaaa, 0x12340000]);
			const b = new Uint32Array([0x55550000, 0x00005678]);
			const returned = unionMask32Memo(a, b, a);
			assert.equal(returned, a);
			assert.deepEqual(a, new Uint32Array([0x5555aaaa, 0x12345678]));

			const c = new Uint32Array([0x00000001, 0x80000000]);
			const d = new Uint32Array([0x00000002, 0x00000004]);
			const returned2 = unionMask32Memo(c, d, d);
			assert.equal(returned2, d);
			assert.deepEqual(d, new Uint32Array([0x00000003, 0x80000004]));
		});

		it('safely handles shifted overlapping ArrayBuffer views', () => {
			const backing = new Uint32Array([0x00000001, 0x00000002, 0x00000004, 0x00000008]);
			const a = backing.subarray(0, 3); // [1, 2, 4]
			const b = new Uint32Array([0x00000010, 0x00000020, 0x00000040]);
			const out = backing.subarray(1, 4); // overlaps a at offset +4 bytes

			const returned = unionMask32Memo(a, b, out);
			assert.equal(returned, out);
			assert.deepEqual(out, new Uint32Array([0x00000011, 0x00000022, 0x00000044]));
		});

		it('produces consistent results across repeated calls (memo hits and cache evictions)', () => {
			const rng = createRng(42);
			const size = 8192; // exceeds 4096-slot direct-mapped cache to exercise evictions
			const a = new Uint32Array(size);
			const b = new Uint32Array(size);
			for (let i = 0; i < size; i++) {
				// Mix repeated pairs and unique pairs
				if (i % 4 === 0) {
					a[i] = 0xaaaaaaaa;
					b[i] = 0x55555555;
				} else if (i % 4 === 1) {
					a[i] = 0;
					b[i] = 0;
				} else {
					a[i] = rng();
					b[i] = rng();
				}
			}

			const first = unionMask32Memo(a, b);
			const second = unionMask32Memo(a, b);
			assert.deepEqual(first, second);
			for (let i = 0; i < size; i++) {
				assert.equal(first[i], (a[i] | b[i]) >>> 0);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError when first argument is not a Uint32Array', () => {
			const valid = new Uint32Array([1]);
			const invalidInputs = [
				undefined,
				null,
				42,
				'123',
				true,
				{},
				[1, 2],
				new Int32Array([1]),
				new Uint8Array([1, 2, 3, 4]),
				new Uint16Array([1, 2]),
				new Float32Array([1]),
				new BigUint64Array([1n]),
			];

			for (const bad of invalidInputs) {
				assert.throws(() => unionMask32Memo(bad, valid), TypeError);
			}
		});

		it('throws TypeError when second argument is not a Uint32Array', () => {
			const valid = new Uint32Array([1]);
			const invalidInputs = [
				undefined,
				null,
				0,
				'abc',
				[],
				new Int32Array([1]),
				new Uint8Array([1, 2, 3, 4]),
			];

			for (const bad of invalidInputs) {
				assert.throws(() => unionMask32Memo(valid, bad), TypeError);
			}
		});

		it('throws TypeError when optional out argument is not a Uint32Array', () => {
			const a = new Uint32Array([1, 2]);
			const b = new Uint32Array([3, 4]);
			for (const badOut of [null, 123, 'out', {}, [0, 0], new Int32Array(2), new Uint8Array(8)]) {
				assert.throws(() => unionMask32Memo(a, b, badOut), TypeError);
			}
		});

		it('throws RangeError when optional out buffer is too small', () => {
			const a = new Uint32Array([1, 2, 3]);
			const b = new Uint32Array([4, 5]);
			assert.throws(() => unionMask32Memo(a, b, new Uint32Array(2)), RangeError);
			assert.throws(() => unionMask32Memo(b, a, new Uint32Array(0)), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent Set-based bit-index union across randomized masks of varied lengths', () => {
			const rng = createRng(20261123);
			const lengths = [
				[0, 0],
				[1, 1],
				[1, 5],
				[7, 2],
				[16, 16],
				[33, 19],
				[64, 64],
			];

			for (const [lenA, lenB] of lengths) {
				const a = new Uint32Array(lenA);
				const b = new Uint32Array(lenB);
				for (let i = 0; i < lenA; i++) a[i] = rng();
				for (let i = 0; i < lenB; i++) b[i] = rng();

				const actual = unionMask32Memo(a, b);
				const expected = referenceSetUnion(a, b);
				assert.deepEqual(actual, expected);
			}
		});

		it('matches direct bitwise OR across all 4 byte lanes for boundary and patterned bytes', () => {
			const sampleBytes = [0x00, 0x01, 0x02, 0x0f, 0x10, 0x55, 0x7f, 0x80, 0xaa, 0xfe, 0xff];
			const total = sampleBytes.length * sampleBytes.length;

			for (let lane = 0; lane < 4; lane++) {
				const shift = lane * 8;
				const a = new Uint32Array(total);
				const b = new Uint32Array(total);
				let idx = 0;
				for (const x of sampleBytes) {
					for (const y of sampleBytes) {
						a[idx] = (x << shift) >>> 0;
						b[idx] = (y << shift) >>> 0;
						idx++;
					}
				}

				const actual = unionMask32Memo(a, b);
				for (let i = 0; i < total; i++) {
					assert.equal(actual[i], (a[i] | b[i]) >>> 0);
				}
			}
		});
	});
});
