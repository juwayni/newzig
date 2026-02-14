const std = @import("std");
fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    const x = 10;

    std.debug.print("Hello from raw Zig! x is {d}\n", .{x});

    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
