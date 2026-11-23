import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intersectionFuzzyMemo } from "./intersectionFuzzyMemo.js";

describe("intersectionFuzzyMemo", () => {
	describe("scalar Zadeh fuzzy intersection", () => {
		it("computes minimum for on-grid (table) values in [0, 1]", () => {
			assert.equal(intersectionFuzzyMemo(0, 0), 0);
			assert.equal(intersectionFuzzyMemo(0, 1), 0);
			assert.equal(intersectionFuzzyMemo(1, 0), 0);
			assert.equal(intersectionFuzzyMemo(1, 1), 1);
			assert.equal(intersectionFuzzyMemo(0.25, 0.75), 0.25);
			assert.equal(intersectionFuzzyMemo(0.83, 0.42), 0.42);
			assert.equal(intersectionFuzzyMemo(0.5, 0.5), 0.5);
		});

		it("computes exact minimum for off-grid (memoized) values and repeated lookups", () => {
			const a = 1 / 3;
			const b = Math.SQRT1_2;
			const c = 0.123456789;
			assert.equal(intersectionFuzzyMemo(a, b), a);
			assert.equal(intersectionFuzzyMemo(b, a), a); // symmetric memo hit
			assert.equal(intersectionFuzzyMemo(a, b), a); // direct memo hit
			assert.equal(intersectionFuzzyMemo(b, c), c);
			assert.equal(intersectionFuzzyMemo(c, b), c);
		});

		it("supports three or more scalar arguments", () => {
			assert.equal(intersectionFuzzyMemo(0.9, 0.4, 0.7, 0.2, 0.85), 0.2);
			assert.equal(intersectionFuzzyMemo(1 / 2, 1 / 3, 1 / 4), 1 / 4);
		});

		it("normalizes -0 to +0", () => {
			const res1 = intersectionFuzzyMemo(-0, 0.5);
			const res2 = intersectionFuzzyMemo(-0, -0);
			assert.equal(Object.is(res1, 0), true);
			assert.equal(Object.is(res2, 0), true);
		});
	});

	describe("array fuzzy set intersection", () => {
		it("computes element-wise Zadeh intersection for equal-length arrays", () => {
			assert.deepEqual(
				intersectionFuzzyMemo([0.1, 0.8, 0.5, 1.0], [0.6, 0.3, 0.5, 0.0]),
				[0.1, 0.3, 0.5, 0.0],
			);
		});

		it("supports variadic arrays and empty arrays", () => {
			assert.deepEqual(intersectionFuzzyMemo([], []), []);
			assert.deepEqual(
				intersectionFuzzyMemo([0.9, 0.4, 0.7], [0.5, 0.8, 0.2], [0.6, 0.3, 0.9]),
				[0.5, 0.3, 0.2],
			);
		});

		it("does not mutate input arrays", () => {
			const a = [0.8, 0.2];
			const b = [0.3, 0.9];
			const out = intersectionFuzzyMemo(a, b);
			out[0] = 0.99;
			assert.deepEqual(a, [0.8, 0.2]);
			assert.deepEqual(b, [0.3, 0.9]);
			assert.deepEqual(intersectionFuzzyMemo(a, b), [0.3, 0.2]);
		});
	});

	describe("plain object fuzzy set intersection", () => {
		it("intersects overlapping keys and omits keys absent from any input", () => {
			assert.deepEqual(
				intersectionFuzzyMemo(
					{ cold: 0.8, warm: 0.4, hot: 0.1 },
					{ warm: 0.7, hot: 0.05, scorching: 0.9 },
				),
				{ warm: 0.4, hot: 0.05 },
			);
		});

		it("handles empty objects, disjoint objects, null-prototype objects, and zero memberships", () => {
			assert.deepEqual(intersectionFuzzyMemo({}, {}), {});
			assert.deepEqual(intersectionFuzzyMemo({ a: 0.5 }, { b: 0.5 }), {});
			assert.deepEqual(intersectionFuzzyMemo({ a: 0, b: 0.6 }, { a: 0.9, b: 0.2 }), {
				a: 0,
				b: 0.2,
			});

			const nullProtoA = Object.assign(Object.create(null), { x: 0.3, y: 0.9 });
			const nullProtoB = Object.assign(Object.create(null), { y: 0.4, z: 0.8 });
			assert.deepEqual(intersectionFuzzyMemo(nullProtoA, nullProtoB), { y: 0.4 });
		});

		it("supports three or more plain objects", () => {
			assert.deepEqual(
				intersectionFuzzyMemo(
					{ a: 0.9, b: 0.7, c: 0.5 },
					{ a: 0.6, b: 0.8 },
					{ a: 0.75, b: 0.3, d: 1 },
				),
				{ a: 0.6, b: 0.3 },
			);
		});

		it("does not mutate input objects", () => {
			const a = { k: 0.7 };
			const b = { k: 0.4 };
			const res = intersectionFuzzyMemo(a, b);
			res.k = 1;
			assert.deepEqual(a, { k: 0.7 });
			assert.deepEqual(b, { k: 0.4 });
		});
	});

	describe("Map fuzzy set intersection", () => {
		it("intersects overlapping Map entries across arbitrary key types", () => {
			const objKey = { id: 1 };
			const m1 = new Map([
				["a", 0.9],
				[42, 0.25],
				[objKey, 0.7],
				["only1", 0.8],
			]);
			const m2 = new Map([
				["a", 0.35],
				[42, 0.6],
				[objKey, 0.5],
				["only2", 0.9],
			]);
			const res = intersectionFuzzyMemo(m1, m2);
			assert.equal(res instanceof Map, true);
			assert.deepEqual(
				[...res.entries()],
				[
					["a", 0.35],
					[42, 0.25],
					[objKey, 0.5],
				],
			);
		});

		it("handles empty Maps and variadic Maps", () => {
			assert.equal(intersectionFuzzyMemo(new Map(), new Map()).size, 0);
			const res = intersectionFuzzyMemo(
				new Map([
					["x", 0.8],
					["y", 0.5],
				]),
				new Map([
					["x", 0.6],
					["y", 0.9],
				]),
				new Map([["x", 0.7]]),
			);
			assert.deepEqual([...res.entries()], [["x", 0.6]]);
		});
	});

	describe("input validation", () => {
		it("throws TypeError on insufficient arguments or mismatched/unsupported types", () => {
			assert.throws(() => intersectionFuzzyMemo(), TypeError);
			assert.throws(() => intersectionFuzzyMemo(0.5), TypeError);
			assert.throws(() => intersectionFuzzyMemo(0.5, [0.5]), TypeError);
			assert.throws(() => intersectionFuzzyMemo({ a: 0.5 }, new Map([["a", 0.5]])), TypeError);
			assert.throws(() => intersectionFuzzyMemo(null, null), TypeError);
			assert.throws(() => intersectionFuzzyMemo("0.5", "0.3"), TypeError);
			assert.throws(() => intersectionFuzzyMemo(new Set([0.5]), new Set([0.5])), TypeError);
			assert.throws(() => intersectionFuzzyMemo(["0.5"], [0.5]), TypeError);
			assert.throws(() => intersectionFuzzyMemo({ a: true }, { a: 0.5 }), TypeError);
			// Sparse array hole is undefined -> TypeError
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => intersectionFuzzyMemo([, 0.5], [0.5, 0.5]), TypeError);
		});

		it("throws RangeError on out-of-range, non-finite, or mismatched-length inputs", () => {
			assert.throws(() => intersectionFuzzyMemo(-0.01, 0.5), RangeError);
			assert.throws(() => intersectionFuzzyMemo(0.5, 1.01), RangeError);
			assert.throws(() => intersectionFuzzyMemo(Number.NaN, 0.5), RangeError);
			assert.throws(() => intersectionFuzzyMemo(Number.POSITIVE_INFINITY, 0.5), RangeError);
			assert.throws(() => intersectionFuzzyMemo(Number.NEGATIVE_INFINITY, 0.5), RangeError);
			assert.throws(() => intersectionFuzzyMemo([0.2, 0.5], [0.2]), RangeError);
			// Validates non-overlapping keys too
			assert.throws(() => intersectionFuzzyMemo({ a: 0.5, bad: 1.5 }, { a: 0.3 }), RangeError);
			assert.throws(() => intersectionFuzzyMemo({}, {}, { bad: -0.1 }), RangeError);
			assert.throws(
				() => intersectionFuzzyMemo(new Map([["a", 0.5]]), new Map([["b", 2]])),
				RangeError,
			);
		});
	});

	describe("independent cross-checks and algebraic laws", () => {
		it("matches De Morgan's Law: A ∩ B = ¬(¬A ∪ ¬B) across full 101x101 grid", () => {
			const zadehNot = (x) => 1 - x;
			const zadehUnion = (x, y) => Math.max(x, y);

			for (let i = 0; i <= 100; i++) {
				const a = i / 100;
				for (let j = 0; j <= 100; j++) {
					const b = j / 100;
					const actual = intersectionFuzzyMemo(a, b);
					const deMorgan = zadehNot(zadehUnion(zadehNot(a), zadehNot(b)));
					assert.ok(
						Math.abs(actual - deMorgan) <= 1e-12,
						`Mismatch at (${a}, ${b}): got ${actual}, De Morgan ${deMorgan}`,
					);
				}
			}
		});

		it("satisfies commutativity, associativity, idempotence, identity, annihilator, and monotonicity", () => {
			const samples = [0, 0.01, 0.17, 1 / 3, 0.5, Math.SQRT1_2, 0.99, 1];
			for (const a of samples) {
				assert.equal(intersectionFuzzyMemo(a, a), a); // idempotence
				assert.equal(intersectionFuzzyMemo(a, 1), a); // identity
				assert.equal(intersectionFuzzyMemo(a, 0), 0); // annihilator
				for (const b of samples) {
					assert.equal(intersectionFuzzyMemo(a, b), intersectionFuzzyMemo(b, a)); // commutativity
					for (const c of samples) {
						// associativity
						assert.equal(
							intersectionFuzzyMemo(intersectionFuzzyMemo(a, b), c),
							intersectionFuzzyMemo(a, intersectionFuzzyMemo(b, c)),
						);
						// monotonicity: if a <= c, then I(a, b) <= I(c, b)
						if (a <= c) {
							assert.ok(intersectionFuzzyMemo(a, b) <= intersectionFuzzyMemo(c, b));
						}
					}
				}
			}
		});

		it("reduces to crisp Set intersection when memberships are binary {0, 1}", () => {
			const universe = ["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7"];
			const setA = new Set(["u0", "u2", "u3", "u5", "u7"]);
			const setB = new Set(["u1", "u2", "u5", "u6", "u7"]);
			const crispExpected = new Set([...setA].filter((x) => setB.has(x)));

			const fuzzyA = Object.fromEntries(universe.map((u) => [u, setA.has(u) ? 1 : 0]));
			const fuzzyB = Object.fromEntries(universe.map((u) => [u, setB.has(u) ? 1 : 0]));
			const fuzzyIntersection = intersectionFuzzyMemo(fuzzyA, fuzzyB);

			const reconstructed = new Set(
				Object.entries(fuzzyIntersection)
					.filter(([, mu]) => mu === 1)
					.map(([u]) => u),
			);
			assert.deepEqual(reconstructed, crispExpected);
		});

		it("matches Math.min under deterministic PRNG stress exceeding memo cache capacity", () => {
			// Mulberry32 deterministic PRNG
			let seed = 0x12345678;
			const rand = () => {
				seed |= 0;
				seed = (seed + 0x6d2b79f5) | 0;
				let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};

			// Generate 5,000 off-grid pairs (> 4,096 cache cap) to test eviction + accuracy
			const pairs = [];
			for (let k = 0; k < 5000; k++) {
				const a = rand();
				const b = rand();
				pairs.push([a, b]);
				assert.equal(intersectionFuzzyMemo(a, b), Math.min(a, b));
			}
			// Re-query a slice to verify cache hits and re-population after eviction
			for (let k = 0; k < 500; k++) {
				const [a, b] = pairs[k];
				assert.equal(intersectionFuzzyMemo(a, b), Math.min(a, b));
				assert.equal(intersectionFuzzyMemo(b, a), Math.min(a, b));
			}
		});
	});
});
