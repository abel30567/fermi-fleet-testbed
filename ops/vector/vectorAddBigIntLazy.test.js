import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddBigIntLazy } from './vectorAddBigIntLazy.js';

describe('vectorAddBigIntLazy', () => {
	describe('normal cases', () => {
		it('adds two BigInt arrays element-wise', () => {
			const result = [...vectorAddBigIntLazy([1n, 2n, 3n], [4n, 5n, 6n])];
			assert.deepEqual(result, [5n, 7n, 9n]);
		});

		it('handles negative, zero, and positive BigInt values', () => {
			const result = [
				...vectorAddBigIntLazy([-10n, 0n, 15n, -100n], [10n, 0n, -20n, -50n]),
			];
			assert.deepEqual(result, [0n, 0n, -5n, -150n]);
		});

		it('handles fixed-point BigInt values scaled by 10^18', () => {
			const SCALE = 10n ** 18n;
			// 1.25 + 2.75 = 4.00, -0.5 + 1.5 = 1.0, 0.1 + 0.2 = 0.3 (exact in fixed-point)
			const a = [125n * 10n ** 16n, -5n * 10n ** 17n, 1n * 10n ** 17n];
			const b = [275n * 10n ** 16n, 15n * 10n ** 17n, 2n * 10n ** 17n];
			const result = [...vectorAddBigIntLazy(a, b)];
			assert.deepEqual(result, [4n * SCALE, 1n * SCALE, 3n * 10n ** 17n]);
		});

		it('accepts diverse iterable types (generators, Sets, BigInt64Array, custom iterables)', () => {
			function* genA() {
				yield 10n;
				yield 20n;
				yield 30n;
			}
			const setB = new Set([1n, 2n, 3n]);
			assert.deepEqual([...vectorAddBigIntLazy(genA(), setB)], [11n, 22n, 33n]);

			const typedA = new BigInt64Array([100n, -200n, 300n]);
			const customB = {
				*[Symbol.iterator]() {
					yield 5n;
					yield 200n;
					yield -50n;
				},
			};
			assert.deepEqual([...vectorAddBigIntLazy(typedA, customB)], [105n, 0n, 250n]);
		});
	});

	describe('edge cases', () => {
		it('handles empty iterables', () => {
			assert.deepEqual([...vectorAddBigIntLazy([], [])], []);

			function* emptyGen() {}
			assert.deepEqual([...vectorAddBigIntLazy(emptyGen(), emptyGen())], []);
		});

		it('handles single-element vectors', () => {
			assert.deepEqual([...vectorAddBigIntLazy([42n], [-42n])], [0n]);
		});

		it('handles huge BigInts far beyond Number.MAX_SAFE_INTEGER', () => {
			const huge1 = 10n ** 100n + 123456789012345678901234567890n;
			const huge2 = 10n ** 100n + 876543210987654321098765432110n;
			const negHuge = -(2n ** 512n);
			const posHuge = 2n ** 512n + 7n;

			const result = [...vectorAddBigIntLazy([huge1, negHuge], [huge2, posHuge])];
			assert.deepEqual(result, [
				2n * 10n ** 100n + 10n ** 30n,
				7n,
			]);
		});

		it('consumes infinite generators lazily in O(1) memory and closes them on early exit', () => {
			let pulledA = 0;
			let pulledB = 0;
			let closedA = false;
			let closedB = false;

			function* naturals() {
				let i = 0n;
				try {
					while (true) {
						pulledA += 1;
						yield i;
						i += 1n;
					}
				} finally {
					closedA = true;
				}
			}

			function* evens() {
				let i = 0n;
				try {
					while (true) {
						pulledB += 1;
						yield i * 2n;
						i += 1n;
					}
				} finally {
					closedB = true;
				}
			}

			const gen = vectorAddBigIntLazy(naturals(), evens());
			// Nothing pulled before iteration begins
			assert.equal(pulledA, 0);
			assert.equal(pulledB, 0);

			const taken = [];
			for (const val of gen) {
				taken.push(val);
				assert.equal(pulledA, taken.length);
				assert.equal(pulledB, taken.length);
				if (taken.length === 5) {
					break;
				}
			}

			assert.deepEqual(taken, [0n, 3n, 6n, 9n, 12n]);
			assert.equal(pulledA, 5);
			assert.equal(pulledB, 5);
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});

		it('throws RangeError on mismatched lengths (first shorter or second shorter)', () => {
			assert.throws(
				() => [...vectorAddBigIntLazy([1n, 2n], [1n, 2n, 3n])],
				{ name: 'RangeError' }
			);

			assert.throws(
				() => [...vectorAddBigIntLazy([1n, 2n, 3n], [1n])],
				{ name: 'RangeError' }
			);

			assert.throws(
				() => [...vectorAddBigIntLazy([], [1n])],
				{ name: 'RangeError' }
			);

			assert.throws(
				() => [...vectorAddBigIntLazy([1n], [])],
				{ name: 'RangeError' }
			);
		});

		it('yields prefix lazily before encountering length mismatch', () => {
			const gen = vectorAddBigIntLazy([10n, 20n], [1n, 2n, 3n]);
			assert.deepEqual(gen.next(), { value: 11n, done: false });
			assert.deepEqual(gen.next(), { value: 22n, done: false });
			assert.throws(() => gen.next(), { name: 'RangeError' });
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when either argument is not a valid iterable', () => {
			const invalidIterables = [null, undefined, 42, 42n, true, {}, '123', ''];
			for (const bad of invalidIterables) {
				assert.throws(() => vectorAddBigIntLazy(bad, [1n]), { name: 'TypeError' });
				assert.throws(() => vectorAddBigIntLazy([1n], bad), { name: 'TypeError' });
			}
		});

		it('throws TypeError when [Symbol.iterator]() returns a non-iterator', () => {
			const badIterable = { [Symbol.iterator]: () => null };
			assert.throws(
				() => [...vectorAddBigIntLazy(badIterable, [1n])],
				{ name: 'TypeError' }
			);
			assert.throws(
				() => [...vectorAddBigIntLazy([1n], badIterable)],
				{ name: 'TypeError' }
			);
		});

		it('throws TypeError when any element is not a BigInt', () => {
			const badElements = [1, 0, NaN, '1', null, undefined, {}, true, Symbol('x')];
			for (const bad of badElements) {
				assert.throws(
					() => [...vectorAddBigIntLazy([1n, bad], [1n, 2n])],
					{ name: 'TypeError' }
				);
				assert.throws(
					() => [...vectorAddBigIntLazy([1n, 2n], [1n, bad])],
					{ name: 'TypeError' }
				);
			}
		});
	});

	describe('algebraic cross-checks', () => {
		it('satisfies commutativity (a + b === b + a) and associativity ((a + b) + c === a + (b + c))', () => {
			const vectors = [
				[0n, 1n, -1n, 10n ** 18n, -(10n ** 30n), 2n ** 128n - 1n],
				[42n, -99n, 10n ** 18n, 5n * 10n ** 17n, 10n ** 30n, -(2n ** 127n)],
				[-42n, 98n, 2n, -15n * 10n ** 17n, 123456789n, 2n ** 127n + 1n],
			];
			const [a, b, c] = vectors;

			// Commutativity: a + b === b + a
			const ab = [...vectorAddBigIntLazy(a, b)];
			const ba = [...vectorAddBigIntLazy(b, a)];
			assert.deepEqual(ab, ba);

			// Associativity (streaming composition without materializing intermediate arrays):
			// (a + b) + c === a + (b + c)
			const leftAssoc = [...vectorAddBigIntLazy(vectorAddBigIntLazy(a, b), c)];
			const rightAssoc = [...vectorAddBigIntLazy(a, vectorAddBigIntLazy(b, c))];
			assert.deepEqual(leftAssoc, rightAssoc);

			// Additive identity and inverse: a + 0 === a, a + (-a) === 0
			const zero = a.map(() => 0n);
			const negA = a.map((x) => -x);
			assert.deepEqual([...vectorAddBigIntLazy(a, zero)], a);
			assert.deepEqual([...vectorAddBigIntLazy(a, negA)], zero);
		});
	});
});
