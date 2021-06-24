import Parser from "../../../src/parser";
import ParserStream from "../../../src/parser/stream";
import SimpleSpecs from "../specs/simple.spec";

jest.mock("../../../src/parser/stream");

describe("Parser Tests", () => {
	let parser: Parser;
	let stream: ParserStream;
	beforeAll(() => {
		stream = new ParserStream();
		parser = new Parser(stream);
	});

	test.each(SimpleSpecs.filter((spec) => "parser" in spec.results))(
		`Simple Spec: $name`,
		({ input, results }, done) => {
			if ("error" in results) {
				// We expect an error to be thrown during parsing
				const shouldThrow = () => {
					(parser as any).parse(input);
				};

				expect(shouldThrow).toThrowError(results.error);
			} else {
				const end = (output) => {
					try {
						expect(output).toEqual(results.parser);
						parser.removeAllListeners();
						(done as any)();
					} catch (err) {
						(done as any)(err);
					}
				};

				parser.once("tagged", end);
				parser.once("body", end);
				parser.once("untagged", end);
				parser.once("continue", end);
				parser.once("other", end);

				// We expect a successful parse, but catch in case not
				try {
					(parser as any).parse(Buffer.from(input));
				} catch (err) {
					(done as any)(err);
				}
			}
		},
	);
});
