import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceMask32Iterative } from './setDifferenceMask32Iterative.js';

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz/cross-check tests.
 *
 * @param {number} seed - Non-zero 32-bit unsigned seed.
 * @returns {() => number} Next unsigned 32-bit integer generator.
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

/**
 * Converts a Set of non-negative element indices to a Uint32Array bitmask.
 *
 * @param {Set<number>} set
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function setToMask32(set, wordCount) {
	const mask = new Uint32Array(wordCount);
	for (const elem of set) {
		const wordIdx = Math.floor(elem / 32);
		const bitIdx = elem % 32;
		mask[wordIdx] = (mask[wordIdx] | (1 << bitIdx)) >>> 0;
	}
	return mask;
}

/**
 * Converts a Uint32Array bitmask to a Set of element indices whose bits are 1.
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function mask32ToSet(mask) {
	const result = new Set();
	for (let wordIdx = 0; wordIdx < mask.length; wordIdx++) {
		const word = mask[wordIdx];
		for (let bitIdx = 0; bitIdx < 32; bitIdx++) {
			if (((word >>> bitIdx) & 1) === 1) {
				result.add(wordIdx * 32 + bitIdx);
			}
		}
	}
	return result;
}

describe('setDifferenceMask32Iterative', () => {
	describe('normal cases', () => {
		test('computes single-word bitwise set difference A \\ B', () => {
			const a = new Uint32Array([0b11110000]);
			const b = new Uint32Array([0b10101010]);
			const diff = setDifferenceMask32Iterative(a, b);

			assert.ok(diff instanceof Uint32Array);
			assert.notEqual(diff, a);
			assert.notEqual(diff, b);
			assert.deepEqual(diff, new Uint32Array([0b01010000]));
			// Inputs remain unmutated.
			assert.deepEqual(a, new Uint32Array([0b11110000]));
			assert.deepEqual(b, new Uint32Array([0b10101010]));
		});

		test('computes multi-word bitwise set difference across multiple words', () => {
			const a = new Uint32Array([
				0xaaaaaaaa,
				0xf0f0f0f0,
				0xffffffff,
				0x12345678
			]);
			const b = new Uint32Array([
				0x55555555,
				0x00ff00ff,
				0x0f0f0f0f,
				0x12340000
			]);
			const expected = new Uint32Array([
				0xaaaaaaaa,
				0xf000f000,
				0xf0f0f0f0,
				0x00005678
			]);

			const diff = setDifferenceMask32Iterative(a, b);
			assert.deepEqual(diff, expected);
		});

		test('handles disjoint masks and subset/superset masks', () => {
			const oddBits = new Uint32Array([0xaaaaaaaa, 0xaaaaaaaa]);
			const evenBits = new Uint32Array([0x55555555, 0x55555555]);
			assert.deepEqual(setDifferenceMask32Iterative(oddBits, evenBits), oddBits);
			assert.deepEqual(setDifferenceMask32Iterative(evenBits, oddBits), evenBits);

			const sub = new Uint32Array([0x000f000f, 0x0000ffff]);
			const sup = new Uint32Array([0x00ff00ff, 0xffffffff]);
			assert.deepEqual(
				setDifferenceMask32Iterative(sub, sup),
				new Uint32Array([0, 0])
			);
			assert.deepEqual(
				setDifferenceMask32Iterative(sup, sub),
				new Uint32Array([0x00f000f0, 0xffff0000])
			);
		});
	});

	describe('edge cases', () => {
		test('handles empty Uint32Array bitmasks', () => {
			const a = new Uint32Array(0);
			const b = new Uint32Array(0);
			const diff = setDifferenceMask32Iterative(a, b);
			assert.ok(diff instanceof Uint32Array);
			assert.equal(diff.length, 0);
			assert.notEqual(diff, a);
		});

		test('preserves unsigned 32-bit semantics for MSB (bit 31)', () => {
			const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000001, 0x7fffffff]);
			const b = new Uint32Array([0x00000000, 0x80000000, 0x00000001, 0x80000000]);
			const expected = new Uint32Array([
				0x80000000,
				0x7fffffff,
				0x80000000,
				0x7fffffff
			]);
			assert.deepEqual(setDifferenceMask32Iterative(a, b), expected);
		});

		test('handles identity, empty, self-difference, and universe masks', () => {
			const a = new Uint32Array([0xdeadbeef, 0x80000001, 0x00000000]);
			const empty = new Uint32Array([0, 0, 0]);
			const full = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]);

			// A \ ∅ = A
			assert.deepEqual(setDifferenceMask32Iterative(a, empty), a);
			// ∅ \ A = ∅
			assert.deepEqual(setDifferenceMask32Iterative(empty, a), empty);
			// A \ A = ∅ (including same-reference aliasing)
			assert.deepEqual(setDifferenceMask32Iterative(a, a), empty);
			// A \ U = ∅
			assert.deepEqual(setDifferenceMask32Iterative(a, full), empty);
			// U \ A = ~A
			assert.deepEqual(
				setDifferenceMask32Iterative(full, a),
				new Uint32Array([0x21524110, 0x7ffffffe, 0xffffffff])
			);
		});

		test('supports optional preallocated out buffer, including in-place aliasing', () => {
			const a = new Uint32Array([0xff00ff00, 0x8000000f]);
			const b = new Uint32Array([0x0f0f0f0f, 0x00000005]);
			const expected = new Uint32Array([0xf000f000, 0x8000000a]);

			const out = new Uint32Array(2);
			const ret = setDifferenceMask32Iterative(a, b, out);
			assert.equal(ret, out);
			assert.deepEqual(out, expected);

			// In-place into a
			const aCopy = new Uint32Array(a);
			assert.equal(setDifferenceMask32Iterative(aCopy, b, aCopy), aCopy);
			assert.deepEqual(aCopy, expected);

			// In-place into b
			const bCopy = new Uint32Array(b);
			assert.equal(setDifferenceMask32Iterative(a, bCopy, bCopy), bCopy);
			assert.deepEqual(bCopy, expected);
		});

		test('handles subarray views and shifted overlapping out buffers safely', () => {
			const backing = new Uint32Array([
				0x11111111,
				0xffffffff,
				0xaaaaaaaa,
				0x0f0f0f0f,
				0x55555555
			]);
			const a = backing.subarray(1, 4); // [0xffffffff, 0xaaaaaaaa, 0x0f0f0f0f]
			const b = new Uint32Array([0x0f0f0f0f, 0x0000ffff, 0x00ff00ff]);
			const expected = new Uint32Array([0xf0f0f0f0, 0xaaaa0000, 0x0f000f00]);

			// Non-overlapping subarray read
			assert.deepEqual(setDifferenceMask32Iterative(a, b), expected);

			// Shifted overlapping output (out starts at index 2, overlapping a[1..3])
			const outOverlap = backing.subarray(2, 5);
			const ret = setDifferenceMask32Iterative(a, b, outOverlap);
			assert.equal(ret, outOverlap);
			assert.deepEqual(outOverlap, expected);
		});

		test('handles large bitmasks (1024 words = 32,768 bits)', () => {
			const words = 1024;
			const a = new Uint32Array(words);
			const b = new Uint32Array(words);
			for (let i = 0; i < words; i++) {
				a[i] = (i * 2654435761) >>> 0;
				b[i] = ((i + 1) * 1597334677) >>> 0;
			}
			const diff = setDifferenceMask32Iterative(a, b);
			assert.equal(diff.length, words);
			for (let i = 0; i < words; i++) {
				assert.equal(diff[i], (a[i] & ~b[i]) >>> 0);
			}
		});
	});

	describe('input validation', () => {
		test('throws TypeError for non-Uint32Array inputs', () => {
			const valid = new Uint32Array([1, 2]);
			const invalidValues = [
				null,
				undefined,
				42,
				'123',
				[1, 2],
				{ 0: 1, 1: 2, length: 2 },
				new Int32Array([1, 2]),
				new Uint16Array([1, 2]),
				new Uint8Array([1, 2]),
				new BigUint64Array([1n, 2n])
			];

			for (const bad of invalidValues) {
				assert.throws(
					() => setDifferenceMask32Iterative(bad, valid),
					TypeError
				);
				assert.throws(
					() => setDifferenceMask32Iterative(valid, bad),
					TypeError
				);
			}

			// Invalid out (excluding undefined which is allowed as omitted)
			for (const bad of invalidValues.filter((v) => v !== undefined)) {
				assert.throws(
					() => setDifferenceMask32Iterative(valid, valid, bad),
					TypeError
				);
			}
		});

		test('throws RangeError for mismatched bitmask lengths', () => {
			assert.throws(
				() =>
					setDifferenceMask32Iterative(
						new Uint32Array(2),
						new Uint32Array(3)
					),
				RangeError
			);
			assert.throws(
				() =>
					setDifferenceMask32Iterative(
						new Uint32Array(0),
						new Uint32Array(1)
					),
				RangeError
			);
			assert.throws(
				() =>
					setDifferenceMask32Iterative(
						new Uint32Array(2),
						new Uint32Array(2),
						new Uint32Array(3)
					),
				RangeError
			);
		});

		test('throws TypeError for detached ArrayBuffer views', () => {
			const valid = new Uint32Array(2);

			const abA = new ArrayBuffer(8);
			const detachedA = new Uint32Array(abA);
			abA.transfer();
			assert.throws(
				() => setDifferenceMask32Iterative(detachedA, valid),
				TypeError
			);

			const abB = new ArrayBuffer(8);
			const detachedB = new Uint32Array(abB);
			abB.transfer();
			assert.throws(
				() => setDifferenceMask32Iterative(valid, detachedB),
				TypeError
			);

			const abOut = new ArrayBuffer(8);
			const detachedOut = new Uint32Array(abOut);
			abOut.transfer();
			assert.throws(
				() => setDifferenceMask32Iterative(valid, valid, detachedOut),
				TypeError
			);
		});
	});

	describe('independent cross-checks', () => {
		test('matches JavaScript Set-based element membership difference across universes', () => {
			const rng = makeRng(0xcafebabe);
			const universeSizes = [0, 1, 7, 31, 32, 33, 64, 95, 128, 257];

			for (const universeSize of universeSizes) {
				const wordCount = Math.ceil(universeSize / 32);
				for (let trial = 0; trial < 10; trial++) {
					const setA = new Set();
					const setB = new Set();
					for (let elem = 0; elem < universeSize; elem++) {
						if ((rng() & 1) === 1) setA.add(elem);
						if ((rng() & 1) === 1) setB.add(elem);
					}

					const maskA = setToMask32(setA, wordCount);
					const maskB = setToMask32(setB, wordCount);
					const diffMask = setDifferenceMask32Iterative(maskA, maskB);
					const actualSet = mask32ToSet(diffMask);

					// Independent Set-based difference computation
					const expectedSet = new Set();
					for (const elem of setA) {
						if (!setB.has(elem)) {
							expectedSet.add(elem);
						}
					}

					assert.deepEqual(actualSet, expectedSet);
				}
			}
		});

		test('satisfies Boolean algebra and set-theoretic identities', () => {
			const rng = makeRng(0x12345678);
			const wordCount = 16;

			for (let trial = 0; trial < 20; trial++) {
				const a = new Uint32Array(wordCount);
				const b = new Uint32Array(wordCount);
				const c = new Uint32Array(wordCount);
				for (let i = 0; i < wordCount; i++) {
					a[i] = rng();
					b[i] = rng();
					c[i] = rng();
				}

				const aMinusB = setDifferenceMask32Iterative(a, b);
				const bMinusA = setDifferenceMask32Iterative(b, a);
				const aMinusC = setDifferenceMask32Iterative(a, c);
				const aMinusAMinusB = setDifferenceMask32Iterative(a, aMinusB);

				const bUnionC = new Uint32Array(wordCount);
				for (let i = 0; i < wordCount; i++) {
					bUnionC[i] = (b[i] | c[i]) >>> 0;
				}
				const aMinusBUnionC = setDifferenceMask32Iterative(a, bUnionC);
				const aMinusBThenC = setDifferenceMask32Iterative(aMinusB, c);

				for (let i = 0; i < wordCount; i++) {
					const aInterB = (a[i] & b[i]) >>> 0;

					// Partition of A: (A \ B) ∪ (A ∩ B) = A and (A \ B) ∩ (A ∩ B) = ∅
					assert.equal((aMinusB[i] | aInterB) >>> 0, a[i]);
					assert.equal((aMinusB[i] & aInterB) >>> 0, 0);

					// Symmetric difference: (A \ B) ∪ (B \ A) = A ⊕ B and disjoint
					assert.equal((aMinusB[i] | bMinusA[i]) >>> 0, (a[i] ^ b[i]) >>> 0);
					assert.equal((aMinusB[i] & bMinusA[i]) >>> 0, 0);

					// Double difference: A \ (A \ B) = A ∩ B
					assert.equal(aMinusAMinusB[i], aInterB);

					// De Morgan / iterated difference:
					// A \ (B ∪ C) = (A \ B) ∩ (A \ C) = (A \ B) \ C
					assert.equal(aMinusBUnionC[i], (aMinusB[i] & aMinusC[i]) >>> 0);
					assert.equal(aMinusBThenC[i], aMinusBUnionC[i]);
				}
			}
		});
	});
});
