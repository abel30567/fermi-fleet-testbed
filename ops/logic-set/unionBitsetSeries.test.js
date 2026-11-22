import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionBitsetSeries } from './unionBitsetSeries.js';

/**
 * Independent reference: converts a non-negative BigInt bitset to a JS Set of
 * member indices using explicit Euclidean division by 2.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToSet(bitset) {
	const result = new Set();
	let value = bitset;
	let index = 0;
	while (value > 0n) {
		if (value % 2n === 1n) {
			result.add(index);
		}
		value /= 2n;
		index++;
	}
	return result;
}

/**
 * Independent reference: converts a JS Set of non-negative integer indices back
 * to a BigInt bitset via `sum_{k in S} 2^k`.
 *
 * @param {Set<number>} set
 * @returns {bigint}
 */
function setToBitset(set) {
	let result = 0n;
	for (const index of set) {
		result += 1n << BigInt(index);
	}
	return result;
}

/**
 * Independent reference: union via explicit JS Set membership.
 *
 * @param  {...bigint} bitsets
 * @returns {bigint}
 */
function referenceSetUnion(...bitsets) {
	const merged = new Set();
	for (const bs of bitsets) {
		for (const elem of bitsetToSet(bs)) {
			merged.add(elem);
		}
	}
	return setToBitset(merged);
}

/**
 * Deterministic 64-bit SplitMix PRNG for reproducible arbitrary-width bitset tests.
 *
 * @param {bigint} seed
 */
function createPrng(seed) {
	let state = seed & 0xffffffffffffffffn;
	const mask64 = 0xffffffffffffffffn;
	return {
		next64() {
			state = (state + 0x9e3779b97f4a7c15n) & mask64;
			let z = state;
			z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & mask64;
			z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & mask64;
			return (z ^ (z >> 31n)) & mask64;
		},
		nextBitset(bits) {
			let acc = 0n;
			let remaining = bits;
			while (remaining > 0) {
				const chunk = remaining >= 64 ? 64 : remaining;
				const word = this.next64() >> BigInt(64 - chunk);
				acc = (acc << BigInt(chunk)) + word;
				remaining -= chunk;
			}
			return acc;
		}
	};
}

