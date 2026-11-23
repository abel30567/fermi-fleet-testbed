import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceMask32Memo } from './setDifferenceMask32Memo.js';

/**
 * Independent reference converter: Uint32Array bitmask -> Set<number> of set bit indices.
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToIndexSet(mask) {
	const set = new Set();
	for (let w = 0; w < mask.length; w += 1) {
		const word = mask[w];
		for (let bit = 0; bit < 32; bit += 1) {
			if (((word >>> bit) & 1) === 1) {
				set.add(w * 32 + bit);
			}
		}
	}
	return set;
}

/**
 * Independent reference converter: Set<number> of bit indices -> Uint32Array bitmask.
 *
 * @param {Set<number>} set
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function indexSetToMask(set, wordCount) {
	const mask = new Uint32Array(wordCount);
	for (const idx of set) {
		const w = Math.floor(idx / 32);
		const bit = idx % 32;
		mask[w] = (mask[w] | (1 << bit)) >>> 0;
	}
	return mask;
}

/**
 * Deterministic xorshift32 PRNG for reproducible cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= (state << 13) >>> 0;
		state ^= state >>> 17;
		state ^= (state << 5) >>> 0;
		return state >>> 0;
	};
}

describe('setDifferenceMask32Memo', () => {
	describe('normal cases', () => {
		it('computes single-word set differences accurately', () => {
			const a = new Uint32Array([0b11001010]);
			const b = new Uint32Array([0b10101000]);
			const res = setDifferenceMask32Memo(a, b);

			assert.ok(res instanceof Uint32Array);
			assert.deepEqual(res, new Uint32Array([0b01000010]));
		});

		it('computes multi-word set differences across word boundaries', () => {
			const a = new Uint32Array([0xdeadbeef, 0x00ff00ff, 0x12345678, 0x80000001]);
			const b = new Uint32Array([0x0f0f0f0f, 0x0000ffff, 0xf0f0f0f0, 0x00000001]);
			const expected = new Uint32Array([
				(0xdeadbeef & ~0x0f0f0f0f) >>> 0,
				(0x00ff00ff & ~0x0000ffff) >>> 0,
				(0x12345678 & ~0xf0f0f0f0) >>> 0,
				0x80000000,
			]);

			assert.deepEqual(setDifferenceMask32Memo(a, b), expected);
		});

		it('handles high bit (bit 31) without signed integer corruption', () => {
			const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000000, 0x7fffffff]);
			const b = new Uint32Array([0x00000000, 0x7fffffff, 0x80000000, 0x80000000]);
			const res = setDifferenceMask32Memo(a, b);

			assert.deepEqual(
				res,
				new Uint32Array([0x80000000, 0x80000000, 0x00000000, 0x7fffffff]),
			);
			assert.equal(res[0], 2147483648);
			assert.equal(res[1], 2147483648);
		});

		it('does not mutate input arrays by default', () => {
			const a = new Uint32Array([0xf0f0f0f0, 0xaaaaaaaa]);
			const b = new Uint32Array([0x0f0f0f0f, 0x55555555]);
			const aCopy = new Uint32Array(a);
			const bCopy = new Uint32Array(b);

			const res = setDifferenceMask32Memo(a, b);
			assert.notEqual(res, a);
			assert.notEqual(res, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
			assert.deepEqual(res, new Uint32Array([0xf0f0f0f0, 0xaaaaaaaa]));
		});
	});

	describe('edge cases', () => {
		it('handles empty Uint32Array inputs', () => {
			const a = new Uint32Array(0);
			const b = new Uint32Array(0);
			const res = setDifferenceMask32Memo(a, b);

			assert.ok(res instanceof Uint32Array);
			assert.equal(res.length, 0);
		});

		it('satisfies set-theoretic boundary identities (empty, universal, self)', () => {
			const a = new Uint32Array([0x13579bdf, 0x2468ace0, 0x80000001]);
			const empty = new Uint32Array([0, 0, 0]);
			const universal = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]);

			// A \ ∅ = A
			assert.deepEqual(setDifferenceMask32Memo(a, empty), a);
			// ∅ \ A = ∅
			assert.deepEqual(setDifferenceMask32Memo(empty, a), empty);
			// A \ A = ∅ (including identical object reference)
			assert.deepEqual(setDifferenceMask32Memo(a, a), empty);
			assert.deepEqual(setDifferenceMask32Memo(a, new Uint32Array(a)), empty);
			// A \ U = ∅
			assert.deepEqual(setDifferenceMask32Memo(a, universal), empty);
			// U \ A = ~A
			assert.deepEqual(
				setDifferenceMask32Memo(universal, a),
				new Uint32Array([(~a[0]) >>> 0, (~a[1]) >>> 0, (~a[2]) >>> 0]),
			);
		});

		it('works with subarray views having non-zero byteOffset', () => {
			const backingA = new Uint32Array([0xffffffff, 0x0f0f0f0f, 0xf0f0f0f0, 0x11111111]);
			const backingB = new Uint32Array([0x00000000, 0x00ff00ff, 0xff00ff00, 0xffffffff]);

			const viewA = backingA.subarray(1, 3);
			const viewB = backingB.subarray(1, 3);
			const res = setDifferenceMask32Memo(viewA, viewB);

			assert.deepEqual(res, new Uint32Array([0x0f000f00, 0x00f000f0]));
		});

		it('supports optional out buffer (disjoint, in-place, and shifted overlapping views)', () => {
			const a = new Uint32Array([0x12345678, 0x9abcdef0, 0xffffffff]);
			const b = new Uint32Array([0x0f0f0f0f, 0x00ff00ff, 0x55555555]);
			const expected = new Uint32Array([0x10305070, 0x9a00de00, 0xaaaaaaaa]);

			// Disjoint pre-allocated output
			const out = new Uint32Array(3);
			const ret = setDifferenceMask32Memo(a, b, out);
			assert.equal(ret, out);
			assert.deepEqual(out, expected);

			// In-place out === a
			const aInPlace = new Uint32Array(a);
			assert.equal(setDifferenceMask32Memo(aInPlace, b, aInPlace), aInPlace);
			assert.deepEqual(aInPlace, expected);

			// In-place out === b
			const bInPlace = new Uint32Array(b);
			assert.equal(setDifferenceMask32Memo(a, bInPlace, bInPlace), bInPlace);
			assert.deepEqual(bInPlace, expected);

			// Shifted overlapping views in the same ArrayBuffer
			const shared = new Uint32Array([0x0f0f0f0f, 0x33333333, 0x55555555, 0xaaaaaaaa]);
			const viewA = shared.subarray(0, 3);
			const viewB = shared.subarray(1, 4);
			const expectedOverlap = setDifferenceMask32Memo(
				new Uint32Array(viewA),
				new Uint32Array(viewB),
			);
			const viewOut = shared.subarray(1, 4);
			const overlapRet = setDifferenceMask32Memo(viewA, viewB, viewOut);
			assert.equal(overlapRet, viewOut);
			assert.deepEqual(viewOut, expectedOverlap);
		});

		it('handles repeated word pairs (memo hits) and high-cardinality eviction cleanly', () => {
			const count = 8192; // Exceeds 4096-slot memo cache to force evictions & collisions
			const a = new Uint32Array(count);
			const b = new Uint32Array(count);
			const rng = makeRng(0xcafebabe);

			for (let i = 0; i < count; i += 1) {
				if (i % 4 === 0) {
					// Repeated hot pairs to exercise cache hits
					a[i] = 0xa5a5a5a5;
					b[i] = 0x0f0f0f0f;
				} else {
					a[i] = rng();
					b[i] = rng();
				}
			}

			const first = setDifferenceMask32Memo(a, b);
			const second = setDifferenceMask32Memo(a, b);

			assert.deepEqual(second, first);
			for (let i = 0; i < count; i += 1) {
				assert.equal(first[i], (a[i] & ~b[i]) >>> 0);
			}
		});
	});

	describe('input validation', () => {
		const invalidTypes = [
			null,
			undefined,
			0,
			42,
			'mask',
			{},
			[1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2, 3, 4]),
			new Uint16Array([1, 2]),
			new Float32Array([1, 2]),
			new ArrayBuffer(8),
		];

		it('throws TypeError when argument "a" is not a Uint32Array', () => {
			const validB = new Uint32Array([1, 2]);
			for (const bad of invalidTypes) {
				assert.throws(
					() => setDifferenceMask32Memo(bad, validB),
					{ name: 'TypeError' },
				);
			}
		});

		it('throws TypeError when argument "b" is not a Uint32Array', () => {
			const validA = new Uint32Array([1, 2]);
			for (const bad of invalidTypes) {
				assert.throws(
					() => setDifferenceMask32Memo(validA, bad),
					{ name: 'TypeError' },
				);
			}
		});

		it('throws RangeError when "a" and "b" have different lengths', () => {
			assert.throws(
				() => setDifferenceMask32Memo(new Uint32Array(2), new Uint32Array(3)),
				{ name: 'RangeError' },
			);
			assert.throws(
				() => setDifferenceMask32Memo(new Uint32Array(0), new Uint32Array(1)),
				{ name: 'RangeError' },
			);
		});

		it('validates optional "out" argument type and length', () => {
			const a = new Uint32Array([1, 2]);
			const b = new Uint32Array([3, 4]);

			for (const bad of invalidTypes) {
				if (bad === undefined) continue;
				assert.throws(
					() => setDifferenceMask32Memo(a, b, bad),
					{ name: 'TypeError' },
				);
			}

			assert.throws(
				() => setDifferenceMask32Memo(a, b, new Uint32Array(1)),
				{ name: 'RangeError' },
			);
			assert.throws(
				() => setDifferenceMask32Memo(a, b, new Uint32Array(3)),
				{ name: 'RangeError' },
			);
		});
	});

	describe('independent cross-checks', () => {
		it('exhaustively verifies all 65,536 byte pairs across all 4 byte lanes of a 32-bit word', () => {
			const a = new Uint32Array(65536);
			const b = new Uint32Array(65536);

			for (let lane = 0; lane < 4; lane += 1) {
				const shift = lane * 8;
				let idx = 0;
				for (let x = 0; x < 256; x += 1) {
					const aw = (x << shift) >>> 0;
					for (let y = 0; y < 256; y += 1) {
						a[idx] = aw;
						b[idx] = (y << shift) >>> 0;
						idx += 1;
					}
				}

				const actual = setDifferenceMask32Memo(a, b);
				for (let i = 0; i < 65536; i += 1) {
					const expected = (a[i] & ~b[i]) >>> 0;
					if (actual[i] !== expected) {
						assert.fail(
							`Mismatch at lane ${lane}, index ${i}: got ${actual[i]}, expected ${expected}`,
						);
					}
				}
			}
		});

		it('matches independent JS Set<number> difference and set-algebra laws on pseudo-random masks', () => {
			const rng = makeRng(0x12345678);
			const lengths = [1, 2, 5, 16, 64];

			for (const len of lengths) {
				const a = new Uint32Array(len);
				const b = new Uint32Array(len);
				const c = new Uint32Array(len);
				for (let i = 0; i < len; i += 1) {
					a[i] = rng();
					b[i] = rng();
					c[i] = rng();
				}

				// Independent Set<number> reference calculation
				const setA = maskToIndexSet(a);
				const setB = maskToIndexSet(b);
				const setDiff = new Set();
				for (const elem of setA) {
					if (!setB.has(elem)) {
						setDiff.add(elem);
					}
				}
				const expectedFromSet = indexSetToMask(setDiff, len);
				const actual = setDifferenceMask32Memo(a, b);
				assert.deepEqual(actual, expectedFromSet);

				// Algebraic law 1: (A \ B) ∩ B = ∅ and (A \ B) ∪ (A ∩ B) = A
				for (let i = 0; i < len; i += 1) {
					assert.equal((actual[i] & b[i]) >>> 0, 0);
					assert.equal((actual[i] | (a[i] & b[i])) >>> 0, a[i]);
				}

				// Algebraic law 2: A \ (B ∪ C) === (A \ B) \ C
				const bUnionC = new Uint32Array(len);
				for (let i = 0; i < len; i += 1) {
					bUnionC[i] = (b[i] | c[i]) >>> 0;
				}
				const lhs = setDifferenceMask32Memo(a, bUnionC);
				const rhs = setDifferenceMask32Memo(setDifferenceMask32Memo(a, b), c);
				assert.deepEqual(lhs, rhs);
			}
		});
	});
});
