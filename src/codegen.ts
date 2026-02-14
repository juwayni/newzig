import * as AST from "./ast.js";

export class CodeGenerator {
    private indentLevel = 0;
    private macros: Map<string, AST.MacroDeclaration> = new Map();

    constructor(private program: AST.Program) {
        for (const decl of program.body) {
            if (decl.type === "MacroDeclaration") {
                this.macros.set(decl.name, decl);
            }
        }
    }

    private indent() {
        return "    ".repeat(this.indentLevel);
    }

    public generate(): string {
        let code = "";
        code += this.generateImports();

        for (const decl of this.program.body) {
            if (decl.type !== "ImportDeclaration" && decl.type !== "TraitImplementation") {
                code += this.generateTopLevel(decl) + "\n";
            }
        }
        return code;
    }

    private generateImports(): string {
        const imports = this.program.body.filter(d => d.type === "ImportDeclaration") as AST.ImportDeclaration[];
        let code = "";
        const seen = new Set<string>();
        for (const imp of imports) {
            const parts = imp.module.split(".");
            const name = parts[0];
            if (seen.has(name)) continue;
            code += `const ${name} = @import("${name}");\n`;
            seen.add(name);
        }
        return code;
    }

    private generateTopLevel(decl: AST.TopLevelDeclaration): string {
        switch (decl.type) {
            case "FunctionDeclaration":
                return this.generateFunction(decl);
            case "StructDeclaration":
                return this.generateStruct(decl);
            case "EnumDeclaration":
                return this.generateEnum(decl);
            case "UnionDeclaration":
                return this.generateUnion(decl);
            case "TraitDeclaration":
                return this.generateTrait(decl);
            case "TraitImplementation":
                return this.generateImpl(decl);
            case "MacroDeclaration":
                return ""; // Macros are expanded at invocation sites
            default:
                return "";
        }
    }

    private generateModifiers(modifiers?: string[]): string {
        if (!modifiers || modifiers.length === 0) return "";
        return modifiers.join(" ") + " ";
    }

    private generateFunction(fn: AST.FunctionDeclaration): string {
        const mods = this.generateModifiers(fn.modifiers);
        const params = fn.params.map(p => `${p.isComptime ? "comptime " : ""}${p.name}: ${this.generateType(p.type)}`).join(", ");
        const isMain = fn.name === "main";
        let returnType = fn.returnType ? this.generateType(fn.returnType) : "anyerror!void";

        let fnName = fn.name;
        if (isMain) {
            fnName = "zen_main";
            returnType = "anyerror!i32";
        }

        let code = `${mods}fn ${fnName}(${params}) ${returnType} {\n`;
        this.indentLevel++;
        if (fn.body.type === "Block") {
            code += this.generateBlockBody(fn.body);
        } else {
            code += `${this.indent()}return ${this.generateExpression(fn.body)};\n`;
        }
        this.indentLevel--;
        code += `${this.indent()}}\n`;

        if (isMain) {
            code += `\npub fn main() !void {\n`;
            code += `    var gpa = std.heap.GeneralPurposeAllocator(.{}){};\n`;
            code += `    const allocator = gpa.allocator();\n`;
            code += `    _ = try zen_main(allocator);\n`;
            code += `}\n`;
        }

        return code;
    }

    private generateType(type: AST.Type): string {
        let name = type.name;
        let result = name;
        if (type.genericArgs) {
            result = `${name}(${type.genericArgs.map(a => this.generateType(a)).join(", ")})`;
        }
        if (type.isOptional) result = "?" + result;
        return result;
    }

    private generateBlockBody(block: AST.Block): string {
        let code = "";
        for (const stmt of block.statements) {
            code += this.generateStatement(stmt) + "\n";
        }
        if (block.lastExpression) {
            code += `${this.indent()}return ${this.generateExpression(block.lastExpression)};\n`;
        }
        return code;
    }

