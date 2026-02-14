const std = @import("std");
fn Box(comptime T: type) type {
    return struct {
        value: T,
    };
}

fn createBox(comptime T: type, val: T) Box(T) {
    return Box(T){ .value = val };
}

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    const b = createBox(i32, 42);
    _ = std.debug.print("Box value: {d}\n", .{b.value});
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
