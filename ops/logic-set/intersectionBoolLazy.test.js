import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { intersectionBoolLazy } from './intersectionBoolLazy.js';

describe('intersectionBoolLazy — plain booleans', () => {
	it('handles single boolean arguments', () => {
		assert.equal(intersectionBoolLazy(true), true);
		assert.equal(intersectionBoolLazy(false), false);
	});

	it('handles variadic boolean arguments', () => {
		assert.equal(intersectionBoolLazy(true, true), true);
		assert.equal(intersectionBoolLazy(true, false), false);
		assert.equal(intersectionBoolLazy(false, true), false);
		assert.equal(intersectionBoolLazy(false, false), false);
		assert.equal(intersectionBoolLazy(true, true, true, true), true);
		assert.equal(intersectionBoolLazy(true, true, false, true), false);
	});

	it('handles array and iterable sequences of booleans', () => {
		assert.equal(intersectionBoolLazy([true]), true);
		assert.equal(intersectionBoolLazy([false]), false);
		assert.equal(intersectionBoolLazy([true, true, true]), true);
		assert.equal(intersectionBoolLazy([true, false, true]), false);

		const customIterable = {
			*[Symbol.iterator]() {
				yield true;
				yield true;
			},
		};
		assert.equal(intersectionBoolLazy(customIterable), true);
	});

	it('lazily short-circuits an infinite boolean generator on first false and closes it', () => {
		let pulled = 0;
		let closed = false;
		function* infiniteBools() {
			try {
				pulled++;
				yield true;
				pulled++;
				yield true;
				pulled++;
				yield false;
				while (true) {
					pulled++;
					yield true;
				}
			} finally {
				closed = true;
			}
		}

		const result = intersectionBoolLazy(infiniteBools());
		assert.equal(result, false);
		assert.equal(pulled, 3);
		assert.equal(closed, true);
	});

	it('lazily short-circuits when the very first yielded boolean is false', () => {
		let pulled = 0;
		let closed = false;
		function* firstFalse() {
			try {
				pulled++;
				yield false;
				pulled++;
				yield true;
			} finally {
				closed = true;
			}
		}

		assert.equal(intersectionBoolLazy(firstFalse()), false);
		assert.equal(pulled, 1);
		assert.equal(closed, true);
	});
});

