import { Lexer, type Token, TokenType } from "./lexer.js";
import * as AST from "./ast.js";

export class Parser {
    private tokens: Token[];
    private pos = 0;
    private input: string;

    constructor(tokens: Token[], input: string = "") {
        this.tokens = tokens;
        this.input = input;
    }

    private peek(): Token {
        return this.tokens[this.pos];
    }

    private advance(): Token {
        return this.tokens[this.pos++];
    }

    private match(type: TokenType): boolean {
        if (this.peek().type === type) {
            this.advance();
            return true;
        }
        return false;
    }

    private expect(type: TokenType, message: string): Token {
        const token = this.peek();
        if (token.type === type) {
            return this.advance();
        }
        throw new Error(`${message} at ${token.line}:${token.col}, found ${TokenType[token.type]} ("${token.value}")`);
    }

    public parse(): AST.Program {
        const body: (AST.ImportDeclaration | AST.TopLevelDeclaration)[] = [];
        while (this.peek().type !== TokenType.EOF) {
            body.push(this.parseTopLevel());
        }
        return { type: "Program", body };
    }

    private parseModifiers(): string[] {
        const modifiers: string[] = [];
        const modifierTokens = [
            TokenType.Pub,
            TokenType.Extern, TokenType.Export, TokenType.Packed,
            TokenType.Align, TokenType.NoAlias, TokenType.CallConv,
            TokenType.ThreadLocal
        ];
        while (modifierTokens.includes(this.peek().type)) {
            const mod = this.advance();
            let value = mod.value;
            if (mod.type === TokenType.Align || mod.type === TokenType.CallConv) {
                this.expect(TokenType.ParenOpen, `Expected '(' after ${mod.value}`);
                value += "(" + this.parseExpression().raw + ")"; // Simplified
                this.expect(TokenType.ParenClose, `Expected ')' after ${mod.value}`);
            }
            modifiers.push(value);
        }
        return modifiers;
    }

    private parseTopLevel(): AST.ImportDeclaration | AST.TopLevelDeclaration {
        const modifiers = this.parseModifiers();
        const token = this.peek();
        if (token.type === TokenType.Import) {
            return this.parseImport();
        }
        if (token.type === TokenType.Fn) {
            const fn = this.parseFunction();
            fn.modifiers = modifiers;
            return fn;
        }
        if (token.type === TokenType.Struct) {
            const s = this.parseStruct();
            s.modifiers = modifiers;
            return s;
        }
        if (token.type === TokenType.Enum) {
            const e = this.parseEnum();
            e.modifiers = modifiers;
            return e;
        }
        if (token.type === TokenType.Union) {
            const u = this.parseUnion();
            u.modifiers = modifiers;
            return u;
        }
        if (token.type === TokenType.Trait) {
            return this.parseTrait();
        }
        if (token.type === TokenType.Impl) {
            return this.parseImpl();
        }
        if (token.type === TokenType.Macro) {
            return this.parseMacro();
        }
        throw new Error(`Unexpected token in top level: ${TokenType[token.type]} at ${token.line}:${token.col}`);
    }

    private parseImport(): AST.ImportDeclaration {
        this.expect(TokenType.Import, "Expected 'import'");
        let module = this.expect(TokenType.Identifier, "Expected module name").value;
        while (this.match(TokenType.Dot)) {
            module += "." + this.expect(TokenType.Identifier, "Expected identifier after '.'").value;
        }
        return { type: "ImportDeclaration", module };
    }