    private generateStatement(stmt: AST.Statement): string {
        switch (stmt.type) {
            case "VariableDeclaration":
                const mods = this.generateModifiers(stmt.modifiers);
                const kind = stmt.kind === "let" ? "const" : "var";
                const type = stmt.declaredType ? `: ${this.generateType(stmt.declaredType)}` : "";
                return `${this.indent()}${mods}${kind} ${stmt.name}${type} = ${this.generateExpression(stmt.init)};`;
            case "Assignment":
                return `${this.indent()}${this.generateExpression(stmt.left)} = ${this.generateExpression(stmt.right)};`;
            case "ReturnStatement":
                return `${this.indent()}return ${stmt.argument ? this.generateExpression(stmt.argument) : ""};`;
            case "Block":
                return `${this.indent()}{\n${this.generateBlockBody(stmt)}${this.indent()}}`;
            case "RequireStatement":
                return `${this.indent()}comptime ${stmt.trait}.validate(${stmt.target});`;
            case "RawZigBlock":
                return `${this.indent()}${stmt.code}`;
            case "DeferStatement":
                const body = stmt.body.type === "Block" ?
                    `{\n${this.generateBlockBody(stmt.body)}${this.indent()}}` :
                    this.generateExpression(stmt.body) + ";";
                return `${this.indent()}${stmt.kind} ${body}`;
            default:
                return `${this.indent()}_ = ${this.generateExpression(stmt as AST.Expression)};`;
        }
    }

    private generateExpression(expr: AST.Expression): string {
        switch (expr.type) {
            case "MatchExpression":
                let matchCode = `switch (${this.generateExpression(expr.discriminant)}) {\n`;
                this.indentLevel++;
                for (const arm of expr.arms) {
                    let pattern = "";
                    let capture = "";
                    if (arm.pattern.type === "CallExpression" && arm.pattern.callee.type === "Identifier") {
                        pattern = "." + arm.pattern.callee.name;
                        if (arm.pattern.args.length > 0 && arm.pattern.args[0].type === "Identifier") {
                            capture = `|${(arm.pattern.args[0] as AST.Identifier).name}|`;
                        }
                    } else if (arm.pattern.type === "Identifier" && arm.pattern.name === "else") {
                        pattern = "else";
                    } else if (arm.pattern.type === "Identifier") {
                        pattern = "." + arm.pattern.name;
                    } else {
                        pattern = this.generateExpression(arm.pattern);
                    }

                    matchCode += `${this.indent()}${pattern} => ${capture} `;
                    if (arm.body.type === "Block") {
                        matchCode += `{\n${this.generateBlockBody(arm.body)}${this.indent()}},\n`;
                    } else {
                        matchCode += `${this.generateExpression(arm.body)},\n`;
                    }
                }
                this.indentLevel--;
                matchCode += `${this.indent()}}`;
                return matchCode;
            case "Literal":
                if (typeof expr.value === "string") return `"${expr.value}"`;
                return expr.raw;
            case "Identifier":
                return expr.name;
            case "BinaryExpression":
                return `${this.generateExpression(expr.left)} ${expr.operator} ${this.generateExpression(expr.right)}`;
            case "CallExpression":
                return `${this.generateExpression(expr.callee)}(${expr.args.map(a => this.generateExpression(a)).join(", ")})`;
            case "MemberExpression":
                return `${this.generateExpression(expr.object)}.${expr.property.name}`;
            case "GenericInstantiation":
                const target = this.generateExpression(expr.target);
                const args = expr.args.map(a => this.generateType(a)).join(", ");
                return `${target}(${args})`;
            case "UnaryExpression":
                if (expr.operator === "?") {
                    return `try ${this.generateExpression(expr.argument)}`;
                }
                return `${expr.operator}${this.generateExpression(expr.argument)}`;
            case "Block":
                let code = `blk: {\n`;
                this.indentLevel++;
                for (const stmt of expr.statements) {
                    code += this.generateStatement(stmt) + "\n";
                }
                if (expr.lastExpression) {
                    code += `${this.indent()}break :blk ${this.generateExpression(expr.lastExpression)};\n`;
                }
                this.indentLevel--;
                code += `${this.indent()}}`;
                return code;
            case "AnonymousStruct":
                return `.{ ${expr.elements.map(e => this.generateExpression(e)).join(", ")} }`;
            case "MacroInvocation":
                return this.expandMacro(expr);
            case "StructInitialization":
                const sTarget = this.generateExpression(expr.target);
                const sFields = expr.fields.map(f => `.${f.name} = ${this.generateExpression(f.value)}`).join(", ");
                return `${sTarget}{ ${sFields} }`;
            default:
                return "";
        }
    }

