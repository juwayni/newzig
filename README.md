# Zen Language: High-DX Meta Language Targeting Zig

Zen is a modern, expressive systems programming language that compiles to Zig. It provides a high-developer-experience frontend while maintaining the strict, no-hidden-runtime principles of Zig.

## Core Features

- **No Hidden Runtime**: No GC, no hidden allocations, no hidden async.
- **Modern Syntax**: TypeScript-inspired arrow functions, block expressions, and pattern matching.
- **First-Class Zig Interop**: Import any Zig library directly and use Zig constructs transparently.
- **Algebraic Data Types**: Ergonomic tagged unions and powerful pattern matching.
- **Nominal Trait System**: Zero-cost abstractions using Zig's comptime.
- **Meta-Programming**: Simple, powerful macro system and raw Zig escape hatches.

## Syntax Overview

### Functions
```zen
fn add = (a: i32, b: i32) => a + b

fn main = (alloc: std.mem.Allocator) => {
    let result = add(10, 20)
    std.debug.print("Result: {d}\n", .{result})
    0
}
```

### Error Handling
```zen
fn failIfEven = (n: i32): !i32 => {
    if @rem(n, 2) == 0 {
        return error.EvenNumber
    }
    n
}

let res = failIfEven(10) catch err => {
    std.debug.print("Error: {}\n", .{err})
    -1
}
```

### Algebraic Data Types & Pattern Matching
```zen
union Shape {
    Circle(f32),
    Square(f32)
}

fn area = (s: Shape) => match s {
    Circle(r) => r * r * 3.14,
    Square(side) => side * side
}
```

### Generics
```zen
struct Box<T> {
    value: T
}

fn wrap<T> = (val: T) => Box<T>{ value: val }
```

## Getting Started

The Zen compiler (`zen-compiler`) takes `.zen` files and generates readable `.zig` code.

```bash
# Compile and run using the provided runner
npx tsx tests/runner.ts examples/main.zen
```

## Principles

1. **Explicit is better than implicit**: Allocators are passed, errors are handled.
2. **Zero-cost**: Zen constructs map 1:1 to efficient Zig code.
3. **Readable Output**: The generated Zig is intended to be read and understood.
