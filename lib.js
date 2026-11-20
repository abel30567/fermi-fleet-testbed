export function add(a, b) {
	return a + b
}

export function simpson1D(f, a, b, n = 100) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('a and b must be finite numbers')
	}
	if (!Number.isInteger(n) || n <= 0) {
		throw new RangeError('n must be a positive integer')
	}
	const steps = n % 2 === 0 ? n : n + 1
	if (a === b) {
		return 0
	}
	const h = (b - a) / steps
	let oddSum = 0
	let evenSum = 0
	for (let i = 1; i < steps; i++) {
		const x = a + i * h
		if (i % 2 === 1) {
			oddSum += f(x)
		} else {
			evenSum += f(x)
		}
	}
	return (h / 3) * (f(a) + f(b) + 4 * oddSum + 2 * evenSum)
}
