export enum TokenType {
    Fn, Let, Var, Import, Struct, Enum, Union, Match, If, Else, Return, Trait, Impl, For, Comptime, Self, Require, Const,
    Defer, ErrDefer,
    Identifier, Number, String, Builtin,
    Equals, Arrow, BraceOpen, BraceClose, ParenOpen, ParenClose,
    AngleOpen, AngleClose, Question, Dot, Comma, Colon, Semicolon, Ampersand,
    BracketOpen, BracketClose,
    Plus, Minus, Star, Slash,
    EOF
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    col: number;
}

export class Lexer {
    private pos = 0;
    private line = 1;
    private col = 1;

    constructor(private input: string) {}

    private peek() {
        return this.input[this.pos] || "";
    }

    private advance() {
        const char = this.peek();
        this.pos++;
        if (char === "\n") {
            this.line++;
            this.col = 1;
        } else {
            this.col++;
        }
        return char;
    }

    public tokenize(): Token[] {
        const tokens: Token[] = [];
        while (this.pos < this.input.length) {
            const char = this.peek();
            if (/\s/.test(char)) {
                this.advance();
                continue;
            }

            if (char === "/" && this.input[this.pos + 1] === "/") {
                while (this.peek() !== "\n" && this.pos < this.input.length) {
                    this.advance();
                }
                continue;
            }

            if (char === "@") {
                tokens.push(this.readBuiltin());
                continue;
            }

            if (/[a-zA-Z_]/.test(char)) {
                tokens.push(this.readIdentifier());
                continue;
            }

            if (/[0-9]/.test(char)) {
                tokens.push(this.readNumber());
                continue;
            }

            if (char === '"') {
                tokens.push(this.readString());
                continue;
            }

            const token = this.readSymbol();
            if (token) {
                tokens.push(token);
                continue;
            }

            throw new Error(`Unexpected character: ${char} at ${this.line}:${this.col}`);
        }
        tokens.push({ type: TokenType.EOF, value: "", line: this.line, col: this.col });
        return tokens;
    }

    private readBuiltin(): Token {
        const startLine = this.line;
        const startCol = this.col;
        let value = this.advance(); // @
        while (/[a-zA-Z0-9_]/.test(this.peek())) {
            value += this.advance();
        }
        return { type: TokenType.Builtin, value, line: startLine, col: startCol };
    }

    private readIdentifier(): Token {
        let value = "";
        const startLine = this.line;
        const startCol = this.col;
        while (/[a-zA-Z0-9_]/.test(this.peek())) {
            value += this.advance();
        }

        const keywords: Record<string, TokenType> = {
            "fn": TokenType.Fn,
            "let": TokenType.Let,
            "var": TokenType.Var,
            "import": TokenType.Import,
            "struct": TokenType.Struct,
            "enum": TokenType.Enum,
            "union": TokenType.Union,
            "match": TokenType.Match,
            "if": TokenType.If,
            "else": TokenType.Else,
            "return": TokenType.Return,
            "trait": TokenType.Trait,
            "impl": TokenType.Impl,
            "for": TokenType.For,
            "comptime": TokenType.Comptime,
            "Self": TokenType.Self,
            "require": TokenType.Require,
            "const": TokenType.Const,
            "defer": TokenType.Defer,
            "errdefer": TokenType.ErrDefer,
        };

        if (value in keywords) {
            return { type: keywords[value], value, line: startLine, col: startCol };
        }
        return { type: TokenType.Identifier, value, line: startLine, col: startCol };
    }

    private readNumber(): Token {
        let value = "";
        const startLine = this.line;
        const startCol = this.col;
        while (/[0-9]/.test(this.peek())) {
            value += this.advance();
        }
        if (this.peek() === ".") {
            value += this.advance();
            while (/[0-9]/.test(this.peek())) {
                value += this.advance();
            }
        }
        return { type: TokenType.Number, value, line: startLine, col: startCol };
    }

    private readString(): Token {
        let value = "";
        const startLine = this.line;
        const startCol = this.col;
        this.advance(); // quote
        while (this.peek() !== '"' && this.pos < this.input.length) {
            value += this.advance();
        }
        this.advance(); // quote
        return { type: TokenType.String, value, line: startLine, col: startCol };
    }

    private readSymbol(): Token | null {
        const startLine = this.line;
        const startCol = this.col;
        const char = this.advance();
        const next = this.peek();

        if (char === "=" && next === ">") {
            this.advance();
            return { type: TokenType.Arrow, value: "=>", line: startLine, col: startCol };
        }
        if (char === "=") return { type: TokenType.Equals, value: "=", line: startLine, col: startCol };
        if (char === "{") return { type: TokenType.BraceOpen, value: "{", line: startLine, col: startCol };
        if (char === "}") return { type: TokenType.BraceClose, value: "}", line: startLine, col: startCol };
        if (char === "(") return { type: TokenType.ParenOpen, value: "(", line: startLine, col: startCol };
        if (char === ")") return { type: TokenType.ParenClose, value: ")", line: startLine, col: startCol };
        if (char === "<") return { type: TokenType.AngleOpen, value: "<", line: startLine, col: startCol };
        if (char === ">") return { type: TokenType.AngleClose, value: ">", line: startLine, col: startCol };
        if (char === "?") return { type: TokenType.Question, value: "?", line: startLine, col: startCol };
        if (char === ".") return { type: TokenType.Dot, value: ".", line: startLine, col: startCol };
        if (char === ",") return { type: TokenType.Comma, value: ",", line: startLine, col: startCol };
        if (char === ":") return { type: TokenType.Colon, value: ":", line: startLine, col: startCol };
        if (char === ";") return { type: TokenType.Semicolon, value: ";", line: startLine, col: startCol };
        if (char === "&") return { type: TokenType.Ampersand, value: "&", line: startLine, col: startCol };
        if (char === "[") return { type: TokenType.BracketOpen, value: "[", line: startLine, col: startCol };
        if (char === "]") return { type: TokenType.BracketClose, value: "]", line: startLine, col: startCol };
        if (char === "+") return { type: TokenType.Plus, value: "+", line: startLine, col: startCol };
        if (char === "-") return { type: TokenType.Minus, value: "-", line: startLine, col: startCol };
        if (char === "*") return { type: TokenType.Star, value: "*", line: startLine, col: startCol };
        if (char === "/") return { type: TokenType.Slash, value: "/", line: startLine, col: startCol };

        return null;
    }
}
