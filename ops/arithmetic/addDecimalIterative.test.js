import test from 'node:test';
import assert from 'node:assert/strict';
import { addDecimalIterative } from './addDecimalIterative.js';

/**
 * Independent reference implementation using BigInt scaled integer arithmetic
 * to cross-check the iterative digit-by-digit implementation.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [precision]
 * @returns {string}
 */
function addDecimalBigIntReference(a, b, precision) {
	function toScaled(s) {
		let sign = 1n;
		let body = s;
		if (body.startsWith('-')) {
			sign = -1n;
			body = body.slice(1);
		} else if (body.startsWith('+')) {
			body = body.slice(1);
		}
		const dot = body.indexOf('.');
		const intStr = dot === -1 ? body : body.slice(0, dot);
		const fracStr = dot === -1 ? '' : body.slice(dot + 1);
		const digits = (intStr || '0') + fracStr;
		return { value: sign * BigInt(digits), scale: fracStr.length };
	}

	const pa = toScaled(a);
	const pb = toScaled(b);
	const scale = Math.max(pa.scale, pb.scale);
	const scaledA = pa.value * 10n ** BigInt(scale - pa.scale);
	const scaledB = pb.value * 10n ** BigInt(scale - pb.scale);
	let sum = scaledA + scaledB;

	if (precision === undefined) {
		if (sum === 0n) return '0';
		const neg = sum < 0n;
		const absStr = (neg ? -sum : sum).toString().padStart(scale + 1, '0');
		if (scale === 0) return (neg ? '-' : '') + absStr.replace(/^0+(?=\d)/, '');
		const intPart = absStr.slice(0, absStr.length - scale).replace(/^0+(?=\d)/, '');
		const fracPart = absStr.slice(absStr.length - scale).replace(/0+$/, '');
		const prefix = neg ? '-' : '';
		return fracPart.length > 0 ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`;
	}

	let rounded;
	if (precision >= scale) {
		rounded = sum * 10n ** BigInt(precision - scale);
	} else {
		const diff = BigInt(scale - precision);
		const factor = 10n ** diff;
		const half = factor / 2n;
		const neg = sum < 0n;
		const absSum = neg ? -sum : sum;
		const quotient = absSum / factor;
		const remainder = absSum % factor;
		const absRounded = remainder >= half ? quotient + 1n : quotient;
		rounded = neg ? -absRounded : absRounded;
	}

	if (rounded === 0n) {
		return precision > 0 ? `0.${'0'.repeat(precision)}` : '0';
	}
	const neg = rounded < 0n;
	const absStr = (neg ? -rounded : rounded).toString().padStart(precision + 1, '0');
	const prefix = neg ? '-' : '';
	if (precision === 0) {
		return `${prefix}${absStr.replace(/^0+(?=\d)/, '')}`;
	}
	const intPart = absStr.slice(0, absStr.length - precision).replace(/^0+(?=\d)/, '');
	const fracPart = absStr.slice(absStr.length - precision);
	return `${prefix}${intPart}.${fracPart}`;
}

test('normal decimal addition (exact)', () => {
	assert.equal(addDecimalIterative('0.1', '0.2'), '0.3');
	assert.equal(addDecimalIterative('12.34', '56.78'), '69.12');
	assert.equal(addDecimalIterative('100', '250'), '350');
	assert.equal(addDecimalIterative('1.5', '2.5'), '4');
	assert.equal(addDecimalIterative('0.14', '0.28'), '0.42');
	assert.equal(addDecimalIterative('123.456', '0.004'), '123.46');
});

test('signed addition and subtraction via opposite signs', () => {
	assert.equal(addDecimalIterative('-1.5', '-2.25'), '-3.75');
	assert.equal(addDecimalIterative('5.5', '-2.25'), '3.25');
	assert.equal(addDecimalIterative('-5.5', '2.25'), '-3.25');
	assert.equal(addDecimalIterative('2.25', '-5.5'), '-3.25');
	assert.equal(addDecimalIterative('-2.25', '5.5'), '3.25');
	assert.equal(addDecimalIterative('+10.5', '+20.5'), '31');
	assert.equal(addDecimalIterative('+4.2', '-4.2'), '0');
	assert.equal(addDecimalIterative('-4.2', '+4.2'), '0');
});

test('configurable precision: rounding, padding, and zero precision', () => {
	assert.equal(addDecimalIterative('1.1', '2.1', 2), '3.20');
	assert.equal(addDecimalIterative('1.234', '2.345', 2), '3.58');
	assert.equal(addDecimalIterative('1.234', '2.341', 2), '3.58');
	assert.equal(addDecimalIterative('1.234', '2.340', 2), '3.57');
	assert.equal(addDecimalIterative('9.995', '0', 2), '10.00');
	assert.equal(addDecimalIterative('99.999', '0.001', 2), '100.00');
	assert.equal(addDecimalIterative('0.095', '0', 2), '0.10');
	assert.equal(addDecimalIterative('0.5', '0', 0), '1');
	assert.equal(addDecimalIterative('-0.5', '0', 0), '-1');
	assert.equal(addDecimalIterative('0.499999', '0', 0), '0');
	assert.equal(addDecimalIterative('-0.499999', '0', 0), '0');
	assert.equal(addDecimalIterative('-0.004', '0', 2), '0.00');
	assert.equal(addDecimalIterative('-0.005', '0', 2), '-0.01');
	assert.equal(addDecimalIterative('1', '2', 5), '3.00000');
	assert.equal(addDecimalIterative('1.5', '2.5', 0), '4');
});

test('edge cases: zeros, leading/trailing zeros, shorthand decimals', () => {
	assert.equal(addDecimalIterative('0', '0'), '0');
	assert.equal(addDecimalIterative('-0', '-0'), '0');
	assert.equal(addDecimalIterative('-0.000', '0.000'), '0');
	assert.equal(addDecimalIterative('-0.000', '0.000', 3), '0.000');
	assert.equal(addDecimalIterative('.5', '.5'), '1');
	assert.equal(addDecimalIterative('-.5', '-.25'), '-0.75');
	assert.equal(addDecimalIterative('5.', '2.'), '7');
	assert.equal(addDecimalIterative('000123.45000', '0000.55000'), '124');
	assert.equal(addDecimalIterative('0.0000001', '0.0000009'), '0.000001');
	assert.equal(addDecimalIterative('1', '-0.9999999999'), '0.0000000001');
});

test('high-precision (>53-bit) values and long carry/borrow chains', () => {
	assert.equal(
		addDecimalIterative('9007199254740992', '1'),
		'9007199254740993'
	);
	assert.equal(
		addDecimalIterative('9007199254740993.12345678901234567890', '0.87654321098765432110'),
		'9007199254740994'
	);

	// 100-digit integer + 50-digit fractional carry cascade across all 9s
	const allNines = `${'9'.repeat(100)}.${'9'.repeat(50)}`;
	const tiny = `0.${'0'.repeat(49)}1`;
	assert.equal(addDecimalIterative(allNines, tiny), `1${'0'.repeat(100)}`);

	// 100-digit borrow cascade across all 0s
	const powerOfTen = `1${'0'.repeat(100)}`;
	assert.equal(addDecimalIterative(powerOfTen, `-${tiny}`), allNines);

	// High-precision rounding carry cascade
	assert.equal(
		addDecimalIterative(`9${'9'.repeat(60)}.${'9'.repeat(40)}`, `0.${'0'.repeat(39)}5`, 39),
		`10${'0'.repeat(60)}.${'0'.repeat(39)}`
	);
});

test('invalid inputs throw TypeError or RangeError', () => {
	// Non-string operands -> TypeError
	for (const bad of [123, null, undefined, {}, [], true, 10n, NaN, Infinity]) {
		assert.throws(() => addDecimalIterative(bad, '1'), TypeError);
		assert.throws(() => addDecimalIterative('1', bad), TypeError);
	}

	// Malformed decimal strings -> RangeError
	for (const bad of [
		'',
		' ',
		'.',
		'+',
		'-',
		'+.',
		'-.',
		'1.2.3',
		'1e5',
		'1E-5',
		'Infinity',
		'-Infinity',
		'NaN',
		'0x10',
		'1_000',
		'1,000',
		' 1.2',
		'1.2 ',
		'abc',
		'--1',
		'++1',
		'+-1'
	]) {
		assert.throws(() => addDecimalIterative(bad, '1'), RangeError);
		assert.throws(() => addDecimalIterative('1', bad), RangeError);
	}

	// Invalid precision types -> TypeError
	for (const bad of [null, '2', true, {}, [], 2n]) {
		assert.throws(() => addDecimalIterative('1', '2', bad), TypeError);
	}

	// Invalid precision numeric values -> RangeError
	for (const bad of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => addDecimalIterative('1', '2', bad), RangeError);
	}
});

test('independent BigInt scaled integer arithmetic cross-check', () => {
	// Deterministic PRNG (mulberry32) for reproducible fuzzing across scales and signs
	let seed = 0x5f3759df;
	function nextRand() {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function randomDecimal(maxIntLen, maxFracLen) {
		const sign = nextRand() < 0.5 ? '-' : nextRand() < 0.15 ? '+' : '';
		const intLen = 1 + Math.floor(nextRand() * maxIntLen);
		const fracLen = Math.floor(nextRand() * (maxFracLen + 1));
		let intPart = '';
		for (let i = 0; i < intLen; i++) {
			intPart += String(Math.floor(nextRand() * 10));
		}
		if (fracLen === 0) return `${sign}${intPart}`;
		let fracPart = '';
		for (let i = 0; i < fracLen; i++) {
			fracPart += String(Math.floor(nextRand() * 10));
		}
		return `${sign}${intPart}.${fracPart}`;
	}

	const precisions = [undefined, 0, 1, 2, 5, 12, 30, 60];
	for (let i = 0; i < 150; i++) {
		const a = randomDecimal(40, 40);
		const b = randomDecimal(40, 40);
		for (const p of precisions) {
			const actual = addDecimalIterative(a, b, p);
			const expected = addDecimalBigIntReference(a, b, p);
			assert.equal(actual, expected, `Mismatch for (${a}, ${b}, ${p})`);
		}
		// Commutativity check
		assert.equal(addDecimalIterative(a, b), addDecimalIterative(b, a));
	}
});
