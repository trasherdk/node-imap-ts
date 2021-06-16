import { AtomToken } from "../../../../src/lexer/tokens/atom";
import { TokenTypes } from "../../../../src/lexer/types";

describe("AtomToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const value = "Capability";

		// Act
		const token = new AtomToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.atom);
	});

	test("True value is equal to the given value", () => {
		// Arrange
		const value = "testing";
		const token = new AtomToken(value);

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBe(value);
	});
});
