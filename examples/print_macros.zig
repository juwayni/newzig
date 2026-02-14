const std = @import("std");
fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    _ = std.debug.print("Hello from Zen println!\n", .{});
    _ = std.debug.print("Value is: {d}\n", .{42});
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
