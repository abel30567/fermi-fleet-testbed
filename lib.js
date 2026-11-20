export function add(a, b) {
	return a + b
}

export function lerpVec(a, b, t) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Vectors a and b must be arrays')
	}
	if (a.length !== b.length) {
		throw new RangeError('Vectors a and b must have equal length')
	}
	if (typeof t !== 'number' || Number.isNaN(t)) {
		throw new TypeError('Parameter t must be a valid number')
	}
	const result = new Array(a.length)
	for (let i = 0; i < a.length; i++) {
		result[i] = t === 1 ? b[i] : a[i] + (b[i] - a[i]) * t
	}
	return result
}