describe('unionBitsetSeries', () => {
	describe('normal cases', () => {
		it('computes binary union of overlapping sets', () => {
			assert.equal(unionBitsetSeries(0b1010n, 0b1100n), 0b1110n);
			assert.equal(unionBitsetSeries(0b101n, 0b011n), 0b111n);
			assert.equal(unionBitsetSeries(0xff0fn, 0x0ff0n), 0xffffn);
		});

		it('computes binary union of disjoint sets (equals arithmetic sum)', () => {
			assert.equal(unionBitsetSeries(0b1010n, 0b0101n), 0b1111n);
			assert.equal(unionBitsetSeries(0b1010n, 0b0101n), 0b1010n + 0b0101n);
			assert.equal(unionBitsetSeries(0xf0f0n, 0x0f0fn), 0xffffn);
		});

		it('computes binary union of subset/superset and identical sets', () => {
			assert.equal(unionBitsetSeries(0b1111n, 0b0101n), 0b1111n);
			assert.equal(unionBitsetSeries(0b0101n, 0b1111n), 0b1111n);
			assert.equal(unionBitsetSeries(0b101101n, 0b101101n), 0b101101n);
		});

		it('supports unary and variadic calls cleanly', () => {
			assert.equal(unionBitsetSeries(0b10110n), 0b10110n);
			assert.equal(unionBitsetSeries(0b0001n, 0b0010n, 0b0100n, 0b1000n), 0b1111n);
			assert.equal(
				unionBitsetSeries(0b1001n, 0b0101n, 0b0011n, 0b1001n, 0b0000n),
				0b1111n
			);
		});
	});

	describe('edge cases', () => {
		it('handles empty union and empty set 0n', () => {
			assert.equal(unionBitsetSeries(), 0n);
			assert.equal(unionBitsetSeries(0n), 0n);
			assert.equal(unionBitsetSeries(0n, 0n), 0n);
			assert.equal(unionBitsetSeries(0n, 0n, 0n, 0n), 0n);
			assert.equal(unionBitsetSeries(0n, 42n), 42n);
			assert.equal(unionBitsetSeries(42n, 0n), 42n);
			assert.equal(unionBitsetSeries(0n, 0n, 42n, 0n), 42n);
		});

		it('handles exact 30-bit base block boundary values', () => {
			const b30 = 1n << 30n;
			const max30 = b30 - 1n;

			assert.equal(unionBitsetSeries(max30, max30), max30);
			assert.equal(unionBitsetSeries(max30, 1n), max30);
			assert.equal(unionBitsetSeries(max30, b30), (1n << 31n) - 1n);
			assert.equal(unionBitsetSeries(b30, b30), b30);
			assert.equal(unionBitsetSeries(b30 + 1n, b30 + 2n), b30 + 3n);
			assert.equal(unionBitsetSeries(b30 - 2n, b30 + 1n), (1n << 31n) - 1n);
		});

		it('handles highly asymmetric bit widths (upper-tail collapse)', () => {
			const highPure = 1n << 512n;
			const highWithLow = (1n << 512n) + 0b1010n;
			const small = 0b0110n;

			assert.equal(unionBitsetSeries(highPure, small), highPure | small);
			assert.equal(unionBitsetSeries(small, highPure), highPure | small);
			assert.equal(unionBitsetSeries(highWithLow, small), highWithLow | small);
			assert.equal(
				unionBitsetSeries(small, highWithLow, 0b100001n),
				small | highWithLow | 0b100001n
			);
		});

		it('handles >256-bit, 512-bit, 1024-bit, and 4096-bit arbitrary-width bitsets', () => {
			const a300 = (1n << 300n) | (1n << 257n) | (1n << 128n) | 0xdeadbeefn;
			const b300 = (1n << 299n) | (1n << 257n) | (1n << 64n) | 0xcafebaben;
			assert.equal(unionBitsetSeries(a300, b300), a300 | b300);

			const all512 = (1n << 512n) - 1n;
			const even512 = all512 / 3n; // alternating 0101... pattern
			const odd512 = even512 << 1n; // alternating 1010... pattern
			assert.equal(unionBitsetSeries(even512, odd512), all512);

			const sparse1024A = (1n << 1023n) + (1n << 511n) + (1n << 255n) + 1n;
			const sparse1024B = (1n << 1024n) + (1n << 511n) + (1n << 127n) + 2n;
			assert.equal(
				unionBitsetSeries(sparse1024A, sparse1024B),
				sparse1024A | sparse1024B
			);

			const dense4096A = ((1n << 4096n) - 1n) / 5n; // repeating 0011 pattern
			const dense4096B = dense4096A << 2n; // complementary 1100 pattern
			assert.equal(
				unionBitsetSeries(dense4096A, dense4096B),
				dense4096A | dense4096B
			);
		});
	});

	describe('algebraic identities', () => {
		it('satisfies commutativity, associativity, idempotence, and inclusion-exclusion', () => {
			const a = (1n << 320n) | (0x123456789abcdef0n << 100n) | 0x5555n;
			const b = (1n << 319n) | (0xfedcba9876543210n << 100n) | 0xaaa5n;
			const c = (1n << 320n) | (0x0f0f0f0f0f0f0f0fn << 100n) | 0x3333n;

			// Commutativity
			assert.equal(unionBitsetSeries(a, b), unionBitsetSeries(b, a));

			// Associativity
			assert.equal(
				unionBitsetSeries(unionBitsetSeries(a, b), c),
				unionBitsetSeries(a, unionBitsetSeries(b, c))
			);
			assert.equal(
				unionBitsetSeries(a, b, c),
				unionBitsetSeries(unionBitsetSeries(a, b), c)
			);

			// Idempotence
			assert.equal(unionBitsetSeries(a, a), a);
			assert.equal(unionBitsetSeries(a, a, a, a), a);

			// Binary inclusion-exclusion: A ∪ B = A + B - (A ∩ B)
			assert.equal(unionBitsetSeries(a, b), a + b - (a & b));

			// Ternary inclusion-exclusion: A ∪ B ∪ C = A + B + C - AB - AC - BC + ABC
			const ie3 = a + b + c - (a & b) - (a & c) - (b & c) + (a & b & c);
			assert.equal(unionBitsetSeries(a, b, c), ie3);

			// De Morgan's law over universe U = 2^321 - 1
			const universe = (1n << 321n) - 1n;
			assert.equal(
				unionBitsetSeries(a, b),
				universe - ((universe - a) & (universe - b))
			);
		});
	});

	describe('cross-checks against explicit Set conversion and native BigInt |', () => {
		it('matches explicit Set element conversion on binary and variadic sets including >256-bit', () => {
			const cases = [
				[0n, 0n],
				[0n, 1n],
				[0b101010n, 0b010110n],
				[
					setToBitset(new Set([0, 1, 5, 63, 64, 128, 256, 300])),
					setToBitset(new Set([1, 2, 64, 127, 256, 299, 310]))
				],
				[
					setToBitset(new Set([0, 10, 30, 31, 257])),
					setToBitset(new Set([10, 29, 30, 150, 384])),
					setToBitset(new Set([1, 31, 150, 512])),
					setToBitset(new Set([0, 512, 600]))
				]
			];

			for (const inputs of cases) {
				const expectedSet = referenceSetUnion(...inputs);
				const expectedNative = inputs.reduce((acc, v) => acc | v, 0n);
				const actual = unionBitsetSeries(...inputs);

				assert.equal(actual, expectedSet);
				assert.equal(actual, expectedNative);
				assert.deepEqual(bitsetToSet(actual), bitsetToSet(expectedSet));
			}
		});

		it('matches native BigInt | across reproducible pseudo-random bitsets of varying widths and arities', () => {
			const prng = createPrng(0x20261122n);
			const widths = [1, 7, 29, 30, 31, 63, 64, 128, 257, 512, 1025, 2048];

			for (const width of widths) {
				for (const arity of [2, 3, 5, 8]) {
					const inputs = [];
					for (let i = 0; i < arity; i++) {
						// Mix equal-width and smaller-width bitsets to stress both split paths.
						const w = i % 3 === 0 ? Math.max(1, width >> 2) : width;
						inputs.push(prng.nextBitset(w));
					}
					const expected = inputs.reduce((acc, v) => acc | v, 0n);
					assert.equal(
						unionBitsetSeries(...inputs),
						expected,
						`Mismatch for width=${width}, arity=${arity}`
					);
				}
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt inputs', () => {
			const invalidTypes = [
				0,
				1,
				-1,
				42,
				1.5,
				NaN,
				Infinity,
				-Infinity,
				'0',
				'1',
				'0b101',
				true,
				false,
				null,
				undefined,
				{},
				[],
				new Set([1]),
				Symbol('bitset'),
				() => 0n
			];

			for (const bad of invalidTypes) {
				assert.throws(() => unionBitsetSeries(bad), TypeError);
				assert.throws(() => unionBitsetSeries(1n, bad), TypeError);
				assert.throws(() => unionBitsetSeries(0n, 5n, bad), TypeError);
			}
		});

		it('throws RangeError for negative BigInt inputs', () => {
			const negatives = [-1n, -2n, -42n, -(1n << 64n), -(1n << 512n)];

			for (const neg of negatives) {
				assert.throws(() => unionBitsetSeries(neg), RangeError);
				assert.throws(() => unionBitsetSeries(0n, neg), RangeError);
				assert.throws(() => unionBitsetSeries(10n, 20n, neg), RangeError);
			}
		});
	});
});
