import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyTypedLazy } from './multiplyTypedLazy.js';

describe('multiplyTypedLazy', () => {
	describe('normal cases', () => {
		it('multiplies two Float64Array inputs element-wise lazily', () => {
			const a = new Float64Array([1.5, -2, 3.25, 0, 10]);
			const b = new Float64Array([4, 5.5, -2, 99, 0.1]);

			const gen = multiplyTypedLazy(a, b);
			assert.equal(typeof gen.next, 'function');
			assert.equal(typeof gen[Symbol.iterator], 'function');

			const result = new Float64Array(gen);
			assert.deepEqual(result, new Float64Array([6, -11, -6.5, 0, 1]));
		});

		it('multiplies two iterables of Float64Array chunks element-wise', () => {
			const chunksA = [
				new Float64Array([2, 3]),
				new Float64Array([-4, 0.5, 10]),
			];
			const chunksB = [
				new Float64Array([5, 6]),
				new Float64Array([2, -8, 0.25]),
			];

			const out = [...multiplyTypedLazy(chunksA, chunksB)];
			assert.equal(out.length, 2);
			assert.ok(out[0] instanceof Float64Array);
			assert.ok(out[1] instanceof Float64Array);
			assert.deepEqual(out[0], new Float64Array([10, 18]));
			assert.deepEqual(out[1], new Float64Array([-8, -4, 2.5]));
		});

		it('accepts generator functions yielding Float64Array chunks', () => {
			function* streamA() {
				yield new Float64Array([1, 2, 3]);
				yield new Float64Array([4, 5]);
			}
			function* streamB() {
				yield new Float64Array([10, 20, 30]);
				yield new Float64Array([40, 50]);
			}

			const out = Array.from(multiplyTypedLazy(streamA(), streamB()));
			assert.deepEqual(out, [
				new Float64Array([10, 40, 90]),
				new Float64Array([160, 250]),
			]);
		});
	});

	describe('edge cases', () => {
		it('handles empty Float64Array inputs', () => {
			const result = [...multiplyTypedLazy(new Float64Array(0), new Float64Array(0))];
			assert.deepEqual(result, []);
		});

		it('handles empty iterables and iterables containing empty Float64Array chunks', () => {
			assert.deepEqual([...multiplyTypedLazy([], [])], []);

			const out = [
				...multiplyTypedLazy(
					[new Float64Array(0), new Float64Array([7])],
					[new Float64Array(0), new Float64Array([6])],
				),
			];
			assert.equal(out.length, 2);
			assert.deepEqual(out[0], new Float64Array(0));
			assert.deepEqual(out[1], new Float64Array([42]));
		});

		it('preserves IEEE-754 special values (-0, Infinity, -Infinity, NaN, overflow, subnormals)', () => {
			const a = new Float64Array([
				0,
				-0,
				Infinity,
				-Infinity,
				Infinity,
				NaN,
				Number.MAX_VALUE,
				Number.MIN_VALUE,
			]);
			const b = new Float64Array([
				-1,
				-1,
				2,
				-3,
				0,
				5,
				2,
				0.5,
			]);

			const res = [...multiplyTypedLazy(a, b)];
			assert.ok(Object.is(res[0], -0));
			assert.ok(Object.is(res[1], 0));
			assert.equal(res[2], Infinity);
			assert.equal(res[3], Infinity);
			assert.ok(Number.isNaN(res[4]));
			assert.ok(Number.isNaN(res[5]));
			assert.equal(res[6], Infinity);
			assert.equal(res[7], 0);
		});

		it('does not mutate input Float64Array instances', () => {
			const a = new Float64Array([2, 3, 4]);
			const b = new Float64Array([5, 6, 7]);
			const out = [...multiplyTypedLazy([a], [b])];

			assert.deepEqual(a, new Float64Array([2, 3, 4]));
			assert.deepEqual(b, new Float64Array([5, 6, 7]));
			assert.notEqual(out[0], a);
			assert.notEqual(out[0], b);
			assert.deepEqual(out[0], new Float64Array([10, 18, 28]));
		});
	});

	describe('lazy and streaming behavior', () => {
		it('computes scalar elements one at a time on demand without exhausting the generator', () => {
			const n = 100_000;
			const a = new Float64Array(n);
			const b = new Float64Array(n);
			a[0] = 3;
			b[0] = 7;
			a[1] = 11;
			b[1] = 13;

			const gen = multiplyTypedLazy(a, b);
			assert.deepEqual(gen.next(), { value: 21, done: false });
			assert.deepEqual(gen.next(), { value: 143, done: false });
			assert.deepEqual(gen.return(), { value: undefined, done: true });
			assert.deepEqual(gen.next(), { value: undefined, done: true });
		});

		it('consumes infinite chunk streams lazily and closes upstream iterators on early break', () => {
			let pullsA = 0;
			let pullsB = 0;
			let closedA = false;
			let closedB = false;

			function* infiniteA() {
				try {
					let i = 1;
					while (true) {
						pullsA++;
						yield new Float64Array([i, i + 1]);
						i += 2;
					}
				} finally {
					closedA = true;
				}
			}

			function* infiniteB() {
				try {
					let i = 10;
					while (true) {
						pullsB++;
						yield new Float64Array([i, i]);
						i += 10;
					}
				} finally {
					closedB = true;
				}
			}

			const stream = multiplyTypedLazy(infiniteA(), infiniteB());
			// Nothing pulled before the consumer requests a value.
			assert.equal(pullsA, 0);
			assert.equal(pullsB, 0);

			const collected = [];
			for (const chunk of stream) {
				collected.push(chunk);
				assert.equal(pullsA, collected.length);
				assert.equal(pullsB, collected.length);
				if (collected.length === 3) {
					break;
				}
			}

			assert.deepEqual(collected, [
				new Float64Array([10, 20]),
				new Float64Array([60, 80]),
				new Float64Array([150, 180]),
			]);
			assert.equal(pullsA, 3);
			assert.equal(pullsB, 3);
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});

		it('closes upstream iterators if a chunk error occurs mid-stream', () => {
			let closedA = false;
			let closedB = false;

			function* genA() {
				try {
					yield new Float64Array([1, 2]);
					yield new Float64Array([3, 4, 5]);
					yield new Float64Array([6, 7]);
				} finally {
					closedA = true;
				}
			}

			function* genB() {
				try {
					yield new Float64Array([10, 20]);
					yield new Float64Array([30, 40]);
					yield new Float64Array([50, 60]);
				} finally {
					closedB = true;
				}
			}

			const stream = multiplyTypedLazy(genA(), genB());
			assert.deepEqual(stream.next().value, new Float64Array([10, 40]));
			assert.throws(() => stream.next(), RangeError);
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});
	});

	describe('input validation', () => {
		it('rejects null, undefined, primitives, strings, and plain objects eagerly', () => {
			const f64 = new Float64Array([1, 2]);
			const badInputs = [
				[null, f64],
				[f64, undefined],
				[42, 42],
				['ab', 'cd'],
				[{}, {}],
				[true, false],
			];

			for (const [a, b] of badInputs) {
				assert.throws(() => multiplyTypedLazy(a, b), TypeError);
			}
		});

		it('rejects non-Float64Array TypedArrays and DataView eagerly', () => {
			assert.throws(
				() => multiplyTypedLazy(new Float32Array([1, 2]), new Float32Array([3, 4])),
				TypeError,
			);
			assert.throws(
				() => multiplyTypedLazy(new Int32Array([1, 2]), new Int32Array([3, 4])),
				TypeError,
			);
			assert.throws(
				() => multiplyTypedLazy(new Uint8Array([1, 2]), new Uint8Array([3, 4])),
				TypeError,
			);
			assert.throws(
				() =>
					multiplyTypedLazy(
						new DataView(new ArrayBuffer(8)),
						new DataView(new ArrayBuffer(8)),
					),
				TypeError,
			);
		});

		it('rejects mixing a Float64Array with a chunk iterable eagerly', () => {
			const f64 = new Float64Array([1, 2]);
			assert.throws(() => multiplyTypedLazy(f64, [f64]), TypeError);
			assert.throws(() => multiplyTypedLazy([f64], f64), TypeError);
		});

		it('throws RangeError eagerly when Float64Array lengths differ', () => {
			assert.throws(
				() =>
					multiplyTypedLazy(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
				RangeError,
			);
		});

		it('throws TypeError when chunk iterables yield non-Float64Array values', () => {
			const s1 = multiplyTypedLazy([[1, 2]], [[3, 4]]);
			assert.throws(() => [...s1], TypeError);

			const s2 = multiplyTypedLazy([new Float64Array([1])], [new Float32Array([1])]);
			assert.throws(() => [...s2], TypeError);

			const s3 = multiplyTypedLazy([1, 2], [3, 4]);
			assert.throws(() => [...s3], TypeError);
		});

		it('throws RangeError when chunk iterables have different chunk counts and closes the longer one', () => {
			let closedB = false;
			function* longerB() {
				try {
					yield new Float64Array([2]);
					yield new Float64Array([3]);
					yield new Float64Array([4]);
				} finally {
					closedB = true;
				}
			}

			const stream = multiplyTypedLazy([new Float64Array([5])], longerB());
			assert.deepEqual(stream.next().value, new Float64Array([10]));
			assert.throws(() => stream.next(), RangeError);
			assert.equal(closedB, true);
		});

		it('throws TypeError if an iterable returns an invalid iterator', () => {
			const badIterable = {
				[Symbol.iterator]() {
					return null;
				},
			};
			const stream = multiplyTypedLazy(badIterable, []);
			assert.throws(() => stream.next(), TypeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches BigInt exact multiplication across safe integer inputs', () => {
			// Deterministic LCG generating exact integers whose products fit safely in IEEE-754 float64.
			let seed = 0x12345678;
			const nextInt = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
				return (seed % 20001) - 10000;
			};

			const len = 512;
			const a = new Float64Array(len);
			const b = new Float64Array(len);
			for (let i = 0; i < len; i++) {
				a[i] = nextInt();
				b[i] = nextInt();
			}

			const actual = new Float64Array(multiplyTypedLazy(a, b));
			for (let i = 0; i < len; i++) {
				const expected = Number(BigInt(a[i]) * BigInt(b[i]));
				assert.equal(actual[i], expected, `mismatch at index ${i}`);
			}
		});

		it('matches flattened pairwise multiplication and satisfies commutativity and distributivity over streamed chunks', () => {
			const chunkSizes = [0, 1, 7, 16, 3];
			let x = 1;
			const nextFloat = () => {
				x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
				return (x / 0x7fffffff) * 20 - 10;
			};

			const chunksA = chunkSizes.map((n) => Float64Array.from({ length: n }, nextFloat));
			const chunksB = chunkSizes.map((n) => Float64Array.from({ length: n }, nextFloat));
			const chunksC = chunkSizes.map((n) => Float64Array.from({ length: n }, nextFloat));

			// Cross-check streamed chunk multiplication against flat pair multiplication
			const flatA = new Float64Array(chunksA.flatMap((c) => [...c]));
			const flatB = new Float64Array(chunksB.flatMap((c) => [...c]));
			const flatProduct = new Float64Array(multiplyTypedLazy(flatA, flatB));
			const streamedProduct = new Float64Array(
				[...multiplyTypedLazy(chunksA, chunksB)].flatMap((c) => [...c]),
			);
			assert.deepEqual(streamedProduct, flatProduct);

			// Commutativity: a * b === b * a
			const reversedProduct = new Float64Array(multiplyTypedLazy(flatB, flatA));
			assert.deepEqual(flatProduct, reversedProduct);

			// Distributivity: a * (b + c) ≈ (a * b) + (a * c)
			const flatC = new Float64Array(chunksC.flatMap((c) => [...c]));
			const bPlusC = Float64Array.from(flatB, (v, i) => v + flatC[i]);
			const lhs = new Float64Array(multiplyTypedLazy(flatA, bPlusC));
			const ab = new Float64Array(multiplyTypedLazy(flatA, flatB));
			const ac = new Float64Array(multiplyTypedLazy(flatA, flatC));
			for (let i = 0; i < lhs.length; i++) {
				assert.ok(
					Math.abs(lhs[i] - (ab[i] + ac[i])) <= 1e-11,
					`distributivity failed at ${i}: ${lhs[i]} vs ${ab[i] + ac[i]}`,
				);
			}
		});
	});
});
