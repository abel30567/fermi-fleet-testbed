import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orBitsetSeries } from './orBitsetSeries.js';

/**
 * Independent reference implementation via binary string expansion.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function referenceOrByBinaryStrings(a, b) {
	const sa = a.toString(2);
	const sb = b.toString(2);
	const len = Math.max(sa.length, sb.length);
	const pa = sa.padStart(len, '0');
	const pb = sb.padStart(len, '0');
	let out = '';
	for (let i = 0; i < len; i++) {
		out += pa[i] === '1' || pb[i] === '1' ? '1' : '0';
	}
	return BigInt(`0b${out}`);
}

/**
 * Deterministic PRNG (xorshift64*) producing wide non-negative BigInt bitsets.
 *
 * @param {bigint} seed
 * @param {number} bitWidth
 * @returns {{ value: bigint, nextSeed: bigint }}
 */
function nextWideBitset(seed, bitWidth) {
	let state = seed;
	let value = 0n;
	const mask64 = (1n << 64n) - 1n;
	let produced = 0;

	while (produced < bitWidth) {
		state ^= state >> 12n;
		state = (state ^ (state << 25n)) & mask64;
		state ^= state >> 27n;
		const word = (state * 0x2545f4914f6cdd1dn) & mask64;
		const take = Math.min(64, bitWidth - produced);
		const chunk = word & ((1n << BigInt(take)) - 1n);
		value |= chunk << BigInt(produced);
		produced += take;
	}

	return { value, nextSeed: state };
}