    private parseFunction(): AST.FunctionDeclaration {
        this.expect(TokenType.Fn, "Expected 'fn'");
        const name = this.expect(TokenType.Identifier, "Expected function name").value;

        const genericParams: string[] = [];
        if (this.match(TokenType.Less)) {
            do {
                genericParams.push(this.expect(TokenType.Identifier, "Expected generic parameter name").value);
            } while (this.match(TokenType.Comma));
            this.expect(TokenType.Greater, "Expected '>'");
        }

        this.expect(TokenType.Equals, "Expected '='");
        this.expect(TokenType.ParenOpen, "Expected '('");
        const params: AST.Parameter[] = [];
        if (this.peek().type !== TokenType.ParenClose) {
            do {
                let isComptime = false;
                if (this.match(TokenType.Comptime)) {
                    isComptime = true;
                }
                const pName = this.expect(TokenType.Identifier, "Expected parameter name").value;
                this.expect(TokenType.Colon, "Expected ':'");
                const pType = this.parseType();
                params.push({ name: pName, type: pType, isComptime });
            } while (this.match(TokenType.Comma));
        }
        this.expect(TokenType.ParenClose, "Expected ')'");

        let returnType: AST.Type | undefined;
        if (this.match(TokenType.Colon)) {
            returnType = this.parseType();
        }

        this.expect(TokenType.Arrow, "Expected '=>'");
        const body = this.parseBlockOrExpression();

        return { type: "FunctionDeclaration", name, genericParams: genericParams.length > 0 ? genericParams : undefined, params, returnType, body };
    }

    private parseType(): AST.Type {
        let isOptional = false;
        if (this.match(TokenType.Question)) {
            isOptional = true;
        }
        let prefix = "";
        if (this.match(TokenType.Bang)) {
            prefix = "!";
        }
        if (this.match(TokenType.Star)) {
            prefix = "*";
            if (this.match(TokenType.Const)) {
                prefix += "const ";
            }
        } else if (this.match(TokenType.BracketOpen)) {
            prefix = "[";
            while (this.peek().type !== TokenType.BracketClose && this.peek().type !== TokenType.EOF) {
                prefix += this.advance().value;
            }
            this.expect(TokenType.BracketClose, "Expected ']'");
            prefix += "]";
            if (this.match(TokenType.Const)) {
                prefix += "const ";
            }
        }
        let name = "";
        if (this.peek().type === TokenType.Self) {
            name = this.advance().value;
        } else {
            name = this.expect(TokenType.Identifier, "Expected type name").value;
            while (this.match(TokenType.Dot)) {
                name += "." + this.expect(TokenType.Identifier, "Expected identifier after '.'").value;
            }
        }
        name = prefix + name;

        const genericArgs: AST.Type[] = [];
        if (this.match(TokenType.Less)) {
            do {
                genericArgs.push(this.parseType());
            } while (this.match(TokenType.Comma));
            this.expect(TokenType.Greater, "Expected '>'");
        }

        return { name, genericArgs: genericArgs.length > 0 ? genericArgs : undefined, isOptional };
    }

    private parseBlockOrExpression(): AST.Block | AST.Expression {
        if (this.peek().type === TokenType.BraceOpen) {
            return this.parseBlock();
        }
        return this.parseExpression();
    }

    private parseBlock(): AST.Block {
        this.expect(TokenType.BraceOpen, "Expected '{'");
        const statements: AST.Statement[] = [];
        let lastExpression: AST.Expression | undefined;

        const statementOnlyTypes = ["VariableDeclaration", "ReturnStatement", "RequireStatement", "DeferStatement", "ForStatement", "WhileStatement", "Assignment", "RawZigBlock"];
        while (this.peek().type !== TokenType.BraceClose && this.peek().type !== TokenType.EOF) {
            const stmt = this.parseStatement();
            this.match(TokenType.Semicolon);
            if (this.peek().type === TokenType.BraceClose && !statementOnlyTypes.includes(stmt.type)) {
                lastExpression = stmt as AST.Expression;
            } else {
                statements.push(stmt);
            }
        }
        this.expect(TokenType.BraceClose, "Expected '}'");
        return { type: "Block", statements, lastExpression };
    }

