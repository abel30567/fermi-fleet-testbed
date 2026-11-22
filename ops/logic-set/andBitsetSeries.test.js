import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { andBitsetSeries } from './andBitsetSeries.js';

/**
 * Deterministic PRNG (xorshift64*) producing reproducible wide BigInt bitsets.
 */
function makeBitsetGenerator(seed = 0x9e3779b97f4a7c15n) {
	let state = seed;
	const mask64 = (1n << 64n) - 1n;

	function next64() {
		state ^= state >> 12n;
		state = (state ^ (state << 25n)) & mask64;
		state ^= state >> 27n;
		return (state * 0x2545f4914f6cdd1dn) & mask64;
	}

	return function nextBigInt(bits) {
		let acc = 0n;
		let remaining = bits;
		while (remaining > 0) {
			const take = Math.min(64, remaining);
			const chunk = next64() & ((1n << BigInt(take)) - 1n);
			acc = (acc << BigInt(take)) | chunk;
			remaining -= take;
		}
		return acc;
	};
}

/**
 * Independent reference: popcount (Hamming weight) of a non-negative BigInt.
 */
function popcount(x) {
	let count = 0;
	let v = x;
	while (v > 0n) {
		v &= v - 1n;
		count++;
	}
	return count;
}

/**
 * Independent reference: De Morgan's law over a fixed width W:
 *   a ∧ b = ¬(¬a ∨ ¬b) mod 2^W
 */
function deMorganAnd(a, b, width) {
	const mask = (1n << BigInt(width)) - 1n;
	const compA = mask - (a & mask);
	const compB = mask - (b & mask);
	return mask - (compA | compB);
}

/**
 * Independent reference: arithmetic identity using addition and XOR:
 *   a ∧ b = ((a + b) - (a ^ b)) / 2
 */
function arithmeticIdentityAnd(a, b) {
	return ((a + b) - (a ^ b)) / 2n;
}

