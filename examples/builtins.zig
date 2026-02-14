const std = @import("std");
fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    const x = @as(i32, 100);
    const y = @as(i32, 200);
    const sum = x + y;
    _ = std.debug.print("Sum: {d}\n", .{sum});
    const ptr: ?*i32 = @ptrFromInt(0);
    _ = ptr;
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
