import Lexer from "../../../src/lexer/lexer";
import SimpleSpecs from "../specs/simple.spec";

describe("Lexer Simple Spec Tests", () => {
	let lexer: Lexer;
	beforeAll(() => {
		lexer = new Lexer();
	});

	test.each(SimpleSpecs)(`Simple Spec: $name`, ({ input, results }) => {
		if ("error" in results) {
			// We expect an error to be thrown during parsing
			const shouldThrow = () => {
				lexer.tokenize(input);
			};

			expect(shouldThrow).toThrowError(results.error);
		} else {
			// We expect a successful parse
			const output = lexer.tokenize(input);

			expect(output).toHaveLength(results.lexer.length);
			expect(output).toEqual(results.lexer);
		}
	});
});
