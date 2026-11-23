import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddDecimalLazy } from './vectorAddDecimalLazy.js';

describe('vectorAddDecimalLazy', () => {
	describe('normal decimal addition', () => {
		it('adds decimal vectors without binary floating-point drift', () => {
			const a = ['0.1', '0.2', '0.3', '1.15'];
			const b = ['0.2', '0.4', '0.7', '2.85'];
			assert.deepEqual([...vectorAddDecimalLazy(a, b)], ['0.3', '0.6', '1', '4']);
		});

		it('handles mixed integers, decimals, signs, and shorthand forms', () => {
			const a = ['10', '.5', '+2.25', '5.', '-0', ' 1.5 '];
			const b = ['20', '-.5', '0.75', '.25', '-0.0', '2.5'];
			assert.deepEqual([...vectorAddDecimalLazy(a, b)], ['30', '0', '3', '5.25', '0', '4']);
		});

		it('supports scientific notation inputs', () => {
			const a = ['1e-5', '2.5E+2', '-3.2e-1', '1.23e4'];
			const b = ['2e-5', '50', '0.2', '770'];
			assert.deepEqual(
				[...vectorAddDecimalLazy(a, b)],
				['0.00003', '300', '-0.12', '13070']
			);
		});

		it('accepts diverse iterable types (generators, Sets, custom iterables)', () => {
			function* genA() {
				yield '1.1';
				yield '2.2';
			}
			const setB = new Set(['3.3', '4.4']);
			const customC = {
				*[Symbol.iterator]() {
					yield '0.6';
					yield '0.4';
				},
			};

			assert.deepEqual([...vectorAddDecimalLazy(genA(), setB)], ['4.4', '6.6']);
			assert.deepEqual([...vectorAddDecimalLazy(setB, customC)], ['3.9', '4.8']);
		});
	});

	describe('precision configuration and rounding', () => {
		it('rounds half-away-from-zero according to configured precision', () => {
			const a = ['1.234', '1.235', '-1.235', '2.999', '-0.0004'];
			const b = ['0.000', '0.000', '0.000', '0.002', '0.0000'];

			assert.deepEqual(
				[...vectorAddDecimalLazy(a, b, 2)],
				['1.23', '1.24', '-1.24', '3', '0']
			);
		});

		it('supports precision = 0 for integer rounding', () => {
			const a = ['1.4', '1.5', '-1.5', '99.9'];
			const b = ['0.0', '0.0', '0.0', '0.1'];
			assert.deepEqual([...vectorAddDecimalLazy(a, b, 0)], ['1', '2', '-2', '100']);
		});

		it('preserves arbitrary high precision beyond IEEE-754 limits', () => {
			const a = [
				'1234567890123456789012345678901234567890.00000000000000000000000000000000000000000000000001',
				'0.' + '0'.repeat(59) + '1',
			];
			const b = [
				'9876543210987654321098765432109876543210.00000000000000000000000000000000000000000000000002',
				'0.' + '0'.repeat(59) + '2',
			];

			assert.deepEqual([...vectorAddDecimalLazy(a, b, 60)], [
				'11111111101111111110111111111011111111100.00000000000000000000000000000000000000000000000003',
				'0.' + '0'.repeat(59) + '3',
			]);
		});
	});

	describe('edge cases and validation', () => {
		it('handles empty vectors', () => {
			assert.deepEqual([...vectorAddDecimalLazy([], [])], []);
		});

		it('handles negatives and exact cancellation to zero', () => {
			const big = '999999999999999999999999999999.99999999999999999999';
			const a = [big, '-42.125', '-0.0000000000000000000000001'];
			const b = [`-${big}`, '-57.875', '0.0000000000000000000000001'];
			assert.deepEqual([...vectorAddDecimalLazy(a, b, 30)], ['0', '-100', '0']);
		});

		it('throws RangeError on mismatched lengths and closes remaining iterator', () => {
			let closedB = false;
			function* longerB() {
				try {
					yield '1';
					yield '2';
					yield '3';
				} finally {
					closedB = true;
				}
			}

			assert.throws(
				() => [...vectorAddDecimalLazy(['10'], longerB())],
				RangeError
			);
			assert.equal(closedB, true);

			let closedA = false;
			function* longerA() {
				try {
					yield '1';
					yield '2';
				} finally {
					closedA = true;
				}
			}

			assert.throws(
				() => [...vectorAddDecimalLazy(longerA(), [])],
				RangeError
			);
			assert.equal(closedA, true);
		});

		it('eagerly validates vector iterable and precision arguments', () => {
			assert.throws(() => vectorAddDecimalLazy(null, []), TypeError);
			assert.throws(() => vectorAddDecimalLazy([], undefined), TypeError);
			assert.throws(() => vectorAddDecimalLazy(123, []), TypeError);
			assert.throws(() => vectorAddDecimalLazy({}, []), TypeError);
			assert.throws(() => vectorAddDecimalLazy('123', ['1', '2', '3']), TypeError);
			assert.throws(() => vectorAddDecimalLazy(['1'], '1'), TypeError);

			assert.throws(() => vectorAddDecimalLazy([], [], '2'), TypeError);
			assert.throws(() => vectorAddDecimalLazy([], [], -1), RangeError);
			assert.throws(() => vectorAddDecimalLazy([], [], 1.5), RangeError);
			assert.throws(() => vectorAddDecimalLazy([], [], Number.NaN), RangeError);
			assert.throws(() => vectorAddDecimalLazy([], [], Number.POSITIVE_INFINITY), RangeError);
		});

		it('throws on invalid decimal element values during iteration', () => {
			assert.throws(() => [...vectorAddDecimalLazy([1], ['1'])], TypeError);
			assert.throws(() => [...vectorAddDecimalLazy(['1'], [null])], TypeError);
			assert.throws(() => [...vectorAddDecimalLazy([''], ['1'])], SyntaxError);
			assert.throws(() => [...vectorAddDecimalLazy(['   '], ['1'])], SyntaxError);
			assert.throws(() => [...vectorAddDecimalLazy(['abc'], ['1'])], SyntaxError);
			assert.throws(() => [...vectorAddDecimalLazy(['NaN'], ['1'])], SyntaxError);
			assert.throws(() => [...vectorAddDecimalLazy(['Infinity'], ['1'])], SyntaxError);
			assert.throws(() => [...vectorAddDecimalLazy(['1.2.3'], ['1'])], SyntaxError);
			assert.throws(() => [...vectorAddDecimalLazy(['.'], ['1'])], SyntaxError);
			assert.throws(() => [...vectorAddDecimalLazy(['1e2000000'], ['1'])], RangeError);
		});
	});

	describe('lazy consumption and streaming behavior', () => {
		it('pulls elements strictly one pair at a time on demand', () => {
			let pulledA = 0;
			let pulledB = 0;

			function* trackedA() {
				for (const v of ['1.1', '2.2', '3.3', '4.4']) {
					pulledA += 1;
					yield v;
				}
			}

			function* trackedB() {
				for (const v of ['0.9', '0.8', '0.7', '0.6']) {
					pulledB += 1;
					yield v;
				}
			}

			const stream = vectorAddDecimalLazy(trackedA(), trackedB(), 10);

			// Calling the function must not pull any elements yet.
			assert.equal(pulledA, 0);
			assert.equal(pulledB, 0);

			assert.deepEqual(stream.next(), { value: '2', done: false });
			assert.equal(pulledA, 1);
			assert.equal(pulledB, 1);

			assert.deepEqual(stream.next(), { value: '3', done: false });
			assert.equal(pulledA, 2);
			assert.equal(pulledB, 2);

			// Stopping early leaves remaining elements unconsumed.
			stream.return();
			assert.equal(pulledA, 2);
			assert.equal(pulledB, 2);
		});

		it('supports infinite generators and closes both iterators on early exit', () => {
			let closedA = false;
			let closedB = false;

			function* naturals() {
				try {
					let n = 1n;
					while (true) {
						yield `${n}.25`;
						n += 1n;
					}
				} finally {
					closedA = true;
				}
			}

			function* tenths() {
				try {
					let n = 1n;
					while (true) {
						yield `${n * 10n}.75`;
						n += 1n;
					}
				} finally {
					closedB = true;
				}
			}

			const results = [];
			for (const sum of vectorAddDecimalLazy(naturals(), tenths(), 4)) {
				results.push(sum);
				if (results.length === 4) {
					break;
				}
			}

			assert.deepEqual(results, ['12', '23', '34', '45']);
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});
	});

	describe('algebraic property cross-checks', () => {
		const vecA = [
			'12345678901234567890.1234567890123456789012345',
			'-0.0000000000000000000000005',
			'999999999999999999999999999999',
			'-42.75',
			'0',
		];
		const vecB = [
			'-2345678901234567890.8765432109876543210987655',
			'1.0000000000000000000000005',
			'0.000000000000000000000000000001',
			'100.125',
			'-17.375',
		];
		const vecC = [
			'55555555555555555555.0000000000000000000000001',
			'-0.5',
			'-999999999999999999999999999999.000000000000000000000000000001',
			'-57.375',
			'17.375',
		];

		it('satisfies commutativity: a + b === b + a across precisions', () => {
			for (const precision of [0, 2, 10, 40]) {
				const ab = [...vectorAddDecimalLazy(vecA, vecB, precision)];
				const ba = [...vectorAddDecimalLazy(vecB, vecA, precision)];
				assert.deepEqual(ab, ba);
			}
		});

		it('satisfies associativity: (a + b) + c === a + (b + c) with lazy generator chaining', () => {
			const precision = 40;
			const left = [
				...vectorAddDecimalLazy(
					vectorAddDecimalLazy(vecA, vecB, precision),
					vecC,
					precision
				),
			];
			const right = [
				...vectorAddDecimalLazy(
					vecA,
					vectorAddDecimalLazy(vecB, vecC, precision),
					precision
				),
			];
			assert.deepEqual(left, right);
		});

		it('satisfies additive identity and additive inverse properties', () => {
			const zeros = vecA.map(() => '0');
			const negated = vecA.map((x) => {
				if (x === '0') return '0';
				return x.startsWith('-') ? x.slice(1) : `-${x}`;
			});

			assert.deepEqual([...vectorAddDecimalLazy(vecA, zeros, 40)], vecA);
			assert.deepEqual([...vectorAddDecimalLazy(vecA, negated, 40)], zeros);
		});

		it('matches independent fixed-scale BigInt oracle on multi-scale vectors', () => {
			// Independent oracle scaling all values by 10^12 using pure BigInt arithmetic.
			const SCALE = 12;
			const toScaledBigInt = (s) => {
				const neg = s.startsWith('-');
				const body = neg ? s.slice(1) : s;
				const [i, f = ''] = body.split('.');
				const raw = BigInt(i + f.padEnd(SCALE, '0'));
				return neg ? -raw : raw;
			};

			const left = ['123456789012345.000000000001', '-98765.432109876543', '0.100000000005'];
			const right = ['876543210987654.999999999999', '98765.432109876544', '-0.300000000005'];
			const actual = [...vectorAddDecimalLazy(left, right, SCALE)];

			const actualScaled = actual.map(toScaledBigInt);
			const expectedScaled = left.map((v, i) => toScaledBigInt(v) + toScaledBigInt(right[i]));
			assert.deepEqual(actualScaled, expectedScaled);
		});
	});
});
