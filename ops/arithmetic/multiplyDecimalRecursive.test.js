import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyDecimalRecursive } from './multiplyDecimalRecursive.js';

/**
 * Independent BigInt-based decimal multiplication oracle for cross-checking.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [precision]
 * @returns {string}
 */
function referenceBigIntMultiply(a, b, precision) {
	const parse = (s) => {
		let neg = false;
		let body = s;
		if (body.startsWith('-')) {
			neg = true;
			body = body.slice(1);
		} else if (body.startsWith('+')) {
			body = body.slice(1);
		}
		const dot = body.indexOf('.');
		const intPart = dot === -1 ? body : body.slice(0, dot);
		const fracPart = dot === -1 ? '' : body.slice(dot + 1);
		return {
			neg,
			value: BigInt((intPart + fracPart) || '0'),
			scale: fracPart.length,
		};
	};

	const pa = parse(a);
	const pb = parse(b);
	const prod = pa.value * pb.value;
	const totalScale = pa.scale + pb.scale;
	const neg = pa.neg !== pb.neg;

	if (prod === 0n) {
		if (precision === undefined || precision === 0) return '0';
		return `0.${'0'.repeat(precision)}`;
	}

	if (precision === undefined) {
		const str = prod.toString();
		const sign = neg ? '-' : '';
		if (totalScale === 0) return sign + str;
		const padded = str.padStart(totalScale + 1, '0');
		const intPart = padded.slice(0, padded.length - totalScale);
		const fracPart = padded.slice(padded.length - totalScale).replace(/0+$/, '');
		return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
	}

	let scaled;
	if (precision >= totalScale) {
		scaled = prod * 10n ** BigInt(precision - totalScale);
	} else {
		const drop = BigInt(totalScale - precision);
		const divisor = 10n ** drop;
		const half = divisor / 2n;
		const quotient = prod / divisor;
		const remainder = prod % divisor;
		// Round half away from zero: check first dropped digit >= 5 <=> remainder >= half
		scaled = remainder >= half ? quotient + 1n : quotient;
	}

	if (scaled === 0n) {
		return precision === 0 ? '0' : `0.${'0'.repeat(precision)}`;
	}

	const sign = neg ? '-' : '';
	const str = scaled.toString();
	if (precision === 0) return sign + str;
	const padded = str.padStart(precision + 1, '0');
	const intPart = padded.slice(0, padded.length - precision);
	const fracPart = padded.slice(padded.length - precision);
	return `${sign}${intPart}.${fracPart}`;
}

