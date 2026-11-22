import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arcsinDecimalIterative } from './arcsinDecimalIterative.js';

/**
 * Independent helper: parses a normalized decimal string into a signed BigInt
 * scaled by 10^scalePrec (rounded half away from zero).
 */
function decimalToScaled(str, scalePrec) {
	const neg = str.startsWith('-');
	const unsigned = neg || str.startsWith('+') ? str.slice(1) : str;
	const [intPart, fracPart = ''] = unsigned.split('.');
	const combined = intPart + fracPart;
	const diff = scalePrec - fracPart.length;
	let mag;
	if (diff >= 0) {
		mag = BigInt(combined) * (10n ** BigInt(diff));
	} else {
		const div = 10n ** BigInt(-diff);
		mag = (BigInt(combined) + div / 2n) / div;
	}
	return neg ? -mag : mag;
}

/**
 * Independent BigInt Taylor series for sin(y) = sum_{k=0}^\infty (-1)^k y^(2k+1) / (2k+1)!
 * Used strictly as an independent inverse cross-check in tests.
 */
function sinScaledIndependent(yScaled, scalePrec) {
	const scale = 10n ** BigInt(scalePrec);
	const y2 = (yScaled * yScaled) / scale;
	let term = yScaled;
	let sum = term;
	let k = 1n;

	while (term !== 0n) {
		term = (-term * y2) / (scale * (2n * k) * (2n * k + 1n));
		if (term === 0n) {
			break;
		}
		sum += term;
		k += 1n;
	}

	return sum;
}

function absBigInt(v) {
	return v < 0n ? -v : v;
}

