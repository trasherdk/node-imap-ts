import { SPToken } from "../lexer/tokens";
import { ILexerToken, TokenTypes } from "../lexer/types";

export function splitSpaceSeparatedList(
	listTokens: ILexerToken<unknown>[],
	startTokenValue = "(",
	endTokenValue = ")",
): ILexerToken<unknown>[][] {
	// Safety check to skip a null value here
	if (!listTokens) {
		return [];
	}

	const blocks: ILexerToken<unknown>[][] = [];
	let currBlock: ILexerToken<unknown>[];

	// Mark the list as started if we don't have a token marking the
	// starting point (i.e. consider us in the list already)
	let startedList = !startTokenValue;
	for (const token of listTokens) {
		// If we're at the start of the list, mark it and proceed
		if (
			!startedList &&
			token.type === TokenTypes.operator &&
			token.value === startTokenValue
		) {
			startedList = true;
			continue;
		}

		// If we're not in the list yet, move on
		if (!startedList) {
			continue;
		}

		// If we're at a space, split
		if (token instanceof SPToken) {
			currBlock = [];
			blocks.push(currBlock);
		} else if (
			endTokenValue &&
			token.type === TokenTypes.operator &&
			token.value === endTokenValue
		) {
			break;
		} else {
			// Otherwise if we haven't started a block, start one
			if (!currBlock) {
				currBlock = [];
				blocks.push(currBlock);
			}

			// ... and push our token onto the current block
			currBlock.push(token);
		}
	}

	return blocks;
}

export function getOriginalInput(tokens: ILexerToken<unknown>[]) {
	return tokens.reduce((input, token) => input + token.value, "");
}
