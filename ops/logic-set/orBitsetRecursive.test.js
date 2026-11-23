import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { orBitsetRecursive } from './orBitsetRecursive.js';

/**
 * Deterministic PRNG (xorshift64*) for generating reproducible arbitrary-width
 * BigInt bitsets in cross-check tests.
 *
 * @param {bigint} seed
 * @returns {() => bigint}
 */
function createPrng(seed) {
	let state = seed;
	const mask64 = (1n << 64n) - 1n;
	return () => {
		state ^= state >> 12n;
		state ^= (state << 25n) & mask64;
		state ^= state >> 27n;
		return (state * 2685821657736338717n) & mask64;
	};
}

/**
 * Builds a deterministic pseudo-random non-negative BigInt of up to `bits` width.
 *
 * @param {() => bigint} next64
 * @param {number} bits
 * @returns {bigint}
 */
function randomBigInt(next64, bits) {
	if (bits === 0) return 0n;
	let result = 0n;
	let remaining = bits;
	while (remaining > 0) {
		const take = Math.min(64, remaining);
		const chunk = next64() & ((1n << BigInt(take)) - 1n);
		result = (result << BigInt(take)) + chunk;
		remaining -= take;
	}
	return result;
}

describe('orBitsetRecursive', () => {
	test('computes bitwise OR for basic small bitsets', () => {
		assert.equal(orBitsetRecursive(0b1010n, 0b0101n), 0b1111n);
		assert.equal(orBitsetRecursive(0b1100n, 0b1010n), 0b1110n);
		assert.equal(orBitsetRecursive(1n, 2n), 3n);
		assert.equal(orBitsetRecursive(0x0fn, 0xf0n), 0xffn);
		assert.equal(orBitsetRecursive(0b101010n, 0b101010n), 0b101010n);
	});

	test('handles zero bitsets (0n) as identity element', () => {
		assert.equal(orBitsetRecursive(0n, 0n), 0n);
		assert.equal(orBitsetRecursive(0n, 42n), 42n);
		assert.equal(orBitsetRecursive(42n, 0n), 42n);

		const wide = (1n << 700n) + 123456789n;
		assert.equal(orBitsetRecursive(0n, wide), wide);
		assert.equal(orBitsetRecursive(wide, 0n), wide);
	});

	test('handles 32-bit signed/unsigned boundary and split thresholds accurately', () => {
		// High bit of 32-bit unsigned chunk (0x80000000) must stay positive
		assert.equal(orBitsetRecursive(0x80000000n, 0x00000001n), 0x80000001n);
		assert.equal(orBitsetRecursive(0xffffffffn, 0x00000000n), 0xffffffffn);
		assert.equal(orBitsetRecursive(0xaaaaaaaaan, 0x555555555n), 0xfffffffffn);

		// Boundary widths around 32, 64, and 128 bits
		for (const bit of [31, 32, 33, 63, 64, 65, 127, 128, 129]) {
			const a = 1n << BigInt(bit);
			const b = (1n << BigInt(bit)) - 1n;
			assert.equal(orBitsetRecursive(a, b), (1n << BigInt(bit + 1)) - 1n);
		}
	});

	test('handles very wide bitsets (>512 bits) including asymmetric and sparse bitsets', () => {
		// Disjoint alternating bits across 1024 bits
		let evenBits = 0n;
		let oddBits = 0n;
		for (let i = 0; i < 1024; i += 2) {
			evenBits += 1n << BigInt(i);
			oddBits += 1n << BigInt(i + 1);
		}
		assert.equal(orBitsetRecursive(evenBits, oddBits), (1n << 1024n) - 1n);

		// Sparse very wide bitset (2048+ bits)
		const sparseA = (1n << 2048n) + (1n << 1023n) + (1n << 513n) + 1n;
		const sparseB = (1n << 2047n) + (1n << 1023n) + (1n << 600n) + 2n;
		const expectedSparse =
			(1n << 2048n) + (1n << 2047n) + (1n << 1023n) + (1n << 600n) + (1n << 513n) + 3n;
		assert.equal(orBitsetRecursive(sparseA, sparseB), expectedSparse);

		// Asymmetric width: 1-bit OR 1500-bit
		const huge = (1n << 1500n) - 2n;
		assert.equal(orBitsetRecursive(huge, 1n), (1n << 1500n) - 1n);
		assert.equal(orBitsetRecursive(1n, huge), (1n << 1500n) - 1n);
	});

	test('satisfies algebraic laws: commutativity, associativity, and idempotence', () => {
		const a = (1n << 600n) + 0x123456789abcdef0n;
		const b = (1n << 601n) + (1n << 300n) + 0xfedcba9876543210n;
		const c = (1n << 800n) + (1n << 600n) + 0x0f0f0f0f0f0f0f0fn;

		// Commutativity
		assert.equal(orBitsetRecursive(a, b), orBitsetRecursive(b, a));
		// Idempotence
		assert.equal(orBitsetRecursive(a, a), a);
		// Associativity
		assert.equal(
			orBitsetRecursive(orBitsetRecursive(a, b), c),
			orBitsetRecursive(a, orBitsetRecursive(b, c)),
		);
	});

	test('throws TypeError for non-BigInt inputs and missing arguments', () => {
		const invalidValues = [0, 1, 42, NaN, Infinity, '1', '0n', null, undefined, true, false, {}, [], Symbol('x')];
		for (const bad of invalidValues) {
			assert.throws(() => orBitsetRecursive(bad, 1n), TypeError);
			assert.throws(() => orBitsetRecursive(1n, bad), TypeError);
		}
		assert.throws(() => orBitsetRecursive(), TypeError);
		assert.throws(() => orBitsetRecursive(1n), TypeError);
	});

	test('throws RangeError for negative BigInt inputs', () => {
		assert.throws(() => orBitsetRecursive(-1n, 0n), RangeError);
		assert.throws(() => orBitsetRecursive(0n, -1n), RangeError);
		assert.throws(() => orBitsetRecursive(-1n, -1n), RangeError);
		assert.throws(() => orBitsetRecursive(-(1n << 600n), 1n << 600n), RangeError);
		assert.throws(() => orBitsetRecursive(1n << 600n, -(1n << 600n)), RangeError);
	});

	test('independent cross-check against native bitwise | across widths up to 2048 bits', () => {
		const next64 = createPrng(0x9e3779b97f4a7c15n);
		const widths = [0, 1, 7, 16, 31, 32, 33, 48, 63, 64, 65, 100, 128, 255, 256, 512, 513, 777, 1024, 1536, 2048];

		for (const widthA of widths) {
			for (let trial = 0; trial < 3; trial++) {
				const widthB = widths[(widthA + trial * 7) % widths.length];
				const a = randomBigInt(next64, widthA);
				const b = randomBigInt(next64, widthB);
				assert.equal(
					orBitsetRecursive(a, b),
					a | b,
					`Mismatch for widths (${widthA}, ${widthB})`,
				);
			}
		}
	});
});