describe('orBitsetSeries', () => {
	describe('normal cases', () => {
		it('satisfies the 1-bit truth table', () => {
			assert.equal(orBitsetSeries(0n, 0n), 0n);
			assert.equal(orBitsetSeries(0n, 1n), 1n);
			assert.equal(orBitsetSeries(1n, 0n), 1n);
			assert.equal(orBitsetSeries(1n, 1n), 1n);
		});

		it('computes union for small and medium bitsets', () => {
			assert.equal(orBitsetSeries(0b1010n, 0b1100n), 0b1110n);
			assert.equal(orBitsetSeries(0b01010101n, 0b10101010n), 0b11111111n);
			assert.equal(orBitsetSeries(0xdeadbeefn, 0xcafebaben), 0xdeadbeefn | 0xcafebaben);
			assert.equal(
				orBitsetSeries(0x0123456789abcdefn, 0xfedcba9876543210n),
				0xffffffffffffffffn
			);
		});
	});

	describe('edge cases', () => {
		it('handles zero identity element', () => {
			const samples = [0n, 1n, 42n, (1n << 64n) - 1n, (1n << 300n) + 12345n];
			for (const x of samples) {
				assert.equal(orBitsetSeries(0n, x), x);
				assert.equal(orBitsetSeries(x, 0n), x);
			}
		});

		it('handles identical bitsets (idempotence)', () => {
			const samples = [
				0n,
				1n,
				0b101101n,
				(1n << 30n) - 1n,
				1n << 30n,
				(1n << 300n) - 1n,
				(1n << 512n) + (1n << 256n) + 1n
			];
			for (const x of samples) {
				assert.equal(orBitsetSeries(x, x), x);
			}
		});

		it('handles disjoint bitsets where union equals arithmetic sum', () => {
			let evenMask = 0n;
			let oddMask = 0n;
			for (let k = 0n; k < 320n; k += 2n) {
				evenMask += 1n << k;
				oddMask += 1n << (k + 1n);
			}
			const expected = (1n << 320n) - 1n;
			assert.equal(orBitsetSeries(evenMask, oddMask), expected);
			assert.equal(orBitsetSeries(evenMask, oddMask), evenMask + oddMask);
		});

		it('handles subset and superset bitsets', () => {
			const superset = (1n << 400n) - 1n;
			const subset = (1n << 399n) + (1n << 123n) + (1n << 30n) + 1n;
			assert.equal(orBitsetSeries(subset, superset), superset);
			assert.equal(orBitsetSeries(superset, subset), superset);
		});

		it('handles radix-block boundaries accurately (2^30, 2^60, 2^90)', () => {
			const boundaries = [30n, 60n, 90n];
			for (const b of boundaries) {
				const below = (1n << b) - 1n;
				const at = 1n << b;
				const above = (1n << b) + 1n;
				assert.equal(orBitsetSeries(below, at), (1n << (b + 1n)) - 1n);
				assert.equal(orBitsetSeries(at, below), (1n << (b + 1n)) - 1n);
				assert.equal(orBitsetSeries(at, at), at);
				assert.equal(orBitsetSeries(below, above), (1n << (b + 1n)) - 1n);
			}
		});

		it('handles very wide bitsets (>256 bits) and asymmetric widths', () => {
			const a512 = ((1n << 512n) - 1n) / 3n; // alternating 0101... across 512 bits
			const b512 = a512 << 1n; // alternating 1010... across 512 bits
			assert.equal(orBitsetSeries(a512, b512), (1n << 512n) - 1n);

			const highBit = 1n << 2048n;
			const lowBits = 0b10101101n;
			assert.equal(orBitsetSeries(highBit, lowBits), highBit | lowBits);
			assert.equal(orBitsetSeries(lowBits, highBit), highBit | lowBits);

			const wideA = (1n << 1024n) + (1n << 777n) + (1n << 301n) + 0xabcdn;
			const wideB = (1n << 1025n) + (1n << 777n) + (1n << 299n) + 0x1234n;
			assert.equal(orBitsetSeries(wideA, wideB), wideA | wideB);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt operands', () => {
			const invalidValues = [
				0,
				1,
				42,
				-1,
				1.5,
				NaN,
				Infinity,
				-Infinity,
				'0',
				'1n',
				true,
				false,
				null,
				undefined,
				{},
				[],
				Object(1n),
				Symbol('bitset')
			];

			for (const bad of invalidValues) {
				assert.throws(() => orBitsetSeries(bad, 0n), TypeError);
				assert.throws(() => orBitsetSeries(0n, bad), TypeError);
			}
			assert.throws(() => orBitsetSeries(), TypeError);
			assert.throws(() => orBitsetSeries(1n), TypeError);
		});

		it('throws RangeError for negative BigInt operands', () => {
			const negatives = [-1n, -2n, -1000n, -(1n << 256n)];
			for (const neg of negatives) {
				assert.throws(() => orBitsetSeries(neg, 0n), RangeError);
				assert.throws(() => orBitsetSeries(0n, neg), RangeError);
				assert.throws(() => orBitsetSeries(neg, neg), RangeError);
			}
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches native BigInt | exhaustively on [0n, 31n] x [0n, 31n]', () => {
			for (let a = 0n; a < 32n; a++) {
				for (let b = 0n; b < 32n; b++) {
					assert.equal(orBitsetSeries(a, b), a | b);
				}
			}
		});

		it('matches native |, binary-string reference, inclusion-exclusion, and De Morgan law on wide bitsets', () => {
			let seed = 0x9e3779b97f4a7c15n;
			const widths = [16, 30, 31, 64, 128, 257, 513, 1025];

			for (const width of widths) {
				const universe = (1n << BigInt(width)) - 1n;

				for (let trial = 0; trial < 10; trial++) {
					const ra = nextWideBitset(seed, width);
					const rb = nextWideBitset(ra.nextSeed, width);
					const rc = nextWideBitset(rb.nextSeed, width);
					seed = rc.nextSeed;

					const a = ra.value;
					const b = rb.value;
					const c = rc.value;

					const actual = orBitsetSeries(a, b);

					// 1. Native BigInt bitwise OR
					assert.equal(actual, a | b);

					// 2. Independent binary-string reference implementation
					assert.equal(actual, referenceOrByBinaryStrings(a, b));

					// 3. Arithmetic inclusion-exclusion identity: a | b = (a + b) - (a & b)
					assert.equal(actual, a + b - (a & b));

					// 4. De Morgan's law over universe mask U: a | b = U - ((U - a) & (U - b))
					const compA = universe - a;
					const compB = universe - b;
					const deMorgan = universe - (compA & compB);
					assert.equal(actual, deMorgan);

					// 5. Boolean algebra laws: commutativity, associativity, absorption
					assert.equal(actual, orBitsetSeries(b, a));
					assert.equal(orBitsetSeries(actual, c), orBitsetSeries(a, orBitsetSeries(b, c)));
					assert.equal(orBitsetSeries(a, a & b), a);
				}
			}
		});
	});
});
