const std = @import("std");
fn failIfEven(n: i32) !i32 {
    _ = if (@rem(n, 2) == 0) {
        return error.EvenNumber;
    };
    return n;
}

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    const x: ?i32 = null;
    const y = x orelse 100;
    _ = std.debug.print("y is {d}\n", .{y});
    const res = failIfEven(10) catch |err| blk: {
        _ = std.debug.print("Caught error: {}\n", .{err});
        break :blk -1;
    };
    _ = std.debug.print("res is {d}\n", .{res});
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
