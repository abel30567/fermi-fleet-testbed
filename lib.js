export function add(a, b) {
	return a + b
}

export function sphericalJacobian(rho, phi) {
	return rho ** 2 * Math.sin(phi)
}
