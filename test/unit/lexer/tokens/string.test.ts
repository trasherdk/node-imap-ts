import {
	LiteralStringToken,
	QuotedStringToken,
} from "../../../../src/lexer/tokens/string";
import { TokenTypes } from "../../../../src/lexer/types";

describe("LiteralStringToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const value = "{4}\r\ntest";

		// Act
		const token = new LiteralStringToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.string);
	});

	test("True value extracts string contents", () => {
		// Arrange
		const token = new LiteralStringToken("{4}\r\nthis");

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBe("this");
	});
});

describe("QuotedStringToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const value = '"testing"';

		// Act
		const token = new QuotedStringToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.string);
	});

	test("True value extracts string contents", () => {
		// Arrange
		const token = new QuotedStringToken('"this"');

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBe("this");
	});
});