describe('arcsinDecimalIterative', () => {
	describe('normal cases and high-precision constants (>20 digits)', () => {
		it('computes arcsin("0.5") = pi/6 to default (20) and 50 decimal places', () => {
			assert.equal(
				arcsinDecimalIterative('0.5'),
				'0.52359877559829887308'
			);
			assert.equal(
				arcsinDecimalIterative('0.5', 50),
				'0.52359877559829887307710723054658381403286156656252'
			);
			assert.equal(
				arcsinDecimalIterative('-0.5', 50),
				'-0.52359877559829887307710723054658381403286156656252'
			);
		});

		it('computes arcsin("1") = pi/2 and arcsin("-1") = -pi/2 to 50 decimal places', () => {
			assert.equal(
				arcsinDecimalIterative('1', 20),
				'1.57079632679489661923'
			);
			assert.equal(
				arcsinDecimalIterative('1', 50),
				'1.57079632679489661923132169163975144209858469968755'
			);
			assert.equal(
				arcsinDecimalIterative('-1', 50),
				'-1.57079632679489661923132169163975144209858469968755'
			);
		});

		it('computes arcsin(sqrt(2)/2) = pi/4 and arcsin(sqrt(3)/2) = pi/3 to 40 decimal places', () => {
			const invSqrt2 = '0.70710678118654752440084436210484903928483593768847';
			const halfSqrt3 = '0.86602540378443864676372317075293618347140262690519';

			assert.equal(
				arcsinDecimalIterative(invSqrt2, 40),
				'0.7853981633974483096156608458198757210493'
			);
			assert.equal(
				arcsinDecimalIterative(halfSqrt3, 40),
				'1.0471975511965977461542144610931676280657'
			);
		});

		it('supports leading plus sign, decimal forms without leading zero, and scientific notation', () => {
			assert.equal(arcsinDecimalIterative('+0.5', 20), '0.52359877559829887308');
			assert.equal(arcsinDecimalIterative('.5', 20), '0.52359877559829887308');
			assert.equal(arcsinDecimalIterative('5e-1', 20), '0.52359877559829887308');
			assert.equal(arcsinDecimalIterative('50E-2', 20), '0.52359877559829887308');
			assert.equal(arcsinDecimalIterative('1.', 20), '1.57079632679489661923');
			assert.equal(arcsinDecimalIterative('10e-1', 20), '1.57079632679489661923');
			assert.equal(arcsinDecimalIterative('  0.5  ', 20), '0.52359877559829887308');
		});
	});

	describe('edge cases', () => {
		it('handles zero inputs cleanly and never returns "-0"', () => {
			assert.equal(arcsinDecimalIterative('0'), '0');
			assert.equal(arcsinDecimalIterative('-0'), '0');
			assert.equal(arcsinDecimalIterative('+0.00000', 30), '0');
			assert.equal(arcsinDecimalIterative('-0.00000e-5', 20), '0');
			assert.equal(arcsinDecimalIterative('-1e-30', 20), '0');
			assert.equal(arcsinDecimalIterative('-1e-1000000000', 20), '0');
			assert.equal(arcsinDecimalIterative('1e-1000000000', 20), '0');
		});

		it('handles precision = 0 properly', () => {
			assert.equal(arcsinDecimalIterative('0', 0), '0');
			assert.equal(arcsinDecimalIterative('0.47', 0), '0');
			assert.equal(arcsinDecimalIterative('-0.47', 0), '0');
			assert.equal(arcsinDecimalIterative('0.5', 0), '1');
			assert.equal(arcsinDecimalIterative('-0.5', 0), '-1');
			assert.equal(arcsinDecimalIterative('1', 0), '2');
			assert.equal(arcsinDecimalIterative('-1', 0), '-2');
		});

		it('handles very small inputs accurately via series expansion', () => {
			// For x = 1e-10: arcsin(x) = 1e-10 + (1/6)e-30 + (3/40)e-50 + ...
			// To 40 decimal places:
			// 0.0000000001000000000000000000001666666667
			assert.equal(
				arcsinDecimalIterative('1e-10', 40),
				'0.0000000001000000000000000000001666666667'
			);
		});

		it('handles values extremely close to ±1 without cancellation or slow convergence', () => {
			// x = 1 - 1e-36: sqrt(1 - x^2) = sqrt(2e-36 - 1e-72) ≈ sqrt(2) * 1e-18
			// pi/2   = 1.57079632679489661923132169163975...
			// sqrt2  = 0.00000000000000000141421356237309...
			// diff   = 1.57079632679489661781710812926666...
			const xNear1 = '0.' + '9'.repeat(36);
			assert.equal(
				arcsinDecimalIterative(xNear1, 30),
				'1.570796326794896617817108129267'
			);
			assert.equal(
				arcsinDecimalIterative('-' + xNear1, 30),
				'-1.570796326794896617817108129267'
			);

			// x = 1 - 1e-20: sqrt(1 - x^2) ≈ sqrt(2) * 1e-10
			// arcsin(1 - 1e-20) = pi/2 - arcsin(sqrt(2e-20 - 1e-40))
			const xNear1b = '0.' + '9'.repeat(20);
			const res = arcsinDecimalIterative(xNear1b, 35);
			// Verify directly against pi/2 - sqrt(2)*1e-10 in first 25 digits:
			// pi/2    = 1.57079632679489661923132169163975144...
			// -sqrt2*1e-10 = -0.00000000014142135623730950488...
			// diff    ≈ 1.5707963266534752629940121867...
			assert.ok(res.startsWith('1.5707963266534752629940121'), `Unexpected result: ${res}`);
		});

		it('is continuous and accurate across the range-reduction and half-angle boundaries', () => {
			// Verify monotonicity across 0.25, 0.5, and sqrt(2)/2 ≈ 0.70710678
			const points = ['0.2499', '0.25', '0.2501', '0.4999', '0.5', '0.5001', '0.7071', '0.7072'];
			const values = points.map((p) => decimalToScaled(arcsinDecimalIterative(p, 35), 35));
			for (let i = 1; i < values.length; i++) {
				assert.ok(values[i] > values[i - 1], `Expected monotonic increase at index ${i}`);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-string x', () => {
			for (const bad of [0.5, 0, null, undefined, 1n, {}, [], true]) {
				assert.throws(() => arcsinDecimalIterative(bad), TypeError);
			}
		});

		it('throws TypeError for invalid decimal strings', () => {
			for (const bad of ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '1.2.3', '0.5e', '0.5e+', '--0.5', '.', '+.', '0x1']) {
				assert.throws(() => arcsinDecimalIterative(bad), TypeError);
			}
		});

		it('throws RangeError for x outside [-1, 1]', () => {
			for (const oob of [
				'1.00000000000000000000000000001',
				'-1.00000000000000000000000000001',
				'1.1',
				'-1.1',
				'2',
				'-100',
				'1e1000000',
				'-1e1000000',
			]) {
				assert.throws(() => arcsinDecimalIterative(oob), RangeError);
			}
		});

		it('throws TypeError/RangeError for invalid precision', () => {
			assert.throws(() => arcsinDecimalIterative('0.5', '20'), TypeError);
			assert.throws(() => arcsinDecimalIterative('0.5', null), TypeError);
			assert.throws(() => arcsinDecimalIterative('0.5', 20n), TypeError);

			assert.throws(() => arcsinDecimalIterative('0.5', -1), RangeError);
			assert.throws(() => arcsinDecimalIterative('0.5', 1.5), RangeError);
			assert.throws(() => arcsinDecimalIterative('0.5', Number.NaN), RangeError);
			assert.throws(() => arcsinDecimalIterative('0.5', Number.POSITIVE_INFINITY), RangeError);
			assert.throws(() => arcsinDecimalIterative('0.5', Number.MAX_SAFE_INTEGER + 1), RangeError);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies sin(arcsin(x)) = x via an independent BigInt Taylor series for sin', () => {
			const precision = 35;
			const checkPrec = 40;
			const samples = [
				'-0.99999999999999999999',
				'-0.98765432109876543210987654321',
				'-0.7072',
				'-0.7071',
				'-0.33333333333333333333333333333333333',
				'0.00012345678901234567890123456789',
				'0.25',
				'0.5',
				'0.7071',
				'0.7072',
				'0.912345678901234567890123456789',
				'0.99999999999999999999',
			];

			// Tolerance: |sin(y + err) - sin(y)| <= |err| <= 0.5 * 10^-precision
			const maxErr = 10n ** BigInt(checkPrec - precision);

			for (const x of samples) {
				const yStr = arcsinDecimalIterative(x, precision);
				const yScaled = decimalToScaled(yStr, checkPrec);
				const sinY = sinScaledIndependent(yScaled, checkPrec);
				const xScaled = decimalToScaled(x, checkPrec);
				const diff = absBigInt(sinY - xScaled);
				assert.ok(
					diff <= maxErr,
					`sin(arcsin(${x})) differed by ${diff} (limit ${maxErr})`
				);
			}
		});

		it('satisfies complementary identity arcsin(x) + arcsin(sqrt(1 - x^2)) = pi/2 on exact Pythagorean triples', () => {
			const precision = 40;
			const piHalf = decimalToScaled(arcsinDecimalIterative('1', precision), precision);

			// Exact terminating-decimal Pythagorean triples (a^2 + b^2 = 1):
			// (3/5, 4/5) = (0.6, 0.8)
			// (7/25, 24/25) = (0.28, 0.96)
			// (44/125, 117/125) = (0.352, 0.936)
			const triples = [
				['0.6', '0.8'],
				['0.28', '0.96'],
				['0.352', '0.936'],
			];

			for (const [a, b] of triples) {
				const sum =
					decimalToScaled(arcsinDecimalIterative(a, precision), precision) +
					decimalToScaled(arcsinDecimalIterative(b, precision), precision);
				assert.ok(
					absBigInt(sum - piHalf) <= 2n,
					`arcsin(${a}) + arcsin(${b}) != pi/2 (diff = ${sum - piHalf})`
				);
			}
		});

		it('satisfies double-angle identity 2 * arcsin(x) = arcsin(2*x*sqrt(1 - x^2)) for |x| <= sqrt(2)/2', () => {
			const precision = 40;
			// x = 0.6 => 2 * 0.6 * 0.8 = 0.96
			// x = 0.28 => 2 * 0.28 * 0.96 = 0.5376
			const pairs = [
				['0.6', '0.96'],
				['0.28', '0.5376'],
			];

			for (const [x, doubleSin] of pairs) {
				const lhs = 2n * decimalToScaled(arcsinDecimalIterative(x, precision), precision);
				const rhs = decimalToScaled(arcsinDecimalIterative(doubleSin, precision), precision);
				assert.ok(
					absBigInt(lhs - rhs) <= 2n,
					`2 * arcsin(${x}) != arcsin(${doubleSin}) (diff = ${lhs - rhs})`
				);
			}
		});

		it('satisfies odd symmetry arcsin(-x) = -arcsin(x)', () => {
			for (const x of ['0.1234567890123456789012345', '0.5', '0.85', '0.99999999999999999999', '1']) {
				const pos = arcsinDecimalIterative(x, 35);
				const neg = arcsinDecimalIterative('-' + x, 35);
				assert.equal(neg, '-' + pos);
			}
		});
	});
});