describe('multiplyDecimalRecursive', () => {
	describe('normal cases', () => {
		it('multiplies integers with all sign combinations', () => {
			assert.equal(multiplyDecimalRecursive('6', '7'), '42');
			assert.equal(multiplyDecimalRecursive('-6', '7'), '-42');
			assert.equal(multiplyDecimalRecursive('6', '-7'), '-42');
			assert.equal(multiplyDecimalRecursive('-6', '-7'), '42');
			assert.equal(multiplyDecimalRecursive('+12', '+34'), '408');
		});

		it('multiplies decimals without IEEE-754 floating-point drift', () => {
			assert.equal(multiplyDecimalRecursive('0.1', '0.2'), '0.02');
			assert.equal(multiplyDecimalRecursive('0.3', '0.6'), '0.18');
			assert.equal(multiplyDecimalRecursive('12.34', '56.78'), '700.6652');
			assert.equal(multiplyDecimalRecursive('-1.25', '0.8'), '-1');
			assert.equal(multiplyDecimalRecursive('2.5', '4'), '10');
		});

		it('accepts leading zeros and shorthand decimal forms', () => {
			assert.equal(multiplyDecimalRecursive('00012.3400', '00.500'), '6.17');
			assert.equal(multiplyDecimalRecursive('.5', '.5'), '0.25');
			assert.equal(multiplyDecimalRecursive('5.', '2.'), '10');
			assert.equal(multiplyDecimalRecursive('-.25', '+.4'), '-0.1');
		});

		it('handles arbitrary-precision numbers above the Karatsuba threshold', () => {
			assert.equal(
				multiplyDecimalRecursive('123456789012345678901234567890', '987654321098765432109876543210'),
				'121932631137021795226185032733622923332237463801111263526900'
			);
			assert.equal(
				multiplyDecimalRecursive(
					'3.141592653589793238462643383279',
					'2.718281828459045235360287471352'
				),
				'8.539734222673567065463550869543126215972716558040325068323208'
			);
		});

		it('handles highly unbalanced operand lengths', () => {
			const big = '9'.repeat(120) + '.' + '1'.repeat(40);
			assert.equal(
				multiplyDecimalRecursive(big, '2'),
				referenceBigIntMultiply(big, '2')
			);
			assert.equal(
				multiplyDecimalRecursive('2', big),
				referenceBigIntMultiply('2', big)
			);
			assert.equal(
				multiplyDecimalRecursive(big, '123456789012.345'),
				referenceBigIntMultiply(big, '123456789012.345')
			);
		});
	});

	describe('configurable precision', () => {
		it('rounds half away from zero for positive and negative products', () => {
			assert.equal(multiplyDecimalRecursive('1.25', '1.25', 2), '1.56'); // 1.5625
			assert.equal(multiplyDecimalRecursive('1.25', '1.26', 2), '1.58'); // 1.575
			assert.equal(multiplyDecimalRecursive('-1.25', '1.26', 2), '-1.58'); // -1.575
			assert.equal(multiplyDecimalRecursive('1.5', '1', 0), '2');
			assert.equal(multiplyDecimalRecursive('-1.5', '1', 0), '-2');
			assert.equal(multiplyDecimalRecursive('1.49999999999', '1', 0), '1');
		});

		it('propagates rounding carries across nines', () => {
			assert.equal(multiplyDecimalRecursive('9.995', '1', 2), '10.00');
			assert.equal(multiplyDecimalRecursive('99.9999999999', '1', 3), '100.000');
			assert.equal(multiplyDecimalRecursive('0.999', '1', 0), '1');
			assert.equal(multiplyDecimalRecursive('-0.999', '1', 0), '-1');
		});

		it('pads trailing zeros when precision exceeds exact scale', () => {
			assert.equal(multiplyDecimalRecursive('1.5', '2', 3), '3.000');
			assert.equal(multiplyDecimalRecursive('0.1', '0.2', 5), '0.02000');
			assert.equal(multiplyDecimalRecursive('12', '3', 2), '36.00');
			assert.equal(multiplyDecimalRecursive('-7', '8', 0), '-56');
		});

		it('normalizes negative zero when tiny negative products round to zero', () => {
			assert.equal(multiplyDecimalRecursive('-0.001', '0.001', 2), '0.00');
			assert.equal(multiplyDecimalRecursive('-0.001', '0.001', 0), '0');
			assert.equal(multiplyDecimalRecursive('-0.004', '1', 2), '0.00');
			assert.equal(multiplyDecimalRecursive('-0.005', '1', 2), '-0.01');
		});
	});

	describe('edge cases', () => {
		it('handles zero operands without producing negative zero', () => {
			assert.equal(multiplyDecimalRecursive('0', '0'), '0');
			assert.equal(multiplyDecimalRecursive('-0', '12345.6789'), '0');
			assert.equal(multiplyDecimalRecursive('12345.6789', '-0.000'), '0');
			assert.equal(multiplyDecimalRecursive('-0.000', '-99999999999999999999'), '0');
			assert.equal(multiplyDecimalRecursive('-0', '5', 0), '0');
			assert.equal(multiplyDecimalRecursive('-0', '5', 4), '0.0000');
		});

		it('handles identity elements and very small magnitudes', () => {
			assert.equal(multiplyDecimalRecursive('1', '98765432109876543210.0123456789'), '98765432109876543210.0123456789');
			assert.equal(multiplyDecimalRecursive('-1', '-42.5'), '42.5');
			assert.equal(
				multiplyDecimalRecursive('0.00000000000000000001', '0.00000000000000000001'),
				'0.0000000000000000000000000000000000000001'
			);
		});

		it('handles digit lengths around Karatsuba split boundaries cleanly', () => {
			for (let len = 1; len <= 25; len++) {
				const a = '9'.repeat(len);
				const b = '8'.repeat(len);
				assert.equal(
					multiplyDecimalRecursive(a, b),
					referenceBigIntMultiply(a, b),
					`mismatch at length ${len}`
				);
			}
		});

		it('satisfies algebraic identities at large precision', () => {
			// (10^n - 1) * (10^n + 1) = 10^(2n) - 1 = 9 repeated 2n times
			const n = 100;
			const a = '9'.repeat(n);
			const b = '1' + '0'.repeat(n - 1) + '1';
			assert.equal(multiplyDecimalRecursive(a, b), '9'.repeat(2 * n));

			// Commutativity and associativity
			const x = '-123456789012345.6789';
			const y = '98765432109876.54321';
			const z = '-0.00000012345678901234';
			assert.equal(multiplyDecimalRecursive(x, y), multiplyDecimalRecursive(y, x));
			assert.equal(
				multiplyDecimalRecursive(multiplyDecimalRecursive(x, y), z),
				multiplyDecimalRecursive(x, multiplyDecimalRecursive(y, z))
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-string operands', () => {
			const invalidTypes = [123, null, undefined, {}, [], true, 10n];
			for (const bad of invalidTypes) {
				assert.throws(() => multiplyDecimalRecursive(bad, '1'), TypeError);
				assert.throws(() => multiplyDecimalRecursive('1', bad), TypeError);
			}
		});

		it('throws RangeError for malformed decimal strings', () => {
			const malformed = [
				'',
				'   ',
				'abc',
				'.',
				'+',
				'-',
				'+.',
				'-.',
				'1.2.3',
				'1e5',
				'1E-5',
				'1_000',
				'1,000',
				' 1.5',
				'1.5 ',
				'NaN',
				'Infinity',
				'--1',
				'++1',
			];
			for (const bad of malformed) {
				assert.throws(() => multiplyDecimalRecursive(bad, '2'), RangeError, `expected RangeError for "${bad}"`);
				assert.throws(() => multiplyDecimalRecursive('2', bad), RangeError, `expected RangeError for "${bad}"`);
			}
		});

		it('validates the optional precision argument', () => {
			for (const badType of ['2', null, true, {}, [], 2n]) {
				assert.throws(() => multiplyDecimalRecursive('1', '2', badType), TypeError);
			}
			for (const badValue of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => multiplyDecimalRecursive('1', '2', badValue), RangeError);
			}
		});
	});

	describe('independent BigInt cross-check', () => {
		it('matches BigInt reference across deterministic pseudo-random large decimals and precisions', () => {
			// Deterministic LCG PRNG
			let seed = 0x12345678;
			const nextUint = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
				return seed;
			};
			const makeDecimal = (intLen, fracLen, allowNeg) => {
				let s = allowNeg && (nextUint() & 1) ? '-' : '';
				for (let i = 0; i < intLen; i++) {
					s += String(nextUint() % 10);
				}
				if (fracLen > 0) {
					s += '.';
					for (let i = 0; i < fracLen; i++) {
						s += String(nextUint() % 10);
					}
				}
				return s;
			};

			const precisions = [undefined, 0, 1, 5, 20, 60];
			for (let trial = 0; trial < 40; trial++) {
				const intA = 1 + (nextUint() % 80);
				const fracA = nextUint() % 40;
				const intB = 1 + (nextUint() % 80);
				const fracB = nextUint() % 40;
				const a = makeDecimal(intA, fracA, true);
				const b = makeDecimal(intB, fracB, true);

				for (const prec of precisions) {
					const actual = multiplyDecimalRecursive(a, b, prec);
					const expected = referenceBigIntMultiply(a, b, prec);
					assert.equal(actual, expected, `trial=${trial} prec=${prec} a=${a} b=${b}`);
				}
			}
		});
	});
});