    private parseStatement(): AST.Statement {
        const modifiers = this.parseModifiers();
        const token = this.peek();
        if (token.type === TokenType.Zig) {
            this.advance();
            const openBrace = this.expect(TokenType.BraceOpen, "Expected '{' after 'zig'");
            let braceCount = 1;
            const startPos = openBrace.pos + 1;
            let endPos = startPos;

            while (braceCount > 0 && this.peek().type !== TokenType.EOF) {
                const t = this.advance();
                if (t.type === TokenType.BraceOpen) braceCount++;
                if (t.type === TokenType.BraceClose) braceCount--;
                if (braceCount === 0) {
                    endPos = t.pos;
                }
            }
            const code = this.input.substring(startPos, endPos);
            return { type: "RawZigBlock", code } as AST.RawZigBlock;
        }
        if (token.type === TokenType.Require) {
            this.advance();
            const target = this.expect(TokenType.Identifier, "Expected target identifier").value;
            this.expect(TokenType.Colon, "Expected ':'");
            const trait = this.expect(TokenType.Identifier, "Expected trait name").value;
            this.match(TokenType.Semicolon);
            return { type: "RequireStatement", target, trait } as AST.RequireStatement;
        }
        if (token.type === TokenType.For) {
            this.advance();
            const item = this.expect(TokenType.Identifier, "Expected item name in for loop").value;
            this.expect(TokenType.In, "Expected 'in' after item name");
            const iterable = this.parseExpression(false);
            const body = this.parseBlock();
            return { type: "ForStatement", item, iterable, body } as AST.ForStatement;
        }
        if (token.type === TokenType.While) {
            this.advance();
            const test = this.parseExpression(false);
            const body = this.parseBlock();
            return { type: "WhileStatement", test, body } as AST.WhileStatement;
        }
        if (token.type === TokenType.Defer || token.type === TokenType.ErrDefer) {
            const kind = this.advance().type === TokenType.Defer ? "defer" : "errdefer";
            const body = this.parseBlockOrExpression();
            return { type: "DeferStatement", kind, body } as AST.DeferStatement;
        }
        if (token.type === TokenType.Return) {
            this.advance();
            const argument = this.peek().type !== TokenType.Semicolon && this.peek().type !== TokenType.BraceClose ? this.parseExpression() : undefined;
            this.match(TokenType.Semicolon);
            return { type: "ReturnStatement", argument } as AST.ReturnStatement;
        }
        if (token.type === TokenType.Let || token.type === TokenType.Var) {
            const kind = this.advance().type === TokenType.Let ? "let" : "var";
            const name = this.expect(TokenType.Identifier, "Expected variable name").value;
            let declaredType: AST.Type | undefined;
            if (this.match(TokenType.Colon)) {
                declaredType = this.parseType();
            }
            this.expect(TokenType.Equals, "Expected '='");
            const init = this.parseExpression();
            return { type: "VariableDeclaration", modifiers, kind, name, declaredType, init } as AST.VariableDeclaration;
        }
        const expr = this.parseExpression();
        if (this.match(TokenType.Equals)) {
            const right = this.parseExpression();
            return { type: "Assignment", left: expr, right } as AST.Assignment;
        }
        return expr;
    }

    private parseExpression(allowStructInit = true): AST.Expression {
        return this.parseBinaryExpression(0, allowStructInit);
    }

    private parseBinaryExpression(precedence: number, allowStructInit = true): AST.Expression {
        let left = this.parsePrimary(allowStructInit);

        while (true) {
            const opToken = this.peek();
            const opPrecedence = this.getPrecedence(opToken.type);
            if (opPrecedence <= precedence) break;

            this.advance();
            const right = this.parseBinaryExpression(opPrecedence, allowStructInit);
            left = {
                type: "BinaryExpression",
                left,
                operator: opToken.value,
                right
            } as AST.BinaryExpression;
        }

        return left;
    }

    private getPrecedence(type: TokenType): number {
        switch (type) {
            case TokenType.DoubleQuestion:
                return 4;
            case TokenType.EqualEqual:
            case TokenType.BangEqual:
                return 5;
            case TokenType.Less:
            case TokenType.Greater:
            case TokenType.LessEqual:
            case TokenType.GreaterEqual:
                return 7;
            case TokenType.Plus:
            case TokenType.Minus:
                return 10;
            case TokenType.Star:
            case TokenType.Slash:
            case TokenType.Percent:
                return 20;
            default:
                return 0;
        }
    }

