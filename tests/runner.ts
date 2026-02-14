import { Lexer } from "../src/lexer.js";
import { Parser } from "../src/parser.js";
import { Checker } from "../src/checker.js";
import { CodeGenerator } from "../src/codegen.js";
import * as fs from "fs";
import { execSync } from "child_process";

export function compileAndRun(zenFile: string) {
    console.log(`Compiling ${zenFile}...`);
    const code = fs.readFileSync(zenFile, "utf8");
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, code);
    const ast = parser.parse();
    const checker = new Checker(ast);
    checker.check();
    const codegen = new CodeGenerator(ast);
    const zigCode = codegen.generate();

    const zigFile = zenFile.replace(".zen", ".zig");
    fs.writeFileSync(zigFile, zigCode);
    console.log(`Saved to ${zigFile}`);

    console.log(`Formatting ${zigFile}...`);
    try {
        execSync(`./zig/zig fmt ${zigFile}`);
    } catch (e) {
        console.warn("Zig fmt failed, but continuing...");
    }

    console.log(`Running zig run ${zigFile}...`);
    try {
        const output = execSync(`./zig/zig run ${zigFile}`, { encoding: "utf8" });
        console.log("Output:");
        console.log(output);
    } catch (e: any) {
        console.error("Execution failed:");
        console.error(e.stdout);
        console.error(e.stderr);
        throw e;
    }
}

if (process.argv[1].endsWith("runner.ts")) {
    const file = process.argv[2] || "examples/main.zen";
    compileAndRun(file);
}
