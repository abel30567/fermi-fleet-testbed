export function add(a, b) {
	return a + b
}

export function sphericalToCartesian(rho, theta, phi) {
	const x = rho * Math.sin(phi) * Math.cos(theta)
	const y = rho * Math.sin(phi) * Math.sin(theta)
	const z = rho * Math.cos(phi)
	return [x, y, z]
}
