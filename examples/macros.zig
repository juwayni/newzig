const std = @import("std");

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    _ = blk: {
        break :blk std.debug.print("Hello, {s}!\n", .{"Zen"});
    };
    const x = 5 + 10;
    _ = std.debug.print("x is {d}\n", .{x});
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
