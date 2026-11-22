import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionBitsetLazy } from './unionBitsetLazy.js';

/**
 * Helper: encode an iterable of non-negative integer bit positions as a BigInt bitset.
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function setToBitset(indices) {
	let bits = 0n;
	for (const i of indices) {
		bits |= 1n << BigInt(i);
	}
	return bits;
}

/**
 * Helper: decode a non-negative BigInt bitset into a Set of bit positions.
 * @param {bigint} bits
 * @returns {Set<number>}
 */
function bitsetToSet(bits) {
	const result = new Set();
	let remaining = bits;
	let pos = 0;
	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			result.add(pos);
		}
		remaining >>= 1n;
		pos += 1;
	}
	return result;
}

/**
 * Helper: exact popcount of a non-negative BigInt bitset via Kernighan's method.
 * @param {bigint} bits
 * @returns {number}
 */
function popcount(bits) {
	let count = 0;
	let v = bits;
	while (v > 0n) {
		v &= v - 1n;
		count += 1;
	}
	return count;
}

describe('unionBitsetLazy', () => {
	describe('normal cases', () => {
		it('yields running cumulative union over a sequence of bitsets', () => {
			const input = [0b0001n, 0b0100n, 0b0011n, 0b1000n];
			const actual = [...unionBitsetLazy(input)];
			assert.deepStrictEqual(actual, [0b0001n, 0b0101n, 0b0111n, 0b1111n]);
		});

		it('handles overlapping and duplicate bitsets (idempotence)', () => {
			const input = [0b1010n, 0b1010n, 0b0010n, 0b1110n, 0b1000n];
			const actual = [...unionBitsetLazy(input)];
			assert.deepStrictEqual(actual, [
				0b1010n,
				0b1010n,
				0b1010n,
				0b1110n,
				0b1110n,
			]);
		});

		it('supports a non-zero initial accumulator bitset', () => {
			const input = [0b0010n, 0b1000n, 0b0001n];
			const actual = [...unionBitsetLazy(input, 0b0100n)];
			assert.deepStrictEqual(actual, [0b0110n, 0b1110n, 0b1111n]);
		});

		it('accepts diverse iterable inputs (Set, generator, custom iterable)', () => {
			const fromSet = [...unionBitsetLazy(new Set([0b1n, 0b10n, 0b100n]))];
			assert.deepStrictEqual(fromSet, [0b1n, 0b11n, 0b111n]);

			function* gen() {
				yield 0b1000n;
				yield 0b0001n;
			}
			assert.deepStrictEqual([...unionBitsetLazy(gen())], [0b1000n, 0b1001n]);

			const customIterable = {
				[Symbol.iterator]() {
					const items = [0b010n, 0b101n];
					let idx = 0;
					return {
						next() {
							return idx < items.length
								? { value: items[idx++], done: false }
								: { value: undefined, done: true };
						},
					};
				},
			};
			assert.deepStrictEqual(
				[...unionBitsetLazy(customIterable)],
				[0b010n, 0b111n],
			);
		});
	});

	describe('edge cases', () => {
		it('yields nothing for an empty array or empty generator', () => {
			assert.deepStrictEqual([...unionBitsetLazy([])], []);
			assert.deepStrictEqual([...unionBitsetLazy([], 0b111n)], []);

			function* emptyGen() {}
			assert.deepStrictEqual([...unionBitsetLazy(emptyGen())], []);
		});

		it('handles all-zero bitsets (empty set identity)', () => {
			assert.deepStrictEqual([...unionBitsetLazy([0n, 0n, 0n])], [0n, 0n, 0n]);
			assert.deepStrictEqual(
				[...unionBitsetLazy([0n, 0n], 0b101n)],
				[0b101n, 0b101n],
			);
		});

		it('handles a single-element iterable', () => {
			assert.deepStrictEqual([...unionBitsetLazy([0b101010n])], [0b101010n]);
		});

		it('handles arbitrary-width huge BigInt bitsets beyond 64 and 10,000 bits', () => {
			const b0 = 1n << 0n;
			const b1 = 1n << 128n;
			const b2 = (1n << 1024n) | (1n << 2048n);
			const b3 = 1n << 10000n;

			const steps = [...unionBitsetLazy([b0, b1, b2, b3])];
			assert.strictEqual(steps.length, 4);
			assert.strictEqual(steps[0], b0);
			assert.strictEqual(steps[1], b0 | b1);
			assert.strictEqual(steps[2], b0 | b1 | b2);
			assert.strictEqual(steps[3], b0 | b1 | b2 | b3);
			assert.strictEqual(popcount(steps[3]), 5);
			assert.strictEqual((steps[3] >> 10000n) & 1n, 1n);
			assert.strictEqual((steps[3] >> 9999n) & 1n, 0n);
		});
	});

	describe('laziness and streaming guarantees', () => {
		it('consumes an infinite generator lazily with exact 1-to-1 pull count', () => {
			let pulled = 0;
			function* infinitePowersOfTwo() {
				let i = 0n;
				while (true) {
					pulled += 1;
					yield 1n << i;
					i += 1n;
				}
			}

			const stream = unionBitsetLazy(infinitePowersOfTwo());
			// Merely constructing the stream must not pull any elements.
			assert.strictEqual(pulled, 0);

			for (let k = 1; k <= 10; k += 1) {
				const { value, done } = stream.next();
				assert.strictEqual(done, false);
				assert.strictEqual(pulled, k);
				assert.strictEqual(value, (1n << BigInt(k)) - 1n);
			}
		});

		it('propagates early termination cleanup to the source iterator', () => {
			let closed = false;
			let pulled = 0;

			function* trackedSource() {
				try {
					for (let i = 0n; i < 1000n; i += 1n) {
						pulled += 1;
						yield 1n << i;
					}
				} finally {
					closed = true;
				}
			}

			const collected = [];
			for (const u of unionBitsetLazy(trackedSource())) {
				collected.push(u);
				if (collected.length === 3) {
					break;
				}
			}

			assert.deepStrictEqual(collected, [0b1n, 0b11n, 0b111n]);
			assert.strictEqual(pulled, 3);
			assert.strictEqual(closed, true);
		});

		it('validates elements lazily so invalid trailing elements do not affect earlier yields', () => {
			function* validThenInvalid() {
				yield 0b001n;
				yield 0b010n;
				yield -1n;
			}

			const stream = unionBitsetLazy(validThenInvalid());
			assert.deepStrictEqual(stream.next(), { value: 0b001n, done: false });
			assert.deepStrictEqual(stream.next(), { value: 0b011n, done: false });
			assert.throws(() => stream.next(), RangeError);
		});
	});

	describe('input validation', () => {
		it('throws TypeError synchronously when bitsets is not a valid iterable', () => {
			const badInputs = [null, undefined, 0, 42, 10n, true, {}, '1010'];
			for (const bad of badInputs) {
				assert.throws(() => unionBitsetLazy(bad), TypeError);
			}
		});

		it('throws TypeError synchronously when initial is not a BigInt', () => {
			const badInitials = [0, 1, '0', null, NaN, {}];
			for (const bad of badInitials) {
				assert.throws(() => unionBitsetLazy([], bad), TypeError);
			}
		});

		it('throws RangeError synchronously when initial is negative', () => {
			assert.throws(() => unionBitsetLazy([], -1n), RangeError);
			assert.throws(() => unionBitsetLazy([1n], -(1n << 256n)), RangeError);
		});

		it('throws TypeError lazily when an element is not a BigInt', () => {
			const badElements = [1, '1', null, undefined, {}, true];
			for (const bad of badElements) {
				assert.throws(() => [...unionBitsetLazy([0b1n, bad])], TypeError);
			}
		});

		it('throws RangeError lazily when an element is a negative BigInt', () => {
			assert.throws(() => [...unionBitsetLazy([-1n])], RangeError);
			assert.throws(
				() => [...unionBitsetLazy([0b10n, -(1n << 512n)])],
				RangeError,
			);
		});
	});

	describe('cross-checks and algebraic properties', () => {
		it('matches naive JS Set<number> union reference at every step', () => {
			const indexSets = [
				[0, 3, 7, 65],
				[3, 12, 65, 130],
				[],
				[200, 201, 202],
				[0, 511],
			];
			const bitsets = indexSets.map(setToBitset);

			const refUnion = new Set();
			const stream = unionBitsetLazy(bitsets);

			for (const indices of indexSets) {
				for (const idx of indices) {
					refUnion.add(idx);
				}
				const { value, done } = stream.next();
				assert.strictEqual(done, false);
				assert.deepStrictEqual(bitsetToSet(value), refUnion);
			}
			assert.strictEqual(stream.next().done, true);
		});

		it('satisfies closed-form geometric mask identity for consecutive bit powers', () => {
			const n = 250;
			function* powers() {
				for (let i = 0; i < n; i += 1) {
					yield 1n << BigInt(i);
				}
			}

			let step = 0;
			for (const u of unionBitsetLazy(powers())) {
				step += 1;
				assert.strictEqual(u, (1n << BigInt(step)) - 1n);
			}
			assert.strictEqual(step, n);
		});

		it('satisfies monotonicity, commutativity, associativity, and inclusion-exclusion', () => {
			const seq = [
				(1n << 5n) | (1n << 70n),
				(1n << 70n) | (1n << 140n),
				(1n << 2n) | (1n << 300n),
				(1n << 5n) | (1n << 300n) | (1n << 512n),
			];

			// Monotonicity of running stream: u[k-1] is a subset of u[k]
			const running = [...unionBitsetLazy(seq)];
			for (let i = 1; i < running.length; i += 1) {
				assert.strictEqual(running[i] & running[i - 1], running[i - 1]);
				assert.ok(running[i] >= running[i - 1]);
			}
			const finalUnion = running[running.length - 1];

			// Commutativity: reversed sequence yields identical final union
			const reversedRunning = [...unionBitsetLazy([...seq].reverse())];
			assert.strictEqual(
				reversedRunning[reversedRunning.length - 1],
				finalUnion,
			);

			// Associativity: union of chunk unions equals full union
			const left = [...unionBitsetLazy(seq.slice(0, 2))].at(-1);
			const right = [...unionBitsetLazy(seq.slice(2))].at(-1);
			const combined = [...unionBitsetLazy([left, right])].at(-1);
			assert.strictEqual(combined, finalUnion);

			// Inclusion-exclusion on pairwise union
			assert.strictEqual(
				popcount(combined),
				popcount(left) + popcount(right) - popcount(left & right),
			);
		});
	});
});
