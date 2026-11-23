import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDecimalLazy } from './addDecimalLazy.js';

describe('addDecimalLazy', () => {
	describe('normal cases', () => {
		it('adds pairwise sequences of decimal strings accurately', () => {
			const result = [...addDecimalLazy(['0.1', '1.25', '-3.5', '19.99'], ['0.2', '2.75', '3.5', '0.01'])];
			assert.deepEqual(result, ['0.3', '4', '0', '20']);
		});

		it('handles arbitrary-precision integers and fractions far beyond IEEE-754 limits', () => {
			const a = '1234567890123456789012345678901234567890.000000000000000000000000000001';
			const b = '8765432109876543210987654321098765432109.999999999999999999999999999999';
			const result = [...addDecimalLazy(a, b, 30)];
			assert.deepEqual(result, ['10000000000000000000000000000000000000000']);

			const c = '0.0000000000000000000000000000000000000001';
			const d = '0.0000000000000000000000000000000000000002';
			assert.deepEqual([...addDecimalLazy(c, d, 50)], ['0.0000000000000000000000000000000000000003']);
		});

		it('supports scalar + scalar addition', () => {
			assert.deepEqual([...addDecimalLazy('42.125', '-12.125')], ['30']);
			assert.deepEqual([...addDecimalLazy('-10.5', '-20.25')], ['-30.75']);
		});

		it('supports broadcasting a scalar over a sequence in either position', () => {
			assert.deepEqual([...addDecimalLazy(['1', '2.5', '-0.5'], '0.5')], ['1.5', '3', '0']);
			assert.deepEqual([...addDecimalLazy('10.1', ['0.2', '-10.1', '5'])], ['10.3', '0', '15.1']);
		});

		it('supports single-sequence cumulative running sum mode', () => {
			assert.deepEqual([...addDecimalLazy(['0.1', '0.2', '0.3', '-0.6'])], ['0.1', '0.3', '0.6', '0']);
		});

		it('supports scientific notation and varied valid decimal formats', () => {
			const a = ['1.5e-5', '+.5', '5.', '1e30', '-2.5E2'];
			const b = ['2.5E-5', '.5', '-5.00', '1', '50'];
			assert.deepEqual([...addDecimalLazy(a, b, 10)], [
				'0.00004',
				'1',
				'0',
				'1000000000000000000000000000001',
				'-200',
			]);
		});
	});

	describe('precision and rounding', () => {
		it('applies round half-to-even (banker rounding) at the configured precision', () => {
			// Exact sums: 1.25 -> 1.2, 1.35 -> 1.4, -1.25 -> -1.2, -1.35 -> -1.4
			assert.deepEqual(
				[...addDecimalLazy(['1.2', '1.3', '-1.2', '-1.3'], ['0.05', '0.05', '-0.05', '-0.05'], 1)],
				['1.2', '1.4', '-1.2', '-1.4']
			);
		});

		it('handles precision = 0 (integer rounding) and carry propagation', () => {
			assert.deepEqual(
				[...addDecimalLazy(['1.4', '1.5', '2.5', '9.999'], ['0.0', '0.0', '0.0', '0.001'], 0)],
				['1', '2', '2', '10']
			);
			assert.deepEqual([...addDecimalLazy('9.994', '0.005', 2)], ['10']);
		});

		it('keeps internal accumulator exact during cumulative sum to avoid rounding drift', () => {
			// 0.004 * 3 = 0.012; at precision 2, individual steps are 0, 0.01, 0.01
			// Adding 0.004 five times = 0.02 exact (if rounded each step, 0 + 0.004 would stay 0 forever)
			const result = [...addDecimalLazy(['0.004', '0.004', '0.004', '0.004', '0.004'], 2)];
			assert.deepEqual(result, ['0', '0.01', '0.01', '0.02', '0.02']);
		});

		it('defaults to 20 fractional decimal places when precision is omitted', () => {
			const a = '0.123456789012345678904';
			const b = '0.000000000000000000004';
			// Exact sum ends in ...78908 -> rounds up at 20th place to ...7891
			assert.deepEqual([...addDecimalLazy(a, b)], ['0.12345678901234567891']);
		});
	});

	describe('edge cases', () => {
		it('handles empty iterables cleanly', () => {
			assert.deepEqual([...addDecimalLazy([], [])], []);
			assert.deepEqual([...addDecimalLazy([], ['1', '2'])], []);
			assert.deepEqual([...addDecimalLazy(['1', '2'], [])], []);
			assert.deepEqual([...addDecimalLazy([], '5')], []);
			assert.deepEqual([...addDecimalLazy('5', [])], []);
			assert.deepEqual([...addDecimalLazy([])], []);
		});

		it('normalizes negative zero to "0"', () => {
			assert.deepEqual([...addDecimalLazy('-0', '-0')], ['0']);
			assert.deepEqual([...addDecimalLazy('-0.000', '+0.000')], ['0']);
			assert.deepEqual([...addDecimalLazy('-0.001', '-0.001', 2)], ['0']);
			assert.deepEqual([...addDecimalLazy('-123.456', '123.456')], ['0']);
		});

		it('stops at the shorter sequence without over-consuming the longer sequence', () => {
			let pulledB = 0;
			function* genB() {
				while (true) {
					pulledB++;
					yield '10';
				}
			}
			const result = [...addDecimalLazy(['1', '2'], genB())];
			assert.deepEqual(result, ['11', '12']);
			assert.equal(pulledB, 2);
		});

		it('works with non-array iterables such as Set and custom iterables', () => {
			const setA = new Set(['1.1', '2.2', '3.3']);
			const customB = {
				*[Symbol.iterator]() {
					yield '0.9';
					yield '0.8';
					yield '0.7';
				},
			};
			assert.deepEqual([...addDecimalLazy(setA, customB)], ['2', '3', '4']);
		});
	});

	describe('input validation', () => {
		it('validates top-level operand types eagerly', () => {
			assert.throws(() => addDecimalLazy(null, '1'), TypeError);
			assert.throws(() => addDecimalLazy(undefined, '1'), TypeError);
			assert.throws(() => addDecimalLazy(123, '1'), TypeError);
			assert.throws(() => addDecimalLazy({}, '1'), TypeError);
			assert.throws(() => addDecimalLazy('1', null), TypeError);
			assert.throws(() => addDecimalLazy('1', 2), TypeError);
			assert.throws(() => addDecimalLazy('1', {}), TypeError);
			assert.throws(() => addDecimalLazy(['1'], 2, 5), TypeError);
		});

		it('validates precision eagerly', () => {
			assert.throws(() => addDecimalLazy('1', '2', -1), RangeError);
			assert.throws(() => addDecimalLazy('1', '2', 1.5), RangeError);
			assert.throws(() => addDecimalLazy('1', '2', Number.NaN), RangeError);
			assert.throws(() => addDecimalLazy('1', '2', Number.POSITIVE_INFINITY), RangeError);
			assert.throws(() => addDecimalLazy('1', '2', 1_000_001), RangeError);
			assert.throws(() => addDecimalLazy('1', '2', '5'), TypeError);
			assert.throws(() => addDecimalLazy(['1'], -2), RangeError);
		});

		it('rejects malformed decimal strings and non-string stream items', () => {
			const invalidStrings = ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '.', '1.2.3', '1e', '1e+', ' 1.5 ', '1_000', '0x10'];
			for (const bad of invalidStrings) {
				assert.throws(() => addDecimalLazy(bad, '1'), RangeError, `expected RangeError for ${JSON.stringify(bad)}`);
				assert.throws(() => addDecimalLazy('1', bad), RangeError, `expected RangeError for ${JSON.stringify(bad)}`);
			}

			assert.throws(() => addDecimalLazy('1e10000000', '1'), RangeError);
			assert.throws(() => [...addDecimalLazy(['1', 2], ['3', '4'])], TypeError);
			assert.throws(() => [...addDecimalLazy(['1', 'bad'])], RangeError);
		});
	});

	describe('lazy consumption verification', () => {
		it('consumes infinite generators strictly on demand (zero upfront pull, one per next)', () => {
			let pulledA = 0;
			let pulledB = 0;
			function* infiniteA() {
				let i = 1n;
				while (true) {
					pulledA++;
					yield `${i}.1`;
					i++;
				}
			}
			function* infiniteB() {
				let i = 1n;
				while (true) {
					pulledB++;
					yield `${i}.2`;
					i++;
				}
			}

			const gen = addDecimalLazy(infiniteA(), infiniteB(), 5);
			assert.equal(pulledA, 0);
			assert.equal(pulledB, 0);

			const taken = [];
			for (let k = 1; k <= 5; k++) {
				const step = gen.next();
				assert.equal(step.done, false);
				taken.push(step.value);
				assert.equal(pulledA, k);
				assert.equal(pulledB, k);
			}
			assert.deepEqual(taken, ['2.3', '4.3', '6.3', '8.3', '10.3']);
		});

		it('closes underlying iterators via finally when consumer breaks early', () => {
			let closedA = false;
			let closedB = false;
			function* genA() {
				try {
					while (true) yield '0.25';
				} finally {
					closedA = true;
				}
			}
			function* genB() {
				try {
					while (true) yield '0.75';
				} finally {
					closedB = true;
				}
			}

			const collected = [];
			for (const val of addDecimalLazy(genA(), genB())) {
				collected.push(val);
				if (collected.length === 3) break;
			}
			assert.deepEqual(collected, ['1', '1', '1']);
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});

		it('consumes single-sequence cumulative sums lazily on an infinite generator', () => {
			let pulled = 0;
			function* onesTenths() {
				while (true) {
					pulled++;
					yield '0.1';
				}
			}

			const gen = addDecimalLazy(onesTenths(), 4);
			assert.equal(pulled, 0);

			const results = [];
			for (let i = 1; i <= 10; i++) {
				results.push(gen.next().value);
				assert.equal(pulled, i);
			}
			assert.deepEqual(results, ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1']);
		});

		it('defers element validation until the invalid element is pulled', () => {
			let pulled = 0;
			function* streamWithLateError() {
				pulled++;
				yield '1.5';
				pulled++;
				yield 'not-a-number';
			}

			const gen = addDecimalLazy(streamWithLateError(), '2.5');
			assert.equal(pulled, 0);
			assert.equal(gen.next().value, '4');
			assert.equal(pulled, 1);
			assert.throws(() => gen.next(), RangeError);
			assert.equal(pulled, 2);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent fixed-scale BigInt reference across 60 pseudo-random high-precision pairs', () => {
			// Deterministic LCG for reproducible testing
			let seed = 0x12345678n;
			const nextRand = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				return seed;
			};

			const SCALE = 25;
			const formatScaledBigInt = (n) => {
				if (n === 0n) return '0';
				const neg = n < 0n;
				const s = (neg ? -n : n).toString().padStart(SCALE + 1, '0');
				const intPart = s.slice(0, s.length - SCALE);
				const fracPart = s.slice(s.length - SCALE).replace(/0+$/, '');
				return `${neg ? '-' : ''}${intPart}${fracPart ? `.${fracPart}` : ''}`;
			};

			const lhsStrings = [];
			const rhsStrings = [];
			const expected = [];

			for (let i = 0; i < 60; i++) {
				// Build 128-bit signed scaled integers (>38 digits, far beyond Number precision)
				const magA = (nextRand() << 64n) | nextRand();
				const magB = (nextRand() << 64n) | nextRand();
				const valA = (nextRand() & 1n) === 0n ? magA : -magA;
				const valB = (nextRand() & 1n) === 0n ? magB : -magB;

				lhsStrings.push(formatScaledBigInt(valA));
				rhsStrings.push(formatScaledBigInt(valB));
				expected.push(formatScaledBigInt(valA + valB));
			}

			const actual = [...addDecimalLazy(lhsStrings, rhsStrings, SCALE)];
			assert.deepEqual(actual, expected);
		});

		it('satisfies algebraic laws: commutativity, associativity, and additive inverse', () => {
			const xs = ['98765432109876543210.1234567890123456789', '-0.0000000000000000000000001', '42.5'];
			const ys = ['-12345678901234567890.9876543210987654321', '100000000000000000000.0000000000000000000000001', '-42.5'];
			const zs = ['33333333333333333333.3333333333333333333', '7.7777777777777777777777777', '0.00000000000000000001'];
			const prec = 30;

			// Commutativity: a + b === b + a
			assert.deepEqual(
				[...addDecimalLazy(xs, ys, prec)],
				[...addDecimalLazy(ys, xs, prec)]
			);

			// Associativity: (a + b) + c === a + (b + c)
			assert.deepEqual(
				[...addDecimalLazy(addDecimalLazy(xs, ys, prec), zs, prec)],
				[...addDecimalLazy(xs, addDecimalLazy(ys, zs, prec), prec)]
			);

			// Additive inverse: (a + b) + (-b) === a
			const negYs = ys.map((s) => (s.startsWith('-') ? s.slice(1) : `-${s}`));
			assert.deepEqual(
				[...addDecimalLazy(addDecimalLazy(xs, ys, prec), negYs, prec)],
				xs
			);
		});
	});
});
