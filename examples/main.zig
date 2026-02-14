const std = @import("std");
fn add(a: i32, b: i32) anyerror!void {
    return a + b;
}

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    var list = std.ArrayList(i32).init(alloc);
    _ = try list.append(10);
    _ = try list.append(20);
    _ = std.debug.print("List length: {d}\n", .{ list.items.len });
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