    private parsePrimary(allowStructInit = true): AST.Expression {
        let expr: AST.Expression;
        const token = this.peek();

        if (token.type === TokenType.Identifier && this.tokens[this.pos + 1]?.type === TokenType.Bang) {
            const name = this.advance().value;
            this.advance(); // !
            this.expect(TokenType.ParenOpen, "Expected '(' after macro name!");
            const args: AST.Expression[] = [];
            if (this.peek().type !== TokenType.ParenClose) {
                do {
                    args.push(this.parseExpression());
                } while (this.match(TokenType.Comma));
            }
            this.expect(TokenType.ParenClose, "Expected ')' after macro args");
            expr = { type: "MacroInvocation", name, args } as AST.MacroInvocation;
        } else if (token.type === TokenType.Number || token.type === TokenType.String) {
            const t = this.advance();
            expr = { type: "Literal", value: t.type === TokenType.Number ? Number(t.value) : t.value, raw: t.value } as AST.Literal;
        } else if (token.type === TokenType.Identifier && token.value === "null") {
            this.advance();
            expr = { type: "Literal", value: null, raw: "null" } as AST.Literal;
        } else if (token.type === TokenType.BracketOpen) {
            const type = this.parseType();
            expr = { type: "Identifier", name: type.name } as any; // Hack: wrap type as identifier for struct init
        } else if (token.type === TokenType.Identifier || token.type === TokenType.Builtin) {
            expr = { type: "Identifier", name: this.advance().value } as AST.Identifier;
        } else if (token.type === TokenType.ParenOpen) {
            this.advance();
            expr = this.parseExpression();
            this.expect(TokenType.ParenClose, "Expected ')'");
        } else if (token.type === TokenType.If) {
            this.advance();
            const test = this.parseExpression(false);
            const consequent = this.parseBlockOrExpression();
            let alternate: AST.Block | AST.Expression | undefined;
            if (this.match(TokenType.Else)) {
                alternate = this.parseBlockOrExpression();
            }
            expr = { type: "IfExpression", test, consequent, alternate } as AST.IfExpression;
        } else if (token.type === TokenType.Match) {
            this.advance();
            const discriminant = this.parseExpression(false);
            this.expect(TokenType.BraceOpen, "Expected '{'");
            const arms: AST.MatchArm[] = [];
            while (this.peek().type !== TokenType.BraceClose) {
                const pattern = this.parseExpression();
                this.expect(TokenType.Arrow, "Expected '=>'");
                const body = this.parseBlockOrExpression();
                arms.push({ pattern, body });
                this.match(TokenType.Comma);
            }
            this.expect(TokenType.BraceClose, "Expected '}'");
            expr = { type: "MatchExpression", discriminant, arms } as AST.MatchExpression;
        } else if (token.type === TokenType.Ampersand || token.type === TokenType.Minus || token.type === TokenType.Bang) {
            const op = this.advance().value;
            expr = { type: "UnaryExpression", operator: op, argument: this.parsePrimary(allowStructInit) } as AST.UnaryExpression;
        } else if (token.type === TokenType.BraceOpen) {
            expr = this.parseBlock();
        } else if (token.type === TokenType.Dot && this.tokens[this.pos + 1]?.type === TokenType.BraceOpen) {
            this.advance(); // .
            this.advance(); // {
            const elements: AST.Expression[] = [];
            if (this.peek().type !== TokenType.BraceClose) {
                do {
                    elements.push(this.parseExpression());
                } while (this.match(TokenType.Comma));
            }
            this.expect(TokenType.BraceClose, "Expected '}'");
            expr = { type: "AnonymousStruct", elements } as AST.AnonymousStruct;
        } else {
            throw new Error(`Unexpected token in expression: ${TokenType[token.type]} at ${token.line}:${token.col}`);
        }

        while (true) {
            if (this.match(TokenType.Dot)) {
                const property = this.expect(TokenType.Identifier, "Expected property name");
                expr = {
                    type: "MemberExpression",
                    object: expr,
                    property: { type: "Identifier", name: property.value }
                } as AST.MemberExpression;
            } else if (this.match(TokenType.ParenOpen)) {
                const args: AST.Expression[] = [];
                if (this.peek().type !== TokenType.ParenClose) {
                    do {
                        args.push(this.parseExpression());
                    } while (this.match(TokenType.Comma));
                }
                this.expect(TokenType.ParenClose, "Expected ')'");
                expr = {
                    type: "CallExpression",
                    callee: expr,
                    args
                } as AST.CallExpression;
            } else if (this.peek().type === TokenType.Less && [TokenType.Identifier, TokenType.BracketOpen, TokenType.Star, TokenType.Self].includes(this.tokens[this.pos+1]?.type)) {
                this.advance();
                const genericArgs: AST.Type[] = [];
                do {
                    genericArgs.push(this.parseType());
                } while (this.match(TokenType.Comma));
                this.expect(TokenType.Greater, "Expected '>'");

                expr = {
                    type: "GenericInstantiation",
                    target: expr,
                    args: genericArgs
                } as AST.GenericInstantiation;
            } else if (allowStructInit && this.match(TokenType.BraceOpen)) {
                const fields: { name?: string, value: AST.Expression }[] = [];
                while (this.peek().type !== TokenType.BraceClose) {
                    if (this.peek().type === TokenType.Identifier && this.tokens[this.pos + 1]?.type === TokenType.Colon) {
                        const fName = this.advance().value;
                        this.advance(); // :
                        const fValue = this.parseExpression();
                        fields.push({ name: fName, value: fValue });
                    } else {
                        const fValue = this.parseExpression();
                        fields.push({ value: fValue });
                    }
                    this.match(TokenType.Comma);
                }
                this.expect(TokenType.BraceClose, "Expected '}'");
                expr = { type: "StructInitialization", target: expr, fields } as AST.StructInitialization;
            } else if (this.match(TokenType.BracketOpen)) {
                const index = this.parseExpression();
                this.expect(TokenType.BracketClose, "Expected ']' after index");
                expr = { type: "IndexExpression", object: expr, index } as AST.IndexExpression;
            } else if (this.match(TokenType.Catch)) {
                let errorName: string | undefined;
                if (this.peek().type === TokenType.Identifier && this.tokens[this.pos + 1]?.type === TokenType.Arrow) {
                    errorName = this.advance().value;
                    this.advance(); // =>
                }
                const right = this.parseBlockOrExpression();
                expr = { type: "CatchExpression", left: expr, errorName, right } as AST.CatchExpression;
            } else if (this.match(TokenType.Question)) {
                expr = {
                    type: "UnaryExpression",
                    operator: "?",
                    argument: expr
                } as AST.UnaryExpression;
            } else {
                break;
            }
        }

        return expr;
    }

