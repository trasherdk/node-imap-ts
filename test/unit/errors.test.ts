import {
	IMAPError,
	InvalidParsedDataError,
	NotImplementedError,
	TokenizationError,
} from "../../src/errors";

describe("IMAPError", () => {
	test("Initialize with just a message", () => {
		//Arrange
		const msg = "A test error";

		//Act
		const err = new IMAPError(msg);

		//Assert
		expect(err.message).toBe(msg);
		expect(err.wrappedError).toBeUndefined();
	});

	test("Initialize with just a wrapped error", () => {
		//Arrange
		const innerErr = new Error("A test inner error");

		//Act
		const err = new IMAPError(innerErr);

		//Assert
		expect(err.wrappedError).toBe(innerErr);
		expect(err.message).toBe(innerErr.message);
	});

	test("Initialize with a message and wrapped error", () => {
		//Arrange
		const msg = "Outer error message";
		const innerError = new Error("Inner error message");

		//Act
		const err = new IMAPError(msg, innerError);

		//Assert
		expect(err.message).toBe(msg);
		expect(err.wrappedError).toBe(innerError);
	});
});

describe("InvalidParsedDataError", () => {
	test("Initializes correctly", () => {
		//Arrange
		const expected = ["1", "2"];
		const actual = ["1", "2", "3"];

		//Act
		const err = new InvalidParsedDataError(expected, actual);

		//Assert
		expect(err.message).toBe("Invalid parsed data");
		expect(err.expected).toBe(expected);
		expect(err.actual).toBe(actual);
	});

	describe(".toString()", () => {
		test("Shows expected and actual when actual is string", () => {
			//Arrange
			const expected = [];
			const actual = "['test']";
			const err = new InvalidParsedDataError(expected, actual);

			//Act
			const result = err.toString();

			//Assert
			expect(result).toContain("Invalid parsed data");
			expect(result).toContain("Expected: []");
			expect(result).toContain("Actual: ['test']");
		});

		test("Shows expected and actual when actual is array", () => {
			//Arrange
			const expected = [];
			const actual = ["test"];
			const err = new InvalidParsedDataError(expected, actual);

			//Act
			const result = err.toString();

			//Assert
			expect(result).toContain("Invalid parsed data");
			expect(result).toContain("Expected: []");
			expect(result).toContain("Actual: [test]");
		});
	});
});

describe("NotImplementedError", () => {
	test("Initializes correctly", () => {
		//Arrange
		const what = "TestFunction";

		//Act
		const err = new NotImplementedError(what);

		//Assert
		expect(err.message).toContain(`"${what}" has not been implemented`);
	});
});

describe("TokenizationError", () => {
	test("Initializes correctly", () => {
		//Arrange
		const msg = "A test tokenization error";
		const input = "to tokenize";

		//Act
		const err = new TokenizationError(msg, input);

		//Assert
		expect(err.message).toBe(msg);
		expect(err.input).toBe(input);
	});

	describe(".toString()", () => {
		test("Shows input", () => {
			//Arrange
			const msg = "A test tokenization error";
			const input = "to tokenize";
			const err = new TokenizationError(msg, input);

			//Act
			const result = err.toString();

			//Assert
			expect(result).toContain(msg);
			expect(result).toContain(`Input: ${input}`);
		});
	});
});
