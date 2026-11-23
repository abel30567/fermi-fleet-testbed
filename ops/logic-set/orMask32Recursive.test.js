import { describe, it } from 'node:test';
import assert from 'node:assert';
import { orMask32Recursive } from './orMask32Recursive.js';

/**
 * Deterministic xorshift32 PRNG for reproducible tests.
 * @param {number} seed
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return state >>> 0;
	};
}

/**
 * Independent set representation: extracts the indices of all set bits from a Uint32Array.
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
	const bits = new Set();
	for (let w = 0; w < mask.length; w++) {
		const word = mask[w];
		for (let b = 0; b < 32; b++) {
			if (((word >>> b) & 1) === 1) {
				bits.add(w * 32 + b);
			}
		}
	}
	return bits;
}

describe('orMask32Recursive', () => {
	describe('normal cases', () => {
		it('computes bitwise OR across multi-word Uint32Arrays (power-of-two length)', () => {
			const a = new Uint32Array([0x0f0f0f0f, 0x12345678, 0x0000ffff, 0x80000001]);
			const b = new Uint32Array([0xf0f0f0f0, 0x00ff00ff, 0xffff0000, 0x40000002]);
			const result = orMask32Recursive(a, b);

			assert.ok(result instanceof Uint32Array);
			assert.deepStrictEqual(
				result,
				new Uint32Array([0xffffffff, 0x12ff56ff, 0xffffffff, 0xc0000003])
			);
		});

		it('handles odd and non-power-of-two word counts', () => {
			for (const len of [3, 5, 7, 13, 19]) {
				const a = new Uint32Array(len);
				const b = new Uint32Array(len);
				const expected = new Uint32Array(len);
				for (let i = 0; i < len; i++) {
					a[i] = (0x55555555 ^ (i * 0x01010101)) >>> 0;
					b[i] = (0xaaaaaaaa ^ (i * 0x10101010)) >>> 0;
					expected[i] = (a[i] | b[i]) >>> 0;
				}
				assert.deepStrictEqual(orMask32Recursive(a, b), expected);
			}
		});

		it('preserves unsigned 32-bit high-bit semantics (bit 31)', () => {
			const a = new Uint32Array([0x80000000, 0x7fffffff, 0x00000000, 0xffffffff]);
			const b = new Uint32Array([0x00000000, 0x80000000, 0x80000000, 0x00000000]);
			const result = orMask32Recursive(a, b);

			assert.deepStrictEqual(
				result,
				new Uint32Array([0x80000000, 0xffffffff, 0x80000000, 0xffffffff])
			);
			for (let i = 0; i < result.length; i++) {
				assert.ok(result[i] >= 0 && result[i] <= 0xffffffff);
			}
		});
	});

	describe('edge cases', () => {
		it('returns a new empty Uint32Array for empty inputs', () => {
			const a = new Uint32Array(0);
			const b = new Uint32Array(0);
			const result = orMask32Recursive(a, b);

			assert.ok(result instanceof Uint32Array);
			assert.strictEqual(result.length, 0);
			assert.notStrictEqual(result, a);
			assert.notStrictEqual(result, b);
		});

		it('handles single-word arrays (immediate base case)', () => {
			const a = new Uint32Array([0x00ff00ff]);
			const b = new Uint32Array([0x0f0f0f0f]);
			assert.deepStrictEqual(orMask32Recursive(a, b), new Uint32Array([0x0fff0fff]));
		});

		it('satisfies zero identity, all-ones dominance, and idempotence without mutating inputs', () => {
			const a = new Uint32Array([0xdeadbeef, 0x00000000, 0x80000001, 0x13579bdf]);
			const aSnap = new Uint32Array(a);
			const zeros = new Uint32Array(a.length);
			const ones = new Uint32Array(a.length).fill(0xffffffff);

			const idZero = orMask32Recursive(a, zeros);
			assert.deepStrictEqual(idZero, aSnap);
			assert.notStrictEqual(idZero, a);

			const domOnes = orMask32Recursive(a, ones);
			assert.deepStrictEqual(domOnes, ones);

			const sameRef = orMask32Recursive(a, a);
			assert.deepStrictEqual(sameRef, aSnap);
			assert.notStrictEqual(sameRef, a);

			assert.deepStrictEqual(a, aSnap);
		});

		it('works correctly with subarray views having non-zero byteOffset', () => {
			const backingA = new Uint32Array([0xffffffff, 0x00000001, 0x00000010, 0x80000000, 0xffffffff]);
			const backingB = new Uint32Array([0x00000000, 0x00000002, 0x00000020, 0x00000004, 0x00000000]);
			const viewA = backingA.subarray(1, 4);
			const viewB = backingB.subarray(1, 4);

			assert.strictEqual(viewA.byteOffset, 4);
			assert.deepStrictEqual(
				orMask32Recursive(viewA, viewB),
				new Uint32Array([0x00000003, 0x00000030, 0x80000004])
			);
		});

		it('handles large arrays without stack overflow', () => {
			const len = 4097;
			const a = new Uint32Array(len);
			const b = new Uint32Array(len);
			const expected = new Uint32Array(len);
			for (let i = 0; i < len; i++) {
				a[i] = (i * 2654435761) >>> 0;
				b[i] = ((len - i) * 2246822519) >>> 0;
				expected[i] = (a[i] | b[i]) >>> 0;
			}
			assert.deepStrictEqual(orMask32Recursive(a, b), expected);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when either argument is not a Uint32Array', () => {
			const valid = new Uint32Array([1, 2]);
			const invalidValues = [
				undefined,
				null,
				42,
				'1234',
				[1, 2],
				{ length: 2, 0: 1, 1: 2 },
				new Int32Array([1, 2]),
				new Uint16Array([1, 2]),
				new Uint8Array([1, 2]),
				new Float32Array([1, 2])
			];

			for (const bad of invalidValues) {
				assert.throws(() => orMask32Recursive(bad, valid), TypeError);
				assert.throws(() => orMask32Recursive(valid, bad), TypeError);
			}
			assert.throws(() => orMask32Recursive(), TypeError);
		});

		it('throws RangeError when input lengths differ', () => {
			assert.throws(
				() => orMask32Recursive(new Uint32Array([1, 2]), new Uint32Array([1, 2, 3])),
				RangeError
			);
			assert.throws(
				() => orMask32Recursive(new Uint32Array(0), new Uint32Array(1)),
				RangeError
			);
			assert.throws(
				() => orMask32Recursive(new Uint32Array(5), new Uint32Array(4)),
				RangeError
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent Set-based bit-index union across randomized masks', () => {
			const nextRand = makeRng(0xcafebabe);
			for (const len of [0, 1, 2, 3, 4, 5, 8, 15, 31, 32, 33]) {
				const a = new Uint32Array(len);
				const b = new Uint32Array(len);
				for (let i = 0; i < len; i++) {
					a[i] = nextRand();
					b[i] = nextRand();
				}

				const result = orMask32Recursive(a, b);
				const expectedUnion = new Set([...maskToBitSet(a), ...maskToBitSet(b)]);
				const actualBits = maskToBitSet(result);

				assert.deepStrictEqual(actualBits, expectedUnion);
			}
		});

		it('matches iterative reference and satisfies commutativity, associativity, and De Morgan law', () => {
			const nextRand = makeRng(0x12345678);
			for (const len of [1, 2, 7, 16, 65, 257]) {
				const a = new Uint32Array(len);
				const b = new Uint32Array(len);
				const c = new Uint32Array(len);
				for (let i = 0; i < len; i++) {
					a[i] = nextRand();
					b[i] = nextRand();
					c[i] = nextRand();
				}

				// Independent iterative reference via De Morgan: a | b === ~(~a & ~b)
				const deMorganRef = new Uint32Array(len);
				for (let i = 0; i < len; i++) {
					deMorganRef[i] = ~(~a[i] & ~b[i]) >>> 0;
				}

				const ab = orMask32Recursive(a, b);
				const ba = orMask32Recursive(b, a);
				assert.deepStrictEqual(ab, deMorganRef);
				assert.deepStrictEqual(ab, ba);

				// Associativity: (a | b) | c === a | (b | c)
				const leftAssoc = orMask32Recursive(ab, c);
				const rightAssoc = orMask32Recursive(a, orMask32Recursive(b, c));
				assert.deepStrictEqual(leftAssoc, rightAssoc);
			}
		});
	});
});
