import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lnDualLazy } from './lnDualLazy.js';

/**
 * Helper to assert two numbers are within an absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	);
}

describe('lnDualLazy', () => {
	describe('normal cases', () => {
		it('computes exact value and forward-mode derivative for standard dual inputs', () => {
			const input = [
				{ v: 1, d: 1 },
				{ v: Math.E, d: 1 },
				{ v: Math.E, d: Math.E },
				{ v: 2, d: 3 },
				{ v: 0.5, d: 1 },
				{ v: 1 / Math.E, d: 1 },
			];

			const results = [...lnDualLazy(input)];
			assert.equal(results.length, input.length);

			assert.deepStrictEqual(results[0], { v: 0, d: 1 });
			assertClose(results[1].v, 1);
			assertClose(results[1].d, 1 / Math.E);
			assertClose(results[2].v, 1);
			assertClose(results[2].d, 1);
			assertClose(results[3].v, Math.LN2);
			assertClose(results[3].d, 1.5);
			assertClose(results[4].v, -Math.LN2);
			assertClose(results[4].d, 2);
			assertClose(results[5].v, -1);
			assertClose(results[5].d, Math.E);
		});

		it('handles zero, negative, and -0 derivatives cleanly', () => {
			const results = [
				...lnDualLazy([
					{ v: 5, d: 0 },
					{ v: 4, d: -2 },
					{ v: 2, d: -0 },
				]),
			];

			assertClose(results[0].v, Math.log(5));
			assert.ok(Object.is(results[0].d, 0));

			assertClose(results[1].v, Math.log(4));
			assertClose(results[1].d, -0.5);

			assertClose(results[2].v, Math.LN2);
			assert.ok(Object.is(results[2].d, 0));
		});

		it('accepts diverse iterable types (Set, custom iterable, generator)', () => {
			const setInput = new Set([
				{ v: 1, d: 2 },
				{ v: 4, d: 8 },
			]);
			assert.deepStrictEqual([...lnDualLazy(setInput)], [
				{ v: 0, d: 2 },
				{ v: Math.log(4), d: 2 },
			]);

			const customIterable = {
				[Symbol.iterator]() {
					const items = [
						{ v: 10, d: 5 },
						{ v: 20, d: 10 },
					];
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

			const customResults = [...lnDualLazy(customIterable)];
			assertClose(customResults[0].v, Math.log(10));
			assertClose(customResults[0].d, 0.5);
			assertClose(customResults[1].v, Math.log(20));
			assertClose(customResults[1].d, 0.5);
		});

		it('satisfies the dual logarithm product-to-sum identity ln(a * b) = ln(a) + ln(b)', () => {
			const pairs = [
				[
					{ v: 2, d: 3 },
					{ v: 5, d: -1 },
				],
				[
					{ v: 0.25, d: 0.5 },
					{ v: 8, d: 4 },
				],
				[
					{ v: Math.PI, d: 1.2 },
					{ v: Math.E, d: 0.7 },
				],
			];

			const products = pairs.map(([a, b]) => ({
				v: a.v * b.v,
				d: a.d * b.v + a.v * b.d,
			}));

			const lnProducts = [...lnDualLazy(products)];
			const lnA = [...lnDualLazy(pairs.map(([a]) => a))];
			const lnB = [...lnDualLazy(pairs.map(([, b]) => b))];

			for (let i = 0; i < pairs.length; i++) {
				assertClose(lnProducts[i].v, lnA[i].v + lnB[i].v, 1e-12);
				assertClose(lnProducts[i].d, lnA[i].d + lnB[i].d, 1e-12);
			}
		});

		it('composes cleanly by piping lnDualLazy(lnDualLazy(...)) for ln(ln(x))', () => {
			const x = Math.exp(Math.E); // ln(x) = e, ln(ln(x)) = 1
			const [res] = [...lnDualLazy(lnDualLazy([{ v: x, d: 1 }]))];
			assertClose(res.v, 1, 1e-12);
			assertClose(res.d, 1 / (x * Math.log(x)), 1e-12);
		});
	});

	describe('edge cases and input validation', () => {
		it('yields nothing for empty iterables', () => {
			assert.deepStrictEqual([...lnDualLazy([])], []);
			assert.deepStrictEqual([...lnDualLazy(new Set())], []);
			assert.deepStrictEqual([...lnDualLazy((function* () {})())], []);
		});

		it('handles extreme positive finite boundary values', () => {
			const results = [
				...lnDualLazy([
					{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
					{ v: 1e-300, d: 1e-300 },
					{ v: Number.MAX_VALUE, d: Number.MAX_VALUE },
				]),
			];

			assertClose(results[0].v, Math.log(Number.MIN_VALUE));
			assert.equal(results[0].d, 1);
			assertClose(results[1].v, Math.log(1e-300));
			assertClose(results[1].d, 1);
			assertClose(results[2].v, Math.log(Number.MAX_VALUE));
			assert.equal(results[2].d, 1);
		});

		it('throws TypeError eagerly when source is not a valid iterable', () => {
			const invalidSources = [
				null,
				undefined,
				42,
				true,
				Symbol('x'),
				'',
				'abc',
				{},
				{ v: 2, d: 1 },
			];

			for (const bad of invalidSources) {
				assert.throws(() => lnDualLazy(bad), TypeError);
			}
		});

		it('throws TypeError lazily for malformed dual elements', () => {
			const invalidItems = [
				null,
				undefined,
				42,
				'2',
				[2, 1],
				{},
				{ v: 2 },
				{ d: 1 },
				{ v: '2', d: 1 },
				{ v: 2, d: '1' },
			];

			for (const bad of invalidItems) {
				const gen = lnDualLazy([bad]);
				assert.throws(() => gen.next(), TypeError);
			}
		});

		it('throws RangeError lazily for domain singularities and non-finite components', () => {
			const outOfDomainItems = [
				{ v: 0, d: 1 },
				{ v: -0, d: 1 },
				{ v: 0, d: 0 },
				{ v: -1, d: 1 },
				{ v: -1e-12, d: 0 },
				{ v: -Number.MIN_VALUE, d: 1 },
				{ v: Number.NaN, d: 1 },
				{ v: 1, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.POSITIVE_INFINITY },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			];

			for (const bad of outOfDomainItems) {
				const gen = lnDualLazy([bad]);
				assert.throws(() => gen.next(), RangeError);
			}
		});
	});

	describe('lazy streaming guarantees', () => {
		it('consumes a tracking generator strictly on demand and cleans up on early exit', () => {
			let pulled = 0;
			let closed = false;

			function* trackedSource() {
				try {
					let n = 1;
					while (true) {
						pulled += 1;
						yield { v: n, d: 1 };
						n += 1;
					}
				} finally {
					closed = true;
				}
			}

			const stream = lnDualLazy(trackedSource());
			// Zero elements should be pulled before consumer starts iterating.
			assert.equal(pulled, 0);
			assert.equal(closed, false);

			const first = stream.next();
			assert.equal(pulled, 1);
			assert.equal(first.done, false);
			assert.deepStrictEqual(first.value, { v: 0, d: 1 });

			const second = stream.next();
			assert.equal(pulled, 2);
			assert.equal(second.done, false);
			assertClose(second.value.v, Math.LN2);
			assertClose(second.value.d, 0.5);

			// Early termination must propagate cleanup to upstream generator.
			stream.return();
			assert.equal(pulled, 2);
			assert.equal(closed, true);
		});

		it('handles infinite streams without eager materialization', () => {
			function* infiniteDuals() {
				let k = 1;
				while (true) {
					yield { v: k, d: 2 * k };
					k += 1;
				}
			}

			const taken = [];
			for (const dual of lnDualLazy(infiniteDuals())) {
				taken.push(dual);
				if (taken.length === 5) break;
			}

			assert.equal(taken.length, 5);
			for (let i = 0; i < 5; i++) {
				const k = i + 1;
				assertClose(taken[i].v, Math.log(k));
				assertClose(taken[i].d, 2);
			}
		});

		it('does not trigger errors for invalid elements beyond what the consumer pulls', () => {
			function* streamWithLateSingularity() {
				yield { v: 1, d: 1 };
				yield { v: 2, d: 1 };
				yield { v: 3, d: 1 };
				yield { v: -1, d: 1 }; // Domain singularity at element 4
			}

			const stream = lnDualLazy(streamWithLateSingularity());
			assert.deepStrictEqual(stream.next().value, { v: 0, d: 1 });
			assertClose(stream.next().value.v, Math.LN2);
			assertClose(stream.next().value.v, Math.log(3));
			assert.throws(() => stream.next(), RangeError);
		});
	});

	describe('independent cross-check against central finite differences', () => {
		const h = 1e-6;

		it('matches central finite-difference derivatives for f(x) = ln(x)', () => {
			const xs = [0.05, 0.25, 0.5, 1, 1.5, Math.PI, 10, 100];
			const dualStream = lnDualLazy(xs.map((x) => ({ v: x, d: 1 })));

			let i = 0;
			for (const { v, d } of dualStream) {
				const x = xs[i++];
				const fd = (Math.log(x + h) - Math.log(x - h)) / (2 * h);
				assertClose(v, Math.log(x), 1e-14);
				assertClose(d, fd, 1e-7);
			}
			assert.equal(i, xs.length);
		});

		it('matches central finite-difference derivatives for composite g(x) = ln(3x^2 + 2sin(x) + 5)', () => {
			const inner = (x) => 3 * x * x + 2 * Math.sin(x) + 5;
			const innerPrime = (x) => 6 * x + 2 * Math.cos(x);
			const g = (x) => Math.log(inner(x));

			const xs = [-2.5, -1, -0.3, 0, 0.7, 1.5, 3.2];
			function* innerDuals() {
				for (const x of xs) {
					yield { v: inner(x), d: innerPrime(x) };
				}
			}

			let i = 0;
			for (const { v, d } of lnDualLazy(innerDuals())) {
				const x = xs[i++];
				const fd = (g(x + h) - g(x - h)) / (2 * h);
				assertClose(v, g(x), 1e-13);
				assertClose(d, fd, 1e-8);
			}
			assert.equal(i, xs.length);
		});

		it('matches central finite-difference derivatives for chained h(x) = ln(ln(x^2 + 2))', () => {
			const hFn = (x) => Math.log(Math.log(x * x + 2));
			const xs = [-3, -1.2, 0, 0.5, 2.1, 5];

			function* innerDuals() {
				for (const x of xs) {
					yield { v: x * x + 2, d: 2 * x };
				}
			}

			let i = 0;
			for (const { v, d } of lnDualLazy(lnDualLazy(innerDuals()))) {
				const x = xs[i++];
				const fd = (hFn(x + h) - hFn(x - h)) / (2 * h);
				assertClose(v, hFn(x), 1e-13);
				assertClose(d, fd, 1e-8);
			}
			assert.equal(i, xs.length);
		});
	});
});
