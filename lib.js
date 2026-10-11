export function add(a, b) {
	return a + b
}

export function outerProduct(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('outerProduct requires two arrays')
	}
	return a.map((ai) => b.map((bj) => ai * bj))
}
