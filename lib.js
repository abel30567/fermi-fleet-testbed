export function add(a, b) {
	return a + b
}

export function polarToCartesian(r, theta) {
	return [r * Math.cos(theta), r * Math.sin(theta)]
}
