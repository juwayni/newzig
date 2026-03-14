const std = @import("std");
const Data = struct {
    x: i32,
    y: i32,
};

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    const d = Data{ .x = 1, .y = 2 };
    const anon = .{ 10, 20 };
    _ = std.debug.print("Data: {d} {d}, Anon: {any}\n", .{ d.x, d.y, anon });
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
