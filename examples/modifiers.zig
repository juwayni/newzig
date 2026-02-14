const std = @import("std");
export fn zen_exported_fn(a: i32) i32 {
    return a + 100;
}

const PackedData = packed struct {
    a: u8,
    b: u16,
};

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    const data = PackedData{ .a = 1, .b = 2 };
    _ = std.debug.print("Packed: {d} {d}\n", .{ data.a, data.b });
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
