export function add(a, b) {
	return a + b
}

export function cylindricalToCartesian(r, theta, z) {
	return [r * Math.cos(theta), r * Math.sin(theta), z]
}
