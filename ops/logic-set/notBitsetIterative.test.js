import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notBitsetIterative } from './notBitsetIterative.js';

/**
 * Independent reference implementation via binary string manipulation:
 * slices the lowest `width` bits, flips each '0'/'1' character, and parses back.
 *
 * @param {bigint} bitset
 * @param {number} width
 * @returns {bigint}
 */
function referenceStringNot(bitset, width) {
	if (width === 0) return 0n;
	const raw = bitset.toString(2);
	const lowBits = raw.length >= width ? raw.slice(raw.length - width) : raw.padStart(width, '0');
	let flipped = '';
	for (let i = 0; i < lowBits.length; i += 1) {
		flipped += lowBits[i] === '0' ? '1' : '0';
	}
	return BigInt(`0b${flipped}`);
}

describe('notBitsetIterative', () => {
	describe('normal cases', () => {
		it('inverts small bitsets of various widths', () => {
			assert.equal(notBitsetIterative(0b0n, 1), 0b1n);
			assert.equal(notBitsetIterative(0b1n, 1), 0b0n);
			assert.equal(notBitsetIterative(0b1010n, 4), 0b0101n);
			assert.equal(notBitsetIterative(0b00001111n, 8), 0b11110000n);
			assert.equal(notBitsetIterative(0x5555n, 16), 0xaaaan);
			assert.equal(notBitsetIterative(0x12345678n, 32), 0xedcba987n);
		});

		it('handles exact 64-bit chunk boundaries', () => {
			const mask64 = (1n << 64n) - 1n;
			const mask128 = (1n << 128n) - 1n;
			assert.equal(notBitsetIterative(0n, 64), mask64);
			assert.equal(notBitsetIterative(mask64, 64), 0n);
			assert.equal(
				notBitsetIterative(0x0123456789abcdefn, 64),
				0xfedcba9876543210n
			);
			assert.equal(notBitsetIterative(0n, 128), mask128);
			assert.equal(notBitsetIterative(mask128, 128), 0n);
			assert.equal(
				notBitsetIterative(0x0123456789abcdef0123456789abcdefn, 128),
				0xfedcba9876543210fedcba9876543210n
			);
		});

		it('handles widths spanning partial chunks (63, 65, 127, 129, 255, 257)', () => {
			for (const w of [63, 65, 100, 127, 129, 255, 257]) {
				const bw = BigInt(w);
				const allOnes = (1n << bw) - 1n;
				assert.equal(notBitsetIterative(0n, w), allOnes);
				assert.equal(notBitsetIterative(allOnes, w), 0n);
				// Alternating pattern with MSB and LSB set
				const pattern = (1n << (bw - 1n)) | 1n;
				assert.equal(notBitsetIterative(pattern, w), allOnes ^ pattern);
			}
		});

		it('accepts width as either a safe integer number or a BigInt', () => {
			const x = 0xdeadbeefcafebaben;
			assert.equal(notBitsetIterative(x, 64), notBitsetIterative(x, 64n));
			assert.equal(notBitsetIterative(x, 100), notBitsetIterative(x, 100n));
			assert.equal(notBitsetIterative(0n, 0), notBitsetIterative(0n, 0n));
		});
	});

	describe('edge cases', () => {
		it('returns 0n for width 0 regardless of non-negative bitset value', () => {
			assert.equal(notBitsetIterative(0n, 0), 0n);
			assert.equal(notBitsetIterative(1n, 0), 0n);
			assert.equal(notBitsetIterative(0xffffffffffffffffn, 0n), 0n);
			assert.equal(notBitsetIterative(0n, -0), 0n);
		});

		it('masks off bits at or above width without negative sign extension', () => {
			assert.equal(notBitsetIterative(0b111010n, 4), 0b0101n);
			assert.equal(notBitsetIterative(1n << 200n, 64), (1n << 64n) - 1n);
			assert.equal(notBitsetIterative((1n << 200n) - 1n, 70), 0n);
			const res = notBitsetIterative((1n << 500n) | 0b101n, 3);
			assert.equal(res, 0b010n);
			assert.ok(res >= 0n);
		});

		it('handles large arbitrary-width bitsets (512, 1024, 4096 bits)', () => {
			for (const w of [512, 1024, 4096]) {
				const bw = BigInt(w);
				const mask = (1n << bw) - 1n;
				// Deterministic multi-chunk pattern
				const pattern = ((1n << (bw - 7n)) + (1n << (bw / 2n)) + 0x13579bdfn) & mask;
				const result = notBitsetIterative(pattern, w);
				assert.ok(result >= 0n && result <= mask);
				assert.equal(result, mask - pattern);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError when bitset is not a BigInt', () => {
			for (const bad of [0, 42, -1, '0', '1010', null, undefined, true, {}, []]) {
				assert.throws(() => notBitsetIterative(bad, 8), TypeError);
			}
		});

		it('throws RangeError when bitset is negative', () => {
			for (const bad of [-1n, -2n, -(1n << 128n)]) {
				assert.throws(() => notBitsetIterative(bad, 8), RangeError);
			}
		});

		it('throws TypeError when width is neither a number nor a BigInt', () => {
			for (const bad of ['8', null, undefined, true, false, {}, []]) {
				assert.throws(() => notBitsetIterative(0n, bad), TypeError);
			}
		});

		it('throws RangeError when width is negative, non-integer, or unsafe integer', () => {
			for (const bad of [
				-1,
				-64,
				1.5,
				0.1,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				-1n,
				-100n
			]) {
				assert.throws(() => notBitsetIterative(0n, bad), RangeError);
			}
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches independent binary-string bit inversion and masked ~bitset', () => {
			const cases = [
				[0n, 0],
				[0n, 1],
				[1n, 1],
				[0b1011001n, 7],
				[0b1111011001n, 7],
				[0x123456789abcdef0n, 64],
				[0x123456789abcdef0123456789abcdef0n, 128],
				[(1n << 200n) + (1n << 137n) + (1n << 64n) + 42n, 205],
				[(1n << 300n) - 12345678901234567890n, 250]
			];

			for (const [bitset, width] of cases) {
				const actual = notBitsetIterative(bitset, width);
				const fromString = referenceStringNot(bitset, width);
				const fromSignedNot = width === 0 ? 0n : (~bitset) & ((1n << BigInt(width)) - 1n);

				assert.equal(actual, fromString);
				assert.equal(actual, fromSignedNot);
			}
		});

		it('satisfies involution and complement partition identities', () => {
			const samples = [
				[0n, 80],
				[0xabcdef0123456789n, 80],
				[(1n << 150n) + 9876543210123456789n, 133],
				[(1n << 256n) - 1n, 256]
			];

			for (const [x, w] of samples) {
				const mask = (1n << BigInt(w)) - 1n;
				const lowX = x & mask;
				const inv = notBitsetIterative(x, w);

				// Involution
				assert.equal(notBitsetIterative(inv, w), lowX);
				// Disjoint & covering complement
				assert.equal(lowX & inv, 0n);
				assert.equal(lowX | inv, mask);
				assert.equal(lowX ^ inv, mask);
				assert.equal(lowX + inv, mask);
			}
		});

		it("satisfies De Morgan's laws over arbitrary widths", () => {
			const pairs = [
				[0b11001010n, 0b10101100n, 8],
				[0x0f0f0f0f0f0f0f0fn, 0x3333333333333333n, 64],
				[
					(1n << 190n) | 0xdeadbeefcafebabe123456789abcdef0n,
					(1n << 191n) | 0x0123456789abcdef0fedcba987654321n,
					195
				]
			];

			for (const [a, b, w] of pairs) {
				assert.equal(
					notBitsetIterative(a | b, w),
					notBitsetIterative(a, w) & notBitsetIterative(b, w)
				);
				assert.equal(
					notBitsetIterative(a & b, w),
					notBitsetIterative(a, w) | notBitsetIterative(b, w)
				);
			}
		});
	});
});
