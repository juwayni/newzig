const std = @import("std");
fn add(a: i32, b: i32) i32 {
    return a + b;
}

fn get_name() []const u8 {
    return "Zen";
}

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    const sum = add(10, 20);
    const name = get_name();
    _ = std.debug.print("Sum: {d}, Name: {s}\n", .{ sum, name });
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