    private generateStruct(decl: AST.StructDeclaration): string {
        const mods = this.generateModifiers(decl.modifiers);
        let code = `const ${decl.name} = ${mods}struct {\n`;
        this.indentLevel++;
        for (const field of decl.fields) {
            code += `${this.indent()}${field.name}: ${this.generateType(field.type)},\n`;
        }

        // Find implementations for this struct
        const impls = this.program.body.filter(d =>
            d.type === "TraitImplementation" &&
            (d as AST.TraitImplementation).targetType.name === decl.name
        ) as AST.TraitImplementation[];

        for (const impl of impls) {
            code += `\n${this.indent()}// Impl ${impl.traitName}\n`;
            for (const method of impl.methods) {
                // Ensure methods are public for the trait
                let methodCode = this.generateFunction(method);
                methodCode = methodCode.replace("fn ", "pub fn ");
                code += methodCode + "\n";
            }
        }

        this.indentLevel--;
        code += `};\n`;
        return code;
    }

    private generateEnum(decl: AST.EnumDeclaration): string {
        const mods = this.generateModifiers(decl.modifiers);
        let code = `const ${decl.name} = ${mods}enum {\n`;
        this.indentLevel++;
        for (const variant of decl.variants) {
            code += `${this.indent()}${variant},\n`;
        }
        this.indentLevel--;
        code += `};\n`;
        return code;
    }

    private generateUnion(decl: AST.UnionDeclaration): string {
        const mods = this.generateModifiers(decl.modifiers);
        let code = `const ${decl.name} = ${mods}union(enum) {\n`;
        this.indentLevel++;
        for (const variant of decl.variants) {
            code += `${this.indent()}${variant.name}${variant.payload ? `: ${this.generateType(variant.payload)}` : ""},\n`;
        }

        // Find implementations
        const impls = this.program.body.filter(d =>
            d.type === "TraitImplementation" &&
            (d as AST.TraitImplementation).targetType.name === decl.name
        ) as AST.TraitImplementation[];

        for (const impl of impls) {
            code += `\n${this.indent()}// Impl ${impl.traitName}\n`;
            for (const method of impl.methods) {
                let methodCode = this.generateFunction(method);
                methodCode = methodCode.replace("fn ", "pub fn ");
                code += methodCode + "\n";
            }
        }

        this.indentLevel--;
        code += `};\n`;
        return code;
    }

    private generateTrait(decl: AST.TraitDeclaration): string {
        let code = `const ${decl.name} = struct {\n`;
        this.indentLevel++;
        code += `${this.indent()}pub fn validate(comptime T: type) void {\n`;
        this.indentLevel++;
        for (const method of decl.methods) {
            code += `${this.indent()}if (!@hasDecl(T, "${method.name}")) @compileError("Type " ++ @typeName(T) ++ " does not implement ${method.name}");\n`;
        }
        this.indentLevel--;
        code += `${this.indent()}}\n`;
        this.indentLevel--;
        code += `};\n`;
        return code;
    }

    private generateImpl(decl: AST.TraitImplementation): string {
        // Handled in generateStruct/generateUnion for Zen types.
        // For other types, we might need another strategy.
        return "";
    }

    private expandMacro(invoc: AST.MacroInvocation): string {
        const macro = this.macros.get(invoc.name);
        if (!macro) throw new Error(`Undefined macro: ${invoc.name}`);

        // Simple template substitution by generating the body
        // and replacing parameter names with argument strings.
        // This is not perfectly hygienic but works for MVP.
        let body = macro.body.type === "Block" ?
            this.generateExpression(macro.body) : // This will generate blk: { ... }
            this.generateExpression(macro.body);

        for (let i = 0; i < macro.params.length; i++) {
            const param = macro.params[i];
            const arg = this.generateExpression(invoc.args[i]);
            // Use regex to replace parameter name as a whole word
            const re = new RegExp(`\\b${param}\\b`, 'g');
            body = body.replace(re, arg);
        }
        return body;
    }
}