    private parseStruct(): AST.StructDeclaration {
        this.expect(TokenType.Struct, "Expected 'struct'");
        const name = this.expect(TokenType.Identifier, "Expected struct name").value;

        const genericParams: string[] = [];
        if (this.match(TokenType.Less)) {
            do {
                genericParams.push(this.expect(TokenType.Identifier, "Expected generic parameter name").value);
            } while (this.match(TokenType.Comma));
            this.expect(TokenType.Greater, "Expected '>'");
        }

        this.expect(TokenType.BraceOpen, "Expected '{'");
        const fields: AST.Field[] = [];
        while (this.peek().type !== TokenType.BraceClose) {
            const fName = this.expect(TokenType.Identifier, "Expected field name").value;
            this.expect(TokenType.Colon, "Expected ':'");
            const fType = this.parseType();
            fields.push({ name: fName, type: fType });
            this.match(TokenType.Comma);
        }
        this.expect(TokenType.BraceClose, "Expected '}'");
        return { type: "StructDeclaration", name, genericParams: genericParams.length > 0 ? genericParams : undefined, fields };
    }

    private parseEnum(): AST.EnumDeclaration {
        this.expect(TokenType.Enum, "Expected 'enum'");
        const name = this.expect(TokenType.Identifier, "Expected enum name").value;
        this.expect(TokenType.BraceOpen, "Expected '{'");
        const variants: string[] = [];
        while (this.peek().type !== TokenType.BraceClose) {
            variants.push(this.expect(TokenType.Identifier, "Expected variant name").value);
            this.match(TokenType.Comma);
        }
        this.expect(TokenType.BraceClose, "Expected '}'");
        return { type: "EnumDeclaration", name, variants };
    }