describe('intersectionBoolLazy — JS Set objects', () => {
	it('returns a fresh copy for a single Set without aliasing', () => {
		const input = new Set([1, 2, 3]);
		const result = intersectionBoolLazy(input);
		assert.deepEqual(result, new Set([1, 2, 3]));
		assert.notEqual(result, input);
		result.add(99);
		assert.equal(input.has(99), false);

		const singleInArray = intersectionBoolLazy([input]);
		assert.deepEqual(singleInArray, new Set([1, 2, 3]));
		assert.notEqual(singleInArray, input);
	});

	it('computes variadic Set intersections accurately without mutating inputs', () => {
		const a = new Set([1, 2, 3, 4]);
		const b = new Set([2, 3, 4, 5]);
		const c = new Set([3, 4, 6]);
		const result = intersectionBoolLazy(a, b, c);

		assert.deepEqual(result, new Set([3, 4]));
		assert.deepEqual(a, new Set([1, 2, 3, 4]));
		assert.deepEqual(b, new Set([2, 3, 4, 5]));
		assert.deepEqual(c, new Set([3, 4, 6]));
	});

	it('handles disjoint sets and empty sets', () => {
		assert.deepEqual(
			intersectionBoolLazy(new Set([1, 2]), new Set([3, 4])),
			new Set()
		);
		assert.deepEqual(
			intersectionBoolLazy(new Set(), new Set([1, 2])),
			new Set()
		);
		assert.deepEqual(
			intersectionBoolLazy(new Set([1, 2]), new Set()),
			new Set()
		);
		assert.deepEqual(intersectionBoolLazy(new Set()), new Set());
	});

	it('preserves SameValueZero semantics (NaN, -0/+0, objects, symbols, booleans inside Sets)', () => {
		const objShared = { id: 1 };
		const objA = { id: 2 };
		const sym = Symbol('shared');

		const a = new Set([NaN, -0, objShared, objA, sym, undefined, null, true]);
		const b = new Set([NaN, +0, objShared, { id: 2 }, sym, undefined, false]);

		const result = intersectionBoolLazy(a, b);
		assert.equal(result.size, 5);
		assert.equal(result.has(NaN), true);
		assert.equal(result.has(0), true);
		assert.equal(result.has(objShared), true);
		assert.equal(result.has(objA), false);
		assert.equal(result.has(sym), true);
		assert.equal(result.has(undefined), true);
		assert.equal(result.has(null), false);
		assert.equal(result.has(true), false);

		// A Set containing booleans is treated as a Set, not a boolean sequence
		const boolSet = new Set([true, false]);
		assert.deepEqual(intersectionBoolLazy(boolSet), new Set([true, false]));
	});

	it('lazily short-circuits an infinite Set generator as soon as intersection becomes empty', () => {
		let pulled = 0;
		let closed = false;
		function* infiniteSets() {
			try {
				pulled++;
				yield new Set([1, 2, 3]);
				pulled++;
				yield new Set([2, 3, 4]);
				pulled++;
				yield new Set([5, 6]);
				while (true) {
					pulled++;
					yield new Set([1, 2, 3]);
				}
			} finally {
				closed = true;
			}
		}

		const result = intersectionBoolLazy(infiniteSets());
		assert.deepEqual(result, new Set());
		assert.equal(pulled, 3);
		assert.equal(closed, true);
	});

	it('lazily short-circuits on the first Set if it is empty', () => {
		let pulled = 0;
		let closed = false;
		function* emptyFirst() {
			try {
				pulled++;
				yield new Set();
				pulled++;
				yield new Set([1, 2]);
			} finally {
				closed = true;
			}
		}

		const result = intersectionBoolLazy(emptyFirst());
		assert.deepEqual(result, new Set());
		assert.equal(pulled, 1);
		assert.equal(closed, true);
	});

	it('lazily short-circuits when a later yielded Set is empty without iterating candidates', () => {
		let pulled = 0;
		let closed = false;
		function* emptySecond() {
			try {
				pulled++;
				yield new Set([1, 2, 3, 4, 5]);
				pulled++;
				yield new Set();
				while (true) {
					pulled++;
					yield new Set([1]);
				}
			} finally {
				closed = true;
			}
		}

		const result = intersectionBoolLazy(emptySecond());
		assert.deepEqual(result, new Set());
		assert.equal(pulled, 2);
		assert.equal(closed, true);
	});
});

describe('intersectionBoolLazy — validation errors', () => {
	it('throws TypeError when called with no arguments', () => {
		assert.throws(() => intersectionBoolLazy(), TypeError);
	});

	it('throws RangeError for empty iterable sequences', () => {
		assert.throws(() => intersectionBoolLazy([]), RangeError);
		function* emptyGen() {}
		assert.throws(() => intersectionBoolLazy(emptyGen()), RangeError);
	});

	it('throws TypeError for unsupported single argument types', () => {
		const invalid = [
			null,
			undefined,
			0,
			1,
			NaN,
			'',
			'true',
			{},
			() => true,
			Symbol('x'),
			1n,
			new Boolean(true),
			new Boolean(false),
			new Map(),
			new Map([['a', true]]),
			new Uint8Array([1, 0]),
			new Uint8Array(),
		];
		for (const bad of invalid) {
			assert.throws(
				() => intersectionBoolLazy(bad),
				TypeError,
				`Expected TypeError for ${String(bad)}`
			);
		}
	});

	it('throws TypeError when mixing booleans and Sets or passing invalid variadic args', () => {
		assert.throws(() => intersectionBoolLazy(true, new Set([1])), TypeError);
		assert.throws(() => intersectionBoolLazy(new Set([1]), true), TypeError);
		assert.throws(() => intersectionBoolLazy(false, 0), TypeError);
		assert.throws(() => intersectionBoolLazy(new Set(), null), TypeError);
		assert.throws(() => intersectionBoolLazy([true], [false]), TypeError);
		assert.throws(() => intersectionBoolLazy(1, 2), TypeError);
		assert.throws(
			() => intersectionBoolLazy(true, new Boolean(true)),
			TypeError
		);
	});

	it('throws TypeError and closes iterator when a sequence yields an invalid element', () => {
		assert.throws(() => intersectionBoolLazy([1, 2]), TypeError);
		assert.throws(() => intersectionBoolLazy([true, 1]), TypeError);
		assert.throws(
			() => intersectionBoolLazy([true, new Set([1])]),
			TypeError
		);
		assert.throws(
			() => intersectionBoolLazy([new Set([1]), true]),
			TypeError
		);
		assert.throws(
			() => intersectionBoolLazy([new Set([1]), [1]]),
			TypeError
		);

		let closed = false;
		function* badSecond() {
			try {
				yield true;
				yield 'not-a-boolean';
				yield true;
			} finally {
				closed = true;
			}
		}
		assert.throws(() => intersectionBoolLazy(badSecond()), TypeError);
		assert.equal(closed, true);

		let closedFirst = false;
		function* badFirst() {
			try {
				yield 42;
				yield true;
			} finally {
				closedFirst = true;
			}
		}
		assert.throws(() => intersectionBoolLazy(badFirst()), TypeError);
		assert.equal(closedFirst, true);
	});

	it('throws TypeError for a malformed custom iterable', () => {
		const malformed = {
			[Symbol.iterator]() {
				return null;
			},
		};
		assert.throws(() => intersectionBoolLazy(malformed), TypeError);
	});
});

