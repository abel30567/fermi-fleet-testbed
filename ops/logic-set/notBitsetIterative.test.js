import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notBitsetIterative } from './notBitsetIterative.js';

/**
 * Independent reference 1: closed-form XOR mask complement.
 *
 * @param {bigint} x
 * @param {number | bigint} width
 * @returns {bigint}
 */
function maskNotReference(x, width) {
	const w = BigInt(width);
	const mask = (1n << w) - 1n;
	return mask ^ x;
}

/**
 * Independent reference 2: JS Set complement over universe {0, ..., width - 1}.
 *
 * @param {bigint} x
 * @param {number} width
 * @returns {bigint}
 */
function setComplementReference(x, width) {
	const members = new Set();
	for (let i = 0; i < width; i += 1) {
		if (((x >> BigInt(i)) & 1n) === 1n) {
			members.add(i);
		}
	}

	let complement = 0n;
	for (let i = 0; i < width; i += 1) {
		if (!members.has(i)) {
			complement |= 1n << BigInt(i);
		}
	}
	return complement;
}

/**
 * Deterministic PRNG (xorshift64*) for reproducible arbitrary-width bitsets.
 *
 * @param {number} width
 * @param {bigint} seed
 * @returns {bigint}
 */
function deterministicBitset(width, seed) {
	let state = seed || 0x9e3779b97f4a7c15n;
	const mask64 = (1n << 64n) - 1n;
	let out = 0n;
	let bitsRemaining = width;
	let shift = 0n;

	while (bitsRemaining > 0) {
		state ^= state >> 12n;
		state ^= (state << 25n) & mask64;
		state ^= state >> 27n;
		const chunk = (state * 0x2545f4914f6cdd1dn) & mask64;
		const take = Math.min(64, bitsRemaining);
		const chunkMask = (1n << BigInt(take)) - 1n;
		out |= (chunk & chunkMask) << shift;
		shift += BigInt(take);
		bitsRemaining -= take;
	}

	return out;
}