    private parseUnion(): AST.UnionDeclaration {
        this.expect(TokenType.Union, "Expected 'union'");
        const name = this.expect(TokenType.Identifier, "Expected union name").value;
        this.expect(TokenType.BraceOpen, "Expected '{'");
        const variants: AST.UnionVariant[] = [];
        while (this.peek().type !== TokenType.BraceClose) {
            const vName = this.expect(TokenType.Identifier, "Expected variant name").value;
            let payload: AST.Type | undefined;
            if (this.match(TokenType.ParenOpen)) {
                payload = this.parseType();
                this.expect(TokenType.ParenClose, "Expected ')'");
            }
            variants.push({ name: vName, payload });
            this.match(TokenType.Comma);
        }
        this.expect(TokenType.BraceClose, "Expected '}'");
        return { type: "UnionDeclaration", name, variants };
    }

    private parseTrait(): AST.TraitDeclaration {
        this.expect(TokenType.Trait, "Expected 'trait'");
        const name = this.expect(TokenType.Identifier, "Expected trait name").value;
        this.expect(TokenType.BraceOpen, "Expected '{'");
        const methods: AST.TraitMethod[] = [];
        while (this.peek().type !== TokenType.BraceClose) {
            this.expect(TokenType.Fn, "Expected 'fn'");
            const mName = this.expect(TokenType.Identifier, "Expected method name").value;
            this.expect(TokenType.ParenOpen, "Expected '('");
            const params: AST.Parameter[] = [];
            if (this.peek().type !== TokenType.ParenClose) {
                do {
                    const pName = this.expect(TokenType.Identifier, "Expected parameter name").value;
                    this.expect(TokenType.Colon, "Expected ':'");
                    const pType = this.parseType();
                    params.push({ name: pName, type: pType });
                } while (this.match(TokenType.Comma));
            }
            this.expect(TokenType.ParenClose, "Expected ')'");
            this.expect(TokenType.Colon, "Expected ':'");
            const returnType = this.parseType();
            methods.push({ name: mName, params, returnType });
            this.match(TokenType.Semicolon);
        }
        this.expect(TokenType.BraceClose, "Expected '}'");
        return { type: "TraitDeclaration", name, methods };
    }

    private parseMacro(): AST.MacroDeclaration {
        this.expect(TokenType.Macro, "Expected 'macro'");
        const name = this.expect(TokenType.Identifier, "Expected macro name").value;
        this.expect(TokenType.Equals, "Expected '='");
        this.expect(TokenType.ParenOpen, "Expected '('");
        const params: string[] = [];
        if (this.peek().type !== TokenType.ParenClose) {
            do {
                params.push(this.expect(TokenType.Identifier, "Expected parameter name").value);
            } while (this.match(TokenType.Comma));
        }
        this.expect(TokenType.ParenClose, "Expected ')'");
        this.expect(TokenType.Arrow, "Expected '=>'");
        const body = this.parseBlockOrExpression();
        return { type: "MacroDeclaration", name, params, body };
    }

    private parseImpl(): AST.TraitImplementation {
        this.expect(TokenType.Impl, "Expected 'impl'");
        const traitName = this.expect(TokenType.Identifier, "Expected trait name").value;
        this.expect(TokenType.For, "Expected 'for'");
        const targetType = this.parseType();
        this.expect(TokenType.BraceOpen, "Expected '{'");
        const methods: AST.FunctionDeclaration[] = [];
        while (this.peek().type !== TokenType.BraceClose) {
            methods.push(this.parseFunction());
        }
        this.expect(TokenType.BraceClose, "Expected '}'");
        return { type: "TraitImplementation", traitName, targetType, methods };
    }
}
