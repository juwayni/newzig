import { Lexer, type Token, TokenType } from "./lexer.js";
import * as AST from "./ast.js";

export class Parser {
    private tokens: Token[];
    private pos = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
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

    private parseTopLevel(): AST.ImportDeclaration | AST.TopLevelDeclaration {
        const token = this.peek();
        if (token.type === TokenType.Import) {
            return this.parseImport();
        }
        if (token.type === TokenType.Fn) {
            return this.parseFunction();
        }
        if (token.type === TokenType.Struct) {
            return this.parseStruct();
        }
        if (token.type === TokenType.Enum) {
            return this.parseEnum();
        }
        if (token.type === TokenType.Union) {
            return this.parseUnion();
        }
        if (token.type === TokenType.Trait) {
            return this.parseTrait();
        }
        if (token.type === TokenType.Impl) {
            return this.parseImpl();
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

        return { type: "FunctionDeclaration", name, params, returnType, body };
    }

    private parseType(): AST.Type {
        let prefix = "";
        if (this.match(TokenType.Star)) {
            prefix = "*";
            if (this.match(TokenType.Const)) {
                prefix += "const ";
            }
        } else if (this.match(TokenType.BracketOpen)) {
            prefix = "[";
            if (this.peek().type === TokenType.Number) {
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
        if (this.match(TokenType.AngleOpen)) {
            do {
                genericArgs.push(this.parseType());
            } while (this.match(TokenType.Comma));
            this.expect(TokenType.AngleClose, "Expected '>'");
        }

        let isOptional = false;
        if (this.match(TokenType.Question)) {
            isOptional = true;
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

        while (this.peek().type !== TokenType.BraceClose && this.peek().type !== TokenType.EOF) {
            const stmt = this.parseStatement();
            if (this.peek().type === TokenType.BraceClose && (stmt.type !== "VariableDeclaration" && stmt.type !== "ReturnStatement")) {
                lastExpression = stmt as AST.Expression;
            } else {
                statements.push(stmt);
            }
        }
        this.expect(TokenType.BraceClose, "Expected '}'");
        return { type: "Block", statements, lastExpression };
    }

    private parseStatement(): AST.Statement {
        const token = this.peek();
        if (token.type === TokenType.Require) {
            this.advance();
            const target = this.expect(TokenType.Identifier, "Expected target identifier").value;
            this.expect(TokenType.Colon, "Expected ':'");
            const trait = this.expect(TokenType.Identifier, "Expected trait name").value;
            this.match(TokenType.Semicolon);
            return { type: "RequireStatement", target, trait } as AST.RequireStatement;
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
            return { type: "VariableDeclaration", kind, name, declaredType, init } as AST.VariableDeclaration;
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
            case TokenType.Plus:
            case TokenType.Minus:
                return 10;
            case TokenType.Star:
            case TokenType.Slash:
                return 20;
            default:
                return 0;
        }
    }

    private parsePrimary(allowStructInit = true): AST.Expression {
        let expr: AST.Expression;
        const token = this.peek();

        if (token.type === TokenType.Number || token.type === TokenType.String) {
            const t = this.advance();
            expr = { type: "Literal", value: t.type === TokenType.Number ? Number(t.value) : t.value, raw: t.value } as AST.Literal;
        } else if (allowStructInit && token.type === TokenType.Identifier && this.tokens[this.pos + 1]?.type === TokenType.BraceOpen) {
            const target = { type: "Identifier", name: this.advance().value } as AST.Identifier;
            this.expect(TokenType.BraceOpen, "Expected '{'");
            const fields: { name: string, value: AST.Expression }[] = [];
            while (this.peek().type !== TokenType.BraceClose) {
                const fName = this.expect(TokenType.Identifier, "Expected field name").value;
                this.expect(TokenType.Colon, "Expected ':'");
                const fValue = this.parseExpression();
                fields.push({ name: fName, value: fValue });
                this.match(TokenType.Comma);
            }
            this.expect(TokenType.BraceClose, "Expected '}'");
            expr = { type: "StructInitialization", target, fields } as AST.StructInitialization;
        } else if (token.type === TokenType.Identifier || token.type === TokenType.Builtin) {
            expr = { type: "Identifier", name: this.advance().value } as AST.Identifier;
        } else if (token.type === TokenType.ParenOpen) {
            this.advance();
            expr = this.parseExpression();
            this.expect(TokenType.ParenClose, "Expected ')'");
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
        } else if (token.type === TokenType.Ampersand) {
            this.advance();
            expr = { type: "UnaryExpression", operator: "&", argument: this.parsePrimary(allowStructInit) } as AST.UnaryExpression;
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
            } else if (this.match(TokenType.AngleOpen)) {
                const genericArgs: AST.Type[] = [];
                do {
                    genericArgs.push(this.parseType());
                } while (this.match(TokenType.Comma));
                this.expect(TokenType.AngleClose, "Expected '>'");

                expr = {
                    type: "GenericInstantiation",
                    target: expr,
                    args: genericArgs
                } as AST.GenericInstantiation;
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
        return { type: "StructDeclaration", name, fields };
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