describe('intersectionBoolLazy — independent cross-checks', () => {
	it('matches exhaustive truth tables (n = 1..4) against Array.prototype.every', () => {
		for (let n = 1; n <= 4; n++) {
			const total = 1 << n;
			for (let mask = 0; mask < total; mask++) {
				const values = [];
				for (let bit = 0; bit < n; bit++) {
					values.push(Boolean((mask >> bit) & 1));
				}
				const expected = values.every(Boolean);
				assert.equal(intersectionBoolLazy(...values), expected);
				assert.equal(intersectionBoolLazy(values), expected);
				assert.equal(
					intersectionBoolLazy(
						(function* () {
							yield* values;
						})()
					),
					expected
				);
			}
		}
	});

	it('matches independent universe-filter reference across 100 deterministic random Set trials', () => {
		// Deterministic xorshift32 PRNG
		let seed = 0x5eed1234;
		const nextRand = () => {
			seed ^= seed << 13;
			seed ^= seed >>> 17;
			seed ^= seed << 5;
			return (seed >>> 0) / 0x100000000;
		};

		const universe = [0, 1, 2, 3, 4, 5, 6, 7, 'a', 'b', NaN, null];

		for (let trial = 0; trial < 100; trial++) {
			const numSets = 1 + Math.floor(nextRand() * 5);
			const sets = [];
			for (let i = 0; i < numSets; i++) {
				const s = new Set();
				for (const elem of universe) {
					if (nextRand() < 0.65) {
						s.add(elem);
					}
				}
				sets.push(s);
			}

			// Independent reference: filter universe by membership in every set
			const expected = new Set(
				universe.filter((item) => sets.every((s) => s.has(item)))
			);

			const viaVariadic = intersectionBoolLazy(...sets);
			const viaArray = intersectionBoolLazy(sets);
			const viaGenerator = intersectionBoolLazy(
				(function* () {
					yield* sets;
				})()
			);

			assert.deepEqual(viaVariadic, expected);
			assert.deepEqual(viaArray, expected);
			assert.deepEqual(viaGenerator, expected);

			// Also verify commutativity (reversed order) and idempotence
			const reversed = intersectionBoolLazy([...sets].reverse());
			assert.deepEqual(reversed, expected);
			assert.deepEqual(intersectionBoolLazy(viaVariadic, viaVariadic), expected);

			// Cross-check against native Set.prototype.intersection when available (Node 22+)
			if (typeof Set.prototype.intersection === 'function') {
				const nativeRef = sets.reduce((acc, s) => acc.intersection(s));
				assert.deepEqual(viaVariadic, nativeRef);
			}
		}
	});
});
