import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorBitsetStable } from './xorBitsetStable.js';

/**
 * Converts a non-negative BigInt bitset to a Set of active bit indices.
 * @param {bigint} bits
 * @returns {Set<number>}
 */
function bitsetToSet(bits) {
	const result = new Set();
	let v = bits;
	let idx = 0;
	while (v > 0n) {
		if ((v & 1n) === 1n) {
			result.add(idx);
		}
		v >>= 1n;
		idx += 1;
	}
	return result;
}

/**
 * Converts an iterable of non-negative bit indices into a BigInt bitset.
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function setToBitset(indices) {
	let result = 0n;
	for (const idx of indices) {
		result |= 1n << BigInt(idx);
	}
	return result;
}

/**
 * Independent reference symmetric difference over Sets of indices.
 * @param {Set<number>} setA
 * @param {Set<number>} setB
 * @param {number} [width]
 * @returns {Set<number>}
 */
function setSymmetricDifference(setA, setB, width) {
	const out = new Set();
	for (const x of setA) {
		if (!setB.has(x) && (width === undefined || x < width)) {
			out.add(x);
		}
	}
	for (const x of setB) {
		if (!setA.has(x) && (width === undefined || x < width)) {
			out.add(x);
		}
	}
	return out;
}

describe('xorBitsetStable', () => {
	describe('normal cases', () => {
		it('computes XOR of small bitsets', () => {
			assert.equal(xorBitsetStable(0b1010n, 0b1100n), 0b0110n);
			assert.equal(xorBitsetStable(0b1111n, 0b0101n), 0b1010n);
			assert.equal(xorBitsetStable(0b10101n, 0b01010n), 0b11111n);
		});

		it('satisfies commutativity, associativity, and involution', () => {
			const a = 0x123456789abcdef0123456789abcdefn;
			const b = 0xfedcba9876543210fedcba9876543210n;
			const c = 0x0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0fn;

			assert.equal(xorBitsetStable(a, b), xorBitsetStable(b, a));
			assert.equal(
				xorBitsetStable(xorBitsetStable(a, b), c),
				xorBitsetStable(a, xorBitsetStable(b, c)),
			);
			assert.equal(xorBitsetStable(xorBitsetStable(a, b), b), a);
		});
	});

	describe('edge cases', () => {
		it('handles zero bitsets and identity property', () => {
			assert.equal(xorBitsetStable(0n, 0n), 0n);
			assert.equal(xorBitsetStable(42n, 0n), 42n);
			assert.equal(xorBitsetStable(0n, 42n), 42n);
			const huge = (1n << 512n) | 1n;
			assert.equal(xorBitsetStable(huge, 0n), huge);
			assert.equal(xorBitsetStable(0n, huge), huge);
		});

		it('returns 0n for self-XOR across small and large widths', () => {
			assert.equal(xorBitsetStable(1n, 1n), 0n);
			assert.equal(xorBitsetStable(0xffffffffffffffffn, 0xffffffffffffffffn), 0n);
			const wide = (1n << 1200n) - 1n;
			assert.equal(xorBitsetStable(wide, wide), 0n);
		});

		it('handles widths exceeding 32, 53, 256, and 1024 bits without precision loss', () => {
			const a256 = (1n << 300n) | (1n << 257n) | (1n << 64n) | 1n;
			const b256 = (1n << 257n) | (1n << 128n) | 1n;
			assert.equal(xorBitsetStable(a256, b256), (1n << 300n) | (1n << 128n) | (1n << 64n));

			const a1024 = (1n << 1536n) | (1n << 1025n) | (1n << 512n) | (1n << 53n);
			const b1024 = (1n << 1536n) | (1n << 1024n) | (1n << 53n) | 1n;
			assert.equal(
				xorBitsetStable(a1024, b1024),
				(1n << 1025n) | (1n << 1024n) | (1n << 512n) | 1n,
			);
		});

		it('applies optional width mask accurately', () => {
			assert.equal(xorBitsetStable(0b1111n, 0b0101n, 0), 0n);
			assert.equal(xorBitsetStable(0b1111n, 0b0101n, 2), 0b10n);
			assert.equal(xorBitsetStable(0b1111n, 0b0101n, 4), 0b1010n);
			assert.equal(xorBitsetStable(0b1111n, 0b0101n, 64), 0b1010n);

			// High bits beyond width must not leak into output
			const a = (1n << 1300n) | (1n << 300n) | 0b10110n;
			const b = (1n << 1299n) | (1n << 300n) | 0b01101n;
			assert.equal(xorBitsetStable(a, b, 5), 0b11011n);
			assert.equal(xorBitsetStable(a, b, 1024), 0b11011n);
			assert.equal(xorBitsetStable(a, b, 1300), (1n << 1299n) | 0b11011n);

			// Huge width with small operands should not overflow or allocate huge masks
			assert.equal(xorBitsetStable(0b1010n, 0b1100n, Number.MAX_SAFE_INTEGER), 0b0110n);
		});
	});

	describe('input validation', () => {
		it('rejects non-BigInt bitsets with TypeError', () => {
			const invalidValues = [0, 1, 42, '1', null, undefined, true, false, {}, []];
			for (const val of invalidValues) {
				assert.throws(() => xorBitsetStable(val, 1n), TypeError);
				assert.throws(() => xorBitsetStable(1n, val), TypeError);
			}
		});

		it('rejects negative BigInt bitsets with RangeError', () => {
			assert.throws(() => xorBitsetStable(-1n, 0n), RangeError);
			assert.throws(() => xorBitsetStable(0n, -1n), RangeError);
			assert.throws(() => xorBitsetStable(-(1n << 300n), 1n), RangeError);
			assert.throws(() => xorBitsetStable(1n, -(1n << 1024n)), RangeError);
		});

		it('rejects invalid width types with TypeError', () => {
			for (const badWidth of [null, '8', 8n, true, {}, []]) {
				assert.throws(() => xorBitsetStable(1n, 2n, badWidth), TypeError);
			}
		});

		it('rejects invalid numeric width values with RangeError', () => {
			for (const badWidth of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => xorBitsetStable(1n, 2n, badWidth), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches symmetric difference over Sets across small and >1024-bit sets', () => {
			const cases = [
				{ a: [0, 2, 5, 7], b: [1, 2, 5, 8], width: undefined },
				{ a: [0, 31, 32, 52, 53, 63, 64], b: [31, 53, 64, 65], width: undefined },
				{ a: [0, 100, 255, 256, 300, 1023, 1024, 1500], b: [100, 256, 512, 1024, 1500, 2048], width: undefined },
				{ a: [0, 100, 255, 256, 300, 1023, 1024, 1500], b: [100, 256, 512, 1024, 1500, 2048], width: 1024 },
				{ a: [0, 1, 2, 3, 255, 256, 512], b: [1, 3, 4, 255, 512], width: 256 },
			];

			for (const { a, b, width } of cases) {
				const setA = new Set(a);
				const setB = new Set(b);
				const expectedSet = setSymmetricDifference(setA, setB, width);
				const actualBitset = xorBitsetStable(setToBitset(setA), setToBitset(setB), width);
				assert.deepEqual(bitsetToSet(actualBitset), expectedSet);
				assert.equal(actualBitset, setToBitset(expectedSet));
			}
		});

		it('matches Boolean identity (a | b) & ~(a & b) for deterministic wide bitsets', () => {
			// Deterministic LCG generating 1280-bit test pairs
			let seed = 0x9e3779b97f4a7c15n;
			const nextWord = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				return seed;
			};
			const nextBitset = (words) => {
				let acc = 0n;
				for (let i = 0; i < words; i += 1) {
					acc = (acc << 64n) | nextWord();
				}
				return acc;
			};

			const widths = [undefined, 0, 1, 32, 64, 256, 513, 1024, 1280, 2048];
			for (let trial = 0; trial < 10; trial += 1) {
				const a = nextBitset(20); // 1280 bits
				const b = nextBitset(20);
				const booleanXor = (a | b) & ~(a & b);

				for (const w of widths) {
					const expected = w === undefined ? booleanXor : booleanXor & ((1n << BigInt(w)) - 1n);
					assert.equal(xorBitsetStable(a, b, w), expected);
				}
			}
		});
	});
});