describe('notBitsetIterative', () => {
	describe('normal cases', () => {
		it('flips bits across standard fixed widths', () => {
			assert.equal(notBitsetIterative(0b1010n, 4), 0b0101n);
			assert.equal(notBitsetIterative(0b00110101n, 8), 0b11001010n);
			assert.equal(notBitsetIterative(0x0f0fn, 16), 0xf0f0n);
			assert.equal(
				notBitsetIterative(0x0123456789abcdefn, 64),
				0xfedcba9876543210n,
			);
		});

		it('flips implicit leading zero bits up to the specified width', () => {
			assert.equal(notBitsetIterative(0b101n, 8), 0b11111010n);
			assert.equal(notBitsetIterative(1n, 6), 0b111110n);
		});

		it('accepts a BigInt width argument', () => {
			assert.equal(notBitsetIterative(0b1010n, 4n), 0b0101n);
			assert.equal(notBitsetIterative(0n, 10n), 0b1111111111n);
			assert.equal(notBitsetIterative(0n, 0n), 0n);
		});

		it('infers minimum bit length when width is omitted', () => {
			assert.equal(notBitsetIterative(0n), 0n);
			assert.equal(notBitsetIterative(1n), 0n);
			assert.equal(notBitsetIterative(0b10n), 0b01n);
			assert.equal(notBitsetIterative(0b1010n), 0b0101n);
			assert.equal(notBitsetIterative(0b10000n), 0b01111n);
			assert.equal(notBitsetIterative(0b11111n), 0n);
		});
	});

	describe('edge cases', () => {
		it('handles width 0 with 0n (including -0)', () => {
			assert.equal(notBitsetIterative(0n, 0), 0n);
			assert.equal(notBitsetIterative(0n, -0), 0n);
			assert.equal(notBitsetIterative(0n, 0n), 0n);
		});

		it('maps 0n to all-ones and all-ones to 0n', () => {
			for (const w of [1, 2, 7, 8, 64, 128, 256, 300]) {
				const allOnes = (1n << BigInt(w)) - 1n;
				assert.equal(notBitsetIterative(0n, w), allOnes);
				assert.equal(notBitsetIterative(allOnes, w), 0n);
			}
		});

		it('handles single-bit LSB and MSB patterns', () => {
			const w = 129;
			const allOnes = (1n << BigInt(w)) - 1n;
			assert.equal(notBitsetIterative(1n, w), allOnes - 1n);
			const msb = 1n << BigInt(w - 1);
			assert.equal(notBitsetIterative(msb, w), allOnes - msb);
		});

		it('handles arbitrary widths greater than 256 bits', () => {
			const w300 = 300;
			const sparse300 = (1n << 0n) | (1n << 127n) | (1n << 256n) | (1n << 299n);
			const expected300 = ((1n << BigInt(w300)) - 1n) ^ sparse300;
			assert.equal(notBitsetIterative(sparse300, w300), expected300);

			const w512 = 512;
			const pattern512 = deterministicBitset(w512, 0x123456789abcdef1n);
			assert.equal(
				notBitsetIterative(pattern512, w512),
				maskNotReference(pattern512, w512),
			);

			const w1024 = 1024;
			const pattern1024 = deterministicBitset(w1024, 0xfedcba9876543211n);
			assert.equal(
				notBitsetIterative(pattern1024, w1024),
				maskNotReference(pattern1024, w1024),
			);
		});

		it('satisfies involution not(not(x, w), w) === x', () => {
			const cases = [
				[0n, 0],
				[0n, 1],
				[1n, 1],
				[0b10110n, 5],
				[0b10110n, 16],
				[deterministicBitset(64, 1n), 64],
				[deterministicBitset(257, 2n), 257],
				[deterministicBitset(513, 3n), 513],
			];

			for (const [x, w] of cases) {
				const once = notBitsetIterative(x, w);
				const twice = notBitsetIterative(once, w);
				assert.equal(twice, x);
			}
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError for non-BigInt bitset', () => {
			for (const bad of [0, 1, 42, '0', '1', null, undefined, true, {}, []]) {
				assert.throws(() => notBitsetIterative(bad, 4), TypeError);
			}
		});

		it('throws RangeError for negative bitset', () => {
			assert.throws(() => notBitsetIterative(-1n, 4), RangeError);
			assert.throws(() => notBitsetIterative(-1n), RangeError);
			assert.throws(() => notBitsetIterative(-(1n << 300n), 301), RangeError);
		});

		it('throws TypeError for non-number, non-BigInt, non-undefined width', () => {
			for (const badWidth of [null, '4', true, false, {}, [], Symbol('w')]) {
				assert.throws(() => notBitsetIterative(0n, badWidth), TypeError);
			}
		});

		it('throws RangeError for negative, non-integer, or unsafe width', () => {
			const badWidths = [
				-1,
				-100,
				-1n,
				-(1n << 64n),
				1.5,
				0.1,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
			];
			for (const badWidth of badWidths) {
				assert.throws(() => notBitsetIterative(0n, badWidth), RangeError);
			}
		});

		it('throws RangeError when bitset has bits set at positions >= width', () => {
			assert.throws(() => notBitsetIterative(1n, 0), RangeError);
			assert.throws(() => notBitsetIterative(0b1000n, 3), RangeError);
			assert.throws(() => notBitsetIterative(1n << 256n, 256), RangeError);
			assert.throws(() => notBitsetIterative(1n << 256n, 256n), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches closed-form XOR mask ((1n << w) - 1n) ^ x across varied widths', () => {
			const widths = [0, 1, 3, 8, 31, 32, 63, 64, 65, 128, 256, 257, 384, 512];
			for (let idx = 0; idx < widths.length; idx += 1) {
				const w = widths[idx];
				const x = deterministicBitset(w, BigInt(idx + 1) * 0x517cc1b727220a95n);
				const actual = notBitsetIterative(x, w);
				const expected = maskNotReference(x, w);
				assert.equal(actual, expected);
			}
		});

		it('matches Set-based complement and Boolean complement laws', () => {
			const widths = [0, 1, 5, 16, 65, 260, 300];
			for (let idx = 0; idx < widths.length; idx += 1) {
				const w = widths[idx];
				const x = deterministicBitset(w, BigInt(idx + 7) * 0x94d049bb133111ebn);
				const actual = notBitsetIterative(x, w);
				const expected = setComplementReference(x, w);
				const universeMask = (1n << BigInt(w)) - 1n;

				assert.equal(actual, expected);
				assert.equal(x & actual, 0n);
				assert.equal(x | actual, universeMask);
			}
		});
	});
});
