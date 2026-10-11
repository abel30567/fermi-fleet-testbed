export function add(a, b) {
	return a + b
}

export function scalarMultiply(k, v) {
	if (typeof k !== 'number' || Number.isNaN(k)) {
		throw new TypeError('k must be a number')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('v must be an array')
	}
	return v.map((x) => k * x)
}
