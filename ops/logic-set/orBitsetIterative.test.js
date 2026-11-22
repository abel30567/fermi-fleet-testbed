import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orBitsetIterative } from './orBitsetIterative.js';

/**
 * Independent reference implementation via explicit set-of-bit-indices union.
 * Does not use bitwise OR at all.
 */
function referenceSetUnionBitset(a, b) {
	const indices = new Set();
	for (let x = a, idx = 0n; x > 0n; x >>= 1n, idx += 1n) {
		if ((x & 1n) === 1n) {
			indices.add(idx);
		}
	}
	for (let y = b, idx = 0n; y > 0n; y >>= 1n, idx += 1n) {
		if ((y & 1n) === 1n) {
			indices.add(idx);
		}
	}
	let acc = 0n;
	for (const idx of indices) {
		acc += 1n << idx;
	}
	return acc;
}

/**
 * Deterministic LCG generator producing pseudo-random BigInts of given bit length.
 */
function makePrng(seed = 0x12345678n) {
	let state = seed;
	return (bits) => {
		let value = 0n;
		let remaining = bits;
		while (remaining > 0) {
			state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
			const take = remaining >= 64 ? 64 : remaining;
			const mask = (1n << BigInt(take)) - 1n;
			value = (value << BigInt(take)) | (state & mask);
			remaining -= take;
		}
		return value;
	};
}