describe('andBitsetSeries', () => {
	describe('normal cases', () => {
		it('computes bitwise AND for small bitsets', () => {
			assert.equal(andBitsetSeries(0b10110n, 0b11010n), 0b10010n);
			assert.equal(andBitsetSeries(0b1111n, 0b0101n), 0b0101n);
			assert.equal(andBitsetSeries(1n, 1n), 1n);
			assert.equal(andBitsetSeries(255n, 170n), 170n);
			assert.equal(andBitsetSeries(0xdeadbeefn, 0x0f0f0f0fn), 0x0e0d0e0fn);
		});

		it('handles 30-bit block boundaries accurately', () => {
			for (const bit of [0, 1, 28, 29, 30, 31, 59, 60, 61, 89, 90, 91]) {
				const p = 1n << BigInt(bit);
				const mask = (1n << BigInt(bit + 1)) - 1n;
				assert.equal(andBitsetSeries(p, mask), p);
				assert.equal(andBitsetSeries(p, p), p);
				assert.equal(andBitsetSeries(p, mask - p), 0n);
			}
		});

		it('supports variadic intersections over 3 or more bitsets', () => {
			assert.equal(andBitsetSeries(0b11110n, 0b10111n, 0b01110n), 0b00110n);
			assert.equal(
				andBitsetSeries(0xff0fn, 0xf0ffn, 0x0fffn, 0xfff0n),
				0xff0fn & 0xf0ffn & 0x0fffn & 0xfff0n
			);
			assert.equal(
				andBitsetSeries(
					(1n << 300n) - 1n,
					(1n << 200n) - 1n,
					(1n << 100n) - 1n,
					0b1010101n
				),
				0b1010101n
			);
		});

		it('supports optional width truncation (Number and BigInt)', () => {
			const a = 0b1110_1101_1011n;
			const b = 0b1011_1111_0111n;
			const full = a & b; // 0b1010_1101_0011n

			assert.equal(andBitsetSeries(a, b, {}), full);
			assert.equal(andBitsetSeries(a, b, { width: undefined }), full);
			assert.equal(andBitsetSeries(a, b, { width: 0 }), 0n);
			assert.equal(andBitsetSeries(a, b, { width: 0n }), 0n);
			assert.equal(andBitsetSeries(a, b, { width: 4 }), 0b0011n);
			assert.equal(andBitsetSeries(a, b, { width: 8n }), 0b1101_0011n);
			assert.equal(andBitsetSeries(a, b, { width: 12 }), full);
			assert.equal(andBitsetSeries(a, b, { width: 1000 }), full);

			// Width at and across 30-bit block boundary
			const wideA = (1n << 65n) - 1n;
			const wideB = (1n << 65n) - 1n;
			assert.equal(andBitsetSeries(wideA, wideB, { width: 30 }), (1n << 30n) - 1n);
			assert.equal(andBitsetSeries(wideA, wideB, { width: 31 }), (1n << 31n) - 1n);
			assert.equal(andBitsetSeries(wideA, wideB, { width: 60n }), (1n << 60n) - 1n);
			assert.equal(andBitsetSeries(wideA, wideB, { width: 61n }), (1n << 61n) - 1n);

			// Variadic + width option
			assert.equal(
				andBitsetSeries(0b111111n, 0b101101n, 0b111011n, { width: 4 }),
				0b1001n
			);
		});
	});

	describe('edge cases', () => {
		it('handles zero bitsets (annihilation)', () => {
			assert.equal(andBitsetSeries(0n, 0n), 0n);
			assert.equal(andBitsetSeries(0n, 123456789n), 0n);
			assert.equal(andBitsetSeries(123456789n, 0n), 0n);
			assert.equal(andBitsetSeries((1n << 512n) - 1n, (1n << 512n) - 1n, 0n), 0n);
		});

		it('handles identical bitsets (idempotence)', () => {
			const values = [
				0n,
				1n,
				(1n << 30n) - 1n,
				(1n << 64n) - 1n,
				(1n << 300n) + (1n << 150n) + 42n,
				(1n << 1024n) - 1n,
			];
			for (const v of values) {
				assert.equal(andBitsetSeries(v, v), v);
				assert.equal(andBitsetSeries(v, v, v), v);
			}
		});

		it('handles disjoint bitsets', () => {
			// Alternating even and odd bits across 512 bits
			let evenMask = 0n;
			let oddMask = 0n;
			for (let k = 0; k < 512; k += 2) {
				evenMask |= 1n << BigInt(k);
				oddMask |= 1n << BigInt(k + 1);
			}
			assert.equal(andBitsetSeries(evenMask, oddMask), 0n);

			// Non-overlapping low and high bit regions
			const low = (1n << 256n) - 1n;
			const high = ((1n << 256n) - 1n) << 256n;
			assert.equal(andBitsetSeries(low, high), 0n);
		});

		it('handles very wide bitsets (>256-bit up to 4096-bit)', () => {
			const rand = makeBitsetGenerator(0x123456789abcdef0n);
			for (const bits of [257, 384, 512, 1024, 2048, 4096]) {
				const a = rand(bits);
				const b = rand(bits);
				assert.equal(andBitsetSeries(a, b), a & b);
			}
		});

		it('handles highly asymmetric bitset widths', () => {
			const huge = (1n << 4096n) - 1n;
			const tiny = 0b101101n;
			assert.equal(andBitsetSeries(huge, tiny), tiny);
			assert.equal(andBitsetSeries(tiny, huge), tiny);
			assert.equal(andBitsetSeries(huge, huge, tiny), tiny);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when fewer than two bitset operands are supplied', () => {
			assert.throws(() => andBitsetSeries(), TypeError);
			assert.throws(() => andBitsetSeries(1n), TypeError);
			assert.throws(() => andBitsetSeries(1n, { width: 8 }), TypeError);
		});

		it('throws TypeError for non-BigInt operands', () => {
			const invalidValues = [
				0,
				1,
				42,
				NaN,
				Infinity,
				-Infinity,
				'1',
				'0xff',
				true,
				false,
				null,
				undefined,
				[1n],
				new Date(),
				Symbol('x'),
			];

			for (const bad of invalidValues) {
				assert.throws(() => andBitsetSeries(bad, 1n), TypeError);
				assert.throws(() => andBitsetSeries(1n, bad), TypeError);
				assert.throws(() => andBitsetSeries(0n, bad), TypeError);
				assert.throws(() => andBitsetSeries(1n, 2n, bad), TypeError);
			}

			// Plain object as 1st or 2nd argument must still be rejected as non-BigInt
			assert.throws(() => andBitsetSeries({}, 1n), TypeError);
			assert.throws(() => andBitsetSeries(1n, {}), TypeError);
		});

		it('throws RangeError for negative BigInt operands even when another operand is 0n', () => {
			assert.throws(() => andBitsetSeries(-1n, 1n), RangeError);
			assert.throws(() => andBitsetSeries(1n, -1n), RangeError);
			assert.throws(() => andBitsetSeries(0n, -1n), RangeError);
			assert.throws(() => andBitsetSeries(-1n, 0n), RangeError);
			assert.throws(() => andBitsetSeries(0n, 5n, -(1n << 300n)), RangeError);
		});

		it('validates the options object and width thoroughly', () => {
			assert.throws(() => andBitsetSeries(1n, 2n, { foo: 8 }), TypeError);
			assert.throws(() => andBitsetSeries(1n, 2n, { width: 8, extra: true }), TypeError);

			// Invalid width types -> TypeError
			assert.throws(() => andBitsetSeries(1n, 2n, { width: '8' }), TypeError);
			assert.throws(() => andBitsetSeries(1n, 2n, { width: null }), TypeError);
			assert.throws(() => andBitsetSeries(1n, 2n, { width: true }), TypeError);
			assert.throws(() => andBitsetSeries(0n, 0n, { width: '8' }), TypeError);

			// Invalid width values -> RangeError
			assert.throws(() => andBitsetSeries(1n, 2n, { width: -1 }), RangeError);
			assert.throws(() => andBitsetSeries(1n, 2n, { width: -1n }), RangeError);
			assert.throws(() => andBitsetSeries(1n, 2n, { width: 1.5 }), RangeError);
			assert.throws(() => andBitsetSeries(1n, 2n, { width: NaN }), RangeError);
			assert.throws(() => andBitsetSeries(1n, 2n, { width: Infinity }), RangeError);
			assert.throws(() => andBitsetSeries(1n, 2n, { width: Number.MAX_SAFE_INTEGER + 1 }), RangeError);
			assert.throws(() => andBitsetSeries(0n, 0n, { width: -5 }), RangeError);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches native BigInt &, arithmetic XOR identity, and De Morgan law across wide random inputs', () => {
			const rand = makeBitsetGenerator(0xfedcba9876543210n);
			const widths = [8, 30, 31, 64, 128, 256, 333, 512];

			for (const w of widths) {
				for (let trial = 0; trial < 10; trial++) {
					const a = rand(w);
					const b = rand(w);
					const actual = andBitsetSeries(a, b);

					// 1. Native BigInt bitwise AND
					assert.equal(actual, a & b);

					// 2. Arithmetic identity: ((a + b) - (a ^ b)) / 2
					assert.equal(actual, arithmeticIdentityAnd(a, b));

					// 3. De Morgan's law over width w: ~(~a | ~b)
					assert.equal(actual, deMorganAnd(a, b, w));

					// 4. Truncated width cross-check against De Morgan over half-width
					const halfW = Math.floor(w / 2);
					assert.equal(
						andBitsetSeries(a, b, { width: halfW }),
						deMorganAnd(a, b, halfW)
					);
				}
			}
		});

		it('satisfies Boolean algebra and set-theoretic laws', () => {
			const rand = makeBitsetGenerator(0x0badc0ffee123456n);

			for (let trial = 0; trial < 20; trial++) {
				const a = rand(300);
				const b = rand(300);
				const c = rand(300);

				// Commutativity
				assert.equal(andBitsetSeries(a, b), andBitsetSeries(b, a));

				// Associativity & variadic equivalence
				const left = andBitsetSeries(andBitsetSeries(a, b), c);
				const right = andBitsetSeries(a, andBitsetSeries(b, c));
				const variadic = andBitsetSeries(a, b, c);
				assert.equal(left, right);
				assert.equal(left, variadic);

				// Distributivity over symmetric difference (XOR) and union (OR)
				assert.equal(
					andBitsetSeries(a, b ^ c),
					andBitsetSeries(a, b) ^ andBitsetSeries(a, c)
				);
				assert.equal(
					andBitsetSeries(a, b | c),
					andBitsetSeries(a, b) | andBitsetSeries(a, c)
				);

				// Subset / monotonicity bounds
				const ab = andBitsetSeries(a, b);
				assert.ok(ab <= a && ab <= b);

				// Inclusion-exclusion cardinality identity: |A| + |B| = |A ∪ B| + |A ∩ B|
				assert.equal(
					popcount(a) + popcount(b),
					popcount(a | b) + popcount(ab)
				);
			}
		});
	});
});
