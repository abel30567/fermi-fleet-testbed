import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionBitsetRecursive } from './unionBitsetRecursive.js';

/**
 * Converts a JS Set of non-negative integer element indices into a BigInt bitset.
 *
 * @param {Set<number>} set
 * @returns {bigint}
 */
function setToBitset(set) {
	let result = 0n;
	for (const element of set) {
		result |= 1n << BigInt(element);
	}
	return result;
}

/**
 * Converts a non-negative BigInt bitset into a JS Set of element indices.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToSet(bitset) {
	const result = new Set();
	let value = bitset;
	let index = 0;
	while (value > 0n) {
		if ((value & 1n) === 1n) {
			result.add(index);
		}
		value >>= 1n;
		index++;
	}
	return result;
}

/**
 * Deterministic xorshift64* PRNG for reproducible arbitrary-width bitsets.
 *
 * @param {bigint} seed
 */
function createPrng(seed) {
	let state = seed & ((1n << 64n) - 1n);
	if (state === 0n) {
		state = 0x9e3779b97f4a7c15n;
	}
	return function nextUint64() {
		state ^= state >> 12n;
		state ^= (state << 25n) & ((1n << 64n) - 1n);
		state ^= state >> 27n;
		return (state * 0x2545f4914f6cdd1dn) & ((1n << 64n) - 1n);
	};
}

/**
 * Generates a deterministic BigInt bitset of the requested bit width.
 *
 * @param {() => bigint} nextUint64
 * @param {number} bits
 * @returns {bigint}
 */
function randomBitset(nextUint64, bits) {
	let result = 0n;
	let remaining = bits;
	while (remaining > 0) {
		const take = Math.min(64, remaining);
		const chunk = nextUint64() & ((1n << BigInt(take)) - 1n);
		result = (result << BigInt(take)) | chunk;
		remaining -= take;
	}
	return result;
}

