import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractDecimalRecursive } from './subtractDecimalRecursive.js';

/**
 * Independent BigInt-based decimal subtraction oracle for cross-checking.
 * Converts decimal strings directly into scaled BigInts, subtracts using
 * native BigInt arithmetic, and rounds half-away-from-zero when `precision`
 * is specified.
 *
 * @param {string} a
 * @param {string} b
 * @param {number | undefined} precision
 * @returns {string}
 */
function bigIntOracle(a, b, precision) {
	const parse = (s) => {
		const neg = s.startsWith('-');
		const body = s.replace(/^[+-]/, '');
		const [i = '', f = ''] = body.split('.');
		const digits = (i || '0') + f;
		const val = BigInt(digits) * (neg ? -1n : 1n);
		return { val, scale: f.length };
	};

	const pa = parse(a);
	const pb = parse(b);
	const scale = Math.max(pa.scale, pb.scale);
	const scaledA = pa.val * 10n ** BigInt(scale - pa.scale);
	const scaledB = pb.val * 10n ** BigInt(scale - pb.scale);
	let diff = scaledA - scaledB;

	const neg = diff < 0n;
	let abs = neg ? -diff : diff;

	let outScale = scale;
	if (precision !== undefined) {
		if (precision < scale) {
			const shift = BigInt(scale - precision);
			const divisor = 10n ** shift;
			const quotient = abs / divisor;
			const remainder = abs % divisor;
			const half = 5n * 10n ** (shift - 1n);
			abs = remainder >= half ? quotient + 1n : quotient;
			outScale = precision;
		} else if (precision > scale) {
			abs = abs * 10n ** BigInt(precision - scale);
			outScale = precision;
		}
	}

	const isZero = abs === 0n;
	const str = abs.toString().padStart(outScale + 1, '0');
	const intPart = outScale === 0 ? str : str.slice(0, str.length - outScale);
	let fracPart = outScale === 0 ? '' : str.slice(str.length - outScale);

	if (precision === undefined) {
		fracPart = fracPart.replace(/0+$/, '');
	}

	const signPrefix = neg && !isZero ? '-' : '';
	return fracPart.length > 0 ? `${signPrefix}${intPart}.${fracPart}` : `${signPrefix}${intPart}`;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible fuzz tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generates a random decimal string using the supplied PRNG.
 *
 * @param {() => number} rand
 * @returns {string}
 */
function randomDecimal(rand) {
	const signRoll = rand();
	const sign = signRoll < 0.45 ? '-' : signRoll < 0.55 ? '+' : '';
	const intLen = Math.floor(rand() * 80) + 1;
	const hasFrac = rand() < 0.8;
	const fracLen = hasFrac ? Math.floor(rand() * 80) + 1 : 0;

	let intStr = '';
	for (let i = 0; i < intLen; i++) {
		intStr += Math.floor(rand() * 10);
	}
	if (!hasFrac) {
		return sign + intStr;
	}
	let fracStr = '';
	for (let i = 0; i < fracLen; i++) {
		fracStr += Math.floor(rand() * 10);
	}
	return `${sign}${intStr}.${fracStr}`;
}

describe('subtractDecimalRecursive', () => {
	describe('normal cases', () => {
		it('subtracts positive integers and decimals', () => {
			assert.equal(subtractDecimalRecursive('10', '3'), '7');
			assert.equal(subtractDecimalRecursive('3', '10'), '-7');
			assert.equal(subtractDecimalRecursive('0.3', '0.1'), '0.2');
			assert.equal(subtractDecimalRecursive('123.456', '23.456'), '100');
			assert.equal(subtractDecimalRecursive('100.5', '0.75'), '99.75');
		});

		it('handles all sign combinations accurately', () => {
			assert.equal(subtractDecimalRecursive('5.25', '-2.75'), '8');
			assert.equal(subtractDecimalRecursive('-5.25', '2.75'), '-8');
			assert.equal(subtractDecimalRecursive('-5.25', '-2.75'), '-2.5');
			assert.equal(subtractDecimalRecursive('-2.75', '-5.25'), '2.5');
			assert.equal(subtractDecimalRecursive('+12.5', '+7.25'), '5.25');
			assert.equal(subtractDecimalRecursive('+12.5', '-7.25'), '19.75');
		});

		it('handles mismatched fractional scales and leading/trailing zeros', () => {
			assert.equal(subtractDecimalRecursive('00042.5000', '00.250'), '42.25');
			assert.equal(subtractDecimalRecursive('1000', '0.0001'), '999.9999');
			assert.equal(subtractDecimalRecursive('.5', '.25'), '0.25');
			assert.equal(subtractDecimalRecursive('5.', '.5'), '4.5');
			assert.equal(subtractDecimalRecursive('-.5', '-.75'), '0.25');
		});

		it('handles configurable precision with half-away-from-zero rounding', () => {
			assert.equal(subtractDecimalRecursive('1.236', '0.001', 2), '1.24');
			assert.equal(subtractDecimalRecursive('1.234', '0.001', 2), '1.23');
			assert.equal(subtractDecimalRecursive('-1.236', '-0.001', 2), '-1.24');
			assert.equal(subtractDecimalRecursive('-1.234', '-0.001', 2), '-1.23');
			assert.equal(subtractDecimalRecursive('1.5', '0.5', 3), '1.000');
			assert.equal(subtractDecimalRecursive('2.7', '0.2', 0), '3');
			assert.equal(subtractDecimalRecursive('-2.7', '-0.2', 0), '-3');
			assert.equal(subtractDecimalRecursive('2.6', '0.2', 0), '2');
		});
	});

	describe('edge cases', () => {
		it('normalizes positive and negative zeros without emitting "-0"', () => {
			assert.equal(subtractDecimalRecursive('0', '0'), '0');
			assert.equal(subtractDecimalRecursive('-0', '0'), '0');
			assert.equal(subtractDecimalRecursive('0', '-0'), '0');
			assert.equal(subtractDecimalRecursive('-0.000', '+0.00'), '0');
			assert.equal(subtractDecimalRecursive('42.123', '42.123'), '0');
			assert.equal(subtractDecimalRecursive('-42.123', '-42.123'), '0');
			assert.equal(subtractDecimalRecursive('0', '0', 3), '0.000');
			assert.equal(subtractDecimalRecursive('0', '0', 0), '0');
			assert.equal(subtractDecimalRecursive('0.001', '0.004', 2), '0.00');
			assert.equal(subtractDecimalRecursive('0.1', '0.4', 0), '0');
		});

		it('propagates deep borrows and carries across long digit chains', () => {
			const bigPow10 = '1' + '0'.repeat(100);
			const tinyFrac = '0.' + '0'.repeat(99) + '1';
			const expectedBorrow = '9'.repeat(100) + '.' + '9'.repeat(100);
			assert.equal(subtractDecimalRecursive(bigPow10, tinyFrac), expectedBorrow);

			const negAllNines = '-' + '9'.repeat(100) + '.' + '9'.repeat(100);
			const expectedCarry = '-' + '1' + '0'.repeat(100);
			assert.equal(subtractDecimalRecursive(negAllNines, tinyFrac), expectedCarry);
		});

		it('propagates rounding carry across integer boundary', () => {
			assert.equal(subtractDecimalRecursive('10.000', '0.001', 2), '10.00');
			assert.equal(subtractDecimalRecursive('100.0', '0.1', 0), '100');
			assert.equal(subtractDecimalRecursive('-10.000', '-0.001', 2), '-10.00');
			assert.equal(subtractDecimalRecursive('0.9999', '0.0004', 2), '1.00');
			assert.equal(subtractDecimalRecursive('-0.9999', '-0.0004', 2), '-1.00');
			assert.equal(subtractDecimalRecursive('999.999', '0.004', 2), '1000.00');
		});

		it('handles very large arbitrary-precision operands (>500 digits)', () => {
			const a = '9876543210'.repeat(60) + '.' + '1234567890'.repeat(60);
			const b = '1234567890'.repeat(60) + '.' + '9876543210'.repeat(60);
			assert.equal(subtractDecimalRecursive(a, b), bigIntOracle(a, b, undefined));
			assert.equal(subtractDecimalRecursive(a, b, 250), bigIntOracle(a, b, 250));
			assert.equal(subtractDecimalRecursive(a, b, 0), bigIntOracle(a, b, 0));
		});

		it('handles single-digit operands (recursion base case)', () => {
			assert.equal(subtractDecimalRecursive('9', '4'), '5');
			assert.equal(subtractDecimalRecursive('4', '9'), '-5');
			assert.equal(subtractDecimalRecursive('5', '-7'), '12');
			assert.equal(subtractDecimalRecursive('-5', '7'), '-12');
		});
	});

	describe('input validation', () => {
		it('throws TypeError when a or b is not a string', () => {
			const nonStrings = [123, 0, NaN, 10n, null, undefined, true, {}, []];
			for (const bad of nonStrings) {
				assert.throws(() => subtractDecimalRecursive(bad, '1'), TypeError);
				assert.throws(() => subtractDecimalRecursive('1', bad), TypeError);
			}
		});

		it('throws RangeError when a or b is not a valid decimal string', () => {
			const invalidStrings = [
				'',
				'   ',
				' 1.5',
				'1.5 ',
				'.',
				'+',
				'-',
				'+.',
				'-.',
				'1.2.3',
				'1e5',
				'1E-5',
				'NaN',
				'Infinity',
				'-Infinity',
				'1,000',
				'1_000',
				'abc',
				'--1',
				'++1',
			];
			for (const bad of invalidStrings) {
				assert.throws(() => subtractDecimalRecursive(bad, '1'), RangeError);
				assert.throws(() => subtractDecimalRecursive('1', bad), RangeError);
			}
		});

		it('throws TypeError or RangeError for invalid precision values', () => {
			for (const badType of [null, '2', 2n, true, {}, []]) {
				assert.throws(() => subtractDecimalRecursive('1', '2', badType), TypeError);
			}
			for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => subtractDecimalRecursive('1', '2', badRange), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent BigInt oracle across 250 randomized arbitrary-precision cases', () => {
			const rand = createPrng(0x5eed1234);
			const precisions = [undefined, 0, 1, 2, 5, 17, 40, 100];

			for (let i = 0; i < 250; i++) {
				const a = randomDecimal(rand);
				const b = randomDecimal(rand);
				const precision = precisions[i % precisions.length];
				const actual = subtractDecimalRecursive(a, b, precision);
				const expected = bigIntOracle(a, b, precision);
				assert.equal(
					actual,
					expected,
					`Mismatch on case #${i} (precision=${precision}): a=${a}, b=${b}`
				);
			}
		});

		it('satisfies algebraic identities (anti-symmetry, self-cancellation, round-trip)', () => {
			const pairs = [
				['123456789012345678901234567890.0987654321', '98765432109876543210.1234567890123456789'],
				['-0.00000000000000012345', '0.00000000000000098765'],
				['-99999999999999999999', '-1'],
				['0', '12345.6789'],
			];

			const negate = (s) => (s === '0' ? '0' : s.startsWith('-') ? s.slice(1) : `-${s}`);

			for (const [a, b] of pairs) {
				const diffAB = subtractDecimalRecursive(a, b);
				const diffBA = subtractDecimalRecursive(b, a);
				assert.equal(diffAB, negate(diffBA));
				assert.equal(subtractDecimalRecursive(a, a), '0');
				assert.equal(subtractDecimalRecursive(b, b), '0');
				// (a - b) - (-b) === a
				assert.equal(subtractDecimalRecursive(diffAB, negate(b)), subtractDecimalRecursive(a, '0'));
			}
		});

		it('matches native Number subtraction for safe integer pairs', () => {
			const rand = createPrng(0xabcdef01);
			for (let i = 0; i < 100; i++) {
				const x = Math.floor((rand() - 0.5) * 1e12);
				const y = Math.floor((rand() - 0.5) * 1e12);
				assert.equal(subtractDecimalRecursive(String(x), String(y)), String(x - y));
			}
		});
	});
});
