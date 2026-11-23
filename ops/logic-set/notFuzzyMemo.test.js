import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notFuzzyMemo } from './notFuzzyMemo.js';

describe('notFuzzyMemo', () => {
	describe('normal cases: scalar fuzzy logic', () => {
		it('computes exact Zadeh complements for standard boundary and grid values', () => {
			assert.strictEqual(notFuzzyMemo(0), 1);
			assert.strictEqual(notFuzzyMemo(1), 0);
			assert.strictEqual(notFuzzyMemo(0.5), 0.5);
			assert.strictEqual(notFuzzyMemo(0.2), 0.8);
			assert.strictEqual(notFuzzyMemo(0.25), 0.75);
			assert.strictEqual(notFuzzyMemo(0.7), 0.3);
			assert.strictEqual(notFuzzyMemo(0.3), 0.7);
			assert.strictEqual(notFuzzyMemo(0.125), 0.875);
		});

		it('computes accurate complements for off-grid floating-point values and memoizes them', () => {
			const samples = [1 / 3, 2 / 3, Math.SQRT1_2, Math.PI / 4, 0.123456789];
			for (const x of samples) {
				const first = notFuzzyMemo(x);
				const second = notFuzzyMemo(x);
				assert.strictEqual(first, second);
				assert.ok(Math.abs(first - (1 - x)) <= Number.EPSILON);
			}
		});
	});

	describe('normal cases: fuzzy sets', () => {
		it('complements plain object fuzzy sets without mutating the input', () => {
			const fuzzySet = { cold: 0, warm: 0.3, hot: 0.7, boiling: 1 };
			const snapshot = { ...fuzzySet };
			const result = notFuzzyMemo(fuzzySet);

			assert.deepStrictEqual(result, { cold: 1, warm: 0.7, hot: 0.3, boiling: 0 });
			assert.deepStrictEqual(fuzzySet, snapshot);
			assert.notStrictEqual(result, fuzzySet);
		});

		it('complements Map fuzzy sets preserving key order and arbitrary key types', () => {
			const objKey = { id: 1 };
			const input = new Map([
				['a', 0],
				[42, 0.25],
				[objKey, 0.8],
				['z', 1],
			]);
			const result = notFuzzyMemo(input);

			assert.ok(result instanceof Map);
			assert.notStrictEqual(result, input);
			assert.deepStrictEqual([...result.keys()], ['a', 42, objKey, 'z']);
			assert.strictEqual(result.get('a'), 1);
			assert.strictEqual(result.get(42), 0.75);
			assert.strictEqual(result.get(objKey), 0.2);
			assert.strictEqual(result.get('z'), 0);
			assert.strictEqual(input.get(42), 0.25);
		});

		it('complements array membership vectors without mutating the input', () => {
			const input = [0, 0.2, 0.5, 0.8, 1];
			const result = notFuzzyMemo(input);

			assert.deepStrictEqual(result, [1, 0.8, 0.5, 0.2, 0]);
			assert.deepStrictEqual(input, [0, 0.2, 0.5, 0.8, 1]);
			assert.notStrictEqual(result, input);
		});

		it('handles empty fuzzy sets and null-prototype objects', () => {
			assert.deepStrictEqual(notFuzzyMemo({}), {});
			assert.deepStrictEqual(notFuzzyMemo([]), []);
			assert.deepStrictEqual([...notFuzzyMemo(new Map()).entries()], []);

			const nullProto = Object.create(null);
			nullProto.x = 0.4;
			nullProto.y = 0.9;
			const result = notFuzzyMemo(nullProto);
			assert.strictEqual(Object.getPrototypeOf(result), null);
			assert.strictEqual(result.x, 0.6);
			assert.strictEqual(result.y, 0.1);
		});
	});

	describe('edge cases', () => {
		it('normalizes -0 input and avoids returning -0 for input 1', () => {
			assert.ok(Object.is(notFuzzyMemo(-0), 1));
			assert.ok(Object.is(notFuzzyMemo(1), 0));
		});

		it('handles extreme subnormal and near-boundary values in [0, 1]', () => {
			assert.strictEqual(notFuzzyMemo(Number.MIN_VALUE), 1 - Number.MIN_VALUE);
			assert.strictEqual(notFuzzyMemo(Number.EPSILON), 1 - Number.EPSILON);
			assert.strictEqual(notFuzzyMemo(1 - Number.EPSILON), Number.EPSILON);
			const nearOne = 1 - 1e-12;
			assert.ok(Math.abs(notFuzzyMemo(nearOne) - 1e-12) <= 1e-15);
		});

		it('remains accurate across memoization cache eviction (> 4096 distinct off-grid floats)', () => {
			const count = 5000;
			for (let i = 1; i <= count; i += 1) {
				const x = i / (count + 17);
				const y = notFuzzyMemo(x);
				assert.ok(y >= 0 && y <= 1);
				assert.ok(Math.abs(y - (1 - x)) <= Number.EPSILON);
			}
			// Re-query early entries after eviction to verify recomputation matches.
			const early = 1 / (count + 17);
			assert.strictEqual(notFuzzyMemo(early), 1 - early);
		});
	});

	describe('input validation', () => {
		it('throws RangeError for numbers outside [0, 1], NaN, and Infinity', () => {
			for (const bad of [-0.0001, -1, 1.0001, 2, NaN, Infinity, -Infinity]) {
				assert.throws(() => notFuzzyMemo(bad), RangeError);
			}
		});

		it('throws TypeError for unsupported input types', () => {
			for (const bad of [null, undefined, '0.5', true, false, Symbol('x'), () => 0.5, new Set([0.5]), new Date()]) {
				assert.throws(() => notFuzzyMemo(bad), TypeError);
			}
		});

		it('throws appropriate errors for invalid membership values inside fuzzy sets', () => {
			assert.throws(() => notFuzzyMemo({ a: 0.5, b: 1.1 }), RangeError);
			assert.throws(() => notFuzzyMemo({ a: '0.5' }), TypeError);
			assert.throws(() => notFuzzyMemo(new Map([['a', -0.1]])), RangeError);
			assert.throws(() => notFuzzyMemo(new Map([['a', null]])), TypeError);
			assert.throws(() => notFuzzyMemo([0.2, NaN, 0.8]), RangeError);
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => notFuzzyMemo([0.2, , 0.8]), TypeError);
		});
	});

	describe('independent cross-checks (Zadeh axioms and De Morgan laws)', () => {
		/** Independent reference Zadeh operators. */
		const zadehNot = (x) => 1 - x;
		const zadehAnd = (a, b) => Math.min(a, b);
		const zadehOr = (a, b) => Math.max(a, b);

		it('matches independent Zadeh formula across all 1,001 table points and 1,000 deterministic off-grid points', () => {
			// Exhaustive grid check (0.000 .. 1.000)
			for (let i = 0; i <= 1000; i += 1) {
				const x = i / 1000;
				const actual = notFuzzyMemo(x);
				const expected = zadehNot(x);
				assert.ok(
					Math.abs(actual - expected) <= Number.EPSILON,
					`Mismatch at grid point ${x}: actual=${actual}, expected=${expected}`,
				);
				// Exact involution on every table point
				assert.strictEqual(notFuzzyMemo(actual), x);
			}

			// Deterministic LCG pseudo-random off-grid check
			let state = 123456789;
			for (let i = 0; i < 1000; i += 1) {
				state = (1664525 * state + 1013904223) >>> 0;
				const x = state / 0x100000000;
				const actual = notFuzzyMemo(x);
				assert.ok(Math.abs(actual - zadehNot(x)) <= Number.EPSILON);
				assert.ok(Math.abs(notFuzzyMemo(actual) - x) <= 2 * Number.EPSILON);
			}
		});

		it('satisfies antitonicity (order-reversing) over sorted membership values', () => {
			const values = [0, 1e-9, 0.001, 0.123456, 0.3, 0.5, 0.7, 0.876543, 0.999, 1 - 1e-9, 1];
			const complemented = notFuzzyMemo(values);
			for (let i = 1; i < complemented.length; i += 1) {
				assert.ok(
					complemented[i - 1] >= complemented[i],
					`Antitonicity violated at index ${i}: ${complemented[i - 1]} < ${complemented[i]}`,
				);
			}
		});

		it('satisfies Zadeh De Morgan laws on scalars and fuzzy sets', () => {
			const pairs = [
				[0, 0],
				[0, 1],
				[0.2, 0.8],
				[0.35, 0.65],
				[0.7, 0.3],
				[1 / 3, 2 / 7],
				[Math.SQRT1_2, 0.999],
			];

			for (const [a, b] of pairs) {
				// NOT(AND(a, b)) == OR(NOT(a), NOT(b))
				const lhs1 = notFuzzyMemo(zadehAnd(a, b));
				const rhs1 = zadehOr(notFuzzyMemo(a), notFuzzyMemo(b));
				assert.ok(Math.abs(lhs1 - rhs1) <= Number.EPSILON);

				// NOT(OR(a, b)) == AND(NOT(a), NOT(b))
				const lhs2 = notFuzzyMemo(zadehOr(a, b));
				const rhs2 = zadehAnd(notFuzzyMemo(a), notFuzzyMemo(b));
				assert.ok(Math.abs(lhs2 - rhs2) <= Number.EPSILON);
			}

			// Fuzzy-set-level De Morgan cross-check
			const setA = { u1: 0.1, u2: 0.45, u3: 0.7, u4: 1.0 };
			const setB = { u1: 0.6, u2: 0.45, u3: 0.2, u4: 0.0 };
			const notA = notFuzzyMemo(setA);
			const notB = notFuzzyMemo(setB);

			const interAB = Object.fromEntries(Object.keys(setA).map((k) => [k, zadehAnd(setA[k], setB[k])]));
			const unionAB = Object.fromEntries(Object.keys(setA).map((k) => [k, zadehOr(setA[k], setB[k])]));
			const notInterAB = notFuzzyMemo(interAB);
			const notUnionAB = notFuzzyMemo(unionAB);

			for (const k of Object.keys(setA)) {
				assert.ok(Math.abs(notInterAB[k] - zadehOr(notA[k], notB[k])) <= Number.EPSILON);
				assert.ok(Math.abs(notUnionAB[k] - zadehAnd(notA[k], notB[k])) <= Number.EPSILON);
			}
		});
	});
});
