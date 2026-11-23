import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductBigIntLazy } from './crossProductBigIntLazy.js';

function dotBigInt(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

function normSqBigInt(u) {
	return dotBigInt(u, u);
}

describe('crossProductBigIntLazy', () => {
	it('computes standard basis vector cross products (right-hand rule)', () => {
		const i = [1n, 0n, 0n];
		const j = [0n, 1n, 0n];
		const k = [0n, 0n, 1n];

		assert.deepEqual([...crossProductBigIntLazy(i, j)], [0n, 0n, 1n]);
		assert.deepEqual([...crossProductBigIntLazy(j, k)], [1n, 0n, 0n]);
		assert.deepEqual([...crossProductBigIntLazy(k, i)], [0n, 1n, 0n]);
		assert.deepEqual([...crossProductBigIntLazy(j, i)], [0n, 0n, -1n]);
		assert.deepEqual([...crossProductBigIntLazy(k, j)], [-1n, 0n, 0n]);
		assert.deepEqual([...crossProductBigIntLazy(i, k)], [0n, -1n, 0n]);
	});

	it('computes general 3D vector cross products with positive and negative values', () => {
		assert.deepEqual(
			[...crossProductBigIntLazy([2n, 3n, 4n], [5n, 6n, 7n])],
			[-3n, 6n, -3n]
		);
		assert.deepEqual(
			[...crossProductBigIntLazy([-3n, 5n, -2n], [4n, -1n, 7n])],
			[33n, 13n, -17n]
		);
	});

	it('returns [0n, 0n, 0n] for parallel, anti-parallel, identical, and zero vectors', () => {
		assert.deepEqual(
			[...crossProductBigIntLazy([3n, -6n, 9n], [3n, -6n, 9n])],
			[0n, 0n, 0n]
		);
		assert.deepEqual(
			[...crossProductBigIntLazy([2n, 4n, 6n], [10n, 20n, 30n])],
			[0n, 0n, 0n]
		);
		assert.deepEqual(
			[...crossProductBigIntLazy([7n, -11n, 13n], [-21n, 33n, -39n])],
			[0n, 0n, 0n]
		);
		assert.deepEqual(
			[...crossProductBigIntLazy([0n, 0n, 0n], [99n, -42n, 17n])],
			[0n, 0n, 0n]
		);
		assert.deepEqual(
			[...crossProductBigIntLazy([99n, -42n, 17n], [0n, 0n, 0n])],
			[0n, 0n, 0n]
		);
	});

	it('handles huge arbitrary-precision BigInts without precision loss', () => {
		const big = 10n ** 60n;
		const a = [big + 1n, big + 2n, big + 3n];
		const b = [big + 4n, big + 5n, big + 7n];
		// a1*b2 - a2*b1 = (big+2)(big+7) - (big+3)(big+5) = (big^2 + 9big + 14) - (big^2 + 8big + 15) = big - 1
		// a2*b0 - a0*b2 = (big+3)(big+4) - (big+1)(big+7) = (big^2 + 7big + 12) - (big^2 + 8big + 7) = -big + 5
		// a0*b1 - a1*b0 = (big+1)(big+5) - (big+2)(big+4) = (big^2 + 6big + 5) - (big^2 + 6big + 8) = -3
		const result = [...crossProductBigIntLazy(a, b)];
		assert.deepEqual(result, [big - 1n, -big + 5n, -3n]);
	});

	it('consumes input generators lazily and yields output components lazily', () => {
		let pulledA = 0;
		let pulledB = 0;

		function* genA() {
			for (const v of [2n, 3n, 4n]) {
				pulledA++;
				yield v;
			}
		}

		function* genB() {
			for (const v of [5n, 6n, 7n]) {
				pulledB++;
				yield v;
			}
		}

		const gen = crossProductBigIntLazy(genA(), genB());

		// Nothing consumed until the returned generator is iterated
		assert.equal(pulledA, 0);
		assert.equal(pulledB, 0);

		const step0 = gen.next();
		assert.deepEqual(step0, { value: -3n, done: false });
		assert.equal(pulledA, 3);
		assert.equal(pulledB, 3);

		const step1 = gen.next();
		assert.deepEqual(step1, { value: 6n, done: false });

		const step2 = gen.next();
		assert.deepEqual(step2, { value: -3n, done: false });

		const step3 = gen.next();
		assert.deepEqual(step3, { value: undefined, done: true });
	});

	it('accepts diverse iterable types (BigInt64Array, Set, custom iterable)', () => {
		const typedA = new BigInt64Array([1n, 2n, 3n]);
		const setB = new Set([4n, 5n, 6n]);
		assert.deepEqual([...crossProductBigIntLazy(typedA, setB)], [-3n, 6n, -3n]);

		const customIterable = {
			*[Symbol.iterator]() {
				yield -1n;
				yield 0n;
				yield 2n;
			}
		};
		assert.deepEqual(
			[...crossProductBigIntLazy(customIterable, [3n, 4n, 5n])],
			[-8n, 11n, -4n]
		);
	});

	it('throws RangeError for non-3D vectors and closes over-long/infinite iterators cleanly', () => {
		assert.throws(
			() => [...crossProductBigIntLazy([], [1n, 2n, 3n])],
			RangeError
		);
		assert.throws(
			() => [...crossProductBigIntLazy([1n, 2n], [1n, 2n, 3n])],
			RangeError
		);
		assert.throws(
			() => [...crossProductBigIntLazy([1n, 2n, 3n], [4n, 5n])],
			RangeError
		);
		assert.throws(
			() => [...crossProductBigIntLazy([1n, 2n, 3n, 4n], [1n, 2n, 3n])],
			RangeError
		);
		assert.throws(
			() => [...crossProductBigIntLazy([1n, 2n, 3n], [1n, 2n, 3n, 4n])],
			RangeError
		);

		let yieldedCount = 0;
		let cleanedUp = false;
		function* infiniteBigInts() {
			try {
				let n = 0n;
				while (true) {
					yieldedCount++;
					yield n++;
				}
			} finally {
				cleanedUp = true;
			}
		}

		assert.throws(
			() => [...crossProductBigIntLazy(infiniteBigInts(), [1n, 2n, 3n])],
			RangeError
		);
		assert.equal(yieldedCount, 4);
		assert.equal(cleanedUp, true);
	});

	it('throws TypeError for invalid inputs and non-BigInt elements', () => {
		for (const bad of [null, undefined, 42, 42n, true, '123', {}]) {
			assert.throws(() => crossProductBigIntLazy(bad, [1n, 2n, 3n]), TypeError);
			assert.throws(() => crossProductBigIntLazy([1n, 2n, 3n], bad), TypeError);
		}

		const badIteratorIterable = {
			[Symbol.iterator]() {
				return null;
			}
		};
		assert.throws(
			() => [...crossProductBigIntLazy(badIteratorIterable, [1n, 2n, 3n])],
			TypeError
		);

		let cleanedUp = false;
		function* badElementGen() {
			try {
				yield 1n;
				yield 2; // Number instead of BigInt
				yield 3n;
			} finally {
				cleanedUp = true;
			}
		}
		assert.throws(
			() => [...crossProductBigIntLazy(badElementGen(), [1n, 2n, 3n])],
			TypeError
		);
		assert.equal(cleanedUp, true);

		assert.throws(
			() => [...crossProductBigIntLazy([1n, 2n, 3n], [1n, '2', 3n])],
			TypeError
		);
		assert.throws(
			() => [...crossProductBigIntLazy([1n, null, 3n], [1n, 2n, 3n])],
			TypeError
		);
	});

	it('satisfies algebraic cross-checks: orthogonality, anti-commutativity, Lagrange, and Jacobi identities', () => {
		const vectors = [
			[12345678901234567890123456789n, -98765432109876543210987654321n, 55555555555555555555555555555n],
			[-77777777777777777777777777777n, 31415926535897932384626433832n, -27182818284590452353602874713n],
			[10n ** 40n + 17n, -(10n ** 35n) + 99n, 10n ** 30n - 1234567n],
			[-19n, 0n, 43n],
			[100n, -200n, 300n]
		];

		for (let p = 0; p < vectors.length; p++) {
			for (let q = 0; q < vectors.length; q++) {
				const a = vectors[p];
				const b = vectors[q];
				const axb = [...crossProductBigIntLazy(a, b)];
				const bxa = [...crossProductBigIntLazy(b, a)];

				// Orthogonality: (a × b) · a === 0n and (a × b) · b === 0n
				assert.equal(dotBigInt(axb, a), 0n);
				assert.equal(dotBigInt(axb, b), 0n);

				// Anti-commutativity: a × b === -(b × a)
				assert.deepEqual(axb, bxa.map((v) => -v));

				// Lagrange's identity: ||a × b||^2 === ||a||^2 * ||b||^2 - (a · b)^2
				const lhs = normSqBigInt(axb);
				const dot = dotBigInt(a, b);
				const rhs = normSqBigInt(a) * normSqBigInt(b) - dot * dot;
				assert.equal(lhs, rhs);
			}
		}

		// Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) === [0n, 0n, 0n]
		const [a, b, c] = vectors;
		const t1 = [...crossProductBigIntLazy(a, crossProductBigIntLazy(b, c))];
		const t2 = [...crossProductBigIntLazy(b, crossProductBigIntLazy(c, a))];
		const t3 = [...crossProductBigIntLazy(c, crossProductBigIntLazy(a, b))];
		assert.deepEqual(
			[t1[0] + t2[0] + t3[0], t1[1] + t2[1] + t3[1], t1[2] + t2[2] + t3[2]],
			[0n, 0n, 0n]
		);
	});
});
