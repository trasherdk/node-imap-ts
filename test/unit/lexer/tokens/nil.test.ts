import { NilToken } from "../../../../src/lexer/tokens/nil";
import { TokenTypes } from "../../../../src/lexer/types";

describe("NilToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const value = "NIL";

		// Act
		const token = new NilToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.nil);
	});

	test("True value is converted to null", () => {
		// Arrange
		const token = new NilToken("NIL");

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBeNull();
	});
});