describe('orBitsetIterative', () => {
	describe('normal cases', () => {
		it('computes bitwise OR for small bitsets', () => {
			assert.equal(orBitsetIterative(0b1010n, 0b0101n), 0b1111n);
			assert.equal(orBitsetIterative(0b1100n, 0b1010n), 0b1110n);
			assert.equal(orBitsetIterative(0b1111n, 0b1111n), 0b1111n);
			assert.equal(orBitsetIterative(1n, 2n), 3n);
		});

		it('handles 32-bit sign-bit positions without signed overflow', () => {
			const bit31 = 1n << 31n;
			const bit63 = 1n << 63n;
			const bit95 = 1n << 95n;
			assert.equal(orBitsetIterative(bit31, 0n), bit31);
			assert.equal(orBitsetIterative(0n, bit31), bit31);
			assert.equal(orBitsetIterative(bit31, 1n), bit31 + 1n);
			assert.equal(orBitsetIterative(bit31, bit63), bit31 + bit63);
			assert.equal(orBitsetIterative(bit63, bit95), bit63 + bit95);
		});

		it('handles operands spanning multiple 32-bit chunks', () => {
			const a = 0x123456789abcdef0fedcba9876543210n;
			const b = 0x0f0f0f0f0f0f0f0ff0f0f0f0f0f0f0f0n;
			assert.equal(orBitsetIterative(a, b), a | b);
		});

		it('handles operands of vastly different bit widths', () => {
			const huge = (1n << 512n) + (1n << 257n) + 0xabn;
			const tiny = 0x54n;
			assert.equal(orBitsetIterative(huge, tiny), huge | tiny);
			assert.equal(orBitsetIterative(tiny, huge), tiny | huge);
		});
	});

	describe('edge cases', () => {
		it('handles zero and identity cases', () => {
			assert.equal(orBitsetIterative(0n, 0n), 0n);
			assert.equal(orBitsetIterative(0n, 42n), 42n);
			assert.equal(orBitsetIterative(42n, 0n), 42n);
			const big = (1n << 300n) - 1n;
			assert.equal(orBitsetIterative(big, 0n), big);
			assert.equal(orBitsetIterative(0n, big), big);
		});

		it('handles exact chunk-boundary all-ones bitsets', () => {
			for (const bits of [1n, 31n, 32n, 33n, 63n, 64n, 65n, 128n, 256n]) {
				const allOnes = (1n << bits) - 1n;
				assert.equal(orBitsetIterative(allOnes, allOnes), allOnes);
				assert.equal(orBitsetIterative(allOnes, 0n), allOnes);
				assert.equal(orBitsetIterative(1n << (bits - 1n), allOnes >> 1n), allOnes);
			}
		});

		it('handles very wide sparse BigInt bitsets', () => {
			const a = (1n << 4096n) + (1n << 1024n) + 1n;
			const b = (1n << 8192n) + (1n << 2048n) + (1n << 1024n);
			const expected = (1n << 8192n) + (1n << 4096n) + (1n << 2048n) + (1n << 1024n) + 1n;
			assert.equal(orBitsetIterative(a, b), expected);
		});

		it('respects optional bitWidth truncation across sub-chunk, exact, and multi-chunk widths', () => {
			const a = (1n << 100n) | 0xdeadbeef12345678n;
			const b = (1n << 99n) | 0x0f0f0f0f87654321n;
			const fullOr = a | b;

			assert.equal(orBitsetIterative(a, b, 0), 0n);
			assert.equal(orBitsetIterative(a, b, 0n), 0n);

			for (const width of [1, 4, 15, 31, 32, 33, 48, 63, 64, 65, 99, 100, 101, 200]) {
				const expected = BigInt.asUintN(width, fullOr);
				assert.equal(orBitsetIterative(a, b, width), expected);
				assert.equal(orBitsetIterative(a, b, BigInt(width)), expected);
			}

			// Large bitWidth should terminate as soon as operands are exhausted
			assert.equal(orBitsetIterative(0b101n, 0b011n, 1_000_000n), 0b111n);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when a or b is not a BigInt', () => {
			const invalidValues = [0, 1, '1', null, undefined, true, {}, []];
			for (const val of invalidValues) {
				assert.throws(() => orBitsetIterative(val, 0n), TypeError);
				assert.throws(() => orBitsetIterative(0n, val), TypeError);
			}
		});

		it('throws RangeError when a or b is negative', () => {
			assert.throws(() => orBitsetIterative(-1n, 0n), RangeError);
			assert.throws(() => orBitsetIterative(0n, -1n), RangeError);
			assert.throws(() => orBitsetIterative(-(1n << 100n), 5n), RangeError);
			assert.throws(() => orBitsetIterative(5n, -(1n << 100n)), RangeError);
		});

		it('throws TypeError or RangeError for invalid bitWidth', () => {
			assert.throws(() => orBitsetIterative(1n, 2n, '32'), TypeError);
			assert.throws(() => orBitsetIterative(1n, 2n, null), TypeError);
			assert.throws(() => orBitsetIterative(1n, 2n, true), TypeError);
			assert.throws(() => orBitsetIterative(1n, 2n, {}), TypeError);

			assert.throws(() => orBitsetIterative(1n, 2n, -1), RangeError);
			assert.throws(() => orBitsetIterative(1n, 2n, -1n), RangeError);
			assert.throws(() => orBitsetIterative(1n, 2n, 1.5), RangeError);
			assert.throws(() => orBitsetIterative(1n, 2n, Number.NaN), RangeError);
			assert.throws(() => orBitsetIterative(1n, 2n, Number.POSITIVE_INFINITY), RangeError);
			assert.throws(() => orBitsetIterative(1n, 2n, Number.MAX_SAFE_INTEGER + 1), RangeError);
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches independent set-of-bit-indices union and native BigInt | across widths', () => {
			const nextRand = makePrng(0x9e3779b97f4a7c15n);
			const widths = [0, 1, 7, 31, 32, 33, 63, 64, 65, 127, 128, 257, 512];

			for (const wA of widths) {
				for (const wB of [0, 16, 32, 65, 256]) {
					const a = nextRand(wA);
					const b = nextRand(wB);
					const actual = orBitsetIterative(a, b);
					assert.equal(actual, a | b);
					assert.equal(actual, referenceSetUnionBitset(a, b));
				}
			}
		});

		it('satisfies Boolean lattice and inclusion-exclusion identities', () => {
			const nextRand = makePrng(0xfeedfacecafebeefn);
			for (let i = 0; i < 25; i++) {
				const width = 128 + i * 17;
				const a = nextRand(width);
				const b = nextRand(width);
				const c = nextRand(width);
				const mask = (1n << BigInt(width)) - 1n;

				// Commutativity
				assert.equal(orBitsetIterative(a, b), orBitsetIterative(b, a));
				// Associativity
				assert.equal(
					orBitsetIterative(orBitsetIterative(a, b), c),
					orBitsetIterative(a, orBitsetIterative(b, c)),
				);
				// Idempotence
				assert.equal(orBitsetIterative(a, a), a);
				// Inclusion-exclusion: a + b === (a | b) + (a & b)
				assert.equal(a + b, orBitsetIterative(a, b) + (a & b));
				// De Morgan's law over finite universe [0, width): a | b === ~(~a & ~b)
				assert.equal(orBitsetIterative(a, b), mask ^ ((mask ^ a) & (mask ^ b)));
			}
		});
	});
});
