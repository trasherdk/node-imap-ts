import { TokenizationError } from "../../../../src/errors";
import { NumberToken } from "../../../../src/lexer/tokens/number";
import { TokenTypes } from "../../../../src/lexer/types";

jest.mock("../../../../src/errors");

describe("NumberToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const num = "1234";

		// Act
		const token = new NumberToken(num);

		// Assert
		expect(token.value).toBe(num);
		expect(token.type).toBe(TokenTypes.number);
	});

	test("Parses valid number from given string value", () => {
		// Arrange
		const token = new NumberToken("13");

		// Act
		const num = token.getTrueValue();

		// Assert
		expect(num).toBe(13);
	});

	test("Throws TokenizationError for non-numeric values", () => {
		// Arrange
		const token = new NumberToken("abc");
		const shouldThrow = () => token.getTrueValue();
		const TokenizationErrorMock = TokenizationError as jest.MockedClass<
			typeof TokenizationError
		>;

		// Act
		expect(shouldThrow)
			// Assert
			.toThrowError(TokenizationErrorMock);
		expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
			"Cannot convert",
		);
	});

	test("Throws TokenizationError for unsafe integer number", () => {
		// Arrange
		const token = new NumberToken("10000000000000000000000000000000000");
		const shouldThrow = () => token.getTrueValue();
		const TokenizationErrorMock = TokenizationError as jest.MockedClass<
			typeof TokenizationError
		>;

		// Act
		expect(shouldThrow)
			// Assert
			.toThrowError(TokenizationErrorMock);
		expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
			"higher than permitted",
		);
	});
});