describe('unionBitsetRecursive', () => {
	describe('normal cases', () => {
		it('computes union of two overlapping bitsets', () => {
			assert.equal(unionBitsetRecursive(0b1010n, 0b0110n), 0b1110n);
			assert.equal(unionBitsetRecursive(0b11001100n, 0b10101010n), 0b11101110n);
			assert.equal(unionBitsetRecursive(0x0f0fn, 0xf00fn), 0xff0fn);
		});

		it('supports variadic arguments of arbitrary arity', () => {
			assert.equal(unionBitsetRecursive(0b0001n, 0b0010n, 0b0100n), 0b0111n);
			assert.equal(
				unionBitsetRecursive(0b0001n, 0b0010n, 0b0100n, 0b1000n, 0b10001n),
				0b11111n
			);
			assert.equal(unionBitsetRecursive(42n), 42n);
		});

		it('supports passing an array of bitsets', () => {
			assert.equal(unionBitsetRecursive([0b1010n, 0b0101n]), 0b1111n);
			assert.equal(unionBitsetRecursive([1n, 2n, 4n, 8n, 16n, 32n, 64n]), 127n);
			assert.equal(unionBitsetRecursive([99n]), 99n);
		});

		it('returns 0n for empty invocation or empty array', () => {
			assert.equal(unionBitsetRecursive(), 0n);
			assert.equal(unionBitsetRecursive([]), 0n);
		});
	});

	describe('edge cases', () => {
		it('handles empty set 0n as identity element', () => {
			assert.equal(unionBitsetRecursive(0n, 0n), 0n);
			assert.equal(unionBitsetRecursive(0n, 0b101101n), 0b101101n);
			assert.equal(unionBitsetRecursive(0b101101n, 0n), 0b101101n);
			assert.equal(unionBitsetRecursive([0n, 0n, 0n, 0n]), 0n);
			assert.equal(unionBitsetRecursive(0n, 0n, 1n << 700n, 0n), 1n << 700n);
		});

		it('handles identical sets (idempotence)', () => {
			const samples = [0n, 1n, 0b1010101n, (1n << 64n) - 1n, (1n << 800n) | 0xdeadbeefn];
			for (const s of samples) {
				assert.equal(unionBitsetRecursive(s, s), s);
				assert.equal(unionBitsetRecursive(s, s, s, s, s), s);
				assert.equal(unionBitsetRecursive([s, s, s]), s);
			}
		});

		it('handles disjoint sets cleanly', () => {
			// Alternating bits over 640 bits
			let evenBits = 0n;
			let oddBits = 0n;
			for (let i = 0; i < 640; i++) {
				if (i % 2 === 0) {
					evenBits |= 1n << BigInt(i);
				} else {
					oddBits |= 1n << BigInt(i);
				}
			}
			assert.equal(evenBits & oddBits, 0n);
			assert.equal(unionBitsetRecursive(evenBits, oddBits), (1n << 640n) - 1n);

			// Disjoint low and high bit ranges
			const low = (1n << 128n) - 1n;
			const high = ((1n << 128n) - 1n) << 700n;
			assert.equal(unionBitsetRecursive(low, high), low | high);
		});

		it('handles subset / superset and single-bit / boundary values', () => {
			assert.equal(unionBitsetRecursive(1n, 1n), 1n);
			assert.equal(unionBitsetRecursive(1n, 0n), 1n);
			assert.equal(unionBitsetRecursive(0n, 1n), 1n);
			const superset = (1n << 128n) - 1n;
			const subset = 0x123456789abcdef0123456789abcdef0n;
			assert.equal(unionBitsetRecursive(superset, subset), superset);
			assert.equal(unionBitsetRecursive(subset, superset), superset);
		});

		it('handles very wide bitsets (> 512 bits), both dense and sparse', () => {
			// Sparse bitsets with bits at > 512, > 1024, > 4096
			const a = (1n << 0n) | (1n << 513n) | (1n << 1024n) | (1n << 4096n);
			const b = (1n << 1n) | (1n << 512n) | (1n << 1024n) | (1n << 2048n);
			const c = (1n << 777n) | (1n << 4097n);
			assert.equal(unionBitsetRecursive(a, b), a | b);
			assert.equal(unionBitsetRecursive(a, b, c), a | b | c);
			assert.equal(unionBitsetRecursive([a, b, c]), a | b | c);

			// Asymmetric widths: tiny bitset unioned with 2048-bit bitset
			const tiny = 0b101n;
			const huge = (1n << 2048n) | (1n << 1500n);
			assert.equal(unionBitsetRecursive(tiny, huge), tiny | huge);
			assert.equal(unionBitsetRecursive(huge, tiny), huge | tiny);

			// Dense 1024-bit and 2048-bit bitsets
			const nextUint64 = createPrng(0x123456789abcdef1n);
			const denseA = randomBitset(nextUint64, 1025);
			const denseB = randomBitset(nextUint64, 1025);
			const denseC = randomBitset(nextUint64, 2049);
			assert.equal(unionBitsetRecursive(denseA, denseB), denseA | denseB);
			assert.equal(unionBitsetRecursive(denseA, denseB, denseC), denseA | denseB | denseC);
		});
	});

	describe('algebraic properties and cross-checks', () => {
		it('satisfies commutativity and associativity', () => {
			const nextUint64 = createPrng(0xabcdef0123456789n);
			const a = randomBitset(nextUint64, 600);
			const b = randomBitset(nextUint64, 720);
			const c = randomBitset(nextUint64, 540);

			assert.equal(unionBitsetRecursive(a, b), unionBitsetRecursive(b, a));
			assert.equal(
				unionBitsetRecursive(unionBitsetRecursive(a, b), c),
				unionBitsetRecursive(a, unionBitsetRecursive(b, c))
			);
			assert.equal(
				unionBitsetRecursive(a, b, c),
				unionBitsetRecursive([c, a, b])
			);
		});

		it('matches JS Set union converted back to BigInt bitset and native bitwise OR', () => {
			const sets = [
				new Set([0, 1, 5, 31, 32, 63, 64, 512, 777]),
				new Set([1, 2, 32, 100, 513, 777, 1024]),
				new Set([3, 64, 255, 256, 600, 1025]),
				new Set([]),
				new Set([0, 1200, 1500])
			];

			const bitsets = sets.map(setToBitset);

			// Pairwise cross-check against JS Set union and native |
			for (let i = 0; i < sets.length; i++) {
				for (let j = 0; j < sets.length; j++) {
					const expectedSet = new Set([...sets[i], ...sets[j]]);
					const expectedFromSet = setToBitset(expectedSet);
					const expectedNative = bitsets[i] | bitsets[j];
					const actual = unionBitsetRecursive(bitsets[i], bitsets[j]);

					assert.equal(actual, expectedFromSet);
					assert.equal(actual, expectedNative);
					assert.deepEqual(bitsetToSet(actual), expectedSet);
				}
			}

			// Multi-set cross-check against JS Set union and native |
			const allExpectedSet = new Set(sets.flatMap((s) => [...s]));
			const allExpectedBitset = setToBitset(allExpectedSet);
			const allNative = bitsets.reduce((acc, x) => acc | x, 0n);

			const actualVariadic = unionBitsetRecursive(...bitsets);
			const actualArray = unionBitsetRecursive(bitsets);

			assert.equal(actualVariadic, allExpectedBitset);
			assert.equal(actualVariadic, allNative);
			assert.equal(actualArray, allExpectedBitset);
			assert.deepEqual(bitsetToSet(actualArray), allExpectedSet);
		});

		it('matches native | across randomized widths (1 to 1024+ bits) and arities (1 to 25)', () => {
			const nextUint64 = createPrng(0xfeedfacecafebeefn);
			const widths = [1, 2, 3, 7, 15, 16, 31, 32, 63, 64, 127, 257, 513, 769, 1025];

			for (const w of widths) {
				const a = randomBitset(nextUint64, w);
				const b = randomBitset(nextUint64, w);
				assert.equal(unionBitsetRecursive(a, b), a | b, `failed pairwise at width ${w}`);
			}

			for (const count of [1, 2, 3, 4, 5, 8, 9, 16, 25]) {
				const list = [];
				let nativeUnion = 0n;
				for (let i = 0; i < count; i++) {
					const width = 50 + ((i * 73) % 700);
					const bs = randomBitset(nextUint64, width);
					list.push(bs);
					nativeUnion |= bs;
				}
				assert.equal(
					unionBitsetRecursive(list),
					nativeUnion,
					`failed array union for count ${count}`
				);
				assert.equal(
					unionBitsetRecursive(...list),
					nativeUnion,
					`failed variadic union for count ${count}`
				);
			}
		});
	});

	describe('input validation', () => {
		it('throws RangeError for negative BigInt bitsets', () => {
			assert.throws(() => unionBitsetRecursive(-1n), RangeError);
			assert.throws(() => unionBitsetRecursive(-1n, 0n), RangeError);
			assert.throws(() => unionBitsetRecursive(0n, -1n), RangeError);
			assert.throws(() => unionBitsetRecursive(1n, 2n, -(1n << 600n)), RangeError);
			assert.throws(() => unionBitsetRecursive([1n, -5n, 3n]), RangeError);
		});

		it('throws TypeError for non-BigInt arguments', () => {
			const invalidValues = [
				0,
				1,
				42,
				-1,
				NaN,
				Infinity,
				'1',
				'0b101',
				true,
				false,
				null,
				undefined,
				{},
				Symbol('bit'),
				() => 1n
			];

			for (const bad of invalidValues) {
				assert.throws(() => unionBitsetRecursive(bad), TypeError);
				assert.throws(() => unionBitsetRecursive(1n, bad), TypeError);
				assert.throws(() => unionBitsetRecursive(bad, 1n), TypeError);
				assert.throws(() => unionBitsetRecursive([1n, bad]), TypeError);
			}
		});

		it('throws TypeError for sparse arrays, nested arrays, and mixed array/variadic calls', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1n, , 2n];
			assert.throws(() => unionBitsetRecursive(sparse), TypeError);
			assert.throws(() => unionBitsetRecursive(new Array(2)), TypeError);
			assert.throws(() => unionBitsetRecursive([[1n]]), TypeError);
			assert.throws(() => unionBitsetRecursive([1n], 2n), TypeError);
			assert.throws(() => unionBitsetRecursive(1n, [2n]), TypeError);
		});
	});
});
