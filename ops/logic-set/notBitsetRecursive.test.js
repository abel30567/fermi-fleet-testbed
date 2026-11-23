import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notBitsetRecursive } from './notBitsetRecursive.js';

/**
 * Independent reference mask helper.
 * @param {number} width
 * @returns {bigint}
 */
function fullMask(width) {
	return width === 0 ? 0n : (1n << BigInt(width)) - 1n;
}

/**
 * Deterministic PRNG for reproducible wide bitset generation.
 * @param {number} width
 * @param {bigint} seed
 * @returns {bigint}
 */
function deterministicBits(width, seed) {
	let state = seed;
	let out = 0n;
	for (let i = 0; i < width; i++) {
		state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
		if (((state >> 32n) & 1n) === 1n) {
			out |= 1n << BigInt(i);
		}
	}
	return out;
}

describe('notBitsetRecursive', () => {
	it('inverts small bitsets within a single base chunk', () => {
		assert.equal(notBitsetRecursive(0b0n, 1), 0b1n);
		assert.equal(notBitsetRecursive(0b1n, 1), 0b0n);
		assert.equal(notBitsetRecursive(0b1010n, 4), 0b0101n);
		assert.equal(notBitsetRecursive(0x0fn, 8), 0xf0n);
		assert.equal(notBitsetRecursive(0x5555n, 16), 0xaaaan);
		assert.equal(notBitsetRecursive(0x12345678n, 32), 0xedcba987n);
	});

	it('inverts bitsets spanning recursion boundaries (33..256 bits)', () => {
		assert.equal(notBitsetRecursive(0x1_0000_0000n, 33), 0x0_ffff_ffffn);
		assert.equal(notBitsetRecursive(0x0123456789abcdefn, 64), 0xfedcba9876543210n);
		assert.equal(
			notBitsetRecursive((1n << 64n) | 1n, 65),
			((1n << 65n) - 1n) ^ ((1n << 64n) | 1n),
		);
		const pattern128 = 0x55555555555555555555555555555555n;
		const expected128 = 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan;
		assert.equal(notBitsetRecursive(pattern128, 128), expected128);
	});

	it('handles width = 0 edge case', () => {
		assert.equal(notBitsetRecursive(0n, 0), 0n);
		assert.equal(notBitsetRecursive(0xffn, 0), 0n);
	});

	it('handles zero and all-ones bitsets across widths', () => {
		const widths = [1, 7, 31, 32, 33, 63, 64, 65, 128, 513, 1024];
		for (const width of widths) {
			const ones = fullMask(width);
			assert.equal(notBitsetRecursive(0n, width), ones);
			assert.equal(notBitsetRecursive(ones, width), 0n);
		}
	});

	it('masks out input bits at positions >= width', () => {
		assert.equal(notBitsetRecursive(0b1111_1010n, 4), 0b0101n);
		const wideInput = (1n << 200n) | (1n << 70n) | 0b101n;
		const width = 65;
		const mask = fullMask(width);
		assert.equal(notBitsetRecursive(wideInput, width), (wideInput & mask) ^ mask);
		assert.equal(notBitsetRecursive(wideInput, width) >> BigInt(width), 0n);
	});

	it('handles very wide (>512-bit) bitsets accurately', () => {
		const widths = [513, 768, 1024, 2048, 4097];
		for (const width of widths) {
			const mask = fullMask(width);
			// Single MSB and LSB set
			const edgeBits = (1n << BigInt(width - 1)) | 1n;
			assert.equal(notBitsetRecursive(edgeBits, width), edgeBits ^ mask);

			// Deterministic dense pattern
			const dense = deterministicBits(width, BigInt(width) * 1337n + 7n);
			const inverted = notBitsetRecursive(dense, width);
			assert.equal(inverted, dense ^ mask);
		}
	});

	it('satisfies independent double-negation, mask XOR, and complement algebra cross-checks', () => {
		const widths = [0, 1, 5, 31, 32, 33, 64, 65, 99, 257, 600, 1025];
		for (const width of widths) {
			const mask = fullMask(width);
			const x = deterministicBits(width, BigInt(width) * 97n + 42n);
			const notX = notBitsetRecursive(x, width);

			// Mask XOR cross-check
			assert.equal(notX, x ^ mask);
			// Involution (double negation)
			assert.equal(notBitsetRecursive(notX, width), x);
			// Disjointness & universe coverage
			assert.equal(x & notX, 0n);
			assert.equal(x | notX, mask);
			assert.equal(x + notX, mask);
		}
	});

	it('matches an independent bit-by-bit inversion check on a 600-bit bitset', () => {
		const width = 600;
		const input = deterministicBits(width, 0xdeadbeefcafen);
		const output = notBitsetRecursive(input, width);

		for (let i = 0; i < width; i++) {
			const bitIn = (input >> BigInt(i)) & 1n;
			const bitOut = (output >> BigInt(i)) & 1n;
			assert.equal(bitOut, bitIn ^ 1n, `bit ${i} should be inverted`);
		}
		assert.equal(output >> BigInt(width), 0n, 'no bits above width may be set');
	});

	it('throws TypeError for non-BigInt bitset inputs', () => {
		for (const bad of [0, 42, '0', null, undefined, true, {}, []]) {
			assert.throws(() => notBitsetRecursive(bad, 8), TypeError);
		}
	});

	it('throws RangeError for negative BigInt bitset inputs', () => {
		for (const bad of [-1n, -16n, -(1n << 100n)]) {
			assert.throws(() => notBitsetRecursive(bad, 8), RangeError);
		}
	});

	it('throws TypeError for non-number width inputs', () => {
		for (const bad of ['8', 8n, null, undefined, true, {}, []]) {
			assert.throws(() => notBitsetRecursive(0n, bad), TypeError);
		}
	});

	it('throws RangeError for invalid numeric width inputs', () => {
		for (const bad of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => notBitsetRecursive(0n, bad), RangeError);
		}
	});
});
